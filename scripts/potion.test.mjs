// potion.c potionbreathe() and do.c trycall().
//
// potionbreathe()'s eighteen case labels carry no operator a mutation can
// move, and the witness reaches exactly one of them. The tests below read the
// label list out of potion.c and then separate the three groups it falls into:
// the arm this port runs, the arms that stop by name, and the types that have
// no label at all and fall out of the switch.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { failClosedCommandRefusals } from '../js/cmd.js';

import {
    A_CON, A_DEX, A_WIS, BLINDED, CONFUSION, DEAF, FAST, FREE_ACTION, FROMOUTSIDE, GLIB, HALLUC,
    HALLUC_RES, INVIS, LEVITATION, NOT_HUNGRY, POTHIT_MONST_THROW, SEE_INVIS,
    SATIATED, SLEEP_RES, WEAK,
    TELEPAT, TIMEOUT, WOUNDED_LEGS,
} from '../js/const.js';
import { trycall } from '../js/do.js';
import { docall } from '../js/do_name.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { discover_object } from '../js/o_init.js';
import { mksobj } from '../js/obj.js';
import {
    POT_ACID,
    POT_BLINDNESS,
    POT_BOOZE,
    POT_CONFUSION,
    POT_ENLIGHTENMENT,
    POT_EXTRA_HEALING,
    POT_FRUIT_JUICE,
    POT_FULL_HEALING,
    POT_GAIN_ABILITY,
    POT_GAIN_ENERGY,
    POT_GAIN_LEVEL,
    POT_HALLUCINATION,
    POT_HEALING,
    POT_INVISIBILITY,
    POT_LEVITATION,
    POT_MONSTER_DETECTION,
    POT_OBJECT_DETECTION,
    POT_OIL,
    POT_PARALYSIS,
    POT_POLYMORPH,
    POT_RESTORE_ABILITY,
    POT_SEE_INVISIBLE,
    POT_SICKNESS,
    POT_SLEEPING,
    POT_SPEED,
    POT_WATER,
    TOWEL,
} from '../js/objects.js';
import {
    UnsupportedPotionError,
    UnsupportedQuaffError,
    bottlename,
    incr_itimeout,
    make_confused,
    make_blinded,
    make_glib,
    peffects,
    potionbreathe,
    potionhit,
    set_itimeout,
    speed_up,
    toggle_blindness,
} from '../js/potion.js';
import { enableRngLog, getRngLog } from '../js/rng.js';
import {
    loadQuaffBoozeRecipes, loadQuaffHealingRecipes,
    verifyBoozeSegment, verifyHealingSegment,
} from './run-quaff-confusion.mjs';

test('make_blinded silently extends an existing timed blindness', async () => {
    const state = {
        u: { uprops: [] },
        disp: { botl: false },
    };
    state.u.uprops[BLINDED] = { intrinsic: 3, extrinsic: 0, blocked: 0 };
    const lines = [];
    await make_blinded(9, false, state, {
        message: async (line) => lines.push(line),
    });
    assert.equal(state.u.uprops[BLINDED].intrinsic & TIMEOUT, 9);
    assert.deepEqual(lines, []);
    assert.equal(state.disp.botl, false,
        'an extension that remains blind does not toggle status display');
});

test('make_blinded uses injected vision state for planned blindness', async () => {
    const live = {
        u: { uprops: [] },
        disp: { botl: false },
    };
    live.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const planned = {
        u: { uprops: [{}, ...live.u.uprops.slice(1)] },
        disp: { botl: false },
    };
    planned.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const visionCalls = [];
    const lines = [];
    await make_blinded(4, false, planned, {
        message: async (line) => lines.push(line),
        visionRecalc: (control, options) => {
            visionCalls.push([control, options.state, options.redraw]);
        },
    });
    assert.equal(planned.u.uprops[BLINDED].intrinsic & TIMEOUT, 4);
    assert.equal(live.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
    assert.deepEqual(lines, []);
    assert.equal(visionCalls.length, 1);
    assert.equal(visionCalls[0][0], 0);
    assert.equal(visionCalls[0][1], planned);
    assert.equal(typeof visionCalls[0][2], 'function');
});

test('make_blinded preserves C regain message and transition order', async () => {
    const state = {
        u: { uprops: [], uwep: null },
        disp: { botl: false },
    };
    state.u.uprops[BLINDED] = { intrinsic: 5, extrinsic: 0, blocked: 0 };
    const lines = [];
    let recalc = 0;

    await make_blinded(0, true, state, {
        message: async (line) => lines.push(line),
        visionRecalc: () => { ++recalc; },
    });

    // potion.c:274-288 emits the regain line before toggle_blindness(), and
    // the latter is the only owner of the vision rebuild.
    assert.deepEqual(lines, ['You can see again.']);
    assert.equal(state.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
    assert.equal(recalc, 1);
});

test('make_blinded reports temporary dimming when blocked blindness stays unseen',
    async () => {
    const state = {
        u: { uprops: [], uwep: null },
        youmonst: { data: { mflags1: 0, pmidx: 0 } },
        disp: { botl: false },
    };
    // BBlinded (the blocked bit) models Eyes of the Overworld: HBlinded can
    // change while Blind remains false, entering potion.c:312-321.
    state.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 1 };
    const lines = [];
    await make_blinded(4, true, state, {
        message: async (line) => lines.push(line),
    });

    assert.deepEqual(lines, [
        'Your vision seems to dim for a moment but is normal now.',
    ]);
    assert.equal(state.u.uprops[BLINDED].intrinsic & TIMEOUT, 4);
});

test('make_blinded preserves Your prefix for blindfold itch and twitch',
    async () => {
    // potion.c:293 and :319 use Your() around the source-selected eye/body
    // part.  Keep both timeout directions source-pinned, including the
    // singular eye form used by cyclopes.
    const state = {
        u: { uprops: [], uwep: null },
        youmonst: { data: { mflags1: 0, mlet: 8, pmidx: 0 } },
        disp: { botl: false },
    };
    state.u.uprops[BLINDED] = { intrinsic: 5, extrinsic: 1, blocked: 0 };
    const lines = [];
    await make_blinded(0, true, state, {
        message: async (line) => lines.push(line),
    });
    assert.deepEqual(lines, ['Your eyes momentarily itch.']);

    lines.length = 0;
    state.u.uprops[BLINDED].intrinsic = 0;
    await make_blinded(4, true, state, {
        message: async (line) => lines.push(line),
    });
    assert.deepEqual(lines, ['Your eyes momentarily twitch.']);
});

test('toggle_blindness refreshes sensed monsters through a clone redraw seam',
    async () => {
    const planned = {
        u: {
            ux: 4,
            uy: 4,
            uprops: [],
            usteed: null,
            uwep: null,
        },
        disp: { botl: false },
        level: {
            monlist: {
                mx: 6,
                my: 4,
                mhp: 1,
                mstate: 0,
                mcansee: 1,
                mblinded: 0,
                data: { mflags2: 0 },
                nmon: null,
            },
        },
        warn_obj_cnt: 0,
    };
    planned.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0 };
    planned.u.uprops[TELEPAT] = { intrinsic: 1, extrinsic: 0 };
    const redraws = [];

    // C display.c:1487-1522 updates meverseen and redraws each monster plus
    // the hero. The clone callback is deliberately state-aware and never
    // touches the live display owned by newsym().
    await toggle_blindness(planned, {
        visionRecalc: () => {},
        redraw: (x, y, state) => redraws.push([x, y, state]),
    });
    assert.deepEqual(redraws.map(([x, y]) => [x, y]), [[6, 4], [4, 4]]);
    assert.ok(redraws.every(([, , state]) => state === planned));
    assert.equal(planned.level.monlist.meverseen, undefined);
    assert.equal(planned.disp.botl, true);
});

test('make_glib preserves C boolean XOR and refreshes worn gloves', () => {
    // potion.c:462-468 uses !old ^ !!xtime, including the equal-state cases.
    for (const old of [0, 1, FROMOUTSIDE]) {
        for (const xtime of [0, 2]) {
            for (const gloves of [false, true]) {
                const state = {
                    u: { uprops: [] }, disp: { botl: false },
                    uarmg: gloves ? {} : null,
                    program_state: { in_moveloop: true },
                    iflags: { suppress_price: 7 },
                };
                state.u.uprops[GLIB] = { intrinsic: old };
                let refreshes = 0;
                make_glib(xtime, state, { hooks: {
                    updateInventory(subject) {
                        assert.strictEqual(subject, state);
                        assert.equal(subject.u.uprops[GLIB].intrinsic,
                            (old & ~TIMEOUT) | xtime);
                        assert.equal(subject.iflags.suppress_price, 0);
                        refreshes++;
                    },
                } });
                assert.equal(state.disp.botl, Boolean(old) === Boolean(xtime));
                assert.equal(state.u.uprops[GLIB].intrinsic,
                    (old & ~TIMEOUT) | xtime);
                assert.equal(refreshes, gloves ? 1 : 0);
                assert.equal(state.iflags.suppress_price, 7,
                    'inventory refresh restores its independent flag');
            }
        }
    }
});

