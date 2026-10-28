import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {find_ac} from '../../../../js/u_init_inventory_attrs.js';
test('C preprocessor removes find_ac achievements while preserving live assignments',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/do_wear.c',import.meta.url),'utf8');
 const f=c.match(/find_ac\(void\)\n\{[\s\S]*?\n\}/)[0];
 assert.match(f,/record_achievement\(ACH_AC_20\)/);
 const pre=execFileSync(process.env.CC||'clang',['-E','-P','-x','c','-'],{input:f,encoding:'utf8'});
 assert.doesNotMatch(pre,/record_achievement|ACH_AC_/);
 assert.match(pre,/u\.uac = uac;/);assert.match(pre,/disp\.botl = TRUE;/);
 for(const ac of [-21,-20,-19,-11,-10,-9,-1,0,1]){
  const state={mons:[{ac}],u:{umonnum:0,uac:10,uspellprot:0},disp:{botl:false}};
  assert.equal(find_ac(state),ac);assert.equal(state.u.uac,ac);assert.equal(state.disp.botl,true);
  state.disp.botl=false;find_ac(state);assert.equal(state.disp.botl,false);
 }
});
