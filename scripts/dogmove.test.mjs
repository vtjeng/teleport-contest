import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALLOW_M,
    ALLOW_TRAPS,
    ALLOW_U,
    CADAVER,
    CONFLICT,
    DEAF,
    DISMOUNT_THROWN,
    DOGFOOD,
    HALLUC,
    HALLUC_RES,
    LAVAPOOL,
    MANFOOD,
    M_ATTK_MISS,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    OBJ_FLOOR,
    POOL,
    ROOM,
    STONE,
    UNDEF,
    W_ARMC,
} from '../js/const.js';
import {
    can_reach_location,
    could_reach_item,
    cursed_object_at,
    dog_goal,
    dog_move,
    droppables,
    best_target,
    find_friends,
    find_targ,
    pet_ranged_attk,
    score_targ,
} from '../js/dogmove.js';
import { UnsupportedMonsterNameError } from '../js/do_name.js';
import { GameMap } from '../js/game.js';
import { init_objects } from '../js/o_init.js';
import { initrack, settrack } from '../js/track.js';
import {
    AT_BITE,
    AT_CLAW,
    M1_SWIM,
    M1_ANIMAL,
    M2_ROCKTHROW,
    MS_LEADER,
    MONSTER_TEMPLATES,
    PM_ACID_BLOB,
    PM_BAT,
    PM_FIRE_ELEMENTAL,
    PM_FLOATING_EYE,
    PM_GIANT_ANT,
    PM_GRID_BUG,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_ROTHE,
} from '../js/monsters.js';
import { place_monster } from '../js/monst.js';
import { GLYPH_OBJ_PILETOP_OFF } from '../js/glyph_offsets.js';
import {
    BOULDER,
    CREDIT_CARD,
    FOOD_CLASS,
    objects_globals_init,
    PICK_AXE,
    ROCK,
    ROCK_CLASS,
    SADDLE,
    SCR_SCARE_MONSTER,
    SKELETON_KEY,
} from '../js/objects.js';
import { loadPetCursedStepRecipe } from './run-pet-cursed-step.mjs';

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
            // mhitm.c mattackm() draws through the same injection once
            // dog_move() reaches an adjacent target. rnd() answers the lowest
            // roll a die can return, which beats every armour-class
            // differential in this file, so each blow lands and takes off the
            // one point d() answers.
            rnd: () => 1,
            d: () => 1,
        },
        message: async () => {},
        // mhitm.c pre_mm_attack() requires the seam whether or not it fires.
        // Every combatant in this file is one the hero can spot, so a mark
        // here means the visibility fixture changed, not that C marks.
        markInvisible: (x, y) => assert.fail(
            `no combatant in this file is unspottable: marked ${x},${y}`,
        ),
        redraw: () => {},
        unsupported: (reason) => {
            throw new Error(`unsupported: ${reason}`);
        },
        avoidKicked: () => false,
        avoidSokobanPush: () => false,
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

test('find_targ preserves hero, visibility, and worm-head boundaries', () => {
    const { monster, state } = petState();
    // These central room coordinates leave the complete seven-square source
    // ray in bounds while making each target distance explicit.
    monster.mx = 5;
    monster.my = 5;
    monster.mux = 7;
    monster.muy = 5;
    state.youmonst = { kind: 'remembered hero' };
    const distant = { minvis: false, mundetected: false, mx: 8, my: 5 };
    const monsterAt = (x, y) => x === 8 && y === 5 ? distant : null;
    const visible = () => true;

    assert.equal(find_targ(monster, 1, 0, 7, {
        state,
        monsterAt,
        monsterCanSee: visible,
    }), state.youmonst);

    // Starting at x=5, x=12 is the seventh and final square examined by
    // best_target()'s fixed maxdist=7 call.
    monster.mux = 12;
    assert.equal(find_targ(monster, 1, 0, 7, {
        state,
        monsterAt: () => null,
        monsterCanSee: visible,
    }), state.youmonst);
    monster.mux = 13;
    const boundaryTarget = {
        minvis: false,
        mundetected: false,
        mx: 12,
        my: 5,
    };
    assert.equal(find_targ(monster, 1, 0, 7, {
        state,
        monsterAt: (x, y) =>
            x === boundaryTarget.mx && y === boundaryTarget.my
                ? boundaryTarget
                : null,
        monsterCanSee: visible,
    }), boundaryTarget);
    const outsideTarget = {
        minvis: false,
        mundetected: false,
        mx: 13,
        my: 5,
    };
    assert.equal(find_targ(monster, 1, 0, 7, {
        state,
        monsterAt: (x, y) =>
            x === outsideTarget.mx && y === outsideTarget.my
                ? outsideTarget
                : null,
        monsterCanSee: visible,
    }), null);

    const invisible = {
        minvis: true,
        mundetected: false,
        mx: 6,
        my: 5,
    };
    const worm = {
        minvis: false,
        mundetected: false,
        mx: 8,
        my: 5,
    };
    assert.equal(find_targ(monster, 1, 0, 7, {
        state,
        monsterAt(x, y) {
            if (x === 6 && y === 5) return invisible;
            // The same long-worm object occupies a tail alias at distance
            // two and its real head at distance three.
            if ((x === 7 || x === 8) && y === 5) return worm;
            return null;
        },
        monsterCanSee: visible,
    }), worm);

    assert.equal(find_targ(monster, 1, 0, 7, {
        state,
        monsterAt: () => assert.fail('blocked sight ends the ray'),
        monsterCanSee: () => false,
    }), null);
});