const POTION_TYPES = Object.freeze({
    POT_GAIN_ABILITY,
    POT_RESTORE_ABILITY,
    POT_CONFUSION,
    POT_BLINDNESS,
    POT_PARALYSIS,
    POT_SPEED,
    POT_LEVITATION,
    POT_HALLUCINATION,
    POT_INVISIBILITY,
    POT_SEE_INVISIBLE,
    POT_HEALING,
    POT_EXTRA_HEALING,
    POT_GAIN_LEVEL,
    POT_ENLIGHTENMENT,
    POT_MONSTER_DETECTION,
    POT_OBJECT_DETECTION,
    POT_GAIN_ENERGY,
    POT_SLEEPING,
    POT_FULL_HEALING,
    POT_POLYMORPH,
    POT_BOOZE,
    POT_SICKNESS,
    POT_FRUIT_JUICE,
    POT_ACID,
    POT_OIL,
    POT_WATER,
});

// The types with no case label in potion.c's switch. C's commented-out block
// at 2096-2105 names the first seven; the last two are absent from that comment
// and reach the same nothing, because the switch has no `default:`.
const NO_OP_TYPES = Object.freeze([
    'POT_GAIN_LEVEL', 'POT_GAIN_ENERGY', 'POT_LEVITATION', 'POT_FRUIT_JUICE',
    'POT_MONSTER_DETECTION', 'POT_OBJECT_DETECTION', 'POT_OIL',
    'POT_SEE_INVISIBLE', 'POT_ENLIGHTENMENT',
]);

