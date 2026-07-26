import assert from 'node:assert/strict';
import test from 'node:test';

import {
    APPORT,
    D_CLOSED,
    DOGFOOD,
    DOOR,
    LAVAPOOL,
    MAGIC_PORTAL,
    MANFOOD,
    POOL,
    ROOM,
    STONE,
    UNDEF,
    W_ARMS,
} from '../js/const.js';
import {
    can_reach_location,
    could_reach_item,
    cursed_object_at,
    dog_goal,
    droppables,
} from '../js/dogmove_goal.js';
import { GameMap } from '../js/game.js';
import {
    M1_ANIMAL,
    M1_NEEDPICK,
    M1_SWIM,
    M1_TUNNEL,
    M2_ROCKTHROW,
    PM_FIRE_ELEMENTAL,
} from '../js/monsters.js';
import {
    BOULDER,
    CREDIT_CARD,
    DWARVISH_MATTOCK,
    LOCK_PICK,
    PICK_AXE,
    SADDLE,
    SKELETON_KEY,
    SMALL_SHIELD,
    UNICORN_HORN,
} from '../js/objects.js';
import { initrack, settrack } from '../js/track.js';

function petState() {
    const level = new GameMap();
    for (let x = 1; x <= 12; ++x) {
        for (let y = 1; y <= 9; ++y) {
            level.at(x, y).typ = ROOM;
            level.at(x, y).lit = true;
        }
    }
    const state = {
        gg: {},
        invent: null,
        level,
        moves: 2,
        rogue_level: { dnum: 9, dlevel: 9 },
        stairs: null,
        u: {
            ux: 7,
            uy: 5,
            uz: { dnum: 0, dlevel: 1 },
            usteed: null,
        },
    };
    initrack(state);
    const monster = {
        data: {
            mflags1: 0,
            mflags2: 0,
        },
        mx: 5,
        my: 5,
        mflee: false,
        mconf: false,
        mleashed: false,
    };
    const edog = {
        apport: 10,
        hungrytime: 1001,
        mhpmax_penalty: 0,
        ogoal: { x: 0, y: 0 },
    };
    return { state, monster, edog };
}

function goalEnv(state, overrides = {}) {
    return {
        state,
        random: {
            rn2: () => 1,
        },
        couldSee: () => true,
        dogfood: () => UNDEF,
        droppables: () => null,
        canCarry: () => 0,
        ...overrides,
    };
}

test('could_reach_item preserves water, lava, and boulder gates', () => {
    const { state, monster } = petState();
    const target = state.level.at(6, 5);

    target.typ = POOL;
    assert.equal(could_reach_item(monster, 6, 5, state), false);
    monster.data.mflags1 = M1_SWIM;
    assert.equal(could_reach_item(monster, 6, 5, state), true);

    target.typ = ROOM;
    monster.data.mflags1 = 0;
    state.level.objects[6][5] = {
        otyp: BOULDER,
        nexthere: null,
    };
    assert.equal(could_reach_item(monster, 6, 5, state), false);
    monster.data.mflags2 = M2_ROCKTHROW;
    assert.equal(could_reach_item(monster, 6, 5, state), true);

    // likes_lava() is species-specific rather than a generic flag.
    monster.data = { pmidx: PM_FIRE_ELEMENTAL, mflags1: 0, mflags2: 0 };
    target.typ = LAVAPOOL;
    state.level.objects[6][5] = null;
    assert.equal(could_reach_item(monster, 6, 5, state), true);
});

test('cursed_object_at scans the complete square pile', () => {
    const { state } = petState();
    state.level.objects[6][5] = {
        cursed: false,
        nexthere: { cursed: true, nexthere: null },
    };
    assert.equal(cursed_object_at(6, 5, state), true);
    assert.equal(cursed_object_at(7, 5, state), false);
});

test('droppables preserves one useful tool and skips worn equipment', () => {
    const { monster } = petState();
    const wornSaddle = {
        otyp: SADDLE,
        owornmask: 1, // Any nonzero worn slot excludes this ordinary object.
        nobj: null,
    };
    const pick = {
        otyp: PICK_AXE,
        owornmask: 0,
        nobj: wornSaddle,
    };
    const card = {
        otyp: CREDIT_CARD,
        owornmask: 0,
        nobj: pick,
    };
    const key = {
        otyp: SKELETON_KEY,
        owornmask: 0,
        nobj: card,
    };
    monster.minvent = key;
    assert.equal(droppables(monster), card);

    // Animals reserve none of these tools, so list order wins.
    monster.data.mflags1 = M1_ANIMAL;
    assert.equal(droppables(monster), key);
});

