import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CONFUSION,
    DIR_E,
    DIR_ERR,
    DIR_NE,
    DIR_NW,
    DIR_W,
    DISMOUNT_BONES,
    DISMOUNT_BYCHOICE,
    DISMOUNT_ENGULFED,
    DISMOUNT_FELL,
    DISMOUNT_GENERIC,
    DISMOUNT_KNOCKED,
    DISMOUNT_POLY,
    DISMOUNT_THROWN,
    ECMD_TIME,
    FLYING,
    FUMBLING,
    FROMOUTSIDE,
    LEVITATION,
    MAXULEV,
    MAX_CARR_CAP,
    MON_STILL_ARRIVING,
    N_DIRS,
    PIT,
    POOL,
    RIGHT_SIDE,
    ROOM,
    SQKY_BOARD,
    ROOMOFFSET,
    STEALTH,
    HOLE,
    STONE,
    STUNNED,
    TEST_MOVE,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_LAVA,
    TT_NONE,
    TT_PIT,
    TT_WEB,
    TELEDS_TELEPORT,
    VAULT,
    VIBRATING_SQUARE,
    W_SADDLE,
    xdir,
    ydir,
} from '../js/const.js';
import { dirtocoord, xytodir } from '../js/cmd.js';
import { set_wounded_legs } from '../js/do.js';
import { see_monsters, statusConditionActive } from '../js/display.js';
import {
    UnsupportedHeroMoveBoundaryError,
    cant_squeeze_thru,
    invocation_message,
    notice_mon_off,
    notice_mon_on,
    test_move,
    u_locomotion,
    weight_cap,
} from '../js/hack.js';
import {
    UnsupportedSteedError,
    _steedInternals,
    dismount_steed,
    doride,
    mount_steed,
} from '../js/steed.js';
import { teleds } from '../js/teleport.js';
import { float_vs_flight, steed_vs_stealth } from '../js/polyself.js';
import { float_down, fill_pit, reset_utrap, set_utrap } from '../js/trap.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { game } from '../js/gstate.js';
import { M1_FLY, PM_LICHEN } from '../js/monsters.js';
import {
    LANCE,
    LONG_SWORD,
    PICK_AXE,
    RANSEUR,
    ROCK_CLASS,
    TOOL_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { strongmonst, throws_rocks } from '../js/mondata.js';
import { mksobj, place_object } from '../js/obj.js';
import { BOULDER } from '../js/objects.js';
import { set_ustuck } from '../js/mon.js';
import { update_player_regions } from '../js/region.js';
import { vault_occupied } from '../js/vault.js';
import { is_pole } from '../js/worn.js';
import { block_point } from '../js/vision.js';
import { getRngLog } from '../js/rng.js';
import { runSegment } from '../js/jsmain.js';
import { RIDE_COMMAND, loadRideDismountRecipe }
    from './run-ride-dismount.mjs';

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// gt.toplines, which pline.c writes whether or not the row has been repainted.
// A test that calls dismount_steed() outside runSegment() has no repaint after
// it, so the painted grid row still shows whatever came before.
function toplines() {
    return game._ttyToplines ?? '';
}

// Locate a matrix segment by the keys it types, so reordering the matrix
// cannot silently point a test at a different case.
function segmentFor(moves) {
    const found = loadRideDismountRecipe().segments.find(
        (segment) => segment.moves === moves,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// The first matrix segment: seed 7730201 mounts the pony standing south of the
// hero, dismounts, and waits.
function southRideSegment() {
    return segmentFor(`.${RIDE_COMMAND}j${RIDE_COMMAND}.`);
}

// Replay a segment's prefix and hand back the live state it leaves. The
// message window is cleared afterwards because the segment stops with its last
// line still current, and a second pline() on the same turn would ask for
// --More-- with no keystroke left to answer it.
async function rideTo(moves) {
    await runSegment({ ...southRideSegment(), moves });
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    return game;
}

// Stand the hero on a mounted steed without replaying the second '#ride', so a
// test can drive dismount_steed() directly.
async function mounted() {
    const state = await rideTo(`.${RIDE_COMMAND}j`);
    assert.ok(state.u.usteed, 'the segment leaves the hero mounted');
    return state;
}

// Drop the current message so the next pline() starts a fresh top line rather
// than asking for --More--, which no keystroke is left to answer.
function quiet(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
}

test('the ride-dismount matrix contains only source-selected inputs', () => {
    const recipe = loadRideDismountRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Every segment waits once, rides, answers the prompt, and rides
        // again; the direction key is what varies.
        assert.ok(segment.moves.startsWith(`.${RIDE_COMMAND}`));
        assert.equal(
            segment.moves.split(RIDE_COMMAND).length - 1, 2,
            'each segment types #ride exactly twice',
        );
    }
});

test('a successful mount moves the hero onto the steed and off the map',
    async () => {
    // steed.c:358-382. The hero ends on the square the pony occupied, the
    // pony leaves the monster grid but keeps the hero's coordinates, and
    // steed_vs_stealth() blocks stealth from outside.
    const state = await mounted();
    const pony = state.u.usteed;
    assert.equal(pony.data.pmnames[2], 'pony');
    assert.equal(pony.mx, state.u.ux);
    assert.equal(pony.my, state.u.uy);
    // remove_monster() clears only the coordinate index, so the pony is no
    // longer at its own coordinates as far as m_at() is concerned.
    assert.equal(m_at(pony.mx, pony.my, state), null);
    assert.equal(state.u.uprops[STEALTH].blocked, FROMOUTSIDE);
});

test('the mount runs teleds, which marks the steed as seen', async () => {
    // teleport.c teleds():1487-1492 through display.c see_monsters(). Nothing
    // else on the mount path writes meverseen, so clearing it before the mount
    // and finding it set afterwards is what shows teleds() ran the call.
    const state = await rideTo(`.${RIDE_COMMAND}`);
    const pony = m_at(state.u.ux, state.u.uy + 1, state);
    pony.meverseen = 0;
    state.u.ulevel = MAXULEV; // passes rnd(MAXULEV / 2 + 5) every time

    assert.equal(await mount_steed(pony, false, state), true);

    assert.equal(pony.meverseen, 1);
    // teleds() also moved the hero onto the square the pony left.
    assert.equal(state.u.ux, pony.mx);
    assert.equal(state.u.uy, pony.my);
});

test('mounting draws the steed on the hero square and dismounting undraws it',
    async () => {
    // display.h display_self() (251-260). maybe_display_usteed() replaces the
    // hero's glyph with ridden_mon_to_glyph(u.usteed) while the steed is
    // visible, so the map cell under the hero shows the pony's class symbol.
    // runSegment() directly, without rideTo()'s clearTtyMessageWindow(): that
    // call repaints the top line and the map row under it.
    await runSegment({ ...southRideSegment(), moves: `.${RIDE_COMMAND}j` });
    // win/tty/wintty.c tty_print_glyph() writes map <x,y> at terminal
    // <x - 1, y + 1>: the top line takes row 0 and map column 0 is unused.
    const mapCell = (state) => state.nhDisplay
        .grid[state.u.uy + 1][state.u.ux - 1];
    // A grid cell carries a colour and an attribute as well as a character,
    // and the scored comparison reads all three. reset_glyphmap() gives a
    // ridden glyph mon_color() and MG_RIDDEN rather than MG_PET, so the cell
    // takes the pony's own colour -- monsters.h:1009 CLR_BROWN, 3 -- and
    // neither the pet override symbol nor the hilite_pet attribute.
    assert.deepEqual(mapCell(game), { ch: 'u', color: 3, attr: 0 },
                     'the ridden pony covers the hero');

    await runSegment({
        ...southRideSegment(), moves: `.${RIDE_COMMAND}j${RIDE_COMMAND}`,
    });
    // The hero's own glyph is a human's: monsters.h:2608 HI_DOMESTIC, which
    // color.h:37 defines as CLR_WHITE, 15.
    assert.deepEqual(mapCell(game), { ch: '@', color: 15, attr: 0 });
});

test('the second ride dismounts, releases the steed and charges a turn',
    async () => {
    // doride():182-183 then steed.c:575-822. The unnamed-steed line comes from
    // the DISMOUNT_BYCHOICE arm at steed.c:643-646, which uses
    // an(pmname(...)) rather than mon_nam().
    const state = await mounted();
    const pony = state.u.usteed;
    const mountedX = state.u.ux;
    const mountedY = state.u.uy;
    pony.mtame = 12; // any positive tameness; the dismount must not read it
    state.u.ugallop = 7; // steed.c:657 clears it unconditionally
    const spentBefore = getRngLog().length;

    const result = await doride(state);

    assert.equal(result, ECMD_TIME);
    assert.equal(
        toplines(), "You've been through the dungeon on a pony with no name.",
    );
    assert.equal(state.u.usteed, null);
    assert.equal(state.u.ugallop, 0);
    // The steed takes the square the hero vacated, and the hero moves to the
    // landing spot landing_spot() chose. steed.c:506's rn2(viable) is the only
    // random number the dismount takes; this seed leaves three squares tied in
    // turn, so it fires three times and settles on the square due west.
    // scripts/run-ride-dismount.mjs records the same landing from the C
    // program for this segment, screen for screen and call for call, so the
    // offset below is the reference answer rather than the port's own.
    const drawn = getRngLog().slice(spentBefore);
    assert.equal(drawn.length, 3, JSON.stringify(drawn));
    for (const entry of drawn) assert.match(entry, /^rn2\(\d+\)=\d+$/u);
    assert.equal(m_at(mountedX, mountedY, state), pony);
    assert.deepEqual([state.u.ux, state.u.uy], [mountedX - 1, mountedY]);
    // steed_vs_stealth() runs again with u.usteed cleared, which unblocks it.
    assert.equal(state.u.uprops[STEALTH].blocked, 0);
    assert.equal(state.disp.botl, true);
});

test('a cursed saddle refuses the dismount and marks itself known',
    async () => {
    // steed.c:632-638. bknown selects "is" over "seems to be", and the arm
    // returns before u.usteed is cleared, so the hero stays mounted.
    for (const [bknown, verb] of [[0, 'seems to be'], [1, 'is']]) {
        const state = await mounted();
        const saddle = state.u.usteed.minvent;
        assert.equal(saddle.owornmask & W_SADDLE, W_SADDLE);
        saddle.cursed = 1;
        saddle.bknown = bknown;

        await dismount_steed(DISMOUNT_BYCHOICE, state);

        assert.equal(toplines(), `You can't.  The saddle ${verb} cursed.`);
        assert.equal(state.u.usteed?.minvent, saddle);
        assert.equal(saddle.bknown, 1);
    }
});

test('a hero with nowhere to stand refuses the dismount', async () => {
    // steed.c:639-642. landing_spot() runs before the sanity check and every
    // message, so walling the hero in makes it answer FALSE for all three
    // passes and the arm prints instead of releasing the steed.
    const state = await mounted();
    for (let dir = 0; dir < N_DIRS; ++dir) {
        const location = state.level.at(state.u.ux + xdir[dir],
                                       state.u.uy + ydir[dir]);
        if (location) location.typ = STONE;
    }

    await dismount_steed(DISMOUNT_BYCHOICE, state);

    assert.equal(toplines(),
                 "You can't.  There isn't anywhere for you to stand.");
    assert.ok(state.u.usteed);
});

test('every dismount reason but DISMOUNT_BYCHOICE refuses', async () => {
    // hack.h:347-356. doride() supplies DISMOUNT_BYCHOICE alone; the rest need
    // owners this port does not have, and each names them at its site.
    const reasons = [
        [DISMOUNT_GENERIC, /DISMOUNT_GENERIC/u],
        [DISMOUNT_FELL, /reason 1, a fall from the saddle/u],
        [DISMOUNT_THROWN, /reason 2, a fall from the saddle/u],
        // landing_spot() refuses a knockback before dismount_steed()'s switch
        // reaches its arm, because that reason is the only one that reads
        // u.dx/u.dy to prefer a direction.
        [DISMOUNT_KNOCKED, /landing_spot\(\) for a knockback dismount/u],
        [DISMOUNT_POLY, /DISMOUNT_POLY/u],
        [DISMOUNT_ENGULFED, /DISMOUNT_ENGULFED/u],
        [DISMOUNT_BONES, /DISMOUNT_BONES/u],
    ];
    for (const [reason, pattern] of reasons) {
        const state = await mounted();
        await assert.rejects(
            dismount_steed(reason, state),
            (error) => error instanceof UnsupportedSteedError
                && pattern.test(error.message),
            String(pattern),
        );
    }
});

test('dismount_steed returns silently when the hero has no steed', async () => {
    // steed.c:586-588, the sanity check. It sits after landing_spot(), so a
    // hero on foot still pays for that scan and then returns with no message.
    const state = await rideTo(`.${RIDE_COMMAND}j${RIDE_COMMAND}`);
    assert.equal(state.u.usteed, null);
    const before = toplines();
    await dismount_steed(DISMOUNT_BYCHOICE, state);
    assert.equal(toplines(), before);
});

test('the dismount arm of doride draws no direction prompt', async () => {
    // steed.c:182-183. The mounted arm never reaches getdir(), so the painted
    // top line after the command carries the dismount message rather than
    // "In what direction?".
    await runSegment({
        ...southRideSegment(), moves: `.${RIDE_COMMAND}j${RIDE_COMMAND}`,
    });
    assert.equal(
        topLine(), "You've been through the dungeon on a pony with no name.",
    );
    assert.equal(game.u.usteed, null);
});

test('a polearm clears unweapon on mounting and sets it on dismounting',
    async () => {
    // steed.c:368-369 and steed.c:819-820. wield.c:131 computes gu.unweapon
    // with a `!u.usteed` term of its own, so setuwep() answers TRUE for a
    // polearm on foot; mounting is what turns it off again.
    const state = await rideTo(`.${RIDE_COMMAND}`);
    const pony = m_at(state.u.ux, state.u.uy + 1, state);
    assert.ok(pony, 'the pony stands south of the hero');
    // A Knight starts with a lance, which objects[] gives P_LANCE.
    const lance = [...(function* invent(obj) {
        for (let o = obj; o; o = o.nobj) yield o;
    }(state.invent))].find((obj) => is_pole(obj, state));
    assert.ok(lance, 'the Knight carries a polearm');
    state.uwep = lance;
    state.unweapon = true;

    state.u.ulevel = MAXULEV; // passes rnd(MAXULEV / 2 + 5) every time
    assert.equal(await mount_steed(pony, false, state), true);
    assert.equal(state.unweapon, false);

    quiet(state);
    await dismount_steed(DISMOUNT_BYCHOICE, state);
    assert.equal(state.unweapon, true);
});

test('mount_steed refuses a hero a bear trap has already wounded',
    async () => {
        // steed.c:229-232 answers a wounded hero with legs_in_no_shape(
        // "riding", FALSE) and returns FALSE. That helper is unported, so the
        // port stops here instead -- and the state it stops on is live rather
        // than hypothetical: do.c set_wounded_legs() is the writer, and trap.c
        // trapeffect_bear_trap()'s hero arm is the ported caller that reaches
        // it. Twelve turns is an arbitrary count; only nonzero matters.
        const state = await rideTo(`.${RIDE_COMMAND}`);
        const pony = m_at(state.u.ux, state.u.uy + 1, state);
        await set_wounded_legs(RIGHT_SIDE, 12, state);
        quiet(state);

        await assert.rejects(
            mount_steed(pony, false, state),
            (error) => error instanceof UnsupportedSteedError
                && error.reason === 'mount_steed() with wounded legs',
        );
        assert.equal(state.u.usteed, null);
    });

test('a stealthy hero is told when riding takes stealth away', async () => {
    // steed.c:372-378. youprop.h:210 makes Stealth the intrinsic or extrinsic
    // minus the blocked mask, so a hero holding the intrinsic loses stealth
    // the moment steed_vs_stealth() sets that mask.
    const state = await rideTo(`.${RIDE_COMMAND}`);
    const pony = m_at(state.u.ux, state.u.uy + 1, state);
    state.u.uprops[STEALTH].intrinsic = FROMOUTSIDE;
    state.u.ulevel = MAXULEV; // passes rnd(MAXULEV / 2 + 5) every time

    assert.equal(await mount_steed(pony, false, state), true);
    // Both lines land on the same turn, so gt.toplines holds them together.
    assert.equal(toplines(),
                 "You mount the saddled pony.  You aren't stealthy anymore.");
});

test('a stealthy hero is told when the dismount gives stealth back',
    async () => {
    // steed.c:658-664, the mirror of the arm above. The intrinsic is set after
    // the mount so the dismount is the only message on its turn.
    const state = await mounted();
    state.u.uprops[STEALTH].intrinsic = FROMOUTSIDE;
    assert.equal(state.u.uprops[STEALTH].blocked, FROMOUTSIDE);

    // Two lines on one turn overflow the top line, so the second waits on a
    // --More-- that the replayed segment has no keystroke left to answer.
    const display = state.nhDisplay;
    const readKey = display.readKey;
    display.readKey = async () => ' '.charCodeAt(0);
    try {
        await dismount_steed(DISMOUNT_BYCHOICE, state);
    } finally {
        display.readKey = readKey;
    }

    assert.equal(state.u.uprops[STEALTH].blocked, 0);
    // The --More-- starts a fresh top line, so gt.toplines holds the second
    // message alone.
    assert.equal(toplines(), 'You seem less noisy now.');
});

test('a trapped hero leaves the steed in the trap', async () => {
    // steed.c:666-670. The test reads u.utraptype rather than u.utrap, and
    // you.h:347 numbers TT_BEARTRAP 1, so an untrapped hero -- whose
    // utraptype is TT_NONE, zero -- matches none of the three.
    // makemon() initializes mtrapped to false, so an untrapped hero leaves it
    // there rather than at 1.
    for (const [traptype, trapped] of [[TT_NONE, false],
                                       [TT_BEARTRAP, 1],
                                       [TT_PIT, 1],
                                       [TT_WEB, 1],
                                       [TT_LAVA, false]]) {
        const state = await mounted();
        const pony = state.u.usteed;
        state.u.utraptype = traptype;
        await dismount_steed(DISMOUNT_BYCHOICE, state);
        assert.equal(pony.mtrapped, trapped, `utraptype ${traptype}`);
    }
});

// --- the helpers the ride calls ---

test('xytodir and dirtocoord agree over the eight compass directions', () => {
    // cmd.c:3846-3866 over decl.c:77-78's xdir[]/ydir[]. j==0 is W, 1 NW,
    // 2 N, 3 NE, 4 E, 5 SE, 6 S, 7 SW.
    for (let dir = 0; dir < N_DIRS; ++dir) {
        assert.deepEqual(dirtocoord(dir), { x: xdir[dir], y: ydir[dir] });
        assert.equal(xytodir(xdir[dir], ydir[dir]), dir);
    }
    assert.equal(xytodir(0, 0), DIR_ERR);
    assert.equal(xytodir(2, 0), DIR_ERR);
    // N_DIRS_Z is 10; 8 and 9 are down and up, and both are in range for
    // dirtocoord() even though xytodir() never returns them.
    assert.deepEqual(dirtocoord(8), { x: 0, y: 0 });
    assert.equal(dirtocoord(DIR_ERR), null);
    assert.equal(dirtocoord(10), null);
});

test('steed_vs_stealth blocks stealth only for a grounded rider', async () => {
    // polyself.c:158-164. The FROMOUTSIDE bit goes on when the hero rides and
    // neither Flying nor Levitation holds, and comes off otherwise.
    const state = await mounted();
    const stealth = state.u.uprops[STEALTH];
    assert.equal(stealth.blocked, FROMOUTSIDE);

    state.u.uprops[FLYING].intrinsic = FROMOUTSIDE;
    steed_vs_stealth(state);
    assert.equal(stealth.blocked, 0);
    state.u.uprops[FLYING].intrinsic = 0;

    state.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE;
    steed_vs_stealth(state);
    assert.equal(stealth.blocked, 0);
    state.u.uprops[LEVITATION].intrinsic = 0;

    steed_vs_stealth(state);
    assert.equal(stealth.blocked, FROMOUTSIDE);

    const steed = state.u.usteed;
    state.u.usteed = null;
    steed_vs_stealth(state);
    assert.equal(stealth.blocked, 0);
    state.u.usteed = steed;
});

test('float_vs_flight blocks flight while levitating and marks the status line',
    async () => {
    // polyself.c:131-154. Floating overrides flight; being stuck in the floor
    // -- u.utrap set with a utraptype other than TT_PIT -- overrides floating.
    const state = await mounted();
    const flying = state.u.uprops[FLYING];
    const levitation = state.u.uprops[LEVITATION];

    state.disp.botl = false;
    float_vs_flight(state);
    assert.equal(flying.blocked, 0);
    assert.equal(levitation.blocked, 0);
    assert.equal(state.disp.botl, true);

    levitation.extrinsic = FROMOUTSIDE;
    float_vs_flight(state);
    assert.equal(flying.blocked, 0x20000000); // I_SPECIAL
    assert.equal(levitation.blocked, 0);

    state.u.utrap = 3;
    state.u.utraptype = TT_BEARTRAP;
    float_vs_flight(state);
    assert.equal(levitation.blocked, 0x20000000);

    // A pit is the one trap that leaves the floor out of reach, so it does
    // not block levitation.
    state.u.utraptype = TT_PIT;
    float_vs_flight(state);
    assert.equal(levitation.blocked, 0);

    state.u.utrap = 0;
    state.u.utraptype = TT_NONE;
    levitation.extrinsic = 0;
    float_vs_flight(state);
});

test('set_utrap flags the status line only when the trap state changes',
    async () => {
    // trap.c:1030-1043. `!u.utrap ^ !tim` is true only at the transition.
    const state = await mounted();
    state.disp.botl = false;
    set_utrap(0, TT_BEARTRAP, state);
    assert.equal(state.u.utrap, 0);
    assert.equal(state.u.utraptype, TT_NONE); // tim 0 forces TT_NONE
    // float_vs_flight() runs unconditionally and sets the flag itself, which
    // is why the transition test alone cannot be observed through disp.botl.
    assert.equal(state.disp.botl, true);

    set_utrap(5, TT_WEB, state);
    assert.equal(state.u.utrap, 5);
    assert.equal(state.u.utraptype, TT_WEB);
    set_utrap(0, TT_WEB, state);
    assert.equal(state.u.utraptype, TT_NONE);
});

test('reset_utrap releases the hero and refuses a resumed levitation',
    async () => {
    // trap.c:1045-1057. teleds() passes msg FALSE, so float_up() and the
    // "You can fly." line below it are unreachable there.
    const state = await mounted();
    state.u.utrap = 4;
    state.u.utraptype = TT_WEB;
    reset_utrap(false, state);
    assert.equal(state.u.utrap, 0);
    assert.equal(state.u.utraptype, TT_NONE);

    // With msg TRUE and levitation that the trap was blocking, C would call
    // float_up(); this port stops instead.
    state.u.utrap = 4;
    state.u.utraptype = TT_WEB;
    state.u.uprops[LEVITATION].extrinsic = FROMOUTSIDE;
    float_vs_flight(state); // sets BLevitation, so Levitation is FALSE now
    assert.throws(() => reset_utrap(true, state),
                  UnsupportedHeroMoveBoundaryError);
    state.u.uprops[LEVITATION].extrinsic = 0;
    float_vs_flight(state);
});

test('fill_pit refuses only a boulder resting on a pit', async () => {
    // trap.c:4010-4021. Three conjuncts, and the port has an owner for none of
    // the settling; a square with no trap, or a pit with no boulder, is a
    // no-op.
    const state = await mounted();
    const { ux, uy } = state.u;
    fill_pit(ux, uy, state); // no trap here at all
    state.level.traps ??= [];
    state.level.traps.push({ tx: ux, ty: uy, ttyp: TT_PIT });
    fill_pit(ux, uy, state); // a trap, but no boulder
    state.level.traps.pop();
});

test('float_down refuses every arm but the saddled descent', async () => {
    // trap.c:4024-4177. dismount_steed() passes hmask 0 and emask W_SADDLE.
    // Without W_SADDLE the whole "float gently" block is live and refuses.
    const state = await mounted();
    await assert.rejects(
        float_down(0, 0, state),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError
            && /landing messages/u.test(error.message),
    );
    // Still levitating after the masks are applied means another source
    // remains, and C returns 0 without touching anything else.
    state.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE;
    assert.equal(await float_down(0, W_SADDLE, state), 0);
    state.u.uprops[LEVITATION].intrinsic = 0;

    assert.equal(await float_down(0, W_SADDLE, state), 1);
});

test('u_locomotion answers for the hero rather than the hero form', async () => {
    // hack.c:1817-1829. Levitation wins over flight, and the capitalization of
    // the default decides the case of both.
    const state = await mounted();
    assert.equal(u_locomotion('fall', state), 'fall');
    assert.equal(u_locomotion('Fall', state), 'Fall');

    state.u.uprops[FLYING].intrinsic = FROMOUTSIDE;
    assert.equal(u_locomotion('fall', state), 'fly');
    assert.equal(u_locomotion('Fall', state), 'Fly');

    state.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE;
    assert.equal(u_locomotion('fall', state), 'float');
    assert.equal(u_locomotion('Fall', state), 'Float');
    state.u.uprops[FLYING].intrinsic = 0;
    state.u.uprops[LEVITATION].intrinsic = 0;
});

test('set_ustuck clears the swallow state with the holder', async () => {
    // mon.c:3421-3434. Clearing the holder is what teleds() uses to leave an
    // engulfer, so it also clears u.uswallow and u.uswldtim.
    const state = await mounted();
    const holder = state.u.usteed;
    state.u.uswallow = 1;
    state.u.uswldtim = 9;
    state.disp.botl = false;

    set_ustuck(holder, state);
    assert.equal(state.u.ustuck, holder);
    assert.equal(state.u.uswallow, 1, 'a non-null holder leaves it alone');
    assert.equal(state.disp.botl, true);

    set_ustuck(null, state);
    assert.equal(state.u.ustuck, null);
    assert.equal(state.u.uswallow, 0);
    assert.equal(state.u.uswldtim, 0);
});

test('update_player_regions recomputes hero membership', async () => {
    // region.c:582-592. A region attached to the hero takes the else arm and
    // is cleared, which is an oddity of the source rather than a port choice.
    const state = await mounted();
    const covering = {
        bounding_box: { lx: 0, ly: 0, hx: 79, hy: 20 },
        rects: [{ lx: 0, ly: 0, hx: 79, hy: 20 }],
        attach_2_u: false,
        hero_inside: false,
    };
    const attached = { ...covering, attach_2_u: true, hero_inside: true };
    const distant = {
        bounding_box: { lx: 0, ly: 0, hx: 0, hy: 0 },
        rects: [{ lx: 0, ly: 0, hx: 0, hy: 0 }],
        attach_2_u: false,
        hero_inside: true,
    };
    state.level.regions = [covering, attached, distant];

    update_player_regions(state);

    assert.equal(covering.hero_inside, true);
    assert.equal(attached.hero_inside, false);
    assert.equal(distant.hero_inside, false);
    state.level.regions = [];
});

test('see_monsters repaints the monster list and skips the hero square',
    async () => {
    // display.c:1487-1522. The steed keeps the hero's coordinates and stays on
    // the monster list, so the loop's own newsym() paints the hero's square
    // and the final `if (!u.usteed) newsym(u.ux, u.uy)` is skipped while
    // riding. Every assertion below reads the painted cell rather than
    // meverseen, which display.c:1496 writes before the loop begins and which
    // therefore says nothing about the loop or its MON_STILL_ARRIVING skip.
    const state = await mounted();
    const steed = state.u.usteed;
    // C's gbuf entry for the square, which show_glyph() writes and the next
    // flush copies to the terminal. see_monsters() is called here without a
    // flush behind it, so the buffer is where its newsym() calls land.
    const buffered = () => {
        const loc = state.level.at(state.u.ux, state.u.uy);
        return { gnew: loc.gnew, ch: loc.disp_ch, color: loc.disp_color };
    };
    const scribble = () => Object.assign(
        state.level.at(state.u.ux, state.u.uy),
        { gnew: 0, disp_ch: '?', disp_color: 9 },
    );
    const SCRIBBLED = { gnew: 0, ch: '?', color: 9 };

    steed.meverseen = 0;
    scribble();
    see_monsters(state);
    // The steed is marked before the loop, so this holds either way; the
    // repainted buffer entry is what shows the loop ran.
    assert.equal(steed.meverseen, 1);
    // monsters.h:1009 gives the pony CLR_BROWN, 3.
    assert.deepEqual(buffered(), { gnew: 1, ch: 'u', color: 3 },
                     'the loop repaints the ridden steed');

    // A monster still arriving on the level is skipped entirely, and nothing
    // else paints the hero's square while u.usteed is set.
    steed.mstate = MON_STILL_ARRIVING;
    scribble();
    see_monsters(state);
    assert.deepEqual(buffered(), SCRIBBLED,
                     'a still-arriving monster is not repainted');

    // With the steed skipped, clearing u.usteed is what lets the tail paint
    // the hero's own square. monsters.h:2608 gives a human HI_DOMESTIC, which
    // color.h:37 defines as CLR_WHITE, 15.
    state.u.usteed = null;
    scribble();
    see_monsters(state);
    assert.deepEqual(buffered(), { gnew: 1, ch: '@', color: 15 },
                     'the tail paints the hero once he is on foot');

    state.u.usteed = steed;
    steed.mstate = 0;
});

test('notice_mon_off and notice_mon_on nest and reject an unpaired resume',
    async () => {
    // flag.h:233-237. C clamps a negative count through impossible(); this
    // port throws, because a negative count means a lost notice_mon_off().
    const state = await mounted();
    const before = state.a11y.mon_notices_blocked ?? 0;
    notice_mon_off(state);
    notice_mon_off(state);
    assert.equal(state.a11y.mon_notices_blocked, before + 2);
    notice_mon_on(state);
    notice_mon_on(state);
    assert.equal(state.a11y.mon_notices_blocked, before);
    if (before === 0) assert.throws(() => notice_mon_on(state), /blocked<0/u);
});

test('invocation_message admits only the Dungeons of Doom', async () => {
    // hack.c:3064-3085 behind invocation_pos(), which needs Invocation_lev().
    const state = await mounted();
    assert.equal(state.u.uz.dnum, 0);
    invocation_message(state);
    state.u.uz.dnum = 1;
    assert.throws(() => invocation_message(state),
                  UnsupportedHeroMoveBoundaryError);
    state.u.uz.dnum = 0;
});

test('vault_occupied answers the first vault in a room string', async () => {
    // vault.c:244-253. The room string is zero-terminated, so a zero stops the
    // scan before any room number behind it.
    const state = await mounted();
    state.level.rooms = [{ rtype: ROOM }, { rtype: VAULT }, { rtype: ROOM }];
    const room = (index) => index + ROOMOFFSET;
    assert.equal(vault_occupied([room(0), room(2), 0, 0, 0], state), 0);
    assert.equal(vault_occupied([room(0), room(1), 0, 0, 0], state),
                 room(1));
    assert.equal(vault_occupied([0, room(1), 0, 0, 0], state), 0);
    assert.equal(vault_occupied([], state), 0);
});

// --- landing_spot(), which chooses where the dismounting hero stands ---

// Turn every square around the hero into rock, then reopen the ones a case
// wants, so each test states exactly which candidates landing_spot() sees.
function isolate(state, open = []) {
    for (let dir = 0; dir < N_DIRS; ++dir) {
        const location = state.level.at(state.u.ux + xdir[dir],
                                        state.u.uy + ydir[dir]);
        if (location) location.typ = STONE;
    }
    for (const dir of open) {
        const location = state.level.at(state.u.ux + xdir[dir],
                                        state.u.uy + ydir[dir]);
        assert.ok(location, `direction ${dir} is on the map`);
        location.typ = ROOM;
        location.lit = 1;
    }
}

function at(state, dir) {
    return { x: state.u.ux + xdir[dir], y: state.u.uy + ydir[dir] };
}

test('landing_spot takes the only square left open', async () => {
    // steed.c:503-563. accessible() rejects rock, so walling off seven of the
    // eight neighbours leaves exactly one viable candidate and no tie to
    // break.
    const state = await mounted();
    isolate(state, [DIR_E]);
    assert.deepEqual(
        await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
        at(state, DIR_E),
    );
});

test('landing_spot prefers an orthogonal square to a diagonal one', async () => {
    // hack.h:1531 distu() is the squared distance, so an orthogonal
    // neighbour is 1 and a diagonal one 2. The scan runs W, NW, N, NE, E, SE,
    // S, SW, so the diagonal is seen first and then replaced.
    const state = await mounted();
    isolate(state, [DIR_NW, DIR_E]);
    assert.deepEqual(
        await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
        at(state, DIR_E),
    );
});

test('landing_spot breaks a tie between two equally near squares by rn2',
    async () => {
    // steed.c:506. The scan runs W, NW, N, NE, E, SE, S, SW, so with only west
    // and east open the west square becomes the pending candidate through the
    // `min_distance < 0` arm, which draws nothing, and the east square, at the
    // same dist2 of 1, is the only tie. rn2(viable) therefore fires exactly
    // once, with viable == 2, and its value decides where the hero lands. It
    // is the only random number the live dismount path takes.
    const state = await mounted();
    isolate(state, [DIR_E, DIR_W]);

    const before = getRngLog().length;
    const spot = await _steedInternals.landing_spot(
        DISMOUNT_BYCHOICE, 0, state,
    );
    const drawn = getRngLog().slice(before);

    assert.equal(drawn.length, 1, JSON.stringify(drawn));
    const tie = /^rn2\(2\)=([01])$/u.exec(drawn[0]);
    assert.ok(tie, `the tie-break draws rn2(2), not ${drawn[0]}`);
    // `!rn2(viable)` substitutes the tied candidate, so 0 takes the east
    // square the scan reached second and 1 keeps the west one.
    assert.deepEqual(spot, at(state, tie[1] === '0' ? DIR_E : DIR_W));
});

test('landing_spot passes over a square the squeeze rule refuses',
    async () => {
    // hack.c:1153-1177 wraps each cant_squeeze_thru() case in
    // `if (mode == DO_MOVE)` and returns FALSE for every mode, so a TEST_MOVE
    // probe drops the square in silence. landing_spot() probes all eight
    // neighbours, so a probe that refused loudly would end the dismount
    // instead of the candidate.
    const state = await mounted();
    // Only the north-east diagonal and the west orthogonal stay open. The NE
    // probe finds STONE at <ux, uy-1> and <ux+1, uy>, which bad_rock() answers
    // true for on both, so it enters the switch; the W probe has dy == 0 and
    // skips it.
    isolate(state, [DIR_NE, DIR_W]);
    // objects.h:1617-1618 gives a boulder a weight of 6000, ten times
    // WT_TOOMUCH_DIAGONAL, so cant_squeeze_thru() answers 2, "lugging too much
    // junk". No level this port generates hands the hero that much, which is
    // why the arm is dormant in a recording.
    const boulder = mksobj(BOULDER, false, false, { state });
    boulder.nobj = state.invent;
    state.invent = boulder;
    try {
        assert.equal(cant_squeeze_thru(state.youmonst, state), 2);
        assert.equal(
            await test_move(state.u.ux, state.u.uy, 1, -1, TEST_MOVE, state),
            false,
        );
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_W),
        );
    } finally {
        state.invent = boulder.nobj;
    }
});