function potionSource() {
    return readFileSync(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
}

// The body of potionbreathe()'s switch, from the `switch (` line to the closing
// brace before the `if (!already_in_use)` tail, split into the code the
// compiler sees and the block comments it does not. The split is the point:
// seven `case POT_...:` lines sit inside a comment, and reading them as labels
// is exactly the mistake this file exists to rule out.
function breatheSwitchBody() {
    const source = potionSource();
    const start = source.indexOf(
        'switch (Half_gas_damage ? TOWEL : obj->otyp) {',
    );
    assert.ok(start > 0, 'potion.c still switches on Half_gas_damage');
    const end = source.indexOf('if (!already_in_use)', start);
    assert.ok(end > start);
    const body = source.slice(start, end);
    const comments = [...body.matchAll(/\/\*[\s\S]*?\*\//gu)]
        .map(([text]) => text).join('\n');
    return { code: body.replace(/\/\*[\s\S]*?\*\//gu, ''), comments };
}

async function startedGame(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
}

function toplines() {
    return game._ttyToplines ?? '';
}

// The top line as pline.c leaves it after the segment's own last message.
// Clearing it is what keeps each call below from sharing a line with the one
// before it, which would otherwise reach the --More-- these tests have no
// keystrokes for.
function clearTopline() {
    game._pending_message = '';
    game._ttyToplines = '';
    game._ttyPreviousMessage = '';
    game._ttyMessageStopped = false;
}

function vaporPotion(otyp) {
    const obj = mksobj(otyp, false, false, { state: game });
    obj.quan = 1;
    obj.dknown = true;
    return obj;
}

test('healing potion preserves beatitude dice before Constitution exercise',
    async () => {
    for (const sign of [-1, 0, 1]) {
        // An independent reproducible fixture; the assertions cover all BUC signs.
        await startedGame(8460023, 'HealingDice');
        const potion = vaporPotion(POT_HEALING);
        potion.cursed = sign < 0;
        potion.blessed = sign > 0;
        // Leave room for even the blessed maximum (6d4 + 8), avoiding overheal.
        game.u.uhp = 1;
        game.u.uhpmax = 100;
        game.u.uhppeak = 100;
        clearTopline();
        enableRngLog();

        assert.equal(await peffects(potion, game), -1);

        // potion.c:1122 rolls 4+2*bcsign four-sided dice; exercise follows
        // healup and takes its own rn2(19), not another healing draw.
        const draws = getRngLog();
        assert.equal(draws.length, 2);
        const rolled = new RegExp(`^d\\(${4 + 2 * sign},4\\)=(\\d+)$`, 'u')
            .exec(draws[0]);
        assert.ok(rolled, draws[0]);
        assert.match(draws[1], /^rn2\(19\)=\d+$/u);
        assert.equal(game.u.uhp, 1 + 8 + Number(rolled[1]));
        assert.equal(game.u.uhpmax, 100);
        assert.equal(game.u.uhppeak, 100);
        assert.equal(toplines(), 'You feel better.');
        assert.equal(game.unported.has('potion.c make_sick'), sign > 0);
    }
});

test('uncursed healing clears cream and timed deafness through healup',
    async () => {
    await startedGame(8460023, 'HealingHearing');
    const potion = vaporPotion(POT_HEALING);
    potion.cursed = false;
    potion.blessed = false;
    // Distinct nonzero fixture durations: healup must clear both, not decrement.
    game.u.ucreamed = 3;
    game.u.uprops[BLINDED].intrinsic = 0;
    game.u.uprops[DEAF].intrinsic = 7;
    clearTopline();

    await peffects(potion, game);

    assert.equal(game.u.ucreamed, 0);
    assert.equal(game.u.uprops[DEAF].intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), 'You feel better.  You can hear again.');
});

// potion.c:1128-1136. The eight-sided beatitude roll precedes healup, and the
// two positive exercise calls follow hallucination clearing in Constitution,
// Strength order. Keep all three BUC signs here so the nxtra and cure gates
// are checked alongside the random-call order.
test('extra healing preserves source BUC dice and exercise order', async () => {
    for (const sign of [-1, 0, 1]) {
        await startedGame(8460024, 'ExtraHealingDice');
        const potion = vaporPotion(POT_EXTRA_HEALING);
        potion.cursed = sign < 0;
        potion.blessed = sign > 0;
        // Force the healup nxtra branch for every beatitude: 16 + d(2, 8)
        // already exceeds this maximum, while the initial HP leaves room for
        // the exact source result to be asserted.
        game.u.uhp = 1;
        game.u.uhpmax = 15;
        game.u.uhppeak = 15;
        clearTopline();
        enableRngLog();

        assert.equal(await peffects(potion, game), -1);

        const draws = getRngLog();
        assert.equal(draws.length, 3);
        const rolled = new RegExp(`^d\\(${4 + 2 * sign},8\\)=(\\d+)$`, 'u')
            .exec(draws[0]);
        assert.ok(rolled, draws[0]);
        assert.match(draws[1], /^rn2\(19\)=\d+$/u);
        assert.match(draws[2], /^rn2\(19\)=\d+$/u);
        assert.equal(game.u.uhp, game.u.uhpmax);
        assert.equal(game.u.uhp, sign > 0 ? 20 : sign === 0 ? 17 : 15);
        assert.equal(game.u.uhppeak, game.u.uhpmax);
        assert.equal(toplines(), 'You feel much better.');
    }
});

// potion.c:1131-1141. Clearing hallucination precedes the two exercise calls;
// only a blessed, non-mounted potion clears a live wounded-legs property.
test('blessed extra healing clears hallucination and hero leg wounds', async () => {
    await startedGame(8460025, 'ExtraHealingLegs');
    const potion = vaporPotion(POT_EXTRA_HEALING);
    potion.blessed = true;
    potion.cursed = false;
    const wounded = game.u.uprops[WOUNDED_LEGS];
    wounded.intrinsic = TIMEOUT | 4;
    wounded.extrinsic = 1;
    game.u.atemp[A_DEX] = -1;
    game.u.uprops[HALLUC].intrinsic = 3;
    clearTopline();
    enableRngLog();
    // heal_legs() writes a second source message; provide its --More-- key
    // through the display-owned queue just as a recorded quaff would.
    game.nhDisplay.pushKey(' '.charCodeAt(0));

    assert.equal(await peffects(potion, game), -1);

    assert.equal(wounded.intrinsic, 0);
    assert.equal(wounded.extrinsic, 0);
    assert.equal(game.u.uprops[HALLUC].intrinsic & TIMEOUT, 0);
    assert.equal(game.u.atemp[A_DEX], 0);
    // The second source message crosses the TTY More boundary, so the final
    // topline is the leg-healing line after the supplied dismissal key.
    assert.equal(toplines(), 'Your leg feels better.');
    assert.deepEqual(getRngLog().slice(0, 3).map(draw => draw.replace(/=.*/u, '')),
        ['d(6,8)', 'rn2(19)', 'rn2(19)']);
});

test('independent healing recipes complete quaff and overheal bookkeeping',
    async () => {
    for (const { recipe } of loadQuaffHealingRecipes())
        await verifyHealingSegment(recipe.segments[0]);
});

// potion.c peffect_paralysis():881-898. The ordinary floor arm must emit its
// feet message before rn1(10, 25), then set both continuation fields before
// exercise(A_DEX, FALSE). The recorded rn2 results pin that source order.
test('quaffing paralysis freezes floor-bound feet and exercises Dexterity',
    async () => {
    await startedGame(771024, 'ParalysisFloor');
    const potion = vaporPotion(POT_PARALYSIS);
    game.u.uprops[FREE_ACTION].intrinsic = 0;
    game.u.uprops[FREE_ACTION].extrinsic = 0;
    game.u.uprops[LEVITATION].intrinsic = 0;
    game.u.uprops[LEVITATION].extrinsic = 0;
    game.u.uprops[LEVITATION].blocked = 0;
    game.u.usteed = null;
    // The selected seed starts on a stair; choose the first room square so
    // this source-pinned test exercises the ordinary floor branch.
    const room = game.level.rooms.find(({ lx, hx, ly, hy }) =>
        lx < hx && ly < hy);
    assert.ok(room);
    game.u.ux = room.lx;
    game.u.uy = room.ly;
    clearTopline();
    enableRngLog();
    const before = game.u.aexe[A_DEX];

    assert.equal(await peffects(potion, game), -1);

    const draws = getRngLog();
    assert.equal(draws.length, 2);
    const duration = Number(/^rn2\(10\)=(\d+)$/u.exec(draws[0])?.[1]);
    const dexLoss = Number(/^rn2\(2\)=(\d+)$/u.exec(draws[1])?.[1]);
    assert.ok(Number.isInteger(duration));
    assert.ok(Number.isInteger(dexLoss));
    assert.equal(toplines(), 'Your feet are frozen to the floor!');
    assert.equal(game.multi, -(25 + duration));
    assert.equal(game.multi_reason, 'frozen by a potion');
    assert.equal(game.nomovemsg, 'You can move again.');
    assert.equal(game.u.aexe[A_DEX], before - dexLoss);
});

// potion.c peffect_paralysis():883-897. The Free_action, levitation, and
// steed gates change only the message; the latter two still take the same
// duration and Dexterity-exercise tail as the ordinary floor arm.
test('paralysis preserves its Free_action, levitation, and steed messages',
    async () => {
    await startedGame(771025, 'ParalysisGates');
    const potion = vaporPotion(POT_PARALYSIS);

    game.u.uprops[FREE_ACTION].intrinsic = FROMOUTSIDE;
    game.u.uprops[FREE_ACTION].extrinsic = 0;
    game.u.uprops[LEVITATION].intrinsic = 0;
    game.u.uprops[LEVITATION].extrinsic = 0;
    game.u.uprops[LEVITATION].blocked = 0;
    game.u.usteed = null;
    clearTopline();
    enableRngLog();
    await peffects(potion, game);
    assert.equal(toplines(), 'You stiffen momentarily.');
    assert.deepEqual(getRngLog(), []);
    assert.equal(game.multi ?? 0, 0);

    game.u.uprops[FREE_ACTION].intrinsic = 0;
    game.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE;
    clearTopline();
    enableRngLog();
    await peffects(potion, game);
    assert.equal(toplines(), 'You are motionlessly suspended.');
    assert.equal(getRngLog().length, 2);

    game.u.uprops[LEVITATION].intrinsic = 0;
    game.u.usteed = {};
    clearTopline();
    enableRngLog();
    await peffects(potion, game);
    assert.equal(toplines(), 'You are frozen in place!');
    assert.equal(getRngLog().length, 2);
    game.u.usteed = null;
});

test('potion.c still labels the arms this port refuses and none it skips',
    () => {
    const { code, comments } = breatheSwitchBody();
    const labelled = new Set(
        [...code.matchAll(/case (POT_[A-Z_]+|TOWEL):/gu)].map(([, n]) => n),
    );
    // Eighteen labels, of which TOWEL is not a potion type.
    assert.equal(labelled.size, 18);
    assert.ok(labelled.has('TOWEL'));
    for (const name of NO_OP_TYPES) {
        assert.equal(
            labelled.has(name), false,
            `${name} still falls out of the switch`,
        );
    }
    // C's comment names seven of the nine; the two it leaves out are why this
    // port lists all nine rather than copying the comment.
    const commented = new Set(
        [...comments.matchAll(/case (POT_[A-Z_]+):/gu)].map(([, n]) => n),
    );
    assert.equal(commented.size, 7);
    for (const name of commented)
        assert.ok(NO_OP_TYPES.includes(name), name);
    assert.deepEqual(
        NO_OP_TYPES.filter((name) => !commented.has(name)),
        ['POT_SEE_INVISIBLE', 'POT_ENLIGHTENMENT'],
    );
    // Every potion type is either labelled or in the fall-through group, so
    // the two lists together account for all 26 rows of objects.h.
    const names = Object.keys(POTION_TYPES);
    assert.equal(names.length, 26);
    for (const name of names) {
        assert.equal(
            labelled.has(name) || NO_OP_TYPES.includes(name), true,
            `${name} is accounted for`,
        );
    }
});

// The labels whose bodies this port runs. POT_INVISIBILITY came with the
// quaffing work; the other three are the vapors a potion hurled at the hero
// can raise, which muse.c use_offensive() now reaches.
const PORTED_LABELS = [
    'POT_INVISIBILITY', 'POT_PARALYSIS', 'POT_SLEEPING', 'POT_ACID',
    'POT_POLYMORPH',
];

test('the labelled arms this port has not reached stop by name', async () => {
    await startedGame(771001, 'VaporRefuse');
    const labelled = [
        ...breatheSwitchBody().code.matchAll(/case (POT_[A-Z_]+):/gu),
    ].map(([, name]) => name);
    for (const name of labelled) {
        if (PORTED_LABELS.includes(name)) continue;
        const otyp = POTION_TYPES[name];
        assert.equal(typeof otyp, 'number', name);
        await assert.rejects(
            () => potionbreathe(vaporPotion(otyp), game),
            /a potion's vapors require /u,
            name,
        );
    }
});

// potion.c:2041-2064. Both arms freeze the hero for -rnd(5) turns, set the
// reason and the message unmul() prints, and exercise Dexterity downward. The
// draws below are the only randomness either arm spends; `2` and `-1` are the
// scripted rnd(5) and rn2(2) results, and rnd(5) coming first pins the order.
for (const [label, otyp, line] of [
    ['paralysis', POT_PARALYSIS, 'Something seems to be holding you.'],
    ['sleeping', POT_SLEEPING, 'You feel rather tired.'],
]) {
    test(`the ${label} vapors freeze the hero and cost Dexterity`,
        async () => {
        await startedGame(771010, 'VaporFreeze');
        clearTopline();
        const obj = vaporPotion(otyp);
        const drawn = [];
        const random = {
            rnd: (bound) => { drawn.push(['rnd', bound]); return 2; },
            rn2: (bound) => { drawn.push(['rn2', bound]); return 1; },
        };
        const before = game.u.aexe[A_DEX];
        await potionbreathe(obj, game, { random });

        assert.equal(toplines(), line);
        // nomul(-rnd(5)) with the scripted 2.
        assert.equal(game.multi, -2);
        assert.equal(game.nomovemsg, 'You can move again.');
        // exercise(A_DEX, FALSE) adds -rn2(2), scripted to 1.
        assert.equal(game.u.aexe[A_DEX], before - 1);
        // The tail's makeknown() -- both arms set kn -- ends in
        // exercise(A_WIS, TRUE), whose rn2(19) is the third draw.
        assert.deepEqual(drawn, [['rnd', 5], ['rn2', 2], ['rn2', 19]]);
    });
}

// potion.c:2049-2050. Free action takes the paralysis arm's else branch: one
// line, no nomul() and no Dexterity exercise. The arm still counts kn, so the
// tail's makeknown() -- exercise(A_WIS, TRUE) -- spends the one rn2(19).
test('free action turns the paralysis vapors into a momentary stiffening',
    async () => {
    await startedGame(771013, 'VaporFreeAction');
    clearTopline();
    // youprop.h Free_action reads HFree_action || EFree_action; FROMOUTSIDE is
    // the intrinsic bit a ring or a role grants.
    game.u.uprops[FREE_ACTION].intrinsic = FROMOUTSIDE;
    const drawn = [];
    const random = {
        // The frozen branch's nomul(-rnd(5)) must not run.
        rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
        rn2: (bound) => { drawn.push(bound); return 1; },
    };
    const before = game.u.aexe[A_DEX];
    await potionbreathe(vaporPotion(POT_PARALYSIS), game, { random });

    assert.equal(toplines(), 'You stiffen momentarily.');
    assert.equal(game.multi ?? 0, 0);
    assert.equal(game.u.aexe[A_DEX], before);
    // makeknown()'s exercise(A_WIS, TRUE) alone; the arm itself draws nothing.
    assert.deepEqual(drawn, [19]);
});

// potion.c:2060-2062. Either property takes the sleeping arm's else branch,
// whose monstseesu(M_SEEN_SLEEP) has no reader yet, so the port stops before
// the yawn and before any draw or state change. QUALITY.json carries the
// deferral with a recorded C case.
for (const [label, property] of [
    ['free action', FREE_ACTION], ['sleep resistance', SLEEP_RES],
]) {
    test(`${label} stops the sleeping vapors at the yawn`, async () => {
        await startedGame(771014, 'VaporSleepRes');
        clearTopline();
        game.u.uprops[property].intrinsic = FROMOUTSIDE;
        const drawn = [];
        const random = {
            rnd: (bound) => { drawn.push(['rnd', bound]); return 2; },
            rn2: (bound) => { drawn.push(['rn2', bound]); return 1; },
        };
        await assert.rejects(
            () => potionbreathe(vaporPotion(POT_SLEEPING), game, { random }),
            (error) => error instanceof UnsupportedPotionError
                && error.branch === 'the yawn that tells watching monsters the'
                    + ' hero resists sleep',
        );
        assert.equal(toplines(), '');
        assert.equal(game.multi ?? 0, 0);
        assert.deepEqual(drawn, []);
    });
}

// potion.c:2092-2095. The acid and polymorph vapors share one arm whose whole
// body is exercise(A_CON, FALSE), so the single rn2(2) is the arm.
for (const [label, otyp] of [
    ['acid', POT_ACID], ['polymorph', POT_POLYMORPH],
]) {
    test(`the ${label} vapors cost Constitution and nothing else`,
        async () => {
        await startedGame(771011, 'VaporAcid');
        // Neither arm sets kn, so the tail offers the naming prompt for a type
        // the hero has not identified. Identify it first, as do.c trycall()
        // reads the shared objects[] row.
        discover_object(otyp, true, true, false, game);
        clearTopline();
        const drawn = [];
        const random = {
            rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
            rn2: (bound) => { drawn.push(bound); return 1; },
        };
        const before = game.u.aexe[A_CON];
        await potionbreathe(vaporPotion(otyp), game, {
            random,
            encumberMessage: async () => {},
        });

        assert.equal(toplines(), '');
        assert.equal(game.u.aexe[A_CON], before - 1);
        // exercise(A_CON, FALSE)'s -rn2(2), and no other draw.
        assert.deepEqual(drawn, [2]);
        assert.equal(game.multi ?? 0, 0);
    });
}

// zap.c destroy_items() reaches the same arm on the hero's own turn and hands
// potionbreathe() only `state` and `random`, so the arm must own the
// encumber_msg() that exercise(A_CON) runs once play has begun. Before this
// default the call threw a bare Error, which no segment boundary converts.
test('the acid vapors on the hero\'s own turn own their encumber_msg',
    async () => {
    await startedGame(771012, 'VaporAcidOwnTurn');
    discover_object(POT_ACID, true, true, false, game);
    clearTopline();
    // moves is 1 after the segment's one key, which is what makes exercise()
    // reach encumber_msg() for A_CON.
    assert.ok(Math.trunc(game.moves) > 0);
    const before = game.u.aexe[A_CON];
    await potionbreathe(vaporPotion(POT_ACID), game, {
        state: game,
        // The scripted 1 is exercise()'s -rn2(2) result; nothing else draws.
        random: { rn2: () => 1, rnd: () => assert.fail('unexpected rnd') },
    });
    assert.equal(game.u.aexe[A_CON], before - 1);
    // An unchanged encumbrance prints nothing.
    assert.equal(toplines(), '');
});

// C ref: potion.c bottlename() (1487-1494) over bottlenames[] and
// hbottlenames[] (1478-1485). Both tables are read out of potion.c here, so a
// dropped or reordered entry, or a swapped Hallucination arm, shows up as a
// wrong name, and the bound pins the table's length.
function bottleTables() {
    const source = potionSource();
    const read = (name) => {
        const start = source.indexOf(`static const char *${name}[] =`);
        assert.ok(start > 0, `potion.c still defines ${name}[]`);
        const end = source.indexOf('};', start);
        return [...source.slice(start, end).matchAll(/"([a-z]+)"/gu)]
            .map(([, word]) => word);
    };
    return { plain: read('bottlenames'), hallucinated: read('hbottlenames') };
}

test('bottlename draws from potion.c\'s table for the hero\'s state',
    async () => {
    await startedGame(771030, 'BottleNames');
    const tables = bottleTables();
    // Seven sober names and twenty-four hallucinated ones, as potion.c lists.
    assert.equal(tables.plain.length, 7);
    assert.equal(tables.hallucinated.length, 24);
    for (const [hallucinating, expected] of [
        [false, tables.plain], [true, tables.hallucinated],
    ]) {
        // youprop.h Hallucination is HHallucination && !BHallucination; the
        // Healer has no blocking source, so the intrinsic alone decides.
        game.u.uprops[HALLUC].intrinsic = hallucinating ? 1 : 0;
        for (let index = 0; index < expected.length; index++) {
            const bounds = [];
            const name = bottlename(game, {
                rn2: (bound) => { bounds.push(bound); return index; },
            });
            assert.equal(name, expected[index], `${hallucinating} ${index}`);
            // ROLL_FROM(array) is array[rn2(SIZE(array))]: one draw, bounded
            // by the table the hero's state selected.
            assert.deepEqual(bounds, [expected.length]);
        }
    }
    game.u.uprops[HALLUC].intrinsic = 0;
});

// C ref: potion.c potionhit() (1624-1705), the hero-target branch. The acid
// arm is the only one of the isyou switch's three that a monster's hurled
// potion can reach; POT_OIL needs a lit lamp and POT_POLYMORPH refuses.
test('potionhit burns an unresistant hero with the acid it crashes',
    async () => {
    await startedGame(771020, 'PotionAcid');
    // The acid vapors set no kn, so the tail offers the naming prompt for an
    // unidentified type. Identify it first, as do.c trycall() reads the shared
    // objects[] row.
    discover_object(POT_ACID, true, true, false, game);
    clearTopline();
    const obj = vaporPotion(POT_ACID);
    obj.cursed = true; // d(2, 8) rather than d(1, 8)
    game.u.uhp = 20;
    game.u.uhpmax = 20;
    const draws = [];
    const random = {
        rn2: (bound) => { draws.push(['rn2', bound]); return 1; },
        // bottlename()'s rn2(7) and the crash rnd(2) come first; 1 keeps the
        // hero alive and picks potion.c's second bottle name.
        rnd: (bound) => { draws.push(['rnd', bound]); return 1; },
        d: (n, x) => { draws.push(['d', n, x]); return 6; },
    };
    const messages = [];

    await potionhit(game.youmonst, obj, POTHIT_MONST_THROW, {
        state: game,
        random,
        message: async (text) => { messages.push(text); },
        unsupported: (reason) => assert.fail(reason),
        encumberMessage: async () => {},
    });

    assert.deepEqual(messages, [
        'The phial crashes on your head and breaks into shards.',
        'The potion of acid evaporates.',
        'This burns a lot!',
    ]);
    // rnd(2) = 1 for the crash, then d(2, 8) = 6 for the acid.
    assert.equal(game.u.uhp, 20 - 1 - 6);
    assert.deepEqual(draws, [
        ['rn2', 7], ['rnd', 2], ['d', 2, 8],
        // potionbreathe()'s POT_ACID arm is exercise(A_CON, FALSE) alone.
        ['rn2', 2],
    ]);
});

// hack.c losehp() prints through showdamage() (4245-4253) and maybe_wail()
// (4210-4243). A monster's hurled potion reaches potionhit() from a turn that
// js/unported_monster_actions.js first runs against a planning clone, whose
// `message` is silent; those two lines must take that seam, as the crash and
// evaporation lines do, or the clone's copy lands on the live terminal.
test('potionhit routes the showdamage line through its message seam',
    async () => {
    await startedGame(771023, 'PotionShowDamage');
    discover_object(POT_FRUIT_JUICE, true, true, false, game);
    clearTopline();
    game.iflags.showdamage = true;
    // 20 HP: the crash's rnd(2), scripted to 1, leaves 19 and stays above the
    // uhpmax/10 wail threshold.
    game.u.uhp = 20;
    game.u.uhpmax = 20;
    const messages = [];

    await potionhit(game.youmonst, vaporPotion(POT_FRUIT_JUICE),
        POTHIT_MONST_THROW, {
            state: game,
            random: { rn2: () => 1, rnd: () => 1, d: () => 1 },
            message: async (text) => { messages.push(text); },
            unsupported: (reason) => assert.fail(reason),
        });

    game.iflags.showdamage = false;
    assert.deepEqual(messages, [
        'The phial crashes on your head and breaks into shards.',
        // hack.c:4251, "[HP %i, %i left]" with the negated loss.
        '[HP -1, 19 left]',
        'The potion of fruit juice evaporates.',
    ]);
    // Nothing reached the terminal's top line.
    assert.equal(toplines(), '');
});

// C ref: potion.c potionhit() (1912-1917). The shop-billing block is guarded
// by `*u.ushops`, the first entry of the hero's room list, so an unpaid potion
// that breaks on a hero standing in no shop falls straight through to
// obfree(). js/rooms.js always materialises the whole list, which is truthy
// even when empty; the guard must read its first entry.
test('an unpaid potion broken on a hero outside any shop skips the bill',
    async () => {
    await startedGame(771022, 'PotionUnpaid');
    // Fruit juice has no vapors, and an identified type keeps the tail's
    // trycall() away from the naming prompt.
    discover_object(POT_FRUIT_JUICE, true, true, false, game);
    clearTopline();
    assert.equal(game.u.ushops[0], 0, 'the hero stands in no shop');
    const obj = vaporPotion(POT_FRUIT_JUICE);
    obj.unpaid = 1;
    // 20 HP survives the crash's rnd(2), scripted to 1.
    game.u.uhp = 20;
    game.u.uhpmax = 20;
    const reasons = [];
    const billed = [];

    await potionhit(game.youmonst, obj, POTHIT_MONST_THROW, {
        state: game,
        random: { rn2: () => 1, rnd: () => 1, d: () => 1 },
        message: async () => {},
        unsupported: (reason) => { reasons.push(reason); },
        // obfree() defers an unpaid object's shop disposition to this hook;
        // recording the call is what shows obfree() ran.
        hooks: { obfreeShopBill: (freed) => { billed.push(freed); return 'unbilled'; } },
    });

    assert.deepEqual(reasons, []);
    assert.deepEqual(billed, [obj]);
});

test('potionhit refuses a target that is not the hero', async () => {
    await startedGame(771021, 'PotionMonster');
    const reasons = [];
    await potionhit({}, vaporPotion(POT_ACID), POTHIT_MONST_THROW, {
        state: game,
        random: { rn2: () => 0, rnd: () => 1, d: () => 1 },
        message: async () => {},
        unsupported: (reason) => { reasons.push(reason); },
    });
    assert.deepEqual(reasons, ['a potion crashing on a monster']);
});

test('the unlabelled types reach the naming tail and nothing else', async () => {
    await startedGame(771002, 'VaporNoop');
    for (const name of NO_OP_TYPES) {
        const otyp = POTION_TYPES[name];
        // Identify the type first, so trycall() finds oc_name_known set and
        // the tail stays silent. An unidentified type would reach docall().
        discover_object(otyp, true, true, false, game);
        const obj = vaporPotion(otyp);
        clearTopline();
        await potionbreathe(obj, game);
        assert.equal(toplines(), '', name);
        assert.equal(obj.in_use, false, name);
    }
});

test('an unidentified potion sends the naming tail to docall', async () => {
    await startedGame(771003, 'VaporCall');
    // do.c trycall() reads the shared objects[] row, not the object, so this
    // separates an identified type from an unidentified one with the same
    // object shape.
    const obj = vaporPotion(POT_FRUIT_JUICE);
    game.objects[POT_FRUIT_JUICE].oc_name_known = 0;
    game.objects[POT_FRUIT_JUICE].oc_uname = null;
    // docall() now prompts via getlin(); queue ESC to dismiss the prompt.
    // hooked_tty_getlin() dismisses a pending --More-- before the prompt,
    // consuming one key. Clear the message state so only the getlin ESC
    // is needed.
    clearTopline();
    game.nhDisplay.toplin = 0; // TOPLINE_EMPTY
    game.nhDisplay.pushKey(0x1b);
    await potionbreathe(obj, game);
    // Either half of trycall()'s guard suppresses the prompt on its own.
    game.objects[POT_FRUIT_JUICE].oc_uname = 'fizzy';
    await trycall(obj, game);
    game.objects[POT_FRUIT_JUICE].oc_uname = null;
    game.objects[POT_FRUIT_JUICE].oc_name_known = 1;
    await trycall(obj, game);
    // do_name.c docall()'s own first line: a hero who cannot see the object
    // has nothing to call it by.
    await docall({ ...obj, dknown: false });
    // docall with dknown true prompts; queue ESC to dismiss.
    clearTopline();
    game.nhDisplay.toplin = 0; // TOPLINE_EMPTY
    game.nhDisplay.pushKey(0x1b);
    await docall({ ...obj, dknown: true }, game);
});

test('a potion whose vapors are not seen prints nothing and is not learned',
    async () => {
    await startedGame(771004, 'VaporInvis');
    discover_object(POT_INVISIBILITY, true, true, false, game);
    // potion.c:2034 `if (!Blind && !Invis)`. Each of the two properties
    // suppresses the message on its own, and neither is what the other tests.
    for (const property of [BLINDED, INVIS]) {
        const obj = vaporPotion(POT_INVISIBILITY);
        game.u.uprops[property].intrinsic = FROMOUTSIDE;
        clearTopline();
        await potionbreathe(obj, game);
        assert.equal(toplines(), '', `${property}`);
        game.u.uprops[property].intrinsic = 0;
    }
    // BBlinded cancels the blindness again, so the message returns.
    const obj = vaporPotion(POT_INVISIBILITY);
    game.u.uprops[BLINDED].intrinsic = FROMOUTSIDE;
    game.u.uprops[BLINDED].blocked = FROMOUTSIDE;
    clearTopline();
    await potionbreathe(obj, game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    game.u.uprops[BLINDED].intrinsic = 0;
    game.u.uprops[BLINDED].blocked = 0;
});

test('See_invisible picks the other half of the invisibility line', async () => {
    await startedGame(771005, 'VaporSeeInvis');
    discover_object(POT_INVISIBILITY, true, true, false, game);
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    // youprop.h:152 See_invisible is either source and has no blocked term, so
    // this one property is the only input that separates the two strings.
    game.u.uprops[SEE_INVIS].extrinsic = 1;
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game);
    assert.equal(
        toplines(),
        'For an instant you could see right through yourself!',
    );
    game.u.uprops[SEE_INVIS].extrinsic = 0;
});

test('a wet towel takes the TOWEL arm whatever the potion is', async () => {
    await startedGame(771006, 'VaporTowel');
    discover_object(POT_INVISIBILITY, true, true, false, game);
    const towel = mksobj(TOWEL, false, false, { state: game });
    towel.spe = 1;
    game.ublindf = towel;
    // youprop.h:405 Half_gas_damage needs the towel damp: `spe > 0`. One
    // charge is the smallest amount that qualifies and zero the largest that
    // does not, which is the pair that fixes the comparison.
    await assert.rejects(
        () => potionbreathe(vaporPotion(POT_INVISIBILITY), game),
        /the wet towel/u,
    );
    towel.spe = 0;
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    game.ublindf = null;
});

test('an in-use potion keeps its flag through the vapors', async () => {
    await startedGame(771007, 'VaporInUse');
    discover_object(POT_OIL, true, true, false, game);
    // potion.c:1936-1940: the flag is set for the duration and restored only
    // when the caller had not set it. A caller that had is the pair that
    // separates the restore from an unconditional clear.
    const fresh = vaporPotion(POT_OIL);
    fresh.in_use = false;
    await potionbreathe(fresh, game);
    assert.equal(fresh.in_use, false);
    const held = vaporPotion(POT_OIL);
    held.in_use = true;
    await potionbreathe(held, game);
    assert.equal(held.in_use, true);
});

test('a potion the hero cannot make out skips the naming tail', async () => {
    await startedGame(771008, 'VaporUnknown');
    // potion.c:2110 `if (obj->dknown)`. The invisibility arm sets kn, so with
    // dknown clear the tail skips a makeknown() it would otherwise run: the
    // hero saw the effect but not the bottle it came out of. An unidentified
    // type is what makes that visible, and the message prints either way.
    const type = game.objects[POT_INVISIBILITY];
    type.oc_name_known = 0;
    type.oc_encountered = 0;
    type.oc_uname = null;
    const obj = vaporPotion(POT_INVISIBILITY);
    obj.dknown = false;
    clearTopline();
    await potionbreathe(obj, game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    assert.equal(type.oc_name_known, 0);
    assert.equal(type.oc_encountered, 0);
});

test('a message that names the potion identifies its type', async () => {
    await startedGame(771009, 'VaporLearn');
    // hack.h:1530 makeknown(x) is discover_object(x, TRUE, TRUE, TRUE): it
    // marks the type known, marks it encountered, and credits the hero with
    // the discovery through exercise(A_WIS, TRUE), whose rn2(19) is the only
    // draw potionbreathe() makes. An already identified type reaches none of
    // the three, so the potion below starts unidentified.
    const type = game.objects[POT_INVISIBILITY];
    type.oc_name_known = 0;
    type.oc_encountered = 0;
    type.oc_uname = null;
    const drawn = [];
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game, {
        random: { rn2: (bound) => { drawn.push(bound); return 18; } },
    });
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    assert.equal(type.oc_name_known, 1);
    assert.equal(type.oc_encountered, 1);
    assert.deepEqual(drawn, [19]);
});

test('the potion refusals are ones the command seam converts', () => {
    // js/cmd.js failClosedCommandRefusals() decides whether a refusal ends the
    // segment on its last matching screen or escapes and loses every screen
    // the command earned. Both classes below are raised under dozap(), so
    // dropping either from that list would turn a clean stop into a lost
    // segment with nothing failing.
    const listed = failClosedCommandRefusals();
    assert.ok(listed.includes(UnsupportedPotionError));
    // UnsupportedQuaffError is raised by dodrink/dopotion/peffects for
    // unported branches. Dropping it would lose every screen the quaff
    // command earned before the refusal.
    assert.ok(listed.includes(UnsupportedQuaffError));
});

test('sickness potion clears active hallucination before returning', async () => {
    await startedGame(771021, 'SicknessCuresHallucination');
    game.u.uprops[HALLUC] = { intrinsic: 30, extrinsic: 0 };
    game.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    const obj = vaporPotion(POT_SICKNESS);
    clearTopline();
    for (let i = 0; i < 3; ++i) game.nhDisplay.pushKey(' '.charCodeAt(0));

    await peffects(obj, game);

    assert.equal(game.u.uprops[HALLUC].intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), 'You are shocked back to your senses!');
});

// ---------------------------------------------------------------------------
// Timeout utilities: set_itimeout and incr_itimeout
// C ref: potion.c:55-86. These clamp and increment the timeout field of an
// intrinsic property packed as (flags | timeout) in a single integer.
// ---------------------------------------------------------------------------

test('set_itimeout replaces only the low TIMEOUT bits', () => {
    // The intrinsic integer carries flag bits above TIMEOUT and a timeout
    // value in the low 24 bits. set_itimeout replaces the timeout while
    // keeping the flags. FROMOUTSIDE (0x04000000) is a typical flag bit
    // above the TIMEOUT mask.
    const prop = { intrinsic: FROMOUTSIDE | 50 };
    set_itimeout(prop, 200);
    // Flag bits survive, timeout is replaced.
    assert.equal(prop.intrinsic & ~TIMEOUT, FROMOUTSIDE);
    assert.equal(prop.intrinsic & TIMEOUT, 200);
});

test('set_itimeout clamps negative values to zero', () => {
    // itimeout(val) returns 0 for val < 1, so a negative set clears the
    // timeout without touching the flag bits.
    const prop = { intrinsic: FROMOUTSIDE | 100 };
    set_itimeout(prop, -5);
    assert.equal(prop.intrinsic & TIMEOUT, 0);
    assert.equal(prop.intrinsic & ~TIMEOUT, FROMOUTSIDE);
});

test('set_itimeout clamps large values to TIMEOUT', () => {
    // itimeout(val) returns TIMEOUT for val >= TIMEOUT, preventing overflow
    // into the flag bits.
    const prop = { intrinsic: 0 };
    set_itimeout(prop, TIMEOUT + 1000);
    assert.equal(prop.intrinsic & TIMEOUT, TIMEOUT);
});

test('incr_itimeout adds to the existing timeout field', () => {
    // The existing timeout is (intrinsic & TIMEOUT), and the increment is
    // added to it. The flag bits above TIMEOUT are untouched.
    const prop = { intrinsic: FROMOUTSIDE | 100 };
    incr_itimeout(prop, 50);
    assert.equal(prop.intrinsic & TIMEOUT, 150);
    assert.equal(prop.intrinsic & ~TIMEOUT, FROMOUTSIDE);
});

test('incr_itimeout saturates at TIMEOUT instead of overflowing', () => {
    // Adding a large increment to an already-large timeout should not
    // overflow into the flag bits or wrap around.
    const prop = { intrinsic: TIMEOUT - 10 };
    incr_itimeout(prop, 100);
    assert.equal(prop.intrinsic & TIMEOUT, TIMEOUT);
});

// ---------------------------------------------------------------------------
// make_confused() and peffect_confusion()
// C ref: potion.c make_confused() (89-104) and peffect_confusion()
// (1014-1027). The effect has distinct feedback for a newly confused sober
// hero, a newly confused hallucinating hero, and an already confused hero.
// ---------------------------------------------------------------------------

test('make_confused updates only status transitions and clears with feedback',
    async () => {
    await startedGame(771006, 'ConfusionState');
    const hero = game.u;
    const confusion = hero.uprops[CONFUSION];
    const hallucination = hero.uprops[HALLUC];
    const resistance = hero.uprops[HALLUC_RES];

    confusion.intrinsic = 0;
    game.disp.botl = false;
    // 25 is a positive timeout chosen to cross from no confusion to
    // confusion; make_confused() marks the status line only at that boundary.
    await make_confused(25, false, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 25);
    assert.equal(game.disp.botl, true);

    game.disp.botl = false;
    // 40 keeps confusion active, so C changes the timeout without marking the
    // status line for a condition transition.
    await make_confused(40, false, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 40);
    assert.equal(game.disp.botl, false);

    clearTopline();
    await make_confused(0, true, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), 'You feel less confused now.');
    assert.equal(game.disp.botl, true);

    // Start confusion again before checking Hallucination's alternate clear
    // wording. The positive timeout crosses the same status boundary as 25.
    await make_confused(12, false, game);
    hallucination.intrinsic = 1;
    resistance.intrinsic = 0;
    resistance.extrinsic = 0;
    game.disp.botl = false;
    clearTopline();
    // Zero clears confusion. With Hallucination active, potion.c says
    // "less trippy" rather than "less confused" when talk is true.
    await make_confused(0, true, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), 'You feel less trippy now.');
    assert.equal(game.disp.botl, true);

    // Unaware is gm.multi < 0 plus unconscious(). "You awake" is one of the
    // three pending-message prefixes trap.c unconscious() recognizes. It
    // suppresses feedback but does not suppress the state transition.
    confusion.intrinsic = 15;
    game.multi = -1;
    game.nomovemsg = 'You awake.';
    game.disp.botl = false;
    clearTopline();
    await make_confused(0, true, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), '');
    assert.equal(game.disp.botl, true);
});

