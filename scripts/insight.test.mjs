import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHA,
    A_CHAOTIC,
    A_DEX,
    A_LAWFUL,
    A_NEUTRAL,
    A_NONE,
    A_STR,
    ACID_RES,
    FLYING,
    FROMOUTSIDE,
    I_SPECIAL,
    INFRAVISION,
    WARN_OF_MON,
} from '../js/const.js';
import { getnow } from '../js/calendar.js';
import {
    align_str,
    attrval,
    attributes_enlightenment,
    cause_known,
    do_gamelog,
    doconduct,
    dovanquished,
    enlightenment,
    fmt_elapsed_time,
    list_vanquished,
    N_times,
    num_genocides,
    set_vanq_order,
    size_str,
    show_gamelog,
    show_conduct,
    sokoban_in_play,
    vanqsort_cmp,
    record_achievement,
    UnsupportedEnlightenmentError,
} from '../js/insight.js';
import { from_what } from '../js/attrib.js';
import { describe_level } from '../js/display.js';
import { GameDisplay } from '../js/game_display.js';
import { item_what } from '../js/zap.js';
import { gamelog_add, livelog_printf } from '../js/pline.js';
import { initUnported } from '../js/unported.js';
import {
    ART_GRAYSWANDIR,
} from '../js/artifacts.js';
import {
    BASICENLIGHTENMENT,
    ENL_GAMEINPROGRESS,
    ENL_GAMEOVERDEAD,
    EXT_ENCUMBER,
    FIRE_RES,
    FIXED_ABIL,
    FREE_ACTION,
    HALLUC_RES,
    HVY_ENCUMBER,
    LEVITATION,
    LL_ACHIEVE,
    LL_CONDUCT,
    LL_SPOILER,
    ACH_SOKO,
    G_GENOD,
    ACH_BELL,
    ACH_MINE_PRIZE,
    ACH_RNK4,
    LIFESAVED,
    MAGICENLIGHTENMENT,
    MOD_ENCUMBER,
    OVERLOADED,
    POLYMORPH,
    REFLECTING,
    SEARCHING,
    SLEEPY,
    SLT_ENCUMBER,
    UNCHANGING,
    W_AMUL,
    W_ARMOR,
    W_WEP,
    VANQ_ALPHA_SEP,
    VANQ_COUNT_H_L,
    VANQ_COUNT_L_H,
    VANQ_MCLS_HTOL,
    VANQ_MCLS_LTOH,
    VANQ_MLVL_MNDX,
    VANQ_MSTR_MNDX,
} from '../js/const.js';
import { inv_weight, near_capacity, weight_cap } from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    AD_ACID,
    M1_BREATHLESS,
    M1_OVIPAROUS,
    M2_DEMON,
    G_UNIQ,
    PM_VAMPIRE,
    PM_VAMPIRE_BAT,
    PM_HIGH_CLERIC,
    PM_WOLF,
} from '../js/monsters.js';
import {
    AMULET_OF_RESTFUL_SLEEP,
    AMULET_CLASS,
    ARMOR_CLASS,
    COIN_CLASS,
    DAGGER,
    DWARVISH_CLOAK,
    GREEN_DRAGON_SCALE_MAIL,
    GREEN_DRAGON_SCALES,
    KATANA,
    LONG_SWORD,
    LUCKSTONE,
    RIN_SUSTAIN_ABILITY,
    RING_CLASS,
    RING_MAIL,
    SHORT_SWORD,
    SILVER_DRAGON_SCALE_MAIL,
    objects_globals_init,
    TOWEL,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    P_BASIC,
    P_EXPERT,
    P_ISRESTRICTED,
    P_LONG_SWORD,
    P_SHORT_SWORD,
    P_SKILLED,
    P_TWO_WEAPON_COMBAT,
    P_UNSKILLED,
} from '../js/const.js';
import { skillSlot } from '../js/startup_skills.js';
import { ROOMOFFSET, SHOPBASE, W_ARM, W_ARMC } from '../js/const.js';
import { costly_spot } from '../js/shk.js';
import {
    monst_globals_init,
    MZ_GIGANTIC,
    MZ_HUGE,
    MZ_LARGE,
    MZ_MEDIUM,
    MZ_SMALL,
    MZ_TINY,
} from '../js/monsters.js';

// The generated monster catalog on a state of its own, so the size sweep
// below reads every species without touching the running game.
function monsterCatalog() {
    const state = {};
    monst_globals_init(state);
    return state;
}

test('describe_level preserves C branch and dflgs formatting', () => {
    // botl.c:441-477. This helper is pure: it only reads the level topology
    // and returns the text that do.c puts into a Chronicle event.
    const state = {
        u: { uz: { dnum: 0, dlevel: 3 } },
        dungeons: [
            { dname: 'The Dungeons', depth_start: 1 },
            { dname: 'The Quest', depth_start: 1 },
            { dname: 'The Endgame', depth_start: -5 },
        ],
        quest_dnum: 1,
        astral_level: { dnum: 2, dlevel: 1 },
        knox_level: { dnum: 0, dlevel: 99 },
    };
    assert.equal(describe_level(0, state), 'Dlvl:3 ');
    assert.equal(describe_level(1, state), 'Dlvl:3  ');
    assert.equal(describe_level(2, state), 'level 3, the Dungeons');

    state.tutorial_dnum = 0;
    assert.equal(describe_level(0, state), 'Tutorial:3 ');

    state.u.uz = { dnum: 1, dlevel: 2 };
    assert.equal(describe_level(2, state), 'Home 2, the Quest');

    state.u.uz = { dnum: 2, dlevel: 2 };
    assert.equal(describe_level(0, state), 'Water');
    assert.equal(describe_level(2, state), 'Plane of Water');

    state.u.uz = { dnum: 0, dlevel: 99 };
    assert.equal(describe_level(2, state), 'The Dungeons');
});

test('align_str names the four alignments insight.c switches on', () => {
    // insight.c align_str(); the default arm covers every other value.
    assert.equal(align_str(A_CHAOTIC), 'chaotic');
    assert.equal(align_str(A_NEUTRAL), 'neutral');
    assert.equal(align_str(A_LAWFUL), 'lawful');
    assert.equal(align_str(A_NONE), 'unaligned');
    assert.equal(align_str(7), 'unknown');
});

test('size_str names the six monster sizes monflag.h defines', () => {
    // insight.c size_str() over monflag.h:177-183. The values are read from
    // that header rather than from the switch's own order: MZ_GIGANTIC is 7,
    // not 5, so 5 and 6 fall to the default arm C keeps for a bad value.
    assert.equal(size_str(MZ_TINY), 'tiny');
    assert.equal(size_str(MZ_SMALL), 'small');
    assert.equal(size_str(MZ_MEDIUM), 'medium');
    assert.equal(size_str(MZ_LARGE), 'large');
    assert.equal(size_str(MZ_HUGE), 'huge');
    assert.equal(size_str(MZ_GIGANTIC), 'gigantic');
    // MZ_HUMAN is monflag.h:180's second spelling of MZ_MEDIUM, so it needs no
    // arm; 5 is the gap below MZ_GIGANTIC.
    assert.equal(size_str(5), 'unknown size (5)');

    // Every species in the catalog lands on one of the six named arms, so no
    // real monster can reach that default.
    for (const species of monsterCatalog().mons) {
        assert.ok(!size_str(species.msize).startsWith('unknown'),
            species.pmnames[2] ?? String(species.pmidx));
    }
});

test('attrval renders Strength on its own scale', () => {
    // insight.c attrval(). 18 is the last value printed plainly; 19 through
    // 118 are the "18/xx" percentile band, where 118 is STR18(100); above
    // that, 119 through 125 print as 19 through 25.
    assert.equal(attrval(A_STR, 3), '3');
    assert.equal(attrval(A_STR, 18), '18');
    assert.equal(attrval(A_STR, 19), '18/01');
    assert.equal(attrval(A_STR, 68), '18/50');
    assert.equal(attrval(A_STR, 118), '18/100');
    assert.equal(attrval(A_STR, 119), '19');
    assert.equal(attrval(A_STR, 125), '25');
    // Every other characteristic prints its value unchanged, including one
    // above 18, which the Strength band would otherwise reformat.
    assert.equal(attrval(A_CHA, 18), '18');
    assert.equal(attrval(A_CHA, 19), '19');
});

function elapsedState(realtime) {
    // The recorder's fixed clock makes getnow() constant, so setting
    // start_timing to it leaves fmt_elapsed_time() reporting realtime alone.
    const state = {
        fixedDatetime: '20310203040506',
        recorderIsDst: false,
        urealtime: { realtime, start_timing: 0 },
    };
    state.urealtime.start_timing = getnow(state);
    return state;
}

test('fmt_elapsed_time formats the cases insight.c documents', () => {
    // The six examples in insight.c fmt_elapsed_time()'s own comment, given
    // as D-HH:MM:SS, plus the " none" fallback for a game that has just
    // started. ENL_GAMEINPROGRESS is 0, the value doattributes() passes.
    for (const [seconds, expected] of [
        [0, ' none'], /* 0-00:00:00 */
        [20, ' 20 seconds'], /* 0-00:00:20 */
        [15 * 60 + 5, ' 15 minutes and 5 seconds'], /* 0-00:15:05 */
        [16 * 60, ' 16 minutes'], /* 0-00:16:00 */
        [3600 + 15 * 60 + 10,
            ' 1 hour, 15 minutes and 10 seconds'], /* 0-01:15:10 */
        [2 * 3600 + 1, ' 2 hours and 1 second'], /* 0-02:00:01 */
        [3 * 86400 + 25 * 60 + 40,
            ' 3 days, 25 minutes and 40 seconds'], /* 3-00:25:40 */
    ]) {
        assert.equal(
            fmt_elapsed_time(0, elapsedState(seconds)),
            expected,
            `${seconds} seconds`,
        );
    }
});

