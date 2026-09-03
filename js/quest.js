// quest.js -- quest dungeon branch routines.
// C ref: quest.c onquest(), on_start(), on_locate(), on_goal(), not_capable(),
// is_pure(), ok_to_quest(), expulsion(), chat_with_leader(), leader_speaks(),
// quest_chat(), quest_talk(), and quest_stat_check().

import {
    A_CURRENT,
    A_ORIGINAL,
    A_WIS,
    MIN_QUEST_ALIGN,
    MIN_QUEST_LEVEL,
    helpless,
    UTOTYPE_NONE,
    UTOTYPE_PORTAL,
} from './const.js';
import { yn_function } from './cmd.js';
import { exercise } from './attrib.js';
import { dungeon_branch, Is_special, on_level } from './dungeon.js';
import { schedule_goto } from './do.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { align_str } from './insight.js';
import { monnear } from './monmove.js';
import { MS_DJINNI, MS_NEMESIS } from './monsters.js';
import { qt_pager, QUEST_PAGER_OUTPUT } from './questpgr.js';
import { rn2 } from './rng.js';
import { ttyPline } from './tty_message.js';

// Everything a quest conversation needs from the world outside quest.c: the
// pager's window-port calls, pline(), the wizard-mode prompt, the random
// stream, and the refusal. Each caller owns the refusal class, so that #chat
// and monster movement report an unported arm the way the rest of their own
// subsystem does. The monster-movement dry run replaces the pager output, the
// message and the prompt as well, because it must stay silent and must never
// wait for a key.
function questConversation(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    if (typeof env.unsupported !== 'function')
        throw new TypeError('a quest conversation requires an unsupported operation');
    return {
        state,
        random,
        unsupported: env.unsupported,
        message: env.message ?? ttyPline,
        yn: env.yn ?? yn_function,
        pager: (msgid) => qt_pager(
            msgid, state, random.rn2, env.output ?? QUEST_PAGER_OUTPUT,
        ),
    };
}

// C ref: quest.c not_capable() (146-150).
function not_capable(state) {
    return state.u.ulevel < MIN_QUEST_LEVEL;
}

