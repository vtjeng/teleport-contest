import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newgame_pre_mklev} from '../../../../js/allmain.js';
import {game,resetGame} from '../../../../js/gstate.js';
import {mklev} from '../../../../js/mklev.js';
import {monst_globals_init} from '../../../../js/monsters.js';
import {objects_globals_init} from '../../../../js/objects.js';
import {timeout_globals_init} from '../../../../js/timeout.js';
import {light_globals_init} from '../../../../js/light.js';
import {initRng} from '../../../../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../../../../js/roles.js';
class LoaderDone extends Error {}
async function run(fixture){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RegionRegistrationEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);

 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});des.map({x:10,y:6,map:'.....\n.....\n.....\n.....\n.....'});
  assert.deepEqual([des.frame.xstart,des.frame.ystart],[10,6]);
  assert.equal(game.lregions?.length??0,0);
  const table={region:[1,1,4,4],region_islev:Boolean(fixture.ri),exclude_islev:Boolean(fixture.ei)};
  if(fixture.mode)table.exclude=[2,2,3,3];
  if(fixture.option!=='default')table[fixture.api?'type':'dir']=fixture.option;
  if(fixture.api){table.padding=2;table.name='air';}
  for(let pass=0;pass<2;pass++)des[fixture.api?'levregion':'teleport_region'](table);
  output=game.lregions.map(r=>[...Object.values(r.inarea),...Object.values(r.delarea),Number(r.in_islev),Number(r.del_islev),r.rtype,r.padding,r.rname??'null']);
  throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);
 return output;
}
const tmp=mkdtempSync(join(tmpdir(),'levels-region-registration-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const fixtures=[];
 for(const [api,options] of [[0,['default','both','down','up']],[1,['default','stair-down','stair-up','portal','branch','teleport','teleport-up','teleport-down']]])
 for(const [mode,ri,ei] of [[0,0,0],[0,1,0],[1,0,0],[1,0,1],[1,1,0],[1,1,1]])
 fixtures.push({api,option:null,mode,ri,ei,options});
 const results=[];
 for(const group of fixtures)for(const option of group.options){
  const f={api:group.api,mode:group.mode,ri:group.ri,ei:group.ei,option};
  const expected=execFileSync(join(tmp,'oracle'),[f.api,f.mode,f.ri,f.ei,f.option].map(String),{encoding:'utf8'}).trim().split('\n').map(line=>line.split(' ').map((v,i)=>i<12?Number(v):v));
  const actual=await run(f);assert.deepEqual(actual,expected);
  assert.deepEqual(actual[0],actual[1]);
  results.push({...f,records:actual,matched:true});
 }
 assert.equal(results.length,72);
 assert.deepEqual(results[0].records[0].slice(0,8),[11,7,14,10,-1,-1,-1,-1]);
 console.log(JSON.stringify({scope:'72 registration fixtures, each appended twice; no finalization or teleport execution',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