test('fmt_elapsed_time counts time elapsed since start_timing', () => {
    // C adds timet_delta(getnow(), start_timing) whenever the game is still
    // in progress, so a start_timing 90 seconds in the past reads as 1
    // minute and 30 seconds even with realtime at zero.
    const state = elapsedState(0);
    state.urealtime.start_timing -= 90;
    assert.equal(fmt_elapsed_time(0, state), ' 1 minute and 30 seconds');
});

// A live game at a ready D:1 prompt. status_enlightenment()'s arms below read
// inventory, encumbrance and the wielded weapon, none of which a hand-built
// state supplies, so these drive the real startup and then set the one field
// under test. `pettype:none` keeps a pet off the square the hero starts on.
async function readyGame(options = '', ...configLines) {
    await runSegment({
        seed: 8810051,
        datetime: '20260304100000',
        nethackrc: 'OPTIONS=name:Insight,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + `pettype:none${options ? `,${options}` : ''}\n`
            + configLines.map((line) => `${line}\n`).join(''),
        moves: '',
    });
    return game;
}

function statusLine(lines, prefix) {
    return lines.find((line) => line.startsWith(prefix));
}

// insight.c weapon_insight(): `what` comes from weapon_descr(), and the line
// reads "wielding <an(what)>" for a single item but "wielding <makeplural>"
// for a stack. No role starts wielding a stack, so only a test pins it.
test('weapon_insight pluralizes a wielded stack', async () => {
    const state = await readyGame();
    state.uwep = {
        otyp: DAGGER, oclass: WEAPON_CLASS, quan: 2, spe: 0, known: true,
    };
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' You are wielding'),
        ' You are wielding daggers.',
    );

    state.uwep.quan = 1;
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' You are wielding'),
        ' You are wielding a dagger.',
    );
});

// insight.c weapon_insight() reads "wielding some <what>" when weapon_descr()
// answers a bare class name, which it does for armor, food and venom.
test('weapon_insight reports a wielded class name with "some"', async () => {
    const state = await readyGame();
    state.uwep = {
        otyp: 0, oclass: ARMOR_CLASS, quan: 1, spe: 0, known: true,
    };
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' You are wielding'),
        ' You are wielding some armor.',
    );
});

// obj.h is_wet_towel(o) is (otyp == TOWEL && spe > 0). weapon.c weapon_descr()
// lists TOWEL among the P_NONE overrides, so a dry towel prints its object
// name; only a wet one needs the unported wording.
test('a dry towel prints its name and a wet one stops', async () => {
    const state = await readyGame();
    state.uwep = {
        otyp: TOWEL, oclass: 8 /* TOOL_CLASS */, quan: 1, spe: 0, known: true,
    };
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' You are wielding'),
        ' You are wielding a towel.',
    );

    state.uwep.spe = 1;
    await assert.rejects(
        () => enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === 'is_wet_towel()',
    );
});

// insight.c one_characteristic():862-866 hides a characteristic's base and
// peak only when Fixed_abil holds *and* stuck_ring() names something that
// keeps a ring of sustain ability on. youprop.h:385 defines Fixed_abil as the
// extrinsic alone; there is no HFixed_abil term, so an intrinsic in that slot
// leaves the values on show however the rings sit.
test('Fixed_abil hides base and peak only through a stuck ring', async () => {
    const state = await readyGame();
    // A peak above the current value is what makes the parenthesis appear:
    // one_characteristic() prints "peak:" when abase != apeak. This hero's
    // Dexterity is 9 and its race limit is the uninteresting 18, so +3 is the
    // smallest change that puts a visible clause on the line.
    state.u.amax.a[A_DEX] = state.u.acurr.a[A_DEX] + 3;
    const dexterity = async () => statusLine(
        await enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        ' Your dexterity is',
    );
    const shown = ' Your dexterity is 9 (current; peak:12).';
    const hidden = ' Your dexterity is 9.';
    assert.equal(await dexterity(), shown, 'no Fixed_abil hides nothing');

    state.u.uprops[FIXED_ABIL] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    // do_wear.c stuck_ring() answers the ring itself when it is cursed, which
    // is the shortest route to a stuck ring: no gloves, no welded weapon.
    state.uright = {
        otyp: RIN_SUSTAIN_ABILITY, oclass: RING_CLASS, quan: 1, cursed: 1,
    };
    assert.equal(await dexterity(), shown,
        'an intrinsic-only Fixed_abil is FALSE');

    state.u.uprops[FIXED_ABIL] = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    assert.equal(await dexterity(), hidden,
        'a cursed ring on the right hand sticks');

    // C asks about both hands, so the left slot alone must hide them too.
    state.uleft = state.uright;
    state.uright = null;
    assert.equal(await dexterity(), hidden,
        'a cursed ring on the left hand sticks');

    state.uleft.cursed = 0;
    assert.equal(await dexterity(), shown,
        'an uncursed ring comes off at will');
});

// insight.c enlightenment() describes a polymorphed hero's form and reads the
// hit points from u.mh, neither of which is ported, so the window stops before
// it opens. const.js Upolyd() takes the hero rather than the game: handing it
// the game compares two absent fields, answers false, and prints a window that
// C would have filled differently, so the guard needs a test of its own.
test('a polymorphed hero stops the attributes window', async () => {
    const state = await readyGame();
    // The same hero unpolymorphed reaches the window, so the throw below
    // belongs to this guard and not to an earlier stop.
    assert.ok(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' You are'),
    );

    state.u.umonnum = state.u.umonster + 1;
    await assert.rejects(
        () => enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === 'a polymorphed hero',
    );
});

// youprop.h:125 defines Deaf as (HDeaf || EDeaf || u.uroleplay.deaf).
// OPTIONS=deaf sets only the third term, which u.uprops never sees, so a
// property-only guard would print a window C would have given a deafness line.
test('OPTIONS=deaf reaches the deafness stop', async () => {
    const state = await readyGame('deaf');
    assert.equal(state.u.uroleplay.deaf, true);
    await assert.rejects(
        () => enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === 'the deafness status',
    );
});

// insight.c status_enlightenment()'s encumbrance arm. hack.c calc_capacity()
// answers (wt * 2 / gw.wc) + 1 capped at OVERLOADED, so a weight of
// ceil(gw.wc * (cap - 1) / 2) over capacity lands on each level in turn. No
// starting pack is heavy enough to reach any of them.
test('every encumbrance level prints its own adjective', async () => {
    const state = await readyGame();
    // Expected wording read from insight.c: enc_stat[] supplies the first
    // word, the adjective comes from C's switch, and " slowed" is appended
    // for every level except OVERLOADED.
    const expected = [
        [SLT_ENCUMBER, ' You are burdened; movement is slightly slowed.'],
        [MOD_ENCUMBER, ' You are stressed; movement is moderately slowed.'],
        [HVY_ENCUMBER, ' You are strained; movement is very slowed.'],
        [EXT_ENCUMBER, ' You are overtaxed; movement is extremely slowed.'],
        [OVERLOADED, ' You are overloaded; movement is not possible.'],
    ];
    const ballast = {
        otyp: DAGGER, oclass: WEAPON_CLASS, quan: 1, spe: 0, owt: 0,
        nobj: null,
    };
    ballast.nobj = state.invent;
    state.invent = ballast;

    for (const [cap, line] of expected) {
        const capacity = weight_cap(state);
        // The lightest excess weight that calc_capacity() maps to `cap`.
        const excess = Math.ceil((capacity * (cap - 1)) / 2) + 1;
        ballast.owt = 0;
        ballast.owt = excess - inv_weight(state);
        assert.equal(near_capacity(state), cap, `weight for ${line}`);
        const lines = await enlightenment(
            BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
        );
        assert.equal(
            lines.find((text) => /^ You are \w+; movement /u.test(text)),
            line,
        );
    }
});

// C ref: insight.c basics_enlightenment()'s autopickup line (804-822). The
// value column reports flags.pickup_types through oc_to_str(), so the line
// spells the classes rather than the indices the field holds.
test('the autopickup line reports the pickup_types class list', async () => {
    const state = await readyGame();
    assert.equal(state.flags.pickup, false);
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' Autopickup '),
        ' Autopickup is off.',
    );

    // An empty list is "all types", and C shows " plus thrown" only when the
    // list is a restriction, so pickup_thrown alone must not add it.
    state.flags.pickup = true;
    state.flags.pickup_thrown = true;
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' Autopickup '),
        ' Autopickup is on for all types.',
    );

    // Two classes, quoted, with the thrown suffix the restriction now earns.
    state.flags.pickup_types = [WEAPON_CLASS, ARMOR_CLASS];
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' Autopickup '),
        " Autopickup is on for ')[' plus thrown.",
    );

    state.flags.pickup_thrown = false;
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' Autopickup '),
        " Autopickup is on for ')['.",
    );
});

