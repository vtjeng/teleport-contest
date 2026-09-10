import assert from 'node:assert/strict';
import test from 'node:test';

import { G_GENOD, NON_PM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    alloc_itermonarr,
    get_iter_mons_xy,
    iter_mons,
    mon_animal_list,
    normal_shape,
    pickvampshape,
    restartcham,
    isspecmon,
    validspecmon,
    validvamp,
    wiz_force_cham_form,
} from '../js/mon.js';
import * as M from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { AMULET_OF_YENDOR } from '../js/objects.js';

function monsterState() {
    const state = {
        level: new GameMap(),
        u: {
            ux: 5,
            uy: 5,
            uz: { dnum: 0, dlevel: 1 },
            uprops: [],
        },
        dungeons: [{
            depth_start: 1,
            ledger_start: 0,
            num_dunlevs: 29,
            entry_lev: 1,
            flags: { hellish: false },
        }],
    };
    M.monst_globals_init(state);
    M.reset_mvitals(state);
    return state;
}

function monster(state, pmidx, overrides = {}) {
    return newMonster({
        data: state.mons[pmidx],
        mnum: pmidx,
        mhp: 4,
        mhpmax: 4,
        mcanmove: true,
        ...overrides,
    });
}

test('iter_mons visits only living on-map monsters and caches nmon', () => {
    const state = monsterState();
    const live = monster(state, M.PM_SEWER_RAT, { m_id: 3 });
    const offmap = monster(state, M.PM_SEWER_RAT, {
        m_id: 2,
        mstate: 4,
        nmon: live,
    });
    const dead = monster(state, M.PM_SEWER_RAT, {
        m_id: 1,
        mhp: 0,
        nmon: offmap,
    });
    state.level.monlist = dead;

    const visited = [];
    iter_mons((candidate) => {
        visited.push(candidate.m_id);
        candidate.nmon = null;
    }, state);

    assert.deepEqual(visited, [3]);
});

test('get_iter_mons_xy passes coordinates and returns the first match', () => {
    const state = monsterState();
    const second = monster(state, M.PM_SEWER_RAT, { m_id: 2 });
    const first = monster(state, M.PM_SEWER_RAT, { m_id: 1, nmon: second });
    state.level.monlist = first;

    const seen = [];
    assert.equal(
        get_iter_mons_xy((candidate, x, y) => {
            seen.push([candidate.m_id, x, y]);
            return candidate.m_id === 2;
        }, 17, 19, state),
        second,
    );
    assert.deepEqual(seen, [[1, 17, 19], [2, 17, 19]]);
});

test('normal_shape restores a chameleon and preserves cancellation', () => {
    const state = monsterState();
    const chameleon = monster(state, M.PM_CHAMELEON);
    const shifted = monster(state, M.PM_DOG, {
        cham: M.PM_CHAMELEON,
        mcan: true,
        mx: 4,
        my: 4,
    });

    normal_shape(shifted, state, {
        random: {
            d: () => 1,
            rn1: () => 1,
            rn2: () => 0,
            rnd: () => 1,
            rne: () => 1,
            rnz: () => 1,
        },
    });

    assert.equal(shifted.data, chameleon.data);
    assert.equal(shifted.cham, M.NON_PM);
    assert.equal(shifted.mcan, 1);
});

test('restartcham re-enables shape changes for living monsters', () => {
    const state = monsterState();
    const shifted = monster(state, M.PM_DOG, { cham: M.PM_CHAMELEON });
    state.level.monlist = shifted;

    restartcham(state);

    assert.equal(shifted.cham, NON_PM);
});

test('alloc_itermonarr accepts C release and growth requests', () => {
    alloc_itermonarr(64);
    alloc_itermonarr(0);
    alloc_itermonarr(1);
});

// C ref: mon.c mon_animal_list() (4829-4854). This helper does not consume
// randomness or write output; pin its state mutation and both memory-lifecycle
// branches against the source's LOW_PM/SPECIAL_PM bounds.
test('mon_animal_list caches only in-range animal forms and releases them', () => {
    const animalFlag = 0x00040000; // monflag.h:103, M1_ANIMAL.
    const lowPm = 0; // monsters.h: LOW_PM.
    const lastSpecialForm = 329; // SPECIAL_PM - 1; SPECIAL_PM is 330.
    const excludedSpecialForm = 330; // SPECIAL_PM; the C loop excludes it.
    const state = {
        mons: Array.from({ length: excludedSpecialForm + 1 }, () => ({
            mflags1: 0,
        })),
    };
    state.mons[lowPm].mflags1 = animalFlag;
    state.mons[lastSpecialForm].mflags1 = animalFlag;
    state.mons[excludedSpecialForm].mflags1 = animalFlag;

    mon_animal_list(true, state);
    assert.deepEqual(state.ga.animal_list, [lowPm, lastSpecialForm]);
    assert.equal(state.ga.animal_list_count, 2);

    const cachedList = state.ga.animal_list;
    mon_animal_list(false, state);
    assert.equal(state.ga.animal_list, null);
    assert.equal(state.ga.animal_list_count, 0);
    assert.notEqual(cachedList, state.ga.animal_list);

    const uninitialized = { mons: state.mons, ga: {} };
    mon_animal_list(false, uninitialized);
    assert.equal(uninitialized.ga.animal_list, null);
    assert.equal(uninitialized.ga.animal_list_count, 0);
});

