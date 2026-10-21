import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const stuck = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/solidified-lava-trapmove-9701164.session.json',
    import.meta.url,
), 'utf8'));
const quiet = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/solidified-lava-trapmove-quiet-9701164.session.json',
    import.meta.url,
), 'utf8'));

test('a hero caught in cooling rock spends a movement turn wriggling', async () => {
    assert.match(stuck.segments[0].steps.at(-1).screen,
        /You are stuck in the floor\./u);
    const js = await runJsSession(stuck, process.cwd());
    const result = compareSessionOutputs(stuck, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('quiet play spends the trapped turn without a floor message', async () => {
    assert.doesNotMatch(quiet.segments[0].steps.at(-1).screen,
        /You are stuck in the floor\./u);
    const js = await runJsSession(quiet, process.cwd());
    const result = compareSessionOutputs(quiet, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
