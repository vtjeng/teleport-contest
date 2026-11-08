import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {more_experienced} from '../../../../js/exper.js';
import {PM_WIZARD,PM_TOURIST} from '../../../../js/monsters.js';
const here=dirname(fileURLToPath(import.meta.url)),group=process.argv[2];assert.ok(['control','target'].includes(group));
const out=mkdtempSync(join(tmpdir(),'hero-score-oracle-')),read=p=>readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
let funcs='';const bindings=[];
for(const [file,name,type] of [['nethack-c/upstream/src/botl.c','exp_percent_changing','boolean'],['nethack-c/upstream/src/exper.c','more_experienced','void']]){
 const source=read(file),matches=[...source.matchAll(new RegExp(`(?:^|\\n)${type}\\n${name}\\([\\s\\S]*?\\n}\\n`,'g'))];assert.equal(matches.length,1);const text=matches[0][0].replace(/^\n/,'');funcs+=text+'\n';bindings.push({file,symbol:name,sha256:hash(text)});
}
writeFileSync(join(out,'oracle.c'),read(join(here,'shim.h'))+funcs+read(join(here,'driver.c')));
writeFileSync(join(out,'source-bindings.json'),JSON.stringify(bindings,null,2));
const argv=['-std=c11','-O0','-Wall','-Wextra',join(out,'oracle.c'),'-o',join(out,'oracle')];
const compile=spawnSync('gcc',argv,{encoding:'utf8'});writeFileSync(join(out,'compiler.json'),JSON.stringify({argv:['gcc',...argv],status:compile.status,stdout:compile.stdout,stderr:compile.stderr},null,2));assert.equal(compile.status,0,compile.stderr);
const rows=[],add=r=>rows.push({id:rows.length,...r});
if(group==='control'){
 add({wizard:false,xp:19,score:0,exper:2,rexp:0,show:true,pending:false,beginner:true,expected:{xp:21,score:8,beginner:true,redraw:true}});
 add({wizard:true,xp:19,score:990,exper:0,rexp:10,show:true,pending:false,beginner:true,expected:{xp:19,score:1000,beginner:false,redraw:false}});
}else for(const wizard of [false,true])for(const delta of [-1,0,1])for(const show of [false,true])for(const pending of [false,true])for(const exper of [0,2])for(const beginner of [false,true]){
 const threshold=wizard?1000:2000,rexp=exper?0:10;add({wizard,xp:19,score:threshold+delta-4*exper-rexp,exper,rexp,show,pending,beginner});
}
writeFileSync(join(out,'matrix.json'),JSON.stringify(rows,null,2));writeFileSync(join(out,'input.txt'),rows.map(r=>[r.id,+r.wizard,r.xp,r.score,r.exper,r.rexp,+r.show,+r.pending,+r.beginner].join(' ')).join('\n')+'\n');
const run=spawnSync(join(out,'oracle'),[join(out,'input.txt')],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);writeFileSync(join(out,'c-output.jsonl'),run.stdout);const c=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(c.length,rows.length);
const js=[],mismatches=[];
for(const r of rows){const state={u:{ulevel:1,uexp:r.xp,urexp:r.score},urole:{mnum:r.wizard?PM_WIZARD:PM_TOURIST},flags:{showexp:r.show,beginner:r.beginner},disp:{botl:r.pending},iflags:{status_hilites:[]}};more_experienced(r.exper,r.rexp,state);const result={id:r.id,xp:state.u.uexp,score:state.u.urexp,beginner:state.flags.beginner,redraw:state.disp.botl};js.push(result);if(r.expected){assert.deepEqual(c[r.id],{id:r.id,...r.expected});assert.deepEqual(result,{id:r.id,...r.expected});}if(JSON.stringify(c[r.id])!==JSON.stringify(result))mismatches.push({input:r,c:c[r.id],js:result});}
writeFileSync(join(out,'js-output.jsonl'),js.map(r=>JSON.stringify(r)).join('\n')+'\n');writeFileSync(join(out,'mismatches.json'),JSON.stringify(mismatches,null,2));const summary={group,rows:rows.length,mismatches:mismatches.length,out};writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));process.exitCode=mismatches.length?1:0;
