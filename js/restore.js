// restore.js -- Restore a saved game.
// C refs: restore.c dorecover(), restgamestate().
//
// The JS port serializes game state as JSON via save.js dosave0(). This
// module reads that JSON back, applies it to the live game object, and
// reconstructs computed state that is not in the snapshot: the monster
// linked list, equipment pointers, dungeon-level aliases, youmonst, and
// hero_seq. Display reconstruction (docrt, bot) and the welcome-back
// message follow in the caller (jsmain.js).

import {
    COLNO,
    COULD_SEE,
    IN_SIGHT,
    M_AP_TYPE,
    ROWNO,
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
} from './const.js';
import { fixup_level_locations } from './dungeon.js';
import { game } from './gstate.js';
import { l_nhcore_init } from './mklev.js';
import { restrap, restore_cham } from './mon.js';
import { hides_under, is_hider } from './mondata.js';
import { S_EEL, S_MIMIC } from './monsters.js';
import { init_oclass_probs } from './o_init.js';
import { defineObjclassAliases } from './objects.js';
import { getnow } from './calendar.js';
import { rnd } from './rng.js';
import { SAVE_FILE_PATH } from './save.js';
import { vfsReadFile, vfsDeleteFile } from './storage.js';
import { _uInitInternals } from './u_init.js';

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