// C ref: insight.c basics_enlightenment() (808-819), whose autopickup line is
// an if/else on costly_spot(): inside a shop the line names the shop and
// nothing else, so neither the class list, " plus thrown" nor ", with
// exceptions" can follow it.
test('the autopickup line reports a shop instead of the class list',
    async () => {
        const state = await readyGame('autopickup');
        // shk.c costly_spot() reads five things, and the hero's own room
        // supplies all five once it is turned into a tended shop: the level's
        // has_shop flag, the room's rtype, the strict interior inside_shop()
        // demands, the resident shop_keeper() answers with, and the eshk
        // whose shoproom and shoplevel inhishop() matches. eshk.shk is the
        // shopkeeper's post, which the source excludes from "inside".
        const roomno = state.level.at(state.u.ux, state.u.uy).roomno;
        const room = state.level.rooms[roomno - ROOMOFFSET];
        state.level.flags.has_shop = true;
        room.rtype = SHOPBASE;
        room.resident = {
            isshk: true,
            mx: state.u.ux,
            my: state.u.uy,
            mextra: {
                eshk: {
                    shoproom: roomno,
                    shoplevel: { ...state.u.uz },
                    shk: { x: 0, y: 0 },
                },
            },
        };
        assert.equal(costly_spot(state.u.ux, state.u.uy, state), true);

        // Both suffixes the else arm can add are armed, so a port that ran
        // the else arm anyway would show them.
        state.flags.pickup_thrown = true;
        state.flags.pickup_types = [WEAPON_CLASS];
        assert.equal(
            statusLine(
                await enlightenment(
                    BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
                ),
                ' Autopickup ',
            ),
            ' Autopickup is on, but temporarily disabled while inside'
                + ' the shop.',
        );

        // Stepping onto the shopkeeper's post leaves the shop room but not
        // its interior, which is the one square costly_spot() excludes, so
        // the else arm runs there.
        room.resident.mextra.eshk.shk = { x: state.u.ux, y: state.u.uy };
        assert.equal(costly_spot(state.u.ux, state.u.uy, state), false);
        assert.equal(
            statusLine(
                await enlightenment(
                    BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
                ),
                ' Autopickup ',
            ),
            " Autopickup is on for ')' plus thrown.",
        );
    });

// C ref: options.c optfn_pickup_types(), which turns the option's class
// symbols into the class indices insight.c oc_to_str() reads.
test('the autopickup line consumes configured pickup_types', async () => {
    const state = await readyGame('autopickup,pickup_types:$"');
    assert.deepEqual(state.flags.pickup_types, [COIN_CLASS, AMULET_CLASS]);
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' Autopickup ',
        ),
        " Autopickup is on for '$\"' plus thrown.",
    );
});

// C ref: insight.c basics_enlightenment() (817-818), `if (ga.apelist)
// Strcat(buf, ", with exceptions")`. cfgfiles.c cnf_line_AUTOPICKUP_EXCEPTION()
// appends the list node during startup.
test('the autopickup line reports a configured exception list', async () => {
    const state = await readyGame(
        'autopickup', 'AUTOPICKUP_EXCEPTION="<scroll of scare monster"',
    );
    assert.deepEqual(state.unportedConfigStatements, []);
    assert.deepEqual(
        { pattern: state.ga.apelist.pattern, grab: state.ga.apelist.grab },
        { pattern: 'scroll of scare monster', grab: true },
    );
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
            ),
            ' Autopickup ',
        ),
        ' Autopickup is on for all types, with exceptions.',
    );

    // Without the statement the same game reports the empty list, which is
    // what makes the stop above a statement test rather than a blanket one.
    const plain = await readyGame('autopickup');
    assert.equal(
        statusLine(
            await enlightenment(
                BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, plain,
            ),
            ' Autopickup '),
        ' Autopickup is on for all types.',
    );
});

// insight.c weapon_insight():1334-1463, the arm that reports weapon skill
// while u.twoweap is set. Its comparisons turn on values that no ported
// command can move: u_init.c skill_init() fixes every skill at character
// creation, weapon.c enhance_weapon_skill() needs practice and weapon slots a
// fresh hero has neither of, and cmd.c dispatches neither dowield() nor
// doswapweapon(), so the hero's hands hold the pair u_init.c put there. Every
// fresh C start therefore lands on `twoskl < sklvl` at :1362 with
// `wtype2 != wtype`, which scripts/run-twoweapon-command.mjs records against
// C; the states around it are built here instead. QUALITY.json carries the
// deferral.
function wielded(otyp) {
    return { otyp, oclass: WEAPON_CLASS, quan: 1, spe: 0, known: true };
}

async function skillReport({
    primary = KATANA,
    secondary = SHORT_SWORD,
    skills,
    weaponSlots = 0,
    wizard = false,
}) {
    const state = await readyGame();
    state.wizard = wizard;
    state.u.twoweap = true;
    state.u.weapon_slots = weaponSlots;
    state.uwep = wielded(primary);
    state.uswapwep = wielded(secondary);
    for (const entry of skills) {
        const slot = skillSlot(entry.skill, state);
        slot.skill = entry.level;
        // P_EXPERT leaves room to advance above every level used below, so
        // only `advance` decides can_advance() at :1437-1439.
        slot.max_skill = entry.max ?? P_EXPERT;
        slot.advance = entry.advance ?? 0;
    }
    const lines = await enlightenment(
        BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
    );
    const wielding = lines.indexOf(' You are wielding two weapons at once.');
    assert.notEqual(wielding, -1, 'the hero is not reported as two-weaponing');
    // status_enlightenment() closes with the blank separator that opens the
    // Miscellaneous section, so the skill report is what lies between.
    return lines.slice(wielding + 1, lines.indexOf('', wielding));
}

// :1362 and :1367 are the two directions of the same comparison, and they
// swap which skill the sentence blames. `sklvlbuf` at :1372 is the primary's
// own level name, which only the second direction prints.
test('the two-weapon report blames whichever skill lags', async () => {
    assert.deepEqual(
        await skillReport({
            skills: [
                { skill: P_LONG_SWORD, level: P_BASIC },
                { skill: P_SHORT_SWORD, level: P_BASIC },
                { skill: P_TWO_WEAPON_COMBAT, level: P_UNSKILLED },
            ],
        }),
        [
            ' Your skill in long sword is limited by being unskilled with'
                + ' two weapons.',
            ' Your skill in short sword is also limited by being unskilled'
                + ' with two weapons.',
        ],
    );

    // The other direction. :1376 sets `also2` where :1366 set `also`, so the
    // "also" still lands on the second line and not the first.
    assert.deepEqual(
        await skillReport({
            skills: [
                { skill: P_LONG_SWORD, level: P_BASIC },
                { skill: P_SHORT_SWORD, level: P_BASIC },
                { skill: P_TWO_WEAPON_COMBAT, level: P_SKILLED },
            ],
        }),
        [
            ' Your two weapon skill is limited by being basic with'
                + ' long sword.',
            ' Your two weapon skill is also limited by being basic with'
                + ' short sword.',
        ],
    );
});

// :1371-1374 and :1404-1407. A restricted skill has no level name to print,
// so both comparisons fall back to "having no skill" instead.
test('a restricted weapon skill reads "having no skill"', async () => {
    assert.deepEqual(
        await skillReport({
            skills: [
                { skill: P_LONG_SWORD, level: P_ISRESTRICTED },
                { skill: P_SHORT_SWORD, level: P_ISRESTRICTED },
                { skill: P_TWO_WEAPON_COMBAT, level: P_UNSKILLED },
            ],
        }),
        [
            ' Your two weapon skill is limited by having no skill with'
                + ' long sword.',
            ' Your two weapon skill is also limited by having no skill with'
                + ' short sword.',
        ],
    );
});

// :1377-1380 and :1409-1422. Equal levels leave nothing to blame, so the
// report folds the two-weapon skill into the sentence the single-weapon arm
// above would have printed, and :1417's `also3` turns the second line into an
// enl_msg() whose verb comes from `hav2` rather than a you_have()/you_are().
test('matching skill levels fold "and two weapons" into the line',
    async () => {
        assert.deepEqual(
            await skillReport({
                skills: [
                    { skill: P_LONG_SWORD, level: P_BASIC },
                    { skill: P_SHORT_SWORD, level: P_BASIC },
                    { skill: P_TWO_WEAPON_COMBAT, level: P_BASIC },
                ],
            }),
            [
                ' You have basic skill with long sword and two weapons.',
                ' You also have basic skill with short sword and'
                    + ' two weapons.',
            ],
        );

        // :1314 and :1344 make `hav` and `hav2` false at P_UNSKILLED, which
        // swaps every "have" for "are" and "skill with" for "in".
        assert.deepEqual(
            await skillReport({
                skills: [
                    { skill: P_LONG_SWORD, level: P_UNSKILLED },
                    { skill: P_SHORT_SWORD, level: P_UNSKILLED },
                    { skill: P_TWO_WEAPON_COMBAT, level: P_UNSKILLED },
                ],
            }),
            [
                ' You are unskilled in long sword and two weapons.',
                ' You also are unskilled in short sword and two weapons.',
            ],
        );
    });

