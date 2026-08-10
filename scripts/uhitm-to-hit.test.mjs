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
    HALLUC_RES,
    HVY_ENCUMBER,
    P_BARE_HANDED_COMBAT,
    P_SKILLED,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    STUNNED,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { is_undead } from '../js/mondata.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
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
    PM_GNOME_ZOMBIE,
    PM_LEPRECHAUN,
    PM_LICHEN,
    PM_SAMURAI,
    NON_PM,
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
import { skillSlot } from '../js/startup_skills.js';
import { can_twoweapon } from '../js/wield.js';

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
        // makemon() sets these two beside data, and a target that dies needs
        // both: mon.c mondead():3103 restores a chameleon to mons[cham], and
        // newMonster() leaves cham at C's zeroed 0, which is a valid species
        // index. Without this a killed test target turns into a giant ant
        // before corpse_chance() reads its size.
        mnum: pmidx,
        cham: NON_PM,
        ...overrides,
    });
}

// u_init.c:143-144 arms the Samurai with a katana over a short sword and no
// shield, the one starting loadout wield.c can_twoweapon() accepts outright.
function samurai() {
    return hero({ role: 'Samurai', gender: 'male', align: 'lawful' });
}

// uhitm.c:764 reads the aimed square off u.dx and u.dy, and :799 looks the
// target up there again before the second swing, so a test that wants that
// swing has to put the monster on the map and aim the step at it. Each call
// takes the next free square east of the hero and re-aims at it.
function placedTarget(pmidx = PM_LICHEN, overrides = {}) {
    let dx = 1;
    while (m_at(game.u.ux + dx, game.u.uy, game)) dx++;
    const mtmp = target(pmidx, { mx: game.u.ux + dx, ...overrides });
    place_monster(mtmp, mtmp.mx, game.u.uy, game);
    game.u.dx = dx;
    game.u.dy = 0;
    return mtmp;
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
        // uhitm.c:196 clears STRAT_CLOSE and STRAT_WAITFORU and leaves the
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
        // A forced blow at a target the hero cannot spot is the one case that
        // would reach do_attack()'s unported atk_done tail, so it stops in the
        // arm above rather than in the unseen-monster arm below.
        ['force-fight at a monster the hero cannot spot', (mtmp) => {
            game.context.forcefight = 1;
            mtmp.mx = 0;
            mtmp.my = 0;
        }],
        ['attacking an unseen monster', (mtmp) => { mtmp.mx = 0; mtmp.my = 0; }],
        // Both hidden states also defeat canseemon(), so reaching
        // uhitm.c:254-297 rather than the arm above needs the hero to sense
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

// uhitm.c:201-214 returns FALSE above every arm below it, and that position is
// the whole of what the 'F' prefix buys: a target that stops an ordinary step
// is answered by the swing instead. Each state below therefore has to refuse
// without the prefix and be admitted with it.
test('a force-fight returns above the arms that stop an ordinary step',
    async () => {
        const cases = [
            ['attacking a disguised or hidden monster', (mtmp) => {
                mtmp.m_ap_type = 3; /* M_AP_MONSTER */
                game.u.uprops[DETECT_MONSTERS].intrinsic = 1;
            }],
            ['attacking a disguised or hidden monster', (mtmp) => {
                mtmp.mundetected = 1;
                game.u.uprops[DETECT_MONSTERS].intrinsic = 1;
            }],
            ['confirming an attack on a peaceful monster', (mtmp) => {
                mtmp.mpeaceful = 1;
            }],
        ];
        for (const [reason, apply] of cases) {
            await hero();
            const stepped = target();
            apply(stepped);
            refuses(
                () => attack_checks(stepped, game.uwep, game, REFUSING),
                reason,
                reason,
            );

            await hero();
            // 0x40 is inside monst.h:187's STRAT_GOAL field, which the write
            // has to leave alone.
            const forced = target(PM_LICHEN, {
                mstrategy: STRAT_WAITMASK | 0x40,
            });
            apply(forced);
            game.context.forcefight = 1;
            assert.equal(
                attack_checks(forced, game.uwep, game, REFUSING),
                false,
                reason,
            );
            // uhitm.c:196 still runs: the arm returns below the strategy
            // write, not above it.
            assert.equal(forced.mstrategy, 0x40, reason);
        }
    });

// uhitm.c:198-199 reads monst.h:250 engulfing_u(). Every other read in
// attack_checks() answers from the state argument, and this one has to as
// well, or a caller working on any state but the module global gets the
// engulfer guard decided by a different hero.
test('attack_checks reads the engulfer from the state it was given',
    async () => {
        await hero();
        const mtmp = target();
        assert.ok(!game.u.uswallow);
        const swallowed = {
            ...game,
            u: { ...game.u, uswallow: 1, ustuck: mtmp },
        };
        refuses(
            () => attack_checks(mtmp, game.uwep, swallowed, REFUSING),
            'attacking the engulfer',
        );

        // The macro is a conjunction, and each half decides on its own: a
        // monster that merely holds the hero is not engulfing her, and being
        // inside something else is not being inside this target.
        const held = { ...game, u: { ...game.u, uswallow: 0, ustuck: mtmp } };
        assert.equal(attack_checks(mtmp, game.uwep, held, REFUSING), false);
        const elsewhere = {
            ...game,
            u: { ...game.u, uswallow: 1, ustuck: target(PM_LEPRECHAUN) },
        };
        assert.equal(attack_checks(mtmp, game.uwep, elsewhere, REFUSING),
                     false);

        // And the reverse: an engulfed module-global hero must not decide for
        // a state that says the hero is free.
        game.u.uswallow = 1;
        game.u.ustuck = mtmp;
        const free = { ...game, u: { ...game.u, uswallow: 0, ustuck: null } };
        assert.equal(attack_checks(mtmp, game.uwep, free, REFUSING), false);
    });

// uhitm.c:302-303, `!Confusion && !Hallucination && !Stunned`. Each of the
// three states suppresses the confirmation, which is why C attacks a peaceful
// monster outright while confused, hallucinating or stunned -- but the three
// macros are not the same shape, and a row that sets only `.intrinsic` cannot
// tell them apart. youprop.h:80 and :83 make Stunned and Confusion the
// intrinsic alone; :120 makes Hallucination the intrinsic minus
// Halluc_resistance, which has an intrinsic and an extrinsic source of its
// own and no extrinsic hallucination term to go with them.
test('the confirmation reads each suppressing property the way C spells it',
    async () => {
        for (const [label, suppressed, install] of [
            ['confusion intrinsic', true, (hero) => {
                hero.uprops[CONFUSION].intrinsic = 1;
            }],
            ['stun intrinsic', true, (hero) => {
                hero.uprops[STUNNED].intrinsic = 1;
            }],
            ['hallucination intrinsic', true, (hero) => {
                hero.uprops[HALLUC].intrinsic = 1;
            }],
            // No worn item confers any of the three, so an extrinsic alone
            // leaves the confirmation standing.
            ['confusion extrinsic only', false, (hero) => {
                hero.uprops[CONFUSION].extrinsic = 1;
            }],
            ['stun extrinsic only', false, (hero) => {
                hero.uprops[STUNNED].extrinsic = 1;
            }],
            ['hallucination extrinsic only', false, (hero) => {
                hero.uprops[HALLUC].extrinsic = 1;
            }],
            // Halluc_resistance cancels the intrinsic from either source.
            ['hallucination met by intrinsic resistance', false, (hero) => {
                hero.uprops[HALLUC].intrinsic = 1;
                hero.uprops[HALLUC_RES].intrinsic = 1;
            }],
            ['hallucination met by extrinsic resistance', false, (hero) => {
                hero.uprops[HALLUC].intrinsic = 1;
                hero.uprops[HALLUC_RES].extrinsic = 1;
            }],
            // Resistance on its own subtracts nothing.
            ['resistance without hallucination', false, (hero) => {
                hero.uprops[HALLUC_RES].intrinsic = 1;
            }],
        ]) {
            await hero();
            const peaceful = target(PM_LICHEN, { mpeaceful: 1 });
            install(game.u);
            assert.equal(game.flags.confirm, true, label);
            if (suppressed) {
                assert.equal(
                    attack_checks(peaceful, game.uwep, game, REFUSING),
                    false,
                    label,
                );
            } else {
                refuses(
                    () => attack_checks(peaceful, game.uwep, game, REFUSING),
                    'confirming an attack on a peaceful monster',
                    label,
                );
            }
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
        // An unavenged grudge is what makes flight caitiff, so mavenge
        // cancels it.
        check_caitiff(
            target(PM_LICHEN, { mflee: 1, mavenge: 1 }), game, REFUSING,
        );
        // uhitm.c:338's own term: a sleeping gnome zombie is as helpless as
        // any other sleeper, and chivalry does not extend to the undead. This
        // target fails nothing else in the guard, so is_undead() is the only
        // thing keeping the penalty away.
        assert.equal(is_undead(game.mons[PM_GNOME_ZOMBIE]), true);
        check_caitiff(
            target(PM_GNOME_ZOMBIE, { msleeping: 1 }), game, REFUSING,
        );
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

// `dieroll` answers every rnd(). A two-weapon attempt rolls rnd(20) twice and
// the two swings need separate answers, so it may also be a function of the
// bound and of how many rnd() calls have gone before.
function meleeEnv({ dieroll = 20, rn2Result = () => 1, ...overrides } = {}) {
    const lines = [];
    const bounds = [];
    const rolls = [];
    const nextRoll = typeof dieroll === 'function' ? dieroll : () => dieroll;
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
            rn2(bound) { bounds.push(`rn2(${bound})`); return rn2Result(bound); },
            rnd(bound) {
                bounds.push(`rnd(${bound})`);
                const value = nextRoll(bound, rolls.length);
                rolls.push(value);
                return value;
            },
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
    await hero();
    await refusesAsync(
        () => do_attack(target(PM_LEPRECHAUN), game, meleeEnv()),
        'leprechaun dodge',
    );
});

// uhitm.c:528-529, `if (u.twoweap && !can_twoweapon()) untwoweapon();`. A hero
// who can still sustain the pair runs nothing here and falls through to the
// exercise, the swing and the passive counter-attack below.
test('do_attack lets a sustainable two-weapon pair swing twice', async () => {
    // u_init.c arms the Samurai with a katana, a short sword in the swap slot
    // and no shield, which is can_twoweapon()'s success path.
    await samurai();
    assert.equal(await can_twoweapon(game), true);
    game.u.twoweap = true;

    // Rolling exactly the number find_roll_to_hit() returned is a miss. The
    // off-hand short sword has no oc_hitbon where the katana has +1, so one
    // number under the first misses the second swing as well.
    const mtmp = placedTarget();
    const uattk = game.youmonst.data.mattk[0];
    const tmp = find_roll_to_hit(
        mtmp, uattk.aatyp, game.uwep,
        { attknum: 0, role_roll_penalty: 0 }, game, REFUSING,
    );
    const env = meleeEnv({ dieroll: tmp });
    assert.equal(await do_attack(mtmp, game, env), true);
    // exercise(A_STR, TRUE) at 543, the to-hit roll at 780, passive()'s guard
    // at 6013, and then the second to-hit roll at 804. uhitm.c:809 skips the
    // second passive() because the second swing missed, and 783 has no
    // counterpart at 801, so no exercise follows either roll.
    assert.deepEqual(env.bounds, ['rn2(19)', 'rnd(20)', 'rn2(3)', 'rnd(20)']);
    assert.deepEqual(
        env.lines, ['You miss the lichen.', 'You miss the lichen.'],
    );
    // uhitm.c:813 clears gt.twohits before returning.
    assert.equal(game.twohits, 0);
});

// uhitm.c:776 sets gt.twohits from u.twoweap, and 797 opens the second attack
// on it. With the pair switched off the same hero, the same target and the
// same roll produce one swing.
test('do_attack swings once when two-weapon combat is off', async () => {
    await samurai();
    assert.equal(game.u.twoweap, false);

    const mtmp = placedTarget();
    const uattk = game.youmonst.data.mattk[0];
    const tmp = find_roll_to_hit(
        mtmp, uattk.aatyp, game.uwep,
        { attknum: 0, role_roll_penalty: 0 }, game, REFUSING,
    );
    const env = meleeEnv({ dieroll: tmp });
    assert.equal(await do_attack(mtmp, game, env), true);
    assert.deepEqual(env.bounds, ['rn2(19)', 'rnd(20)', 'rn2(3)']);
    assert.deepEqual(env.lines, ['You miss the lichen.']);
    assert.equal(game.twohits, 0);
});

// uhitm.c:801-811. Both swings land, which is where the second attack differs
// most from a repeat of the first: it rolls the off hand's damage die, it
// exercises no attribute, and it runs passive() again.
test('both swings roll their own weapon and only the first trains Dexterity',
    async () => {
        await samurai();
        game.u.twoweap = true;
        const mtmp = placedTarget(PM_LICHEN, { mhp: 99, mhpmax: 99 });
        // One is under every to-hit number these weapons can produce, so both
        // swings land.
        const env = meleeEnv({ dieroll: 1 });
        assert.equal(await do_attack(mtmp, game, env), true);
        assert.deepEqual(env.bounds, [
            // exercise(A_STR, TRUE) at 543 and the first roll at 780.
            'rn2(19)', 'rnd(20)',
            // exercise(A_DEX, TRUE) at 783, which only a landed first swing
            // reaches, then the katana's oc_wsdam 10 against a small target,
            // known_hitum():624's morale check and passive()'s guard.
            'rn2(19)', 'rnd(10)', 'rn2(25)', 'rn2(3)',
            // The second roll at 804 with no exercise behind it, the short
            // sword's oc_wsdam 6, and the same two closers.
            'rnd(20)', 'rnd(6)', 'rn2(25)', 'rn2(3)',
        ]);
        assert.deepEqual(env.lines, [
            'You hit the lichen.', 'You hit the lichen.',
        ]);
        // known_hitum():612-614 counts one conduct breach per landed blow.
        assert.equal(game.u.uconduct.weaphit, 2);
    });

// uhitm.c:799's `!malive`. A target the first swing killed is not swung at
// again, and the turn holds one to-hit roll.
test('a fatal first swing cancels the second', async () => {
    await samurai();
    game.u.twoweap = true;
    const mtmp = placedTarget(PM_LICHEN, { mhp: 1, mhpmax: 1 });
    const env = meleeEnv({ dieroll: 1 });
    assert.equal(await do_attack(mtmp, game, env), true);
    assert.equal(mtmp.mhp < 1, true);
    // rnd(10) is the katana; rn2(6) and rn2(2) are xkilled()'s treasure drop
    // and corpse_chance(). No second rnd(20) follows them.
    assert.deepEqual(env.bounds, [
        'rn2(19)', 'rnd(20)', 'rn2(19)', 'rnd(10)', 'rn2(6)', 'rn2(2)',
    ]);
    assert.deepEqual(env.lines, ['You kill the lichen!']);
    assert.equal(game.twohits, 0);
});

// uhitm.c:799's `m_at(x, y) != mon`, where x and y are the square the step was
// aimed at, captured at 764 before the first swing. C is guarding against a
// target knocked elsewhere; either way the second swing is aimed at a square,
// not at a monster, and stops when the monster it hit is no longer standing
// there.
test('the second swing stops when the aimed square no longer holds the target',
    async () => {
        const uattk = () => game.youmonst.data.mattk[0];
        // A live target one square east, and the step aimed one square west.
        await samurai();
        game.u.twoweap = true;
        const elsewhere = placedTarget(PM_LICHEN, { mhp: 99, mhpmax: 99 });
        game.u.dx = -1;
        assert.notEqual(m_at(game.u.ux - 1, game.u.uy, game), elsewhere);
        const empty = meleeEnv({ dieroll: 1 });
        await hitum(elsewhere, uattk(), game, empty);
        assert.deepEqual(empty.bounds, [
            'rnd(20)', 'rn2(19)', 'rnd(10)', 'rn2(25)', 'rn2(3)',
        ]);
        assert.deepEqual(empty.lines, ['You hit the lichen.']);

        // The same aim with a different monster standing on the square, so
        // the test separates "no monster" from "not this monster".
        await samurai();
        game.u.twoweap = true;
        const struck = placedTarget(PM_LICHEN, { mhp: 99, mhpmax: 99 });
        const bystander = placedTarget(PM_LICHEN, { mhp: 99, mhpmax: 99 });
        // placedTarget() aimed the step at the second monster it placed.
        assert.equal(m_at(game.u.ux + game.u.dx, game.u.uy, game), bystander);
        const occupied = meleeEnv({ dieroll: 1 });
        await hitum(struck, uattk(), game, occupied);
        assert.deepEqual(occupied.bounds, [
            'rnd(20)', 'rn2(19)', 'rnd(10)', 'rn2(25)', 'rn2(3)',
        ]);
        assert.equal(bystander.mhp, 99);
    });

// uhitm.c:805, `mhit = (tmp > dieroll || u.uswallow)`, on the second swing's
// own to-hit number rather than the first's. The rows straddle the comparison
// and the last one forces the hit from the other side of the `||`.
test('the second swing compares its roll with the off hand\'s number',
    async () => {
        await samurai();
        const uattk = game.youmonst.data.mattk[0];
        // uhitm.c:801 hands find_roll_to_hit() uswapwep, and 781 has already
        // spent the first attack, so attknum arrives at 1.
        const second = (mtmp) => find_roll_to_hit(
            mtmp, uattk.aatyp, game.uswapwep,
            { attknum: 1, role_roll_penalty: 0 }, game, REFUSING,
        );
        const first = (mtmp) => find_roll_to_hit(
            mtmp, uattk.aatyp, game.uwep,
            { attknum: 0, role_roll_penalty: 0 }, game, REFUSING,
        );
        // The first roll is the first swing's own number, which misses, so the
        // second roll is the only one that can land and the damage die names
        // which weapon swung.
        const run = async (secondRoll, { swallow = 0 } = {}) => {
            await samurai();
            game.u.twoweap = true;
            game.u.uswallow = swallow;
            const mtmp = placedTarget(PM_LICHEN, { mhp: 99, mhpmax: 99 });
            const env = meleeEnv({
                dieroll: (bound, index) => (
                    index === 0 ? first(mtmp) : secondRoll(mtmp)
                ),
            });
            await hitum(mtmp, uattk, game, env);
            game.u.uswallow = 0;
            return env.bounds;
        };

        // Equal: `tmp > dieroll` is false, so the second swing misses too.
        assert.deepEqual(
            await run((mtmp) => second(mtmp)),
            ['rnd(20)', 'rn2(3)', 'rnd(20)'],
        );
        // One under: it lands, and the short sword's rnd(6) proves which
        // weapon swung.
        assert.deepEqual(
            await run((mtmp) => second(mtmp) - 1),
            ['rnd(20)', 'rn2(3)', 'rnd(20)', 'rnd(6)', 'rn2(25)', 'rn2(3)'],
        );
        // Equal again, with the hero swallowed: the second half of the `||`
        // makes the second swing a hit whatever the roll said. 781 spells the
        // first swing's test the same way, so both land, and the exercise at
        // 783 stays behind the bare comparison and never runs.
        assert.deepEqual(
            await run((mtmp) => second(mtmp), { swallow: 1 }),
            ['rnd(20)', 'rnd(10)', 'rn2(25)', 'rn2(3)',
             'rnd(20)', 'rnd(6)', 'rn2(25)', 'rn2(3)'],
        );
    });

// uhitm.c:762 captures `secondwep` as uswapwep only while u.twoweap is set,
// and 806 hands known_hitum() that capture while 801 hands find_roll_to_hit()
// the live uswapwep. A bare-handed double punch is where the two differ: the
// off hand is empty, so the blow rolls a fist's die even though the number it
// had to beat was computed from the object in the swap slot.
test('a double punch swings a fist while the swap slot still holds a weapon',
    async () => {
        await samurai();
        const uattk = game.youmonst.data.mattk[0];
        // weapon.c skill_init() leaves every role Basic at bare-handed combat
        // at best, so double_punch()'s `skl_lvl > P_BASIC` needs #enhance to
        // pass; the state is set here rather than played out.
        skillSlot(P_BARE_HANDED_COMBAT, game).skill = P_SKILLED;
        game.uwep = null;
        assert.ok(game.uswapwep, 'the swap slot still holds the short sword');
        assert.equal(game.u.twoweap, false);

        const mtmp = placedTarget(PM_LICHEN, { mhp: 99, mhpmax: 99 });
        const env = meleeEnv({
            dieroll: 1,
            // double_punch()'s rn2(5) at 752 must come out under
            // `skl_lvl - P_BASIC`, which is 1 at Skilled.
            rn2Result: (bound) => (bound === 5 ? 0 : 1),
        });
        await hitum(mtmp, uattk, game, env);
        assert.deepEqual(env.bounds, [
            // double_punch()'s draw comes before the first to-hit roll.
            'rn2(5)', 'rnd(20)',
            // rnd(4) is hmon_hitmon_barehands():845, whose die is 4 rather
            // than 2 because weapon.c martial_bonus() counts a Samurai with
            // empty hands as a martial artist.
            'rn2(19)', 'rnd(4)', 'rn2(25)', 'rn2(3)',
            // The second swing rolls a fist's die too: `secondwep` is null
            // because u.twoweap is false, so the short sword in the swap slot
            // never lands, even though uhitm.c:801 computed the number to beat
            // from it.
            'rnd(20)', 'rnd(4)', 'rn2(25)', 'rn2(3)',
        ]);
        // hmon_hitmon_stagger():1571 draws no rnd(100) here and
        // mhitm_knockback() no rn2(3): hmd.unarmed at uhitm.c:1779 is
        // `!uwep && !uarm && !uarms`, and the Samurai's splint mail keeps it
        // FALSE, while 1830's arm needs a uwep this hero has put down.
        assert.equal(Boolean(game.uarm), true);
    });

// uhitm.c:529's own arm: the pair has stopped being legal, so C hands over to
// wield.c untwoweapon(), which prints, clears u.twoweap and redraws the
// inventory. None of that is ported.
test('do_attack stops when the two-weapon pair is no longer legal', async () => {
    await hero({ role: 'Samurai', gender: 'male', align: 'lawful' });
    game.u.twoweap = true;
    // wield.c:805-807. A shield in the off hand is the refusal that needs no
    // change to either weapon.
    game.uarms = { otyp: 0, oclass: 3 };
    // can_twoweapon()'s refusal is C's own pline, and it lands on top of the
    // line the segment left on screen, so it raises a More prompt first.
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await refusesAsync(
        () => do_attack(target(), game, meleeEnv()),
        'ending two-weapon combat',
    );
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
        // draws rn2(19) before known_hitum() reaches hmon(). The lichen is
        // given more hit points than any spear thrust can take, so the swing
        // lands without killing and the rest of the attempt runs: rnd(6) is
        // dmgval()'s die for the Valkyrie's spear against a small target,
        // rn2(3) and rn2(6) are mhitm_knockback()'s pair, rn2(25) is
        // known_hitum():624's morale check on a survivor and rn2(3) closes
        // with passive().
        const beaten = meleeEnv({ dieroll: tmp - 1 });
        const survivor = target(PM_LICHEN, { mhp: 99, mhpmax: 99 });
        await hitum(survivor, uattk, game, beaten);
        assert.deepEqual(beaten.bounds, [
            'rnd(20)', 'rn2(19)', 'rnd(6)', 'rn2(3)', 'rn2(6)', 'rn2(25)',
            'rn2(3)',
        ]);

        // uhitm.c:781, u.uswallow forces the hit arm however the roll came
        // out; the exercise stays behind the comparison, so it does not run
        // and rn2(19) is absent from the sequence below.
        game.u.uswallow = 1;
        const swallowed = meleeEnv({ dieroll: tmp });
        await hitum(
            target(PM_LICHEN, { mhp: 99, mhpmax: 99 }), uattk, game, swallowed,
        );
        assert.deepEqual(swallowed.bounds, [
            'rnd(20)', 'rnd(6)', 'rn2(3)', 'rn2(6)', 'rn2(25)', 'rn2(3)',
        ]);
        game.u.uswallow = 0;
    });

// uhitm.c:779-781 fixes the order find_roll_to_hit() -> mon_maybe_unparalyze()
// -> rnd(20), and the order is what the target's freedom is worth: C decides
// the to-hit number while the target is still frozen, so the +4 at 393 is
// granted whether or not the blow shakes it loose, and the rn2(10) sits ahead
// of the die roll in the call sequence.
test('hitum frees a paralyzed target between the to-hit number and the roll',
    async () => {
        await hero();
        const uattk = game.youmonst.data.mattk[0];
        const roll = (mtmp) => find_roll_to_hit(
            mtmp, uattk.aatyp, game.uwep,
            { attknum: 0, role_roll_penalty: 0 }, game, REFUSING,
        );
        const mobile = roll(target());
        const frozen = roll(target(PM_LICHEN, { mcanmove: 0, mfrozen: 4 }));
        // uhitm.c:393, the only difference between the two targets.
        assert.equal(frozen, mobile + 4);

        // A roll of 10 leaves the target paralyzed, so the whole swing is a
        // miss against a frozen lichen and the sequence is rn2(10) first.
        const stuck = meleeEnv({ dieroll: frozen });
        const stillFrozen = target(PM_LICHEN, { mcanmove: 0, mfrozen: 4 });
        await hitum(stillFrozen, uattk, game, stuck);
        assert.deepEqual(stuck.bounds, ['rn2(10)', 'rnd(20)', 'rn2(3)']);
        assert.deepEqual([stillFrozen.mcanmove, stillFrozen.mfrozen], [0, 4]);

        // A roll of 0 frees it, and the to-hit number keeps the +4 anyway:
        // rolling exactly the mobile number still beats it, which it would
        // not do had the unparalyze run first.
        const freed = meleeEnv({
            dieroll: mobile,
            rn2Result: (bound) => (bound === 10 ? 0 : 1),
        });
        const shakenLoose = target(PM_LICHEN, {
            mcanmove: 0, mfrozen: 4, mhp: 99, mhpmax: 99,
        });
        await hitum(shakenLoose, uattk, game, freed);
        assert.deepEqual([shakenLoose.mcanmove, shakenLoose.mfrozen], [1, 0]);
        // rn2(10) frees it, rnd(20) is the roll and rn2(19) is the Dexterity
        // exercise a hit earns; rnd(6) is the spear's damage die and the last
        // four are the knockback pair, the morale check and passive().
        assert.deepEqual(freed.bounds, [
            'rn2(10)', 'rnd(20)', 'rn2(19)', 'rnd(6)', 'rn2(3)', 'rn2(6)',
            'rn2(25)', 'rn2(3)',
        ]);
    });

// uhitm.c:608. missum()'s third argument is `rollneeded + armorpenalty >
// dieroll`, which is what separates a Monk who missed because of his suit
// from one who would have missed anyway. The three rows straddle the
// comparison.
test('known_hitum reports the armor penalty only when it decided the miss',
    async () => {
        await hero();
        const mhit = () => ({ value: 0 });
        // uhitm.c:585-592 names the sixth parameter uattk and the seventh
        // dieroll. Feeding the real attack struct rather than a second copy
        // of the number is what lets the "over" row below notice a swapped
        // pair: `rollneeded + armorpenalty > <struct>` is never true.
        const uattk = game.youmonst.data.mattk[0];
        const run = async (rollneeded, armorpenalty, dieroll) => {
            const env = meleeEnv();
            const alive = await known_hitum(
                target(), null, mhit(), rollneeded, armorpenalty, uattk,
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
