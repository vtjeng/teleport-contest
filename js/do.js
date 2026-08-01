// do.js -- Commands that drop, dig into, or descend through the floor.
// C refs: do.c -- u_stuck_cannot_go(), dodown(), and goto_level()'s opening
// phase.

import {
    DIR_DOWN,
    ECMD_OK,
    ECMD_TIME,
    In_endgame,
    In_tutorial,
    LADDER,
    LEVITATION,
    TT_BURIEDBALL,
    Upolyd,
    VIBRATING_SQUARE,
    is_hole,
} from './const.js';
import { next_to_u } from './apply_next_to_u.js';
import { set_move_cmd } from './cmd.js';
import { keepdogs } from './dog.js';
import {
    Can_fall_thru,
    In_hell,
    depth,
    dunlev,
    dunlevs_in_dungeon,
    ledger_no,
    next_level,
    on_level,
} from './dungeon.js';
import { game } from './gstate.js';
import { set_uinwater, u_rooted } from './hack.js';
import { maybe_reset_pick } from './lock.js';
import { set_ustuck } from './mon.js';
import { is_pick } from './obj.js';
import { check_special_room } from './rooms.js';
import { stairway_at } from './stairs.js';
import { stucksteed } from './steed.js';
import {
    fill_pit,
    reset_utrap,
    t_at,
    uescaped_shaft,
    uteetering_at_seen_pit,
} from './trap.js';
import { ttyPline } from './tty_message.js';
import { vision_recalc } from './vision.js';

// A level change this port has not reached. do.c goto_level() rewrites the
// hero's dungeon level and everything on it; nothing in the port does any of
// it, so every dodown() arm that would descend stops here instead.
export class UnsupportedLevelChangeError extends Error {
    constructor(reason) {
        super(`unsupported level change: ${reason}`);
        this.name = 'UnsupportedLevelChangeError';
        this.reason = reason;
    }
}

// C ref: do.c u_stuck_cannot_go() (1109-1128). Its release arm calls
// mon.c set_ustuck() and do_name.c mon_nam(); its holding arm needs
// mondata.c digests(). Neither is written out, because js/mon.js set_ustuck()
// has one caller in the port, js/teleport.js, and it passes null, so u.ustuck
// is null on every admitted path and this function always answers FALSE.
function u_stuck_cannot_go(updn, state = game) {
    if (state.u?.ustuck) {
        throw new UnsupportedLevelChangeError(
            `u_stuck_cannot_go("${updn}") with a hero who is held`,
        );
    }
    return false;
}

