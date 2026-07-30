// lock.js — opening, closing, and unlocking doors and containers, owned by
// lock.c. Only the part of doopen_indir() a walking hero reaches is ported
// so far; see its header comment for the branches it covers.

import {
    A_CON,
    A_DEX,
    A_STR,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_NODOOR,
    ECMD_OK,
    ECMD_TIME,
} from './const.js';
import { acurrstr, effective_attribute, exercise } from './attrib.js';
import { feel_newsym, newsym } from './display.js';
import { game } from './gstate.js';
import { encumber_msg } from './pickup.js';
import { rn2, rnl } from './rng.js';
import { messageAt } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { recalc_block_point } from './vision.js';

// struct rm's shared door mask has two spellings in this port; js/mklev.js
// writes an ordinary dungeon door's to `flags` and the special-level paths
// write it to `doormask`, so every reader accepts either.
function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

// C ref: lock.c:859-873, the switch that names a door doopen_indir() cannot
// pull at. It is translated whole because it is one statement, but only its
// default arm is live: monmove.c closed_door() admits D_LOCKED and D_CLOSED
// alone, so hack.c test_move()'s autoopen route reaches this with D_LOCKED,
// and the three doorless masks arrive only through doopen(), the unported
// `#open` command. C also sets a `locked` flag in the default arm; see the
// caller for why this port has no reader for it.
function notClosedMessage(door) {
    switch (doorMask(door)) {
    case D_BROKEN:
        return ' is broken';
    case D_NODOOR:
        return 'way has no door';
    case D_ISOPEN:
        return ' is already open';
    default:
        return ' is locked';
    }
}

// C ref: lock.c doopen_indir(), the arm a hero reaches by walking into a
// closed door with `autoopen` set. hack.c test_move() passes a nonzero <x,y>,
// so the get_adjacent_loc() prompt, the doloot() redirect and the pit refusal
// above it cannot run.
//
// Covered: the newsym() refresh, the `!(doormask & D_CLOSED)` message switch,
// and the `door is known to be CLOSED` roll with both of its outcomes.
//
// Not covered, because js/hack.js refuses each state before the walk is
// admitted: nohands(), u.utrap, stumble_on_door_mimic(), the Confusion and
// Stunned `res = ECMD_TIME`, drawbridges and portcullises, a square that is
// not a door, the message switch's autounlock tail, verysmall(), and the
// D_TRAPPED half of the success arm with its b_trapped() and shop
// add_damage() bookkeeping.
//
// update_mapseen_for() and the `res = ECMD_TIME` beside newsym() are left out
// too. They feed only the return value, and the walking caller at hack.c:1104
// reads it solely to detect a kick queued by AUTOUNLOCK_KICK, which the
// refused autounlock arms cannot queue. That is also why the message switch
// returns ECMD_OK rather than tracking `res`.
export async function doopen_indir(x, y, state = game, env = {}) {
    for (const name of Object.keys(env)) {
        // A substitution named with a key this function does not read would
        // fall through to the real operation and disarm the test that
        // installed it.
        if (name !== 'message' && name !== 'random')
            throw new TypeError(`doopen_indir does not read env.${name}`);
    }
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rn2, rnl };
    const door = state.level?.at(x, y);
    if (!door) throw new TypeError('doopen_indir requires a door location');

    newsym(x, y);

    if (!(doorMask(door) & D_CLOSED)) {
        await message(
            messageAt(`This door${notClosedMessage(door)}.`, x, y, state),
            state,
        );
        // lock.c:876-894 then offers a locked door to flags.autounlock. Its
        // apply-key arm needs autokey(TRUE) to find a skeleton key, lock pick
        // or credit card, and its kick arm needs AUTOUNLOCK_KICK and a ynq()
        // prompt; js/hack.js refuses both before the walk is admitted, so the
        // C `locked` flag that gates them has no reader here.
        return ECMD_OK;
    }

    // ACURRSTR folds Strength's 3..125 encoding down to 3..25 before the
    // three attributes are averaged with C's truncating integer division.
    const threshold = Math.trunc((
        acurrstr(state)
        + effective_attribute(state, A_DEX)
        + effective_attribute(state, A_CON)
    ) / 3);
    if (random.rnl(20) < threshold) {
        await message(messageAt('The door opens.', x, y, state), state);
        // detect.c cvt_sdoor_to_door() sets both spellings of struct rm's
        // shared mask field; every reader in the port accepts either.
        door.flags = D_ISOPEN;
        door.doormask = D_ISOPEN;
        feel_newsym(x, y, state);
        recalc_block_point(x, y, state);
    } else {
        await exercise(A_STR, true, state, random, {
            encumberMessage: encumber_msg,
        });
        await message(messageAt('The door resists!', x, y, state), state);
    }

    return ECMD_TIME;
}
