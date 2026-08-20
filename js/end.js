// end.js -- the end of the game.
// C ref: src/end.c.
//
// done() is the funnel every death, quit, escape and ascension passes
// through. Its head is ported: the forced status update, the killer-format
// defaults, the mortality count and the hit-point force, down to and
// including the wizard-and-explore-mode query at 1112 that asks whether the
// hero really dies. The life-saving amulet's earlier reprieve, savelife()
// after a declined query, and really_done() (1130-1590) with its disclosure,
// tombstone, bones and score file remain refused, in that source order.
//
// The one caller this port reaches is hack.c losehp()'s death branch, one
// statement after urgent_pline("You die..."), so a segment that runs out of
// input at the query ends on the "Die? [yn] (n)" this file draws.

// js/cmd.js imports UnsupportedEndOfGameError back from this file. Both cycle
// edges are safe because their imported bindings are read only inside
// functions, after module initialization; neither belongs in a module-scope
// value initializer while the cycle remains.
import { paranoid_query } from './cmd.js';
import {
    ASCENDED,
    BURNING,
    GENOCIDED,
    KILLED_BY,
    LIFESAVED,
    NO_KILLER_PREFIX,
    PANICKED,
    PARANOID_DIE,
    QUIT,
    STARVING,
    TRICKED,
    Upolyd,
} from './const.js';
import { bot } from './display.js';
import { game } from './gstate.js';

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

// C ref: end.c done() (1019-1126), "Be careful not to call panic from here!".
//
// `how` is a game_end_types value. Before calling, a direct caller must ensure
// state.killer exists; use { name: '', format: KILLED_BY_AN } when C supplied
// no killer, or preserve the source-supplied name and format. done() applies
// the deaths[] name and format defaults below.
//
// C's `boolean survive` is not carried. Its only two writers are the
// life-saving body at 1099 and the query's "no" arm at 1116, and both are
// refused below, so `!survive` at 1105 and `if (survive)` at 1119 are decided
// before either can run.
//
// gd.done_seq is not carried either. C maintains it at 1053-1054 for exactly
// two readers: fuzzer_savelife(), which the debug_fuzzer guard below refuses,
// and the hangup term at 1110, which the done_hup refusal below stands in
// for. Storing a counter no ported line reads would be a second home for a
// value the port cannot yet spend.
//
// This partial port never resolves successfully. It mutates state through the
// last supported C statement, then throws at the first unported continuation.
// Callers must await it before resuming behind a live query or a partially
// processed death.
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
            // 1113-1116. "OK, so you don't die." over PLNMSG_OK_DONT_DIE, and
            // then savelife(), which restores the hit points, revives the
            // hero on the map and hands the turn back to the move loop.
            throw new UnsupportedEndOfGameError(
                `savelife(${how}) for a declined death`,
            );
        }
    }
    throw new UnsupportedEndOfGameError(
        `really_done(${how}) for killer "${killer.name ?? ''}"`
        + ` in format ${killer.format}`,
    );
}
