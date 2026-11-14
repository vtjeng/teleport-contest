import test from 'node:test';
import assert from 'node:assert/strict';

import {
    C_ALIASES,
    KNOWN_MISMATCHES,
    PORT_ONLY,
    checkConstants,
    classifyDiagnostics,
    compareWithC,
    declaredConstants,
    pairResult,
} from './check-c-constants.mjs';
import { assertExceptionCount } from './exception-count.mjs';
import { requireCompiler } from './recorder-headers.mjs';

test('declaredConstants sorts top-level and nested consts by kind', () => {
    const source = [
        'export const FOO = 1;',                 // exported declaration
        'export const BAR = FOO + 1, baz = 3;',  // both exported, any case
        'const LOCAL = 4;',                      // top level, not exported
        'const SPEC = 5;',                       // exported below by name
        'export { SPEC };',
        'export let MUTABLE = 6;',               // let: not a constant
        'function f() {',
        '    const INNER = -7;',                 // nested, negated literal: kept
        '    const COMPUTED = FOO * 2;',         // nested, not a literal: dropped
        '    const lower = 8;',                  // nested, not upper case: dropped
        '}',
    ].join('\n');
    assert.deepEqual(declaredConstants(source), {
        exported: ['FOO', 'BAR', 'baz', 'SPEC'],
        local: ['LOCAL'],
        nested: [{ name: 'INNER', value: -7 }],
    });
});

test('classifyDiagnostics reads both clang and gcc wording', () => {
    // Line 3 holds entry 0, line 4 entry 1 and line 5 entry 2, as
    // renderAssertions() would number them after a two-line prelude.
    const lineOf = new Map([[3, 0], [4, 1], [5, 2]]);
    const clang = [
        "/t/c.c:3:16: error: use of undeclared identifier 'NOPE'",
        "/t/c.c:4:1: error: static assertion failed due to requirement '(2) == (3LL)': X",
        "/t/c.c:5:16: error: invalid operands to binary expression ('struct s' and 'long long')",
    ].join('\n');
    const gcc = [
        "/t/c.c:3:17: error: 'NOPE' undeclared here (not in a function)",
        '/t/c.c:4:1: error: static assertion failed: "X"',
        '/t/c.c:5:20: error: invalid operands to binary == (have \'struct s\' and \'long long int\')',
    ].join('\n');
    for (const stderr of [clang, gcc]) {
        const { results, unexplained } = classifyDiagnostics(stderr, '/t/c.c', lineOf);
        assert.deepEqual([...results.entries()], [[0, 'undefined'], [1, 'mismatch'], [2, 'other']]);
        assert.deepEqual(unexplained, []);
    }
});

test('pairResult needs exactly one of an assertion and its twin to fail', () => {
    assert.equal(pairResult(undefined, 'mismatch'), 'match');
    assert.equal(pairResult('mismatch', undefined), 'mismatch');
    assert.equal(pairResult('undefined', 'undefined'), 'undefined');
    // Neither failed: the lines were not compiled as assertions.
    assert.equal(pairResult(undefined, undefined), null);
    // Both failed: the twin cannot fail when the assertion does.
    assert.equal(pairResult('mismatch', 'mismatch'), null);
});

test('a wrong value fails in every place the check looks', async () => {
    const compiler = requireCompiler('the check compiles _Static_assert lines');
    const entry = (name, value, module) => ({ name, value, module, kind: 'exported', claimed: true });
    const entries = await compareWithC(compiler, [
        entry('COLNO', 81, 'const.js'),          // global.h #define; C has 80
        entry('S_stone', 1, 'const.js'),         // defsym.h enumerator, mixed case; C has 0
        entry('DOG_WEAK', 501, 'dogmove.js'),    // dogmove.c #define ... #undef; C has 500
        entry('T_STONE', 1, 'display.js'),       // display.c T_stone, folded case; C has 0
        entry('INNATE_ROLE', 2, 'attrib.js'),    // C_ALIASES to attrib.c FROM_ROLE; C has 1
        entry('TIN_VARIETY_COUNT', 16, 'eat.js'), // C_ALIASES to eat.c TTSZ - 1; C has 15
        entry('ROWNO', 21, 'const.js'),          // the right value, as a control
    ]);
    const got = Object.fromEntries(entries.map((e) => [e.name, [e.result, e.cValue]]));
    // gcc does not print a value for a name checked inside a .c file.
    const clang = compiler === 'clang';
    assert.deepEqual(got, {
        COLNO: ['mismatch', 80],
        S_stone: ['mismatch', 0],
        DOG_WEAK: ['mismatch', clang ? 500 : undefined],
        T_STONE: ['mismatch', clang ? 0 : undefined],
        INNATE_ROLE: ['mismatch', clang ? 1 : undefined],
        TIN_VARIETY_COUNT: ['mismatch', clang ? 15 : undefined],
        ROWNO: ['match', undefined],
    });
});

