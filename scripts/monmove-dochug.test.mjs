import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HALLUC,
    HALLUC_RES,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOMOVES,
    MMOVE_NOTHING,
    M_SEEN_SLEEP,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    STRAT_ARRIVE,
    STRAT_WAITFORU,
} from '../js/const.js';
import { dochug } from '../js/monmove.js';
import {
    AD_BLND,
    AD_RBRE,
    AT_BREA,
    AT_CLAW,
    AT_NONE,
    AT_SPIT,
    AT_WEAP,
    M1_ANIMAL,
} from '../js/monsters.js';

function makeState() {
    const uprops = [];
    uprops[HALLUC] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return { u: { uprops } };
}

function makeMonster(overrides = {}) {
    return {
        data: {
            mflags2: 0,
            mflags3: 0,
        },
        mcanmove: true,
        mcansee: true,
        mconf: false,
        mflee: false,
        mhp: 5,
        mhpmax: 5,
        minvis: false,
        mpeaceful: false,
        msleeping: false,
        mstun: false,
        mstrategy: 0,
        mx: 4,
        my: 4,
        ...overrides,
    };
}

function baseEnv(state, events) {
    return {
        state,
        random: {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        },
        attackHero: () => events.push('attack'),
        monFlee: () => assert.fail('this fixture is not scared'),
        monsterCanSeeHero: () => {
            events.push('can-see-hero');
            return true;
        },
        moveMonster: () => MMOVE_NOTHING,
        preflight: () => events.push('preflight'),
        usePreMoveItems: () => {
            events.push('items');
            return false;
        },
        wakeMessage: () => events.push('wake-message'),
        wipeEngraving: () => events.push('wipe'),
        setApparentHero: () => events.push('apparxy'),
        // muse.c find_offensive() refuses through this seam. No fixture below
        // reaches a refusing arm: every monster the post-move disjunction
        // carries into find_offensive() is stopped by its first guard.
        unsupported: (what) => assert.fail(`unexpected refusal: ${what}`),
    };
}

test('dochug clears arrival and wait state before ordinary movement', async () => {
    const state = makeState();
    const events = [];
    const monster = makeMonster({
        mpeaceful: true,
        // These two bits exercise both source strategy updates.
        mstrategy: STRAT_ARRIVE | STRAT_WAITFORU,
    });
    let rangeCall = 0;
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push(`range-${++rangeCall}`);
            return { nearby: false, scared: false };
        },
        moveMonster: () => {
            events.push('move');
            return MMOVE_MOVED;
        },
    };

    assert.equal(await dochug(monster, env), 0);
    assert.equal(monster.mstrategy, 0);
    assert.deepEqual(events, [
        'preflight',
        'can-see-hero',
        'wipe',
        'apparxy',
        'range-1',
        'items',
        'move',
        'range-2',
    ]);
});

test('dochug carries an armed mover into the standard-attack phase',
    async () => {
        // C ref: monmove.c:944-949. The AT_WEAP disjunct breaks out of the
        // post-move switch, and PHASE FOUR at :957-971 is what then calls
        // mattacku(). The port used to call mattacku() from the switch itself
        // through a second operation.
        const state = makeState();
        const events = [];
        const monster = makeMonster({
            data: {
                mattk: [{ aatyp: AT_WEAP }],
                mflags2: 0,
                mflags3: 0,
            },
            mux: 6,
            muy: 4,
        });
        let rangeCall = 0;
        const env = {
            ...baseEnv(state, events),
            distanceAndFear: () => {
                events.push(`range-${++rangeCall}`);
                return {
                    inrange: true,
                    nearby: false,
                    scared: false,
                };
            },
            moveMonster: () => {
                events.push('move');
                return MMOVE_MOVED;
            },
            wieldMonsterItem: () => false,
        };

        assert.equal(await dochug(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range-1',
            'items',
            'move',
            'range-2',
            'attack',
        ]);
    });

test('dochug lets PHASE FOUR reject the armed mover it broke into it with',
    async () => {
        // C ref: monmove.c:944-949 and :957-971. The break is not the attack:
        // an armed monster that moved out of BOLT_LIM range still passes the
        // AT_WEAP disjunct, and PHASE FOUR's own `(inrange && !scared) ||
        // panicattk` then refuses it. panicattk stays false because the status
        // is MMOVE_MOVED rather than MMOVE_NOMOVES.
        const state = makeState();
        const events = [];
        const monster = makeMonster({
            data: {
                mattk: [{ aatyp: AT_WEAP }],
                mflags2: 0,
                mflags3: 0,
            },
        });
        const env = {
            ...baseEnv(state, events),
            distanceAndFear: () => {
                events.push('range');
                return { inrange: false, nearby: false, scared: false };
            },
            moveMonster: () => {
                events.push('move');
                return MMOVE_MOVED;
            },
            attackHero: () =>
                assert.fail('an out-of-range mover does not attack'),
            wieldMonsterItem: () => false,
        };

        assert.equal(await dochug(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'items',
            'move',
            'range',
        ]);
    });

