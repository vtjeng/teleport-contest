// end.js -- the end of the game.
// C ref: src/end.c.
//
// done() is the funnel every death, quit, escape and ascension passes
// through. Its head is ported: the forced status update, the killer-format
// defaults, the mortality count and the hit-point force, the wizard-and-
// explore-mode query at 1112 that asks whether the hero really dies, and
// the survive path (1113-1122) that calls savelife() and returns when the
// player declines death. The life-saving amulet's earlier reprieve remains
// refused. really_done() covers the mounted-slip prefix through cleanup, time
// bookkeeping, the bones decision, inventory identification, and the first
// disclosure prompt; later disclosure answers, tombstone, bones creation, and
// the score file remain refused, in that source order.
//
// savelife() (end.c:704-756) restores the hero to a viable state after the
// death is declined in wizard or explore mode. Three of its branches remain
// refused: endmultishot() (not ported), expels() (not ported), and
// make_sick() (not ported).
//
// done_in_by() (end.c:185-344) sets up the killer string from a monster
// that dealt lethal damage and calls done(). losehp()'s death branch in
// hack.js is the other path into done(), one statement after
// urgent_pline("You die..."), so a segment that runs out of input at the
// query ends on the "Die? [yn] (n)" this file draws.

// js/cmd.js imports UnsupportedEndOfGameError back from this file. Both cycle
// edges are safe because their imported bindings are read only inside
// functions, after module initialization; neither belongs in a module-scope
// value initializer while the cycle remains.
import { effective_attribute, minuhpmax, setuhpmax } from './attrib.js';
import { getnow, midnight, night } from './calendar.js';
import { can_make_bones } from './bones.js';
import { paranoid_query, yn_function } from './cmd.js';
import {
    A_CON,
    ASCENDED,
    BURNING,
    CHOKING,
    DIED,
    DISCLOSE_NO_WITHOUT_PROMPT,
    DISCLOSE_PROMPT_DEFAULT_NO,
    DISCLOSE_PROMPT_DEFAULT_SPECIAL,
    DISCLOSE_PROMPT_DEFAULT_YES,
    DISCLOSE_SPECIAL_WITHOUT_PROMPT,
    DISCLOSE_YES_WITHOUT_PROMPT,
    G_GENOD,
    GENOCIDED,
    KILLED_BY,
    KILLED_BY_AN,
    LIFESAVED,
    M_AP_MONSTER,
    M_AP_TYPE,
    NO_KILLER_PREFIX,
    PANICKED,
    PARANOID_DIE,
    PLNMSG_OK_DONT_DIE,
    QUIT,
    SICK,
    SORTLOOT_LOOT,
    SORTLOOT_PACK,
    STARVING,
    STONING,
    TIMEOUT,
    TRICKED,
    TT_LAVA,
    UNCHANGING,
    Upolyd,
    has_ebones,
    has_mgivenname,
    ismnum,
    MGIVENNAME,
    NON_PM,
} from './const.js';
import { bot } from './display.js';
import { pmname } from './do_name.js';
import { game } from './gstate.js';
import { curs_on_u } from './hack.js';
import { zombie_maker } from './mon.js';
import { gender, is_vampshifter, type_is_pname } from './mondata.js';
import {
    G_UNIQ,
    PM_GHOST,
    PM_GHOUL,
    PM_HIGH_CLERIC,
    PM_HUMAN,
    PM_TOURIST,
    PM_VAMPIRE,
    PM_WRAITH,
    S_MUMMY,
    S_VAMPIRE,
    S_WRAITH,
} from './monsters.js';
import { upstart } from './hacklib.js';
import { sortloot, update_inventory } from './invent.js';
import { isContainer } from './obj.js';
import { discover_object } from './o_init.js';
import { BAG_OF_TRICKS, LARGE_BOX, STATUE, TIN } from './objects.js';
import {
    an, donameFresh, the, thesimpleoname, the_unique_pm, xnameFresh,
} from './objnam.js';
import { displayTtyMenuTextWindow } from './tty_menu.js';
import { canSpotMonster } from './startup_a11y.js';
import { reset_utrap } from './trap.js';
import { ttyPline, ttyUrgentPline } from './tty_message.js';
import { init_uhunger } from './u_init.js';

