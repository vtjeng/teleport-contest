import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mhitu.c/werewolf-summon-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('visible werewolf summoning locates its message before the helpers appear', async () => {
    const steps = recording.segments[0].steps;
    assert.match(steps[77].screen,
        /^The werewolf changes into a human\.--More--/u);
    assert.ok(steps[77].rng.includes('rn2(10)=0 @ summonmu(mhitu.c:989)'));
    assert.match(steps[78].screen,
        /^\(southeast\): The werewolf summons help!--More--/u);
    assert.match(steps[79].screen,
        /^\(south\): A warg suddenly appears next to you!--More--/u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
