import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {roles} from '../../../../js/roles.js';
import {applyDecisions,activeLeadIndex,reviewTemplate} from '../../../../scripts/discovery-hub.mjs';
const read=p=>readFileSync(p,'utf8');
const json=n=>JSON.parse(read(new URL(n,import.meta.url)));
const c=read('nethack-c/upstream/src/pray.c');
test('all C selectable pantheons have three names and agree with JS data',()=>{
    const oracle=read(new URL('role-names.tsv',import.meta.url)).trim().split('\n').map(l=>l.split('\t'));
    assert.equal(oracle.length,13);
    assert.deepEqual(oracle,roles.map(r=>[r.name.m,r.lgod??'<null>',r.ngod??'<null>',r.cgod??'<null>']));
    const selectable=oracle.filter(r=>r[1]!=='<null>');
    assert.equal(selectable.length,12);
    for(const r of selectable)assert.ok(r.slice(1).every(n=>n.length>0&&n!=='<null>'));
    assert.match(c,/do\s*which = randrole\(TRUE\);\s*while \(!roles\[which\]\.lgod\);/u);
    assert.match(read('nethack-c/upstream/src/role.c'),/const struct Role roles\[NUM_ROLES\+1\]/u);
});
test('bounded deity switch covers every value and all other names exist',()=>{
    assert.match(read('nethack-c/upstream/src/rnd.c'),/return \(isaac64_next_uint64\(&rnglist\[DISP\]\.rng_state\) % x\);/u);
    const body=c.slice(c.indexOf('halu_gname(aligntyp alignment)'),c.indexOf('/* deity\'s title */'));
    assert.match(body,/switch \(rn2_on_display_rng\(9\)\)/u);
    for(let i=0;i<9;i++)assert.ok(body.includes(`case ${i}:`));
    const table=c.match(/hallu_gods\[\] = \{([^]*?)\};/u)[1];
    const names=[...table.replace(/\/\*[^]*?\*\//gu,'').matchAll(/"([^"\\]*)"/gu)].map(m=>m[1]);
    assert.equal(names.length,14);assert.ok(names.every(n=>n.length>0));
    assert.match(body,/hallu_gods\[rn2_on_display_rng\(SIZE\(hallu_gods\)\)\]/u);
    assert.match(c,/static const char \*const Moloch = "Moloch";/u);
});
test('exact negative imports filter only these two observed leads',()=>{
    const run=json('projection.json'),decisions=json('review-decisions.json');
    assert.deepEqual(reviewTemplate(run,decisions.map(d=>d.key)),json('discovery-bindings.json'));
    const view=activeLeadIndex(applyDecisions(run,decisions));
    assert.equal(view.filtered.length,2);assert.equal(view.active.length,1);
    assert.equal(view.active[0],'source-audit:edge-c-only:src/allmain.c:moveloop_core:invault');
    const stale=structuredClone(run);stale.methods.sourceAudit.sourceHash='changed';
    assert.equal(activeLeadIndex(applyDecisions(stale,decisions)).filtered.length,0);
});