export class UnsupportedEndOfGameError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedEndOfGameError';
    }
}

// C ref: end.c deaths[] (44-50), "the array of death". Its index is a
// game_end_types value, so the rows are in include/hack.h:483-498 order.
// done() copies a row into svk.killer.name only when the caller named no
// killer of its own; really_done():1287 reads the same table for the
// tombstone.
//
// Exported for scripts/hero-death.test.mjs alone, which reads the C
// initializer back and compares it row for row: done() reaches only the rows
// its ported caller can ask for, so nothing else would pin the other fifteen.
export const deaths = Object.freeze([
    'died', 'choked', 'poisoned', 'starvation', 'drowning', 'burning',
    'dissolving under the heat and pressure', 'crushed', 'turned to stone',
    'turned into slime', 'genocided', 'panic', 'trickery', 'quit',
    'escaped', 'ascended',
]);

// C ref: youprop.h:387 Lifesaved, the extrinsic alone. The amulet of life
// saving is the only item that confers it. No ported command can put that
// amulet on: it uses do_wear.c doputon(), and js/cmd.js dispatches no command
// row to that handler. Lifesaved is therefore FALSE in every reachable game.
function Lifesaved(state) {
    return Boolean(state.u?.uprops?.[LIFESAVED]?.extrinsic);
}

// C ref: flag.h:560 ParanoidDie, over flag.h:85 PARANOID_DIE.
//
// options.c initoptions_init():7173 leaves PARANOID_DIE out of the startup
// flags.paranoia_bits, and optfn_paranoid_confirmation() writes every startup
// setting into that same field. done() calls this as a preflight before its
// first output or mutation whenever its supported path can reach the query.
function ParanoidDie(state) {
    return (state.flags.paranoia_bits & PARANOID_DIE) !== 0;
}

// C ref: end.c savelife() (704-756). Restores the hero to a viable state
// after being killed, when wizard or explore mode lets the player decline
// death (or when the amulet of life saving fires, which is not yet ported).
//
// Three branches remain refused because their targets are not ported:
//   endmultishot(FALSE)  -- only when !context.mon_moving (hero turn)
//   expels()             -- only when u.uswallow (hero is engulfed)
//   make_sick(0L, ...)   -- only when (Sick & TIMEOUT) == 1L (one-turn sick)
// seed5002's death occurs on a monster turn (context.mon_moving is true), the
// hero is not polymorphed, not swallowed, not stuck, not in a lava trap, and
// not sick, so all three branches are unreachable for that session.
//
// js/hack.js imports done() from this file; this file imports curs_on_u()
// from js/hack.js. Both bindings are consumed only inside function bodies,
// so the cycle resolves.
async function savelife(how, state = game) {
    const u = state.u;

    // life-drain/level-loss to experience level 0 kills without actually
    // reducing ulevel below 1, but include this for bulletproofing
    if (u.ulevel < 1) u.ulevel = 1;

    const uhpmin = minuhpmax(10, state);
    if (u.uhpmax < uhpmin) setuhpmax(uhpmin, true, state);

    // ACURR(A_CON) is effective_attribute(state, A_CON)
    const givehp = 50 + 10 * Math.trunc(effective_attribute(state, A_CON) / 2);
    u.uhp = Math.min(u.uhpmax, givehp);

    if (Upolyd(u)) // Unchanging, or death which bypasses losing hit points
        u.mh = Math.min(u.mhmax, givehp);

    if (u.uhunger < 500 || how === CHOKING)
        init_uhunger(state);

    // cure impending doom of sickness hero won't have time to fix
    // C ref: Sick is u.uprops[SICK].intrinsic; TIMEOUT is 0x00FFFFFF.
    if (((u.uprops?.[SICK]?.intrinsic ?? 0) & TIMEOUT) === 1) {
        // make_sick() lives in eat.c and is not ported.
        throw new UnsupportedEndOfGameError(
            'savelife() needs make_sick() for one-turn sickness cure',
        );
    }

    state.nomovemsg = 'You survived that attempt on your life.';
    state.context.move = 0;

    state.multi = -1; // can't move again during the current turn
    // in case being life-saved is immediately followed by being killed again
    state.multi_reason = state.urole?.mnum === PM_TOURIST
        ? 'being toyed with by Fate'
        : 'attempting to cheat Death';

    if (u.utrap && u.utraptype === TT_LAVA)
        reset_utrap(false, state);

    state.disp.botl = true;
    u.ugrave_arise = NON_PM;
    // HUnchanging = 0L: clear the intrinsic half of the Unchanging property
    u.uprops[UNCHANGING].intrinsic = 0;

    await curs_on_u(state);

    if (!state.context.mon_moving) {
        // endmultishot() stops a multi-shot action in progress. It is not
        // ported; this path fires only on the hero's own turn.
        throw new UnsupportedEndOfGameError(
            'savelife() needs endmultishot() on the hero turn',
        );
    }
    if (u.uswallow) {
        // might drop hero onto a trap that kills her all over again
        throw new UnsupportedEndOfGameError(
            'savelife() needs expels() while hero is engulfed',
        );
    } else if (u.ustuck) {
        // C prints a release message and calls unstuck(). Both message
        // branches need unported formatters (mon_nam, Monnam, sticks), so
        // the whole arm is refused.
        throw new UnsupportedEndOfGameError(
            'savelife() needs mon_nam()/Monnam() for stuck monster release',
        );
    }
}