// :1350-1358. A hero two-weaponing without access to the skill reads
// "restricted" rather than skill_level_name()'s "Unknown", and :1351 then
// compares as though the skill were unskilled.
test('a restricted two-weapon skill reads "restricted"', async () => {
    assert.deepEqual(
        await skillReport({
            skills: [
                { skill: P_LONG_SWORD, level: P_BASIC },
                { skill: P_SHORT_SWORD, level: P_BASIC },
                { skill: P_TWO_WEAPON_COMBAT,
                  level: P_ISRESTRICTED, max: P_ISRESTRICTED },
            ],
        }),
        [
            ' Your skill in long sword is limited by being restricted with'
                + ' two weapons.',
            ' Your skill in short sword is also limited by being restricted'
                + ' with two weapons.',
        ],
    );
});

// :1390 skips the whole secondary comparison when both hands train one skill,
// and :1438 forces `a2` false for the same reason, so the summary can name at
// most the primary and the two-weapon skill.
test('one skill in both hands leaves a single comparison', async () => {
    assert.deepEqual(
        await skillReport({
            // A katana and a long sword are both P_LONG_SWORD.
            primary: KATANA,
            secondary: LONG_SWORD,
            weaponSlots: 5,
            skills: [
                // 80 is practice_needed_to_advance(P_BASIC), and 5 slots
                // cover the 2 that slots_required() asks at P_BASIC.
                { skill: P_LONG_SWORD, level: P_BASIC, advance: 80 },
                { skill: P_TWO_WEAPON_COMBAT, level: P_BASIC, advance: 80 },
            ],
        }),
        [
            ' You have basic skill with long sword and two weapons.',
            ' You can enhance skills with long sword and also with'
                + ' two weapons.',
        ],
    );
});

// :1440-1461. The five shapes the six-argument Sprintf produces, selected by
// which of a1, a2 and ab are set. Every case shares one base state, so the
// only thing that moves between them is which skills have the practice.
test('the enhancement summary names one, two or three skills', async () => {
    const base = {
        weaponSlots: 5,
        skills: [
            { skill: P_LONG_SWORD, level: P_BASIC },
            { skill: P_SHORT_SWORD, level: P_BASIC },
            { skill: P_TWO_WEAPON_COMBAT, level: P_BASIC },
        ],
    };
    // practice_needed_to_advance(P_BASIC) is 2 * 2 * 20; one point short
    // leaves can_advance() false at :1437-1439.
    const advanced = (...names) => ({
        ...base,
        skills: base.skills.map((entry) => ({
            ...entry, advance: names.includes(entry.skill) ? 80 : 79,
        })),
    });
    const summary = async (...names) =>
        (await skillReport(advanced(...names))).at(-1);

    // Case 5: all three, with no "also"s and no repeated "with".
    assert.equal(
        await summary(P_LONG_SWORD, P_SHORT_SWORD, P_TWO_WEAPON_COMBAT),
        ' You can enhance skills with long sword, short sword, and'
            + ' two weapons.',
    );
    // Case 2: primary and secondary.
    assert.equal(
        await summary(P_LONG_SWORD, P_SHORT_SWORD),
        ' You can enhance skills with long sword and also with short sword.',
    );
    // Case 3: primary and two-weapon, where the empty secondary name has to
    // leave no gap behind it.
    assert.equal(
        await summary(P_LONG_SWORD, P_TWO_WEAPON_COMBAT),
        ' You can enhance skills with long sword and also with two weapons.',
    );
    // Case 4: secondary and two-weapon, where the empty primary name comes
    // first and its separator has to stay empty too.
    assert.equal(
        await summary(P_SHORT_SWORD, P_TWO_WEAPON_COMBAT),
        ' You can enhance skills with short sword and also with two weapons.',
    );
    // Case 1, twice: a single skill drops the plural and both separators.
    assert.equal(
        await summary(P_TWO_WEAPON_COMBAT),
        ' You can enhance skill with two weapons.',
    );
    assert.equal(
        await summary(P_SHORT_SWORD),
        ' You can enhance skill with short sword.',
    );
    // None: :1440 prints nothing at all, so the report ends on the secondary
    // comparison.
    assert.equal(
        await summary(),
        ' You also have basic skill with short sword and two weapons.',
    );
});

// :1437-1439 ask can_advance() with `speedy` FALSE, so weapon.c:1163's
// wizard-mode "advance skills without practice" shortcut never reaches the
// report: a wizard is told what an ordinary hero would be told. js/weapon.js
// raises UnsupportedWeaponSkillError for that shortcut rather than porting it,
// which is what makes the argument observable here.
//
// The window itself is driven through enlightenment() rather than `^X`,
// because insight.c doattributes():2014-2015 turns a wizard's `^X` into a
// MAGICENLIGHTENMENT window that js/insight.js:923 refuses. Only the skill
// report is read: the wizard-gated lines elsewhere in the window are not
// ported, so the rest of this state's C output is not claimed to match.
test('the enhancement summary never takes the wizard shortcut', async () => {
    assert.deepEqual(
        await skillReport({
            wizard: true,
            weaponSlots: 5,
            skills: [
                { skill: P_LONG_SWORD, level: P_BASIC, advance: 80 },
                { skill: P_SHORT_SWORD, level: P_BASIC, advance: 80 },
                { skill: P_TWO_WEAPON_COMBAT, level: P_BASIC, advance: 80 },
            ],
        }),
        [
            ' You have basic skill with long sword and two weapons.',
            ' You also have basic skill with short sword and two weapons.',
            ' You can enhance skills with long sword, short sword, and'
                + ' two weapons.',
        ],
    );
});

// A live explore-mode game, which is what insight.c doattributes():2014-2015
// turns into a MAGICENLIGHTENMENT window. The helper below supplies a real
// startup state, while direct property setup below reaches source branches
// that character creation does not select on its own.
async function readyExploreGame(role = 'Caveman') {
    await runSegment({
        seed: 8810073,
        datetime: '20260304100000',
        nethackrc: `OPTIONS=name:Insight,role:${role},race:human,`
            + 'gender:male,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none\nOPTIONS=playmode:explore\n',
        moves: '',
    });
    return game;
}

const MAGIC = BASICENLIGHTENMENT | MAGICENLIGHTENMENT;

function attributeSection(lines) {
    const start = lines.indexOf('Attributes:');
    return start === -1 ? [] : lines.slice(start + 1, lines.indexOf('', start));
}

// The attributes_enlightenment() lines are checked in source order. The fresh
// matrix records the same window against C; this pins it without a recorder so
// a change is caught by `npm test`.
test('the magic half prints the source attributes in order', async () => {
    const state = await readyExploreGame();
    const lines = await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state);
    assert.deepEqual(attributeSection(lines), [
        // piousness(TRUE, "aligned") at a Caveman's role.c initrecord of 0.
        ' You are nominally aligned.',
        // mc_types[1], from the leather armor's objects.c a_can of 1.
        ' You are warded.',
        // u.ublesscnt is 300, so pray.c:2151 answers "too soon" and can_pray()
        // is FALSE; enlght_line() then contracts " can not " to " can't ".
        " You can't safely pray.",
    ]);
    // insight.c:1800 skips the whole block when the factor is 0, so the
    // Tourist's window carries the same section one line shorter. Without the
    // `> 0` the section would show mc_types[0], an empty "You are .".
    const tourist = await readyExploreGame('Tourist');
    assert.deepEqual(
        attributeSection(await enlightenment(MAGIC, ENL_GAMEINPROGRESS,
            tourist)),
        [' You are nominally aligned.', " You can't safely pray."],
    );

    // enlightenment():428-447's reminder block, which only explore mode and
    // debug mode reach.
    assert.deepEqual(lines.slice(lines.indexOf('Miscellaneous:') + 1), [
        ' You are running in explore mode.',
        " You haven't encountered any bones levels.",
        ' Total elapsed playing time is none.',
    ]);
});

// insight.c:1559-1561. The Halluc_resistance branch belongs to the complete
// attributes_enlightenment() function, and a wizard's from_what() call names
// the worn non-artifact that contributes its extrinsic bit.
test('attributes enlightenment reports Halluc_resistance and its source',
    async () => {
        const state = await readyExploreGame();
        state.wizard = true;
        const scales = {
            otyp: SILVER_DRAGON_SCALE_MAIL,
            oclass: ARMOR_CLASS,
            owornmask: W_ARMC,
            dknown: true,
            nobj: state.invent,
        };
        state.invent = scales;
        state.uarmc = scales;
        state.u.uprops[HALLUC_RES] = {
            intrinsic: 0,
            extrinsic: W_ARMC,
            blocked: 0,
        };
        const lines = attributeSection(
            await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state),
        );
        assert.ok(lines.some((line) => line.includes('resist hallucinations')),
            'the Halluc_resistance line is emitted');
        assert.ok(lines.some((line) => line.includes(
            'because of the silver dragon scale mail',
        )), 'wizard source wording identifies the worn scales');
    });

// attrib.c:953-957 delegates artifact wording to objnam.c
// bare_artifactname(). Grayswandir is the artifact in the fixed seed0361
// attributes window; the direct state below pins that source branch without
// coupling the unit test to a recorded input sequence.
test('from_what names an artifact source', async () => {
    const state = await readyExploreGame();
    const weapon = {
        otyp: LONG_SWORD,
        oartifact: ART_GRAYSWANDIR,
        owornmask: W_WEP,
        quan: 1,
        nobj: state.invent,
    };
    state.invent = weapon;
    state.uwep = weapon;
    state.wizard = true;
    state.u.uprops[HALLUC_RES] = {
        intrinsic: 0, extrinsic: W_WEP, blocked: 0,
    };
    assert.equal(from_what(HALLUC_RES, state), ' because of Grayswandir');
});

