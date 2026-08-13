// do_wear.js -- Putting one piece of armor on with 'W' and taking one off
// with 'T'.
//
// C ref: src/do_wear.c on_msg() (75-99), off_msg() (67-72), Cloak_off()
//        (382-431), Helmet_off() (517-564), Shield_on() (704-730),
//        Shield_off() (732-756), Shirt_off() (777-794), Armor_off()
//        (908-930), fingers_or_gloves() (59-65), cancel_doff() (1642-1659),
//        count_worn_stuff() (1731-1766), armor_or_accessory_off()
//        (1768-1829), dotakeoff() (1831-1855), cursed() (1891-1917),
//        armoroff() (1919-2008), already_wearing() (2010-2014), canwearobj()
//        (2029-2206), accessory_or_armor_on() (2208-2428), dowear()
//        (2430-2450), stuck_ring() (2656-2683), unchanger() (2685-2692),
//        select_off() (2694-2821), reset_remarm() (3012-3018),
//        inaccessible_equipment() (3338-3400), equip_ok() (3402-3447),
//        wear_ok() (3463-3468) and takeoff_ok() (3470-3475).
//
// do_wear.c find_ac() was ported earlier and lives in
// js/u_init_inventory_attrs.js, beside the startup code that first calls it.
//
// The 'A' occupation spine -- do_takeoff(), take_off(),
// better_not_take_that_off() and doddoremarm() -- is not ported. armoroff()'s
// delayed branch at do_wear.c:1930-1972 is ported for a suit only, and
// accessory_or_armor_on() puts armor on for the shield slot only. Every
// refusal below names the C function it stops in front of.

