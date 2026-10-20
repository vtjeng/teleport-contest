import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/do_wear.c/quest-helm-refusal-9701142.session.json',
    import.meta.url,
), 'utf8'));

test('a Knight in the Quest refuses a helm of opposite alignment', async () => {
    const final = recording.segments[0].steps.at(-1);
    assert.match(final.screen, /You narrowly avoid losing all chance at your goal\./u);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.equal(game.uarmh, null);
});
