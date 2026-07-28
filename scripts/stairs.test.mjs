import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    DOOR,
    FOUNTAIN,
    GRAVE,
    IRONBARS,
    ROOM,
    SINK,
    THRONE,
    TREE,
} from '../js/const.js';
import { dfeature_at } from '../js/invent.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    known_branch_stairs,
    On_stairs,
    stairs_description,
    stairway_add,
    stairway_at,
    stairway_find_dir,
    stairway_find_special_dir,
} from '../js/stairs.js';
import { CMAP_EXPLANATIONS } from '../js/symbol_data.js';

// A non-Friday-the-13th, non-moon-boundary afternoon, as the command tests use.
const DATETIME = '20310314150926';

async function startedGame() {
    await runSegment({
        seed: 861001,
        datetime: DATETIME,
        nethackrc: 'OPTIONS=name:StairText,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none',
        moves: '.',
    });
    return game;
}

test('the stairway list answers every stairs.c lookup', () => {
    resetGame();
    game.u = { uz: { dnum: 0, dlevel: 1 } };
    game.stairs = null;
    // Two ordinary stairways plus one leading into another dungeon branch,
    // which is what stairway_find_special_dir() selects.
    stairway_add(4, 5, true, false, { dnum: 0, dlevel: 0 });
    stairway_add(7, 8, false, false, { dnum: 0, dlevel: 2 });
    stairway_add(9, 2, true, false, { dnum: 2, dlevel: 1 });

    assert.equal(stairway_at(7, 8).sy, 8);
    assert.equal(stairway_at(1, 1), null);
    assert.equal(On_stairs(4, 5), true);
    assert.equal(On_stairs(4, 6), false);
    // The list is newest-first, so the branch stairway added last wins.
    assert.deepEqual(
        [stairway_find_dir(true).sx, stairway_find_dir(true).sy],
        [9, 2],
    );
    assert.equal(stairway_find_dir(false).sx, 7);
    // Special: a different dnum and the opposite direction from the argument.
    assert.equal(stairway_find_special_dir(false).sx, 9);
    assert.equal(stairway_find_special_dir(true), null);

    // known_branch_stairs() needs a different dnum and a traversed stairway.
    const branch = stairway_at(9, 2);
    assert.equal(known_branch_stairs(branch), false);
    branch.u_traversed = true;
    assert.equal(known_branch_stairs(branch), true);
    const local = stairway_at(7, 8);
    local.u_traversed = true;
    assert.equal(known_branch_stairs(local), false);
});

test('stairs_description reproduces each stairs.c sentence', async () => {
    const state = await startedGame();
    const dungeonOne = { dnum: 0, dlevel: 1 };

    // Untraversed ordinary stairs: no destination is named.
    const plain = { sx: 1, sy: 1, up: false, isladder: false,
        tolev: { dnum: 0, dlevel: 2 } };
    assert.equal(stairs_description(plain, true, state), 'staircase down');
    assert.equal(stairs_description(plain, false, state), 'stairs down');
    assert.equal(
        stairs_description({ ...plain, isladder: true }, true, state),
        'ladder down',
    );

    // Traversed ordinary stairs name depth(), which is dlevel here because
    // the main dungeon starts at depth 1.
    assert.equal(
        stairs_description({ ...plain, u_traversed: true }, true, state),
        'staircase down to level 2',
    );

    // The D:1 upstairs: a traversed branch stairway, so stairs_description()
    // takes its level-one special case. Without the Amulet C prints
    // "staircase up out of the dungeon".
    const upstairs = state.stairs
        && stairway_at(state.u.ux, state.u.uy, state);
    assert.ok(upstairs?.up, 'the hero starts on the upstairs');
    assert.equal(upstairs.u_traversed, true);
    assert.deepEqual(
        [state.u.uz.dnum, state.u.uz.dlevel],
        [dungeonOne.dnum, dungeonOne.dlevel],
    );
    assert.equal(
        stairs_description(upstairs, true, state),
        'staircase up out of the dungeon',
    );

    // With the Amulet the same stairway becomes branch stairs. The D:1
    // upstairs lead to the Plane of Earth, one of the four planes C names,
    // so it reports the Elemental Planes; any other destination reports the
    // end game.
    state.u.uhave = { amulet: true };
    assert.deepEqual(
        [upstairs.tolev.dnum, upstairs.tolev.dlevel],
        [state.earth_level.dnum, state.earth_level.dlevel],
    );
    assert.equal(
        stairs_description(upstairs, true, state),
        'branch staircase up to the Elemental Planes',
    );
    const endgame = {
        ...upstairs,
        tolev: { dnum: state.earth_level.dnum, dlevel: 1 },
    };
    assert.equal(
        stairs_description(endgame, true, state),
        'branch staircase up to the end game',
    );
    delete state.u.uhave;

    // Known branch stairs elsewhere name the dungeon, with "The" lowercased
    // by strsubst(), as C does for "The Gnomish Mines".
    const mines = {
        sx: 3, sy: 3, up: false, isladder: false, u_traversed: true,
        tolev: { dnum: state.mines_dnum, dlevel: 3 },
    };
    state.u.uz = { dnum: 0, dlevel: 3 };
    assert.equal(
        stairs_description(mines, true, state),
        'branch staircase down to the Gnomish Mines',
    );
    state.u.uz = dungeonOne;
});

