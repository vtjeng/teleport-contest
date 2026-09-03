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
// bookkeeping, inventory identification, disclosure, grave creation, score
// calculation, and the Save bones? prompt; savebones(), tombstone, and the
// score file remain refused.
//
// savelife() (end.c:704-756) restores the hero to a viable state after the
// death is declined in wizard or explore mode. Two of its branches remain
// refused: expels() (not ported) and make_sick() (not ported).
// endmultishot(FALSE) is now ported.
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
import { can_make_bones, savebones } from './bones.js';
import { yyyymmdd } from './calendar.js';
import { paranoid_query, yn_function } from './cmd.js';
import {
    A_CON,
    ASCENDED,
    BASICENLIGHTENMENT,
    BURNING,
    CHOKING,
    DIED,
    DISCLOSE_NO_WITHOUT_PROMPT,
    DISCLOSE_PROMPT_DEFAULT_NO,
    DISCLOSE_PROMPT_DEFAULT_SPECIAL,
    DISCLOSE_PROMPT_DEFAULT_YES,
    DISCLOSE_SPECIAL_WITHOUT_PROMPT,
    DISCLOSE_YES_WITHOUT_PROMPT,
    ESCAPED,
    ENL_GAMEOVERDEAD,
    G_EXTINCT,
    G_GENOD,
    G_GONE,
    GENOCIDED,
    IS_GRAVE,
    KILLED_BY,
    KILLED_BY_AN,
    LIFESAVED,
    MAGICENLIGHTENMENT,
    M_AP_MONSTER,
    M_AP_TYPE,
    NO_KILLER_PREFIX,
    PICK_ONE,
    PANICKED,
    PICK_NONE,
    PARANOID_BONES,
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
import { mk_named_object } from './corpstat.js';
import { bot } from './display.js';
import { pmname } from './do_name.js';
import { deepest_lev_reached } from './dungeon.js';
import { game } from './gstate.js';
import { make_grave } from './grave.js';
import { clearpriests } from './priest.js';
import { paybill } from './shk.js';
import { paygd } from './vault.js';
import { curs_on_u } from './hack.js';
import { zombie_maker } from './mon.js';
import { gender, is_vampshifter, type_is_pname } from './mondata.js';
import { G_NOCORPSE } from './monsters.js';
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
import { endmultishot } from './dothrow.js';
import { upstart } from './hacklib.js';
import {
    display_inventory, money_cnt, sortloot, update_inventory,
} from './invent.js';
import { isContainer } from './obj.js';
import { discover_object } from './o_init.js';
import { BAG_OF_TRICKS, CORPSE, LARGE_BOX, STATUE, TIN } from './objects.js';
import {
    an, doname_with_price, the, thesimpleoname, the_unique_pm,
    xnameFresh,
} from './objnam.js';
import { enlightenment } from './insight.js';
import { add_menu_heading, select_menu } from './windows.js';
import {
    displayTtyMenuTextWindow, displayTtyTextWindow,
} from './tty_menu.js';
import { canSpotMonster } from './startup_a11y.js';
import { formatkiller } from './topten.js';
import { In_endgame, In_quest, Is_astralevel, plur } from './const.js';
import {
    depth, dunlev, on_level, recalc_mapseen, single_level_branch,
} from './dungeon.js';
import { makeplural } from './fruit.js';
import { Goodbye } from './role_init.js';
import { tty_raw_print } from './tty_rawprint.js';
import { reset_utrap } from './trap.js';
import { ttyPline } from './tty_message.js';
import { init_uhunger } from './u_init.js';
import { hidden_gold } from './u_init_inventory_attrs.js';

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

// C ref: end.c ends[] (52-61), "when you %s". Separate from deaths[]: each
// entry reads naturally after "You " or "when you ", e.g. "were poisoned"
// instead of "poisoned". Indexed by game_end_types values.
const ends = Object.freeze([
    'died', 'choked', 'were poisoned', 'starved', 'drowned',
    'burned', 'dissolved in the lava', 'were crushed',
    'turned to stone', 'turned into slime', 'were genocided',
    'panicked', 'were tricked', 'quit', 'escaped', 'ascended',
]);

// C ref: include/integer.h nowrap_add() macro.  Caps a + b at LONG_MAX to
// prevent score wrapping.  On the 64-bit reference platform long is 64 bits,
// but practical scores are far below Number.MAX_SAFE_INTEGER (2^53-1), so
// plain addition always matches C.
function nowrap_add(a, b) {
    const sum = a + b;
    return sum <= Number.MAX_SAFE_INTEGER ? sum : Number.MAX_SAFE_INTEGER;
}

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
// Two branches remain refused because their targets are not ported:
//   expels()             -- only when u.uswallow (hero is engulfed)
//   make_sick(0L, ...)   -- only when (Sick & TIMEOUT) == 1L (one-turn sick)
// endmultishot(FALSE) is now ported: it stops a multi-shot volley in progress
// when the hero dies on their own turn (context.mon_moving is false).
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
        // endmultishot(FALSE) stops a multi-shot volley in progress. With
        // verbose=false it suppresses the message and only clamps m_shot.n.
        endmultishot(false, state);
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

    // C end.c:195 You("die...") is a regular pline, not urgent_pline.
    await ttyPline(
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

    await done(how, state, { fromMonster: true });
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
export async function done(how, state = game, source = {}) {
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
    // steed.c constructs every failed-mount death from this fixed semantic
    // prefix followed by x_monnam(), so the species and optional given name
    // are deliberately variable. This slice owns that death source, not one
    // recorded pony spelling.
    //
    // zapyourself() constructs the death-ray killer from uhim(), so the
    // pronoun varies by gender but the surrounding text is fixed.
    if (how === DIED
        && killer.format === NO_KILLER_PREFIX
        && (killer.name.startsWith('slipped while mounting ')
            || killer.name.endsWith('self with a death ray'))) {
        await really_done(how, state);
        return;
    }
    if (how === DIED && source.fromMonster
        && killer.format === KILLED_BY_AN && killer.name) {
        await really_done(how, state);
        return;
    }
    throw new UnsupportedEndOfGameError(
        `really_done(${how}) for killer "${killer.name ?? ''}"`
        + ` in format ${killer.format}`,
    );
}

const DISCLOSURE_OPTIONS = 'iavgco';
const KEY_Y = 'y'.charCodeAt(0);
const KEY_Q = 'q'.charCodeAt(0);
const KEY_A = 'a'.charCodeAt(0);

// C ref: end.c should_query_disclose_option() (475-515). The returned
// `defquery` is the answer used when the option suppresses the prompt and the
// default passed to yn_function() when it does not.
function should_query_disclose_option(category, state) {
    const index = DISCLOSURE_OPTIONS.indexOf(category);
    if (index < 0) {
        throw new UnsupportedEndOfGameError(
            `should_query_disclose_option() category ${category}`,
        );
    }
    const disclose = state.flags.end_disclose[index];
    switch (disclose) {
    case DISCLOSE_YES_WITHOUT_PROMPT:
        return { ask: false, defquery: 'y' };
    case DISCLOSE_SPECIAL_WITHOUT_PROMPT:
        return { ask: false, defquery: 'a' };
    case DISCLOSE_NO_WITHOUT_PROMPT:
        return { ask: false, defquery: 'n' };
    case DISCLOSE_PROMPT_DEFAULT_YES:
        return { ask: true, defquery: 'y' };
    case DISCLOSE_PROMPT_DEFAULT_SPECIAL:
        return { ask: true, defquery: 'a' };
    case DISCLOSE_PROMPT_DEFAULT_NO:
        return { ask: true, defquery: 'n' };
    default:
        return { ask: true, defquery: 'n' };
    }
}

function disclosureStopprint(state) {
    return Boolean(state.program_state?.stopprint);
}

function discloseStop(state) {
    state.program_state.stopprint = (state.program_state.stopprint ?? 0) + 1;
}

function menuLines(texts) {
    return texts.map((text) => ({ text }));
}

function monsterVitals(state) {
    return state.svm?.mvitals ?? state.mvitals ?? [];
}

function ordinaryMonsterEntries(state, flags = 0) {
    return monsterVitals(state).flatMap((vital, index) => {
        const monster = state.mons?.[index];
        if (!monster || (flags && (vital.mvflags & flags) === 0)) return [];
        return [{ index, monster, vital }];
    });
}

function isUniqueMonster(index, monster) {
    return (monster.geno & G_UNIQ) !== 0 && index !== PM_HIGH_CLERIC;
}

function vanquishedName(entry) {
    return entry.monster.pmnames?.[2]
        ?? entry.monster.pmnames?.find(Boolean) ?? 'monster';
}

function vanquishedPrefix(text) {
    const lower = text.toLowerCase();
    if (lower.startsWith('the ')) return 0;
    if (lower.startsWith('an ')) return 1;
    if (lower.startsWith('a ')) return 2;
    return /\d/u.test(text[2] ?? '') ? 0 : 4;
}

// C ref: insight.c list_vanquished(). The ordinary final disclosure uses the
// default traditional order: monster level descending, then internal index.
async function list_vanquished(defquery, ask, state) {
    const entries = ordinaryMonsterEntries(state).filter((entry) => (
        Number(entry.vital.died) > 0
    ));
    if (!entries.length) return;

    const answer = ask ? await yn_function(
            'Do you want an account of creatures vanquished?',
            entries.length > 1 ? 'ynaq' : 'ynq',
            defquery,
            true,
            state,
        ) : defquery.charCodeAt(0);
    if (answer === KEY_Q) {
        discloseStop(state);
        return;
    }
    if (answer === KEY_A) {
        throw new UnsupportedEndOfGameError(
            'list_vanquished() sort-order selection',
        );
    }
    if (answer !== KEY_Y) return;

    entries.sort((left, right) => (
        (right.monster.mlevel ?? 0) - (left.monster.mlevel ?? 0)
        || left.index - right.index
    ));
    const lines = ['Vanquished creatures:', ''];
    let total = 0;
    for (const entry of entries) {
        const count = Math.trunc(entry.vital.died);
        total += count;
        const name = vanquishedName(entry);
        let text;
        if (isUniqueMonster(entry.index, entry.monster)) {
            text = `${type_is_pname(entry.monster) ? '' : 'the '}${name}`;
            if (count > 1) text += ` (${count} times)`;
        } else if (count === 1) {
            text = an(name);
        } else {
            // insight.c list_vanquished() uses Sprintf("%3d %s", ...).
            // Keep the three-column count before applying the article prefix
            // used to align singular and unique names.
            text = `${String(count).padStart(3, ' ')} ${makeplural(name)}`;
        }
        lines.push(`${' '.repeat(vanquishedPrefix(text))}${text}`);
    }
    if (entries.length > 1) {
        lines.push('');
        lines.push(`${total} creatures vanquished.`);
    }
    await displayTtyMenuTextWindow(state, menuLines(lines));
}

// C ref: insight.c list_genocided(). No menu or prompt is produced when the
// ordinary final state has no genocided or extinct species; that is the only
// common branch in this slice. The positive list is kept source-shaped for a
// fresh case that happens to cross it, while its alternate sort choice stays
// outside the bounded default-order path.
async function list_genocided(defquery, ask, state) {
    const entries = ordinaryMonsterEntries(state, G_GENOD | G_EXTINCT)
        .filter((entry) => !isUniqueMonster(entry.index, entry.monster));
    if (!entries.length) return;

    const answer = ask ? await yn_function(
            'Do you want a list of genocided species?',
            entries.length > 1 ? 'ynaq' : 'ynq',
            defquery,
            true,
            state,
        ) : defquery.charCodeAt(0);
    if (answer === KEY_Q) {
        discloseStop(state);
        return;
    }
    if (answer === KEY_A) {
        throw new UnsupportedEndOfGameError(
            'list_genocided() sort-order selection',
        );
    }
    if (answer !== KEY_Y) return;

    entries.sort((left, right) => (
        vanquishedName(left).localeCompare(vanquishedName(right), 'en', {
            sensitivity: 'base',
        }) || left.index - right.index
    ));
    const genocided = entries.filter((entry) => (
        (entry.vital.mvflags & G_GENOD) !== 0
    )).length;
    const extinct = entries.filter((entry) => (
        (entry.vital.mvflags & G_EXTINCT) !== 0
        && (entry.vital.mvflags & G_GENOD) === 0
    )).length;
    const title = `${genocided ? 'Genocided' : 'Extinct'} species:`;
    const lines = [title, ''];
    for (const entry of entries) {
        let text = ` ${makeplural(vanquishedName(entry))}`;
        if ((entry.vital.mvflags & G_GONE) === G_EXTINCT)
            text += ' (extinct)';
        lines.push(text);
    }
    lines.push('');
    if (genocided) lines.push(`${genocided} species genocided.`);
    if (extinct) lines.push(`${extinct} species extinct.`);
    await displayTtyMenuTextWindow(state, menuLines(lines));
}

function conductValue(state, key) {
    return Math.trunc(state.u.uconduct?.[key] ?? 0);
}

// C ref: insight.c show_conduct(). The normal, non-wizard final path includes
// the challenge lines whose counters are zero and omits the wizard-only
// positive counters. Achievements and Sokoban are deliberately left at the
// boundary because this slice covers an ordinary early death.
async function show_conduct(final, state) {
    if (state.wizard || state.discover)
        throw new UnsupportedEndOfGameError('show_conduct() alternate mode');
    if (state.u.uachieved?.some(Boolean))
        throw new UnsupportedEndOfGameError('show_conduct() achievements');

    const lines = ['Voluntary challenges:'];
    const roleplay = state.u.uroleplay ?? {};
    if (!roleplay.reroll) lines.push(' Character rerolling was not enabled.');
    else if (!roleplay.numrerolls) lines.push(' Your character was not rerolled.');
    else {
        throw new UnsupportedEndOfGameError(
            'show_conduct() character-reroll count',
        );
    }
    if (roleplay.blind || roleplay.deaf || roleplay.pauper || roleplay.nudist)
        throw new UnsupportedEndOfGameError('show_conduct() roleplay challenge');

    if (!conductValue(state, 'food')) lines.push(' You went without food.');
    else if (!conductValue(state, 'unvegan'))
        lines.push(' You followed a strict vegan diet.');
    else if (!conductValue(state, 'unvegetarian'))
        lines.push(' You were vegetarian.');
    if (!conductValue(state, 'gnostic')) lines.push(' You were an atheist.');
    if (!conductValue(state, 'weaphit'))
        lines.push(' You never hit with a wielded weapon.');
    if (!conductValue(state, 'killer')) lines.push(' You were a pacifist.');
    if (!conductValue(state, 'literate')) lines.push(' You were illiterate.');
    if (!conductValue(state, 'pets')) lines.push(' You never had a pet.');

    const genocided = ordinaryMonsterEntries(state, G_GENOD).length;
    if (!genocided) lines.push(' You never genocided any monsters.');
    else throw new UnsupportedEndOfGameError('show_conduct() genocide count');
    if (!conductValue(state, 'polypiles'))
        lines.push(' You never polymorphed an object.');
    if (!conductValue(state, 'polyselfs')) lines.push(' You never changed form.');
    if (!conductValue(state, 'wishes')) lines.push(' You used no wishes.');

    await displayTtyMenuTextWindow(state, menuLines(lines));
}

// C ref: dungeon.c show_overview()/print_mapseen(). The ordinary final death
// disclosure needs only the visited ordinary levels and the current level's
// not-yet-created final resting place. Branches, annotations, and endgame
// levels remain outside this bounded slice.
async function show_overview(how, state) {
    recalc_mapseen(state);
    const entries = (state.svm?.mapseenchn ?? []).filter((entry) => (
        !In_endgame(entry.lev, state)
    ));
    const lines = [];
    let lastDungeon = null;
    for (const entry of entries) {
        const dnum = entry.lev.dnum;
        if (dnum !== lastDungeon) {
            const dungeon = state.dungeons?.[dnum];
            if (!dungeon)
                throw new UnsupportedEndOfGameError('overview unknown dungeon');
            const reached = Math.trunc(dungeon.dunlev_ureached ?? 0);
            const first = dungeon.depth_start;
            const header = reached === dungeon.entry_lev
                ? `${dungeon.dname}:`
                : `${dungeon.dname}: levels ${first} to `
                    + `${first + reached - 1}`;
            lines.push(add_menu_heading(header, state));
            lastDungeon = dnum;
        }

        const level = depth(entry.lev, state);
        let text = `   Level ${level}:`;
        if (on_level(state.u.uz, entry.lev)) text += ' <- You were here.';
        lines.push({ text });

        if (how === DIED && on_level(state.u.uz, entry.lev)) {
            lines.push({ text: '      Final resting place for' });
            lines.push({
                text: `         you, ${formatkiller(how, true, state)}.`,
            });
        }
    }
    await select_menu(state, {
        lines,
        how: PICK_NONE,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
}

// C ref: end.c disclose() (619-699). Walks each disclosure category in order.
async function disclose(how, taken, state) {
    if (state.invent && !disclosureStopprint(state)) {
        if (taken) {
            throw new UnsupportedEndOfGameError(
                'disclose() after a shopkeeper takes the inventory',
            );
        }
        const { ask, defquery } = should_query_disclose_option('i', state);
        const c = ask ? await yn_function(
            'Do you want your possessions identified?',
            'ynq',
            defquery,
            true,
            state,
        ) : defquery;
        if (c === KEY_Y) {
            state.iflags.force_invmenu = false;
            await display_inventory(null, true, state, {
                menu: (items) => select_menu(state, {
                        items,
                        how: PICK_ONE,
                        cancelValue: null,
                        overlay: state.iflags?.menu_overlay !== false,
                    }),
            });
            for (let obj = state.invent; obj; obj = obj.nobj) {
                if (isContainer(obj) || obj.otyp === STATUE) {
                    throw new UnsupportedEndOfGameError(
                        'disclose() identified container contents',
                    );
                }
            }
        }
        if (c === KEY_Q) discloseStop(state);
    }

    if (!disclosureStopprint(state)) {
        const { ask, defquery } = should_query_disclose_option('a', state);
        const c = ask ? await yn_function(
            'Do you want to see your attributes?',
            'ynq',
            defquery,
            true,
            state,
        ) : defquery;
        if (c === KEY_Y) {
            const lines = await enlightenment(
                BASICENLIGHTENMENT | MAGICENLIGHTENMENT,
                ENL_GAMEOVERDEAD,
                state,
            );
            await displayTtyMenuTextWindow(state, lines);
        }
        if (c === KEY_Q) discloseStop(state);
    }

    if (!disclosureStopprint(state)) {
        const { ask, defquery } = should_query_disclose_option('v', state);
        await list_vanquished(defquery, ask, state);
    }
    if (!disclosureStopprint(state)) {
        const { ask, defquery } = should_query_disclose_option('g', state);
        await list_genocided(defquery, ask, state);
    }
    if (!disclosureStopprint(state)) {
        const { ask, defquery } = should_query_disclose_option('c', state);
        const c = ask ? await yn_function(
            'Do you want to see your conduct?',
            'ynq',
            defquery,
            true,
            state,
        ) : defquery;
        if (c === KEY_Y) await show_conduct(2, state);
        if (c === KEY_Q) discloseStop(state);
    }
    if (!disclosureStopprint(state)) {
        const { ask, defquery } = should_query_disclose_option('o', state);
        const c = ask ? await yn_function(
            'Do you want to see the dungeon overview?',
            'ynq',
            defquery,
            true,
            state,
        ) : defquery;
        if (c === KEY_Y) await show_overview(how, state);
        if (c === KEY_Q) discloseStop(state);
    }
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

// C ref: end.c really_done() (1130-1369).  Covers the ordinary death path
// through disclosure, grave creation, score calculation, and the Save bones?
// prompt.  savebones() and the post-bones code remain refused.
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
    if (how !== DIED || state.u.ugrave_arise !== NON_PM) {
        throw new UnsupportedEndOfGameError(
            'really_done() special death or grave-arise state',
        );
    }
    // C ref: end.c:1234-1244. how is DIED here, so paybill() is called with
    // croaked == 1. clearlocks() unlinks the on-disk level files; the port
    // holds levels in memory and writes no files, so it has no counterpart.
    const silently = disclosureStopprint(state);
    const taken = paybill(1, silently, state);
    paygd(silently, state);
    clearpriests(state);

    identifyInventoryForDisclosure(state);
    // C: if (strcmp(flags.end_disclose, "none")) disclose(how, taken);
    // The "none" sentinel is a special all-suppress setting.  The option
    // parser above never stores it; the test therefore always passes.
    await disclose(how, taken, state);

    // C ref: end.c:1285-1290 livelog_printf + dump_everything.  Neither is
    // ported; they produce no RNG draws or game-state mutations.

    // C ref: end.c:1297-1298 keepdogs for ESCAPED/ASCENDED.
    // Not applicable: how === DIED.

    // C ref: end.c:1300-1302 finish_paybill() when bones_ok && taken.
    // taken is always false here: js/shk.js inherits() refuses every arm
    // that would take the hero's possessions and returns false from the
    // `clear` arm, so finish_paybill() is unreachable until those arms are
    // ported.

    // -- Grave creation (C ref: end.c:1306-1319) --
    let corpse = null;
    if (bonesOk && state.u.ugrave_arise === NON_PM
        && !((state.mvitals?.[state.u.umonnum]?.mvflags ?? 0) & G_NOCORPSE)) {
        // Base corpse on race when not polymorphed, since the original
        // umonnum is based on role and all role monsters are human.
        const mnum = !Upolyd(state.u) ? state.urace.mnum : state.u.umonnum;
        const wasAlreadyGrave = IS_GRAVE(
            state.level.at(state.u.ux, state.u.uy)?.typ ?? 0,
        );

        corpse = mk_named_object(
            CORPSE, mnum, state.u.ux, state.u.uy, state.plname,
        );
        const graveText = `${state.plname}, ${formatkiller(how, true, state)}`;
        make_grave(state.u.ux, state.u.uy, graveText);
        const loc = state.level.at(state.u.ux, state.u.uy);
        if (loc && IS_GRAVE(loc.typ) && !wasAlreadyGrave) {
            loc.flags = 1; // emptygrave: corpse is on the surface, not buried
        }
    }

    // -- Score calculation (C ref: end.c:1322-1348) --
    {
        const deepest = deepest_lev_reached(state);
        let umoney = money_cnt(state.invent);
        let tmp = state.u.umoney0;
        umoney += hidden_gold(true, state);
        tmp = umoney - tmp; // net gain
        if (tmp < 0) tmp = 0;
        if (how < PANICKED) tmp -= Math.trunc(tmp / 10);
        tmp += 50 * (deepest - 1);
        if (deepest > 20)
            tmp += 1000 * ((deepest > 30) ? 10 : deepest - 20);
        state.u.urexp = nowrap_add(state.u.urexp, tmp);

        // Ascension bonus (only when offering to original deity).
        if (how === ASCENDED
            && state.u.ualign?.type === state.u.ualignbase?.[0]) {
            tmp = (state.u.ualignbase?.[1] === state.u.ualignbase?.[0])
                ? state.u.urexp
                : Math.trunc(state.u.urexp / 2);
            state.u.urexp = nowrap_add(state.u.urexp, tmp);
        }
    }

    // C ref: end.c:1351-1361 ugrave_arise message.
    // ugrave_arise === NON_PM in the supported path, so ismnum() is false.

    // C ref: end.c:1326 — compute done_money before savebones drains
    // the inventory. C stores done_money at end.c:1373 but reads the
    // inventory at end.c:1326, before the savebones call at 1363.
    let umoney = money_cnt(state.invent) + hidden_gold(true, state);

    // -- Bones saving (C ref: end.c:1363-1369) --
    if (bonesOk) {
        if (!state.wizard
            || await paranoid_query(
                (state.flags.paranoia_bits & PARANOID_BONES) !== 0,
                'Save bones?',
                state,
            )) {
            await savebones(how, endtime, corpse, state);
        }
        corpse = null;
    }

    // C ref: end.c:1373.
    state.gd ??= {};
    state.gd.done_money = umoney;

    // -- Window cleanup and tombstone (C ref: end.c:1376-1396) --
    //
    // C destroys the inventory, map, status, and message windows, then creates
    // a NHW_TEXT window for the tombstone and farewell text. The port's text
    // window is displayTtyTextWindow.

    // C: display_nhwindow(WIN_MESSAGE, TRUE) -- show pending messages.
    // The port clears the message window state; pending messages were already
    // displayed during the bones prompt.

    // C: if (how < GENOCIDED && flags.tombstone && endwin != WIN_ERR)
    //        outrip(endwin, how, endtime);
    const textLines = [];

    if (how < GENOCIDED && state.flags.tombstone) {
        genl_outrip(textLines, how, endtime, state);
    }

    // C ref: end.c:1418-1424. Farewell text.
    const roleName = (how !== ASCENDED)
        ? ((state.flags.female && state.urole?.name?.f)
            ? state.urole.name.f : state.urole?.name?.m ?? 'Adventurer')
        : (state.flags.female ? 'Demigoddess' : 'Demigod');
    const goodbye = Goodbye(state.urole);
    textLines.push({ text: `${goodbye} ${state.plname} the ${roleName}...` });
    textLines.push({ text: '' });

    // C ref: end.c:1521-1542. Death summary for non-escaped, non-ascended.
    if (how !== ESCAPED && how !== ASCENDED) {
        const uz = state.u.uz;
        let pbuf;
        if (uz.dnum === 0 && uz.dlevel <= 0) {
            pbuf = `You ${uz.dlevel < 0 ? 'passed away' : ends[how]}`
                + ' beyond the confines of the dungeon';
        } else {
            let where = state.dungeons?.[uz.dnum]?.dname
                ?? 'The Dungeons of Doom';
            if (Is_astralevel(uz)) where = 'The Astral Plane';
            pbuf = `You ${ends[how]} in ${where}`;
            if (!In_endgame(uz) && !single_level_branch(uz, state)) {
                const dlevel = In_quest(uz)
                    ? dunlev(uz) : depth(uz, state);
                pbuf += ` on dungeon level ${dlevel}`;
            }
        }
        pbuf += ` with ${state.u.urexp} point${plur(state.u.urexp)},`;
        textLines.push({ text: pbuf });
    }

    // C ref: end.c:1544-1551. Gold, moves, level, hit points.
    textLines.push({
        text: `and ${umoney} piece${plur(umoney)} of gold, `
            + `after ${state.moves} move${plur(state.moves)}.`,
    });
    textLines.push({
        text: `You were level ${state.u.ulevel} with a maximum of `
            + `${state.u.uhpmax} hit point${plur(state.u.uhpmax)} `
            + `when you ${ends[how]}.`,
    });
    textLines.push({ text: '' });

    // C ref: end.c:1552-1555 display_nhwindow(endwin, TRUE).
    await displayTtyTextWindow(state, textLines);

    // C ref: end.c:1579-1583 exit_nhwindows + topten.
    // exit_nhwindows clears the screen; topten prints to raw output.
    // In wizard mode, topten just prints the wizard message.
    if (state.wizard || state.discover) {
        tty_raw_print(state, '');
        const modeWord = state.wizard ? 'wizard' : 'discover';
        tty_raw_print(
            state,
            `Since you were in ${modeWord} mode, `
            + 'the score list will not be checked.',
        );
    }

    // C ref: end.c:1589 nh_terminate(EXIT_SUCCESS).
    // The JS port signals end of segment via gameover. The post-moveloop
    // capture hook is gated on !in_really_done, so the final screen capture
    // happens at the next _preNhgetchHook call (triggered by the moveloop
    // break + the explicit hook call in jsmain.js for really_done).
    state.program_state.gameover = true;
    // Clear in_really_done so the post-loop capture hook runs.
    state.program_state.in_really_done = false;
}

// C ref: rip.c genl_outrip() (86-163). Builds the tombstone as text lines
// and pushes them into the lines array for the NHW_TEXT window. The
// tombstone has a fixed ASCII-art frame with the hero's name, gold, death
// description, and year centered on specific lines.
const rip_txt = [
    '                       ----------',
    '                      /          \\',
    '                     /    REST    \\',
    '                    /      IN      \\',
    '                   /     PEACE      \\',
    '                  /                  \\',
    '                  |                  |', // NAME_LINE  6
    '                  |                  |', // GOLD_LINE  7
    '                  |                  |', // DEATH_LINE 8
    '                  |                  |', // 9
    '                  |                  |', // 10
    '                  |                  |', // 11
    '                  |       1001       |', // YEAR_LINE 12
    '                 *|     *  *  *      | *',
    '        _________)/\\\\_//(\\/(/\\)/\\//\\/|_)_______',
];
const STONE_LINE_CENT = 28;
const STONE_LINE_LEN = 16;
const NAME_LINE = 6;
const GOLD_LINE = 7;
const DEATH_LINE = 8;
const YEAR_LINE = 12;

function center(lines, line, text) {
    const row = [...lines[line]];
    const start = STONE_LINE_CENT - ((text.length + 1) >> 1);
    for (let i = 0; i < text.length; i++) {
        row[start + i] = text[i];
    }
    lines[line] = row.join('');
}

function genl_outrip(textLines, how, when, state) {
    const dp = rip_txt.map((line) => line);

    // Put name on stone
    const name = (state.plname ?? '').substring(0, STONE_LINE_LEN);
    center(dp, NAME_LINE, name);

    // Put gold on stone
    let cash = Math.max(state.gd?.done_money ?? 0, 0);
    if (cash > 999999999) cash = 999999999;
    center(dp, GOLD_LINE, `${cash} Au`);

    // Put death description on stone
    const deathBuf = formatkiller(how, false, state);
    let dpx = deathBuf;
    for (let line = DEATH_LINE; line < YEAR_LINE; line++) {
        let i0 = dpx.length;
        if (i0 > STONE_LINE_LEN) {
            for (let i = STONE_LINE_LEN; i > 0 && i0 > STONE_LINE_LEN; i--) {
                if (dpx[i] === ' ') i0 = i;
            }
            if (i0 > STONE_LINE_LEN) i0 = STONE_LINE_LEN;
        }
        const chunk = dpx.substring(0, i0);
        center(dp, line, chunk);
        if (dpx[i0] !== ' ') {
            dpx = dpx.substring(i0);
        } else {
            dpx = dpx.substring(i0 + 1);
        }
    }

    // Put year on stone
    const year = Math.trunc((yyyymmdd(state, when) / 10000) % 10000);
    center(dp, YEAR_LINE, String(year).padStart(4, ' '));

    // Add to output: blank line, tombstone lines, two trailing blanks.
    textLines.push({ text: '' });
    for (const line of dp) {
        textLines.push({ text: line });
    }
    textLines.push({ text: '' });
    textLines.push({ text: '' });
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
                lines.push(`  ${doname_with_price(entry.obj, state)}`);
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