// The two-candidate arrangement both trap tests use: a clean diagonal square
// and a trapped orthogonal one. The orthogonal square is the nearer of the two
// -- distu() is 1 against 2 -- so whichever pass accepts it wins outright and
// the equal-distance rn2(viable) tie-break never runs.
function trappedOrthogonalSquare(state, ttyp = TT_PIT) {
    isolate(state, [DIR_NW, DIR_E]);
    const east = at(state, DIR_E);
    state.level.traps ??= [];
    const trap = { tx: east.x, ty: east.y, ttyp, tseen: 1 };
    state.level.traps.push(trap);
    return trap;
}

test('landing_spot walks away from a seen trap on the first pass', async () => {
    // steed.c:546-548. Pass 0 -- a voluntary dismount by an unimpaired hero --
    // rejects a trap the hero has seen, and only that: an unseen trap and the
    // vibrating square are both taken.
    const state = await mounted();
    const trap = trappedOrthogonalSquare(state);
    try {
        const before = getRngLog().length;
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_NW),
        );
        assert.equal(getRngLog().length, before,
                     'unequal distances leave the tie-break unreached');

        trap.tseen = 0;
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_E),
        );
        trap.tseen = 1;
        trap.ttyp = VIBRATING_SQUARE;
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_E),
        );
    } finally {
        state.level.traps.pop();
    }
});

