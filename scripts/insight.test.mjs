import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHA,
    A_CHAOTIC,
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
    UnsupportedEnlightenmentError,
} from '../js/insight.js';
import {
    BASICENLIGHTENMENT,
    ENL_GAMEINPROGRESS,
    EXT_ENCUMBER,
    FIXED_ABIL,
    HVY_ENCUMBER,
    MOD_ENCUMBER,
    OVERLOADED,
    SLT_ENCUMBER,
} from '../js/const.js';
import { inv_weight, near_capacity, weight_cap } from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ARMOR_CLASS, DAGGER, TOWEL, WEAPON_CLASS } from '../js/objects.js';
import { ROOMOFFSET, SHOPBASE } from '../js/const.js';
import { costly_spot } from '../js/shk.js';

test('align_str names the four alignments insight.c switches on', () => {
    // insight.c align_str(); the default arm covers every other value.
    assert.equal(align_str(A_CHAOTIC), 'chaotic');
    assert.equal(align_str(A_NEUTRAL), 'neutral');
    assert.equal(align_str(A_LAWFUL), 'lawful');
    assert.equal(align_str(A_NONE), 'unaligned');
    assert.equal(align_str(7), 'unknown');
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
        datetime: '2026-03-04 10:00:00',
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
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
            ' You are wielding'),
        ' You are wielding daggers.',
    );

    state.uwep.quan = 1;
    assert.equal(
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
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
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
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
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
            ' You are wielding'),
        ' You are wielding a towel.',
    );

    state.uwep.spe = 1;
    assert.throws(
        () => enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === 'is_wet_towel()',
    );
});

// youprop.h:385 defines Fixed_abil as the extrinsic alone; there is no
// HFixed_abil term. An intrinsic in that slot must leave the characteristics
// printing rather than reaching the unported stuck_ring() stop.
test('Fixed_abil reads the extrinsic alone', async () => {
    const state = await readyGame();
    state.u.uprops[FIXED_ABIL] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    assert.ok(
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
            ' Your strength is'),
        'an intrinsic-only Fixed_abil must not stop the window',
    );

    state.u.uprops[FIXED_ABIL] = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    assert.throws(
        () => enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === 'stuck_ring()',
    );
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
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
            ' You are'),
    );

    state.u.umonnum = state.u.umonster + 1;
    assert.throws(
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
    assert.throws(
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
        const lines = enlightenment(
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
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
            ' Autopickup '),
        ' Autopickup is off.',
    );

    // An empty list is "all types", and C shows " plus thrown" only when the
    // list is a restriction, so pickup_thrown alone must not add it.
    state.flags.pickup = true;
    state.flags.pickup_thrown = true;
    assert.equal(
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
            ' Autopickup '),
        ' Autopickup is on for all types.',
    );

    // Two classes, quoted, with the thrown suffix the restriction now earns.
    state.flags.pickup_types = [WEAPON_CLASS, ARMOR_CLASS];
    assert.equal(
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
            ' Autopickup '),
        " Autopickup is on for ')[' plus thrown.",
    );

    state.flags.pickup_thrown = false;
    assert.equal(
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
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
                enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
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
                enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
                ' Autopickup ',
            ),
            " Autopickup is on for ')' plus thrown.",
        );
    });

// C ref: options.c optfn_pickup_types(), which is what turns the option's
// class symbols into the class indices oc_to_str() reads. parseNethackrc() has
// no arm for the option, so a configuration file that sets it leaves raw text
// where the enlightenment line expects a list.
test('the autopickup line stops on a configured pickup_types', async () => {
    const state = await readyGame('autopickup,pickup_types:$"');
    assert.equal(state.flags.pickup_types, '$"');
    assert.throws(
        () => enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === "parseoptions() to interpret 'pickup_types'",
    );
});

// C ref: insight.c basics_enlightenment() (817-818), `if (ga.apelist)
// Strcat(buf, ", with exceptions")`. cfgfiles.c cnf_line_AUTOPICKUP_EXCEPTION()
// (612) is the only thing in reach that appends to that list, and
// parseNethackrc() records the statement without interpreting it, so the empty
// list would otherwise read as "no exceptions".
test('the autopickup line stops on a configured exception list', async () => {
    const state = await readyGame(
        'autopickup', 'AUTOPICKUP_EXCEPTION="<*scroll of scare monster"',
    );
    assert.deepEqual(state.unportedConfigStatements, ['autopickup_exception']);
    assert.equal(state.ga?.apelist, undefined);
    assert.throws(
        () => enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, state),
        (error) => error instanceof UnsupportedEnlightenmentError
            && error.branch === 'cfgfiles.c cnf_line_AUTOPICKUP_EXCEPTION()',
    );

    // Without the statement the same game reports the empty list, which is
    // what makes the stop above a statement test rather than a blanket one.
    const plain = await readyGame('autopickup');
    assert.equal(
        statusLine(enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, plain),
            ' Autopickup '),
        ' Autopickup is on for all types.',
    );
});
