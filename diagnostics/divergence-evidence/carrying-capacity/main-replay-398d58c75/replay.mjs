import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const [mainRoot,group,outputDir]=process.argv.slice(2);
const mainSha='398d58c75c1d9761c3f5ff6eb084d3f8a6259f1b';
const cSha='16ff59115315917b93185d026aeefea06db9b0f4';
const base='diagnostics/divergence-evidence/carrying-capacity';
const runner=`${base}/main-replay-398d58c75/replay.mjs`;
const groups={"targets": [["public-traditional-count", "decline"], ["public-traditional-count", "accept"], ["public-traditional-count", "explicit-prefix"], ["public-menu-request", "weapons-only"], ["public-menu-request", "coins-only"], ["public-look-restart", "look-then-class"], ["public-class-fallback", "empty"], ["public-class-fallback", "absent-dismissed"], ["public-large-menu-count", "unsafe-prefix"]], "controls": [["public-traditional-count", "yes-no-control"], ["public-menu-request", "all-types"], ["public-look-restart", "look-only"], ["public-class-fallback", "explicit-all"], ["public-large-menu-count", "safe-control"]]};
if(!groups[group]||!mainRoot||!outputDir)throw new Error('usage: replay.mjs MAIN_ROOT targets|controls NEW_OUTPUT_DIR');
const git=(...args)=>execFileSync('git',['-C',mainRoot,...args],{encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!==mainSha)throw new Error('wrong Main SHA');
if(git('status','--porcelain'))throw new Error('Main checkout must be clean');
if(!git('ls-tree','HEAD','nethack-c/upstream').includes(cSha))throw new Error('C gitlink changed');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const source={mainSha,cGitlink:cSha,jsTree:git('rev-parse','HEAD:js'),frozenTree:git('rev-parse','HEAD:frozen'),scripts:{}};
for(const f of ['scripts/scoring-workspace.mjs','scripts/diff-fresh.mjs','scripts/diff-fresh-worker.mjs'])source.scripts[f]=hash(resolve(mainRoot,f));
mkdirSync(outputDir);
writeFileSync(`${outputDir}/source.json`,JSON.stringify(source,null,2)+'\n');
const {createScoringWorkspace,removeScoringWorkspace}=await import(pathToFileURL(resolve(mainRoot,'scripts/scoring-workspace.mjs')));
const {runJsSession,compareSessionOutputs}=await import(pathToFileURL(resolve(mainRoot,'scripts/diff-fresh.mjs')));
const started=Date.now(),results=[];const inputs=[runner];
for(const [pkg,name]of groups[group]){
 const input=`${base}/${pkg}/${name}/recorded.session.json`;inputs.push(input);
 const recording=JSON.parse(readFileSync(input));const scoring=createScoringWorkspace(process.cwd(),[]);
 try{
  const js=await runJsSession(recording,scoring);const comparison=compareSessionOutputs(recording,js);const id=`${pkg}--${name}`;
  writeFileSync(`${outputDir}/${id}-js.json`,JSON.stringify(js)+'\n');
  writeFileSync(`${outputDir}/${id}-comparison.json`,JSON.stringify(comparison,null,2)+'\n');
  results.push({id,recording:input,recordingSha256:hash(input),...comparison});
  console.log(JSON.stringify({id,passed:comparison.passed,lengths:comparison.lengths,error:comparison.error}));
 }finally{removeScoringWorkspace(scoring);}
}
const passed=results.every(r=>r.passed);writeFileSync(`${outputDir}/results.json`,JSON.stringify(results,null,2)+'\n');
writeFileSync(`${outputDir}/receipt.json`,JSON.stringify({schemaVersion:1,commandId:group,argv:['node',runner,mainRoot,group,outputDir],cwd:'.',jsSha:mainSha,cGitlink:cSha,recordedAt:new Date().toISOString(),exitCode:passed?0:1,elapsedSeconds:(Date.now()-started)/1000,toolVersions:{node:process.version,oracle:'retained executed C recordings; no new C run'},runnerSha256:hash(runner),inputHashes:Object.fromEntries(inputs.map(p=>[p,hash(p)])),outputs:[`${outputDir}/source.json`,`${outputDir}/results.json`,...results.flatMap(r=>[`${outputDir}/${r.id}-js.json`,`${outputDir}/${r.id}-comparison.json`])],source},null,2)+'\n');
process.exitCode=passed?0:1;
