// restore.js -- Restore a saved game.
// C refs: restore.c restobj(), restobjchn(), restmon(), restmonchn(),
//         restgamestate(), dorecover(), getlev().
//
// The JS port serializes game state as JSON via save.js dosave0(). This
// module reads that JSON back, applies it to the live game object, walks the
// restored object and monster chains as C's restobjchn() and restmonchn() do,
// and reconstructs computed state that is not in the snapshot: equipment
// pointers, dungeon-level aliases, youmonst, and hero_seq. Display
// reconstruction (docrt, bot) and the welcome-back message follow in the
// caller (jsmain.js).

import { rest_regions, rest_saved_level_regions } from './region.js';
import { newsym } from './display.js';
import { cansee, does_block, unblock_point } from './vision.js';
import { mon_catchup_elapsed_time } from './dog.js';
import { restore_timers } from './timeout.js';
import {
    COLNO,
    COULD_SEE,
    IN_SIGHT,
    LFILE_EXISTS,
    M_AP_TYPE,
    ROWNO,
    VISITED,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_BALL,
    W_CHAIN,
    W_QUIVER,
    W_RINGL,
    W_RINGR,
    W_SWAPWEP,
    W_TOOL,
    W_WEP,
    STONE,
    ROGUESET,
} from './const.js';
import { init_artifacts, restore_artifacts } from './artifacts.js';
import {
    ledger_no, level_info, load_exclusions, on_level, set_dungeon_topology,
} from './dungeon.js';
import { game } from './gstate.js';
import { l_nhcore_init } from './mklev.js';
import { restore_waterlevel } from './mkmaze.js';
import { adj_erinys, hideunder, restrap, restore_cham } from './mon.js';
import { hides_under, is_hider } from './mondata.js';
import { S_EEL, S_MIMIC } from './monsters.js';
import { init_oclass_probs } from './o_init.js';
import { defineObjAliases } from './obj.js';
import { defineObjclassAliases, GRAPPLING_HOOK, PICK_AXE } from './objects.js';
import { set_mimic_sym } from './makemon_create.js';
import { restpriest } from './priest.js';
import { setuwep } from './wield.js';
import {
    getnow,
    JUDGE_RECORDER_IS_DST,
    time_from_yyyymmddhhmmss,
} from './calendar.js';
import { rest_engravings } from './engrave.js';
import { add_worn_property } from './worn.js';
import { rn1, rn2, rnd } from './rng.js';
import {
    parseSnapshot, SAVE_FILE_PATH, savemonchn, saveobjchn,
    shift_level_edog_times,
} from './save.js';
import { restore_oracles } from './rumors.js';
import { assign_graphics } from './symbols.js';
import { role_init } from './role_init.js';
import { set_residency, restshk } from './shk.js';
import { stairway_add, stairway_at, stairway_free_all } from './stairs.js';
import { vfsReadFile, vfsDeleteFile, vfsListFiles } from './storage.js';
import { initrack } from './track.js';
import { _uInitInternals } from './u_init.js';
import { set_uasmon } from './polyself.js';
import { select_menu } from './windows.js';
import { TTY_STARTUP_BANNER } from './tty_startup.js';
import { tty_putmsghistory } from './topl.js';

// C ref: restore.c restore_msghistory(). The callback buffers messages in
// order, then the null terminator asks the window port to restore the ring.
export function restore_msghistory(messages, state = game) {
    const saved = Array.isArray(messages) ? messages : [];
    for (const message of saved) tty_putmsghistory(message, true, state);
    if (saved.length) tty_putmsghistory(null, true, state);
}

// C ref: files.c get_saved_games(). The browser save layer has one stable
// `nhsave` path rather than C's uid-and-name-derived files, so the one JSON
// snapshot is the complete saved-game list for this game instance.
export function get_saved_games(_state = game) {
    if (!vfsListFiles('').includes(SAVE_FILE_PATH)) return [];
    const raw = vfsReadFile(SAVE_FILE_PATH);
    if (raw == null) return [];
    try {
        const snapshot = JSON.parse(raw);
        return snapshot.plname ? [String(snapshot.plname)] : [];
    } catch {
        return [];
    }
}

// C ref: restore.c restore_menu() (1536-1619). The menu is asynchronous in
// the browser because the TTY input port is asynchronous; its return values
// retain C's contract: 1 selects the saved character, 0 starts a new game,
// and -1 quits or cancels.
export async function restore_menu(_bannerwin = null, state = game) {
    // restore.c clears svp.plname before inspecting the save directory, so a
    // failed or declined selection falls through to a fresh name prompt.
    state.plname = '';
    const saved = get_saved_games(state);
    if (!saved.length) return 0;

    const items = saved.map((name, index) => ({
        selector: String.fromCharCode('a'.charCodeAt(0) + index),
        label: name,
        value: index + 1,
    }));
    items.push({ selector: 'n', label: 'Start a new character', value: 0 });
    items.push({ selector: 'q', label: 'Never mind (quit)', value: -1 });
    const choice = await select_menu(state, {
        title: 'Select one of your saved games',
        lines: [...TTY_STARTUP_BANNER, ''],
        items,
        cancelValue: null,
    });
    if (choice === null || choice === undefined) return -1;
    if (choice > 0) {
        const name = saved[choice - 1];
        state.plname = name;
        return 1;
    }
    return choice < 0 ? -1 : 0;
}

