// C's getlev() (restore.c 1046-1311) rebuilds most of a level's lists with
// readers that link each record onto the front of the live list, so the
// restored list is the reverse of the saved one: the trap loop,
// rest_stairs(), restore_light_sources(), rest_engravings(), restdamage()
// and load_exclusions(). restore_timers() instead reinserts each timer in
// expiry order, ties first. The port has three restore paths that stand for
// getlev(): js/restore.js getlev() for a level the hero returns to,
// dorestore() for the hero's level in a whole-game restore, and js/bones.js
// restoreBonesLevel(). Each path once kept some list in its saved order
// because it took the saved list as it was instead of calling the reader.
//
// This test fails when a reader stops going through rest_push_each(), the
// one definition of that push order, when a restore path does not call a
// reader, or when a restore path sets one of these lists itself. A whole-game
// restore's other levels (restore.js rest_other_levels()) are read twice,
// once by dosave0()'s getlev() and once by dorecover()'s, so their order is
// unchanged and they need no reader.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Each pushing reader, the file that ports it, and the list it rebuilds.
export const PUSHING_READERS = [
    { name: 'rest_traps', file: 'restore.js', list: 'traps' },
    { name: 'rest_stairs', file: 'restore.js', list: 'stairs' },
    { name: 'restore_light_sources', file: 'light.js', list: 'light_base' },
    { name: 'rest_engravings', file: 'engrave.js', list: 'head_engr' },
    { name: 'restdamage', file: 'restore.js', list: 'damagelist' },
    { name: 'load_exclusions', file: 'dungeon.js', list: 'exclusion_zones' },
];
export const TIMER_READER = { name: 'restore_timers', file: 'timeout.js', list: 'timer_base' };
export const RESTORE_PATHS = [
    { name: 'getlev', file: 'restore.js' },
    { name: 'dorestore', file: 'restore.js' },
    { name: 'restoreBonesLevel', file: 'bones.js' },
];

function skipString(source, start) {
    const quote = source[start];
    for (let i = start + 1; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === quote) return i;
    }
    throw new Error(`unterminated string at offset ${start}`);
}

// The body of the function declared as `name`, from its opening brace to its
// closing brace, with comments removed. Strings and template literals are
// skipped whole when matching braces; regular expression literals with an
// unbalanced brace are not handled, and the restore code has none.
export function functionBody(source, name) {
    const declaration = new RegExp(`function\\s+${name}\\s*\\(`, 'u').exec(source);
    if (!declaration) return null;
    let i = declaration.index + declaration[0].length;
    let parens = 1;
    for (; parens > 0; i++) {
        if (source[i] === '(') parens++;
        else if (source[i] === ')') parens--;
    }
    const open = source.indexOf('{', i);
    let depth = 0;
    let body = '';
    for (let j = open; j < source.length; j++) {
        const ch = source[j];
        if (ch === '/' && source[j + 1] === '/') {
            j = source.indexOf('\n', j) - 1;
            continue;
        }
        if (ch === '/' && source[j + 1] === '*') {
            j = source.indexOf('*/', j) + 1;
            continue;
        }
        if (ch === '\'' || ch === '"' || ch === '`') {
            const end = skipString(source, j);
            body += source.slice(j, end + 1);
            j = end;
            continue;
        }
        body += ch;
        if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return body;
    }
    throw new Error(`unterminated function ${name}`);
}

const calls = (body, name) => new RegExp(`(?<![\\w.$])${name}\\(`, 'u').test(body);

// Problems found in `sources`, a map from a js/ file name to its text.
export function readerFindings(sources) {
    const findings = [];
    const bodyOf = ({ name, file }) => {
        const body = functionBody(sources[file] ?? '', name);
        if (body === null) findings.push(`${file}: no function ${name}`);
        return body;
    };
    for (const reader of PUSHING_READERS) {
        const body = bodyOf(reader);
        if (body !== null && !calls(body, 'rest_push_each'))
            findings.push(`${reader.file} ${reader.name}: does not call rest_push_each()`);
    }
    for (const path of RESTORE_PATHS) {
        const body = bodyOf(path);
        if (body === null) continue;
        for (const reader of [...PUSHING_READERS, TIMER_READER]) {
            if (!calls(body, reader.name))
                findings.push(`${path.file} ${path.name}: does not call ${reader.name}()`);
            // Emptying a list before its reader runs is how C's readers start;
            // any other value bypasses the reader.
            const assignment = new RegExp(
                `\\.${reader.list}\\s*=(?!=)(?!\\s*null\\b)`, 'u');
            if (assignment.test(body))
                findings.push(`${path.file} ${path.name}: sets ${reader.list} itself`);
        }
    }
    return findings;
}

function repositorySources() {
    const files = new Set([...PUSHING_READERS, TIMER_READER, ...RESTORE_PATHS]
        .map(({ file }) => file));
    return Object.fromEntries([...files].map((file) =>
        [file, readFileSync(join(JS_DIR, file), 'utf8')]));
}

test('every restore path rebuilds each pushed list through its reader', () => {
    assert.deepEqual(readerFindings(repositorySources()), []);
});

test('the scan finds a reader or a restore path that skips the push order', () => {
    const sources = repositorySources();
    // A reader that links the saved records in their saved order.
    const bypassingReader = {
        ...sources,
        'engrave.js': sources['engrave.js'].replace(
            /rest_push_each\(/u, 'saved.forEach('),
    };
    assert.deepEqual(readerFindings(bypassingReader),
        ['engrave.js rest_engravings: does not call rest_push_each()']);
    // A restore path that keeps the saved damage list instead of reading it.
    const bypassingPath = {
        ...sources,
        'restore.js': sources['restore.js'].replace(
            'restdamage(state.level.damagelist ?? null, state.level);',
            'state.level.damagelist = state.level.damagelist;'),
    };
    assert.deepEqual(readerFindings(bypassingPath), [
        'restore.js dorestore: does not call restdamage()',
        'restore.js dorestore: sets damagelist itself',
    ]);
    // A restore path that takes the saved light chain whole, as dorestore()
    // once did.
    const keptChain = {
        ...sources,
        'restore.js': sources['restore.js'].replace(
            'restore_light_sources(snapshot.lights, state);\n    restore_light_sources(snapshot.level_lights, state);',
            'state.gl.light_base = snapshot.light_base;'),
    };
    assert.deepEqual(readerFindings(keptChain), [
        'restore.js dorestore: does not call restore_light_sources()',
        'restore.js dorestore: sets light_base itself',
    ]);
});

test('the function body scan ignores comments and strings', () => {
    const body = functionBody([
        'function f(a = g(1)) {',
        "    const s = '}';",
        '    // restdamage(x) in a comment',
        '    /* load_exclusions(y) } */',
        '    rest_traps(level);',
        '}',
        'function h() { restdamage(); }',
    ].join('\n'), 'f');
    assert.equal(calls(body, 'rest_traps'), true);
    assert.equal(calls(body, 'restdamage'), false);
    assert.equal(calls(body, 'load_exclusions'), false);
});
