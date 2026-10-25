import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {dobuzz} from '../js/zap.js';
import {AMULET_OF_LIFE_SAVING} from '../js/objects.js';
import {PM_WATER_NYMPH} from '../js/monsters.js';
import {planningState} from '../js/unported_monster_actions.js';
for(const planning of [false,true])for(const worn of [false,true])for(const visible of [false,true])test(`disintegration feedback planning=${planning} worn=${worn} visible=${visible}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/zap.c/disintegrate-lifesaver-feedback-before-control.session.json',import.meta.url)));
 assert.ok(recipe.segments[0].moves.endsWith('#monster\n'));
 recipe.segments[0].moves=recipe.segments[0].moves.slice(0,-9);
 await runSegment(recipe.segments[0]);
 const state=planning?planningState(game):game;
 let actor=state.level.monlist;while(actor&&actor.data.pmidx!==PM_WATER_NYMPH)actor=actor.nmon;assert.ok(actor);
 let amulet=actor.minvent;while(amulet&&amulet.otyp!==AMULET_OF_LIFE_SAVING)amulet=amulet.nobj;assert.ok(amulet);assert.ok(amulet.owornmask);
 if(!worn){actor.misc_worn_check&=~amulet.owornmask;amulet.owornmask=0;}
 if(!visible)state.viz_array[actor.my][actor.mx]=0;
 const messages=[],liveHp=game.level.monlist.mhp,top=game.nhDisplay.topMessage;
 await dobuzz(24,6,state.u.ux,state.u.uy,-1,0,true,true,false,state,{rn1:()=>4,rn2:()=>1,rnd:n=>n,d:n=>n,rne:n=>n,rnl:()=>1,rnz:n=>n},{planning,message:async text=>messages.push(text)});
 if(planning){assert.deepEqual(messages,[]);assert.equal(game.level.monlist.mhp,liveHp);assert.equal(game.nhDisplay.topMessage,top);}
 else if(visible)assert.equal(messages[0],worn?'The blast of disintegration hits the water nymph!':'The water nymph is disintegrated!');
 else assert.ok(!messages.some(m=>/is disintegrated|blast of disintegration hits/.test(m)));
 assert.equal(actor.mhp>0,worn);
});

import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
for(const name of ['normal','monochrome','before-control','ordinary-control'])test(`disintegration lifesaver ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(readFileSync(new URL(`../recordings/zap.c/disintegrate-lifesaver-feedback-${name}.session.json`,import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}
});
