// do_wear.js -- Taking one worn piece of armor off with the 'T' command.
//
// C ref: src/do_wear.c off_msg() (67-72), Cloak_off() (382-431),
//        Helmet_off() (517-564), Shield_off() (732-756), Shirt_off() (777-794),
//        Armor_off() (908-930), fingers_or_gloves() (59-65),
//        cancel_doff() (1642-1659), count_worn_stuff() (1731-1766),
//        armor_or_accessory_off() (1768-1829), dotakeoff() (1831-1855),
//        cursed() (1891-1917), armoroff() (1919-2008), stuck_ring()
//        (2656-2683), unchanger() (2685-2692), select_off()
//        (2694-2821), reset_remarm() (3012-3018), inaccessible_equipment()
//        (3338-3400), equip_ok() (3402-3447) and takeoff_ok() (3470-3475).
//
// do_wear.c find_ac() was ported earlier and lives in
// js/u_init_inventory_attrs.js, beside the startup code that first calls it.
//
// The 'A' occupation spine -- do_takeoff(), take_off(),
// better_not_take_that_off() and doddoremarm() -- is not ported. armoroff()'s
// delayed branch at do_wear.c:1930-1972 is ported for a suit only. Every
// refusal below names the C function it stops in front of.

import {
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FINGER,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    LEFT_HANDED,
    PARANOID_REMOVE,
    W_ACCESSORY,
    W_ARM,
    W_ARMC,
    W_ARMH,
    W_ARMOR,
    W_ARMS,
    W_ARMU,
    W_RING,
    W_WEP,
    WORN_AMUL,
    WORN_ARMOR,
    WORN_BLINDF,
    WORN_CLOAK,
    WORN_HELMET,
    WORN_SHIELD,
    WORN_SHIRT,
} from './const.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { getobj } from './invent.js';
import { cvt_prop_to_mseenres, monstunseesu, nolimbs } from './mondata.js';
import { PM_ARCHEOLOGIST } from './monsters.js';
import { change_luck } from './moveloop_preamble.js';
import {
    Is_dragon_armor,
    is_shield,
    objectType,
    set_bknown,
} from './obj.js';
import {
    AMULET_CLASS,
    AMULET_OF_UNCHANGING,
    ARMOR_CLASS,
    ARM_BOOTS,
    ARM_GLOVES,
    ARM_HELM,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
    ARM_CLOAK,
    BLINDFOLD,
    CLOAK_OF_MAGIC_RESISTANCE,
    CLOAK_OF_PROTECTION,
    DENTED_POT,
    DWARVISH_CLOAK,
    FEDORA,
    HAWAIIAN_SHIRT,
    LEATHER_CLOAK,
    LENSES,
    MEAT_RING,
    OILSKIN_CLOAK,
    ORCISH_CLOAK,
    RING_CLASS,
    ROBE,
    TOWEL,
    T_SHIRT,
} from './objects.js';
import {
    cloak_simple_name,
    donameFresh,
    gloves_simple_name,
    suit_simple_name,
    the,
    xnameFresh,
} from './objnam.js';
import { body_part } from './polyself.js';
import { ttyPline } from './tty_message.js';
import { Glib, welded } from './wield.js';
import { bimanual, setworn } from './worn.js';

// Raised where do_wear.c reaches a branch this port has not translated.
// js/cmd.js failClosedCommandRefusals() lists it, so the segment keeps every
// frame the command already matched instead of failing hard.
export class UnsupportedTakeOffError extends Error {
    constructor(what) {
        super(`take off reached an unported branch: ${what}`);
        this.name = 'UnsupportedTakeOffError';
    }
}

// C ref: context.h struct takeoff_info (51-57), reached through
// svc.context.takeoff. Only `mask` is modelled: `what` and `delay` are written
// by do_takeoff() and `disrobing` by take_off(), all in the unported 'A'
// spine. `cancelled_don` is written by cancel_don(), which cancel_doff() below
// cannot reach, and by Armor_off(), which leaves it out because
// dragon_armor_handling()'s BLUE arm is its only reader and that arm is
// refused. Nothing outside this file reads the field, and every path through
// dotakeoff() leaves it at 0 again.
function takeoffContext(state) {
    state.context ??= {};
    state.context.takeoff ??= { mask: 0 };
    return state.context.takeoff;
}

