// Enforces scripts/c-function-map.mjs: every C function that js/ does not
// define under its own name has exactly one category, from a rule or from a
// verdict in scripts/c-function-verdicts.mjs, and the verdict file's counts
// match its pinned totals. The first test scans the repository; the others
// pin the rules on small hand-written sources.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { tokenizePreprocessed } from './c-message-coverage.mjs';
import { PROJECT_ROOT } from './c-functions.mjs';
import {
    buildFunctionMap,
    cRefNames,
    cRefsInSource,
    classify,
    definedNames,
    entryKey,
    summarize,
    tokenLines,
} from './c-function-map.mjs';
import {
    C_FUNCTION_VERDICTS,
    VERDICT_CATEGORIES,
    VERDICT_TOTALS,
} from './c-function-verdicts.mjs';
import { requireCompiler } from './recorder-headers.mjs';

test('every C function without a same-named JS function has one category', async () => {
    requireCompiler('the map needs the C preprocessor');
    const { entries, unusedVerdicts } = await buildFunctionMap();
    console.log(JSON.stringify(summarize(entries).counts));

    // An entry with no category needs a verdict. A verdict whose function
    // js/ now defines, or that a rule now matches, is stale: remove it, and
    // lower its category's total.
    const unclassified = entries.filter((e) => e.category === null)
        .map((e) => `${e.dir}/${e.file}:${e.line} ${e.name}: needs a verdict`);
    const byKey = new Map(entries.map((e) => [entryKey(e.file, e.name), e]));
    const stale = unusedVerdicts.map((key) => {
        const entry = byKey.get(key);
        return entry
            ? `${key}: stale verdict; matched by rule (${entry.category}, ${entry.evidence})`
            : `${key}: stale verdict; js/ defines it under its own name, or no C file defines it`;
    });
    assert.deepEqual([...unclassified, ...stale], [],
        'edit scripts/c-function-verdicts.mjs for each function listed');
});

test('the verdict file\'s counts equal its pinned totals', () => {
    const counts = Object.fromEntries(VERDICT_CATEGORIES.map((c) => [c, 0]));
    for (const [key, verdict] of Object.entries(C_FUNCTION_VERDICTS)) {
        assert.ok(VERDICT_CATEGORIES.includes(verdict.category), `${key}: unknown category`);
        assert.ok(verdict.reason, `${key}: needs a reason`);
        counts[verdict.category]++;
    }
    // Both directions: a new verdict raises its total, and a port that
    // removes one lowers it, in the same commit.
    assert.deepEqual(counts, { ...VERDICT_TOTALS },
        'set VERDICT_TOTALS in scripts/c-function-verdicts.mjs to these counts');
});

test('each otherName verdict cites a function its JS file defines', () => {
    const names = new Map();
    const problems = [];
    for (const [key, verdict] of Object.entries(C_FUNCTION_VERDICTS)) {
        if (verdict.category !== 'otherName') continue;
        const match = /^(js\/[\w/.-]+\.js) ([A-Za-z_$][\w$]*)$/u.exec(verdict.js ?? '');
        if (!match) {
            problems.push(`${key}: js must be "js/<file>.js <function>", not ${verdict.js}`);
            continue;
        }
        const [, file, name] = match;
        if (!names.has(file)) {
            let source = null;
            try {
                source = readFileSync(join(PROJECT_ROOT, file), 'utf8');
            } catch {
                // Reported below.
            }
            names.set(file, source === null ? null : definedNames(source));
        }
        const defined = names.get(file);
        if (!defined) problems.push(`${key}: ${file} does not exist`);
        else if (!defined.has(name)) problems.push(`${key}: ${file} defines no ${name}`);
    }
    assert.deepEqual(problems, []);
});

test('cRefNames reads a C file and its function, and a list of more', () => {
    // A plain reference, and the colon form some comments use.
    assert.deepEqual(cRefNames('C ref: hack.c test_move() (667-890).'),
        [{ file: 'hack.c', name: 'test_move' }]);
    assert.deepEqual(cRefNames('C ref: trap.c:isclearpath().'),
        [{ file: 'trap.c', name: 'isclearpath' }]);
    // A directory prefix is dropped, and `C refs:` reads like `C ref:`.
    assert.deepEqual(cRefNames('C refs: win/tty/wintty.c condattr() (4920-4952) and condcolor()'),
        [{ file: 'wintty.c', name: 'condattr' }, { file: 'wintty.c', name: 'condcolor' }]);
    // Three names: a comma, then a comma with "and".
    assert.deepEqual(cRefNames('C ref: insight.c enl_msg(), you_are(), and you_have().'),
        [{ file: 'insight.c', name: 'enl_msg' }, { file: 'insight.c', name: 'you_are' },
            { file: 'insight.c', name: 'you_have' }]);
    // A slash joins two names, as in "save_room()/save_rooms()".
    assert.deepEqual(cRefNames('C ref: mkroom.c save_room()/save_rooms() (844-871)'),
        [{ file: 'mkroom.c', name: 'save_room' }, { file: 'mkroom.c', name: 'save_rooms' }]);
    // A line number between the file and the name marks a call site.
    assert.deepEqual(cRefNames('C ref: allmain.c:73 set_wear((struct obj *) 0)'), []);
    // A word other than a list separator ends the list: set_msg_dir() is
    // only mentioned.
    assert.deepEqual(cRefNames('C ref: pline.c pline_dir() (113-123) over set_msg_dir()'),
        [{ file: 'pline.c', name: 'pline_dir' }]);
    // No parenthesis after the name: the comment names the file only.
    assert.deepEqual(cRefNames("C ref: insight.c's shared sentence fragments."), []);
});

