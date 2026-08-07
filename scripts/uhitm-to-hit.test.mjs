// Direct tests for the uhitm.c entry, to-hit and miss helpers. The end-to-end
// evidence for them is scripts/hostile-melee-miss.test.mjs and the fresh
// matrix behind it; what is here are the branches a live game does not reach
// often enough to pin, and the arithmetic those recordings only see one value
// of.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHAOTIC,
    A_DEX,
    A_LAWFUL,
    A_STR,
    CONFUSION,
    DETECT_MONSTERS,
    HALLUC,
    HVY_ENCUMBER,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    STUNNED,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import {
    AT_BITE,
    AT_CLAW,
    AT_KICK,
    AT_NONE,
    AT_WEAP,
    AD_COLD,
    AD_PHYS,
    PM_ACID_BLOB,
    PM_BROWN_MOLD,
    PM_HILL_ORC,
    PM_ELF,
    PM_KNIGHT,
    PM_LEPRECHAUN,
    PM_LICHEN,
    PM_SAMURAI,
} from '../js/monsters.js';
import {
    attack_checks,
    check_caitiff,
    do_attack,
    double_punch,
    find_roll_to_hit,
    hitum,
    known_hitum,
    missum,
    mon_maybe_unparalyze,
    passive,
} from '../js/uhitm.js';

const DATETIME = '20260214031500';