test('find_friends scans beyond a target in source order', () => {
    const { monster, state } = activePetState();
    monster.mx = 5;
    monster.my = 5;
    monster.mux = 11;
    monster.muy = 5;
    const target = { mx: 8, my: 5 };
    assert.equal(find_friends(monster, target, 15, {
        state,
        monsterAt: () => null,
        monsterCanSee: () => true,
    }), 1, 'remembered hero behind the target');

    monster.mux = 1;
    const invisiblePet = {
        data: state.mons[PM_KITTEN],
        minvis: true,
        mtame: 10,
    };
    assert.equal(find_friends(monster, target, 15, {
        state,
        monsterAt: (x, y) => x === 10 && y === 5 ? invisiblePet : null,
        monsterCanSee: () => true,
    }), 0, 'a little dog cannot perceive an invisible ally');
    invisiblePet.minvis = false;
    assert.equal(find_friends(monster, target, 15, {
        state,
        monsterAt: (x, y) => x === 10 && y === 5 ? invisiblePet : null,
        monsterCanSee: () => true,
    }), 1);

    assert.equal(find_friends(monster, target, 15, {
        state,
        monsterAt: () => assert.fail('blocked sight ends the scan'),
        monsterCanSee: () => false,
    }), 0);

    const questFriendly = {
        data: { ...state.mons[PM_GIANT_ANT], msound: MS_LEADER },
        mtame: 0,
    };
    assert.equal(find_friends(monster, target, 15, {
        state,
        monsterAt: (x, y) => x === 9 && y === 5 ? questFriendly : null,
        monsterCanSee: () => true,
    }), 1, 'quest leaders behind the target are always treated as friends');

    const boundaryTarget = { mx: 20, my: 5 };
    monster.mux = 21;
    monster.muy = 5;
    assert.equal(find_friends(monster, boundaryTarget, 15, {
        state,
        monsterAt: () => null,
        monsterCanSee: () => true,
    }), 1, 'the inclusive loop checks one square beyond distance 15');
    assert.equal(find_friends(monster, boundaryTarget, 14, {
        state,
        monsterAt: () => null,
        monsterCanSee: () => true,
    }), 0);

    monster.mx = 78;
    monster.my = 5;
    assert.equal(find_friends(monster, { mx: 79, my: 5 }, 15, {
        state,
        monsterAt: () => null,
        monsterCanSee: () => assert.fail('off-map square stops before sight'),
    }), 0);
});

test('score_targ preserves ordinary early returns and random fuzz', () => {
    const { monster, state } = activePetState();
    monster.m_lev = 2;
    const target = {
        data: state.mons[PM_GIANT_ANT],
        m_lev: 2,
        mhp: 7,
        mpeaceful: false,
        mtame: 0,
        mx: 8,
        my: 5,
    };
    const draws = [];
    assert.equal(score_targ(monster, target, {
        state,
        monsterAt: () => null,
        monsterCanSee: () => true,
        random: {
            rnd(bound) {
                draws.push(bound);
                return 4;
            },
        },
    }), 20); // 10 hostile + 4 level + 2 hp + 4 fuzz.
    assert.deepEqual(draws, [5]);

    target.mx = 6;
    assert.equal(score_targ(monster, target, {
        state,
        random: { rnd: () => assert.fail('adjacency returns before fuzz') },
    }), -3000);
});

test('score_targ rejects pets, the hero, and a friend in the line of fire',
    () => {
        const { monster, state } = activePetState();
        monster.m_lev = 2;
        monster.mux = 1;
        monster.muy = 1;
        const target = {
            data: state.mons[PM_GIANT_ANT],
            m_lev: 2,
            mhp: 7,
            mpeaceful: false,
            mtame: 0,
            mx: 8,
            my: 5,
        };
        const noFuzz = {
            state,
            monsterAt: () => null,
            monsterCanSee: () => true,
            random: { rnd: () => assert.fail('rejection precedes fuzz') },
        };

        target.mtame = 1;
        assert.equal(score_targ(monster, target, noFuzz), -3000);

        target.mtame = 0;
        state.youmonst = target;
        assert.equal(score_targ(monster, target, noFuzz), -3000);

        state.youmonst = { data: state.mons[PM_LITTLE_DOG] };
        monster.mux = 10;
        monster.muy = 5;
        assert.equal(score_targ(monster, target, noFuzz), -3000);

        monster.mux = 1;
        monster.muy = 1;
        for (const specialFlag of ['isminion', 'ispriest', 'isshk']) {
            target[specialFlag] = true;
            assert.throws(
                () => score_targ(monster, target, noFuzz),
                /ordinary monster target/,
                specialFlag,
            );
            target[specialFlag] = false;
        }
        target.data = { ...state.mons[PM_GIANT_ANT], msound: MS_LEADER };
        assert.throws(
            () => score_targ(monster, target, noFuzz),
            /ordinary monster target/,
        );
    });