test('an impaired hero starts at the pass that allows a seen trap',
    async () => {
    // steed.c:539-543. Stunned, Confusion or Fumbling starts the scan at
    // i == 1, where kn_trap is dead, so the nearer trapped square wins where
    // an unimpaired hero would have gone the other way.
    const state = await mounted();
    trappedOrthogonalSquare(state);
    try {
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_NW),
        );
        for (const property of [STUNNED, CONFUSION, FUMBLING]) {
            state.u.uprops[property].intrinsic = FROMOUTSIDE;
            assert.deepEqual(
                await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
                at(state, DIR_E),
                `property ${property}`,
            );
            state.u.uprops[property].intrinsic = 0;
        }
    } finally {
        state.level.traps.pop();
    }
});

test('landing_spot skips a square another monster stands on', async () => {
    // steed.c:521, the MON_AT() term. The pony is off the map while ridden,
    // so it is not its own obstacle; any other monster is.
    const state = await mounted();
    isolate(state, [DIR_E, DIR_W]);
    const east = at(state, DIR_E);
    const blocker = { ...state.u.usteed, mx: east.x, my: east.y, mtame: 0 };
    state.level.monsters[east.x][east.y] = blocker;
    try {
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_W),
        );
    } finally {
        state.level.monsters[east.x][east.y] = null;
    }
});

