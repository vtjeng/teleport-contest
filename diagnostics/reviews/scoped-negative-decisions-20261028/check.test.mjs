import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { activeLeadIndex, applyDecisions } from '../../../scripts/discovery-hub.mjs';

const read = name => readFileSync(new URL(name, import.meta.url));
const bytes = gunzipSync(read('run.json.gz'));
const run = JSON.parse(bytes);
const decisions = JSON.parse(read('decisions.json'));
const measurement = JSON.parse(read('measurement.json'));
const copy = value => structuredClone(value);

test('frozen input and seven exact decisions reproduce the measured reduction', () => {
    assert.equal(createHash('sha256').update(bytes).digest('hex'), measurement.runSha256);
    const before = activeLeadIndex(run), after = activeLeadIndex(applyDecisions(run, decisions));
    assert.equal(before.active.length, 12537);
    assert.equal(before.filtered.length, 0);
    assert.equal(after.active.length, 12530);
    assert.deepEqual(after.filtered.map(x => x.key).sort(), decisions.map(x => x.key).sort());
    assert.equal(run.leads.filter(x => x.status === 'explained_negative').length, 0);
});

test('changed run, source, tool, configuration or input rejects old decisions', () => {
    const variants = [
        r => { r.runId += '-new'; },
        r => { r.baseSha = 'f'.repeat(40); },
        r => { r.cGitlink = 'e'.repeat(40); },
        r => { r.toolHashes.sourceAudit = 'new-tool'; },
        r => { r.inputHashes.plan = 'new-plan'; },
        r => { for (const l of r.leads) l.provenance.sourceAuditSourceHash = 'new-source'; },
        r => { for (const l of r.leads) l.provenance.methodConfigHashes.sourceAudit = 'new-config'; },
    ];
    for (const mutate of variants) {
        const changed = copy(run); mutate(changed);
        assert.throws(() => applyDecisions(changed, decisions), /stale review provenance/);
    }
});

test('wrong evidence key and different helper domain cannot reuse the binding', () => {
    const badEvidence = copy(decisions); badEvidence[0].evidenceKey = 'wrong';
    assert.throws(() => applyDecisions(run, badEvidence), /absent or stale decision/);
    const neighbor = run.leads.find(x => x.key === 'source-audit:edge-c-only:src/sp_lev.c:ensure_way_out:selection_floodfill');
    assert.ok(neighbor);
    const retargeted = copy(decisions[2]);
    retargeted.key = neighbor.key; retargeted.evidenceKey = neighbor.evidenceKey;
    assert.throws(() => applyDecisions(run, [retargeted]), /stale review provenance/);
});

test('other escape-method and growth-call leads remain visible', () => {
    const active = activeLeadIndex(applyDecisions(run, decisions)).active;
    for (const key of [
        'source-audit:edge-c-only:src/sp_lev.c:ensure_way_out:selection_floodfill',
        'source-audit:edge-c-only:src/sp_lev.c:ensure_way_out:selection_free',
        'source-audit:edge-c-only:src/sp_lev.c:lspo_region:selection_do_grow',
        'source-audit:edge-js-helper:src/allmain.c:stop_occupation:requireOccupationOperation',
    ]) assert.ok(active.includes(key), key);
});

test('unresolved status and stale active-view provenance stay visible', () => {
    const reviewed = applyDecisions(run, decisions);
    for (const mutate of [
        r => { r.leads.find(l => l.key === decisions[0].key).status = 'unresolved'; },
        r => { r.toolHashes.sourceAudit = 'changed'; },
        r => { r.methodConfigHashes.sourceAudit = 'changed'; },
        r => { r.methods.sourceAudit.sourceHash = 'changed'; },
    ]) {
        const changed = copy(reviewed); mutate(changed);
        assert.ok(activeLeadIndex(changed).active.includes(decisions[0].key));
    }
});
