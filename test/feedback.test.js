import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeReport, generalReport, buildIssueUrl, buildMailtoUrl, buildTelegramUrl } from '../js/feedback.js';

test('buildIssueUrl builds a prefilled GitHub issue URL', () => {
  const u = new URL(buildIssueUrl('o/r', 'My Title', 'Body here', 'route-report'));
  assert.equal(u.pathname, '/o/r/issues/new');
  assert.equal(u.searchParams.get('title'), 'My Title');
  assert.equal(u.searchParams.get('body'), 'Body here');
  assert.equal(u.searchParams.get('labels'), 'route-report');
});

test('buildMailtoUrl builds a prefilled mailto', () => {
  const m = buildMailtoUrl('a@b.com', 'Sub ject', 'Bo dy');
  assert.ok(m.startsWith('mailto:a@b.com?'));
  assert.ok(m.includes('subject=Sub%20ject'));
  assert.ok(m.includes('body=Bo%20dy'));
});

test('buildTelegramUrl strips a leading @', () => {
  assert.equal(buildTelegramUrl('@MyBot'), 'https://t.me/MyBot');
  assert.equal(buildTelegramUrl('MyBot'), 'https://t.me/MyBot');
});

test('routeReport includes from/to in title and mode/steps/version in body', () => {
  const { title, body } = routeReport({ fromLabel: 'A lobby', toLabel: 'B clinic', mode: 'sheltered', stepLabels: ['A lobby', 'mid', 'B clinic'], summaryText: '12 min', version: 'v0.6' });
  assert.ok(title.includes('A lobby → B clinic'));
  assert.ok(body.includes('Mode: sheltered'));
  assert.ok(body.includes('- mid'));
  assert.ok(body.includes('v0.6'));
});

test('generalReport returns a titled prompt with version', () => {
  const { title, body } = generalReport('v0.6');
  assert.equal(title, 'Feedback / suggestion');
  assert.ok(body.includes('v0.6'));
});