// C ref: restore.c rest_stairs(). Frees the current list, then adds each
// saved stairway in the order save_stairs() wrote it, head first. Because
// stairway_add() pushes onto the head, the restored list is in reverse order,
// as in C. stairway_add() clears u_traversed, so the saved value is copied
// back afterwards. The snapshot keeps tolev absolute, so C's conversion from
// a relative dlevel has no counterpart.
function rest_stairs(saved, state) {
    stairway_free_all(state);
    for (let stway = saved; stway; stway = stway.next) {
        stairway_add(stway.sx, stway.sy, stway.up, stway.isladder,
            stway.tolev);
        const newst = stairway_at(stway.sx, stway.sy, state);
        if (newst) newst.u_traversed = stway.u_traversed;
    }
}

// The worn-slot table mirrors js/worn.js WORN_SLOTS so that restore can
// rebuild game-level equipment pointers from each object's owornmask
// without importing setworn() and its side effects.
const WORN_SLOTS = Object.freeze([
    { mask: W_ARM, field: 'uarm' },
    { mask: W_ARMC, field: 'uarmc' },
    { mask: W_ARMH, field: 'uarmh' },
    { mask: W_ARMS, field: 'uarms' },
    { mask: W_ARMG, field: 'uarmg' },
    { mask: W_ARMF, field: 'uarmf' },
    { mask: W_ARMU, field: 'uarmu' },
    { mask: W_RINGL, field: 'uleft' },
    { mask: W_RINGR, field: 'uright' },
    { mask: W_WEP, field: 'uwep' },
    { mask: W_SWAPWEP, field: 'uswapwep' },
    { mask: W_QUIVER, field: 'uquiver' },
    { mask: W_AMUL, field: 'uamul' },
    { mask: W_TOOL, field: 'ublindf' },
    { mask: W_BALL, field: 'uball' },
    { mask: W_CHAIN, field: 'uchain' },
]);

// Restore the at() method that GameMap provides for coordinate-bounded
// location lookup; functions are excluded from the JSON snapshot. Every
// restored level needs it before region.c rest_regions() can reach
// vision.c does_block() through remove_region().
function restoreLevelAt(level) {
    if (!level || typeof level.at === 'function') return;
    level.at = function at(x, y) {
        if (x < 0 || x >= COLNO || y < 0 || y >= ROWNO) return null;
        return this.locations[x]?.[y] || null;
    };
}

