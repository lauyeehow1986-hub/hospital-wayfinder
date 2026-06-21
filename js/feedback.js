// Pure feedback helpers — build report text + channel URLs. No DOM.

export const FEEDBACK = {
  repo: 'lauyeehow1986-hub/hospital-wayfinder',
  email: 'yhbot86@gmail.com',
  telegram: '', // bot username (e.g. 'OutramWayfinderBot'); set once the Plan 6 bot exists
};

const today = () => new Date().toISOString().slice(0, 10);

export function routeReport(ctx) {
  const { fromLabel, toLabel, mode, stepLabels = [], summaryText = '', version = '' } = ctx;
  const title = `Route issue: ${fromLabel} → ${toLabel}`;
  const body = [
    `From: ${fromLabel}`,
    `To: ${toLabel}`,
    `Mode: ${mode}`,
    `Summary: ${summaryText}`,
    'Steps:',
    ...stepLabels.map((s) => `- ${s}`),
    '',
    `App: ${version}`,
    `Date: ${today()}`,
    '',
    "What's wrong? (closed / wrong directions / other):",
    '',
  ].join('\n');
  return { title, body };
}

export function generalReport(version = '') {
  const title = 'Feedback / suggestion';
  const body = [
    `App: ${version}`,
    `Date: ${today()}`,
    '',
    'Your feedback (a problem, a missing place, a suggestion):',
    '',
  ].join('\n');
  return { title, body };
}

export function buildIssueUrl(repo, title, body, label = 'route-report') {
  const q = new URLSearchParams({ title, body, labels: label });
  return `https://github.com/${repo}/issues/new?${q.toString()}`;
}

export function buildMailtoUrl(email, subject, body) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildTelegramUrl(username) {
  return `https://t.me/${String(username).replace(/^@/, '')}`;
}
