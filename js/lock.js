// lock.js — opening, closing, and unlocking doors and containers, owned by
// lock.c. See each header comment for the branches it covers.

import {
    A_CON,
    A_DEX,
    A_STR,
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_KICK,
    AUTOUNLOCK_UNTRAP,
    CONFUSION,
    COST_BRKLCK,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    IS_DOOR,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPE,
    OBJ_AT,
    OBJ_FLOOR,
    OBJ_INVENT,
    P_DAGGER,
    P_FLAIL,
    P_LANCE,
    PASSES_WALLS,
    STUNNED,
    TT_PIT,
    isok,
    u_at,
} from './const.js';
import { is_magic_key } from './artifacts.js';
import { acurrstr, effective_attribute, exercise } from './attrib.js';
import {
    get_adjacent_loc,
    getdir,
    set_occupation,
    yn_function,
} from './cmd.js';
import {
    feel_location,
    feel_newsym,
    newsym,
    same_remembered_glyph,
} from './display.js';
import { update_mapseen_for } from './dungeon.js';
import { can_reach_floor, cant_reach_floor } from './engrave.js';
import { game } from './gstate.js';
import {
    delobj,
    obj_extract_self,
    obfree,
    stackobj,
    useup,
} from './invent.js';
import { m_at } from './monst.js';
import { wake_nearby } from './mon.js';
import { nohands, verysmall } from './mondata.js';
import { PM_ROGUE } from './monsters.js';
import { obj_resists } from './bury.js';
import {
    costly_alteration,
    greatest_erosion,
    is_blade,
    is_pick,
    is_weptool,
    objectType,
    place_object,
    remove_object,
} from './obj.js';
import {
    CHEST,
    CREDIT_CARD,
    LARGE_BOX,
    PAPER,
    LOCK_PICK,
    ROCK_CLASS,
    SKELETON_KEY,
    WEAPON_CLASS,
} from './objects.js';
import { closed_door } from './monmove.js';
import {
    an,
    ansimpleoname,
    donameFresh,
    safe_qbuf,
    simple_typename,
    singular,
    the,
    xnameFresh,
    yname,
} from './objnam.js';
import { container_at, doloot, encumber_msg } from './pickup.js';
import { is_quest_artifact } from './questpgr.js';
import { rn2, rnl } from './rng.js';
import { costly_spot } from './shk.js';
import { is_lava, is_pool } from './trap.js';
import {
    heroIsBlind,
    is_db_wall,
    is_drawbridge_wall,
    messageAt,
} from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { block_point, recalc_block_point } from './vision.js';
import { setnotworn } from './worn.js';

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

// C ref: lock.c chest_shatter_msg() (1275-1318). This slice reaches the PAPER
// arm only; the remaining material messages and potion breathing stay at the
// source boundary until their owning slices are selected.
async function chest_shatter_msg(otmp, state = game) {
    if (objectType(otmp, state).oc_material !== PAPER) {
        throw new UnsupportedLockError(
            'chest_shatter_msg() for a non-PAPER object',
        );
    }
    // C temporarily blinds the naming code so xname() does not reveal details
    // while composing this message. The JS xname path has no such global side
    // effect, so singular() is the complete equivalent for this object arm.
    const thing = singular(otmp, xnameFresh, state);
    const subject = an(thing);
    await ttyPline(`${subject[0].toUpperCase()}${subject.slice(1)} is torn to shreds!`, state);
}

