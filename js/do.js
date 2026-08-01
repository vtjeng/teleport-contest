// do.js -- Commands that drop, dig into, or descend through the floor.
// C refs: do.c -- u_stuck_cannot_go(), dodown(), goto_level(), u_collide_m()
// and temperature_change_msg(); dokick.c obj_delivery(); mon.c
// kill_genocided_monsters(); questpgr.c deliver_splev_message().

import {
    DIR_DOWN,
    ECMD_OK,
    ECMD_TIME,
    FLYING,
    FUMBLING,
    G_GENOD,
    In_endgame,
    In_quest,
    In_tutorial,
    LADDER,
    LEVITATION,
    LFILE_EXISTS,
    RLOC_NOMSG,
    TT_BURIEDBALL,
    UNENCUMBERED,
    UTOTYPE_NONE,
    Upolyd,
    VIBRATING_SQUARE,
    VISITED,
    is_hole,
} from './const.js';
import { next_to_u } from './apply_next_to_u.js';
import { set_move_cmd } from './cmd.js';
import { docrt, flush_screen } from './display.js';
import { keepdogs, losedogs, update_mlstmv } from './dog.js';
import {
    Can_fall_thru,
    In_hell,
    assign_level,
    at_dgn_entrance,
    builds_up,
    depth,
    dunlev,
    dunlev_reached,
    dunlevs_in_dungeon,
    ledger_no,
    level_info,
    next_level,
    on_level,
    set_dunlev_reached,
    u_on_newpos,
} from './dungeon.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import {
    near_capacity,
    notice_all_mons,
    notice_mon_off,
    notice_mon_on,
    set_uinwater,
    u_rooted,
} from './hack.js';
import { maybe_reset_pick } from './lock.js';
import { mklev, u_on_upstairs } from './mklev.js';
import { set_ustuck } from './mon.js';
import { m_at } from './monst.js';
import { PM_TOURIST } from './monsters.js';
import { is_pick } from './obj.js';
import { pickup } from './pickup.js';
import { in_out_region } from './region.js';
import { rn2 } from './rng.js';
import { check_special_room } from './rooms.js';
import { savelev } from './save.js';
import {
    stairway_at,
    stairway_find_from,
    stairway_free_all,
} from './stairs.js';
import { stucksteed } from './steed.js';
import { enexto, mnexto } from './teleport.js';
import { run_timers } from './timeout.js';
import {
    fill_pit,
    reset_utrap,
    t_at,
    uescaped_shaft,
    uteetering_at_seen_pit,
} from './trap.js';
import { ttyPline } from './tty_message.js';
import { vision_recalc, vision_reset } from './vision.js';

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

// C ref: youprop.h, which spells every hero property as
// `(HProperty || EProperty)`. js/worn.js setworn() is the port's only writer of
// an extrinsic property.
function heroPropertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: you.h next2u(), which is `distu(px, py) <= 2`.
function next2u(x, y, state) {
    return dist2(x, y, state.u.ux, state.u.uy) <= 2;
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
    await next_level(!trap, state, { gotoLevel: goto_level });
    state.ga.at_ladder = false;
    return ECMD_TIME;
}