test('landing_spot refuses the two arms this port has no owner for',
    async () => {
    // DISMOUNT_KNOCKED reads u.dx/u.dy to prefer the knockback direction, and
    // `forceit` falls back to enexto(); neither has an owner here.
    const state = await mounted();
    state.u.dx = 1;
    state.u.dy = 0;
    await assert.rejects(
        _steedInternals.landing_spot(DISMOUNT_KNOCKED, 0, state),
        (error) => error instanceof UnsupportedSteedError
            && /knockback dismount/u.test(error.message),
    );
    isolate(state, []); // no candidate at all, so `found` stays FALSE
    assert.equal(
        await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state), null,
    );
    await assert.rejects(
        _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 1, state),
        (error) => error instanceof UnsupportedSteedError
            && /forced through enexto/u.test(error.message),
    );
});

test('maybewakesteed halves a frozen steed and ends its meal', async () => {
    // steed.c:825-848. rn2(frozen) is the only random number the success path
    // can draw, and it fires only for a frozen steed; the halving is
    // (frozen + 1) / 2 whether or not the draw wakes it.
    const state = await mounted();
    const steed = state.u.usteed;

    steed.mfrozen = 0;
    steed.msleeping = 0;
    steed.mcanmove = 1;
    steed.meating = 5;
    _steedInternals.maybewakesteed(steed);
    assert.equal(steed.meating, 0, 'finish_meating() ends the meal');
    assert.equal(steed.mfrozen, 0);

    // A frozen steed that stays frozen keeps the halved duration. mcanmove is
    // left set here so that helpless() is false on both sides and the
    // "%s wakes up." refusal cannot fire whichever way the draw goes.
    steed.mfrozen = 9;
    _steedInternals.maybewakesteed(steed);
    assert.ok(steed.mfrozen === 0 || steed.mfrozen === 5,
              `(9 + 1) / 2 is 5; got ${steed.mfrozen}`);

    // A steed that was helpless and wakes prints "%s wakes up.", which this
    // port refuses.
    steed.mfrozen = 0;
    steed.msleeping = 1;
    assert.throws(() => _steedInternals.maybewakesteed(steed),
                  UnsupportedSteedError);
    steed.msleeping = 0;
});

