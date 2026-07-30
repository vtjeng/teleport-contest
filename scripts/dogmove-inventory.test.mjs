import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACCFOOD,
    CADAVER,
    COLNO,
    I_SPECIAL,
    IN_SIGHT,
    MANFOOD,
    MMOVE_DIED,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NON_PM,
    OBJ_FLOOR,
    OBJ_MINVENT,
    ROWNO,
} from '../js/const.js';
import { dog_invent } from '../js/dogmove.js';
import { GameMap } from '../js/game.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    AT_WEAP,
    PM_KITTEN,
    monst_globals_init,
} from '../js/monsters.js';
import {
    BALL_CLASS,
    CHAIN_CLASS,
    DAGGER,
    FOOD_CLASS,
    FOOD_RATION,
    GOLD_PIECE,
    POT_HEALING,
    ROCK_CLASS,
    SCR_MAIL,
    objects_globals_init,
} from '../js/objects.js';

const HERO_DISTANCE = 4; // A nonzero distu() result for an ordinary pet.
const PET_APPORT = 5; // High enough to exercise both apport-based draws.
const PET_X = 5; // An ordinary room coordinate away from map edges.
const PET_Y = 5; // An ordinary room coordinate away from map edges.
const DUMMY_OBJECT_TYPE = 1; // A non-mail type for decision-only objects.

function inventoryState() {
    const level = new GameMap();
    const state = {
        context: {
            achieveo: {
                mines_prize_oid: 0,
                soko_prize_oid: 0,
            },
        },
        level,
        moves: 17, // Distinct from the initial turn for droptime checks.
    };
    const monster = {
        data: {},
        mcanmove: true,
        meating: 0,
        minvent: null,
        msleeping: false,
        mx: PET_X,
        my: PET_Y,
    };
    const edog = {
        apport: PET_APPORT,
        dropdist: 0,
        droptime: 0,
        mhpmax_penalty: 0,
    };
    return { state, monster, edog };
}

function floorObject(state, overrides = {}) {
    const obj = {
        cursed: false,
        nexthere: null,
        o_id: 101, // A live non-prize object id.
        oclass: FOOD_CLASS,
        ox: PET_X,
        oy: PET_Y,
        otyp: DUMMY_OBJECT_TYPE,
        quan: 1,
        ...overrides,
    };
    state.level.objects[PET_X][PET_Y] = obj;
    return obj;
}

function noFloorActionEnv(state, overrides = {}) {
    return {
        canCarry: () => 0,
        couldReachItem: () => true,
        dogfood: () => MANFOOD,
        droppables: () => null,
        random: {
            rn2: () => 1,
        },
        state,
        ...overrides,
    };
}


// The pickup arm runs the real splitobj(), obj_extract_self(), mpickobj() and
// doname(), so it needs the object and monster catalogs, a map, and a hero
// position from which the pet's square is both visible and near.
function pickupState() {
    const state = {
        context: {
            achieveo: { mines_prize_oid: 0, soko_prize_oid: 0 },
            ident: 500, // Any live object-id counter for splitobj().
        },
        flags: { verbose: true, implicit_uncursed: true },
        iflags: {},
        level: new GameMap(),
        moves: 17,
        program_state: {},
        u: {
            ux: PET_X,
            uy: PET_Y,
            uprops: [],
            xray_range: 0,
        },
        viz_array: Array.from(
            { length: ROWNO },
            () => new Array(COLNO).fill(0),
        ),
    };
    objects_globals_init(state);
    // Zero choices deterministically initialize every randomized description.
    init_objects(state, () => 0);
    monst_globals_init(state);
    state.viz_array[PET_Y][PET_X] = IN_SIGHT;
    const monster = {
        data: state.mons[PM_KITTEN],
        mcanmove: true,
        meating: 0,
        minvent: null,
        misc_worn_check: 0,
        msleeping: false,
        mtame: 1,
        mx: PET_X,
        my: PET_Y,
    };
    const edog = {
        apport: PET_APPORT,
        dropdist: 0,
        droptime: 0,
        mhpmax_penalty: 0,
    };
    return { state, monster, edog };
}

