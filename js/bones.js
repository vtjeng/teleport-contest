// Bones-file eligibility.
// C ref: src/bones.c no_bones_level() and can_make_bones().

import { MAGIC_PORTAL } from './const.js';
import {
    In_hell,
    Is_botlevel,
    Is_branchlev,
    Is_special,
    assign_level,
    depth,
    dunlevs_in_dungeon,
    ledger_no,
    maxledgerno,
} from './dungeon.js';
import { game } from './gstate.js';
import { rn2 } from './rng.js';

function no_bones_level(level, state) {
    // gs.save_dlevel is nonzero only while savebones() temporarily evaluates
    // another level. really_done() reaches this function with its zero value.
    const saveLevel = state.gs?.save_dlevel;
    if (saveLevel && ledger_no(saveLevel, state))
        assign_level(level, saveLevel);

    const special = Is_special(level, state);
    const dungeon = state.dungeons[level.dnum];
    return Boolean(
        (special && !special.boneid)
        || !dungeon.boneid
        || Is_botlevel(level, state)
        || (Is_branchlev(level, state) && level.dlevel > 1)
        || (In_hell(level, state)
            && level.dlevel === dunlevs_in_dungeon(level, state) - 1)
    );
}

// C ref: bones.c can_make_bones() (357-385). This function decides only
// whether bones are feasible. really_done() still refuses the positive result
// because creating and saving a bones level is outside the current slice.
export function can_make_bones(state = game, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2 };
    const level = state.u.uz;

    if (!state.flags.bones) return false;
    const ledger = ledger_no(level, state);
    if (ledger <= 0 || ledger > maxledgerno(state)) return false;
    if (no_bones_level(level, state)) return false;
    if (state.u.uswallow) return false;
    if (!Is_branchlev(level, state)) {
        for (const trap of state.level?.traps ?? []) {
            if (trap.ttyp === MAGIC_PORTAL) return false;
        }
    }

    const levelDepth = depth(level, state);
    if (levelDepth <= 0
        || (!random.rn2(1 + (levelDepth >> 2)) && !state.wizard))
        return false;
    if (state.discover) return false;
    return true;
}
