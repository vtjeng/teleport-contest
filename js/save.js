// save.js -- save game and level teardown.
// C refs: save.c dosave(), dosave0(), savelev(), savelev_core(),
//         savegamestate().
//
// dosave() is the #save command: it prompts "Really save?", and on a yes
// answer calls dosave0() to undo date-dependent luck adjustments, serialize
// the game state to VFS storage, print "Be seeing you...", and end the
// segment by setting program_state.gameover.
//
// savelev() / savelev_core()'s teardown role (for goto_level) is unchanged:
// `AGENTS.md` forbids game code from touching the filesystem, and the port
// keeps its one level in `game.level` rather than in a level file, so every
// write in savelev_core() has no counterpart here. What remains is the
// teardown do.c goto_level() depends on, which comes from two different
// branches of C rather than one:
//
//   - save_timers(RANGE_LEVEL) and save_light_sources(RANGE_LEVEL) release the
//     timers and light sources belonging to the level being left. savelev_core()
//     calls them at save.c:539; each frees under its own release_data() test,
//     `save_timers()` at timeout.c:2667-2682 and `save_light_sources()` at
//     light.c:421. That is the FREEING half proper.
//   - dmonsfree() (save.c:488) and the VISITED ledger flag (save.c:494) sit
//     inside `if (nhfp->mode != FREEING)` at save.c:480, which is the
//     *other* branch. goto_level() reaches it because it passes
//     `WRITING | FREEING` (save.c:156), and that compound value is not equal
//     to FREEING.
//
// The remainder of C's freeing is done for the port by mklev.c
// clear_level_structures(), which replaces `game.level` with a fresh map and
// so drops the monster chain, the object chains, the buried objects, the
// traps, the rooms, the doors and the engravings in one assignment. C frees
// them individually because it owns their memory.

// js/cmd.js imports dosave back from this file. Both cycle edges are safe
// because their imported bindings are read only inside functions, after
// module initialization; neither belongs in a module-scope value initializer
// while the cycle remains.
import { yn_function } from './cmd.js';
import {
    ECMD_OK, FULL_MOON, LFILE_EXISTS, RANGE_LEVEL, VISITED,
} from './const.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { save_light_sources } from './light.js';
import { dmonsfree } from './makemon_create.js';
import { change_luck } from './moveloop_preamble.js';
import { level_info } from './dungeon.js';
import { save_timers } from './timeout.js';
import { vfsWriteFile } from './storage.js';
import { clearTtyMessageWindow, ttyPline } from './tty_message.js';
import { tty_raw_print } from './tty_rawprint.js';

// ── Level-local timer and light source capture ──
//
// save_timers(RANGE_LEVEL) and save_light_sources(RANGE_LEVEL) unlink the
// level-local entries from the global chains. To restore a level later, the
// port captures those entries into the level snapshot *before* the teardown
// discards them. The capture walks the same linked list and collects the
// entries that would match the `timer_is_local` / `obj_is_local` test the
// real teardown uses.

function captureLocalTimers(state) {
    const base = state.gt?.timer_base;
    if (!base) return null;
    // timer_is_local checks whether the timer's target object lives on the
    // level. Walk the chain and collect the local timers, which are the
    // ones save_timers(RANGE_LEVEL) will unlink.
    const captured = [];
    for (let timer = base; timer; timer = timer.next) {
        // timer_is_local is not exported from timeout.js, but its logic for
        // RANGE_LEVEL is: the timer matches when its target obj is on the
        // level (obj_is_local in timeout.c). The save_timers implementation
        // tests `(range === RANGE_LEVEL) === timer_is_local(current, state)`.
        // Rather than importing and duplicating the local-test, capture every
        // timer that is present before save_timers runs, and let save_timers
        // decide which to keep. We capture all and let getlev splice the
        // level-local subset back in.
        //
        // Simpler: just take a snapshot of the whole timer chain. getlev()
        // restores only the level-local ones, which are exactly the ones
        // save_timers removed from the chain.
        captured.push(timer);
    }
    return captured.length ? captured : null;
}

function captureLocalLights(state) {
    const base = state.gl?.light_base;
    if (!base) return null;
    const captured = [];
    for (let light = base; light; light = light.next) {
        captured.push(light);
    }
    return captured.length ? captured : null;
}