// C ref: do_wear.c reset_remarm() (3012-3018). C clears takeoff.what and
// takeoff.disrobing here as well; see takeoffContext() for why neither exists.
// Exported for cmd.c reset_occupations(), the first caller outside this file.
export function reset_remarm(state = game) {
    takeoffContext(state).mask = 0;
}

// C ref: do_wear.c cancel_doff() (1642-1659), supplied to setworn() through
// the worn.js hook of the same name. C's donning() test at 1656 reads
// ga.afternmv and svc.context.takeoff.what. Neither can be true here.
// donning() (1571-1597) and doffing() (1599-1640) compare ga.afternmv against
// the fourteen `<X>_on`/`<X>_off` armor callbacks and nothing else, so any
// other callback pending -- js/pray.js prayer_done() is the port's only other
// one -- leaves both FALSE whatever the slot. Of the fourteen this port
// installs one, Armor_off, in armoroff()'s delayed branch, and unmul() clears
// state.afternmv before invoking it, so Armor_off()'s own setworn() sees it
// null. doffing()'s `what` arms need svc.context.takeoff.what, which nothing
// writes -- only the unported 'A' spine does. donning() is therefore always
// FALSE here, cancel_don() cannot be reached, and the mask clear is the whole
// of it.
function cancel_doff(obj, slotmask, env) {
    takeoffContext(env.state).mask &= ~slotmask;
}

// The worn.js hook set every setworn() call needs. C runs all three from
// inside setworn() (worn.c:73-142) itself; worn.js injects them because their
// owners sit in other source files. It lives here because cancel_doff() does,
// and do.c drop() imports it for its setuwep(), setuqwep() and setuswapwep()
// calls. setnotworn() (worn.c:150) calls the same three, but nothing reaches
// it, and its copies are not interchangeable: they run for every matching
// slot, where setworn()'s sit inside the `wp->w_mask & ~(W_SWAPWEP |
// W_QUIVER)` gate at worn.c:93 that js/worn.js removeSlotEffects()
// reproduces, and setnotworn() runs cancel_doff() before the property work
// rather than after it.
export function setwornEnv(state = game) {
    return {
        state,
        hooks: {
            cancelDoff: cancel_doff,
            // C ref: worn.c:102 monstunseesu_prop(p).
            monsterUnseesProperty: (propertyIndex, env) => {
                monstunseesu(cvt_prop_to_mseenres(propertyIndex), env.state);
            },
            // C ref: worn.c:105-106 set_artifact_intrinsic(). artifact.c owns
            // it and no role starts with worn artifact armor, so a wished-for
            // artifact suit is the only way in.
            setArtifactIntrinsic: () => {
                throw new UnsupportedTakeOffError('set_artifact_intrinsic()');
            },
        },
    };
}

// C ref: do_wear.c off_msg() (67-72). armoroff() calls this only after the
// item has left its slot, so doname() adds no "(being worn)" suffix.
async function off_msg(otmp, state) {
    if (state.flags.verbose)
        await ttyPline(`You were wearing ${donameFresh(otmp, state)}.`, state);
}

// C ref: do_wear.c Armor_off() (908-930). armoroff() reaches this both
// immediately, for the leather jacket that is the one suit with an oc_delay of
// 0, and through hack.c unmul() several turns later for every other suit.
//
// Both of C's tails at 920-928 belong to dragon armor alone, so the guard
// settles them without porting either. artifact_light() answers TRUE for no
// other suit -- gold dragon scales and mail are its only armor -- which leaves
// `was_arti_light` FALSE and C's end_burn() arm dead. dragon_armor_handling()
// has an arm for eight of the ten colors, in scales and in mail, and takes
// `default: break;` for everything else; grey and silver dragon armor takes
// that default too but is refused with the rest of the block, because
// js/obj.js Is_dragon_armor() answers for obj.h's whole disjunction and
// separating those two would buy nothing that a ported
// dragon_armor_handling() will not deliver anyway.
//
// The guard is checked before the item leaves its slot, so tripping it changes
// nothing. C's `svc.context.takeoff.cancelled_don = FALSE` between the two is
// left out; see takeoffContext() for why the field is not modelled.
function Armor_off(state) {
    const otmp = state.uarm;

    if (Is_dragon_armor(otmp)) {
        throw new UnsupportedTakeOffError(
            `Armor_off() for otyp ${otmp.otyp}`,
        );
    }
    takeoffContext(state).mask &= ~W_ARM;
    setworn(null, W_ARM, setwornEnv(state));
    return 0;
}

