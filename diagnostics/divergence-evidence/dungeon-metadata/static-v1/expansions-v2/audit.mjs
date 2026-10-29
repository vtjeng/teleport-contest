// Supplemental static declarations only: no Lua/gameplay imports or execution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
const jsSha='de3380e285e5f4abf40375459f9490f92569e7dc', cGitlink='16ff59115315917b93185d026aeefea06db9b0f4';
const root='nethack-c/upstream';
const dir='diagnostics/divergence-evidence/dungeon-metadata/static-v1';
const hashes={};
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
function input(path) { const bytes=readFileSync(path); hashes[path]=hash(bytes); return bytes.toString(); }
function source(path) {
    const isC=path.startsWith(root+'/');
    const bytes=execFileSync('git',['-C',isC?root:'.','show',`${isC?cGitlink:jsSha}:${isC?path.slice(root.length+1):path}`],{encoding:'utf8',maxBuffer:8e6});
    assert.equal(input(path),bytes,`dirty source ${path}`); return bytes;
}
const old=JSON.parse(input(`${dir}/target-output.json`));
assert.deepEqual(old.provenance,{jsSha,cGitlink});
// Verify the prior report is the exact committed evidence, not an editable expectation.
assert.equal(hashes[`${dir}/target-output.json`],hash(execFileSync('git',['show',`d2a9051ce46de072b1c49f2cf1c38cc0c1a37272:${dir}/target-output.json`])));
const ast=text=>parse(text,{ecmaVersion:'latest',sourceType:'module',locations:true});
function decl(tree,name) {
    const declarations=tree.body.flatMap(n=>n.type==='ExportNamedDeclaration'?[n.declaration]:[n]).filter(n=>n?.type==='VariableDeclaration').flatMap(n=>n.declarations).filter(n=>n.id.name===name);
    assert.equal(declarations.length,1,`unique ${name}`);return declarations[0].init;
}
function literal(n) {
    if(n.type==='Literal') return n.value;
    if(n.type==='UnaryExpression'&&n.operator==='-') return -literal(n.argument);
    if(n.type==='ArrayExpression') return n.elements.map(literal);
    if(n.type==='ObjectExpression') {const obj={};for(const p of n.properties){assert.equal(p.type,'Property');assert(!p.computed);const k=p.key.name??p.key.value;assert(!Object.hasOwn(obj,k));obj[k]=literal(p.value);}return obj;}
    throw new Error('unsupported metadata '+n.type);
}
const data=literal(decl(ast(source('js/dungeon_data.js')),'DUNGEON_DATA'));
const roleSource=source(`${root}/src/role.c`);
const you=source(`${root}/include/you.h`).replace(/\/\*[\s\S]*?\*\//g,'');
assert.match(you,/struct Role\s*\{\s*struct RoleName name;\s*struct RoleName rank\[9\];\s*const char \*lgod, \*ngod, \*cgod;\s*const char \*filecode;/);
// Split initializer rows/fields structurally; never evaluate C expressions.
function split(text) {
    const rows=[];let start=0, depth=0, quote=null, escape=false;
    for(let i=0;i<text.length;i++) {
        const c=text[i];
        if(quote) {if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
        if(c==='"'||c==="'"){quote=c;continue;}
        if('{(['.includes(c))depth++;
        if('})]'.includes(c))depth--;
        assert(depth>=0);
        if(c===','&&depth===0){rows.push(text.slice(start,i).trim());start=i+1;}
    }
    assert.equal(depth,0);assert.equal(quote,null);
    if(text.slice(start).trim())rows.push(text.slice(start).trim());return rows;
}
function roleCodes(text) {
    const clean=text.replace(/\/\*[\s\S]*?\*\//g,'');
    const match=clean.match(/const struct Role roles\[NUM_ROLES\+1\] = \{([\s\S]*?)\n\};/);assert(match);
    const rows=split(match[1]);assert.equal(rows.pop(),'UNDEFINED_ROLE');
    return rows.map(row=>{assert(row.startsWith('{')&&row.endsWith('}'));const fields=split(row.slice(1,-1));assert(fields.length>6);assert.match(fields[5],/^"[A-Za-z]{3}"$/);return JSON.parse(fields[5]);});
}
const cCodes=roleCodes(roleSource);
const jsRoles=decl(ast(source('js/roles.js')),'roles');
assert.equal(jsRoles.type,'CallExpression');assert.equal(jsRoles.callee.name,'deepFreeze');
assert.equal(jsRoles.arguments.length,1);assert.equal(jsRoles.arguments[0].type,'ArrayExpression');
const jsCodes=jsRoles.arguments[0].elements.map(row=>{
    const fields=row.properties.filter(p=>(p.key.name??p.key.value)==='filecode');assert.equal(fields.length,1);return literal(fields[0].value);
});
const hack=source(`${root}/include/hack.h`);
const numRoles=Number(hack.match(/^#define NUM_ROLES \((\d+)\)/m)[1]);
const duplicates=xs=>[...new Set(xs.filter((x,i)=>xs.indexOf(x)!==i))];
function comparison(expected,actual) {return {missing:expected.filter(x=>!actual.includes(x)),extra:actual.filter(x=>!expected.includes(x)),duplicates:duplicates(actual)};}
function expansion(codes,placeholders,files,loaderNames) {
    const rows=codes.flatMap(code=>placeholders.map(placeholder=>({code,placeholder,file:code+placeholder.slice(1)+'.lua'})));
    return {rows,duplicateCodes:duplicates(codes),duplicateFiles:duplicates(rows.map(r=>r.file)),missingFiles:rows.filter(r=>!files.includes(r.file)),missingMappings:rows.filter(r=>!loaderNames.includes(r.file.slice(0,-4)))};
}
const quest=data.find(d=>d.name==='The Quest');
const placeholders=quest.levels.map(l=>l.name);assert(placeholders.every(p=>/^x-(strt|loca|goal)$/.test(p)));
const questExpansion=expansion(cCodes,placeholders,old.luaFiles,old.mappings.map(m=>m.name));
const roleFiles=old.luaFiles.filter(f=>/^[A-Za-z]{3}-(?:strt|loca|goal|fila|filb)\.lua$/.test(f));
// Filler suffixes are observed in the authored manifest, not invented dungeon fields.
const suffixes=[...new Set(roleFiles.map(f=>f.slice(3)))].sort();
const familyExpected=cCodes.flatMap(code=>suffixes.map(suffix=>code+suffix));
const familyCoverage=comparison(familyExpected,roleFiles);
function stemCoverage(d,files,loaders) {
    const names=d.levels.map(l=>l.name), expected=Array.from({length:d.base},(_,i)=>d.protofile+(i+1));
    return {stem:d.protofile,declaredBase:d.base,declaredLevels:names,comparison:comparison(expected,names),
        fileFamily:comparison(names.map(n=>n+'.lua'),files.filter(f=>new RegExp('^'+d.protofile+'[0-9]+\\.lua$').test(f))),
        missingMappings:names.filter(n=>!loaders.includes(n))};
}
const stems=data.filter(d=>d.protofile).map(d=>stemCoverage(d,old.luaFiles,old.mappings.map(m=>m.name)));
const levelMap=literal(decl(ast(source('js/dungeon.js')),'LEVEL_MAP'));
const prototypes=data.flatMap(d=>d.levels.map(l=>l.name));
const topology=hack.match(/struct dgn_topology\s*\{([\s\S]*?)\n\};/);assert(topology);
const topologyFields=[...topology[1].matchAll(/\bd_level\s+([^;]+);/g)].flatMap(m=>m[1].split(',').map(x=>x.trim()));
function aliasRows(map, macros, names, fields) {
    return map.map(([prototype,destination])=>{
        const macro=macros.match(new RegExp('^#define '+destination+'\\s+\\(svd\\.dungeon_topology\\.(\\w+)\\)','m'));assert(macro,`missing macro ${destination}`);
        return {prototype,destination,cField:macro[1],prototypeExists:names.includes(prototype),fieldExists:fields.includes(macro[1])};
    });
}
const aliases=aliasRows(levelMap,hack,prototypes,topologyFields);
const sharedBindings=Object.values(Object.groupBy(old.mappings,m=>`${m.path}:${m.symbol}`)).filter(rows=>rows.length>1).map(rows=>({path:rows[0].path,symbol:rows[0].symbol,keys:rows.map(r=>r.name)}));
const result={schemaVersion:1,provenance:{jsSha,cGitlink},priorEvidenceCommit:'d2a9051ce46de072b1c49f2cf1c38cc0c1a37272',
    roles:{numRoles,cCodes,jsCodes,differences:comparison(cCodes,jsCodes),sameOrder:JSON.stringify(cCodes)===JSON.stringify(jsCodes)},
    questExpansion,roleFamilies:{suffixes,files:roleFiles,comparison:familyCoverage},stems,
    aliases,duplicateAliasSources:duplicates(aliases.map(a=>a.prototype)),duplicateAliasDestinations:duplicates(aliases.map(a=>a.destination)),sharedBindings,
    limits:['Quest joins are lexical consistency checks using the declared filecode and x-* suffixes, not execution of substitution logic.',
    'tower1/2/3 agree with declared base=3 and listed levels; no assertion about runtime stem selection or generated depth.',
    'Rog-fila/Rog-filb share an identifier; body equivalence remains untested.',
    'rogue/dummy lack literal assets; runtime marker behavior and Val-strt wrapper semantics remain excluded.'],sourceHashes:hashes};
function hasIssues(r){return r.roles.differences.missing.length+r.roles.differences.extra.length+r.roles.differences.duplicates.length+Number(!r.roles.sameOrder)+Number(r.roles.cCodes.length!==r.roles.numRoles)+duplicates(r.roles.cCodes).length+r.questExpansion.duplicateCodes.length+r.questExpansion.duplicateFiles.length+r.questExpansion.missingFiles.length+r.questExpansion.missingMappings.length+Object.values(r.roleFamilies.comparison).flat().length+r.stems.reduce((n,s)=>n+Object.values(s.comparison).flat().length+Object.values(s.fileFamily).flat().length+s.missingMappings.length,0)+r.aliases.filter(a=>!a.prototypeExists||!a.fieldExists).length+r.duplicateAliasSources.length+r.duplicateAliasDestinations.length;}
function controls(){const passed=[];const check=(name,fn)=>{fn();passed.push(name);};
    check('positive: all supplemental declarations consistent',()=>assert.equal(hasIssues(result),0));
    check('positive: comments do not affect role field extraction',()=>assert.deepEqual(roleCodes(roleSource.replace('"Arc",','/* control */ "Arc",')),cCodes));
    check('detect mismatched role filecode',()=>assert(comparison(cCodes,[...jsCodes.slice(1),'Bad']).missing.includes('Arc')));
    check('detect duplicate role filecode',()=>assert(expansion([...cCodes,cCodes[0]],placeholders,old.luaFiles,old.mappings.map(m=>m.name)).duplicateCodes.length));
    check('detect missing quest file',()=>assert.equal(expansion(cCodes,placeholders,old.luaFiles.filter(f=>f!=='Arc-strt.lua'),old.mappings.map(m=>m.name)).missingFiles.length,1));
    check('detect missing quest mapping',()=>assert.equal(expansion(cCodes,placeholders,old.luaFiles,old.mappings.map(m=>m.name).filter(n=>n!=='Arc-goal')).missingMappings.length,1));
    check('detect duplicate placeholder expansion',()=>assert(expansion(cCodes,[...placeholders,placeholders[0]],old.luaFiles,old.mappings.map(m=>m.name)).duplicateFiles.length));
    check('detect orphan role family file',()=>assert(comparison(familyExpected,[...roleFiles,'Bad-strt.lua']).extra.includes('Bad-strt.lua')));
    check('detect missing filler file',()=>assert.deepEqual(comparison(familyExpected,roleFiles.filter(f=>f!=='Wiz-filb.lua')).missing,['Wiz-filb.lua']));
    const tower=data.find(d=>d.protofile);
    check('detect changed stem',()=>assert(stemCoverage({...tower,protofile:'wrong'},old.luaFiles,old.mappings.map(m=>m.name)).comparison.missing.length));
    check('detect changed declared stem count',()=>assert(stemCoverage({...tower,base:tower.base+1},old.luaFiles,old.mappings.map(m=>m.name)).comparison.missing.length));
    check('detect duplicate stem level',()=>assert(stemCoverage({...tower,levels:[...tower.levels,tower.levels[0]]},old.luaFiles,old.mappings.map(m=>m.name)).comparison.duplicates.length));
    check('detect extra stem file',()=>assert(stemCoverage(tower,[...old.luaFiles,'tower4.lua'],old.mappings.map(m=>m.name)).fileFamily.extra.length));
    check('detect dangling alias prototype',()=>{const rows=aliasRows([['unknown',levelMap[0][1]],...levelMap.slice(1)],hack,prototypes,topologyFields);assert.equal(rows.filter(r=>!r.prototypeExists).length,1);});
    check('detect dangling alias topology field',()=>{const rows=aliasRows(levelMap,hack,prototypes,topologyFields.filter(f=>f!=='d_air_level'));assert.equal(rows.filter(r=>!r.fieldExists).length,1);});
    check('detect duplicate alias destinations',()=>{const rows=aliasRows([levelMap[0],...levelMap],hack,prototypes,topologyFields);assert.deepEqual(duplicates(rows.map(r=>r.destination)),['air_level']);});
    check('reject missing alias macro',()=>assert.throws(()=>aliasRows(levelMap,hack.replace('#define air_level ', '#define missing_alias '),prototypes,topologyFields)));
    return {passed:passed.length,controls:passed};}
if(process.argv[2]==='--controls')console.log(JSON.stringify(controls(),null,2));else{assert.equal(process.argv.length,2);console.log(JSON.stringify(result,null,2));if(hasIssues(result))process.exitCode=1;}