test('score_targ preserves source level-penalty boundaries', () => {
    const { monster, state } = activePetState();
    monster.mux = 1;
    monster.muy = 8;
    const target = {
        data: state.mons[PM_GIANT_ANT],
        m_lev: 2,
        mhp: 6,
        mpeaceful: true,
        mtame: 0,
        mx: 8,
        my: 5,
    };
    const score = (petLevel, targetLevel, heroLevel) => {
        monster.m_lev = petLevel;
        target.m_lev = targetLevel;
        state.u.ulevel = heroLevel;
        return score_targ(monster, target, {
            state,
            monsterAt: () => null,
            monsterCanSee: () => true,
            random: { rnd: () => 1 },
        });
    };

    assert.equal(score(5, 1, 1), 5);
    assert.equal(score(6, 1, 1), -20, 'weak-pet cutoff is strictly above 5');
    assert.equal(score(6, 2, 1), 7, 'target level 2 is not very low');

    assert.equal(score(12, 2, 10), 7);
    assert.equal(score(13, 2, 10), -18, 'far-outclassed pet starts above 12');
    assert.equal(score(13, 4, 12), 11);
    assert.equal(score(13, 3, 12), -16, 'target must be over nine levels lower');
    assert.equal(score(15, 5, 12), 13);
    assert.equal(score(15, 4, 12), -14, 'hero-relative cutoff is strict');

    assert.equal(score(2, 6, 1), 15);
    assert.equal(score(2, 7, 1), -83, 'strength penalty begins five levels up');
});

test('best_target uses dy-major ray order and rejects negative scores', () => {
    const { monster, state } = activePetState();
    monster.m_lev = 2;
    monster.mux = 1;
    monster.muy = 8;
    const first = {
        data: state.mons[PM_GIANT_ANT],
        m_lev: 1,
        mhp: 3,
        mpeaceful: false,
        mtame: 0,
        mx: 3,
        my: 3,
    };
    const second = { ...first, mx: 7, my: 3 };
    const targets = new Map([
        [`${first.mx},${first.my}`, first],
        [`${second.mx},${second.my}`, second],
    ]);
    const draws = [];
    assert.equal(best_target(monster, false, {
        state,
        monsterAt: (x, y) => targets.get(`${x},${y}`) ?? null,
        monsterCanSee: () => true,
        random: { rnd: (bound) => (draws.push(bound), 1) },
    }), first, 'a strict comparison retains the first tied ray');
    assert.deepEqual(draws, [5, 5]);

    first.mpeaceful = second.mpeaceful = true;
    first.data = second.data = state.mons[PM_FLOATING_EYE];
    assert.equal(best_target(monster, false, {
        state,
        monsterAt: (x, y) => targets.get(`${x},${y}`) ?? null,
        monsterCanSee: () => true,
        random: { rnd: () => 1 },
    }), null);

    first.data = second.data = state.mons[PM_GIANT_ANT];
    first.mpeaceful = second.mpeaceful = true;
    first.m_lev = second.m_lev = 0;
    first.mhp = second.mhp = 0;
    assert.equal(best_target(monster, false, {
        state,
        monsterAt: (x, y) => targets.get(`${x},${y}`) ?? null,
        monsterCanSee: () => true,
        random: { rnd: () => 0 },
    }), first, 'a zero score is retained when the scan is not forced');

    first.data = second.data = state.mons[PM_FLOATING_EYE];
    first.mhp = second.mhp = 1;
    assert.equal(best_target(monster, true, {
        state,
        monsterAt: (x, y) => targets.get(`${x},${y}`) ?? null,
        monsterCanSee: () => true,
        random: { rnd: () => 1 },
    }), first, 'forced selection retains a negative target');
});

test('pet_ranged_attk preserves target fuzz and hungry gate ordering',
    async () => {
    const { monster, state } = activePetState();
    monster.m_lev = 2;
    monster.mux = 1;
    monster.muy = 1;
    monster.mextra.edog.hungrytime = -400;
    const target = {
        data: state.mons[PM_GIANT_ANT],
        m_lev: 1,
        mhp: 3,
        mcanmove: true,
        mpeaceful: false,
        mtame: 0,
        mx: 8,
        my: 5,
    };
    place_monster(target, target.mx, target.my, state);
    const events = [];
    assert.equal(await pet_ranged_attk(monster, false, {
        state,
        monsterCanSee: () => true,
        random: {
            rnd: (bound) => (events.push(['rnd', bound]), 1),
            rn2: (bound) => (events.push(['rn2', bound]), 1),
        },
        mattackm: () => assert.fail('hungry gate rejects the attack'),
    }), MMOVE_NOTHING);
    assert.deepEqual(events, [['rnd', 5], ['rn2', 5]]);

    const accepted = [];
    assert.equal(await pet_ranged_attk(monster, false, {
        state,
        monsterCanSee: () => true,
        random: {
            rnd: (bound) => (accepted.push(['rnd', bound]), 1),
            rn2: (bound) => (accepted.push(['rn2', bound]), 0),
        },
        mattackm(aggressor, defender) {
            accepted.push(['mattackm', aggressor, defender]);
            return M_ATTK_MISS;
        },
    }), MMOVE_NOTHING);
    assert.deepEqual(accepted, [
        ['rnd', 5],
        ['rn2', 5],
        ['mattackm', monster, target],
    ]);
    assert.deepEqual(state.gb.bhitpos, { x: monster.mx, y: monster.my });
    assert.equal(state.gn.notonhead, false);
});

