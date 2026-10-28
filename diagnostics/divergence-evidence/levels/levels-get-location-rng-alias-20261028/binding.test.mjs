import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { reviewTemplate } from '../../../../scripts/discovery-hub.mjs';
const read = name => readFileSync(new URL(name, import.meta.url));
const runBytes = read('bound-run.json');
const run = JSON.parse(runBytes);
const manifest = JSON.parse(read('projection.json'));
const cases = [JSON.parse(read('case.json')),
    JSON.parse(read('../levels-get-room-loc-rng-alias-20261028/case.json'))];
const keys = cases.map(c => c.scanner.key);
test('portable projection hash and original identity are pinned', () => {
    assert.equal(createHash('sha256').update(runBytes).digest('hex'), manifest.projectionSha256);
    assert.equal(run.leads.length, 2);
    for (const c of cases) {
        assert.equal(manifest.originalRunSha256, c.discoveryRun.sha256);
        assert.equal(run.runId, c.scanner.runId);
        assert.equal(run.baseSha, c.baseJs);
        assert.equal(run.cGitlink, c.baseC);
    }
});
test('existing hub reproduces both original review bindings', () => {
    assert.deepEqual(reviewTemplate(run, keys), cases.map(c => c.scanner));
});
test('changed run or tool identity invalidates the original fingerprint', () => {
    for (const mutate of [r => { r.runId += '-changed'; },
        r => { r.toolHashes.sourceAudit = 'changed'; }]) {
        const changed = structuredClone(run); mutate(changed);
        assert.notEqual(reviewTemplate(changed, keys)[0].reviewFingerprint,
            cases[0].scanner.reviewFingerprint);
    }
});
