// Elemental destruction of carried and floor-borne objects.
// C refs: zap.c destroyable(), destroy_strings[][3], maybe_destroy_item(),
// destroy_items() and burn_floor_objects(). zap.c keeps those five together and
// so does this file; the rest of zap.c is js/zap.js.

import {
    A_STR,
    FIRE_RES,
    FLYING,
    KILLED_BY,
    KILLED_BY_AN,
    LEVITATION,
    NOBJ_STATES,
    Upolyd,
    ismnum,
} from './const.js';
import { exercise } from './attrib.js';
import { obj_resists } from './bury.js';
import {
    monsterPossessive,
} from './do_name.js';
import { losehp } from './hack.js';
import { makeplural } from './fruit.js';
import {
    obfree,
    obj_extract_self,
    useup,
} from './invent.js';
import {
    AD_COLD,
    AD_ELEC,
    AD_FIRE,
} from './monsters.js';
import {
    breathless,
    haseyes,
    monster_resists_element,
} from './mondata.js';
import { objectGenerationEnv } from './object_generation.js';
import { objectType } from './obj.js';
import {
    The,
    Yname2,
    distant_name,
    donameFresh,
    xnameFresh,
    yname,
} from './objnam.js';
import { encumber_msg } from './pickup.js';
import { potionbreathe } from './potion.js';
import {
    GLOB_OF_GREEN_SLIME,
    FOOD_CLASS,
    POT_OIL,
    POT_WATER,
    POTION_CLASS,
    RING_CLASS,
    RIN_SHOCK_RESISTANCE,
    SCR_FIRE,
    SCROLL_CLASS,
    SPE_BOOK_OF_THE_DEAD,
    SPE_FIREBALL,
    SPBOOK_CLASS,
    WAN_LIGHTNING,
    WAND_CLASS,
} from './objects.js';
import {
    weight,
} from './obj.js';
import { canSeeMonster, heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { Fire_resistance, inventory_resistance_check } from './zap.js';

// Thrown where the destruction path reaches an arm this port has not ported.
export class UnsupportedItemDestructionError extends Error {
    constructor(branch) {
        super(`destroying a carried item requires ${branch}`);
        this.name = 'UnsupportedItemDestructionError';
        this.branch = branch;
    }
}

function withoutObjectArticle(name) {
    return name.replace(/^(?:an?|the) /u, '').replace(/^\d+ /u, '');
}

export function fire_object_name_at_quantity(obj, quantity, state) {
    const original = obj.quan;
    obj.quan = quantity;
    try {
        return withoutObjectArticle(donameFresh(obj, state));
    } finally {
        obj.quan = original;
    }
}

// C ref: zap.c destroyable() (5612-5650), translated whole. "Return TRUE if obj
// is eligible to pass to maybe_destroy_item given the type of elemental damage
// it's being subjected to. Note that things like the Book of the Dead are
// eligible even though they won't get destroyed, because it will attempt to be
// destroyed but print a special message instead."
//
// Pure: it draws nothing, prints nothing and changes nothing.
export function destroyable(obj, adtyp) {
    if (obj.oartifact) {
        /* don't destroy artifacts */
        return false;
    }
    if (obj.in_use && obj.quan === 1) {
        /* not available for destroying */
        return false;
    }
    if (adtyp === AD_FIRE) {
        /* fire-magic items are immune */
        if (obj.otyp === SCR_FIRE || obj.otyp === SPE_FIREBALL) {
            return false;
        }
        if (obj.otyp === GLOB_OF_GREEN_SLIME || obj.oclass === POTION_CLASS
            || obj.oclass === SCROLL_CLASS || obj.oclass === SPBOOK_CLASS) {
            return true;
        }
    } else if (adtyp === AD_COLD) {
        /* non-water potions don't freeze and shatter */
        if (obj.oclass === POTION_CLASS && obj.otyp !== POT_OIL) {
            return true;
        }
    } else if (adtyp === AD_ELEC) {
        if (obj.oclass !== RING_CLASS && obj.oclass !== WAND_CLASS) {
            return false;
        }
        /* electric-magic items are immune */
        if (obj.otyp !== RIN_SHOCK_RESISTANCE && obj.otyp !== WAN_LIGHTNING) {
            return true;
        }
    }
    return false;
}

/*
 * C ref: zap.c destroy_strings[][3] (5778-5787), copied row for row.
 * destroy_strings[dindx][0:singular, 1:plural, 2:killer_reason]
 *      [0] freezing potion
 *      [1] boiling potion other than oil
 *      [2] boiling potion of oil
 *      [3] burning scroll
 *      [4] burning spellbook
 *      [5] shocked ring
 *      [6] shocked wand
 * (books, rings, and wands don't stack so don't need plural form;
 *  crumbling ring doesn't do damage so doesn't need killer reason)
 * externally referenced from trap.c.
 */
export const destroy_strings = Object.freeze([
    /* also used in trap.c */
    Object.freeze(['freezes and shatters', 'freeze and shatter',
        'shattered potion']),
    Object.freeze(['boils and explodes', 'boil and explode',
        'boiling potion']),
    Object.freeze(['ignites and explodes', 'ignite and explode',
        'exploding potion']),
    Object.freeze(['catches fire and burns', 'catch fire and burn',
        'burning scroll']),
    Object.freeze(['catches fire and burns', '', 'burning book']),
    Object.freeze(['turns to dust and vanishes', '', '']),
    Object.freeze(['breaks apart and explodes', '', 'exploding wand']),
]);

async function removeObjectQuantity(obj, quantity, env) {
    const lifecycleEnv = objectGenerationEnv(env);
    if (quantity < obj.quan) {
        obj.quan -= quantity;
        obj.owt = weight(obj, lifecycleEnv);
        return;
    }
    obj_extract_self(obj, lifecycleEnv);
    obfree(obj, null, lifecycleEnv);
}

function floorBurnMessageNames(obj, state) {
    return {
        singular: fire_object_name_at_quantity(obj, 1, state),
        plural: fire_object_name_at_quantity(obj, 2, state),
    };
}

// C ref: zap.c:5905-5907, the one `(cnt == 1L && quan == 1L) ? Yname2(obj)
// : yname(obj)` both carriers share.
//
// objnam.c yname() reaches shk.c shk_your(), whose mon_owns() arm needs
// y_monnam() for an object in a monster's pack; js/shk.js stops there. The
// monster arm below builds the same possessive from do_name.js
// monsterPossessive() instead, which is that y_monnam() call by another name.
function destroyedItemName(u_carry, carrier, obj, cnt, quan, state) {
    if (u_carry) {
        return (cnt === 1 && quan === 1)
            ? Yname2(obj, state)
            : yname(obj, state);
    }
    if (cnt === 1 && quan === 1) {
        return `${monsterPossessive(carrier, state, true)} `
            + `${fire_object_name_at_quantity(obj, 1, state)}`;
    }
    return `${monsterPossessive(carrier, state)} `
        + `${fire_object_name_at_quantity(obj, 2, state)}`;
}

// C ref: zap.c maybe_destroy_item() (5797-5954), "guts of destroy_items(); the
// caller must decide whether obj is eligible, though there's one case (Book of
// the Dead) in which an eligible item shouldn't be destroyed (it prints a
// special message instead)."
//
// C's own comment on the return value: "players lose the HP and possibly die in
// this function, and the return value is unused, whereas monsters return the
// damage to their caller to be taken off later."
//
// Only the AD_FIRE case is ported. AD_COLD and AD_ELEC stop by name: each ends
// in a losehp() and a message this port has no fresh case for, and AD_ELEC's
// ring arm needs recharge() and Ring_gone() as well.
async function maybe_destroy_item(carrier, obj, dmgtyp, env) {
    const { state, random } = env;
    const u_carry = carrier === state.youmonst;
    const vis = !u_carry && canSeeMonster(carrier, state);

    let xresist = false;
    let skip = false;
    let dmg = 0;
    let dindx = 0;
    let quan = 0;

    /* external worn item protects inventory? */
    if (u_carry && inventory_resistance_check(dmgtyp, state, random))
        return 0;

    switch (dmgtyp) {
    case AD_FIRE:
        xresist = (obj.oclass !== POTION_CLASS
                   && obj.otyp !== GLOB_OF_GREEN_SLIME
                   && (u_carry
                       ? Fire_resistance(state)
                       : monster_resists_element(carrier, FIRE_RES, state)));
        if (obj.otyp === SPE_BOOK_OF_THE_DEAD) {
            skip = true;
            if (u_carry ? !heroIsBlind(state) : vis) {
                // hcolor("dark red") answers its argument for a hero who is not
                // hallucinating, and rndcolor() draws for one who is; nothing
                // ported hallucinates and js/zap.js stops a hallucinating hero
                // several calls above this one.
                await ttyPline(
                    `${The(
                        u_carry
                            ? xnameFresh(obj, state)
                            : distant_name(obj, xnameFresh, state),
                        state,
                    )} glows a strange dark red, but remains intact.`,
                    state,
                );
            }
            break;
        }
        quan = Math.trunc(obj.quan);
        switch (obj.oclass) {
        case POTION_CLASS:
            dindx = (obj.otyp !== POT_OIL) ? 1 : 2;
            dmg = random.rnd(6);
            break;
        case SCROLL_CLASS:
            dindx = 3;
            dmg = 1;
            break;
        case SPBOOK_CLASS:
            dindx = 4;
            dmg = 1;
            break;
        case FOOD_CLASS: /* only GLOB_OF_GREEN_SLIME */
            dindx = 1; /* boil and explode */
            dmg = Math.trunc((obj.owt + 19) / 20);
            break;
        default:
            break;
        }
        break;
    case AD_COLD:
        // C ref: zap.c:5820-5824. Cold shatters potions (except oil, which
        // destroyable() already excludes). No xresist is set: the hero always
        // takes the shattered-potion damage even if Cold_resistance blocks the
        // attack's own damage.
        quan = Math.trunc(obj.quan);
        dindx = 0;
        dmg = random.rnd(4);
        break;
    case AD_ELEC:
        throw new UnsupportedItemDestructionError(
            'the AD_ELEC case, over recharge(), Ring_gone() and rnd(10)',
        );
    default:
        /* C's `default:` sets skip and calls impossible(); no caller can
           reach it, because destroy_items() is the only one and its three
           damage types are the three above. */
        throw new UnsupportedItemDestructionError(
            `maybe_destroy_item with unexpected dmgtyp ${dmgtyp}`,
        );
    }

    if (!skip) {
        const osym = obj.oclass; /* for checking glob of slime after it's
                                       destroyed */
        if (obj.in_use)
            --quan; /* one will be used up elsewhere */
        let cnt = 0;
        for (let i = 0; i < quan; i++)
            if (!random.rn2(3)) cnt++;

        if (!cnt) return 0;

        if (u_carry) {
            // zap.c:5921-5926 hands a worn or wielded object to Ring_gone() or
            // setnotworn(). Neither is wired here, and both would run after the
            // message below, so the stop is lifted to the earliest point at
            // which it is certain: the only fire-destroyable object that can
            // carry a mask is a wielded potion, scroll or spellbook, because
            // destroyable() admits no ring under AD_FIRE at all.
            if (obj.owornmask) {
                throw new UnsupportedItemDestructionError(
                    'setnotworn() for a wielded object the fire destroyed',
                );
            }
        }

        if (u_carry || vis) {
            const mult = (cnt === 1)
                ? ((quan === 1) ? '' /* 1 of 1 */
                    : 'One of ') /* 1 of N */
                : ((cnt < quan) ? 'Some of ' /* n of N */
                    : (quan === 2) ? 'Both of ' /* 2 of 2 */
                        : 'All of '); /* N of N */
            await ttyPline(
                `${mult}${destroyedItemName(
                    u_carry, carrier, obj, cnt, quan, state,
                )} ${destroy_strings[dindx][cnt > 1 ? 1 : 0]}!`,
                state,
            );
        }
        if (u_carry) { /* effects that happen only to the player */
            if (osym === POTION_CLASS && dmgtyp !== AD_COLD
                && (!breathless(state.youmonst.data)
                    || haseyes(state.youmonst.data))) {
                await potionbreathe(obj, state, env);
            }
            // zap.c:5931-5933 clears gc.current_wand when the destroyed
            // object is the wand being zapped. js/zap.js dozap() models that
            // value, setting and clearing it around weffects() as zap.c
            // 2672-2675 does, so the clear has an owner to reach; it is
            // omitted here only because destroyable() admits WAND_CLASS under
            // AD_ELEC alone, whose case stops above, so obj can never be the
            // wand being zapped on the one damage type this function ports.
            // The AD_ELEC port adds the clear, against js/zap.js's value.
        }
        // C loops invent.c useup() for the hero and mon.c m_useup() for a
        // monster, one call per destroyed item. m_useup() is unported;
        // removeObjectQuantity() is the same single-item removal against a
        // monster's pack.
        for (let i = 0; i < cnt; i++) {
            if (u_carry) useup(obj, objectGenerationEnv(env));
            else await removeObjectQuantity(obj, 1, env);
        }
        if (dmg) {
            if (!u_carry) {
                return xresist ? 0 : dmg;
            }
            if (xresist) {
                await ttyPline("You aren't hurt!", state);
            } else {
                let how = destroy_strings[dindx][2];
                const one = (cnt === 1);

                if (dmgtyp === AD_FIRE && osym === FOOD_CLASS)
                    how = 'exploding glob of slime';
                await losehp(dmg, one ? how : makeplural(how),
                    one ? KILLED_BY_AN : KILLED_BY, state);
                await exercise(A_STR, false, state, random,
                    { encumberMessage: encumber_msg });
            }
        }
    }
    return dmg;
}

/* scaling factor; dmg/5 stacks will be subjected to destroy_items() */
const DMG_DESTROY_SCALE = 5;
/* largest amount of stacks that will be destroyed in a single call */
const MAX_ITEMS_DESTROYED = 20;

// C ref: zap.c destroy_items() (5964-6097), "target items of specified class in
// mon's inventory for possible destruction; return total amount of damage
// inflicted, though this is unused if mon is the player".
//
// The reservoir at 6045 is what the single rn2(elig_stacks) draw is for: the
// first `limit` eligible stacks fill items_to_destroy[] in order, and every
// stack past that replaces a random one of them.
//
// C's bypass traversal is not modelled. bypass_objlist() clears the bit over
// the whole chain, nxt_unbypassed_obj() sets it on each object it hands back,
// and the closing bypass_objlist() clears it again -- so the chain enters and
// leaves this function with every bit clear, nothing between the two walks
// reads a bit, and a plain nobj walk visits the same objects in the same order.
export async function destroy_items(mon, dmgtyp, dmg_in, env) {
    const { state, random } = env;
    /* initialize items_to_destroy; 0 should not be a valid o_id for anything */
    const items_to_destroy = Array.from(
        { length: MAX_ITEMS_DESTROYED },
        () => ({ oid: 0, otmp: null, deferred: false }),
    );
    let elig_stacks = 0; /* number of destroyable objects found so far */
    const u_carry = mon === state.youmonst;
    const objchn = u_carry ? state.invent : mon.minvent;
    let dmg_out = 0; /* damage caused by items getting destroyed */
    let where = NOBJ_STATES;

    /* don't straight up destroy all items with an equal chance; limit it
       based on the amount of damage being dealt by the source of the item
       destruction */
    let limit = Math.trunc(dmg_in / DMG_DESTROY_SCALE);
    if (dmg_in % DMG_DESTROY_SCALE > random.rn2(DMG_DESTROY_SCALE)) {
        limit++; /* dmg = 9: 20% chance of limit=1, 80% of limit=2, etc */
    }
    if (limit > MAX_ITEMS_DESTROYED) {
        /* in case of incredibly high damage, prevent from overflowing
         * items_to_destroy */
        limit = MAX_ITEMS_DESTROYED;
    }
    if (limit < 1) {
        return 0; /* nothing destroyed */
    }

    for (let obj = objchn; obj; obj = obj.nobj) {
        if (!destroyable(obj, dmgtyp))
            continue; /* this dmg type can't destroy this obj */

        /* obj is eligible; maybe add it to items_to_destroy */
        const i = (elig_stacks < limit) ? elig_stacks
            : random.rn2(elig_stacks);
        /* do this afterwards to avoid not filling items_to_destroy[0] */
        elig_stacks++;
        if (i < 0 || i >= limit) {
            /* random index was too high */
            continue;
        }
        items_to_destroy[i].oid = obj.o_id;
        items_to_destroy[i].otmp = obj;
        if (where === NOBJ_STATES)
            where = obj.where;
        else if (where !== obj.where)
            throw new Error('destroy_item: items in multiple chains');

        /* if loss of this item might dump us onto a trap, hold off
           until later because potential recursive destroy_items() will
           result in setting bypass bits on whole chain--we would skip
           the rest as already processed once control returns here */
        const oprop = objectType(obj, state).oc_oprop;
        items_to_destroy[i].deferred = Boolean(u_carry
            && ((obj.owornmask !== 0
                 && (oprop === LEVITATION || oprop === FLYING))
                /* destroyed wands and potions of polymorph don't trigger
                   polymorph so don't need to be deferred */
                || (obj.otyp === POT_WATER && ismnum(state.u.ulycn)
                    && (Upolyd(state.u) ? obj.blessed : obj.cursed))));
    }
    if (elig_stacks > limit) {
        elig_stacks = limit; /* so we can loop up to elig_stacks */
    }
    for (let defer = 0; defer <= 1; ++defer) {
        /* if we saved some items for later (most likely just a worn ring
           of levitation) and they're still in inventory, handle them on the
           second iteration of the loop */
        for (let i = 0; i < elig_stacks; ++i) {
            const obj = items_to_destroy[i].otmp;
            if (obj && obj.o_id === items_to_destroy[i].oid
                && obj.where === where
                && (items_to_destroy[i].deferred === (defer === 1))) {
                dmg_out += await maybe_destroy_item(mon, obj, dmgtyp, env);
                items_to_destroy[i].otmp = null;
            }
        }
    }
    return dmg_out;
}

// Monster-caused floor fire is the current consumer. Hero-caused shop
// charging remains outside the stable-level non-trap boundary.
export async function burn_floor_objects(
    x,
    y,
    giveFeedback,
    uCaused,
    env,
) {
    if (uCaused) {
        const unsupported = env.unsupported ?? ((reason) => {
            throw new RangeError(`unsupported floor fire: ${reason}`);
        });
        return unsupported('hero-caused object destruction');
    }
    if (typeof env.igniteItems !== 'function') {
        throw new TypeError(
            'floor fire requires an igniteItems operation',
        );
    }

    let count = 0;
    for (let obj = env.state.level.objects[x][y]; obj;) {
        const next = obj.nexthere;
        if ((obj.oclass === SCROLL_CLASS
                || obj.oclass === SPBOOK_CLASS
                || obj.otyp === GLOB_OF_GREEN_SLIME)
            && obj.otyp !== SCR_FIRE
            && obj.otyp !== SPE_FIREBALL
            && !obj_resists(obj, 2, 100, objectGenerationEnv(env))) {
            const originalQuantity = Math.trunc(obj.quan);
            let destroyed = 0;
            for (let index = 0; index < originalQuantity; ++index) {
                if (!env.random.rn2(3)) ++destroyed;
            }
            if (destroyed) {
                const names = giveFeedback
                    ? floorBurnMessageNames(obj, env.state)
                    : null;
                await removeObjectQuantity(obj, destroyed, env);
                count += destroyed;
                if (names) {
                    await ttyPline(
                        destroyed > 1
                            ? `${destroyed} ${names.plural} burn.`
                            : `${/^[aeiou]/iu.test(names.singular)
                                ? 'An'
                                : 'A'} ${names.singular} burns.`,
                        env.state,
                    );
                }
            }
        }
        obj = next;
    }
    await env.igniteItems(env.state.level.objects[x][y], env);
    return count;
}