test('dfeature_at names the features invent.c reads from a square',
    async () => {
    const state = await startedGame();
    // The hero starts on the upstairs, the one feature this milestone reaches.
    assert.equal(
        dfeature_at(state.u.ux, state.u.uy, state),
        'staircase up out of the dungeon',
    );

    // Every case below needs a square with no stairway on it, because C
    // consults the stairway list before the terrain types at the end of its
    // chain. This one is inside the hero's room.
    const [x, y] = [state.u.ux + 1, state.u.uy];
    assert.equal(stairway_at(x, y, state), null);
    const square = state.level.at(x, y);
    const originalTyp = square.typ;

    // Values below come from include/defsym.h through drawing.c defsyms[],
    // which dfeature_at() indexes by cmap. ROOM and CORR have no feature.
    const cases = [
        [ROOM, null], // dfeature_at() has no branch for a plain floor
        [CORR, null],
        [DOOR, 'doorway'], // with the D_NODOOR mask set below
        [FOUNTAIN, 'fountain'],
        [SINK, 'sink'],
        [GRAVE, 'grave'],
        [TREE, 'tree'],
        [IRONBARS, 'set of iron bars'],
        [THRONE, 'opulent throne'],
    ];
    for (const [typ, expected] of cases) {
        square.typ = typ;
        square.doormask = 0;
        square.flags = 0;
        assert.equal(
            dfeature_at(x, y, state),
            expected,
            `terrain ${typ}`,
        );
    }

    // Each door mask reaches its own cmap; anything closed or locked shares
    // the closed-door text, and a broken door has a literal one.
    square.typ = DOOR;
    for (const [mask, expected] of [
        [0, 'doorway'],
        [2, 'open door'],
        [1, 'broken door'],
        [4, 'closed door'],
        [8, 'closed door'],
    ]) {
        square.doormask = mask;
        assert.equal(
            dfeature_at(x, y, state),
            expected,
            `door mask ${mask}`,
        );
    }
    square.typ = originalTyp;
    square.doormask = 0;
});

test('the generated cmap explanations match defsym.h', () => {
    // Indices and text read from include/defsym.h, which drawing.c expands
    // into defsyms[]. PCHAR2 entries carry a tile name before the
    // explanation, and the explosion and beam entries carry none at all.
    for (const [index, expected] of [
        [0, 'stone'],
        [12, 'doorway'],
        [13, 'open door'],
        [15, 'closed door'],
        [16, 'closed door'],
        [17, 'iron bars'],
        [25, 'staircase up'],
        [26, 'staircase down'],
        [37, 'fountain'],
        [80, ''], // S_boomleft, one of the entries with an empty explanation
    ]) {
        assert.equal(CMAP_EXPLANATIONS[index], expected, `cmap ${index}`);
    }
    assert.equal(CMAP_EXPLANATIONS.length, 105); // MAXPCHARS
});