// C ref: restore.c dorecover() (789-951). Reads the saved game state from
// VFS storage, applies it to the game object, and reconstructs computed
// state. Returns true on success; false if no save file exists.
export async function dorestore(state = game) {
    const raw = vfsReadFile(SAVE_FILE_PATH);
    if (raw == null) return false;

    const snapshot = parseSnapshot(raw);

    // Apply saved fields to the game object. Fields set here overwrite the
    // values newgame_pre_mklev() would have set; fields the snapshot omits
    // keep whatever the pre-restore initialization left.
    // C restore.c:restgamestate reads svn.nhuuid before svm.moves.
    state.svn.nhuuid = snapshot.nhuuid;
    state.moves = snapshot.moves;
    state.hero_seq = snapshot.hero_seq ?? (snapshot.moves * 8);
    state.flags = snapshot.flags;
    // C ref: restore.c restgamestate():596 role_init(), right after the
    // saved flags are read and before the hero struct. The permonst changes
    // for the quest leader, guardians and nemesis do not survive a save, and
    // a leader or nemesis without a fixed gender draws rn2(100) again here
    // (role.c 2036-2060). Sfi_q_score() below then replaces the quest status
    // this call initializes with the saved one.
    role_init(state);
    state.u = snapshot.u;
    state.context = snapshot.context;
    state.plname = snapshot.plname;
    state.pl_character = snapshot.pl_character;
    state.urole = snapshot.urole;
    state.urace = snapshot.urace;

    // Level and dungeon state
    state.level = snapshot.level;
    restoreLevelAt(state.level);
    // C ref: restore.c getlev():1225 rest_regions(). The game state and the
    // regions were saved on the same turn, so only regions whose time had
    // already run out are discarded.
    rest_regions(snapshot.moves, state, restoredRegionVisuals(state));
    // C ref: restore.c getlev():1113 rest_stairs(), which dorecover() reaches
    // through getlev() for the hero's level.
    rest_stairs(snapshot.stairs, state);
    // C ref: restore.c getlev():1114-1115 reads svu.updest and svd.dndest
    // right after the stairs.
    state.updest = snapshot.updest ?? {};
    state.dndest = snapshot.dndest ?? {};
    // C ref: dungeon.c restore_dungeon():222 reads svd.dungeon_topology
    // whole; dorecover() does not rerun fixup_level_locations(), whose x-
    // proto renames, Fort Ludios branch insertion and dummy-level
    // depth_start adjustment are already in the saved dungeon state.
    set_dungeon_topology(state, snapshot.dungeon_topology);
    state.n_dgns = snapshot.n_dgns;
    state.dungeons = snapshot.dungeons;
    if (snapshot.branches) state.branches = snapshot.branches;
    // C ref: dungeon.c restore_dungeon():240-247 reads svl.level_info for
    // the ledgers save_dungeon() wrote, then svi.inv_pos.
    if (Array.isArray(snapshot.level_info)) {
        snapshot.level_info.forEach((saved, ledger) => {
            level_info(ledger, state).flags = saved?.flags ?? 0;
        });
    }
    if (snapshot.inv_pos) state.inv_pos = snapshot.inv_pos;
    if (snapshot.specialLevels) state.specialLevels = snapshot.specialLevels;
    if (snapshot.smeq) state.smeq = snapshot.smeq;
    if (snapshot.tune != null) {
        state.tune = snapshot.tune;
        state.svt ??= {};
        state.svt.tune = snapshot.tune;
    }

    // C restore.c:restgamestate restores global timers and lights before the
    // inventory chains. parseSnapshot() has already reconnected their object
    // arguments to the same saved inventory objects.
    if (Object.hasOwn(snapshot, 'timer_base')) {
        state.gt ??= {};
        state.gt.timer_base = snapshot.timer_base;
    }
    if (Object.hasOwn(snapshot, 'light_base')) {
        state.gl ??= {};
        state.gl.light_base = snapshot.light_base;
    }

    // Inventory and objects
    // C ref: restore.c restgamestate():657 gi.invent = restobjchn(nhfp, FALSE).
    // The dangling ball-and-chain that follows it in C is not in the
    // snapshot; restgamestate():671-672 then restores the migrating chains.
    state.invent = restobjchn(snapshot.invent, state);
    state.gm ??= {};
    state.gm.migrating_objs = restobjchn(snapshot.migrating_objs ?? null,
        state);
    state.gm.migrating_mons = restmonchn(snapshot.migrating_mons ?? null,
        state);
    if (snapshot.head_engr != null) {
        state.head_engr = snapshot.head_engr;
        // restore.c getlev():1174 rest_engravings() for the hero's level.
        rest_engravings(state);
    }

    // C has a static artifact catalog; JS rebuilds its per-game catalog
    // before restore.c's artifact tracking fixups and setuwep call.
    init_artifacts(state);
    restore_artifacts(snapshot, state);
    restore_oracles(snapshot, state);

    // Object catalog: replace the static objects table with the saved one
    // that carries the per-game description shuffle and discovery bits.
    // Re-apply non-enumerable getter/setter aliases (e.g. a_ac for
    // oc_oc1) that JSON serialization stripped.
    if (snapshot.objects) {
        state.objects = snapshot.objects;
        for (const entry of state.objects) {
            if (entry) defineObjclassAliases(entry);
        }
    }
    if (snapshot.bases) {
        state.svb ??= {};
        state.svb.bases = snapshot.bases;
    }
    if (snapshot.disco) {
        state.svd ??= {};
        state.svd.disco = snapshot.disco;
    }
    if (snapshot.pl_fruit != null) {
        state.svp ??= {};
        state.svp.pl_fruit = snapshot.pl_fruit;
    }

    // Game subsystems
    // C ref: restore.c restgamestate():708-710 reads svs.spl_book[].
    if (snapshot.spl_book != null) {
        state.svs ??= {};
        state.svs.spl_book = snapshot.spl_book;
    }
    if (snapshot.mvitals) {
        state.mvitals = snapshot.mvitals;
        state.svm ??= {};
        state.svm.mvitals = snapshot.mvitals;
    }
    if (snapshot.mapseenchn) {
        state.svm ??= {};
        state.svm.mapseenchn = snapshot.mapseenchn;
    }
    // C ref: restore.c restgamestate():706 Sfi_q_score(&svq.quest_status)
    // replaces the struct role_init() initialized above with the saved one.
    state.svq.quest_status = snapshot.quest_status;

    // Hero identity and timing
    if (snapshot.wizard != null) state.wizard = snapshot.wizard;
    if (snapshot.discover != null) state.discover = snapshot.discover;
    state.multi = snapshot.multi ?? 0;
    state.multi_reason = snapshot.multi_reason ?? null;
    // C ref: restore.c restgamestate():615-617. The saved local time string
    // goes back through mktime() with the restoring process's tm_isdst, so a
    // winter birthday recorded under daylight time moves an hour each save.
    if (snapshot.ubirthday != null) {
        state.ubirthday = time_from_yyyymmddhhmmss(
            snapshot.ubirthday,
            state.recorderIsDst ?? JUDGE_RECORDER_IS_DST,
        );
    }
    if (snapshot.urealtime != null) state.urealtime = snapshot.urealtime;
    // C restore.c:restore_gamelog() rebuilds gg.gamelog by calling
    // gamelog_add() for each serialized line. Keep the saved linked-list
    // order and the producer's original turn timestamps.
    if (Array.isArray(snapshot.gamelog)) {
        state.gamelog = snapshot.gamelog.map((entry) => ({
            turn: entry.turn,
            flags: entry.flags,
            text: entry.text,
        }));
    } else {
        state.gamelog = [];
    }
    // C ref: restore.c:625. Reset the timing epoch to the current clock so
    // fmt_elapsed_time counts from restore, not from the original session.
    state.urealtime.start_timing = getnow(state);
    if (snapshot.track != null) state.track = snapshot.track;

    // ---- Reconstruct computed state ----

    // Rebuild the special-level linked list from the saved array.
    if (state.specialLevels) {
        for (let i = 0; i < state.specialLevels.length; i++) {
            state.specialLevels[i].next
                = state.specialLevels[i + 1] ?? null;
        }
        state.sp_levchn = state.specialLevels[0] ?? null;
    }

    // C ref: dungeon.c restore_dungeon():225-238 links each restored branch
    // to the next one read, in saved order.
    if (state.branches) {
        for (let i = 0; i < state.branches.length; i++)
            state.branches[i].next = state.branches[i + 1] ?? null;
        state.svb ??= {};
        state.svb.branches = state.branches[0] ?? null;
    }

    // C ref: restgamestate():722 restore_luadata() -> nhlua.c:1358
    // l_nhcore_init(). Loading nhlib.lua into the persistent Lua state
    // shuffles a 3-element alignment table as a global-scope side effect,
    // producing 2 rn2 calls (rn2(3), rn2(2)). The JS port replicates this
    // through l_nhcore_init(), which also sets state.splev_align for any
    // future level generation in this game.
    l_nhcore_init(state);

    // C ref: restgamestate():727 adj_erinys(u.ualign.abuse). The erinys
    // catalog rewrite is not saved, so restore replays it before anything
    // reads mons[PM_ERINYS], including makemon.c init_mongen_order(), whose
    // difficulty sort a fresh process runs on its first mkclass().
    adj_erinys(state.u.ualign.abuse, state);

    // C ref: dorecover():825 init_oclass_probs(). Recompute object-class
    // probability totals from the restored objects table.
    state.go ??= {};
    state.go.oclass_prob_totals ??= [];
    init_oclass_probs(state);

    // C ref: restore.c restgamestate():604 copies u.mcham into youmonst.cham,
    // then 627 set_uasmon() rebuilds youmonst.data and the FROMFORM
    // intrinsics, such as a polymorphed form's flight, from u.umonnum.
    // program_state.restoring keeps set_uasmon() from calling
    // float_vs_flight(), whose blockers are already in the saved state.
    state.youmonst ??= {};
    state.youmonst.cham = state.u.mcham;
    state.program_state ??= {};
    const wasRestoring = state.program_state.restoring;
    state.program_state.restoring = 1;
    try {
        set_uasmon(state);
    } finally {
        state.program_state.restoring = wasRestoring;
    }

    // C ref: restore.c dorecover():905-906. The current symbol set is not
    // saved; startup options selected the primary set, so a game saved on
    // the Rogue level switches to its symbols here, as goto_level() does on
    // arrival.
    if (on_level(state.u.uz, state.rogue_level))
        assign_graphics(ROGUESET, state);

    // max_rank_sz computes gm.mrank_sz from the role's rank table.
    _uInitInternals.max_rank_sz(state);

    // C ref: restore.c dorecover():831 restlevelfile(ledger_no(&u.uz))
    // writes the hero's level to its level file through savelev(), which
    // marks it VISITED; create_levelfile() sets LFILE_EXISTS.
    level_info(ledger_no(state.u.uz, state), state).flags
        |= VISITED | LFILE_EXISTS;

    // C ref: restore.c dorecover():840-877. Each other level in the save
    // file is read with getlev() under REST_LEVELS and written to its level
    // file by restlevelfile(), before getlev() reads the hero's level again.
    rest_other_levels(snapshot.otherLevels, state);

    // C ref: restore.c getlev():1137 fmon = restmonchn(nhfp). The snapshot
    // keeps the chain in C's order, including a steed that is on the chain
    // but off the map (getlev():1183-1186), so walk it rather than deriving
    // it from level.monsters.
    state.level.monlist = restmonchn(state.level.monlist, state);

    // C ref: restore.c getlev():1158-1164 fobj = restobjchn(nhfp, FALSE),
    // find_lev_obj(), then the buried chain. gb.billobjs (1165) is not in
    // the snapshot.
    state.level.objlist = restobjchn(state.level.objlist, state);
    find_lev_obj(state.level.objlist);
    state.level.buriedobjlist = restobjchn(state.level.buriedobjlist, state);

    // C ref: restore.c getlev():1226 rest_bubbles(), after the hero's
    // level's monsters and regions, rebuilds the Plane of Water's or Air's
    // bubbles through mkmaze.c restore_waterlevel(); the snapshot has none
    // on any other level.
    if (snapshot.waterlevel) restore_waterlevel(snapshot.waterlevel, state);
    // C ref: restore.c getlev():1227 load_exclusions(), after rest_bubbles().
    load_exclusions(snapshot.exclusion_zones, state);

    // C ref: restore.c:684 defers monster repaint until allmain.c:92-94.
    state.gd ??= {};
    state.gd.defer_see_monsters = true;

    // Rebuild equipment pointers from inventory owornmask bits.
    rebuildEquipmentPointers(state);

    // C ref: restore.c:694-700 clears the reconstructed primary pointer so
    // setuwep reinitializes it, then conservatively treats digging tools
    // as unconventional weapons. This computed flag does not come from save.
    const weapon = state.uwep;
    state.uwep = null;
    await setuwep(weapon, { state });
    if (!state.uwep || state.uwep.otyp === PICK_AXE
        || state.uwep.otyp === GRAPPLING_HOOK) {
        state.unweapon = true;
    }

    // C ref: dorecover():928 vision_full_recalc = 1.
    state.vision_full_recalc = 1;

    // hack.c classify_terrain()'s iflags.terrain_typ is not saved, and the
    // restore never passes the level-arrival assignment of MAX_TYPE in
    // dungeon.c u_on_newpos(), so the restored process keeps the static zero
    // (STONE). botl.c then leaves the terrain status blank until
    // switch_terrain() reclassifies (js/display.js _terrainStatus()).
    state.iflags ??= {};
    state.iflags.terrain_typ = STONE;

    // C ref: dorecover():901 program_state.something_worth_saving = 1.
    state.program_state ??= {};
    state.program_state.something_worth_saving = 1;

    // C ref: dorecover():904 delete_savefile(). The JS port deletes the
    // save from VFS so a subsequent segment does not restore it again.
    if (!state.wizard && !state.discover) {
        vfsDeleteFile(SAVE_FILE_PATH);
    }

    restore_msghistory(snapshot.msghistory, state);
    return true;
}

