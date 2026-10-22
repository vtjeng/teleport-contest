import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PIT, HOLE} from '../js/const.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {compareSessionOutputs, runJsSession} from './diff-fresh.mjs';

test('replacing the last Sokoban pit invokes completion before the next move', async () => {
    const recording = JSON.parse(readFileSync(new URL(
        '../recordings/trap.c/sokoban-final-trap-replacement.session.json', import.meta.url)));
    assert.ok(recording.segments[0].steps.some(step =>
        step.screen.includes('With great effort you move the boulder.')));
    const replay = await runJsSession(recording, process.cwd());
    assert.equal(compareSessionOutputs(recording, replay).passed, true);
    assert.equal(game.level.flags.sokoban_rules, false);
    assert.equal(game.level.traps.some(trap => [PIT, HOLE].includes(trap.ttyp)), false);
    assert.equal(game.unported.has('trap.c maybe_finish_sokoban'), false);
    assert.deepEqual([game.u.ux, game.u.uy], [35, 8]);
});

test('replacing one pit preserves rules while other Sokoban pits remain', async () => {
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/trap.c/sokoban-final-trap-replacement.session.json', import.meta.url)));
    const segment = recipe.segments[0];
    const end = segment.moves.indexOf('squeaky board\n') + 'squeaky board\n'.length;
    let boundary;
    await runSegment({...segment, moves: segment.moves.slice(0, end)}, {
        onBoundary: error => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.sokoban_rules, true);
    assert.equal(game.level.traps.filter(trap => trap.ttyp === PIT).length, 9);
});