test('every js/ constant that names a C constant has its C value', async () => {
    const compiler = requireCompiler('the check compiles _Static_assert lines');
    const { entries, importErrors } = await checkConstants({ compiler });
    assert.deepEqual(importErrors, []);
    const failing = entries
        .filter((e) => e.result === 'mismatch' && !e.known)
        .map((e) => `${e.name} (js/${e.module}): js ${e.value}, C ${e.cValue}`);
    assert.deepEqual(failing, [],
        'fix the value, or add the name to KNOWN_MISMATCHES in scripts/check-c-constants.mjs with the reason');
    // An entry whose mismatch was fixed would otherwise excuse a later one.
    const stillMismatched = new Set(entries.filter((e) => e.result === 'mismatch').map((e) => e.name));
    assert.deepEqual([...KNOWN_MISMATCHES.keys()].filter((name) => !stillMismatched.has(name)), [],
        'remove these names from KNOWN_MISMATCHES; they now match C');

    // Every port-only name has a reason, and every reason names a port-only
    // constant.
    const portOnly = new Set(entries
        .filter((e) => e.result === 'undefined' && !e.where).map((e) => e.name));
    assert.deepEqual([...portOnly].filter((name) => !PORT_ONLY.has(name)).sort(), [],
        'these js/ names match no C constant: use the C name, add the C spelling to C_ALIASES,'
        + ' or list the name in PORT_ONLY in scripts/check-c-constants.mjs with the reason');
    assert.deepEqual([...PORT_ONLY.keys()].filter((name) => !portOnly.has(name)).sort(), [],
        'remove these names from PORT_ONLY; js/ no longer declares them, or they now match C');
    // An alias for a name js/ no longer declares would wait to excuse a
    // later name of the same spelling.
    const declared = new Set(entries.map((e) => e.name));
    assert.deepEqual([...C_ALIASES.keys()].filter((name) => !declared.has(name)), [],
        'remove these names from C_ALIASES; js/ no longer declares them');

    // On constants-check (13 November 2026): 3 KNOWN_MISMATCHES entries; 91
    // js/ constants the check cannot compare, named after a C name that the
    // recorder's build leaves undefined (91) or that is not a constant (0);
    // and 101 PORT_ONLY names. wizkit-banner (13 November 2026) removed
    // BUILD_TIME with const.js's stale build constants and added ENOENT and
    // ENOTDIR for files.c fopen_wizkit_file(): 102.
    const PINS = { known: 3, uncompared: 91, portOnly: 102 };
    assertExceptionCount(KNOWN_MISMATCHES.size, PINS.known, {
        what: 'KNOWN_MISMATCHES entries',
        pin: 'PINS.known in scripts/check-c-constants.test.mjs',
    });
    assertExceptionCount(entries.filter((e) => e.result === 'variable'
        || (e.result === 'undefined' && e.where)).length,
        PINS.uncompared, {
            what: 'js/ constants the check cannot compare with C',
            pin: 'PINS.uncompared in scripts/check-c-constants.test.mjs',
        });
    assertExceptionCount(PORT_ONLY.size, PINS.portOnly, {
        what: 'PORT_ONLY entries',
        pin: 'PINS.portOnly in scripts/check-c-constants.test.mjs',
    });
});