function floorStack(state, otyp, quan) {
    const obj = newObject({
        corpsenm: NON_PM,
        o_id: 101, // A live non-prize object id.
        oclass: state.objects[otyp].oc_class,
        otyp,
        ox: PET_X,
        oy: PET_Y,
        quan,
        where: OBJ_FLOOR,
    });
    obj.owt = quan;
    state.level.objects[PET_X][PET_Y] = obj;
    state.level.objlist = obj;
    return obj;
}

// obj.js requires the whole source random set even though the only draw the
// pickup arm reaches through it is next_ident()'s rnd(2).
function pickupRandom(bounds, values) {
    const unreached = (name) => () => {
        throw new Error(`pickup test reached ${name}`);
    };
    return {
        d: unreached('d'),
        rn1: unreached('rn1'),
        rne: unreached('rne'),
        rnl: unreached('rnl'),
        rnz: unreached('rnz'),
        rnd: () => 1, // next_ident() advances context.ident by rnd(2).
        rn2(bound) {
            bounds.push(bound);
            const next = values.shift();
            if (next === undefined)
                throw new Error(`pickup test ran out of rn2(${bound}) values`);
            return next;
        },
    };
}

function pickupEnv(state, overrides = {}) {
    return {
        couldReachItem: () => true,
        dogfood: () => MANFOOD,
        droppables: () => null,
        state,
        ...overrides,
    };
}

test('dog_invent stops before callbacks for helpless or eating pets', async () => {
    for (const field of ['msleeping', 'mcanmove', 'meating']) {
        const { state, monster, edog } = inventoryState();
        monster[field] = field === 'mcanmove'
            ? false
            : 1; // One is enough for either sleeping or eating.
        let inspected = false;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            {
                droppables: () => {
                    inspected = true;
                    return null;
                },
                state,
            },
        );
        assert.equal(result, MMOVE_NOTHING);
        assert.equal(inspected, false);
    }
});

test('dog_invent preserves drop draw short-circuit order and state', async () => {
    const { state, monster, edog } = inventoryState();
    const bounds = [];
    const values = [
        0, // The first zero-test succeeds and skips rn2(apport).
        PET_APPORT - 1, // The final draw remains below apport and drops.
    ];
    let drops = 0;
    const result = await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        {
            dropInventory: async () => {
                drops++;
            },
            droppables: () => ({ otyp: DUMMY_OBJECT_TYPE }),
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return values.shift();
                },
            },
            state,
        },
    );

    assert.equal(result, MMOVE_NOTHING);
    assert.deepEqual(bounds, [
        HERO_DISTANCE + 1,
        10, // The final drop-probability bound.
    ]);
    assert.equal(drops, 1);
    assert.equal(edog.apport, PET_APPORT - 1);
    assert.equal(edog.dropdist, HERO_DISTANCE);
    assert.equal(edog.droptime, state.moves);
});

test('dog_invent omits the final drop draw when both gates miss', async () => {
    const { state, monster, edog } = inventoryState();
    const bounds = [];
    const result = await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        {
            droppables: () => ({ otyp: DUMMY_OBJECT_TYPE }),
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return 1; // Both zero-tests miss.
                },
            },
            state,
        },
    );

    assert.equal(result, MMOVE_NOTHING);
    assert.deepEqual(bounds, [HERO_DISTANCE + 1, PET_APPORT]);
});

test('dog_invent rejects nofetch classes, mail, and prize ids', async () => {
    const rejectedObjects = [
        { oclass: BALL_CLASS },
        { oclass: CHAIN_CLASS },
        { oclass: ROCK_CLASS },
        { otyp: SCR_MAIL },
        // Distinct live ids exercise each achievement-tracking field.
        { o_id: 201, prize: 'mines_prize_oid' },
        { o_id: 202, prize: 'soko_prize_oid' },
    ];
    for (const rejected of rejectedObjects) {
        const { state, monster, edog } = inventoryState();
        const obj = floorObject(state, rejected);
        if (rejected.prize)
            state.context.achieveo[rejected.prize] = rejected.o_id;
        let classified = false;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            noFloorActionEnv(state, {
                dogfood: () => {
                    classified = true;
                    return CADAVER;
                },
            }),
        );
        assert.equal(result, MMOVE_NOTHING);
        assert.equal(classified, false);
        assert.equal(
            state.level.objects[PET_X][PET_Y],
            obj,
            'the first floor object remains untouched',
        );
    }
});

