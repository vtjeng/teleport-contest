import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STATUE_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/trap.c/mounted-statue-trap-73905113.session.json',
    import.meta.url,
), 'utf8'));

test('the mounted hero approaches the wished statue trap', async () => {
    const segment = recording.segments[0];
    await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
    assert.ok(game.u.usteed);
    assert.ok(game.level.traps.some(trap => trap.ttyp === STATUE_TRAP
        && trap.tx === game.u.ux && trap.ty === game.u.uy - 1));
});

test('the mounted hero activates the C statue-trap hero effect', async () => {
    const segment = recording.segments[0];
    assert.equal(segment.steps.at(-1).key, 'k');
    assert.match(segment.steps.at(-1).screen, /The statue moves!/u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