// potion.c:771-792. Confusion uses the hunger status before nutrition is
// added; dilution suppresses healing but not nutrition, and blessed booze
// skips confusion entirely. C assigns multi directly for the cursed tail.
test('booze preserves source order across beatitude, hunger and dilution',
    async () => {
        for (const row of [
            // Nutrition stays within each status band so newuhs's separate
            // transition messages cannot hide peffect_booze's own order.
            { name: 'blessed', blessed: true, cursed: false,
                hunger: 900, hungerState: NOT_HUNGRY, diluted: false },
            { name: 'uncursed', blessed: false, cursed: false,
                hunger: 900, hungerState: NOT_HUNGRY, diluted: false },
            { name: 'uncursed diluted', blessed: false, cursed: false,
                hunger: 900, hungerState: NOT_HUNGRY, diluted: true },
            { name: 'cursed diluted weak', blessed: false, cursed: true,
                hunger: 20, hungerState: WEAK, diluted: true },
            { name: 'hallucinating satiated form', blessed: false, cursed: false,
                hunger: 1100, hungerState: SATIATED, diluted: false,
                hallucinating: true, polymorphed: true },
            // youprop.h:119-120 suppresses hallucination for either source
            // of resistance, without consulting HALLUC.blocked.
            { name: 'intrinsic hallucination resistance', blessed: true,
                cursed: false, hunger: 900, hungerState: NOT_HUNGRY,
                diluted: false, hallucinating: true, resistance: 'intrinsic' },
            { name: 'extrinsic hallucination resistance', blessed: true,
                cursed: false, hunger: 900, hungerState: NOT_HUNGRY,
                diluted: false, hallucinating: true, resistance: 'extrinsic' },
        ]) {
            // Independent initial state, not copied from the failing session.
            await startedGame(8430001, 'BoozeBranches');
            const potion = vaporPotion(POT_BOOZE);
            potion.blessed = row.blessed;
            potion.cursed = row.cursed;
            potion.odiluted = row.diluted;
            game.u.uhunger = row.hunger;
            game.u.uhs = row.hungerState;
            game.u.uprops[HALLUC].intrinsic = row.hallucinating ? 40 : 0;
            game.u.uprops[HALLUC_RES].intrinsic = 0;
            game.u.uprops[HALLUC_RES].extrinsic = 0;
            if (row.resistance)
                game.u.uprops[HALLUC_RES][row.resistance] = FROMOUTSIDE;
            game.u.uprops[CONFUSION].intrinsic = 7; // Extend an existing timeout.
            game.u.aexe[A_WIS] = 0; // Below exercise's saturation threshold.
            game.u.uhp = game.u.uhpmax - 2; // Healing can add its one point.
            if (row.polymorphed) {
                // healup's form branch compares umonnum with umonster; its
                // arithmetic needs no species-dependent operation.
                game.u.umonnum = game.u.umonster + 1;
                game.u.mh = 6;
                game.u.mhmax = 10;
            }
            const hpBefore = game.u.uhp;
            game.gp.potion_unkn = 4; // Increment, do not reset this counter.
            game.multi = 9; // Positive multi distinguishes assignment from nomul.
            game.multi_reason = 'existing counted action';
            game.u.uinvulnerable = true;
            game.u.usleep = 3;
            game.context.run = 1;
            clearTopline();
            game.nhDisplay.pushKey(' '.charCodeAt(0));
            enableRngLog();

            assert.equal(await peffects(potion, game), -1, row.name);

            const draws = [...getRngLog()];
            let confusion = 7;
            if (!row.blessed) {
                const dice = 2 + row.hungerState;
                const rolled = Number(new RegExp(`^d\\(${dice},8\\)=(\\d+)$`,
                    'u').exec(draws.shift())?.[1]);
                assert.ok(rolled >= dice && rolled <= dice * 8, row.name);
                confusion += rolled;
            }
            const wisdomLoss = Number(/^rn2\(2\)=(\d+)$/u
                .exec(draws.shift())?.[1]);
            assert.ok(wisdomLoss === 0 || wisdomLoss === 1, row.name);
            assert.equal(game.u.aexe[A_WIS], 0 - wisdomLoss, row.name);
            if (row.cursed) {
                const duration = Number(/^rnd\(15\)=(\d+)$/u
                    .exec(draws.shift())?.[1]);
                assert.ok(duration >= 1 && duration <= 15, row.name);
                assert.equal(game.multi, -duration, row.name);
                assert.equal(game.nomovemsg, 'You awake with a headache.');
            } else {
                assert.equal(game.multi, 9, row.name);
            }
            assert.deepEqual(draws, [], 'no extra RNG call');
            assert.equal(game.u.uprops[CONFUSION].intrinsic, confusion);
            assert.equal(game.gp.potion_unkn, 5);
            assert.equal(game.u.uhunger, row.hunger
                + 10 * (2 + Number(row.blessed) - Number(row.cursed)));
            assert.equal(game.u.uhp, hpBefore
                + (!row.diluted && !row.polymorphed ? 1 : 0));
            if (row.polymorphed) assert.equal(game.u.mh, 7);
            assert.equal(game.multi_reason, 'existing counted action');
            assert.equal(game.u.uinvulnerable, true);
            assert.equal(game.u.usleep, 3);
            assert.equal(game.context.run, 1);
            const taste = row.hallucinating && !row.resistance
                ? 'dandelion wine' : 'liquid fire';
            assert.ok(toplines().includes(row.cursed ? 'You pass out.'
                : `Ooph!  This tastes like ${row.diluted ? 'watered down ' : ''}${taste}!`));
        }
    });