test('pet_ranged_attk rejects negative targets and uses strict hunger time',
    async () => {
        const { monster, state } = activePetState();
        monster.m_lev = 2;
        monster.mux = 1;
        monster.muy = 8;
        const target = {
            data: state.mons[PM_FLOATING_EYE],
            m_lev: 2,
            mhp: 3,
            mcanmove: true,
            mpeaceful: true,
            mtame: 0,
            mx: 8,
            my: 5,
        };
        place_monster(target, target.mx, target.my, state);
        const common = {
            state,
            monsterCanSee: () => true,
            random: { rnd: () => 1, rn2: () => 0 },
            mattackm: () => assert.fail('a negative target is filtered'),
        };
        assert.equal(await pet_ranged_attk(monster, false, common),
                     MMOVE_NOTHING);

        target.data = state.mons[PM_GIANT_ANT];
        target.mpeaceful = false;
        monster.mextra.edog.hungrytime = state.moves - 300;
        const events = [];
        assert.equal(await pet_ranged_attk(monster, false, {
            ...common,
            random: {
                rnd: () => 1,
                rn2: () => assert.fail('exact hunger boundary is not hungry'),
            },
            mattackm(aggressor, defender) {
                events.push([aggressor, defender]);
                return 0;
            },
        }), MMOVE_NOTHING);
        assert.deepEqual(events, [[monster, target]]);
        assert.deepEqual(state.gb.bhitpos, { x: monster.mx, y: monster.my });
        assert.equal(state.gn.notonhead, false);
    });

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

