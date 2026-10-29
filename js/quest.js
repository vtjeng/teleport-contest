// quest.js -- quest dungeon branch routines.
// C ref: quest.c nemdead(), nemesis_stinks(), onquest(), on_start(), on_locate(),
// on_goal(), not_capable(),
// is_pure(), ok_to_quest(), expulsion(), chat_with_leader(), leader_speaks(),
// quest_chat(), quest_talk(), and quest_stat_check().

import {
    A_CURRENT,
    A_ORIGINAL,
    A_WIS,
    MIN_QUEST_ALIGN,
    MIN_QUEST_LEVEL,
    STRAT_WAITMASK,
    LL_ACHIEVE,
    helpless,
    UTOTYPE_NONE,
    UTOTYPE_PORTAL,
} from './const.js';
import {
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
    FAKE_AMULET_OF_YENDOR,
} from './objects.js';
import { yn_function } from './cmd.js';
import { adjalign, exercise, exercise_nonphysical } from './attrib.js';
import { dungeon_branch, Is_special, on_level } from './dungeon.js';
import { schedule_goto } from './do.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { carrying, fully_identify_obj, update_inventory } from './invent.js';
import { angry_guards, setmangry } from './mon.js';
import { align_str } from './insight.js';
import { monnear } from './monmove.js';
import {
    MS_DJINNI,
    MS_GUARDIAN,
    MS_NEMESIS,
    PM_PRISONER,
} from './monsters.js';
import {
    com_pager,
    is_quest_artifact,
    qt_pager,
    QUEST_PAGER_OUTPUT,
} from './questpgr.js';
import { rn2, rnd } from './rng.js';
import { the, xname } from './objnam.js';
import { Monnam, noit_mon_nam } from './do_name.js';
import { canseemon } from './display.js';
import { ttyPline } from './tty_message.js';
import {
    heroDeaf,
    livelog_printf,
    verbalize,
} from './pline.js';
import { observe_object } from './o_init.js';

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
    const pagerRandom = typeof random === 'function'
        ? random : random.rn2 ?? rn2;
    if (typeof env.unsupported !== 'function')
        throw new TypeError('a quest conversation requires an unsupported operation');
    return {
        ...env,
        state,
        random,
        displayRandom: env.displayRandom,
        unsupported: env.unsupported,
        message: env.message ?? ttyPline,
        yn: env.yn ?? yn_function,
        pager: env.pager ?? ((msgid) => qt_pager(
            msgid, state, pagerRandom, env.output ?? QUEST_PAGER_OUTPUT,
        )),
        commonPager: env.commonPager ?? ((msgid) => com_pager(
            msgid, state, {
                message: env.message ?? ttyPline,
                random: pagerRandom,
            },
        )),
    };
}

// C ref: quest.c artitouch() (125-139). This is the one-time first-touch
// transition from invent.c:addinv_core1(): observe the artifact before the
// pager describes it, set the quest flag before output, then exercise Wisdom
// only after the pager has finished. qt_pager() is async in the port, so the
// first-touch path returns a Promise for addinv_core1() to consume.
export function artitouch(obj, state = game, ops = {}) {
    const qs = state.svq.quest_status;
    if (qs.touched_artifact) return;

    observe_object(obj, state);
    qs.touched_artifact = true;

    const random = ops.random ?? { rn2 };
    const output = ops.output ?? QUEST_PAGER_OUTPUT;
    return Promise.resolve(qt_pager(
        'gotit', state, random.rn2, output,
    )).then(() => {
        exercise_nonphysical(A_WIS, true, state, random);
    });
}

// C ref: quest.c nemdead(). Mark the quest transition before showing its
// pager; m_detach() must not repeat either the state change or the message.
export function nemdead(state = game, ops = {}) {
    const status = state.svq.quest_status;
    if (status.killed_nemesis) return;

    status.killed_nemesis = true;
    const random = ops.random ?? { rn2, rnd };
    const pagerRandom = typeof random === 'function' ? random : random.rn2;
    return qt_pager(
        'killed_nemesis', state, pagerRandom,
        ops.output ?? QUEST_PAGER_OUTPUT,
    );
}

