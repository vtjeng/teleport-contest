import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectDashboardData } from './build-dashboard.mjs';
import { verifyDeployment } from './verify-dashboard-deployment.mjs';

// Distinct full-length SHAs model current and stale deployments without Git setup.
const commit = 'a'.repeat(40);
const staleCommit = 'b'.repeat(40);
const html = sha => `<meta name="dashboard-commit" content="${sha}"><script>const scores={matched:7,total:9};</script>`;
const expected = Buffer.from(html(commit));
const options = { url: 'https://example.com/dashboard/', expected, commit };

test('the real dashboard template embeds its publication commit without explicit head tags', async () => {
  const template = readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
  const built = Buffer.from(injectDashboardData(template, '{}', 'null', commit));
  assert.equal((await verifyDeployment({ ...options, expected: built,
    fetchPage: async () => new Response(built) })).passed, true);
});

test('accepts the exact published commit and page bytes', async () => {
  const receipt = await verifyDeployment({ ...options, fetchPage: async url => {
    assert.equal(url.searchParams.get('dashboard-commit'), commit);
    return new Response(expected);
  } });
  assert.equal(receipt.commit, commit);
  assert.equal(receipt.passed, true);
  assert.equal(receipt.attempts, 1); // No propagation delay for an already deployed page.
});

test('rejects stale commits, wrong scores, missing page content and HTTP failures', async () => {
  for (const response of [new Response(html(staleCommit)),
    // Seven of nine is the fixture score; eight models a wrong saved score.
    new Response(html(commit).replace('matched:7', 'matched:8')),
    new Response(''), new Response('unavailable', { status: 503 })]) {
    await assert.rejects(verifyDeployment({ ...options, attempts: 1,
      fetchPage: async () => response }), /Dashboard verification failed/);
  }
});

test('retries propagation and network failures without silently accepting stale content', async () => {
  let calls = 0;
  let waits = 0;
  const result = await verifyDeployment({ ...options, attempts: 3,
    wait: async () => { waits++; }, fetchPage: async () => {
      calls++;
      if (calls === 1) throw new Error('connection reset');
      return new Response(calls === 2 ? html(staleCommit) : expected);
    } });
  assert.equal(result.attempts, 3); // Network failure, old deployment, then current deployment.
  assert.equal(waits, 2);
});

test('rejects an expected artifact from another commit before fetching', async () => {
  await assert.rejects(verifyDeployment({ ...options, commit: staleCommit,
    fetchPage: async () => assert.fail('must not fetch') }), /does not identify/);
  await assert.rejects(verifyDeployment({ ...options, commit: 'short' }), /full commit SHA/);
});