// --- teleds(), the hero relocation both halves of the ride use ---

test('teleds refuses every arm outside an ordinary adjacent square',
    async () => {
    // teleport.c:448-573. Each guard names the C machinery it stands in for.
    const rows = [
        ['unearthing a buried ball', (state) => {
            state.u.utraptype = TT_BURIEDBALL;
        }],
        ['dragging a punishing ball', (state) => {
            state.uball = { where: 3 }; // OBJ_MINVENT: anything but OBJ_FREE
        }],
        ['out of an engulfer', (state) => { state.u.uswallow = 1; }],
        ['out of an occupied vault', (state) => {
            state.level.rooms = [{ rtype: VAULT }];
            state.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
        }],
        // teleds() makes no test of its own about who is standing on the
        // destination; hack.c spoteffects():3417-3455 is what answers, by
        // dropping a piercer or letting the resident monster attack by
        // surprise. None of that is ported, and this is the one caller whose
        // destination can hold a monster, so the refusal sits here.
        ['onto an occupied square', (state, spot) => {
            place_monster(
                newMonster({
                    mhp: 1, mhpmax: 1, mcanmove: 1,
                    data: state.mons[PM_LICHEN], mnum: PM_LICHEN,
                }),
                spot.x, spot.y, state,
            );
        }],
    ];
    for (const [reason, mutate] of rows) {
        const state = await mounted();
        const spot = { x: state.u.ux + 1, y: state.u.uy, flags: 0 };
        mutate(state, spot);
        await assert.rejects(
            teleds(spot.x, spot.y, spot.flags, state),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && new RegExp(reason.replaceAll(' ', '\\s'), 'u')
                    .test(error.message),
            reason,
        );
    }
});