// insight.c:1612-1613. The Searching property is reported in the same
// production attributes window after Halluc_resistance and keeps wizard-mode
// source wording through attrib.c from_what().
test('attributes enlightenment reports automatic searching', async () => {
    const state = await readyExploreGame();
    state.wizard = true;
    state.u.uprops[SEARCHING] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    const lines = attributeSection(
        await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state),
    );
    assert.ok(lines.some((line) => line.includes('automatic searching')),
        'the Searching branch is emitted');
});

// insight.c:1900. Reflection is a movement/non-armor capability in the
// attributes window and is emitted through the production caller.
test('attributes enlightenment reports reflection', async () => {
    const state = await readyExploreGame();
    state.u.uprops[REFLECTING] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    const lines = attributeSection(
        await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state),
    );
    assert.ok(lines.some((line) => line.includes('reflection')),
        'the Reflecting branch is emitted');
});

// insight.c:1902-1906. Free action, fixed abilities and lifesaving are
// adjacent capability branches and keep their source order in the report.
test('attributes enlightenment reports adjacent capabilities', async () => {
    const state = await readyExploreGame();
    // youprop.h defines all three branches from their extrinsic bits.
    state.u.uprops[FREE_ACTION] = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    state.u.uprops[FIXED_ABIL] = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    state.u.uprops[LIFESAVED] = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    const lines = attributeSection(
        await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state),
    );
    const free = lines.findIndex((line) => line.includes('free action'));
    const fixed = lines.findIndex((line) => line.includes('fixed abilities'));
    const saved = lines.findIndex((line) => line.includes('life will be saved'));
    assert.ok(free >= 0, 'the Free_action branch is emitted');
    assert.ok(fixed > free, 'Fixed_abil follows Free_action');
    assert.ok(saved > fixed, 'Lifesaved follows Fixed_abil');
});

// insight.c:1509-1513. piousness() names how far the record has moved, and the
// sign of the record picks you_are() over you_have(). No role starts with a
// record C's recorder can put anywhere but 0 and 10, and every initrecord-10
// role stops the window for another reason, so both other arms need this test.
test('the piousness line names the record and picks its verb', async () => {
    const state = await readyExploreGame();
    const piousLine = async () => (
        attributeSection(await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state))
    )[0];
    assert.equal(await piousLine(), ' You are nominally aligned.');

    // insight.c:3243-3246: above 8 is "devoutly" from 14 and "fervently" from
    // 9, so 10 is the arm every initrecord-10 role would have shown.
    state.u.ualign.record = 10;
    assert.equal(await piousLine(), ' You are fervently aligned.');

    // A negative record takes you_have(), and piousness()'s showneg arm drops
    // the "aligned" suffix along with its space: insight.c:3264 appends the
    // suffix only when the record is not negative.
    state.u.ualign.record = -5;
    assert.equal(await piousLine(), ' You have sinned.');
});

// insight.c:1949. u_init.c:382 fixes u.ublesscnt at 300 and allmain.c spends
// one per turn, so the empty half of C's ternary is 300 turns away from any
// recorded start.
test('the prayer line drops "not" when a prayer would be safe', async () => {
    const state = await readyExploreGame();
    state.u.ublesscnt = 0;
    const lines = await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state);
    assert.equal(attributeSection(lines).at(-1), ' You can safely pray.');
    // pray.c:2160 reaches p_type 3 only through the "not in trouble" arm, so
    // the line above is the safe-prayer answer and not a coincidence.
    assert.equal(state.gp.p_type, 3);
});

// insight.c:1909-1928 keeps the permanent adjustment and luckstone timeout
// lines separate from the aggregate Luck line. The carrying() guard also
// means an uncursed carried stone reaches both zero-sign arms, as C writes it.
test('final dead enlightenment reports permanent and stone luck', async () => {
    const state = await readyExploreGame('Tourist');
    state.u.moreluck = 1;
    state.u.umortality = 1;
    state.invent = {
        otyp: LUCKSTONE,
        quan: 1,
        cursed: false,
        blessed: false,
        nobj: state.invent,
    };

    const allLines = await enlightenment(
        MAGIC, ENL_GAMEOVERDEAD, state,
    );
    const start = allLines.indexOf('Final Attributes:');
    const lines = allLines.slice(start + 1, allLines.indexOf('', start));
    assert.ok(lines.includes(' You had extra luck.'));
    assert.ok(lines.includes(' Bad luck did not time out for you.'));
    assert.ok(lines.includes(' Good luck did not time out for you.'));
});

// insight.c:416-421 gates the two halves of the window on separate mode bits,
// and enlightenment():428 gates the reminder block on the basic one alone.
test('each mode bit selects its own half of the window', async () => {
    const state = await readyExploreGame();
    const basic = await enlightenment(
        BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
    );
    assert.ok(basic.includes('Background:'));
    assert.ok(!basic.includes('Attributes:'));
    // The reminder block belongs to the basic half, so explore mode still
    // announces itself without any magic section above it.
    assert.ok(basic.includes(' You are running in explore mode.'));

    const magicOnly = await enlightenment(
        MAGICENLIGHTENMENT, ENL_GAMEINPROGRESS, state,
    );
    assert.ok(!magicOnly.includes('Background:'));
    assert.ok(!magicOnly.includes('Characteristics:'));
    assert.ok(magicOnly.includes('Attributes:'));
    // The reminder block is gated on BASICENLIGHTENMENT even in explore mode.
    assert.ok(!magicOnly.includes(' You are running in explore mode.'));
    assert.ok(magicOnly.includes('Status:'));
});

// enlightenment():435-446. Only the first two arms are reachable from a
// recorded start; u.uroleplay.numbones needs a bones file to have been loaded.
test('the bones reminder chooses between its three arms', async () => {
    const state = await readyExploreGame();
    const bonesLine = async () => (
        await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state)
    ).find((line) => line.includes('bones level'));
    assert.equal(await bonesLine(), " You haven't encountered any bones"
        + ' levels.');

    state.u.uroleplay.numbones = 1;
    assert.equal(await bonesLine(), ' You have encountered 1 bones level.');
    state.u.uroleplay.numbones = 2;
    assert.equal(await bonesLine(), ' You have encountered 2 bones levels.');

    // !bones wins over any count, because C tests it first.
    state.flags.bones = false;
    assert.equal(
        await bonesLine(), ' You have disabled loading of bones levels.',
    );
});

// Each case below reaches a branch whose predicate reads more than a single
// u.uprops bit. The complete attributes_enlightenment() port emits the C line
// and keeps processing the remainder of the window.
test('the magic half reports extended attributes', async () => {
    const state = await readyExploreGame();
    const linesOf = () => enlightenment(MAGIC, ENL_GAMEINPROGRESS, state);
    assert.ok((await linesOf()).includes('Attributes:'));

    // youprop.h:69 adds defended(&gy.youmonst, AD_DISE), which artifact.c:663
    // answers for green dragon scales and for no other armor.
    state.uarm = { otyp: GREEN_DRAGON_SCALE_MAIL, owornmask: W_ARM };
    assert.ok((await linesOf()).some((line) => line.includes('immune to sickness')));
    state.uarm = { otyp: GREEN_DRAGON_SCALES, owornmask: W_ARM };
    assert.ok((await linesOf()).some((line) => line.includes('immune to sickness')));
    state.uarm = null;

    // zap.c u_adtyp_resistance_obj()'s 90% arm, which needs no property at all.
    state.uarmc = { otyp: DWARVISH_CLOAK, owornmask: W_ARMC };
    assert.ok((await linesOf()).some((line) => line.includes('protected from')));
    state.uarmc = null;

    // insight.c:1926 `carrying(LUCKSTONE) || stone_luck(TRUE)`. A luckstone
    // moves neither u.uluck nor u.moreluck, so only the scan finds it.
    state.invent = { otyp: LUCKSTONE, quan: 1, nobj: state.invent };
    assert.ok((await linesOf()).some((line) => line.includes('not time out')));
    state.invent = state.invent.nobj;

    // youprop.h:275-281 reads the permonst for Breathless and Amphibious.
    state.youmonst.data.mflags1 |= M1_BREATHLESS;
    assert.ok((await linesOf()).some((line) => line.includes('survive without air')));
    state.youmonst.data.mflags1 &= ~M1_BREATHLESS;

    // youprop.h:27 Fire_resistance is (HFire_resistance || EFire_resistance),
    // so each field alone has to stop; FIRE_RES has no status_enlightenment()
    // row above, which is what makes this table the one that answers.
    for (const field of ['intrinsic', 'extrinsic']) {
        state.u.uprops[FIRE_RES] = {
            intrinsic: 0, extrinsic: 0, blocked: 0, [field]: 1,
        };
        assert.ok((await linesOf()).some((line) => line.includes('fire resistant')), field);
    }
    state.u.uprops[FIRE_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };

    // insight.c:1688 and :1707 fire on the blocked field alone, which
    // hasProperty()'s intrinsic-or-extrinsic answer would miss. Levitation is
    // where that shows: a hero carrying only the blocking term walks past
    // status_enlightenment()'s row and still produces a complete window.
    state.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 1 };
    assert.ok((await linesOf()).includes('Attributes:'));
    state.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };

    // insight.c:1975-1997 prints nothing while the game is in progress and the
    // hero has never died, so the count alone decides.
    state.u.umortality = 1;
    assert.ok((await linesOf()).some((line) => line.includes('have been killed')));
    state.u.umortality = 0;

    // insight.c:1770, :1782 and :1784 each print their own enlght_combatinc()
    // line, so any one of the three counters alone has to stop the window.
    for (const field of ['uhitinc', 'udaminc', 'uspellprot']) {
        state.u[field] = 1;
        assert.ok((await linesOf()).some((line) => line.includes('bonus')), field);
        state.u[field] = 0;
    }

    // youprop.h:407 Half_gas_damage needs a damp or wet towel: obj.h reads the
    // enchantment, so a dry one worn over the eyes prints nothing.
    state.ublindf = { otyp: TOWEL, spe: 0 };
    assert.ok(!(await linesOf()).some((line) => line.includes('poison gas')),
        'a dry towel damps no gas');
    state.ublindf.spe = 1;
    assert.ok((await linesOf()).some((line) => line.includes('poison gas')));
    state.ublindf = null;

    // insight.c:1879 needs the form and the gender together, so neither term
    // alone may stop the window.
    state.youmonst.data.mflags1 |= M1_OVIPAROUS;
    assert.ok(!(await linesOf()).some((line) => line.includes('lay eggs')),
        'an egg-laying form on a male hero');
    state.flags.female = true;
    assert.ok((await linesOf()).some((line) => line.includes('lay eggs')));
    state.youmonst.data.mflags1 &= ~M1_OVIPAROUS;
    assert.ok(!(await linesOf()).some((line) => line.includes('lay eggs')),
        'a female hero who lays no eggs');
    state.flags.female = false;

    // youprop.h:404 Hate_silver is a lycanthrope *or* a form that hates
    // silver; mondata.c hates_silver() counts every demon.
    state.youmonst.data.mflags2 |= M2_DEMON;
    assert.ok((await linesOf()).some((line) => line.includes('harmed by silver')));
    state.youmonst.data.mflags2 &= ~M2_DEMON;

    // you.h:464 `#define Luck (u.uluck + u.moreluck)`, and insight.c:1918
    // reports u.moreluck on its own, so either field alone has to stop.
    for (const field of ['uluck', 'moreluck']) {
        state.u[field] = 1;
        assert.ok((await linesOf()).some((line) => line.includes('lucky')), field);
        state.u[field] = 0;
    }

    // insight.c:1815-1830 needs both a known spell and armor that changes the
    // casting chance, so neither term alone may stop the window.
    state.uarm = { otyp: RING_MAIL, owornmask: W_ARM };
    assert.ok(!(await linesOf()).some((line) => line.includes('spell casting')),
        'metallic armor with no spells');
    state.svs.spl_book[0] = { sp_id: 1, sp_lev: 1, sp_know: 100 };
    assert.ok((await linesOf()).some((line) => line.includes('spell casting')));
    state.uarm = null;
    assert.ok(!(await linesOf()).some((line) => line.includes('spell casting')),
        'a spell with no armor to blame');
});

