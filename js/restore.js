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
import { init_oclass_probs } from './o_init.js';
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
    if (snapshot.objects) state.objects = snapshot.objects;
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
function rebuildMonsterList(state) {
    const grid = state.level?.monsters;
    if (!grid) return;

    let head = null;
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
            monster.nmon = head;
            head = monster;
        }
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
