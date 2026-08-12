// lock.js — opening, closing, and unlocking doors and containers, owned by
// lock.c. Two functions are ported: the part of doopen_indir() a walking hero
// reaches, and the part of pick_lock() a hero reaches by applying a lock pick
// to an adjacent door. See each header comment for the branches it covers.

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
    IS_DOOR,
    OBJ_INVENT,
    TT_PIT,
    u_at,
} from './const.js';
import { acurrstr, effective_attribute, exercise } from './attrib.js';
import { get_adjacent_loc } from './cmd.js';
import {
    feel_location,
    feel_newsym,
    newsym,
    same_remembered_glyph,
} from './display.js';
import { update_mapseen_for } from './dungeon.js';
import { game } from './gstate.js';
import { m_at } from './monst.js';
import { nohands } from './mondata.js';
import { encumber_msg } from './pickup.js';
import { rn2, rnl } from './rng.js';
import {
    heroIsBlind,
    is_drawbridge_wall,
    messageAt,
} from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { recalc_block_point } from './vision.js';

// Thrown where lock.c reaches a branch this port has not ported.
export class UnsupportedLockError extends Error {
    constructor(branch) {
        super(`picking a lock requires ${branch}`);
        this.name = 'UnsupportedLockError';
        this.branch = branch;
    }
}

// C's gx.xlock, the lock-picking occupation's context. js/invent.js obfree()
// already reads it to decide whether deleting a container invalidates the
// occupation; this is its single owner, and reset_pick() below is the only
// writer. pick_lock() reads gx.xlock.usedtime to spot an interrupted attempt
// but stops before C's writes at lock.c:650-653, and doforce() is unported.
function xlockContext(state) {
    state.xlock ??= {
        usedtime: 0,
        chance: 0,
        picktyp: 0,
        magic_key: false,
        door: null,
        box: null,
    };
    return state.xlock;
}

// C ref: lock.c reset_pick() (258-266).
export function reset_pick(state = game) {
    const xlock = xlockContext(state);
    xlock.usedtime = 0;
    xlock.chance = 0;
    xlock.picktyp = 0;
    xlock.magic_key = false;
    xlock.door = null;
    xlock.box = null;
}

// C ref: lock.c maybe_reset_pick() (268-285). obfree() passes the container
// being deleted; do.c goto_level() passes null, which keeps the context only
// when the box the hero was picking is carried and so travels with her.
export function maybe_reset_pick(container, state = game) {
    const xlock = xlockContext(state);
    if (container
        ? container === xlock.box
        // obj.h:332 carried().
        : (!xlock.box || xlock.box.where !== OBJ_INVENT))
        reset_pick(state);
}

// struct rm's shared door mask has two spellings in this port; js/mklev.js
// writes an ordinary dungeon door's to `flags` and the special-level paths
// write it to `doormask`, so every reader accepts either.
function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

// C ref: lock.c:352-354, pick_lock()'s three return values. The caller reads
// only whether the value is zero. C's own comment (349-352) hedges: giving a
// direction or resuming an interrupted attempt "usually" costs the hero a
// move, and being told "can't do that" before the prompt, or cancelling it
// with ESC, does not. Two arms of this port sit on the "usually" rather than
// the rule: a cancelled prompt answers PICKLOCK_DID_NOTHING (lock.c:427), and
// so does the pit refusal at lock.c:551-556, which follows the prompt but
// answers no time anyway -- C's comment there says #open does the same for the
// similar situation. Read each C return statement rather than deriving it.
export const PICKLOCK_LEARNED_SOMETHING = -1;
export const PICKLOCK_DID_NOTHING = 0;
export const PICKLOCK_DID_SOMETHING = 1;

