import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {ROOM} from '../js/const.js';
import {init_vision_globals,vision_reset,block_point,unblock_point,transparencyIndexViews} from '../js/vision.js';
import {light_globals_init} from '../js/light.js';
async function setup(clear){
 await runSegment({seed:8432244,datetime:'20270605100000',nethackrc:'OPTIONS=name:Endpoint,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.level=new GameMap();for(const x of clear)game.level.at(x,7).typ=ROOM;
 game.level.monlist=null;game.u.ux=5;game.u.uy=7;light_globals_init(game);init_vision_globals();vision_reset(game);
}
const row=()=>{const v=transparencyIndexViews();return {clear:Array.from(v[7]),left:Array.from(v[28]),right:Array.from(v[49])};};
// Source-pinned examples exercise all four interior dig_point/fill_point arms.
for(const left of [false,true])for(const right of [false,true])for(const opening of [false,true])test(`interior endpoints left=${left} right=${right} opening=${opening}`,async()=>{
 const cells=[];if(left)for(let x=2;x<40;x++)cells.push(x);if(right)for(let x=41;x<78;x++)cells.push(x);if(!opening)cells.push(40);
 await setup(cells);const rng=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx);
 (opening?unblock_point:block_point)(40,7,game);const v=row();
 assert.equal(v.clear[40],Number(opening));
 if(opening){assert.equal(v.left[40],left?1:39);assert.equal(v.right[40],right?78:41);}
 else{assert.equal(v.left[40],left?40:0);assert.equal(v.right[40],right?40:79);}
 if(left)assert.equal(v.right[20],opening?(right?78:41):40);
 if(right)assert.equal(v.left[60],opening?(left?1:39):40);
 assert.deepEqual(game.coreCtx,rng);assert.deepEqual(game.displayCtx,display);
});
// vision.c fill_point's explicit outer endpoint writes survive dig_point's
// blocked-endpoint skips. A geometric rebuild loses this source history.
test('interior closure retains boundary history through reopening and no-op calls',async()=>{
 await setup(Array.from({length:78},(_,i)=>i+1));
 assert.equal(row().right[0],0);assert.equal(row().left[79],79);
 block_point(40,7,game);assert.equal(row().right[0],40);assert.equal(row().left[79],40);
 unblock_point(40,7,game);const v=row();assert.equal(v.right[0],40);assert.equal(v.left[79],40);assert.equal(v.left[40],0);assert.equal(v.right[40],79);
 unblock_point(40,7,game);block_point(0,7,game);block_point(79,7,game);assert.deepEqual(row(),v);
 vision_reset(game);assert.equal(row().right[0],0);assert.equal(row().left[79],79);
});
for(const edge of [0,79])for(const adjacentClear of [false,true])test(`boundary transition ${edge} adjacentClear=${adjacentClear}`,async()=>{
 const neighbor=edge===0?1:78;await setup(adjacentClear?[neighbor]:[]);
 unblock_point(edge,7,game);let v=row();assert.equal(v.clear[edge],1);
 assert.equal(edge===0?v.right[edge]:v.left[edge],adjacentClear?(edge===0?2:77):neighbor);
 block_point(edge,7,game);v=row();assert.equal(v.clear[edge],0);
 assert.equal(edge===0?v.right[edge]:v.left[edge],adjacentClear?edge:(edge===0?79:0));
});

for(const name of ['normal','monochrome','before-control','ordinary-control'])test('incremental vision endpoints '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/vision.c/incremental-endpoints-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}});
