// Direct tests for uhitm.c hmon() and hmon_hitmon(). The end-to-end evidence
// for them is scripts/hostile-melee-hit.test.mjs and the fresh matrix behind
// it; what is here are the branches a first-level game does not reach and the
// arithmetic those recordings only see one value of.
//
// Three of those branches cannot be recorded at all inside this boundary, and
// they are why this file exists rather than more matrix rows:
//
//   zap.c exclam()'s "!" needs a blow above four points that the target
//   survives. A port-side scan of 6000 Valkyrie seeds, 6000 Barbarian seeds,
//   5000 Caveman seeds and 4000 Monk seeds found no such case: every role that
//   can do five points kills what generates beside it on the first level.
//
//   hmon_hitmon_barehands()'s rnd(4) needs martial_bonus(), which means a
//   Samurai or a Monk, and both kill a first-level hostile outright.
//
//   hmon_hitmon_barehands()'s silver-ring and blessed-glove bonuses need
//   equipment no role starts with.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HMON_APPLIED,
    HMON_KICKED,
    HMON_MELEE,
    HMON_THROWN,
    D_CLOSED,
    D_NODOOR,
    DOOR,
    P_BASIC,
    P_KNIFE,
    P_SKILLED,
    ROWNO,
    W_RINGL,
    W_RINGR,
} from '../js/const.js';
import { ART_EXCALIBUR } from '../js/artifacts.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import {
    PM_BABY_GRAY_DRAGON,
    PM_BLACK_PUDDING,
    PM_BROWN_PUDDING,
    PM_ENERGY_VORTEX,
    PM_FLOATING_EYE,
    PM_GHOST,
    PM_GOBLIN,
    PM_GRAY_OOZE,
    PM_GRID_BUG,
    PM_HUMAN_WEREWOLF,
    PM_JACKAL,
    PM_LICHEN,
    PM_NEWT,
    PM_QUIVERING_BLOB,
    PM_ROTHE,
    PM_SEWER_RAT,
    PM_SHADE,
    PM_VAMPIRE,
    PM_WATCH_CAPTAIN,
    PM_WATCHMAN,
    PM_XORN,
} from '../js/monsters.js';
import {
    ARROW,
    BOW,
    BULLWHIP,
    DART,
    KATANA,
    LANCE,
    LEATHER_GLOVES,
    LONG_SWORD,
    OIL_LAMP,
    PICK_AXE,
    RIN_ADORNMENT,
    RIN_PROTECTION,
    SCALPEL,
    SHORT_SWORD,
    SILVER,
    SILVER_SABER,
    SMALL_SHIELD,
    WORTHLESS_WHITE_GLASS,
} from '../js/objects.js';
import { mksobj } from '../js/obj.js';
import { monsndx } from '../js/mondata.js';
import { P_ADVANCE, skillSlot } from '../js/startup_skills.js';
import { uwep_skill_type } from '../js/weapon.js';
import { hmon, known_hitum } from '../js/uhitm.js';

const DATETIME = '20260214031500';
// u_init.c ini_inv() wields a TIN_OPENER, and a Tourist's undefined tool slot
// rolls one on some seeds -- 4400255 among them -- which would put an object in
// a hand these tests need empty. 6600223 is the bare-handed matrix row's seed.
const TOURIST_SEED = 6600223;

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
// target and read the hero the recipe built. 4400255 is the base row of the
// hit matrix, so the Healer it builds is the one that matrix recorded.
async function hero({
    role = 'Healer',
    gender = 'female',
    align = 'neutral',
    race = 'human',
    options = 'pettype:none,!acoustics',
    seed = 4400255,
} = {}) {
    await runSegment({
        seed,
        datetime: DATETIME,
        nethackrc: rc({ role, gender, align, race, options }),
        moves: '',
    });
    return game;
}

// assert.throws() matches a regular expression against `String(error)`, which
// carries the class name too; every refusal here is compared by its exact
// reason instead.
function refusesAsync(fn, reason, label) {
    return assert.rejects(fn, (error) => {
        assert.equal(error.message, reason, label);
        return true;
    }, label);
}

// A target with more hit points than any blow below can take, so the whole of
// hmon_hitmon() runs rather than stopping at killed(). mhpmax matches mhp so
// that uhitm.c:1852's cap changes nothing.
function target(pmidx = PM_LICHEN, overrides = {}) {
    return newMonster({
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 99,
        mhpmax: 99,
        mcanmove: 1,
        data: game.mons[pmidx],
        ...overrides,
    });
}

// `rolls` supplies each random-number call in order, so a test can put the
// damage die and the knockback pair exactly where it wants them; anything past
// the end of the list falls back to `fallback`.
function hitEnv({ rolls = [], fallback = 1, ...overrides } = {}) {
    const lines = [];
    const bounds = [];
    const queue = [...rolls];
    const next = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : fallback;
    };
    const env = {
        message: async (text) => { lines.push(text); },
        unsupported: (reason) => { throw new Error(reason); },
        random: {
            d: (n, x) => next(`d(${n},${x})`),
            rn2: (bound) => next(`rn2(${bound})`),
            rnd: (bound) => next(`rnd(${bound})`),
        },
        ...overrides,
    };
    env.lines = lines;
    env.bounds = bounds;
    return env;
}

// uhitm.c:819-822. hmon()'s `thrown` parameter selects between melee, thrown,
// kicked and applied. dothrow.c, dokick.c and apply.c own the other three and
// none is ported, so the guard rejects them before hmon_hitmon() allocates
// anything.
test('hmon admits melee alone', async () => {
    await hero();
    for (const thrown of [HMON_THROWN, HMON_KICKED, HMON_APPLIED]) {
        const env = hitEnv();
        await refusesAsync(
            () => hmon(target(), game.uwep, thrown, 10, game, env),
            'ranged or applied hit',
            `thrown ${thrown}`,
        );
        // The refusal is above the damage roll, so nothing was drawn or said.
        assert.deepEqual(env.bounds, [], `thrown ${thrown}`);
        assert.deepEqual(env.lines, [], `thrown ${thrown}`);
    }
});

// uhitm.c:826-833. A temple priest's god strikes back through ghod_hitsu(),
// behind an rn2(2) that only a priest target draws, and a peaceful shopkeeper
// or watchman calls angry_guards(). Both refuse above hmon_hitmon(), which is
// what keeps the rn2(2) unspent.
test('hmon stops on the two town consequences before it rolls damage',
    async () => {
        await hero();
        // Each row carries the species and the flags that reach one refusal.
        // uhitm.c:827's two guard disjuncts are asked differently: isshk is a
        // flag any species can carry, while mondata.h is_watch() reads the
        // species itself, so the watch rows set no flag but mpeaceful.
        const cases = [
            ['striking a temple priest', PM_LICHEN, { ispriest: 1 }],
            ['striking a temple priest', PM_LICHEN,
                { ispriest: 1, mpeaceful: 1 }],
            ['angering the town guards', PM_LICHEN,
                { isshk: 1, mpeaceful: 1 }],
            ['angering the town guards', PM_WATCHMAN, { mpeaceful: 1 }],
            ['angering the town guards', PM_WATCH_CAPTAIN, { mpeaceful: 1 }],
        ];
        for (const [reason, pmidx, overrides] of cases) {
            const label = `${reason} ${pmidx}`;
            const env = hitEnv();
            await refusesAsync(
                () => hmon(target(pmidx, overrides), game.uwep,
                           HMON_MELEE, 10, game, env),
                reason,
                label,
            );
            assert.deepEqual(env.bounds, [], label);
        }
        // A hostile shopkeeper is not protected: anger_guards at uhitm.c:826
        // requires mpeaceful, so this one runs the whole function.
        const env = hitEnv({ rolls: [2] });
        const shk = target(PM_LICHEN, { isshk: 1 });
        assert.equal(await hmon(shk, game.uwep, HMON_MELEE, 10, game, env),
                     true);
        assert.deepEqual(env.lines, ['You hit the lichen.']);
        // A hostile watchman is not protected either, so mpeaceful decides
        // the is_watch() disjunct as well as the isshk one. rnd(3)=2 with a
        // Healer's dbon() of 0 and a Basic knife skill is two points.
        for (const pmidx of [PM_WATCHMAN, PM_WATCH_CAPTAIN]) {
            const patrol = target(pmidx);
            assert.equal(
                await hmon(patrol, game.uwep, HMON_MELEE, 10, game,
                           hitEnv({ rolls: [2] })),
                true,
                String(pmidx),
            );
            assert.equal(patrol.mhp, 97, String(pmidx));
        }
    });

