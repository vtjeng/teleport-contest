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
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    DEAF,
    DOOR,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    BLINDED,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FAINTED,
    FINGER,
    IS_DOOR,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPE,
    OBJ_AT,
    OBJ_FLOOR,
    OBJ_INVENT,
    SHOPBASE,
    P_DAGGER,
    P_FLAIL,
    P_LANCE,
    PASSES_WALLS,
    STUNNED,
    TT_PIT,
    SDOOR,
    u_at,
} from './const.js';
import { isok } from './cmd_isok.js';
import {
    is_db_wall,
    is_drawbridge_wall,
    is_pool,
    is_lava,
} from './dbridge.js';
import { is_magic_key, touch_artifact } from './artifacts.js';
import { stop_occupation } from './allmain.js';
import { acurrstr, acurr, exercise } from './attrib.js';
import {
    get_adjacent_loc,
    getdir,
    set_occupation,
    yn_function,
    y_n,
} from './cmd.js';
import {
    feel_location,
    feel_newsym,
    map_invisible,
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
import { wake_nearby, wake_nearto } from './mon.js';
import { breathless, haseyes, nohands, verysmall } from './mondata.js';
import { PM_ORACLE, PM_ROGUE, PM_WIZARD } from './monsters.js';
import { obj_resists } from './bury.js';
import {
    greatest_erosion,
    newObject,
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
    POTION_CLASS,
    LOCK_PICK,
    ROCK_CLASS,
    SKELETON_KEY,
    SPE_KNOCK,
    SPE_FORCE_BOLT,
    SPE_POLYMORPH,
    SPE_WIZARD_LOCK,
    WAN_STRIKING,
    WAN_LOCKING,
    WAN_OPENING,
    WAN_POLYMORPH,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { closed_door, youHear } from './monmove.js';
import { Some_Monnam, mon_nam, hliquid } from './do_name.js';
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
    ysimple_name,
} from './objnam.js';
import { container_at, doloot, encumber_msg } from './pickup.js';
import { is_quest_artifact } from './questpgr.js';
import { rn2, rnl } from './rng.js';
import { costly_spot } from './shk.js';
import {
    b_trapped,
    chest_trap,
    t_at,
    unconscious,
    could_untrap,
    Levitation,
    untrap,
} from './trap.js';
import { stumble_onto_mimic } from './uhitm.js';
import { verbalize } from './pline.js';
import { in_rooms } from './rooms.js';
import { heroIsBlind, messageAt } from './startup_a11y.js';
import { block_point, cansee, recalc_block_point, unblock_point, vision_recalc } from './vision.js';
import { dist2, s_suffix } from './hacklib.js';
import { note_unported } from './unported.js';
import { S_hcdoor, S_vcdoor } from './symbols.js';
import { ttyPline } from './tty_message.js';
import { setnotworn } from './worn.js';
import { canseemon, canspotmon } from './display.js';

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

// C ref: lock.c picking_lock() (17-28). Returns { x, y } of the door being
// picked when the hero is currently picking a lock, or null otherwise.
export function picking_lock(state = game) {
    if (state.go?.occupation === picklock) {
        return {
            x: state.u.ux + (state.u.dx ?? 0),
            y: state.u.uy + (state.u.dy ?? 0),
        };
    }
    return null;
}

// C ref: lock.c picking_at() (30-36). gx.xlock.door is a pointer to the
// canonical level cell, so this pure query must compare that identity rather
// than initialize xlock or substitute a coordinate comparison.
export function picking_at(x, y, state = game) {
    const door = state.xlock?.door;
    return state.go?.occupation === picklock
        && door != null
        && door === state.level?.at(x, y);
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

// C ref: lock.c boxlock() (1056-1101). A magic effect updates the box's
// lock state and returns whether that state changed. Soundeffect() is a no-op
// in the recorder's tty build; the source messages and lock knowledge remain.
export async function boxlock(obj, effect, state = game) {
    let result = 0;

    switch (effect.otyp) {
    case WAN_LOCKING:
    case SPE_WIZARD_LOCK:
        if (!obj.olocked) {
            await ttyPline('Klunk!', state);
            obj.olocked = 1;
            obj.obroken = 0;
            obj.lknown = state.urole?.mnum === PM_WIZARD ? 1 : 0;
            result = 1;
        }
        break;
    case WAN_OPENING:
    case SPE_KNOCK:
        if (obj.olocked) {
            await ttyPline('Klick!', state);
            obj.olocked = 0;
            result = 1;
            obj.lknown = state.urole?.mnum === PM_WIZARD ? 1 : 0;
        } else {
            obj.obroken = 0;
        }
        break;
    case WAN_POLYMORPH:
    case SPE_POLYMORPH:
        if (state.xlock?.box === obj) reset_pick(state);
        break;
    }
    return result;
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

// C ref: lock.c chest_shatter_msg() (1275-1318). The potion arm dynamically
// imports potion helpers to avoid making lock.js and potion.js a static cycle.
async function chest_shatter_msg(otmp, state = game) {
    if (otmp.oclass === POTION_CLASS) {
        const { bottlename, potionbreathe } = await import('./potion.js');
        await ttyPline(
            `You ${heroIsBlind(state) ? 'hear' : 'see'} `
                + `${an(bottlename(state), state)} shatter!`,
            state,
        );
        if (!breathless(state.youmonst.data)
            || haseyes(state.youmonst.data)) {
            await potionbreathe(otmp, state);
        }
        return;
    }
    if (objectType(otmp, state).oc_material !== PAPER) {
        throw new UnsupportedLockError(
            'chest_shatter_msg() for a non-PAPER object',
        );
    }
    // C temporarily sets HBlinded while naming the item so xname() neither
    // observes it nor includes a visual description such as "white".
    const blindness = state.u.uprops[BLINDED] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };
    const oldIntrinsic = blindness.intrinsic;
    const oldBlocked = blindness.blocked;
    blindness.intrinsic = 1;
    blindness.blocked = false;
    let thing;
    try {
        thing = singular(otmp, xnameFresh, state);
    } finally {
        blindness.intrinsic = oldIntrinsic;
        if (oldBlocked === undefined) delete blindness.blocked;
        else blindness.blocked = oldBlocked;
    }
    const subject = an(thing);
    await ttyPline(`${subject[0].toUpperCase()}${subject.slice(1)} is torn to shreds!`, state);
}

// C ref: lock.c breakchestlock() (162-212). Called after the hero forces a
// chest lock open, and by really_kick_object(false). The false arm records
// the missing costly_alteration billing and toggles the source lock flags.
// When destroyit is true,
// this slice destroys an ordinary non-shop chest, scatters its contents, and
// cleans up the lock-picking context.
//
// Covered: the destroyit=false arm and the destroyit=true arm for an ordinary
// non-shop CHEST with PAPER or potion contents, including potion vapor effects,
// quantity-one obfree(), the survivor placement/stacking path, chest deletion,
// and lock cleanup. Deferred: shop billing, other material messages, ICE_BOX
// corpse timers, and the multi-quantity useup branch.
export async function breakchestlock(box, destroyit, state = game) {
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
            // lock.c:186 evaluates the random destruction gate first, but
            // potion-class contents shatter even when that gate is false.
            if (!rn2(3) || otmp.oclass === POTION_CLASS) {
                await chest_shatter_msg(otmp, state);
                if (otmp.quan === 1) {
                    obfree(otmp, null, { state });
                    continue;
                }
                // This is source-faithful for completeness, but the selected
                // slice does not admit multi-quantity witnesses yet.
                await useup(otmp, { state });
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
    // C discards this unported billing result. Continue the source lock
    // updates after recording the gap; no hook stands in for shop behavior.
    note_unported('mkobj.c costly_alteration');
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
            await useup(uwep, {
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

// C ref: lock.c picklock() (68-160). This is the occupation callback installed
// by pick_lock(). A trapped door explodes before its destruction and redraw.
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

    // lock.c:101-136. A suitably blessed/cursed Master Key of Thievery finds
    // a trap and improves the chance for the next occupation turn. The C
    // y_n() prompt defaults to No; answer is its character byte.
    if ((xlock.door
        ? (doorMask(xlock.door) & D_TRAPPED) !== 0
        : Boolean(xlock.box?.otrapped)) && xlock.magic_key) {
        xlock.chance += 20;
        if (!xlock.door) {
            if (!xlock.box.tknown)
                await ttyPline('You find a trap!', state);
            xlock.box.tknown = 1;
        }
        if (await y_n('Do you want to try to disarm it?', state)
            === 'y'.charCodeAt(0)) {
            let what;
            let alreadyunlocked;
            if (xlock.door) {
                setDoorMask(
                    xlock.door,
                    doorMask(xlock.door) & ~D_TRAPPED,
                );
                what = 'door';
                alreadyunlocked = !(doorMask(xlock.door) & D_LOCKED);
            } else {
                xlock.box.otrapped = 0;
                xlock.box.tknown = 0;
                what = (xlock.box.otyp === CHEST) ? 'chest' : 'box';
                alreadyunlocked = !xlock.box.olocked;
            }
            await ttyPline(
                `You succeed in disarming the trap.  The ${what} is still `
                    + `${alreadyunlocked ? 'un' : ''}locked.`,
                state,
            );
            await exercise(A_WIS, true, state, { rn2 }, {
                encumberMessage: encumber_msg,
            });
        } else {
            await ttyPline(
                `You stop ${lock_action(state)}.`, state,
            );
            await exercise(A_WIS, false, state, { rn2 }, {
                encumberMessage: encumber_msg,
            });
        }
        return (xlock.usedtime = 0);
    }

    await ttyPline(`You succeed in ${lock_action(state)}.`, state);
    if (xlock.door) {
        if (doorMask(xlock.door) & D_TRAPPED) {
            await b_trapped('door', FINGER, state);
            setDoorMask(xlock.door, D_NODOOR);
            unblock_point(u.ux + u.dx, u.uy + u.dy, state);
            if (in_rooms(u.ux + u.dx, u.uy + u.dy, SHOPBASE, state).length)
                note_unported('shk.c add_damage');
            newsym(u.ux + u.dx, u.uy + u.dy, state);
        } else if (doorMask(xlock.door) & D_LOCKED) {
            xlock.door.flags = D_CLOSED;
            xlock.door.doormask = D_CLOSED;
        } else {
            xlock.door.flags = D_LOCKED;
            xlock.door.doormask = D_LOCKED;
        }
    } else {
        // lock.c:148-153. C toggles first, then calls chest_trap() if this
        // was a trapped floor box. Its return is explicitly discarded.
        xlock.box.olocked = xlock.box.olocked ? 0 : 1;
        xlock.box.lknown = 1;
        if (xlock.box.otrapped)
            await chest_trap(xlock.box, FINGER, false, state);
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
export async function ynq(query, state = game) {
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

function setDoorMask(location, mask) {
    // C rm.doormask aliases flags; generated JS levels store both fields.
    location.flags = mask;
    location.doormask = mask;
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

// C ref: lock.c pick_lock() (358-659). Manual apply, container autounlock,
// and door autounlock share the same selection and occupation context.
export async function pick_lock(pick, rx, ry, container, state = game, env = {}) {
    const u = state.u;
    const message = env.message ?? ttyPline;
    // hack.h ynq() uses the command owner's repeat-recording prompt. Keep
    // this local to pick_lock; other partial lock.c callers still use ynq().
    const ask = env.ynq ?? ((query) => yn_function(query, 'ynq', 'q', true, state));
    const yes = 'y'.charCodeAt(0);
    const no = 'n'.charCodeAt(0);
    const quit = 'q'.charCodeAt(0);
    const autounlock = rx !== 0 || container != null;
    const dummypick = pick ? null : newObject(); // C cg.zeroobj stack copy.
    if (!pick) pick = dummypick;
    const picktyp = pick.otyp;
    const xlock = xlockContext(state);

    if (xlock.usedtime && picktyp === xlock.picktyp) {
        if (nohands(state.youmonst.data)) {
            const what = picktyp === CREDIT_CARD ? 'card'
                : picktyp === LOCK_PICK ? 'pick' : 'key';
            await message(`Unfortunately, you can no longer hold the ${what}.`, state);
            reset_pick(state);
            return PICKLOCK_LEARNED_SOMETHING;
        } else if (u.uswallow || (xlock.box && !can_reach_floor(true, state))) {
            await message('Unfortunately, you can no longer reach the lock.', state);
            reset_pick(state);
            return PICKLOCK_LEARNED_SOMETHING;
        } else {
            const action = lock_action(state);
            await message(`You resume your attempt at ${action}.`, state);
            xlock.magic_key = is_magic_key(state.youmonst, pick, state);
            set_occupation(picklock, action, 0, state);
            return PICKLOCK_DID_SOMETHING;
        }
    }
    if (nohands(state.youmonst.data)) {
        await message(`You can't hold ${donameFresh(pick, state)} -- you have no hands!`, state);
        return PICKLOCK_DID_NOTHING;
    } else if (u.uswallow) {
        await message(`You can't ${picktyp === CREDIT_CARD ? '' : 'lock or '}unlock ${mon_nam(u.ustuck, state)}.`, state);
        return PICKLOCK_DID_NOTHING;
    }
    if (pick !== dummypick && picktyp !== SKELETON_KEY
        && picktyp !== LOCK_PICK && picktyp !== CREDIT_CARD) {
        note_unported('pline.c impossible: picking lock with invalid object');
        return PICKLOCK_DID_NOTHING;
    }
    let ch = 0;
    const cc = { x: 0, y: 0 };
    if (rx !== 0) {
        cc.x = rx;
        cc.y = ry;
    } else if (!await get_adjacent_loc(null, 'Invalid location!', u.ux, u.uy, cc, state)) {
        return PICKLOCK_DID_NOTHING;
    }

    if (u_at(cc.x, cc.y, state)) {
        if (u.dz < 0 && !autounlock) {
            await message(`There isn't any sort of lock up ${Levitation(state) ? 'here' : 'there'}.`, state);
            return PICKLOCK_LEARNED_SOMETHING;
        } else if (is_lava(u.ux, u.uy, state)) {
            await message(`Doing that would probably melt ${yname(pick, state)}.`, state);
            return PICKLOCK_LEARNED_SOMETHING;
        } else if (is_pool(u.ux, u.uy, state) && !u.uinwater) {
            await message(`The ${hliquid('water', state)} has no lock.`, state);
            return PICKLOCK_LEARNED_SOMETHING;
        }
        let count = 0;
        let c = no;
        for (let otmp = state.level.objects[cc.x][cc.y]; otmp; otmp = otmp.nexthere) {
            if (autounlock && otmp !== container) continue;
            if (!Is_box(otmp)) continue;
            ++count;
            if (!can_reach_floor(true, state)) {
                await message(`You can't reach ${the(xnameFresh(otmp, state))} from up here.`, state);
                return PICKLOCK_LEARNED_SOMETHING;
            }
            let verb;
            let it = false;
            if (otmp.obroken) verb = 'fix';
            else if (!otmp.olocked) { verb = 'lock'; it = true; }
            else if (picktyp !== LOCK_PICK) { verb = 'unlock'; it = true; }
            else verb = 'pick';
            if (autounlock && (state.flags.autounlock & AUTOUNLOCK_UNTRAP)
                && await could_untrap(false, true, state)
                && (c = otmp.tknown ? (otmp.otrapped ? yes : no)
                    : await ask(safe_qbuf('Check ', ' for a trap?', otmp,
                        yname, ysimple_name, 'this', state))) !== no) {
                if (c === quit) return PICKLOCK_DID_NOTHING;
                await untrap(false, 0, 0, otmp, state);
                return PICKLOCK_DID_SOMETHING;
            } else if (autounlock && (state.flags.autounlock & AUTOUNLOCK_APPLY_KEY)) {
                c = quit;
                if (pick !== dummypick)
                    c = await ask(`Unlock it with ${yname(pick, state)}?`);
                if (c !== yes) return PICKLOCK_DID_NOTHING;
            } else {
                const qbuf = safe_qbuf('There is ', ` here; ${verb} ${it ? 'it' : 'its lock'}?`,
                    otmp, donameFresh, ansimpleoname, 'a box', state);
                otmp.lknown = 1;
                c = await ask(qbuf);
                if (c === quit) return PICKLOCK_DID_NOTHING;
                if (c === no) continue;
            }
            if (otmp.obroken) {
                await message(`You can't fix its broken lock with ${ansimpleoname(pick, state)}.`, state);
                return PICKLOCK_LEARNED_SOMETHING;
            } else if (picktyp === CREDIT_CARD && !otmp.olocked) {
                await message(`You can't do that with ${an(simple_typename(picktyp, state))}.`, state);
                return PICKLOCK_LEARNED_SOMETHING;
            } else if (autounlock && !await touch_artifact(pick, state.youmonst, state)) {
                return PICKLOCK_DID_SOMETHING;
            }
            switch (picktyp) {
            case CREDIT_CARD: ch = acurr(state, A_DEX) + 20 * Number(state.urole.mnum === PM_ROGUE); break;
            case LOCK_PICK: ch = 4 * acurr(state, A_DEX) + 25 * Number(state.urole.mnum === PM_ROGUE); break;
            case SKELETON_KEY: ch = 75 + acurr(state, A_DEX); break;
            default: ch = 0;
            }
            if (otmp.cursed) ch = Math.trunc(ch / 2);
            xlock.box = otmp;
            xlock.door = null;
            break;
        }
        if (c !== yes) {
            if (!count) await message("There doesn't seem to be any sort of lock here.", state);
            return PICKLOCK_LEARNED_SOMETHING;
        }
    } else {
        if (u.utrap && u.utraptype === TT_PIT) {
            await message("You can't reach over the edge of the pit.", state);
            return PICKLOCK_DID_NOTHING;
        }
        const door = state.level.at(cc.x, cc.y);
        const mtmp = m_at(cc.x, cc.y, state);
        if (mtmp && canseemon(mtmp, state) && M_AP_TYPE(mtmp) !== M_AP_FURNITURE
            && M_AP_TYPE(mtmp) !== M_AP_OBJECT) {
            if (picktyp === CREDIT_CARD && (mtmp.isshk || mtmp.data === state.mons[PM_ORACLE])) {
                // SetVoice has no output/state effect in the reference tty build.
                await verbalize('No checks, no credit, no problem.', state, { message });
            } else {
                await message(`I don't think ${mon_nam(mtmp, state)} would appreciate that.`, state);
            }
            return PICKLOCK_LEARNED_SOMETHING;
        } else if (mtmp && is_door_mappear(mtmp)) {
            await stumble_onto_mimic(mtmp, state, { state, pline: message });
            note_unported('steal.c maybe_absorb_item');
            return PICKLOCK_LEARNED_SOMETHING;
        }
        if (!IS_DOOR(door.typ)) {
            let res = PICKLOCK_DID_NOTHING;
            const oldglyph = door.remembered_glyph;
            const oldlastseentyp = update_mapseen_for(cc.x, cc.y, state);
            feel_location(cc.x, cc.y, state);
            if (!same_remembered_glyph(oldglyph, door.remembered_glyph)
                || state.level.lastseentyp[cc.x][cc.y] !== oldlastseentyp)
                res = PICKLOCK_LEARNED_SOMETHING;
            const blind = heroIsBlind(state);
            if (is_drawbridge_wall(cc.x, cc.y, state) >= 0)
                await message(`You ${blind ? 'feel' : 'see'} no lock on the drawbridge.`, state);
            else await message(`You ${blind ? 'feel' : 'see'} no door there.`, state);
            return res;
        }
        switch (doorMask(door)) {
        case D_NODOOR:
            await message('This doorway has no door.', state);
            return PICKLOCK_LEARNED_SOMETHING;
        case D_ISOPEN:
            await message('You cannot lock an open door.', state);
            return PICKLOCK_LEARNED_SOMETHING;
        case D_BROKEN:
            await message('This door is broken.', state);
            return PICKLOCK_LEARNED_SOMETHING;
        default: {
            let c;
            if ((state.flags.autounlock & AUTOUNLOCK_UNTRAP) && await could_untrap(false, false, state)
                && (c = await ask('Check this door for a trap?')) !== no) {
                if (c === quit) return PICKLOCK_DID_NOTHING;
                await untrap(false, cc.x, cc.y, null, state);
                return PICKLOCK_DID_SOMETHING;
            }
            if (picktyp === CREDIT_CARD && !(doorMask(door) & D_LOCKED)) {
                await message("You can't lock a door with a credit card.", state);
                return PICKLOCK_LEARNED_SOMETHING;
            }
            const qbuf = `${doorMask(door) & D_LOCKED ? 'Unlock' : 'Lock'} it`
                + (autounlock ? ` with ${yname(pick, state)}` : '') + '?';
            c = await ask(qbuf);
            if (c !== yes) return PICKLOCK_DID_NOTHING;
            if (autounlock && !await touch_artifact(pick, state.youmonst, state))
                return PICKLOCK_DID_SOMETHING;
            switch (picktyp) {
            case CREDIT_CARD: ch = 2 * acurr(state, A_DEX) + 20 * Number(state.urole.mnum === PM_ROGUE); break;
            case LOCK_PICK: ch = 3 * acurr(state, A_DEX) + 30 * Number(state.urole.mnum === PM_ROGUE); break;
            case SKELETON_KEY: ch = 70 + acurr(state, A_DEX); break;
            default: ch = 0;
            }
            xlock.door = door;
            xlock.box = null;
        }
        }
    }
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
export function Is_box(obj) {
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
// trapped-door opening and shop add_damage() bookkeeping, and the AUTOUNLOCK_KICK path
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
    if (await stumble_on_door_mimic(cc.x, cc.y, state))
        return ECMD_TIME;

    // lock.c:825-826. When choosing a direction is impaired, use a turn
    // regardless of whether a door is successfully targeted.
    let res = ECMD_OK;
    if (Confusion(state) || Stunned(state))
        res = ECMD_TIME;

    // lock.c:828-829.
    const door = state.level?.at(cc.x, cc.y);
    if (!door) throw new TypeError('doopen_indir requires a door location');
    const portcullis = is_drawbridge_wall(cc.x, cc.y, state) >= 0;

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
        + acurr(state, A_DEX)
        + acurr(state, A_CON)
    ) / 3);
    if (random.rnl(20) < threshold) {
        await message(
            messageAt('The door opens.', cc.x, cc.y, state), state,
        );
        if (doorMask(door) & D_TRAPPED) {
            // lock.c:908-911. The whole trapped-door opening branch remains
            // unported; b_trapped() is available for its eventual caller.
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

// C ref: lock.c stumble_on_door_mimic() (759-769).
export async function stumble_on_door_mimic(x, y, state = game) {
    const mtmp = m_at(x, y, state);
    if (mtmp && is_door_mappear(mtmp)
        && !Protection_from_shape_changers(state)) {
        await stumble_onto_mimic(mtmp, state, { state, pline: ttyPline });
        return true;
    }
    return false;
}

// C ref: monst.h is_door_mappear(): TRUE when the monster is mimicking a
// closed door (horizontal or vertical).
function is_door_mappear(mtmp) {
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

// C ref: lock.c obstructed() (926-953). A non-furniture monster blocks the
// ray; object mimics continue through C's objhere label to OBJ_AT.
async function obstructed(x, y, quietly, state = game, rawEnv = {}) {
    const message = rawEnv.message ?? ttyPline;
    const mtmp = m_at(x, y, state);
    if (mtmp && M_AP_TYPE(mtmp) !== M_AP_FURNITURE) {
        if (M_AP_TYPE(mtmp) === M_AP_OBJECT) {
            // C: goto objhere -- fall through to the OBJ_AT arm below.
        } else {
            if (!quietly) {
                let name = Some_Monnam(mtmp, state, rawEnv);
                if ((mtmp.mx !== x || mtmp.my !== y)
                    && canspotmon(mtmp, state)) {
                    name = `${s_suffix(name)} tail`;
                }
                await message(`${name} blocks the way!`, state, rawEnv);
            }
            if (!canspotmon(mtmp, state)) map_invisible(x, y, state);
            return true;
        }
    } else if (OBJ_AT(x, y, state)) {
        // objhere:
        if (!quietly)
            await message("Something's in the way.", state, rawEnv);
        return true;
    } else {
        return false;
    }
    // Reached only from the M_AP_OBJECT fall-through above.
    // objhere:
    if (!quietly)
        await message("Something's in the way.", state, rawEnv);
    return true;
}

// C ref: lock.c doorlock() (1103-1275). Shared by hero and monster rays:
// return true means the effect acted on this door and its caller may reveal
// the wand. Void shop damage and trapped-monster handling remain named gaps.
export async function doorlock(obj, x, y, state = game, rawEnv = {}) {
    const door = state.level.at(x, y);
    const message = rawEnv.message ?? ttyPline;
    const mysterywand = obj.oclass === WAND_CLASS && !obj.dknown;
    let result = true;
    let loudness = 0;
    let messageText = null;
    const dustcloud = 'A cloud of dust';
    const dissipates = 'quickly dissipates';

    if (door.typ === SDOOR) {
        switch (obj.otyp) {
        case WAN_OPENING:
        case SPE_KNOCK:
        case WAN_STRIKING:
        case SPE_FORCE_BOLT:
            door.typ = DOOR;
            setDoorMask(door, D_CLOSED | (doorMask(door) & D_TRAPPED));
            newsym(x, y, state);
            if (cansee(x, y, state))
                await message('A door appears in the wall!', state, rawEnv);
            if (obj.otyp === WAN_OPENING || obj.otyp === SPE_KNOCK)
                return true;
            break;
        case WAN_LOCKING:
        case SPE_WIZARD_LOCK:
        default:
            return false;
        }
    }

    switch (obj.otyp) {
    case WAN_LOCKING:
    case SPE_WIZARD_LOCK: {
        const level = state.u?.uz;
        const rogueLevel = state.rogue_level;
        const onRogueLevel = Boolean(rogueLevel && level
            && rogueLevel.dnum === level.dnum
            && rogueLevel.dlevel === level.dlevel);
        if (onRogueLevel) {
            const visible = cansee(x, y, state);
            if (visible) {
                await message(
                    `${dustcloud} springs up in the older, more primitive doorway.`,
                    state,
                    rawEnv,
                );
            } else {
                const heard = youHear('a swoosh.', state);
                if (heard) await message(heard, state, rawEnv);
            }
            if (await obstructed(x, y, mysterywand, state, rawEnv)) {
                if (visible)
                    await message(`The cloud ${dissipates}.`, state, rawEnv);
                return false;
            }
            block_point(x, y, state);
            door.typ = SDOOR;
            setDoorMask(door, D_NODOOR);
            if (visible)
                await message('The doorway vanishes!', state, rawEnv);
            newsym(x, y, state);
            return true;
        }
        if (await obstructed(x, y, mysterywand, state, rawEnv)) return false;
        // C keeps dust from assembling across a trap, even though maketrap()
        // normally clears the door mask before this point.
        if (t_at(x, y, state)) {
            await message(
                `${dustcloud} springs up in the doorway, but ${dissipates}.`,
                state,
                rawEnv,
            );
            return false;
        }

        switch (doorMask(door) & ~D_TRAPPED) {
        case D_CLOSED:
            messageText = 'The door locks!';
            break;
        case D_ISOPEN:
            messageText = 'The door swings shut, and locks!';
            break;
        case D_BROKEN:
            messageText = 'The broken door reassembles and locks!';
            break;
        case D_NODOOR:
            messageText = 'A cloud of dust springs up and assembles itself into a door!';
            break;
        default:
            result = false;
            break;
        }
        block_point(x, y, state);
        setDoorMask(door, D_LOCKED | (doorMask(door) & D_TRAPPED));
        newsym(x, y, state);
        break;
    }
    case WAN_OPENING:
    case SPE_KNOCK:
        if (doorMask(door) & D_LOCKED) {
            messageText = 'The door unlocks!';
            setDoorMask(door, D_CLOSED | (doorMask(door) & D_TRAPPED));
        } else {
            result = false;
        }
        break;
    case WAN_STRIKING:
    case SPE_FORCE_BOLT:
        if (doorMask(door) & (D_LOCKED | D_CLOSED)) {
            if (doorMask(door) & D_TRAPPED) {
                const monster = m_at(x, y, state);
                const sawit = monster
                    ? canseemon(monster, state) : cansee(x, y, state);
                setDoorMask(door, D_NODOOR);
                unblock_point(x, y, state);
                newsym(x, y, state);
                const seeit = monster
                    ? canseemon(monster, state) : cansee(x, y, state);
                if (monster) {
                    // C discards mb_trapped()'s return; preserve the gap at
                    // the source call while keeping doorlock's true result.
                    note_unported('trap.c mb_trapped');
                } else {
                    loudness = 40;
                    if (state.flags?.verbose) {
                        if ((sawit || seeit) && !Unaware(state)) {
                            await message(
                                'KABOOM!!  You see a door explode.',
                                state,
                                rawEnv,
                            );
                        } else if (!heroIsDeaf(state)) {
                            const distance = dist2(
                                state.u.ux, state.u.uy, x, y,
                            ) > 7 * 7 ? 'distant' : 'nearby';
                            const heard = youHear(
                                `a ${distance} explosion.`, state,
                            );
                            if (heard) await message(heard, state, rawEnv);
                        }
                    }
                }
                break;
            }
            const sawit = cansee(x, y, state);
            setDoorMask(door, D_BROKEN);
            recalc_block_point(x, y, state);
            const seeit = cansee(x, y, state);
            newsym(x, y, state);
            if (state.flags?.verbose) {
                if ((sawit || seeit) && !Unaware(state)) {
                    await message('The door crashes open!', state, rawEnv);
                } else if (!heroIsDeaf(state)) {
                    const heard = youHear('a crashing sound.', state);
                    if (heard) await message(heard, state, rawEnv);
                }
            }
            if (state.vision_full_recalc)
                vision_recalc(0, {
                    state,
                    redraw: (redrawX, redrawY) =>
                        newsym(redrawX, redrawY, state),
                });
            loudness = 20;
        } else {
            result = false;
        }
        break;
    default:
        // zap.c's impossible() is debug-only in this tty build.
        break;
    }

    if (messageText && cansee(x, y, state))
        await message(messageText, state, rawEnv);
    if (loudness > 0) {
        await wake_nearto(x, y, loudness, { ...rawEnv, state });
        if (in_rooms(x, y, SHOPBASE, state).length)
            note_unported('shk.c add_damage');
    }

    if (result && picking_at(x, y, state)) {
        await stop_occupation(state, { ...rawEnv, message });
        reset_pick(state);
    }
    return result;
}

function heroIsDeaf(state) {
    const property = state.u?.uprops?.[DEAF];
    return Boolean(property?.intrinsic || property?.extrinsic
        || state.u?.uroleplay?.deaf);
}

function Unaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
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
// Not covered, each throwing: Confusion/Stunned (confdir throws first),
// and obstructed's visible-monster arm. The source door-mimic check calls
// the canonical reveal owner before it consumes a turn.
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

    // lock.c:987-988. Revealing a door mimic consumes a turn.
    if (await stumble_on_door_mimic(x, y, state))
        return ECMD_TIME;

    // lock.c:992-993. Unreachable in this port: getdir() calls confdir(), which
    // throws for a confused or stunned hero. Written out so the branch exists
    // when confdir is ported.
    if (Confusion(state) || Stunned(state))
        res = ECMD_TIME;

    const door = state.level.at(x, y);
    const portcullis = is_drawbridge_wall(x, y, state) >= 0;

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
    if (await obstructed(x, y, false, state)) return res;
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
            + acurr(state, A_DEX)
            + acurr(state, A_CON)
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
