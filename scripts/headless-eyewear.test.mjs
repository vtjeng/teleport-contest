import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/do_wear.c/headless-lenses-9701145.session.json',
    import.meta.url,
), 'utf8'));

test('a headless fog cloud refuses to put on lenses', async () => {
    assert.match(recording.segments[0].steps.at(-1).screen,
        /You have no head to wear a pair of lenses on\./u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
