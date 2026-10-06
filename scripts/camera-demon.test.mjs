// dothrow.c release_camera_demon2457–2470: tests pin gate short-circuiting,
// awaited creation/feedback order and the shared breakobj caller. Production
// reachability and exact owner RNG are provided by the independent C matrix.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {G_GENOD,HALLUC,HALLUC_RES,LOW_PM} from '../js/const.js';
import {breakobj,release_camera_demon} from '../js/dothrow.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_HOMUNCULUS,PM_IMP,PM_LICHEN,SPECIAL_PM} from '../js/monsters.js';
import {EXPENSIVE_CAMERA} from '../js/objects.js';
import {d,rn1,rn2,rnd,rne} from '../js/rng.js';
import {loadCameraDemonCases,verifyCameraDemonSegment} from './run-camera-demon.mjs';

async function fixture(){
 // The independently chosen no-release recipe supplies initialized globals;
 // stop before any input to test the source unit without a command turn.
 const entry=loadCameraDemonCases()[0];
 await runSegment({...entry.recipe.segments[0],moves:''});
 let camera;for(let obj=game.invent;obj;obj=obj.nobj)if(obj.otyp===EXPENSIVE_CAMERA)camera=obj;
 return camera;
}
function forcedSelection(selector,draws){
 let index=0;
 return {d,rn1,rnd,rne,rn2(bound){draws.push(bound);
  // The first two rn2(3) calls are the release gate and species selector.
  if(index++===0){assert.equal(bound,3);return 0;}
  if(index===2){assert.equal(bound,3);return selector;}
  return rn2(bound);
 }};
}
function created(){
 // These species are not among the level-one starting monsters in the fixture.
 return game.level.monlist;
}

test('camera release short-circuits species selection when rn2(3) is nonzero',async()=>{
 const draws=[];const state={};
 await release_camera_demon({cursed:false},0,0,{state,random:{rn2(bound){draws.push(bound);return 2;}}});
 assert.deepEqual(draws,[3],'C draws only its three-way release gate');
 assert.deepEqual(state,{},'no species, creation or message state is read');
});

test('camera release stops after null creation of a genocided species',async()=>{
 const camera=await fixture();const draws=[];const messages=[];
 game.svm.mvitals[PM_IMP].mvflags|=G_GENOD; // Source makemon rejects a genocided explicit species.
 const before=game.level.monlist;
 // Use a free explicit square so makemon does not first shuffle nearby
 // placement candidates for a request on the occupied hero square.
 await release_camera_demon(camera,game.u.ux+1,game.u.uy,{state:game,
  random:forcedSelection(0,draws),message:async text=>messages.push(text)});
 assert.deepEqual(draws,[3,3]);assert.equal(game.level.monlist,before);
 assert.deepEqual(messages,[]);
});

test('camera release awaits its message before changing peacefulness',async()=>{
 const camera=await fixture();const draws=[];let reached,finish;
 const announced=new Promise(resolve=>{reached=resolve;});
 const operation=release_camera_demon(camera,game.u.ux,game.u.uy,{state:game,
  random:forcedSelection(1,draws),message:async text=>{
   assert.equal(text,'The picture-painting demon is released!');
   assert.equal(created().data.pmidx,PM_HOMUNCULUS);
   assert.equal(Boolean(created().mpeaceful),false,'makemon initially makes this unaligned demon hostile');
   reached();await new Promise(resolve=>{finish=resolve;});
  }});
 await announced;assert.equal(Boolean(created().mpeaceful),false);
 finish();await operation;
 assert.deepEqual(draws.slice(0,2),[3,3]);assert.equal(Boolean(created().mpeaceful),true);
 // Neutral hero is not coaligned with the source homunculus maligntyp -7.
 assert.equal(created().malign,Math.abs(created().data.maligntyp));
});

test('cursed camera retains hostile imp after the release message',async()=>{
 const camera=await fixture();camera.cursed=true;const draws=[];
 await release_camera_demon(camera,game.u.ux,game.u.uy,{state:game,
  random:forcedSelection(0,draws),message:async()=>{}});
 assert.equal(created().data.pmidx,PM_IMP);assert.equal(Boolean(created().mpeaceful),false);
 assert.deepEqual(draws.slice(0,2),[3,3]);
});

test('hallucinated camera message uses display RNG only after visible creation',async()=>{
 const camera=await fixture();game.u.uprops[HALLUC].intrinsic=77; // An active timeout, not permanent resistance.
 const draws=[],displayDraws=[],messages=[];const answers=[PM_LICHEN-LOW_PM,0];
 await release_camera_demon(camera,game.u.ux,game.u.uy,{state:game,
  random:forcedSelection(1,draws),displayRandom:bound=>{displayDraws.push(bound);return answers.shift();},
  message:async text=>messages.push(text)});
 assert.deepEqual(displayDraws,[SPECIAL_PM+100-LOW_PM,2],'do_name.c rndmonnam selects a catalog entry and gender');
 assert.deepEqual(messages,['A lichen is released!']);
 assert.equal(Boolean(created().mpeaceful),true);
});

test('hallucination resistance suppresses random monster-name draws',async()=>{
 const camera=await fixture();game.u.uprops[HALLUC].intrinsic=77;game.u.uprops[HALLUC_RES].extrinsic=1;
 const messages=[];
 await release_camera_demon(camera,game.u.ux,game.u.uy,{state:game,
  random:forcedSelection(1,[]),displayRandom:()=>{throw new Error('resisted hallucination drew a display name');},
  message:async text=>messages.push(text)});
 assert.deepEqual(messages,['The picture-painting demon is released!']);
});

test('camera breakobj awaits release while the source camera still exists',async()=>{
 const camera=await fixture();const inventory=()=>{
  for(let obj=game.invent;obj;obj=obj.nobj)if(obj===camera)return true;return false;
 };
 await breakobj(camera,game.u.ux,game.u.uy,true,true,{state:game,
  random:forcedSelection(1,[]),message:async()=>assert.ok(inventory())});
 assert.equal(inventory(),false,'the common delobj tail follows release');
 assert.equal(Boolean(created().mpeaceful),true);
 assert.equal(game.unported.has('dothrow.c release_camera_demon'),false);
});

test('planning camera release preserves state changes with silent message callbacks',async()=>{
 const camera=await fixture();let messages=0;
 await release_camera_demon(camera,game.u.ux,game.u.uy,{state:game,planning:true,
  random:forcedSelection(1,[]),message:async()=>{++messages;}});
 assert.equal(messages,0);assert.equal(created().data.pmidx,PM_HOMUNCULUS);
 assert.equal(Boolean(created().mpeaceful),true);
});

test('camera caller removes the source gap and retains release before deletion',()=>{
 const js=readFileSync(new URL('../js/dothrow.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/note_unported\('dothrow.c release_camera_demon'\)/u);
 assert.match(js,/case EXPENSIVE_CAMERA:\s*await release_camera_demon\(obj, x, y,[\s\S]*if \(!fracture\) delobj/u);
 const c=readFileSync(new URL('../nethack-c/upstream/src/dothrow.c',import.meta.url),'utf8');
 assert.match(c,/if \(!rn2\(3\)[\s\S]*PM_HOMUNCULUS : PM_IMP[\s\S]*mtmp->mpeaceful = !obj->cursed;\s*set_malign\(mtmp\)/u);
});

test('independent Tourist inputs reach camera destruction and release state',async()=>{
 for(const{recipe}of loadCameraDemonCases())await verifyCameraDemonSegment(recipe.segments[0]);
});