// C ref: save.c savelev()/savelev_core(), called from do.c goto_level() with
// mode `WRITING | FREEING`. `ledger` is C's `lev`, the ledger number of the
// level being left.
//
// The port extends C's teardown-only savelev with in-memory level
// serialization: before discarding timers and lights, the level's complete
// state is captured into `state._savedLevels[ledger]` so that getlev() can
// restore it when the hero returns. C writes each piece to a binary level
// file; the port keeps the live objects in memory and captures a snapshot
// before teardown removes them.
export function savelev(ledger, state = game) {
    // savelev_core() purges the dead before it writes them. dobjsfree() has
    // no port counterpart: go.objs_deleted is written only by obj_extract_self
    // on an object already scheduled for deletion, which nothing in the port
    // does.
    if (state.iflags?.purge_monsters) dmonsfree(state);

    level_info(ledger, state).flags |= VISITED;

    // ── Capture level state before teardown ──
    //
    // C's savelev_core(WRITING|FREEING) serializes the level to a binary file,
    // then frees the data structures. The port keeps the level objects in
    // memory, so "serialize" means copying the references into a snapshot keyed
    // by ledger number. getlev() reads the snapshot back when the hero returns.
    //
    // Capture timers and lights now, because save_timers(RANGE_LEVEL) and
    // save_light_sources(RANGE_LEVEL) below will unlink the level-local entries
    // from the global chains.
    const allTimersBefore = captureLocalTimers(state);
    const allLightsBefore = captureLocalLights(state);

    // "timers and lights must be saved before monsters and objects", says the
    // comment at the same point in C. Order matters there because the freed
    // monsters and objects are what the locality tests read.
    save_timers(RANGE_LEVEL, state);
    save_light_sources(RANGE_LEVEL, state);

    // The timers/lights that save_timers/save_light_sources just unlinked are
    // the level-local ones. Derive them by diffing the before and after chains.
    const survivingTimers = new Set();
    for (let t = state.gt?.timer_base; t; t = t.next) survivingTimers.add(t);
    const levelTimers = allTimersBefore
        ? allTimersBefore.filter((t) => !survivingTimers.has(t))
        : [];

    const survivingLights = new Set();
    for (let l = state.gl?.light_base; l; l = l.next) survivingLights.add(l);
    const levelLights = allLightsBefore
        ? allLightsBefore.filter((l) => !survivingLights.has(l))
        : [];

    // Store the snapshot. The key is the ledger number of the level.
    state._savedLevels ??= {};
    state._savedLevels[ledger] = {
        level: state.level,
        stairs: state.stairs,
        head_engr: state.head_engr,
        smeq: state.smeq ? [...state.smeq] : null,
        omoves: state.moves,         // C: svm.moves saved as svo.omoves
        updest: state.updest ? { ...state.updest } : {},
        dndest: state.dndest ? { ...state.dndest } : {},
        timers: levelTimers,
        lights: levelLights,
    };

    // Mark LFILE_EXISTS so goto_level knows a save exists for this level.
    // C's create_levelfile() sets this flag; the port sets it here because
    // there is no file system and the snapshot is the equivalent of the file.
    level_info(ledger, state).flags |= LFILE_EXISTS;
}

// ── dosave / dosave0 — the #save command ──

// The VFS path that dosave0() writes the serialized game state to. A future
// dorestore() reads from the same path. C uses gs.SAVEF, which encodes the
// uid and plname; this port has one game at a time and no uid, so a fixed
// path suffices.
export const SAVE_FILE_PATH = 'nhsave';