// uhitm.c:1636-1660 hmon_hitmon_msg_hit(). Its verb comes from the object and
// the role; its punctuation from zap.c exclam(), which the recorded matrix can
// only ever show as ".".
test('hmon_hitmon_msg_hit picks its verb and its punctuation', async () => {
    // The Healer's scalpel: no special skill, so "hit". rnd(3)=1 leaves one
    // point of damage, which exclam() punctuates with ".".
    await hero();
    const quiet = hitEnv({ rolls: [1] });
    await hmon(target(), game.uwep, HMON_MELEE, 10, game, quiet);
    assert.deepEqual(quiet.lines, ['You hit the lichen.']);

    // Five points is the first value zap.c exclam():3552 punctuates with "!".
    // rnd(3)=5 is impossible for a scalpel in a real game; the injected roll
    // is what lets this arm be seen at all.
    const loud = hitEnv({ rolls: [5] });
    await hmon(target(), game.uwep, HMON_MELEE, 10, game, loud);
    assert.deepEqual(loud.lines, ['You hit the lichen!']);
    // Four points is the last value it punctuates with ".".
    const four = hitEnv({ rolls: [4] });
    await hmon(target(), game.uwep, HMON_MELEE, 10, game, four);
    assert.deepEqual(four.lines, ['You hit the lichen.']);

    // A bullwhip is oc_skill P_WHIP, the "lash" arm at uhitm.c:1652-1653.
    const whip = mksobj(BULLWHIP, true, false, { state: game });
    const lash = hitEnv({ rolls: [1] });
    await hmon(target(), whip, HMON_MELEE, 10, game, lash);
    assert.deepEqual(lash.lines, ['You lash the lichen.']);

    // uhitm.c:1655, Role_if(PM_BARBARIAN). The Barbarian's own weapon is a
    // two-handed sword; the scalpel is reused so the verb is the only change.
    await hero({ role: 'Barbarian', gender: 'male', align: 'chaotic' });
    const scalpel = mksobj(SCALPEL, true, false, { state: game });
    const smite = hitEnv({ rolls: [1] });
    const smitten = target();
    await hmon(smitten, scalpel, HMON_MELEE, 10, game, smite);
    assert.deepEqual(smite.lines, ['You smite the lichen.']);
    // Two points, not one: uhitm.c:1467-1468 multiplies the strength bonus by
    // 3/2 for a melee hit made while holding a two-handed weapon. The test
    // below separates that term. The assertion here stops this row from
    // passing at any total, since zap.c exclam() punctuates 1 and 2 alike.
    assert.equal(smitten.mhp, 97);

    // uhitm.c:1648, flags.verbose off.
    await hero({ options: 'pettype:none,!acoustics,!verbose' });
    const terse = hitEnv({ rolls: [1] });
    await hmon(target(), game.uwep, HMON_MELEE, 10, game, terse);
    assert.deepEqual(terse.lines, ['You hit it.']);
});

// uhitm.c:1641-1645. The guard is what the whole struct _hitmon_data exists
// for: a blow that killed says nothing here, because killed() speaks instead.
test('hmon_hitmon_msg_hit says nothing about a fatal blow', async () => {
    await hero();
    // Two points against a two-point target. The message is suppressed and
    // uhitm.c:1911 stops on killed() instead.
    const env = hitEnv({ rolls: [2] });
    await refusesAsync(
        () => hmon(target(PM_LICHEN, { mhp: 2, mhpmax: 2 }), game.uwep,
                   HMON_MELEE, 10, game, env),
        'killing a monster in melee',
    );
    assert.deepEqual(env.lines, []);

    // One more hit point and the same blow speaks.
    const survives = hitEnv({ rolls: [2] });
    await hmon(target(PM_LICHEN, { mhp: 3, mhpmax: 3 }), game.uwep,
               HMON_MELEE, 10, game, survives);
    assert.deepEqual(survives.lines, ['You hit the lichen.']);
});

// uhitm.c:1826-1831. The three arms are exclusive and both live ones need
// `hmd.dmg > 1`: a hero with empty hands staggers the target, a hero holding a
// weapon may knock it back, and one point of damage does neither.
test('the stagger and knockback arms divide by hand and by damage',
    async () => {
        // A Tourist wields nothing and wears no body armor or shield, so
        // uhitm.c:1786's hmd.unarmed holds. rnd(2)=2 is above the bar, so
        // hmon_hitmon_stagger() draws rnd(100).
        await hero({ role: 'Tourist', gender: 'male', seed: TOURIST_SEED });
        const staggered = hitEnv({ rolls: [2, 99] });
        await hmon(target(), null, HMON_MELEE, 10, game, staggered);
        assert.deepEqual(staggered.bounds, ['rnd(2)', 'rnd(100)']);

        // rnd(2)=1 is not, so no rnd(100) is drawn at all.
        const minimal = hitEnv({ rolls: [1] });
        await hmon(target(), null, HMON_MELEE, 10, game, minimal);
        assert.deepEqual(minimal.bounds, ['rnd(2)']);

        // uhitm.c:1571's `rnd(100) < P_SKILL(P_BARE_HANDED_COMBAT)`. A
        // Tourist is Unskilled, which is 1, so only a roll of 0 could clear
        // it -- and rnd() never returns 0. The injected 0 is the only way to
        // see the arm the draw guards.
        const struck = hitEnv({ rolls: [2, 0] });
        await refusesAsync(
            () => hmon(target(), null, HMON_MELEE, 10, game, struck),
            'a staggering punch',
        );

        // A wielded weapon takes the other arm: uhitm.c:1830 sets
        // maybe_knockback and mhitm_knockback() spends rn2(3) then rn2(6).
        await hero();
        const knocked = hitEnv({ rolls: [2, 1, 1] });
        await hmon(target(), game.uwep, HMON_MELEE, 10, game, knocked);
        assert.deepEqual(knocked.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)']);

        // One point of damage, so neither arm runs and neither pair is drawn.
        const light = hitEnv({ rolls: [1] });
        await hmon(target(), game.uwep, HMON_MELEE, 10, game, light);
        assert.deepEqual(light.bounds, ['rnd(3)']);
    });

// uhitm.c:1923-1932. maybe_knockback is computed at 1829-1831 but read here,
// inside a block C skips whenever the target died. Evaluating mhitm_knockback()
// eagerly would spend two calls on every kill.
test('a fatal blow never reaches mhitm_knockback', async () => {
    await hero();
    const env = hitEnv({ rolls: [3] });
    await refusesAsync(
        () => hmon(target(PM_LICHEN, { mhp: 3, mhpmax: 3 }), game.uwep,
                   HMON_MELEE, 10, game, env),
        'killing a monster in melee',
    );
    // The damage die alone: the rn2(3) and rn2(6) a survivor would have cost
    // are absent.
    assert.deepEqual(env.bounds, ['rnd(3)']);
});

