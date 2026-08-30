// quest.js -- quest dungeon branch routines.
// C ref: quest.c onquest(), on_start(), on_locate(), on_goal().

import { Is_special, on_level } from './dungeon.js';
import { game } from './gstate.js';
import { qt_pager } from './questpgr.js';

// C ref: quest.c on_start().  Called when the hero arrives on the quest
// start level.  Delivers quest text via qt_pager() on the first visit and
// on returns from a different dungeon or a higher depth.
async function on_start(state) {
    const qs = state.svq.quest_status;
    const u = state.u;
    if (!qs.first_start) {
        await qt_pager('firsttime', state);
        qs.first_start = true;
    } else if ((u.uz0.dnum !== u.uz.dnum)
               || (u.uz0.dlevel < u.uz.dlevel)) {
        if ((qs.not_ready ?? 0) <= 2) {
            await qt_pager('nexttime', state);
        } else {
            await qt_pager('othertime', state);
        }
    }
}

// C ref: quest.c on_locate().  Called when the hero arrives on the quest
// locate level.
async function on_locate(state) {
    const qs = state.svq.quest_status;
    const u = state.u;
    const from_above = u.uz0.dlevel < u.uz.dlevel;

    if (qs.killed_nemesis) {
        return;
    } else if (!qs.first_locate) {
        if (from_above) await qt_pager('locate_first', state);
        qs.first_locate = true;
    } else {
        if (from_above) await qt_pager('locate_next', state);
    }
}

// C ref: quest.c on_goal().  Called when the hero arrives on the nemesis
// level.
async function on_goal(state) {
    const qs = state.svq.quest_status;

    if (qs.killed_nemesis) {
        return;
    } else if (!qs.made_goal) {
        await qt_pager('goal_first', state);
        qs.made_goal = 1;
    } else {
        // Some goal_next messages reference the quest artifact; if it is
        // not present on the level, use goal_alt (with fallback to
        // goal_next via QUEST_TEXT_FALLBACKS).
        // TODO: implement find_quest_artifact() to check object chains.
        // For now, always use goal_next.
        await qt_pager('goal_next', state);
        if (qs.made_goal < 7) qs.made_goal++;
    }
}

// C ref: quest.c onquest().  Called from goto_level() when the hero
// arrives on a quest level.  Dispatches to the appropriate handler based
// on which quest level the hero is on.
export async function onquest(state = game) {
    const u = state.u;

    // C ref: quest.c Not_firsttime: (on_level(&u.uz0, &u.uz)).
    // If the hero didn't actually change levels, do nothing.
    if (u.uevent?.qcompleted || on_level(u.uz0, u.uz)) return;

    if (!Is_special(u.uz, state)) return;

    if (state.qstart_level && on_level(u.uz, state.qstart_level)) {
        await on_start(state);
    } else if (state.qlocate_level
               && on_level(u.uz, state.qlocate_level)) {
        await on_locate(state);
    } else if (state.nemesis_level
               && on_level(u.uz, state.nemesis_level)) {
        await on_goal(state);
    }
}