// C ref: lock.c breakchestlock() (162-212). Called after the hero forces a
// chest lock open. When destroyit is false, the box is billed via
// costly_alteration() and its lock flags are toggled. When destroyit is true,
// this slice destroys an ordinary non-shop chest, scatters its contents, and
// cleans up the lock-picking context.
//
// Covered: the destroyit=false arm and the destroyit=true arm for an ordinary
// non-shop CHEST with PAPER contents, including quantity-one obfree(), the
// survivor placement/stacking path, chest deletion, and lock cleanup.
// Deferred: shop billing, potion breathing, other material messages, ICE_BOX
// corpse timers, and the multi-quantity useup branch.
async function breakchestlock(box, destroyit, state = game) {
    if (destroyit) {
        // The shopkeeper lookup and stolen_value() accounting in C are outside
        // this ordinary-chest slice. Reject that branch before mutating the
        // container or spending any content randomness.
        if (costly_spot(state.u.ux, state.u.uy, state)) {
            throw new UnsupportedLockError(
                'breakchestlock() shop billing (destroyit=true)',
            );
        }

        await ttyPline(
            `In fact, you've totally destroyed ${the(xnameFresh(box, state), state)}.`,
            state,
        );
        while (box.cobj) {
            const otmp = box.cobj;
            // C extracts each child before deciding whether it shatters, so a
            // destroyed object is free for obfree() and a survivor is ready
            // for place_object().
            obj_extract_self(otmp, { state });
            if (!rn2(3)) {
                await chest_shatter_msg(otmp, state);
                if (otmp.quan === 1) {
                    obfree(otmp, null, { state });
                    continue;
                }
                // This is source-faithful for completeness, but the selected
                // slice does not admit multi-quantity witnesses yet.
                useup(otmp, { state });
            }
            place_object(otmp, state.u.ux, state.u.uy, { state });
            stackobj(otmp, {
                state,
                hooks: { extractExternalObject: remove_object },
            });
        }
        delobj(box, {
            state,
            random: { rn2 },
            hooks: {
                extractExternalObject: remove_object,
                resetPick: (_obj, env) => reset_pick(env.state),
            },
        });
        return;
    }
    /* bill for the box but not for its contents */
    const hideContents = box.cobj;
    box.cobj = null;
    // C ref: mkobj.c costly_alteration() checks costly_spot() and returns
    // early when the object is not on a shop tile.  The JS port's
    // costly_alteration() delegates to a hook; provide one that mirrors the
    // C early-return for non-shop tiles and flags shop tiles as unported.
    costly_alteration(box, COST_BRKLCK, {
        state,
        hooks: {
            costlyAlteration(obj, alterType, env) {
                const ox = obj.ox ?? state.u.ux;
                const oy = obj.oy ?? state.u.uy;
                if (!costly_spot(ox, oy, state)) return;
                throw new UnsupportedLockError(
                    'breakchestlock() shop billing (costly_alteration in shop)',
                );
            },
        },
    });
    box.cobj = hideContents;
    box.olocked = 0;
    box.obroken = 1;
    box.lknown = 1;
}

