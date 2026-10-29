import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {is_ok_location,set_ok_location_func} from '../../../../js/room_coordinates.js';
import {set_levltyp_lit} from '../../../../js/mkmaze.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(hash(readFileSync(f)),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-location-light-'));const fixtures=[],actual=[];let eligibility=0,lighting=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
const level=new GameMap(),state={level,u:{uz:{dnum:0,dlevel:1}},water_level:{dnum:2,dlevel:1},juiblex_level:{dnum:3,dlevel:1},iflags:{debug_overwrite_stairs:false}};
for(const relation of mode==='target'?[0,1]:[2])for(const cb of [-1,0,1])for(let typ=0;typ<37;typ++)for(let humidity=0;humidity<128;humidity++){
 state.u.uz=relation===2?{dnum:2,dlevel:1}:relation===1?{dnum:2,dlevel:2}:{dnum:0,dlevel:1};level.at(10,6).typ=typ;level.at(10,6).flags=0;let calls=0;
 set_ok_location_func(cb<0?null:()=>{calls++;return cb;});const result=Number(is_ok_location(10,6,humidity,{state}));
 if(relation===2){assert.equal(result,1);assert.equal(calls,0);}else if(cb>=0){assert.equal(result,cb);assert.equal(calls,1);}
 fixtures.push([0,typ,relation,cb,humidity,0,0]);actual.push([result,calls]);eligibility++;
}
set_ok_location_func(null);
for(const old of [0,14,26,27,28,30])for(let typ=0;typ<37;typ++)for(const lit of mode==='target'?[-1,0,1]:[-2])for(const prior of [0,1])for(const draw of [0,1]){
 const loc=level.at(10,6);loc.typ=old;loc.lit=Boolean(prior);loc.candig=false;loc.flags=0;level.flags.nfountains=Number(old===28);level.flags.nsinks=Number(old===30);let draws=0;
 const ret=set_levltyp_lit(10,6,typ,lit,state,n=>{assert.equal(n,2);draws++;return draw;});
 if(old===26||old===27){assert.equal(ret,false);assert.equal(draws,0);assert.equal(loc.typ,old);assert.equal(Number(loc.lit),prior);}
 fixtures.push([1,old,typ,lit,prior,draw,0]);actual.push([Number(ret),loc.typ,Number(loc.lit),Number(loc.candig),draws,0,level.flags.nfountains,level.flags.nsinks]);lighting++;
}
const input=fixtures.map(v=>v.join(' ')).join('\n')+'\n';const out=execFileSync(exe,[],{input,encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n');assert.equal(out.length,actual.length);
for(let i=0;i<out.length;i++)assert.deepEqual(actual[i],out[i].split(' ').map(Number),JSON.stringify(fixtures[i]));
console.log(JSON.stringify({mode,eligibility,lighting,total:actual.length,inputSha256:hash(input),observationSha256:hash(JSON.stringify(actual)),equal:true}));
}finally{set_ok_location_func(null);rmSync(tmp,{recursive:true,force:true});}
