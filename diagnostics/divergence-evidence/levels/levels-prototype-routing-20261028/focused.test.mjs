import assert from 'node:assert/strict';
import test from 'node:test';
import { DUNGEON_DATA } from '../../../../js/dungeon_data.js';
import { resetGame } from '../../../../js/gstate.js';
import { initRng } from '../../../../js/rng.js';
import { init_dungeons, Is_special } from '../../../../js/dungeon.js';
function fullyNamed(d) {
 if ((d.range ?? 0)!==0) return false;
 for(let level=1;level<=d.base;level++) {
  if(!d.levels.some(s=>s.base===level && !s.chainlevel && (s.range??0)<=1 && (s.chance??100)===100))return false;
 }
 return true;
}
test('only shipped dungeon prototype has a guaranteed named level in every slot',()=>{
 const prototypes=DUNGEON_DATA.filter(d=>d.protofile);
 assert.deepEqual(prototypes.map(d=>d.name),["Vlad's Tower"]);
 assert.equal(prototypes[0].base,3);assert.equal(fullyNamed(prototypes[0]),true);
 // Proof applicability control: removing one slot must not be called covered.
 const missing=structuredClone(prototypes[0]);missing.levels.pop();assert.equal(fullyNamed(missing),false);
});
test('production initialization resolves all three tower slots before proto fallback',()=>{
 for(const seed of [28103700,28103701,28103702,28103703]) {
  const s=resetGame();s.urole={filecode:'Arc'};initRng(seed);init_dungeons(s);
  const dnum=s.dungeons.findIndex(d=>d.proto==='tower');assert.ok(dnum>=0);
  for(let dlevel=1;dlevel<=3;dlevel++)assert.equal(Is_special({dnum,dlevel},s).proto,`tower${dlevel}`);
 }
});