// C ref: do.c goto_level() (1478-1998), for a hero walking down a staircase
// onto a level of the main dungeon she has never visited.
//
// Covered: the destination clamp and dungeon-change guards at 1501-1519, the
// mysterious force at 1541-1573, the quest guard at 1578-1581, the
// same-level return at 1583, the tether at 1594, the context discard at
// 1601-1622, keepdogs() at 1624, vision_recalc(2) at 1631, the level teardown
// at 1634-1664, the level-identity update at 1665-1690, mklev() at 1699, the
// hero placement and transit message at 1766-1800, the deliveries at
// 1812-1825, the repaint at 1835-1839, the arrival messages at 1843-1965 and
// the arrival tail at 1967-1993.
//
// Not covered, each named at its site: the endgame, tutorial, portal, falling,
// level-teleport, punished, Gehennom, quest, Knox, Mines, Sokoban and
// Rogue-level arms, and the getlev() reload at 1704-1711.
//
// One caution about `state`: In_endgame() and In_tutorial() are js/const.js's
// renderings of the dungeon.h macros and read the module-level game. They
// ignore the state passed here, as every other caller of those two does. On
// the live path the two are the same object.
export async function goto_level(
    newlevel,
    at_stairs,
    falling,
    portal,
    state = game,
) {
    const u = state.u;
    const up = depth(newlevel, state) < depth(u.uz, state);
    const newdungeon = u.uz.dnum !== newlevel.dnum;
    // C captures this before anything runs, so it reads the level being left.
    const prev_temperature = state.level.flags.temperature;

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
    //
    // create_levelfile() also sets LFILE_EXISTS on this level's ledger, which
    // is the flag goto_level() reads at 1692 to choose getlev() over mklev().
    // Nothing writes it here, so every descent generates; the restore path
    // owns both the flag and the reload it selects.

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

    // do.c:1652. `cant_go_back` needs the endgame or the tutorial, both
    // refused above, so the level being left is saved rather than discarded
    // and its monsters are aged first.
    update_mlstmv(state);
    savelev(ledger_no(u.uz, state), state);

    // do.c:1665. assign_graphics() swaps the whole symbol set for a Rogue
    // level. dat/dungeon.lua puts that level in the main dungeon between
    // depths 15 and 18, so no descent from D:1 reaches it.
    // do.c:1667 check_gold_symbol() writes iflags.invis_goldsym from
    // gs.showsyms[COIN_CLASS]. Neither the flag nor a reader of it exists in
    // the port, and the symbol set does not change across a level change, so
    // the value it would compute is the one startup already computed.
    // do.c:1668-1672 recbranch_mapseen() records a branch crossing; this
    // descent keeps u.uz.dnum, which is the test C applies.

    // dungeon.c assign_level() copies the two fields into the destination
    // struct rather than replacing it, so anything holding a reference to
    // u.uz, u.uz0 or u.utolev keeps seeing the live value.
    assign_level(u.uz0, u.uz);
    assign_level(u.uz, newlevel);
    assign_level(u.utolev, newlevel);
    u.utotype = UTOTYPE_NONE;
    if (!builds_up(u.uz, state)) { /* usual case */
        if (dunlev(u.uz) > dunlev_reached(u.uz, state))
            set_dunlev_reached(u.uz, dunlev(u.uz), state);
    } else {
        // The up-building arm serves Sokoban and the endgame, which a
        // staircase from D:1 cannot reach; taking it would need a dungeon
        // whose entry level is its deepest.
        throw new UnsupportedLevelChangeError(
            'goto_level() into an up-building dungeon',
        );
    }

    stairway_free_all(state);
    // do.c:1688-1690 clears the default arrival areas a special level may
    // override. js/teleport.js reads both through teleJumpOk().
    state.updest = {};
    state.dndest = {};

    const new_ledger = ledger_no(newlevel, state);
    let isNew = false;
    if (!(level_info(new_ledger, state).flags & LFILE_EXISTS)) {
        if (level_info(new_ledger, state).flags & VISITED) {
            // C's impossible() clears the flag and carries on; a level marked
            // visited with no file behind it means the port lost a level.
            throw new Error('goto_level: returning to discarded level?');
        }
        await mklev();
        isNew = true;
        // do.c:1701 familiar = bones_include_name(svp.plname). The port loads
        // no bones file -- js/mklev.js getbones() always answers FALSE -- so
        // svl.level.bonesinfo is empty and no name can match.
    } else {
        // do.c:1704-1711, the reload: open_levelfile(), two reseed_random()
        // calls, getlev() and oinit(). None is ported.
        throw new UnsupportedLevelChangeError(
            'goto_level() returning to a level already visited',
        );
    }

    // do.c:1713 reglyph_darkroom() rewrites the remembered glyph of every
    // square that changed lit-corridor or dark-room appearance. mklev() has
    // just replaced the map, so every square is unexplored and no arm of its
    // double loop matches. Its closing gs.showsyms[S_darkroom] assignment
    // depends only on flags.dark_room and iflags.use_color, neither of which a
    // level change alters.
    set_uinwater(false, state);
    vision_reset(state);
    state.vision_full_recalc = 0;
    await flush_screen(-1); /* ensure all map flushes are postponed */

    // do.c:1720-1745 places the hero at the destination portal, and
    // do.c:1802-1810 at a random spot after a fall or a level teleport.
    // `portal` and `falling` are both refused earlier in this function, so the
    // at_stairs arm is the one that runs.
    if (!at_stairs) {
        throw new UnsupportedLevelChangeError(
            'goto_level() arriving without stairs',
        );
    }
    if (up) {
        // The climbing arm at do.c:1767-1780 belongs with doup().
        throw new UnsupportedLevelChangeError(
            'goto_level() arriving from below',
        );
    }

    const stway = stairway_find_from(u.uz0, state.ga?.at_ladder, state);
    if (stway) {
        u_on_newpos(stway.sx, stway.sy, state);
        stway.u_traversed = true;
    } else if (newdungeon) {
        // u_on_sstairs(0) places the hero on a branch staircase. A descent
        // that keeps u.uz.dnum is not a new dungeon, and mklev() always makes
        // an up staircase leading back the way the hero came.
        throw new UnsupportedLevelChangeError(
            'goto_level() arriving in a new dungeon',
        );
    } else {
        u_on_upstairs();
    }

    if (!u.dz) {
        /* stayed on same level? (no transit effects) */
    } else if (heroPropertyActive(u, FLYING)) {
        // "You fly down the stairs." No hero the port builds can fly.
        throw new UnsupportedLevelChangeError(
            'goto_level() with a flying hero',
        );
    } else if (near_capacity(state) > UNENCUMBERED
               || u.uball || heroPropertyActive(u, FUMBLING)) {
        // do.c:1783-1795, the fall. It calls rnd(3) through losehp() and
        // drag_down()/ballrelease() for a punished hero. A hero who arrives
        // burdened has picked something up, which is unported, and the
        // punished arm is already refused at do.c:1616 above.
        throw new UnsupportedLevelChangeError(
            'goto_level() falling down the stairs',
        );
    } else if (state.flags?.verbose) { /* ordinary descent */
        await ttyPline(
            state.ga?.at_ladder
                ? 'You climb down the ladder.'
                : 'You descend the stairs.',
            state,
        );
    }

    // do.c:1812 placebc() puts a punished hero's ball and chain down; u.uball
    // is refused at do.c:1616.
    obj_delivery(false, state);
    losedogs({ state });
    kill_genocided_monsters(state);
    // "Expire all timers that have gone off while away. Must be after
    // migrating monsters and objects are delivered."
    run_timers(state);

    const arrivalOccupant = m_at(u.ux, u.uy, state);
    if (arrivalOccupant) u_collide_m(arrivalOccupant, state);

    // do.c:1829-1832 moves the water level's bubbles and the fumaroles of a
    // level whose Lua sets that flag. Neither exists in the main dungeon above
    // the Plane of Water.

    /* Reset the screen. */
    vision_reset(state);
    // do.c:1836 reset_glyphmap(gm_levelchange) recomputes the glyph-to-symbol
    // table and its per-level Rogue flag. The port maps each glyph as it draws
    // it rather than keeping the table, and Is_rogue_level is false either
    // side of this descent, so the table it would rebuild is unchanged.
    notice_mon_off(state);
    // display.c docrt() brackets its repaint with vision_recalc(2) and
    // vision_recalc(0); js/display.js docrt() leaves both to its callers, as
    // allmain.c newgame() and moveloop() already do here. This is the pair
    // that gives the hero a map of a level she has never seen.
    vision_recalc(2, { state });
    vision_recalc(0, { state });
    await docrt(); /* does a full vision recalc */
    await flush_screen(-1);

    // do.c:1844-1849 delivers a deferred level-teleport message through
    // gd.dfr_post_msg, which only level teleport sets.
    deliver_splev_message(state);

    // do.c:1858-1872, entering Gehennom. Both arms need In_hell, and
    // dat/dungeon.lua puts the Valley below depth 25.
    // do.c:1874-1875 familiar_level_msg() needs a bones file.

    // The arrival arms at do.c:1877-1932 are keyed on the destination
    // dungeon. In_endgame, In_quest, Is_knox, In_mines and In_sokoban are all
    // false for D:2 of the main dungeon, so the `else` arm runs.
    if (isNew && state.bigroom_level
        && on_level(u.uz, state.bigroom_level)) {
        // record_achievement(ACH_BGRM). dat/dungeon.lua puts the big room
        // between depths 10 and 12.
        throw new UnsupportedLevelChangeError(
            'goto_level() arriving in the big room',
        );
    }
    if (!In_quest(u.uz0)
        && at_dgn_entrance('The Quest', state)
        && !(u.uevent?.qcompleted || u.uevent?.qexpelled
             || state.svq?.quest_status?.leader_is_dead)) {
        // com_pager("quest_portal") opens the quest leader's summons.
        throw new UnsupportedLevelChangeError(
            'goto_level() arriving at the quest entrance',
        );
    }

    temperature_change_msg(prev_temperature, state);

    if (isNew) {
        // do.c:1944-1953 describe_level() and livelog_printf(). The livelog is
        // a file the port does not write, and describe_level()'s buffer has no
        // other reader here, so neither reaches the screen.
        if (state.urole?.mnum === PM_TOURIST) {
            // more_experienced(level_difficulty(), 0) and newexplevel(); a
            // Tourist gains experience for reaching a new level. exper.c is
            // not ported.
            throw new UnsupportedLevelChangeError(
                'goto_level() as a Tourist reaching a new level',
            );
        }
    }

    assign_level(u.uz0, u.uz); /* reset u.uz0 */
    notice_mon_on(state);
    await notice_all_mons(true, state);

    // do.c:1974 print_level_annotation() prints the hero's own #annotate note
    // for this level. The port keeps no mapseen chain, so get_annotation()
    // has nothing to answer with; js/do.js records the same gap for
    // recalc_mapseen() above.
    check_special_room(false, state); /* give room entrance message, if any */
    obj_delivery(true, state); /* deliver objects traveling with player */

    /* assume this will always return TRUE when changing level */
    await in_out_region(u.ux, u.uy, { state });

    // do.c:1984-1987 fix_shop_damage() catches a shopkeeper up on repairs;
    // it runs only when `new` is false, and this arm always generated.
    // do.c:1989-1992 charges fall damage, which needs `falling`.

    await pickup(1, state);
}

