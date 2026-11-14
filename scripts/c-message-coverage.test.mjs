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
import { C_MESSAGE_EXEMPTIONS, exemptionProblems, messageExemption } from './c-message-exemptions.mjs';
import { requireCompiler } from './recorder-headers.mjs';

// Preprocessing every C file takes seconds; the checks below share one run.
let coverage = null;
function currentCoverage() {
    coverage ??= buildCoverage({
        compiler: requireCompiler('the report needs the C preprocessor'),
        jobs: 2,
    });
    return coverage;
}

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

test('exemptionProblems reports stale, unneeded, unexplained, and duplicate exemptions', () => {
    // Two report entries: one missing message and one js/ now contains.
    const entries = [
        { file: 'src/x.c', function: 'foo', fragment: 'missing text', covered: false },
        { file: 'src/x.c', function: 'foo', fragment: 'ported text', covered: true },
    ];
    const ok = { file: 'src/x.c', function: 'foo', fragment: 'missing text',
        reason: 'a reason', approved: 'Vincent, 2026-11-13' };
    assert.deepEqual(exemptionProblems(entries, [ok]), []);
    // Same fragment in another function: no C message matches it (stale).
    const stale = { ...ok, function: 'bar' };
    // js/ contains this text, so the exemption is no longer needed.
    const unneeded = { ...ok, fragment: 'ported text' };
    // Empty reason and an approval without a date.
    const unexplained = { ...ok, reason: ' ', approved: 'Vincent' };
    // sfstruct.c is in scripts/not-ported-by-design.mjs, which exempts it.
    const duplicated = { ...ok, file: 'src/sfstruct.c' };
    const problems = exemptionProblems(entries,
        [ok, stale, unneeded, unexplained, duplicated]);
    const has = (pattern) => problems.some((p) => pattern.test(p));
    assert.ok(has(/foo\(\) "missing text" is listed twice/u), problems.join('\n'));
    assert.ok(has(/bar\(\) "missing text" matches no C message/u), problems.join('\n'));
    assert.ok(has(/"ported text" is now found in js/u), problems.join('\n'));
    assert.ok(has(/has no reason/u), problems.join('\n'));
    assert.ok(has(/needs "approved: who, date"/u), problems.join('\n'));
    assert.ok(has(/src\/sfstruct.c .* not ported by design/u), problems.join('\n'));
});

test('messageExemption exempts files not ported by design and listed messages', () => {
    // sfstruct.c is in NOT_PORTED_BY_DESIGN; any function and text is exempt.
    assert.equal(messageExemption({ file: 'src/sfstruct.c', function: 'bufon',
        fragment: 'anything' })?.source, 'file');
    // The first listed exemption matches itself.
    const [first] = C_MESSAGE_EXEMPTIONS;
    assert.equal(messageExemption(first)?.source, 'message');
    // The same text in another function is not exempt.
    assert.equal(messageExemption({ ...first, function: 'not_a_function' }), null);
});

test('every exemption in scripts/c-message-exemptions.mjs matches a missing C message', async () => {
    assert.deepEqual(exemptionProblems((await currentCoverage()).entries), []);
});

test('docs/c-message-coverage.md matches the current C and JS sources', async () => {
    const expected = renderReport(await currentCoverage());
    assert.ok(readFileSync(REPORT_PATH, 'utf8') === expected,
        'docs/c-message-coverage.md is stale; run node scripts/c-message-coverage.mjs');
});
