// quest.js -- quest dungeon branch routines.
// C ref: quest.c onquest(), on_start(), on_locate(), on_goal(),
// quest_chat(), and chat_with_leader().

import {
    A_CURRENT,
    A_ORIGINAL,
    A_WIS,
    MIN_QUEST_ALIGN,
    MIN_QUEST_LEVEL,
} from './const.js';
import { yn_function } from './cmd.js';
import { exercise } from './attrib.js';
import { Is_special, on_level } from './dungeon.js';
import { game } from './gstate.js';
import { align_str } from './insight.js';
import { qt_pager } from './questpgr.js';
import { ttyPline } from './tty_message.js';

// C ref: quest.c not_capable() (146-150).
function not_capable(state) {
    return state.u.ulevel < MIN_QUEST_LEVEL;
}

// C ref: quest.c is_pure() (152-176). The talk-only Wizard diagnostics are
// observable here because the witnessed debug Priest starts with zero
// alignment record and answers the adjustment question with `y`.
async function is_pure(talk, state) {
    const u = state.u;
    const originalAlignment = u.ualignbase[A_ORIGINAL];

    if (state.wizard && talk) {
        if (u.ualign.type !== originalAlignment) {
            await ttyPline(
                `You are currently ${align_str(u.ualign.type)} instead of `
                + `${align_str(originalAlignment)}.`,
                state,
            );
        } else if (u.ualignbase[A_CURRENT] !== originalAlignment) {
            await ttyPline('You have converted.', state);
        } else if (u.ualign.record < MIN_QUEST_ALIGN) {
            await ttyPline(
                `You are currently ${u.ualign.record} and require `
                + `${MIN_QUEST_ALIGN}.`,
                state,
            );
            if (await yn_function('adjust?', null, 'y', true, state)
                === 'y'.charCodeAt(0))
                u.ualign.record = MIN_QUEST_ALIGN;
        }
    }

    return u.ualign.record >= MIN_QUEST_ALIGN
        && u.ualign.type === originalAlignment
        && u.ualignbase[A_CURRENT] === originalAlignment
        ? 1
        : u.ualignbase[A_CURRENT] !== originalAlignment ? -1 : 0;
}

// C ref: quest.c ok_to_quest() (139-144). External hook for do.c level
// change check: the hero may descend past the quest start level when the
// leader gave the quest and the hero is pure, or the leader is dead.
export async function ok_to_quest(state = game) {
    const qs = state.svq.quest_status;
    return ((qs.got_quest || qs.got_thanks)
            && (await is_pure(false, state)) > 0)
        || qs.killed_leader;
}

// C ref: quest.c chat_with_leader() Rule 5 (317-365), limited to the
// witnessed peaceful first meeting on the quest start level. Later meetings,
// artifact/completion states, and refusal branches stay fail-closed.
async function chat_with_leader(mtmp, state) {
    const qs = state.svq.quest_status;
    const u = state.u;
    if (!mtmp.mpeaceful || qs.pissed_off)
        return false;
    if (qs.got_thanks || u.uhave.questart || qs.got_quest)
        return false;
    if (qs.met_leader)
        return false;

    await qt_pager('leader_first', state);
    qs.met_leader = true;
    qs.not_ready = 0;

    // C returns from this function immediately if the leader crossed the
    // portal while the pager was being delivered. That transition is outside
    // this witness; leave it closed rather than inventing an expulsion path.
    if (!on_level(u.uz, state.qstart_level))
        return true;
    if (not_capable(state))
        return false;

    const purity = await is_pure(true, state);
    if (purity !== 1)
        return false;

    await qt_pager('assignquest', state);
    await exercise(A_WIS, true, state);
    qs.got_quest = true;
    return true;
}

// C ref: quest.c quest_chat() (472-492). Only the leader identity arm is
// admitted by this slice; nemesis, guardian, and unknown quest characters
// retain the existing fail-closed behavior.
export async function quest_chat(mtmp, state = game) {
    const qs = state.svq?.quest_status;
    if (mtmp.m_id !== qs?.leader_m_id)
        return false;
    return chat_with_leader(mtmp, state);
}

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
