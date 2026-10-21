import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/pet-swap-engraving-52093325.session.json',
    import.meta.url,
), 'utf8'));

test('a Knight swaps with a pony after writing in dust on the old square', async () => {
    const last = recording.segments[0].steps.at(-1);
    assert.equal(last.key, 'h');
    assert.match(last.screen, /You swap places with your saddled pony\./u);
    assert.ok(last.rng.some(draw => /rnd\(5\).*maybe_smudge_engr/u.test(draw)),
        'C smudges the engraving after the displacement');
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