// C ref: end.c done_in_by() (185-344). Sets up the killer string from the
// monster that dealt lethal damage and calls done(how). The name is built
// from the monster's permonst data, with special handling for shapechangers,
// ghosts, shopkeepers, priests, and minions. monhealthdescr() is behind
// #if 0 in C (pager.c:140) and returns the empty string; skipped here.
// mark_synch() is tty_mark_synch(), an fflush() with no JS counterpart.
//
// Unported branches that throw UnsupportedEndOfGameError: shopkeepers (need
// shkname from shk.c) and priests/minions (need m_monnam from do_name.c).
// Every other branch is ported, including the imitator/shapechanger path,
// ghosts with given names, the multi_reason fixup, and ugrave_arise.
export async function done_in_by(mtmp, how, state = game) {
    const mons = state.mons;
    const mptr = mtmp.data;
    const champtr = ismnum(mtmp.cham) ? mons[mtmp.cham] : mptr;
    // C ref: display.h:129 canspotmon(). Hallucination is youprop.h:116-120:
    // the intrinsic timeout defeated by either half of Halluc_resistance.
    const hallucinating = Boolean(
        state.u?.uprops?.[23]?.intrinsic  // HALLUC = 23
        && !(state.u?.uprops?.[24]?.intrinsic  // HALLUC_RES = 24
            || state.u?.uprops?.[24]?.extrinsic),
    );
    const distorted = hallucinating && canSpotMonster(mtmp, state);
    const mimicker = M_AP_TYPE(mtmp) === M_AP_MONSTER;
    const imitator = mptr !== champtr || mimicker;

    await ttyUrgentPline(
        how === STONING ? 'You turn to stone...' : 'You die...',
        state,
    );
    // mark_synch() -- no JS counterpart (fflush of buffered screen output).

    let buf = '';
    state.killer ??= {};
    state.killer.format = KILLED_BY_AN;

    // "killed by the high priest of Crom" is OK,
    // "killed by the high priest" alone is not.
    let effectiveMptr = mptr;
    if ((mptr.geno & G_UNIQ) !== 0 && !(imitator && !mimicker)
        && !(mptr === mons[PM_HIGH_CLERIC] && !mtmp.ispriest)) {
        if (!type_is_pname(mptr))
            buf += 'the ';
        state.killer.format = KILLED_BY;
    }
    // _the_ <invisible> <distorted> ghost of Dudley
    if (mptr === mons[PM_GHOST] && has_mgivenname(mtmp)) {
        buf += 'the ';
        state.killer.format = KILLED_BY;
    }
    // monhealthdescr() is behind #if 0 in C -- returns empty string.
    if (mtmp.minvis)
        buf += 'invisible ';
    if (distorted)
        buf += 'hallucinogen-distorted ';

    if (imitator) {
        const realnm = pmname(champtr, gender(mtmp));
        let fakenm = pmname(mptr, gender(mtmp));
        const alt = is_vampshifter(mtmp);

        if (mimicker) {
            // realnm is already correct because champtr===mptr;
            // set up fake mptr for type_is_pname/the_unique_pm.
            effectiveMptr = mons[mtmp.mappearance];
            fakenm = pmname(effectiveMptr, gender(mtmp));
        } else if (alt && realnm.toLowerCase().includes('vampire')
                   && fakenm === 'vampire bat') {
            // Special case: use "vampire in bat form" in preference
            // to redundant looking "vampire in vampire bat form".
            fakenm = 'bat';
        }
        let shape;
        if (alt || type_is_pname(effectiveMptr)) {
            shape = fakenm;
        } else if (the_unique_pm(effectiveMptr)) {
            shape = `the ${fakenm}`;
        } else {
            shape = an(fakenm);
        }
        if (alt) {
            buf += `${realnm} in ${shape} form`;
        } else if (mimicker) {
            buf += `${realnm} disguised as ${shape}`;
        } else {
            buf += `${realnm} imitating ${shape}`;
        }
        // mptr is not reassigned here; effectiveMptr was used for the
        // article lookup and is no longer needed.
    } else if (mptr === mons[PM_GHOST]) {
        buf += 'ghost';
        if (has_mgivenname(mtmp))
            buf += ` of ${MGIVENNAME(mtmp)}`;
    } else if (mtmp.isshk) {
        // shkname() and shkname_is_pname() live in shk.c, which is not
        // ported. No ported monster-creation path sets isshk.
        throw new UnsupportedEndOfGameError(
            'done_in_by() for a shopkeeper (needs shkname from shk.c)',
        );
    } else if (mtmp.ispriest || mtmp.isminion) {
        // m_monnam() lives in do_name.c and handles "invisible" and
        // Hallucination overrides for priests and minions. Not ported.
        throw new UnsupportedEndOfGameError(
            'done_in_by() for a priest or minion (needs m_monnam from do_name.c)',
        );
    } else {
        buf += pmname(mptr, gender(mtmp));
        if (has_mgivenname(mtmp)) {
            buf += ` ${has_ebones(mtmp) ? 'of' : 'called'} ${MGIVENNAME(mtmp)}`;
        }
    }

    state.killer.name = buf;

    // Might need to fix up multi_reason if mtmp caused the reason.
    // C ref: end.c:287-314. gm.multi_reason points into gm.multireasonbuf
    // past an "id:reason" prefix. When the killer matches the id, the
    // reason is truncated at its first space to avoid "Killed by a ghoul,
    // while paralyzed by a ghoul."
    if (state.gm?.multi_reason
        && state.gm.multireasonbuf
        && state.gm.multi_reason !== state.gm.multireasonbuf) {
        const colonIndex = state.gm.multireasonbuf.indexOf(':');
        if (colonIndex > 0) {
            const idStr = state.gm.multireasonbuf.substring(0, colonIndex);
            const reasonmid = parseInt(idStr, 10);
            if (!isNaN(reasonmid) && mtmp.m_id === reasonmid) {
                const spaceIndex = state.gm.multi_reason.indexOf(' ');
                if (spaceIndex >= 0) {
                    state.gm.multi_reason =
                        state.gm.multi_reason.substring(0, spaceIndex);
                }
            }
        }
    }

    // Undead transformation: ugrave_arise.
    // C ref: end.c:326-340.
    if (mptr.mlet === S_WRAITH)
        state.u.ugrave_arise = PM_WRAITH;
    else if (mptr.mlet === S_MUMMY
        && state.urace?.mummynum !== undefined
        && state.urace.mummynum !== NON_PM)
        state.u.ugrave_arise = state.urace.mummynum;
    else if (zombie_maker(mtmp)
        && state.urace?.zombienum !== undefined
        && state.urace.zombienum !== NON_PM)
        state.u.ugrave_arise = state.urace.zombienum;
    else if (mptr.mlet === S_VAMPIRE
        && state.urace?.mnum === PM_HUMAN)
        state.u.ugrave_arise = PM_VAMPIRE;
    else if (mptr === mons[PM_GHOUL])
        state.u.ugrave_arise = PM_GHOUL;

    // This could happen if a high-end vampire kills the hero when ordinary
    // vampires are genocided; ditto for wraiths.
    if (state.u.ugrave_arise >= 0  // LOW_PM = 0
        && (state.mvitals?.[state.u.ugrave_arise]?.mvflags & G_GENOD))
        state.u.ugrave_arise = NON_PM;

    await done(how, state);
}