test('dochug carries a mover with a distance attack into the attack phase',
    async () => {
        // C ref: monmove.c:945, ranged_attk_available(). AT_SPIT satisfies
        // monattk.h DISTANCE_ATTK_TYPE() with no AT_WEAP attack anywhere in
        // the list, so this disjunct alone is what reaches PHASE FOUR. AD_BLND
        // is what a real spitter carries and cvt_adtyp_to_mseenres() maps it
        // to M_SEEN_NOTHING, so the resistance test admits it.
        const state = makeState();
        const events = [];
        const monster = makeMonster({
            data: {
                mattk: [{ aatyp: AT_SPIT, adtyp: AD_BLND }],
                mflags2: 0,
                mflags3: 0,
            },
            seen_resistance: 0,
        });
        const env = {
            ...baseEnv(state, events),
            distanceAndFear: () => {
                events.push('range');
                return { inrange: true, nearby: false, scared: false };
            },
            moveMonster: () => {
                events.push('move');
                return MMOVE_MOVED;
            },
        };

        assert.equal(await dochug(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'items',
            'move',
            'range',
            'attack',
        ]);
    });

test('dochug rolls a random breath where C rolls it, before the attack phase',
    async () => {
        // C ref: mondata.c get_atkdam_type() (1659-1669) reached through
        // mhitu.c ranged_attk_available() (2412-2426). AD_RBRE spends
        // ROLL_FROM(rnd_breath_typ), an rn2(8), inside the first disjunct of
        // monmove.c:945-948, so the draw lands before PHASE FOUR runs.
        //
        // The roll answers AD_SLEE, index 3, and the monster is given
        // M_SEEN_SLEEP: C then declines that slot and the loop ends with no
        // further slot to try, so the disjunct is FALSE and the monster
        // returns from the switch without reaching PHASE FOUR. That is the
        // arrangement in which the draw is visible and the attack is not.
        const state = makeState();
        const events = [];
        const monster = makeMonster({
            data: {
                mattk: [{ aatyp: AT_BREA, adtyp: AD_RBRE }],
                mflags2: 0,
                mflags3: 0,
            },
            seen_resistance: M_SEEN_SLEEP,
        });
        const env = {
            ...baseEnv(state, events),
            random: {
                rn2: (bound) => {
                    events.push(`rn2:${bound}`);
                    return 3; // AD_SLEE, the fourth rnd_breath_typ[] member
                },
            },
            distanceAndFear: () => {
                events.push('range');
                return { inrange: true, nearby: false, scared: false };
            },
            moveMonster: () => {
                events.push('move');
                return MMOVE_MOVED;
            },
            attackHero: () =>
                assert.fail('a declined breath reaches no attack'),
        };

        assert.equal(await dochug(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'items',
            'move',
            'range',
            'rn2:8',
        ]);
    });

test('dochug keeps a melee-only mover out of the attack phase', async () => {
    // C ref: monmove.c:945-948, all three disjuncts false. A monster with
    // neither a distance attack nor AT_WEAP is the only one whose third
    // disjunct C evaluates at all, and muse.c find_offensive() answers FALSE
    // at its first guard for an animal, spending nothing.
    //
    // The third disjunct's own answer is not observable here and no test can
    // make it so: every arm of js/muse.js find_offensive() either returns
    // FALSE or refuses through `unsupported`, so removing the call changes
    // nothing this boundary can see. What this pins is the arm's result --
    // a mover with no ranged option reaches no attack -- and the claw keeps
    // noattacks() false so that PHASE FOUR's own term is not what stops it.
    const state = makeState();
    const events = [];
    const monster = makeMonster({
        data: {
            mattk: [{ aatyp: AT_CLAW }],
            mflags1: M1_ANIMAL,
            mflags2: 0,
            mflags3: 0,
        },
    });
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { inrange: true, nearby: false, scared: false };
        },
        moveMonster: () => {
            events.push('move');
            return MMOVE_MOVED;
        },
        attackHero: () =>
            assert.fail('a mover with no ranged option does not attack'),
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'move',
        'range',
    ]);
});