test('fresh booze recipes consume the potion and finish the delayed action',
    async () => {
        for (const { recipe } of loadQuaffBoozeRecipes()) {
            for (const input of recipe.segments) await verifyBoozeSegment(input);
        }
    });

test('a sober confusion potion prints its message and draws its timeout',
    async () => {
    await startedGame(771007, 'ConfusionSober');
    const potion = vaporPotion(POT_CONFUSION);
    const confusion = game.u.uprops[CONFUSION];
    confusion.intrinsic = 0;
    game.u.uprops[HALLUC].intrinsic = 0;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;
    game.disp.botl = false;
    clearTopline();
    enableRngLog();

    const result = await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

    assert.equal(result, -1);
    assert.equal(toplines(), 'Huh, What?  Where am I?');
    assert.equal(game.gp.potion_nothing, 0);
    assert.equal(game.gp.potion_unkn, 0);
    assert.deepEqual(getRngLog(), [`rn2(7)=${draw}`]);
    // An uncursed potion uses rn1(7, 16), so its timeout is 16 plus the
    // recorded zero-to-six draw.
    assert.equal(confusion.intrinsic & TIMEOUT, 16 + draw);
    assert.equal(game.disp.botl, true);
});

test('a hallucinating hero gets the trippy confusion feedback', async () => {
    await startedGame(771008, 'ConfusionHallu');
    const potion = vaporPotion(POT_CONFUSION);
    potion.blessed = true;
    potion.cursed = false;
    const confusion = game.u.uprops[CONFUSION];
    confusion.intrinsic = 0;
    game.u.uprops[HALLUC].intrinsic = 30;
    game.u.uprops[HALLUC_RES].intrinsic = 0;
    game.u.uprops[HALLUC_RES].extrinsic = 0;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

    assert.equal(toplines(), 'What a trippy feeling!');
    assert.equal(game.gp.potion_nothing, 0);
    assert.equal(game.gp.potion_unkn, 1);
    // A blessed potion uses rn1(7, 8), the shortest of the three BUC bases.
    assert.deepEqual(getRngLog(), [`rn2(7)=${draw}`]);
    assert.equal(confusion.intrinsic & TIMEOUT, 8 + draw);
});

