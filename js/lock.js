// lock.js — opening, closing, and unlocking doors and containers, owned by
// lock.c. See each header comment for the branches it covers.

import {
    A_CON,
    A_DEX,
    A_STR,
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_UNTRAP,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    ECMD_OK,
    ECMD_TIME,
    IS_DOOR,
    OBJ_INVENT,
    TT_PIT,
    u_at,
} from './const.js';
import { is_magic_key } from './artifacts.js';
import { acurrstr, effective_attribute, exercise } from './attrib.js';
import { get_adjacent_loc, set_occupation, yn_function } from './cmd.js';
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
import { PM_ROGUE } from './monsters.js';
import {
    CREDIT_CARD,
    LOCK_PICK,
    SKELETON_KEY,
} from './objects.js';
import { encumber_msg } from './pickup.js';
import { is_quest_artifact } from './questpgr.js';
import { rn2, rnl } from './rng.js';
import {
    heroIsBlind,
    is_drawbridge_wall,
    messageAt,
} from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { recalc_block_point } from './vision.js';
import { yname } from './objnam.js';

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
// occupation; this is its single owner. pick_lock() writes to it at the end
// of a new attempt (lock.c:645-654), and picklock() reads it every turn.
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

// C ref: lock.c lock_action() (37-64). Returns a string describing the
// current lock-picking activity for set_occupation()'s occtxt and for the
// "You give up your attempt at <lock_action>." message.
function lock_action(state = game) {
    const xlock = xlockContext(state);
    /* if the target is currently unlocked, we're trying to lock it now */
    if (xlock.door && !(doorMask(xlock.door) & D_LOCKED))
        return 'locking the door';
    if (xlock.box && !xlock.box.olocked)
        throw new UnsupportedLockError('lock_action() for a box');
    /* otherwise we're trying to unlock it */
    if (xlock.picktyp === LOCK_PICK)
        return 'picking the lock';
    if (xlock.picktyp === CREDIT_CARD)
        return 'picking the lock'; /* same as lock_pick */
    if (xlock.door)
        return 'unlocking the door';
    if (xlock.box)
        throw new UnsupportedLockError('lock_action() for a box');
    return 'picking the lock';
}

// C ref: lock.c picklock() (67-159), the occupation callback that runs once
// per turn while the hero picks a lock. It rolls rn2(100) against the chance
// computed in pick_lock(), and on success changes D_LOCKED to D_CLOSED (for a
// door) or toggles olocked (for a box).
//
// Covered: the door arm with its doormask sanity checks, the 50-turn timeout,
// the success roll, the plain-success path that flips D_LOCKED to D_CLOSED or
// D_CLOSED to D_LOCKED, and the exercise() calls.
//
// Not covered, each throwing: the box arm (box paths), the magic-key trap
// detection arm (lock.c:101-136), and the door-trap arm (lock.c:140-146) that
// fires b_trapped() and destroys the door.
async function picklock(state = game) {
    const xlock = xlockContext(state);
    const u = state.u;

    if (xlock.box) {
        throw new UnsupportedLockError('picklock() box arm');
    }
    /* door */
    if (xlock.door !== state.level.at(u.ux + u.dx, u.uy + u.dy)) {
        return (xlock.usedtime = 0); /* you moved */
    }
    switch (doorMask(xlock.door)) {
    case D_NODOOR:
        await ttyPline('This doorway has no door.', state);
        return (xlock.usedtime = 0);
    case D_ISOPEN:
        await ttyPline('You cannot lock an open door.', state);
        return (xlock.usedtime = 0);
    case D_BROKEN:
        await ttyPline('This door is broken.', state);
        return (xlock.usedtime = 0);
    }

    if (xlock.usedtime++ >= 50 || nohands(state.youmonst.data)) {
        await ttyPline(
            `You give up your attempt at ${lock_action(state)}.`, state,
        );
        await exercise(A_DEX, true, state, { rn2 }, {
            encumberMessage: encumber_msg,
        }); /* even if you don't succeed */
        return (xlock.usedtime = 0);
    }

    if (rn2(100) >= xlock.chance)
        return 1; /* still busy */

    // lock.c:101-136. The magic-key trap detection arm fires when the target
    // is trapped and xlock.magic_key is set. That combination requires the
    // Master Key of Thievery, which no development session carries.
    // xlock.box is refused at line 140; only xlock.door reaches here.
    if ((doorMask(xlock.door) & D_TRAPPED) !== 0 && xlock.magic_key) {
        throw new UnsupportedLockError('magic-key trap detection in picklock()');
    }

    await ttyPline(`You succeed in ${lock_action(state)}.`, state);
    if (xlock.door) {
        if (doorMask(xlock.door) & D_TRAPPED) {
            // lock.c:141-146. b_trapped() fires the door trap. This path
            // needs b_trapped(), unblock_point(), in_rooms(), add_damage(),
            // and newsym().
            throw new UnsupportedLockError('door trap in picklock()');
        } else if (doorMask(xlock.door) & D_LOCKED) {
            xlock.door.flags = D_CLOSED;
            xlock.door.doormask = D_CLOSED;
        } else {
            xlock.door.flags = D_LOCKED;
            xlock.door.doormask = D_LOCKED;
        }
    } else {
        throw new UnsupportedLockError('picklock() box toggle');
    }
    await exercise(A_DEX, true, state, { rn2 }, {
        encumberMessage: encumber_msg,
    });
    return (xlock.usedtime = 0);
}

