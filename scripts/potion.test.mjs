// potion.c potionbreathe() and do.c trycall(). The source-pinned switch test
// checks executable C labels against the JavaScript cases, while the behavior
// tests pin branch-specific updates, RNG order and naming-tail behavior.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { failClosedCommandRefusals } from '../js/cmd.js';
import { setuhpmax } from '../js/attrib.js';

import {
    A_CON, A_DEX, A_MAX, A_STR, A_WIS, ACID_RES, BLINDED, CONFUSION, DEAF,
    DETECT_MONSTERS, FAST, FREE_ACTION,
    FIXED_ABIL, FROMOUTSIDE, GLIB, HALLUC,
    GETOBJ_DOWNPLAY, GETOBJ_EXCLUDE, GETOBJ_EXCLUDE_INACCESS, GETOBJ_SUGGEST,
    HALLUC_RES, INVIS, LEVITATION, NOT_HUNGRY, POTHIT_HERO_THROW,
    POTHIT_MONST_THROW, SEE_INVIS,
    SATIATED, SICK, SLEEP_RES, WEAK,
    KILLED_BY, STONED, TELEPAT, TIMEOUT, UNCHANGING, WOUNDED_LEGS, W_RINGL,
} from '../js/const.js';
import { find_delayed_killer } from '../js/end.js';
import { trycall } from '../js/do.js';
import { docall } from '../js/do_name.js';
import { game } from '../js/gstate.js';
import { PM_GRID_BUG } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { discover_object } from '../js/o_init.js';
import { planningState } from '../js/unported_monster_actions.js';
import { mksobj } from '../js/obj.js';
import { dist2 } from '../js/hacklib.js';
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
    MUMMY_WRAPPING,
    SPBOOK_CLASS,
    SPE_INVISIBILITY,
    SPE_RESTORE_ABILITY,
    TOWEL,
    COIN_CLASS,
    RING_CLASS,
    SPE_DETECT_MONSTERS,
} from '../js/objects.js';
import {
    UnsupportedQuaffError,
    bottlename,
    dip_ok,
    incr_itimeout,
    make_confused,
    make_blinded,
    make_hallucinated,
    make_glib,
    make_stoned,
    peffects,
    potionbreathe,
    potionhit,
    set_itimeout,
    speed_up,
    toggle_blindness,
} from '../js/potion.js';
import { enableRngLog, getRngLog, initRng, rn2 } from '../js/rng.js';
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

test('make_hallucinated forwards every planning display seam in source order',
    async () => {
    await startedGame(8460002, 'HallucinationDisplaySeams');
    clearTopline();
    const planned = planningState(game);
    planned.u.uprops[HALLUC].intrinsic = 0;
    planned.u.uprops[HALLUC_RES].intrinsic = 0;
    planned.u.uprops[HALLUC_RES].extrinsic = 0;
    planned.u.uswallow = false;
    const events = [];
    await make_hallucinated(12, true, 0, planned, {
        planning: true,
        message: async (line) => events.push(['message', line]),
        seeMonsters: (state, env) => {
            events.push(['monsters', state, env.redraw]);
        },
        seeObjects: (state, options) => {
            events.push(['objects', state, options.redraw]);
        },
        seeTraps: (state, options) => {
            events.push(['traps', state, options.redraw]);
        },
    });
    assert.deepEqual(events.map(([kind]) => kind),
        ['monsters', 'objects', 'traps', 'message']);
    assert.equal(planned.u.uprops[HALLUC].intrinsic & TIMEOUT, 12);
    assert.equal(game.u.uprops[HALLUC].intrinsic & TIMEOUT, 0);
    assert.equal(planned.disp.botl, true);
    assert.equal(events[0][1], planned);
    assert.equal(typeof events[0][2], 'function');
    assert.equal(typeof events[1][2], 'function');
    assert.equal(typeof events[2][2], 'function');
    assert.equal(game._pending_message ?? '', '',
        'planning feedback does not paint the live TTY');
});