test('droppables sentinel rejects artifact tools an animal cannot use', () => {
    const { monster } = petState();
    const artifactHorn = {
        cursed: false,
        oartifact: 1, // Any artifact exercises replacement of the C dummy.
        otyp: UNICORN_HORN,
        owornmask: 0,
        nobj: null,
    };
    monster.data.mflags1 = M1_ANIMAL;
    monster.minvent = artifactHorn;

    assert.equal(droppables(monster), artifactHorn);
});

test('droppables preserves artifact and utility-tool preference order', () => {
    const { monster } = petState();
    monster.data.mflags1 = M1_TUNNEL | M1_NEEDPICK;

    const artifactPick = {
        oartifact: 1, // The later artifact replaces an ordinary reserved pick.
        otyp: PICK_AXE,
        owornmask: 0,
        nobj: null,
    };
    const ordinaryPick = {
        oartifact: 0,
        otyp: PICK_AXE,
        owornmask: 0,
        nobj: artifactPick,
    };
    monster.minvent = ordinaryPick;
    assert.equal(droppables(monster), ordinaryPick);

    const mattock = {
        oartifact: 0,
        otyp: DWARVISH_MATTOCK,
        owornmask: 0,
        nobj: null,
    };
    const shield = {
        oartifact: 0,
        otyp: SMALL_SHIELD,
        owornmask: W_ARMS,
        nobj: mattock,
    };
    monster.minvent = shield;
    assert.equal(
        droppables(monster),
        mattock,
        'a shield makes the unworn mattock available to drop',
    );

    const card = {
        oartifact: 0,
        otyp: CREDIT_CARD,
        owornmask: 0,
        nobj: null,
    };
    const pick = {
        oartifact: 0,
        otyp: LOCK_PICK,
        owornmask: 0,
        nobj: card,
    };
    const key = {
        oartifact: 0,
        otyp: SKELETON_KEY,
        owornmask: 0,
        nobj: pick,
    };
    monster.minvent = key;
    assert.equal(
        droppables(monster),
        pick,
        'the skeleton key is reserved and the next redundant key is dropped',
    );
});

test('can_reach_location follows decreasing-distance squares', () => {
    const { state, monster } = petState();
    assert.equal(
        can_reach_location(monster, 5, 5, 8, 5, state),
        true,
    );

    // A full stone column separates the start from the goal; the bounded
    // recursion cannot route around it while monotonically approaching.
    for (let y = 1; y <= 9; ++y)
        state.level.at(6, y).typ = STONE;
    assert.equal(
        can_reach_location(monster, 5, 5, 8, 5, state),
        false,
    );

    monster.data.mflags1 = M1_TUNNEL | M1_NEEDPICK;
    assert.equal(
        can_reach_location(monster, 5, 5, 8, 5, state),
        true,
    );
    state.u.uz = { ...state.rogue_level };
    assert.equal(
        can_reach_location(monster, 5, 5, 8, 5, state),
        false,
        'the rogue level disables tunneling through the obstacle',
    );
});

test('can_reach_location refuses closed doors', () => {
    const { state, monster } = petState();
    for (let y = 1; y <= 9; ++y) {
        const door = state.level.at(6, y);
        door.typ = DOOR;
        door.flags = D_CLOSED;
    }

    assert.equal(
        can_reach_location(monster, 5, 5, 8, 5, state),
        false,
    );
});

test('dog_goal returns approach separately from its shared goal scratch',
    () => {
        const { state, monster, edog } = petState();
        const bounds = [];
        const approach = dog_goal(
            monster,
            edog,
            false,
            4, // Distance greater than one reaches the room-following draw.
            false,
            goalEnv(state, {
                random: {
                    rn2(bound) {
                        bounds.push(bound);
                        return 1; // Miss the one-in-four close-following gate.
                    },
                },
            }),
        );
        assert.equal(approach, 0);
        assert.deepEqual(bounds, [4]);
        assert.deepEqual(state.gg, {
            gtyp: UNDEF,
            gx: state.u.ux,
            gy: state.u.uy,
        });
    });

test('dog_goal applies its early follow and confusion branches', () => {
    const afterCase = petState();
    const afterBounds = [];
    assert.equal(dog_goal(
        afterCase.monster,
        afterCase.edog,
        true,
        4, // An adjacent after-move pet aborts before approach randomness.
        false,
        goalEnv(afterCase.state, {
            random: {
                rn2(bound) {
                    afterBounds.push(bound);
                    return 0;
                },
            },
        }),
    ), -2);
    assert.deepEqual(afterBounds, []);

    const leashedCase = petState();
    leashedCase.monster.mleashed = true;
    assert.equal(dog_goal(
        leashedCase.monster,
        leashedCase.edog,
        false,
        4, // Leashed pets have an APPORT goal and approach directly.
        false,
        goalEnv(leashedCase.state),
    ), 1);
    assert.equal(leashedCase.state.gg.gtyp, APPORT);

    leashedCase.monster.mconf = true;
    assert.equal(dog_goal(
        leashedCase.monster,
        leashedCase.edog,
        false,
        4,
        false,
        goalEnv(leashedCase.state),
    ), 0);
});

