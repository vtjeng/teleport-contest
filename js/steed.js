// steed.js -- Riding a saddled monster.
// C ref: steed.c.

import { ECMD_CANCEL, isok } from './const.js';
import { getdir, y_n } from './cmd.js';
import { game } from './gstate.js';

// A steed path this port has not reached yet.
export class UnsupportedSteedError extends Error {
    constructor(reason) {
        super(`unsupported steed action: ${reason}`);
        this.name = 'UnsupportedSteedError';
        this.reason = reason;
    }
}

// C ref: steed.c doride() (176-192), the #ride command. The direction prompt
// and the isok() test are ported; the two things that can follow them are not.
//
// The `u.usteed` arm dismounts through dismount_steed(DISMOUNT_BYCHOICE) and
// then falls out of the if/else to `return ECMD_TIME`. No line of this port
// writes u.usteed, so a hero cannot be mounted and that arm is unreachable
// rather than merely refused.
//
// The `wizard && y_n(...)` question sits between getdir() and mount_steed().
// A hero who is not in debug mode skips it and reaches mount_steed() with
// forcemount FALSE, for the answer
// `mount_steed(m_at(u.ux + u.dx, u.uy + u.dy), FALSE) ? ECMD_TIME : ECMD_OK`.
// A debug-mode hero stops inside y_n() instead, because the port's
// tty_yn_function() covers only the arm that accepts any single keystroke.
export async function doride(state = game) {
    const u = state.u;
    let forcemount = false;

    if (u.usteed) {
        throw new UnsupportedSteedError('dismount_steed(DISMOUNT_BYCHOICE)');
    }
    if (await getdir(null, state) && isok(u.ux + u.dx, u.uy + u.dy)) {
        // yn_function() answers the raw keystroke byte, as C's char return
        // does, so the comparison is against 'y'.charCodeAt(0) rather than a
        // one-character string.
        if (state.wizard
            && await y_n('Force the mount to succeed?', state)
                === 'y'.charCodeAt(0))
            forcemount = true;
        throw new UnsupportedSteedError(
            `mount_steed(m_at(...), ${forcemount})`,
        );
    }
    return ECMD_CANCEL;
}
