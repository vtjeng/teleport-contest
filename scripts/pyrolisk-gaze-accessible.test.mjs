import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mhitu.c/pyrolisk-fiery-gaze-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('pyrolisk fiery gaze locates the attacker before damage and follow-up bite', async () => {
    const segment = recording.segments[0];
    const steps = segment.steps;
    assert.match(steps[51].screen,
        /^\(east\): The pyrolisk attacks you with a fiery gaze!/u);
    assert.ok(steps[51].rng.includes('d(2,6)=7 @ gazemu(mhitu.c:1829)'));
    assert.match(steps[52].screen,
        /^Your cloak smoulders!  \(east\): The pyrolisk bites!/u);
    assert.match(steps[51].screen, /HP:12\(12\)/u);
    assert.match(steps[52].screen, /HP:4\(12\)/u);

    await runSegment({ ...segment, moves: segment.moves.slice(0, 51) });
    assert.equal(game.u.uhp, 12,
        'the located gaze pauses before applying damage');
    await runSegment({ ...segment, moves: segment.moves.slice(0, 52) });
    assert.equal(game.u.uhp, 4,
        'the seven fire damage and later bite follow the pause');

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