// Cloak_off()'s seven `break` labels at do_wear.c:393-400, the types whose
// removal has no effect beyond leaving the slot. Every cloak carries an
// oc_delay of 0, so unlike the other slots all twelve types reach Cloak_off().
const PLAIN_CLOAKS = new Set([
    ORCISH_CLOAK, DWARVISH_CLOAK, CLOAK_OF_PROTECTION,
    CLOAK_OF_MAGIC_RESISTANCE, OILSKIN_CLOAK, ROBE, LEATHER_CLOAK,
]);

// C ref: do_wear.c Cloak_off() (382-431). C computes `oldprop` at 385 for
// toggle_stealth(), toggle_displacement() and the invisibility arm, and runs
// its switch after setworn(); all three of those arms stop here, so nothing
// reads oldprop and the type test is hoisted above the removal instead, which
// leaves the cloak on when it stops.
function Cloak_off(state) {
    const otyp = state.uarmc.otyp;

    if (!PLAIN_CLOAKS.has(otyp)) {
        // ELVEN_CLOAK and CLOAK_OF_DISPLACEMENT need toggle_stealth() and
        // toggle_displacement(); MUMMY_WRAPPING and CLOAK_OF_INVISIBILITY
        // need the See_invisible messages and newsym(); ALCHEMY_SMOCK clears
        // EAcid_resistance. C's own `default:` reports impossible() for any
        // other cloak type.
        throw new UnsupportedTakeOffError(`Cloak_off() for otyp ${otyp}`);
    }
    takeoffContext(state).mask &= ~W_ARMC;
    /* For mummy wrapping, taking it off first resets `Invisible'. */
    setworn(null, W_ARMC, setwornEnv(state));
    return 0;
}

// C ref: do_wear.c Helmet_off() (517-564). C's uarmh is still worn while the
// switch runs, so the FEDORA arm reads the hero's role and not the helmet.
//
// objects.h gives FEDORA and DENTED_POT an oc_delay of 0 and every other
// helmet an oc_delay of 1, so armoroff()'s delayed branch stops in front of
// the other nine arms -- DUNCE_CAP's and CORNUTHAUM's status and Charisma
// changes, HELM_OF_TELEPATHY's and HELM_OF_CAUTION's see_monsters(),
// HELM_OF_BRILLIANCE's adj_abon(), HELM_OF_OPPOSITE_ALIGNMENT's
// uchangealign(), and the plain break the four remaining hard helms share
// with the dented pot.
function Helmet_off(state) {
    const otyp = state.uarmh.otyp;

    if (otyp !== FEDORA && otyp !== DENTED_POT)
        throw new UnsupportedTakeOffError(`Helmet_off() for otyp ${otyp}`);
    takeoffContext(state).mask &= ~W_ARMH;

    switch (otyp) {
    case FEDORA:
        // Helmet_on()'s matching change_luck(1) at do_wear.c:525 is never
        // run for a starting fedora: u_init.c ini_inv_use_obj() calls
        // setworn() directly, so an Archeologist loses a point of Luck the
        // first time she takes her hat off.
        if (state.urole?.mnum === PM_ARCHEOLOGIST) change_luck(-1, state);
        break;
    default: /* DENTED_POT, one of C's plain break labels at 528-533 */
        break;
    }
    setworn(null, W_ARMH, setwornEnv(state));
    return 0;
}

// C ref: do_wear.c Shield_off() (732-756). No shield needs special handling
// when taken off; C keeps a switch over all nine shield types so that a new
// one would be noticed, and obj.h is_shield() answers for exactly those nine.
function Shield_off(state) {
    if (!is_shield(state.uarms, state)) {
        throw new UnsupportedTakeOffError(
            `Shield_off() for otyp ${state.uarms.otyp}`,
        );
    }
    takeoffContext(state).mask &= ~W_ARMS;
    setworn(null, W_ARMS, setwornEnv(state));
    return 0;
}