// insight.c adds numeric annotations in debug mode at eleven sites across
// three sections, and doattributes():2014-2015 routes a wizard through the
// same MAGICENLIGHTENMENT door explore mode uses. This is the real Ctrl-X
// caller path, including the custom v:inventory binding beside it.
test('debug Ctrl-X attributes includes numeric enlightenment details', async () => {
    const rc = 'OPTIONS=name:Binder,role:Wizard,race:human,gender:male,'
        + 'align:neutral\n'
        + 'OPTIONS=playmode:debug,showexp,time,color,lit_corridor\n'
        + 'BIND=v:inventory\n';
    const command = await runSegment({
        seed: 2601,
        datetime: '20000110090000',
        nethackrc: rc,
        moves: '\x1B\x18 \x1B',
        storage: null,
    });
    assert.equal(game.wizard, true);
    assert.equal(game.discover, false);
    assert.equal(game.moves, 1, 'Ctrl-X spends no turn');

    // Compare with the same startup prefix stopping before Ctrl-X: the menu
    // itself must not add random draws. The strict fresh differential also
    // checks every screen and cursor boundary for this same recipe.
    const startup = await runSegment({
        seed: 2601,
        datetime: '20000110090000',
        nethackrc: rc,
        moves: '\x1B',
        storage: null,
    });
    assert.equal(command.getRngLog().length, startup.getRngLog().length);

    // runSegment() has set the live timer while processing the command; keep
    // the direct call below focused on enlightenment lines rather than clock
    // setup.
    game.urealtime.start_timing = getnow(game);
    const lines = await enlightenment(MAGIC, ENL_GAMEINPROGRESS, game);
    assert.ok(lines.includes(' You have 0 experience points, 20 needed'
        + ' to attain level 2.'));
    assert.ok(lines.includes(" You aren't hungry <900>."));
    assert.ok(lines.includes(' You are unencumbered <-308>.'));
    assert.ok(lines.includes(' Your alignment is 0.'));
    assert.ok(lines.includes(
        ' You are magic-protected because of your cloak of magic resistance.',
    ));
    assert.ok(lines.includes(' Your luck is zero.'));
    assert.ok(lines.includes(" You can't safely pray (300)."));
    assert.ok(lines.includes(' You are running in debug mode.'));

    // insight.c:1909-1916 appends the aggregate Luck value only in debug
    // mode. Keep this branch on the same real state after checking zero luck.
    game.u.uluck = 1;
    const luckyLines = await enlightenment(MAGIC, ENL_GAMEINPROGRESS, game);
    assert.ok(luckyLines.includes(' You are lucky (1).'));
});

// insight.c cause_known(). Iterates the inventory checking worn items whose
// type's oc_oprop matches the property and whose type is name-known and whose
// instance is player-known (dknown). The mask W_ARMOR | W_AMUL | W_RING |
// W_TOOL limits the scan to armor, amulets, rings, and tools.
test('cause_known() returns true only for a worn, known item with matching oc_oprop', () => {
    // Build a minimal state with the objects table so objectType() works.
    const state = {};
    objects_globals_init(state);

    // An amulet of restful sleep (objects.h:842) has oc_oprop = SLEEPY.
    // Verify the catalog agrees.
    assert.equal(state.objects[AMULET_OF_RESTFUL_SLEEP].oc_oprop, SLEEPY,
        'the amulet of restful sleep confers SLEEPY');

    // No inventory: cause_known returns false.
    state.invent = null;
    assert.equal(cause_known(SLEEPY, state), false,
        'empty inventory never matches');

    // Worn amulet, but type not name-known: returns false.
    const amulet = { otyp: AMULET_OF_RESTFUL_SLEEP, owornmask: W_AMUL,
        dknown: 1, nobj: null };
    state.objects[AMULET_OF_RESTFUL_SLEEP].oc_name_known = 0;
    state.invent = amulet;
    assert.equal(cause_known(SLEEPY, state), false,
        'name-unknown item does not reveal the cause');

    // Worn amulet, name-known but not player-seen (dknown=0): returns false.
    state.objects[AMULET_OF_RESTFUL_SLEEP].oc_name_known = 1;
    amulet.dknown = 0;
    assert.equal(cause_known(SLEEPY, state), false,
        'unseen item (dknown=0) does not reveal the cause');

    // Worn, name-known, player-seen: returns true.
    amulet.dknown = 1;
    assert.equal(cause_known(SLEEPY, state), true,
        'worn+name-known+dknown item reveals the cause');

    // Same item but not worn (owornmask=0): returns false.
    amulet.owornmask = 0;
    assert.equal(cause_known(SLEEPY, state), false,
        'carried but unworn item does not match the worn-item mask');

    // Worn as armor (W_ARMOR mask): returns true -- the mask includes armor.
    amulet.owornmask = W_ARMOR;
    assert.equal(cause_known(SLEEPY, state), true,
        'W_ARMOR is inside the worn mask');

    // Wrong property: the amulet confers SLEEPY, not FIRE_RES.
    amulet.owornmask = W_AMUL;
    assert.equal(cause_known(FIRE_RES, state), false,
        'mismatched property returns false');

    // Restore oc_name_known so later tests that import it are unaffected.
    state.objects[AMULET_OF_RESTFUL_SLEEP].oc_name_known = 0;
});

// insight.c:1181-1188. The Sleepy arm of status_enlightenment() prints the
// narcolepsy line when the property is set and either the enlightenment mode
// includes MAGICENLIGHTENMENT or cause_known(SLEEPY) returns true.
test('the Sleepy arm prints the narcolepsy line under magic enlightenment', async () => {
    const state = await readyExploreGame();
    // Set the SLEEPY property via intrinsic so hasProperty returns true.
    state.u.uprops[SLEEPY] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const lines = await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state);
    // The narcolepsy line uses enl_msg("You ", "fall", ..., " asleep
    // uncontrollably", from_what). In non-final mode the present tense fires.
    assert.ok(
        lines.some((l) => l.includes('fall asleep uncontrollably')),
        'the Sleepy arm appears under magic enlightenment',
    );
    // Clean up.
    state.u.uprops[SLEEPY] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
});

// zap.c:5722-5762 delegates each armor category to objnam.c's corresponding
// simple-name helper. A wizard wearing a cloak therefore gets the category
// word in the resistance source suffix.
test('item_what uses the source armor category name', async () => {
    const state = await readyGame();
    state.wizard = true;
    state.u.uprops[ACID_RES] = { intrinsic: 0, extrinsic: W_ARMC, blocked: 0 };
    state.uarmc = { otyp: DWARVISH_CLOAK, owornmask: W_ARMC };
    assert.equal(item_what(AD_ACID, state), ' by your cloak');
});

