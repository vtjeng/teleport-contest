import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_STR,
    CONFLICT,
    FAINTED,
    FROMFORM,
    FROMOUTSIDE,
    HEALTHY_TIN,
    HALLUC,
    HUNGER,
    HUNGRY,
    MOD_ENCUMBER,
    NOT_HUNGRY,
    PROTECTION,
    RANDOM_TIN,
    REGENERATION,
    SATIATED,
    SLOW_DIGESTION,
    SPINACH_TIN,
    UNENCUMBERED,
    WEAK,
    W_ARTI,
    W_RINGL,
    W_RINGR,
    W_TOOL,
    W_WEP,
} from '../js/const.js';
import { gethungry, set_tin_variety } from '../js/eat.js';
import {
    AMULET_OF_LIFE_SAVING,
    FAKE_AMULET_OF_YENDOR,
    MEAT_RING,
    RIN_ADORNMENT,
    RIN_PROTECTION,
    RIN_SEARCHING,
    RIN_SLOW_DIGESTION,
    objects_globals_init,
} from '../js/objects.js';
import {
    M1_CARNIVORE,
    M1_HERBIVORE,
    M1_METALLIVORE,
    NON_PM,
    PM_ELF,
    PM_GHOST,
    PM_HEALER,
    PM_HUMAN,
    PM_KOBOLD,
    PM_LICHEN,
    PM_LIZARD,
    PM_PONY,
    PM_RUST_MONSTER,
    PM_VALKYRIE,
    PM_WRAITH,
    PM_WIZARD,
    monst_globals_init,
} from '../js/monsters.js';

function state() {
    const result = {};
    monst_globals_init(result);
    return result;
}

function hungerState() {
    const result = state();
    objects_globals_init(result);
    result.iflags = { debug_hunger: false };
    result.multi = 0;
    result.u = {
        atemp: [0, 0, 0, 0, 0, 0],
        uhunger: 900,
        uhs: NOT_HUNGRY,
        uhave: { amulet: false },
        uinvulnerable: false,
        uprops: [],
    };
    result.urole = { mnum: PM_HEALER, name: { m: 'Healer' } };
    result.urace = { mnum: PM_HUMAN };
    result.youmonst = { data: result.mons[PM_HUMAN] };
    return result;
}

function property(stateValue, index) {
    return stateValue.u.uprops[index] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };
}

async function hungerTick(
    stateValue,
    accessoryTime,
    capacity = UNENCUMBERED,
) {
    const bounds = [];
    const loss = await gethungry(stateValue, {
        random: {
            rn2: (bound) => {
                bounds.push(bound);
                return accessoryTime;
            },
        },
        nearCapacity: () => capacity,
    });
    assert.deepEqual(bounds, [20]);
    return loss;
}

test('gethungry applies ordinary alert-hero nutrition loss', async () => {
    const current = hungerState();
    assert.ok(current.youmonst.data.mflags1 & M1_CARNIVORE);

    assert.equal(await hungerTick(current, 2), 1);
    assert.equal(current.u.uhunger, 899);
    assert.equal(current.u.uhs, NOT_HUNGRY);
});

test('gethungry derives ordinary nutrition loss from the source diet flags',
    async () => {
    for (const [name, monster, flag, expected] of [
        ['no diet', PM_GHOST, 0, 0],
        ['carnivore', PM_HUMAN, M1_CARNIVORE, 1],
        ['herbivore', PM_PONY, M1_HERBIVORE, 1],
        ['metallivore', PM_RUST_MONSTER, M1_METALLIVORE, 1],
    ]) {
        const current = hungerState();
        current.youmonst.data = current.mons[monster];
        if (flag) assert.ok(current.youmonst.data.mflags1 & flag, name);
        else {
            assert.equal(
                current.youmonst.data.mflags1
                    & (M1_CARNIVORE | M1_HERBIVORE | M1_METALLIVORE),
                0,
                name,
            );
        }
        assert.equal(await hungerTick(current, 2), expected, name);
    }
});

