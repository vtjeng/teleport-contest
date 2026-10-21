import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DOOR, D_ISOPEN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/pet-swap-open-door-9800563.session.json',
    import.meta.url,
), 'utf8'));

test('the little dog stands in the intact open doorway before the swap', async () => {
    const segment = recording.segments[0];
    await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
    const x = game.u.ux + 1;
    const y = game.u.uy;
    const square = game.level.at(x, y);
    assert.equal(square.typ, DOOR);
    assert.equal(square.flags & D_ISOPEN, D_ISOPEN);
    assert.ok(m_at(x, y, game)?.mtame);
});

test('a Valkyrie displaces its dog from an open doorway', async () => {
    const last = recording.segments[0].steps.at(-1);
    assert.equal(last.key, 'l');
    assert.match(last.screen, /You swap places with your little dog\./u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
