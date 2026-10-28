import assert from 'node:assert/strict';
import test from 'node:test';

import { resetGame } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { lspo_terrain } from '../js/mklev.js';
import { HWALL } from '../js/const.js';
import { selection_line } from '../js/bigrm.js';

const cases = [
    { name: 'shallow tie', from: [10, 10], to: [12, 11],
        cells: [[11, 10], [12, 11], [13, 11]] },
    { name: 'steep tie', from: [10, 10], to: [11, 12],
        cells: [[11, 10], [12, 11], [12, 12]] },
    { name: 'reverse tie', from: [12, 11], to: [10, 10],
        cells: [[11, 10], [12, 10], [13, 11]] },
    { name: 'horizontal control', from: [10, 10], to: [12, 10],
        cells: [[11, 10], [12, 10], [13, 10]] },
    { name: 'diagonal control', from: [10, 10], to: [12, 12],
        cells: [[11, 10], [12, 11], [13, 12]] },
];

for (const { name, from, to, cells } of cases) {
    test(`C selection line ${name}`, () => {
        const state = resetGame();
        state.level = new GameMap();
        const env = { state, coder: { croom: null },
            frame: { xstart: 1, ystart: 0, xsize: 79, ysize: 21 } };
        lspo_terrain([selection_line(...from, ...to), '-'], env);
        const painted = [];
        for (let x = 1; x < 80; x++)
            for (let y = 0; y < 21; y++)
                if (state.level.at(x, y).typ === HWALL) painted.push([x, y]);
        assert.deepEqual(painted, cells);
    });
}