// uhitm.c mhitm_knockback() (5245-5372). Its guard chain runs after the two
// draws; the size test at 5324-5326 is the last one this port answers, and
// everything past it stops.
test('mhitm_knockback rejects a target its attacker is not much larger than',
    async () => {
        await hero();
        // rn2(6)=1, so C returns FALSE at 5269 and the size test is never
        // reached even for the smallest target.
        const rejected = hitEnv({ rolls: [3, 1, 1] });
        await hmon(target(PM_GRID_BUG), game.uwep, HMON_MELEE, 10, game,
                   rejected);
        assert.deepEqual(rejected.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)']);

        // rn2(6)=0 lets the chain continue. A lichen is MZ_SMALL and the hero
        // MZ_HUMAN, so `2 > 1 + 1` fails and C returns FALSE at 5326.
        const small = hitEnv({ rolls: [3, 1, 0] });
        await hmon(target(PM_LICHEN), game.uwep, HMON_MELEE, 10, game, small);
        assert.deepEqual(small.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)']);
        // A goblin is MZ_SMALL too, so the same answer for a different
        // species.
        const goblin = hitEnv({ rolls: [3, 1, 0] });
        await hmon(target(PM_GOBLIN), game.uwep, HMON_MELEE, 10, game, goblin);
        assert.deepEqual(goblin.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)']);

        // A grid bug is MZ_TINY, so `2 > 0 + 1` holds and the knockback the
        // port does not own begins.
        const tiny = hitEnv({ rolls: [3, 1, 0] });
        await refusesAsync(
            () => hmon(target(PM_GRID_BUG), game.uwep, HMON_MELEE, 10, game,
                       tiny),
            'knocking a much smaller monster back',
        );
        // A newt and a sewer rat are MZ_TINY as well.
        for (const pmidx of [PM_NEWT, PM_SEWER_RAT]) {
            const tinier = hitEnv({ rolls: [3, 1, 0] });
            await refusesAsync(
                () => hmon(target(pmidx), game.uwep, HMON_MELEE, 10, game,
                           tinier),
                'knocking a much smaller monster back',
            );
        }
    });

// uhitm.c:5297-5301, the isok() half of the doorway rule. A target standing
// against the map's edge would be pushed off it, and C answers FALSE rather
// than testing anything further.
test('mhitm_knockback refuses to push a target off the map', async () => {
    await hero();
    // COLNO is 80, so column 79 is the last legal one and the step east from
    // it is not isok(). The hero stands one square west of the target, which
    // makes dx 1 and dy 0.
    const edge = target(PM_GRID_BUG, { mx: 79, my: game.u.uy });
    game.u.ux = 78;
    const env = hitEnv({ rolls: [3, 1, 0] });
    await hmon(edge, game.uwep, HMON_MELEE, 10, game, env);
    assert.deepEqual(env.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)']);

    // The remaining three edges follow. isok() is x >= 1 && x <= COLNO - 1
    // && y >= 0 && y <= ROWNO - 1, and the row above steps past the second of
    // those four bounds alone, which leaves dy computed and unread. Each row
    // below steps past one of the other three, so a dy stuck at zero or an
    // sgn() with its sign reversed sends the grid bug on to the size test and
    // stops there.
    for (const [label, mx, my, ux, uy] of [
        // dx 0, dy 1: ROWNO is 21, so row 20 is the last legal one.
        ['south', 40, ROWNO - 1, 40, ROWNO - 2],
        // dx 0, dy -1: row 0 is the first, and the step north leaves the map.
        ['north', 40, 0, 40, 1],
        // dx -1, dy 0: isok() rejects column 0, so column 1 is the first.
        // mx must stay above 0 as well, because uhitm.c:1861 would otherwise
        // set hmd.offmap and skip the knockback block altogether.
        ['west', 1, 10, 2, 10],
    ]) {
        game.u.ux = ux;
        game.u.uy = uy;
        const cornered = target(PM_GRID_BUG, { mx, my });
        const off = hitEnv({ rolls: [3, 1, 0] });
        await hmon(cornered, game.uwep, HMON_MELEE, 10, game, off);
        assert.deepEqual(off.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)'], label);
    }
});

// uhitm.c:1846-1852. The damage lands on mon->mhp and the cap at 1851-1852
// stops a negative adjustment from healing the target above its maximum.
test('hmon_hitmon subtracts the damage and never raises mhp past mhpmax',
    async () => {
        await hero();
        const wounded = target(PM_LICHEN, { mhp: 9, mhpmax: 9 });
        const env = hitEnv({ rolls: [3, 1, 1] });
        assert.equal(await hmon(wounded, game.uwep, HMON_MELEE, 10, game, env),
                     true);
        assert.equal(wounded.mhp, 6);

        // A target already above its maximum -- which a level-draining
        // artifact can leave behind -- is pulled back down to it: 20 - 1 is
        // 19, and uhitm.c:1851-1852 makes that mhpmax.
        const drained = target(PM_LICHEN, { mhp: 20, mhpmax: 4 });
        const second = hitEnv({ rolls: [1] });
        assert.equal(await hmon(drained, game.uwep, HMON_MELEE, 10, game,
                                second), true);
        assert.equal(drained.mhp, 4);
    });

// uhitm.c:1846 `if (!hmd.already_killed)` guards both the conduct log and the
// hit-point decrement, and hmon_hitmon_dmg_recalc():1505-1506 keeps a negative
// bonus from turning a hit into a miss.
test('hmon_hitmon floors the damage at one point', async () => {
    await hero();
    // A scalpel at -9 makes dmgval() return 0 at weapon.c:302-303, so
    // hmon_hitmon() skips dmg_recalc() and takes uhitm.c:1817's
    // `get_dmg_bonus && !mon_is_shade` arm, which sets one point.
    const blunted = mksobj(SCALPEL, true, false, { state: game });
    blunted.spe = -9;
    const mon = target();
    const env = hitEnv({ rolls: [3] });
    await hmon(mon, blunted, HMON_MELEE, 10, game, env);
    assert.equal(mon.mhp, 98);
    // One point, so uhitm.c:1830's `hmd.dmg > 1` fails and no knockback pair
    // was drawn.
    assert.deepEqual(env.bounds, ['rnd(3)']);
});

// uhitm.c:1467-1468. A melee hit made while holding a two-handed weapon
// multiplies weapon.c dbon() by 3/2, the largest single damage term the port
// adds. C reads u.uwep for that test, not the object being swung, so the same
// object lands for different totals in the same hand.
test('a two-handed weapon takes three halves of the strength bonus',
    async () => {
        // A Barbarian starts at 18 Strength, which weapon.c dbon() scores 2,
        // and his own weapon is a two-handed sword. The scalpel is swung as a
        // carried object rather than wielded, so dmgval()'s rnd(3) and
        // weapon_dam_bonus()'s -2 for a restricted knife skill are the same
        // on both rows and the strength term is the only difference.
        await hero({ role: 'Barbarian', gender: 'male', align: 'chaotic' });
        const scalpel = mksobj(SCALPEL, true, false, { state: game });
        // (3 * 2 + 1) / 2 truncates to 3, so 1 - 2 + 3 is two points.
        const bimanualBlow = target();
        await hmon(bimanualBlow, scalpel, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1] }));
        assert.equal(bimanualBlow.mhp, 97);

        // The same hero holding a one-handed weapon takes dbon() as it is, so
        // 1 - 2 + 2 is one point. uhitm.c:1817's floor would also produce one
        // point, which is why the row above is the one that decides the term.
        game.uwep = mksobj(SHORT_SWORD, true, false, { state: game });
        const oneHandedBlow = target();
        await hmon(oneHandedBlow, scalpel, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1] }));
        assert.equal(oneHandedBlow.mhp, 98);
    });

