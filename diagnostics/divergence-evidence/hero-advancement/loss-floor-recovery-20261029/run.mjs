import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {newexplevel,losexp} from '../../../../js/exper.js';
import {roles,races} from '../../../../js/roles.js';
import {MAXULEV,LAST_PROP,N_ACH,WARNING,TELEPORT_CONTROL,FROMEXPER} from '../../../../js/const.js';
const here=dirname(fileURLToPath(import.meta.url));
const group=process.argv[2];
assert.ok(['control','target'].includes(group));
const out=process.argv[3] || mkdtempSync(join(tmpdir(),'hero-threshold-oracle-'));
const read=p=>readFileSync(p,'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex');
const functions={
 'nethack-c/upstream/src/exper.c':['newuexp','enermod','newpw','losexp','newexplevel','pluslvl'],
 'nethack-c/upstream/src/attrib.c':['newhp','minuhpmax','setuhpmax'],
};
let extracted=''; const bindings=[];
for(const [file,names] of Object.entries(functions)){
 const source=read(file);
 for(const name of names){
  const re=new RegExp(`(?:^|\\n)(?:staticfn )?(?:long|int|void)\\n${name}\\([\\s\\S]*?\\n}\\n`,'g');
  const matches=[...source.matchAll(re)];assert.equal(matches.length,1,`${file}:${name}`);
  const text=matches[0][0].replace(/^\n/,'');
  extracted+=text+'\n';bindings.push({file,symbol:name,sha256:digest(text)});
 }
}
const cSource=read(resolve(here,'shim.h'))+'\n'+extracted+'\n'+read(resolve(here,'driver.c'));
writeFileSync(join(out,'oracle.c'),cSource);
writeFileSync(join(out,'source-bindings.json'),JSON.stringify(bindings,null,2));
const compile=spawnSync('gcc',['-std=c11','-O0','-Wall','-Wextra',join(out,'oracle.c'),'-o',join(out,'oracle')],{encoding:'utf8'});
writeFileSync(join(out,'compiler.json'),JSON.stringify({status:compile.status,stdout:compile.stdout,stderr:compile.stderr},null,2));
assert.equal(compile.status,0,compile.stderr);
const role=roles.find(r=>r.filecode==='Wiz'),race=races.find(r=>r.filecode==='Hum');
assert.equal(role.xlev,12);
assert.deepEqual(Object.values(role.hpadv),[10,0,0,8,1,0]);
assert.deepEqual(Object.values(role.enadv),[4,3,0,2,0,3]);
assert.deepEqual(Object.values(race.hpadv),[2,0,0,2,1,0]);
assert.deepEqual(Object.values(race.enadv),[1,0,2,0,2,0]);
// Pin independent C table bindings rather than using JS tables to generate C.
const tables=read('nethack-c/upstream/src/role.c');
assert.match(tables,/\{ 10, 0, 0, 8, 1, 0 \}, \/\* Hit points \*\/\s*\{ 4, 3, 0, 2, 0, 3 \},\s*12, \/\* Energy \*\//u);
assert.match(tables,/\{ 2, 0, 0, 2, 1, 0 \}, \/\* Hit points \*\/\s*\{ 1, 0, 2, 0, 2, 0 \}/u);
assert.match(read('nethack-c/upstream/include/global.h'), /#define MAXULEV 30/u);
assert.match(read('nethack-c/upstream/include/global.h'), /typedef int16_t xint16;/u);
const matrix=JSON.parse(read(resolve(here,'matrix.json')))[group];
const results=[];
for(const row of matrix){
 const {id,mode,level,xp,hp,hpmax,en,enmax,hi,ei,upper,maxlevel=level,expected}=row;
 const args=[mode,level,xp,hp,hpmax,en,enmax,hi,ei,upper,maxlevel].map(String);
 const cr=spawnSync(join(out,'oracle'),args,{encoding:'utf8'});
 assert.equal(cr.status,0,`${id}: ${cr.stderr}`);
 const c=JSON.parse(cr.stdout);
 const u={ulevel:level,ulevelmax:maxlevel,ulevelpeak:maxlevel,uexp:xp,uhp:hp,uhpmax:hpmax,uhppeak:hpmax,uen:en,uenmax:enmax,uenpeak:enmax,uhpinc:Array(MAXULEV).fill(0),ueninc:Array(MAXULEV).fill(0),uachieved:Array(N_ACH).fill(0),uprops:Array.from({length:LAST_PROP+1},()=>({intrinsic:0,extrinsic:0,blocked:0})),umonnum:role.mnum,umonster:role.mnum,weapon_slots:level-1,skills_advanced:0,acurr:{a:[10,10,10,10,10,10]},amax:{a:[10,10,10,10,10,10]},atemp:[0,0,0,0,0,0],atime:[0,0,0,0,0,0],aexe:[0,0,0,0,0,0]};
 for(let i=1;i<level;i++){u.uhpinc[i]=2;u.ueninc[i]=4;}
 if(level>=15)u.uprops[WARNING].intrinsic=FROMEXPER;
 if(level>=17)u.uprops[TELEPORT_CONTROL].intrinsic=FROMEXPER;
 const state={moves:1,flags:{initalign:1,female:false},disp:{},urole:role,urace:race,u};
 const slot=mode==='loss'?level-1:level;
 if(slot<30){u.uhpinc[slot]=hi;u.ueninc[slot]=ei;}
 let rng='',messages='';
 const env={message:text=>{messages+=`${text}|${u.ulevel},${u.uhp},${u.uen};`;},random:{rnd:n=>{assert.ok(n>0);const v=upper?n:1;rng+=`rnd(${n})=${v};`;return v;},rn1:(n,b)=>{assert.ok(n>0);const v=b+(upper?n-1:0);rng+=`rn1(${n},${b})=${v};`;return v;}}};
 if(mode==='gain')await newexplevel(state,env);else await losexp('#levelchange',state,env);
 const js=Object.fromEntries(['ulevel','ulevelmax','ulevelpeak','uexp','uhp','uhpmax','uhppeak','uen','uenmax','uenpeak'].map(k=>[k,u[k]]));
 Object.assign(js,{hpinc:slot<30?u.uhpinc[slot]:0,eninc:slot<30?u.ueninc[slot]:0,botl:!!state.disp.botl,rng,messages});
 const result={id,input:row,c,js,match:JSON.stringify(c)===JSON.stringify(js)};
 if(expected) for(const [k,v] of Object.entries(expected)) {assert.equal(c[k],v,`${id}: C positive control ${k}`);assert.equal(js[k],v,`${id}: JS positive control ${k}`);}
 results.push(result);
}
writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2));
const mismatches=results.filter(r=>!r.match);
console.log(JSON.stringify({group,rows:results.length,mismatches:mismatches.map(r=>r.id),out}));
process.exitCode=mismatches.length?1:0;