// C ref: end.c done() (1019-1126), "Be careful not to call panic from here!".
//
// `how` is a game_end_types value. Before calling, a direct caller must ensure
// state.killer exists; use { name: '', format: KILLED_BY_AN } when C supplied
// no killer, or preserve the source-supplied name and format. done() applies
// the deaths[] name and format defaults below.
//
// C's `boolean survive` variable at 1048 tracks whether savelife() ran. The
// port inlines the survive path: the query's "no" arm at 1113-1116 calls
// savelife(), clears the killer at 1120-1121, and returns. The life-saving
// amulet's arm at 1082-1103 still throws, so it cannot set survive.
//
// gd.done_seq is not carried either. C maintains it at 1053-1054 for exactly
// two readers: fuzzer_savelife(), which the debug_fuzzer guard below refuses,
// and the hangup term at 1110, which the done_hup refusal below stands in
// for. Storing a counter no ported line reads would be a second home for a
// value the port cannot yet spend.
//
// When the player declines death in wizard or explore mode, done() calls
// savelife() and returns normally. When the player accepts death or there is
// no query, done() throws UnsupportedEndOfGameError at really_done().
export async function done(how, state = game) {
    if (how === TRICKED) {
        // 1024-1034. The arm paniclogs the killer and, in wizard mode, prints
        // "You are a very tricky wizard, it seems." and returns without
        // ending the game. paniclog() writes a file, which game code may not
        // do, so the port stops here rather than guessing at the log.
        // Nothing reaches it today: losehp() is the only ported caller and it
        // passes DIED.
        throw new UnsupportedEndOfGameError('done(TRICKED) needs paniclog()');
    }
    const killer = state.killer;
    const programState = state.program_state;

    // paranoid_ynq()'s spelled-out input arm can return to done() through a
    // declined death and savelife(). Detect it before the status paint and
    // death-state prefix below. The other exclusions are the branches that
    // stop before end.c:1105 in this port, so they retain their own refusal.
    if (!state.iflags.debug_fuzzer
        && !Lifesaved(state)
        && (state.wizard || state.discover)
        && how <= GENOCIDED
        && !programState?.done_hup) {
        if (ParanoidDie(state)) {
            throw new UnsupportedEndOfGameError(
                'paranoid_ynq() reading "yes" or "no" for ParanoidDie',
            );
        }
    }
    if (programState?.panicking
        || programState?.done_hup
        || (how === QUIT && programState?.stopprint)) {
        /* skip status update if panicking or disconnected
           or answer of 'q' to "Really quit?" */
        state.disp.botl = false;
        state.disp.botlx = false;
        state.disp.time_botl = false;
    } else {
        /* otherwise force full status update */
        state.disp.botlx = true;
        // js/display.js bot() paints the module-level `game` rather than the
        // `state` this function carries, which is safe only because every
        // caller runs on the hero's own turn. js/hack.js:718-725 states the
        // seam: js/unported_monster_actions.js runs each monster turn twice,
        // once against a clone, and a write that reached the live terminal
        // from the clone would paint a turn that has not happened. hack.c
        // losehp() is not on that path.
        await bot();
    }

    if (state.iflags.debug_fuzzer) {
        // 1056-1059. fuzzer_savelife() rebuilds the level and keeps the
        // fuzzer playing; gd.done_seq, which it reads, has no port. Only
        // earlyarg.c's command-line switch raises iflags.fuzzerpending, and
        // runSegment() supplies no command line, so nothing reaches this.
        throw new UnsupportedEndOfGameError('fuzzer_savelife()');
    }

    if (how === ASCENDED || (!killer.name && how === GENOCIDED))
        killer.format = NO_KILLER_PREFIX;
    /* Avoid killed by "a" burning or "a" starvation */
    if (!killer.name && (how === STARVING || how === BURNING))
        killer.format = KILLED_BY;
    if (!killer.name || how >= PANICKED)
        killer.name = deaths[how];

    if (how < PANICKED) {
        state.u.umortality++;
        /* in case caller hasn't already done this */
        if (state.u.uhp !== 0 || (Upolyd(state.u) && state.u.mh !== 0)) {
            /* force HP to zero in case it is still positive (some
               deaths aren't triggered by loss of hit points), or
               negative (-1 is used as a flag in some circumstances
               which don't apply when actually dying due to HP loss) */
            state.u.uhp = 0;
            state.u.mh = 0;
            state.disp.botl = true;
        }
    }
    if (Lifesaved(state) && how <= GENOCIDED) {
        // 1082-1103. "But wait...", the medallion's four lines, useup() of
        // the amulet, adjattrib(A_CON, -1) and savelife(), then either the
        // still-genocided line or livelog_printf(LL_LIFESAVE).
        throw new UnsupportedEndOfGameError('the amulet of life saving');
    }
    /* explore and wizard modes offer player the option to keep playing */
    if ((state.wizard || state.discover) && how <= GENOCIDED) {
        if (state.program_state?.done_hup) {
            // The HANGUPHANDLING term at 1110. Its right conjunct spends
            // gd.done_seq, which has no port; C evaluates it only for a
            // hung-up game, and nothing in this port hangs up.
            throw new UnsupportedEndOfGameError(
                'gd.done_seq for a hung-up game',
            );
        }
        // Reaching this point means the preflight evaluated ParanoidDie(state)
        // as false; every path that skipped that evaluation refused before
        // this call. The supported query therefore uses the single-key arm.
        // Porting a life-saving path through here must revise that proof and
        // pass the live bit without moving the refusal below observable work.
        if (!await paranoid_query(false, 'Die?', state)) {
            // 1113-1116. "OK, so you don't die/choke.", PLNMSG_OK_DONT_DIE,
            // savelife(), then the survive return path at 1119-1122.
            await ttyPline(
                `OK, so you don't ${how === CHOKING ? 'choke' : 'die'}.`,
                state,
            );
            state.iflags.last_msg = PLNMSG_OK_DONT_DIE;
            await savelife(how, state);
            // survive path: clear the killer and return to the move loop.
            killer.name = '';
            killer.format = KILLED_BY_AN; // reset to 0
            return;
        }
    }
    if (how === DIED
        && killer.name === 'slipped while mounting a saddled pony'
        && killer.format === NO_KILLER_PREFIX) {
        await really_done(how, state);
        return;
    }
    throw new UnsupportedEndOfGameError(
        `really_done(${how}) for killer "${killer.name ?? ''}"`
        + ` in format ${killer.format}`,
    );
}

