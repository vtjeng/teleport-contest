// Enforces the default-at-source rule for object lifecycle hooks. C calls
// timeout.c obj_stop_timers() and light.c del_light_source() directly from
// mkobj.c dealloc_obj(), shk.c obfree() and invent.c merged(); mkobj.c
// mksobj_init() and mksobj() initialize statues and figurines;
// add_to_container() calls obj_no_longer_held(); and place_object() calls
// vision.c block_point() for a boulder. js/obj.js and js/invent.js make
// those calls unless a test supplies the hook. Game code must neither supply
// those hooks (a copy of the default that a new caller can forget) nor
// refuse when one is absent.
//
// The last test pins every hook that js/ still refuses to run without, with
// its count. Lower a count when a hook gets its C default; adding one needs a
// reason here.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// Hooks whose C default runs at its source.
const DEFAULTED_HOOKS = [
    'stopObjectTimers',
    'deleteObjectLightSource',
    'monsterObject',
    'objectNoLongerHeld',
    'mergeWornMasks',
];

// Defaulted hooks whose name is also a flat operation of another owner:
// region.js create_gas_cloud() takes its own `blockPoint` beside `canSee` and
// `newsym`. For these the scan counts only keys in a hook table: an object
// literal that is the value of a `hooks` key or of a variable named
// `...hooks`/`...Hooks`, or that a `...Hooks()` function returns.
const DEFAULTED_TABLE_HOOKS = ['blockPoint'];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

// Whether the object literal enclosing `index` in comment-free `code` is a
// hook table (see DEFAULTED_TABLE_HOOKS).
function inHookTable(code, index) {
    let depth = 0;
    for (let i = index - 1; i >= 0; i--) {
        const ch = code[i];
        if (ch === '}' || ch === ')' || ch === ']') depth++;
        else if (ch === '(' || ch === '[') depth--;
        else if (ch === '{') {
            if (depth === 0) {
                const before = code.slice(Math.max(0, i - 200), i);
                return /(?:\b\w*[hH]ooks\s*(?::|\?\?=|=)|function\s+\w*Hooks\s*\([^)]*\)\s*\{\s*return)\s*$/u
                    .test(before);
            }
            depth--;
        }
        if (depth < 0) return false;
    }
    return false;
}

// Each place `source` supplies or requires one of `names`: an object key
// (`name:`), a method shorthand (`name(...) {`), an assignment
// (`.name =`, `.name ??=`), or a requiredHook(env, 'name') refusal.
export function hookSupplyFindings(
    source,
    names = DEFAULTED_HOOKS,
    tableNames = DEFAULTED_TABLE_HOOKS,
) {
    const code = stripComments(source);
    const findings = [];
    for (const name of [...names, ...tableNames]) {
        const tableOnly = tableNames.includes(name);
        const keyPatterns = [
            new RegExp(`(?<![\\w.$])${name}\\s*:`, 'gu'),
            new RegExp(`(?<!function\\s+)(?<![\\w.$])${name}\\s*\\([^()]*\\)\\s*\\{`, 'gu'),
        ];
        const otherPatterns = [
            new RegExp(`${tableOnly ? '[hH]ooks\\??' : ''}\\.${name}\\s*(?:\\?\\?|\\|\\||&&)?=(?!=)`, 'gu'),
            new RegExp(`requiredHook\\(\\s*[^,()]+,\\s*'${name}'`, 'gu'),
        ];
        for (const pattern of keyPatterns) {
            for (const match of code.matchAll(pattern)) {
                if (tableOnly && !inHookTable(code, match.index)) continue;
                findings.push({ name, line: lineOf(code, match.index) });
            }
        }
        // A shorthand property (`{ monsterObject, ... }`) supplies the hook
        // only in a hook table; elsewhere the same text is an argument or an
        // import.
        const shorthand = new RegExp(`(?<![\\w.$])${name}(?=\\s*[,}])`, 'gu');
        for (const match of code.matchAll(shorthand)) {
            if (inHookTable(code, match.index))
                findings.push({ name, line: lineOf(code, match.index) });
        }
        for (const pattern of otherPatterns) {
            for (const match of code.matchAll(pattern))
                findings.push({ name, line: lineOf(code, match.index) });
        }
    }
    return findings.sort((a, b) => a.line - b.line);
}

function jsSources() {
    return readdirSync(JS_DIR)
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => [file, readFileSync(join(JS_DIR, file), 'utf8')]);
}

test('no game code supplies or requires a hook whose C default runs at source', () => {
    const findings = [];
    for (const [file, source] of jsSources()) {
        for (const finding of hookSupplyFindings(source))
            findings.push(`${file}:${finding.line} ${finding.name}`);
    }
    assert.deepEqual(findings, []);
});