// C ref: save.c dosave():43-70, the #save command. Prompts "Really save?";
// on a yes answer, serializes the game state via dosave0(), prints "Be
// seeing you..." through the exit_nhwindows path, and ends the segment.
export async function dosave(state = game) {
    clearTtyMessageWindow(state);
    // C ref: save.c:46, y_n("Really save?"). C's y_n() macro passes
    // addcmdq TRUE to yn_function(), which queues the answer for #repeat.
    // This terminal prompt does not need a repeat record: the game exits on
    // 'y', and #repeat is unported on the declining path. Pass addcmdq FALSE.
    if ((await yn_function('Really save?', 'yn', 'n', false, state))
        === 'n'.charCodeAt(0)) {
        clearTtyMessageWindow(state);
        if ((state.multi ?? 0) > 0) nomul(0, state);
    } else {
        clearTtyMessageWindow(state);
        await ttyPline('Saving...', state);
        if (dosave0(state)) {
            // C ref: save.c:57-65. program_state.savefile_completed is a C
            // bookkeeping counter with no JS consumer. u.uhp = -1 is the
            // universal game-over indicator.
            state.u.uhp = -1;

            // C ref: save.c:63-64 display_nhwindow(WIN_MESSAGE, TRUE) then
            // exit_nhwindows("Be seeing you..."). display_nhwindow with TRUE
            // blocking on a NHW_MESSAGE window that is not TOPLINE_NEED_MORE
            // just resets toplin to TOPLINE_EMPTY (wintty.c:1875-1879), and
            // exit_nhwindows -> tty_suspend_nhwindows -> settty(str) calls
            // term_end_screen() and raw_print(str). The raw_print clears the
            // screen and writes the farewell.
            tty_raw_print(state, 'Be seeing you...');

            // C calls nh_terminate(EXIT_SUCCESS) to exit the process. The JS
            // port signals the end of the segment by setting gameover, which
            // breaks the moveloop in allmain.js. The recorder patch's
            // nh_terminate() captures the final farewell screen; the JS
            // equivalent lives in jsmain.js runSegment(), which calls
            // _preNhgetchHook after the gameover break, matching the C
            // recorder's capture position.
            state.program_state.gameover = true;
        }
        // C's else arm calls docrt() for a failed save. dosave0() below
        // always succeeds in the JS port (VFS writes do not fail in the
        // contest harness), so this arm is unreachable.
    }
    return ECMD_OK;
}

// C ref: save.c dosave0():74-233. Undoes date-dependent luck adjustments
// made at startup, serializes game state to VFS storage, and returns 1 on
// success. The C version writes a binary save file; the JS port writes a
// JSON snapshot to the VFS, which dorestore() in a future segment reads
// back.
//
// Many C-side operations have no JS counterpart:
//   - notice_mon_off/on() — the port has no mon_warning display
//   - iflags.save_uswallow/save_uinwater/save_uburied — no hangup handler
//   - done_object_cleanup() — no thrown-object transit
//   - program_state.something_worth_saving — always true in the port
//   - opening/closing the binary save file — replaced by vfsWriteFile()
//   - store_version/store_plname — part of the JSON snapshot
//   - multi-level save loop — the port keeps one level in game.level
//   - set_ustuck(0), u.usteed = 0 — post-serialization cleanup only
function dosave0(state = game) {
    // C ref: save.c:142-145. Undo date-dependent luck adjustments made at
    // startup time in moveloop_preamble(). The session exercises the
    // Friday-13th path: change_luck(-1) was applied at startup, so
    // change_luck(1) here restores the base value.
    if (state.flags?.moonphase === FULL_MOON) {
        change_luck(-1, state);
    }
    if (state.flags?.friday13) {
        change_luck(1, state);
    }

    // C ref: save.c:168-169 savelev() + savegamestate(). The port serializes
    // the game state as a JSON snapshot to VFS storage. The binary format
    // C uses (struct-by-struct with Sfo_ macros) is replaced by a single
    // JSON blob containing the fields the restore path will need.
    //
    // Game objects form circular reference chains (e.g., a carried object's
    // `.v` field points to the carrying monster, whose `.minvent` points
    // back). safeStringify() replaces cycles with null rather than throwing.
    // Record the monlist order so that dorecover's rebuildMonsterList can
    // restore the same linked-list order that C's restmonchn() preserves.
    // safeStringify()'s cycle detector severs the .nmon chain; the grid is
    // the surviving source of truth for which monsters exist, but its
    // column-major scan order differs from the original creation-time order.
    // Storing m_id values in chain order lets the rebuild sort correctly.
    captureMonlistOrder(state.level);

    const snapshot = serializeGameState(state);
    vfsWriteFile(SAVE_FILE_PATH, safeStringify(snapshot));

    return 1;
}

// JSON.stringify with circular-reference protection. The game-state graph
// contains back-pointers (obj.v -> carrying monster -> minvent -> obj) that
// form cycles. Rather than walking every subgraph manually, a WeakSet tracks
// objects already on the serialization stack and replaces revisits with null.
// Functions and display handles are also dropped, keeping the snapshot as
// pure data.
function safeStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, val) => {
        if (typeof val === 'function') return undefined;
        if (val !== null && typeof val === 'object') {
            if (seen.has(val)) return null;
            seen.add(val);
        }
        return val;
    });
}

