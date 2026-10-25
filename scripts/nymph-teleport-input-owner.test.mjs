import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {preflightSimpleMonsterActions} from '../js/unported_monster_actions.js';
import {AMULET_OF_LIFE_SAVING} from '../js/objects.js';
import {PM_WATER_NYMPH} from '../js/monsters.js';
import {NORMAL_SPEED} from '../js/const.js';
for(const controlled of [false,true])for(const consumeHeroRation of [false,true])test(`nymph relocation planner controlled=${controlled} consumeHeroRation=${consumeHeroRation}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/uhitm.c/nymph-teleport-input-owner-before-control.session.json',import.meta.url)));
 const output=await runSegment(recipe.segments[0]);
 game.iflags.mon_telecontrol=controlled;
 if(!consumeHeroRation)game.u.umovement-=NORMAL_SPEED;
 let actor=game.level.monlist;while(actor&&actor.data.pmidx!==PM_WATER_NYMPH)actor=actor.nmon;assert.ok(actor);
 assert.equal(game.invent.otyp,AMULET_OF_LIFE_SAVING);
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),inventory=game.invent,position=[actor.mx,actor.my],minvent=actor.minvent,movement=game.u.umovement,message=game.nhDisplay.topMessage,screens=structuredClone(output.getScreens()),cursors=structuredClone(output.getCursors());
 const plan=await preflightSimpleMonsterActions(game,{consumeHeroRation});
 assert.deepEqual(plan.inputBoundary,controlled?{operation:'getpos'}:null);
 assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);assert.equal(game.invent,inventory);assert.equal(actor.minvent,minvent);assert.deepEqual([actor.mx,actor.my],position);assert.equal(game.u.umovement,movement);assert.equal(game.nhDisplay.topMessage,message);assert.deepEqual(output.getScreens(),screens);assert.deepEqual(output.getCursors(),cursors);
});

// C uhitm.c mhitm_ad_sedu finishes theft output before controlled rloc input.
for(const name of ['normal','monochrome','before-control','ordinary-control'])test(`nymph teleport input ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const c=JSON.parse(readFileSync(new URL(`../recordings/uhitm.c/nymph-teleport-input-owner-${name}.session.json`,import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}
});