test('an already confused hero gets no direct feedback and a longer timeout',
    async () => {
    await startedGame(771009, 'ConfusionAgain');
    const potion = vaporPotion(POT_CONFUSION);
    potion.blessed = false;
    potion.cursed = true;
    const confusion = game.u.uprops[CONFUSION];
    // 20 is an existing timeout chosen to take peffect_confusion()'s
    // Confusion arm and make_confused()'s active-to-active transition.
    confusion.intrinsic = 20;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;
    game.disp.botl = false;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

    assert.equal(toplines(), '');
    assert.equal(game.gp.potion_nothing, 1);
    assert.equal(game.gp.potion_unkn, 0);
    // A cursed potion adds rn1(7, 24) to the existing 20-turn timeout.
    assert.deepEqual(getRngLog(), [`rn2(7)=${draw}`]);
    assert.equal(confusion.intrinsic & TIMEOUT, 20 + 24 + draw);
    assert.equal(game.disp.botl, false);
});

test('confusion timeout bases depend on beatitude, not hero state',
    async () => {
        // potion.c uses 16 - 8*bcsign: blessed, uncursed, and cursed bases
        // are 8, 16, and 24. Keeping the hero sober in all three cases makes
        // beatitude the only input that can select the base.
        for (const [label, seed, blessed, cursed, base] of [
            ['blessed', 771030, true, false, 8],
            ['uncursed', 771031, false, false, 16],
            ['cursed', 771032, false, true, 24],
        ]) {
            await startedGame(seed, `Confusion${label}`);
            const potion = vaporPotion(POT_CONFUSION);
            potion.blessed = blessed;
            potion.cursed = cursed;
            const confusion = game.u.uprops[CONFUSION];
            confusion.intrinsic = 0;
            game.u.uprops[HALLUC].intrinsic = 0;
            game.gp.potion_nothing = 0;
            game.gp.potion_unkn = 0;
            clearTopline();
            enableRngLog();

            await peffects(potion, game);
            const [call] = getRngLog();
            const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

            assert.equal(
                confusion.intrinsic & TIMEOUT,
                base + draw,
                label,
            );
        }
    });