test('make_hallucinated keeps explicit planning on the live state silent',
    async () => {
    await startedGame(8460003, 'HallucinationLivePlanning');
    clearTopline();
    const hallucination = game.u.uprops[HALLUC];
    const resistance = game.u.uprops[HALLUC_RES];
    hallucination.intrinsic = 0;
    resistance.intrinsic = 0;
    resistance.extrinsic = 0;
    game.iflags.perm_invent = true;
    game.program_state.in_moveloop = true;
    const messages = [];

    // An explicit planning flag must win over state === game for display
    // fallbacks.  The permanent-inventory preflight still needs a planning
    // hook, but no live map, trap, swallow, or inventory output may run.
    await make_hallucinated(12, true, 0, game, {
        planning: true,
        message: async (line) => messages.push(line),
    });
    assert.equal(hallucination.intrinsic & TIMEOUT, 12);
    assert.deepEqual(messages, ['Oh wow!  Everything looks so cosmic!']);
    assert.equal(game._pending_message ?? '', '');
    assert.equal(game._ttyToplines ?? '', '');

    // Restore the property through the same planning boundary so this test
    // leaves the next started game with the source's original state.
    await make_hallucinated(0, false, 0, game, { planning: true });
    game.iflags.perm_invent = false;
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
    // part. Keep both timeout directions source-pinned for a two-eyed form.
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

test('dodrink preserves the C occupant availability and chance order', () => {
    const source = potionSource();
    const signature = source.indexOf('dodrink(void)');
    const start = source.lastIndexOf('int', signature);
    const end = source.indexOf('\n}\n\nint\ndopotion', signature);
    assert.ok(start >= 0 && signature > start && end > signature);
    const cBody = source.slice(start, end).replace(/\s+/gu, ' ');
    const hack = readFileSync(
        new URL('../nethack-c/upstream/include/hack.h', import.meta.url),
        'utf8',
    );
    assert.match(hack,
        /#define POTION_OCCUPANT_CHANCE\(n\) \(13 \+ 2 \* \(n\)\)/u);
    assert.match(cBody,
        /objdescr_is\(otmp, "milky"\) && !\(svm\.mvitals\[PM_GHOST\]\.mvflags & G_GONE\) && !rn2\(POTION_OCCUPANT_CHANCE\(svm\.mvitals\[PM_GHOST\]\.born\)\)/u);
    assert.match(cBody,
        /else if \(objdescr_is\(otmp, "smoky"\) && !\(svm\.mvitals\[PM_DJINNI\]\.mvflags & G_GONE\) && !rn2\(POTION_OCCUPANT_CHANCE\(svm\.mvitals\[PM_DJINNI\]\.born\)\)\)/u);

    const js = readFileSync(new URL('../js/potion.js', import.meta.url), 'utf8');
    const jsSignature = js.indexOf('export async function dodrink(');
    const jsEnd = js.indexOf('\n}\n\n// C ref: potion.c toggle_blindness', jsSignature);
    assert.ok(jsSignature > 0 && jsEnd > jsSignature);
    const jsBody = js.slice(jsSignature, jsEnd);
    assert.match(jsBody,
        /descr === 'milky'[\s\S]*?ghostVital\.mvflags & G_GONE[\s\S]*?!rn2\(13 \+ 2 \* ghostVital\.born\)/u);
    assert.match(jsBody,
        /else if \(descr === 'smoky'\)[\s\S]*?djinniVital\.mvflags & G_GONE[\s\S]*?!rn2\(13 \+ 2 \* djinniVital\.born\)[\s\S]*?await djinni_from_bottle\(otmp, state\)[\s\S]*?useup\(otmp, \{ state \}\)[\s\S]*?return ECMD_TIME/u);
});

test('peffect_blindness preserves the C condition, duration, and talk order',
    () => {
    const source = potionSource();
    const signature = source.indexOf('peffect_blindness(struct obj *otmp)');
    assert.ok(signature > 0, 'potion.c still defines peffect_blindness');
    const start = source.lastIndexOf('staticfn void', signature);
    const end = source.indexOf('\n}', signature);
    assert.ok(start >= 0 && end > signature);
    const body = source.slice(start, end).replace(/\s+/gu, ' ');
    assert.match(body,
        /if \(Blind \|\| \(\(HBlinded \|\| EBlinded\) && BBlinded\)\) gp\.potion_nothing\+\+;/u);
    assert.match(body,
        /make_blinded\(itimeout_incr\(BlindedTimeout, rn1\(200, 250 - 125 \* bcsign\(otmp\)\)\), \(boolean\) !Blind\);/u);
});

test('dip_ok matches potion.c classifications and silent accessibility filter', () => {
    const source = potionSource();
    const start = source.indexOf('dip_ok(struct obj *obj)');
    const end = source.indexOf(
        '/* getobj callback for object to be dipped when hero', start,
    );
    assert.ok(start > 0);
    assert.ok(end > start);
    const body = source.slice(start, end);
    assert.match(body, /if \(!obj\)\s*return GETOBJ_DOWNPLAY;/u);
    assert.match(body, /obj->oclass == COIN_CLASS\)\s*return GETOBJ_EXCLUDE;/u);
    assert.match(body, /inaccessible_equipment\(obj, \(const char \*\) 0, FALSE\)/u);
    assert.match(body, /return GETOBJ_EXCLUDE_INACCESS;/u);
    assert.match(body, /return GETOBJ_SUGGEST;/u);

    assert.equal(dip_ok(null), GETOBJ_DOWNPLAY);
    assert.equal(dip_ok({ oclass: COIN_CLASS }), GETOBJ_EXCLUDE);
    const gloves = { cursed: 0, bknown: 0 };
    const ring = { oclass: RING_CLASS, owornmask: W_RINGL };
    assert.equal(
        dip_ok(ring, { uarmg: gloves, uleft: ring }),
        GETOBJ_EXCLUDE_INACCESS,
    );
    assert.equal(dip_ok({ oclass: RING_CLASS }), GETOBJ_SUGGEST);
});

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

async function startedGame(seed, name, role = 'Healer') {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:${role},race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
}

test('unblessed gain-ability potion retries attributes in C RNG order',
    async () => {
        await startedGame(8460240, 'GainAbilityRetryOrder', 'Wizard');
        const maximum = game.urace.attrmax;
        game.u.acurr.a[A_STR] = maximum[A_STR];
        game.u.amax.a[A_STR] = maximum[A_STR];
        game.u.acurr.a[A_CON] = maximum[A_CON] - 1;
        game.u.amax.a[A_CON] = maximum[A_CON] - 1;
        game.u.aexe[A_CON] = 6;
        game.u.uprops[FIXED_ABIL] ??= { intrinsic: 0, extrinsic: 0 };
        game.u.uprops[FIXED_ABIL].extrinsic = 0;
        game.program_state.in_moveloop = true;
        game.gp.potion_nothing = 0;
        game.gp.potion_unkn = 0;

        const events = [];
        const choices = [A_STR, A_CON];
        const potion = vaporPotion(POT_GAIN_ABILITY);
        assert.equal(await peffects(potion, game, {
            random: {
                rn2: (bound) => {
                    events.push(['rn2', bound]);
                    return choices.shift();
                },
            },
            message: async (line) => events.push(['message', line]),
            encumberMessage: async () => events.push(['encumber']),
        }), -1);

        assert.equal(game.u.acurr.a[A_STR], maximum[A_STR],
            'the first capped attribute does not change');
        assert.equal(game.u.acurr.a[A_CON], maximum[A_CON],
            'the second attribute rises and ends the unblessed search');
        assert.equal(game.u.aexe[A_CON], 0,
            'successful adjattrib resets the same attribute exercise');
        assert.deepEqual(events, [
            ['rn2', A_MAX],
            ['rn2', A_MAX],
            ['message', 'You feel tough!'],
            ['encumber'],
        ], 'C draws before each attempt and adjattrib reports before encumber_msg');
        assert.equal(choices.length, 0);
        assert.equal(game.gp.potion_nothing, 0);
        assert.equal(game.gp.potion_unkn, 0);
    });

test('cursed and Fixed_abil gain-ability branches update separate counters',
    async () => {
        await startedGame(8460241, 'GainAbilityShortBranches', 'Wizard');
        const events = [];
        const potion = vaporPotion(POT_GAIN_ABILITY);
        game.gp.potion_nothing = 0;
        game.gp.potion_unkn = 0;

        potion.cursed = true;
        assert.equal(await peffects(potion, game, {
            random: { rn2: () => assert.fail('cursed branch draws no RNG') },
            message: async (line) => events.push(line),
        }), -1);
        assert.deepEqual(events, ['Ulch!  That potion tasted foul!']);
        assert.equal(game.gp.potion_unkn, 1);
        assert.equal(game.gp.potion_nothing, 0);

        potion.cursed = false;
        game.u.uprops[FIXED_ABIL] ??= { intrinsic: 0, extrinsic: 0 };
        game.u.uprops[FIXED_ABIL].extrinsic = 1;
        game.gp.potion_nothing = 0;
        game.gp.potion_unkn = 0;
        events.length = 0;
        assert.equal(await peffects(potion, game, {
            random: { rn2: () => assert.fail('Fixed_abil branch draws no RNG') },
            message: async (line) => events.push(line),
        }), -1);
        assert.deepEqual(events, []);
        assert.equal(game.gp.potion_unkn, 0);
        assert.equal(game.gp.potion_nothing, 1);
    });

test('cursed gain-level potion stays on D:1 without the Amulet', async () => {
    await startedGame(8460231, 'GainLevelCursedFirstLevel');
    const potion = vaporPotion(POT_GAIN_LEVEL);
    potion.cursed = true;
    game.u.uhave.amulet = false;
    game.gp.potion_unkn = 0;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);

    assert.equal(toplines(), 'You have an uneasy feeling.');
    assert.equal(game.gp.potion_unkn, 1,
        'the cursed branch keeps the potion unidentified');
    assert.equal(game.u.uz.dnum, 0);
    assert.equal(game.u.uz.dlevel, 1);
    assert.deepEqual(getRngLog(), [],
        'the D:1/no-Amulet test uses neither Can_rise_up nor a random draw');
});

test('setuhpmax updates and clamps the polymorph HP pair together', () => {
    // C attrib.c setuhpmax() routes to u.mhmax/u.mh when Upolyd and
    // even_when_polyd is false; normal-form HP remains an independent pair.
    const state = {
        u: {
            umonnum: 2,
            umonster: 1,
            mhmax: 12,
            mh: 15,
            uhpmax: 38,
            uhp: 34,
            uhppeak: 41,
        },
        disp: { botl: false },
    };

    setuhpmax(10, false, state);

    assert.equal(state.u.mhmax, 10);
    assert.equal(state.u.mh, 10);
    assert.equal(state.u.uhpmax, 38);
    assert.equal(state.u.uhp, 34);
    assert.equal(state.u.uhppeak, 41);
    assert.equal(state.disp.botl, true);
});

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

test('restore-ability potion repairs the first base score from its one C draw',
    async () => {
        await startedGame(8460391, 'RestoreAbilityFirstScore', 'Wizard');
        const maximum = game.urace.attrmax;
        game.u.acurr.a = [...maximum];
        game.u.amax.a = [...maximum];
        game.u.aexe.fill(0);
        game.u.atemp.fill(0);
        game.u.acurr.a[A_WIS]--;
        game.u.aexe[A_WIS] = 7;
        game.u.atemp[A_STR] = -1;
        game.disp.botl = false;
        game.u.ulevelmax = game.u.ulevel;
        game.gp.potion_unkn = 0;
        const events = [];
        const draws = [];

        assert.equal(await peffects(vaporPotion(POT_RESTORE_ABILITY), game, {
            random: {
                rn2: (bound) => {
                    draws.push(bound);
                    return A_STR;
                },
            },
            message: async (line) => events.push(line),
        }), -1);

        assert.deepEqual(draws, [A_MAX],
            'C draws one random starting attribute and then walks forward');
        assert.deepEqual(events, ['Wow!  This makes you feel good!']);
        assert.equal(game.u.acurr.a[A_WIS], maximum[A_WIS]);
        assert.equal(game.u.aexe[A_WIS], 7,
            'ABASE restoration retains positive AEXE');
        assert.equal(game.u.atemp[A_STR], -1,
            'ABASE restoration does not undo ATEMP loss');
        assert.equal(game.disp.botl, true);
        assert.equal(game.gp.potion_unkn, 1);
    });

test('blessed restore-ability walks all scores while cursed restoration draws none',
    async () => {
        await startedGame(8460392, 'RestoreAbilityBlessingOrder', 'Wizard');
        const maximum = game.urace.attrmax;
        game.u.acurr.a = maximum.map((value) => value - 1);
        game.u.amax.a = [...maximum];
        game.u.aexe = [ -1, 4, -2, 5, -3, 6 ];
        game.u.atemp.fill(0);
        game.u.ulevelmax = game.u.ulevel;
        const blessedEvents = [];
        const draws = [];
        const blessed = vaporPotion(POT_RESTORE_ABILITY);
        blessed.blessed = true;

        await peffects(blessed, game, {
            random: {
                rn2: (bound) => {
                    draws.push(bound);
                    return A_DEX;
                },
            },
            message: async (line) => blessedEvents.push(line),
        });

        assert.deepEqual(draws, [A_MAX]);
        assert.deepEqual(blessedEvents, ['Wow!  This makes you feel great!']);
        assert.deepEqual(game.u.acurr.a, maximum);
        assert.deepEqual(game.u.aexe, [0, 4, 0, 5, 0, 6],
            'C clamps negative AEXE but preserves positive exercise');

        game.u.uprops[SICK] ??= { intrinsic: 0, extrinsic: 0 };
        game.u.uprops[SICK].intrinsic = TIMEOUT;
        blessedEvents.length = 0;
        await peffects(blessed, game, {
            random: { rn2: (bound) => {
                assert.equal(bound, A_MAX);
                return A_DEX;
            } },
            message: async (line) => blessedEvents.push(line),
        });
        assert.equal(blessedEvents[0], 'Wow!  This makes you feel better!',
            'the blessed wording consumes unfixable_trouble_count(FALSE)');

        game.u.acurr.a[A_STR]--;
        const cursed = vaporPotion(POT_RESTORE_ABILITY);
        cursed.cursed = true;
        const cursedEvents = [];
        assert.equal(await peffects(cursed, game, {
            random: { rn2: () => assert.fail('cursed path has no RNG') },
            message: async (line) => cursedEvents.push(line),
        }), -1);
        assert.equal(game.u.acurr.a[A_STR], maximum[A_STR] - 1);
        assert.deepEqual(cursedEvents, ['Ulch!  This makes you feel mediocre!']);
    });

test('restore-ability spell restores scores but not potion-only lost levels',
    async () => {
        await startedGame(8460393, 'RestoreAbilitySpellLevelLimit', 'Wizard');
        const maximum = game.urace.attrmax;
        game.u.acurr.a = [...maximum];
        game.u.amax.a = [...maximum];
        game.u.acurr.a[A_STR]--;
        game.u.aexe.fill(0);
        game.u.ulevel = Math.max(1, game.u.ulevel - 1);
        game.u.ulevelmax = game.u.ulevel + 1;
        const originalLevel = game.u.ulevel;
        const events = [];

        assert.equal(await peffects({
            otyp: SPE_RESTORE_ABILITY,
            blessed: false,
            cursed: false,
        }, game, {
            random: { rn2: (bound) => {
                assert.equal(bound, A_MAX);
                return A_STR;
            } },
            message: async (line) => events.push(line),
        }), -1);

        assert.equal(game.u.acurr.a[A_STR], maximum[A_STR]);
        assert.equal(game.u.ulevel, originalLevel,
            'C gates pluslvl() on the POT_RESTORE_ABILITY object type');
        assert.equal(game.u.ulevelmax, originalLevel + 1);
        assert.equal(events[0], 'Wow!  This makes you feel good!');
    });

test('acid resistance lets an acid potion cure stoning without damage', async () => {
    await startedGame(8460119, 'AcidPotionCuresStoning');
    game.u.uprops[ACID_RES].intrinsic = 1;
    await make_stoned(30, null, KILLED_BY, 'test stoning', game);
    game.gp.potion_unkn = 0;
    const hpBefore = game.u.uhp;
    const conExerciseBefore = game.u.aexe[A_CON];
    const acid = vaporPotion(POT_ACID);
    clearTopline();
    enableRngLog();

    await peffects(acid, game);

    assert.equal(game.u.uhp, hpBefore,
        'Acid_resistance bypasses potion damage');
    assert.equal(game.u.aexe[A_CON], conExerciseBefore,
        'the resistant branch does not exercise Constitution');
    assert.deepEqual(getRngLog(), [],
        'the resistant branch makes no damage or exercise RNG calls');
    assert.equal(game.u.uprops[STONED].intrinsic & TIMEOUT, 0);
    assert.equal(find_delayed_killer(STONED, game), null);
    assert.equal(game.gp.potion_unkn, 1);
    assert.match(toplines(), /This tastes sour\./u);
    assert.match(toplines(), /You feel limber!/u);
});

test('blessed acid preserves its source damage text and clears stoning after damage',
    async () => {
        await startedGame(8460123, 'BlessedAcidCuresStoning');
        game.u.uprops[ACID_RES].intrinsic = 0;
        await make_stoned(30, null, KILLED_BY, 'test stoning', game);
        const potion = vaporPotion(POT_ACID);
        potion.blessed = true;
        game.gp.potion_unkn = 0;
        clearTopline();
        enableRngLog();

        await peffects(potion, game);

        assert.match(toplines(), /This burns a little!/u);
        assert.match(toplines(), /You feel limber!/u);
        assert.equal(game.u.uprops[STONED].intrinsic & TIMEOUT, 0);
        assert.equal(find_delayed_killer(STONED, game), null);
        assert.equal(game.gp.potion_unkn, 1);
        assert.match(getRngLog()[0], /^d\(1,4\)=\d+$/u);
    });

test('blindness potion extends its source-ordered BUC timeout', async () => {
    for (const sign of [-1, 0, 1]) {
        await startedGame(8460041, 'BlindnessPotionDuration');
        const potion = vaporPotion(POT_BLINDNESS);
        potion.cursed = sign < 0;
        potion.blessed = sign > 0;
        const blinded = game.u.uprops[BLINDED];
        blinded.intrinsic = 0;
        blinded.extrinsic = 0;
        blinded.blocked = 0;
        game.gp.potion_nothing = 0;
        clearTopline();
        enableRngLog();

        await peffects(potion, game);

        const draws = getRngLog();
        assert.equal(draws.length, 1);
        const draw = /^rn2\(200\)=(\d+)$/u.exec(draws[0]);
        assert.ok(draw, draws[0]);
        assert.equal(blinded.intrinsic & TIMEOUT,
            250 - 125 * sign + Number(draw[1]));
        assert.equal(game.gp.potion_nothing, 0);
        assert.equal(toplines(), 'A cloud of darkness falls upon you.');
    }
});

test('blindness potion counts existing or blocked blindness as ineffective',
    async () => {
    for (const [label, blocked] of [
        ['already blind', 0],
        ['timed blindness blocked', 1],
    ]) {
        await startedGame(8460042, 'BlindnessPotionNothing');
        const potion = vaporPotion(POT_BLINDNESS);
        const blinded = game.u.uprops[BLINDED];
        blinded.intrinsic = 11;
        blinded.extrinsic = 0;
        blinded.blocked = blocked;
        game.gp.potion_nothing = 0;
        clearTopline();
        enableRngLog();

        await peffects(potion, game);

        const draws = getRngLog();
        assert.equal(draws.length, 1, label);
        const draw = /^rn2\(200\)=(\d+)$/u.exec(draws[0]);
        assert.ok(draw, `${label}: ${draws[0]}`);
        assert.equal(game.gp.potion_nothing, 1, label);
        assert.equal(blinded.intrinsic & TIMEOUT,
            11 + 250 + Number(draw[1]), label);
        assert.equal(toplines(), '', label);
    }
});

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

test('peffect_sleeping follows the C branch and call order', () => {
    const source = potionSource();
    const start = source.indexOf('peffect_sleeping(struct obj *otmp)');
    const end = source.indexOf('\n}\n\nstaticfn int\npeffect_monster_detection',
        start);
    assert.ok(start > 0 && end > start);
    const cBody = source.slice(start, end).replace(/\s+/gu, ' ');
    assert.match(cBody,
        /if \(Sleep_resistance \|\| Free_action\) \{ monstseesu\(M_SEEN_SLEEP\); You\("yawn\."\); \} else \{ You\("suddenly fall asleep!"\); monstunseesu\(M_SEEN_SLEEP\); fall_asleep\(-rn1\(10, 25 - 12 \* bcsign\(otmp\)\), TRUE\); \}/u);

    const js = readFileSync(new URL('../js/potion.js', import.meta.url), 'utf8');
    const dispatchStart = js.indexOf('export async function peffects(');
    const dispatchEnd = js.indexOf('\n}\n\n// C ref:', dispatchStart);
    assert.ok(dispatchStart > 0 && dispatchEnd > dispatchStart);
    const armStart = js.indexOf('case POT_SLEEPING:', dispatchStart);
    const armEnd = js.indexOf('case POT_MONSTER_DETECTION:', armStart);
    assert.ok(armStart > dispatchStart && armEnd > armStart);
    assert.match(js.slice(armStart, armEnd),
        /await peffect_sleeping\(otmp, state, env\);\s*break;/u);
});

test('peffect_gain_energy follows C source order and the POT_GAIN_ENERGY arm',
    () => {
        const source = potionSource();
        const cStart = source.indexOf('peffect_gain_energy(struct obj *otmp)');
        const cEnd = source.indexOf(
            '\n}\n\nstaticfn void\npeffect_oil', cStart,
        );
        assert.ok(cStart > 0 && cEnd > cStart);
        const cBody = source.slice(cStart, cEnd).replace(/\s+/gu, ' ');
        for (const sourceStep of [
            'You_feel("lackluster.")',
            'pline("Magical energies course through your body.")',
            'num = d(otmp->blessed ? 3 : !otmp->cursed ? 2 : 1, 6)',
            'if (otmp->cursed) num = -num',
            'u.uenmax += num',
            'if (u.uenmax > u.uenpeak) u.uenpeak = u.uenmax',
            'else if (u.uenmax <= 0) u.uenmax = 0',
            'u.uen += 3 * num',
            'if (u.uen > u.uenmax) u.uen = u.uenmax',
            'else if (u.uen <= 0) u.uen = 0',
            'disp.botl = TRUE',
            'exercise(A_WIS, TRUE)',
        ]) assert.ok(cBody.includes(sourceStep), sourceStep);
        const orderedSourceSteps = [
            'num = d(', 'if (otmp->cursed) num = -num',
            'u.uenmax += num', 'if (u.uenmax > u.uenpeak)',
            'u.uen += 3 * num', 'if (u.uen > u.uenmax)',
            'disp.botl = TRUE', 'exercise(A_WIS, TRUE)',
        ];
        let previous = -1;
        for (const step of orderedSourceSteps) {
            const index = cBody.indexOf(step);
            assert.ok(index > previous, `${step} follows its C predecessor`);
            previous = index;
        }

        const cDispatchStart = source.indexOf('peffects(struct obj *otmp)');
        const cDispatchEnd = source.indexOf('\n}\n\nvoid\nhealup', cDispatchStart);
        assert.ok(cDispatchStart > 0 && cDispatchEnd > cDispatchStart);
        const cDispatch = source.slice(cDispatchStart, cDispatchEnd);
        assert.match(cDispatch,
            /case POT_GAIN_ENERGY:[\s\S]*?peffect_gain_energy\(otmp\);\s*break;/u);

        const js = readFileSync(new URL('../js/potion.js', import.meta.url), 'utf8');
        const jsStart = js.indexOf('async function peffect_gain_energy(');
        const jsEnd = js.indexOf(
            '\n}\n\n// C ref: potion.c peffect_monster_detection', jsStart,
        );
        assert.ok(jsStart > 0 && jsEnd > jsStart);
        const jsBody = js.slice(jsStart, jsEnd).replace(/\s+/gu, ' ');
        assert.match(jsBody,
            /if \(otmp\.cursed\) await ttyPline\('You feel lackluster\.', state\); else await ttyPline\('Magical energies course through your body\.', state\); let amount = d\(otmp\.blessed \? 3 : !otmp\.cursed \? 2 : 1, 6\); if \(otmp\.cursed\) amount = -amount; u\.uenmax \+= amount;/u);
        const dispatchStart = js.indexOf('export async function peffects(');
        const energyArm = js.indexOf('case POT_GAIN_ENERGY:', dispatchStart);
        const oilArm = js.indexOf('case POT_OIL:', energyArm);
        assert.ok(energyArm > dispatchStart && oilArm > energyArm);
        assert.match(js.slice(energyArm, oilArm),
            /await peffect_gain_energy\(otmp, state\);\s*break;/u);
    });

test('gain-energy potion applies the C BUC dice and energy clamps',
    async () => {
        for (const variant of [
            { name: 'Blessed', seed: 937281001, blessed: true, dice: 3 },
            { name: 'Uncursed', seed: 937281002, blessed: false, dice: 2 },
            { name: 'Cursed', seed: 937281003, cursed: true, dice: 1 },
        ]) {
            await startedGame(
                variant.seed, `GainEnergy${variant.name}A37`, 'Wizard',
            );
            const potion = vaporPotion(POT_GAIN_ENERGY);
            potion.blessed = Boolean(variant.blessed);
            potion.cursed = Boolean(variant.cursed);
            game.u.uen = 2;
            game.u.uenmax = 4;
            game.u.uenpeak = 4;
            game.u.aexe[A_WIS] = 0;
            game.disp.botl = false;
            clearTopline();
            enableRngLog();

            assert.equal(await peffects(potion, game), -1);

            const draws = getRngLog();
            assert.equal(draws.length, 2);
            const dice = /^d\((\d+),6\)=(\d+)$/u.exec(draws[0]);
            assert.ok(dice, draws[0]);
            assert.equal(Number(dice[1]), variant.dice);
            assert.match(draws[1], /^rn2\(19\)=\d+$/u);
            const rolled = Number(dice[2]);
            assert.ok(rolled >= variant.dice
                && rolled <= 6 * variant.dice, draws[0]);
            const amount = variant.cursed ? -rolled : rolled;
            const rawMaximum = 4 + amount;
            const expectedMaximum = rawMaximum <= 0 ? 0 : rawMaximum;
            const expectedPeak = rawMaximum > 4 ? rawMaximum : 4;
            const rawCurrent = 2 + 3 * amount;
            const expectedCurrent = rawCurrent > expectedMaximum
                ? expectedMaximum : rawCurrent <= 0 ? 0 : rawCurrent;
            assert.equal(game.u.uenmax, expectedMaximum, variant.name);
            assert.equal(game.u.uenpeak, expectedPeak, variant.name);
            assert.equal(game.u.uen, expectedCurrent, variant.name);
            assert.equal(game.disp.botl, true);
            assert.equal(toplines(), variant.cursed
                ? 'You feel lackluster.'
                : 'Magical energies course through your body.');
        }
    });

test('sleeping potion uses the C BUC-scaled duration and timeout state',
    async () => {
        await startedGame(260927361, 'SleepingPotionDuration', 'Wizard');
        const potion = vaporPotion(POT_SLEEPING);
        potion.blessed = true;
        game.u.uprops[FREE_ACTION].intrinsic = 0;
        game.u.uprops[FREE_ACTION].extrinsic = 0;
        game.u.uprops[SLEEP_RES].intrinsic = 0;
        game.u.uprops[SLEEP_RES].extrinsic = 0;
        game.gp.potion_nothing = 0;
        game.gp.potion_unkn = 0;
        clearTopline();
        enableRngLog();

        assert.equal(await peffects(potion, game), -1);

        const draws = getRngLog();
        assert.equal(draws.length, 1);
        const roll = Number(/^rn2\(10\)=(\d+)$/u.exec(draws[0])?.[1]);
        assert.ok(Number.isInteger(roll));
        assert.equal(toplines(), 'You suddenly fall asleep!');
        assert.equal(game.multi, -(13 + roll));
        assert.equal(game.multi_reason, 'sleeping');
        assert.equal(game.nomovemsg, 'You wake up.');
        assert.equal(game.u.usleep, game.moves);
    });

for (const [name, property, seed] of [
    ['Free_action', FREE_ACTION, 260927362],
    ['Sleep_resistance', SLEEP_RES, 260927363],
]) {
    test(`sleeping potion yawn honors ${name} without a timeout draw`,
        async () => {
            await startedGame(seed, `SleepingPotion${name}`, 'Wizard');
            const potion = vaporPotion(POT_SLEEPING);
            game.u.uprops[FREE_ACTION].intrinsic = 0;
            game.u.uprops[FREE_ACTION].extrinsic = 0;
            game.u.uprops[SLEEP_RES].intrinsic = 0;
            game.u.uprops[SLEEP_RES].extrinsic = 0;
            game.u.uprops[property].intrinsic = FROMOUTSIDE;
            const previous = {
                multi: game.multi ?? 0,
                reason: game.multi_reason,
                nomovemsg: game.nomovemsg,
                usleep: game.u.usleep,
            };
            clearTopline();
            enableRngLog();

            assert.equal(await peffects(potion, game), -1);

            assert.equal(toplines(), 'You yawn.');
            assert.deepEqual(getRngLog(), []);
            assert.equal(game.multi ?? 0, previous.multi);
            assert.equal(game.multi_reason, previous.reason);
            assert.equal(game.nomovemsg, previous.nomovemsg);
            assert.equal(game.u.usleep, previous.usleep);
        });
}

test('potionbreathe has the executable case labels from potion.c', () => {
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

    const js = readFileSync(
        new URL('../js/potion.js', import.meta.url),
        'utf8',
    );
    const signature = js.indexOf('export async function potionbreathe(');
    const jsEnd = js.indexOf('if (!already_in_use)', signature);
    assert.ok(signature > 0 && jsEnd > signature);
    const switchStart = js.indexOf('    switch (Half_gas_damage', signature);
    const switchEnd = js.indexOf('    if (!already_in_use)', switchStart);
    const jsBody = js.slice(switchStart, switchEnd)
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/^\s*\/\/.*$/gmu, '');
    const jsLabels = new Set(
        [...jsBody.matchAll(/case (POT_[A-Z_]+|TOWEL):/gu)]
            .map(([, name]) => name),
    );
    assert.deepEqual([...jsLabels].sort(), [...labelled].sort());
});