// uhitm.c:1815-1822 with weapon.c:306-307 and uhitm.c:841-843. A shade takes
// nothing from an ordinary weapon or from a fist; both arms zero the damage
// and then meet the same stop, because saying so needs shade_miss().
test('a shade stops on the same arm from either hand', async () => {
    await hero();
    const wielded = hitEnv();
    await refusesAsync(
        () => hmon(target(PM_SHADE), game.uwep, HMON_MELEE, 10, game, wielded),
        'a blow that passes through a shade',
    );
    // weapon.c:306 sits after the damage die, which C has already rolled, and
    // hmon_hitmon() skips dmg_recalc() for a total of zero.
    assert.deepEqual(wielded.bounds, ['rnd(3)']);

    // A silver saber clears artifact.c shade_glare(), so the same target takes
    // real damage and the swing finishes. rnd(8) is the base die, rnd(20) the
    // silver bonus, and hmd.silvermsg is what stops next.
    const saber = mksobj(SILVER_SABER, true, false, { state: game });
    const silver = hitEnv({ rolls: [1, 1] });
    await refusesAsync(
        () => hmon(target(PM_SHADE), saber, HMON_MELEE, 10, game, silver),
        'a silver hit message',
    );
    assert.deepEqual(silver.bounds, ['rnd(8)', 'rnd(20)']);

    await hero({ role: 'Tourist', gender: 'male', seed: TOURIST_SEED });
    const barehanded = hitEnv();
    await refusesAsync(
        () => hmon(target(PM_SHADE), null, HMON_MELEE, 10, game, barehanded),
        'a blow that passes through a shade',
    );
    // uhitm.c:841-843 answers before rnd(2) is rolled, and unlike the weapon
    // arm at 892 it does not consult shade_glare().
    assert.deepEqual(barehanded.bounds, []);
});

// uhitm.c:1587-1601 hmon_hitmon_pet() and 1603-1634 hmon_hitmon_splitmon().
// Both are called unconditionally and both are no-ops for an ordinary hostile.
test('the pet and pudding arms pass an ordinary hostile through', async () => {
    await hero();
    const env = hitEnv({ rolls: [2, 1, 1] });
    const mon = target();
    await hmon(mon, game.uwep, HMON_MELEE, 10, game, env);
    assert.equal(mon.mhp, 97);

    // uhitm.c:1594's `mon->mtame && hmd.dmg > 0`. abuse_dog() is unported.
    const pet = hitEnv({ rolls: [2, 1, 1] });
    await refusesAsync(
        () => hmon(target(PM_LICHEN, { mtame: 5 }), game.uwep, HMON_MELEE, 10,
                   game, pet),
        'hitting a pet',
    );

    // uhitm.c:1610-1626. The scalpel is METAL and wielded, and the hero is
    // striking hand to hand, so a black pudding meets every one of C's tests
    // and clone_mon() is what is missing.
    const pudding = hitEnv({ rolls: [2, 1, 1] });
    await refusesAsync(
        () => hmon(target(PM_BLACK_PUDDING), game.uwep, HMON_MELEE, 10, game,
                   pudding),
        'splitting a pudding',
    );
    // The same pudding struck with an unwielded scalpel fails uhitm.c:1616
    // and passes straight through.
    const spare = mksobj(SCALPEL, true, false, { state: game });
    const bystander = hitEnv({ rolls: [2, 1, 1] });
    const blob = target(PM_BLACK_PUDDING);
    await hmon(blob, spare, HMON_MELEE, 10, game, bystander);
    assert.equal(blob.mhp, 97);
});

// uhitm.c:1420-1431 hmon_hitmon_do_hit()'s object dispatch, and 1069-1092
// hmon_hitmon_weapon()'s. Only a weapon, a weapon-tool or a gem reaches the
// melee damage arm; the rest have owners this port does not have.
test('do_hit and weapon dispatch reject what they cannot roll damage for',
    async () => {
        await hero();
        // A small shield is ARMOR_CLASS, so uhitm.c:1425-1431's closing arm
        // takes it and hmon_hitmon_misc_obj() is what is missing.
        const shield = mksobj(SMALL_SHIELD, true, false, { state: game });
        await refusesAsync(
            () => hmon(target(), shield, HMON_MELEE, 10, game, hitEnv()),
            'hitting with a non-weapon',
        );
        // A ring likewise.
        const ring = mksobj(RIN_ADORNMENT, true, false, { state: game });
        await refusesAsync(
            () => hmon(target(), ring, HMON_MELEE, 10, game, hitEnv()),
            'hitting with a non-weapon',
        );

        // A bow is WEAPON_CLASS but is_launcher(), and an arrow is
        // is_ammo(), so hmon_hitmon_weapon() sends both to the ranged arm.
        for (const otyp of [BOW, ARROW]) {
            const ranged = mksobj(otyp, true, false, { state: game });
            await refusesAsync(
                () => hmon(target(), ranged, HMON_MELEE, 10, game, hitEnv()),
                'hitting with a launcher or ammunition',
                String(otyp),
            );
        }

        // The two positive terms of the same pair of class tests. Each one
        // selects which of the two refusals the swing reaches.
        //
        // uhitm.c:1416's GEM_CLASS disjunct: the GEM() macro in
        // include/objects.h:1516-1520 gives every gem an oc_skill of -P_SLING,
        // so is_ammo() holds and hmon_hitmon_weapon() sends the gem straight
        // back out to the ranged arm. Without the disjunct the gem would never
        // reach hmon_hitmon_weapon() at all and would refuse with the
        // non-weapon reason instead.
        const gem = mksobj(WORTHLESS_WHITE_GLASS, true, false, { state: game });
        await refusesAsync(
            () => hmon(target(), gem, HMON_MELEE, 10, game, hitEnv()),
            'hitting with a launcher or ammunition',
        );
        // uhitm.c:1079's is_missile(): a dart is neither is_ammo() nor
        // is_launcher(), so that term alone keeps it out of the melee arm.
        const dart = mksobj(DART, true, false, { state: game });
        await refusesAsync(
            () => hmon(target(), dart, HMON_MELEE, 10, game, hitEnv()),
            'hitting with a launcher or ammunition',
        );
    });

// uhitm.c:1013-1030, 1043-1049 and 1065-1066. Three of hmon_hitmon_weapon_
// melee()'s arms need owners this port does not have, and each is guarded by
// something an ordinary weapon does not carry.
test('the artifact, jousting and poison arms stop on their own guards',
    async () => {
        await hero();
        // uhitm.c:1013's `obj->oartifact`, which artifact_hit() reads.
        // Excalibur's base object is a long sword. artiexist[].exists has to
        // be set as well, because hmon_hitmon_do_hit():1411 names the object
        // with cxname() before the arm below is reached, and objnam.c's
        // find_artifact() rejects an artifact the game never made.
        const excalibur = mksobj(LONG_SWORD, true, false, { state: game });
        excalibur.oartifact = ART_EXCALIBUR;
        game.artiexist[ART_EXCALIBUR].exists = 1;
        await refusesAsync(
            () => hmon(target(), excalibur, HMON_MELEE, 10, game,
                       hitEnv({ rolls: [1] })),
            'artifact melee hit',
        );
        // weapon.c dmgval() rolled the long sword's die before the arm above
        // answered, which is where C rolls it too.
        game.artiexist[ART_EXCALIBUR].exists = 0;

        // uhitm.c:1043-1048's jousting arm needs a lance and a saddle, and
        // the saddle twice over: hmon_hitmon_weapon():1078-1080 sends an
        // unmounted pole to the ranged arm before the melee arm can look at
        // it, so the two lance rows below differ only in u.usteed.
        const lance = mksobj(LANCE, true, false, { state: game });
        await refusesAsync(
            () => hmon(target(), lance, HMON_MELEE, 10, game,
                       hitEnv({ rolls: [1] })),
            'hitting with a launcher or ammunition',
        );
        game.u.usteed = target(PM_LICHEN);
        await refusesAsync(
            () => hmon(target(), lance, HMON_MELEE, 10, game,
                       hitEnv({ rolls: [1] })),
            'jousting from a saddle',
        );
        game.u.usteed = null;
    });

