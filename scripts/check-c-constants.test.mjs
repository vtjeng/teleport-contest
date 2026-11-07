import test from 'node:test';
import assert from 'node:assert/strict';

import {
    KNOWN_MISMATCHES,
    checkConstants,
    classifyDiagnostics,
    declaredConstantNames,
} from './check-c-constants.mjs';
import { findCompiler } from './recorder-headers.mjs';

test('declaredConstantNames takes upper-case exported consts only', () => {
    const source = [
        'export const FOO = 1;',            // counted
        'export const BAR = FOO + 1, BAZ = 3;', // both declarators counted
        'export const lower = 4;',          // lower case: not a C macro name
        'export let MUTABLE = 5;',          // let: not a constant
        'const PRIVATE = 6;',               // not exported
        'export function F() {}',           // not a variable
    ].join('\n');
    assert.deepEqual(declaredConstantNames(source), ['FOO', 'BAR', 'BAZ']);
});

test('classifyDiagnostics reads both clang and gcc wording', () => {
    // Line 3 holds entry 0 and line 4 entry 1, as renderAssertions() would
    // number them after a two-line prelude.
    const lineOf = new Map([[3, 0], [4, 1]]);
    const clang = [
        "/t/c.c:3:16: error: use of undeclared identifier 'NOPE'",
        "/t/c.c:4:1: error: static assertion failed due to requirement '(2) == (3LL)': X",
    ].join('\n');
    const gcc = [
        "/t/c.c:3:17: error: 'NOPE' undeclared here (not in a function)",
        '/t/c.c:4:1: error: static assertion failed: "X"',
    ].join('\n');
    for (const stderr of [clang, gcc]) {
        const { results, unexplained } = classifyDiagnostics(stderr, '/t/c.c', lineOf);
        assert.deepEqual([...results.entries()], [[0, 'undefined'], [1, 'mismatch']]);
        assert.deepEqual(unexplained, []);
    }
});

test('every js/ constant that names a C constant has its C value', async (t) => {
    const compiler = findCompiler();
    if (!compiler) {
        t.skip('no C compiler (clang, cc, or gcc) on PATH; the check compiles _Static_assert lines');
        return;
    }
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
});
