import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{dirname,join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
import{add_weapon_skill,can_advance}from'../../../../js/weapon.js';import{P_NUM_SKILLS,P_QUARTERSTAFF,P_BARE_HANDED_COMBAT,P_HEALING_SPELL,P_TWO_WEAPON_COMBAT,P_RIDING}from'../../../../js/const.js';
const here=dirname(fileURLToPath(import.meta.url)),group=process.argv[2];assert.ok(['control','target'].includes(group));const out=mkdtempSync(join(tmpdir(),'hero-skill-oracle-'));const read=p=>readFileSync(p,'utf8');const source=read('nethack-c/upstream/src/weapon.c');let funcs='';const bindings=[];
for(const name of ['slots_required','can_advance','give_may_advance_msg','add_weapon_skill']){
 const matches=[...source.matchAll(new RegExp(`(?:^|\\n)(?:staticfn )?(?:int|boolean|void)\\n${name}\\([\\s\\S]*?\\n}\\n`,'g'))];assert.equal(matches.length,1,name);const text=matches[0][0].replace(/^\n/,'');funcs+=text+'\n';bindings.push({file:'nethack-c/upstream/src/weapon.c',symbol:name,sha256:createHash('sha256').update(text).digest('hex')});}
writeFileSync(join(out,'oracle.c'),read(resolve(here,'shim.h'))+'\n'+funcs+read(resolve(here,'driver.c')));writeFileSync(join(out,'source-bindings.json'),JSON.stringify(bindings,null,2));
const compile=spawnSync('gcc',['-std=c11','-O0','-Wall','-Wextra','-I.',join(out,'oracle.c'),'-o',join(out,'oracle')],{encoding:'utf8'});writeFileSync(join(out,'compiler.json'),JSON.stringify({status:compile.status,stdout:compile.stdout,stderr:compile.stderr},null,2));assert.equal(compile.status,0,compile.stderr);
const matrix=[];const add=(skill,rank,maxrank,practice,slots,increment,advanced=0,expected=null)=>matrix.push({index:matrix.length,skill,rank,maxrank,practice,slots,increment,advanced,...(expected?{expected}:{})});
const confidence='You feel more confident in your skills.';
if(group==='control'){
 add(P_QUARTERSTAFF,2,4,79,1,1,0,{before:false,after:false,slots:2,message:''});
 add(P_QUARTERSTAFF,2,4,80,1,1,0,{before:false,after:true,slots:2,message:confidence});
 add(P_QUARTERSTAFF,2,4,80,2,1,0,{before:true,after:true,slots:3,message:''});
}else{
 for(const skill of [P_QUARTERSTAFF,P_BARE_HANDED_COMBAT,P_HEALING_SPELL,P_TWO_WEAPON_COMBAT,P_RIDING]){
  const maxrank=skill===P_BARE_HANDED_COMBAT?6:4;
  for(let rank=1;rank<=maxrank;rank++)for(const delta of [-1,0,1])for(const slots of [0,1,2,3])for(const increment of [0,1,2])add(skill,rank,maxrank,rank*rank*20+delta,slots,increment);
  add(skill,0,0,80,1,1);add(skill,2,maxrank,80,1,1,60);
 }
}
writeFileSync(join(out,'matrix.json'),JSON.stringify(matrix,null,2));writeFileSync(join(out,'input.txt'),matrix.map(r=>[r.index,r.skill,r.rank,r.maxrank,r.practice,r.slots,r.increment,r.advanced].join(' ')).join('\n')+'\n');
const run=spawnSync(join(out,'oracle'),[join(out,'input.txt')],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(run.status,0,run.stderr);writeFileSync(join(out,'c-output.jsonl'),run.stdout);const c=run.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(c.length,matrix.length);const js=[],mismatches=[];
for(const r of matrix){const state={flags:{tips:false},u:{weapon_slots:r.slots,skills_advanced:r.advanced,weapon_skills:Array.from({length:P_NUM_SKILLS},()=>({skill:0,max_skill:0,advance:0}))}};state.u.weapon_skills[r.skill]={skill:r.rank,max_skill:r.maxrank,advance:r.practice};const before=can_advance(r.skill,false,state);await add_weapon_skill(r.increment,state);const result={index:r.index,before,after:can_advance(r.skill,false,state),slots:state.u.weapon_slots,message:state._pending_message??''};js.push(result);if(r.expected)for(const[k,v]of Object.entries(r.expected)){assert.equal(c[r.index][k],v,`C ${r.index} ${k}`);assert.equal(result[k],v,`JS ${r.index} ${k}`);}if(JSON.stringify(result)!==JSON.stringify(c[r.index]))mismatches.push({input:r,c:c[r.index],js:result});}
writeFileSync(join(out,'js-output.jsonl'),js.map(x=>JSON.stringify(x)).join('\n')+'\n');writeFileSync(join(out,'mismatches.json'),JSON.stringify(mismatches,null,2));const summary={group,rows:matrix.length,mismatches:mismatches.length,out};writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));process.exitCode=mismatches.length?1:0;
