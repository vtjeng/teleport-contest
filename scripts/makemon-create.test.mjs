import assert from 'node:assert/strict';
import test from 'node:test';

import {
    G_GENOD,
    MM_ANGRY,
    MM_ASLEEP,
    MM_FEMALE,
    MM_NOCOUNTBIRTH,
    MM_NOGRP,
    NO_MINVENT,
    OBJ_MINVENT,
    ROOM,
    W_ARMH,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    makemon,
    UnsupportedMonsterCreationError,
} from '../js/makemon_create.js';
import {
    M2_ORC,
    PM_ELF,
    PM_FOX,
    PM_GOBLIN,
    PM_GRID_BUG,
    PM_HUMAN,
    PM_JACKAL,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_LICHEN,
    PM_NEWT,
    PM_ORC,
    PM_SEWER_RAT,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    DART,
    ORCISH_DAGGER,
    ORCISH_HELM,
    objects_globals_init,
} from '../js/objects.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';

const MON_X = 10;
const MON_Y = 5;

function initialLevelState() {
    const state = {
        ...rawMonsterGenerationState(),
        astral_level: { dnum: 9, dlevel: 9 },
        context: { ident: 2 },
        in_mklev: true,
        level: new GameMap(),
        moves: 0,
        rogue_level: { dnum: 0, dlevel: 15 },
        sanctum_level: { dnum: 9, dlevel: 8 },
        urace: {
            mnum: PM_HUMAN,
            lovemask: 0,
            hatemask: M2_ORC,
        },
    };
    state.level.flags.rndmongen = true;
    state.level.at(MON_X, MON_Y).typ = ROOM;
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    return state;
}

function scriptedRandom(steps) {
    let offset = 0;
    function draw(kind, args) {
        const step = steps[offset++];
        assert.ok(step, `unexpected ${kind}(${args.join(',')})`);
        assert.equal(kind, step.kind);
        assert.deepEqual(args, step.args);
        return step.result;
    }
    return {
        random: {
            d: (number, sides) => draw('d', [number, sides]),
            rn1: (range, base) => draw('rn1', [range, base]),
            rn2: (bound) => draw('rn2', [bound]),
            rnd: (bound) => draw('rnd', [bound]),
            rne: (bound) => draw('rne', [bound]),
            rnz: (value) => draw('rnz', [value]),
        },
        assertExhausted() {
            assert.equal(offset, steps.length);
        },
    };
}

const step = (kind, args, result) => ({ kind, args, result });

function basicCreationSteps({ gender = true } = {}) {
    const steps = [
        // Shared context.ident advances by a source rnd(2).
        step('rnd', [2], 1),
        // Every reachable species is level zero and rolls rnd(4) hit points.
        step('rnd', [4], 1),
    ];
    if (gender) {
        // Non-neuter species choose their retained corpse gender with rn2(2).
        steps.push(step('rn2', [2], 1));
    }
    return steps;
}

function ordinaryInventoryTail() {
    return [
        // Level zero cannot pass these gates, but both draws still occur.
        step('rn2', [50], 1),
        step('rn2', [100], 1),
        // The saddle predicate evaluates this before rejecting non-domestic
        // initial-level species.
        step('rn2', [100], 1),
    ];
}

test('non-armed initial monsters preserve source state and RNG order', () => {
    const species = [
        PM_JACKAL,
        PM_FOX,
        PM_SEWER_RAT,
        PM_GRID_BUG,
        PM_LICHEN,
        PM_KOBOLD_ZOMBIE,
        PM_NEWT,
    ];

    for (const mndx of species) {
        const state = initialLevelState();
        const random = scriptedRandom([
            ...basicCreationSteps({ gender: mndx !== PM_LICHEN }),
            ...ordinaryInventoryTail(),
        ]);
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            0,
            { state, random: random.random },
        );
        random.assertExhausted();

        assert.equal(monster.mnum, mndx);
        assert.equal(monster.data, state.mons[mndx]);
        assert.equal(monster.m_id, 2);
        assert.deepEqual([monster.m_lev, monster.mhp, monster.mhpmax], [0, 2, 2]);
        assert.equal(monster.mcansee, true);
        assert.equal(monster.mcanmove, true);
        assert.equal(monster.mgenmklev, true);
        assert.equal(monster.mpeaceful, false);
        assert.equal(monster.minvent, null);
        assert.equal(state.mvitals[mndx].born, 1);
        assert.equal(state.level.monlist, monster);
        assert.equal(state.level.monsters[MON_X][MON_Y], monster);
        assert.equal(state.context.ident, 3);
        if (mndx === PM_LICHEN) assert.equal(monster.female, false);
        else assert.equal(monster.female, true);
    }
});

