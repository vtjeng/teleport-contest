import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mcastu.c/angel-cast-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('Angel spell cast identifies the caster square in accessible messages', async () => {
    const steps = recording.segments[0].steps;
    assert.match(steps[98].screen,
        /^\(northwest\): The Angel casts a spell at you!/u);
    assert.match(steps[101].screen,
        /^You are hit by a shower of missiles!/u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
