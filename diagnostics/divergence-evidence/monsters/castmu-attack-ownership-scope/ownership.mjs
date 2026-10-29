import assert from 'node:assert/strict';
import {monst_globals_init,AT_MAGC,AD_COLD,AD_MAGM} from '../../../../js/monsters.js';
import {getmattk} from '../../../../js/mhitu.js';
// Read-only production lookup over normally initialized data; no custom attack.
const state={u:{},youmonst:{},sysopt:{seduce:true}};
monst_globals_init(state);
const rows=[];
for(const monster of state.mons)for(let i=0;i<monster.mattk.length;i++){
 const attack=monster.mattk[i];
 if(attack.aatyp!==AT_MAGC || ![AD_COLD,AD_MAGM].includes(attack.adtyp))continue;
 const selected=getmattk({data:monster,mw:null,mspec_used:0},state.youmonst,i,[],{state});
 assert.equal(selected,attack);
 assert.equal(Object.isFrozen(selected),false);
 rows.push({name:monster.pmnames[2],index:i,adtyp:attack.adtyp,sharedMutableRecord:true});
}
assert.deepEqual(rows.map(r=>r.name),['Angel','Yeenoghu','Asmodeus']);
console.log(JSON.stringify({ownership:rows,scope:'ordinary initialized attack selection only; no claim that callbacks mutate attacks'}));