test('landing_spot avoids a boulder on both of the first two passes',
    async () => {
    // steed.c:549-551. The boulder term is `i <= 1`, one pass wider than the
    // trap term, and it lapses for a hero who throws rocks.
    const state = await mounted();
    isolate(state, [DIR_NW, DIR_E]);
    const east = at(state, DIR_E);
    const boulder = mksobj(BOULDER, false, false, { state });
    place_object(boulder, east.x, east.y, { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });
    try {
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_NW),
        );
        // An impaired hero starts one pass later and still avoids it.
        state.u.uprops[STUNNED].intrinsic = FROMOUTSIDE;
        assert.deepEqual(
            await _steedInternals.landing_spot(DISMOUNT_BYCHOICE, 0, state),
            at(state, DIR_NW),
        );
        state.u.uprops[STUNNED].intrinsic = 0;

        // The `!throws_rocks(gy.youmonst.data)` conjunct has no case here.
        // Every species mondata.h throws_rocks() admits is bigmonst(), and
        // can_ride() (steed.c:172) refuses a big hero the saddle in the first
        // place, so no hero who reaches a dismount can shoulder the boulder
        // aside. mondata's own tests pin the predicate.
        assert.equal(throws_rocks(state.youmonst.data), false);
    } finally {
        // remove_object() would need the boulder's recalcBlockPoint owner;
        // detaching it from the square's object chain is enough here, because
        // each test replays its own segment for a fresh level.
        state.level.objects[east.x][east.y] = null;
        void boulder;
    }
});