test('dochug stops a mover that fell asleep before it tests its attacks',
    async () => {
        // C ref: monmove.c:941-942, `if (helpless(mtmp)) return 0;`, which
        // sits ahead of the disjunction. A monster that stepped onto a
        // sleeping-gas trap during m_move() must not spend
        // ranged_attk_available()'s breath draw, so the injected rn2 fails the
        // test if the order is wrong.
        const state = makeState();
        const events = [];
        const monster = makeMonster({
            data: {
                mattk: [{ aatyp: AT_BREA, adtyp: AD_RBRE }],
                mflags2: 0,
                mflags3: 0,
            },
        });
        const env = {
            ...baseEnv(state, events),
            distanceAndFear: () => {
                events.push('range');
                return { inrange: true, nearby: false, scared: false };
            },
            moveMonster: () => {
                events.push('move');
                monster.msleeping = true;
                return MMOVE_MOVED;
            },
            attackHero: () => assert.fail('a sleeping monster does not attack'),
        };

        assert.equal(await dochug(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'items',
            'move',
            'range',
        ]);
    });

test('dochug attacks a nearby hostile after declining movement', async () => {
    const state = makeState();
    const events = [];
    // C's gate reads noattacks(mdat), so a monster with no attack at all
    // never reaches mattacku(); give this one a melee attack.
    const monster = makeMonster({
        data: {
            mattk: [{ aatyp: AT_CLAW }],
            mflags2: 0,
            mflags3: 0,
        },
    });
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            // nearby implies inrange in distfleeck(), which is what
            // dochug()'s standard-attack gate reads.
            return { inrange: true, nearby: true, scared: false };
        },
        moveMonster: () => assert.fail('nearby hostile does not move'),
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'attack',
    ]);
});

test('dochug attacks an in-range hostile that is not adjacent', async () => {
    // C ref: monmove.c:965-975. The gate is `inrange && !scared`, not
    // adjacency: mhitu.c mattacku() runs its range2 arms for a monster that
    // only believes it is near, which is where a thrown weapon comes from.
    const state = makeState();
    const events = [];
    const monster = makeMonster({
        data: {
            mattk: [{ aatyp: AT_WEAP }],
            mflags2: 0,
            mflags3: 0,
        },
    });
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { inrange: true, nearby: false, scared: false };
        },
        moveMonster: () => {
            events.push('move');
            return MMOVE_NOTHING;
        },
        wieldMonsterItem: () => false,
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'move',
        'range',
        'attack',
    ]);
});

test('dochug leaves a scared in-range hostile alone', async () => {
    // C's `(inrange && !scared) || panicattk`: fear suppresses the attack
    // unless the monster had nowhere to move.
    const state = makeState();
    const events = [];
    const monster = makeMonster({
        data: {
            mattk: [{ aatyp: AT_CLAW }],
            mflags2: 0,
            mflags3: 0,
        },
    });
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { inrange: true, nearby: true, scared: true };
        },
        moveMonster: () => {
            events.push('move');
            return MMOVE_NOTHING;
        },
        attackHero: () => assert.fail('a scared monster does not attack'),
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'move',
        'range',
    ]);
});

test('dochug lets a cornered scared hostile attack anyway', async () => {
    // C ref: monmove.c:918-920. MMOVE_NOMOVES plus scared sets panicattk,
    // which is the one way past the `!scared` term above.
    const state = makeState();
    const events = [];
    const monster = makeMonster({
        data: {
            mattk: [{ aatyp: AT_CLAW }],
            mflags2: 0,
            mflags3: 0,
        },
    });
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { inrange: true, nearby: true, scared: true };
        },
        moveMonster: () => {
            events.push('move');
            return MMOVE_NOMOVES;
        },
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'move',
        'range',
        'attack',
    ]);
});

test('dochug leaves an attackless hostile beside the hero alone', async () => {
    // C ref: monmove.c:968, the `&& !noattacks(mdat)` term of the
    // standard-attack gate. An acid blob's whole attack list is
    // ATTK(AT_NONE, AD_ACID, 1, 8) (monsters.h:139), a passive, so
    // mondata.c noattacks() answers TRUE and mattacku() never runs even
    // though the blob is hostile and adjacent. AT_NONE, not a shorter list,
    // is what C stores: NO_ATTK is itself an AT_NONE entry.
    //
    // The fixture omits the blob's real M2_WANDER bit, which would spend
    // dochug()'s rn2(4) movement draw before the gate and move the test's
    // subject off the arm it pins.
    const state = makeState();
    const events = [];
    const monster = makeMonster({
        data: {
            mattk: [{ aatyp: AT_NONE }],
            mflags2: 0,
            mflags3: 0,
        },
    });
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { inrange: true, nearby: true, scared: false };
        },
        moveMonster: () => assert.fail('nearby hostile does not move'),
        attackHero: () => assert.fail('an attackless monster does not attack'),
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
    ]);
});