// C ref: dokick.c obj_delivery(), which do.c goto_level() calls twice: once
// for the objects that were sent ahead and once for the ones that travel with
// the hero.
//
// gm.migrating_objs is empty on every path the port reaches. Its writers are
// dokick.c's ship_object(), the shopkeeper's stolen-goods handling and the
// object half of a level change, none of which is ported, and js/dog.js
// migrate_to_level() moves monsters rather than objects.
function obj_delivery(near_hero, state = game) {
    if (state.gm?.migrating_objs) {
        throw new UnsupportedLevelChangeError(
            `obj_delivery(${near_hero}) with objects in migration`,
        );
    }
}

// C ref: mon.c kill_genocided_monsters(), which goto_level() calls so that a
// monster of a genocided species that was migrating dies as it arrives.
//
// Nothing genocides a species in this port: svm.mvitals[].mvflags gains
// G_GENOD only in read.c do_genocide(), which no ported command reaches. The
// kill_eggs() sweep at the end of C's function selects on the same flag.
function kill_genocided_monsters(state = game) {
    for (let index = 0; index < (state.mvitals?.length ?? 0); ++index) {
        if (state.mvitals[index].mvflags & G_GENOD) {
            throw new UnsupportedLevelChangeError(
                'kill_genocided_monsters() with a genocided species',
            );
        }
    }
}

