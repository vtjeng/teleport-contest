import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2];assert(['target','control'].includes(mode));
const read=p=>readFileSync(p,'utf8');
const functionBody=(s,sig)=>{const a=s.indexOf(sig);assert(a>=0);const b=s.indexOf('\n}',a);assert(b>a);return s.slice(a,b+2);};
const c=functionBody(read('nethack-c/upstream/src/mcastu.c'),'\nspell_would_be_useless(');
const js=functionBody(read('js/mcastu.js'),'function spell_would_be_useless(');
const which=mode==='target'?'MCAST_CLONE_WIZ':'MCAST_DISAPPEAR';
const arm=s=>{const a=s.indexOf(`case ${which}:`);assert(a>=0);const b=s.indexOf('break;',a);assert(b>a);return s.slice(a+`case ${which}:`.length,b);};
const ca=arm(c),ja=arm(js);
// Complete selected switch arms, not a claim about the preceding flag gates or dispatcher.
const jf=new Function('mtmp','state','heroProperty','SEE_INVIS',`${ja}\nreturn false;`);
const rows=[];
if(mode==='target')for(const iswiz of [0,1])for(const count of [1,2,3])rows.push({iswiz,count,minvis:0,blocked:0,peaceful:0,see:0});
else for(const minvis of [0,1])for(const blocked of [0,1])for(const peaceful of [0,1])for(const see of [0,1])rows.push({iswiz:0,count:1,minvis,blocked,peaceful,see});
const jsResults=rows.map(r=>Number(jf({iswiz:r.iswiz,minvis:r.minvis,invis_blkd:r.blocked,mpeaceful:r.peaceful},{context:{no_of_wizards:r.count}},()=>r.see,0)));
const csrc=`#include <stdio.h>\n#define TRUE 1\n#define See_invisible see\nstruct monst {int iswiz,minvis,invis_blkd,mpeaceful;};\nstruct {struct {int no_of_wizards;} context;} svc;\nstatic int guard(struct monst *mtmp, int see) { (void)see; ${ca}\nreturn 0; }\nint main(void) {\n${rows.map(r=>`{struct monst m={${r.iswiz},${r.minvis},${r.blocked},${r.peaceful}};svc.context.no_of_wizards=${r.count};printf("%d\\n",guard(&m,${r.see}));}`).join('\n')}\n}`;
const temp=mkdtempSync(join(tmpdir(),'monster-spell-guard-'));
try{
 writeFileSync(join(temp,'oracle.c'),csrc);execFileSync('cc',['-std=c11','-Wall','-Wextra',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);
 const cResults=execFileSync(join(temp,'oracle'),{encoding:'utf8'}).trim().split('\n').map(Number);
 assert.deepEqual(jsResults,cResults);assert(cResults.includes(0));assert(cResults.includes(1));
 // Zero-count is explicitly a source-domain gap, never a valid gameplay fixture.
 if(mode==='target'){
  assert.match(ca,/no_of_wizards > 1/);assert.match(ja,/no_of_wizards \?\? 0\) > 1/);
  const cc=functionBody(read('nethack-c/upstream/src/mcastu.c'),'\nmcast_clone_wiz(');
  assert.match(cc,/no_of_wizards == 1/);
 }
 console.log(JSON.stringify({mode,arm:which,rows:rows.map((r,i)=>({...r,c:cResults[i],js:jsResults[i]})),scope:'selected source predicate only; native diagnostic reachability unresolved'}));
}finally{rmSync(temp,{recursive:true,force:true});}