// uhitm.c:610-644 known_hitum()'s hit arm, which hmon() sits inside.
test('known_hitum counts the weapon conduct and downgrades a no-damage hit',
    async () => {
        await hero();
        assert.equal(game.u.uconduct.weaphit, 0);
        const mhit = { value: true };
        const env = hitEnv({ rolls: [2, 1, 1, 24] });
        const mon = target();
        const alive = await known_hitum(
            mon, game.uwep, mhit, 15, 0, game.youmonst.data.mattk[0], 10,
            game, env,
        );
        assert.equal(alive, true);
        // uhitm.c:615-616 counts the hit, and hmon_hitmon():1843 tests the
        // count as `<= 1`, so the first weapon hit of a game is the one that
        // reaches first_weapon_hit().
        assert.equal(game.u.uconduct.weaphit, 1);
        assert.equal(mhit.value, true);
        // weapon.c use_skill() ran, because rnd(3)=2 is above the minimal-hit
        // bar. A Healer's knife skill starts the game with 20 practice.
        assert.equal(P_ADVANCE(P_KNIFE, game), 21);

        // uhitm.c:634-638 turns a hit that took no hit points back into a
        // miss and gives the conduct back. Nothing this port reaches can
        // produce one: C's own comment at 632-633 names Vorpal Blade's
        // beheading of a headless target, which is artifact_hit()'s doing and
        // stops in hmon_hitmon_weapon_melee(). A damage die of 0 does not
        // reach the target either, because uhitm.c:1817 turns any total below
        // one into one point. Both are checked here through the same swing.
        await hero();
        const kept = { value: true };
        const blunted = hitEnv({ rolls: [-4], fallback: 24 });
        const unhurt = target();
        await known_hitum(
            unhurt, game.uwep, kept, 15, 0, game.youmonst.data.mattk[0], 10,
            game, blunted,
        );
        assert.equal(unhurt.mhp, 98);
        assert.equal(kept.value, true);
        assert.equal(game.u.uconduct.weaphit, 1);
    });

// uhitm.c:623-631. A survivor below half its maximum hit points has one chance
// in twenty-five of losing its nerve, and mon.c set_ustuck() owns what follows.
test('known_hitum draws the morale check only for a survivor', async () => {
    await hero();
    const mhit = { value: true };
    // mhp 10 of mhpmax 99: three points leaves 7, which is under 49.
    const nervous = target(PM_LICHEN, { mhp: 10, mhpmax: 99 });
    await refusesAsync(
        () => known_hitum(nervous, game.uwep, mhit, 15, 0,
                          game.youmonst.data.mattk[0], 10, game,
                          hitEnv({ rolls: [3, 1, 1, 0] })),
        'a wounded monster losing its nerve',
    );

    // The same rn2(25)=0 against a target still above half its maximum runs
    // straight past: C's `&&` at 624 tests the hit points too.
    const healthy = { value: true };
    const stout = target();
    await known_hitum(stout, game.uwep, healthy, 15, 0,
                      game.youmonst.data.mattk[0], 10, game,
                      hitEnv({ rolls: [3, 1, 1, 0] }));
    assert.equal(stout.mhp, 96);

    // Exactly half is the boundary C writes as `<`: twenty hit points less two
    // points of damage leaves ten, which mhpmax / 2 also is, so the target
    // keeps its nerve. Reading the test as `<=` would stop here.
    const halved = { value: true };
    const even = target(PM_LICHEN, { mhp: 12, mhpmax: 20 });
    await known_hitum(even, game.uwep, halved, 15, 0,
                      game.youmonst.data.mattk[0], 10, game,
                      hitEnv({ rolls: [2, 1, 1, 0] }));
    assert.equal(even.mhp, 10);
});

// uhitm.c:858-860 with weapon.c special_dmgval() (360-431). C's comment at
// 852-857: blessed gloves and silver rings each add to a bare-handed blow,
// rings are worn under gloves, and the hero gets one bonus rather than both.
// No role starts with either, so this is the only place either arm can be
// seen.
//
// The W_ARMG that uhitm.c:858 puts in the mask when a glove is worn is
// redundant with weapon.c:388-389, which looks the glove up itself for any of
// the three masks; either alone sends the blow down the glove arm. So what the
// two rows below separate is the glove from the ring, and neither half of that
// redundant pair can be pinned on its own.
test('a glove takes the place of the ring beneath it', async () => {
    await hero({ role: 'Tourist', gender: 'male', seed: TOURIST_SEED });
    const ring = mksobj(RIN_ADORNMENT, true, false, { state: game });
    // weapon.c:401, 410 and 417 compare objects[otyp].oc_material with SILVER;
    // no ring is made of silver, so the material is overridden here rather than
    // a silver ring being wished for. A vampire is S_VAMPIRE and undead, which
    // mondata.c hates_silver() and hates_blessings() answer TRUE for in turn,
    // so one target can show either bonus.
    game.objects[ring.otyp].oc_material = SILVER;
    game.uleft = ring;
    // gt.twohits is hitum()'s, and a test that calls hmon() directly leaves it
    // unset; uhitm.c:859-860 compares it with 0, 1 and 2, so an unset value
    // would select neither hand and hand special_dmgval() an empty mask.
    game.twohits = 0;

    // Bare hands: weapon.c:408-414 reaches the ring, draws rnd(20) for it and
    // sets silverhit, which uhitm.c:865-867 copies into
    // hmd.barehand_silver_rings and 880-881 turns into hmd.silvermsg -- the
    // message this slice does not own. rnd(100) is the stagger draw the two
    // points then earn.
    const bare = hitEnv({ rolls: [1, 1] });
    await refusesAsync(
        () => hmon(target(PM_VAMPIRE), null, HMON_MELEE, 10, game, bare),
        'a silver hit message',
    );
    assert.deepEqual(bare.bounds, ['rnd(2)', 'rnd(20)', 'rnd(100)']);

    // The same hand inside a blessed leather glove: weapon.c:388-389 finds the
    // glove, so the ring is never read and weapon.c:395-396's rnd(4) takes
    // rnd(20)'s place. Leather is not silver, so nothing is seared and the
    // swing finishes.
    const gloves = mksobj(LEATHER_GLOVES, true, false, { state: game });
    gloves.blessed = 1;
    gloves.cursed = 0;
    game.uarmg = gloves;
    const gloved = target(PM_VAMPIRE);
    const covered = hitEnv({ rolls: [1, 1] });
    await hmon(gloved, null, HMON_MELEE, 10, game, covered);
    assert.deepEqual(covered.bounds, ['rnd(2)', 'rnd(4)', 'rnd(100)']);
    assert.equal(gloved.mhp, 97);

    game.uarmg = null;
    game.objects[ring.otyp].oc_material = 0;
    game.uleft = null;
    game.twohits = 0;
});

