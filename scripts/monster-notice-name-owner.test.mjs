import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {notice_mon} from '../js/hack.js';
import {HALLUC,SEE_INVIS,FROMOUTSIDE} from '../js/const.js';
import {PM_HUMAN} from '../js/monsters.js';
for(const hallucinating of [false,true])for(const invisible of [false,true])test(`monster notice name hallucinating=${hallucinating} invisible=${invisible}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/vision.c/vision-monster-notices-before-control.session.json',import.meta.url)));
 assert.ok(recipe.segments[0].moves.endsWith('Po'));
 recipe.segments[0].moves=recipe.segments[0].moves.slice(0,-2);
 await runSegment(recipe.segments[0]);
 let actor=game.level.monlist;while(actor&&actor.data.pmidx!==PM_HUMAN)actor=actor.nmon;assert.ok(actor);actor.mspotted=false;actor.minvis=invisible;
 game.u.uprops[HALLUC].intrinsic=hallucinating?1000:0;
 game.u.uprops[SEE_INVIS].intrinsic=invisible?FROMOUTSIDE:0;
 const core=structuredClone(game.coreCtx),ownedDisplay=structuredClone(game.displayCtx),lines=[];
 await notice_mon(actor,game,{message:async text=>lines.push(text)});
 assert.equal(lines.length,1);assert.match(lines[0],/^You see /u);assert.equal(actor.mspotted,true);
 if(hallucinating)assert.notDeepEqual(game.displayCtx,ownedDisplay,'canonical hallucinated name must spend its active display stream');
 else{assert.deepEqual(game.displayCtx,ownedDisplay);assert.equal(lines[0],invisible?'You see a peaceful invisible human.':'You see a peaceful human.');}
 assert.deepEqual(game.coreCtx,core);
});

import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
for(const name of ['normal','monochrome','before-control','ordinary-control','invisible'])test(`monster notice naming ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(readFileSync(new URL(`../recordings/hack.c/monster-notice-name-owner-${name}.session.json`,import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}
});