test('gethungry skips invulnerable and debug-hunger turns without drawing',
    async () => {
    for (const setup of [
        (current) => { current.u.uinvulnerable = true; },
        (current) => { current.iflags.debug_hunger = true; },
    ]) {
        const current = hungerState();
        setup(current);
        assert.equal(await gethungry(current, {
            random: { rn2: () => assert.fail('skipped turn drew') },
        }), 0);
        assert.equal(current.u.uhunger, 900);
    }
});

test('gethungry preserves odd-turn regeneration and encumbrance masks',
    async () => {
    const excluded = hungerState();
    property(excluded, REGENERATION).intrinsic = FROMFORM;
    property(excluded, REGENERATION).extrinsic = W_ARTI | W_WEP;
    assert.equal(await hungerTick(excluded, 1), 1);

    const active = hungerState();
    property(active, REGENERATION).intrinsic = FROMFORM | FROMOUTSIDE;
    assert.equal(await hungerTick(active, 1), 2);

    const worn = hungerState();
    property(worn, REGENERATION).intrinsic = FROMFORM;
    property(worn, REGENERATION).extrinsic = W_ARTI | W_RINGL;
    assert.equal(await hungerTick(worn, 1, MOD_ENCUMBER), 3);
    assert.equal(worn.u.uhunger, 897);
});

test('gethungry applies even-turn property and accessory costs', async () => {
    const properties = hungerState();
    property(properties, HUNGER).intrinsic = FROMOUTSIDE;
    property(properties, CONFLICT).extrinsic = W_ARTI | W_RINGL;
    assert.equal(await hungerTick(properties, 2), 3);

    const intrinsicConflict = hungerState();
    property(intrinsicConflict, CONFLICT).intrinsic = FROMOUTSIDE;
    property(intrinsicConflict, CONFLICT).extrinsic = W_ARTI;
    assert.equal(await hungerTick(intrinsicConflict, 2), 2);

    // eat.c:3202-3203 masks W_ARTI out of the extrinsic instead of reading
    // youprop.h:218's Conflict macro, so an artifact is the one conflict
    // source that costs nothing: the loss is the ordinary point alone. The two
    // rows above leave the masked and unmasked reads agreeing -- W_RINGL makes
    // both true, and so does the intrinsic -- so this is the row that
    // separates them.
    const artifactConflict = hungerState();
    property(artifactConflict, CONFLICT).extrinsic = W_ARTI;
    assert.equal(await hungerTick(artifactConflict, 2), 1);

    const slowArmor = hungerState();
    property(slowArmor, SLOW_DIGESTION).extrinsic = W_WEP;
    assert.equal(await hungerTick(slowArmor, 0), 1);
    const slowRing = hungerState();
    property(slowRing, SLOW_DIGESTION).extrinsic = W_RINGR;
    slowRing.uright = { otyp: RIN_SLOW_DIGESTION, spe: 0 };
    assert.equal(await hungerTick(slowRing, 0), 0);

    const amulet = hungerState();
    amulet.uamul = { otyp: AMULET_OF_LIFE_SAVING };
    assert.equal(await hungerTick(amulet, 8), 2);
    const fakeAmulet = hungerState();
    fakeAmulet.uamul = { otyp: FAKE_AMULET_OF_YENDOR };
    assert.equal(await hungerTick(fakeAmulet, 8), 1);

    const possessed = hungerState();
    possessed.u.uhave.amulet = true;
    assert.equal(await hungerTick(possessed, 16), 2);
});