// insight.c:1710-1735 compares a blocked-flight source as a complete value.
// Combining the trap and surroundings flags must use the generic wording.
test('blocked flight keeps the combined-source wording', async () => {
    const state = await readyGame();
    state.u.uprops[FLYING] = {
        intrinsic: 1, extrinsic: 0, blocked: I_SPECIAL | FROMOUTSIDE,
    };
    const lines = [];
    await attributes_enlightenment(ENL_GAMEINPROGRESS, state, lines);
    assert.ok(lines.includes(' You would fly if circumstances permitted.'));
});

// insight.c:1591-1621 uses `something` for an unclassified object warning and
// appends from_what() to infravision. These are separate source branches.
test('warning fallback and infravision retain their source wording', async () => {
    const state = await readyGame();
    state.u.uprops[WARN_OF_MON] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.context.warntype = { obj: 1, polyd: 0, speciesidx: -1 };
    state.u.uprops[INFRAVISION] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const lines = [];
    await attributes_enlightenment(ENL_GAMEINPROGRESS, state, lines);
    assert.ok(lines.includes(' You are aware of the presence of something.'));
    assert.ok(lines.includes(' You have infravision.'));
});

// insight.c:1866-1884 reads the current permonst for the shifted form and
// the saved mons[] entry for a lycanthrope. Keeping those two sources distinct
// preserves vampire-shift and were-creature names.
test('polymorph and lycanthropy names use current and saved forms', async () => {
    const state = await readyGame();
    state.u.umonster = PM_VAMPIRE;
    state.u.umonnum = PM_VAMPIRE_BAT;
    state.youmonst.cham = PM_VAMPIRE;
    state.youmonst.data = state.mons[PM_VAMPIRE_BAT];
    let lines = [];
    await attributes_enlightenment(ENL_GAMEINPROGRESS, state, lines);
    assert.ok(lines.includes(
        ' You are polymorphed into a vampire in vampire bat form.',
    ));

    state.u.umonnum = PM_VAMPIRE;
    state.u.ulycn = PM_WOLF;
    state.youmonst.data = state.mons[PM_VAMPIRE];
    lines = [];
    await attributes_enlightenment(ENL_GAMEINPROGRESS, state, lines);
    assert.ok(lines.includes(' You are a wolf.'));
});

// insight.c:1975-2005 uses N_times() while alive/in progress and ordin() for
// a dead disclosure. The zero count has its own survived arm.
test('mortality disclosure follows N_times and ordin', async () => {
    assert.equal(N_times(0), '0 times');
    assert.equal(N_times(1), 'once');
    assert.equal(N_times(2), 'twice');
    assert.equal(N_times(3), 'thrice');
    const state = await readyGame();
    state.u.umonnum = state.u.umonster;
    state.u.umortality = 2;
    let lines = [];
    await attributes_enlightenment(ENL_GAMEINPROGRESS, state, lines);
    assert.ok(lines.includes(' You have been killed twice.'));

    state.u.umortality = 0;
    lines = [];
    await attributes_enlightenment(ENL_GAMEINPROGRESS, state, lines);
    assert.ok(!lines.some((line) => line.includes('killed')));

    state.u.umortality = 2;
    lines = [];
    await attributes_enlightenment(ENL_GAMEOVERDEAD, state, lines);
    assert.ok(lines.includes(' You are dead (2nd time!).'));
});

// insight.c:1774-1780 uses integer division for 4 * spelarmr / 5. With a
// non-multiple-of-five armor penalty, the exact boundary belongs to the
// nearly-offsetting branch.
test('tux penalty uses C integer threshold boundaries', async () => {
    const state = await readyGame();
    state.iflags.tux_penalty = true;
    // 4*9/5 truncates to7 in C; equality must skip "partly offsetting".
    state.urole.spelarmr = 9;
    state.u.uhitinc = 7;
    state.u.umonnum = state.u.umonster;
    const lines = [];
    await attributes_enlightenment(ENL_GAMEINPROGRESS, state, lines);
    assert.ok(lines.includes(
        " You have a large bonus to hit nearly offsetting your suit's penalty.",
    ));
});

// insight.c:1837-1848 changes the past wording for blocked periodic shape
// changes. The polymorph and lycanthropy arms keep their source-specific verbs.
test('final blocked shape changes use source past wording', async () => {
    const state = await readyGame();
    state.u.uprops[UNCHANGING] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.u.uprops[POLYMORPH] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.u.umonnum = state.u.umonster;
    let lines = [];
    await attributes_enlightenment(ENL_GAMEOVERDEAD, state, lines);
    assert.ok(lines.includes(
        ' You would have polymorphed periodically if not locked into your current form.',
    ));

    state.u.uprops[POLYMORPH] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.ulycn = PM_WOLF;
    lines = [];
    await attributes_enlightenment(ENL_GAMEOVERDEAD, state, lines);
    assert.ok(lines.includes(
        ' You would have changed shape periodically if not locked into your current form.',
    ));
});

// insight.c:show_gamelog() walks the linked list in insertion order, hides
// spoiler events during an in-progress view, and keeps only major flags for a
// final view. The injected text-window owner makes those source filters
// independently testable without mutating the live terminal.
test('show_gamelog preserves source order and final filters', async () => {
    const events = [
        { turn: 1, flags: LL_ACHIEVE, text: 'entered' },
        { turn: 2, flags: LL_CONDUCT, text: 'conduct' },
        { turn: 3, flags: LL_SPOILER, text: 'spoiler' },
    ];
    const state = { gamelog: events, wizard: false };
    const windows = [];
    const displayTextWindow = (_state, lines) => {
        windows.push(lines.map((line) => line.text));
    };

    await show_gamelog(ENL_GAMEINPROGRESS, state, { displayTextWindow });
    assert.deepEqual(windows[0], [
        'Logged events:', ' Turn', '    1: entered', '    2: conduct',
    ]);

    await show_gamelog(1, state, { displayTextWindow });
    assert.deepEqual(windows[1], [
        'Major events:', ' Turn', '    1: entered',
    ]);
});

test('do_gamelog dispatches the in-progress chronicle window', async () => {
    const windows = [];
    const state = {
        gamelog: [{ turn: 7, flags: LL_ACHIEVE, text: 'entry' }],
        wizard: false,
    };
    const result = await do_gamelog(state, {
        displayTextWindow: (_state, lines) => {
            windows.push(lines.map((line) => line.text));
        },
    });
    assert.equal(result, 0);
    assert.deepEqual(windows, [['Logged events:', ' Turn', '    7: entry']]);
});

// insight.c:vanqsort_cmp() compares only the source-owned monster index,
// monster data, flags.vanq_sortmode, and mvitals.died.  Pin every mode here,
// including the special punctuation-class and rider ordering branches.
test('vanqsort_cmp follows every source vanquished ordering', () => {
    const mons = [
        { pmidx: 0, mlevel: 3, difficulty: 7, mlet: 5, geno: 0,
            pmnames: [null, null, 'zebra'] },
        { pmidx: 1, mlevel: 9, difficulty: 2, mlet: 5, geno: 0,
            pmnames: [null, null, 'alpha'] },
        { pmidx: 2, mlevel: 9, difficulty: 8, mlet: 5, geno: 0,
            pmnames: [null, null, 'beta'] },
        { pmidx: 3, mlevel: 4, difficulty: 4, mlet: 5, geno: G_UNIQ,
            pmnames: [null, null, 'Unique'] },
        { pmidx: 4, mlevel: 4, difficulty: 4, mlet: 5, geno: G_UNIQ,
            pmnames: [null, null, 'High priest'] },
    ];
    const state = {
        mons,
        svm: { mvitals: [
            { died: 1 }, { died: 5 }, { died: 2 }, { died: 3 }, { died: 4 },
        ] },
        flags: { vanq_sortmode: VANQ_MLVL_MNDX },
    };
    const order = (mode) => {
        state.flags.vanq_sortmode = mode;
        return [0, 1, 2, 3, 4].sort((a, b) => vanqsort_cmp(a, b, state));
    };
    assert.deepEqual(order(VANQ_MLVL_MNDX), [1, 2, 3, 4, 0]);
    assert.deepEqual(order(VANQ_MSTR_MNDX), [2, 0, 3, 4, 1]);
    assert.deepEqual(order(VANQ_ALPHA_SEP), [4, 3, 1, 2, 0]);
    assert.deepEqual(order(VANQ_COUNT_H_L), [1, 4, 3, 2, 0]);
    assert.deepEqual(order(VANQ_COUNT_L_H), [0, 2, 3, 4, 1]);
    state.mons[0].mlet = 58; // S_LIZARD: punctuation remapping branch.
    state.mons[1].mlet = 57; // S_EEL.
    state.mons[2].mlet = 57;
    state.flags.vanq_sortmode = VANQ_MCLS_LTOH;
    assert.deepEqual([0, 1, 2].sort((a, b) => vanqsort_cmp(a, b, state)),
        [0, 1, 2]);
    state.flags.vanq_sortmode = VANQ_MCLS_HTOL;
    assert.deepEqual([0, 1, 2].sort((a, b) => vanqsort_cmp(a, b, state)),
        [0, 1, 2]);
});