// C ref: lock.c forcelock() (216-256), the occupation callback that runs once
// per turn while the hero forces a chest lock. It checks whether the box has
// moved, enforces the 50-turn timeout, and rolls rn2(100) against the chance
// computed in doforce(). On success it prints the message and calls
// breakchestlock().
//
// Covered: the blade path (picktyp=true) where the weapon can break on
// rn2(1000-spe), the blunt-weapon path (picktyp=false) with wake_nearby(),
// the rn2(100) chance roll, the success message, and breakchestlock(destroyit)
// where destroyit = !picktyp && !rn2(3).
async function forcelock(state = game) {
    const xlock = xlockContext(state);
    const u = state.u;

    // lock.c:218-219. Box or hero moved.
    if (xlock.box.ox !== u.ux || xlock.box.oy !== u.uy)
        return (xlock.usedtime = 0);

    // lock.c:221-226. 50-turn timeout or lost weapon/hands.
    if (xlock.usedtime++ >= 50 || !state.uwep
        || nohands(state.youmonst.data)) {
        await ttyPline('You give up your attempt to force the lock.', state);
        if (xlock.usedtime >= 50) /* you made the effort */
            await exercise(
                xlock.picktyp ? A_DEX : A_STR, true, state, { rn2 },
                { encumberMessage: encumber_msg },
            );
        return (xlock.usedtime = 0);
    }

    // lock.c:228-240. Blade path: the weapon can break.
    if (xlock.picktyp) {
        const uwep = state.uwep;
        // C: rn2(1000 - (int) uwep->spe) > (992 - greatest_erosion(uwep) * 10)
        // For a +0 weapon, probability that it survives an unsuccessful
        // attempt to force the lock is (.992)^50 = .67
        if (rn2(1000 - Math.trunc(uwep.spe ?? 0))
            > (992 - greatest_erosion(uwep) * 10)
            && !uwep.cursed
            && !obj_resists(uwep, 0, 99, { state, random: { rn2 } })) {
            const prefix = (uwep.quan > 1) ? 'One of y' : 'Y';
            await ttyPline(
                `${prefix}our ${xnameFresh(uwep, state)} broke!`, state,
            );
            // useup() removes one from the stack or the whole object if
            // quan == 1. A wielded weapon has owornmask = W_WEP, so
            // useupall() needs the setNotWorn hook to clear it. cancelDoff
            // and monsterUnseesProperty are no-ops: no doff is active for a
            // weapon mid-force, and a normal blade's oc_oprop is 0.
            useup(uwep, {
                state,
                hooks: {
                    setNotWorn: (obj, env) => setnotworn(obj, env),
                    cancelDoff() {},
                    monsterUnseesProperty() {},
                },
            });
            await ttyPline(
                'You give up your attempt to force the lock.', state,
            );
            await exercise(
                A_DEX, true, state, { rn2 },
                { encumberMessage: encumber_msg },
            );
            return (xlock.usedtime = 0);
        }
    } else {
        // lock.c:241-242. Blunt: wake nearby monsters due to hammering.
        await wake_nearby({ state });
    }

    // lock.c:244-245. Still busy.
    if (rn2(100) >= xlock.chance)
        return 1;

    // lock.c:247-254. Success.
    await ttyPline('You succeed in forcing the lock.', state);
    await exercise(
        xlock.picktyp ? A_DEX : A_STR, true, state, { rn2 },
        { encumberMessage: encumber_msg },
    );
    // breakchestlock() might destroy xlock.box; if so, xlock context will
    // be cleared (delobj -> obfree -> maybe_reset_pick); but it might not,
    // so explicitly clear that manually.
    const destroyit = !xlock.picktyp && !rn2(3);
    await breakchestlock(xlock.box, destroyit, state);
    reset_pick(state);

    return 0;
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
        return xlock.box.otyp === CHEST
            ? 'locking the chest' : 'locking the box';
    /* otherwise we're trying to unlock it */
    if (xlock.picktyp === LOCK_PICK)
        return 'picking the lock';
    if (xlock.picktyp === CREDIT_CARD)
        return 'picking the lock'; /* same as lock_pick */
    if (xlock.door)
        return 'unlocking the door';
    if (xlock.box)
        return xlock.box.otyp === CHEST
            ? 'unlocking the chest' : 'unlocking the box';
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
// Not covered, each throwing: the magic-key trap detection arm
// (lock.c:101-136), and the door-trap arm (lock.c:140-146) that fires
// b_trapped() and destroys the door.
async function picklock(state = game) {
    const xlock = xlockContext(state);
    const u = state.u;

    if (xlock.box) {
        // lock.c:69-74. A box is picked on the hero's square, not at the
        // direction retained in u.dx/u.dy.
        if (xlock.box.where !== OBJ_FLOOR
            || xlock.box.ox !== u.ux || xlock.box.oy !== u.uy)
            return (xlock.usedtime = 0);
    } else {
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
    if ((xlock.box ? xlock.box.otrapped
        : (doorMask(xlock.door) & D_TRAPPED) !== 0) && xlock.magic_key) {
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
    } else if (xlock.box) {
        // lock.c:148-153. The selected ordinary box simply changes lock
        // state; trap handling is deliberately outside this witness.
        if (xlock.box.otrapped)
            throw new UnsupportedLockError('picklock() trapped box');
        xlock.box.olocked = xlock.box.olocked ? 0 : 1;
        xlock.box.lknown = 1;
    } else {
        throw new UnsupportedLockError('picklock() without a door or box');
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
// get_adjacent_loc()'s prompt and both of its refusals, the ordinary floor-box
// arm, the pit refusal that opens the adjacent-square branch, the whole
// `!IS_DOOR(door->typ)` arm, three arms of the doormask switch, and the
// switch's default arm with the tail that sets up the picklock() occupation.
// The autounlock door path (rx nonzero, container null) is also covered for
// the AUTOUNLOCK_APPLY_KEY case. The ordinary autounlock floor-box path with
// a supplied container is covered for a mundane lock pick.
//
// Not covered, each stopping by name: do_loot_cont()'s Null `pick`; resuming
// an interrupted attempt; the monster and
// door-mimic arms; AUTOUNLOCK_UNTRAP; other tool types; and the
// touch_artifact() guard for autounlock.
//
// The monster refusal is deliberately wider than C's two arms: C falls
// through to the doormask switch for a monster that is neither seen nor a door
// mimic, and this stops for any monster on the square, because the two tests
// that separate them lead nowhere else yet.
export async function pick_lock(pick, rx, ry, container, state = game) {
    const u = state.u;
    // lock.c:370. Either supplied coordinate or container state marks this as
    // an autounlock call. do_loot_cont() supplies both for a floor box.
    const autounlock = (rx !== 0 || container != null);

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

    // lock.c:429-550. The self keys and the two vertical keys all leave u.dx
    // and u.dy zero, so cc names the hero's own square and C looks for a
    // container there instead of a door. The autounlock container call uses
    // the same arm, but filters the object list to its supplied container.
    if (u_at(cc.x, cc.y, state)) {
        if (u.dz < 0 && !autounlock)
            throw new UnsupportedLockError(
                'pick_lock() stale upward container direction',
            );
        if (is_lava(u.ux, u.uy, state) || is_pool(u.ux, u.uy, state))
            throw new UnsupportedLockError(
                'pick_lock() container on lava or water',
            );

        let count = 0;
        let selected = null;
        let answer = 'n';
        for (let otmp = state.level.objects[cc.x][cc.y] ?? null;
            otmp;
            otmp = otmp.nexthere) {
            if (autounlock && otmp !== container) continue;
            if (!Is_box(otmp)) continue;
            count++;
            if (!can_reach_floor(true, state))
                throw new UnsupportedLockError(
                    'pick_lock() container beyond reachable floor',
                );

            let verb;
            let it = false;
            if (otmp.obroken) verb = 'fix';
            else if (!otmp.olocked) {
                verb = 'lock';
                it = true;
            } else if (picktyp !== LOCK_PICK) {
                verb = 'unlock';
                it = true;
            } else verb = 'pick';

            otmp.lknown = 1;
            if (autounlock
                && (state.flags?.autounlock & AUTOUNLOCK_UNTRAP) !== 0) {
                throw new UnsupportedLockError(
                    'AUTOUNLOCK_UNTRAP container path',
                );
            } else if (autounlock
                       && (state.flags?.autounlock & AUTOUNLOCK_APPLY_KEY) !== 0) {
                // lock.c:526-533. Autounlock has already identified the box,
                // so it asks only whether to use the selected tool rather
                // than repeating the ordinary manual "There is ..." query.
                answer = await ynq(
                    `Unlock it with ${yname(pick, state)}?`, state,
                );
                if (answer !== 'y') return PICKLOCK_DID_NOTHING;
            } else {
                const qbuf = safe_qbuf(
                    'There is ', ` here; ${verb} ${it ? 'it' : 'its lock'}?`,
                    otmp, donameFresh, ansimpleoname, 'a box', state,
                );
                answer = await ynq(qbuf, state);
                if (answer === 'q') return PICKLOCK_DID_NOTHING;
                if (answer === 'n') continue;
            }
            selected = otmp;
            break;
        }

        if (answer !== 'y') {
            if (!count)
                await ttyPline(
                    "There doesn't seem to be any sort of lock here.",
                    state,
                );
            return PICKLOCK_LEARNED_SOMETHING;
        }

        if (selected.obroken) {
            await ttyPline(
                `You can't fix its broken lock with ${ansimpleoname(pick, state)}.`,
                state,
            );
            return PICKLOCK_LEARNED_SOMETHING;
        }
        if (picktyp === CREDIT_CARD && !selected.olocked) {
            await ttyPline(
                `You can't do that with ${an(simple_typename(picktyp, state))}.`,
                state,
            );
            return PICKLOCK_LEARNED_SOMETHING;
        }

        switch (picktyp) {
        case CREDIT_CARD:
            ch = effective_attribute(state, A_DEX)
                + 20 * ((state.urole?.mnum === PM_ROGUE) ? 1 : 0);
            break;
        case LOCK_PICK:
            ch = 4 * effective_attribute(state, A_DEX)
                + 25 * ((state.urole?.mnum === PM_ROGUE) ? 1 : 0);
            break;
        case SKELETON_KEY:
            ch = 75 + effective_attribute(state, A_DEX);
            break;
        default:
            ch = 0;
        }
        if (selected.cursed) ch = Math.trunc(ch / 2);
        xlock.box = selected;
        xlock.door = null;
    } else {
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

// C ref: lock.c u_have_forceable_weapon() (659-670). Pure: no RNG, no output,
// no state change. Returns true when the hero wields a weapon that can #force
// a lock. Weapons whose skill is in [P_DAGGER..P_LANCE] excluding P_FLAIL are
// accepted; rocks (gray stones, etc.) are also accepted, but tools that are
// not weptools and non-weapon-class items other than rocks are rejected.
export function u_have_forceable_weapon(state = game) {
    const uwep = state.uwep;
    if (!uwep) return false;
    if (uwep.oclass === WEAPON_CLASS || is_weptool(uwep, state)) {
        const skill = objectType(uwep, state).oc_subtyp;
        if (skill < P_DAGGER || skill === P_FLAIL || skill > P_LANCE)
            return false;
    } else if (uwep.oclass !== ROCK_CLASS) {
        return false;
    }
    return true;
}

// C ref: obj.h Is_box() (195-196). True for chests and large boxes.
function Is_box(obj) {
    return obj.otyp === CHEST || obj.otyp === LARGE_BOX;
}

// C ref: lock.c doforce() (676-756), the #force command handler. Scans the
// floor for locked boxes, prompts the hero with ynq(), and sets up the
// forcelock() occupation.
//
// Covered: the uswallow guard, u_have_forceable_weapon() refusal with all
// three message variants, can_reach_floor() refusal, the blunt-weapon path
// (picktyp=false), the box-scan loop with already-broken/unlocked messages,
// the ynq prompt, the "start bashing" message, and the set_occupation() tail.
//
// Not covered: the blade path (picktyp=true) is computed but reaches the same
// set_occupation() call. The resume path (xlock.usedtime nonzero) is wired.
export async function doforce(state = game) {
    const u = state.u;

    // lock.c:687-690.
    if (u.uswallow) {
        await ttyPline("You can't force anything from inside here.", state);
        return ECMD_OK;
    }
    // lock.c:691-700.
    if (!u_have_forceable_weapon(state)) {
        const uwep = state.uwep;
        const usePlural = uwep && uwep.quan > 1;
        let adj;
        if (!uwep) {
            adj = 'when not wielding a';
        } else if (uwep.oclass !== WEAPON_CLASS
            && !is_weptool(uwep, state)) {
            adj = usePlural ? 'without proper' : 'without a proper';
        } else {
            adj = usePlural ? 'with those' : 'with that';
        }
        await ttyPline(
            `You can't force anything ${adj} weapon${usePlural ? 's' : ''}.`,
            state,
        );
        return ECMD_OK;
    }
    // lock.c:702-704.
    if (!can_reach_floor(true, state)) {
        await cant_reach_floor(u.ux, u.uy, false, true, false, state, {
            pline: ttyPline,
        });
        return ECMD_OK;
    }

    const xlock = xlockContext(state);
    const uwep = state.uwep;
    const picktyp = is_blade(uwep, state) && !is_pick(uwep, state) ? 1 : 0;

    // lock.c:708-712. Resume an interrupted attempt.
    if (xlock.usedtime && xlock.box && picktyp === xlock.picktyp) {
        await ttyPline(
            'You resume your attempt to force the lock.', state,
        );
        set_occupation(forcelock, 'forcing the lock', 0, state);
        return ECMD_TIME;
    }

    // lock.c:715-748. Scan floor objects for a lockable box.
    xlock.box = null;
    const floorObjs = state.level?.objects?.[u.ux]?.[u.uy];
    for (let otmp = floorObjs ?? null; otmp; otmp = otmp.nexthere) {
        if (!Is_box(otmp)) continue;

        if (otmp.obroken || !otmp.olocked) {
            // lock.c:719-727. Already broken or unlocked.
            otmp.lknown = 0;
            await ttyPline(
                `There is ${donameFresh(otmp, state)} here, but its lock`
                + ` is already ${otmp.obroken ? 'broken' : 'unlocked'}.`,
                state,
            );
            otmp.lknown = 1;
            continue;
        }

        // lock.c:729-730.
        const qbuf = safe_qbuf(
            'There is ', ' here; force its lock?',
            otmp, donameFresh, donameFresh, 'a box', state,
        );
        otmp.lknown = 1;

        // lock.c:733-737.
        const c = await ynq(qbuf, state);
        if (c === 'q') return ECMD_OK;
        if (c === 'n') continue;

        // lock.c:739-748. Accepted.
        if (picktyp)
            await ttyPline(
                `You force ${yname(uwep, state)} into a crack and pry.`,
                state,
            );
        else
            await ttyPline(
                `You start bashing it with ${yname(uwep, state)}.`, state,
            );
        xlock.box = otmp;
        xlock.chance = objectType(uwep, state).oc_wldam * 2;
        xlock.picktyp = picktyp;
        xlock.magic_key = false;
        xlock.usedtime = 0;
        break;
    }

    // lock.c:751-755.
    if (xlock.box)
        set_occupation(forcelock, 'forcing the lock', 0, state);
    else
        await ttyPline('You decide not to force the issue.', state);
    return ECMD_TIME;
}

// C ref: lock.c:859-873, the switch that names a door doopen_indir() cannot
// pull at. It is translated whole because it is one statement, but only its
// default arm is live.
//
// The reason is the seam's own mask guard, not closed_door(). closed_door() is
// a bit test (`doormask & (D_LOCKED | D_CLOSED)`), so it admits D_TRAPPED
// combinations as well. The auto-open caller narrows its input through
// requireAutoopenClosedDoor() in js/hack.js, while explicit doopen() admits
// the broken, missing, already-open, and locked masks named by this switch.
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

// C ref: lock.c doopen() (773-776). The `o` command handler; delegates to
// doopen_indir(0, 0).
export async function doopen(state = game) {
    return doopen_indir(0, 0, state);
}

// C ref: lock.c doopen_indir() (780-923), translated whole. Two callers reach
// it: doopen() above passes (0, 0) and the hero chooses a direction; hack.c
// test_move() passes a nonzero <x,y> when the hero walks into a closed door
// with `autoopen` set, skipping the direction prompt and every precondition
// hack.js already refused.
//
// Covered: nohands, the pit dirprompt, get_adjacent_loc, the u_at -> doloot()
// redirect, the pit refusal, stumble_on_door_mimic, Confusion/Stunned,
// the glyph-comparison block, the portcullis and non-door messages (drawbridge,
// container_at, no-door), the doormask switch with the autounlock apply-key
// path, verysmall, and the `door is known to be CLOSED` roll with both of its
// outcomes.
//
// Not covered, each throwing: the D_TRAPPED half of the success arm with its
// b_trapped() and shop add_damage() bookkeeping, and the AUTOUNLOCK_KICK path
// that queues dokick with cmdq_add_dir().
export async function doopen_indir(x, y, state = game, env = {}) {
    // Reject unknown keys so a test substitution cannot silently fall through
    // to the real operation.
    for (const name of Object.keys(env)) {
        if (name !== 'message' && name !== 'random')
            throw new TypeError(`doopen_indir does not read env.${name}`);
    }
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rn2, rnl };
    const u = state.u;

    // lock.c:788-791. nohands check.
    if (nohands(state.youmonst.data)) {
        await message("You can't open anything -- you have no hands!", state);
        return ECMD_OK;
    }

    // lock.c:793-806. Direction: either passed or prompted.
    let dirprompt = null;
    if (u.utrap && u.utraptype === TT_PIT
        && container_at(u.ux, u.uy, false, state))
        dirprompt = 'Open where? [.>]';

    const cc = { x: 0, y: 0 };
    if (x > 0 && y >= 0) {
        // Nonzero <x,y> from the auto-open path.
        cc.x = x;
        cc.y = y;
    } else if (!await get_adjacent_loc(
        dirprompt, null, u.ux, u.uy, cc, state,
    )) {
        return ECMD_OK;
    }

    // lock.c:810-811. Open at yourself/up/down: delegate to loot unless there
    // is a closed door here (possible with Passes_walls) and direction is not
    // 'down'.
    if (u_at(cc.x, cc.y, state)
        && (u.dz > 0 || !closed_door(u.ux, u.uy, state)))
        return doloot(state);

    // lock.c:815-818. Pit check after direction.
    if (u.utrap && u.utraptype === TT_PIT) {
        await message("You can't reach over the edge of the pit.", state);
        return ECMD_OK;
    }

    // lock.c:820-821. Door mimic check.
    if (stumble_on_door_mimic(cc.x, cc.y, state))
        return ECMD_TIME;

    // lock.c:825-826. When choosing a direction is impaired, use a turn
    // regardless of whether a door is successfully targeted.
    let res = ECMD_OK;
    if (Confusion(state) || Stunned(state))
        res = ECMD_TIME;

    // lock.c:828-829.
    const door = state.level?.at(cc.x, cc.y);
    if (!door) throw new TypeError('doopen_indir requires a door location');
    const portcullis = is_drawbridge_wall(cc.x, cc.y, state);

    // lock.c:831-839. The glyph-comparison block: "this used to be 'if (Blind)'
    // but using a key skips that so we do too". update_mapseen_for() and
    // newsym() may change the remembered glyph; if so, the hero learned
    // something and the attempt costs a turn.
    {
        const oldglyph = door.remembered_glyph;
        const oldlastseentyp = update_mapseen_for(cc.x, cc.y, state);
        newsym(cc.x, cc.y, state);
        if (!same_remembered_glyph(oldglyph, door.remembered_glyph)
            || state.level.lastseentyp[cc.x][cc.y] !== oldlastseentyp)
            res = ECMD_TIME;
    }

    // lock.c:841-853. Portcullis or not a door.
    if (portcullis || !IS_DOOR(door.typ)) {
        if (is_db_wall(cc.x, cc.y, state) || door.typ === DRAWBRIDGE_UP)
            await message(
                'There is no obvious way to open the drawbridge.', state,
            );
        else if (portcullis || door.typ === DRAWBRIDGE_DOWN)
            await message('The drawbridge is already open.', state);
        else if (container_at(cc.x, cc.y, true, state))
            await message(
                `${heroIsBlind(state) ? 'Feels' : 'Seems'}`
                + ' like something lootable over there.',
                state,
            );
        else
            await message(
                `You ${heroIsBlind(state) ? 'feel' : 'see'} no door there.`,
                state,
            );
        return res;
    }

    // lock.c:855-896. Door is not closed.
    if (!(doorMask(door) & D_CLOSED)) {
        await message(
            messageAt(`This door${notClosedMessage(door)}.`, cc.x, cc.y,
                state),
            state,
        );
        // lock.c:876-894. Offer a locked door to flags.autounlock.
        const locked = (doorMask(door) & D_LOCKED) !== 0;
        if (locked && state.flags?.autounlock) {
            const autounlockFlags = state.flags.autounlock;
            u.dz = 0; /* should already be 0 since hero moved toward door */
            if ((autounlockFlags & AUTOUNLOCK_APPLY_KEY) !== 0) {
                const unlocktool = autokey(true, state);
                if (unlocktool) {
                    res = (await pick_lock(unlocktool, cc.x, cc.y, null, state))
                        ? ECMD_TIME : ECMD_OK;
                }
            } else if ((autounlockFlags & AUTOUNLOCK_KICK) !== 0) {
                // lock.c:884-893. AUTOUNLOCK_KICK asks "Kick it?" and queues
                // dokick with cmdq_add_dir(), which is not ported.
                throw new UnsupportedLockError(
                    'AUTOUNLOCK_KICK in doopen_indir()',
                );
            }
        }
        return res;
    }

    // lock.c:898-901. Too small to pull the door.
    if (verysmall(state.youmonst.data)) {
        await message("You're too small to pull the door open.", state);
        return res;
    }

    // lock.c:904-921. Door is known to be CLOSED. ACURRSTR folds Strength's
    // 3..125 encoding down to 3..25 before the three attributes are averaged
    // with C's truncating integer division.
    const threshold = Math.trunc((
        acurrstr(state)
        + effective_attribute(state, A_DEX)
        + effective_attribute(state, A_CON)
    ) / 3);
    if (random.rnl(20) < threshold) {
        await message(
            messageAt('The door opens.', cc.x, cc.y, state), state,
        );
        if (doorMask(door) & D_TRAPPED) {
            // lock.c:908-911. b_trapped() fires the door trap, then
            // door->doormask = D_NODOOR and add_damage() for shops. This path
            // needs b_trapped(), in_rooms(), and add_damage().
            throw new UnsupportedLockError(
                'D_TRAPPED door trap in doopen_indir()',
            );
        }
        // detect.c cvt_sdoor_to_door() sets both spellings of struct rm's
        // shared mask field; every reader in the port accepts either.
        door.flags = D_ISOPEN;
        door.doormask = D_ISOPEN;
        feel_newsym(cc.x, cc.y, state);
        recalc_block_point(cc.x, cc.y, state);
    } else {
        await exercise(A_STR, true, state, random, {
            encumberMessage: encumber_msg,
        });
        await message(
            messageAt('The door resists!', cc.x, cc.y, state), state,
        );
    }

    return ECMD_TIME;
}

// C ref: lock.c stumble_on_door_mimic() (759-769). Checks whether a monster
// at (x,y) is a door mimic and, if so, forces the hero to interact with it.
// stumble_onto_mimic() is unported, so this function throws when the mimic
// condition is met. In normal play the condition requires a shapechanger
// mimicking a closed door, which is rare enough that the throw is acceptable.
function stumble_on_door_mimic(x, y, state = game) {
    const mtmp = m_at(x, y, state);
    if (mtmp && is_door_mappear(mtmp)
        && !Protection_from_shape_changers(state)) {
        throw new UnsupportedLockError(
            'stumble_onto_mimic() in stumble_on_door_mimic()',
        );
    }
    return false;
}

// C ref: mondata.h is_door_mappear(): TRUE when the monster is mimicking a
// closed door (horizontal or vertical).
function is_door_mappear(mtmp) {
    // monst.h S_hcdoor = 36, S_vcdoor = 37, from defsym_values enum.
    const S_hcdoor = 36;
    const S_vcdoor = 37;
    return M_AP_TYPE(mtmp) === M_AP_FURNITURE
        && (mtmp.mappearance === S_hcdoor || mtmp.mappearance === S_vcdoor);
}

// C ref: youprop.h:287 Protection_from_shape_changers, the bare intrinsic OR
// extrinsic. The constant 65 is prop.h PROT_FROM_SHAPE_CHANGERS.
function Protection_from_shape_changers(state) {
    const PROT_FROM_SHAPE_CHANGERS = 65;
    const prop = state.u?.uprops?.[PROT_FROM_SHAPE_CHANGERS];
    return Boolean(prop?.intrinsic || prop?.extrinsic);
}

// C ref: lock.c obstructed() (926-953). Checks whether a monster or object
// blocks the hero from closing a door. The monster arm needs canspotmon() and
// Some_Monnam(), which are unported; this function throws for any visible
// monster that is not an object-mimic (M_AP_OBJECT falls through to the
// OBJ_AT arm, matching C's goto objhere).
//
// Covered: the OBJ_AT arm that prints "Something's in the way."
// Not covered: the visible-monster arm (canspotmon/Some_Monnam unported).
function obstructed(x, y, quietly, state = game) {
    const mtmp = m_at(x, y, state);
    if (mtmp && M_AP_TYPE(mtmp) !== M_AP_FURNITURE) {
        if (M_AP_TYPE(mtmp) === M_AP_OBJECT) {
            // C: goto objhere -- fall through to the OBJ_AT arm below.
        } else {
            // The visible-monster arm needs canspotmon() and Some_Monnam(),
            // neither of which is ported.
            throw new UnsupportedLockError(
                'obstructed() visible-monster arm (canspotmon/Some_Monnam)',
            );
        }
    } else if (OBJ_AT(x, y, state)) {
        // objhere:
        if (!quietly)
            return { blocked: true, message: "Something's in the way." };
        return { blocked: true };
    } else {
        return { blocked: false };
    }
    // Reached only from the M_AP_OBJECT fall-through above.
    // objhere:
    if (!quietly)
        return { blocked: true, message: "Something's in the way." };
    return { blocked: true };
}

// C ref: youprop.h:286 Passes_walls, the bare intrinsic OR extrinsic.
function Passes_walls(state) {
    const passes = state.u?.uprops?.[PASSES_WALLS];
    return Boolean(passes?.intrinsic || passes?.extrinsic);
}

// C ref: youprop.h:83-84 Confusion, the bare intrinsic field.
function Confusion(state) {
    return Boolean(state.u?.uprops?.[CONFUSION]?.intrinsic);
}

// C ref: youprop.h:81 Stunned, the bare intrinsic field.
function Stunned(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}

// C ref: lock.c doclose() (957-1051), the #close command handler. Prompts for
// a direction, checks preconditions, and attempts to close the door.
//
// Covered: nohands, pit, getdir prompt, self-square with Passes_walls guard,
// isok, drawbridge messages, door-state checks (D_NODOOR, obstructed,
// D_BROKEN, already closed/locked), the verysmall refusal, the rn2(25) close
// roll with both outcomes, and the exercise/resist path.
//
// Not covered, each throwing: stumble_on_door_mimic (mimic path),
// Confusion/Stunned (confdir throws first), and obstructed's visible-monster
// arm.
export async function doclose(state = game) {
    const u = state.u;

    // lock.c:964-967
    if (nohands(state.youmonst.data)) {
        await ttyPline("You can't close anything -- you have no hands!", state);
        return ECMD_OK;
    }

    // lock.c:969-972
    if (u.utrap && u.utraptype === TT_PIT) {
        await ttyPline("You can't reach over the edge of the pit.", state);
        return ECMD_OK;
    }

    // lock.c:974-975
    if (!await getdir(null, state))
        return ECMD_CANCEL;

    const x = u.ux + u.dx;
    const y = u.uy + u.dy;
    let res = ECMD_OK;

    // lock.c:979-982. u_at checks whether the target is the hero's own square.
    // Passes_walls heroes can close from their own square.
    if (u_at(x, y, state) && !Passes_walls(state)) {
        await ttyPline('You are in the way!', state);
        return ECMD_TIME;
    }

    // lock.c:984-985. isok rejects coordinates outside the map.
    if (!isok(x, y)) {
        const blind = heroIsBlind(state);
        await ttyPline(
            `You ${blind ? 'feel' : 'see'} no door there.`, state,
        );
        return res;
    }

    // lock.c:987-988. stumble_on_door_mimic throws for the mimic path.
    if (stumble_on_door_mimic(x, y, state))
        return ECMD_TIME;

    // lock.c:992-993. Unreachable in this port: getdir() calls confdir(), which
    // throws for a confused or stunned hero. Written out so the branch exists
    // when confdir is ported.
    if (Confusion(state) || Stunned(state))
        res = ECMD_TIME;

    const door = state.level.at(x, y);
    const portcullis = is_drawbridge_wall(x, y, state);

    // lock.c:997-1005. Blind hero feels the location to learn what is there.
    if (heroIsBlind(state)) {
        const oldglyph = door.remembered_glyph;
        const oldlastseentyp = update_mapseen_for(x, y, state);

        feel_location(x, y, state);
        if (!same_remembered_glyph(oldglyph, door.remembered_glyph)
            || state.level.lastseentyp[x][y] !== oldlastseentyp)
            res = ECMD_TIME; /* learned something */
    }

    // lock.c:1007-1018. Not a door.
    if (portcullis || !IS_DOOR(door.typ)) {
        if (is_db_wall(x, y, state) || door.typ === DRAWBRIDGE_UP)
            await ttyPline('The drawbridge is already closed.', state);
        else if (portcullis || door.typ === DRAWBRIDGE_DOWN)
            await ttyPline(
                'There is no obvious way to close the drawbridge.', state,
            );
        else {
            // nodoor:
            const blind = heroIsBlind(state);
            await ttyPline(
                `You ${blind ? 'feel' : 'see'} no door there.`, state,
            );
        }
        return res;
    }

    // lock.c:1020-1031. Door-state checks.
    if (doorMask(door) === D_NODOOR) {
        await ttyPline('This doorway has no door.', state);
        return res;
    }
    const obs = obstructed(x, y, false, state);
    if (obs.blocked) {
        if (obs.message) await ttyPline(obs.message, state);
        return res;
    }
    if (doorMask(door) === D_BROKEN) {
        await ttyPline('This door is broken.', state);
        return res;
    }
    if (doorMask(door) & (D_CLOSED | D_LOCKED)) {
        await ttyPline('This door is already closed.', state);
        return res;
    }

    // lock.c:1033-1048. The door is D_ISOPEN; try to close it.
    if (doorMask(door) === D_ISOPEN) {
        // lock.c:1034-1037
        if (verysmall(state.youmonst.data) && !u.usteed) {
            await ttyPline(
                "You're too small to push the door closed.", state,
            );
            return res;
        }
        // lock.c:1038-1047. Mounted heroes always succeed; otherwise roll
        // rn2(25) against the average of ACURRSTR, ACURR(A_DEX), ACURR(A_CON).
        const threshold = Math.trunc((
            acurrstr(state)
            + effective_attribute(state, A_DEX)
            + effective_attribute(state, A_CON)
        ) / 3);
        if (u.usteed || rn2(25) < threshold) {
            await ttyPline('The door closes.', state);
            door.flags = D_CLOSED;
            door.doormask = D_CLOSED;
            feel_newsym(x, y, state);
            block_point(x, y, state);
        } else {
            await exercise(A_STR, true, state, { rn2 }, {
                encumberMessage: encumber_msg,
            });
            await ttyPline('The door resists!', state);
        }
    }

    return ECMD_TIME;
}
