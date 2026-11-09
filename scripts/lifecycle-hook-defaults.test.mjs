// Enforces the default-at-source rule for object lifecycle hooks. C calls
// timeout.c obj_stop_timers() and light.c del_light_source() directly from
// mkobj.c dealloc_obj(), shk.c obfree() and invent.c merged(), so js/obj.js
// and js/invent.js call them unless a test supplies the hook. Game code must
// neither supply those hooks (a copy of the default that a new caller can
// forget) nor refuse when one is absent.
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
const DEFAULTED_HOOKS = ['stopObjectTimers', 'deleteObjectLightSource'];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

// Each place `source` supplies or requires one of `names`: an object key
// (`name:`), a method shorthand (`name(...) {`), an assignment
// (`.name =`, `.name ??=`), or a requiredHook(env, 'name') refusal.
export function hookSupplyFindings(source, names = DEFAULTED_HOOKS) {
    const code = stripComments(source);
    const findings = [];
    for (const name of names) {
        const patterns = [
            new RegExp(`(?<![\\w.$])${name}\\s*:`, 'gu'),
            new RegExp(`(?<!function\\s+)(?<![\\w.$])${name}\\s*\\([^()]*\\)\\s*\\{`, 'gu'),
            new RegExp(`\\.${name}\\s*(?:\\?\\?|\\|\\||&&)?=(?!=)`, 'gu'),
            new RegExp(`requiredHook\\(\\s*[^,()]+,\\s*'${name}'`, 'gu'),
        ];
        for (const pattern of patterns) {
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
});

// Hooks js/obj.js, js/invent.js and js/worn.js still refuse to run without,
// with the number of requiredHook() sites naming each. Each stands in for a C
// call to the named function.
const REMAINING_REQUIRED_HOOKS = {
    absorbGlob: 2, // mkobj.c obj_absorb() from invent.c merged()
    blockPoint: 1, // vision.c block_point() for a placed boulder
    encumberMessage: 1, // pickup.c encumber_msg()
    endArtifactLight: 1, // light.c/artifact.c end of an artifact's light
    inventoryComparisonDiscovered: 3, // invent.c merged()'s comparison pline()
    mergeWornMasks: 2, // invent.c merged()'s setworn() of a worn stack
    monsterObject: 1, // mkobj.c mksobj_init() statue and figurine branches
    mwepgone: 1, // weapon.c mwepgone()
    objectNoLongerHeld: 2, // mkobj.c obj_no_longer_held()
    recalcBlockPoint: 1, // vision.c recalc_block_point() for a lifted boulder
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
