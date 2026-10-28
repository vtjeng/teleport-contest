import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {BURNING_OIL} from '../../../../js/const.js';
import {POTION_CLASS,MAXOCLASSES} from '../../../../js/objects.js';
import {resist} from '../../../../js/zap.js';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
test('oil tag and C value both take resistance default, potion class is a control',async()=>{
  const cTag=MAXOCLASSES+1;
  assert.equal(cTag,19);assert.equal(BURNING_OIL,-2);
  const bounds=[];const state={u:{ulevel:7}};
  for(const tag of [BURNING_OIL,cTag,POTION_CLASS]) {
    const result=await resist({m_lev:3,data:{mr:0}},tag,0,false,state,{rn2:n=>{bounds.push(n);return 1;}});
    assert.equal(result,0);
  }
  assert.deepEqual(bounds,[104,104,103]);
});
test('public lit-oil throw completes with source-specific message and damage',async()=>{
  const s=JSON.parse(readFileSync(new URL('capture-c.json',import.meta.url),'utf8')).segments[0];
  let boundary=null;const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});
  assert.equal(boundary,null);assert.equal(g.getScreens().length,s.steps.length);
  assert.equal(g.getScreens().at(-1).split('\n')[0],'You are caught in the burning oil!');
  assert.equal(game.u.uhp,8);
  assert.ok(s.steps.some(t=>t.rng.some(r=>r.includes('d(4,4)=8 @ splatter_burning_oil'))));
});
