import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const witness = JSON.parse(readFileSync(
    'recordings/dokick.c/trial-samurai-martial-bulky-kick-witness.session.json',
    'utf8',
));
const control = JSON.parse(readFileSync(
    'recordings/dokick.c/trial-samurai-kick-low-weight-control.session.json',
    'utf8',
));

async function assertStrictMatch(recording) {
    const actual = await runJsSession(recording, process.cwd());
    const report = compareSessionOutputs(recording, actual);
    assert.equal(report.passed, true, report.message ?? JSON.stringify(report));
    return report;
}

test('martial burden success skips later bulky-armor clumsiness checks', async () => {
    const report = await assertStrictMatch(witness);
    assert.deepEqual(report.lengths, {
        rng: { c: 2384, js: 2384 },
        screens: { c: 58, js: 58 },
        cursors: { c: 58, js: 58 },
        animFrames: { c: 0, js: 0 },
    });
});

test('low-weight kick control remains strictly matched', async () => {
    const report = await assertStrictMatch(control);
    assert.deepEqual(report.lengths, {
        rng: { c: 2547, js: 2547 },
        screens: { c: 38, js: 38 },
        cursors: { c: 38, js: 38 },
        animFrames: { c: 0, js: 0 },
    });
});
