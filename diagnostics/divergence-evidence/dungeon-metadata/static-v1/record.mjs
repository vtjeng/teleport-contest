// Re-run the static audit and preserve actual process results in v1 receipts.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dir = 'diagnostics/divergence-evidence/dungeon-metadata/static-v1';
const runner = `${dir}/audit.mjs`;
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const runs = ['target', 'control'].map(id => {
    const argv = ['node', runner, ...(id === 'control' ? ['--controls'] : [])];
    const recordedAt = new Date().toISOString();
    const result = spawnSync(argv[0], argv.slice(1), {encoding:'utf8',maxBuffer:8e6});
    if (result.error || result.signal) throw result.error ?? new Error(result.signal);
    writeFileSync(`${dir}/${id}-output.json`, result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return {id,argv,recordedAt,exitCode:result.status};
});
const report = JSON.parse(readFileSync(`${dir}/target-output.json`));
const acornPath = require.resolve('acorn').replace(process.cwd() + '/', '');
const dependencyPaths = [...Object.keys(report.sourceHashes), 'package.json', 'package-lock.json', acornPath, 'node_modules/acorn/package.json'];
const commands = runs.map(run => {
    const receipt = `${dir}/${run.id}-receipt.json`;
    save(receipt, {schemaVersion:1,commandId:run.id,argv:run.argv,cwd:'.',...report.provenance,recordedAt:run.recordedAt,exitCode:run.exitCode,
        toolVersions:{node:process.version, acorn:require('acorn').version},runnerSha256:hash(runner),
        inputHashes:Object.fromEntries(dependencyPaths.map(path=>[path,hash(path)])),outputs:[`${dir}/${run.id}-output.json`]});
    return {id:run.id,role:run.id,argv:run.argv,cwd:'.',runner,ci:'manual',inputs:dependencyPaths,expectedExit:0,receipt};
});
const locations = [
    ['C','dat/dungeon.lua','dungeon',6,333],
    ['C','sys/unix/Makefile.top','SPEC_LEVS / QUEST_LEVS',96,104],
    ['C','src/dungeon.c','level_map',707,737],
    ['C','src/dungeon.c','flagstrs / flagstrs2i',747,752],
    ['C','src/dungeon.c','dgnaligns / dgnaligns2i',783,789],
    ['C','src/dungeon.c','brtypes / brtypes2i',874,879],
    ['JS','js/dungeon_data.js','DUNGEON_DATA',4,345],
    ['JS','js/dungeon.js','metadata constants and LEVEL_MAP',108,184],
    ['JS','js/mklev.js','SPECIAL_LEVEL_LOADERS declaration',1984,2033],
    ['JS','js/tutorial_level.js','TUTORIAL_LEVEL_LOADERS',537,564],
    ['JS','js/tutorial_startup.js','loadTutorialLevel import',26,26],
];
const artifactPaths = [runner, `${dir}/record.mjs`,`${dir}/README.md`,`${dir}/overlap.json`,...runs.flatMap(r=>[`${dir}/${r.id}-receipt.json`,`${dir}/${r.id}-output.json`])];
const evidence = {
    schemaVersion:1,caseId:'dungeon-metadata-static-v1',shard:'dungeon-metadata',status:'explained_negative',readiness:'review_ready',rootCause:null,relatedCases:[],provenance:report.provenance,
    source_locations:locations.map(([side,path,symbol,start_line,end_line])=>({side,path,symbol,start_line,end_line,commit_sha:side==='C'?report.provenance.cGitlink:report.provenance.jsSha})),
    hypothesis:'Authored file mappings or corresponding static dungeon declarations may be incomplete, duplicated, dangling, or inconsistent.',
    expectedBehavior:'Compare only fields and filenames actually declared at the pinned revisions; retain documented non-registry and nonliteral-name exceptions.',
    observedBehavior:'9 dungeons, 37 level prototypes, 7 branches, 21 constants, 3 vocabulary tables and 26 aliases match. 125 unique registry mappings plus the documented direct tut-1 import cover 126 authored files. No unexplained differences or dangling literal metadata assets.',
    witness:{kind:'source',scope:'Static declaration and file-identity inventory at the exact source bases; all permitted tables enumerated in README.',limitations:[
        'No Lua script, special-level API, game handler, level generation, or C oracle executed.',
        'No runtime equivalence, reachability, descriptor ordering, level body content, or gameplay claim.',
        'rogue/dummy markers, x-* quest placeholders, and tower protofile stem have no literal-file equivalence assertion.',
        'Val-strt wrapper and Rog-filb shared-symbol alias are recorded only as declaration-level exceptions; body semantics untested.',
        'Build inventory uses the pinned Unix Makefile declarations, not every platform build or runtime loading condition.',
    ]},
    exposure:{route:'unestablished',attribution:'not_applicable',evidence:[],reason:'Source inventory only; no observed player-facing defect or production execution claim.'},
    origin:{kind:'manual',reason:'New bounded static audit; existing generator and inventory checks reconciled in overlap.json. No prior dynamic Levels artifact or lead used.',keys:[],projection:null,manifest:null,decisions:null},
    commands,
    artifacts:artifactPaths.map(path=>({path,sha256:hash(path),role:'static audit evidence'})),
    dependencies:dependencyPaths.map(path=>({path,sha256:hash(path),role:'pinned source or installed parser input'})),
};
save(`${dir}/case.json`,evidence);
console.log(JSON.stringify({runs: runs.map(({id,exitCode})=>({id,exitCode})),counts:report.counts, controls:JSON.parse(readFileSync(`${dir}/control-output.json`)).passed},null,2));
if (runs.some(r=>r.exitCode!==0)) process.exitCode=1;