// Serialize the game state into a plain object suitable for JSON.stringify.
// The fields mirror what C's savegamestate() (save.c:265-333) writes: the
// hero struct, flags, moves, context, inventory, level data, dungeon state,
// and related subsystems. Non-serializable values (functions, display
// handles) are excluded by safeStringify's replacer.
function serializeGameState(state) {
    return {
        // C ref: savegamestate() fields in save.c:265-333 order
        moves: state.moves,
        hero_seq: state.hero_seq,
        flags: state.flags,
        u: state.u,
        iflags: serializeIflags(state.iflags),
        context: state.context,
        plname: state.plname,
        pl_character: state.pl_character,
        urole: state.urole,
        urace: state.urace,
        // Level and dungeon state
        level: state.level,
        dungeon_topology: state.dungeon_topology,
        n_dgns: state.n_dgns,
        dungeons: state.dungeons,
        branches: serializeBranches(state.branches),
        specialLevels: serializeSpecialLevels(state.specialLevels),
        smeq: state.smeq,
        tune: state.tune,
        // Inventory and objects
        invent: state.invent,
        // Equipment state: setworn() sets these game-level pointers; the
        // restore path scans owornmask to rebuild them, but unweapon has no
        // per-object representation. lastinvnr is the next inventory letter
        // counter; head_engr is the engraving chain on this level.
        unweapon: state.unweapon,
        lastinvnr: state.lastinvnr,
        head_engr: state.head_engr,
        // Artifact tracking: artidisco records which artifacts the hero has
        // identified; artiexist records which exist in the game.
        artidisco: state.artidisco,
        artiexist: state.artiexist,
        // Object catalog: init_objects() shuffles descriptions using RNG, so
        // the shuffled state must be saved for discovery display to work.
        // Each entry's oc_name_idx, oc_descr_idx, and oc_prob capture the
        // per-game shuffle, while discovery bits record what the hero knows.
        objects: state.objects,
        // svb.bases maps each object class to its first object index.
        bases: state.svb?.bases,
        // Discovery log: which object types the hero has identified.
        disco: state.svd?.disco,
        // Fruit list: custom fruit names from option parsing and gameplay.
        pl_fruit: state.svp?.pl_fruit,
        // Game subsystems
        spl_book: state.spl_book,
        mvitals: state.mvitals,
        mapseenchn: state.svm?.mapseenchn,
        quest_status: state.quest_status,
        // Hero identity and timing
        wizard: state.wizard,
        discover: state.discover,
        multi: state.multi,
        multi_reason: state.multi_reason,
        ubirthday: state.ubirthday,
        urealtime: state.urealtime,
        track: state.track,
        // Calendar state needed for restore's moveloop_preamble
        fixedDatetime: state.fixedDatetime,
        recorderIsDst: state.recorderIsDst,
    };
}

// Serialize iflags, excluding display handles and functions that cannot
// survive a JSON round-trip.
function serializeIflags(iflags) {
    if (!iflags) return null;
    const copy = { ...iflags };
    // tty display state is rebuilt at restore, not serialized.
    delete copy.window_inited;
    return copy;
}

// Serialize the special-level chain as a flat array of entries without
// the linked-list `.next` pointers. safeStringify()'s cycle detector
// would null-out subsequent array elements because the first element's
// `.next` chain visits them all, so stripping `.next` before serialization
// preserves every entry. Restore rebuilds the chain.
function serializeSpecialLevels(levels) {
    if (!levels) return null;
    return levels.map((entry) => {
        if (!entry) return null;
        const { next: _, ...rest } = entry;
        return rest;
    });
}

// Save the monlist traversal order on the level object as an array of m_id
// values. rebuildMonsterList() reads this after a JSON round-trip to restore
// the same linked-list order that C's restmonchn() preserves. Without this,
// the grid scan produces a position-dependent order that diverges from C.
function captureMonlistOrder(level) {
    if (!level) return;
    const order = [];
    for (let m = level.monlist; m; m = m.nmon) {
        if (m.m_id != null) order.push(m.m_id);
    }
    if (order.length) level._monlistOrder = order;
}

// Serialize the branch array without linked-list pointers. C's branch
// list uses `.next`; the JS port keeps an array and a `.next` overlay.
// Like specialLevels, safeStringify()'s cycle detector would null
// revisited entries, so strip `.next` here and rebuild on restore.
function serializeBranches(branches) {
    if (!branches) return null;
    return branches.map((entry) => {
        if (!entry) return null;
        const { next: _, ...rest } = entry;
        return rest;
    });
}