// C ref: do_wear.c Shirt_off() (777-794). As with Shield_off(), C's switch
// exists only to catch a shirt type nobody has taught it about; the two it
// knows are the only two the game has.
function Shirt_off(state) {
    const otyp = state.uarmu.otyp;

    if (otyp !== HAWAIIAN_SHIRT && otyp !== T_SHIRT)
        throw new UnsupportedTakeOffError(`Shirt_off() for otyp ${otyp}`);
    takeoffContext(state).mask &= ~W_ARMU;
    setworn(null, W_ARMU, setwornEnv(state));
    return 0;
}

// C ref: do_wear.c count_worn_stuff() (1731-1766). C stores its two counts in
// file statics and hands back the single item through a pointer; the caller
// reads all three immediately, so they travel together here. `which` is the
// last slot found, which is the only worn item when its count is 1.
export function count_worn_stuff(accessorizing, state = game) {
    let Narmorpieces = 0;
    let Naccessories = 0;
    let otmp = null;
    let which = null;

    const moreworn = (x) => {
        if (x) {
            otmp = x;
            return 1;
        }
        return 0;
    };

    Narmorpieces += moreworn(state.uarmh);
    Narmorpieces += moreworn(state.uarms);
    Narmorpieces += moreworn(state.uarmg);
    Narmorpieces += moreworn(state.uarmf);
    /* for cloak/suit/shirt, we only count the outermost item so that it
       can be taken off without confirmation if final count ends up as 1 */
    if (state.uarmc) Narmorpieces += moreworn(state.uarmc);
    else if (state.uarm) Narmorpieces += moreworn(state.uarm);
    else if (state.uarmu) Narmorpieces += moreworn(state.uarmu);
    if (!accessorizing) which = otmp; /* default item iff Narmorpieces is 1 */

    otmp = null;
    Naccessories += moreworn(state.uleft);
    Naccessories += moreworn(state.uright);
    Naccessories += moreworn(state.uamul);
    Naccessories += moreworn(state.ublindf);
    if (accessorizing) which = otmp; /* default item iff Naccessories is 1 */

    return { which, Narmorpieces, Naccessories };
}

// C ref: do_wear.c inaccessible_equipment() (3338-3400). equip_ok() is the
// only ported caller and passes a null `verb`, so C's three message arms have
// no input; dip and grease, which supply one, are unported.
export function inaccessible_equipment(
    obj,
    verb,
    only_if_known_cursed,
    state = game,
) {
    const anycovering = !only_if_known_cursed; /* more comprehensible... */
    const blocksaccess = (x) => anycovering || Boolean(x.cursed && x.bknown);

    if (verb)
        throw new UnsupportedTakeOffError('inaccessible_equipment() messages');
    if (!obj || !obj.owornmask)
        return false; /* not inaccessible */

    /* check for suit covered by cloak */
    if (obj === state.uarm && state.uarmc && blocksaccess(state.uarmc))
        return true;
    /* check for shirt covered by suit and/or cloak */
    if (obj === state.uarmu
        && ((state.uarm && blocksaccess(state.uarm))
            || (state.uarmc && blocksaccess(state.uarmc)))) {
        return true;
    }
    /* check for ring covered by gloves */
    if ((obj === state.uleft || obj === state.uright)
        && state.uarmg && blocksaccess(state.uarmg)) {
        return true;
    }
    /* item is not inaccessible */
    return false;
}

