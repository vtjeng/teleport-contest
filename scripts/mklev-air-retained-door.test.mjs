import assert from 'node:assert/strict';
import test from 'node:test';

import { resetGame } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { lspo_terrain, lspo_replace_terrain, lspo_door } from '../js/mklev.js';
import { initRng } from '../js/rng.js';
import { SDOOR, D_LOCKED, D_CLOSED } from '../js/const.js';

for (const mode of ['terrain-air', 'replace-air', 'terrain-secret']) {
    test(`special-level ${mode} uses the retained door type`, () => {
        const state = resetGame();
        state.level = new GameMap();
        initRng(28104300);
        const env = {
            state, coder: { croom: null },
            frame: {
                xstart: 1, ystart: 0, xsize: 79, ysize: 21,
                splevMap: Array.from({ length: 80 }, () => Array(21).fill(0)),
            },
        };
        for (let x = 9; x <= 11; x++)
            for (let y = 9; y <= 11; y++)
                lspo_terrain([{ x, y, typ: '.' }], env);
        lspo_door([{ x: 10, y: 10, state: 'secret' }], env);
        lspo_door([{ x: 10, y: 10, state: 'locked' }], env);
        lspo_terrain([{ x: 9, y: 10, typ: '-' }], env);
        const door = state.level.at(11, 10);
        assert.deepEqual([door.typ, door.doormask, Number(door.horizontal)],
            [SDOOR, D_LOCKED, 0]);
        if (mode === 'replace-air') {
            lspo_replace_terrain([{
                region: [10, 10, 10, 10], fromterrain: 'S',
                toterrain: 'A', chance: 100,
            }], env);
        } else {
            lspo_terrain([{ x: 10, y: 10,
                typ: mode === 'terrain-secret' ? 'S' : 'A' }], env);
        }
        assert.deepEqual([
            door.typ, door.doormask, Number(door.horizontal),
            Number(Boolean(door.candig)),
        ], mode === 'terrain-air' ? [SDOOR, D_CLOSED, 1, 1]
            : mode === 'replace-air' ? [SDOOR, D_LOCKED, 0, 1]
                : [SDOOR, D_CLOSED, 1, 0]);
    });
}