// C ref: quest.c leaddead() (116-122). Record the dead leader once so
// ok_to_quest() can allow the hero to leave the Quest start level. C leaves
// the optional killed_leader pager disabled.
export function leaddead(state = game) {
    const status = state.svq.quest_status;
    if (!status.killed_leader)
        status.killed_leader = true;
}

// C ref: quest.c nemesis_stinks(). The temporary mon_moving value prevents
// the hero from being credited with a cloud produced by the monster death.
// region.create_gas_cloud is async in this port; restore the C state after its
// source effects and message have completed, including on a thrown error.
export async function nemesis_stinks(mx, my, state = game, ops = {}) {
    const context = state.context ?? (state.context = {});
    const saveMonMoving = context.mon_moving;
    context.mon_moving = true;
    try {
        const [
            { create_gas_cloud },
            { block_point, cansee },
            { newsym },
            { ttyPline },
        ] = await Promise.all([
            import('./region.js'),
            import('./vision.js'),
            import('./display.js'),
            import('./tty_message.js'),
        ]);
        await create_gas_cloud(mx, my, 5, 8, {
            ...ops,
            state,
            random: ops.random ?? { rn2, rnd },
            blockPoint: ops.blockPoint
                ?? ((x, y) => block_point(x, y, state)),
            canSee: ops.canSee ?? ((x, y) => cansee(x, y, state)),
            newsym: ops.newsym ?? ((x, y) => newsym(x, y)),
            message: ops.message ?? ((text) => ttyPline(text, state)),
        });
    } finally {
        context.mon_moving = saveMonMoving;
    }
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

    return is_pure_without_talk(state);
}

// C ref: quest.c is_pure(FALSE). The pager's description routine is
// synchronous, so keep this no-prompt branch available to its quest gate.
function is_pure_without_talk(state) {
    const u = state.u;
    const originalAlignment = u.ualignbase[A_ORIGINAL];
    return u.ualign.record >= MIN_QUEST_ALIGN
        && u.ualign.type === originalAlignment
        && u.ualignbase[A_CURRENT] === originalAlignment
        ? 1
        : u.ualignbase[A_CURRENT] !== originalAlignment ? -1 : 0;
}