test('cRefsInSource accepts a reference in a body or directly above a definition', () => {
    const source = [
        '// C ref: a.c above_decl().', // 1: directly above a declaration
        'function f() {',
        '    // C ref: a.c in_body().', // 3: inside f's body
        '}',
        '// C ref: a.c above_const().', // 5: directly above a const arrow
        'const g = () => 1;',
        '// C ref: a.c after_blank().', // 7: a blank line follows it
        '',
        'function h() {}',
        '// C ref: a.c above_table().', // 10: above a table, not a function
        'const TABLE = [1, 2];',
        '/* C ref: a.c', // 12: a block comment split across lines,
        '   above_export(). */', //   above an export
        'export function k() {}',
        'class C {',
        '    // C ref: a.c above_method().', // 16: above a method
        '    m() {}',
        '}',
        '// C ref: a.c first_line(), and', // 19: two line comments read as one block
        '// second_line().',
        'export async function* gen() {}',
    ].join('\n');
    assert.deepEqual(cRefsInSource(source).map((r) => [r.name, r.line, r.placement, r.jsFunction]), [
        ['above_decl', 1, 'above', 'f'],
        ['in_body', 3, 'body', null],
        ['above_const', 5, 'above', 'g'],
        ['above_export', 12, 'above', 'k'],
        ['above_method', 16, 'above', 'm'],
        ['first_line', 19, 'above', 'gen'],
        ['second_line', 19, 'above', 'gen'],
    ]);
});

test('definedNames lists declarations, bound functions, methods and assignments', () => {
    const source = [
        'function a() {}',
        'export const b = function () {};',
        'let c = async () => {};',
        'class D { e() {} }',
        'const o = { f() {}, g: () => 1, h: 2 };',
        'o.i = function () {};',
        'const j = 3;',
    ].join('\n');
    // h and j hold values, not functions; D is a class, not a function.
    assert.deepEqual([...definedNames(source)].sort(), ['a', 'b', 'c', 'e', 'f', 'g', 'i']);
});

test('classify applies the rules in order, then the verdicts', () => {
    // Hand-written preprocessor output for src/x.c. The markers number the
    // lines after them, so lines 1-3 and 5 survive and line 4 does not, as
    // if an #if arm dropped it.
    const text = [
        '# 1 "src/x.c"', 'int a;', 'void kept(void) {}', 'void ref(void) {}',
        '# 5 "src/x.c"', '{',
    ].join('\n');
    const compiled = tokenLines([{ source: 'src/x.c', tokens: tokenizePreprocessed(text) }]);
    assert.deepEqual([...compiled.get('src/x.c')].sort(), [1, 2, 3, 5]);
    const at = (name, line, bodyLine = line) => ({ file: 'x.c', dir: 'src', name, line, bodyLine });
    const entries = [
        // Its name and its '{' are both on the dropped line 4.
        at('dropped', 4),
        // Its name is on line 4, but its body opens on line 5, as when one
        // of two #if signatures shares the body (tty_nh_poskey).
        at('alternate', 4, 5),
        at('ref', 3),
        at('judged', 3),
        at('missing', 3),
    ];
    const refs = new Map([['x.c ref', [{ path: 'js/x.js', line: 7, placement: 'above', jsFunction: 'refPort' }]]]);
    const verdicts = {
        'x.c judged': { category: 'noVisibleEffect', reason: 'frees memory' },
        'x.c ref': { category: 'otherName', js: 'js/x.js refPort', reason: 'stale' },
        'x.c gone': { category: 'unreachable', reason: 'no caller' },
    };
    const { entries: out, unusedVerdicts } = classify(entries, { compiled, refs, verdicts });
    assert.deepEqual(out.map((e) => [e.name, e.category]), [
        ['dropped', 'notCompiled'],
        ['alternate', null],
        ['ref', 'otherName'],
        ['judged', 'noVisibleEffect'],
        ['missing', null],
    ]);
    // x.c ref is matched by rule before its verdict is read, and x.c gone
    // names no entry, so both are unused.
    assert.deepEqual(unusedVerdicts, ['x.c ref', 'x.c gone']);
    assert.deepEqual(summarize(out).counts, {
        notCompiled: 1, otherName: 1, unreachable: 0, noVisibleEffect: 1, unportedVisible: 0,
    });
});