// C ref: do.c dodown() (1129-1294), the '>' command.
//
// Five of its arms stop rather than run, each named at the throw. What remains
// is the ordinary answer for a hero standing where there is no way down:
// "You can't go down here." with no turn spent.
export async function dodown(state = game) {
    const u = state.u;
    let trap = null;

    set_move_cmd(DIR_DOWN, 0, state);

    if (await u_rooted(state)) return ECMD_TIME;

    if (stucksteed(true, state)) return ECMD_OK;

    let stairs_down = false;
    let ladder_down = false;
    const stway = stairway_at(u.ux, u.uy, state);
    if (stway && !stway.up) {
        stairs_down = !stway.isladder;
        ladder_down = !stairs_down;
    }

    // do.c:1154-1201. The whole levitation arm, which ends controlled
    // levitation through float_down() and rnz(), and otherwise reports what
    // the hero is floating above through surface() and floating_above().
    // Nothing is ported. js/worn.js setworn() is the port's only writer of an
    // extrinsic property and no starting inventory grants LEVITATION, and
    // js/u_init_inventory_attrs.js grants only JUMPING intrinsically, so
    // neither field can be nonzero here.
    const levitation = u.uprops?.[LEVITATION];
    if (levitation?.intrinsic || levitation?.extrinsic) {
        throw new UnsupportedLevelChangeError(
            'dodown() with a levitating hero',
        );
    }

    // do.c:1204-1218, the arm that drops a hiding polymorphed hero out of the
    // ceiling. It needs mondata.c ceiling_hider(), and its piercer branch
    // reaches pooleffects(), pickup() and dotrap(). The guard is wider than
    // C's three-term test on purpose: js/u_init.js is the port's only writer
    // of u.umonnum and it sets u.umonnum === u.umonster, so Upolyd() is false
    // for every hero the port can build and the extra terms would only make
    // the stop harder to reach.
    if (Upolyd(u)) {
        throw new UnsupportedLevelChangeError(
            'dodown() with a polymorphed hero',
        );
    }

    if (u_stuck_cannot_go('down', state)) return ECMD_TIME;

    if (!stairs_down && !ladder_down) {
        trap = t_at(u.ux, u.uy, state);
        if (trap && (uteetering_at_seen_pit(trap, state)
                     || uescaped_shaft(trap, state))) {
            // do.c:1227. dotrap(trap, TOOKPLUNGE) drops the hero down a pit
            // she is teetering on or through a hole she is standing over;
            // both end in a level change or a trap effect this slice excludes.
            throw new UnsupportedLevelChangeError(
                'dodown() plunging into a pit, hole or trap door',
            );
        } else if (!trap || !is_hole(trap.ttyp)
                   || !Can_fall_thru(u.uz, state) || !trap.tseen) {
            if (state.flags?.autodig && !state.context?.nopick
                && state.uwep && is_pick(state.uwep, state)) {
                // do.c:1233. dig.c use_pick_axe2() digs down through the
                // floor, which digging owns.
                throw new UnsupportedLevelChangeError(
                    'dodown() digging down with a wielded pick-axe',
                );
            }
            await ttyPline(
                'You can\'t go down here'
                + (trap && trap.ttyp === VIBRATING_SQUARE ? ' yet' : '')
                + '.',
                state,
            );
            return ECMD_OK;
        }
    }

    // do.c:1242-1249. The Valley is the gate to Gehennom and asks for
    // confirmation through y_n(); no level this port generates is the Valley.
    if (state.valley_level && on_level(state.valley_level, u.uz)
        && !u.uevent?.gehennom_entered) {
        throw new UnsupportedLevelChangeError(
            'dodown() at the gate to Gehennom',
        );
    }

    if (!next_to_u(state)) {
        await ttyPline('You are held back by your pet!', state);
        return ECMD_OK;
    }

    if (trap) {
        // do.c:1256-1280. A hole or trap door prints "You jump through the
        // trap door." through u_locomotion(), and asks a huge hero to squeeze
        // through with y_n(), rn2(3) and losehp(). None of that is ported, and
        // do.c:1281-1287's goto_hell() and clamp_hole_destination() arms sit
        // behind the same trap.
        throw new UnsupportedLevelChangeError(
            'dodown() through a hole or trap door',
        );
    }

    // do.c:1288-1291. `trap` is null on every admitted path above, so this is
    // the arm that runs and next_level() is called with at_stairs TRUE.
    state.ga ??= {};
    state.ga.at_ladder = state.level?.at(u.ux, u.uy)?.typ === LADDER;
    next_level(!trap, state, { gotoLevel: goto_level });
    state.ga.at_ladder = false;
    return ECMD_TIME;
}

