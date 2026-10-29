import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {mineralize,water_has_kelp} from '../../../../js/mineralize.js';
import {game} from '../../../../js/gstate.js';
import {topology} from './topology.mjs';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(hash(readFileSync(f)),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}

assert.deepEqual(topology,JSON.parse(readFileSync(join(p,'topology.json'))));
const tmp=mkdtempSync(join(tmpdir(),'levels-mineral-elig-'));const fixtures=[],actual=[];let selector=0,gate=0,denied=0,eligible=0;
const level=new GameMap(),state={...game,level,u:{...game.u}};
function random(policy){const draws=[];const nope=()=>{throw Error('Unexpected non-rn2 draw/resource branch');};return {draws,rn2:n=>{assert(n>0);draws.push(n);return policy?n-1:0;},rnd:nope,rn1:nope,rne:nope};}
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
const relations=mode==='target'?[{dnum:0,dlevel:1},topology.astral_level]:[topology.water_level];
for(const pos of relations)for(let typ=0;typ<37;typ++)for(const pool of [0,2,10])for(const moat of [0,3,30])for(const policy of [0,1]){
 state.u.uz={...pos};level.at(10,6).typ=typ;const r=random(policy);const result=Number(water_has_kelp(10,6,pool,moat,{state,random:r}));fixtures.push([0,pos.dnum,pos.dlevel,typ,pool,moat,policy,0]);actual.push([result,...r.draws]);selector++;
}
const skip=Number(mode==='control');
for(let dnum=0;dnum<topology.dungeons.length;dnum++)for(let floor=1;floor<=topology.dungeons[dnum].num_dunlevs;floor++)for(const arboreal of [0,1])for(const stone of [0,1])for(const [pool,moat] of [[0,0],[2,3],[-1,-1]]){
 state.u.uz={dnum,dlevel:floor};for(let x=0;x<80;x++)for(let y=0;y<21;y++){level.at(x,y).typ=25;level.at(x,y).wall_info=0;}
 if(stone)for(let x=9;x<=11;x++)for(let y=9;y<=11;y++)level.at(x,y).typ=0;
 level.at(20,5).typ=16;level.at(22,5).typ=17;level.at(24,5).typ=18;level.flags.arboreal=Boolean(arboreal);const r=random(1);
 mineralize(pool,moat,0,0,Boolean(skip),{state,random:r});assert.equal(level.objlist,null);
 if(r.draws.includes(1000))eligible++;else denied++;
 if(skip&&stone)assert.equal(r.draws.filter(n=>n===1000).length,2);
 fixtures.push([1,dnum,floor,skip,arboreal,stone,pool,moat]);actual.push([0,...r.draws]);gate++;
}
const top=[topology.dungeons.length,...topology.dungeons.flatMap(d=>[d.num_dunlevs,d.depth_start,Number(d.hellish)]),topology.specials.length,...topology.specials.flatMap(s=>[s.dlevel.dnum,s.dlevel.dlevel,Number(s.town)]),topology.mines_dnum,topology.quest_dnum,topology.tower_dnum,...['astral_level','water_level','rogue_level','oracle_level'].flatMap(k=>[topology[k].dnum,topology[k].dlevel])];
const input=top.join(' ')+'\n'+fixtures.map(v=>v.join(' ')).join('\n')+'\n';const expected=execFileSync(exe,[],{input,encoding:'utf8'}).trim().split('\n').map(l=>l.split(' ').map(Number));assert.equal(expected.length,actual.length);for(let i=0;i<actual.length;i++)assert.deepEqual(actual[i],expected[i],JSON.stringify(fixtures[i]));
console.log(JSON.stringify({mode,selector,gate,eligible,withoutMineralDraws:denied,total:actual.length,inputSha256:hash(input),observationSha256:hash(JSON.stringify(actual)),equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
