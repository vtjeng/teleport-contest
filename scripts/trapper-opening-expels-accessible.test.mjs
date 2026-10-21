import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mhitu.c/trapper-opening-expels-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('opening an engulfing trapper locates its release before relocation', async () => {
    const segment = recording.segments[0];
    const steps = segment.steps;
    assert.match(steps[55].screen, /^In what direction\?/u);
    assert.match(steps[56].screen,
        /^\(here\): The trapper unfolds and you are released!--More--/u);
    assert.match(steps[57].screen, /^\n/u);
    assert.equal(steps[56].rng.length, 0,
        'the located release message precedes monster relocation draws');
    assert.ok(steps[57].rng.length > 0,
        'the next input continues the relocation after the pager');

    await runSegment({ ...segment, moves: segment.moves.slice(0, 55) });
    assert.equal(game.u.uswallow, 1);
    assert.ok(game.u.ustuck);
    await runSegment(segment);
    assert.equal(game.u.uswallow, 0);
    assert.equal(game.u.ustuck, null);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