// C ref: quest.c ok_to_quest() (139-144). External hook for do.c level
// change check: the hero may descend past the quest start level when the
// leader gave the quest and the hero is pure, or the leader is dead.
export function ok_to_quest(state = game) {
    const qs = state.svq.quest_status;
    return ((qs.got_quest || qs.got_thanks)
            && is_pure_without_talk(state) > 0)
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

// C ref: quest.c finish_quest() (226-279). The pager and inventory helpers
// remain owned by questpgr.c and invent.c; env carries their live RNG, output,
// message, and inventory hooks through both dothrow and quest conversation.
export async function finish_quest(obj, env = {}) {
    const state = env.state ?? game;
    const u = state.u;
    const qs = state.svq.quest_status;
    const random = env.random ?? { rn2 };
    const pagerRandom = typeof random === 'function'
        ? random : random.rn2 ?? rn2;
    const message = env.message ?? ttyPline;
    const pager = env.pager ?? ((msgid) => qt_pager(
        msgid, state, pagerRandom, env.output ?? QUEST_PAGER_OUTPUT,
    ));
    const commonPager = env.commonPager ?? ((msgid) => com_pager(
        msgid, state, { message, random: pagerRandom },
    ));
    const identifyObject = env.identifyObject ?? fully_identify_obj;
    const carryingObject = env.carrying ?? carrying;
    const refreshInventory = env.refreshInventory ?? update_inventory;
    const isQuestArtifact = env.isQuestArtifact ?? is_quest_artifact;
    const inventoryEnv = { ...env, state };
    let otmp;

    if (obj && !isQuestArtifact(obj, state)) {
        /* tossed an invocation item (or [fake] Amulet) at the leader */
        if (heroDeaf(state)) return;
        identifyObject(obj, state);
        if (obj.otyp === AMULET_OF_YENDOR) {
            await pager('hasamulet');
        } else if (obj.otyp === FAKE_AMULET_OF_YENDOR) {
            await verbalize(
                'Sorry to say, this is a mere imitation of the true Amulet of Yendor.',
                state,
                { message },
            );
        } else {
            await verbalize(
                `Ah, I see you've found ${the(xname(obj, state), state)}.`,
                state,
                { message },
            );
        }
        return;
    }

    if (u.uhave.amulet) {
        await pager('hasamulet');
        otmp = carryingObject(AMULET_OF_YENDOR, state);
        if (otmp) {
            identifyObject(otmp, state);
            refreshInventory(inventoryEnv);
        }
    } else {
        await pager(qs.got_thanks ? 'offeredit2' : 'offeredit');
        if (!carryingObject(BELL_OF_OPENING, state))
            await commonPager('quest_complete_no_bell');
    }
    qs.got_thanks = true;

    if (obj) {
        u.uevent.qcompleted = 1;
        identifyObject(obj, state);
        refreshInventory(inventoryEnv);
    }
}

// C ref: quest.c chat_with_leader() (281-368). Rules 1 and 3 now wire the
// complete finish_quest() owner. The posthanks/encourage text and the remaining
// first-meeting verdicts retain their existing bounded refusals.
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
        if (u.uhave.amulet)
            await finish_quest(null, ops);
        else
            ops.unsupported('returning the quest artifact before the Amulet');
    } else if (u.uhave.questart) {
        /* Rule 3: you've got the artifact and are back to return it. */
        let otmp = state.invent;
        while (otmp && !is_quest_artifact(otmp, state))
            otmp = otmp.nobj;
        await finish_quest(otmp, ops);
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
            await ops.pager('badlevel');
            await exercise(A_WIS, true, state, ops.random);
            expulsion(false, ops);
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
            // C's first assignment records the leader's source-owned name in
            // the chronicle after the assignment state change. Thread the
            // conversation environment through noit_mon_nam() so a planning
            // caller retains its private display/random owners.
            livelog_printf(
                LL_ACHIEVE,
                `${noit_mon_nam(mtmp, state, ops)} has granted access `
                    + 'to proceed deeper into the quest',
                state,
            );
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

// C ref: quest.c chat_with_nemesis() (394-400). C displays the pager first,
// then sets met_nemesis only when this is the first #chat with the nemesis.
async function chat_with_nemesis(ops) {
    const qs = ops.state.svq.quest_status;
    await ops.pager('discourage');
    if (!qs.met_nemesis) qs.met_nemesis = true;
}

// C ref: quest.c chat_with_guardian() (441-448). The artifact and killed
// flags select the guardian's after-dialogue; all other states use before.
async function chat_with_guardian(ops) {
    const { state } = ops;
    const qs = state.svq.quest_status;
    const msgid = state.u.uhave.questart && qs.killed_nemesis
        ? 'guardtalk_after' : 'guardtalk_before';
    await ops.pager(msgid);
}

// C ref: quest.c quest_chat() (472-492). The leader remains identified by its
// persistent m_id; the remaining supported quest voices dispatch by msound.
export async function quest_chat(mtmp, state = game, env = {}) {
    const qs = state.svq?.quest_status;
    if (qs?.leader_m_id && mtmp.m_id === qs.leader_m_id) {
        const ops = questConversation({ ...env, state });
        await chat_with_leader(mtmp, ops);
        if (qs.pissed_off) await setmangry(mtmp, false, { ...env, state });
        return true;
    }

    const ops = questConversation({ ...env, state });
    if (mtmp.data?.msound === MS_NEMESIS) {
        await chat_with_nemesis(ops);
        return true;
    }
    if (mtmp.data?.msound === MS_GUARDIAN) {
        await chat_with_guardian(ops);
        return true;
    }
    return false;
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
        await nemesis_speaks(ops);
    if (msound === MS_DJINNI)
        await prisoner_speaks(mtmp, ops);
}

// C ref: quest.c prisoner_speaks() (451-468), called by quest_talk() for
// MS_DJINNI. The prisoner loses its waiting strategy and becomes peaceful
// only after the visible speech and alignment side effect have run.
async function prisoner_speaks(mtmp, ops) {
    const { state } = ops;
    if (mtmp.data !== state.mons?.[PM_PRISONER]
        || !(mtmp.mstrategy & STRAT_WAITMASK)) return;

    if (canseemon(mtmp, state))
        await ops.message(`${Monnam(mtmp, state, ops)} speaks:`, state);
    // include/sndprocs.h compiles SetVoice() to an empty macro in the
    // recorder's no-sound build.
    await verbalize("I'm finally free!", state, { message: ops.message });
    mtmp.mstrategy &= ~STRAT_WAITMASK;
    mtmp.mpeaceful = true;
    adjalign(3, state);
    await angry_guards(false, { ...ops, state });
}

// C ref: quest.c nemesis_speaks() (403-422). The battle flag was set earlier
// by quest_stat_check() in monmove.c:714. C pages first, then updates the
// persistent made_goal/met_nemesis state; in battle it has only a 1-in-5
// chance to page the random discouragement.
async function nemesis_speaks(ops) {
    const qs = ops.state.svq.quest_status;
    const madeGoal = qs.made_goal ?? 0;
    const random = typeof ops.random === 'function'
        ? ops.random : ops.random?.rn2 ?? rn2;
    if (!qs.in_battle) {
        let msgid;
        if (ops.state.u.uhave.questart)
            msgid = 'nemesis_wantsit';
        else if (madeGoal === 1 || !qs.met_nemesis)
            msgid = 'nemesis_first';
        else if (madeGoal < 4)
            msgid = 'nemesis_next';
        else if (madeGoal < 7)
            msgid = 'nemesis_other';
        else if (!random(5))
            msgid = 'discourage';
        if (msgid) await ops.pager(msgid);
        if (madeGoal < 7) qs.made_goal = madeGoal + 1;
        qs.met_nemesis = true;
    } else if (!random(5)) {
        await ops.pager('discourage');
    }
}

// C ref: quest.c quest_stat_check() (513-518). monmove.c dochug() calls this
// for every monster it moves; only the nemesis writes anything. The flag is
// read by nemesis_speaks() later in that same monster turn.
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
// C ref: questpgr.c find_qarti() and find_quest_artifact() for the chains
// selected by quest.c:on_goal(). Hero inventory is deliberately excluded.
function findGoalArtifact(chain, artifact) {
    for (let obj = chain; obj; obj = obj.nobj) {
        if (obj.oartifact === artifact) return obj;
        const contained = findGoalArtifact(obj.cobj, artifact);
        if (contained) return contained;
    }
    return null;
}

function questArtifactOnGoalLevel(state) {
    const artifact = state.urole.questarti;
    let found = findGoalArtifact(state.level.objlist, artifact);
    if (found) return found;
    for (let mon = state.level.monlist; mon; mon = mon.nmon) {
        if (mon.mhp < 1) continue; // C: DEADMONSTER()
        found = findGoalArtifact(mon.minvent, artifact);
        if (found) return found;
    }
    return findGoalArtifact(state.level.buriedobjlist, artifact);
}

async function on_goal(state) {
    const qs = state.svq.quest_status;

    if (qs.killed_nemesis) {
        return;
    } else if (!qs.made_goal) {
        await qt_pager('goal_first', state);
        qs.made_goal = 1;
    } else {
        // qt_pager falls back to goal_next for roles without goal_alt.
        await qt_pager(questArtifactOnGoalLevel(state)
            ? 'goal_next' : 'goal_alt', state);
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
