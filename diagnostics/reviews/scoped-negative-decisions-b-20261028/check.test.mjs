import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { validateDecision, applyDecisions, activeLeadIndex } from '../../../scripts/discovery-hub.mjs';
const rows = JSON.parse(readFileSync(new URL('decisions.json', import.meta.url)));
test('two scoped decisions have original shard bindings and explicit run hash', () => {
    assert.equal(rows.length, 2);
    for (const row of rows) {
        validateDecision(row);
        assert.equal(row.runId, '601667573d5ca5a23adf');
        assert.match(row.reviewFingerprint, /^[a-f0-9]{64}$/u);
        assert.equal(row.evidence.expectedRunSha256,
            '22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e');
        assert.ok(row.evidence.scope);
    }
});
test('original bindings cannot be silently reused on the earlier frozen run', () => {
    const earlier = JSON.parse(gunzipSync(readFileSync(new URL(
        '../scoped-negative-decisions-20261028/run.json.gz', import.meta.url))));
    for (const row of rows)
        assert.throws(() => applyDecisions(earlier, [row]), /stale/);
});

test('verified run projection accepts both original bindings and rejects stale inputs', () => {
    const run = JSON.parse(readFileSync(new URL('bound-run.json', import.meta.url)));
    assert.equal(activeLeadIndex(run).active.length, 2);
    const reviewed = applyDecisions(run, rows);
    assert.equal(activeLeadIndex(reviewed).active.length, 0);
    assert.equal(activeLeadIndex(reviewed).filtered.length, 2);
    assert.equal(reviewed.leads.length, run.leads.length);
    for (const row of rows) assert.equal(reviewed.leads.find(l => l.key === row.key).resolution.scope, row.evidence.scope);
    assert.throws(() => applyDecisions({ ...run, runId: 'different' }, rows), /stale review provenance/);
    assert.throws(() => applyDecisions({ ...run, toolHashes: { ...run.toolHashes, sourceAudit: 'changed' } }, rows), /stale review provenance/);
});