// C ref: restore.c find_lev_obj() (71-106), the no_charge part of its
// place_object() call for each floor object (mkobj.c:2355-2358): an object
// keeps no_charge only on a costly spot or one costly_adjacent() to its
// owner. getlev() has just run rest_rooms(), which zeroes every room's
// resident (mkroom.c:902), and set_residency() comes later in getlev(), so
// shop_keeper() finds no keeper and both tests fail: no floor object keeps
// no_charge across a save and restore or a return to its level. Contained
// and buried objects are not placed and keep theirs. The snapshot keeps the
// level.objects grid, so the rest of find_lev_obj()'s rebuild has no work.
function find_lev_obj(objlist) {
    for (let otmp = objlist; otmp; otmp = otmp.nobj)
        if (otmp.no_charge) otmp.no_charge = 0;
}

// C ref: restore.c dorecover():859-877 with getlev() (1046-1311) under
// REST_LEVELS and restlevelfile() (755-771). getlev() rebuilds each
// monster's species pointer and inventory through restmonchn() and the floor
// and buried chains through restobjchn(); `program_state.restoring ==
// REST_LEVELS` skips the elapsed-time catch-up, restore_cham() and
// hide_monst() (1200-1201). restlevelfile() then writes the level with
// savelev(), which marks it VISITED (save.c:493-494), gives it a file
// (files.c create_levelfile() sets LFILE_EXISTS), stamps it with svm.moves,
// which restgamestate() has just restored to the turn of the save, and frees
// it: saveobjchn() and savemonchn() hand back any svc.context pointer that
// restobjchn() pointed at one of its objects. The saved-level snapshot, kept
// in `state._savedLevels` until goto_level() returns to it, is this port's
// level file.
function rest_other_levels(levels, state) {
    state._savedLevels = {};
    if (!Array.isArray(levels)) return;
    for (const { ledger, ...saved } of levels) {
        const level = saved.level;
        restoreLevelAt(level);
        level.monlist = restmonchn(level.monlist, state);
        level.objlist = restobjchn(level.objlist, state);
        find_lev_obj(level.objlist);
        level.buriedobjlist = restobjchn(level.buriedobjlist, state);
        savemonchn(level.monlist, state);
        saveobjchn(level.objlist, state);
        saveobjchn(level.buriedobjlist, state);
        rest_saved_level_regions(level, saved.omoves, state.moves);
        level_info(ledger, state).flags |= VISITED | LFILE_EXISTS;
        state._savedLevels[ledger] = { ...saved, omoves: state.moves };
    }
}

