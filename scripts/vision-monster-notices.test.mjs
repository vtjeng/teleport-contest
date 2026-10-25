import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {vision_recalc} from '../js/vision.js';
import {emitGlyphUpdateNotices} from '../js/startup_a11y.js';
import {planningState} from '../js/unported_monster_actions.js';
import {BLINDED} from '../js/const.js';
import {PM_HUMAN} from '../js/monsters.js';
for(const planning of [false,true])for(const enabled of [false,true])for(const blocked of [false,true])for(const visible of [false,true])test(`vision notices plan=${planning} enabled=${enabled} blocked=${blocked} visible=${visible}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/vision.c/vision-monster-notices-before-control.session.json',import.meta.url)));
 assert.ok(recipe.segments[0].moves.endsWith('Po'));
 recipe.segments[0].moves=recipe.segments[0].moves.slice(0,-2);
 await runSegment(recipe.segments[0]);
 const state=planning?planningState(game):game;
 let actor=state.level.monlist;while(actor&&actor.data.pmidx!==PM_HUMAN)actor=actor.nmon;assert.ok(actor);assert.equal(actor.msleeping,1);
 state.a11y.mon_notices=enabled;state.a11y.mon_notices_blocked=blocked?1:0;
 state.u.uprops[BLINDED].intrinsic=visible?0:1;actor.mspotted=!visible;
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),liveSpotted=game.level.monlist.mspotted,liveQueue=structuredClone(game._glyphUpdateNotices),top=game.nhDisplay.topMessage;
 vision_recalc(0,{state,redraw:()=>{}});
 const expected=enabled&&!blocked;
 assert.equal(Boolean(actor.mspotted),expected?visible:!visible);
 const lines=[];await emitGlyphUpdateNotices(state,{pline:async text=>lines.push(text)});
 assert.deepEqual(lines,expected&&visible?['You see a peaceful human.']:[]);
 assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);
 if(planning){assert.equal(game.level.monlist.mspotted,liveSpotted);assert.deepEqual(game._glyphUpdateNotices,liveQueue);assert.equal(game.nhDisplay.topMessage,top);}
});

import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
for(const name of ['normal','monochrome','before-control','ordinary-control','startup-control'])test(`vision monster notices ${name} match independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(readFileSync(new URL(`../recordings/vision.c/vision-monster-notices-${name}.session.json`,import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}
});