// C ref: do_wear.c equip_ok() (3402-3447). C's `removing && !
// gi.item_action_in_progress` test at 3439 loses its second term here:
// ia_dotakeoff() is the only function that raises the flag and it is unported,
// so gi.item_action_in_progress is always FALSE.
export function equip_ok(obj, removing, accessory, state = game) {
    if (!obj) return GETOBJ_EXCLUDE;

    /* ignore for putting on if already worn, or removing if not worn */
    const is_worn = (obj.owornmask & (W_ARMOR | W_ACCESSORY)) !== 0;
    if (Boolean(removing) !== is_worn) return GETOBJ_EXCLUDE_INACCESS;

    /* exclude most object classes outright */
    if (obj.oclass !== ARMOR_CLASS && obj.oclass !== RING_CLASS
        && obj.oclass !== AMULET_CLASS) {
        /* ... except for a few wearable exceptions outside these classes */
        if (obj.otyp !== MEAT_RING && obj.otyp !== BLINDFOLD
            && obj.otyp !== TOWEL && obj.otyp !== LENSES) {
            return GETOBJ_EXCLUDE;
        }
    }

    /* armor with 'P' or 'R' or accessory with 'W' or 'T' */
    if (Boolean(accessory) !== (obj.oclass !== ARMOR_CLASS))
        return GETOBJ_DOWNPLAY;

    /* armor we can't wear, e.g. from polyform */
    if (obj.oclass === ARMOR_CLASS && !removing) {
        // C ref: do_wear.c:3434 canwearobj(). Only wear_ok() and puton_ok()
        // reach this, and 'W' and 'P' are unported.
        throw new UnsupportedTakeOffError('canwearobj()');
    }

    /* removing inaccessible equipment */
    if (removing) {
        if (inaccessible_equipment(
            obj, null, obj.oclass === RING_CLASS, state,
        )) {
            return GETOBJ_EXCLUDE_INACCESS;
        }
    }

    /* all good to go */
    return GETOBJ_SUGGEST;
}

// C ref: do_wear.c takeoff_ok() (3470-3475), the getobj() callback for 'T'.
export function takeoff_ok(obj, state = game) {
    return equip_ok(obj, true, false, state);
}

// C ref: do_wear.c fingers_or_gloves() (59-65).
function fingers_or_gloves(check_gloves, state) {
    return (check_gloves && state.uarmg)
        ? gloves_simple_name(state.uarmg, state) /* "gloves" or "gauntlets" */
        : makeplural(body_part(FINGER, state.youmonst)); /* "fingers" */
}

// C ref: do_wear.c cursed() (1891-1917). Answers whether a worn item is
// cursed and therefore stuck, printing the reason when it is.
export async function cursed(otmp, state = game) {
    if (!otmp) throw new UnsupportedTakeOffError('cursed() without otmp');

    /* Curses, like chickens, come home to roost. */
    if (otmp === state.uwep ? welded(otmp, state) : Boolean(otmp.cursed)) {
        const use_plural = is_boots(otmp, state) || is_gloves(otmp, state)
            || otmp.otyp === LENSES || otmp.quan > 1;

        /* might be trying again after applying grease to hands */
        if (Glib(state) && otmp.bknown
            /* for weapon, we'll only get here via 'A )' */
            && (state.uarmg
                ? otmp === state.uwep
                : (otmp.owornmask & (W_WEP | W_RING)) !== 0)) {
            await ttyPline(
                `Despite your slippery ${fingers_or_gloves(true, state)}, `
                + 'you can\'t.',
                state,
            );
        } else {
            await ttyPline(
                `You can't.  ${use_plural ? 'They are' : 'It is'} cursed.`,
                state,
            );
        }
        set_bknown(otmp, 1, { state });
        return 1;
    }
    return 0;
}

// C ref: obj.h is_boots() (285-287) and is_gloves() (288-290), beside
// js/obj.js is_shield(). Both read the objects[] field stored here under its
// oc_subtyp union alias.
function is_boots(obj, state) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_subtyp === ARM_BOOTS;
}

function is_gloves(obj, state) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_subtyp === ARM_GLOVES;
}

// C ref: you.h:566 RING_ON_PRIMARY. The ring worn on the hand that also holds
// the weapon; u_init.c gives nine heroes in ten RIGHT_HANDED.
function RING_ON_PRIMARY(state) {
    return state.u.uhandedness === LEFT_HANDED ? state.uleft : state.uright;
}