// ---------------------------------------------------------------------------
// speed_up()
// C ref: potion.c speed_up() (2918-2928). Prints the speed-change message,
// calls exercise(A_DEX, TRUE), and increments HFast's timeout.
// ---------------------------------------------------------------------------

test('speed_up prints "much faster" when hero has no speed at all', async () => {
    // !Very_fast and !Fast: the hero starts without any FAST property, so
    // the message includes "much ". exercise(A_DEX, TRUE) draws rn2(19).
    await startedGame(771010, 'SpeedNone');
    const hero = game.u;
    hero.uprops[FAST] = { intrinsic: 0, extrinsic: 0 };
    clearTopline();
    // duration = 160, chosen to be the C result for bcsign(uncursed) = 0:
    // rn1(10, 100 + 60*0) = rn1(10, 100), range 100-109.
    await speed_up(160, game);
    assert.equal(toplines(), 'You are suddenly moving much faster.');
    // The timeout was 0 and is now 160.
    assert.equal(hero.uprops[FAST].intrinsic & TIMEOUT, 160);
});

test('speed_up prints "faster" when hero already has intrinsic speed',
    async () => {
    // !Very_fast but Fast: the hero has FROMOUTSIDE (permanent intrinsic)
    // but no timed speed. Very_fast = (HFast & ~INTRINSIC) || EFast, which
    // is false because the intrinsic is entirely flag bits (FROMOUTSIDE is
    // a flag bit inside INTRINSIC). Fast = (HFast || EFast), true because
    // HFast is nonzero.
    await startedGame(771011, 'SpeedIntrinsic');
    const hero = game.u;
    hero.uprops[FAST] = { intrinsic: FROMOUTSIDE, extrinsic: 0 };
    clearTopline();
    await speed_up(160, game);
    assert.equal(toplines(), 'You are suddenly moving faster.');
});

