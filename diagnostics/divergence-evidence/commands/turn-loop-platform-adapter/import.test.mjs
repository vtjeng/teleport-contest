import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {applyDecisions,activeLeadIndex,reviewTemplate} from '../../../../scripts/discovery-hub.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url)));
const run=read('discovery-run.projection.json'),decisions=read('review-decisions.json'),verified=read('projection-verification.json');
test('projection retains original identity, hashes and freshness inputs',()=>{
    assert.equal(run.runId,'7e93da55968668bc05fc');
    assert.equal(run.projection.originalRunSha256,verified.originalRunSha256);
    assert.equal(createHash('sha256').update(readFileSync(new URL('discovery-run.projection.json',import.meta.url))).digest('hex'),verified.projectionSha256);
    assert.deepEqual(reviewTemplate(run,run.projection.includedKeys),verified.bindingsCompared);
    assert.deepEqual(run.methodConfigHashes,verified.copiedActiveViewFields.methodConfigHashes);
    assert.deepEqual(run.methods,verified.copiedActiveViewFields.methods);
});
test('two imported negatives actually leave the active view',()=>{
    const view=activeLeadIndex(applyDecisions(run,decisions));
    assert.equal(view.active.length,4);assert.equal(view.filtered.length,2);
    assert.deepEqual(new Set(view.filtered.map(x=>x.key)),new Set(decisions.map(x=>x.key)));
});
test('changed freshness metadata prevents filtering despite accepted binding',()=>{
    const stale=structuredClone(run);stale.methodConfigHashes.sourceAudit='different-config';
    const view=activeLeadIndex(applyDecisions(stale,decisions));
    assert.equal(view.active.length,6);assert.equal(view.filtered.length,0);
});