// C ref: do_wear.c stuck_ring() (2656-2683). Answers the worn item that stops
// `ring` coming off, or null when nothing does. This port has C's two callers:
// pray.c in_trouble() asks about levitation rings, and insight.c
// one_characteristic() asks about sustain-ability rings. Either way the answer
// only matters when the ring is worn and is that type.
//
// C opens with an impossible() for a ring that is worn in neither slot. Both
// callers pass uleft or uright literally, so the diagnostic is unreachable and
// this port drops it rather than inventing a message sink for it.
export function stuck_ring(ring, otyp, state = game) {
    if (ring && ring.otyp === otyp) {
        /* reasons ring can't be removed match those checked by select_off();
           limbless case has extra checks because ordinarily it's temporary */
        if (nolimbs(state.youmonst?.data) && state.uamul
            && state.uamul.otyp === AMULET_OF_UNCHANGING
            && state.uamul.cursed)
            return state.uamul;
        if (welded(state.uwep, state)
            && (ring === RING_ON_PRIMARY(state)
                || bimanual(state.uwep, state)))
            return state.uwep;
        if (state.uarmg && state.uarmg.cursed) return state.uarmg;
        if (ring.cursed) return ring;
        /* normally outermost layer is processed first, but slippery gloves
           wears off quickly so uncurse ring itself before handling those */
        if (state.uarmg && Glib(state)) return state.uarmg;
    }
    /* either no ring or not right type or nothing prevents its removal */
    return null;
}

// C ref: do_wear.c unchanger() (2685-2692). The worn item that confers
// Unchanging; pray.c in_trouble() is its only caller.
export function unchanger(state = game) {
    if (state.uamul && state.uamul.otyp === AMULET_OF_UNCHANGING)
        return state.uamul;
    return null;
}

// The slot-to-mask chain do_wear.c:2786-2812 spells out, restricted to the
// slots that can reach it: select_off() stops on a ring, on gloves and on
// boots above, so their labels would be dead here.
function takeoffMaskFor(otmp, state) {
    if (otmp === state.uarm) return WORN_ARMOR;
    if (otmp === state.uarmc) return WORN_CLOAK;
    if (otmp === state.uarmh) return WORN_HELMET;
    if (otmp === state.uarms) return WORN_SHIELD;
    if (otmp === state.uarmu) return WORN_SHIRT;
    if (otmp === state.uamul) return WORN_AMUL;
    if (otmp === state.ublindf) return WORN_BLINDF;
    // C's remaining labels are uwep, uswapwep and uquiver, which only the 'A'
    // command reaches, and then impossible("select_off: %s???").
    throw new UnsupportedTakeOffError('select_off() for a wielded item');
}

// C ref: do_wear.c select_off() (2694-2821). C answers 0 always; what it
// really produces is the bit it adds to takeoff.mask, and an empty mask is
// how it reports a refusal to its caller.
export async function select_off(otmp, state = game) {
    if (!otmp) return 0;

    /* special ring checks */
    if (otmp === state.uright || otmp === state.uleft) {
        // do_wear.c:2703-2726 reads nolimbs(), RING_ON_PRIMARY and Glib
        // before Ring_off() removes the ring; 'R' owns all of it.
        throw new UnsupportedTakeOffError('select_off() ring checks');
    }
    /* special glove checks */
    if (otmp === state.uarmg) {
        // do_wear.c:2727-2742, whose last test is
        // better_not_take_that_off(), part of the unported 'A' spine.
        throw new UnsupportedTakeOffError('select_off() glove checks');
    }
    /* special boot checks */
    if (otmp === state.uarmf) {
        // do_wear.c:2743-2754, the bear-trap and stuck-in-the-floor
        // refusals. Boots_off() below them is unported too.
        throw new UnsupportedTakeOffError('select_off() boot checks');
    }
    /* special suit and shirt checks */
    if (otmp === state.uarm || otmp === state.uarmu) {
        let buf = '';
        let why = null; /* the item which prevents disrobing */

        if (state.uarmc && state.uarmc.cursed) {
            buf = `remove your ${cloak_simple_name(state.uarmc, state)}`;
            why = state.uarmc;
        } else if (otmp === state.uarmu && state.uarm && state.uarm.cursed) {
            buf = 'remove your suit';
            why = state.uarm;
        } else if (state.uwep && welded(state.uwep, state)
                   && bimanual(state.uwep, state)) {
            // do_wear.c:2766-2770 names the weapon with is_sword(), the
            // BATTLE_AXE test and c_weapon; welded() needs a cursed weapon,
            // and u_init.c:1223 clears cursed on every starting object.
            throw new UnsupportedTakeOffError(
                'select_off() welded two-handed weapon',
            );
        }
        if (why) {
            await ttyPline(
                `You cannot ${buf} to take off `
                + `${the(xnameFresh(otmp, state))}.`,
                state,
            );
            set_bknown(why, 1, { state });
            return 0;
        }
    }
    /* basic curse check */
    // C ref: do_wear.c:2777-2784. uquiver and a non-twoweap uswapwep skip it;
    // neither can arrive here, because takeoffMaskFor() stops on both.
    if (await cursed(otmp, state)) return 0;

    takeoffContext(state).mask |= takeoffMaskFor(otmp, state);
    return 0;
}

