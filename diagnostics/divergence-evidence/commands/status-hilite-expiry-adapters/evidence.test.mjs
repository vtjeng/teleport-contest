import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {init_blstats,status_eval_next_unhilite} from '../../../../js/display.js';
import {STATUS_FIELDS} from '../../../../js/status_field_data.js';
const fields=['armor-class','hitpoints'].map(key=>STATUS_FIELDS.find(f=>f.key===key).fld);
test('real JS expiry matches the compiled C boundary partitions',()=>{
    const cases=gunzipSync(readFileSync(new URL('oracle.jsonl.gz',import.meta.url))).toString().trim().split('\n').map(JSON.parse);
    assert.equal(cases.length,1536);
    for(const row of cases){
        const [a,b,rules,changes,multi,dirty,...expected]=row;
        const state={moves:10,multi,iflags:{hilite_delta:3},disp:{botl:Boolean(dirty)}};
        init_blstats(state);
        for(let j=0;j<2;j++)for(let bank=0;bank<2;bank++){
            const f=fields[j];state.gb.status_hilite_times[bank][f]=j?b:a;
            state.gb.status_hilite_chg_banks[bank][f]=Boolean(changes&(1<<j));
            state.gb.status_hilite_rule[bank][f]={behavior:rules&(1<<j)?'changed':'always'};
        }
        status_eval_next_unhilite(state);
        const actual=[Number(Boolean(state.disp.botl))];
        for(const f of fields)for(let bank=0;bank<2;bank++)actual.push(state.gb.status_hilite_times[bank][f],Number(state.gb.status_hilite_chg_banks[bank][f]));
        assert.deepEqual(actual,expected,JSON.stringify(row.slice(0,6)));
    }
});

import {applyDecisions,activeLeadIndex,reviewTemplate} from '../../../../scripts/discovery-hub.mjs';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const json=n=>JSON.parse(readFileSync(new URL(n,import.meta.url)));
test('exact negative decisions filter while the initializer lead remains active',()=>{
    const run=json('projection.json'),decisions=json('review-decisions.json');
    assert.deepEqual(reviewTemplate(run,decisions.map(d=>d.key)),json('discovery-bindings.json'));
    const view=activeLeadIndex(applyDecisions(run,decisions));
    assert.equal(view.filtered.length,2);assert.deepEqual(view.active,['source-audit:edge-js-helper:src/botl.c:status_eval_next_unhilite:_statusHiliteChangeBanks']);
    const stale=structuredClone(run);stale.methodConfigHashes.sourceAudit='changed';
    assert.equal(activeLeadIndex(applyDecisions(stale,decisions)).filtered.length,0);
});
for(const kind of ['counted','individual','prayer'])test(`ordinary status turn control: ${kind}`,async()=>{
    const recording=JSON.parse(gunzipSync(readFileSync(new URL(`${kind}.recording.json.gz`,import.meta.url))));
    const root=createScoringWorkspace(process.cwd(),[]);
    try{const result=compareSessionOutputs(recording,await runJsSession(recording,root));assert.equal(result.passed,true,formatReport(result));}
    finally{removeScoringWorkspace(root);}
});
