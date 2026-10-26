import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const witness = JSON.parse(readFileSync(
    'recordings/cmd.c/trial-options-simple-boundary-retry.session.json', 'utf8'));
const control = JSON.parse(readFileSync(
    'recordings/cmd.c/trial-options-simple-control-retry.session.json', 'utf8'));

async function assertStrictMatch(recording) {
    const actual = await runJsSession(recording, process.cwd());
    const report = compareSessionOutputs(recording, actual);
    assert.equal(report.passed, true, report.message ?? JSON.stringify(report));
    return report;
}

test('#options extended command runs doset_simple and matches C screens and RNG', async () => {
    const report = await assertStrictMatch(witness);
    assert.deepEqual(report.lengths, {
        rng: { c: 2559, js: 2559 },
        screens: { c: 12, js: 12 },
        cursors: { c: 12, js: 12 },
        animFrames: { c: 0, js: 0 },
    });
});

test('#attributes neighboring extended command remains unchanged', async () => {
    const report = await assertStrictMatch(control);
    assert.deepEqual(report.lengths, {
        rng: { c: 2301, js: 2301 },
        screens: { c: 15, js: 15 },
        cursors: { c: 15, js: 15 },
        animFrames: { c: 0, js: 0 },
    });
});
