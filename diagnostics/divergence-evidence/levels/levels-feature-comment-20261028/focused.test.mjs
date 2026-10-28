import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resetGame } from '../../../../js/gstate.js';
import { GameMap } from '../../../../js/game.js';
import { lspo_feature } from '../../../../js/mklev.js';
import { ROOM, ALTAR, FOUNTAIN, F_LOOTED, F_WARNED } from '../../../../js/const.js';
const c=readFileSync(new URL('../../../../nethack-c/upstream/src/sp_lev.c',import.meta.url),'utf8');
const js=readFileSync(new URL('../../../../js/mklev.js',import.meta.url),'utf8');
function env(typ){const state=resetGame();state.level=new GameMap();state.u={uz:{dnum:0,dlevel:1}};state.level.at(12,7).typ=typ;return {state,coder:{croom:null},frame:{xstart:10,ystart:5,xsize:10,ysize:10},random:{rn2:()=>assert.fail('fixed coordinates and flags consume no RNG')}};}
test('stale comment does not describe the wired API',()=>{
 assert.match(js,/feature\(\.\.\.args\) \{ return lspo_feature\(args, env\); \}/);
 assert.match(c,/if \(IS_FURNITURE\(levl\[x\]\[y\]\.typ\)\)\s+return;/);
 assert.match(c,/l_table_getset_feature_flag\(L, x, y, "looted", F_LOOTED\)/);
});
test('fixed fountain table creates terrain and requested flags',()=>{
 const e=env(ROOM);lspo_feature([{type:'fountain',x:2,y:2,looted:true,warned:true}],e);
 const loc=e.state.level.at(12,7);assert.equal(loc.typ,FOUNTAIN);assert.equal(loc.flags&(F_LOOTED|F_WARNED),F_LOOTED|F_WARNED);
});
test('existing different furniture is preserved and receives no fountain flags',()=>{
 const e=env(ALTAR);lspo_feature([{type:'fountain',x:2,y:2,looted:true,warned:true}],e);
 const loc=e.state.level.at(12,7);assert.equal(loc.typ,ALTAR);assert.equal(loc.flags,0);
});
