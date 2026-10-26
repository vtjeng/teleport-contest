import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const cases = [
    'trial-engraving-screen-coords-probe',
    'trial-engraving-compass-coords-probe',
    'trial-engraving-map-coords-control',
    'trial-engraving-none-coords-control',
];

for (const name of cases) {
    test(`engraving list coordinate mode matches C: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/pager.c/${name}.session.json`, import.meta.url),
            'utf8',
        ));
        const result = compareSessionOutputs(
            recording,
            await runJsSession(recording, process.cwd()),
        );
        assert.equal(result.passed, true, JSON.stringify(
            result.firstDifference ?? result.issues?.[0] ?? result,
        ));
        if (name === 'trial-engraving-screen-coords-probe')
            assert.ok(recording.segments[0].steps[7].screen.includes('[11,75]'));
    });
}
