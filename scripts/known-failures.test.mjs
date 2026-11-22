// Known failures: complete C recordings that the JavaScript port does not yet
// reproduce. Each test runs the full comparison (RNG log, every screen with
// attributes, cursors and animation frames) and is marked `todo`, so
// `npm test` reports its failure as "# TODO" on every run without failing the
// suite. When a fix makes one match, Node reports it as a passing TODO; move
// it into an ordinary test then, next to the source it covers.
//
// docs/testing.md lists these cases with the commit where each was observed.

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';
import {assertExceptionCount} from './exception-count.mjs';

const root = new URL('../', import.meta.url);

async function assertFullMatch(recordingPath) {
    const recording = JSON.parse(readFileSync(new URL(recordingPath, root), 'utf8'));
    const workspace = createScoringWorkspace(root.pathname, []);
    try {
        const result = compareSessionOutputs(recording, await runJsSession(recording, workspace));
        assert.ok(result.passed, formatReport(result));
    } finally {
        removeScoringWorkspace(workspace);
    }
}

const KNOWN_FAILURES = [
];

for (const {name, recording} of KNOWN_FAILURES)
    test(name, {todo: true}, () => assertFullMatch(recording));

// The list's length, pinned both ways: 0 since mixed-fire-blind-fatal, the
// last case, matched on 362c0a1bd (22 November 2026) and joined
// recordings/explode.c/. A listed case that starts to match still reports as
// a passing TODO rather than failing, so only the length is pinned here.
const KNOWN_FAILURE_COUNT = 0;

test('KNOWN_FAILURES holds the pinned number of cases', () => {
    assertExceptionCount(KNOWN_FAILURES.length, KNOWN_FAILURE_COUNT, {
        what: 'KNOWN_FAILURES cases',
        pin: 'KNOWN_FAILURE_COUNT in scripts/known-failures.test.mjs',
    });
});
