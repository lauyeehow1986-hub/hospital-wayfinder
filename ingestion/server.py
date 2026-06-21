#!/usr/bin/env python3
"""Tiny ingestion server for the hospital wayfinder (Termux-friendly, stdlib only).

Serves the repo statically (form + js/ + data/ + css/) and adds:
  POST /waypoint  -> append a record to ingestion/staging/session-YYYYMMDD.json
  GET  /gps       -> termux-location passthrough (optional)
Run: python ingestion/server.py [port]   (default 8788)
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGING = os.path.join(ROOT, "ingestion", "staging")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/gps":
            try:
                out = subprocess.run(
                    ["termux-location", "-p", "gps"],
                    capture_output=True, text=True, timeout=30,
                )
                self._send_json(200, json.loads(out.stdout) if out.stdout.strip() else {"error": "no fix"})
            except Exception as exc:  # noqa: BLE001
                self._send_json(200, {"error": str(exc)})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/waypoint":
            self._send_json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            record = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:  # noqa: BLE001
            self._send_json(400, {"error": f"bad json: {exc}"})
            return
        record.setdefault("status", "staged")
        record.setdefault("captured_at", datetime.now().isoformat(timespec="seconds"))
        os.makedirs(STAGING, exist_ok=True)
        path = os.path.join(STAGING, f"session-{date.today():%Y%m%d}.json")
        data = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                try:
                    data = json.load(fh)
                except Exception:  # noqa: BLE001
                    data = []
        data.append(record)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
        self._send_json(200, {"ok": True, "count": len(data)})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
    print(f"Ingestion server: http://localhost:{port}/ingestion/  (Ctrl-C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
