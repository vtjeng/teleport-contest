import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const cooling = JSON.parse(readFileSync(new URL(
    '../recordings/zap.c/cold-solidifies-lava-under-hero-9701164.session.json',
    import.meta.url,
), 'utf8'));
const quiet = JSON.parse(readFileSync(new URL(
    '../recordings/zap.c/cold-solidifies-lava-quiet-9701164.session.json',
    import.meta.url,
), 'utf8'));

test('downward cold ray traps a fire-resistant hero in cooling rock', async () => {
    assert.match(cooling.segments[0].steps.at(-1).screen,
        /You are firmly stuck in the cooling rock\./u);
    const js = await runJsSession(cooling, process.cwd());
    const result = compareSessionOutputs(cooling, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('quiet play still traps the hero when a cold ray solidifies lava', async () => {
    assert.match(quiet.segments[0].steps.at(-1).screen,
        /You are firmly stuck in the cooling rock\./u);
    const js = await runJsSession(quiet, process.cwd());
    const result = compareSessionOutputs(quiet, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