test('the potion no-op types fall through and keep the in-use guard', async () => {
    await startedGame(771001, 'VaporNoop');
    for (const name of NO_OP_TYPES) {
        const obj = vaporPotion(POTION_TYPES[name]);
        // The source tail calls trycall() for dknown objects, so mark these
        // types known to keep this check on the switch fall-through itself.
        discover_object(obj.otyp, true, true, false, game);
        obj.in_use = true;
        clearTopline();
        await potionbreathe(obj, game);
        assert.equal(toplines(), '', name);
        assert.equal(obj.in_use, true, name);
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
// which yawn-messages and marks watching monsters as seeing the hero.
for (const [label, property] of [
    ['free action', FREE_ACTION], ['sleep resistance', SLEEP_RES],
]) {
    test(`${label} lets the sleeping vapors yawn without a timeout`, async () => {
        await startedGame(771014, 'VaporSleepRes');
        clearTopline();
        game.u.uprops[property].intrinsic = FROMOUTSIDE;
        const drawn = [];
        const random = {
            rnd: (bound) => { drawn.push(['rnd', bound]); return 2; },
            rn2: (bound) => { drawn.push(['rn2', bound]); return 1; },
        };
        await potionbreathe(vaporPotion(POT_SLEEPING), game, { random });
        assert.equal(toplines(), 'You yawn.');
        assert.equal(game.multi ?? 0, 0);
        assert.deepEqual(drawn, [['rn2', 19]],
            'kn identifies the sleeping potion through makeknown()');
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

test('potionhit applies the monster blindness branch in source order', async () => {
    await startedGame(771021, 'PotionMonsterBlindness');
    game.u.uprops[BLINDED].intrinsic = FROMOUTSIDE;
    const monster = {
        data: game.mons[PM_GRID_BUG],
        mx: game.u.ux + 3,
        my: game.u.uy,
        mhp: 5,
        mhpmax: 5,
        mblinded: 0,
        mcansee: true,
        mcanmove: true,
        misc_worn_check: 0,
        m_lev: 1,
        msleeping: false,
    };
    const draws = [];
    const scripted = [0, 0, 0, 31, 0];
    const bounds = [7, 5, 32, 32, 105];
    const random = {
        rn2: (bound) => {
            draws.push(bound);
            assert.equal(bound, bounds[draws.length - 1]);
            return scripted[draws.length - 1];
        },
        rnl: (bound) => assert.fail(`unexpected rnl(${bound})`),
        rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
        d: (n, bound) => assert.fail(`unexpected d(${n}, ${bound})`),
    };
    await potionhit(monster, vaporPotion(POT_BLINDNESS), POTHIT_HERO_THROW, {
        state: game,
        random,
        message: async () => {},
    });
    assert.deepEqual(draws, bounds,
        'bottle, target HP, blindness, and resistance draws keep C order');
    assert.equal(monster.mhp, 5);
    assert.equal(monster.mblinded, 95);
    assert.equal(monster.mcansee, false);
});

test('potionhit uses the C process RNG when a caller has no random seam',
    async () => {
        await startedGame(771031, 'PotionHitDefaultRandom');
        discover_object(POT_FRUIT_JUICE, true, true, false, game);
        const monster = {
            data: game.mons[PM_GRID_BUG],
            mx: game.u.ux + 3,
            my: game.u.uy,
            mhp: 5,
            mhpmax: 5,
            mblinded: 0,
            mcansee: true,
            mcanmove: true,
            misc_worn_check: 0,
            m_lev: 1,
            msleeping: false,
        };
        const obj = vaporPotion(POT_FRUIT_JUICE);
        const source = potionSource();
        const signature = source.indexOf(
            'potionhit(struct monst *mon, struct obj *obj, int how)',
        );
        const end = source.indexOf('\n}\n\n/* vapors are inhaled', signature);
        assert.ok(signature > 0 && end > signature);
        const body = source.slice(signature, end);
        assert.match(body, /const char \*botlnam = bottlename\(\);/u,
            'potionhit uses its process RNG through bottlename()');
        const randomImports = readFileSync(
            new URL('../js/potion.js', import.meta.url),
            'utf8',
        );
        assert.match(randomImports,
            /import \{[^}]*\brnl\b[^}]*\} from '\.\/rng\.js';/u,
            'the shared default RNG bundle includes C potionhit rnl calls');

        await assert.doesNotReject(() => potionhit(
            monster,
            obj,
            POTHIT_HERO_THROW,
            { state: game, message: async () => {} },
        ));
    });

test('potionhit preserves the C polymorph message and squared vapor distance',
    () => {
    const source = potionSource();
    const signature = source.indexOf('potionhit(struct monst *mon, struct obj *obj, int how)');
    const end = source.indexOf('\n}\n\n/* vapors are inhaled', signature);
    assert.ok(signature > 0 && end > signature);
    const body = source.slice(signature, end).replace(/\s+/gu, ' ');
    assert.match(body,
        /case POT_POLYMORPH: You_feel\("a little %s\.", Hallucination \? "normal" : "strange"\); if \(!Unchanging && !Antimagic\) polyself\(POLY_NOFLAGS\);/u);
    assert.match(body, /distance = distu\(tx, ty\);/u);

    const hack = readFileSync(
        new URL('../nethack-c/upstream/include/hack.h', import.meta.url),
        'utf8',
    );
    assert.match(hack,
        /#define distu\(xx, yy\) dist2\(\(coordxy\) \(xx\), \(coordxy\) \(yy\), u\.ux, u\.uy\)/u);
    const hacklib = readFileSync(
        new URL('../nethack-c/upstream/src/hacklib.c', import.meta.url),
        'utf8',
    );
    const distSignature = hacklib.indexOf('dist2(coordxy x0, coordxy y0, coordxy x1, coordxy y1)');
    const distEnd = hacklib.indexOf('\n}\n\n/* integer square root', distSignature);
    assert.ok(distSignature > 0 && distEnd > distSignature);
    assert.match(hacklib.slice(distSignature, distEnd),
        /return dx \* dx \+ dy \* dy;/u);
    assert.equal(dist2(12, 9, 10, 8), 5,
        'dist2 keeps diagonal distance squared rather than Chebyshev distance');

    const js = readFileSync(new URL('../js/potion.js', import.meta.url), 'utf8');
    const jsSignature = js.indexOf('export async function potionhit(');
    const jsEnd = js.indexOf('\n}\n\n// C ref: potion.c potionbreathe', jsSignature);
    assert.ok(jsSignature > 0 && jsEnd > jsSignature);
    const jsBody = js.slice(jsSignature, jsEnd);
    assert.match(jsBody,
        /distance = isyou \? 0 : dist2\(\s*mon\.mx, mon\.my, state\.u\.ux, state\.u\.uy,/u);
    assert.match(jsBody,
        /case POT_POLYMORPH:\s*await message\([\s\S]*?Hallucination\(state\)[\s\S]*?if \(!\(state\.u\.uprops\[UNCHANGING\]/u);
});

test('potionhit reports its source message before Unchanging suppresses polymorph',
    async () => {
        await startedGame(771028, 'PotionHeroPolymorphUnchanging');
        game.u.uprops[UNCHANGING].intrinsic = FROMOUTSIDE;
        discover_object(POT_POLYMORPH, true, true, false, game);
        clearTopline();
        game.u.uhp = 20;
        game.u.uhpmax = 20;
        const beforeForm = game.youmonst.data;
        const messages = [];

        await potionhit(game.youmonst, vaporPotion(POT_POLYMORPH),
            POTHIT_MONST_THROW, {
                state: game,
                random: {
                    rn2: () => 1,
                    rnd: () => 1,
                },
                message: async (text) => { messages.push(text); },
                encumberMessage: async () => {},
            });

        assert.equal(game.youmonst.data, beforeForm,
            'C still refuses polyself when Unchanging is active');
        assert.deepEqual(messages, [
            'The phial crashes on your head and breaks into shards.',
            'The potion of polymorph evaporates.',
            'You feel a little strange.',
        ]);
    });

test('potionhit uses distu squared range before deciding whether vapors reach the hero',
    async () => {
        await startedGame(771029, 'PotionSquaredVaporRange');
        discover_object(POT_FRUIT_JUICE, true, true, false, game);
        const monster = {
            data: game.mons[PM_GRID_BUG],
            mx: game.u.ux + 2,
            my: game.u.uy + 1,
            mhp: 5,
            mhpmax: 5,
            mblinded: 0,
            mcansee: true,
            mcanmove: true,
            misc_worn_check: 0,
            m_lev: 1,
            msleeping: false,
        };
        const draws = [];
        const obj = vaporPotion(POT_FRUIT_JUICE);
        await potionhit(monster, obj, POTHIT_HERO_THROW, {
            state: game,
            random: {
                rn2: (bound) => { draws.push(bound); return 1; },
            },
            message: async () => {},
        });

        assert.equal(dist2(monster.mx, monster.my, game.u.ux, game.u.uy), 5);
        assert.equal(monster.mhp, 4);
        assert.deepEqual(draws, [7, 5],
            'no nearby-vapor rn2 is drawn for C distu() distance 5');
    });

test('potionhit applies sickness vapors before continuing through obfree',
    async () => {
        await startedGame(771030, 'PotionSicknessVaporTail', 'Wizard');
        clearTopline();
        discover_object(POT_SICKNESS, true, true, false, game);
        const obj = vaporPotion(POT_SICKNESS);
        obj.unpaid = 1;
        const freed = [];
        const hp = game.u.uhp;
        const conExercise = game.u.aexe[A_CON];
        const draws = [];
        const rnds = [];
        await potionhit(game.youmonst, obj, POTHIT_MONST_THROW, {
            state: game,
            random: {
                rn2: (bound) => { draws.push(bound); return 1; },
                rnd: (bound) => { rnds.push(bound); return 1; },
            },
            message: async () => {},
            hooks: {
                obfreeShopBill: (freedObject) => {
                    freed.push(freedObject);
                    return 'unbilled';
                },
            },
        });

        assert.equal(game.u.uhp, hp - 6,
            'the impact costs 1 HP, then potionbreathe costs 5 more');
        assert.equal(game.u.aexe[A_CON], conExercise - 1);
        assert.deepEqual(draws, [7, 2],
            'bottlename draws before exercise(A_CON, FALSE)');
        assert.deepEqual(rnds, [2], 'potionhit rolls the impact damage first');
        assert.equal(game.unported.has('potion.c potionbreathe'), false);
        assert.deepEqual(freed, [obj],
            'the caller reaches its shop/object-release tail after the vapor effect');
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
    clearTopline();
    const protectedPotion = vaporPotion(POT_INVISIBILITY);
    await potionbreathe(protectedPotion, game);
    assert.equal(toplines(), 'Some vapor passes harmlessly around you.');
    assert.equal(game.u.uprops[INVIS].intrinsic, 0);
    assert.equal(protectedPotion.in_use, false);
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

test('the command seam keeps refusals for still-unported potion effects', () => {
    // js/cmd.js failClosedCommandRefusals() decides whether a refusal ends the
    // segment on its last matching screen or escapes and loses every screen
    // the command earned. The quaff refusal still needs conversion under
    // #quaff while vapor effects now run through potionbreathe().
    const listed = failClosedCommandRefusals();
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

test('sickness effect uses the C attribute message and encumbrance operations',
    async () => {
        await startedGame(771031, 'SicknessAttributeEnvironment', 'Wizard');
        game.moves = 1;
        game.program_state ??= {};
        game.program_state.in_moveloop = true;
        const events = [];
        const potion = vaporPotion(POT_SICKNESS);
        potion.dknown = false;

        await peffects(potion, game, {
            random: {
                rn2: (bound) => {
                    events.push(['rn2', bound]);
                    return bound === A_MAX ? A_CON : 0;
                },
                rn1: (bound, base) => {
                    events.push(['rn1', bound, base]);
                    return base;
                },
                rnd: (bound) => {
                    events.push(['rnd', bound]);
                    return 2;
                },
            },
            message: async (line) => events.push(['message', line]),
            encumberMessage: async () => events.push(['encumber']),
        });

        assert.ok(events.some(([kind, line]) => kind === 'message'
            && line === 'You feel very sick.'),
        'attrib.c:poisontell receives its message operation');
        assert.equal(events.filter(([kind]) => kind === 'encumber').length, 2,
            'adjattrib and exercise each reach encumber_msg for Constitution');
        assert.deepEqual(events.filter(([kind]) => kind !== 'message'
            && kind !== 'encumber'), [
            ['rn2', A_MAX],
            ['rn1', 4, 3],
            ['rnd', 10],
            ['rn2', 2],
        ], 'the attribute, HP, and exercise draws stay in C order');
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

test('levitation potion starts the rise before extending its timeout', async () => {
    await startedGame(771010, 'LevitationRise');
    const potion = vaporPotion(POT_LEVITATION);
    const levitation = game.u.uprops[LEVITATION];
    levitation.intrinsic = 0;
    levitation.extrinsic = 0;
    levitation.blocked = 0;
    game.gp.potion_nothing = 0;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(140\)=(\d+)$/u.exec(call)?.[1]);

    assert.equal(toplines(), 'You start to float in the air!');
    assert.equal(levitation.intrinsic & TIMEOUT, 11 + draw);
    assert.equal(game.gp.potion_nothing, 0);
    assert.deepEqual(getRngLog(), [`rn2(140)=${draw}`]);
});

test('an already levitating hero records nothing before potion extension',
    async () => {
    await startedGame(771011, 'LevitationAgain');
    const potion = vaporPotion(POT_LEVITATION);
    const levitation = game.u.uprops[LEVITATION];
    levitation.intrinsic = 20;
    levitation.extrinsic = 0;
    levitation.blocked = 0;
    game.gp.potion_nothing = 0;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(140\)=(\d+)$/u.exec(call)?.[1]);

    assert.equal(toplines(), '');
    assert.equal(levitation.intrinsic & TIMEOUT, 30 + draw);
    assert.equal(game.gp.potion_nothing, 1);
    assert.deepEqual(getRngLog(), [`rn2(140)=${draw}`]);
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

// C ref: potion.c peffect_invisibility() (811-840). This impure source
// function owns BInvis's potion_nothing branch, blessed permanence's rn2
// threshold, the ordinary d(6 - 3*bcsign(otmp),100)+100 timeout, and the
// spell-only mummy-wrapping early return. The tests drive the real peffects
// dispatcher, which is also the production caller used by spell.js.
test('peffect_invisibility follows source ordering for potion branches',
    async () => {
        await startedGame(8470211, 'PotionInvisibilityBranches');
        const property = game.u.uprops[INVIS];
        property.intrinsic = 0;
        property.extrinsic = 0;
        property.blocked = 0;
        game.gp.potion_nothing = 0;
        const potion = vaporPotion(POT_INVISIBILITY);
        clearTopline();
        enableRngLog();

        await peffects(potion, game);

        const durationDraw = getRngLog();
        assert.equal(durationDraw.length, 1);
        const dice = Number(/^d\(6,100\)=(\d+)$/u
            .exec(durationDraw[0])?.[1]);
        assert.ok(dice >= 6 && dice <= 600);
        assert.equal(property.intrinsic & TIMEOUT, dice + 100);
        assert.equal(game.gp.potion_nothing, 0);
        assert.equal(toplines(), "Gee!  All of a sudden, you can't see yourself.");

        // Existing BInvis makes Invis false, but C's separate `|| BInvis`
        // still suppresses the self-invisibility line and increments the
        // potion_nothing counter before applying the ordinary timeout.
        property.intrinsic = 0;
        property.blocked = 1;
        game.gp.potion_nothing = 0;
        const blockedPotion = vaporPotion(POT_INVISIBILITY);
        clearTopline();
        enableRngLog();
        await peffects(blockedPotion, game);
        assert.equal(game.gp.potion_nothing, 1);
        assert.equal(toplines(), '');
        assert.match(getRngLog()[0], /^d\(6,100\)=\d+$/u);
        assert.equal(property.intrinsic & TIMEOUT,
            Number(/=(\d+)$/u.exec(getRngLog()[0])[1]) + 100);
    });

// C ref: potion.c peffect_monster_detection() (914-954). This impure source
// effect increments the shared detection timeout after checking the old
// HDetect_monsters timeout; the blessed potion caller must still return
// peffects()'s -1 so dopotion() consumes the potion through its ordinary tail.
test('blessed monster detection uses the old timeout threshold', async () => {
    await startedGame(260927262, 'BlessedMonsterDetection');
    const property = game.u.uprops[DETECT_MONSTERS];
    const potion = vaporPotion(POT_MONSTER_DETECTION);
    potion.blessed = true;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;

    property.intrinsic = 0;
    property.extrinsic = 0;
    enableRngLog();
    assert.equal(await peffects(potion, game), -1);
    const durationDraw = getRngLog();
    assert.equal(durationDraw.length, 1);
    const duration = Number(/^rn2\(100\)=(\d+)$/u
        .exec(durationDraw[0])?.[1]) + 100;
    assert.ok(duration >= 100 && duration <= 199);
    assert.equal(property.intrinsic & TIMEOUT, duration);
    assert.equal(game.gp.potion_nothing, 0);

    // detect.c's existing intrinsic prevents a long repeated timeout: C tests
    // the old value before incr_itimeout() and adds exactly one with no RNG.
    property.intrinsic = 300;
    property.extrinsic = 0;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;
    enableRngLog();
    assert.equal(await peffects(potion, game), -1);
    assert.deepEqual(getRngLog(), []);
    assert.equal(property.intrinsic & TIMEOUT, 301);
    assert.equal(game.gp.potion_nothing, 1);
});

test('direct blessed detection spell starts with C-zeroed potion flags',
    async () => {
        await startedGame(260927264, 'BlessedDetectionSpell');
        const property = game.u.uprops[DETECT_MONSTERS];
        property.intrinsic = 0;
        property.extrinsic = 0;
        // spell.c calls peffects() directly, bypassing dopotion()'s per-quaff
        // reset; decl.h's static gp counters still begin at zero in C.
        delete game.gp.potion_nothing;
        delete game.gp.potion_unkn;
        const spell = {
            otyp: SPE_DETECT_MONSTERS,
            oclass: SPBOOK_CLASS,
            blessed: 1,
            cursed: 0,
        };
        enableRngLog();

        assert.equal(await peffects(spell, game), -1);

        const draw = getRngLog();
        assert.equal(draw.length, 1);
        const offset = Number(/^rn2\(40\)=(\d+)$/u.exec(draw[0])?.[1]);
        assert.ok(offset >= 0 && offset <= 39);
        assert.equal(property.intrinsic & TIMEOUT, offset + 21);
        assert.equal(game.gp.potion_nothing, 0);
        assert.ok(Number.isInteger(game.gp.potion_unkn));
    });

test('peffect_invisibility blessed permanence uses C HInvis threshold',
    async () => {
        const source = potionSource();
        const start = source.indexOf('peffect_invisibility(struct obj *otmp)');
        const end = source.indexOf('\nstaticfn void\npeffect_see_invisible', start);
        assert.ok(start >= 0 && end > start);
        const body = source.slice(start, end);
        assert.match(body, /!rn2\(HInvis \? 15 : 30\)/u);
        assert.match(body, /d\(6 - 3 \* bcsign\(otmp\), 100\) \+ 100/u);

        await startedGame(8470212, 'BlessedPotionInvisibility');
        const property = game.u.uprops[INVIS];
        property.intrinsic = 0;
        property.extrinsic = 0;
        property.blocked = 0;
        const potion = vaporPotion(POT_INVISIBILITY);
        potion.blessed = true;

        // Search a small explicit seed range only to select the C source's
        // one-in-thirty permanence result; no game history is copied.
        let selectedSeed;
        for (let seed = 8471000; seed < 8471100; ++seed) {
            initRng(seed);
            if (rn2(30) === 0) {
                selectedSeed = seed;
                break;
            }
        }
        assert.notEqual(selectedSeed, undefined,
            'the preselected 100-seed range contains a zero draw');
        initRng(selectedSeed);
        enableRngLog();
        clearTopline();

        await peffects(potion, game);

        assert.deepEqual(getRngLog(), ['rn2(30)=0']);
        assert.ok(property.intrinsic & FROMOUTSIDE);
        assert.equal(property.intrinsic & TIMEOUT, 0,
            'permanent invisibility does not also add a timeout');

        // HInvis is the full C intrinsic bitfield, so an existing permanent
        // source selects rn2(15), even with no active TIMEOUT bits.
        property.intrinsic = FROMOUTSIDE;
        const alreadyInvisible = vaporPotion(POT_INVISIBILITY);
        alreadyInvisible.blessed = true;
        let timedSeed;
        for (let seed = 8471100; seed < 8471200; ++seed) {
            initRng(seed);
            if (rn2(15) === 0) {
                timedSeed = seed;
                break;
            }
        }
        assert.notEqual(timedSeed, undefined,
            'the second preselected 100-seed range contains a zero draw');
        initRng(timedSeed);
        enableRngLog();
        await peffects(alreadyInvisible, game);
        assert.deepEqual(getRngLog(), ['rn2(15)=0']);
        assert.equal(property.intrinsic, FROMOUTSIDE);
    });

test('SPE_INVISIBILITY spell cannot pass mummy wrapping', async () => {
    await startedGame(8470213, 'SpellInvisibilityWrapping');
    const property = game.u.uprops[INVIS];
    property.intrinsic = 0;
    property.extrinsic = 0;
    property.blocked = 1;
    game.uarmc = mksobj(MUMMY_WRAPPING, false, false, { state: game });
    game.gp.potion_nothing = 0;
    const spell = {
        otyp: SPE_INVISIBILITY,
        oclass: SPBOOK_CLASS,
        blessed: 0,
        cursed: 0,
    };
    clearTopline();
    enableRngLog();

    await peffects(spell, game);

    assert.equal(toplines(), 'You feel rather itchy under the mummy wrapping.');
    assert.deepEqual(getRngLog(), [], 'the source returns before any RNG');
    assert.equal(property.intrinsic, 0);
    assert.equal(game.gp.potion_nothing, 0);
});

test('cursed invisibility preserves its source-owned aggravate gap', async () => {
    await startedGame(8470214, 'CursedPotionInvisibility');
    const property = game.u.uprops[INVIS];
    property.intrinsic = FROMOUTSIDE;
    property.extrinsic = 0;
    property.blocked = 0;
    const potion = vaporPotion(POT_INVISIBILITY);
    potion.cursed = true;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);

    assert.match(getRngLog()[0], /^d\(9,100\)=\d+$/u,
        'cursed bcsign changes the source dice count before aggravate');
    assert.equal(property.intrinsic & FROMOUTSIDE, 0,
        'the cursed tail removes permanent invisibility after the void gap');
    assert.ok(game.unported.has('wizard.c aggravate'));
    assert.ok(toplines().includes(
        'For some reason, you feel your presence is known.'));
});

// ---------------------------------------------------------------------------
// peffect_see_invisible
// C ref: potion.c peffect_see_invisible() (841-880).
// ---------------------------------------------------------------------------

test('see-invisible potion uses C visibility and intrinsic chance predicates',
    async () => {
        const source = potionSource();
        assert.ok(source.includes('int msg = Invisible && !Blind;'));
        assert.ok(source.includes(
            'int permchance = 10 - (HInvis ? 3 : 0) - (HSee_invisible ? 6 : 0);',
        ));
        const youprop = readFileSync(
            new URL('../nethack-c/upstream/include/youprop.h', import.meta.url),
            'utf8',
        );
        assert.ok(youprop.includes('#define See_invisible (HSee_invisible || ESee_invisible)'));
        assert.ok(youprop.includes('#define Invisible (Invis && !See_invisible)'));

        await startedGame(771012, 'SeeInvisibleExtrinsicRing', 'Wizard');
        const invisibility = game.u.uprops[INVIS];
        invisibility.intrinsic = FROMOUTSIDE;
        invisibility.extrinsic = 0;
        invisibility.blocked = 0;
        const seeInvisible = game.u.uprops[SEE_INVIS];
        seeInvisible.intrinsic = 0;
        seeInvisible.extrinsic = W_RINGL;
        seeInvisible.blocked = 0;
        const blindness = game.u.uprops[BLINDED];
        blindness.intrinsic = 0;
        blindness.extrinsic = 0;
        blindness.blocked = 0;

        const potion = vaporPotion(POT_SEE_INVISIBLE);
        potion.blessed = true;
        game.gp.potion_unkn = 0;
        const messages = [];
        enableRngLog();

        await peffects(potion, game, {
            message: async (line) => messages.push(line),
        });

        assert.match(
            getRngLog().find((call) => call.startsWith('rn2(')) ?? '',
            /^rn2\(7\)=\d+$/u,
            'C subtracts for HInvis but not the extrinsic ESee_invisible ring',
        );
        assert.ok(!messages.includes(
            'You can see through yourself, but you are visible!'),
            'C Invisible is false while See_invisible is active');
        assert.equal(game.gp.potion_unkn, 1,
            'the suppressed self-visibility message does not decrement the counter');

        seeInvisible.intrinsic = FROMOUTSIDE;
        seeInvisible.extrinsic = 0;
        game.gp.potion_unkn = 0;
        enableRngLog();
        await peffects(potion, game, {
            message: async () => {},
        });
        assert.match(
            getRngLog().find((call) => call.startsWith('rn2(')) ?? '',
            /^rn2\(1\)=0$/u,
            'intrinsic HSee_invisible contributes the source 6-point reduction',
        );
    });

test('see-invisible self message follows the C Blind macro', async () => {
    const youprop = readFileSync(
        new URL('../nethack-c/upstream/include/youprop.h', import.meta.url),
        'utf8',
    );
    assert.ok(youprop.includes(
        '#define Blind ((HBlinded || EBlinded) && !BBlinded)',
    ));

    await startedGame(771015, 'SeeInvisibleBlindness', 'Wizard');
    game.u.uprops[INVIS].intrinsic = FROMOUTSIDE;
    game.u.uprops[INVIS].extrinsic = 0;
    game.u.uprops[INVIS].blocked = 0;
    game.u.uprops[SEE_INVIS].intrinsic = 0;
    game.u.uprops[SEE_INVIS].extrinsic = 0;
    const blindness = game.u.uprops[BLINDED];
    const potion = vaporPotion(POT_SEE_INVISIBLE);

    for (const entry of [
        { name: 'blind', intrinsic: FROMOUTSIDE, blocked: 0, saysVisible: false },
        { name: 'blindness blocked', intrinsic: FROMOUTSIDE,
            blocked: FROMOUTSIDE, saysVisible: true },
    ]) {
        blindness.intrinsic = entry.intrinsic;
        blindness.extrinsic = 0;
        blindness.blocked = entry.blocked;
        game.u.uprops[SEE_INVIS].intrinsic = 0;
        game.u.uprops[SEE_INVIS].extrinsic = 0;
        game.gp.potion_unkn = 0;
        const messages = [];

        await peffects(potion, game, {
            message: async (line) => messages.push(line),
        });

        assert.equal(
            messages.includes('You can see through yourself, but you are visible!'),
            entry.saysVisible,
            entry.name,
        );
        assert.equal(game.gp.potion_unkn, entry.saysVisible ? 0 : 1,
            `${entry.name} follows the source message counter update`);
    }
});

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

test('cursed hallucination potion preserves the timeout RNG and skips enlightenment',
    async () => {
        await startedGame(92838001, 'CursedHallucinationB38', 'Wizard');
        game.u.uprops[HALLUC].intrinsic = 0;
        game.u.uprops[HALLUC_RES].intrinsic = 0;
        game.u.uprops[HALLUC_RES].extrinsic = 0;
        const potion = vaporPotion(POT_HALLUCINATION);
        potion.cursed = true;
        clearTopline();
        enableRngLog();

        assert.equal(await peffects(potion, game), -1);
        const draws = getRngLog();
        // rn1(x,y) is recorded through its source definition as rn2(x)+y.
        assert.match(draws[0], /^rn2\(200\)=\d+$/u);
        assert.equal(draws.length, 1,
            'the cursed || arm short-circuits both optional-message draws');
        assert.ok(game.u.uprops[HALLUC].intrinsic > 0);
    });

test('neutral water adds the source rnd(10) nutrition before newuhs',
    async () => {
        await startedGame(92838002, 'NeutralWaterB38');
        game.u.uhunger = 900;
        game.u.uhs = NOT_HUNGRY;
        const potion = vaporPotion(POT_WATER);
        clearTopline();
        enableRngLog();

        assert.equal(await peffects(potion, game), -1);
        assert.match(toplines(), /^This tastes like water\./u);
        assert.deepEqual(getRngLog().map((entry) => entry.match(/^([^=]+)/u)?.[1]),
            ['rnd(10)']);
        assert.ok(game.u.uhunger > 900 && game.u.uhunger <= 910);
        assert.equal(game.u.uhs, NOT_HUNGRY);
    });

test('blessed ordinary water selects awe and preserves the BUC counter',
    async () => {
        await startedGame(92838003, 'BlessedWaterB38');
        game.u.ualign.type = 1;
        game.youmonst.data = game.mons[game.u.umonnum];
        game.gp.potion_unkn = 0;
        const potion = vaporPotion(POT_WATER);
        potion.blessed = true;
        clearTopline();
        enableRngLog();

        assert.equal(await peffects(potion, game), -1);
        assert.match(toplines(), /^You feel full of awe\./u);
        assert.equal(game.gp.potion_unkn, 1);
        assert.ok(getRngLog().every((entry) => /^rn2\(19\)=/u.test(entry)),
            'only exercise() attribute checks draw on this ordinary branch');
    });
