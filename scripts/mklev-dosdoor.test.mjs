import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    D_NODOOR,
    D_TRAPPED,
    DOOR,
    HWALL,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { dosdoor } from '../js/mklev.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/mklev.c', 'utf8');

function prepareDoorLevel(rogue) {
    resetGame();
    game.level = new GameMap();
    game.level.rooms = [];
    // Level 10 supplies difficulty 10, reaching the source's trap and mimic
    // thresholds; level 11 is an adjacent non-Rogue control.
    game.u = { uz: { dnum: 0, dlevel: 10 } };
    game.rogue_level = rogue ? { dnum: 0, dlevel: 10 } : { dnum: 0, dlevel: 11 };
    game.dungeons = [{ depth_start: 1, entry_lev: 1, num_dunlevs: 20 }];
    // Seed 20 yields rn2(3)=0, rn2(5)=3, rn2(6)=1, rn2(25)=0,
    // making a closed trapped door before Rogue-level clearing.
    initRng(20);
    enableRngLog();
    // An interior wall coordinate keeps add_door() independent of boundaries.
    game.level.at(10, 10).typ = HWALL;
    return { room: { doorct: 0, fdoor: 0 } };
}

test('dosdoor clears Rogue trapped-door flags before the mimic roll', () => {
    const start = C_SOURCE.indexOf('dosdoor(coordxy x, coordxy y, struct mkroom *aroom, int type)');
    const end = C_SOURCE.indexOf('\n}\n', start) + 2;
    const source = C_SOURCE.slice(start, end);
    const clearIndex = source.indexOf('if (Is_rogue_level(&u.uz))');
    const mimicIndex = source.indexOf('if (levl[x][y].doormask & D_TRAPPED)');
    assert.ok(clearIndex >= 0 && clearIndex < mimicIndex);

    const { room } = prepareDoorLevel(true);

    dosdoor(10, 10, room, DOOR);

    assert.equal(game.level.at(10, 10).flags, D_NODOOR);
    assert.equal(room.doorct, 1);
    assert.deepEqual(getRngLog(), [
        'rn2(3)=0',
        'rn2(5)=3',
        'rn2(6)=1',
        'rn2(25)=0',
    ]);
});

test('dosdoor preserves trapped-door mimic eligibility on ordinary levels', () => {
    const { room } = prepareDoorLevel(false);

    dosdoor(10, 10, room, DOOR);

    assert.equal(game.level.at(10, 10).flags & D_TRAPPED, D_TRAPPED);
    assert.equal(room.doorct, 1);
    assert.deepEqual(getRngLog(), [
        'rn2(3)=0',
        'rn2(5)=3',
        'rn2(6)=1',
        'rn2(25)=0',
        'rn2(5)=2',
    ]);
});
