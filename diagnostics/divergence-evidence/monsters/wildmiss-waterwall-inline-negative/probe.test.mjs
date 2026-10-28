import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_XORN,NON_PM} from '../../../../js/monsters.js';
import {WATER,POOL,ROOM,DRAWBRIDGE_UP} from '../../../../js/const.js';
import {set_apparxy} from '../../../../js/monmove.js';
import {wildmiss} from '../../../../js/mhitu.js';
import {cansee,couldsee,recalc_block_point,vision_recalc} from '../../../../js/vision.js';
import {passes_walls} from '../../../../js/mondata.js';
const root=new URL('../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('valid guessed waterwall target uses the same C predicate; pool and floor controls do not',async()=>{
 const dbridge=read('nethack-c/upstream/src/dbridge.c');
 const start=dbridge.indexOf('boolean\nis_waterwall(');
 const end=dbridge.indexOf('boolean\nis_pool(',start);
 assert.ok(start>=0&&end>start);
 const rm=read('nethack-c/upstream/include/rm.h');
 const water=Number(rm.match(/\bWATER\s*=\s*(\d+)/)[1]);
 assert.equal(WATER,water);
 assert.ok(rm.includes('#define IS_WATERWALL(typ) ((typ) == WATER)'));
 const c=read('nethack-c/upstream/src/mhitu.c');
 assert.match(c,/is_waterwall\(mtmp->mux,mtmp->muy\)\s*\? "empty water"\s*:\s*"thin air"/);
 const dir=mkdtempSync(join(tmpdir(),'wildmiss-water-oracle-'));
 try{
  const code=`#include <stdio.h>\n#include <stdlib.h>\ntypedef int boolean;typedef int coordxy;\n#define TRUE 1\n#define FALSE 0\n#define WATER ${water}\n#define IS_WATERWALL(typ) ((typ)==WATER)\n#define isok(x,y) ((x)>0&&(x)<80&&(y)>=0&&(y)<21)\nstruct {int typ;} levl[80][21];\n${dbridge.slice(start,end)}\nint main(int n,char **v){if(n!=2)return 2;levl[10][10].typ=atoi(v[1]);printf("%d\\n",is_waterwall(10,10));return 0;}`;
  writeFileSync(join(dir,'oracle.c'),code);
  execFileSync(process.env.CC??'cc',['-std=c99','-Wall','-Wextra',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
  for(const typ of [WATER,POOL,ROOM,DRAWBRIDGE_UP]){
   await runSegment({seed:7710044,datetime:'20261028120000',nethackrc:'OPTIONS=name:WaterMiss,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',moves:''});
   // Isolate the fixture from randomly generated starting monsters.
   for(const column of game.level.monsters)column.fill(null);
   game.level.monlist=null;
   const x=game.u.ux,y=game.u.uy;
   const mon=newMonster({data:game.mons[PM_XORN],m_id:6001,mx:x+1,my:y,mux:x-1,muy:y,m_lev:8,cham:NON_PM,mhp:32,mhpmax:32,mcanmove:1,mcansee:0,mblinded:5});
   place_monster(mon,mon.mx,mon.my,game);
   mon.nmon=game.level.monlist;game.level.monlist=mon;
   assert.equal(passes_walls(mon.data),true);
   assert.equal(cansee(mon.mx,mon.my,game),true);
   game.level.at(x,y+1).typ=typ;
   recalc_block_point(x,y+1,game);vision_recalc(0,{state:game});
   assert.equal(couldsee(x,y+1,game),true);
   // A blind, non-tame xorn with no hero gold can guess this waterwall
   // square through the production target selector (passes_walls gate).
   const draws=[1,1,2],targetBounds=[];
   set_apparxy(mon,{state:game,random:{rn2:n=>{targetBounds.push(n);assert.ok(draws.length);return draws.shift();}}});
   assert.deepEqual(targetBounds,[3,3,3]);
   assert.deepEqual([mon.mux,mon.muy],[x,y+1]);
   const lines=[],bounds=[];
   await wildmiss(mon,mon.data.mattk[0],{state:game,random:{rn2:n=>{bounds.push(n);return 2;}},message:async text=>lines.push(text)});
   const expected=execFileSync(join(dir,'oracle'),[String(typ)],{encoding:'utf8'}).trim()==='1';
   assert.equal(expected,typ===WATER);
   assert.deepEqual(lines,[`The xorn strikes at ${expected?'empty water':'thin air'}!`]);
   assert.deepEqual(bounds,[3]);
   console.log(JSON.stringify({typ,cWaterwall:expected,jsMessage:lines[0],targetBounds,messageBounds:bounds}));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
