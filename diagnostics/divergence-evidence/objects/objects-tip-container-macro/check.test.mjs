import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { tip_ok } from '../../../../js/pickup.js';
import { isContainer } from '../../../../js/obj.js';
import { objects_globals_init, LARGE_BOX, BAG_OF_TRICKS, SACK, GOLD_PIECE, DAGGER, HORN_OF_PLENTY } from '../../../../js/objects.js';
import { GETOBJ_EXCLUDE, GETOBJ_DOWNPLAY, GETOBJ_SUGGEST } from '../../../../js/const.js';
const root = new URL('../../../../', import.meta.url);
test('tip eligibility macro expansion and reachable inventory categories', () => {
  const header=readFileSync(new URL('nethack-c/upstream/include/obj.h',root),'utf8');
  assert.match(header,/#define Is_container\(o\) \(\(o\)->otyp >= LARGE_BOX && \(o\)->otyp <= BAG_OF_TRICKS\)/);
  const state={};objects_globals_init(state);
  const obj=otyp=>({otyp,oclass:state.objects[otyp].oc_class,dknown:false});
  assert.equal(tip_ok(null,state),GETOBJ_EXCLUDE);
  assert.equal(tip_ok(obj(GOLD_PIECE),state),GETOBJ_EXCLUDE);
  assert.equal(tip_ok(obj(DAGGER),state),GETOBJ_DOWNPLAY);
  for(let otyp=LARGE_BOX;otyp<=BAG_OF_TRICKS;otyp++) {
    assert.equal(isContainer(obj(otyp)),true);
    assert.equal(tip_ok(obj(otyp),state),GETOBJ_SUGGEST);
  }
  for(const otyp of [LARGE_BOX-1,BAG_OF_TRICKS+1]) assert.equal(isContainer(obj(otyp)),false);
  for(const dknown of [false,true]) for(const known of [false,true]) {
    state.objects[HORN_OF_PLENTY].oc_name_known=known;
    assert.equal(tip_ok({...obj(HORN_OF_PLENTY),dknown},state),dknown&&known?GETOBJ_SUGGEST:GETOBJ_DOWNPLAY);
    assert.equal(tip_ok({...obj(SACK),dknown},state),GETOBJ_SUGGEST);
  }
});