// uhitm.c:960-968 and backstabbable() (920-931). A Rogue who catches a target
// off balance adds rnd(u.ulevel) and speaks for the blow himself, which is why
// hmon_hitmon_msg_hit() then says nothing.
test('a Rogue strikes from behind, and backstabbable() names who cannot be',
    async () => {
        await hero({ role: 'Rogue', gender: 'male', align: 'chaotic' });
        // The Rogue's short sword is oc_wsdam 6, so rnd(6)=3 clears
        // uhitm.c:947's minimal-hit bar and the special-attack gate at 955
        // lets the backstab through. u.ulevel is 1 at the first prompt, so the
        // bonus die is rnd(1) and the total is four points.
        const fleeing = target(PM_JACKAL, { mflee: 1 });
        const backstab = hitEnv({ rolls: [3, 1] });
        await hmon(fleeing, game.uwep, HMON_MELEE, 10, game, backstab);
        assert.deepEqual(backstab.lines,
                         ['You strike the jackal from behind!']);
        assert.deepEqual(backstab.bounds.slice(0, 2), ['rnd(6)', 'rnd(1)']);
        assert.equal(fleeing.mhp, 95);

        // The same swing at a jackal that is neither fleeing nor helpless
        // fails backstabbable()'s last term, so the ordinary message returns
        // and the blow is three points rather than four.
        const alert = target(PM_JACKAL);
        const ordinary = hitEnv({ rolls: [3] });
        await hmon(alert, game.uwep, HMON_MELEE, 10, game, ordinary);
        assert.deepEqual(ordinary.lines, ['You hit the jackal.']);
        assert.equal(alert.mhp, 96);

        // One species per term of backstabbable(), each chosen so that it is
        // the only term it fails: a gray ooze is amorphous but not whirly,
        // noncorporeal or one of the three classes; an energy vortex is whirly
        // and nothing else; a ghost is noncorporeal alone; and the quivering
        // blob, floating eye and lichen carry S_BLOB, S_EYE and S_FUNGUS
        // without any of the flags. All are set fleeing, so only the species
        // term can refuse the backstab.
        for (const pmidx of [PM_GRAY_OOZE, PM_ENERGY_VORTEX, PM_GHOST,
                             PM_QUIVERING_BLOB, PM_FLOATING_EYE, PM_LICHEN]) {
            const spared = target(pmidx, { mflee: 1 });
            const env = hitEnv({ rolls: [3] });
            await hmon(spared, game.uwep, HMON_MELEE, 10, game, env);
            assert.equal(
                env.lines.some((line) => line.includes('from behind')),
                false,
                game.mons[pmidx].pmnames.find(Boolean),
            );
        }

        // canseemon() at uhitm.c:929. A target off the map cannot be seen, so
        // the backstab is refused however helpless it is. uhitm.c:1855 also
        // sets hmd.offmap for it, which is what suppresses the closing
        // wakeup() and knockback.
        const unseen = target(PM_JACKAL, { mflee: 1, mx: 0, my: 0 });
        const blind = hitEnv({ rolls: [3] });
        await hmon(unseen, game.uwep, HMON_MELEE, 10, game, blind);
        assert.deepEqual(blind.bounds, ['rnd(6)']);
        assert.equal(
            blind.lines.some((line) => line.includes('from behind')), false,
        );

        // uhitm.c:955's `!hmd.train_weapon_skill`, the first term of the
        // special-attack gate: a minimal hit takes no bonus at all, so even a
        // fleeing jackal gets the ordinary message.
        const grazed = target(PM_JACKAL, { mflee: 1 });
        const minimal = hitEnv({ rolls: [1] });
        await hmon(grazed, game.uwep, HMON_MELEE, 10, game, minimal);
        assert.deepEqual(minimal.lines, ['You hit the jackal.']);
    });

// uhitm.c:949-952. A Healer's knife work improves with dissections, and the
// bonus is added after uhitm.c:947 has already decided train_weapon_skill from
// the die alone.
test('a Healer adds anatomy knowledge to a knife, capped at three points',
    async () => {
        await hero();
        const lichen = () => target(PM_LICHEN);
        // mvitals[].died / 6, so twelve lichens killed is two points on top of
        // the scalpel's rnd(3).
        game.svm.mvitals[monsndx(game.mons[PM_LICHEN])].died = 12;
        const known = lichen();
        await hmon(known, game.uwep, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1] }));
        assert.equal(known.mhp, 96);

        // min(3, ...): thirty would be five points and C takes three.
        game.svm.mvitals[monsndx(game.mons[PM_LICHEN])].died = 30;
        const expert = lichen();
        await hmon(expert, game.uwep, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1] }));
        assert.equal(expert.mhp, 95);

        // A Rogue's short sword is a WEAPON_CLASS blade rather than a knife,
        // so oc_skill is not P_KNIFE and the same thirty deaths add nothing.
        await hero({ role: 'Rogue', gender: 'male', align: 'chaotic' });
        game.svm.mvitals[monsndx(game.mons[PM_LICHEN])].died = 30;
        const rogue = lichen();
        await hmon(rogue, game.uwep, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1] }));
        assert.equal(rogue.mhp, 98);

        // A Healer holding someone else's short sword gets nothing either:
        // C tests the object, not only the role.
        await hero();
        game.svm.mvitals[monsndx(game.mons[PM_LICHEN])].died = 30;
        const borrowed = mksobj(SHORT_SWORD, true, false, { state: game });
        const wrongBlade = lichen();
        await hmon(wrongBlade, borrowed, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1] }));
        assert.equal(wrongBlade.mhp, 98);
        game.svm.mvitals[monsndx(game.mons[PM_LICHEN])].died = 0;
    });

// uhitm.c:969-1010. A two-handed weapon in skilled hands can shatter what the
// target is wielding. Every term of C's condition is checked here, because the
// arm it guards stops and no recording reaches it.
test('the weapon shatter arm needs all six of its terms', async () => {
    await hero({ role: 'Samurai', gender: 'male', align: 'lawful' });
    // A Samurai's katana takes uhitm.c:973-974's second clause rather than
    // bimanual(): it needs the role, the otyp and an empty shield hand, all of
    // which the starting kit supplies. P_SKILL has to be raised, because the
    // role starts its long-sword skill at Basic and C wants Skilled.
    skillSlot(uwep_skill_type(game), game).skill = P_SKILLED;
    const armed = () => target(PM_JACKAL, { mw: game.uwep });

    // dieroll 2, which C's comment at 984-987 calls the most successful
    // non-beheading hit.
    await refusesAsync(
        () => hmon(armed(), game.uwep, HMON_MELEE, 2, game,
                   hitEnv({ rolls: [3] })),
        'shattering a monster weapon',
    );

    // One term at a time. Each of these runs the swing to the end instead.
    const passes = [
        // uhitm.c:969, any other die roll.
        [3, () => {}],
        // 976-977, a skill below Skilled.
        [2, () => { skillSlot(uwep_skill_type(game), game).skill = P_BASIC; }],
        // 974, a shield in the off hand, which disqualifies the katana.
        [2, () => { game.uarms = mksobj(SMALL_SHIELD, true, false, { state: game }); }],
    ];
    for (const [dieroll, weaken] of passes) {
        await hero({ role: 'Samurai', gender: 'male', align: 'lawful' });
        skillSlot(uwep_skill_type(game), game).skill = P_SKILLED;
        weaken();
        const spared = armed();
        await hmon(spared, game.uwep, HMON_MELEE, dieroll, game,
                   hitEnv({ rolls: [3] }));
        assert.ok(spared.mhp < 99, String(dieroll));
    }

    // 978, MON_WEP(mon): a target that is wielding nothing has no weapon to
    // shatter, and this is the common case rather than an edge one.
    await hero({ role: 'Samurai', gender: 'male', align: 'lawful' });
    skillSlot(uwep_skill_type(game), game).skill = P_SKILLED;
    const unarmedTarget = target(PM_JACKAL);
    await hmon(unarmedTarget, game.uwep, HMON_MELEE, 2, game,
               hitEnv({ rolls: [3] }));
    assert.ok(unarmedTarget.mhp < 99);

    // 971, obj == uwep: the same katana held as a spare is not the wielded
    // weapon, so C leaves the defender's weapon alone.
    const spare = mksobj(KATANA, true, false, { state: game });
    const bystander = target(PM_JACKAL, { mw: game.uwep });
    await hmon(bystander, spare, HMON_MELEE, 2, game, hitEnv({ rolls: [3] }));
    assert.ok(bystander.mhp < 99);
});

