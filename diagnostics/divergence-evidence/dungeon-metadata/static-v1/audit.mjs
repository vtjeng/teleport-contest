// Static declarations only. No gameplay imports, Lua evaluation, or level execution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const base = 'de3380e285e5f4abf40375459f9490f92569e7dc';
const cSha = '16ff59115315917b93185d026aeefea06db9b0f4';
const cRoot = 'nethack-c/upstream';
const inputs = new Map();
function git(root, ...args) {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 8e6 });
}
function source(path) {
    const upstream = path.startsWith(cRoot + '/');
    const text = git(upstream ? cRoot : '.', 'show', `${upstream ? cSha : base}:${upstream ? path.slice(cRoot.length + 1) : path}`);
    // Bind receipts to the actual checkout bytes as well as the immutable Git blobs.
    assert.equal(readFileSync(path, 'utf8'), text, `checkout differs: ${path}`);
    inputs.set(path, createHash('sha256').update(text).digest('hex'));
    return text;
}
function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (node.type) visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walk(child, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
}
function ast(text) { return parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
function declaration(tree, name) {
    const matches = [];
    walk(tree, node => { if (node.type === 'VariableDeclarator' && node.id.name === name) matches.push(node.init); });
    assert.equal(matches.length, 1, `unique declaration ${name}`);
    return matches[0];
}
function key(prop) {
    assert.equal(prop.type, 'Property'); assert.equal(prop.computed, false);
    return prop.key.name ?? prop.key.value;
}
function literal(node, constants = {}) {
    if (node.type === 'Literal') return node.value;
    if (node.type === 'UnaryExpression' && node.operator === '-') return -literal(node.argument, constants);
    if (node.type === 'Identifier' && Object.hasOwn(constants, node.name)) return constants[node.name];
    if (node.type === 'ArrayExpression') return node.elements.map(value => literal(value, constants));
    if (node.type === 'ObjectExpression') {
        const result = {};
        for (const prop of node.properties) {
            const name = key(prop); assert(!Object.hasOwn(result, name), `duplicate JS key ${name}`);
            result[name] = literal(prop.value, constants);
        }
        return result;
    }
    throw new Error(`nonliteral metadata: ${node.type}`);
}
// Independent, deliberately small grammar for this pinned data table. Rejects code.
function luaTable(text) {
    const tokens = [];
    const re = /\s+|--[^\n]*|"(?:[^"\\]|\\.)*"|-?\d+|[A-Za-z_][A-Za-z_0-9]*|[{},=]/y;
    let pos = 0;
    while (pos < text.length) {
        re.lastIndex = pos; const match = re.exec(text);
        assert(match, `unsupported Lua declaration at ${pos}`);
        pos = re.lastIndex;
        if (!/^\s|^--/.test(match[0])) tokens.push(match[0]);
    }
    let i = 0;
    function take(expected) { assert.equal(tokens[i++], expected); }
    function value() {
        const token = tokens[i++];
        if (token?.startsWith('"')) return JSON.parse(token);
        if (/^-?\d+$/.test(token)) return Number(token);
        assert.equal(token, '{');
        const rows = [], object = {}; let keyed = null;
        while (tokens[i] !== '}') {
            assert(i < tokens.length, 'unclosed table');
            const isKeyed = tokens[i + 1] === '=';
            if (keyed !== null) assert.equal(keyed, isKeyed, 'mixed table');
            keyed = isKeyed;
            if (keyed) {
                const name = tokens[i++]; take('=');
                assert(!Object.hasOwn(object, name), `duplicate Lua key ${name}`);
                object[name] = value();
            } else rows.push(value());
            if (tokens[i] === ',') i++;
            else assert.equal(tokens[i], '}');
        }
        take('}'); return keyed ? object : rows;
    }
    take('dungeon'); take('='); const result = value(); assert.equal(i, tokens.length);
    return result;
}
function duplicates(values) { return [...new Set(values.filter((value, i) => values.indexOf(value) !== i))]; }
function differences(a, b, path = '$') {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => differences(a[k], b[k], `${path}.${k}`));
    }
    return [{ path, reference: a ?? null, translated: b ?? null }];
}
function references(data) {
    const problems = [], names = data.map(d => d.name);
    for (const name of duplicates(names)) problems.push(`duplicate dungeon ${name}`);
    for (const d of data) {
        const levels = (d.levels ?? []).map(l => l.name);
        for (const name of duplicates(levels)) problems.push(`duplicate level ${d.name}/${name}`);
        for (const name of duplicates((d.branches ?? []).map(b => b.name))) problems.push(`duplicate branch ${d.name}/${name}`);
        for (const item of [...(d.levels ?? []), ...(d.branches ?? [])]) {
            if (item.chainlevel && !levels.includes(item.chainlevel)) problems.push(`dangling chain ${d.name}/${item.chainlevel}`);
        }
        for (const b of d.branches ?? []) if (!names.includes(b.name)) problems.push(`dangling branch ${b.name}`);
    }
    return problems;
}
function glob(pattern, names) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return names.filter(name => re.test(name));
}
function fileDiff(expected, actual) {
    return { missing: expected.filter(x => !actual.includes(x)), extra: actual.filter(x => !expected.includes(x)), duplicates: duplicates(actual) };
}
function registry(tree, name) {
    let node = declaration(tree, name);
    if (node.type === 'CallExpression') {
        assert.equal(node.callee.object?.name, 'Object'); assert.equal(node.callee.property?.name, 'freeze');
        assert.equal(node.arguments.length, 1); node = node.arguments[0];
    }
    assert.equal(node.type, 'ObjectExpression');
    return node.properties.map(prop => {
        assert.equal(prop.value.type, 'Identifier', 'registry values must be bare references');
        return { name: key(prop), symbol: prop.value.name, line: prop.loc.start.line };
    });
}
const raw = source(`${cRoot}/dat/dungeon.lua`);
const reference = luaTable(raw);
const translated = literal(declaration(ast(source('js/dungeon_data.js')), 'DUNGEON_DATA'));
const luaFiles = git(cRoot, 'ls-tree', '--name-only', cSha + ':dat').trim().split('\n').filter(f => f.endsWith('.lua')).sort();
const makefile = source(`${cRoot}/sys/unix/Makefile.top`).replace(/\\\n/g, ' ');
const manifests = Object.fromEntries(['SPEC_LEVS', 'QUEST_LEVS'].map(name => {
    const match = makefile.match(new RegExp('^' + name + ' = (.+)$', 'm')); assert(match);
    return [name, match[1].trim().split(/\s+/)];
}));
const patterns = Object.values(manifests).flat();
const packaged = patterns.flatMap(pattern => glob(pattern, luaFiles)).sort();
const libraries = ['nhcore.lua', 'nhlib.lua', 'themerms.lua'];
const authored = packaged.filter(name => !libraries.includes(name));
const loaderSource = source('js/mklev.js');
const loaderAst = ast(loaderSource);
let aggregate;
walk(loaderAst, node => {
    if (node.type === 'AssignmentExpression' && node.left.name === 'SPECIAL_LEVEL_LOADERS' && node.right.type === 'ObjectExpression') {
        assert(!aggregate); aggregate = node.right;
    }
});
assert(aggregate);
const modules = [], mappings = [];
for (const spread of aggregate.properties) {
    assert.equal(spread.type, 'SpreadElement'); const name = spread.argument.name;
    const matches = [...loaderSource.matchAll(/const \{ ([A-Z0-9_]+) \} = await import\('(.+?)'\);/g)].filter(m => m[1] === name);
    assert.equal(matches.length, 1);
    const path = 'js/' + matches[0][2].replace(/^\.\//, '');
    const tree = ast(source(path));
    const rows = registry(tree, name);
    const bindings = new Set();
    for (let node of tree.body) {
        if (node.type === 'ExportNamedDeclaration') node = node.declaration;
        if (!node) continue;
        if (node.type === 'FunctionDeclaration') bindings.add(node.id.name);
        if (node.type === 'VariableDeclaration') node.declarations.forEach(d => bindings.add(d.id.name));
        if (node.type === 'ImportDeclaration') node.specifiers.forEach(s => bindings.add(s.local.name));
    }
    for (const row of rows) assert(bindings.has(row.symbol), `dangling registry identifier ${path}:${row.symbol}`);
    modules.push({ path, name, count: rows.length });
    mappings.push(...rows.map(row => ({ ...row, path, registry: name })));
}
const registryNames = mappings.map(m => m.name + '.lua');
// A documented direct startup import is an explicit exception to registry coverage.
const startupAst = ast(source('js/tutorial_startup.js'));
const tutorialImport = startupAst.body.find(n => n.type === 'ImportDeclaration' && n.source.value === './tutorial_level.js');
assert(tutorialImport?.specifiers.some(s => s.imported?.name === 'loadTutorialLevel'));
assert(ast(source('js/tutorial_level.js')).body.some(n => n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration' && n.declaration.id.name === 'loadTutorialLevel'));
const directExceptions = [{ file: 'tut-1.lua', path: 'js/tutorial_level.js', symbol: 'loadTutorialLevel', importPath: 'js/tutorial_startup.js', importLine: tutorialImport.loc.start.line, evidence: 'js/tutorial_level.js documents the direct-startup exception beside TUTORIAL_LEVEL_LOADERS; runtime reachability untested.' }];
const coveredFiles = [...registryNames, ...directExceptions.map(row => row.file)];
function missingAssets(rows, files) { return rows.filter(row => !files.includes(row.file)); }

const metadataFiles = [];
const unresolvedAssetForms = [];
for (const d of reference) {
    for (const field of ['themerooms', 'lvlfill']) if (d[field]) metadataFiles.push({ dungeon: d.name, field, file: d[field].endsWith('.lua') ? d[field] : `${d[field]}.lua` });
    if (d.protofile) unresolvedAssetForms.push({ dungeon: d.name, field: 'protofile', value: d.protofile, reason: 'Stem, not a literal filename; matching tower1/2/3 declarations are checked separately.' });
    for (const l of d.levels) {
        if (l.name.startsWith('x-') || ['rogue', 'dummy'].includes(l.name)) {
            unresolvedAssetForms.push({ dungeon: d.name, field: 'levels.name', value: l.name, reason: l.name.startsWith('x-') ? 'Quest placeholder; role families inventoried from Makefile QUEST_LEVS, no runtime role substitution asserted.' : 'No authored Lua file or loader key; marker declaration only. Runtime handling is outside scope.' });
        } else {
            const names = l.nlevels ? Array.from({ length: l.nlevels }, (_, i) => `${l.name}-${i + 1}.lua`) : [`${l.name}.lua`];
            metadataFiles.push(...names.map(file => ({ dungeon: d.name, field: 'levels.name/nlevels', file })));
        }
    }
}
const dungeonJs = ast(source('js/dungeon.js'));
const dungeonC = source(`${cRoot}/src/dungeon.c`);
const constants = {};
for (const header of ['dungeon.h', 'dgn_file.h', 'global.h', 'align.h']) {
    const text = source(`${cRoot}/include/${header}`);
    for (const [, name, number] of text.matchAll(/^#define\s+(\w+)\s+(0x[\da-fA-F]+|\d+)\b/gm)) constants[name] = Number(number);
}
for (const [name, am] of [['D_ALIGN_CHAOTIC', 'AM_CHAOTIC'], ['D_ALIGN_NEUTRAL', 'AM_NEUTRAL'], ['D_ALIGN_LAWFUL', 'AM_LAWFUL']]) {
    const header = source(`${cRoot}/include/dgn_file.h`);
    assert(header.includes(`#define ${name} (${am} << 4)`)); constants[name] = constants[am] << 4;
}
const scalarNames = ['BR_STAIR','BR_NO_END1','BR_NO_END2','BR_PORTAL','TBR_STAIR','TBR_NO_UP','TBR_NO_DOWN','TBR_PORTAL','TOWN','HELLISH','MAZELIKE','ROGUELIKE','UNCONNECTED','D_ALIGN_CHAOTIC','D_ALIGN_NEUTRAL','D_ALIGN_LAWFUL','D_ALIGN_MASK','MAXDUNGEON','MAXLEVEL','LEV_LIMIT','BRANCH_LIMIT'];
const scalarComparisons = scalarNames.map(name => ({ name, reference: constants[name], translated: literal(declaration(dungeonJs, name)) }));
const jsConstants = Object.fromEntries(scalarComparisons.map(row => [row.name, row.translated]));
function cArray(name) {
    const match = dungeonC.match(new RegExp('\\b' + name + '\\[\\] = \\{([^}]+)\\}')); assert(match);
    return match[1].split(',').map(x => x.trim()).filter(Boolean);
}
const vocabulary = [['FLAG_VALUES','flagstrs','flagstrs2i'],['ALIGN_VALUES','dgnaligns','dgnaligns2i'],['BRANCH_TYPE_VALUES','brtypes','brtypes2i']].map(([js, names, values]) => {
    const keys = cArray(names).slice(0, -1).map(x => JSON.parse(x));
    const vals = cArray(values).slice(0, -1).map(x => constants[x]);
    assert(vals.every(x => Number.isInteger(x)));
    return { name: js, differences: differences(Object.fromEntries(keys.map((key, i) => [key, vals[i]])), literal(declaration(dungeonJs, js), jsConstants)) };
});
const levelMapText = dungeonC.match(/\} level_map\[\] = \{([\s\S]+?)\n\};/)[1];
const xNames = Object.fromEntries([...dungeonC.matchAll(/^#define (X_\w+) "([^"]+)"/gm)].map(m => [m[1],m[2]]));
const cLevelMap = [...levelMapText.matchAll(/\{\s*("[^"]+"|X_\w+),\s*&([\w]+)\s*\}/g)].map(m => [m[1].startsWith('"') ? JSON.parse(m[1]) : xNames[m[1]], m[2]]);
const jsLevelMap = literal(declaration(dungeonJs, 'LEVEL_MAP'));
const fields = kind => [...new Set(reference.flatMap(d => kind === 'dungeon' ? Object.keys(d) : (d[kind] ?? []).flatMap(Object.keys)))].sort();
const report = {
    schemaVersion: 1, provenance: { jsSha: base, cGitlink: cSha },
    counts: { dungeons: reference.length, levels: reference.flatMap(d => d.levels).length, branches: reference.flatMap(d => d.branches ?? []).length, luaFiles: luaFiles.length, authoredFiles: authored.length, registryEntries: mappings.length, registryModules: modules.length },
    fields: { dungeon: fields('dungeon'), levels: fields('levels'), branches: fields('branches') },
    metadataDifferences: differences(reference, translated), referenceProblems: references(reference), translatedProblems: references(translated),
    scalarComparisons, vocabulary, levelMapDifferences: differences(cLevelMap, jsLevelMap), levelMapEntries: cLevelMap.length,
    manifest: { patterns: manifests, unmatchedPatterns: patterns.filter(p => !glob(p, luaFiles).length), duplicateFiles: duplicates(packaged), nonLevelLibraries: libraries, outsideLevelManifest: luaFiles.filter(f => !packaged.includes(f)) },
    fileCoverage: fileDiff(authored, registryNames), effectiveFileCoverage: fileDiff(authored, coveredFiles), directExceptions, modules, mappings, luaFiles,
    metadataFiles, danglingMetadataFiles: missingAssets(metadataFiles, luaFiles), unresolvedAssetForms,
    sourceHashes: Object.fromEntries(inputs),
};
function controls() {
    const passed = [];
    const check = (name, fn) => { fn(); passed.push(name); };
    check('positive: independent parsers agree', () => assert.deepEqual(reference, translated));
    check('positive: field order and comments do not change Lua data', () => assert.deepEqual(luaTable('dungeon = { { -- comment\n range = 3, name = "sample", base = -2, }, }'), [{ range: 3, name: 'sample', base: -2 }]));
    check('reject duplicate Lua field', () => assert.throws(() => luaTable('dungeon = {{name="a",name="b"}}')));
    check('reject executable Lua', () => assert.throws(() => luaTable('dungeon = run()')));
    check('reject executable JS metadata', () => assert.throws(() => literal(declaration(ast('const X = f();'), 'X'))));
    check('reject duplicate JS field', () => assert.throws(() => literal(declaration(ast('const X = {base:1,base:2};'), 'X'))));
    for (const [name, mutate] of [
        ['depth', d => d[0].base++], ['range', d => d[0].range++], ['variant count', d => d[0].levels[2].nlevels++],
        ['flags', d => d[1].flags.push('changed')], ['branch direction', d => d[0].branches[1].direction='down'],
        ['missing optional field', d => delete d[0].levels[2].chance], ['extra field', d => d[0].unexpected=1],
        ['removed dungeon', d => d.pop()], ['reordered dungeons', d => d.reverse()],
    ]) check(`detect metadata ${name}`, () => { const d = structuredClone(translated); mutate(d); assert(differences(reference,d).length); });
    for (const [name, mutate] of [
        ['duplicate dungeon', d => d.push(structuredClone(d[0]))], ['duplicate level', d => d[0].levels.push(structuredClone(d[0].levels[0]))],
        ['duplicate branch', d => d[0].branches.push(structuredClone(d[0].branches[0]))],
        ['dangling branch', d => d[0].branches[0].name='missing'], ['dangling chain', d => d[0].levels[0].chainlevel='missing'],
    ]) check(`detect ${name}`, () => { const d = structuredClone(translated); mutate(d); assert(references(d).some(p => p.startsWith(name.split(' ').slice(0,2).join(' ')))); });
    check('positive: documented file coverage is complete', () => assert.deepEqual(fileDiff(authored,coveredFiles), {missing:[],extra:[],duplicates:[]}));
    check('detect missing loader', () => assert.deepEqual(fileDiff(authored,coveredFiles.filter(f => f !== 'oracle.lua')).missing, ['oracle.lua']));
    check('detect extra loader', () => assert.deepEqual(fileDiff(authored,[...registryNames,'missing.lua']).extra,['missing.lua']));
    check('detect duplicate loader', () => assert(fileDiff(authored,[...registryNames,registryNames[0]]).duplicates.length));
    check('detect dangling metadata asset', () => { const rows=structuredClone(metadataFiles); rows[0].file='missing-theme.lua'; assert.deepEqual(missingAssets(rows,luaFiles),[rows[0]]); });
    check('detect changed numeric constant', () => assert(differences({TOWN:constants.TOWN},{TOWN:constants.TOWN+1}).length));
    check('detect changed vocabulary', () => assert(differences({town:1},{town:2}).length));
    check('detect changed level map', () => { const d=structuredClone(jsLevelMap);d[0][1]='wrong';assert(differences(cLevelMap,d).length); });
    return { passed: passed.length, controls: passed };
}
if (process.argv[2] === '--controls') console.log(JSON.stringify(controls(),null,2));
else {
    assert.equal(process.argv.length, 2, 'usage: node audit.mjs [--controls]');
    console.log(JSON.stringify(report,null,2));
    const failures = [...report.metadataDifferences,...report.referenceProblems,...report.translatedProblems,...report.effectiveFileCoverage.missing,...report.effectiveFileCoverage.extra,...report.effectiveFileCoverage.duplicates,...report.danglingMetadataFiles,...report.levelMapDifferences,...vocabulary.flatMap(v=>v.differences),...scalarComparisons.filter(r=>r.reference!==r.translated),...report.manifest.unmatchedPatterns,...report.manifest.duplicateFiles];
    if (failures.length) process.exitCode = 1;
}
