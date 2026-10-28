import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyDecisions, activeLeadIndex } from '../../../scripts/discovery-hub.mjs';
const read = file => readFileSync(new URL(file, import.meta.url));
const measurement = JSON.parse(read('measurement.json'));
for (const group of ['monsters', 'levels']) {
    test(`${group}: exact decisions import and preserve raw rows and scope`, () => {
        const bytes = read(`${group}-run.json`), run = JSON.parse(bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), measurement[group].projectionSha256);
        const decisions = JSON.parse(read(`${group}-decisions.json`));
        const reviewed = applyDecisions(run, decisions);
        assert.equal(activeLeadIndex(run).active.length, measurement[group].before);
        assert.equal(activeLeadIndex(reviewed).filtered.length, decisions.length);
        assert.equal(activeLeadIndex(reviewed).active.length, 0);
        assert.equal(reviewed.leads.length, run.leads.length);
        for (const decision of decisions) assert.equal(reviewed.leads.find(l => l.key === decision.key).resolution.scope, decision.evidence.scope);
        const partial = applyDecisions(run, decisions.slice(0, 1));
        assert.equal(activeLeadIndex(partial).active.length, run.leads.length - 1);
    });
    test(`${group}: stale run and mismatched evidence cannot reuse the review`, () => {
        const run = JSON.parse(read(`${group}-run.json`));
        const decisions = JSON.parse(read(`${group}-decisions.json`));
        assert.throws(() => applyDecisions({ ...run, runId: 'changed' }, decisions), /stale/);
        assert.throws(() => applyDecisions(run, [{ ...decisions[0], evidenceKey: 'changed' }]), /stale/);
        assert.throws(() => applyDecisions({ ...run, toolHashes: { ...run.toolHashes, sourceAudit: 'changed' } }, decisions), /stale/);
        const reviewed = applyDecisions(run, decisions);
        reviewed.leads[0].status = 'unresolved';
        assert.ok(activeLeadIndex(reviewed).active.includes(reviewed.leads[0].key));
    });
}
