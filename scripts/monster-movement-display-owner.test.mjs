import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {planningState,preflightSimpleMonsterActions} from '../js/unported_monster_actions.js';
import {collectMonsterMovementMessage} from '../js/startup_a11y.js';
import {relocate_monster} from '../js/monst.js';
import {HALLUC,NORMAL_SPEED} from '../js/const.js';
import {PM_HUMAN} from '../js/monsters.js';
for(const planning of [false,true])for(const hallucinating of [false,true])for(const enabled of [false,true])test(`movement name plan=${planning} hallu=${hallucinating} enabled=${enabled}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/vision.c/vision-monster-notices-before-control.session.json',import.meta.url)));
 assert.ok(recipe.segments[0].moves.endsWith('Po'));
 recipe.segments[0].moves=recipe.segments[0].moves.slice(0,-2);
 await runSegment(recipe.segments[0]);
 const state=planning?planningState(game):game;
 let actor=state.level.monlist;while(actor&&actor.data.pmidx!==PM_HUMAN)actor=actor.nmon;assert.ok(actor);
 const old=[actor.mx,actor.my];relocate_monster(actor,actor.mx+1,actor.my,state);actor.mspotted=true;
 state.a11y.mon_movement=enabled;state.u.uprops[HALLUC].intrinsic=hallucinating?1000:0;
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),owned=structuredClone(state.displayCtx),top=game.nhDisplay.topMessage;
 const text=collectMonsterMovementMessage(actor,...old,state);
 if(enabled){assert.equal(typeof text,'string');if(!hallucinating)assert.equal(text,'The human moves further away.');}else assert.equal(text,null);
 if(enabled&&hallucinating)assert.notDeepEqual(state.displayCtx,owned);else assert.deepEqual(state.displayCtx,owned);
 assert.deepEqual(game.coreCtx,core);assert.equal(game.nhDisplay.topMessage,top);if(planning)assert.deepEqual(game.displayCtx,display);
});

for(const enabled of [false,true])test(`actual movement preflight keeps display owner enabled=${enabled}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/vision.c/vision-monster-notices-before-control.session.json',import.meta.url)));
 assert.ok(recipe.segments[0].moves.endsWith('Po'));
 recipe.segments[0].moves=recipe.segments[0].moves.slice(0,-2);
 await runSegment(recipe.segments[0]);
 let actor=game.level.monlist;while(actor&&actor.data.pmidx!==PM_HUMAN)actor=actor.nmon;assert.ok(actor);
 actor.msleeping=false;actor.mspotted=true;actor.movement=NORMAL_SPEED;
 game.a11y.mon_movement=enabled;game.u.uprops[HALLUC].intrinsic=1000;
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),position=[actor.mx,actor.my],allocation=game.u.umovement,top=game.nhDisplay.topMessage;
 await preflightSimpleMonsterActions(game);
 assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);assert.deepEqual([actor.mx,actor.my],position);assert.equal(game.u.umovement,allocation);assert.equal(game.nhDisplay.topMessage,top);
});

import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
for(const name of ['normal','monochrome','before-control','ordinary-control','option-control'])test(`monster movement owner ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(readFileSync(new URL(`../recordings/monmove.c/monster-movement-display-owner-${name}.session.json`,import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}
});