// C ref: restore.c rest_adjust_levelflags() (1314-1318), the inverse of
// save.js save_adjust_levelflags().
function rest_adjust_levelflags(state) {
    const flags = state.level?.flags;
    if (flags) flags.stasis_until = (flags.stasis_until ?? 0) + state.moves;
}

// C ref: restore.c restobj() (183-228). C reads the saved bytes into a struct
// that newobj() allocated, so every restored object has struct obj's union
// accessors (nexthere, ocontainer and ocarry over `v`) and its bit-field
// aliases (opoisoned, on_ice, ...). The snapshot keeps the backing fields but
// not the non-enumerable accessors newObject() installs; reinstall them. The
// nobj and nexthere links survive the snapshot as graph references, so C's
// reset of both (192) ahead of restobjchn()'s relink has no counterpart, and
// the oextra records are kept as saved. A corpse or statue's omonst goes
// through restmon() as in C (209).
function restobj(otmp, state) {
    defineObjAliases(otmp);
    if (otmp.oextra?.omonst) restmon(otmp.oextra.omonst, state);
}

// C ref: restore.c restobjchn() (231-304), the saved-game branches; bones
// levels restore through js/bones.js. The snapshot keeps every nobj link, so
// the chain is walked rather than rebuilt. Container contents recurse and
// get their ocontainer back pointer (272-278), bypass is cleared (280-281),
// and the object whose o_id saveobjchn() kept when it set victual.piece,
// tin.tin or spbook.book to Null (save.c 783-795) takes that pointer back
// (283-290). getlev() runs this over the chains of a level the hero returns
// to, as C's getlev() does; in dorestore() the snapshot keeps the pointers
// as graph references, so the recovery finds them already set.
export function restobjchn(first, state) {
    const context = state.context;
    for (let otmp = first; otmp; otmp = otmp.nobj) {
        restobj(otmp, state);
        if (otmp.cobj) {
            otmp.cobj = restobjchn(otmp.cobj, state);
            for (let otmp3 = otmp.cobj; otmp3; otmp3 = otmp3.nobj)
                otmp3.ocontainer = otmp;
        }
        if (otmp.bypass) otmp.bypass = false;
        if (context?.victual && otmp.o_id === context.victual.o_id)
            context.victual.piece = otmp;
        if (context?.tin && otmp.o_id === context.tin.o_id)
            context.tin.tin = otmp;
        if (context?.spbook && otmp.o_id === context.spbook.o_id)
            context.spbook.book = otmp;
    }
    return first;
}