// C ref: lock.c autokey() (288-344). Scans inventory for the best unlocking
// tool. Prefers mundane or own-role quest artifacts over another role's quest
// artifact; among mundane items, prefers skeleton key over lock pick over
// credit card. When `opening` is false, credit cards are excluded (they can
// only unlock, not lock).
//
// any_quest_artifact(o) is true when o.oartifact >= ART_ORB_OF_DETECTION (21).
// is_quest_artifact(o) is true when o.oartifact equals the hero's own role's
// quest artifact. So an item that is any_quest_artifact but not
// is_quest_artifact is another role's quest artifact.
export function autokey(opening, state = game) {
    let key = null, pick = null, card = null;
    let akey = null, apick = null, acard = null;
    const ART_ORB_OF_DETECTION = 21; // obj.h any_quest_artifact threshold

    for (let o = state.invent; o; o = o.nobj) {
        const isAnyQuestArt = o.oartifact >= ART_ORB_OF_DETECTION;
        const isOwnQuestArt = is_quest_artifact(o, state);
        if (isAnyQuestArt && !isOwnQuestArt) {
            // Another role's quest artifact.
            switch (o.otyp) {
            case SKELETON_KEY: if (!akey) akey = o; break;
            case LOCK_PICK:    if (!apick) apick = o; break;
            case CREDIT_CARD:  if (!acard) acard = o; break;
            }
        } else {
            switch (o.otyp) {
            case SKELETON_KEY:
                if (!key || is_magic_key(state.youmonst, o, state)) key = o;
                break;
            case LOCK_PICK:  if (!pick) pick = o; break;
            case CREDIT_CARD: if (!card) card = o; break;
            }
        }
    }
    if (!opening)
        card = acard = null;
    /* only resort to other role's quest artifact if no other choice */
    if (!key && !pick && !card) key = akey;
    if (!pick && !card) pick = apick;
    if (!card) card = acard;
    return key ?? pick ?? card ?? null;
}