test('new monsters prepend to the source level-wide chain', () => {
    const state = initialLevelState();
    state.level.at(MON_X + 1, MON_Y).typ = ROOM;
    const firstRandom = scriptedRandom([
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);
    const first = makemon(
        state.mons[PM_JACKAL],
        MON_X,
        MON_Y,
        0,
        { state, random: firstRandom.random },
    );
    firstRandom.assertExhausted();

    const secondRandom = scriptedRandom([
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);
    const second = makemon(
        state.mons[PM_NEWT],
        MON_X + 1,
        MON_Y,
        0,
        { state, random: secondRandom.random },
    );
    secondRandom.assertExhausted();

    assert.equal(state.level.monlist, second);
    assert.equal(second.nmon, first);
    assert.equal(first.nmon, null);
    assert.equal(state.level.monsters[MON_X][MON_Y], first);
    assert.equal(state.level.monsters[MON_X + 1][MON_Y], second);
});

test('goblin creates helm before dagger, then wears the prepended helm', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        ...basicCreationSteps(),
        // Goblin's first rn2(2) selects the helm.
        step('rn2', [2], 1),
        step('rnd', [2], 1), // helm object id
        // Armor BUC initialization: ordinary helm reaches all three gates.
        step('rn2', [10], 1),
        step('rn2', [11], 1),
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        // Iron erosion generation outside the initial-inventory phase.
        step('rn2', [100], 1),
        step('rn2', [80], 1),
        step('rn2', [80], 1),
        step('rn2', [1000], 1),
        // Goblin's second rn2(2) selects the dagger. The goblin-specific
        // ternary then short-circuits without another item-choice draw.
        step('rn2', [2], 1),
        step('rnd', [2], 1), // dagger object id
        // Ordinary, non-multigen weapon BUC initialization.
        step('rn2', [11], 1),
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        // Dagger erosion generation.
        step('rn2', [100], 1),
        step('rn2', [80], 1),
        step('rn2', [80], 1),
        step('rn2', [1000], 1),
        // Level zero cannot receive the rare offensive item.
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    const dagger = monster.minvent;
    const helm = dagger.nobj;
    assert.deepEqual(
        [dagger.otyp, dagger.o_id, helm.otyp, helm.o_id],
        [ORCISH_DAGGER, 4, ORCISH_HELM, 3],
    );
    for (const obj of [dagger, helm]) {
        assert.equal(obj.where, OBJ_MINVENT);
        assert.equal(obj.ocarry, monster);
    }
    assert.equal(dagger.owornmask, 0);
    assert.equal(helm.owornmask, W_ARMH);
    assert.equal(monster.misc_worn_check, W_ARMH);
    assert.equal(monster.mw, null);
    assert.equal(state.context.ident, 5);
});

test('kobold keeps both dart quantity draws and recomputes final weight', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        ...basicCreationSteps(),
        step('rn2', [4], 0), // select the one-in-four dart branch
        step('rnd', [2], 1), // dart object id
        // mksobj's multigen quantity is observable even though m_initthrow
        // replaces it with the later 3..14 stack size.
        step('rn1', [6, 6], 7),
        step('rn2', [11], 1),
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        step('rn2', [100], 1), // multigen poison gate
        // Iron erosion generation.
        step('rn2', [100], 1),
        step('rn2', [80], 1),
        step('rn2', [80], 1),
        step('rn2', [1000], 1),
        step('rn1', [12, 3], 4), // final m_initthrow quantity
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_KOBOLD],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    const darts = monster.minvent;
    assert.equal(darts.otyp, DART);
    assert.equal(darts.o_id, 3);
    assert.equal(darts.quan, 4);
    assert.equal(darts.owt, 4);
    assert.equal(darts.where, OBJ_MINVENT);
    assert.equal(darts.ocarry, monster);
    assert.equal(darts.nobj, null);
    assert.equal(state.context.ident, 4);
});

