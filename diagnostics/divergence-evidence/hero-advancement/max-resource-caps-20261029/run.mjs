import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdtempSync}from'node:fs';
import{tmpdir}from'node:os';import{dirname,resolve,join}from'node:path';import{fileURLToPath}from'node:url';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
import{parseProgression}from'./parse-c.mjs';
import{newhp}from'../../../../js/attrib.js';import{newpw}from'../../../../js/exper.js';import{roles,races}from'../../../../js/roles.js';
const here=dirname(fileURLToPath(import.meta.url));const group=process.argv[2];assert.ok(['control','target'].includes(group));
const out=mkdtempSync(join(tmpdir(),'hero-attribute-oracle-'));const read=p=>readFileSync(p,'utf8');const hash=s=>createHash('sha256').update(s).digest('hex');
const data=parseProgression(read('nethack-c/upstream/src/role.c'));writeFileSync(join(out,'c-progression.json'),JSON.stringify(data,null,2));
for(const r of data.roles){const js=roles.find(x=>x.filecode===r.filecode);assert.ok(js);assert.deepEqual(Object.values(js.hpadv),r.hpadv);assert.deepEqual(Object.values(js.enadv),r.enadv);assert.equal(js.xlev,r.xlev);assert.equal(js.initrecord,r.initrecord);}
for(const r of data.races){const js=races.find(x=>x.filecode===r.filecode);assert.ok(js);assert.deepEqual(Object.values(js.hpadv),r.hpadv);assert.deepEqual(Object.values(js.enadv),r.enadv);assert.equal(js.attrmax[4],r.conmax);assert.equal(js.attrmax[2],r.wismax);}
let generated=data.roles.map((r,i)=>`#ifndef ${r.symbol}\n#define ${r.symbol} ${1000+i}\n#endif`).join('\n')+'\n';
generated+='static struct role role_data[]={'+data.roles.map(r=>`{{${r.hpadv}},{${r.enadv}},${r.xlev},${r.initrecord}}`).join(',')+'};\n';
generated+='static struct role race_data[]={'+data.races.map(r=>`{{${r.hpadv}},{${r.enadv}},0,0}`).join(',')+'};\n';
generated+='static int role_codes[]={'+data.roles.map(r=>r.symbol).join(',')+'};\n';
let funcs='';const bindings=[];
for(const[file,names]of Object.entries({'nethack-c/upstream/src/exper.c':['enermod','newpw'],'nethack-c/upstream/src/attrib.c':['newhp']})){
 const source=read(file);for(const name of names){const matches=[...source.matchAll(new RegExp(`(?:^|\\n)(?:staticfn )?(?:int)\\n${name}\\([\\s\\S]*?\\n}\\n`,'g'))];assert.equal(matches.length,1);const text=matches[0][0].replace(/^\n/,'');funcs+=text+'\n';bindings.push({file,symbol:name,sha256:hash(text)});}}
const oracle=read(resolve(here,'shim.h'))+'\n'+generated+funcs+read(resolve(here,'driver.c'));writeFileSync(join(out,'oracle.c'),oracle);writeFileSync(join(out,'source-bindings.json'),JSON.stringify(bindings,null,2));
const compile=spawnSync('gcc',['-std=c11','-O0','-Wall','-Wextra',join(out,'oracle.c'),'-o',join(out,'oracle')],{encoding:'utf8'});writeFileSync(join(out,'compiler.json'),JSON.stringify({status:compile.status,stdout:compile.stdout,stderr:compile.stderr},null,2));assert.equal(compile.status,0,compile.stderr);
const matrix=[];const add=(level,hpmax,enmax,expected=null)=>matrix.push({index:matrix.length,role:'Wiz',race:'Hum',level,con:18,wis:18,upper:1,align:1,hpmax,enmax,...(expected?{expected}:{})});
if(group==='control'){add(29,1200,600,{hp:5,en:26,storedHp:5,storedEn:26});add(30,1200,600,{hp:1,en:1,storedHp:77,storedEn:77});}
else{for(const hpmax of [30,299,300,301,599,600,601,899,900,901,1199,1200,1201])for(const enmax of [0,199,200,201,399,400,401,599,600,601])add(30,hpmax,enmax);}
writeFileSync(join(out,'matrix.json'),JSON.stringify(matrix,null,2));
writeFileSync(join(out,'input.txt'),matrix.map(r=>[r.index,data.roles.findIndex(x=>x.filecode===r.role),data.races.findIndex(x=>x.filecode===r.race),r.level,r.con,r.wis,r.upper,r.align,r.hpmax,r.enmax].join(' ')).join('\n')+'\n');
const run=spawnSync(join(out,'oracle'),[join(out,'input.txt')],{encoding:'utf8',maxBuffer:64*1024*1024});assert.equal(run.status,0,run.stderr);writeFileSync(join(out,'c-output.jsonl'),run.stdout);
const c=run.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(c.length,matrix.length);
const js=[];const mismatches=[];
for(const r of matrix){const state={moves:0,flags:{initalign:r.align},urole:roles.find(x=>x.filecode===r.role),urace:races.find(x=>x.filecode===r.race),u:{ulevel:r.level,uhpmax:r.hpmax,uenmax:r.enmax,ualign:{type:[1,0,-1][r.align],record:0},uhpinc:Array(30).fill(77),ueninc:Array(30).fill(77),acurr:{a:[10,10,r.wis,10,r.con,10]},abon:{a:[0,0,0,0,0,0]},atemp:[0,0,0,0,0,0]}};let rng='';const random={rnd:n=>{const v=r.upper?n:1;rng+=`rnd(${n})=${v};`;return v;},rn1:(n,b)=>{const v=b+(r.upper?n-1:0);rng+=`rn1(${n},${b})=${v};`;return v;}};
 const hp=newhp(state,random),en=newpw(state,random);const result={index:r.index,hp,en,storedHp:state.u.uhpinc[Math.min(r.level,29)],storedEn:state.u.ueninc[Math.min(r.level,29)],alignType:state.u.ualign.type,alignRecord:state.u.ualign.record,rng};js.push(result);
 if(r.expected)for(const[k,v]of Object.entries(r.expected)){assert.equal(c[r.index][k],v,`C control ${r.index} ${k}`);assert.equal(result[k],v,`JS control ${r.index} ${k}`);}
 if(JSON.stringify(c[r.index])!==JSON.stringify(result))mismatches.push({input:r,c:c[r.index],js:result});
}
writeFileSync(join(out,'js-output.jsonl'),js.map(r=>JSON.stringify(r)).join('\n')+'\n');
const summary={group,rows:matrix.length,mismatches:mismatches.length,out};writeFileSync(join(out,'mismatches.json'),JSON.stringify(mismatches,null,2));writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));process.exitCode=mismatches.length?1:0;
