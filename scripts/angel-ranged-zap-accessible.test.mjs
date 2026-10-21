import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mcastu.c/angel-ranged-zap-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('Angel ranged spell names its square before the missile travels', async () => {
    const steps = recording.segments[0].steps;
    assert.match(steps[68].screen,
        /^\(2west\): The renegade Angel of Anhur zaps you with a magic missile!/u);
    assert.match(steps[69].screen,
        /^\(west\): The goblin is killed by the magic missile!/u);
    assert.ok(steps[68].animation_frames?.length > 0,
        'the spell also animates its projectile');

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
