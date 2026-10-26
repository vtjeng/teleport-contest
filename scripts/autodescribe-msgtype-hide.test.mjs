import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const cases = [
    ['trial-autodescribe-msgtype-hide', true],
    ['trial-autodescribe-no-filter-control', false],
    ['trial-autodescribe-other-filter-control', false],
];

for (const [name, isHiddenTypeWitness] of cases) {
    test(`auto-describe matches C: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/getpos.c/${name}.session.json`, import.meta.url),
            'utf8',
        ));
        const replay = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, replay);
        assert.equal(result.passed, true, JSON.stringify(
            result.firstDifference ?? result.issues?.[0] ?? result,
        ));
        if (isHiddenTypeWitness)
            assert.ok(recording.segments[0].steps[8].screen
                .startsWith('floor of a room\n'));
    });
}