const DISCLOSURE_OPTIONS = 'iavgco';
const DEFAULT_END_DISCLOSE = 'nnnnnn';

// C ref: end.c should_query_disclose_option() (475-515). The ordinary death
// slice reaches category 'i' with the startup default. Other configured
// values remain refused because they can skip or alter the disclosure flow.
function should_query_disclose_option(category, state) {
    const index = DISCLOSURE_OPTIONS.indexOf(category);
    if (index < 0) {
        throw new UnsupportedEndOfGameError(
            `should_query_disclose_option() category ${category}`,
        );
    }
    const disclose = state.flags.end_disclose[index];
    if (disclose !== DISCLOSE_PROMPT_DEFAULT_NO) {
        const recognized = [
            DISCLOSE_PROMPT_DEFAULT_YES,
            DISCLOSE_PROMPT_DEFAULT_SPECIAL,
            DISCLOSE_YES_WITHOUT_PROMPT,
            DISCLOSE_SPECIAL_WITHOUT_PROMPT,
            DISCLOSE_NO_WITHOUT_PROMPT,
        ].includes(disclose);
        throw new UnsupportedEndOfGameError(
            recognized
                ? 'nondefault disclosure options'
                : `invalid disclosure option ${String(disclose)}`,
        );
    }
    return { ask: true, defquery: 'n' };
}

