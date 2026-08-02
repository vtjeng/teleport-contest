// wizcmds.js -- the wizard-mode extended commands.
// C ref: src/wizcmds.c wiz_level_change(), so far the only row of that file
// cmd.c doextcmd() dispatches here.

import { ECMD_OK, MAXULEV } from './const.js';
import { pluslvl, UnsupportedExperienceChangeError } from './exper.js';
import { tty_getlin } from './getline.js';
import { game } from './gstate.js';
import { mungspaces } from './hacklib.js';
import { ttyPline } from './tty_message.js';

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
    const buf = mungspaces(await tty_getlin(
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