// C ref: do.c u_collide_m() (1410-1445). The hero has arrived on a square a
// monster already holds -- one that came down with her, or one mklev() put on
// the up staircase -- and one of the two has to move.
function u_collide_m(mtmp, state = game) {
    if (!mtmp || mtmp === state.u.usteed
        || mtmp !== m_at(state.u.ux, state.u.uy, state)) {
        // C's impossible() returns without moving anybody.
        throw new Error('level arrival collision: monster not co-located');
    }

    const cc = !rn2(2)
        ? enexto(state.u.ux, state.u.uy, state.youmonst?.data, { state })
        : null;
    if (cc && next2u(cc.x, cc.y, state)) {
        u_on_newpos(cc.x, cc.y, state);
    } else {
        mnexto(mtmp, RLOC_NOMSG, { state });
    }

    if (m_at(state.u.ux, state.u.uy, state)) {
        // C tries rloc() and then m_into_limbo(), which sends the monster off
        // the level to return later. Neither the wizard-mode message nor
        // m_into_limbo() is ported.
        throw new UnsupportedLevelChangeError(
            'u_collide_m() with a monster still in the hero\'s way',
        );
    }
}

// C ref: questpgr.c deliver_splev_message(), the custom arrival message a
// special level may carry. gl.lev_message is written by sp_lev.c alone, from a
// Lua level description; no level the port generates sets one.
function deliver_splev_message(state = game) {
    if (state.gl?.lev_message) {
        throw new UnsupportedLevelChangeError(
            'deliver_splev_message() on a level with an arrival message',
        );
    }
}

// C ref: do.c temperature_change_msg(). Its three arms report entering or
// leaving a hot or cold level; svl.level.flags.temperature is set by a Lua
// level description, and every level the port generates leaves it zero.
function temperature_change_msg(prev_temperature, state = game) {
    if (prev_temperature !== state.level.flags.temperature) {
        throw new UnsupportedLevelChangeError(
            'temperature_change_msg() for a change of level temperature',
        );
    }
}
