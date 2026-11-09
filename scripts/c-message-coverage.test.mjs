import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    REPORT_PATH,
    buildCoverage,
    decodeCString,
    extractMessageCalls,
    jsStringsOf,
    longestFragment,
    renderReport,
    tokenizePreprocessed,
} from './c-message-coverage.mjs';
import { compilerOrSkip } from './recorder-headers.mjs';

test('longestFragment splits at printf conversions and trims spaces', () => {
    // pline.c-style format with %s, a width (%3d), and %%: the longest
    // fixed piece is the text between the first two conversions.
    assert.equal(longestFragment('%s seems to be %3d%% done here.'), 'seems to be');
    // A control character splits like a conversion; the tail is longer.
    assert.equal(longestFragment('Hi.\nThe rest is longer.'), 'The rest is longer.');
    // %-*.*s exercises flags, a * width, and a * precision together.
    assert.equal(longestFragment('ab%-*.*scdefgh'), 'cdefgh');
});

test('decodeCString decodes simple, octal, and hex escapes', () => {
    // \" and \\ are the escapes message formats use most; \033 and \x41
    // cover the octal and hex forms.
    assert.equal(decodeCString('say \\"hi\\" \\\\ \\033 \\x41'), 'say "hi" \\ \x1b A');
});

test('extractMessageCalls finds calls, joins literals, and flags debug traces', () => {
    // Hand-written preprocessor output: a line marker naming src/x.c, an
    // ordinary pline with two adjacent literals, an expanded debugpline1()
    // (include/lint.h ifdebug), and a pline whose argument holds a __FILE__
    // literal from the recorder's rn2() wrapper. The marker numbers the line
    // after it, so the three calls sit on lines 2, 3, and 4.
    const text = [
        '# 1 "src/x.c"',
        'void foo(int n) {',
        '    pline("You see " "a thing %d.", n);',
        '    do { if (debugcore("src/x.c", 1)) { int save_plnmsg = iflags.last_msg; pline("trace value = %d", n); } } while (0);',
        '    pline("%d", (rng_log_set_caller("src/x.c", 4, __func__), rn2(3)));',
        '}',
    ].join('\n');
    const calls = extractMessageCalls(tokenizePreprocessed(text), 'src/x.c');
    assert.deepEqual(calls.map((c) => [c.function, c.line, c.kind, c.literals.map((l) => l.text)]), [
        ['foo', 2, 'gameplay', ['You see a thing %d.']],
        ['foo', 3, 'debug', ['trace value = %d']],
        ['foo', 4, 'gameplay', ['%d']],
    ]);
});

test('jsStringsOf joins wrapped strings and expands string conditionals', () => {
    const source = [
        // A comment quoting C text must not count as coverage.
        '// pline("comment only text");',
        // A template wrapped onto a second literal with '+'.
        'f(`${a} have difficulty ` + \'pinpointing it.\');',
        // A conditional inside a template, as for a C ternary argument.
        'f(`You ${c ? \'see crabgrass\' : \'glimpse a clover\'} at your feet.`);',
        // A function-local const naming the varying word.
        'function g() { const verb = c ? \'rises\' : \'falls\'; f(`${m} ${verb}!`); }',
    ].join('\n');
    const strings = jsStringsOf(source);
    assert.ok(!strings.some((s) => s.includes('comment only text')));
    assert.ok(strings.includes(' have difficulty pinpointing it.'));
    assert.ok(strings.includes('You glimpse a clover at your feet.'));
    assert.ok(strings.includes(' falls!'));
});

test('docs/c-message-coverage.md matches the current C and JS sources', async (t) => {
    const compiler = compilerOrSkip(t, 'the report needs the C preprocessor');
    if (!compiler) return;
    const expected = renderReport(await buildCoverage({ compiler, jobs: 2 }));
    assert.ok(readFileSync(REPORT_PATH, 'utf8') === expected,
        'docs/c-message-coverage.md is stale; run node scripts/c-message-coverage.mjs');
});
