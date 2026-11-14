// Every C call the port skips has a recorded reason: each note_unported()
// label in js/ has an entry in scripts/skipped-call-reasons.mjs, pinned by
// count in both directions. That file says how calls and labels are found.

import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';
import {
    SKIPPED_CALL_REASONS,
    callsByLabel,
    readJsFiles,
    skippedCalls,
    skippedCallsWithoutReason,
} from './skipped-call-reasons.mjs';

const PIN = 'scripts/skipped-call-reasons.mjs';
const jsFiles = readJsFiles();
const { byLabel, unlabelled } = callsByLabel(skippedCalls(jsFiles));

test('every note_unported() argument is a <file>.c <function> label', () => {
    assert.deepEqual(unlabelled, [],
        'pass note_unported() a string, template or conditional starting with <file>.c <function>');
});

test('every note_unported() label has an entry with a reason', () => {
    const missing = [...byLabel].filter(([label]) => !SKIPPED_CALL_REASONS.has(label))
        .map(([label, sites]) => `${label}: ${sites.join(', ')}`);
    assert.deepEqual(missing, [],
        `port each call, or add its label to SKIPPED_CALL_REASONS in ${PIN} with its reason`);
    for (const [label, { reason }] of SKIPPED_CALL_REASONS)
        assert.ok(typeof reason === 'string' && reason.trim(), `${label} needs a reason in ${PIN}`);
});

test('every registry entry names a label js/ uses, with its pinned count', () => {
    const unused = [...SKIPPED_CALL_REASONS.keys()].filter((label) => !byLabel.has(label));
    assert.deepEqual(unused, [], `remove these labels from SKIPPED_CALL_REASONS in ${PIN}`);
    for (const [label, { count }] of SKIPPED_CALL_REASONS) {
        assertExceptionCount(byLabel.get(label).length, count, {
            what: `${label} calls`, pin: `the count of '${label}' in ${PIN}`,
        });
    }
});

test('skippedCallsWithoutReason() finds no call without a reason', () => {
    const summary = skippedCallsWithoutReason(jsFiles);
    assert.equal(summary.count, 0);
    assert.equal(summary.internalErrors.calls
        + summary.other.reduce((sum, entry) => sum + entry.calls, 0), summary.calls);
});

// Two calls in a synthetic file: 'mail.c readmail' (pinned at 1 here) and an
// unlisted label, so the count is 1; a third readmail call exceeds the pin
// and adds 1. The comment and the string are not calls.
test('skippedCallsWithoutReason() counts unlisted labels and calls beyond a pin', () => {
    const registry = new Map([['mail.c readmail', { count: 1, reason: 'host program' }]]);
    const source = [
        "// note_unported('x.c y');",
        "const s = \"note_unported('x.c y')\";",
        "note_unported('mail.c readmail');",
        'note_unported(`zap.c zhitm: ${s}`);',
    ].join('\n');
    const one = skippedCallsWithoutReason([{ path: 'a.js', source }], registry);
    assert.equal(one.calls, 2);
    assert.equal(one.count, 1);
    const two = skippedCallsWithoutReason(
        [{ path: 'a.js', source }, { path: 'b.js', source: "note_unported('mail.c readmail');" }],
        registry);
    assert.equal(two.count, 2);
});
