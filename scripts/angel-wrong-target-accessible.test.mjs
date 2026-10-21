import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ANGEL } from '../js/monsters.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mcastu.c/angel-displaced-wrong-target-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('a displaced hero draws the Angel spell toward thin air', async () => {
    const segment = recording.segments[0];
    const steps = segment.steps;
    assert.match(steps[75].screen,
        /^\(2north,1east\): The Angel casts a spell at thin air!/u);
    assert.match(steps[81].screen,
        /^\(2north,2east\): The Angel casts a spell at thin air!/u);

    await runSegment({ ...segment, moves: segment.moves.slice(0, 75) });
    const angel = (() => {
        for (let mon = game.level.monlist; mon; mon = mon.nmon) {
            if (mon.mnum === PM_ANGEL) return mon;
        }
        return null;
    })();
    assert.ok(angel);
    assert.notDeepEqual([angel.mux, angel.muy], [game.u.ux, game.u.uy]);
    assert.equal(game.u.uhp, 12, 'the misdirected spell does not hurt the hero');
    assert.equal(angel.mspec_used, 0, 'this Angel attack has no spell cooldown');

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
