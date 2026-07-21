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
    W_AMUL,
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
    PM_FOG_CLOUD,
    PM_FOX,
    PM_GHOST,
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
    PM_WOOD_NYMPH,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    AMULET_OF_LIFE_SAVING,
    DART,
    MIRROR,
    ORCISH_DAGGER,
    ORCISH_HELM,
    POT_OBJECT_DETECTION,
    WAN_DIGGING,
    objects_globals_init,
} from '../js/objects.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';
import { scriptedRandom, step } from './monster-scripted-random.mjs';

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

test('fog-cloud creation keeps mindless random-item gates drawless', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // advance the monster id from 2 to 3
        // Difficulty one lowers the level-three fog cloud to level two.
        step('d', [2, 8], 9),
        // Both rare gates pass, then muse.c rejects a mindless monster
        // without consuming a random-item selection draw.
        step('rn2', [50], 0),
        step('rn2', [100], 0),
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_FOG_CLOUD],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.deepEqual([monster.m_lev, monster.mhp, monster.mhpmax], [2, 9, 9]);
    assert.equal(monster.female, false);
    assert.equal(monster.msleeping, false);
    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.minvent, null);
    assert.equal(state.mvitals[PM_FOG_CLOUD].born, 1);
});

test('wood nymph creation preserves source sleep and empty-inventory draws', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // advance the monster id from 2 to 3
        // Difficulty one lowers the level-three nymph to level two.
        step('d', [2, 8], 9),
        step('rn2', [5], 1), // source nymph branch puts her to sleep
        step('rn2', [2], 1), // no mirror
        step('rn2', [2], 1), // no object-detection potion
        step('rn2', [50], 2), // level two misses the defensive-item gate
        step('rn2', [100], 2), // level two misses the misc-item gate
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.female, true);
    assert.equal(monster.msleeping, true);
    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.minvent, null);
    assert.equal(state.mvitals[PM_WOOD_NYMPH].born, 1);
});

test('wood nymph receives mirror then potion in source inventory order', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('d', [2, 8], 9), // level-two hit points
        step('rn2', [5], 0), // nymph sleep branch leaves her awake
        step('rn2', [2], 0), // create the mirror
        step('rnd', [2], 1), // mirror object id
        step('rn2', [2], 0), // create the object-detection potion
        step('rnd', [2], 1), // potion object id
        step('rn2', [4], 1), // potion stays uncursed and unblessed
        step('rn2', [50], 2), // no rare defensive item
        step('rn2', [100], 2), // no rare miscellaneous item
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    const potion = monster.minvent;
    const mirror = potion.nobj;
    assert.deepEqual(
        [potion.otyp, potion.o_id, mirror.otyp, mirror.o_id],
        [POT_OBJECT_DETECTION, 4, MIRROR, 3],
    );
    assert.equal(mirror.nobj, null);
    assert.equal(state.context.ident, 5);
});

test('wood nymph rare defensive item keeps selector and wand-init order', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('d', [2, 8], 9), // level-two hit points
        step('rn2', [5], 0), // nymph sleep branch leaves her awake
        step('rn2', [2], 1), // no mirror
        step('rn2', [2], 1), // no object-detection potion
        step('rn2', [50], 0), // pass the rare defensive-item gate
        // Difficulty five expands rnd_defensive_item() to nine cases; case
        // seven is a wand of digging outside Sokoban.
        step('rn2', [9], 7),
        step('rnd', [2], 1), // wand object id
        step('rn1', [5, 4], 6), // directed-wand charge count
        step('rn2', [17], 1), // wand stays uncursed and unblessed
        step('rn2', [100], 2), // no rare miscellaneous item
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.minvent.otyp, WAN_DIGGING);
    assert.equal(monster.minvent.spe, 6);
    assert.equal(monster.minvent.owornmask, 0);
});

test('wood nymph wears a rare life-saving amulet during creation', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('d', [2, 8], 9), // level-two hit points
        step('rn2', [5], 0), // nymph sleep branch leaves her awake
        step('rn2', [2], 1), // no mirror
        step('rn2', [2], 1), // no object-detection potion
        step('rn2', [50], 2), // no rare defensive item
        step('rn2', [100], 0), // pass the rare miscellaneous-item gate
        step('rn2', [30], 1), // skip low-level polymorph item
        step('rn2', [40], 0), // select life-saving amulet
        step('rnd', [2], 1), // amulet object id
        // mksobj() checks the bad-amulet curse set, then blessorcurse().
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.minvent.otyp, AMULET_OF_LIFE_SAVING);
    assert.equal(monster.minvent.owornmask, W_AMUL);
    assert.equal(monster.misc_worn_check, W_AMUL);
});