// C ref: restore.c restmon() (307-373). The snapshot keeps nmon and every
// mextra record, so the struct read and the mextra reconstruction have no
// work here. A pet's droptime and hungrytime are stored relative to the
// clock (355-356): a saved game's hero level holds them absolute, because the
// save and the restore share one turn, and getlev() converts another level's
// with save.js shift_level_edog_times(), which leaves rest_other_levels()'s
// read-and-rewrite to keep them relative. What remains is the apport floor
// that prevents rn2(0) (357-360).
function restmon(mtmp, _state) {
    const edog = mtmp.mextra?.edog;
    if (edog && edog.apport <= 0) edog.apport = 1;
}

// C ref: restore.c restmonchn() (376-465), the saved-game branches. The
// snapshot keeps every nmon link, each monster's minvent chain and its mw
// pointer as graph references, so the chain is walked rather than rebuilt.
// Each monster's species pointer is resolved from the catalog (415-416), its
// inventory goes through restobjchn() and gets ocarry back pointers
// (419-429), the wielded-weapon pointer is re-derived from owornmask
// (432-444), and shopkeepers and priests get their extension fixups
// (446-449). polearm.hitmon (452-453) is a graph reference that
// parseSnapshot() already resolved.
export function restmonchn(first, state) {
    for (let mtmp = first; mtmp; mtmp = mtmp.nmon) {
        restmon(mtmp, state);
        mtmp.data = state.mons[mtmp.mnum];
        if (mtmp.minvent) {
            mtmp.minvent = restobjchn(mtmp.minvent, state);
            for (let obj = mtmp.minvent; obj; obj = obj.nobj)
                obj.ocarry = mtmp;
        }
        if (mtmp.mw) {
            let obj;
            for (obj = mtmp.minvent; obj; obj = obj.nobj)
                if (obj.owornmask & W_WEP)
                    break;
            // The miss arm is C's MON_NOWEP(mtmp) plus an impossible()
            // report; the pointer reset is the state change.
            mtmp.mw = obj ?? null;
        }
        if (mtmp.isshk)
            restshk(mtmp, false, state);
        if (mtmp.ispriest)
            restpriest(mtmp, false, state);
    }
    return first;
}

// Rebuild state.level.objlist from the level.objects grid when getlev()
// returns to a level savelev() kept in memory. Each grid cell holds an object
// chain (via .nexthere); the level-wide list threads them all via .nobj. Use
// the object-ID order savelev() captured, which C's restobjchn() preserves.
function rebuildObjectList(state) {
    const grid = state.level?.objects;
    if (!grid) return;

    const objects = [];
    for (let x = 0; x < grid.length; x++) {
        if (!grid[x]) continue;
        for (let y = 0; y < grid[x].length; y++) {
            let obj = grid[x][y];
            while (obj) {
                objects.push(obj);
                obj = obj.nexthere;
            }
        }
    }

    const savedOrder = state.level._objlistOrder;
    if (savedOrder) {
        const orderMap = new Map();
        for (let i = 0; i < savedOrder.length; i++) {
            orderMap.set(savedOrder[i], i);
        }
        objects.sort((a, b) => {
            const ai = orderMap.has(a.o_id) ? orderMap.get(a.o_id)
                : savedOrder.length;
            const bi = orderMap.has(b.o_id) ? orderMap.get(b.o_id)
                : savedOrder.length;
            return ai - bi;
        });
        delete state.level._objlistOrder;
    }

    let head = null;
    for (let i = objects.length - 1; i >= 0; i--) {
        objects[i].nobj = head;
        head = objects[i];
    }
    state.level.objlist = head;
}

// Rebuild game-level equipment pointers (uarm, uwep, etc.) by scanning
// the inventory for items whose owornmask identifies their slot. This
// replaces what setworn() established during the original equipping and
// avoids the side effects setworn()'s hooks would produce on restore.
function setWornPointers(obj, state) {
    for (const { mask, field } of WORN_SLOTS) {
        if (obj.owornmask & mask) {
            state[field] = obj;
        }
    }
}