// C ref: end.c disclose() (619-699), through the first inventory question.
// Every answer and every later category remain behind yn_function()'s
// unsupported CQ_REPEAT write. A replay with no answer stops on the prompt.
async function disclose(how, taken, state) {
    if (!state.invent || state.program_state.stopprint) {
        throw new UnsupportedEndOfGameError(
            'disclose() without the ordinary inventory question',
        );
    }
    if (taken) {
        throw new UnsupportedEndOfGameError(
            'disclose() after a shopkeeper takes the inventory',
        );
    }
    const { ask, defquery } = should_query_disclose_option('i', state);
    if (!ask) {
        throw new UnsupportedEndOfGameError(
            'disclose() without the possessions prompt',
        );
    }
    await yn_function(
        'Do you want your possessions identified?',
        'ynq',
        defquery,
        true,
        state,
    );
    throw new UnsupportedEndOfGameError(
        `disclose(${how}) after the possessions answer`,
    );
}

function hasEndCleanupMonster(state) {
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.isshk || monster.isgd || monster.ispriest) return true;
    }
    return false;
}

function done_object_cleanup(state) {
    for (let obj = state.invent; obj; obj = obj.nobj) {
        if (obj.in_use) {
            throw new UnsupportedEndOfGameError(
                'done_object_cleanup() with an active inventory object',
            );
        }
    }
    if (state.gt?.thrownobj || state.thrownobj
        || state.gk?.kickedobj || state.kickedobj
        || state.uchain || state.uball) {
        throw new UnsupportedEndOfGameError(
            'done_object_cleanup() with an object in transit or punishment',
        );
    }
    // perm_invent_toggled(TRUE) destroys the persistent inventory window.
    // The port has no such window; its corresponding state is this flag.
    state.iflags.perm_invent = false;
}