// C ref: hack.h:1330.  ynq(query) = yn_function(query, ynqchars, 'q', TRUE).
// The addcmdq TRUE tells C to push the answer onto CQ_REPEAT so that a
// repeated command replays it; the port's yn_function() throws on
// addcmdq=true because CQ_REPEAT is not ported, but the autounlock path that
// calls this is never repeated, so passing false is safe here.
const YNQCHARS = 'ynq';
async function ynq(query, state = game) {
    const KEY_Q = 'q'.charCodeAt(0);
    const KEY_Y = 'y'.charCodeAt(0);
    const c = await yn_function(query, YNQCHARS, 'q', false, state);
    if (c === KEY_Y) return 'y';
    if (c === KEY_Q) return 'q';
    return 'n';
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
// direction herself, and the arm doopen_indir() reaches through the autounlock
// apply-key path.
//
// Covered: the entry with autounlock FALSE, the interrupted-attempt test,
// get_adjacent_loc()'s prompt and both of its refusals, the pit refusal that
// opens the adjacent-square branch, the whole `!IS_DOOR(door->typ)` arm, three
// arms of the doormask switch, and the switch's default arm with the tail that
// sets up the picklock() occupation. The autounlock door path (rx nonzero,
// container null) is also covered for the AUTOUNLOCK_APPLY_KEY case.
//
// Not covered, each stopping by name: do_loot_cont()'s Null `pick`; resuming
// an interrupted attempt; the container branch (u_at); the monster and
// door-mimic arms; AUTOUNLOCK_UNTRAP; autounlock on containers; the
// touch_artifact() guard for autounlock.
//
// The monster refusal is deliberately wider than C's two arms: C falls
// through to the doormask switch for a monster that is neither seen nor a door
// mimic, and this stops for any monster on the square, because the two tests
// that separate them lead nowhere else yet.
export async function pick_lock(pick, rx, ry, container, state = game) {
    const u = state.u;
    // lock.c:370. A non-null container is the autounlock container path, which
    // is not ported.
    if (container)
        throw new UnsupportedLockError('autounlock on a container');
    const autounlock = (rx !== 0);

    // lock.c:373-376.
    if (!pick)
        throw new UnsupportedLockError("do_loot_cont()'s Null pick");
    const picktyp = pick.otyp;

    // lock.c:379-403. Resuming an interrupted attempt.
    const xlock = xlockContext(state);
    if (xlock.usedtime && picktyp === xlock.picktyp)
        throw new UnsupportedLockError('resuming an interrupted attempt');

    // lock.c:405-412.
    if (nohands(state.youmonst.data))
        throw new UnsupportedLockError("pick_lock()'s no-hands message");
    if (u.uswallow)
        throw new UnsupportedLockError("pick_lock()'s engulfed message");

    let ch; // chance value for the occupation
    const cc = { x: 0, y: 0 };

    if (rx !== 0) { // autounlock; caller has provided coordinates
        cc.x = rx;
        cc.y = ry;
    } else if (!await get_adjacent_loc(
        null, 'Invalid location!', u.ux, u.uy, cc, state,
    )) {
        return PICKLOCK_DID_NOTHING;
    }

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

    // lock.c:594-647.
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
    default: {
        // lock.c:604-647. The default arm covers D_LOCKED, D_CLOSED, and
        // any combination with D_TRAPPED.

        // lock.c:605-613. AUTOUNLOCK_UNTRAP checks for door traps before
        // attempting to pick the lock. Not ported.
        if ((state.flags?.autounlock & AUTOUNLOCK_UNTRAP) !== 0) {
            throw new UnsupportedLockError('AUTOUNLOCK_UNTRAP door path');
        }

        // lock.c:615-618. Credit cards can only unlock, not lock.
        if (picktyp === CREDIT_CARD && !(doorMask(door) & D_LOCKED)) {
            await ttyPline("You can't lock a door with a credit card.", state);
            return PICKLOCK_LEARNED_SOMETHING;
        }

        // lock.c:620-626. "Unlock it?" / "Lock it?" prompt with the tool name
        // included for autounlock.
        const locked = (doorMask(door) & D_LOCKED) !== 0;
        const qbuf = `${locked ? 'Unlock' : 'Lock'} it`
            + (autounlock ? ` with ${yname(pick, state)}` : '')
            + '?';
        const c = await ynq(qbuf, state);
        if (c !== 'y')
            return PICKLOCK_DID_NOTHING;

        // lock.c:629-630. touch_artifact() guard for autounlock. Not ported.
        if (autounlock) {
            // touch_artifact() is not ported; for the common case the hero's
            // own mundane lock pick never triggers it, so skip it silently
            // when the pick is not an artifact.
            if (pick.oartifact)
                throw new UnsupportedLockError('touch_artifact() for autounlock');
        }

        // lock.c:632-644. Compute chance based on tool type and role.
        const isRogue = (state.urole?.mnum === PM_ROGUE) ? 1 : 0;
        switch (picktyp) {
        case CREDIT_CARD:
            ch = 2 * effective_attribute(state, A_DEX) + 20 * isRogue;
            break;
        case LOCK_PICK:
            ch = 3 * effective_attribute(state, A_DEX) + 30 * isRogue;
            break;
        case SKELETON_KEY:
            ch = 70 + effective_attribute(state, A_DEX);
            break;
        default:
            ch = 0;
        }
        xlock.door = door;
        xlock.box = null;
    }
    }
    // lock.c:649-655. Set up the occupation.
    state.context.move = 0;
    xlock.chance = ch;
    xlock.picktyp = picktyp;
    xlock.magic_key = is_magic_key(state.youmonst, pick, state);
    xlock.usedtime = 0;
    set_occupation(picklock, lock_action(state), 0, state);
    return PICKLOCK_DID_SOMETHING;
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
// the autounlock apply-key path through pick_lock(), and the `door is known to
// be CLOSED` roll with both of its outcomes.
//
// Not covered, because js/hack.js refuses each state before the walk is
// admitted: nohands(), u.utrap, stumble_on_door_mimic(), the Confusion and
// Stunned `res = ECMD_TIME`, drawbridges and portcullises, a square that is
// not a door, the kick arm, verysmall(), and the D_TRAPPED half of the
// success arm with its b_trapped() and shop add_damage() bookkeeping.
export async function doopen_indir(x, y, state = game, env = {}) {
    // Reject unknown keys so a test substitution cannot silently fall through
    // to the real operation.
    for (const name of Object.keys(env)) {
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
        // lock.c:876-894. Offer a locked door to flags.autounlock.
        let res = ECMD_OK;
        const locked = (doorMask(door) & D_LOCKED) !== 0;
        if (locked && state.flags?.autounlock) {
            const autounlockFlags = state.flags.autounlock;
            state.u.dz = 0; /* should already be 0 since hero moved toward door */
            if ((autounlockFlags & AUTOUNLOCK_APPLY_KEY) !== 0) {
                const unlocktool = autokey(true, state);
                if (unlocktool) {
                    res = (await pick_lock(unlocktool, x, y, null, state))
                        ? ECMD_TIME : ECMD_OK;
                }
            }
            // lock.c:884-893. AUTOUNLOCK_KICK asks "Kick it?" and queues
            // dokick. js/hack.js refuses that before the walk is admitted.
        }
        return res;
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
