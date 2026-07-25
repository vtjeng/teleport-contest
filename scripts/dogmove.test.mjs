import assert from 'node:assert/strict';
import test from 'node:test';

import {
    APPORT,
    ALLOW_M,
    ALLOW_TRAPS,
    ALLOW_U,
    CADAVER,
    CONFLICT,
    DISMOUNT_THROWN,
    DOGFOOD,
    LAVAPOOL,
    MANFOOD,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    POOL,
    ROOM,
    STONE,
    UNDEF,
} from '../js/const.js';
import {
    can_reach_location,
    could_reach_item,
    cursed_object_at,
    dog_goal,
    dog_move,
    droppables,
} from '../js/dogmove.js';
import { GameMap } from '../js/game.js';
import { initrack, settrack } from '../js/track.js';
import {
    M1_SWIM,
    M1_ANIMAL,
    M2_ROCKTHROW,
    MONSTER_TEMPLATES,
    PM_FIRE_ELEMENTAL,
    PM_LITTLE_DOG,
} from '../js/monsters.js';
import { place_monster } from '../js/monst.js';
import {
    BOULDER,
    CREDIT_CARD,
    FOOD_CLASS,
    PICK_AXE,
    SADDLE,
    SKELETON_KEY,
} from '../js/objects.js';

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

function movementEnv(state, overrides = {}) {
    return goalEnv(state, {
        random: {
            // Choose the second outcome when it exists while keeping rn2(1)
            // at its only valid result for single-candidate selection.
            rn2: (bound) => Math.min(1, bound - 1),
        },
        avoidKicked: () => false,
        avoidSokobanPush: () => false,
        maxPassiveDamage: () => 0,
        monsterReflects: () => false,
        resistsStone: () => false,
        bestTarget: () => null,
        petRangedAttack: () => MMOVE_NOTHING,
        mayCrossRegion: () => true,
        digWeaponCheck: () => false,
        canSeeMonster: () => false,
        monAllowFlags: () => 0,
        ...overrides,
    });
}

function activePetState(x = 5, y = 5) {
    const setup = petState();
    const { edog, monster, state } = setup;
    state.mons = MONSTER_TEMPLATES;
    state.u.uprops = [];
    state.youmonst = { data: state.mons[PM_LITTLE_DOG] };
    state.water_level = { dnum: 9, dlevel: 8 };
    monster.data = state.mons[PM_LITTLE_DOG];
    monster.mx = x;
    monster.my = y;
    monster.mcanmove = true;
    monster.mcansee = true;
    monster.mextra = { edog };
    monster.mhp = monster.mhpmax = 8;
    monster.mpeaceful = true;
    monster.mtame = 10;
    monster.mtrack = Array.from(
        { length: 4 },
        () => ({ x: 0, y: 0 }),
    );
    state.level.monlist = monster;
    place_monster(monster, monster.mx, monster.my, state);
    return setup;
}

function fixedCandidates(candidates) {
    return (_monster, data) => {
        data.cnt = candidates.length;
        data.poss = candidates.map(({ x, y }) => ({ x, y }));
        data.info = candidates.map(({ info }) => info);
        return candidates.length;
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
        owornmask: 1,
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
    monster.data.mflags1 = 0;
    monster.minvent = key;
    assert.equal(droppables(monster), card);

    // Animals reserve none of these tools, so list order wins.
    monster.data.mflags1 = M1_ANIMAL;
    assert.equal(droppables(monster), key);
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
});