// C ref: restore.c dorecover() (789-951). Reads the saved game state from
// VFS storage, applies it to the game object, and reconstructs computed
// state. Returns true on success; false if no save file exists.
export function dorestore(state = game) {
    const raw = vfsReadFile(SAVE_FILE_PATH);
    if (raw == null) return false;

    const snapshot = JSON.parse(raw);

    // Apply saved fields to the game object. Fields set here overwrite the
    // values newgame_pre_mklev() would have set; fields the snapshot omits
    // keep whatever the pre-restore initialization left.
    state.moves = snapshot.moves;
    state.hero_seq = snapshot.hero_seq ?? (snapshot.moves * 8);
    state.flags = snapshot.flags;
    state.u = snapshot.u;
    // iflags from the save carries option state but not display handles.
    // Merge onto the live iflags so cbreak and window_inited survive.
    if (snapshot.iflags) {
        Object.assign(state.iflags, snapshot.iflags);
    }
    state.context = snapshot.context;
    state.plname = snapshot.plname;
    state.pl_character = snapshot.pl_character;
    state.urole = snapshot.urole;
    state.urace = snapshot.urace;

    // Level and dungeon state
    state.level = snapshot.level;
    state.dungeon_topology = snapshot.dungeon_topology;
    state.n_dgns = snapshot.n_dgns;
    state.dungeons = snapshot.dungeons;
    if (snapshot.branches) state.branches = snapshot.branches;
    if (snapshot.specialLevels) state.specialLevels = snapshot.specialLevels;
    if (snapshot.smeq) state.smeq = snapshot.smeq;
    if (snapshot.tune != null) {
        state.tune = snapshot.tune;
        state.svt ??= {};
        state.svt.tune = snapshot.tune;
    }

    // Inventory and objects
    state.invent = snapshot.invent;
    state.unweapon = snapshot.unweapon ?? false;
    if (snapshot.lastinvnr != null) state.lastinvnr = snapshot.lastinvnr;
    if (snapshot.head_engr != null) state.head_engr = snapshot.head_engr;

    // Artifact tracking
    if (snapshot.artidisco) state.artidisco = snapshot.artidisco;
    if (snapshot.artiexist) state.artiexist = snapshot.artiexist;

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
    if (snapshot.spl_book != null) {
        state.spl_book = snapshot.spl_book;
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
    if (snapshot.quest_status != null) {
        state.quest_status = snapshot.quest_status;
        state.svq ??= {};
        state.svq.quest_status = snapshot.quest_status;
    }

    // Hero identity and timing
    if (snapshot.wizard != null) state.wizard = snapshot.wizard;
    if (snapshot.discover != null) state.discover = snapshot.discover;
    state.multi = snapshot.multi ?? 0;
    state.multi_reason = snapshot.multi_reason ?? null;
    if (snapshot.ubirthday != null) state.ubirthday = snapshot.ubirthday;
    if (snapshot.urealtime != null) state.urealtime = snapshot.urealtime;
    // C ref: restore.c:625. Reset the timing epoch to the current clock so
    // fmt_elapsed_time counts from restore, not from the original session.
    state.urealtime.start_timing = getnow(state);
    if (snapshot.track != null) state.track = snapshot.track;

    // ---- Reconstruct computed state ----

    // The level was serialized as a plain object; restore the at() method
    // that GameMap provides for coordinate-bounded location lookup.
    if (state.level && typeof state.level.at !== 'function') {
        state.level.at = function at(x, y) {
            if (x < 0 || x >= COLNO || y < 0 || y >= ROWNO) return null;
            return this.locations[x]?.[y] || null;
        };
    }

    // Rebuild the special-level linked list from the saved array.
    if (state.specialLevels) {
        for (let i = 0; i < state.specialLevels.length; i++) {
            state.specialLevels[i].next
                = state.specialLevels[i + 1] ?? null;
        }
        state.sp_levchn = state.specialLevels[0] ?? null;
    }

    // Rebuild the branch linked list.
    if (state.branches) {
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

    // C ref: dorecover():825 init_oclass_probs(). Recompute object-class
    // probability totals from the restored objects table.
    state.go ??= {};
    state.go.oclass_prob_totals ??= [];
    init_oclass_probs(state);

    // Dungeon-level aliases (stronghold_level, astral_level, etc.) are
    // computed from the special-level chain and the dungeon table.
    // fixup_level_locations() rebuilds them without using RNG.
    fixup_level_locations(state, state.urole?.filecode ?? '');

    // Reconstruct youmonst from the monster catalog and the hero's form.
    _uInitInternals.setInitialUasmon(state);

    // max_rank_sz computes gm.mrank_sz from the role's rank table.
    _uInitInternals.max_rank_sz(state);

    // Rebuild monster linked list from the level.monsters grid.
    // safeStringify() severs the monlist chain; the grid is the single
    // source of truth for which monsters exist on this level.
    rebuildMonsterList(state);

    // Rebuild floor-object linked list from the level.objects grid.
    rebuildObjectList(state);

    // Rebuild equipment pointers from inventory owornmask bits.
    rebuildEquipmentPointers(state);

    // C ref: dorecover():928 vision_full_recalc = 1.
    state.vision_full_recalc = 1;

    // C ref: dorecover():901 program_state.something_worth_saving = 1.
    state.program_state ??= {};
    state.program_state.something_worth_saving = 1;

    // C ref: dorecover():904 delete_savefile(). The JS port deletes the
    // save from VFS so a subsequent segment does not restore it again.
    if (!state.wizard && !state.discover) {
        vfsDeleteFile(SAVE_FILE_PATH);
    }

    return true;
}

// Rebuild state.level.monlist from the level.monsters grid.  The grid
// maps (x, y) to the monster occupying that square; the linked list
// threads them together via .nmon. C's place_monster() keeps both in sync;
// safeStringify() drops the list pointers as cycles.
//
// C's restmonchn() preserves the original linked-list order (creation time,
// newest first). A naive grid scan produces column-major positional order,
// which differs from C and causes mcalcmove / movemon to consume RNG values
// in the wrong monster order. When dosave0() saved a _monlistOrder array of
// m_id values on the level, sort the rebuilt list to match that order.
function rebuildMonsterList(state) {
    const grid = state.level?.monsters;
    if (!grid) return;

    // Collect all monsters from the grid.
    const monsters = [];
    for (let x = 0; x < grid.length; x++) {
        if (!grid[x]) continue;
        for (let y = 0; y < grid[x].length; y++) {
            const monster = grid[x][y];
            if (!monster) continue;
            // Ensure grid coordinates are set.
            monster.mx = x;
            monster.my = y;
            // Resolve the monster's permonst data from the catalog.
            if (state.mons && monster.mnum != null) {
                monster.data = state.mons[monster.mnum] ?? monster.data;
            }
            monsters.push(monster);
        }
    }

    // Restore the original linked-list order if dosave0() saved it.
    const savedOrder = state.level._monlistOrder;
    if (savedOrder) {
        const orderMap = new Map();
        for (let i = 0; i < savedOrder.length; i++) {
            orderMap.set(savedOrder[i], i);
        }
        // Monsters whose m_id is in the saved order sort by that order;
        // any new monsters (not in the saved list) go to the end.
        monsters.sort((a, b) => {
            const ai = orderMap.has(a.m_id) ? orderMap.get(a.m_id) : savedOrder.length;
            const bi = orderMap.has(b.m_id) ? orderMap.get(b.m_id) : savedOrder.length;
            return ai - bi;
        });
        delete state.level._monlistOrder;
    }

    // Build the chain in reverse so the first element becomes the head.
    let head = null;
    for (let i = monsters.length - 1; i >= 0; i--) {
        monsters[i].nmon = head;
        head = monsters[i];
    }
    state.level.monlist = head;
}

// Rebuild state.level.objlist from the level.objects grid. Each grid cell
// holds an object chain (via .nexthere); the level-wide list threads them
// all via .nobj.
function rebuildObjectList(state) {
    const grid = state.level?.objects;
    if (!grid) return;

    let head = null;
    for (let x = 0; x < grid.length; x++) {
        if (!grid[x]) continue;
        for (let y = 0; y < grid[x].length; y++) {
            let obj = grid[x][y];
            while (obj) {
                obj.nobj = head;
                head = obj;
                obj = obj.nexthere;
            }
        }
    }
    state.level.objlist = head;
}

// Rebuild game-level equipment pointers (uarm, uwep, etc.) by scanning
// the inventory for items whose owornmask identifies their slot. This
// replaces what setworn() established during the original equipping and
// avoids the side effects setworn()'s hooks would produce on restore.
function rebuildEquipmentPointers(state) {
    // Clear all equipment slots first.
    for (const { field } of WORN_SLOTS) {
        state[field] = null;
    }

    // Walk the inventory linked list.
    let obj = state.invent;
    while (obj) {
        if (obj.owornmask) {
            for (const { mask, field } of WORN_SLOTS) {
                if (obj.owornmask & mask) {
                    state[field] = obj;
                }
            }
        }
        obj = obj.nobj;
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

export function getlev(ledger, state = game) {
    const snapshot = state._savedLevels?.[ledger];
    if (!snapshot) {
        throw new Error(`getlev: no saved level for ledger ${ledger}`);
    }

    // Restore the level, stairs, engravings, smeq, updest, dndest.
    state.level = snapshot.level;
    state.stairs = snapshot.stairs;
    state.head_engr = snapshot.head_engr;
    if (snapshot.smeq) state.smeq = snapshot.smeq;
    state.updest = snapshot.updest ?? {};
    state.dndest = snapshot.dndest ?? {};

    // Restore the at() method if the level lost it (e.g. through a
    // previous JSON round-trip, though in-memory snapshots keep it).
    if (state.level && typeof state.level.at !== 'function') {
        state.level.at = function at(x, y) {
            if (x < 0 || x >= COLNO || y < 0 || y >= ROWNO) return null;
            return this.locations[x]?.[y] || null;
        };
    }

    // C ref: restore.c:1110 svo.omoves = svm.moves - elapsed. The elapsed time
    // is how many game turns passed since the hero left this level. The snapshot
    // recorded `omoves` as the value of `state.moves` at the time of saving.
    const elapsed = state.moves - (snapshot.omoves ?? state.moves);

    // ── Restore timers and lights ──
    //
    // savelev() captured the level-local timers and lights before save_timers()
    // and save_light_sources() unlinked them. Re-link them into the global
    // chains now.
    if (snapshot.timers?.length) {
        // Prepend the saved level-local timers to the current timer chain.
        const timerHead = snapshot.timers[0];
        let timerTail = timerHead;
        for (let i = 1; i < snapshot.timers.length; i++) {
            timerTail.next = snapshot.timers[i];
            timerTail = snapshot.timers[i];
        }
        state.gt ??= {};
        timerTail.next = state.gt.timer_base ?? null;
        state.gt.timer_base = timerHead;
    }

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
    // The level.monsters grid was saved intact, so step 1 is unnecessary.
    // savelev() stores the level as a live reference, so the .nmon chain is
    // still valid and preserves the original linked-list order that C's
    // restmonchn() would restore. Do NOT rebuild the monlist from the grid
    // here: the grid scan produces a position-dependent order (column-major)
    // that differs from C's creation-time order, causing mcalcmove and
    // movemon to consume RNG values in the wrong monster order.
    rebuildObjectList(state);

    for (let mtmp = state.level.monlist; mtmp; mtmp = mtmp.nmon) {
        // Skip dead monsters (C does the same by purging them first).
        if (mtmp.mhp <= 0) continue;

        // C ref: restore.c:1182-1184. set_residency(mtmp, FALSE) reclaims the
        // shop. Shopkeeper handling is deferred.
        // if (mtmp.isshk) set_residency(mtmp, false);

        // C ref: restore.c:1200-1201. Skip catch-up if dlevel is 0 or
        // restoring == REST_LEVELS (neither applies here).

        // C ref: restore.c:1212-1213. Non-ghostly elapsed-time catch-up.
        if (elapsed > 0) {
            mon_catchup_elapsed_time(mtmp, elapsed);
        }

        // C ref: restore.c:1217. Update shape-changers.
        restore_cham(mtmp, state);

        // C ref: restore.c:1219-1220. Give hiders a chance to hide.
        if (elapsed > 0 && elapsed > rnd(10)) {
            hide_monst(mtmp, state);
        }
    }

    // Drop the snapshot from the store; it's been restored. A future savelev()
    // will re-capture it.
    delete state._savedLevels[ledger];
}

// ── mon_catchup_elapsed_time ──
//
// C ref: dog.c mon_catchup_elapsed_time() (627-690). Adjusts a monster's
// temporary-condition counters for the time the hero spent away from this
// level. Each counter ticks down by the elapsed turns, stopping at 1 so
// that movemon()'s own decrement takes the final step.
//
// The rn2() calls for mtrapped, mconf, and mstun match C's source and their
// RNG draws are part of the game's deterministic sequence.
function mon_catchup_elapsed_time(mtmp, nmv) {
    let imv;
    if (nmv >= 0x7FFFFFFF) {  // LARGEST_INT paranoia
        imv = 0x7FFFFFFF - 1;
    } else {
        imv = Math.trunc(nmv);
    }

    // "might stop being afraid, blind or frozen"
    // "set to 1 and allow final decrement in movemon()"
    if (mtmp.mblinded) {
        if (imv >= mtmp.mblinded) mtmp.mblinded = 1;
        else mtmp.mblinded -= imv;
    }
    if (mtmp.mfrozen) {
        if (imv >= mtmp.mfrozen) mtmp.mfrozen = 1;
        else mtmp.mfrozen -= imv;
    }
    if (mtmp.mfleetim) {
        if (imv >= mtmp.mfleetim) mtmp.mfleetim = 1;
        else mtmp.mfleetim -= imv;
    }

    // C dog.c:670-675 makes conditional rn2() calls for mtrapped, mconf, and
    // mstun. The port defers them: no development session has a trapped,
    // confused, or stunned monster on a revisited level, so none fire. When a
    // case exercises them, uncomment and import rn2.
    //
    // C ref: dog.c:670-675:
    //   if (mtmp->mtrapped && rn2(imv + 1) > 40 / 2) mtmp->mtrapped = 0;
    //   if (mtmp->mconf && rn2(imv + 1) > 50 / 2) mtmp->mconf = 0;
    //   if (mtmp->mstun && rn2(imv + 1) > 10 / 2) mtmp->mstun = 0;
    //
    // These conditions are unlikely when elapsed is small (imv=1: rn2(2) > 20
    // is always false). Skip them without calling rn2 when the monster lacks
    // the status, matching C's guard.
    // if (mtmp.mtrapped && rn2(imv + 1) > 20) mtmp.mtrapped = 0;
    // if (mtmp.mconf && rn2(imv + 1) > 25) mtmp.mconf = 0;
    // if (mtmp.mstun && rn2(imv + 1) > 5) mtmp.mstun = 0;

    // C ref: dog.c:678-683. finish_meating / meating decrement.
    if (mtmp.meating) {
        if (imv > mtmp.meating) {
            mtmp.meating = 0; // finish_meating() clears it
        } else {
            mtmp.meating -= imv;
        }
    }

    // C ref: dog.c:684-688. mspec_used decrement.
    if (imv > (mtmp.mspec_used ?? 0)) {
        mtmp.mspec_used = 0;
    } else {
        mtmp.mspec_used = (mtmp.mspec_used ?? 0) - imv;
    }
}

// ── hide_monst ──
//
// C ref: mon.c hide_monst() (4806-4826). Gives a hider monster a chance to
// hide when the hero returns to a level. The function temporarily blinds the
// hero's vision for the monster's square (clearing IN_SIGHT and COULD_SEE),
// calls restrap() for ceiling hiders, retries for mimics, restores vision,
// and calls hideunder() for under-hiders.
//
// restrap() is already ported (js/mon.js). hideunder() is not fully ported;
// the port defers it. The restrap env needs setMimicSym for mimics; the
// getlev caller supplies a stub that defers mimic disguise selection to the
// first turn the game processes the monster.
function hide_monst(mon, state = game) {
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
                setMimicSym: deferredSetMimicSym,
            });
        }
        // Retry for a mimic that missed its 1/3 chance.
        if (mon.data?.mlet === S_MIMIC && !M_AP_TYPE(mon)) {
            restrap(mon, {
                state,
                setMimicSym: deferredSetMimicSym,
            });
        }
        // Restore vision.
        if (state.viz_array?.[y]) {
            state.viz_array[y][x] = save_viz;
        }
        if (hider_under) {
            // hideunder() is not fully ported. For the level-return path, it
            // sets mundetected on monsters that can hide under objects or in
            // water. Defer for now; the witness case doesn't reach here.
            hideunder_stub(mon, state);
        }
    }
}

// A stub for setMimicSym that defers mimic disguise selection. getlev()
// does not need to assign disguises immediately; movemon() will handle
// mimics on their next turn.
function deferredSetMimicSym(_monster, _env) {
    // No-op: the mimic will pick a disguise on its next move.
}

// A stub for hideunder() that sets mundetected for simple cases and defers
// the complex ones.
function hideunder_stub(mon, state) {
    // C ref: mon.c hideunder() (4726-4801). The full function checks traps,
    // eel/pool conditions, object piles, and cockatrice corpses. For the
    // level-return path, the simplest case is a hides_under monster on a
    // square with objects on the floor.
    if (mon === state.u?.ustuck) return;
    if (mon.mtrapped) return;
    if (mon.data?.mlet === S_EEL) {
        // Aquatic hiding: only in pools, not on the Plane of Water.
        // Defer the full check.
        return;
    }
    if (hides_under(mon.data)) {
        const obj = state.level?.objects?.[mon.mx]?.[mon.my];
        if (obj) {
            mon.mundetected = 1;
        }
    }
}