// uhitm.c:1576-1577. The two species tests sit behind the rnd(100), so a
// martial-arts hero who clears the roll still leaves a large or armoured
// target on its feet.
test('a staggering punch spares a big or thick-skinned target', async () => {
    await hero({ role: 'Tourist', gender: 'male', seed: TOURIST_SEED });
    // rnd(100)=0 clears P_SKILL(P_BARE_HANDED_COMBAT), which is 1 for an
    // Unskilled Tourist; a real rnd() never returns 0, so this is the only way
    // to reach the arm at all.
    //
    // One species per conjunct, each chosen so that it is the only one it
    // fails: a rothe is msize 3 without M1_THICK_HIDE, so bigmonst() alone
    // spares it, and a xorn is msize 2 with M1_THICK_HIDE, so thick_skinned()
    // alone does. The baby gray dragon is both at once.
    for (const pmidx of [PM_ROTHE, PM_XORN, PM_BABY_GRAY_DRAGON]) {
        const spared = target(pmidx);
        await hmon(spared, null, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [2, 0] }));
        assert.ok(spared.mhp < 99, String(pmidx));
    }
    // A lichen is neither, so the same roll stops.
    await refusesAsync(
        () => hmon(target(), null, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [2, 0] })),
        'a staggering punch',
    );
});

// uhitm.c:1607-1625. Six of hmon_hitmon_splitmon()'s tests are checked here,
// each with the other five satisfied, because the arm they guard stops.
test('a pudding splits only when every one of its tests holds', async () => {
    await hero();
    const pudding = (overrides = {}) => target(PM_BLACK_PUDDING, overrides);
    // The Healer's scalpel is METAL and wielded, and the hero is striking hand
    // to hand, so this is the case that stops.
    await refusesAsync(
        () => hmon(pudding(), game.uwep, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [2, 1, 1] })),
        'splitting a pudding',
    );
    // A brown pudding takes the same arm through C's second otyp test.
    await refusesAsync(
        () => hmon(target(PM_BROWN_PUDDING), game.uwep, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [2, 1, 1] })),
        'splitting a pudding',
    );

    // 1610's `mon->mhp > 1`, read after uhitm.c:1847 has taken the damage: two
    // hit points less one point of damage leaves exactly one, which is alive
    // but too weak to divide.
    const weak = pudding({ mhp: 2, mhpmax: 2 });
    await hmon(weak, game.uwep, HMON_MELEE, 10, game, hitEnv({ rolls: [1] }));
    assert.equal(weak.mhp, 1);

    // 1610's `!mon->mcan`, the cancelled pudding.
    const cancelled = pudding({ mcan: 1 });
    await hmon(cancelled, game.uwep, HMON_MELEE, 10, game,
               hitEnv({ rolls: [2, 1, 1] }));
    assert.equal(cancelled.mhp, 97);

    // 1610's `!hmd.offmap`, which uhitm.c:1855 sets for a target with no
    // position on this level.
    const gone = pudding({ mx: 0, my: 0 });
    await hmon(gone, game.uwep, HMON_MELEE, 10, game, hitEnv({ rolls: [2] }));
    assert.equal(gone.mhp, 97);

    // 1613's `obj == uwep`: the same scalpel carried rather than wielded.
    const spare = mksobj(SCALPEL, true, false, { state: game });
    const bystander = pudding();
    await hmon(bystander, spare, HMON_MELEE, 10, game,
               hitEnv({ rolls: [2, 1, 1] }));
    assert.equal(bystander.mhp, 97);

    // 1616-1618's material test. A Wizard's quarterstaff is WOOD, so it splits
    // nothing however it is held.
    await hero({ role: 'Wizard', gender: 'male', align: 'chaotic' });
    const bruised = pudding();
    await hmon(bruised, game.uwep, HMON_MELEE, 10, game,
               hitEnv({ rolls: [2, 1, 1] }));
    assert.ok(bruised.mhp < 99);
});

// uhitm.c:5300-5305. A target standing in a doorway cannot be pushed out of
// it, which C answers before the size test below.
test('mhitm_knockback refuses a push out of a doorway', async () => {
    await hero();
    // A grid bug on a closed doorway to the south-east. C's test reads
    // magr->mx and magr->my, which for a hero attacker are gy.youmonst's and
    // are always 0, so what it asks is that the target is on neither column 0
    // nor row 0 -- true of any square a room can occupy.
    const square = game.level.at(game.u.ux + 1, game.u.uy + 1);
    const savedTyp = square.typ;
    const savedMask = square.flags;
    square.typ = DOOR;
    // js/hack.js doorMask() reads `flags` before `doormask`, so the door state
    // has to go in the field the level itself uses.
    square.flags = D_CLOSED;
    const bug = target(PM_GRID_BUG, { mx: game.u.ux + 1, my: game.u.uy + 1 });
    const blocked = hitEnv({ rolls: [3, 1, 0] });
    await hmon(bug, game.uwep, HMON_MELEE, 10, game, blocked);
    assert.deepEqual(blocked.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)']);

    // A doorway with no door in it is not a doorway for this rule, so the
    // same push reaches the size test and stops there.
    square.flags = D_NODOOR;
    await refusesAsync(
        () => hmon(target(PM_GRID_BUG, {
            mx: game.u.ux + 1, my: game.u.uy + 1,
        }), game.uwep, HMON_MELEE, 10, game, hitEnv({ rolls: [3, 1, 0] })),
        'knocking a much smaller monster back',
    );
    // The same closed door with the target due east rather than diagonal.
    // C still refuses, because its test is not the diagonal test its comment
    // describes; reading it as `dx && dy` would let this one through.
    square.flags = D_CLOSED;
    const east = game.level.at(game.u.ux + 1, game.u.uy);
    const savedEastTyp = east.typ;
    const savedEastMask = east.flags;
    east.typ = DOOR;
    east.flags = D_CLOSED;
    const sideways = hitEnv({ rolls: [3, 1, 0] });
    await hmon(target(PM_GRID_BUG), game.uwep, HMON_MELEE, 10, game, sideways);
    assert.deepEqual(sideways.bounds, ['rnd(3)', 'rn2(3)', 'rn2(6)']);
    east.typ = savedEastTyp;
    east.flags = savedEastMask;

    square.typ = savedTyp;
    square.flags = savedMask;
});

