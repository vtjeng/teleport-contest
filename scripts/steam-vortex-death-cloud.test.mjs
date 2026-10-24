import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';import test from 'node:test';
import {game} from '../js/gstate.js';import {GameMap} from '../js/game.js';import {runSegment} from '../js/jsmain.js';
import {newMonster,place_monster,remove_monster,m_at} from '../js/monst.js';import {PM_STEAM_VORTEX,PM_FOG_CLOUD} from '../js/monsters.js';
import {mondead} from '../js/mon.js';import {ROOM,HALLUC,BLINDED,NON_PM} from '../js/const.js';
import {light_globals_init} from '../js/light.js';import {init_vision_globals,vision_reset,vision_recalc,block_point,cansee,transparencyIndexViews,liveVisionBufferViews} from '../js/vision.js';import {newsym} from '../js/display.js';
import {createCoreRandom,cloneIsaacContext} from '../js/rng.js';
import {planningState,admitPlannedVisionChange,preflightSimpleMonsterActions,preflightElapsedTurnTail} from '../js/unported_monster_actions.js';
const index=()=>transparencyIndexViews().map(r=>Array.from(r));
async function setup(kind,hallu,moving,blind=false,near=!moving){
 await runSegment({seed:8432182,datetime:'20270427100000',nethackrc:'OPTIONS=name:SteamDeath,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.level=new GameMap();game.head_engr=null;for(let x=2;x<19;x++)for(let y=2;y<15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}game.u.ux=near?7:5;game.u.uy=7;game.u.umovement=0;game.context.mon_moving=moving;
 game.u.uprops[HALLUC].intrinsic=hallu?800:0;game.u.uprops[BLINDED].intrinsic=blind?800:0;
 const actor=newMonster({data:game.mons[kind],mnum:kind,cham:NON_PM,m_id:9951,m_lev:game.mons[kind].mlevel,mhp:10,mhpmax:10,mcanmove:true,mcansee:true});game.level.monlist=actor;place_monster(actor,8,7,game);game.svm.mvitals[kind].born=1;
 light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);return actor;
}
const regionView=state=>(state.level.regions??[]).map(r=>({rects:structuredClone(r.rects),bounding_box:structuredClone(r.bounding_box),ttl:r.ttl,arg:r.arg,inside:r.hero_inside,visible:r.visible,fault:r.heros_fault,glyph:r.glyph_cmap}));
const snapshot=()=>({core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid),buffers:liveVisionBufferViews().map(r=>Array.from(r)),index:index(),world:structuredClone(game.level.locations),iflags:structuredClone(game.iflags),disp:structuredClone(game.disp),u:structuredClone(game.u),regions:regionView(game),context:structuredClone(game.context),vitals:structuredClone(game.svm.mvitals),monster:structuredClone(game.level.monlist),flag:game.vision_full_recalc,hp:game.u.uhp});
for(const hallu of [false,true])for(const blind of [false,true])for(const moving of [false,true])for(const kind of [PM_STEAM_VORTEX,PM_FOG_CLOUD])test(`death cloud live Hallu=${hallu} Blind=${blind} moving=${moving} species=${kind}`,async()=>{
 const outcomes=[];for(const delegated of [false,true]){const actor=await setup(kind,hallu,moving,blind),calls={block:[],see:[],draw:[]},lines=[];await mondead(actor,game,{random:createCoreRandom(game.coreCtx,game),message:async text=>lines.push(text),...(delegated?{blockPoint:(x,y)=>{calls.block.push([x,y]);block_point(x,y,game);},canSee:(x,y)=>{calls.see.push([x,y]);return cansee(x,y,game);},newsym:(x,y)=>{calls.draw.push([x,y]);newsym(x,y);}}:{})});
 assert.equal(actor.mhp,0);assert.equal(m_at(8,7,game),null);assert.equal(game.svm.mvitals[kind].died,1);assert.equal(index()[7][8],kind===PM_STEAM_VORTEX?0:1);
 const regions=regionView(game);assert.equal(regions.length,kind===PM_STEAM_VORTEX?1:0);if(regions.length){assert.equal(regions[0].arg,0);assert.equal(regions[0].visible,true);if(!moving)assert.equal(regions[0].inside,true,'an adjacent death cloud envelops the hero');assert.equal(Boolean(regions[0].fault),!moving);if(delegated){assert(calls.block.length>=5&&calls.block.length<=14);assert(calls.see.length>0);}}else assert.deepEqual(calls,{block:[],see:[],draw:[]});
 outcomes.push({core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid),index:index(),world:structuredClone(game.level.locations),regions,lines,flag:game.vision_full_recalc});}
 assert.deepEqual(outcomes[0],outcomes[1]);
});
for(const hallu of [false,true])for(const blind of [false,true])for(const tail of [false,true])for(const fail of [false,true])test(`death cloud planned Hallu=${hallu} Blind=${blind} tail=${tail} throw=${fail}`,async()=>{
 const actor=await setup(PM_STEAM_VORTEX,hallu,true,blind,true),before=snapshot(),marker=new Error('after death cloud');let calls=0,result;
 const cb=async(planned,random)=>{calls++;planned.context.mon_moving=true;const target=planned.level.monlist;await mondead(target,planned,{planning:true,random,admitPlannedVisionChange,message:async()=>{},redraw:()=>{}});assert.equal(target.mhp,0);assert.equal(m_at(8,7,planned),null);result={regions:regionView(planned),next:random.rn2(1000)};assert.equal(result.regions.length,1);assert.equal(index()[7][8],0,'cloud borrows the real opacity index');if(fail)throw marker;return true;};
 const run=()=>tail?preflightElapsedTurnTail(game,cb):preflightSimpleMonsterActions(game,{consumeHeroRation:false,advanceRound:cb});if(fail)await assert.rejects(run,e=>e===marker);else await run();assert.equal(calls,1);assert.deepEqual(snapshot(),before);assert.equal(actor.mhp,10);
 const live=await setup(PM_STEAM_VORTEX,hallu,true,blind,true),random=createCoreRandom(game.coreCtx,game);await mondead(live,game,{random,message:async()=>{},redraw:()=>{}});assert.deepEqual(result.regions,regionView(game));assert.equal(result.next,random.rn2(1000));
});
test('planned death cloud requires opacity admission before shared index mutation',async()=>{await setup(PM_STEAM_VORTEX,false,true);const planned=planningState(game),before=snapshot();await assert.rejects(()=>mondead(planned.level.monlist,planned,{planning:true,random:createCoreRandom(cloneIsaacContext(planned.coreCtx),planned),message:async()=>{},redraw:()=>{}}),/admitPlannedVisionChange/);assert.deepEqual(snapshot(),before);});

for(const hallu of [false,true])test(`steam vortex swallowed hero death Hallu=${hallu}`,async()=>{const actor=await setup(PM_STEAM_VORTEX,hallu,false,true,true);remove_monster(actor.mx,actor.my,game);place_monster(actor,game.u.ux,game.u.uy,game);game.u.uswallow=1;game.u.ustuck=actor;vision_recalc(0);for(let i=0;i<16;i++)game.nhDisplay.pushKey(32);const lines=[];await mondead(actor,game,{random:createCoreRandom(game.coreCtx,game),message:async text=>lines.push(text)});assert.equal(game.u.uswallow,0);assert.equal(game.u.ustuck,null);assert.equal(m_at(7,7,game),null);assert.equal(game.svm.mvitals[PM_STEAM_VORTEX].died,1);const r=regionView(game);assert.equal(r.length,1);assert.equal(r[0].arg,0);assert.equal(r[0].inside,true);assert(lines.includes('You are enveloped in a cloud of steam!'));});

for(const name of ['normal','monochrome','before-control'])test('steam vortex death cloud '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/steam-vortex-death-cloud-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