function rc({ role, gender, align, race, options }) {
    return [
        `OPTIONS=name:Melee,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Any seed that reaches the first prompt will do: these tests supply their own
// target and read the hero the recipe built.
async function hero({
    role = 'Valkyrie',
    gender = 'female',
    align = 'neutral',
    race = 'human',
    options = 'pettype:none,!acoustics',
} = {}) {
    await runSegment({
        seed: 7700376,
        datetime: DATETIME,
        nethackrc: rc({ role, gender, align, race, options }),
        moves: '',
    });
    return game;
}

// assert.throws() matches a regular expression against `String(error)`, which
// carries the class name too; every refusal here is compared by its exact
// reason instead.
function refuses(fn, reason, label) {
    assert.throws(fn, (error) => {
        assert.equal(error.message, reason, label);
        return true;
    }, label);
}

function refusesAsync(fn, reason, label) {
    return assert.rejects(fn, (error) => {
        assert.equal(error.message, reason, label);
        return true;
    }, label);
}

function target(pmidx = PM_LICHEN, overrides = {}) {
    return newMonster({
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 3,
        mhpmax: 3,
        mcanmove: 1,
        data: game.mons[pmidx],
        ...overrides,
    });
}

const REFUSING = {
    unsupported: (reason) => { throw new Error(reason); },
    nearCapacity: () => 0,
};

test('attack_checks admits an ordinary hostile and clears its wait strategy',
    async () => {
        await hero();
        const lichen = target(PM_LICHEN, { mstrategy: STRAT_WAITMASK | 0x40 });
        assert.equal(attack_checks(lichen, game.uwep, game, REFUSING), false);
        // uhitm.c:195 clears STRAT_CLOSE and STRAT_WAITFORU and leaves the
        // rest of mstrategy alone.
        assert.equal(lichen.mstrategy, 0x40);
    });

test('attack_checks stops on each state it cannot report', async () => {
    await hero();
    const cases = [
        ['attacking the engulfer', (mtmp) => {
            game.u.uswallow = 1;
            game.u.ustuck = mtmp;
        }],
        ['force-fight attack', () => { game.context.forcefight = 1; }],
        ['attacking an unseen monster', (mtmp) => { mtmp.mx = 0; mtmp.my = 0; }],
        // Both hidden states also defeat canseemon(), so reaching
        // uhitm.c:261-292 rather than the arm above needs the hero to sense
        // the target some other way, exactly as C's `!canspotmon()` guard
        // demands.
        ['attacking a disguised or hidden monster', (mtmp) => {
            mtmp.mundetected = 1;
            game.u.uprops[DETECT_MONSTERS].intrinsic = 1;
        }],
        ['attacking a disguised or hidden monster', (mtmp) => {
            mtmp.m_ap_type = 3; /* M_AP_MONSTER */
            game.u.uprops[DETECT_MONSTERS].intrinsic = 1;
        }],
        ['confirming an attack on a peaceful monster', (mtmp) => {
            mtmp.mpeaceful = 1;
        }],
    ];
    for (const [reason, apply] of cases) {
        await hero();
        const mtmp = target();
        apply(mtmp);
        refuses(
            () => attack_checks(mtmp, game.uwep, game, REFUSING),
            reason,
            reason,
        );
    }
});

// uhitm.c:302-303. Each of the three states suppresses the confirmation, which
// is why C attacks a peaceful monster outright while confused, hallucinating
// or stunned.
test('a confused, hallucinating or stunned hero skips the confirmation',
    async () => {
        for (const property of [CONFUSION, HALLUC, STUNNED]) {
            await hero();
            const peaceful = target(PM_LICHEN, { mpeaceful: 1 });
            game.u.uprops[property].intrinsic = 1;
            assert.equal(game.flags.confirm, true);
            assert.equal(
                attack_checks(peaceful, game.uwep, game, REFUSING),
                false,
                `property ${property}`,
            );
        }
    });

test('check_caitiff stops only for the two roles that lose alignment',
    async () => {
        // uhitm.c:333. At -10 and below the function returns before either
        // role is consulted; -9 is the last value that still runs.
        await hero({ role: 'Samurai', gender: 'male', align: 'lawful' });
        assert.equal(game.urole.mnum, PM_SAMURAI);
        game.u.ualign.record = -9;
        refuses(
            () => check_caitiff(target(PM_LICHEN, { mpeaceful: 1 }), game,
                REFUSING),
            'samurai giri penalty',
        );
        game.u.ualign.record = -10;
        check_caitiff(target(PM_LICHEN, { mpeaceful: 1 }), game, REFUSING);

        // A Samurai striking a hostile keeps his giri.
        game.u.ualign.record = 0;
        check_caitiff(target(), game, REFUSING);

        await hero({ role: 'Knight', gender: 'male', align: 'lawful' });
        assert.equal(game.urole.mnum, PM_KNIGHT);
        assert.equal(game.u.ualign.type, A_LAWFUL);
        // Helpless: uhitm.c:339's first disjunct.
        refuses(
            () => check_caitiff(target(PM_LICHEN, { msleeping: 1 }), game,
                REFUSING),
            'knightly caitiff penalty',
        );
        // Fleeing without an unavenged grudge: the second disjunct.
        refuses(
            () => check_caitiff(target(PM_LICHEN, { mflee: 1 }), game,
                REFUSING),
            'knightly caitiff penalty',
        );
        // mavenge cancels it, and so does an undead target.
        check_caitiff(
            target(PM_LICHEN, { mflee: 1, mavenge: 1 }), game, REFUSING,
        );
        check_caitiff(target(), game, REFUSING);
        // A chaotic Knight is not bound by chivalry.
        game.u.ualign.type = A_CHAOTIC;
        check_caitiff(target(PM_LICHEN, { msleeping: 1 }), game, REFUSING);
    });

test('mon_maybe_unparalyze draws only for a frozen target', async () => {
    await hero();
    const draws = [];
    const roll = (value) => ({
        rn2(bound) { draws.push(bound); return value; },
    });

    const mobile = target(PM_LICHEN, { mcanmove: 1, mfrozen: 0 });
    mon_maybe_unparalyze(mobile, roll(0));
    assert.deepEqual(draws, []);

    // rn2(10) == 0 is the one-in-ten recovery.
    const freed = target(PM_LICHEN, { mcanmove: 0, mfrozen: 4 });
    mon_maybe_unparalyze(freed, roll(0));
    assert.deepEqual(draws, [10]);
    assert.deepEqual([freed.mcanmove, freed.mfrozen], [1, 0]);

    // Any other roll leaves it paralyzed and its timer running.
    const stuck = target(PM_LICHEN, { mcanmove: 0, mfrozen: 4 });
    mon_maybe_unparalyze(stuck, roll(1));
    assert.deepEqual(draws, [10, 10]);
    assert.deepEqual([stuck.mcanmove, stuck.mfrozen], [0, 4]);
});

// The pieces of uhitm.c:381-422 that a recorded game only ever shows one value
// of. Each row changes one input and states the difference it makes against
// the baseline computed just above it.
test('find_roll_to_hit adds every adjustment its source names', async () => {
    await hero();
    const counters = () => ({ attknum: 0, role_roll_penalty: 0 });
    const roll = (mtmp, state = game, env = REFUSING) => find_roll_to_hit(
        mtmp, AT_WEAP, state.uwep, counters(), state, env,
    );
    const base = roll(target());

    // uhitm.c:387-393, +2 each and +4 for a target that cannot move.
    assert.equal(roll(target(PM_LICHEN, { mstun: 1 })), base + 2);
    assert.equal(roll(target(PM_LICHEN, { mflee: 1 })), base + 2);
    assert.equal(roll(target(PM_LICHEN, { msleeping: 1 })), base + 2);
    assert.equal(roll(target(PM_LICHEN, { mcanmove: 0 })), base + 4);

    // uhitm.c:407-408, u.utrap costs three.
    game.u.utrap = 2;
    assert.equal(roll(target()), base - 3);
    game.u.utrap = 0;

    // uhitm.c:405-406, `tmp -= (near_capacity() * 2) - 1`.
    assert.equal(
        roll(target(), game, { ...REFUSING, nearCapacity: () => HVY_ENCUMBER }),
        base - ((HVY_ENCUMBER * 2) - 1),
    );

    // uhitm.c:401-402: an elf hits an orc more easily. This hero is human, so
    // the same orc is worth nothing extra.
    const humanVsOrc = roll(target(PM_HILL_ORC)) - base;
    await hero({ role: 'Ranger', gender: 'male', race: 'elf' });
    assert.equal(game.urace.mnum, PM_ELF);
    assert.equal(
        roll(target(PM_HILL_ORC)) - roll(target(PM_LICHEN)),
        humanVsOrc + 1,
    );
});

test('find_roll_to_hit reads the Monk arms and refuses a kick', async () => {
    await hero({ role: 'Monk', gender: 'male' });
    const counters = () => ({ attknum: 0, role_roll_penalty: 0 });
    const barehanded = find_roll_to_hit(
        target(), AT_CLAW, null, counters(), game, REFUSING,
    );

    // uhitm.c:398-399, `(u.ulevel / 3) + 2` for a Monk with neither a weapon
    // nor a shield. Giving him a shield removes it.
    game.uarms = { otyp: 0, oclass: 3 };
    const shielded = find_roll_to_hit(
        target(), AT_CLAW, null, counters(), game, REFUSING,
    );
    game.uarms = null;
    assert.equal(
        barehanded - shielded,
        Math.trunc(game.u.ulevel / 3) + 2,
    );

    // uhitm.c:395-396, body armor costs gu.urole.spelarmr and reports it
    // through the caller's armorpenalty.
    game.uarm = { otyp: 0, oclass: 3 };
    const armored = counters();
    const penalized = find_roll_to_hit(
        target(), AT_CLAW, null, armored, game, REFUSING,
    );
    game.uarm = null;
    assert.equal(armored.role_roll_penalty, game.urole.spelarmr);
    // The two arms are exclusive, so body armor costs the penalty and the
    // bare-handed bonus together.
    assert.equal(
        barehanded - penalized,
        game.urole.spelarmr + Math.trunc(game.u.ulevel / 3) + 2,
    );

    // uhitm.c:424-425, the AT_KICK arm belongs to dokick.c.
    refuses(
        () => find_roll_to_hit(
            target(), AT_KICK, null, counters(), game, REFUSING,
        ),
        'kicked to-hit roll',
    );
});

// uhitm.c:369-370: check_caitiff() runs on the first attack of a series only.
test('find_roll_to_hit consults check_caitiff once per series', async () => {
    await hero({ role: 'Samurai', gender: 'male', align: 'lawful' });
    const counters = { attknum: 0, role_roll_penalty: 0 };
    const peaceful = target(PM_LICHEN, { mpeaceful: 1 });
    refuses(
        () => find_roll_to_hit(
            peaceful, AT_WEAP, game.uwep, counters, game, REFUSING,
        ),
        'samurai giri penalty',
    );
    assert.equal(counters.attknum, 1);
    // The second call in the same series skips it, so the giri penalty that
    // stopped the first one does not stop this one.
    find_roll_to_hit(
        peaceful, AT_WEAP, game.uwep, counters, game, REFUSING,
    );
    assert.equal(counters.attknum, 2);
});

test('double_punch needs empty hands and a trained skill', async () => {
    await hero({ role: 'Monk', gender: 'male' });
    const draws = [];
    const roll = (value) => ({
        rn2(bound) { draws.push(bound); return value; },
    });

    // A starting Monk is Basic in martial arts, which is not `> P_BASIC`.
    assert.equal(double_punch(game, roll(0)), false);
    assert.deepEqual(draws, []);

    // Skilled is the first level that tries: (3 - 2) > rn2(5) is true only for
    // a roll of 0, which is the documented 20%.
    game.u.weapon_skills[35].skill = 3; /* P_SKILLED */
    assert.equal(double_punch(game, roll(0)), true);
    assert.equal(double_punch(game, roll(1)), false);
    assert.deepEqual(draws, [5, 5]);

    // A wielded weapon or a shield takes the arm away before the draw.
    game.uwep = { otyp: 0, oclass: 2 };
    assert.equal(double_punch(game, roll(0)), false);
    game.uwep = null;
    game.uarms = { otyp: 0, oclass: 3 };
    assert.equal(double_punch(game, roll(0)), false);
    game.uarms = null;
    assert.deepEqual(draws, [5, 5]);
});

test('missum names the target only when it is both seen and verbose',
    async () => {
        await hero();
        const lines = [];
        const env = {
            ...REFUSING,
            message: (text) => { lines.push(text); },
        };
        const mattk = game.youmonst.data.mattk[0];

        await missum(target(), mattk, false, game, env);
        assert.deepEqual(lines, ['You miss the lichen.']);

        // uhitm.c:5203-5204, the Monk's armor penalty line precedes the miss.
        lines.length = 0;
        await missum(target(), mattk, true, game, env);
        assert.deepEqual(lines, [
            'Your armor is rather cumbersome...',
            'You miss the lichen.',
        ]);

        // uhitm.c:5211 with `verbose` off.
        lines.length = 0;
        game.flags.verbose = false;
        await missum(target(), mattk, false, game, env);
        assert.deepEqual(lines, ['You miss it.']);
        game.flags.verbose = true;

        // uhitm.c:5211 again, this time because the target cannot be spotted.
        lines.length = 0;
        await missum(target(PM_LICHEN, { mx: 0, my: 0 }), mattk, false, game,
            env);
        assert.deepEqual(lines, ['You miss it.']);
    });

// uhitm.c:5213. wakeup() angers the target, which for a hostile means clearing
// its wait strategy; a helpless one is left exactly as it was.
test('missum wakes a mobile target and leaves a helpless one alone',
    async () => {
        await hero();
        const env = { ...REFUSING, message: async () => {} };
        const mattk = game.youmonst.data.mattk[0];

        const awake = target(PM_LICHEN, { mstrategy: STRAT_WAITFORU });
        await missum(awake, mattk, false, game, env);
        assert.equal(awake.mstrategy, 0);

        for (const helpless of [{ msleeping: 1 }, { mcanmove: 0 }]) {
            const untouched = target(PM_LICHEN, {
                mstrategy: STRAT_WAITFORU, ...helpless,
            });
            await missum(untouched, mattk, false, game, env);
            assert.equal(untouched.mstrategy, STRAT_WAITFORU);
            assert.equal(Boolean(untouched.msleeping),
                Boolean(helpless.msleeping));
        }
    });

test('passive draws once for a live ordinary target and never for a corpse',
    async () => {
        await hero();
        const draws = [];
        const env = {
            ...REFUSING,
            random: {
                d(n, x) { draws.push(`d(${n},${x})`); return n; },
                rn2(bound) { draws.push(`rn2(${bound})`); return 1; },
            },
        };

        // uhitm.c:6013, the guard on the second switch.
        passive(target(), null, false, true, AT_WEAP, false, game, env);
        assert.deepEqual(draws, ['rn2(3)']);

        // A dead target makes it, and a cancelled one does not.
        draws.length = 0;
        passive(target(), null, false, false, AT_WEAP, false, game, env);
        passive(target(PM_LICHEN, { mcan: 1 }), null, false, true, AT_WEAP,
            false, game, env);
        assert.deepEqual(draws, []);

        // uhitm.c:5876-5877, a species with all six attack slots filled has no
        // empty one to read and returns before the dice.
        const full = target();
        full.data = {
            ...game.mons[PM_LICHEN],
            mattk: Array.from({ length: 6 }, () => ({
                aatyp: AT_BITE, adtyp: AD_PHYS, damn: 1, damd: 2,
            })),
        };
        passive(full, null, false, true, AT_WEAP, false, game, env);
        assert.deepEqual(draws, []);
    });

test('passive rolls the empty slot dice and stops on a real counter-attack',
    async () => {
        await hero();
        const draws = [];
        const env = {
            ...REFUSING,
            random: {
                d(n, x) { draws.push(`d(${n},${x})`); return n; },
                rn2(bound) { draws.push(`rn2(${bound})`); return 1; },
            },
        };

        // A brown mold's first slot is ATTK(AT_NONE, AD_COLD, 0, 6), so
        // uhitm.c:5883-5884 rolls d(m_lev + 1, 6) before the damage type is
        // read, and the type then stops.
        const mold = target(PM_BROWN_MOLD, { m_lev: 1 });
        assert.equal(mold.data.mattk[0].adtyp, AD_COLD);
        refuses(
            () => passive(mold, null, false, true, AT_WEAP, false, game, env),
            'passive counter-attack',
        );
        assert.deepEqual(draws, ['d(2,6)']);

        // An acid blob's slot carries its own dice, which take the other arm
        // of the same conditional.
        draws.length = 0;
        const blob = target(PM_ACID_BLOB);
        const slot = blob.data.mattk[0];
        assert.equal(slot.aatyp, AT_NONE);
        refuses(
            () => passive(blob, null, false, true, AT_WEAP, false, game, env),
            'passive counter-attack',
        );
        assert.deepEqual(draws, [`d(${slot.damn},${slot.damd})`]);
    });

// do_attack()'s hostile arm and the two functions under it, driven directly so
// that each of its early exits and each write it makes can be seen on its own.
// The env is the one js/hack.js domove() builds, with the two hack.c owners
// injected because js/hack.js imports this module.

function meleeEnv({ dieroll = 20, ...overrides } = {}) {
    const lines = [];
    const bounds = [];
    const env = {
        checkCapacity: async () => false,
        encumberMessage: async () => {},
        endRunning: () => {},
        message: async (text) => { lines.push(text); },
        nearCapacity: () => 0,
        overexertion: async () => false,
        unsupported: (reason) => { throw new Error(reason); },
        random: {
            d: () => 0,
            rn2(bound) { bounds.push(`rn2(${bound})`); return 1; },
            rnd(bound) { bounds.push(`rnd(${bound})`); return dieroll; },
        },
        ...overrides,
    };
    env.lines = lines;
    env.bounds = bounds;
    return env;
}

test('do_attack abandons the swing on either upkeep owner', async () => {
    await hero();
    for (const owner of ['checkCapacity', 'overexertion']) {
        await hero();
        let swung = false;
        const env = meleeEnv({
            [owner]: async () => true,
            random: {
                d: () => 0,
                rn2: () => 1,
                rnd() { swung = true; return 20; },
            },
        });
        // uhitm.c:523-526 jumps to atk_done, which returns TRUE: the step is
        // used up even though nothing was struck.
        assert.equal(await do_attack(target(), game, env), true, owner);
        assert.equal(swung, false, owner);
        assert.deepEqual(env.lines, [], owner);
    }
});

test('do_attack clears gu.unweapon and exercises Strength before swinging',
    async () => {
        await hero();
        // uhitm.c:531-541. With `verbose` off C prints nothing and only the
        // flag changes; with it on the announcement has no port.
        game.unweapon = true;
        game.flags.verbose = false;
        const env = meleeEnv();
        assert.equal(await do_attack(target(), game, env), true);
        assert.equal(game.unweapon, false);
        // uhitm.c:543's exercise(A_STR, TRUE). attrib.c exercise() draws
        // rn2(19) to raise an attribute and rn2(2) to lower one, so the bound
        // is what says which way this call goes. The rnd(20) after it is the
        // to-hit roll and the rn2(3) is passive()'s.
        assert.deepEqual(env.bounds, ['rn2(19)', 'rnd(20)', 'rn2(3)']);

        game.unweapon = true;
        game.flags.verbose = true;
        await refusesAsync(
            () => do_attack(target(), game, meleeEnv()),
            'first bash message',
        );
        game.flags.verbose = true;
    });

test('do_attack stops for the states below its upkeep', async () => {
    for (const [reason, apply] of [
        ['two-weapon melee', () => { game.u.twoweap = true; }],
        ['leprechaun dodge', () => {}],
    ]) {
        await hero();
        apply();
        const mtmp = reason === 'leprechaun dodge'
            ? target(PM_LEPRECHAUN) : target();
        await refusesAsync(
            () => do_attack(mtmp, game, meleeEnv()),
            reason,
        );
    }
});

// uhitm.c:779-790. The roll decides the arm, and only a hit exercises
// Dexterity; uswallow forces a hit whatever the roll said.
test('hitum compares the roll with the number find_roll_to_hit returned',
    async () => {
        await hero();
        const uattk = game.youmonst.data.mattk[0];
        // The number the roll is compared against, computed the way hitum()
        // computes it, so the rows below can straddle it exactly.
        const tmp = find_roll_to_hit(
            target(), uattk.aatyp, game.uwep,
            { attknum: 0, role_roll_penalty: 0 }, game, REFUSING,
        );

        // uhitm.c:780-781, `mhit = (tmp > dieroll)`. At tmp the roll is not
        // beaten, so this is a miss and Dexterity is not exercised.
        const equal = meleeEnv({ dieroll: tmp });
        await hitum(target(), uattk, game, equal);
        assert.deepEqual(equal.lines, ['You miss the lichen.']);
        assert.deepEqual(equal.bounds,
            [`rnd(20)`, 'rn2(3)']);

        // One below it is a hit, and uhitm.c:783's exercise(A_DEX, TRUE)
        // draws rn2(19) before known_hitum() reaches hmon() and stops.
        const beaten = meleeEnv({ dieroll: tmp - 1 });
        await refusesAsync(
            () => hitum(target(), uattk, game, beaten),
            'melee damage',
        );
        assert.deepEqual(beaten.bounds, [`rnd(20)`, 'rn2(19)']);

        // uhitm.c:781, u.uswallow forces the hit arm however the roll came
        // out; the exercise stays behind the comparison, so it does not run.
        game.u.uswallow = 1;
        const swallowed = meleeEnv({ dieroll: tmp });
        await refusesAsync(
            () => hitum(target(), uattk, game, swallowed),
            'melee damage',
        );
        assert.deepEqual(swallowed.bounds, [`rnd(20)`]);
        game.u.uswallow = 0;
    });

// uhitm.c:608. missum()'s third argument is `rollneeded + armorpenalty >
// dieroll`, which is what separates a Monk who missed because of his suit
// from one who would have missed anyway. The three rows straddle the
// comparison.
test('known_hitum reports the armor penalty only when it decided the miss',
    async () => {
        await hero();
        const mhit = () => ({ value: 0 });
        const run = async (rollneeded, armorpenalty, dieroll) => {
            const env = meleeEnv();
            const alive = await known_hitum(
                target(), null, mhit(), rollneeded, armorpenalty, dieroll,
                dieroll, game, env,
            );
            assert.equal(alive, true);
            return env.lines;
        };

        // Under: the swing would have missed without the suit.
        assert.deepEqual(await run(5, 2, 8), ['You miss the lichen.']);
        // Equal: still not enough, so C stays silent about the suit.
        assert.deepEqual(await run(5, 3, 8), ['You miss the lichen.']);
        // Over: the suit is what cost the hit.
        assert.deepEqual(await run(5, 4, 8), [
            'Your armor is rather cumbersome...',
            'You miss the lichen.',
        ]);
    });