test('dochug leaves a cornered hostile out of range alone', async () => {
    // C ref: monmove.c:918-920. MMOVE_NOMOVES sets panicattk only when the
    // recalculated scared is true. Out of BOLT_LIM range both gate terms are
    // then false, and that is the only arrangement that tells the condition
    // from an unconditional panicattk: wherever inrange holds and scared does
    // not, `inrange && !scared` already admits the attack by itself.
    const state = makeState();
    const events = [];
    const monster = makeMonster({
        data: {
            mattk: [{ aatyp: AT_CLAW }],
            mflags2: 0,
            mflags3: 0,
        },
    });
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { inrange: false, nearby: false, scared: false };
        },
        moveMonster: () => {
            events.push('move');
            return MMOVE_NOMOVES;
        },
        attackHero: () => assert.fail('an out-of-range monster does not attack'),
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'move',
        'range',
    ]);
});

test('dochug stops when m_move reports the monster died', async () => {
    const state = makeState();
    const events = [];
    const monster = makeMonster();
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { nearby: false, scared: false };
        },
        moveMonster: () => {
            events.push('move-died');
            return MMOVE_DIED;
        },
    };

    assert.equal(await dochug(monster, env), 1);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'move-died',
    ]);
});

test('dochug stops after a pre-move item action', async () => {
    const state = makeState();
    const events = [];
    const monster = makeMonster();
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push('range');
            return { nearby: false, scared: false };
        },
        usePreMoveItems: () => {
            events.push('use-item');
            return true;
        },
        moveMonster: () => assert.fail('item use spends the action'),
        attackHero: () => assert.fail('item use suppresses attack'),
    };

    assert.equal(await dochug(monster, env), 1);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'use-item',
    ]);
});

test('dochug spends the action when its weapon gate selects a wield',
    async () => {
        const state = makeState();
        const events = [];
        const monster = makeMonster({
            data: {
                mattk: [{ aatyp: AT_WEAP }],
                mflags2: 0,
                mflags3: 0,
            },
            mux: 6,
            muy: 4,
            weapon_check: NEED_WEAPON,
        });
        const env = {
            ...baseEnv(state, events),
            distanceAndFear: () => {
                events.push('range');
                return {
                    inrange: true,
                    nearby: false,
                    scared: false,
                };
            },
            wieldMonsterItem: (subject) => {
                assert.equal(subject.weapon_check, NEED_HTH_WEAPON);
                events.push('wield');
                return true;
            },
            moveMonster: () => assert.fail('wielding spends the action'),
            attackHero: () => assert.fail('wielding suppresses attack'),
        };

        assert.equal(await dochug(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'items',
            'wield',
        ]);
    });

test('dochug redraws a sleeping monster that stays asleep during hallucination',
    async () => {
        const state = makeState();
        state.u.uprops[HALLUC].intrinsic = 1;
        const events = [];
        const monster = makeMonster({ msleeping: true });
        const env = {
            ...baseEnv(state, events),
            disturbMonster: () => {
                events.push('disturb');
                return false;
            },
            redraw: (x, y) => events.push(`redraw:${x},${y}`),
            distanceAndFear: () => assert.fail('sleep bypasses range'),
            moveMonster: () => assert.fail('sleep bypasses movement'),
        };

        assert.equal(await dochug(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'disturb',
            'redraw:4,4',
        ]);
    });

test('dochug does not attack after m_move spends the action', async () => {
    const state = makeState();
    const events = [];
    const monster = makeMonster({ mpeaceful: true });
    let rangeCall = 0;
    const env = {
        ...baseEnv(state, events),
        distanceAndFear: () => {
            events.push(`range-${++rangeCall}`);
            return rangeCall === 1
                ? { nearby: false, scared: false }
                : { inrange: true, nearby: true, scared: false };
        },
        moveMonster: () => {
            events.push('move-done');
            monster.mpeaceful = false;
            return MMOVE_DONE;
        },
        attackHero: () => assert.fail('MMOVE_DONE suppresses attack'),
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range-1',
        'items',
        'move-done',
        'range-2',
    ]);
});
