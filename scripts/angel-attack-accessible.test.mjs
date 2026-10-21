import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mcastu.c/angel-fumble-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('Angel weapon hits and spell fumble identify its square in accessible messages', async () => {
    const steps = recording.segments[0].steps;
    assert.match(steps[53].screen, /^\(northwest\): The Angel swings his long sword\./u);
    assert.match(steps[56].screen, /^\(northwest\): The Angel hits!/u);
    assert.match(steps[68].screen, /^\(northwest\): The air crackles around the Angel\./u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
