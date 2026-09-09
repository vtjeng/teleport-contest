import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    COULD_SEE,
    ROOM,
    ROWNO,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import {
    elemental_clog,
    maybe_mnexto,
    ok_to_obliterate,
} from '../js/mon.js';
import {
    PM_GIANT_RAT,
    PM_GRID_BUG,
    PM_WIZARD_OF_YENDOR,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { objects_globals_init } from '../js/objects.js';

function monsterState() {
    const state = resetGame();
    state.astral_level = { dnum: 9, dlevel: 1 };
    state.dungeons = [{ flags: { hellish: false } }];
    state.gm = { migrating_mons: null };
    state.iflags = {};
    state.level = new GameMap();
    state.moves = 1;
    state.u = {
        ux: 10,
        uy: 10,
        uz: { dnum: 0, dlevel: 1 },
        uprops: [],
        ustuck: null,
        usteed: null,
    };
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    return state;
}

function openLevel(state) {
    for (let x = 1; x < COLNO; ++x)
        for (let y = 0; y < ROWNO; ++y)
            state.level.at(x, y).typ = ROOM;
}

function linkMonsters(state, monsters) {
    for (let index = monsters.length - 1; index >= 0; --index) {
        monsters[index].nmon = state.level.monlist;
        state.level.monlist = monsters[index];
    }
}

test('ok_to_obliterate preserves every C exclusion', () => {
    const state = monsterState();
    const ordinary = newMonster({ data: state.mons[PM_GIANT_RAT] });
    assert.equal(ok_to_obliterate(ordinary, state), true);

    const excluded = [
        newMonster({ data: state.mons[PM_WIZARD_OF_YENDOR] }),
        newMonster({
            data: state.mons[PM_GIANT_RAT],
            mextra: { emin: {} },
        }),
        newMonster({
            data: state.mons[PM_GIANT_RAT],
            mextra: { epri: {} },
        }),
        newMonster({
            data: state.mons[PM_GIANT_RAT],
            mextra: { eshk: {} },
        }),
    ];
    for (const monster of excluded)
        assert.equal(ok_to_obliterate(monster, state), false);

    state.u.ustuck = ordinary;
    assert.equal(ok_to_obliterate(ordinary, state), false);
    state.u.ustuck = null;
    state.u.usteed = ordinary;
    assert.equal(ok_to_obliterate(ordinary, state), false);
});

test('elemental_clog obliterates the lowest-level eligible monster', () => {
    const state = monsterState();
    state.astral_level = { dnum: 0, dlevel: 3 };
    state.u.uz = { dnum: 0, dlevel: 2 };
    openLevel(state);

    const caller = newMonster({
        data: state.mons[PM_GIANT_RAT],
        mhp: 5,
        m_lev: 7,
    });
    const high = newMonster({
        data: state.mons[PM_GIANT_RAT],
        mhp: 5,
        m_lev: 9,
    });
    const low = newMonster({
        data: state.mons[PM_GIANT_RAT],
        mhp: 5,
        m_lev: 2,
    });
    place_monster(caller, 10, 10, state);
    place_monster(high, 9, 10, state);
    place_monster(low, 11, 10, state);
    linkMonsters(state, [caller, high, low]);

    elemental_clog(caller, state, {
        message: () => {},
    });

    assert.equal(low.mhp, 0);
    assert.deepEqual([caller.mx, caller.my], [11, 10]);
    assert.equal(state.level.monsters[9][10], high);
    assert.equal(state.level.monsters[11][10], caller);
});

test('maybe_mnexto relocates only to a visible nearby square', () => {
    const state = monsterState();
    openLevel(state);
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO).fill(COULD_SEE),
    );
    const monster = newMonster({
        data: state.mons[PM_GIANT_RAT],
        mhp: 5,
    });
    place_monster(monster, 12, 10, state);
    state.level.monlist = monster;

    maybe_mnexto(monster, state, { random: { rn2: () => 0 } });

    assert.notDeepEqual([monster.mx, monster.my], [12, 10]);
    assert.equal(state.level.monsters[monster.mx][monster.my], monster);
});

test('maybe_mnexto keeps grid bugs off diagonal destinations', () => {
    const state = monsterState();
    openLevel(state);
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO).fill(COULD_SEE),
    );
    const monster = newMonster({
        data: state.mons[PM_GRID_BUG],
        mhp: 5,
    });
    place_monster(monster, 9, 10, state);
    state.level.monlist = monster;

    maybe_mnexto(monster, state, { random: { rn2: () => 0 } });

    // C compares the candidate with the monster's old square, not the hero's
    // square: a same-column move such as (9,10) -> (9,9) is legal.
    assert.equal(monster.mx === 9 || monster.my === 10, true);
});
