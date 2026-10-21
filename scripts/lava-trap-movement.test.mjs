import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const lava = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/lava-trap-movement-9701162.session.json',
    import.meta.url,
), 'utf8'));
const quiet = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/lava-trap-movement-quiet-9701162.session.json',
    import.meta.url,
), 'utf8'));

test('fire-resistant hero remains caught on attempts to leave wished lava', async () => {
    assert.match(lava.segments[0].steps.at(-3).screen,
        /You are stuck in the lava\./u);
    const js = await runJsSession(lava, process.cwd());
    const result = compareSessionOutputs(lava, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('quiet lava escape attempts omit the repeated trapped message', async () => {
    assert.doesNotMatch(quiet.segments[0].steps.at(-3).screen,
        /You are stuck in the lava\./u);
    const js = await runJsSession(quiet, process.cwd());
    const result = compareSessionOutputs(quiet, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