test('dog_invent eats eligible food and propagates death', async () => {
    for (const expected of [MMOVE_MOVED, MMOVE_DIED]) {
        const { state, monster, edog } = inventoryState();
        const obj = floorObject(state);
        let eatenArgs;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            noFloorActionEnv(state, {
                dogfood: () => CADAVER,
                eatObject: async (...args) => {
                    eatenArgs = args;
                    return expected;
                },
            }),
        );
        assert.equal(result, expected);
        assert.deepEqual(eatenArgs.slice(0, 5), [
            monster,
            obj,
            PET_X,
            PET_Y,
            false,
        ]);
        assert.equal(eatenArgs[5].state, state);
    }
});

test('dog_invent admits acceptable food only for a starving pet', async () => {
    for (const starving of [false, true]) {
        const { state, monster, edog } = inventoryState();
        floorObject(state);
        edog.mhpmax_penalty = starving
            ? 2 // Any positive penalty marks the pet as starving.
            : 0;
        let ate = false;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            noFloorActionEnv(state, {
                dogfood: () => ACCFOOD,
                eatObject: async () => {
                    ate = true;
                    return MMOVE_MOVED;
                },
            }),
        );
        assert.equal(result, starving ? MMOVE_MOVED : MMOVE_NOTHING);
        assert.equal(ate, starving);
    }
});

test('dog_invent picks a whole stack up, names it, and redraws', async () => {
    const { state, monster, edog } = pickupState();
    const ration = floorStack(state, FOOD_RATION, 1);
    const bounds = [];
    const values = [
        PET_APPORT + 2, // rn2(20) still passes the strict apport+3 test.
        0, // rn2(udist) fails, so the apport fallback is evaluated.
        0, // rn2(apport) succeeds.
    ];
    const messages = [];
    const redraws = [];

    const result = await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        pickupEnv(state, {
            message: async (text) => { messages.push(text); },
            // C redraws after obj_extract_self(), so the pile is already
            // empty by the time newsym() reads the square.
            redraw: (x, y) => {
                redraws.push([x, y, state.level.objects[x][y]]);
            },
            random: pickupRandom(bounds, values),
        }),
    );

    assert.equal(result, MMOVE_NOTHING);
    assert.deepEqual(bounds, [20, HERO_DISTANCE, PET_APPORT]);
    assert.deepEqual(messages, ['The kitten picks up a food ration.']);
    assert.deepEqual(redraws, [[PET_X, PET_Y, null]]);
    assert.equal(state.level.objects[PET_X][PET_Y], null);
    assert.equal(state.level.objlist, null);
    assert.equal(monster.minvent, ration);
    assert.equal(ration.where, OBJ_MINVENT);
    assert.equal(ration.ocarry, monster);
    // check_gear_next_turn() asks dochug() to reassess gear next move.
    assert.equal(monster.misc_worn_check & I_SPECIAL, I_SPECIAL);
});

test('dog_invent splits a stack it can only carry part of', async () => {
    const { state, monster, edog } = pickupState();
    // A nohands pet takes one coin from a pile; can_carry() caps it at 1.
    const gold = floorStack(state, GOLD_PIECE, 4);
    const messages = [];

    await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        pickupEnv(state, {
            canCarry: () => 1,
            message: async (text) => { messages.push(text); },
            random: pickupRandom([], [PET_APPORT + 2, 0, 0]),
        }),
    );

    assert.deepEqual(messages, ['The kitten picks up a gold piece.']);
    assert.equal(state.level.objects[PET_X][PET_Y], gold);
    assert.equal(gold.quan, 3);
    assert.equal(gold.where, OBJ_FLOOR);
    const taken = monster.minvent;
    assert.notEqual(taken, gold);
    assert.equal(taken.otyp, GOLD_PIECE);
    assert.equal(taken.quan, 1);
    assert.equal(taken.nobj, null);
});