// mon.c:4941-4970, source-pinned vampire branches. The injected sequence
// records which C rn2() calls each fall-through path consumes.
test('pickvampshape preserves vampire, Vlad, and rogue-level branches', () => {
    const state = monsterState();
    const draws = [];
    const random = {
        rn2(limit) {
            draws.push(limit);
            return 0;
        },
    };
    const leader = monster(state, M.PM_WOLF, {
        cham: M.PM_VAMPIRE_LEADER,
        data: state.mons[M.PM_VAMPIRE_LEADER],
        mx: 5,
        my: 5,
    });
    assert.equal(pickvampshape(leader, { state, random }), M.PM_WOLF);
    assert.deepEqual(draws, [10]);

    const vampire = monster(state, M.PM_VAMPIRE_BAT, {
        cham: M.PM_VAMPIRE,
        data: state.mons[M.PM_VAMPIRE],
    });
    draws.length = 0;
    assert.equal(
        pickvampshape(vampire, { state, random }),
        M.PM_FOG_CLOUD,
    );
    assert.deepEqual(draws, [4]);

    const vlad = monster(state, M.PM_VLAD_THE_IMPALER, {
        cham: M.PM_VLAD_THE_IMPALER,
        data: state.mons[M.PM_VLAD_THE_IMPALER],
        minvent: { otyp: AMULET_OF_YENDOR, nobj: null },
    });
    draws.length = 0;
    assert.equal(
        pickvampshape(vlad, { state, random }),
        M.PM_VLAD_THE_IMPALER,
    );
    assert.deepEqual(draws, []);

    state.u.uz = { dnum: 9, dlevel: 9 };
    state.rogue_level = { dnum: 9, dlevel: 9 };
    draws.length = 0;
    assert.equal(
        pickvampshape(vampire, { state, random }),
        M.PM_VAMPIRE_BAT,
    );
    assert.deepEqual(draws, [4]);
});

// mon.c:4973-5014, pure special-monster validation. These cases pin the
// source's quest-leader identity, no-take, no-head, placeholder, and
// genocided checks to catalog data from nethack-c/include/monflag.h.
test('isspecmon and validspecmon enforce special-form restrictions', () => {
    const state = monsterState();
    const leader = monster(state, M.PM_DOG, { m_id: 73 });
    state.svq = { quest_status: { leader_m_id: 73 } };
    assert.equal(isspecmon(leader, state), true);
    assert.equal(validspecmon(leader, M.PM_DOG, state), true);
    assert.equal(validspecmon(leader, M.PM_FOG_CLOUD, state), false);
    assert.equal(validspecmon(leader, M.PM_FIRE_ELEMENTAL, state), false);

    assert.equal(validspecmon(leader, M.PM_ORC, state), false);
    state.mvitals[M.PM_DOG].mvflags |= G_GENOD;
    assert.equal(validspecmon(leader, M.PM_DOG, state), false);
    assert.equal(validspecmon(leader, NON_PM, state), true);
});

// mon.c:5017-5055, pure vampire target validation. C's int *mndx_p is
// represented by the explicit reference object so fallback classes can be
// checked without hiding the in-place mutation.
test('validvamp maps vampire classes and rejects ordinary-vampire wolves', () => {
    const state = monsterState();
    const vampire = monster(state, M.PM_VAMPIRE_BAT, {
        cham: M.PM_VAMPIRE,
        data: state.mons[M.PM_VAMPIRE_BAT],
    });
    const bat = { value: NON_PM };
    assert.equal(validvamp(vampire, bat, M.S_BAT, state), true);
    assert.equal(bat.value, M.PM_VAMPIRE_BAT);

    const vortex = { value: NON_PM };
    assert.equal(validvamp(vampire, vortex, M.S_VORTEX, state), true);
    assert.equal(vortex.value, M.PM_FOG_CLOUD);

    const dog = { value: NON_PM };
    assert.equal(validvamp(vampire, dog, M.S_DOG, state), false);
    assert.equal(dog.value, NON_PM);

    const wolf = { value: M.PM_WOLF };
    assert.equal(validvamp(vampire, wolf, 0, state), false);
});

test('wiz_force_cham_form accepts a vampire class and formats its prompt',
    async () => {
        const state = monsterState();
        state.iflags = { getpos_coords: 'm', mon_polycontrol: true };
        const vampire = monster(state, M.PM_VAMPIRE, {
            cham: M.PM_VAMPIRE,
            mx: 2,
            my: 3,
        });
        const prompts = [];
        const messages = [];
        const result = await wiz_force_cham_form(vampire, {
            state,
            getlin: async (prompt) => {
                prompts.push(prompt);
                return 'vortex';
            },
            message: async (message) => messages.push(message),
            random: {
                d: () => 1,
                rn1: () => 1,
                rn2: () => 1,
                rnd: () => 1,
                rne: () => 1,
            },
        });
        assert.equal(result, M.PM_FOG_CLOUD);
        assert.deepEqual(prompts, [
            'Change the vampire @ <2,3> into what?',
        ]);
        assert.deepEqual(messages, []);
    });