test('gethungry follows ring charge and duplicate-protection rules',
    async () => {
    const chargedZero = hungerState();
    chargedZero.uleft = { otyp: RIN_ADORNMENT, spe: 0 };
    assert.equal(await hungerTick(chargedZero, 4), 1);

    const charged = hungerState();
    charged.uleft = { otyp: RIN_ADORNMENT, spe: 1 };
    assert.equal(await hungerTick(charged, 4), 2);

    const uncharged = hungerState();
    uncharged.uleft = { otyp: RIN_SEARCHING, spe: 0 };
    assert.equal(await hungerTick(uncharged, 4), 2);

    const meat = hungerState();
    meat.uleft = { otyp: MEAT_RING, spe: 1 };
    assert.equal(await hungerTick(meat, 4), 1);

    const duplicateProtection = hungerState();
    duplicateProtection.uleft = { otyp: RIN_PROTECTION, spe: 0 };
    duplicateProtection.uright = { otyp: RIN_PROTECTION, spe: 0 };
    property(duplicateProtection, PROTECTION).extrinsic = W_RINGL | W_RINGR;
    assert.equal(await hungerTick(duplicateProtection, 4), 2);
    assert.equal(await hungerTick(duplicateProtection, 12), 1);

    for (const [name, ring, expected, configure] of [
        ['charged zero', { otyp: RIN_ADORNMENT, spe: 0 }, 1],
        ['charged nonzero', { otyp: RIN_ADORNMENT, spe: 1 }, 2],
        ['uncharged type', { otyp: RIN_SEARCHING, spe: 0 }, 2],
        ['meat ring', { otyp: MEAT_RING, spe: 1 }, 1],
        ['single protection', { otyp: RIN_PROTECTION, spe: 0 }, 2,
            (current) => {
                property(current, PROTECTION).extrinsic = W_RINGR;
            }],
    ]) {
        const current = hungerState();
        current.uright = ring;
        configure?.(current);
        assert.equal(await hungerTick(current, 12), expected, name);
    }
});

