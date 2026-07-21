import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    HWALL,
    OROOM,
    ROCKTRAP,
    ROOM,
    ROOMOFFSET,
    SCORR,
    SDOOR,
    TRAPDOOR,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { makeniche } from '../js/mklev.js';
import { initRng } from '../js/rng.js';

function nicheState(dlevel) {
    const state = resetGame();
    // This fresh arbitrary seed drives the production ISAAC64 path. The room
    // makes every possible direction and x-coordinate a valid niche.
    initRng(424242);
    state.u = { uz: { dnum: 0, dlevel }, ulevel: 1 };
    state.dungeons = [{
        depth_start: 1,
        entry_lev: 1,
        num_dunlevs: 10,
        flags: { hellish: false },
    }];
    state.level = new GameMap();
    state.level.flags.hardfloor = false;
    state.moves = 0;
    state.context = { ident: 2 }; // Object and monster id 1 is reserved.

    // The 3x3 interior gives finddpos() three choices on either horizontal
    // wall. Stone outside both walls makes each corresponding niche valid.
    const room = {
        lx: 10,
        hx: 12,
        ly: 5,
        hy: 7,
        rtype: OROOM,
        doorct: 0,
        fdoor: 0,
        needjoining: true,
        roomnoidx: 0,
    };
    state.level.rooms = [room];
    state.level.nroom = 1;
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            const location = state.level.at(x, y);
            location.typ = ROOM;
            location.roomno = ROOMOFFSET;
        }
        state.level.at(x, room.ly - 1).typ = HWALL;
        state.level.at(x, room.hy + 1).typ = HWALL;
    }
    return { room, state };
}

function nicheWallY(room, trapY) {
    return trapY < room.ly ? room.ly - 1 : room.hy + 1;
}

const NICHE_CASES = [
    {
        name: 'makeniche retains a trapdoor when the level permits falling',
        // Level 6 of a ten-level ordinary dungeon is neither bottom nor hardfloor.
        dlevel: 6,
        trapType: TRAPDOOR,
        terrain: CORR,
        once: true,
        engraving: 'Vlad was here',
    },
    {
        name: 'makeniche substitutes a rock trap when falling is blocked',
        // Level 10 is the bottom of the same ten-level ordinary dungeon.
        dlevel: 10,
        trapType: ROCKTRAP,
        terrain: SCORR,
        once: false,
        engraving: undefined,
    },
];

for (const { name, dlevel, trapType, terrain, once, engraving } of NICHE_CASES) {
    test(name, async () => {
        const { room, state } = nicheState(dlevel);
        await makeniche(TRAPDOOR);

        assert.equal(state.level.traps.length, 1);
        const trap = state.level.traps[0];
        assert.equal(trap.ttyp, trapType);
        assert.equal(trap.once, once);
        assert.equal(state.level.at(trap.tx, trap.ty).typ, terrain);
        assert.equal(
            state.level.at(trap.tx, nicheWallY(room, trap.ty)).typ,
            SDOOR,
        );
        assert.equal(state.head_engr?.engr_txt[2], engraving);
    });
}
