// save.js -- tearing the current level down as the hero leaves it.
// C refs: save.c savelev() and savelev_core().
//
// `AGENTS.md` forbids game code from touching the filesystem, and the port
// keeps its one level in `game.level` rather than in a level file, so every
// write in savelev_core() has no counterpart here. What remains is the half
// C performs under FREEING, which do.c goto_level() depends on: the level
// being left surrenders the timers and light sources that belong to it, and
// its ledger is marked VISITED.
//
// The rest of the FREEING half is done for the port by mklev.c
// clear_level_structures(), which replaces `game.level` with a fresh map and
// so drops the monster chain, the object chains, the buried objects, the
// traps, the rooms, the doors and the engravings in one assignment. C frees
// them individually because it owns their memory.

import { RANGE_LEVEL, VISITED } from './const.js';
import { game } from './gstate.js';
import { save_light_sources } from './light.js';
import { dmonsfree } from './makemon_create.js';
import { level_info } from './dungeon.js';
import { save_timers } from './timeout.js';

// C ref: save.c savelev()/savelev_core(), called from do.c goto_level() with
// mode `WRITING | FREEING`. `ledger` is C's `lev`, the ledger number of the
// level being left.
export function savelev(ledger, state = game) {
    // savelev_core() purges the dead before it writes them. dobjsfree() has
    // no port counterpart: go.objs_deleted is written only by obj_extract_self
    // on an object already scheduled for deletion, which nothing in the port
    // does.
    if (state.iflags?.purge_monsters) dmonsfree(state);

    level_info(ledger, state).flags |= VISITED;

    // "timers and lights must be saved before monsters and objects", says the
    // comment at the same point in C. Order matters there because the freed
    // monsters and objects are what the locality tests read.
    save_timers(RANGE_LEVEL, state);
    save_light_sources(RANGE_LEVEL, state);
}