test('dog_goal forwards its PRNG environment into food classification', () => {
    const { state, monster, edog } = petState();
    const food = {
        ox: 6,
        oy: 5,
        nobj: null,
        nexthere: null,
    };
    state.level.objlist = food;
    state.level.objects[6][5] = food;
    const random = { rn2: () => 1 };
    const environments = [];

    dog_goal(monster, edog, false, 4, false, goalEnv(state, {
        random,
        dogfood(_monster, _obj, operationEnv) {
            environments.push(operationEnv);
            return UNDEF;
        },
    }));

    assert.equal(environments.length, 1);
    assert.equal(environments[0].random, random);
    assert.equal(environments[0].state, state);
});

test('dog_goal prefers better food then the nearer equal food', () => {
    const { state, monster, edog } = petState();
    const farther = {
        ox: 8,
        oy: 5,
        kind: DOGFOOD,
        cursed: false,
        nobj: null,
        nexthere: null,
    };
    const nearer = {
        ox: 6,
        oy: 5,
        kind: DOGFOOD,
        cursed: false,
        nobj: farther,
        nexthere: null,
    };
    const worse = {
        ox: 5,
        oy: 6,
        kind: MANFOOD,
        cursed: false,
        nobj: nearer,
        nexthere: null,
    };
    state.level.objlist = worse;
    state.level.objects[5][6] = worse;
    state.level.objects[6][5] = nearer;
    state.level.objects[8][5] = farther;

    const approach = dog_goal(
        monster,
        edog,
        false,
        4,
        false,
        goalEnv(state, {
            dogfood: (_monster, obj) => obj.kind,
            canCarry: () => 1,
        }),
    );
    assert.equal(approach, 1);
    assert.deepEqual(state.gg, {
        gtyp: DOGFOOD,
        gx: nearer.ox,
        gy: nearer.oy,
    });
});

test('dog_goal avoids cursed food unless starvation admits it', () => {
    for (const starving of [false, true]) {
        const { state, monster, edog } = petState();
        const food = {
            ox: 6,
            oy: 5,
            kind: DOGFOOD,
            cursed: true,
            nobj: null,
            nexthere: null,
        };
        state.level.objlist = food;
        state.level.objects[6][5] = food;
        edog.mhpmax_penalty = starving ? 2 : 0;

        dog_goal(monster, edog, false, 4, false, goalEnv(state, {
            dogfood: (_monster, obj) => obj.kind,
        }));
        assert.equal(
            state.gg.gtyp,
            starving ? DOGFOOD : UNDEF,
            `starving=${starving}`,
        );
    }
});

test('dog_goal rejects food whose location cannot be reached', () => {
    const { state, monster, edog } = petState();
    const food = {
        ox: 6,
        oy: 5,
        kind: DOGFOOD,
        cursed: false,
        nobj: null,
        nexthere: null,
    };
    state.level.objlist = food;
    state.level.objects[6][5] = food;
    const calls = [];

    dog_goal(monster, edog, false, 4, false, goalEnv(state, {
        dogfood: (_monster, obj) => obj.kind,
        canReachLocation(_monster, fromX, fromY, toX, toY) {
            calls.push([fromX, fromY, toX, toY]);
            return false;
        },
    }));

    assert.deepEqual(calls, [[5, 5, 6, 5]]);
    assert.equal(state.gg.gtyp, UNDEF);
});

test('dog_goal applies pet sight before the apport and carrying draws', () => {
    const { state, monster, edog } = petState();
    const fetchable = {
        ox: 6,
        oy: 5,
        kind: APPORT,
        cursed: false,
        nobj: null,
        nexthere: null,
    };
    state.level.objlist = fetchable;
    state.level.objects[6][5] = fetchable;
    const calls = [];

    dog_goal(monster, edog, false, 4, false, goalEnv(state, {
        dogfood: (_monster, obj) => obj.kind,
        petCanSee(subject, x, y) {
            calls.push(['sight', subject, x, y]);
            return true;
        },
        random: {
            rn2(bound) {
                calls.push(['rn2', bound]);
                return 0; // Pass apport's one-in-eight comparison.
            },
        },
        canCarry(subject, obj) {
            calls.push(['carry', subject, obj]);
            return 1; // One carried item is sufficient for this goal.
        },
    }));

    assert.deepEqual(calls.map((call) => call[0]), [
        'sight',
        'rn2',
        'carry',
    ]);
    assert.deepEqual(
        { gtyp: state.gg.gtyp, gx: state.gg.gx, gy: state.gg.gy },
        { gtyp: APPORT, gx: 6, gy: 5 },
    );
});

