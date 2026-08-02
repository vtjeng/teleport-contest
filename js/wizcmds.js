// wizcmds.js -- the wizard-mode extended commands.
// C ref: src/wizcmds.c wiz_level_change(), so far the only row of that file
// cmd.c doextcmd() dispatches here.

import { ECMD_OK, MAXULEV } from './const.js';
import { pluslvl, UnsupportedExperienceChangeError } from './exper.js';
import { tty_getlin } from './getline.js';
import { game } from './gstate.js';
import { mungspaces } from './hacklib.js';
import { ttyPline } from './tty_message.js';

// C ref: the `sscanf(buf, "%d%c", &newlevel, &dummy)` in wiz_level_change().
// `%d` skips leading whitespace, then takes an optional sign and at least one
// decimal digit; `%c` takes exactly one further byte without skipping
// whitespace. The count decides the command: only a buffer that is entirely
// one integer converts exactly one field, so "12x" converts two and "abc"
// converts none, and both answer "Never mind.".
export function scanLevelArgument(buf) {
    const match = /^[ \t\n\v\f\r]*([+-]?[0-9]+)/.exec(buf);
    if (!match) return { count: 0, value: 0 };
    return {
        count: buf.length > match[0].length ? 2 : 1,
        value: Number.parseInt(match[1], 10),
    };
}

// C ref: wizcmds.c wiz_level_change(), the #levelchange command.
//
// The lowering arm calls losexp() once per level, which this port does not
// have; its `u.ulevel == 1` early return comes along because it lowers
// nothing. C's clamp of a target above MAXULEV is ported, but every role
// crosses an innate-ability threshold before level 30, so a raise that reaches
// the clamp still stops inside adjabil().
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