test('the successful mount spends nothing but its own impairment roll',
    async () => {
    // steed.c:358-382. maybewakesteed() draws only for a frozen steed and
    // steed_vs_stealth() draws nothing, so the one random number a successful
    // mount takes is the rnd(MAXULEV / 2 + 5) that let it through. Everything
    // teleds() reaches on an ordinary floor square is deterministic.
    const state = await rideTo(`.${RIDE_COMMAND}`);
    const pony = m_at(state.u.ux, state.u.uy + 1, state);
    state.u.ulevel = MAXULEV; // passes rnd(MAXULEV / 2 + 5) every time

    const before = getRngLog().length;
    assert.equal(await mount_steed(pony, false, state), true);
    assert.equal(getRngLog().length, before + 1);
});

// --- the readers u.usteed makes live ---

test('riding a strong steed lifts the hero to the maximum carrying capacity',
    async () => {
    // hack.c weight_cap():4325-4327. A pony is M2_STRONG, so C answers
    // MAX_CARR_CAP for a mounted Knight and the ordinary Str+Con figure for
    // one on foot.
    const state = await rideTo(`.${RIDE_COMMAND}`);
    const onFoot = weight_cap(state);
    assert.ok(onFoot < MAX_CARR_CAP, `${onFoot} is below the ceiling`);
    const pony = m_at(state.u.ux, state.u.uy + 1, state);
    assert.ok(strongmonst(pony.data), 'monst.c gives the pony M2_STRONG');

    state.u.ulevel = MAXULEV; // passes rnd(MAXULEV / 2 + 5) every time
    assert.equal(await mount_steed(pony, false, state), true);
    assert.equal(weight_cap(state), MAX_CARR_CAP);
});

test('the status line reports Ride while mounted and Fly on a flying steed',
    async () => {
    // botl.c:1194 and :1198. bl_ride reads u.usteed directly; bl_fly reads
    // youprop.h:253's Flying, whose third term is a flying steed. No steed
    // this port reaches flies, so the pony is given M1_FLY by hand.
    const state = await mounted();
    assert.equal(statusConditionActive('ride', state.u), true);
    assert.equal(statusConditionActive('fly', state.u), false);

    const species = state.u.usteed.data;
    state.u.usteed.data = { ...species, mflags1: species.mflags1 | M1_FLY };
    assert.equal(statusConditionActive('fly', state.u), true);
    state.u.usteed.data = species;

    state.u.usteed = null;
    assert.equal(statusConditionActive('ride', state.u), false);
});

// --- the property macros this slice copies into four files ---