test('the scan finds keys, methods, assignments and refusals', () => {
    const source = [
        'const env = { hooks: { stopObjectTimers: (o, e) => f(o, e) } };', // 1
        'const hooks = {',
        '    stopObjectTimers(obj) { obj.timed = 0; },', // 3
        '};',
        'hooks.deleteObjectLightSource ??= drop;', // 5
        "requiredHook(env, 'stopObjectTimers', obj);", // 6
        'env.hooks.stopObjectTimers = stop;', // 7
    ].join('\n');
    assert.deepEqual(
        hookSupplyFindings(source).map(({ line }) => line),
        [1, 3, 5, 6, 7],
    );
});

test('the scan finds a table-only hook in hook tables alone', () => {
    const source = [
        'place_object(o, x, y, { state, hooks: { blockPoint: f } });', // 1
        'const objectHooks = {',
        '    ...env.hooks,',
        '    blockPoint: (x, y, e) => block_point(x, y, e.state),', // 4
        '};',
        'export function objectGenerationHooks(overrides = {}) {',
        '    return { artifactCount, blockPoint: f };', // 7
        '}',
        'env.hooks.blockPoint = f;', // 9
        "requiredHook(env, 'blockPoint', obj);", // 10
        'create_gas_cloud(x, y, 1, 4, { state, blockPoint: f });',
        'const regionEnv = { blockPoint: (x, y) => block_point(x, y, s) };',
        'env.blockPoint = f;',
        'const hooks = { inner: g({ blockPoint: f }) };',
        'const hooks = { monsterObject, blockPoint };', // 15
        "import { monsterObject } from './monster_object.js';",
        'f(obj, monsterObject, { monsterObject: 1 }.monsterObject);', // 17
    ].join('\n');
    assert.deepEqual(
        hookSupplyFindings(source).map(({ line }) => line),
        [1, 4, 7, 9, 10, 15, 15, 17],
    );
});

test('the scan accepts reads, calls, definitions and comments', () => {
    const source = [
        'function stopObjectTimers(obj, env) {',
        '    const hook = env.hooks?.stopObjectTimers;',
        "    if (typeof hook === 'function') hook(obj, env);",
        '    if (hook === env.hooks.deleteObjectLightSource) return;',
        '}',
        'if (obj.timed) stopObjectTimers(obj, env);',
        '// stopObjectTimers: an old hook name in a comment',
        '/* deleteObjectLightSource: likewise */',
    ].join('\n');
    assert.deepEqual(hookSupplyFindings(source), []);
});

test('every defaulted hook is still read where C calls its default', () => {
    // A renamed hook would otherwise drop out of the scan silently.
    const sources = Object.fromEntries(jsSources());
    assert.match(sources['obj.js'], /normalized\.hooks\.stopObjectTimers/u);
    assert.match(sources['obj.js'], /obj_stop_timers\(obj, normalized\.state, normalized\)/u);
    assert.match(sources['invent.js'], /env\.hooks\?\.stopObjectTimers/u);
    assert.match(sources['obj.js'], /normalized\.hooks\.deleteObjectLightSource/u);
    assert.match(sources['obj.js'], /del_light_source\(LS_OBJECT, obj, normalized\.state\)/u);
    assert.match(sources['obj.js'], /env\.hooks\.monsterObject \?\? monsterObject/u);
    assert.match(sources['invent.js'], /env\.hooks\?\.objectNoLongerHeld/u);
    assert.match(sources['invent.js'], /: obj_no_longer_held\(obj, env\)/u);
    assert.match(sources['obj.js'], /normalized\.hooks\.blockPoint\s*\?\?/u);
    assert.match(sources['obj.js'], /block_point\(bx, by, placeEnv\.state\)/u);
});

// Hooks js/obj.js, js/invent.js and js/worn.js still refuse to run without,
// with the number of requiredHook() sites naming each. Each stands in for a C
// call to the named function.
const REMAINING_REQUIRED_HOOKS = {
    absorbGlob: 2, // mkobj.c obj_absorb() from invent.c merged()
    encumberMessage: 1, // pickup.c encumber_msg()
    endArtifactLight: 1, // light.c/artifact.c end of an artifact's light
    inventoryComparisonDiscovered: 2, // the synchronous merged()'s comparison pline()
    mwepgone: 1, // weapon.c mwepgone()
    // vision.c recalc_block_point() for a lifted boulder. Not defaulted yet:
    // explode.js scatter() substitutes a no-op only when its caller's hooks
    // lack this one, and callers that reach scatter() with a boulder supply
    // it, so a default would change what those calls do.
    recalcBlockPoint: 1,
    resetPick: 2, // lock.c reset_pick() from shk.c obfree()
};

test('the remaining required hooks are pinned', () => {
    const counts = {};
    for (const [, source] of jsSources()) {
        const code = stripComments(source);
        for (const match of code.matchAll(/requiredHook\(\s*[^,()]+,\s*'(\w+)'/gu))
            counts[match[1]] = (counts[match[1]] ?? 0) + 1;
    }
    assert.deepEqual(
        Object.fromEntries(Object.entries(counts).sort()),
        REMAINING_REQUIRED_HOOKS,
    );
});