function rebuildEquipmentPointers(state) {
    // Clear all equipment slots first.
    for (const { field } of WORN_SLOTS) {
        state[field] = null;
    }

    // C ref: restore.c restgamestate():685-687, setworn() for each worn
    // inventory object. Besides the pointer, setworn() sets each slot's
    // extrinsic and blocked bits on the restored u.uprops. A save carries
    // those bits already, except where nhlua.c nhl_gamestate(TRUE) put back
    // a u that was copied after the tutorial's setnotworn() calls: there
    // the worn gear's properties come back only through this setworn().
    // (Its artifact-intrinsic and display steps stay out, as before.)
    for (let obj = state.invent; obj; obj = obj.nobj) {
        if (!obj.owornmask) continue;
        setWornPointers(obj, state);
        for (const { mask } of WORN_SLOTS) {
            if ((obj.owornmask & mask) && !(mask & (W_SWAPWEP | W_QUIVER)))
                add_worn_property(obj, mask, obj.owornmask, state);
        }
    }

    // C ref: restore.c find_lev_obj():101-104, which getlev() reaches for
    // the hero's level: a ball or chain on the floor gets its uball or
    // uchain pointer back through setworn().
    for (let obj = state.level?.objlist; obj; obj = obj.nobj) {
        if (obj.owornmask & (W_BALL | W_CHAIN)) setWornPointers(obj, state);
    }
}

// ── getlev: restore a previously visited level from an in-memory snapshot ──
//
// C ref: restore.c getlev() (1046-1311). goto_level() calls it when
// LFILE_EXISTS is set, meaning the hero is returning to a level she left
// earlier via savelev(). The C function reads a binary level file and
// reconstructs all data structures; the JS port reads the in-memory snapshot
// that savelev() stored in state._savedLevels[ledger].
//
// Non-ghostly and not REST_LEVELS: the restore runs elapsed-time catch-up on
// each monster (mon_catchup_elapsed_time) and gives hiders a chance to hide
// (hide_monst, conditioned on elapsed > rnd(10)).

// region.c remove_region() unblocks and redraws a visible region's squares
// through the live vision and display state, as C does inside getlev().
function restoredRegionVisuals(state) {
    return {
        doesBlock: (x, y, location) => does_block(x, y, location, state),
        unblockPoint: (x, y) => unblock_point(x, y, state),
        canSee: (x, y) => cansee(x, y, state),
        newsym: (x, y) => newsym(x, y),
    };
}

