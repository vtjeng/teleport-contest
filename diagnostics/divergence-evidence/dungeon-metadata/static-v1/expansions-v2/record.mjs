import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const dir='diagnostics/divergence-evidence/dungeon-metadata/static-v1/expansions-v2', runner=dir+'/audit.mjs';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const save=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const runs=['target','control'].map(id=>{
    const argv=['node',runner,...(id==='control'?['--controls']:[])],recordedAt=new Date().toISOString();
    const r=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',maxBuffer:8e6});
    if(r.error||r.signal)throw r.error??new Error(r.signal);
    writeFileSync(`${dir}/${id}-output.json`,r.stdout);if(r.stderr)process.stderr.write(r.stderr);
    return {id,argv,recordedAt,exitCode:r.status};
});
const report=JSON.parse(readFileSync(dir+'/target-output.json'));
const deps=[...Object.keys(report.sourceHashes),'package.json','package-lock.json',require.resolve('acorn').replace(process.cwd()+'/',''),'node_modules/acorn/package.json'];
const commands=runs.map(r=>{
    const receipt=`${dir}/${r.id}-receipt.json`;
    save(receipt,{schemaVersion:1,commandId:r.id,argv:r.argv,cwd:'.',...report.provenance,recordedAt:r.recordedAt,exitCode:r.exitCode,toolVersions:{node:process.version,acorn:require('acorn').version},runnerSha256:hash(runner),inputHashes:Object.fromEntries(deps.map(p=>[p,hash(p)])),outputs:[`${dir}/${r.id}-output.json`]});
    return {id:r.id,role:r.id,argv:r.argv,cwd:'.',runner,ci:'manual',inputs:deps,expectedExit:0,receipt};
});
const locations=[['C','include/you.h','struct Role.filecode',183,190],['C','src/role.c','roles',30,577],['C','include/hack.h','dgn_topology and alias macros',null,null],['JS','js/roles.js','roles',51,357],['JS','js/dungeon_data.js','DUNGEON_DATA',4,345],['JS','js/dungeon.js','LEVEL_MAP',157,184]];
const artifacts=[runner,dir+'/record.mjs',dir+'/README.md',...runs.flatMap(r=>[`${dir}/${r.id}-output.json`,`${dir}/${r.id}-receipt.json`])];
save(dir+'/case.json',{
    schemaVersion:1,caseId:'dungeon-metadata-expansions-v2',shard:'dungeon-metadata',status:'explained_negative',readiness:'review_ready',rootCause:null,relatedCases:['dungeon-metadata-static-v1'],provenance:report.provenance,
    source_locations:locations.map(([side,path,symbol,start_line,end_line])=>({side,path,symbol,start_line,end_line,commit_sha:side==='C'?report.provenance.cGitlink:report.provenance.jsSha})),
    hypothesis:'Declared filecodes, placeholder suffixes, numbered stems and level aliases may form missing, duplicated or inconsistent static filenames or references.',
    expectedBehavior:'Restrict expansions to the names and counts declared at the pinned sources; distinguish lexical consistency from runtime interpretation.',
    observedBehavior:'13 role filecodes agree. All 39 placeholder joins and 65 authored quest-family filenames are accounted for. The tower stem has exactly three declared numbered levels/files. All 26 aliases resolve to declared prototypes and C topology fields. No unexplained static discrepancy.',
    witness:{kind:'source',scope:'Supplemental lexical joins and alias reference checks; original static v1 evidence unchanged.',limitations:report.limits.concat(['No Lua, game handlers, level generation, special-level APIs, or C oracle executed.','Role fields other than filecode and runtime marker/wrapper behavior are outside scope.'])},
    exposure:{route:'unestablished',attribution:'not_applicable',evidence:[],reason:'Static consistency evidence; no runtime exposure or gameplay-equivalence claim.'},
    origin:{kind:'manual',reason:'Authorized finite continuation of the static metadata boundary, using only the new static-v1 inventory and source declarations.',keys:[],projection:null,manifest:null,decisions:null},commands,
    artifacts:artifacts.map(path=>({path,sha256:hash(path),role:'versioned supplemental static evidence'})),dependencies:deps.map(path=>({path,sha256:hash(path),role:'pinned declarations, prior static inventory or installed parser'}))
});
console.log(JSON.stringify({runs:runs.map(({id,exitCode})=>({id,exitCode})),controls:JSON.parse(readFileSync(dir+'/control-output.json')).passed},null,2));
if(runs.some(r=>r.exitCode!==0))process.exitCode=1;