test('set_vanq_order exposes source menu rows and stores the choice', async () => {
    const state = { flags: { vanq_sortmode: VANQ_MLVL_MNDX } };
    let menuSpec;
    const choice = await set_vanq_order(false, state, {
        menu: async (_state, spec) => {
            menuSpec = spec;
            return VANQ_ALPHA_SEP;
        },
    });
    assert.equal(choice, VANQ_ALPHA_SEP);
    assert.equal(state.flags.vanq_sortmode, VANQ_ALPHA_SEP);
    assert.deepEqual(menuSpec.items.map((item) => item.selector),
        ['t', 'd', 'a', 'c']);
    assert.equal(menuSpec.items[2].label, 'alphabetically');

    await set_vanq_order(true, state, {
        menu: async (_state, spec) => {
            menuSpec = spec;
            return VANQ_COUNT_L_H;
        },
    });
    assert.deepEqual(menuSpec.items.map((item) => item.selector),
        ['t', 'd', 'a', 'c', 'n', 'z']);
});

test('set_vanq_order preserves the current mode on Return and Space', async () => {
    const cases = [
        ['\n', VANQ_ALPHA_SEP, true],
        // Count modes are hidden for #genocided, but C still returns the
        // preselected current mode when Space commits without a new choice.
        [' ', VANQ_COUNT_H_L, true],
        ['\x1b', VANQ_COUNT_H_L, false],
    ];
    for (const [key, mode, keepsMode] of cases) {
        const state = {
            flags: { vanq_sortmode: mode },
            nhDisplay: new GameDisplay(null),
        };
        state.nhDisplay.pushKey(key.charCodeAt(0));
        const result = await set_vanq_order(false, state);
        assert.equal(result, keepsMode ? mode : -1);
        assert.equal(state.flags.vanq_sortmode, mode);
    }
});

test('list_vanquished handles both an empty list and source formatting', async () => {
    const empty = { svm: { mvitals: [] }, mons: [], program_state: {} };
    await list_vanquished('y', false, empty, {
        displayTextWindow: () => {},
    });
    assert.equal(empty._ttyToplines, 'No creatures have been vanquished.');

    const state = {
        flags: { vanq_sortmode: VANQ_MLVL_MNDX },
        mons: [
            { pmidx: 0, mlevel: 1, difficulty: 1, mlet: 5, geno: 0,
                pmnames: [null, null, 'newt'] },
            { pmidx: 1, mlevel: 4, difficulty: 4, mlet: 5, geno: 0,
                pmnames: [null, null, 'dog'] },
        ],
        svm: { mvitals: [{ died: 2 }, { died: 1 }] },
        program_state: {},
    };
    let lines;
    await list_vanquished('y', false, state, {
        displayTextWindow: (_state, values) => {
            lines = values.map((value) => value.text);
        },
    });
    assert.deepEqual(lines, [
        'Vanquished creatures:', '', '  a dog', '  2 newts', '',
        '3 creatures vanquished.',
    ]);
});

test('dovanquished consumes the menu-requested flag', async () => {
    const state = {
        iflags: { menu_requested: true },
        flags: { vanq_sortmode: 0 },
        svm: { mvitals: [] },
        mons: [],
        program_state: {},
    };
    assert.equal(await dovanquished(state, {
        displayTextWindow: () => {},
        menu: async () => null,
    }), 0);
    assert.equal(state.iflags.menu_requested, false);
});

// insight.c show_conduct() keeps the challenge rows in source order and uses
// present-tense forms for #conduct. The injected menu owner makes its window
// output independently testable without consuming a terminal key.
test('show_conduct follows source tense and conduct order', async () => {
    const state = {
        u: {
            uconduct: {},
            uroleplay: {},
            uachieved: [0],
        },
        svm: { mvitals: [] },
        wizard: false,
        invent: null,
    };
    const windows = [];
    await show_conduct(ENL_GAMEINPROGRESS, state, {
        displayMenuWindow: (_state, lines) => {
            windows.push(lines.map((line) => line.text));
        },
    });
    assert.deepEqual(windows, [[
        'Voluntary challenges:',
        ' Character rerolling was not enabled.',
        ' You have gone without food.',
        ' You have been an atheist.',
        " You have never hit with a wielded weapon.",
        ' You have been a pacifist.',
        ' You have been illiterate.',
        ' You have never had a pet.',
        " You have never genocided any monsters.",
        ' You have never polymorphed an object.',
        ' You have never changed form.',
        ' You have used no wishes.',
    ]]);
});

test('doconduct invokes the in-progress conduct window and returns ECMD_OK',
    async () => {
        const calls = [];
        const state = { marker: 'conduct-state' };
        const result = await doconduct(state, {
            showConduct: async (final, passedState) => {
                calls.push({ final, passedState });
            },
        });
        assert.equal(result, 0);
        assert.deepEqual(calls, [{
            final: ENL_GAMEINPROGRESS,
            passedState: state,
        }]);
    });

// insight.c num_genocides() and sokoban_in_play() are pure state selectors;
// pin their source-defined flags and achievement tests separately from the
// impure text-window entry point.
test('conduct selectors count genocides and entered Sokoban', () => {
    const state = {
        u: { uachieved: [ACH_SOKO, 0] },
        svm: { mvitals: [{ mvflags: 0 }, { mvflags: G_GENOD }] },
        mons: [{ geno: 0 }, { geno: 0 }],
    };
    assert.equal(num_genocides(state), 1);
    assert.equal(sokoban_in_play(state), true);
    // C's achievement array is zero-terminated; entries after that marker
    // are outside the source loop and must not make Sokoban appear entered.
    state.u.uachieved = [0, ACH_SOKO];
    assert.equal(sokoban_in_play(state), false);
});

test('num_genocides excludes the source high-cleric unique exception', () => {
    const mvitals = Array.from(
        { length: PM_HIGH_CLERIC + 1 },
        () => ({ mvflags: 0 }),
    );
    const mons = Array.from(
        { length: PM_HIGH_CLERIC + 1 },
        () => ({ geno: 0 }),
    );
    mvitals[PM_HIGH_CLERIC].mvflags = G_GENOD;
    mons[PM_HIGH_CLERIC].geno = 4096;
    const state = {
        u: { uachieved: [0] },
        svm: { mvitals },
        mons,
    };
    // The fixture's only genocide is the special high-cleric index in C's
    // table, which is flagged unique but excluded by UniqCritterIndx.
    assert.equal(num_genocides(state), 1);
});

// pline.c stores the producer-provided turn and appends without reordering;
// livelog_printf() uses svm.moves at the call site rather than reconstructing
// a timestamp from another conduct counter.
test('gamelog_add and livelog_printf retain C event fields', () => {
    const state = { moves: 23 };
    gamelog_add(LL_CONDUCT, 4, 'first', state);
    livelog_printf(LL_ACHIEVE, 'second', state);
    assert.deepEqual(state.gamelog, [
        { turn: 4, flags: LL_CONDUCT, text: 'first' },
        { turn: 23, flags: LL_ACHIEVE, text: 'second' },
    ]);
});

test('livelog_add honors sys.c LL_NONE while preserving the chronicle', () => {
    const previous = {
        sysopt: game.sysopt,
        gamelog: game.gamelog,
        moves: game.moves,
        unported: game.unported,
    };
    try {
        initUnported();
        game.sysopt = { livelog: 0 };
        game.moves = 31;
        game.gamelog = [];
        livelog_printf(LL_ACHIEVE, 'tab\tvalue', game);
        assert.deepEqual(game.gamelog, [{
            turn: 31,
            flags: LL_ACHIEVE,
            text: 'tab\tvalue',
        }]);
        assert.equal(game.unported.has('files.c livelog_add'), false);

        game.sysopt = { livelog: LL_ACHIEVE };
        game.gamelog = [];
        livelog_printf(LL_ACHIEVE, 'enabled\tvalue', game);
        assert.deepEqual(game.gamelog, [{
            turn: 31,
            flags: LL_ACHIEVE,
            text: 'enabled\tvalue',
        }]);
        assert.equal(game.unported.has('files.c livelog_add'), true);
    } finally {
        game.sysopt = previous.sysopt;
        game.gamelog = previous.gamelog;
        game.moves = previous.moves;
        game.unported = previous.unported;
    }
});

// insight.c record_achievement() supplies dynamic rank text and the two
// object-bearing prize messages before handing the line to pline.c.
test('record_achievement appends source rank and prize events', async () => {
    const state = await readyGame();
    state.gamelog = [];
    state.u.uachieved = [];
    record_achievement(ACH_RNK4, state);
    assert.equal(state.gamelog.length, 1);
    assert.equal(state.gamelog[0].flags, LL_ACHIEVE);
    assert.match(state.gamelog[0].text, /^attained the rank of /u);
    assert.match(state.gamelog[0].text, /\(level 1\)$/u);

    state.gamelog = [];
    state.u.uachieved = [];
    state.context.achieveo = { mines_prize_otyp: LUCKSTONE };
    record_achievement(ACH_MINE_PRIZE, state);
    assert.deepEqual(state.gamelog, [{
        turn: state.moves,
        flags: LL_ACHIEVE | LL_SPOILER,
        text: "acquired the Mines' End luckstone",
    }]);
    // A static achievement uses the table entry and duplicate calls only
    // replay the discarded sound side effect, never append a second line.
    state.gamelog = [];
    state.u.uachieved = [];
    record_achievement(ACH_BELL, state);
    record_achievement(ACH_BELL, state);
    assert.deepEqual(state.gamelog.map((event) => event.text), [
        'acquired the Bell of Opening',
    ]);
});