function identifyInventoryForDisclosure(state) {
    for (let obj = state.invent; obj; obj = obj.nobj) {
        discover_object(obj.otyp, true, true, false, state);
        obj.known = obj.bknown = obj.dknown = obj.rknown = 1;
        if (isContainer(obj) || obj.otyp === STATUE)
            obj.cknown = obj.lknown = 1;
        else if (obj.otyp === TIN)
            obj.cknown = 1;
        if (obj.otyp === LARGE_BOX && obj.spe === 1) {
            throw new UnsupportedEndOfGameError(
                "really_done() with Schroedinger's box",
            );
        }
    }
}

// C ref: end.c really_done() (1130-1280), through disclose()'s first prompt.
// This is the ordinary mounted-slip arm only. Every branch named by a guard
// below remains fail-closed at the point C would enter it.
async function really_done(how, state) {
    const programState = state.program_state;
    programState.gameover = 1;
    // JS can unwind an exhausted replay queue out of this still-running C
    // function. jsmain uses the marker to avoid treating that suspension as
    // nh_terminate(), whose final recorder capture has not happened yet.
    programState.in_really_done = true;
    programState.something_worth_saving = 0;
    if (programState.done_hup) {
        throw new UnsupportedEndOfGameError('really_done() after hangup');
    }
    state.iflags.vision_inited = false;

    if (programState.panicking) {
        throw new UnsupportedEndOfGameError('really_done() while panicking');
    }
    done_object_cleanup(state);

    const endtime = getnow(state);
    state.urealtime.finish_time = endtime;
    state.urealtime.realtime += endtime - state.urealtime.start_timing;
    state.iflags.at_night = night(state);
    state.iflags.at_midnight = midnight(state);

    if ((state.u.uachieved?.[0] || !state.flags.beginner)
        && (state.u.uroleplay?.blind || state.u.uroleplay?.nudist)) {
        throw new UnsupportedEndOfGameError(
            'really_done() final achievement tracking',
        );
    }
    if (state.moves <= 1) {
        throw new UnsupportedEndOfGameError(
            'really_done() first-move death message',
        );
    }

    const bonesOk = can_make_bones(state);
    if (bonesOk) {
        throw new UnsupportedEndOfGameError(
            'really_done() positive bones creation',
        );
    }
    if (how !== DIED || state.u.ugrave_arise !== NON_PM) {
        throw new UnsupportedEndOfGameError(
            'really_done() special death or grave-arise state',
        );
    }
    if (hasEndCleanupMonster(state)) {
        throw new UnsupportedEndOfGameError(
            'really_done() shopkeeper, guard, or priest cleanup',
        );
    }

    // paybill() initializes the repository record even when no shopkeeper is
    // present, then returns FALSE. paygd(), clearpriests(), and clearlocks()
    // have no state to change on this D:1 path.
    state.gr ??= {};
    state.gr.repo = { location: { x: 0, y: 0 }, shopkeeper: null };
    const taken = false;

    identifyInventoryForDisclosure(state);
    if (state.flags.end_disclose.join('') !== DEFAULT_END_DISCLOSE) {
        throw new UnsupportedEndOfGameError('nondefault disclosure options');
    }
    await disclose(how, taken, state);
}