// eat.c gethungry():3174 spends ordinary nutrition when `!Unaware ||
// !rn2(10)`: an insensible hero burns food at a tenth of the waking rate. What
// picks that arm has to be youprop.h Unaware exactly -- a negative gm.multi
// alone is not it, and reading it as such would slow pray.c dopray()'s three
// turns, which C runs at the ordinary rate.
test('gethungry burns nutrition slowly for an Unaware hero and not for a merely immobile one',
    async () => {
    // Each row is a hero counting a negative gm.multi down, differing only in
    // what trap.c unconscious() reads. eat.c is_fainted(), Unaware's other
    // half, cannot be exercised here: a hero already at FAINTED stops at the
    // status guard below before any draw, which the last block pins.
    const unawareHeroes = [
        ['asleep', (s) => { s.u.usleep = 1; }],
        // The three prefixes trap.c:6783-6785 tests, spelled as C spells them.
        ['waking', (s) => { s.nomovemsg = 'You awake from your slumber.'; }],
        ['reviving', (s) => { s.nomovemsg = 'You regain consciousness.'; }],
        ['coming round', (s) => { s.nomovemsg = 'You are conscious again.'; }],
    ];
    for (const [name, configure] of unawareHeroes) {
        const unaware = hungerState();
        unaware.multi = -1;
        configure(unaware);
        const draws = [];
        // rn2(10) = 2, one of the nine values that skip the decrement. The
        // rn2(20) = 2 that follows is even and lands on no accessory case, so
        // this turn costs the hero nothing at all.
        assert.equal(await gethungry(unaware, {
            random: { rn2: (bound) => { draws.push(bound); return 2; } },
            nearCapacity: () => UNENCUMBERED,
        }), 0, name);
        // The slow-rate draw comes first: C evaluates `!Unaware || !rn2(10)`
        // before the accessorytime assignment two statements below.
        assert.deepEqual(draws, [10, 20], name);
        assert.equal(unaware.u.uhunger, 900, name);
    }

    // The tenth turn, where rn2(10) comes up 0 and the sleeping hero pays the
    // ordinary point after all. rn2(20) = 0 is even and reaches the
    // Slow_digestion accessory case, which this hero does not have.
    for (const [name, configure] of unawareHeroes) {
        const unaware = hungerState();
        unaware.multi = -1;
        configure(unaware);
        const draws = [];
        assert.equal(await gethungry(unaware, {
            random: { rn2: (bound) => { draws.push(bound); return 0; } },
            nearCapacity: () => UNENCUMBERED,
        }), 1, name);
        assert.deepEqual(draws, [10, 20], name);
        assert.equal(unaware.u.uhunger, 899, name);
    }

    // C's `&&` chain puts the draw ahead of the three diet flags and
    // Slow_digestion, so a sleeping hero who could not have eaten anyway still
    // spends it. PM_GHOST carries none of the three flags.
    const dietless = hungerState();
    dietless.multi = -1;
    dietless.u.usleep = 1;
    dietless.youmonst.data = dietless.mons[PM_GHOST];
    const dietlessDraws = [];
    assert.equal(await gethungry(dietless, {
        random: { rn2: (bound) => { dietlessDraws.push(bound); return 0; } },
        nearCapacity: () => UNENCUMBERED,
    }), 0);
    assert.deepEqual(dietlessDraws, [10, 20]);
    assert.equal(dietless.u.uhunger, 900);

    // The prayer's own state: immobile for three turns with a message waiting
    // that says nothing about waking up. C answers Unaware FALSE here, so the
    // turn costs the ordinary point and draws only the rn2(20) accessory roll.
    const praying = hungerState();
    praying.multi = -3;
    praying.nomovemsg = 'You finish your prayer.';
    const prayingDraws = [];
    // rn2(20) = 2 is even and lands on no accessory case, so the only cost is
    // the ordinary decrement the refusal used to suppress.
    assert.equal(await gethungry(praying, {
        random: { rn2: (bound) => { prayingDraws.push(bound); return 2; } },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.deepEqual(prayingDraws, [20]);
    assert.equal(praying.u.uhunger, 899);

    // A hero with no message scheduled at all: C's `gn.nomovemsg &&` guard
    // makes trap.c unconscious() answer FALSE, so this is not Unaware either.
    const silent = hungerState();
    silent.multi = -1;
    assert.equal(await gethungry(silent, {
        random: { rn2: () => 2 },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.equal(silent.u.uhunger, 899);

    // Unaware needs a negative gm.multi as well as a reason, which is what
    // separates `multi < 0` from `multi <= 0`: a hero free to act this turn is
    // awake even while a waking message is still queued behind them, so the
    // slow-rate draw is not spent.
    const freed = hungerState();
    freed.multi = 0;
    freed.nomovemsg = 'You awake from your slumber.';
    const freedDraws = [];
    assert.equal(await gethungry(freed, {
        random: { rn2: (bound) => { freedDraws.push(bound); return 2; } },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.deepEqual(freedDraws, [20]);
    assert.equal(freed.u.uhunger, 899);

    // eat.c is_fainted() is Unaware's other half, and no hero can reach the
    // slow rate through it: newuhs()'s FAINTING arm is unported, so a hero
    // already at FAINTED stops at the status guard before any draw whether or
    // not gm.multi is negative.
    for (const multi of [0, -1]) {
        const fainted = hungerState();
        fainted.multi = multi;
        fainted.u.uhs = FAINTED;
        const faintedDraws = [];
        await assert.rejects(
            gethungry(fainted, {
                random: {
                    rn2: (bound) => { faintedDraws.push(bound); return 2; },
                },
                nearCapacity: () => UNENCUMBERED,
            }),
            /unported hunger-status transition/u,
            `multi ${multi}`,
        );
        assert.deepEqual(faintedDraws, [], `multi ${multi}`);
    }
});

test('gethungry fails closed at unported ring and status boundaries',
    async () => {
    const missingRing = hungerState();
    missingRing.uleft = { otyp: RIN_ADORNMENT, spe: 1 };
    missingRing.objects[RIN_ADORNMENT] = undefined;
    const missingRingDraws = [];
    await assert.rejects(
        gethungry(missingRing, {
            random: {
                rn2: (bound) => { missingRingDraws.push(bound); return 4; },
            },
            nearCapacity: () => UNENCUMBERED,
        }),
        /requires object data for ring/u,
    );
    assert.deepEqual(missingRingDraws, []);
    assert.equal(missingRing.u.uhunger, 900);
});

test('gethungry owns the first increasing hunger transition in source order',
    async () => {
        const threshold = hungerState();
        threshold.u.uhunger = 151;
        const events = [];

        assert.equal(await gethungry(threshold, {
            random: {
                rn2(bound) {
                    events.push(`rn2(${bound})`);
                    return 2;
                },
            },
            nearCapacity: () => UNENCUMBERED,
            async message(text) {
                events.push(`message:${text}`);
            },
            endRunning() {
                events.push('end_running');
            },
            async statusRefresh() {
                events.push('bot');
            },
        }), 1);
        assert.equal(threshold.u.uhunger, 150);
        assert.equal(threshold.u.uhs, HUNGRY);
        assert.equal(threshold.disp.botl, true);
        assert.deepEqual(events, [
            'rn2(20)',
            'message:You are beginning to feel hungry.',
            'end_running',
            'bot',
        ]);

        // newuhs()'s HUNGRY arm prints and ends a run as well as writing the
        // status line, so the preflight rejects a caller missing any of the
        // three, and does so before the rn2(20) draw.
        for (const missing of ['message', 'endRunning', 'statusRefresh']) {
            const incomplete = hungerState();
            incomplete.u.uhunger = 151;
            const env = {
                random: {
                    rn2: () => assert.fail('the preflight draws nothing'),
                },
                nearCapacity: () => UNENCUMBERED,
                message: () => {},
                endRunning: () => {},
                statusRefresh: () => {},
            };
            delete env[missing];
            await assert.rejects(
                gethungry(incomplete, env),
                new RegExp(`requires ${missing}`, 'u'),
            );
            assert.equal(incomplete.u.uhunger, 151);
        }
    });

test('gethungry drops out of SATIATED with no message and no run to end',
    async () => {
        const satiated = hungerState();
        // newuhs() reads SATIATED above 1000 nutrition, so 1001 is the lowest
        // value one point of ordinary loss takes out of it. doeat() is what
        // puts a hero here: three of the Knight's apples pass 1000.
        satiated.u.uhunger = 1001;
        satiated.u.uhs = SATIATED;
        const events = [];

        assert.equal(await gethungry(satiated, {
            random: {
                rn2(bound) {
                    events.push(`rn2(${bound})`);
                    return 2;
                },
            },
            nearCapacity: () => UNENCUMBERED,
            async message(text) {
                events.push(`message:${text}`);
            },
            endRunning() {
                events.push('end_running');
            },
            async statusRefresh() {
                events.push('bot');
            },
        }), 1);
        assert.equal(satiated.u.uhunger, 1000);
        assert.equal(satiated.u.uhs, NOT_HUNGRY);
        assert.equal(satiated.disp.botl, true);
        // newuhs()'s switch has a case for HUNGRY and one for WEAK and no
        // other, so bot() is this transition's whole output: no pline() and no
        // end_running().
        assert.deepEqual(events, ['rn2(20)', 'bot']);
        // SATIATED and NOT_HUNGRY are both below WEAK, so neither of
        // newuhs()'s two ATEMP arms fires.
        assert.equal(satiated.u.atemp[A_STR], 0);

        // bot() is the whole output, so a caller that cannot supply it is
        // rejected before the rn2(20) draw rather than part way through.
        const noStatusRefresh = hungerState();
        noStatusRefresh.u.uhunger = 1001;
        noStatusRefresh.u.uhs = SATIATED;
        await assert.rejects(
            gethungry(noStatusRefresh, {
                random: {
                    rn2: () => assert.fail('the preflight draws nothing'),
                },
                nearCapacity: () => UNENCUMBERED,
            }),
            /requires statusRefresh/u,
        );
        assert.equal(noStatusRefresh.u.uhunger, 1001);
    });

test('gethungry awaits transition output before later state and status work',
    async () => {
        const threshold = hungerState();
        threshold.u.uhunger = 151;
        const events = [];
        let releaseMessage;
        let releaseStatus;
        const messageGate = new Promise((resolve) => {
            releaseMessage = resolve;
        });
        const statusGate = new Promise((resolve) => {
            releaseStatus = resolve;
        });

        const transition = gethungry(threshold, {
            random: { rn2: () => 2 },
            nearCapacity: () => UNENCUMBERED,
            message() {
                events.push('message');
                return messageGate;
            },
            endRunning() {
                events.push('end_running');
            },
            statusRefresh() {
                events.push('bot');
                return statusGate;
            },
        });
        await Promise.resolve();
        assert.deepEqual(events, ['message']);
        assert.equal(threshold.u.uhs, NOT_HUNGRY);

        releaseMessage();
        await Promise.resolve();
        await Promise.resolve();
        assert.deepEqual(events, ['message', 'end_running', 'bot']);
        assert.equal(threshold.u.uhs, HUNGRY);

        releaseStatus();
        assert.equal(await transition, 1);
    });

test('gethungry owns HUNGRY to WEAK state and output in source order',
    async () => {
        const threshold = hungerState();
        threshold.u.uhunger = 51;
        threshold.u.uhs = HUNGRY;
        const events = [];

        assert.equal(await gethungry(threshold, {
            random: { rn2: () => 2 },
            nearCapacity: () => UNENCUMBERED,
            message(text) {
                events.push(`message:${text}:str${threshold.u.atemp[A_STR]}`);
            },
            endRunning() {
                events.push('end_running');
            },
            statusRefresh() {
                events.push(`bot:${threshold.u.uhs}`);
            },
        }), 1);

        assert.equal(threshold.u.uhunger, 50);
        assert.equal(threshold.u.uhs, WEAK);
        assert.equal(threshold.u.atemp[A_STR], -1);
        assert.equal(threshold.disp.botl, true);
        assert.deepEqual(events, [
            'message:You are beginning to feel weak.:str-1',
            'end_running',
            `bot:${WEAK}`,
        ]);
    });

test('weakness messages preserve hallucination, role, and race branches',
    async () => {
        for (const [name, configure, expected] of [
            [
                'hallucinating',
                (stateValue) => {
                    property(stateValue, HALLUC).intrinsic = FROMOUTSIDE;
                },
                'The munchies are interfering with your motor capabilities.',
            ],
            [
                // youprop.h:116 spells Hallucination's positive term
                // u.uprops[HALLUC].intrinsic, and there is no EHallucination,
                // so an extrinsic-only value is not hallucination and the
                // plain wording stands. W_TOOL stands for a worn source;
                // nothing in C writes this slot, so no recorded case can tell
                // the two reads apart.
                'hallucination as an extrinsic only',
                (stateValue) => {
                    property(stateValue, HALLUC).extrinsic = W_TOOL;
                },
                'You are beginning to feel weak.',
            ],
            [
                'Wizard',
                (stateValue) => {
                    stateValue.urole = {
                        mnum: PM_WIZARD,
                        name: { m: 'Wizard' },
                    };
                },
                'Wizard needs food, badly!',
            ],
            [
                'Valkyrie',
                (stateValue) => {
                    stateValue.urole = {
                        mnum: PM_VALKYRIE,
                        name: { m: 'Valkyrie' },
                    };
                },
                'Valkyrie needs food, badly!',
            ],
            [
                'Elf',
                (stateValue) => {
                    stateValue.urace = { mnum: PM_ELF };
                },
                'Elf needs food, badly!',
            ],
        ]) {
            const threshold = hungerState();
            threshold.u.uhunger = 51;
            threshold.u.uhs = HUNGRY;
            configure(threshold);
            const messages = [];

            await gethungry(threshold, {
                random: { rn2: () => 2 },
                nearCapacity: () => UNENCUMBERED,
                message: (text) => messages.push(text),
                endRunning: () => {},
                statusRefresh: () => {},
            });

            assert.deepEqual(messages, [expected], name);
        }
    });

test('gethungry preflights only unsupported reachable transitions',
    async () => {
    const lowLoss = hungerState();
    lowLoss.u.uhunger = 152;
    const lowLossDraws = [];

    assert.equal(await gethungry(lowLoss, {
        random: {
            rn2(bound) {
                lowLossDraws.push(bound);
                return 2;
            },
        },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.deepEqual(lowLossDraws, [20]);
    assert.equal(lowLoss.u.uhunger, 151);
    assert.equal(lowLoss.u.uhs, NOT_HUNGRY);

    const fainting = hungerState();
    fainting.u.uhunger = 2;
    fainting.u.uhs = WEAK;
    property(fainting, REGENERATION).intrinsic = FROMOUTSIDE;
    await assert.rejects(
        gethungry(fainting, {
            random: {
                rn2: () => assert.fail('fainting transition preflights'),
            },
            nearCapacity: () => MOD_ENCUMBER,
        }),
        /unported hunger-status transition/u,
    );
    assert.equal(fainting.u.uhunger, 2);
    assert.equal(fainting.u.uhs, WEAK);
});

test('spinach tins clear species and do not draw', () => {
    const obj = { corpsenm: PM_KOBOLD, spe: 0 };
    set_tin_variety(obj, SPINACH_TIN, {
        state: state(),
        random: { rn2: () => assert.fail('spinach does not draw') },
    });
    assert.deepEqual(obj, { corpsenm: NON_PM, spe: 1 });
});

test('random rotten tins become homemade for nonrotting corpses', () => {
    for (const corpsenm of [PM_LIZARD, PM_LICHEN]) {
        const obj = { corpsenm, spe: 0 };
        set_tin_variety(obj, RANDOM_TIN, {
            state: state(),
            random: { rn2: (bound) => {
                assert.equal(bound, 15);
                return 0;
            } },
        });
        assert.equal(obj.spe, -2);
    }
});

test('random ordinary meat preserves rotten variety', () => {
    const obj = { corpsenm: PM_KOBOLD, spe: 0 };
    set_tin_variety(obj, RANDOM_TIN, {
        state: state(),
        random: { rn2: () => 0 },
    });
    assert.equal(obj.spe, -1);
});

test('healthy tins replace meat and empty tins with spinach', () => {
    for (const corpsenm of [PM_KOBOLD, NON_PM]) {
        const obj = { corpsenm, spe: 0 };
        set_tin_variety(obj, HEALTHY_TIN, {
            state: state(),
            random: { rn2: () => assert.fail('replacement does not draw') },
        });
        assert.deepEqual(obj, { corpsenm: NON_PM, spe: 1 });
    }
});

test('healthy tins distinguish ghost-class corpses from unsolid wraiths', () => {
    const wraith = { corpsenm: PM_WRAITH, spe: 0 };
    set_tin_variety(wraith, HEALTHY_TIN, {
        state: state(),
        random: { rn2: () => assert.fail('wraith replacement does not draw') },
    });
    assert.deepEqual(wraith, { corpsenm: NON_PM, spe: 1 });

    const ghost = { corpsenm: PM_GHOST, spe: 0 };
    set_tin_variety(ghost, HEALTHY_TIN, {
        state: state(),
        random: { rn2: (bound) => {
            // Pickled is a health-food variety, so no retry is needed.
            assert.equal(bound, 15);
            return 4;
        } },
    });
    assert.deepEqual(ghost, { corpsenm: PM_GHOST, spe: -5 });
});
