import assert from 'node:assert/strict';
import test from 'node:test';

import {
    G_GENOD,
    MM_ANGRY,
    MM_ASLEEP,
    MM_FEMALE,
    MM_NOCOUNTBIRTH,
    MM_NOGRP,
    MM_NOMSG,
    MON_DETACH,
    NO_MINVENT,
    OBJ_MINVENT,
    ROOM,
    STONE,
    WEB,
    W_AMUL,
    W_ARMH,
    W_SADDLE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { add_to_minv } from '../js/invent.js';
import { light_globals_init } from '../js/light.js';
import {
    dmonsfree,
    makemon,
    m_dowear,
    mongone,
    UnsupportedMonsterCreationError,
} from '../js/makemon_create.js';
import { newMonster } from '../js/monst.js';
import { init_objects } from '../js/o_init.js';
import { mksobj } from '../js/obj.js';
import {
    M2_ORC,
    PM_ELF,
    PM_BLACK_LIGHT,
    PM_BLACK_UNICORN,
    PM_CAVE_SPIDER,
    PM_FOG_CLOUD,
    PM_FOX,
    PM_GHOST,
    PM_GOBLIN,
    PM_GRID_BUG,
    PM_HOMUNCULUS,
    PM_HUMAN,
    PM_HUMAN_MUMMY,
    PM_JACKAL,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_LICHEN,
    PM_NEWT,
    PM_ORC,
    PM_PONY,
    PM_SEWER_RAT,
    PM_SKELETON,
    PM_WHITE_UNICORN,
    PM_YELLOW_LIGHT,
    PM_WOOD_NYMPH,
    PM_ZRUTY,
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
    SADDLE,
    WAN_DIGGING,
    objects_globals_init,
} from '../js/objects.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';
import { scriptedRandom, step } from './monster-scripted-random.mjs';

const MON_X = 10;
const MON_Y = 5;
const FIXED_OBJECT_ID_RANDOM = {
    rn2: () => 0,
    rnd: () => 1,
    rn1: (_bound, base) => base,
    rne: () => 1,
};

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

function monsterWithHelm(state, mndx, { spe = 0, cursed = false } = {}) {
    const monster = newMonster({
        data: state.mons[mndx],
        mnum: mndx,
        m_id: 9000 + mndx,
        mcanmove: true,
    });
    const helm = mksobj(ORCISH_HELM, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    helm.spe = spe;
    helm.cursed = cursed;
    add_to_minv(monster, helm, { state });
    return { helm, monster };
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

function recordingRandom({ rn2Result } = {}) {
    const calls = [];
    const record = (kind, args, result) => {
        calls.push({ kind, args, result });
        return result;
    };
    return {
        calls,
        random: {
            d: (number, sides) => record('d', [number, sides], number),
            rn1: (range, base) => record('rn1', [range, base], base),
            rn2: (bound) => record(
                'rn2',
                [bound],
                rn2Result ? rn2Result(bound) : Math.max(0, bound - 1),
            ),
            rnd: (bound) => record('rnd', [bound], 1),
            rne: (bound) => record('rne', [bound], 1),
            rnz: (value) => record('rnz', [value], value),
        },
    };
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

test('m_dowear independently enforces each body and mind eligibility guard', () => {
    const state = initialLevelState();
    const cases = [
        ['very small homunculus', PM_HOMUNCULUS],
        ['no-hands white unicorn', PM_WHITE_UNICORN],
        ['animal zruty', PM_ZRUTY],
        ['mindless nonexception kobold zombie', PM_KOBOLD_ZOMBIE],
    ];

    for (const [name, mndx] of cases) {
        const { helm, monster } = monsterWithHelm(state, mndx);
        m_dowear(monster, true, { state });
        assert.equal(helm.owornmask, 0, name);
        assert.equal(monster.misc_worn_check & W_ARMH, 0, name);
    }
});

test('m_dowear creation exception applies to mummies and skeletons only', () => {
    const cases = [
        ['existing human mummy', PM_HUMAN_MUMMY, false, false],
        ['new human mummy', PM_HUMAN_MUMMY, true, true],
        ['existing skeleton', PM_SKELETON, false, false],
        ['new skeleton', PM_SKELETON, true, true],
    ];

    for (const [name, mndx, creation, expectedWorn] of cases) {
        const state = initialLevelState();
        const { helm, monster } = monsterWithHelm(state, mndx);
        m_dowear(monster, creation, { state });
        assert.equal(
            Boolean(helm.owornmask & W_ARMH),
            expectedWorn,
            name,
        );
        assert.equal(
            Boolean(monster.misc_worn_check & W_ARMH),
            expectedWorn,
            name,
        );
    }
});

test('m_dowear retains tied and cursed worn helmets', () => {
    const cases = [
        {
            name: 'equal protection retains the old helmet',
            oldSpe: 0,
            oldCursed: false,
            newSpe: 0,
        },
        {
            name: 'a cursed old helmet blocks a stronger replacement',
            oldSpe: 0,
            oldCursed: true,
            newSpe: 3,
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        const { helm: oldHelm, monster } = monsterWithHelm(
            state,
            PM_GOBLIN,
            { spe: scenario.oldSpe, cursed: scenario.oldCursed },
        );
        oldHelm.owornmask = W_ARMH;
        monster.misc_worn_check = W_ARMH;
        const newHelm = mksobj(ORCISH_HELM, false, false, {
            state,
            random: FIXED_OBJECT_ID_RANDOM,
        });
        newHelm.spe = scenario.newSpe;
        add_to_minv(monster, newHelm, { state });

        m_dowear(monster, true, { state });

        assert.equal(oldHelm.owornmask, W_ARMH, scenario.name);
        assert.equal(newHelm.owornmask, 0, scenario.name);
        assert.equal(monster.misc_worn_check, W_ARMH, scenario.name);
    }
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

test('random-coordinate creation accepts the first sampled good position', () => {
    const state = initialLevelState();
    state.level.at(17, 4).typ = ROOM;
    const random = scriptedRandom([
        step('rn1', [77, 2], 17),
        step('rn2', [21], 4),
        ...basicCreationSteps(),
    ]);

    const monster = makemon(
        state.mons[PM_NEWT],
        0,
        0,
        MM_NOCOUNTBIRTH | MM_NOMSG | NO_MINVENT,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.deepEqual([monster.mx, monster.my], [17, 4]);
    assert.equal(state.level.monsters[17][4], monster);
    assert.equal(state.mvitals[PM_NEWT].born, 0);
});

test('random-coordinate creation scans x-major after exactly 50 failed pairs', () => {
    const state = initialLevelState();
    state.level.at(3, 2).typ = ROOM;
    const failedPairs = Array.from({ length: 50 }, () => [
        step('rn1', [77, 2], 2),
        step('rn2', [21], 0),
    ]).flat();
    const random = scriptedRandom([
        ...failedPairs,
        ...basicCreationSteps(),
    ]);

    const monster = makemon(
        state.mons[PM_NEWT],
        0,
        0,
        MM_NOCOUNTBIRTH | NO_MINVENT,
        { state, random: random.random },
    );
    random.assertExhausted();

    // From offsets <2,0>, the deterministic scan visits <3,1> first and
    // <3,2> second. Row zero is deliberately absent from this fallback pass.
    assert.deepEqual([monster.mx, monster.my], [3, 2]);
    assert.equal(state.level.monsters[3][2], monster);
});

test('random-coordinate exhaustion returns null without creation state', () => {
    const state = initialLevelState();
    state.level.at(MON_X, MON_Y).typ = STONE;
    const failedPairs = Array.from({ length: 50 }, () => [
        step('rn1', [77, 2], 2),
        step('rn2', [21], 0),
    ]).flat();
    const random = scriptedRandom(failedPairs);

    assert.equal(
        makemon(
            state.mons[PM_NEWT],
            0,
            0,
            MM_NOCOUNTBIRTH | NO_MINVENT,
            { state, random: random.random },
        ),
        null,
    );
    random.assertExhausted();
    assert.equal(state.level.monlist, null);
    assert.equal(state.context.ident, 2);
    assert.equal(state.mvitals[PM_NEWT].born, 0);
});

test('mongone leaves a detached chain node until dmonsfree unlinks it', () => {
    const state = initialLevelState();
    state.level.at(MON_X + 1, MON_Y).typ = ROOM;
    const firstRandom = scriptedRandom(basicCreationSteps());
    const first = makemon(
        state.mons[PM_NEWT],
        MON_X,
        MON_Y,
        NO_MINVENT,
        { state, random: firstRandom.random },
    );
    firstRandom.assertExhausted();
    const secondRandom = scriptedRandom(basicCreationSteps());
    const second = makemon(
        state.mons[PM_JACKAL],
        MON_X + 1,
        MON_Y,
        NO_MINVENT,
        { state, random: secondRandom.random },
    );
    secondRandom.assertExhausted();

    const teardownRandom = scriptedRandom([]);
    mongone(first, { state, random: teardownRandom.random });
    teardownRandom.assertExhausted();

    assert.equal(state.level.monsters[MON_X][MON_Y], null);
    assert.equal(state.level.monsters[MON_X + 1][MON_Y], second);
    assert.equal(first.mhp, 0);
    assert.equal(first.mstate & MON_DETACH, MON_DETACH);
    assert.deepEqual([first.mx, first.my], [MON_X, MON_Y]);
    assert.equal(state.level.monlist, second);
    assert.equal(second.nmon, first);
    assert.equal(state.iflags.purge_monsters, 1);

    assert.equal(dmonsfree(state), 1);
    assert.equal(state.level.monlist, second);
    assert.equal(second.nmon, null);
    assert.equal(first.nmon, null);
    assert.equal(state.iflags.purge_monsters, 0);
});

test('spider creation places its side object before inventory and hides when legal', () => {
    for (const scenario of [
        { name: 'ordinary floor', trap: null, hidden: true },
        { name: 'non-pit trap', trap: WEB, hidden: false },
    ]) {
        const state = initialLevelState();
        init_objects(state, () => 0);
        if (scenario.trap != null) {
            state.level.traps.unshift({
                tx: MON_X,
                ty: MON_Y,
                ttyp: scenario.trap,
            });
        }
        const random = recordingRandom();
        const monster = makemon(
            state.mons[PM_CAVE_SPIDER],
            MON_X,
            MON_Y,
            MM_NOCOUNTBIRTH,
            {
                state,
                random: random.random,
                hooks: { artifactCount: () => 0 },
            },
        );

        const sideObject = state.level.objects[MON_X][MON_Y];
        assert.ok(sideObject, scenario.name);
        assert.deepEqual(
            [sideObject.ox, sideObject.oy],
            [MON_X, MON_Y],
            scenario.name,
        );
        assert.equal(monster.mundetected, scenario.hidden, scenario.name);
        const objectClassDraw = random.calls.findIndex(
            (call) => call.kind === 'rnd' && call.args[0] === 100,
        );
        const defensiveGate = random.calls.findIndex(
            (call) => call.kind === 'rn2' && call.args[0] === 50,
        );
        assert.ok(objectClassDraw >= 0, scenario.name);
        assert.ok(defensiveGate > objectClassDraw, scenario.name);
    }
});

test('light monsters own mobile light through creation and teardown', () => {
    const state = initialLevelState();
    state.level.at(MON_X + 1, MON_Y).typ = ROOM;
    light_globals_init(state);

    const yellowRandom = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [2, 8], 9),
        step('rn2', [50], 2),
        step('rn2', [100], 2),
        step('rn2', [100], 1),
    ]);
    const yellow = makemon(
        state.mons[PM_YELLOW_LIGHT],
        MON_X,
        MON_Y,
        MM_NOCOUNTBIRTH,
        { state, random: yellowRandom.random },
    );
    yellowRandom.assertExhausted();
    assert.equal(yellow.minvis, false);
    assert.equal(state.gl.light_base.id, yellow);
    assert.equal(state.gl.light_base.range, 1);

    const blackRandom = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [4, 8], 18),
        step('rn2', [50], 4),
        step('rn2', [100], 4),
        step('rn2', [100], 1),
    ]);
    const black = makemon(
        state.mons[PM_BLACK_LIGHT],
        MON_X + 1,
        MON_Y,
        MM_NOCOUNTBIRTH,
        { state, random: blackRandom.random },
    );
    blackRandom.assertExhausted();
    assert.equal(black.minvis, true);
    assert.equal(black.perminvis, true);
    assert.equal(state.gl.light_base.id, black);
    assert.equal(state.gl.light_base.next.id, yellow);

    const teardownRandom = scriptedRandom([]);
    mongone(yellow, { state, random: teardownRandom.random });
    assert.equal(state.gl.light_base.id, black);
    assert.equal(state.gl.light_base.next, null);
    mongone(black, { state, random: teardownRandom.random });
    teardownRandom.assertExhausted();
    assert.equal(state.gl.light_base, null);
    assert.equal(state.iflags.purge_monsters, 2);
});

test('co-aligned unicorn creation overrides an explicitly angry attitude', () => {
    const cases = [
        { mndx: PM_WHITE_UNICORN, expected: true },
        { mndx: PM_BLACK_UNICORN, expected: false },
    ];
    for (const { mndx, expected } of cases) {
        const state = initialLevelState();
        state.u.ualign.type = 1;
        const random = scriptedRandom([
            step('rnd', [2], 1),
            step('d', [3, 8], 12),
            step('rn2', [2], 0),
            step('rn2', [50], 3),
            step('rn2', [100], 3),
            step('rn2', [100], 1),
        ]);
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        random.assertExhausted();
        assert.equal(monster.mpeaceful, expected);
    }
});

test('ordinary domestic creation equips a saddle after inventory gates', () => {
    const state = initialLevelState();
    init_objects(state, () => 0);
    let hundredDraws = 0;
    const random = recordingRandom({
        rn2Result: (bound) => {
            if (bound === 100) {
                ++hundredDraws;
                return hundredDraws === 2 ? 0 : 99;
            }
            return Math.max(0, bound - 1);
        },
    });
    const monster = makemon(
        state.mons[PM_PONY],
        MON_X,
        MON_Y,
        MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );

    const saddle = monster.minvent;
    assert.equal(saddle.otyp, SADDLE);
    assert.equal(saddle.where, OBJ_MINVENT);
    assert.equal(saddle.ocarry, monster);
    assert.equal(saddle.owornmask, W_SADDLE);
    assert.equal(saddle.leashmon, monster.m_id);
    assert.equal(monster.misc_worn_check, W_SADDLE);
    assert.equal(hundredDraws, 2);

    const defensiveGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 50,
    );
    const saddleGate = random.calls.findLastIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 100,
    );
    const saddleId = random.calls.findIndex(
        (call, index) => index > saddleGate
            && call.kind === 'rnd'
            && call.args[0] === 2,
    );
    assert.ok(defensiveGate >= 0);
    assert.ok(saddleGate > defensiveGate);
    assert.ok(saddleId > saddleGate);
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