// C ref: lock.c pick_lock() (356-656), the arm apply.c doapply() reaches when
// the hero applies a lock pick, a credit card or a skeleton key and names the
// direction herself.
//
// Covered: the entry with autounlock FALSE, the interrupted-attempt test,
// get_adjacent_loc()'s prompt and both of its refusals, the pit refusal that
// opens the adjacent-square branch, the whole `!IS_DOOR(door->typ)` arm, and
// three arms of the doormask switch.
//
// Not covered, each stopping by name: every autounlock caller, which arrives
// with coordinates or a container and needs flags.autounlock, ynq(),
// touch_artifact() and autokey(); do_loot_cont()'s Null `pick`, which stands
// in a zeroed object whose otyp is STRANGE_OBJECT; resuming an interrupted
// attempt, which needs lock_action(), is_magic_key() and the picklock()
// occupation; the container branch, which needs can_reach_floor(), safe_qbuf()
// and ynq(); the monster and door-mimic arms, which need mon_nam(),
// verbalize(), stumble_onto_mimic() and maybe_absorb_item(); and the switch's
// default arm with the tail below it, which is the whole lock-picking attempt.
//
// The monster refusal is deliberately wider than C's two arms: C falls
// through to the doormask switch for a monster that is neither seen nor a door
// mimic, and this stops for any monster on the square, because the two tests
// that separate them lead nowhere else yet.
//
// lock.c:414-418's impossible() cannot fire. doapply()'s LOCK_PICK,
// CREDIT_CARD and SKELETON_KEY arm is the only ported caller, so picktyp is
// always one of the three otyps that test admits.
export async function pick_lock(pick, rx, ry, container, state = game) {
    const u = state.u;
    // lock.c:370. Both autounlock entries stop before anything is read: the
    // door and container callers in hack.c and pickup.c pass coordinates or a
    // box, and this port refuses them at their own call sites as well.
    if (rx !== 0 || container)
        throw new UnsupportedLockError('an autounlock attempt');
    // lock.c:373-376.
    if (!pick)
        throw new UnsupportedLockError("do_loot_cont()'s Null pick");
    const picktyp = pick.otyp;

    // lock.c:379-403. picklock(), the occupation this port has not ported, is
    // the only writer of a nonzero gx.xlock.usedtime, so the test reads 0 on
    // every call today. It stops rather than falls through, so that porting
    // the occupation cannot slip a resumed attempt into the first-attempt
    // path unnoticed.
    const xlock = xlockContext(state);
    if (xlock.usedtime && picktyp === xlock.picktyp)
        throw new UnsupportedLockError('resuming an interrupted attempt');

    // lock.c:405-412. doapply() answers nohands() before it reaches this
    // switch, so only an engulfed hero can arrive here; both need doname() or
    // mon_nam() for their message.
    if (nohands(state.youmonst.data))
        throw new UnsupportedLockError("pick_lock()'s no-hands message");
    if (u.uswallow)
        throw new UnsupportedLockError("pick_lock()'s engulfed message");

    const cc = { x: 0, y: 0 };
    // lock.c:424-427. The prompt is getdir()'s default, "In what direction?".
    if (!await get_adjacent_loc(
        null, 'Invalid location!', u.ux, u.uy, cc, state,
    ))
        return PICKLOCK_DID_NOTHING;

    // lock.c:429. The self keys and the two vertical keys all leave u.dx and
    // u.dy zero, so cc names the hero's own square and C looks for a container
    // there instead of a door.
    if (u_at(cc.x, cc.y, state))
        throw new UnsupportedLockError("a lock at the hero's own square");

    /* not the hero's location; pick the lock in an adjacent door */
    // lock.c:551-556. C's comment records why this one costs no time: the
    // '#open' command does not spend a turn on the same situation.
    if (u.utrap && u.utraptype === TT_PIT) {
        await ttyPline("You can't reach over the edge of the pit.", state);
        return PICKLOCK_DID_NOTHING;
    }

    const door = state.level.at(cc.x, cc.y);
    if (m_at(cc.x, cc.y, state))
        throw new UnsupportedLockError('a monster on the chosen square');

    // lock.c:578-593. Nothing is unlocked here: the hero learns what the
    // square really holds, and whether that was news decides whether the
    // attempt costs a turn.
    if (!IS_DOOR(door.typ)) {
        let res = PICKLOCK_DID_NOTHING;
        const oldglyph = door.remembered_glyph;
        const oldlastseentyp = update_mapseen_for(cc.x, cc.y, state);

        /* this is probably only relevant when blind */
        feel_location(cc.x, cc.y, state);
        // C compares two glyph numbers; same_remembered_glyph() explains why
        // this port cannot compare the records with `!==`. The common answer
        // for a sighted hero beside a lit room square is that the glyph did
        // change, because feel_location()'s tail moves map memory from S_room
        // to S_darkroom; a wall square the hero already sees changes neither.
        // update_mapseen_for() above has already built svl.lastseentyp, so
        // this index needs no guard of its own.
        if (!same_remembered_glyph(oldglyph, door.remembered_glyph)
            || state.level.lastseentyp[cc.x][cc.y] !== oldlastseentyp)
            res = PICKLOCK_LEARNED_SOMETHING;

        const blind = heroIsBlind(state);
        if (is_drawbridge_wall(cc.x, cc.y, state))
            await ttyPline(
                `You ${blind ? 'feel' : 'see'} no lock on the drawbridge.`,
                state,
            );
        else
            await ttyPline(
                `You ${blind ? 'feel' : 'see'} no door there.`, state,
            );
        return res;
    }

    // lock.c:594-647. C switches on the whole doormask, so a door carrying
    // D_TRAPPED or D_LOCKED beside one of these three values lands on
    // `default` rather than on the arm its low bit names.
    switch (doorMask(door)) {
    case D_NODOOR:
        await ttyPline('This doorway has no door.', state);
        return PICKLOCK_LEARNED_SOMETHING;
    case D_ISOPEN:
        await ttyPline('You cannot lock an open door.', state);
        return PICKLOCK_LEARNED_SOMETHING;
    case D_BROKEN:
        await ttyPline('This door is broken.', state);
        return PICKLOCK_LEARNED_SOMETHING;
    default:
        throw new UnsupportedLockError('locking or unlocking a door');
    }
}

// C ref: lock.c:859-873, the switch that names a door doopen_indir() cannot
// pull at. It is translated whole because it is one statement, but only its
// default arm is live.
//
// The reason is the seam's own mask guard, not closed_door(). closed_door() is
// a bit test (`doormask & (D_LOCKED | D_CLOSED)`), so it admits D_TRAPPED
// combinations as well; what narrows the input here is
// requireAutoopenClosedDoor() in js/hack.js, which admits D_CLOSED, D_LOCKED
// and D_LOCKED | D_TRAPPED alone. The first takes lock.c:904's roll rather
// than this switch, so this function sees the two locked masks, both of which
// land on `default`. The three doorless masks arrive only through doopen(),
// the unported `#open` command.
//
// C also sets a `locked` flag in the default arm; see the caller for why this
// port has no reader for it.
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