import {
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FINGER,
    FOOT,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HEAD,
    LEFT_HANDED,
    LEG,
    PARANOID_REMOVE,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_INFLOOR,
    TT_LAVA,
    Upolyd,
    W_ACCESSORY,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMOR,
    W_ARMS,
    W_ARMU,
    W_RING,
    W_TOOL,
    W_WEAPONS,
    W_WEP,
    WORN_AMUL,
    WORN_ARMOR,
    WORN_BLINDF,
    WORN_CLOAK,
    WORN_HELMET,
    WORN_SHIELD,
    WORN_SHIRT,
    plur,
} from './const.js';
import { surface } from './dungeon.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import { nomul, unmul } from './hack.js';
import { getobj, update_inventory } from './invent.js';
import { racial_exception } from './makemon_create.js';
import {
    cantweararm,
    cvt_prop_to_mseenres,
    has_horns,
    monstunseesu,
    nohands,
    nolimbs,
    num_horns,
    slithy,
    verysmall,
} from './mondata.js';
import { MZ_SMALL, PM_ARCHEOLOGIST, S_CENTAUR } from './monsters.js';
import { change_luck } from './moveloop_preamble.js';
import {
    Is_dragon_armor,
    WrappingAllowed,
    is_boots,
    is_cloak,
    is_flimsy,
    is_gloves,
    is_helmet,
    is_shield,
    is_shirt,
    is_suit,
    is_sword,
    objectType,
    set_bknown,
} from './obj.js';
import {
    AMULET_CLASS,
    AMULET_OF_UNCHANGING,
    ARMOR_CLASS,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
    ARM_CLOAK,
    ARM_HELM,
    BATTLE_AXE,
    BLINDFOLD,
    CLOAK_OF_MAGIC_RESISTANCE,
    CLOAK_OF_PROTECTION,
    DENTED_POT,
    DWARVISH_CLOAK,
    FEDORA,
    HAWAIIAN_SHIRT,
    HELM_OF_OPPOSITE_ALIGNMENT,
    LEATHER_CLOAK,
    LENSES,
    MEAT_RING,
    MUMMY_WRAPPING,
    OILSKIN_CLOAK,
    ORCISH_CLOAK,
    RING_CLASS,
    ROBE,
    TOWEL,
    T_SHIRT,
} from './objects.js';
import {
    an,
    cloak_simple_name,
    donameFresh,
    gloves_simple_name,
    helm_simple_name,
    obj_is_pname,
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

// The same fail-closed boundary for the 'W' half of do_wear.c. The halves share
// three functions, not one: equip_ok(), which reaches canwearobj() on the
// wearing pass alone because `T` and `R` pass removing TRUE and return before
// it; takeoffContext(), whose mask accessory_or_armor_on() clears; and
// setwornEnv(), whose hook set every setworn() call takes. What separates the
// classes is ownership rather than isolation: the wear spine raises
// UnsupportedWearError for every branch it owns, while setwornEnv()'s
// setArtifactIntrinsic hook keeps the take-off name. A `W` cannot reach that
// hook today only because accessory_or_armor_on() refuses obj.oartifact above
// setworn(); relaxing that refusal would let a wear command raise the take-off
// class, so move the hook's name with it.
export class UnsupportedWearError extends Error {
    constructor(what) {
        super(`wear reached an unported branch: ${what}`);
        this.name = 'UnsupportedWearError';
    }
}

// C ref: do_wear.c:10-15, the file's shared message fragments. C compares
// `cc == c_that_` by pointer in already_wearing() below; no other caller
// passes a string that reads "that", so comparing the text answers the same.
const c_armor = 'armor';
const c_suit = 'suit';
const c_shirt = 'shirt';
const c_cloak = 'cloak';
const c_gloves = 'gloves';
const c_boots = 'boots';
const c_shield = 'shield';
const c_weapon = 'weapon';
const c_sword = 'sword';
const c_axe = 'axe';
const c_that_ = 'that';

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

// C ref: do_wear.c on_msg() (75-99), the line 'W' prints for a piece of
// armor whose oc_delay is 0. accessory_or_armor_on() calls it after setworn(),
// so xname() reports the item as worn -- but xname() carries no "(being worn)"
// suffix and no enchantment, which is why the message names a plain "small
// shield" where off_msg()'s doname() names an "uncursed +3 small shield".
async function on_msg(otmp, state) {
    if ((otmp.owornmask & (W_RING | W_AMUL)) !== 0
        || ((otmp.owornmask & W_TOOL) !== 0 && !state.flags.verbose)) {
        // C shows add-to-inventory feedback for a ring, an amulet or terse
        // eyewear through invent.c prinv(), which is unported. Only
        // doputon() can reach it, and accessory_or_armor_on() below refuses
        // every accessory one frame earlier.
        throw new UnsupportedWearError('on_msg() prinv()');
    }

    if (state.flags.verbose) {
        /* call xname() before obj_is_pname(); formatting obj's name
           might set obj->dknown and that affects the pname test */
        const otmp_name = xnameFresh(otmp, state);
        // A towel is eyewear, so the prinv() arm above takes it whenever
        // flags.verbose is off and Blindf_on() puts it on when verbose is on;
        // the suffix is kept because it costs only body_part().
        const how = otmp.otyp === TOWEL
            ? ` around your ${body_part(HEAD, state.youmonst)}` : '';

        await ttyPline(
            `You are now wearing ${obj_is_pname(otmp)
                ? the(otmp_name) : an(otmp_name)}${how}.`,
            state,
        );
    }
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

// C ref: do_wear.c Shield_on() (704-730), the ga.afternmv callback
// accessory_or_armor_on() installs for the shield slot. Like Shield_off()
// below, C's switch exists only to catch a shield type nobody has taught it
// about: every one of its nine labels falls through to a bare break, and
// obj.h is_shield() answers for exactly those nine.
//
// The `known` write is the whole of what the callback does, and it is what
// distinguishes a shield Shield_on() finished donning from one setworn()
// merely moved. Reading it takes care, because the two ways a shield enters
// the pack disagree. objects.h's ARMOR macro (418-427) passes uskn 1 in its
// BITS (42), so every armor row carries oc_uses_known 1, and u_init.c
// ini_inv_adjust_obj() (1215-1216) therefore marks a *starting* shield known
// before the hero has worn anything. mkobj.c mksobj() (864) does the opposite
// -- `obj->known = oc_uses_known ? 0 : 1` -- so only a shield the game creates
// later, a wished-for one in these recordings, arrives at known 0 with its
// enchantment hidden. That is the one that witnesses this write.
function Shield_on(state) {
    if (!is_shield(state.uarms, state)) {
        throw new UnsupportedWearError(
            `Shield_on() for otyp ${state.uarms.otyp}`,
        );
    }
    if (!state.uarms.known) {
        /* shield's +/- evident because of status line AC */
        state.uarms.known = true;
        update_inventory({ state });
    }
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

// C ref: do_wear.c already_wearing() (2010-2014). C picks the closing
// punctuation by comparing `cc` with the c_that_ pointer; see the string
// declarations above for why comparing the text answers the same.
async function already_wearing(cc, state) {
    await ttyPline(
        `You are already wearing ${cc}${cc === c_that_ ? '!' : '.'}`, state,
    );
}

// C ref: do_wear.c canwearobj() (2029-2206). Answers whether the hero can put
// `otmp` on, and for the arms that say yes, which slot it goes in.
//
// C hands the slot back through a `long *mask` out-parameter it writes only on
// those arms, leaving the caller's own initial 0 standing everywhere else;
// this returns the pair instead, with `mask` 0 on every refusal.
//
// `noisy` decides whether a refusal explains itself, and both values are live.
// equip_ok() passes FALSE, so building the 'W' prompt runs every arm below in
// silence once per armor object in the pack; accessory_or_armor_on() passes
// TRUE for the object the player actually chose.
export async function canwearobj(otmp, noisy, state = game) {
    let err = 0;
    let mask = 0;
    const youmonst = state.youmonst;
    const data = youmonst.data;

    /* this is the same check as for 'W' (dowear), but different message,
       in case we get here via 'P' (doputon) */
    if (verysmall(data) || nohands(data)) {
        if (noisy) {
            await ttyPline(
                "You can't wear any armor in your current form.", state,
            );
        }
        return { ok: false, mask };
    }

    const which = is_cloak(otmp, state) ? c_cloak
        : is_shirt(otmp, state) ? c_shirt
            : is_suit(otmp, state) ? c_suit
                : null;
    if (which && cantweararm(data)
        /* same exception for cloaks as used in m_dowear() */
        && (which !== c_cloak
            || (otmp.otyp !== MUMMY_WRAPPING
                ? data.msize !== MZ_SMALL
                : !WrappingAllowed(data)))
        && racial_exception(youmonst, otmp) < 1) {
        if (noisy)
            await ttyPline(`The ${which} will not fit on your body.`, state);
        return { ok: false, mask };
    } else if (otmp.owornmask & W_ARMOR) {
        if (noisy) await already_wearing(c_that_, state);
        return { ok: false, mask };
    }

    if (welded(state.uwep, state) && bimanual(state.uwep, state)
        && (is_suit(otmp, state) || is_shirt(otmp, state))) {
        if (noisy) {
            await ttyPline(
                'You cannot do that while holding your '
                + `${is_sword(state.uwep, state) ? c_sword : c_weapon}.`,
                state,
            );
        }
        return { ok: false, mask };
    }

    if (is_helmet(otmp, state)) {
        if (state.uarmh) {
            if (noisy) {
                await already_wearing(
                    an(helm_simple_name(state.uarmh, state)), state,
                );
            }
            err++;
        } else if (Upolyd(state.u) && has_horns(data)
                   && !is_flimsy(otmp, state)) {
            /* (flimsy exception matches polyself handling) */
            if (noisy) {
                await ttyPline(
                    `The ${helm_simple_name(otmp, state)} won't fit over `
                    + `your horn${plur(num_horns(data))}.`,
                    state,
                );
            }
            err++;
        } else mask = W_ARMH;
    } else if (is_shield(otmp, state)) {
        if (state.uarms) {
            if (noisy) await already_wearing(an(c_shield), state);
            err++;
        } else if (state.uwep && bimanual(state.uwep, state)) {
            if (noisy) {
                await ttyPline(
                    'You cannot wear a shield while wielding a two-handed '
                    + `${is_sword(state.uwep, state) ? c_sword
                        : state.uwep.otyp === BATTLE_AXE ? c_axe
                            : c_weapon}.`,
                    state,
                );
            }
            err++;
        } else if (state.u.twoweap) {
            if (noisy) {
                await ttyPline(
                    'You cannot wear a shield while wielding two weapons.',
                    state,
                );
            }
            err++;
        } else mask = W_ARMS;
    } else if (is_boots(otmp, state)) {
        if (state.uarmf) {
            if (noisy) await already_wearing(c_boots, state);
            err++;
        } else if (Upolyd(state.u) && slithy(data)) {
            if (noisy)
                await ttyPline('You have no feet...', state); /* not FOOT */
            err++;
        } else if (Upolyd(state.u) && data.mlet === S_CENTAUR) {
            /* break_armor() pushes boots off for centaurs, so don't let
               dowear() put them back on;
               makeplural(body_part(FOOT)) would yield "rear hooves" here,
               which sounds odd, so use hard-coded "hooves" */
            if (noisy) {
                await ttyPline(
                    `You have too many hooves to wear ${c_boots}.`, state,
                );
            }
            err++;
        } else if (state.u.utrap
                   && (state.u.utraptype === TT_BEARTRAP
                       || state.u.utraptype === TT_INFLOOR
                       || state.u.utraptype === TT_LAVA
                       || state.u.utraptype === TT_BURIEDBALL)) {
            if (state.u.utraptype === TT_BEARTRAP) {
                if (noisy) {
                    await ttyPline(
                        `Your ${body_part(FOOT, youmonst)} is trapped!`, state,
                    );
                }
            } else if (state.u.utraptype === TT_INFLOOR
                       || state.u.utraptype === TT_LAVA) {
                if (noisy) {
                    await ttyPline(
                        `Your ${makeplural(body_part(FOOT, youmonst))} are `
                        + `stuck in the ${surface(
                            state.u.ux, state.u.uy, state,
                        )}!`,
                        state,
                    );
                }
            } else { /*TT_BURIEDBALL*/
                if (noisy) {
                    await ttyPline(
                        `Your ${body_part(LEG, youmonst)} is attached to the `
                        + 'buried ball!',
                        state,
                    );
                }
            }
            err++;
        } else mask = W_ARMF;
    } else if (is_gloves(otmp, state)) {
        if (state.uarmg) {
            if (noisy) await already_wearing(c_gloves, state);
            err++;
        } else if (welded(state.uwep, state)) {
            if (noisy) {
                await ttyPline(
                    'You cannot wear gloves over your '
                    + `${is_sword(state.uwep, state) ? c_sword : c_weapon}.`,
                    state,
                );
            }
            err++;
        } else if (Glib(state)) {
            /* prevent slippery bare fingers from transferring to
               gloved fingers */
            if (noisy) {
                await ttyPline(
                    `Your ${fingers_or_gloves(false, state)} are too slippery `
                    + `to pull on ${gloves_simple_name(otmp, state)}.`,
                    state,
                );
            }
            err++;
        } else mask = W_ARMG;
    } else if (is_shirt(otmp, state)) {
        if (state.uarm || state.uarmc || state.uarmu) {
            if (state.uarmu) {
                if (noisy) await already_wearing(an(c_shirt), state);
            } else {
                if (noisy) {
                    await ttyPline(
                        "You can't wear that over your "
                        + `${(state.uarm && !state.uarmc) ? c_armor
                            : cloak_simple_name(state.uarmc, state)}.`,
                        state,
                    );
                }
            }
            err++;
        } else mask = W_ARMU;
    } else if (is_cloak(otmp, state)) {
        if (state.uarmc) {
            if (noisy) {
                await already_wearing(
                    an(cloak_simple_name(state.uarmc, state)), state,
                );
            }
            err++;
        } else mask = W_ARMC;
    } else if (is_suit(otmp, state)) {
        if (state.uarmc) {
            if (noisy) {
                await ttyPline(
                    'You cannot wear armor over a '
                    + `${cloak_simple_name(state.uarmc, state)}.`,
                    state,
                );
            }
            err++;
        } else if (state.uarm) {
            if (noisy) await already_wearing('some armor', state);
            err++;
        } else mask = W_ARM;
    } else {
        // C's final else answers invent.c silly_thing("wear", otmp), which
        // js/invent.js:592 also stops in front of. Nothing reaches it: both
        // callers test oclass == ARMOR_CLASS before calling, and every
        // ARMOR_CLASS row in objects.h carries one of the seven armor
        // categories above.
        throw new UnsupportedWearError('silly_thing()');
    }
    return { ok: err === 0, mask };
}

// C ref: do_wear.c equip_ok() (3402-3447). C's `removing && !
// gi.item_action_in_progress` test at 3439 loses its second term here:
// ia_dotakeoff() is the only function that raises the flag and it is unported,
// so gi.item_action_in_progress is always FALSE.
export async function equip_ok(obj, removing, accessory, state = game) {
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
    // C's `long dummymask` is what this discards: the slot canwearobj() picks
    // matters only to accessory_or_armor_on(), which asks for itself.
    if (obj.oclass === ARMOR_CLASS && !removing
        && !(await canwearobj(obj, false, state)).ok) {
        return GETOBJ_DOWNPLAY;
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

// C ref: do_wear.c wear_ok() (3463-3468), the getobj() callback for 'W'.
export async function wear_ok(obj, state = game) {
    return equip_ok(obj, false, false, state);
}

// C ref: do_wear.c takeoff_ok() (3470-3475), the getobj() callback for 'T'.
export async function takeoff_ok(obj, state = game) {
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

// C ref: do_wear.c accessory_or_armor_on() (2208-2428), shared in C by
// dowear('W') and doputon('P'). This port admits the armor half only.
//
// The armor tail at 2355-2404 is ported for the shield slot: it is the one
// slot whose <X>_on() needs nothing outside do_wear.c, and objects.h gives all
// nine shields an oc_delay of 0, so it always takes C's immediate arm.
async function accessory_or_armor_on(obj, state = game) {
    if (obj.owornmask & (W_ACCESSORY | W_ARMOR)) {
        await already_wearing(c_that_, state);
        return ECMD_OK;
    }
    const armor = obj.oclass === ARMOR_CLASS;

    // C also classifies the object as a ring, an amulet or eyewear here and
    // runs the accessory block at 2239-2353 for it. Leaving that block
    // refused is what keeps doputon() unported, so the three tests would
    // have no reader; C's own last arm, "You can't wear that!", sits behind
    // them and is refused with them.
    if (!armor)
        throw new UnsupportedWearError('accessory_or_armor_on() accessories');

    /* checks which are performed prior to actually touching the item */
    const worn = await canwearobj(obj, true, state);

    if (!worn.ok) return ECMD_OK;

    if (obj.otyp === HELM_OF_OPPOSITE_ALIGNMENT
        && state.qstart_level?.dnum === state.u.uz.dnum) { /* in quest */
        // do_wear.c:2230-2237 zeroes u.ublessed, calls makeknown() and
        // redraws AC before returning ECMD_TIME without wearing the helm.
        // No ported path descends the Quest branch, so nothing reaches it.
        throw new UnsupportedWearError('accessory_or_armor_on() quest helm');
    }

    // C ref: do_wear.c:2355 retouch_object(&obj, FALSE), on the same
    // derivation js/apply.js:219-232 and js/eat.js:2095-2105 record for
    // doapply() and doeat(): artifact.c retouch_object() answers 1 with no
    // side effect for every object that is not an artifact.
    if (obj.oartifact)
        throw new UnsupportedWearError('retouch_object() for an artifact');

    /* if the armor is wielded, release it for wearing (won't be
       welded even if cursed; that only happens for weapons/weptools) */
    if (obj.owornmask & W_WEAPONS) {
        // do_wear.c:2363-2364 remove_worn_item(), which js/dothrow.js:550 also
        // stops in front of. Nothing puts armor in a weapon slot here: 'w',
        // 'x' and 'Q' are unported and u_init.c wields only weapons.
        throw new UnsupportedWearError('remove_worn_item()');
    }
    /*
     * C sets obj->known in the afternmv action rather than here, so that a
     * nymph who steals the armor mid-donning leaves the hero ignorant of its
     * enchantment; Shield_on() above is that action for this slot.
     */
    // do_wear.c:2375 `gw.wasinwater = u.uinwater` is deliberately not
    // written. Boots_on() (do_wear.c:196) is its only reader, W_ARMF is
    // refused just below, and copying u.uinwater here would give that value a
    // second home with nothing to read it. It belongs beside a ported
    // Boots_on().

    // C's chain at 2377-2393 chooses the callback by comparing `obj` against
    // the slot pointers setworn() has just filled. `mask` names the same slot
    // one statement earlier, so testing it here refuses the six unported
    // slots before anything is written -- the shape armoroff()'s delayed
    // branch uses above. C's own last arm is a panic() for a mask that
    // matches no slot, which canwearobj() cannot produce.
    if (worn.mask !== W_ARMS) {
        throw new UnsupportedWearError(
            `accessory_or_armor_on() for slot mask ${worn.mask}`,
        );
    }
    const delay = -objectType(obj, state).oc_delay;

    if (delay) {
        // do_wear.c:2396-2399 spends the delay as helpless turns: nomul(delay)
        // with gm.multi_reason "dressing up" and gn.nomovemsg "You finish
        // your dressing maneuver.", and moveloop_core() runs the callback
        // through unmul() on the turn the count reaches zero, the way
        // armoroff() already does for a suit. No shield can reach it --
        // objects.h gives all nine oc_delay 0 -- so it is stopped rather than
        // ported, above setworn() so that widening the mask test cannot
        // silently drop C's arm.
        throw new UnsupportedWearError(
            `accessory_or_armor_on() delayed branch for otyp ${obj.otyp}`,
        );
    }
    setworn(obj, worn.mask, setwornEnv(state));
    /* if there's no delay, we'll execute 'afternmv' immediately */
    state.afternmv = Shield_on;
    /* call afternmv, clear it+nomovemsg+multi_reason */
    await unmul('', state);
    await on_msg(obj, state);
    takeoffContext(state).mask = 0;
    return ECMD_TIME;
}

// C ref: do_wear.c dowear() (2430-2450), the 'W' command.
export async function dowear(state = game) {
    /* cantweararm() checks for suits of armor, not what we want here;
       verysmall() or nohands() checks for shields, gloves, etc... */
    if (verysmall(state.youmonst.data) || nohands(state.youmonst.data)) {
        await ttyPline("Don't even bother.", state);
        return ECMD_OK;
    }
    if (state.uarm && state.uarmu && state.uarmc && state.uarmh && state.uarms
        && state.uarmg && state.uarmf
        && state.uleft && state.uright && state.uamul && state.ublindf) {
        /* 'W' message doesn't mention accessories */
        await ttyPline(
            'You are already wearing a full complement of armor.', state,
        );
        return ECMD_OK;
    }
    const otmp = await getobj('wear', wear_ok, GETOBJ_NOFLAGS, state);

    return otmp ? accessory_or_armor_on(otmp, state) : ECMD_CANCEL;
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
    Shield_on,
    Shirt_off,
    accessory_or_armor_on,
    already_wearing,
    cancel_doff,
    off_msg,
    on_msg,
    reset_remarm,
    takeoffContext,
    setwornEnv,
});
