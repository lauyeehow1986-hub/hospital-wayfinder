# Hospital Wayfinder

Offline-first wayfinding for the Outram hospital cluster (SGH / NHCS / NCC and
linked buildings) — indoor, underground, and sheltered routes that Google Maps
and gov.sg Undercover don't capture — plus nearby places of interest (food,
toilets, charging, rest areas, convenience stores).

![Status: v0.1 — routing core](https://img.shields.io/badge/status-v0.1_routing_core-orange)
![Platform: Android (Termux + Chrome PWA)](https://img.shields.io/badge/platform-Android_(Termux_%2B_Chrome_PWA)-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

## Status

Vertical slice in progress. The routing engine, data layer, POI queries, and
graph validator are built and unit-tested. Client PWA and the Termux ingestion
backend follow in later plans.

## Develop

    npm test                 # run the unit tests (Node 18+, no deps)
    npm run validate         # check data/ graph integrity

## Design

See `docs/superpowers/specs/2026-06-20-hospital-wayfinder-design.md`.
