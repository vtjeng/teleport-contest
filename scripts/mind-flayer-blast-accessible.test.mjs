import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/monmove.c/mind-flayer-blast-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('mind flayer locates its concentration before the psychic wave and hit', async () => {
    const segment = recording.segments[0];
    const steps = segment.steps;
    assert.ok(steps[88].rng.includes('rn2(20)=0 @ dochug(monmove.c:831)'));
    assert.match(steps[88].screen,
        /^\(northwest\): The mind flayer concentrates.--More--/u);
    assert.match(steps[89].screen,
        /^A wave of psychic energy pours over you!--More--/u);
    assert.match(steps[90].screen,
        /^\(northwest\): The mind flayer hits!--More--/u);
    assert.match(steps[89].screen, /HP:12\(12\)/u);
    assert.match(steps[90].screen, /HP:10\(12\)/u);

    await runSegment({ ...segment, moves: segment.moves.slice(0, 89) });
    assert.equal(game.u.uhp, 12,
        'the missed psychic wave does not damage the hero');
    await runSegment({ ...segment, moves: segment.moves.slice(0, 90) });
    assert.equal(game.u.uhp, 10,
        'the subsequent physical hit deals two damage');

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