test('dog_invent runs distant_name for its side effects when quiet',
    async () => {
        // flags.verbose off suppresses the line but not the naming call, so
        // the type still enters the discoveries list.
        const { state, monster, edog } = pickupState();
        state.flags.verbose = false;
        const potion = floorStack(state, POT_HEALING, 1);
        const messages = [];

        await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            pickupEnv(state, {
                message: async (text) => { messages.push(text); },
                random: pickupRandom([], [PET_APPORT + 2, 0, 0]),
            }),
        );

        assert.deepEqual(messages, []);
        assert.equal(potion.dknown, true);
        assert.equal(state.objects[POT_HEALING].oc_encountered, 1);
        assert.equal(monster.minvent, potion);
    });

test('dog_invent leaves a visible but far stack unidentified', async () => {
    // The pet's square is lit, so the line prints, but distu() is 9 and
    // distant_name()'s near square only reaches 6. C names it with
    // gd.distantname raised, which withholds dknown and the discovery.
    const { state, monster, edog } = pickupState();
    state.u.ux = PET_X + 3;
    const potion = floorStack(state, POT_HEALING, 1);
    const messages = [];

    await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        pickupEnv(state, {
            message: async (text) => { messages.push(text); },
            random: pickupRandom([], [PET_APPORT + 2, 0, 0]),
        }),
    );

    assert.deepEqual(messages, ['The kitten picks up a potion.']);
    assert.equal(potion.dknown, false);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 0);
});

test('dog_invent names nothing on a square the hero cannot see', async () => {
    const { state, monster, edog } = pickupState();
    state.viz_array[PET_Y][PET_X] = 0;
    const potion = floorStack(state, POT_HEALING, 1);
    const messages = [];

    await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        pickupEnv(state, {
            message: async (text) => { messages.push(text); },
            random: pickupRandom([], [PET_APPORT + 2, 0, 0]),
        }),
    );

    assert.deepEqual(messages, []);
    // distant_name() never ran, so nothing observed the potion at all.
    assert.equal(potion.dknown, false);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 0);
    assert.equal(monster.minvent, potion);
});

test('dog_invent hands an AT_WEAP carrier to its weapon owner', async () => {
    const { state, monster, edog } = pickupState();
    // A soldier ant has no AT_WEAP attack; give the pet one so the arm fires.
    monster.data = { ...monster.data, mattk: [{ aatyp: AT_WEAP }] };
    monster.weapon_check = NEED_WEAPON;
    floorStack(state, DAGGER, 1);
    const wields = [];

    await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        pickupEnv(state, {
            message: async () => {},
            random: pickupRandom([], [PET_APPORT + 2, 0, 0]),
            wieldPickedItem: (subject) => {
                wields.push(subject.weapon_check);
            },
        }),
    );

    // C sets NEED_HTH_WEAPON before calling mon_wield_item().
    assert.deepEqual(wields, [NEED_HTH_WEAPON]);
    assert.equal(monster.misc_worn_check & I_SPECIAL, I_SPECIAL);
});

test('dog_invent short-circuits the apport pickup draw after movement wins',
    async () => {
        const { state, monster, edog } = pickupState();
        floorStack(state, FOOD_RATION, 1);
        const bounds = [];
        const values = [
            0, // rn2(20) passes.
            1, // rn2(udist) succeeds and skips rn2(apport).
        ];

        await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            pickupEnv(state, {
                message: async () => {},
                random: pickupRandom(bounds, values),
            }),
        );

        assert.notEqual(monster.minvent, null);
        assert.deepEqual(bounds, [20, HERO_DISTANCE]);
    });

test('dog_invent checks curse and reachability before pickup randomness',
    async () => {
        for (const blockedBy of ['curse', 'reachability']) {
            const { state, monster, edog } = inventoryState();
            floorObject(state, { cursed: blockedBy === 'curse' });
            let draws = 0;
            const result = await dog_invent(
                monster,
                edog,
                HERO_DISTANCE,
                noFloorActionEnv(state, {
                    canCarry: () => 1,
                    couldReachItem: () => blockedBy !== 'reachability',
                    random: {
                        rn2() {
                            draws++;
                            return 0;
                        },
                    },
                }),
            );
            assert.equal(result, MMOVE_NOTHING);
            assert.equal(draws, 0);
        }
    });