test('random MM_NOGRP creation uses the full level-one reservoir', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        // These cumulative weights are the nine viable level-one records in
        // mons[] order. Zero replaces the reservoir at every record, ending
        // at newt without a separate final choice draw.
        ...[3, 4, 5, 7, 8, 11, 15, 16, 21]
            .map((bound) => step('rn2', [bound], 0)),
        step('rnd', [2], 1), // next_ident advances context.ident from 2 to 3
        step('rnd', [4], 1), // level-zero HP rolls 1, then rises to 2
        step('rn2', [2], 0), // gender leaves the newt female flag false
        step('rn2', [50], 0), // level 0 fails the defensive-item gate
        step('rn2', [100], 0), // level 0 fails the miscellaneous-item gate
        step('rn2', [100], 0), // saddle hits, but a newt is non-domestic
    ]);
    const monster = makemon(
        null,
        MON_X,
        MON_Y,
        MM_NOGRP,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.mnum, PM_NEWT);
    assert.equal(state.mvitals[PM_NEWT].born, 1);
});

test('goblin attitude honors an orc hero before inventory draws', () => {
    const state = initialLevelState();
    state.u.ualign.type = -1;
    state.urace = { mnum: PM_ORC, lovemask: 0, hatemask: 0 };
    const random = scriptedRandom([
        ...basicCreationSteps(),
        // A co-aligned goblin is peaceful only when both source draws are
        // nonzero: 16 + alignment record, then 2 + abs(-3).
        step('rn2', [16], 1),
        step('rn2', [5], 1),
        step('rn2', [2], 0), // no helm
        step('rn2', [2], 0), // no dagger
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.mpeaceful, true);
    assert.equal(monster.malign, -9);
    assert.equal(monster.minvent, null);
});

test('creation flags suppress their source draws and mutations', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('rnd', [4], 1), // level-zero hit points
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        MM_ASLEEP
            | MM_ANGRY
            | MM_FEMALE
            | MM_NOCOUNTBIRTH
            | NO_MINVENT,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.msleeping, true);
    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.female, true);
    assert.equal(monster.minvent, null);
    assert.equal(state.mvitals[PM_GOBLIN].born, 0);
});

test('unsupported creation modes fail before consuming RNG or state', () => {
    const state = initialLevelState();
    const random = scriptedRandom([]);

    assert.throws(
        () => makemon(null, MON_X, MON_Y, 0, {
            state,
            random: random.random,
        }),
        UnsupportedMonsterCreationError,
    );
    assert.throws(
        () => makemon(state.mons[1], MON_X, MON_Y, MM_NOGRP, {
            state,
            random: random.random,
        }),
        UnsupportedMonsterCreationError,
    );
    random.assertExhausted();
    assert.equal(state.level.monlist, null);
    assert.equal(state.context.ident, 2);
});

test('source no-creation exits leave the square and identity untouched', () => {
    const disabled = initialLevelState();
    disabled.level.flags.rndmongen = false;
    const disabledRandom = scriptedRandom([]);
    assert.equal(
        makemon(null, MON_X, MON_Y, MM_NOGRP, {
            state: disabled,
            random: disabledRandom.random,
        }),
        null,
    );
    disabledRandom.assertExhausted();

    const genocided = initialLevelState();
    genocided.mvitals[PM_NEWT].mvflags |= G_GENOD;
    const genocidedRandom = scriptedRandom([]);
    assert.equal(
        makemon(genocided.mons[PM_NEWT], MON_X, MON_Y, 0, {
            state: genocided,
            random: genocidedRandom.random,
        }),
        null,
    );
    genocidedRandom.assertExhausted();

    for (const state of [disabled, genocided]) {
        assert.equal(state.level.monlist, null);
        assert.equal(state.context.ident, 2);
        assert.equal(state.level.monsters[MON_X][MON_Y], null);
    }
});

test('elf racial hostility cannot be undone by goblin alignment', () => {
    const state = initialLevelState();
    state.u.ualign.type = -1;
    state.urace = {
        mnum: PM_ELF,
        lovemask: 0,
        hatemask: M2_ORC,
    };
    const random = scriptedRandom([
        ...basicCreationSteps(),
        step('rn2', [2], 0), // no helm
        step('rn2', [2], 0), // no dagger
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.malign, 3);
});
