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
    {
        // Gas-spore chain explosion kills a blinded, fire-resistant hero.
        // Observed failing on 3e01a48b4 and ee49a85f0: RNG, cursors,
        // animations and stream lengths match; the tombstone screen (step 75,
        // row 10) names a different killer (explode.c killer attribution).
        name: 'mixed-fire-blind-fatal: tombstone killer attribution',
        recording: 'experiments/backlog-terminal-lava/recordings/mixed-fire-blind-fatal.session.json',
    },
    {
        // Mounted Wizard rides a pony into lava, then keeps sinking. Entry now
        // matches (recordings/steed/mounted-lava-entry passes); observed
        // failing on 3e01a48b4 and ee49a85f0 at RNG call 2792 (step 93 in
        // the diff-fresh report), where C calls rnd(4) in trap.c
        // sink_into_lava() and JavaScript calls rn2(12) instead.
        name: 'lava-mounted-terrain: later lava sinking',
        recording: 'experiments/backlog-terminal-lava/recordings/lava-mounted-terrain.session.json',
    },
];

for (const {name, recording} of KNOWN_FAILURES)
    test(name, {todo: true}, () => assertFullMatch(recording));