// C ref: do.c goto_level() (1478-1998), its opening phase only.
//
// Covered: the destination clamp and dungeon-change guards at 1501-1519, the
// mysterious force at 1541-1573, the quest guard at 1578-1581, the
// same-level return at 1583, the tether at 1594, the context discard at
// 1601-1622, keepdogs() at 1624 and vision_recalc(2) at 1631.
//
// Not covered, which is what the throw at the end of this function reports:
// the level save at 1634-1664, the destination choice, mklev(), the hero
// placement and docrt(). do.c's two flush_screen(-1) calls, at 1720 and 1841,
// are inside that tail; nothing between this function's entry and its throw
// flushes the screen, so this phase draws nothing.
//
// `at_stairs` and `portal` are read only by branches this phase refuses or by
// the unported tail; they are declared so that the signature matches C's and
// slice 3 can use them without changing every caller.
//
// One caution about `state`: In_endgame() and In_tutorial() are js/const.js's
// renderings of the dungeon.h macros and read the module-level game. They
// ignore the state passed here, as every other caller of those two does. On
// the live path the two are the same object.
export function goto_level(
    newlevel,
    at_stairs,
    falling,
    portal,
    state = game,
) {
    const u = state.u;
    const up = depth(newlevel, state) < depth(u.uz, state);
    const newdungeon = u.uz.dnum !== newlevel.dnum;

    if (dunlev(newlevel) > dunlevs_in_dungeon(newlevel, state))
        newlevel.dlevel = dunlevs_in_dungeon(newlevel, state);
    if (newdungeon) {
        // do.c:1504-1515. The endgame arm needs the Amulet; both tutorial
        // arms need the tutorial dungeon, which js/tutorial_startup.js can
        // enter only from the startup menu. Each of the three would rewrite
        // `newlevel`, `up` or the tutorial flag before the rest runs.
        if (In_endgame(newlevel)
            || In_tutorial(newlevel)
            || In_tutorial(u.uz)) {
            throw new UnsupportedLevelChangeError(
                'goto_level() entering the endgame or the tutorial',
            );
        }
    }
    if (ledger_no(newlevel, state) <= 0) {
        // do.c:1518-1519, done(ESCAPED). C's comment says a negative ledger
        // number is impossible; zero means leaving the dungeon entirely.
        throw new UnsupportedLevelChangeError(
            'goto_level() escaping the dungeon',
        );
    }

    // do.c:1541-1573, the "mysterious force" that drags an Amulet-carrying
    // hero back down through Gehennom. Its body makes four random-number
    // calls, so the guard is written out in full: assuming it dead would hide
    // the day a dungeon state satisfies it.
    if (In_hell(u.uz, state) && up && u.uhave?.amulet && !newdungeon && !portal
        && dunlev(u.uz) < dunlevs_in_dungeon(u.uz, state) - 3) {
        throw new UnsupportedLevelChangeError(
            'goto_level() meeting the mysterious force',
        );
    }

    // do.c:1578-1581. quest.c ok_to_quest() is unported, and so is the
    // "A mysterious force prevents you from descending." message it gates.
    if (state.qstart_level && on_level(u.uz, state.qstart_level)
        && !newdungeon) {
        throw new UnsupportedLevelChangeError(
            'goto_level() leaving the first quest level',
        );
    }

    if (on_level(newlevel, u.uz)) return; /* this can happen */

    // do.c:1586-1591 runs the NHCB_LVL_LEAVE Lua callback. No file under
    // nethack-c/upstream/dat/ registers one, so nhcb_counts[] is zero for
    // every level this port loads and the block is dead.

    // do.c:1593-1595, tethered movement.
    if (u.utrap && u.utraptype === TT_BURIEDBALL) {
        throw new UnsupportedLevelChangeError(
            'goto_level() with the hero tethered to a buried ball',
        );
    }

    // do.c:1597-1599 calls currentlevel_rewrite(), whose two operations have
    // no port counterpart: mark_synch() is tty_mark_synch(), an fflush() of
    // stdout that changes no cell, and create_levelfile() opens the level file
    // this port does not write, because its levels stay in memory.

    // The context discard, do.c:1601-1622. It drops what belongs to the level
    // being left and keeps what travels with the hero.
    maybe_reset_pick(null, state);
    // do.c:1606 reset_trapset(). gt.trapinfo holds the trap object the hero is
    // arming; apply.c use_trap() and set_trap() are its only writers and
    // neither is ported, so this port has no location to clear.
    // do.c:1607 clears iflags.travelcc, the travel command's destination
    // cache. The travel command is not ported and neither is that field.
    if (state.context) {
        state.context.polearm ??= {};
        state.context.polearm.hitmon = null;
    }
    // do.c:1609-1610 is a comment, not code: the digging context is level
    // aware and is deliberately left intact.

    if (falling) {
        // do.c:1612-1613 impact_drop(), which drops what was resting on the
        // trap door down with the hero. Only a fall reaches it.
        throw new UnsupportedLevelChangeError(
            'goto_level() falling to the level below',
        );
    }

    check_special_room(true, state);
    if (u.uball) {
        // do.c:1616-1617, Punished -> ball.c unplacebc().
        throw new UnsupportedLevelChangeError(
            'goto_level() with a punished hero',
        );
    }
    reset_utrap(false, state);
    fill_pit(u.ux, u.uy, state);
    set_ustuck(null, state);
    set_uinwater(false, state);
    u.uundetected = false;
    if (!state.iflags?.nofollowers) keepdogs(false, { state });

    // do.c:1625 recalc_mapseen(), which refreshes the #overview annotation for
    // the level being left. This port keeps no mapseen chain -- nothing
    // creates one and nothing reads one -- so the whole function, including
    // its update_lastseentyp() call for the hero's own square, has no
    // counterpart here. It writes no message, draws no cell and draws no
    // random number.

    vision_recalc(2, { state });

    throw new UnsupportedLevelChangeError(
        'goto_level() choosing and building the destination level',
    );
}