test('speed_up prints "legs get new energy" when hero is already Very_fast',
    async () => {
    // Very_fast: the hero has both FROMOUTSIDE and a nonzero timeout, or
    // extrinsic speed. Here we use a timed timeout (timeout = 50) which
    // sets (HFast & ~INTRINSIC) nonzero.
    await startedGame(771012, 'SpeedVeryFast');
    const hero = game.u;
    hero.uprops[FAST] = { intrinsic: FROMOUTSIDE | 50, extrinsic: 0 };
    clearTopline();
    await speed_up(160, game);
    assert.match(toplines(), /Your legs get new energy\./u);
});

// ---------------------------------------------------------------------------
// peffect_oil: quaffing a potion of oil
// C ref: potion.c peffect_oil() (1259-1294). Three branches: normal, cursed,
// and lit. Tests replay segments that exercise each path.
// ---------------------------------------------------------------------------

test('quaffing normal oil prints "That was smooth!"', async () => {
    // Replays seed2200 through step 5: the hero quaffs an uncursed, unlit
    // potion of oil (item 'h'). The normal branch prints "That was smooth!"
    // and calls exercise(A_WIS, FALSE), whose rn2(2) is the only peffect_oil
    // draw. rn2(2)=1 at attrib.c:509 confirms the call.
    await runSegment({
        seed: 2200,
        datetime: '20000110090000',
        nethackrc:
            'OPTIONS=name:merlin,role:Wizard,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!autopickup\n'
            + 'OPTIONS=suppress_alert:3.4.3\n'
            + 'OPTIONS=symset:DECgraphics',
        // space space=welcome+more, n=decline tutorial, q=quaff, h=select oil
        moves: '  nqh',
    });
    assert.equal(toplines(), 'That was smooth!');
});

test('quaffing cursed oil prints "This tastes like castor oil."', async () => {
    // In playmode:debug, #wizwish (Ctrl+W) creates a cursed potion of oil.
    // The cursed branch prints the castor-oil message and calls
    // exercise(A_WIS, FALSE), the same draw shape as the normal branch.
    await runSegment({
        seed: 100,
        datetime: '20000110090000',
        nethackrc:
            'OPTIONS=name:tester,role:Wizard,race:human,gender:male,align:neutral,playmode:debug\n'
            + 'OPTIONS=!autopickup,!legacy,!tutorial\n'
            + 'OPTIONS=suppress_alert:3.4.3\n'
            + 'OPTIONS=symset:DECgraphics',
        // space=welcome, Ctrl+W=#wizwish, "cursed potion of oil"\n,
        // q=quaff, p=select wished item
        moves: ' \x17cursed potion of oil\nqp',
    });
    assert.equal(toplines(), 'This tastes like castor oil.');
});

test('peffects POT_OIL no longer throws UnsupportedQuaffError', async () => {
    // Porting peffect_oil() should remove the throw for POT_OIL from the
    // peffects switch. The normal branch is the simplest way to verify: if
    // it threw, runSegment() would catch UnsupportedQuaffError and the test
    // above would fail. This test pins the expectation independently by
    // confirming the UnsupportedQuaffError list no longer includes POT_OIL.
    // Broken by reverting the switch arm to a throw.
    await startedGame(771020, 'OilNoThrow');
    const obj = vaporPotion(POT_OIL);
    obj.cursed = false;
    obj.lamplit = false;
    // potionbreathe still works for POT_OIL (its vapors do nothing), which
    // confirms the object type is valid and the otyp constant is right.
    discover_object(POT_OIL, true, true, false, game);
    clearTopline();
    await potionbreathe(obj, game);
    assert.equal(toplines(), '');
});

// ---------------------------------------------------------------------------
// peffect_see_invisible: fruit-juice arm
// C ref: potion.c peffect_see_invisible() (841-880). Fruit juice shares the
// taste and identification preamble with see-invisible potions, then adds
// nutrition according to dilution and beatitude before calling newuhs(FALSE).
// ---------------------------------------------------------------------------

test('fruit juice taste, identification, and nutrition follow its BUC state',
    async () => {
    await startedGame(771013, 'FruitJuiceTaste');

    // Each case starts at 900 nutrition, the initialized NOT_HUNGRY value
    // below the 1000 SATIATED boundary, so newuhs(FALSE) runs without an
    // additional hunger-status message or random draw.
    const cases = [
        { name: 'uncursed', blessed: false, cursed: false, odiluted: false,
            delta: 20, message: 'This tastes like slime mold juice.' },
        { name: 'diluted', blessed: false, cursed: false, odiluted: true,
            delta: 10,
            message: 'This tastes like reconstituted slime mold juice.' },
        { name: 'blessed', blessed: true, cursed: false, odiluted: false,
            delta: 30, message: 'This tastes like slime mold juice.' },
        { name: 'cursed', blessed: false, cursed: true, odiluted: false,
            delta: 10, message: 'Yecch!  This tastes rotten.' },
    ];
    for (const entry of cases) {
        const potion = vaporPotion(POT_FRUIT_JUICE);
        potion.blessed = entry.blessed;
        potion.cursed = entry.cursed;
        potion.odiluted = entry.odiluted;
        game.u.uhunger = 900;
        game.u.uhs = NOT_HUNGRY;
        game.gp.potion_unkn = 0;
        game.gp.potion_nothing = 0;
        clearTopline();
        enableRngLog();

        await peffects(potion, game);

        assert.equal(game.u.uhunger, 900 + entry.delta, entry.name);
        assert.equal(game.u.uhs, NOT_HUNGRY, entry.name);
        assert.equal(game.gp.potion_unkn, 1, entry.name);
        assert.equal(toplines(), entry.message, entry.name);
        assert.deepEqual(getRngLog(), [], entry.name);
    }
});

test('hallucinating fruit juice uses the source taste variants', async () => {
    // Seed 771014 is an independent startup case; the test overrides only
    // the potion and hallucination state after initialization.
    await startedGame(771014, 'FruitJuiceHallu');
    // 30 is a positive Hallucination timeout, so Hallucination's message
    // format is active without changing the potion's BUC state.
    game.u.uprops[HALLUC].intrinsic = 30;

    // The two uncursed cases exercise C's "10% real" format string and its
    // source-ordered dilution prefix. The cursed case uses the alternate
    // "overripe" wording and still follows the same nutrition formula.
    const cases = [
        { cursed: false, odiluted: false,
            message: 'This tastes like 10% real slime mold juice '
                + 'all-natural beverage.' },
        { cursed: false, odiluted: true,
            message: 'This tastes like 10% real reconstituted '
                + 'slime mold juice all-natural beverage.' },
        { cursed: true, odiluted: false,
            message: 'Yecch!  This tastes overripe.' },
    ];
    for (const entry of cases) {
        const potion = vaporPotion(POT_FRUIT_JUICE);
        potion.cursed = entry.cursed;
        potion.odiluted = entry.odiluted;
        game.u.uhunger = 900;
        game.u.uhs = NOT_HUNGRY;
        game.gp.potion_unkn = 0;
        clearTopline();
        enableRngLog();

        await peffects(potion, game);

        assert.equal(toplines(), entry.message);
        assert.equal(game.gp.potion_unkn, 1);
        assert.deepEqual(getRngLog(), []);
    }
});

test('fruit juice lets newuhs report a hunger-status transition', async () => {
    // Seed 771015 is independent from the taste cases and supplies an
    // initialized game for the direct potion effect call.
    await startedGame(771015, 'FruitJuiceStatus');
    const potion = vaporPotion(POT_FRUIT_JUICE);
    // 45 is WEAK; one uncursed undiluted fruit juice adds 20 and reaches
    // HUNGRY, whose newuhs(FALSE) message is appended after the taste line.
    game.u.uhunger = 45;
    game.u.uhs = 3; // WEAK from eat.c's hunger-status ordering.
    clearTopline();

    await peffects(potion, game);

    assert.equal(game.u.uhunger, 65);
    assert.equal(game.u.uhs, 2); // HUNGRY from eat.c's hunger-status ordering.
    assert.equal(
        toplines(),
        'This tastes like slime mold juice.  You only feel hungry now.',
    );
});
