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
} from '../js/const.js';
import { getnow } from '../js/calendar.js';
import {
    align_str,
    attrval,
    enlightenment,
    fmt_elapsed_time,
    size_str,
    UnsupportedEnlightenmentError,
} from '../js/insight.js';
import {
    BASICENLIGHTENMENT,
    ENL_GAMEINPROGRESS,
    EXT_ENCUMBER,
    FIRE_RES,
    FIXED_ABIL,
    HVY_ENCUMBER,
    LEVITATION,
    MAGICENLIGHTENMENT,
    MOD_ENCUMBER,
    OVERLOADED,
    SLT_ENCUMBER,
} from '../js/const.js';
import { inv_weight, near_capacity, weight_cap } from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    M1_BREATHLESS,
    M1_OVIPAROUS,
    M2_DEMON,
} from '../js/monsters.js';
import {
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
// turns into a MAGICENLIGHTENMENT window. The Caveman and the Tourist are the
// only two roles whose starting state reaches attributes_enlightenment()'s
// output at all: the rest hold an XL1 intrinsic, a steed, a robe or a cloak
// that stops it. The Caveman's leather armor makes magic_negation() answer 1
// and the Tourist's Hawaiian shirt makes it answer 0.
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

// The three attributes_enlightenment() lines the port covers, together, in the
// order insight.c emits them. The fresh matrix records the same window against
// C; this pins it without a recorder so a change is caught by `npm test`.
test('the magic half prints the three lines the port covers', async () => {
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

// Each stop below reads something outside u.uprops, so a table row built on
// the property alone would let its line slip through and print a window C
// would have filled differently.
test('the magic half stops on conditions no property records', async () => {
    const state = await readyExploreGame();
    const branchOf = async () => {
        try {
            await enlightenment(MAGIC, ENL_GAMEINPROGRESS, state);
        } catch (error) {
            assert.ok(error instanceof UnsupportedEnlightenmentError);
            return error.branch;
        }
        return null;
    };
    assert.equal(await branchOf(), null, 'the plain hero reaches the window');

    // youprop.h:69 adds defended(&gy.youmonst, AD_DISE), which artifact.c:663
    // answers for green dragon scales and for no other armor.
    state.uarm = { otyp: GREEN_DRAGON_SCALE_MAIL, owornmask: W_ARM };
    assert.equal(await branchOf(), 'Sick_resistance');
    state.uarm = { otyp: GREEN_DRAGON_SCALES, owornmask: W_ARM };
    assert.equal(await branchOf(), 'Sick_resistance');
    state.uarm = null;

    // zap.c u_adtyp_resistance_obj()'s 90% arm, which needs no property at all.
    state.uarmc = { otyp: DWARVISH_CLOAK, owornmask: W_ARMC };
    assert.equal(await branchOf(), 'item_resistance_message()');
    state.uarmc = null;

    // insight.c:1926 `carrying(LUCKSTONE) || stone_luck(TRUE)`. A luckstone
    // moves neither u.uluck nor u.moreluck, so only the scan finds it.
    state.invent = { otyp: LUCKSTONE, quan: 1, nobj: state.invent };
    assert.equal(await branchOf(), 'the luck-does-not-time-out lines');
    state.invent = state.invent.nobj;

    // youprop.h:275-281 reads the permonst for Breathless and Amphibious.
    state.youmonst.data.mflags1 |= M1_BREATHLESS;
    assert.equal(await branchOf(), 'Breathless and Amphibious');
    state.youmonst.data.mflags1 &= ~M1_BREATHLESS;

    // youprop.h:27 Fire_resistance is (HFire_resistance || EFire_resistance),
    // so each field alone has to stop; FIRE_RES has no status_enlightenment()
    // row above, which is what makes this table the one that answers.
    for (const field of ['intrinsic', 'extrinsic']) {
        state.u.uprops[FIRE_RES] = {
            intrinsic: 0, extrinsic: 0, blocked: 0, [field]: 1,
        };
        assert.equal(await branchOf(), 'Fire_resistance', field);
    }
    state.u.uprops[FIRE_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };

    // insight.c:1688 and :1707 fire on the blocked field alone, which
    // hasProperty()'s intrinsic-or-extrinsic answer would miss. Levitation is
    // where that shows: a hero carrying only the blocking term walks past
    // status_enlightenment()'s row and lands here.
    state.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 1 };
    assert.equal(await branchOf(), 'BLevitation');
    state.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };

    // insight.c:1975-1997 prints nothing while the game is in progress and the
    // hero has never died, so the count alone decides.
    state.u.umortality = 1;
    assert.equal(await branchOf(), 'the have-been-killed line');
    state.u.umortality = 0;

    // insight.c:1770, :1782 and :1784 each print their own enlght_combatinc()
    // line, so any one of the three counters alone has to stop the window.
    for (const field of ['uhitinc', 'udaminc', 'uspellprot']) {
        state.u[field] = 1;
        assert.equal(await branchOf(), 'enlght_combatinc()', field);
        state.u[field] = 0;
    }

    // youprop.h:407 Half_gas_damage needs a damp or wet towel: obj.h reads the
    // enchantment, so a dry one worn over the eyes prints nothing.
    state.ublindf = { otyp: TOWEL, spe: 0 };
    assert.equal(await branchOf(), null, 'a dry towel damps no gas');
    state.ublindf.spe = 1;
    assert.equal(await branchOf(), 'the poison-gas line');
    state.ublindf = null;

    // insight.c:1879 needs the form and the gender together, so neither term
    // alone may stop the window.
    state.youmonst.data.mflags1 |= M1_OVIPAROUS;
    assert.equal(await branchOf(), null, 'an egg-laying form on a male hero');
    state.flags.female = true;
    assert.equal(await branchOf(), 'the lay-eggs line');
    state.youmonst.data.mflags1 &= ~M1_OVIPAROUS;
    assert.equal(await branchOf(), null, 'a female hero who lays no eggs');
    state.flags.female = false;

    // youprop.h:404 Hate_silver is a lycanthrope *or* a form that hates
    // silver; mondata.c hates_silver() counts every demon.
    state.youmonst.data.mflags2 |= M2_DEMON;
    assert.equal(await branchOf(), 'the harmed-by-silver line');
    state.youmonst.data.mflags2 &= ~M2_DEMON;

    // you.h:464 `#define Luck (u.uluck + u.moreluck)`, and insight.c:1918
    // reports u.moreluck on its own, so either field alone has to stop.
    for (const field of ['uluck', 'moreluck']) {
        state.u[field] = 1;
        assert.equal(await branchOf(), 'the luck lines', field);
        state.u[field] = 0;
    }

    // insight.c:1815-1830 needs both a known spell and armor that changes the
    // casting chance, so neither term alone may stop the window.
    state.uarm = { otyp: RING_MAIL, owornmask: W_ARM };
    assert.equal(await branchOf(), null, 'metallic armor with no spells');
    state.svs.spl_book[0] = { sp_id: 1, sp_lev: 1, sp_know: 100 };
    assert.equal(await branchOf(), 'the spell-casting line');
    state.uarm = null;
    assert.equal(await branchOf(), null, 'a spell with no armor to blame');
});

// insight.c takes a different shape in debug mode at eleven sites across three
// sections, and doattributes():2014-2015 routes a wizard through the same
// MAGICENLIGHTENMENT door explore mode uses.
test('debug mode stops the magic half', async () => {
    const state = await readyExploreGame();
    state.wizard = true;
    await assert.rejects(
        () => enlightenment(MAGIC, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === 'debug mode',
    );
});
