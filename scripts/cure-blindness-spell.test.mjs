import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const witness = JSON.parse(readFileSync(
    'recordings/spell.c/trial-cure-blindness-curespell.session.json', 'utf8'));
const control = JSON.parse(readFileSync(
    'recordings/spell.c/trial-cure-sickness-curespell-control.session.json', 'utf8'));

async function assertStrictMatch(recording) {
    const actual = await runJsSession(recording, process.cwd());
    const report = compareSessionOutputs(recording, actual);
    assert.equal(report.passed, true, report.message ?? JSON.stringify(report));
    return report;
}

test('#wizcast cure blindness clears blindness and matches C RNG/screens', async () => {
    const report = await assertStrictMatch(witness);
    assert.deepEqual(report.lengths, {
        rng: { c: 2941, js: 2941 },
        screens: { c: 31, js: 31 },
        cursors: { c: 31, js: 31 },
        animFrames: { c: 0, js: 0 },
    });
});

test('cure sickness control remains strictly matched', async () => {
    const report = await assertStrictMatch(control);
    assert.deepEqual(report.lengths, {
        rng: { c: 2734, js: 2734 },
        screens: { c: 31, js: 31 },
        cursors: { c: 31, js: 31 },
        animFrames: { c: 0, js: 0 },
    });
});
