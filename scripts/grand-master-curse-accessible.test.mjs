import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mcastu.c/grand-master-curse-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('Grand Master curse identifies its square in accessible messages', async () => {
    const steps = recording.segments[0].steps;
    assert.match(steps[90].screen,
        /^\(west\): The Grand Master points at you, then curses\./u);
    assert.match(steps[93].screen,
        /^\(west\): The Grand Master points at you, then curses\./u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
