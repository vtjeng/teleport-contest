import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {dobuzz} from '../js/zap.js';
import {AMULET_OF_LIFE_SAVING} from '../js/objects.js';
import {PM_WATER_NYMPH,PM_HUMAN_ZOMBIE} from '../js/monsters.js';
import {set_mon_data} from '../js/mondata.js';
import {planningState} from '../js/unported_monster_actions.js';
for(const planning of [false,true])for(const nonliving of [false,true])for(const resists of [false,true])test(`canonical disintegration amulet planning=${planning} nonliving=${nonliving} resists=${resists}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/zap.c/disintegrate-lifesaver-feedback-before-control.session.json',import.meta.url)));
 assert.ok(recipe.segments[0].moves.endsWith('#monster\n'));
 recipe.segments[0].moves=recipe.segments[0].moves.slice(0,-9);
 await runSegment(recipe.segments[0]);
 const state=planning?planningState(game):game;
 let actor=state.level.monlist;while(actor&&actor.data.pmidx!==PM_WATER_NYMPH)actor=actor.nmon;assert.ok(actor);
 let amulet=actor.minvent;while(amulet&&amulet.otyp!==AMULET_OF_LIFE_SAVING)amulet=amulet.nobj;assert.ok(amulet);assert.ok(amulet.owornmask);
 if(nonliving)set_mon_data(actor,state.mons[PM_HUMAN_ZOMBIE],state);
 const liveHead=game.level.objlist,liveHp=game.level.monlist.mhp,messages=[];
 await dobuzz(24,6,state.u.ux,state.u.uy,-1,0,true,true,false,state,{rn1:()=>4,rn2:n=>n===20?1:n===100?(resists?0:99):n-1,rnd:n=>n,d:n=>n,rne:n=>n,rnl:()=>1,rnz:n=>n},{planning,message:async text=>messages.push(text)});
 assert.equal(actor.mhp>0,!nonliving);
 const floor=[];for(let o=state.level.objlist;o;o=o.nobj)floor.push(o);
 assert.equal(floor.includes(amulet),nonliving&&resists,'only an independently resisting ineffective amulet survives on the floor; effective amulet is consumed by lifesaving');
 if(planning){assert.deepEqual(messages,[]);assert.equal(game.level.objlist,liveHead);assert.equal(game.level.monlist.mhp,liveHp);}
});

import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
for(const name of ['normal','monochrome','before-control','ordinary-control'])test(`nonliving lifesaver ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(readFileSync(new URL(`../recordings/zap.c/nonliving-lifesaver-protection-${name}.session.json`,import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}
});
