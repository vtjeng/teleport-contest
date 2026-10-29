import assert from 'node:assert/strict';
import test from 'node:test';

import { resetGame } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { lspo_terrain } from '../js/mklev.js';
import { HWALL } from '../js/const.js';
import { selection_match } from '../js/bigrm.js';

for (const center of [40, 78]) {
    test(`C map-fragment match at x=${center}`, () => {
        const state = resetGame();
        state.level = new GameMap();
        const env = { state, coder: { croom: null },
            frame: { xstart: 1, ystart: 0, xsize: 79, ysize: 21 } };
        for (const [absoluteX, typ] of [
            [center - 1, '.'], [center, '|'], [center + 1, '.'],
        ]) lspo_terrain([{ x: absoluteX - 1, y: 10, typ }], env);
        lspo_terrain([selection_match('[.w.]', state), '-'], env);
        const painted = [];
        for (let x = 1; x < 80; x++)
            for (let y = 0; y < 21; y++)
                if (state.level.at(x, y).typ === HWALL) painted.push([x, y]);
        assert.deepEqual(painted, [[center, 10]]);
    });
}