test('ghost creation names from player or source ghost-name reservoir', () => {
    const cases = [
        {
            name: 'player name branch',
            nameSteps: [step('rn2', [7], 0)],
            expected: 'Alice',
        },
        {
            name: 'fixed ghost-name branch',
            nameSteps: [
                step('rn2', [7], 1),
                // Index 26 is the first two-word entry, exercising exact
                // reservoir order rather than a fixture-specific alias.
                step('rn2', [34], 26),
            ],
            expected: 'Nick Danger',
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        state.plname = 'Alice';
        const random = scriptedRandom([
            step('rnd', [2], 1), // monster id
            // Difficulty one lowers the level-ten ghost to level nine.
            step('d', [9, 8], 30),
            step('rn2', [2], 1), // retained corpse gender
            ...scenario.nameSteps,
        ]);
        const monster = makemon(
            state.mons[PM_GHOST],
            MON_X,
            MON_Y,
            NO_MINVENT,
            { state, random: random.random },
        );
        random.assertExhausted();

        assert.equal(monster.mextra.mgivenname, scenario.expected, scenario.name);
        assert.equal(monster.female, true, scenario.name);
        assert.equal(monster.mpeaceful, false, scenario.name);
        assert.equal(monster.minvent, null, scenario.name);
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

test('creation outside the initial dungeon level fails before RNG or state', () => {
    const cases = [
        {
            name: 'later main-dungeon level',
            level: { dnum: 0, dlevel: 2 },
        },
        {
            name: 'another dungeon at local level one',
            level: { dnum: 1, dlevel: 1 },
        },
        {
            name: 'Stronghold special level',
            level: { dnum: 0, dlevel: 10 },
            stronghold: true,
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        state.u.uz = scenario.level;
        if (scenario.stronghold)
            state.stronghold_level = { ...scenario.level };
        const random = scriptedRandom([]);

        assert.throws(
            () => makemon(
                null,
                MON_X,
                MON_Y,
                MM_NOGRP | NO_MINVENT,
                { state, random: random.random },
            ),
            UnsupportedMonsterCreationError,
            scenario.name,
        );
        random.assertExhausted();
        assert.equal(state.level.monlist, null, scenario.name);
        assert.equal(state.level.monsters[MON_X][MON_Y], null, scenario.name);
        assert.equal(state.mvitals[PM_NEWT].born, 0, scenario.name);
        assert.equal(state.context.ident, 2, scenario.name);
    }
});

test('NO_MINVENT leaves migrating object queues untouched', () => {
    for (const queueOwner of ['state', 'gm']) {
        const state = initialLevelState();
        const tail = { nobj: null };
        const migrating = { nobj: tail };
        if (queueOwner === 'state') state.migrating_objs = migrating;
        else state.gm = { migrating_objs: migrating };
        const random = scriptedRandom(basicCreationSteps());

        const monster = makemon(
            state.mons[PM_NEWT],
            MON_X,
            MON_Y,
            NO_MINVENT,
            { state, random: random.random },
        );
        random.assertExhausted();

        assert.equal(monster.minvent, null);
        assert.equal(state.level.monlist, monster);
        assert.equal(state.mvitals[PM_NEWT].born, 1);
        assert.equal(state.context.ident, 3);
        if (queueOwner === 'state')
            assert.equal(state.migrating_objs, migrating);
        else
            assert.equal(state.gm.migrating_objs, migrating);
        assert.equal(migrating.nobj, tail);
        assert.equal(tail.nobj, null);
    }
});

test('inventory-enabled creation rejects migrating object delivery', () => {
    for (const queueOwner of ['state', 'gm']) {
        const state = initialLevelState();
        const tail = { nobj: null };
        const migrating = { nobj: tail };
        if (queueOwner === 'state') state.migrating_objs = migrating;
        else state.gm = { migrating_objs: migrating };
        const random = scriptedRandom([]);

        assert.throws(
            () => makemon(
                state.mons[PM_NEWT],
                MON_X,
                MON_Y,
                0,
                { state, random: random.random },
            ),
            UnsupportedMonsterCreationError,
            queueOwner,
        );
        random.assertExhausted();
        assert.equal(state.level.monlist, null);
        assert.equal(state.level.monsters[MON_X][MON_Y], null);
        assert.equal(state.mvitals[PM_NEWT].born, 0);
        assert.equal(state.context.ident, 2);
        assert.equal(migrating.nobj, tail);
        assert.equal(tail.nobj, null);
    }
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