// Six guards whose two sides the matrix never separates, each with the input
// that does. They are grouped because each is one line of one condition.
test('the melee arm separates every guard a recording leaves undecided',
    async () => {
        // uhitm.c:1035, `hmd.material == SILVER && mon_hates_silver(mon)`. A
        // lichen does not hate silver, so a silver saber wounds it without
        // setting hmd.silvermsg, where either half alone would.
        await hero();
        const dulled = target();
        await hmon(dulled, mksobj(SILVER_SABER, true, false, { state: game }),
                   HMON_MELEE, 10, game, hitEnv({ rolls: [1, 1, 1] }));
        assert.equal(dulled.mhp, 98);

        // uhitm.c:955-957, the second and third terms of the special-attack
        // gate. A Rogue holding a fleeing jackal, or one in two-weapon combat,
        // takes no backstab.
        for (const hold of [
            (mon) => { game.u.ustuck = mon; },
            () => { game.u.twoweap = 1; },
        ]) {
            await hero({ role: 'Rogue', gender: 'male', align: 'chaotic' });
            const held = target(PM_JACKAL, { mflee: 1 });
            hold(held);
            const env = hitEnv({ rolls: [3] });
            await hmon(held, game.uwep, HMON_MELEE, 10, game, env);
            assert.deepEqual(env.lines, ['You hit the jackal.']);
            game.u.ustuck = null;
            game.u.twoweap = 0;
        }

        // uhitm.c:1571, `rnd(100) < P_SKILL(P_BARE_HANDED_COMBAT)`. A Tourist
        // is Unskilled, which is 1, so a roll of exactly 1 is the value that
        // separates `<` from `<=`.
        await hero({ role: 'Tourist', gender: 'male', seed: TOURIST_SEED });
        const unshaken = target();
        await hmon(unshaken, null, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [2, 1] }));
        assert.equal(unshaken.mhp, 97);

        // uhitm.c:1410-1414. The name is taken with cxname() unless the object
        // is a lit artifact light, and both halves of that test matter: a lit
        // oil lamp is lamplit but no artifact, and it reaches the closing arm
        // at 1425-1431 rather than the bare_artifactname() one.
        await hero();
        const lamp = mksobj(OIL_LAMP, true, false, { state: game });
        lamp.lamplit = 1;
        await refusesAsync(
            () => hmon(target(), lamp, HMON_MELEE, 10, game, hitEnv()),
            'hitting with a non-weapon',
        );

        // uhitm.c:1420. A pick-axe is is_weptool() but TOOL_CLASS, so it is
        // the object that separates C's three-way class test from a narrower
        // one.
        const pick = mksobj(PICK_AXE, true, false, { state: game });
        const chipped = target();
        await hmon(chipped, pick, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1, 1, 1] }));
        assert.equal(chipped.mhp, 98);

        // uhitm.c:1918, wakeup(mon, TRUE). The flag is mon.c wakeup()'s `msg`,
        // and a sleeping target is the only one that reads it.
        const drowsy = target(PM_JACKAL, { msleeping: 1 });
        const woken = hitEnv({ rolls: [1, 1, 1] });
        await refusesAsync(
            () => hmon(drowsy, game.uwep, HMON_MELEE, 10, game, woken),
            'growl from a woken monster',
        );
        assert.deepEqual(woken.lines,
                         ['You hit the jackal.', 'The jackal wakes up!']);
    });

// uhitm.c:857-881. gt.twohits selects which hand's ring counts, and hitum()
// sets it to 1 before the first of two attacks, so a two-weapon or
// double-punch hero reaches this slice with it already nonzero.
test('the bare-handed ring switch reads the hand that struck', async () => {
    await hero({ role: 'Tourist', gender: 'male', seed: TOURIST_SEED });
    const left = mksobj(RIN_ADORNMENT, true, false, { state: game });
    // A different ring type on the right hand, so that overriding one
    // material below leaves the two hands distinguishable.
    const right = mksobj(RIN_PROTECTION, true, false, { state: game });
    // No ring is made of silver in the object table, so the material is
    // overridden rather than a silver ring being wished for. A werewolf in
    // human form is what makes mondata.h hates_silver() answer TRUE; ordinary
    // undead do not qualify.
    game.objects[left.otyp].oc_material = SILVER;
    game.uleft = left;
    game.uright = right;

    // twohits 0: uhitm.c:865 checks both hands, so the left ring applies and
    // hmd.silvermsg is set, which stops at the message this slice does not own.
    const rolls = [1, 1];
    game.twohits = 0;
    await refusesAsync(
        () => hmon(target(PM_HUMAN_WEREWOLF), null, HMON_MELEE, 10, game,
                   hitEnv({ rolls })),
        'a silver hit message',
    );

    // twohits 1: uhitm.c:869 checks the right hand alone, which carries an
    // ordinary ring, so nothing is seared and the swing finishes.
    game.twohits = 1;
    const spared = target(PM_HUMAN_WEREWOLF);
    await hmon(spared, null, HMON_MELEE, 10, game, hitEnv({ rolls: [1, 1] }));
    assert.ok(spared.mhp < 99);

    // twohits 2: uhitm.c:872 checks the left hand, and the silver ring is
    // there.
    game.twohits = 2;
    await refusesAsync(
        () => hmon(target(PM_HUMAN_WEREWOLF), null, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [1, 1] })),
        'a silver hit message',
    );

    // twohits 3, C's default arm: a polymorphed hero's third claw, which
    // applies no ring at all.
    game.twohits = 3;
    const third = target(PM_HUMAN_WEREWOLF);
    await hmon(third, null, HMON_MELEE, 10, game, hitEnv({ rolls: [1, 1] }));
    assert.ok(third.mhp < 99);

    // The same three values with the silver ring on the right hand instead,
    // which is what separates uhitm.c:858's W_RINGR term from :859's W_RINGL.
    // weapon.c:409-419 checks the right ring only when the mask carries
    // W_RINGR, so twohits 2 -- the left hand's blow -- spares the target.
    game.objects[left.otyp].oc_material = 0;
    game.objects[right.otyp].oc_material = SILVER;
    for (const [twohits, sears] of [[0, true], [1, true], [2, false]]) {
        game.twohits = twohits;
        const mark = target(PM_HUMAN_WEREWOLF);
        const swing = () => hmon(mark, null, HMON_MELEE, 10, game,
                                 hitEnv({ rolls: [1, 1] }));
        if (sears) {
            await refusesAsync(swing, 'a silver hit message', String(twohits));
        } else {
            await swing();
            assert.ok(mark.mhp < 99, String(twohits));
        }
    }
    game.objects[right.otyp].oc_material = 0;

    game.twohits = 0;
    game.objects[left.otyp].oc_material = 0;
    game.uleft = null;
    game.uright = null;
});

// uhitm.c:1613-1614. Either wielded weapon can split a pudding while
// two-weaponing, which is the second half of a test the matrix only ever sees
// the first half of.
test('a swap weapon splits a pudding only while two-weaponing', async () => {
    await hero();
    const swap = mksobj(SCALPEL, true, false, { state: game });
    game.uswapwep = swap;

    // Without u.twoweap the swap weapon is just a carried object.
    const bystander = target(PM_BLACK_PUDDING);
    await hmon(bystander, swap, HMON_MELEE, 10, game,
               hitEnv({ rolls: [2, 1, 1] }));
    assert.equal(bystander.mhp, 97);

    // With it, the same object meets every one of C's tests.
    game.u.twoweap = 1;
    await refusesAsync(
        () => hmon(target(PM_BLACK_PUDDING), swap, HMON_MELEE, 10, game,
                   hitEnv({ rolls: [2] })),
        'splitting a pudding',
    );
    game.u.twoweap = 0;
    game.uswapwep = null;
});
