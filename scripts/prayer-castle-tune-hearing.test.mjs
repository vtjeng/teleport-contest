import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

test('the second Castle tune hint preserves its audible message boundary',
    async () => {
        const recording = JSON.parse(readFileSync(new URL(
            '../recordings/pray.c/prayer-castle-tune-hearing.session.json',
            import.meta.url,
        ), 'utf8'));
        assert.ok(recording.segments[0].steps.some(step =>
            step.screen.includes('You hear a divine music...')),
        'ordinary C prayer reaches the acoustics-enabled second hint');

        const replay = await runJsSession(recording, process.cwd());
        const compared = compareSessionOutputs(recording, replay);
        assert.equal(compared.passed, true, JSON.stringify(compared));
    });
