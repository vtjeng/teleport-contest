// wizcmds.js -- the wizard-mode extended commands.
// C refs: src/wizcmds.c wiz_genesis(), wiz_level_change(), wiz_level_tele()
// and wiz_wish(), so far the only four rows of that file cmd.c dispatches
// here.

import { ECMD_OK, MAXULEV } from './const.js';
import { pluslvl, UnsupportedExperienceChangeError } from './exper.js';
import { create_particular } from './read.js';
import { getlin } from './windows.js';
import { game } from './gstate.js';
import { mungspaces } from './hacklib.js';
import { encumber_msg } from './pickup.js';
import { level_tele } from './teleport.js';
import { ttyPline } from './tty_message.js';
import { makewish } from './zap.js';

// C ref: wizcmds.c wiz_wish() (31-44), the #wizwish command.
//
// The saved flags.verbose is what keeps "You may wish for an object." off the
// screen: zap.c:6326 prints it for every other caller of makewish(), and this
// one alone suppresses it. Restoring the flag rather than skipping the line
// matters because potion.c:2809, sit.c:110, sit.c:251 and zap.c:2583 reach
// makewish() with the flag as the player set it.
export async function wiz_wish(state = game) {
    if (state.wizard) {
        const save_verbose = state.flags.verbose;

        state.flags.verbose = false;
        await makewish(state);
        state.flags.verbose = save_verbose;
        await encumber_msg(state);
    } else {
        // Dead behind cmd.c can_do_extcmd(), which prints this same message
        // for a WIZMODECMD row and refuses before either dispatch route
        // reaches this function: rhack() calls it at cmd.c:3689 and
        // doextcmd() at cmd.c:505. The arm is written out because
        // wizcmds.c:42 has it, not because a game can run it. C spells the
        // name as ecname_from_fn(wiz_wish), which walks extcmdlist[] for the
        // row whose ef_funct is wiz_wish -- the "wizwish" row at cmd.c:2000.
        await ttyPline("Unavailable command 'wizwish'.", state);
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_level_tele() (397-406), the #wizlevelport command.
//
// Its else arm is dead for the same reason wiz_wish()'s is, and is written out
// for the same reason: cmd.c can_do_extcmd() refuses the WIZMODECMD row with
// this exact line before either dispatch route arrives, and doextcmd() never
// even sees the row because extcmds_match() drops it first. C spells the name
// as ecname_from_fn(wiz_level_tele), which finds the "wizlevelport" row.
export async function wiz_level_tele(state = game) {
    if (state.wizard) {
        await level_tele(state);
    } else {
        await ttyPline("Unavailable command 'wizlevelport'.", state);
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_genesis() (202-214), the #wizgenesis command.
//
// Its else arm is dead for the same reason wiz_wish()'s is, and is written out
// for the same reason: cmd.c can_do_extcmd() refuses the WIZMODECMD row with
// this exact line before either dispatch route arrives, and doextcmd() never
// sees the row at all because extcmds_match() drops it first. C spells the
// name as ecname_from_fn(wiz_genesis), which finds the "wizgenesis" row.
//
// The saved iflags.debug_mongen is what lets the command work in a game that
// turned random monster generation off: makemon.c:1168 returns without
// creating anything while the flag is up, and this is the one caller that
// takes it down. js/options.js seeds the field from optlist.h's initval, so
// the restore puts a boolean back rather than an undefined.
export async function wiz_genesis(state = game) {
    if (state.wizard) {
        const mongen_saved = state.iflags.debug_mongen;

        state.iflags.debug_mongen = false;
        await create_particular(state);
        state.iflags.debug_mongen = mongen_saved;
    } else {
        await ttyPline("Unavailable command 'wizgenesis'.", state);
    }
    return ECMD_OK;
}

// The range a C `long` holds, which strtol() saturates to. `scanLevelArgument()`
// explains why `%d` needs it.
const LONG_MAX = (1n << 63n) - 1n;
const LONG_MIN = -(1n << 63n);

// C ref: the `sscanf(buf, "%d%c", &newlevel, &dummy)` in wiz_level_change().
// `%d` skips leading whitespace, then takes an optional sign and at least one
// decimal digit; `%c` takes exactly one further byte without skipping
// whitespace. The count decides the command: only a buffer that is entirely
// one integer converts exactly one field, so "12x" converts two and "abc"
// converts none, and both answer "Never mind.".
export function scanLevelArgument(buf) {
    const match = /^[ \t\n\v\f\r]*([+-]?[0-9]+)/.exec(buf);
    if (!match) return { count: 0, value: 0 };
    // `%d` converts in two stages, and both are observable here because
    // `newlevel` is an `int`. The digits first become a `long`, saturating at
    // LONG_MAX or LONG_MIN when they overrun it, and the store into `int` then
    // keeps the low 32 bits. So "2147483648" arrives as -2147483648 and
    // "4294967296" as 0. Past the `long` the two directions differ rather than
    // sharing a threshold: digits above LONG_MAX saturate to it and its low 32
    // bits are all ones, giving -1, while digits below LONG_MIN saturate to it
    // and its low 32 bits are zero, giving 0.
    let wide = BigInt(match[1]);
    if (wide > LONG_MAX) wide = LONG_MAX;
    else if (wide < LONG_MIN) wide = LONG_MIN;
    return {
        count: buf.length > match[0].length ? 2 : 1,
        value: Number(BigInt.asIntN(32, wide)),
    };
}

// C ref: wizcmds.c wiz_level_change(), the #levelchange command.
//
// The lowering arm calls losexp() once per level, which this port does not
// have; its `u.ulevel == 1` early return comes along because it lowers
// nothing, and C's `if (newlevel < 1) newlevel = 1` clamp belongs to the loop
// that refusal replaces.
export async function wiz_level_change(state = game) {
    const buf = mungspaces(await getlin(
        'To what experience level do you want to be set?',
        state,
    ));
    let newlevel = 0;
    let ret;
    // C tests for an Escape or an empty buffer before calling sscanf(), which
    // would answer 0 and EOF for those two anyway. The test is kept because it
    // is what fixes ret at 0, but neither operand changes the outcome.
    if (buf[0] === '\x1B' || buf === '') {
        ret = 0;
    } else {
        const scanned = scanLevelArgument(buf);
        ret = scanned.count;
        newlevel = scanned.value;
    }

    if (ret !== 1) {
        await ttyPline('Never mind.', state);
        return ECMD_OK;
    }
    const u = state.u;
    if (newlevel === u.ulevel) {
        await ttyPline('You are already that experienced.', state);
    } else if (newlevel < u.ulevel) {
        if (u.ulevel === 1) {
            await ttyPline(
                'You are already as inexperienced as you can get.',
                state,
            );
            return ECMD_OK;
        }
        throw new UnsupportedExperienceChangeError('losexp("#levelchange")');
    } else {
        if (u.ulevel >= MAXULEV) {
            await ttyPline(
                'You are already as experienced as you can get.',
                state,
            );
            return ECMD_OK;
        }
        if (newlevel > MAXULEV) newlevel = MAXULEV;
        while (u.ulevel < newlevel)
            await pluslvl(false, state, { message: ttyPline });
    }
    /* blessed full healing or restore ability won't fix any lost levels */
    u.ulevelmax = u.ulevel;
    return ECMD_OK;
}