// youprop.h spells Flying and Levitation as `intrinsic || extrinsic`, and
// Flying adds a steed term. Every copy has to answer the same way to all
// three, so each is driven through one observable owner.
const PROPERTY_SOURCES = Object.freeze([
    ['intrinsic', (property) => { property.intrinsic = FROMOUTSIDE; }],
    ['extrinsic', (property) => { property.extrinsic = W_SADDLE; }],
]);

test('every copy of Flying reads the extrinsic as well as the intrinsic',
    async () => {
    // js/polyself.js, js/steed.js, js/trap.js and js/display.js each hold a
    // transcription of youprop.h:253. steed_vs_stealth() is polyself's
    // observable owner, float_down()'s liquid arm is trap.js's, and the
    // status line is display.js's.
    for (const [label, set] of PROPERTY_SOURCES) {
        const state = await mounted();
        set(state.u.uprops[FLYING]);

        steed_vs_stealth(state);
        assert.equal(state.u.uprops[STEALTH].blocked, 0, `polyself ${label}`);
        assert.equal(statusConditionActive('fly', state.u), true,
                     `display ${label}`);

        // trap.c float_down():4086's `if (!Flying)` guards the held-hero arm,
        // so a flying hero passes a held one straight through.
        state.u.ustuck = state.u.usteed;
        assert.equal(await float_down(0, W_SADDLE, state), 1, `trap ${label}`);
        state.u.uprops[FLYING].intrinsic = 0;
        state.u.uprops[FLYING].extrinsic = 0;
        await assert.rejects(
            float_down(0, W_SADDLE, state),
            (error) => /while held/u.test(error.message),
            `trap ${label} without the property`,
        );
    }
});

test('every copy of Levitation reads the extrinsic as well as the intrinsic',
    async () => {
    // youprop.h:242. float_down() returns 0 for a hero who is still
    // levitating after the two masks are applied, and reset_utrap(TRUE)
    // refuses a levitation the trap was blocking.
    for (const [label, set] of PROPERTY_SOURCES) {
        const state = await mounted();
        set(state.u.uprops[LEVITATION]);
        assert.equal(await float_down(0, 0, state), 0, `trap ${label}`);
        assert.equal(statusConditionActive('levitate', state.u), true,
                     `display ${label}`);
        // polyself.c steed_vs_stealth() takes the same `!Levitation` term.
        steed_vs_stealth(state);
        assert.equal(state.u.uprops[STEALTH].blocked, 0, `polyself ${label}`);
    }
});

test('a flying steed carries the hero through every copy of Flying',
    async () => {
    // The third term of youprop.h:253. No steed this port can reach flies, so
    // the pony is given M1_FLY by hand.
    const state = await mounted();
    const species = state.u.usteed.data;
    state.u.usteed.data = { ...species, mflags1: species.mflags1 | M1_FLY };

    steed_vs_stealth(state);
    assert.equal(state.u.uprops[STEALTH].blocked, 0, 'polyself');
    assert.equal(statusConditionActive('fly', state.u), true, 'display');
    assert.equal(u_locomotion('fall', state), 'fly', 'hack');
    state.u.ustuck = state.u.usteed;
    assert.equal(await float_down(0, W_SADDLE, state), 1, 'trap');

    state.u.usteed.data = species;
});

test('float_down refuses each hero state that stops the descent', async () => {
    // trap.c:4066-4110, one arm at a time. Each needs the hero not flying, so
    // they are driven from an ordinary mounted state.
    const rows = [
        ['while engulfed', (state) => { state.u.uswallow = 1; }],
        ['with a punishing ball', (state) => { state.uball = { where: 3 }; }],
        ['while held', (state) => { state.u.ustuck = state.u.usteed; }],
        ['into water or lava', (state) => {
            state.level.at(state.u.ux, state.u.uy).typ = POOL;
        }],
        ['on the air or water level', (state) => {
            state.air_level = { dnum: state.u.uz.dnum,
                                dlevel: state.u.uz.dlevel };
        }],
        ['underwater', (state) => { state.u.uinwater = 1; }],
        ['onto a trap', (state) => {
            state.level.traps ??= [];
            state.level.traps.push({
                tx: state.u.ux, ty: state.u.uy, ttyp: TT_PIT, tseen: 1,
            });
        }],
        ['into controlled flight', (state) => {
            state.u.uprops[FLYING].blocked = FROMOUTSIDE;
        }],
        ['with levitation blocked', (state) => {
            state.u.uprops[LEVITATION].blocked = FROMOUTSIDE;
        }],
    ];
    for (const [reason, mutate] of rows) {
        const state = await mounted();
        mutate(state);
        await assert.rejects(
            float_down(0, W_SADDLE, state),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && new RegExp(reason.replaceAll(' ', '\\s'), 'u')
                    .test(error.message),
            reason,
        );
    }
});

test('fill_pit refuses a hole as well as a pit', async () => {
    // trap.c:4013's `is_pit(t->ttyp) || is_hole(t->ttyp)`. Both halves need a
    // boulder on the same square before the settling arm is reached.
    const state = await mounted();
    const { ux, uy } = state.u;
    const boulder = mksobj(BOULDER, false, false, { state });
    place_object(boulder, ux, uy, { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });
    state.level.traps ??= [];
    const trap = { tx: ux, ty: uy, ttyp: PIT };
    state.level.traps.push(trap);
    try {
        for (const ttyp of [PIT, HOLE]) {
            trap.ttyp = ttyp;
            assert.throws(() => fill_pit(ux, uy, state),
                          UnsupportedHeroMoveBoundaryError, `ttyp ${ttyp}`);
        }
        // A trap that is neither, and a pit with no boulder, are both no-ops.
        trap.ttyp = SQKY_BOARD;
        fill_pit(ux, uy, state);
        trap.ttyp = PIT;
        state.level.objects[ux][uy] = null;
        fill_pit(ux, uy, state);
    } finally {
        state.level.traps.pop();
        void boulder;
    }
});

test('is_pole covers both object classes and both polearm skills', () => {
    // obj.h:228. A polearm is a WEAPON_CLASS or TOOL_CLASS object whose skill
    // is P_POLEARMS or P_LANCE, or Snickersnee whatever its skill.
    const rows = [
        [WEAPON_CLASS, RANSEUR, true], // P_POLEARMS
        [WEAPON_CLASS, LANCE, true], // P_LANCE
        [WEAPON_CLASS, LONG_SWORD, false], // P_LONG_SWORD
        [TOOL_CLASS, PICK_AXE, false], // P_PICK_AXE, a tool that is not a pole
    ];
    for (const [oclass, otyp, expected] of rows) {
        assert.equal(is_pole({ oclass, otyp }, game), expected, String(otyp));
    }
    // The class test is a conjunct of its own: the same skill on some other
    // class answers FALSE.
    assert.equal(is_pole({ oclass: ROCK_CLASS, otyp: LANCE }, game), false);
});
