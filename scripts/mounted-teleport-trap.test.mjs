import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { TELEP_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/trap.c/mounted-teleport-trap-73905113.session.json',
    import.meta.url,
), 'utf8'));

test('the mounted hero approaches the wished teleport trap', async () => {
    const segment = recording.segments[0];
    await runSegment({ ...segment, moves: segment.moves.slice(0, -4) });
    assert.ok(game.u.usteed);
    assert.ok(game.level.traps.some(trap => trap.ttyp === TELEP_TRAP
        && trap.tx === game.u.ux && trap.ty === game.u.uy - 1));
});

test('a mounted hero reaches the C teleport-trap hero prompt', async () => {
    const segment = recording.segments[0];
    assert.equal(segment.steps.at(-4).key, 'k');
    assert.match(segment.steps.at(-4).screen,
        /Where do you and the saddled pony want to be teleported\?/u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