test('dog_move reports a completed opportunity when no candidate exists',
    async () => {
        const { state, monster } = activePetState();
        const origin = [monster.mx, monster.my];

        const result = await dog_move(monster, false, movementEnv(state, {
            findPositions: fixedCandidates([]),
        }));

        assert.equal(result, MMOVE_MOVED);
        assert.deepEqual([monster.mx, monster.my], origin);
        assert.deepEqual(monster.mtrack, [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ]);
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

test('dog_move dismisses a guardian angel whose conflict is blocked',
    async () => {
        const { state, monster } = activePetState();
        delete monster.mextra;
        monster.isminion = true;
        state.u.uprops[CONFLICT] = {
            intrinsic: 1, // An active intrinsic reaches guardian resistance.
            extrinsic: 0,
            // youprop.h:218 defines Conflict as (HConflict || EConflict) and
            // declares no BConflict, so worn.c never writes this field for
            // CONFLICT and dog_move() must ignore whatever it holds. W_ARMC is
            // the cloak mask worn.c:127 writes for the six properties that do
            // have a blocked alias. The state is unreachable in play; the case
            // pins the spelling rather than a reachable divergence.
            blocked: W_ARMC,
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

// dogmove.c:1122, `max_passive_dmg(mtmp2, mtmp) >= mtmp->mhp`. An acid blob's
// only attack slot is ATTK(AT_NONE, AD_ACID, 1, 8) (monsters.h:137-140), so
// mondata.c max_passive_dmg() answers 1 * 8 * (one melee attack) = 8 against a
// little dog, which is exactly this fixture's hit points and reaches the balk
// on the `>=`. A dog with one more hit point walks past it and attacks, which
// is what the second half asserts; mhitm.c mattackm() then answers M_ATTK_MISS
// because the blob is two squares away.
test('dog_move rejects lethal passive damage before attacking', async () => {
    const { state, monster } = activePetState();
    const defender = {
        data: state.mons[PM_ACID_BLOB],
        m_lev: 1,
        mcanmove: true,
        mhp: 1,
        mhpmax: 1,
        mpeaceful: false,
        mtame: 0,
        mx: 6,
        my: 5,
    };
    place_monster(defender, defender.mx, defender.my, state);
    const candidate = fixedCandidates([{
        x: defender.mx,
        y: defender.my,
        info: ALLOW_M,
    }]);

    assert.equal(monster.mhp, 8);
    const result = await dog_move(monster, false, movementEnv(state, {
        findPositions: candidate,
    }));
    assert.equal(result, MMOVE_MOVED);

    monster.mhp = 9;
    await assert.rejects(
        dog_move(monster, false, movementEnv(state, {
            findPositions: candidate,
        })),
        /an acid splash from the monster attacked/u,
    );
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

// Runs the same leashed-pet-onto-a-seen-trap move as the test above and
// returns what whimper() recorded, so each caller below sets one term of
// youprop.h:125 `Deaf` and asserts the silence dogmove.c:1200 gives it.
//
// `mleashed` is state production never builds: apply.c use_leash() is C's only
// writer and is unported, and js/unported_monster_actions.js:251 refuses a
// leashed pet by name before dochugw() runs. These cases reach the arm
// directly, which is why they are unit tests rather than a recording.
async function leashedTrapWhimpers(state, monster) {
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
    // Stepping onto the trap is what proves the leashed arm ran: the
    // unleashed arm at dogmove.c:1206 draws rn2(40), which movementEnv()
    // answers 1, and skips the square instead.
    assert.deepEqual([monster.mx, monster.my], [trap.tx, trap.ty]);
    return events;
}

test('dog_move suppresses the leashed pet whimper for the deaf conduct',
    async () => {
        const { state, monster } = activePetState();
        // youprop.h:125's third disjunct, u.uroleplay.deaf. Only
        // OPTIONS=roleplay:deaf sets it and nothing clears it, so it is deaf
        // with uprops[DEAF] left zeroed, which activePetState() does.
        state.u.uroleplay = { deaf: true };

        assert.deepEqual(await leashedTrapWhimpers(state, monster), []);
    });

test('dog_move suppresses the leashed pet whimper when deafness is blocked',
    async () => {
        const { state, monster } = activePetState();
        // prop.h struct prop carries a blocked field for every property, and
        // youprop.h:125 reads none of it: HDeaf alone is `Deaf`. The pairing
        // pins the absence of a blocking conjunct rather than a state the
        // game reaches.
        state.u.uprops[DEAF] = { intrinsic: true, blocked: true };

        assert.deepEqual(await leashedTrapWhimpers(state, monster), []);
    });

test('dog_move suppresses the leashed pet whimper for extrinsic deafness',
    async () => {
        const { state, monster } = activePetState();
        // youprop.h:124 EDeaf, the worn mask, on its own.
        state.u.uprops[DEAF] = { extrinsic: true };

        assert.deepEqual(await leashedTrapWhimpers(state, monster), []);
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

// dogmove.c:1149-1150 aims gb.bhitpos at the square the pet steps into rather
// than at the defender's own, and derives gn.notonhead from the difference.
// mhitm.c mattackm() is the reader: its per-slot `m_at(gb.bhitpos.x,
// gb.bhitpos.y) != mdef` test at :378-380 skips every slot after the first
// once the target has moved. Here the head sits one column past the candidate,
// so the pair records a tail hit. mattackm() answers M_ATTK_MISS -- the head
// is two squares away, so every melee slot takes its `distmin > 1` continue --
// and dog_move() returns MMOVE_DONE without a return attack.
test('dog_move sets worm-tail attack globals before combat', async () => {
    const { state, monster } = activePetState();
    monster.m_lev = 3;
    const defender = {
        data: state.mons[PM_GIANT_ANT],
        m_lev: 0,
        mcanmove: true,
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
    }));

    assert.equal(result, MMOVE_DONE);
    assert.deepEqual(state.gb.bhitpos, { x: 6, y: 5 });
    assert.equal(state.gn.notonhead, true);
});

// dogmove.c dog_move():1152-1170, the return attack. All five conjuncts must
// hold, and each row below fixes one of them: the pet must have hit without
// killing, rn2(4) must be nonzero, the defender must not have moved this turn,
// the pet's square must not be scary, and the defender must be able to reach
// the pet. The fixture map is unlit, so each blow is read off hit points rather
// than off a message.
test('dog_move lets a struck defender hit back', async () => {
    const { state, monster } = activePetState();
    state.moves = 5;
    // A giant ant's armour class is 3, so a second-level attacker's
    // differential is 5 and the lowest roll lands.
    monster.m_lev = 2;
    const defender = {
        data: state.mons[PM_GIANT_ANT],
        m_lev: 2,
        mcanmove: true,
        mcansee: true,
        mhp: 20,
        mhpmax: 20,
        mlstmv: 0,
        mpeaceful: false,
        mtame: 0,
        mx: 6,
        my: 5,
    };
    place_monster(defender, defender.mx, defender.my, state);
    const candidate = fixedCandidates([{
        x: defender.mx,
        y: defender.my,
        info: ALLOW_M,
    }]);
    const env = (overrides = {}) => movementEnv(state, {
        findPositions: candidate,
        ...overrides,
    });
    const round = async (label, overrides) => {
        defender.mlstmv = overrides?.mlstmv ?? 0;
        const before = { pet: monster.mhp, foe: defender.mhp };
        assert.equal(await dog_move(monster, false, env(overrides?.env ?? {})),
                     MMOVE_DONE, label);
        return {
            pet: before.pet - monster.mhp,
            foe: before.foe - defender.mhp,
        };
    };

    // movementEnv()'s rnd() answers 1, the lowest roll, so the pet hits and
    // the ant hits back for one point each.
    assert.deepEqual(await round('hit'), { pet: 1, foe: 1 });

    // A missed blow leaves mstatus at M_ATTK_MISS while every later conjunct
    // stays true, so only the first one can be keeping the ant quiet.
    assert.deepEqual(
        await round('miss', {
            env: {
                random: {
                    rn2: (bound) => Math.min(1, bound - 1),
                    // The highest roll rnd(20) can return misses whatever the
                    // differential is.
                    rnd: (bound) => bound,
                    d: () => 1,
                },
            },
        }),
        { pet: 0, foe: 0 },
    );

    // rn2(4) answering zero declines the return attack after a hit.
    assert.deepEqual(
        await round('declined', {
            env: { random: { rn2: () => 0, rnd: () => 1, d: () => 1 } },
        }),
        { pet: 0, foe: 1 },
    );

    // A defender that has already moved this turn does not act again.
    assert.deepEqual(await round('spent', { mlstmv: state.moves }),
                     { pet: 0, foe: 1 });

    // monmove.c onscary(): a scroll of scare monster on the pet's own square
    // keeps the defender off it.
    state.level.objects[monster.mx][monster.my] = {
        otyp: SCR_SCARE_MONSTER,
        nexthere: null,
    };
    assert.deepEqual(await round('scary'), { pet: 0, foe: 1 });
    state.level.objects[monster.mx][monster.my] = null;

    // mon.c monnear(): a grid bug cannot use diagonal adjacency, so one the
    // pet reached diagonally cannot reach back. The pet's own attack is
    // unaffected, because mattackm():316-317 tests the aggressor's species.
    //
    // The grid bug is the only defender that can fail this conjunct, since
    // NODIAG() names no other species and every other candidate square is
    // adjacent. Its return attack would leave no mark either way, because
    // mattackm() would answer M_ATTK_MISS at that same species test before
    // drawing or moving anything. What separates the two is the second
    // gb.bhitpos write, which sits inside the conjunction: a declined return
    // attack leaves the defender's square aimed at.
    state.level.monsters[defender.mx][defender.my] = null;
    const bug = {
        data: state.mons[PM_GRID_BUG],
        m_lev: 2,
        mcanmove: true,
        mcansee: true,
        mhp: 20,
        mhpmax: 20,
        mlstmv: 0,
        mpeaceful: false,
        mtame: 0,
        mx: monster.mx + 1,
        my: monster.my + 1,
    };
    place_monster(bug, bug.mx, bug.my, state);
    const diagonal = movementEnv(state, {
        findPositions: fixedCandidates([{ x: bug.mx, y: bug.my, info: ALLOW_M }]),
    });
    const before = { pet: monster.mhp, foe: bug.mhp };
    assert.equal(await dog_move(monster, false, diagonal), MMOVE_DONE);
    assert.equal(before.foe - bug.mhp, 1, 'the pet still lands its blow');
    assert.equal(before.pet - monster.mhp, 0, 'the grid bug cannot reply');
    assert.deepEqual(state.gb.bhitpos, { x: bug.mx, y: bug.my });
});

// dogmove.c dog_move():1168-1169, the second gb.bhitpos and gn.notonhead
// write. mattackm():378-380 abandons every slot after the first whose aimed
// square no longer holds the defender, so a return attacker that is still
// aimed at its own square gets one slot out of however many it has. A rothe
// carries three, which is what makes the difference visible.
test('dog_move re-aims at the pet before the return attack', async () => {
    const { state, monster } = activePetState();
    state.moves = 5;
    monster.m_lev = 2;
    const rothe = {
        data: state.mons[PM_ROTHE],
        m_lev: 2,
        mcanmove: true,
        mcansee: true,
        mhp: 20,
        mhpmax: 20,
        mlstmv: 0,
        mpeaceful: false,
        mtame: 0,
        mx: monster.mx + 1,
        my: monster.my,
    };
    assert.deepEqual(
        rothe.data.mattk.slice(0, 3).map((attack) => attack.aatyp),
        [AT_CLAW, AT_BITE, AT_BITE],
    );
    place_monster(rothe, rothe.mx, rothe.my, state);
    // The pet's attack aims here first, which is the write this one replaces.
    state.gb = { bhitpos: { x: 0, y: 0 } };
    state.gn = { notonhead: true };
    const bounds = [];
    const env = movementEnv(state, {
        findPositions: fixedCandidates([{
            x: rothe.mx,
            y: rothe.my,
            info: ALLOW_M,
        }]),
        random: {
            rn2: (bound) => { bounds.push(`rn2(${bound})`); return Math.min(1, bound - 1); },
            rnd: (bound) => { bounds.push(`rnd(${bound})`); return 1; },
            d: (n, x) => { bounds.push(`d(${n},${x})`); return 1; },
        },
    });

    assert.equal(await dog_move(monster, false, env), MMOVE_DONE);
    // The second write, which leaves the pet's own square aimed at.
    assert.deepEqual(state.gb.bhitpos, { x: monster.mx, y: monster.my });
    assert.equal(state.gn.notonhead, false);
    // dog_goal()'s own rn2(4) at dogmove.c:575, the pet's blow, the rn2(4)
    // that opens the return attack, and then all three of the rothe's slots.
    // Each landed blow spends its to-hit roll, its damage roll, uhitm.c
    // mhitm_knockback()'s pair and passivemm()'s rn2(3); the widening die
    // `rnd(20 + i)` separates the three slots, and without the re-aim above
    // only the first of them runs.
    assert.deepEqual(bounds, [
        'rn2(4)',
        'rnd(20)', 'd(1,6)', 'rn2(3)', 'rn2(6)', 'rn2(3)',
        'rn2(4)',
        'rnd(20)', 'd(1,3)', 'rn2(3)', 'rn2(6)', 'rn2(3)',
        'rnd(21)', 'd(1,3)', 'rn2(3)', 'rn2(6)', 'rn2(3)',
        'rnd(22)', 'd(1,8)', 'rn2(3)', 'rn2(6)', 'rn2(3)',
    ]);
    // One point from each of the three slots.
    assert.equal(monster.mhp, 5);
    assert.equal(rothe.mhp, 19);
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

// C ref: dogmove.c dog_move():1298-1312. Each case below fixes one term of
// `"%s %s reluctantly %s %s."` and leaves the rest at the values the shared
// helper sets.
function cursedStepEnv(state, destination, overrides = {}) {
    return movementEnv(state, {
        findPositions: fixedCandidates([{
            ...destination,
            info: 0, // An ordinary candidate carries no occupancy flags.
        }]),
        cursedObjectAt: (x, y) => (
            x === destination.x && y === destination.y
        ),
        // canseemon() before the step; C's second call is only consulted when
        // this one is false.
        canSeeMonster: () => true,
        ...overrides,
    });
}

test('dog_move reports a cursed landing seen before movement', async () => {
    const { state, monster } = activePetState();
    const destination = { x: 6, y: 5 };
    state.level.objects[destination.x][destination.y] = {
        cursed: true,
        nexthere: null,
    };
    const events = [];
    const cursedChecks = [];
    const lines = [];

    const result = await dog_move(monster, false, cursedStepEnv(
        state,
        destination,
        {
            cursedObjectAt(x, y, checkedState) {
                assert.equal(checkedState, state);
                cursedChecks.push([x, y]);
                return x === destination.x && y === destination.y;
            },
            canSeeMonster(subject) {
                events.push(`see:${subject.mx},${subject.my}`);
                // Seen at its origin only, which is the `wasseen` half of
                // dogmove.c:1298.
                return subject.mx === 5;
            },
            async message(text) {
                events.push(`report:${monster.mx},${monster.my}`);
                lines.push(text);
            },
        },
    ));

    assert.equal(result, MMOVE_MOVED);
    assert.deepEqual(cursedChecks, [[destination.x, destination.y]]);
    // C calls canseemon() once before place_monster() and again after it only
    // when the first answered FALSE, so a pet seen at its origin asks once.
    assert.deepEqual(events, [
        'see:5,5',
        'report:6,5',
    ]);
    // This state sets no level.flags.hero_memory, so dogmove.c:1302 keeps o at
    // 0 and decl.h:36 `something` fills the last term. A little dog is neither
    // a flyer nor a floater, so locomotion() falls through to "step" and the
    // choice at 1309-1310 is "onto".
    assert.deepEqual(lines, [
        'Your little dog steps reluctantly onto something.',
    ]);
});

// A pet one step west of a two-item pile whose lower item is the cursed one,
// with the hero remembering an object at that square. dogmove.c:1299-1301
// names the top of the pile, not the item that made the pet reluctant.
function rememberedPileState() {
    const setup = activePetState();
    const { state } = setup;
    const destination = { x: 6, y: 5 };
    const top = {
        otyp: ROCK,
        oclass: ROCK_CLASS,
        quan: 1,
        // Unobserved, so that distant_name()'s suppression of xname_flags()'s
        // `if (!Blind && !gd.distantname)` write is visible below.
        dknown: false,
        ox: destination.x,
        oy: destination.y,
        where: OBJ_FLOOR,
        cursed: false,
        nexthere: {
            otyp: BOULDER,
            oclass: ROCK_CLASS,
            quan: 1,
            cursed: true,
            nexthere: null,
        },
    };
    state.level.objects[destination.x][destination.y] = top;
    setup.top = top;
    state.level.flags = { hero_memory: true };
    // Map memory holding an object is what glyph_is_object() answers to, and
    // what it reads is C's levl[x][y].glyph. display.h normal_obj_to_glyph()
    // numbers the rock by otyp into the pile-top range, because the boulder
    // below it makes obj_is_piletop() true.
    state.level.at(destination.x, destination.y).remembered_glyph = {
        glyph: GLYPH_OBJ_PILETOP_OFF + ROCK,
    };
    // distant_name() -> donameFresh() -> xnameFresh() reads the object
    // catalog, the hero's blindness, and the discoveries list. Zero choices
    // initialize every randomized description deterministically.
    objects_globals_init(state);
    init_objects(state, () => 0);
    state.u.uprops = [];
    state.flags = {};
    return { ...setup, destination };
}

test('dog_move names the remembered top item of the pile it steps onto',
    async () => {
        const { state, monster, destination, top } = rememberedPileState();
        const lines = [];

        const result = await dog_move(monster, false, cursedStepEnv(
            state,
            destination,
            { message: async (text) => { lines.push(text); } },
        ));

        assert.equal(result, MMOVE_MOVED);
        assert.deepEqual(lines, [
            'Your little dog steps reluctantly onto a rock.',
        ]);
        // dogmove.c:1305 formats through distant_name(), not doname()
        // directly. This square is outside cansee(), so objnam.c
        // distant_name() raises gd.distantname and xname_flags():627 makes
        // neither the dknown write nor the discoveries entry. Naming a pile
        // the pet stepped on must not identify it for the hero.
        assert.equal(top.dknown, false);
        assert.equal(state.gd?.distantname ?? 0, 0);
    });

test('dog_move will not name a pile on a level that keeps no hero memory',
    async () => {
        const { state, monster, destination } = rememberedPileState();
        // dogmove.c:1302 tests svl.level.flags.hero_memory separately from the
        // glyph, because map_object() writes levl[x][y].glyph only when the
        // flag is set, leaving a stale glyph readable behind it.
        state.level.flags.hero_memory = false;
        const lines = [];

        const result = await dog_move(monster, false, cursedStepEnv(
            state,
            destination,
            { message: async (text) => { lines.push(text); } },
        ));

        assert.equal(result, MMOVE_MOVED);
        assert.deepEqual(lines, [
            'Your little dog steps reluctantly onto something.',
        ]);
    });

test('dog_move stops rather than name a hallucinated pet', async () => {
    const { state, monster, destination } = rememberedPileState();
    // youprop.h:120 Hallucination: the intrinsic timeout with no resistance.
    state.u.uprops[HALLUC] = { intrinsic: 1000 };

    // dogmove.c:1302 gates only the pile lookup on !Hallucination, so the
    // last term of the line really is `something` here. The pet's own name is
    // not: noit_mon_nam() (do_name.c:1056-1058) passes x_monnam() no
    // SUPPRESS_HALLUCINATION, so :950-955 replaces "your little dog" with
    // rndmonnam()'s bogus name and draws from the display RNG to choose it.
    // js/do_name.js has no bogus-name arm, so it refuses instead, and the
    // refusal has to precede the message rather than print a wrong one.
    await assert.rejects(
        () => dog_move(monster, false, cursedStepEnv(
            state,
            destination,
            {
                message: () => assert.fail(
                    'the refusal precedes the cursed-step line',
                ),
            },
        )),
        (error) => error instanceof UnsupportedMonsterNameError
            && error.reason === "noit_Monnam()'s hallucinated bogus name",
    );
});

// youprop.h:118-119 Halluc_resistance is the intrinsic or the extrinsic, and
// either one alone puts the hero back on the naming branch.
for (const source of ['intrinsic', 'extrinsic']) {
    test(`dog_move names the pile again once ${source} resistance blocks `
        + 'hallucination', async () => {
        const { state, monster, destination } = rememberedPileState();
        state.u.uprops[HALLUC] = { intrinsic: 1000 };
        state.u.uprops[HALLUC_RES] = { [source]: 1 };
        const lines = [];

        const result = await dog_move(monster, false, cursedStepEnv(
            state,
            destination,
            { message: async (text) => { lines.push(text); } },
        ));

        assert.equal(result, MMOVE_MOVED);
        assert.deepEqual(lines, [
            'Your little dog steps reluctantly onto a rock.',
        ]);
    });
}

// dogmove.c:1309-1310 chooses "over" for `is_flyer(mtmp->data) ||
// is_floater(mtmp->data)`, and mondata.c locomotion() answers a different verb
// for each of the two. A floating eye satisfies both terms -- monsters.h gives
// it S_EYE and M1_FLY -- so it cannot tell the disjunction from a conjunction;
// the bat below has M1_FLY without S_EYE and does.
for (const { pmidx, name, verb } of [
    { pmidx: PM_FLOATING_EYE, name: 'floating eye', verb: 'floats' },
    { pmidx: PM_BAT, name: 'bat', verb: 'flies' },
]) {
    test(`dog_move sends a ${name} over the pile instead of onto it`,
        async () => {
            const { state, monster } = activePetState();
            monster.data = state.mons[pmidx];
            const destination = { x: 6, y: 5 };
            state.level.objects[destination.x][destination.y] = {
                cursed: true,
                nexthere: null,
            };
            const lines = [];

            const result = await dog_move(monster, false, cursedStepEnv(
                state,
                destination,
                { message: async (text) => { lines.push(text); } },
            ));

            assert.equal(result, MMOVE_MOVED);
            assert.deepEqual(lines, [
                `Your ${name} ${verb} reluctantly over something.`,
            ]);
        });
}

test('dog_move stays silent when the pet is unseen before and after',
    async () => {
        const { state, monster } = activePetState();
        const destination = { x: 6, y: 5 };
        state.level.objects[destination.x][destination.y] = {
            cursed: true,
            nexthere: null,
        };

        const result = await dog_move(monster, false, cursedStepEnv(
            state,
            destination,
            {
                canSeeMonster: () => false,
                message: () => assert.fail('an unseen step must not print'),
            },
        ));

        assert.equal(result, MMOVE_MOVED);
    });

test('the cursed-step matrix covers the four terms its header names', () => {
    const { segments } = loadPetCursedStepRecipe();
    // Four segments over four seeds, one per term of `%s %s reluctantly %s
    // %s.` that a C recording can vary: which pet walks, the class of the top
    // item, whether its appearance is already known, and the near or far
    // branch of distant_name(). The count is asserted so that deleting a case
    // has to be deliberate.
    assert.equal(segments.length, 4);
    assert.equal(new Set(segments.map((segment) => segment.seed)).size, 4);
    for (const segment of segments) {
        // Every segment is a pure run of searches: the hero spends turns
        // without moving, so nothing but the pet's own walk reaches the line.
        assert.match(segment.moves, /^s+$/u);
        // Without this the hero picks the level's objects up on her way past
        // and the pet has nothing to be reluctant about.
        assert.match(segment.nethackrc, /!autopickup/);
        assert.match(segment.nethackrc, /role:Valkyrie/);
    }
    // The search count is the turn the line prints on for its seed, found by
    // recording fresh C walks; a changed count silently retargets the case.
    assert.deepEqual(
        segments.map((segment) => [segment.seed, segment.moves.length]),
        [[5407, 4], [2209, 12], [2351, 28], [4333, 33]],
    );
});

test('dog_move applies the source leashed-pet reposition quirk', async () => {
    // activePetState puts the hero at (7,5); this pet at (12,5) has squared
    // distance 25, selecting the source's udist > 4 leash branch.
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