// C ref: do_wear.c armoroff() (1919-2008). Both branches are ported, the
// delayed one at 1930-1972 for a suit only.
export async function armoroff(otmp, state = game) {
    const delay = -objectType(otmp, state).oc_delay;

    if (await cursed(otmp, state)) return 0;
    /* this used to make assumptions about which types of armor had
       delays and which didn't; now both are handled for all types */
    if (delay) {
        // C's switch at 1933-1965 carries an arm for all seven categories.
        // Three of them cannot arrive: objects.h gives every shield, every
        // cloak and both shirts an oc_delay of 0. Of the four that can,
        // ARM_HELM would need Helmet_off()'s other nine arms and ARM_GLOVES
        // and ARM_BOOTS need Gloves_off() (646-732) and Boots_off()
        // (262-382), none of which is ported. The test sits above nomul() so
        // that a refused category stops before anything is written; C's own
        // `default: impossible()` arm cannot be reached, because every
        // ARMOR_CLASS entry in objects.h carries one of the seven categories.
        if (objectType(otmp, state).oc_subtyp !== ARM_SUIT) {
            throw new UnsupportedTakeOffError(
                'armoroff() delayed branch for armor category '
                + `${objectType(otmp, state).oc_subtyp}`,
            );
        }
        // allmain.c moveloop_core() counts gm.multi back up one turn at a
        // time and calls hack.c unmul() on the turn it reaches zero; unmul()
        // prints gn.nomovemsg and runs the ga.afternmv callback. No segment
        // boundary can fall between this write and that read, because
        // moveloop_core() reads no key while gm.multi is negative, so none of
        // the three needs save handling -- decl.c:175 leaves C's ga.afternmv
        // out of the save file for the same reason.
        nomul(delay, state);
        state.multi_reason = 'disrobing';
        /* case ARM_SUIT */
        const what = suit_simple_name(otmp, state);

        state.afternmv = Armor_off;
        // C guards the two lines below with `if (what)`, which only its
        // impossible() arm can fail; suit_simple_name() always answers a
        // string, so the guard is vacuous once ARM_SUIT is the only arm.
        /* sizeof offdelaybuf == 60; increase it if this becomes longer */
        state.nomovemsg = `You finish taking off your ${what}.`;
    } else {
        /* no delay so no '(*afternmv)()' or 'nomovemsg' */
        switch (objectType(otmp, state).oc_subtyp) {
        case ARM_SUIT:
            Armor_off(state);
            break;
        case ARM_SHIELD:
            Shield_off(state);
            break;
        case ARM_HELM:
            Helmet_off(state);
            break;
        // C's ARM_GLOVES and ARM_BOOTS arms at 1985-1990 are absent rather
        // than stopped. objects.h gives every pair of gloves an oc_delay of 1
        // and every pair of boots an oc_delay of 2, so the delayed branch
        // above always takes them first, and select_off() stops on either
        // slot earlier still.
        case ARM_CLOAK:
            Cloak_off(state);
            break;
        case ARM_SHIRT:
            Shirt_off(state);
            break;
        default:
            throw new UnsupportedTakeOffError(
                'armoroff() for armor category '
                + `${objectType(otmp, state).oc_subtyp}`,
            );
        }
        /* We want off_msg() after removing the item to
           avoid "You were wearing ____ (being worn)." */
        await off_msg(otmp, state);
    }
    takeoffContext(state).mask = 0;
    return 1;
}

