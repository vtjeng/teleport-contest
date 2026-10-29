import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkportal} from '../../../../js/mkmaze.js';
import {GameMap} from '../../../../js/game.js';
import {ROOM,MAGIC_PORTAL} from '../../../../js/const.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const dir=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(dir,'source-contract.json')));
for(const [path,hash]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);
const csrc=readFileSync('nethack-c/upstream/src/mkmaze.c','utf8'),a=csrc.indexOf('\nmkportal(')+1;assert(readFileSync(join(dir,'oracle.c'),'utf8').includes(csrc.slice(a,csrc.indexOf('\n}',a)+2)));
const tmp=mkdtempSync(join(tmpdir(),'levels-portal-delegation-'));
const snapshot=t=>[t.tx,t.ty,t.ttyp,t.dst.dnum,t.dst.dlevel];
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dir,'oracle.c'),'-o',exe]);let count=0;
 for(const coordinates of [[[10,6],[20,9]],[[1,0],[78,19]],[[40,10],[60,15]]])for(const pair of [[1,2],[1,3],[2,3]]){
  const states=pair.map(dlevel=>({level:new GameMap(),u:{uz:{dnum:0,dlevel}},dungeons:[{num_dunlevs:3,flags:{}}],water_level:{dnum:1,dlevel:1},juiblex_level:{dnum:1,dlevel:2},iflags:{},context:{}}));
  const portals=states.map((state,i)=>{const [x,y]=coordinates[i];state.level.at(x,y).typ=ROOM;const t=mkportal(x,y,0,pair[1-i],state);assert(t);assert.equal(state.level.traps.length,1);assert.equal(state.level.traps[0],t);assert.equal(t.ttyp,MAGIC_PORTAL);return t;});
  for(let i=0;i<2;i++){
   const [x,y]=coordinates[i],dest=pair[1-i],before=snapshot(portals[i]);let blocked=0;
   if(mode==='control'){assert.equal(mkportal(x,y,0,pair[i],states[i]),null);assert.deepEqual(snapshot(portals[i]),before);assert.equal(states[i].level.traps.length,1);blocked=1;}
   const expected=execFileSync(exe,[String(x),String(y),String(blocked?pair[i]:dest),String(dest),String(blocked)],{encoding:'utf8'}).trim().split(' ').map(Number),observed=[...snapshot(portals[i]),blocked];assert.deepEqual(observed,expected);
   console.log(JSON.stringify({sourceLevel:pair[i],destinationLevel:dest,expected,observed}));count++;
  }
 }
 console.log(JSON.stringify({mode,count,scope:'Portal caller delegation and destination assignment only; C factory adapter, actual JS constructor; protected-portal control omits diagnostic parity.'}));
}finally{rmSync(tmp,{recursive:true,force:true});}