test('dog_goal follows the hero and preserves the rn2(4) gate', () => {
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

test('dog_goal uses the newest adjacent track for an unseen hero', () => {
    const { state, monster, edog } = petState();
    state.u.ux = 20;
    state.u.uy = 10;
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

test('dog_goal returns before dependencies for a ridden steed', () => {
    const { state, monster, edog } = petState();
    state.u.usteed = monster;
    assert.equal(dog_goal(monster, edog, true, 0, false, {
        state,
        random: {},
    }), -2);
    assert.deepEqual(state.gg, {});
});

test('dog_move preserves x-major candidate draws and relocates the pet',
    async () => {
        const { state, monster } = activePetState();
        state.u.ux = 6;
        state.u.uy = 5;

        const bounds = [];
        const result = await dog_move(monster, false, movementEnv(state, {
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return bound - 1;
                },
                rnd: () => 1,
            },
            mHarmlessTrap: () => true,
            mmAggression: () => 0,
            mmDisplacement: () => 0,
            onScary: () => false,
        }));

        assert.equal(result, 1); // dogmove.c MMOVE_MOVED.
        assert.deepEqual([monster.mx, monster.my], [4, 4]);
        assert.deepEqual(monster.mtrack[0], { x: 5, y: 5 });
        assert.deepEqual(
            bounds,
            [1, 2, 3, 4, 5, 6, 7],
            'the hero square is excluded, leaving seven candidates',
        );
    });

test('dog_move throws a conflicted steed before inventory work', async () => {
    const { state, monster } = activePetState();
    state.u.usteed = monster;
    state.u.uprops[CONFLICT] = {
        intrinsic: 1, // An active intrinsic reaches the steed conflict gate.
        extrinsic: 0,
        blocked: 0,
    };
    const events = [];

    const result = await dog_move(monster, false, movementEnv(state, {
        resistConflict: () => false,
        dismountSteed(reason) {
            events.push(['dismount', reason]);
        },
        droppables: () => assert.fail('inventory must not run'),
    }));

    assert.equal(result, MMOVE_MOVED);
    assert.deepEqual(events, [['dismount', DISMOUNT_THROWN]]);
});

test('dog_move dismisses a conflicted guardian angel', async () => {
    const { state, monster } = activePetState();
    delete monster.mextra;
    monster.isminion = true;
    state.u.uprops[CONFLICT] = {
        intrinsic: 1, // An active intrinsic reaches guardian resistance.
        extrinsic: 0,
        blocked: 0,
    };
    const events = [];

    const result = await dog_move(monster, false, movementEnv(state, {
        resistConflict: () => false,
        loseGuardianAngel(subject) {
            events.push(subject);
        },
    }));

    assert.equal(result, MMOVE_DIED);
    assert.deepEqual(events, [monster]);
});

test('dog_move maps an off-map inventory result through monster life',
    async () => {
        const { state, monster } = activePetState();
        const food = {
            ox: monster.mx,
            oy: monster.my,
            cursed: false,
            nexthere: null,
        };
        state.level.objects[monster.mx][monster.my] = food;

        const result = await dog_move(monster, false, movementEnv(state, {
            dogfood: () => DOGFOOD,
            eatObject(subject) {
                subject.mx = 0; // Zero is mon_offmap()'s coordinate sentinel.
                return MMOVE_MOVED;
            },
        }));

        assert.equal(result, MMOVE_DONE);
    });

test('dog_move skips goals and ranged attacks after inventory eating',
    async () => {
        const { state, monster } = activePetState();
        state.level.objects[monster.mx][monster.my] = {
            cursed: false,
            nexthere: null,
            oclass: FOOD_CLASS,
            ox: monster.mx,
            oy: monster.my,
            otyp: 1, // A decision-only ordinary food object type.
        };
        const events = [];

        const result = await dog_move(monster, false, movementEnv(state, {
            dogfood: () => CADAVER,
            eatObject: () => {
                events.push('eat');
                return MMOVE_MOVED;
            },
            findPositions: () => assert.fail('inventory eating skips goals'),
            petRangedAttack: () => assert.fail('inventory eating skips range'),
        }));

        assert.equal(result, MMOVE_MOVED);
        assert.deepEqual(events, ['eat']);
    });

test('dog_move rejects lethal passive damage before attacking', async () => {
    const { state, monster } = activePetState();
    const defender = {
        data: { mflags1: 0, mflags2: 0, msound: 0 },
        m_lev: 0,
        mhp: 1,
        mhpmax: 1,
        mpeaceful: false,
        mtame: 0,
        mx: 6,
        my: 5,
    };
    place_monster(defender, defender.mx, defender.my, state);
    let passiveChecks = 0;

    const result = await dog_move(monster, false, movementEnv(state, {
        findPositions: fixedCandidates([{
            x: defender.mx,
            y: defender.my,
            info: ALLOW_M,
        }]),
        maxPassiveDamage() {
            passiveChecks++;
            return monster.mhp; // Equal damage reaches the source balk.
        },
        attackMonster: () => assert.fail('lethal passive target'),
    }));

    assert.equal(result, MMOVE_MOVED);
    assert.equal(passiveChecks, 1);
});

test('dog_move makes a leashed pet whimper at a trap before moving',
    async () => {
        const { state, monster } = activePetState();
        monster.mleashed = true;
        const trap = {
            tx: 6,
            ty: 5,
            tseen: true,
        };
        state.level.traps.push(trap);
        const events = [];

        const result = await dog_move(monster, false, movementEnv(state, {
            findPositions: fixedCandidates([{
                x: trap.tx,
                y: trap.ty,
                info: ALLOW_TRAPS,
            }]),
            whimper(subject) {
                events.push(['whimper', subject.mx, subject.my]);
            },
        }));

        assert.equal(result, MMOVE_MOVED);
        assert.deepEqual(events, [['whimper', 5, 5]]);
        assert.deepEqual([monster.mx, monster.my], [trap.tx, trap.ty]);
    });

test('dog_move always evaluates a ranged attack after candidate scan',
    async () => {
        const { state, monster } = activePetState();
        let rangedCalls = 0;

        const result = await dog_move(monster, false, movementEnv(state, {
            findPositions: fixedCandidates([]),
            petRangedAttack(subject, forced) {
                rangedCalls++;
                assert.equal(subject, monster);
                assert.equal(forced, false);
                return MMOVE_DONE;
            },
        }));

        assert.equal(result, MMOVE_DONE);
        assert.equal(rangedCalls, 1);
    });

test('dog_move skips ranged attacks for a selected food landing', async () => {
    const { state, monster } = activePetState();
    const food = {
        cursed: false,
        nexthere: null,
        oclass: FOOD_CLASS,
        ox: 6,
        oy: 5,
        otyp: 1, // A decision-only ordinary food object type.
    };
    state.level.objects[food.ox][food.oy] = food;
    let eats = 0;

    const result = await dog_move(monster, false, movementEnv(state, {
        dogfood: () => DOGFOOD,
        findPositions: fixedCandidates([{
            x: food.ox,
            y: food.oy,
            info: 0, // An ordinary food square needs no occupancy allowance.
        }]),
        petRangedAttack: () => assert.fail('food goto skips ranged attack'),
        eatObject() {
            eats++;
            return MMOVE_MOVED;
        },
    }));

    assert.equal(result, MMOVE_MOVED);
    assert.equal(eats, 1);
});

test('dog_move skips food classification on an unreachable candidate',
    async () => {
        const { state, monster } = activePetState();
        const destination = { x: 6, y: 5 };
        state.level.objects[destination.x][destination.y] = {
            cursed: false,
            nexthere: null,
        };

        const result = await dog_move(monster, false, movementEnv(state, {
            findPositions: fixedCandidates([{
                ...destination,
                info: 0,
            }]),
            couldReachItem: () => false,
            dogfood: () => assert.fail('unreachable food must not classify'),
        }));

        assert.equal(result, MMOVE_MOVED);
        assert.deepEqual([monster.mx, monster.my], [
            destination.x,
            destination.y,
        ]);
    });

test('dog_move sets worm-tail attack globals before combat', async () => {
    const { state, monster } = activePetState();
    monster.m_lev = 3;
    const defender = {
        data: { mflags1: 0, mflags2: 0, msound: 0 },
        m_lev: 0,
        mhp: 1,
        mhpmax: 1,
        mpeaceful: false,
        mtame: 0,
        // The candidate is a tail square one column before this head.
        mx: 7,
        my: 5,
    };
    state.level.monsters[6][5] = defender;

    const result = await dog_move(monster, false, movementEnv(state, {
        findPositions: fixedCandidates([{
            x: 6,
            y: 5,
            info: ALLOW_M,
        }]),
        attackMonster() {
            assert.deepEqual(state.gb.bhitpos, { x: 6, y: 5 });
            assert.equal(state.gn.notonhead, true);
            return MMOVE_DONE;
        },
    }));

    assert.equal(result, MMOVE_DONE);
});

test('dog_move unleashes a pet before attacking the hero', async () => {
    const { state, monster } = activePetState();
    monster.mleashed = true;
    const events = [];

    const result = await dog_move(monster, false, movementEnv(state, {
        findPositions: fixedCandidates([{
            x: state.u.ux,
            y: state.u.uy,
            info: ALLOW_U,
        }]),
        reportLeashBreak: () => events.push('message'),
        unleashMonster: () => events.push('unleash'),
        attackHero: () => events.push('attack'),
    }));

    assert.equal(result, MMOVE_DONE);
    assert.deepEqual(events, ['message', 'unleash', 'attack']);
});

test('dog_move reports a cursed landing seen before movement', async () => {
    const { state, monster } = activePetState();
    const destination = { x: 6, y: 5 };
    state.level.objects[destination.x][destination.y] = {
        cursed: true,
        nexthere: null,
    };
    const events = [];
    const cursedChecks = [];

    const result = await dog_move(monster, false, movementEnv(state, {
        findPositions: fixedCandidates([{
            ...destination,
            info: 0, // An ordinary candidate carries no occupancy flags.
        }]),
        cursedObjectAt(x, y, checkedState) {
            assert.equal(checkedState, state);
            cursedChecks.push([x, y]);
            return x === destination.x && y === destination.y;
        },
        canSeeMonster(subject) {
            events.push(`see:${subject.mx},${subject.my}`);
            return subject.mx === 5;
        },
        reportCursedStep(subject, env) {
            assert.equal(env.wasSeen, true);
            events.push(`report:${subject.mx},${subject.my}`);
        },
    }));

    assert.equal(result, MMOVE_MOVED);
    assert.deepEqual(cursedChecks, [[destination.x, destination.y]]);
    assert.deepEqual(events, [
        'see:5,5',
        'report:6,5',
    ]);
});

test('dog_move applies the source leashed-pet reposition quirk', async () => {
    const { state, monster } = activePetState(12, 5);
    monster.mleashed = true;
    const events = [];

    const result = await dog_move(monster, false, movementEnv(state, {
        findPositions: fixedCandidates([]),
        repositionLeashedPet(subject, distance, nextX, nextY) {
            events.push([
                'reposition',
                distance,
                nextX,
                nextY,
            ]);
            subject.mx = 8;
            subject.my = 5;
        },
    }));

    assert.equal(result, MMOVE_MOVED);
    assert.deepEqual([monster.mx, monster.my], [8, 5]);
    assert.deepEqual(events, [
        ['reposition', 25, 12, 5],
    ]);
});