// C ref: do_wear.c armor_or_accessory_off() (1768-1829), shared by
// dotakeoff('T') and doremring('R').
export async function armor_or_accessory_off(obj, state = game) {
    if (!(obj.owornmask & (W_ARMOR | W_ACCESSORY))) {
        await ttyPline('You are not wearing that.', state);
        return ECMD_OK;
    }
    if (obj === state.u?.uskin
        || (obj === state.uarm && state.uarmc)
        || (obj === state.uarmu && (state.uarmc || state.uarm))) {
        let why = '';
        let what = '';

        if (obj !== state.u?.uskin) {
            if (state.uarmc) what += cloak_simple_name(state.uarmc, state);
            if (obj === state.uarmu && state.uarm) {
                if (state.uarmc) what += ' and ';
                what += suit_simple_name(state.uarm, state);
            }
            why = ` without taking off your ${what} first`;
        } else {
            why = "; it's embedded";
        }
        await ttyPline(`You can't take that off${why}.`, state);
        return ECMD_OK;
    }

    /* clear context.takeoff.mask and context.takeoff.what */
    reset_remarm(state);
    await select_off(obj, state);
    if (!takeoffContext(state).mask)
        return ECMD_OK;
    /* none of armoroff()/Ring_/Amulet/Blindf_off() use context.takeoff.mask */
    reset_remarm(state);

    if (obj.owornmask & W_ARMOR) {
        await armoroff(obj, state);
    } else {
        // do_wear.c:1806-1826 dispatches Ring_off(), Amulet_off() and
        // Blindf_off(); an amulet or a blindfold reaches here, a ring stops
        // one frame earlier inside select_off().
        throw new UnsupportedTakeOffError(
            'Ring_off()/Amulet_off()/Blindf_off()',
        );
    }
    return ECMD_TIME;
}

// C ref: flag.h:570 ParanoidRemove.
//
// options.c optfn_paranoid_confirmation() is unported: parseNethackrc() keeps
// the option's raw text in flags.paranoid_confirmation and never folds it into
// flags.paranoia_bits, which therefore still holds the startup default
// options.c initoptions_init() sets. Reading that default would silently
// answer FALSE for a game that asked for the confirmation and take the
// no-prompt arm where C prompts, so a game that supplied the option at all
// stops here. The port cannot narrow the stop to the games that named Remove
// or Takeoff without parsing the value, which is that handler's own work.
function ParanoidRemove(state) {
    if (state.flags.paranoid_confirmation !== undefined)
        throw new UnsupportedTakeOffError('optfn_paranoid_confirmation()');
    return (state.flags.paranoia_bits & PARANOID_REMOVE) !== 0;
}

// C ref: do_wear.c dotakeoff() (1831-1855), the 'T' command. C's prompt test
// at 1849 loses its `gi.item_action_in_progress` term for the reason
// equip_ok() above gives.
export async function dotakeoff(state = game) {
    const counts = count_worn_stuff(false, state);
    let otmp = counts.which;

    if (!counts.Narmorpieces && !counts.Naccessories) {
        if (state.u?.uskin) {
            // do_wear.c:1838-1843 names the dragon scales merged with a
            // polymorphed hero's skin; polyself.c owns uskin and nothing in
            // the port sets it.
            throw new UnsupportedTakeOffError('dotakeoff() uskin message');
        }
        await ttyPline('Not wearing any armor or accessories.', state);
        return ECMD_OK;
    }
    if (counts.Narmorpieces !== 1 || ParanoidRemove(state))
        otmp = await getobj('take off', takeoff_ok, GETOBJ_NOFLAGS, state);
    if (!otmp)
        return ECMD_CANCEL;

    return armor_or_accessory_off(otmp, state);
}

export const _doWearInternals = Object.freeze({
    Armor_off,
    Cloak_off,
    Helmet_off,
    Shield_off,
    Shirt_off,
    cancel_doff,
    is_boots,
    is_gloves,
    off_msg,
    reset_remarm,
    takeoffContext,
    setwornEnv,
});
