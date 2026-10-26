import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const name of [
    'trial-marker-stack-merge',
    'trial-marker-no-stack-control',
]) {
    test(`marker inventory merge matches C: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/write.c/${name}.session.json`, import.meta.url),
            'utf8',
        ));
        const replay = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, replay);
        assert.equal(result.passed, true, JSON.stringify(
            result.firstDifference ?? result.issues?.[0] ?? result,
        ));
        const message = 'You learn more about your items by comparing them.';
        assert.equal(
            recording.segments[0].steps.some(({ screen }) => screen.includes(message)),
            name === 'trial-marker-stack-merge',
        );
    });
}