export async function getlev(ledger, state = game) {
    const snapshot = state._savedLevels?.[ledger];
    if (!snapshot) {
        throw new Error(`getlev: no saved level for ledger ${ledger}`);
    }

    // Restore the level, stairs, engravings, smeq, updest, dndest.
    state.level = snapshot.level;
    // C ref: restore.c getlev():1113 rest_stairs(). Each save and restore
    // reverses the stairway list, which makemon_rnd_goodpos()'s stair
    // fallback walks in order.
    rest_stairs(snapshot.stairs, state);
    state.head_engr = snapshot.head_engr;
    // restore.c getlev():1174 rest_engravings().
    rest_engravings(state);
    if (snapshot.smeq) state.smeq = snapshot.smeq;
    state.updest = snapshot.updest ?? {};
    state.dndest = snapshot.dndest ?? {};

    restoreLevelAt(state.level);

    // C ref: restore.c:1110 svo.omoves = svm.moves - elapsed. The elapsed time
    // is how many game turns passed since the hero left this level. The snapshot
    // recorded `omoves` as the value of `state.moves` at the time of saving.
    const elapsed = state.moves - (snapshot.omoves ?? state.moves);

    // C ref: restore.c getlev():1117 rest_adjust_levelflags(), and
    // restmonchn()'s and restobjchn()'s restmon() calls (355-356): savelev()
    // left these times relative to its turn (save.js
    // shift_level_edog_times()); this read makes them absolute again.
    rest_adjust_levelflags(state);
    shift_level_edog_times(state.level, state.moves);

    // ── Restore timers and lights ──
    //
    // savelev() captured the level-local timers and lights before save_timers()
    // and save_light_sources() unlinked them. Re-link them into the global
    // chains now.
    if (snapshot.timers?.length) restore_timers(snapshot.timers, state);

    if (snapshot.lights?.length) {
        // Prepend the saved level-local lights to the current light chain.
        const lightHead = snapshot.lights[0];
        let lightTail = lightHead;
        for (let i = 1; i < snapshot.lights.length; i++) {
            lightTail.next = snapshot.lights[i];
            lightTail = snapshot.lights[i];
        }
        state.gl ??= {};
        lightTail.next = state.gl.light_base ?? null;
        state.gl.light_base = lightHead;
    }

    // ── Monster catch-up ──
    //
    // C ref: restore.c:1176-1221. For each monster on the level, C:
    //   1. Clears level.monsters[x][y] and re-places the monster (1178-1193)
    //   2. Runs mon_catchup_elapsed_time(mtmp, elapsed) if elapsed > 0 (1212)
    //   3. Calls restore_cham(mtmp) (1217)
    //   4. If elapsed > 0 and elapsed > rnd(10), calls hide_monst(mtmp) (1219)
    //
    // The level.monsters grid and .nmon chain are restored as one object
    // graph, preserving C's restmonchn() order. Do NOT rebuild this list from
    // the grid here: a column-major scan changes the order in which mcalcmove
    // and movemon consume RNG values.
    rebuildObjectList(state);

    // C ref: restore.c getlev() 1146 restmonchn(), whose inventory pass
    // reads each monster's objects through restobjchn() (419-429), then 1166
    // and 1172 restobjchn() for fobj and the buried list. The snapshot keeps
    // the chains and the live monsters keep the fields restmonchn() would
    // otherwise rebuild, so only restobjchn()'s per-object work runs here;
    // gb.billobjs (1173) is not level-local in this port.
    for (let mtmp = state.level.monlist; mtmp; mtmp = mtmp.nmon)
        if (mtmp.minvent) mtmp.minvent = restobjchn(mtmp.minvent, state);
    state.level.objlist = restobjchn(state.level.objlist, state);
    find_lev_obj(state.level.objlist);
    state.level.buriedobjlist = restobjchn(state.level.buriedobjlist, state);

    for (let mtmp = state.level.monlist; mtmp; mtmp = mtmp.nmon) {
        // Skip dead monsters (C does the same by purging them first).
        if (mtmp.mhp <= 0) continue;

        // C ref: restore.c:1182-1184. Reclaim a shopkeeper's room resident
        // before restore's elapsed-time and shape-change passes.
        if (mtmp.isshk) {
            set_residency(mtmp, false, state);
            restshk(mtmp, false, state);
        }

        // C ref: restore.c:1200-1201. Skip catch-up if dlevel is 0 or
        // restoring == REST_LEVELS (neither applies here).

        // C ref: restore.c:1212-1213. Non-ghostly elapsed-time catch-up.
        if (elapsed > 0) {
            mon_catchup_elapsed_time(mtmp, elapsed, { state });
        }

        // C ref: restore.c:1217. Update shape-changers.
        await restore_cham(mtmp, state);

        // C ref: restore.c:1219-1220. Give hiders a chance to hide.
        if (elapsed > 0 && elapsed > rnd(10)) {
            hide_monst(mtmp, state);
        }
    }

    // C ref: restore.c getlev():1225 rest_regions(), after restdamage() and
    // before rest_bubbles(). savelev() wrote the region timestamp from the
    // same svm.moves it saved as omoves.
    rest_regions(snapshot.omoves ?? state.moves, state,
        restoredRegionVisuals(state));

    if (snapshot.waterlevel) restore_waterlevel(snapshot.waterlevel, state);
    // C ref: restore.c getlev():1227 load_exclusions(), after rest_bubbles().
    load_exclusions(snapshot.exclusion_zones, state);

    // C restore.c rest_track() restores the track ring after the elapsed-time
    // catch-up. A missing ring is the equivalent of a freshly initialized
    // level, which is also what initrack() establishes for new arrivals.
    if (snapshot.track) {
        state.track = {
            utcnt: snapshot.track.utcnt,
            utpnt: snapshot.track.utpnt,
            utrack: snapshot.track.utrack.map(({ x, y }) => ({ x, y })),
        };
    } else {
        initrack(state);
    }

    // Drop the snapshot from the store; it's been restored. A future savelev()
    // will re-capture it.
    delete state._savedLevels[ledger];
}

// ── hide_monst ──
//
// C ref: mon.c hide_monst() (4806-4826). Gives a hider monster a chance to
// hide when the hero returns to a level. The function temporarily blinds the
// hero's vision for the monster's square (clearing IN_SIGHT and COULD_SEE),
// calls restrap() for ceiling hiders, retries for mimics, restores vision,
// and calls hideunder() for under-hiders.
//
// restrap() disguises a mimic through makemon.c set_mimic_sym(), whose
// M_AP_TYPE result decides whether the mimic gets its second try.
export function hide_monst(mon, state = game) {
    const setMimicSym = (mimic) => set_mimic_sym(mimic, {
        state,
        random: { rn1, rn2, rnd },
    });
    const hider_under = hides_under(mon.data) || mon.data?.mlet === S_EEL;

    if ((is_hider(mon.data) || hider_under)
        && !(mon.mundetected || M_AP_TYPE(mon))) {
        const x = mon.mx;
        const y = mon.my;
        // Temporarily suppress vision for the monster's square.
        const save_viz = state.viz_array?.[y]?.[x] ?? 0;
        if (state.viz_array?.[y]) {
            state.viz_array[y][x] &= ~(IN_SIGHT | COULD_SEE);
        }
        if (is_hider(mon.data)) {
            restrap(mon, {
                state,
                setMimicSym,
            });
        }
        // Retry for a mimic that missed its 1/3 chance.
        if (mon.data?.mlet === S_MIMIC && !M_AP_TYPE(mon)) {
            restrap(mon, {
                state,
                setMimicSym,
            });
        }
        // Restore vision.
        if (state.viz_array?.[y]) {
            state.viz_array[y][x] = save_viz;
        }
        if (hider_under) {
            // getlev() clears vision for this square first, so hideunder()
            // takes its message-free source path and updates state immediately.
            hideunder(mon, { state });
        }
    }
}