// C ref: end.c container_contents() (1594-1670). Creates a NHW_MENU text
// window listing the contents of a container. For the use_container() ':'
// path, `identified` is FALSE and `all_containers` is FALSE; those branches
// are the only ones this slice supports.
//
// The C version iterates `list->nobj` when `all_containers` is TRUE, recursing
// into nested containers. This port treats `list` as a single container.
//
// SchroedingersBox is treated as false for ordinary containers (spe !== 1 or
// otyp !== LARGE_BOX), which matches every reachable case. The identified
// branch that calls discover_object is not reached because every caller in
// this slice passes identified=FALSE.
export async function container_contents(
    box, identified, all_containers, reportempty, state = game,
) {
    if (identified) {
        throw new UnsupportedEndOfGameError(
            'container_contents() with identified=TRUE',
        );
    }
    if (all_containers) {
        throw new UnsupportedEndOfGameError(
            'container_contents() with all_containers=TRUE',
        );
    }
    // C: Is_container(box) || box->otyp == STATUE
    if (!isContainer(box) && box.otyp !== STATUE) return;

    if (!box.cknown || (identified && !box.lknown)) {
        box.cknown = 1;
        if (identified) box.lknown = 1;
        update_inventory({ state });
    }
    if (box.otyp === BAG_OF_TRICKS) return; // wrong type of container

    if (box.cobj) {
        // SchroedingersBox: ordinary containers have spe !== 1 or are not
        // LARGE_BOX, so this is always false in the supported path.
        const cat = (box.otyp === LARGE_BOX && box.spe === 1);

        const header = `Contents of ${the(xnameFresh(box, state), state)}:`;
        const lines = [header, ''];

        if (box.cobj && !cat) {
            const sortflags = (((state.flags?.sortloot === 'l'
                || state.flags?.sortloot === 'f')
                ? SORTLOOT_LOOT : 0)
                | (state.flags?.sortpack ? SORTLOOT_PACK : 0));
            const sorted = sortloot(box.cobj, sortflags, false, null, state);
            for (const entry of sorted) {
                lines.push(`  ${donameFresh(entry.obj, state)}`);
            }
        } else if (cat) {
            lines.push("  Schroedinger's cat!");
        }

        await displayTtyMenuTextWindow(state, lines);
    } else if (reportempty) {
        await ttyPline(
            `${upstart(thesimpleoname(box, state))} is empty.`,
            state,
        );
        // C: display_nhwindow(WIN_MESSAGE, FALSE). The pline call above
        // displays the message; the explicit display_nhwindow in C ensures
        // it is flushed, which ttyPline already does.
    }
}
