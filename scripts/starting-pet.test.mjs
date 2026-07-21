import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    NON_PM,
    OBJ_MINVENT,
    ROOM,
    W_SADDLE,
} from '../js/const.js';
import {
    makedog,
    pet_type,
} from '../js/dog.js';
import { GameMap } from '../js/game.js';
import {
    PM_ARCHEOLOGIST,
    PM_CAVE_DWELLER,
    PM_HUMAN,
    PM_KITTEN,
    PM_KNIGHT,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_WIZARD,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    FIRST_OBJECT,
    MAXOCLASSES,
    NUM_OBJECTS,
    SADDLE,
    TOOL_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';
import { scriptedRandom, step } from './monster-scripted-random.mjs';

function startingPetState({
    petnum = NON_PM,
    role = PM_ARCHEOLOGIST,
    preferredPet = '',
    pauper = false,
    dogname = '',
    catname = '',
    horsename = '',
    alignmentType = 0,
} = {}) {
    const state = {
        ...rawMonsterGenerationState(),
        astral_level: { dnum: 9, dlevel: 1 },
        catname,
        context: { ident: 2 },
        dogname,
        gp: { petname_used: 0, preferred_pet: preferredPet },
        horsename,
        iflags: {},
        in_mklev: false,
        level: new GameMap(),
        moves: 0,
        rogue_level: { dnum: 0, dlevel: 15 },
        sanctum_level: { dnum: 9, dlevel: 8 },
        urole: { mnum: role, petnum },
        urace: {
            mnum: PM_HUMAN,
            lovemask: 0,
            hatemask: 0,
        },
    };
    Object.assign(state.u, {
        acurr: { a: [0, 0, 0, 0, 0, 0] },
        uconduct: { pets: 0 },
        uhave: { amulet: 0 },
        ulevel: 1,
        uroleplay: { pauper },
        ux: 10,
        uy: 10,
    });
    state.u.ualign = { type: alignmentType, record: 0, abuse: 0 };
    state.level.flags.rndmongen = true;
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    state.svb = { bases: new Array(MAXOCLASSES + 2).fill(0) };
    state.svd = { disco: new Array(NUM_OBJECTS).fill(0) };
    let previousClass = -1;
    for (let otyp = FIRST_OBJECT; otyp < NUM_OBJECTS; ++otyp) {
        const objectClass = state.objects[otyp].oc_class;
        if (objectClass !== previousClass) {
            state.svb.bases[objectClass] = otyp;
            previousClass = objectClass;
        }
    }
    state.svb.bases[MAXOCLASSES] = NUM_OBJECTS;
    state.svb.bases[MAXOCLASSES + 1] = NUM_OBJECTS;
    for (let objectClass = MAXOCLASSES - 1; objectClass >= 0; --objectClass) {
        if (!state.svb.bases[objectClass]) {
            state.svb.bases[objectClass] = state.svb.bases[objectClass + 1];
        }
    }
    return state;
}

function ringShuffleSteps() {
    const result = [];
    for (const size of [8, 16, 24])
        for (let bound = size; bound > 1; --bound)
            result.push(step('rn2', [bound], 0));
    return result;
}

test('pet_type preserves fixed-role and preference precedence', () => {
    const noDraw = { rn2: () => assert.fail('unexpected pet_type draw') };
    assert.equal(pet_type({
        state: startingPetState({
            petnum: PM_PONY,
            role: PM_KNIGHT,
            preferredPet: 'c',
        }),
        random: noDraw,
    }), PM_PONY);
    assert.equal(pet_type({
        state: startingPetState({ preferredPet: 'c' }),
        random: noDraw,
    }), PM_KITTEN);
    assert.equal(pet_type({
        state: startingPetState({ preferredPet: 'd' }),
        random: noDraw,
    }), PM_LITTLE_DOG);

    const horseDraws = [];
    assert.equal(pet_type({
        state: startingPetState({ preferredPet: 'h' }),
        random: { rn2: (bound) => (horseDraws.push(bound), 1) },
    }), PM_KITTEN);
    assert.deepEqual(horseDraws, [2]);
});

test('makedog creates a named random dog with exact startup state and RNG', () => {
    const state = startingPetState({ dogname: 'Fido' });
    const random = scriptedRandom([
        step('rn2', [2], 0),
        ...ringShuffleSteps(),
        step('rnd', [2], 1),
        step('d', [1, 8], 5),
        step('rn2', [2], 1),
        step('rn2', [16], 1),
        step('rn2', [2], 1),
    ]);
    const monster = makedog({ state, random: random.random });
    random.assertExhausted();

    assert.equal(monster.mnum, PM_LITTLE_DOG);
    assert.deepEqual([monster.mx, monster.my], [9, 9]);
    assert.deepEqual([monster.mux, monster.muy], [10, 10]);
    assert.deepEqual([monster.m_lev, monster.mhp, monster.mhpmax], [1, 5, 5]);
    assert.equal(monster.m_id, 2);
    assert.equal(monster.female, true);
    assert.equal(monster.mgenmklev, false);
    assert.equal(monster.mextra.mgivenname, 'Fido');
    assert.equal(monster.mextra.edog.parentmid, 0);
    assert.deepEqual(monster.mextra.edog, {
        parentmid: 0,
        droptime: 0,
        dropdist: 10000,
        apport: 0,
        whistletime: 0,
        hungrytime: 1000,
        ogoal: { x: -1, y: -1 },
        abuse: 0,
        revivals: 0,
        mhpmax_penalty: 0,
        killed_by_u: false,
    });
    assert.equal(monster.mtame, 10);
    assert.equal(monster.mpeaceful, true);
    assert.equal(monster.mavenge, false);
    assert.equal(monster.minvent, null);
    assert.equal(state.level.monlist, monster);
    assert.equal(state.context.ident, 3);
    assert.equal(state.context.startingpet_typ, PM_LITTLE_DOG);
    assert.equal(state.context.startingpet_mid, 2);
    assert.equal(state.context.lifelist.total_seen_upclose, 1);
    assert.equal(state.mvitals[PM_LITTLE_DOG].seen_close, 1);
    assert.equal(state.mvitals[PM_LITTLE_DOG].born, 1);
    assert.equal(state.gp.petname_used, 1);
    assert.equal(state.u.uconduct.pets, 1);
});

test('fixed Caveman dog skips selection draw and receives source default name', () => {
    const state = startingPetState({
        petnum: PM_LITTLE_DOG,
        role: PM_CAVE_DWELLER,
    });
    const random = scriptedRandom([
        ...ringShuffleSteps(),
        step('rnd', [2], 1),
        step('d', [1, 8], 4),
        step('rn2', [2], 0),
        step('rn2', [16], 0),
    ]);
    const monster = makedog({ state, random: random.random });
    random.assertExhausted();
    assert.equal(monster.mnum, PM_LITTLE_DOG);
    assert.equal(monster.mextra.mgivenname, 'Slasher');
});

test('starting pony creates and equips a separately identified saddle', () => {
    const state = startingPetState({
        petnum: PM_PONY,
        role: PM_KNIGHT,
        horsename: 'Bucephalus',
        alignmentType: 1,
    });
    const random = scriptedRandom([
        ...ringShuffleSteps(),
        step('rnd', [2], 1),
        step('d', [2, 8], 9),
        step('rn2', [2], 0),
        step('rnd', [2], 1),
    ]);
    const monster = makedog({ state, random: random.random });
    random.assertExhausted();

    assert.equal(monster.mnum, PM_PONY);
    assert.equal(monster.mextra.mgivenname, 'Bucephalus');
    const saddle = monster.minvent;
    assert.equal(saddle.otyp, SADDLE);
    assert.equal(saddle.o_id, 3);
    assert.equal(saddle.where, OBJ_MINVENT);
    assert.equal(saddle.ocarry, monster);
    assert.equal(saddle.owornmask, W_SADDLE);
    assert.equal(saddle.leashmon, monster.m_id);
    assert.equal(monster.misc_worn_check, W_SADDLE);
    assert.equal(saddle.known, true);
    assert.equal(saddle.dknown, true);
    assert.equal(saddle.bknown, true);
    assert.equal(saddle.rknown, true);
    assert.equal(state.objects[SADDLE].oc_name_known, 1);
    assert.equal(state.objects[SADDLE].oc_encountered, 1);
    assert.deepEqual(
        state.svd.disco.slice(
            state.svb.bases[TOOL_CLASS],
            state.svb.bases[TOOL_CLASS + 1],
        ).filter(Boolean),
        [SADDLE],
    );
    assert.equal(state.context.ident, 4);
});

test('blind starting pony forgets saddle-instance knowledge after discovery', () => {
    const state = startingPetState({
        petnum: PM_PONY,
        role: PM_KNIGHT,
        alignmentType: 1,
    });
    state.u.uprops = [];
    // A nonzero intrinsic activates blindness for the pickup visibility path.
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    // Replay the sighted-pony creation draws so blindness is the only changed
    // condition and cannot alter the core PRNG sequence.
    const random = scriptedRandom([
        ...ringShuffleSteps(),
        step('rnd', [2], 1),
        step('d', [2, 8], 9),
        step('rn2', [2], 0),
        step('rnd', [2], 1),
    ]);

    const monster = makedog({ state, random: random.random });
    random.assertExhausted();
    const saddle = monster.minvent;

    // Saddles do not use the `known` bit, so unknow_object() leaves it set.
    assert.equal(saddle.known, true);
    assert.equal(saddle.dknown, false);
    assert.equal(saddle.bknown, false);
    assert.equal(saddle.rknown, false);
    assert.equal(saddle.cknown, false);
    assert.equal(saddle.lknown, false);
    assert.equal(saddle.tknown, false);
    assert.equal(state.objects[SADDLE].oc_name_known, 1);
    assert.equal(state.objects[SADDLE].oc_encountered, 1);
    assert.deepEqual(
        state.svd.disco.slice(
            state.svb.bases[TOOL_CLASS],
            state.svb.bases[TOOL_CLASS + 1],
        ).filter(Boolean),
        [SADDLE],
    );
});

test('pauper pony suppresses saddle creation and its object-id draw', () => {
    const state = startingPetState({
        petnum: PM_PONY,
        role: PM_KNIGHT,
        pauper: true,
        alignmentType: 1,
    });
    const random = scriptedRandom([
        ...ringShuffleSteps(),
        step('rnd', [2], 1),
        step('d', [2, 8], 8),
        step('rn2', [2], 0),
    ]);
    const monster = makedog({ state, random: random.random });
    random.assertExhausted();
    assert.equal(monster.minvent, null);
    assert.equal(state.context.ident, 3);
});

test('preferred pet none suppresses fixed-role pets without drawing', () => {
    const state = startingPetState({
        petnum: PM_KITTEN,
        role: PM_WIZARD,
        preferredPet: 'n',
    });
    const random = scriptedRandom([]);
    assert.equal(makedog({ state, random: random.random }), null);
    random.assertExhausted();
    assert.equal(state.context.startingpet_typ, NON_PM);
    assert.equal(state.context.startingpet_mid, undefined);
    assert.equal(state.gp.petname_used, 0);
    assert.equal(state.level.monlist, null);
    assert.equal(state.mvitals[PM_KITTEN].born, 0);
});
