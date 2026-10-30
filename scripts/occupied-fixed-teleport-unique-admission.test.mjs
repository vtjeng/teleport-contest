import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {m_at} from '../js/monst.js';
import {t_at} from '../js/trap.js';
import {G_UNIQ} from '../js/monsters.js';
import {preflight_dotrap} from '../js/trap_effects.js';
import {getRngLog} from '../js/rng.js';

test('unique-species metadata is outside ordinary occupied admission',async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/teleport.c/post53-occupied-bounded-brown-mold-peaceful.session.json',import.meta.url)));
 const segment=recipe.segments[0];let boundary;
 await runSegment({...segment,moves:segment.moves.slice(0,-3)},{onBoundary:e=>boundary=e});
 assert.equal(boundary,undefined);
 const monster=m_at(62,4,game),trap=t_at(65,2,game),ordinaryData=monster.data;
 // Admission-only mutation. No unique species is constructed or relocated,
 // and no special response, inventory, departure or movement executes.
 const flaggedData={...ordinaryData,geno:ordinaryData.geno|G_UNIQ};
 monster.data=flaggedData;
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),log=getRngLog().slice();
 try{
  assert.throws(()=>preflight_dotrap(trap,game),/a monster on a teleport trap destination/);
  assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);assert.deepEqual(getRngLog(),log);
  assert.equal(monster.data,flaggedData);assert.equal(m_at(62,4,game),monster);
  assert.deepEqual([game.u.ux,game.u.uy,monster.mx,monster.my],[64,2,62,4]);
 }finally{monster.data=ordinaryData;}
});
