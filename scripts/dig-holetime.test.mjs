import assert from 'node:assert/strict';
import test from 'node:test';
import {dig,holetime} from '../js/dig.js';
test('holetime follows C occupation, shop membership and integer division',()=>{
 const state={go:{occupation:dig},u:{ushops:[3]},context:{digging:{effort:0}}};
 // dig.c:597-602; also executed by the retained extracted C oracle.
 for(const [effort,expected] of [[13,11],[133,5],[230,1],[250,0],[251,0]]){
  state.context.digging.effort=effort;
  assert.equal(holetime(state),expected);
 }
 state.go.occupation=null;assert.equal(holetime(state),-1);
 state.go.occupation=dig;state.u.ushops=[];assert.equal(holetime(state),-1);
});
