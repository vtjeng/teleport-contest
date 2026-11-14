// C ref: mklev.c find_branch_room() and place_branch(). On a level with no
// rooms, find_branch_room() picks the branch location with mazexy(), and
// place_branch() makes the stairs there.
//
// Only makemaz()'s procedural maze (mkmaze.c:1197-1220) reaches that arm:
// fixup_special() reaches place_branch() through place_lregion(), which
// calls it with coordinates when the level has no rooms (mkmaze.c:371-372).
// makelevel() reaches the procedural maze only when load_special() fails,
// because every dungeon that makelevel() sends to makemaz("") has a level
// file (mklev.c:1269-1290). The test therefore builds the roomless level
// directly.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BR_STAIR,
    COLNO,
    LA_UP,
    ROOM,
    ROWNO,
    STAIRS,
    STONE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { place_branch } from '../js/mklev.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';

test('place_branch on a roomless maze uses mazexy() and makes the stairs',
    async () => {
        const state = resetGame();
        // An arbitrary fresh seed; the assertions hold for every seed.
        initRng(5150);
        // Level 34 of Gehennom (dungeon 1), the level that carries the
        // stairs up to Vlad's Tower in the dungeon these values came from.
        state.u = { uz: { dnum: 1, dlevel: 9 } };
        state.level = new GameMap();
        state.level.nroom = 0;
        state.level.flags.corrmaze = false; // mazexy() then accepts ROOM
        state.made_branch = false;
        state.stairs = null;
        for (let x = 0; x < COLNO; ++x)
            for (let y = 0; y < ROWNO; ++y)
                state.level.at(x, y).typ = STONE;
        // The single ROOM square is the only place mazexy() can return, so
        // the result does not depend on which random tries miss.
        const spot = { x: 31, y: 9 };
        state.level.at(spot.x, spot.y).typ = ROOM;
        // C decl.c initializes gx.x_maze_max and gy.y_maze_max to the
        // greatest even coordinates, (COLNO - 1) & ~1 and (ROWNO - 1) & ~1,
        // and makemaz() leaves them so.
        const frame = { xMazeMax: (COLNO - 1) & ~1, yMazeMax: (ROWNO - 1) & ~1 };
        const branch = {
            type: BR_STAIR,
            end1: { dnum: 1, dlevel: 9 }, // the hero's level is end1
            end2: { dnum: 6, dlevel: 1 }, // the tower's bottom level
            end1_up: true, // Vlad's Tower is entered by going up
        };

        enableRngLog();
        await place_branch(branch, 0, 0, frame);
        const draws = getRngLog().length;

        // mazexy() draws rnd(x_maze_max) and rnd(y_maze_max) on each try.
        assert.ok(draws >= 2 && draws % 2 === 0, `draws: ${draws}`);
        assert.equal(state.level.at(spot.x, spot.y).typ, STAIRS);
        assert.equal(state.level.at(spot.x, spot.y).flags, LA_UP);
        assert.equal(state.stairs.sx, spot.x);
        assert.equal(state.stairs.sy, spot.y);
        assert.equal(state.stairs.up, true);
        assert.deepEqual(state.stairs.tolev, branch.end2);
        assert.equal(state.made_branch, true);
    });