// C ref: quest.c is_pure() (152-176). The talk-only Wizard diagnostics are
// observable here because the witnessed debug Priest starts with zero
// alignment record and answers the adjustment question with `y`.
async function is_pure(talk, ops) {
    const state = ops.state;
    const u = state.u;
    const originalAlignment = u.ualignbase[A_ORIGINAL];

    if (state.wizard && talk) {
        if (u.ualign.type !== originalAlignment) {
            await ops.message(
                `You are currently ${align_str(u.ualign.type)} instead of `
                + `${align_str(originalAlignment)}.`,
                state,
            );
        } else if (u.ualignbase[A_CURRENT] !== originalAlignment) {
            await ops.message('You have converted.', state);
        } else if (u.ualign.record < MIN_QUEST_ALIGN) {
            await ops.message(
                `You are currently ${u.ualign.record} and require `
                + `${MIN_QUEST_ALIGN}.`,
                state,
            );
            if (await ops.yn('adjust?', null, 'y', true, state)
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
            && (await is_pure(false, { state })) > 0)
        || qs.killed_leader;
}

// C ref: quest.c expulsion() (185-216). Only `seal` FALSE has a caller here:
// chat_with_leader()'s badalign verdict. The TRUE arm removes the magic portal
// and calls remdun_mapseen(), and is reached from finish_quest() and the
// leader's death, neither of which is ported.
function expulsion(seal, ops) {
    const state = ops.state;
    const u = state.u;
    if (seal) ops.unsupported('sealing the quest branch');
    const portal_flag = u.uevent?.qexpelled ? UTOTYPE_NONE : UTOTYPE_PORTAL;
    const br = dungeon_branch('The Quest', state);
    const dest = (br.end1.dnum === u.uz.dnum) ? br.end2 : br.end1;
    nomul(0, state); /* stop running */
    schedule_goto(dest, portal_flag, null, null, state);
}

// C ref: quest.c chat_with_leader() (281-368). Rule 5's first meeting carries
// the leader_first pager and two of its four verdicts: badalign, which expels
// the hero, and assignquest. Rules 1-4 need finish_quest(),
// fully_identify_obj() and the posthanks/encourage text, and the purity < 0
// arm needs com_pager("banished") and the livelog entry; each refuses here,
// as does badlevel, for the reason its own comment gives.
async function chat_with_leader(mtmp, ops) {
    const state = ops.state;
    const qs = state.svq.quest_status;
    const u = state.u;
    if (!mtmp.mpeaceful || qs.pissed_off)
        return;

    /*  Rule 0: Cheater checks. */
    if (u.uhave.questart && !qs.met_nemesis)
        qs.cheater = true;

    if (qs.got_thanks) {
        /* Rules 1 and 2: you've gone back after the leader's thanks. */
        ops.unsupported('a quest leader who has already given thanks');
    } else if (u.uhave.questart) {
        /* Rule 3: you've got the artifact and are back to return it. */
        ops.unsupported('returning the quest artifact to its leader');
    } else if (qs.got_quest) {
        /* Rule 4: you haven't got the artifact yet. */
        ops.unsupported('a quest leader encouraging the hero');
    } else {
        /* Rule 5: You aren't yet acceptable - or are you? */
        let purity = 0;

        if (!qs.met_leader) {
            await ops.pager('leader_first');
            qs.met_leader = true;
            qs.not_ready = 0;
        } else {
            ops.unsupported('a repeat audience with the quest leader');
        }

        /* the quest leader might have passed through the portal into
           the regular dungeon; none of the remaining make sense there */
        if (!on_level(u.uz, state.qstart_level))
            return;

        if (not_capable(state)) {
            // C: qt_pager("badlevel"), exercise(A_WIS, TRUE), expulsion(FALSE)
            // -- the same three statements as the badalign arm below. It is
            // refused rather than ported because no case reaches it: the quest
            // start level is only reachable in this port through the wizard
            // level teleport, whose recipe raises the hero to level 20 first
            // and so regenerates a different quest level for any lower one.
            ops.unsupported('a quest leader turning away an under-level hero');
        } else if ((purity = await is_pure(true, ops)) < 0) {
            if (!qs.pissed_off)
                ops.unsupported('a quest leader banishing the hero');
        } else if (purity === 0) {
            await ops.pager('badalign');
            qs.not_ready = 1;
            await exercise(A_WIS, true, state, ops.random);
            expulsion(false, ops);
        } else { /* You are worthy! */
            await ops.pager('assignquest');
            await exercise(A_WIS, true, state, ops.random);
            qs.got_quest = true;
            // C follows with livelog_printf(LL_ACHIEVE, ...); the port has no
            // livelog, and nothing the player or the scorer can observe.
        }
    }
}

// C ref: quest.c leader_speaks() (370-391). The !mpeaceful arm delivers
// leader_last, sets pissed_off and clears STRAT_WAITMASK so that the leader
// starts moving; that hostile leader is outside the monster-action boundary,
// so the whole arm refuses rather than half-porting the strategy change.
async function leader_speaks(mtmp, ops) {
    const state = ops.state;
    const qs = state.svq.quest_status;
    if (!mtmp.mpeaceful)
        ops.unsupported('an angry quest leader speaking');
    /* the quest leader might have passed through the portal into the
       regular dungeon; if so, mustn't perform "backwards expulsion" */
    if (!on_level(state.u.uz, state.qstart_level))
        return;
    if (!qs.pissed_off)
        await chat_with_leader(mtmp, ops);
}

// C ref: quest.c quest_chat() (472-492). Only the leader identity arm is
// admitted; nemesis and guardian keep the caller's fail-closed answer.
export async function quest_chat(mtmp, state = game, env = {}) {
    const qs = state.svq?.quest_status;
    if (!qs?.leader_m_id || mtmp.m_id !== qs.leader_m_id)
        return false;
    await chat_with_leader(mtmp, questConversation({ ...env, state }));
    return true;
}

// C ref: quest.c quest_talk() (494-511). monmove.c dochug() calls this for a
// waiting quest monster the hero stands next to. C's `default` is silence, so
// every monster that is neither the leader nor one of the two named msound
// families leaves without speaking.
export async function quest_talk(mtmp, env = {}) {
    const ops = questConversation(env);
    const leaderId = ops.state.svq?.quest_status?.leader_m_id;
    if (leaderId && mtmp.m_id === leaderId) {
        await leader_speaks(mtmp, ops);
        return;
    }
    const msound = mtmp.data?.msound;
    if (msound === MS_NEMESIS)
        ops.unsupported('the quest nemesis speaking');
    if (msound === MS_DJINNI)
        ops.unsupported('a captive quest prisoner speaking');
}

// C ref: quest.c quest_stat_check() (513-518). monmove.c dochug() calls this
// for every monster it moves; only the nemesis writes anything. Qstat(in_battle)
// has no ported reader yet -- quest.c nemesis_speaks() is its only one -- but
// the flag is the nemesis's own per-turn state and belongs with its writer.
export function quest_stat_check(mtmp, state = game) {
    if (mtmp.data?.msound === MS_NEMESIS) {
        state.svq.quest_status.in_battle =
            !helpless(mtmp) && monnear(mtmp, state.u.ux, state.u.uy, state);
    }
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