test('dog_goal follows stairs, nearby portals, and carried dog food', () => {
    for (const setup of [
        (state) => {
            state.stairs = {
                sx: state.u.ux,
                sy: state.u.uy,
                next: null,
            };
        },
        (state) => {
            state.level.traps = [{
                ttyp: MAGIC_PORTAL,
                tx: state.u.ux + 1,
                ty: state.u.uy,
            }];
        },
        (state) => {
            state.invent = { kind: DOGFOOD, nobj: null };
        },
    ]) {
        const { state, monster, edog } = petState();
        setup(state);
        assert.equal(dog_goal(
            monster,
            edog,
            false,
            4,
            false,
            goalEnv(state, {
                dogfood: (_monster, obj) => obj.kind ?? UNDEF,
            }),
        ), 1);
    }
});

test('dog_goal skips the close-following draw outside a room', () => {
    const { state, monster, edog } = petState();
    state.level.at(state.u.ux, state.u.uy).typ = STONE;
    const bounds = [];

    assert.equal(dog_goal(
        monster,
        edog,
        false,
        4, // The pet is close enough that room terrain controls the branch.
        false,
        goalEnv(state, {
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return 1;
                },
            },
        }),
    ), 1);
    assert.deepEqual(
        bounds,
        [],
        'non-room terrain short-circuits before rn2(4)',
    );
});

test('dog_goal uses the newest adjacent track for an unseen hero', () => {
    const { state, monster, edog } = petState();
    state.u.ux = 4;
    state.u.uy = 5;
    settrack(state);
    state.u.ux = 20;
    state.u.uy = 10;

    dog_goal(monster, edog, false, 400, false, goalEnv(state, {
        couldSee: () => false,
    }));
    assert.deepEqual(
        { x: state.gg.gx, y: state.gg.gy },
        { x: 4, y: 5 },
    );
    assert.equal(edog.ogoal.x, 0);
});

test('dog_goal reuses then clears an unseen previous goal', () => {
    const { state, monster, edog } = petState();
    state.u.ux = 20;
    state.u.uy = 10;
    edog.ogoal = { x: 6, y: 5 };

    dog_goal(monster, edog, false, 400, false, goalEnv(state, {
        couldSee: () => false,
    }));

    assert.deepEqual(
        { x: state.gg.gx, y: state.gg.gy },
        { x: 6, y: 5 },
    );
    assert.equal(edog.ogoal.x, 0);
});

test('dog_goal fallback keeps the first nearest clear-area square', () => {
    const { state, monster, edog } = petState();
    state.u.ux = 20;
    state.u.uy = 10;
    const visited = [];

    dog_goal(monster, edog, false, 400, false, goalEnv(state, {
        couldSee: () => false,
        clearArea(_x, _y, range, callback, argument, suppliedState) {
            assert.equal(range, 9);
            assert.equal(argument, null);
            assert.equal(suppliedState, state);
            for (const square of [
                { x: 6, y: 5 },
                { x: 7, y: 5 },
                { x: 7, y: 6 },
            ]) {
                visited.push(square);
                callback(square.x, square.y);
            }
        },
    }));

    assert.equal(visited.length, 3);
    assert.deepEqual(
        { x: state.gg.gx, y: state.gg.gy },
        { x: 7, y: 6 },
    );
    assert.deepEqual(edog.ogoal, { x: 7, y: 6 });
});

test('dog_goal fallback returns to the hero when no square improves', () => {
    const { state, monster, edog } = petState();
    state.u.ux = 20;
    state.u.uy = 10;

    dog_goal(monster, edog, false, 400, false, goalEnv(state, {
        couldSee: () => false,
        clearArea(_x, _y, _range, _callback) {
            // A vault-like clear-area scan can produce no callback.
        },
    }));

    assert.deepEqual(
        { x: state.gg.gx, y: state.gg.gy },
        { x: state.u.ux, y: state.u.uy },
    );
    assert.deepEqual(edog.ogoal, { x: 0, y: 0 });
});

test('dog_goal returns before dependencies for a ridden steed', () => {
    const { state, monster, edog } = petState();
    state.u.usteed = monster;
    assert.equal(dog_goal(monster, edog, true, 0, false, {
        state,
        random: {},
    }), -2);
    assert.deepEqual(state.gg, {});
});
