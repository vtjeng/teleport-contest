// do_wear.js -- Putting one piece of armor on with 'W' and taking one off
// with 'T'.
//
// C ref: src/do_wear.c on_msg() (75-99), off_msg() (67-72), Boots_on()
//        (186-259), Cloak_on()
//        (325-380), Cloak_off()
//        (382-431), Helmet_on() (433-515), Helmet_off() (517-564),
//        Gloves_on() (575-603), Shield_on() (704-730),
//        Shield_off() (732-756), Shirt_on() (758-775), Shirt_off() (777-794),
//        dragon_armor_handling() (798-884), Armor_on() (886-906),
//        Armor_off() (908-930), fingers_or_gloves() (59-65),
//        set_wear() (1537-1568), cancel_doff() (1642-1659),
//        count_worn_stuff() (1731-1766), armor_or_accessory_off()
//        (1768-1829), dotakeoff() (1831-1855), cursed() (1891-1917),
//        armoroff() (1919-2008), already_wearing() (2010-2014), canwearobj()
//        (2029-2206), accessory_or_armor_on() (2208-2428), dowear()
//        (2430-2450), stuck_ring() (2656-2683), unchanger() (2685-2692),
//        some_armor() (2630-2652), obj_erode_type() (3258-3273),
//        destroy_arm() (3278-3316),
//        select_off() (2694-2821), do_takeoff() W_SWAPWEP arm (2823-2843),
//        reset_remarm() (3012-3018), remarm_swapwep() (3059-3087),
//        inaccessible_equipment() (3338-3400), equip_ok() (3402-3447),
//        wear_ok() (3463-3468) and takeoff_ok() (3470-3475).
//
// do_wear.c find_ac() was ported earlier and lives in
// js/u_init_inventory_attrs.js, beside the startup code that first calls it.
//
// The 'A' occupation spine -- the other do_takeoff() arms, take_off(), and
// doddoremarm() -- is not ported. The W_SWAPWEP arm is reached separately by
// remarm_swapwep(). better_not_take_that_off() is ported for select_off()'s
// glove checks. armoroff()'s
// delayed branch at do_wear.c:1930-1972 is ported for a suit only, while
// accessory_or_armor_on() fills all seven armor slots. Every refusal below
// names the C function it stops in front of.

import {
    A_CHA,
    A_CON,
    A_STR,
    ACID_RES,
    CMDQ_KEY,
    EF_DESTROY,
    EF_PAY,
    ERODE_BURN,
    ERODE_CORRODE,
    ERODE_CRACK,
    ERODE_NONE,
    ERODE_ROT,
    ERODE_RUST,
    ER_DESTROYED,
    ER_NOTHING,
    DRAIN_RES,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    FACE,
    FAST,
    FINGER,
    FLYING,
    FOOT,
    FREE_ACTION,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HAND,
    HEAD,
    I_SPECIAL,
    INFRAVISION,
    INTRINSIC,
    LEFT_HANDED,
    LEFT_RING,
    LEG,
    PARANOID_REMOVE,
    RIGHT_RING,
    SICK_RES,
    SLEEPY,
    SLOW_DIGESTION,
    STONE_RES,
    STRANGLED,
    st_corpse,
    st_petrifies,
    TIMEOUT,
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
    W_SWAPWEP,
    W_TOOL,
    W_WEAPONS,
    W_WEP,
    WORN_AMUL,
    WORN_ARMOR,
    WORN_BLINDF,
    WORN_CLOAK,
    WORN_GLOVES,
    WORN_HELMET,
    WORN_SHIELD,
    WORN_SHIRT,
    plur,
} from './const.js';
import { see_monsters } from './display.js';
import { obj_pmname } from './do_name.js';
import { surface } from './dungeon.js';
import { makeplural } from './fruit.js';
import { effective_attribute } from './attrib.js';
import { cmdq_pop, paranoid_query, yn_function } from './cmd.js';
import { artifact_light, set_artifact_intrinsic } from './artifacts.js';
import { game } from './gstate.js';
import { nomul, unmul } from './hack.js';
import {
    carrying_stoning_corpse,
    getobj,
    prinv,
    update_inventory,
} from './invent.js';
import { racial_exception } from './makemon_create.js';
import {
    can_be_strangled,
    cantweararm,
    cvt_prop_to_mseenres,
    has_head,
    has_horns,
    humanoid,
    is_flyer,
    monstunseesu,
    nohands,
    nolimbs,
    num_horns,
    slithy,
    verysmall,
} from './mondata.js';
import { MZ_SMALL, PM_ARCHEOLOGIST, S_CENTAUR } from './monsters.js';
import { change_luck } from './moveloop_preamble.js';
import { gulp_blnd_check } from './mhitu.js';
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
    erosionMatters,
    isCorrodeable,
    isCrackable,
    isDamageable,
    isFlammable,
    isRottable,
    isRustprone,
    set_bknown,
} from './obj.js';
import {
    ALCHEMY_SMOCK,
    AMULET_CLASS,
    AMULET_OF_CHANGE,
    AMULET_OF_ESP,
    AMULET_OF_FLYING,
    AMULET_OF_GUARDING,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_MAGICAL_BREATHING,
    AMULET_OF_REFLECTION,
    AMULET_OF_RESTFUL_SLEEP,
    AMULET_OF_STRANGULATION,
    AMULET_OF_UNCHANGING,
    AMULET_OF_YENDOR,
    AMULET_VERSUS_POISON,
    ARMOR_CLASS,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
    ARM_CLOAK,
    ARM_HELM,
    BATTLE_AXE,
    BLACK_DRAGON_SCALES,
    BLACK_DRAGON_SCALE_MAIL,
    BLINDFOLD,
    BLUE_DRAGON_SCALES,
    BLUE_DRAGON_SCALE_MAIL,
    CLOAK_OF_MAGIC_RESISTANCE,
    CLOAK_OF_PROTECTION,
    DENTED_POT,
    DWARVISH_CLOAK,
    DWARVISH_IRON_HELM,
    ELVEN_LEATHER_HELM,
    FAKE_AMULET_OF_YENDOR,
    FEDORA,
    GOLD_DRAGON_SCALES,
    GOLD_DRAGON_SCALE_MAIL,
    GREEN_DRAGON_SCALES,
    GREEN_DRAGON_SCALE_MAIL,
    HAWAIIAN_SHIRT,
    HELMET,
    HELM_OF_OPPOSITE_ALIGNMENT,
    HIGH_BOOTS,
    IRON_SHOES,
    JUMPING_BOOTS,
    KICKING_BOOTS,
    LEATHER_CLOAK,
    LEATHER_GLOVES,
    LENSES,
    LOW_BOOTS,
    MEAT_RING,
    MUMMY_WRAPPING,
    OILSKIN_CLOAK,
    ORANGE_DRAGON_SCALES,
    ORANGE_DRAGON_SCALE_MAIL,
    ORCISH_CLOAK,
    ORCISH_HELM,
    RED_DRAGON_SCALES,
    RED_DRAGON_SCALE_MAIL,
    RING_CLASS,
    RIN_ADORNMENT,
    RIN_AGGRAVATE_MONSTER,
    RIN_COLD_RESISTANCE,
    RIN_CONFLICT,
    RIN_FIRE_RESISTANCE,
    RIN_FREE_ACTION,
    RIN_GAIN_CONSTITUTION,
    RIN_GAIN_STRENGTH,
    RIN_HUNGER,
    RIN_INCREASE_ACCURACY,
    RIN_INCREASE_DAMAGE,
    RIN_INVISIBILITY,
    RIN_LEVITATION,
    RIN_POISON_RESISTANCE,
    RIN_POLYMORPH,
    RIN_POLYMORPH_CONTROL,
    RIN_PROTECTION,
    RIN_PROTECTION_FROM_SHAPE_CHAN,
    RIN_REGENERATION,
    RIN_SEARCHING,
    RIN_SEE_INVISIBLE,
    RIN_SHOCK_RESISTANCE,
    RIN_SLOW_DIGESTION,
    RIN_STEALTH,
    RIN_SUSTAIN_ABILITY,
    RIN_TELEPORTATION,
    RIN_TELEPORT_CONTROL,
    RIN_WARNING,
    ROBE,
    SPEED_BOOTS,
    TOWEL,
    T_SHIRT,
    WHITE_DRAGON_SCALES,
    WHITE_DRAGON_SCALE_MAIL,
    YELLOW_DRAGON_SCALES,
    YELLOW_DRAGON_SCALE_MAIL,
} from './objects.js';
import { discover_object, observe_object } from './o_init.js';
import {
    an,
    cloak_simple_name,
    donameFresh,
    gloves_simple_name,
    helm_simple_name,
    obj_is_pname,
    suit_simple_name,
    the,
    Tobjnam,
    xnameFresh,
} from './objnam.js';
import { u_safe_from_fatal_corpse } from './pickup.js';
import { body_part, float_vs_flight } from './polyself.js';
import { toggle_blindness } from './potion.js';
import { rn2, rnl, rnd } from './rng.js';
import { heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { find_ac } from './u_init_inventory_attrs.js';
import { Glib, welded } from './wield.js';
import { bimanual, setuswapwep, setworn } from './worn.js';

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
// svc.context.takeoff. `mask` is used by the ordinary remove-one path and
// `what` by remarm_swapwep()'s W_SWAPWEP call to do_takeoff(). `delay` and
// `disrobing` belong to the unported 'A' occupation spine. `cancelled_don` is
// written by cancel_don(), which cancel_doff() below
// cannot reach, and by Armor_off(), which leaves it out because
// dragon_armor_handling()'s BLUE arm is its only reader and that arm is
// refused. Nothing outside this file reads the field, and every path through
// dotakeoff() leaves it at 0 again.
function takeoffContext(state) {
    state.context ??= {};
    state.context.takeoff ??= { mask: 0, what: 0 };
    state.context.takeoff.what ??= 0;
    return state.context.takeoff;
}

// C ref: do_wear.c reset_remarm() (3012-3018). C clears takeoff.what and
// takeoff.disrobing here as well; see takeoffContext() for why the latter does
// not exist.
// Exported for cmd.c reset_occupations(), the first caller outside this file.
export function reset_remarm(state = game) {
    const takeoff = takeoffContext(state);
    takeoff.what = 0;
    takeoff.mask = 0;
}

// C ref: do_wear.c do_takeoff() (2823-2843), W_SWAPWEP arm only. The general
// 'A' occupation reaches the other slot arms; remarm_swapwep() below fixes
// `what` to W_SWAPWEP before this call, so no other arm is live here.
async function do_takeoff(state) {
    const wasTwoweap = Boolean(state.u.twoweap);
    const takeoff = takeoffContext(state);

    takeoff.mask |= I_SPECIAL;
    if (takeoff.what !== W_SWAPWEP) {
        throw new UnsupportedTakeOffError(
            `do_takeoff() mask ${takeoff.what}`,
        );
    }
    setuswapwep(null, setwornEnv(state));
    await ttyPline(
        wasTwoweap
            ? 'You are no longer wielding two weapons at once.'
            : 'You no longer have a second weapon readied.',
        state,
    );
    takeoff.mask &= ~I_SPECIAL;
}

// C ref: do_wear.c remarm_swapwep() (3059-3087). This internal command is
// reachable only from itemactions_pushkeys(), which queues a CMDQ_KEY '-'
// immediately after the command row. Unlike the ordinary take-off paths, C
// deliberately removes a cursed alternate weapon without calling cursed().
export async function remarm_swapwep(state = game) {
    const queued = cmdq_pop(state);
    if (queued?.typ !== CMDQ_KEY || queued.key !== '-' || !state.uswapwep)
        return ECMD_FAIL;

    const oldbknown = state.uswapwep.bknown;
    reset_remarm(state);
    const takeoff = takeoffContext(state);
    takeoff.what = takeoff.mask = W_SWAPWEP;
    await do_takeoff(state);
    return !state.uswapwep || state.uswapwep.bknown !== oldbknown
        ? ECMD_TIME : ECMD_OK;
}

// C ref: do_wear.c cancel_doff() (1642-1659), supplied to setworn() through
// the worn.js hook of the same name. C's donning() test at 1656 reads
// ga.afternmv and svc.context.takeoff.what, and the mask clear below is the
// whole of the function when it answers FALSE.
//
// donning() (1571-1597) and doffing() (1599-1640) compare ga.afternmv against
// the fourteen `<X>_on`/`<X>_off` armor callbacks and nothing else, so any
// other callback pending -- js/pray.js prayer_done() is the port's only other
// one -- leaves both FALSE whatever the slot. doffing()'s remaining arms need
// svc.context.takeoff.what. The unported 'A' spine writes it for delayed armor
// removal; remarm_swapwep() also writes it synchronously, but do_takeoff()
// keeps I_SPECIAL set across its setworn() callback and clears the transient
// flag before another command can run.
//
// Of the fourteen this port installs eight: the seven `<X>_on` callbacks, and
// Armor_off in armoroff()'s delayed branch. Only four of them open a window,
// because only a non-zero oc_delay makes accessory_or_armor_on() count down:
// the suit at 0 to 5 turns, spread as objects.h gives it: the leather jacket
// at 0, which opens no window at all, both mithril-coats at 1, leather and
// studded leather armor at 3, and the remaining thirty rows at 5; the helmet
// at 1 for every type but the fedora and the dented pot; the gloves at 1 and
// the boots at 2. The cloak, the shirt,
// the shield and those two helmets are consumed by unmul('') in the same
// statement sequence that installs them, so they are never pending when
// anything else runs. Doffing stays the suit's alone, because armoroff()
// refuses the other delayed slots. What decides the invariant is therefore
// which callers reach this hook during one of those four windows, because
// js/worn.js setworn() runs it for the item a slot already holds and skips it
// when the slot is empty.
//
// Nothing does. allmain.c moveloop_core() reads no key while gm.multi is
// negative, so no command runs inside either window, and the port's setworn()
// callers divide cleanly: js/u_init_inventory_use.js dresses the hero before
// the first turn; setuwep(), setuswapwep() and setuqwep() name weapon slots,
// whose occupant cannot also be state.uarm because accessory_or_armor_on()
// refuses W_WEAPONS above setworn(); the five `<X>_off()` above need a 'T';
// and accessory_or_armor_on() needs a 'W' and, for W_ARM, a canwearobj() that
// answered its mask only because state.uarm was already empty. unmul() clears
// state.afternmv before invoking it, so the callback that ends either window
// sees it null.
//
// C's own donning() test earns its keep on paths this port does not have. The
// 'A' spine reaches it through doffing()'s svc.context.takeoff.what arms,
// which is what C's I_SPECIAL guard at 1656 exists to hold off, and
// steal.c remove_worn_item() (213-263) is what strips a hero a nymph robs
// while she is helpless -- although that one calls cancel_don() itself at 219
// before Armor_off() ever reaches this hook. Port the 'A' spine or a monster
// that disrobes the hero and cancel_don() has to come with it.
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
            // the full implementation; the hook forwards with the caller's
            // state so the right uprops array is updated.
            setArtifactIntrinsic: (obj, on, mask, _env) => {
                set_artifact_intrinsic(obj, on, mask, state);
            },
        },
    };
}

// C ref: do_wear.c learnring() (1192-1220). Handle ring discovery. If the
// effect is observable, discover or observe the ring type; then, if the ring
// has been seen and its type is known, reveal its enchantment and update the
// inventory window.
function learnring(ring, observed, state) {
    const ringtype = ring.otyp;
    const type = objectType(ring, state);

    if (observed) {
        if (type.oc_name_known)
            observe_object(ring, state);
        else if (ring.dknown)
            discover_object(ringtype, true, true, true, state);
    }

    if (ring.dknown && type.oc_name_known) {
        if (type.oc_charged)
            ring.known = true;
        update_inventory({ state });
    }
}

// C ref: do_wear.c adjust_attrib() (1222-1239). Adjust an attribute bonus and
// learn the ring's enchantment when the change is observable or the attribute
// is not at a limit.
function adjust_attrib(obj, which, val, state) {
    const old_attrib = effective_attribute(state, which);
    const u = state.u;
    // ABON(which) += val.  The JS representation of u.abon is either a flat
    // array [0,0,...] or an object with a .a array, matching the C struct
    // attribs { schar a[A_MAX]; }.  effective_attribute() reads through the
    // same two-form accessor (attributeArray in attrib.js), so writes here
    // must target the same array it would read.
    u.abon ??= {};
    const abon = Array.isArray(u.abon) ? u.abon : (u.abon.a ??= []);
    abon[which] = (abon[which] ?? 0) + val;
    const observable = (old_attrib !== effective_attribute(state, which));
    // extremeattr() inlined: checks whether the attribute is at the 3..25
    // floor or ceiling (or the Str/Con/Int/Wis special cases). When it is
    // not extreme, learnring() reveals a +0 enchantment; when it is
    // extreme, learnring() runs only when the change was observable.
    if (observable || !extremeattr(which, state))
        learnring(obj, observable, state);
    state.disp.botl = true;
}

// C ref: attrib.c extremeattr() (1268-1293). Answers whether the attribute at
// `attrindx` is at the hard floor (3) or ceiling (25, or 125 for Str). The
// Gauntlets of Power / Ogresmasher / Dunce Cap overrides change those limits
// for specific attributes.
function extremeattr(attrindx, state) {
    let lolimit = 3;
    let hilimit = 25;
    const curval = effective_attribute(state, attrindx);

    if (attrindx === A_STR) {
        hilimit = 125; /* STR19(25) */
        // GAUNTLETS_OF_POWER: the only ring-finger path here is
        // RIN_GAIN_STRENGTH, and its adjust_attrib() cannot reach a hero
        // wearing gauntlets of power because accessory_or_armor_on() refuses
        // rings when cursed gloves are on. The check is kept for accuracy.
        if (state.uarmg
            && state.uarmg.otyp
                === 161 /* GAUNTLETS_OF_POWER, imported below if needed */)
            lolimit = hilimit;
    } else if (attrindx === A_CON) {
        // u_wield_art(ART_OGRESMASHER) is unported; the artifact's Con
        // override only matters while the weapon is wielded.
        if (state.uwep?.oartifact) {
            // Import not added because no ported ring arm can reach a hero
            // wielding a specific artifact. The check is inert.
        }
    }
    if (attrindx === 3 /* A_INT */ || attrindx === 4 /* A_WIS */) {
        // No ring adjusts Int or Wis, so this arm is dead from Ring_on().
    }
    return curval === lolimit || curval === hilimit;
}

// Raised where Ring_on() reaches a branch this port has not translated.
export class UnsupportedRingOnError extends Error {
    constructor(what) {
        super(`Ring_on() reached an unported branch: ${what}`);
        this.name = 'UnsupportedRingOnError';
    }
}

// C ref: do_wear.c Ring_on() (1242-1344). Called after the ring is already
// worn in its slot (setworn() ran above). The switch dispatches on ring type.
//
// Sixteen types have no effect besides the extrinsic setworn() already set:
// teleportation, regeneration, searching, hunger, aggravate monster, poison/
// fire/cold/shock resistance, conflict, teleport control, polymorph,
// polymorph control, free action, slow digestion, sustain ability, and meat.
//
// Five types call helpers this port has not reached: stealth
// (toggle_stealth), see invisible (set_mimic_blocking + see_monsters),
// invisibility (self_invis_message), levitation (float_up + spoteffects),
// and protection from shape changers (rescham). Each raises a fail-closed
// throw.
//
// The remaining arms -- warning (see_monsters), gain strength/constitution/
// adornment (adjust_attrib), increase accuracy/damage (uhitinc/udaminc), and
// protection (learnring + find_ac) -- are ported below.
export async function Ring_on(obj, state = game) {
    const oldprop = state.u.uprops[objectType(obj, state).oc_oprop]?.extrinsic
        ?? 0;
    let observable;

    /* make sure ring isn't wielded */
    if (obj === state.uwep || obj === state.uswapwep || obj === state.uquiver) {
        // do_wear.c:1249-1254 calls setuwep/setuswapwep/setuqwep to unwield.
        // accessory_or_armor_on() already ran the W_WEAPONS check for armor;
        // nothing in the port puts a ring in a weapon slot, so this is inert.
        throw new UnsupportedRingOnError('ring wielded as weapon');
    }

    // C masks out W_RING only when the hero does not have both left and right
    // rings of the same type; the oldprop variable drives the "already had
    // this property" tests in the specific arms.
    let maskedOldprop = oldprop;
    if ((oldprop & W_RING) !== W_RING)
        maskedOldprop = oldprop & ~W_RING;

    switch (obj.otyp) {
    /* sixteen no-op types: the extrinsic from setworn() is the whole effect */
    case RIN_TELEPORTATION:
    case RIN_REGENERATION:
    case RIN_SEARCHING:
    case RIN_HUNGER:
    case RIN_AGGRAVATE_MONSTER:
    case RIN_POISON_RESISTANCE:
    case RIN_FIRE_RESISTANCE:
    case RIN_COLD_RESISTANCE:
    case RIN_SHOCK_RESISTANCE:
    case RIN_CONFLICT:
    case RIN_TELEPORT_CONTROL:
    case RIN_POLYMORPH:
    case RIN_POLYMORPH_CONTROL:
    case RIN_FREE_ACTION:
    case RIN_SLOW_DIGESTION:
    case RIN_SUSTAIN_ABILITY:
        break;
    case MEAT_RING:
        /* wearing a meat ring does not affect vegan conduct */
        break;
    case RIN_STEALTH:
        throw new UnsupportedRingOnError(
            `toggle_stealth() for otyp ${obj.otyp}`,
        );
    case RIN_WARNING:
        // see_monsters() redraws; the extrinsic from setworn() is the real
        // behavioral change. The redraw is unported but the property is live.
        throw new UnsupportedRingOnError(
            `see_monsters() for otyp ${obj.otyp}`,
        );
    case RIN_SEE_INVISIBLE:
        throw new UnsupportedRingOnError(
            `set_mimic_blocking() + see_monsters() for otyp ${obj.otyp}`,
        );
    case RIN_INVISIBILITY:
        throw new UnsupportedRingOnError(
            `self_invis_message() for otyp ${obj.otyp}`,
        );
    case RIN_LEVITATION:
        throw new UnsupportedRingOnError(
            `float_up() for otyp ${obj.otyp}`,
        );
    case RIN_GAIN_STRENGTH:
        adjust_attrib(obj, A_STR, obj.spe, state);
        break;
    case RIN_GAIN_CONSTITUTION:
        adjust_attrib(obj, A_CON, obj.spe, state);
        break;
    case RIN_ADORNMENT:
        adjust_attrib(obj, A_CHA, obj.spe, state);
        break;
    case RIN_INCREASE_ACCURACY:
        state.u.uhitinc += obj.spe;
        break;
    case RIN_INCREASE_DAMAGE:
        state.u.udaminc += obj.spe;
        break;
    case RIN_PROTECTION_FROM_SHAPE_CHAN:
        throw new UnsupportedRingOnError(
            `rescham() for otyp ${obj.otyp}`,
        );
    case RIN_PROTECTION:
        /* usually learn enchantment and discover type;
           won't happen if ring is unseen or if it's +0
           and the type hasn't been discovered yet */
        observable = (obj.spe !== 0);
        learnring(obj, observable, state);
        if (obj.spe)
            find_ac(state); /* updates botl */
        break;
    }
}

// Raised where Amulet_on() or Blindf_on() reaches a branch this port has not
// translated. Both belong to later puton-command slices.
export class UnsupportedAccessoryOnError extends Error {
    constructor(what) {
        super(`accessory on reached an unported branch: ${what}`);
        this.name = 'UnsupportedAccessoryOnError';
    }
}

// C ref: do_wear.c Amulet_on() (963-1087). The amulet half of
// accessory_or_armor_on() dispatches here after the "already wearing" check.
// Calls setworn() itself and decides when to call on_msg().
//
// remove_worn_item() at the top unwields the amulet when it is wielded or
// quivered; in the common case (owornmask 0) it returns immediately.
async function Amulet_on(obj, state = game) {
    let on_msg_done = false;

    // C ref: steal.c remove_worn_item() (213-290). When the amulet has no
    // worn mask it was never in a worn slot, so nothing to remove.
    if (obj.owornmask) {
        // The amulet is wielded/alt-wielded/quivered. The full
        // remove_worn_item path is not ported; throw fail-closed.
        throw new UnsupportedAccessoryOnError(
            'remove_worn_item() for wielded amulet',
        );
    }

    setworn(obj, W_AMUL, setwornEnv(state));

    switch (state.uamul.otyp) {
    case AMULET_OF_ESP:
    case AMULET_OF_LIFE_SAVING:
    case AMULET_VERSUS_POISON:
    case AMULET_OF_REFLECTION:
    case FAKE_AMULET_OF_YENDOR:
        break;
    case AMULET_OF_MAGICAL_BREATHING:
        throw new UnsupportedAccessoryOnError(
            'AMULET_OF_MAGICAL_BREATHING (needs region_danger integration)',
        );
    case AMULET_OF_UNCHANGING:
        throw new UnsupportedAccessoryOnError(
            'AMULET_OF_UNCHANGING (needs make_slimed)',
        );
    case AMULET_OF_CHANGE:
        throw new UnsupportedAccessoryOnError(
            'AMULET_OF_CHANGE (needs change_sex, livelog_newform, useup, trycall)',
        );
    case AMULET_OF_STRANGULATION:
        /* note: might already be Strangled (via #wizintrinsic) */
        if (can_be_strangled(state.youmonst, state)
            && !state.u.uprops[STRANGLED].intrinsic) {
            discover_object(AMULET_OF_STRANGULATION, true, true, true, state);
            state.u.uprops[STRANGLED].intrinsic = 6;
            state.disp.botl = true;
            await on_msg(state.uamul, state);
            on_msg_done = true;
            await ttyPline('It constricts your throat!', state);
        }
        break;
    case AMULET_OF_RESTFUL_SLEEP: {
        const newnap = rnd(98) + 2;
        const oldnap = state.u.uprops[SLEEPY].intrinsic & TIMEOUT;

        if (newnap < oldnap || oldnap === 0)
            /* avoid clobbering FROMOUTSIDE bit, which might have
               gotten set by previously eating one of these amulets */
            state.u.uprops[SLEEPY].intrinsic
                = (state.u.uprops[SLEEPY].intrinsic & ~TIMEOUT) | newnap;
        break;
    }
    case AMULET_OF_FLYING: {
        /* setworn() has already set extrinsic flying */
        float_vs_flight(state); /* block flying if levitating */

        // youprop.h:253 Flying macro
        const flyProp = state.u.uprops[FLYING];
        const heroFlying = () => Boolean(
            (flyProp.intrinsic || flyProp.extrinsic
             || (state.u.usteed && is_flyer(state.u.usteed.data)))
            && !flyProp.blocked,
        );

        if (heroFlying()) {
            /* to determine whether this flight is new we temporarily
               remove the amulet's contribution */
            flyProp.extrinsic &= ~W_AMUL;
            const already_flying = heroFlying();
            flyProp.extrinsic |= W_AMUL;

            if (!already_flying) {
                discover_object(AMULET_OF_FLYING, true, true, true, state);
                await on_msg(state.uamul, state);
                on_msg_done = true;
                state.disp.botl = true; /* status: 'Fly' On */
                await ttyPline('You are now in flight.', state);
            }
        }
        break;
    }
    case AMULET_OF_GUARDING:
        discover_object(AMULET_OF_GUARDING, true, true, true, state);
        find_ac(state);
        break;
    case AMULET_OF_YENDOR:
        break;
    }

    if (!on_msg_done)
        await on_msg(state.uamul, state);
}

// C ref: do_wear.c Blindf_on() (1461-1492). The eyewear half of
// accessory_or_armor_on() dispatches here once the lenses or blindfold passes
// the "already wearing" checks. Calls setworn() and on_msg() itself, then
// detects whether blindness status changed and calls toggle_blindness().
//
// Common path: sighted hero puts on a BLINDFOLD or TOWEL, becomes blind.
//
// Fail-closed items:
// - set_bc(0): fires only when Punished. No ported session is punished while
//   putting on a blindfold.
// - The "regaining sight" branch (already_blind && !Blind): applies only to
//   the Eyes of the Overworld artifact. accessory_or_armor_on() refuses
//   artifacts above the dispatch, so this branch is unreachable.
async function Blindf_on(obj, state = game) {
    const already_blind = heroIsBlind(state);

    // C ref: steal.c remove_worn_item() (213-290). When the blindfold has no
    // worn mask it was never in a worn slot, so nothing to remove.
    if (obj.owornmask) {
        // The blindfold is wielded/alt-wielded/quivered. The full
        // remove_worn_item path is not ported; throw fail-closed.
        throw new UnsupportedAccessoryOnError(
            'remove_worn_item() for wielded blindfold',
        );
    }

    setworn(obj, W_TOOL, setwornEnv(state));
    await on_msg(obj, state);

    let changed = false;

    if (heroIsBlind(state) && !already_blind) {
        // Hero just went blind from wearing the blindfold.
        changed = true;
        if (state.flags.verbose)
            await ttyPline("You can't see any more.", state);
        // C ref: do_wear.c:1475-1476. set_bc(0) sets the ball-and-chain
        // display variables before the hero goes blind. Fires only when
        // Punished.
        if (state.uball) {
            throw new UnsupportedAccessoryOnError(
                'set_bc(0) while Punished',
            );
        }
    } else if (already_blind && !heroIsBlind(state)) {
        // Hero regained sight -- only the Eyes of the Overworld artifact does
        // this. accessory_or_armor_on() refuses artifacts, so this branch is
        // unreachable in the current port.
        throw new UnsupportedAccessoryOnError(
            'Blindf_on() regaining sight (Eyes of the Overworld)',
        );
    }

    if (changed) {
        toggle_blindness(state);
    }
}

// C ref: do_wear.c Blindf_off() (1495-1534). The take-off half of the
// blindfold/lenses dispatch. armoroff_or_accessory_off() calls it when
// obj == ublindf. Calls setworn() to clear the W_TOOL slot, off_msg(),
// then detects whether blindness status changed and calls
// toggle_blindness().
//
// Four branches on (Blind, was_blind):
//   1. (!Blind &&  was_blind): hero regains sight. gulp_blnd_check() tests
//      whether an engulfing monster re-blinds immediately; if not, prints
//      "You can see again." and toggles. This is the common path for the
//      seed5006 witness.
//   2. ( Blind &&  was_blind): still blind after removal. Prints
//      "still cannot see" for non-lenses items.
//   3. ( Blind && !was_blind): lost sight on removal (Eyes of the Overworld).
//      Prints "You can't see anything now!" and sets ball-and-chain if
//      Punished. Not reachable in current port because artifacts are refused
//      by accessory_or_armor_on().
//   4. (!Blind && !was_blind): no change, no message.
//
// Fail-closed items:
// - set_bc(0): fires only when Punished. No ported session is punished
//   while removing a blindfold.
// - The "losing sight" branch (Blind && !was_blind): applies only to the
//   Eyes of the Overworld artifact; unreachable in the current port.
async function Blindf_off(otmp, state = game) {
    const was_blind = heroIsBlind(state);
    let changed = false;
    const nooffmsg = !otmp;

    if (!otmp)
        otmp = state.ublindf;
    if (!otmp) {
        throw new Error('Blindf_off without eyewear?');
    }

    takeoffContext(state).mask &= ~W_TOOL;
    setworn(null, otmp.owornmask, setwornEnv(state));
    if (!nooffmsg)
        await off_msg(otmp, state);

    if (heroIsBlind(state)) {
        if (was_blind) {
            /* "still cannot see" makes no sense when removing lenses
               since they can't have been the cause of your blindness */
            if (otmp.otyp !== LENSES)
                await ttyPline('You still cannot see.', state);
        } else {
            // Lost sight on removal -- only Eyes of the Overworld does this.
            // accessory_or_armor_on() refuses artifacts, so this branch is
            // unreachable in the current port.
            throw new UnsupportedTakeOffError(
                'Blindf_off() lost sight (Eyes of the Overworld)',
            );
        }
    } else if (was_blind) {
        if (!gulp_blnd_check(state)) {
            changed = true;
            await ttyPline('You can see again.', state);
        }
    }
    if (changed) {
        toggle_blindness(state);
    }
}

// C ref: do_wear.c already_wearing2() (2017-2020). Eyewear "already wearing"
// message, used when one piece of eyewear blocks another specific piece.
async function already_wearing2(cc1, cc2, state) {
    await ttyPline(
        `You can't wear ${cc1} because you're wearing ${cc2} there already.`,
        state,
    );
}

// C ref: do_wear.c off_msg() (67-72). armoroff() calls this only after the
// item has left its slot, so doname() adds no "(being worn)" suffix.
async function off_msg(otmp, state) {
    if (state.flags.verbose)
        await ttyPline(`You were wearing ${donameFresh(otmp, state)}.`, state);
}

// C ref: do_wear.c on_msg() (75-99). For rings and amulets (and terse
// eyewear) C calls prinv() to show add-to-inventory feedback with the worn
// suffix; for verbose eyewear and all armor C prints "You are now wearing ...".
async function on_msg(otmp, state) {
    if ((otmp.owornmask & (W_RING | W_AMUL)) !== 0
        || ((otmp.owornmask & W_TOOL) !== 0 && !state.flags.verbose)) {
        await prinv(null, otmp, 0, { state });
        return;
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
            `You are now wearing ${obj_is_pname(otmp, state)
                ? the(otmp_name, state) : an(otmp_name)}${how}.`,
            state,
        );
    }
}

// C ref: do_wear.c dragon_armor_handling() (798-884). Handles extra
// abilities when the hero puts on or takes off dragon scale armor. Grey
// and silver dragon armor have no extra effect, taking the default break.
// Seven put-on arms are ported; gold needs make_hallucinated() and is
// refused. The take-off path (puton=false) is unported for all eight
// colored arms.
async function dragon_armor_handling(otmp, puton, _on_purpose, state) {
    if (!otmp)
        return;

    switch (otmp.otyp) {
    /* grey: no extra effect */
    /* silver: no extra effect */
    case BLACK_DRAGON_SCALES:
    case BLACK_DRAGON_SCALE_MAIL:
        if (puton) {
            state.u.uprops[DRAIN_RES].extrinsic |= W_ARM;
        } else {
            throw new UnsupportedTakeOffError(
                `dragon_armor_handling() take-off for otyp ${otmp.otyp}`,
            );
        }
        break;
    case BLUE_DRAGON_SCALES:
    case BLUE_DRAGON_SCALE_MAIL:
        if (puton) {
            // C ref: youprop.h:377 Very_fast = ((HFast & ~INTRINSIC) || EFast).
            const fast = state.u.uprops[FAST];
            const Very_fast = Boolean(
                (fast.intrinsic & ~INTRINSIC) || fast.extrinsic);
            // C ref: youprop.h:376 Fast = (HFast || EFast).
            const Fast = Boolean(fast.intrinsic || fast.extrinsic);
            if (!Very_fast)
                await ttyPline(
                    `You speed up${Fast ? ' a bit more' : ''}.`, state);
            fast.extrinsic |= W_ARM;
        } else {
            throw new UnsupportedTakeOffError(
                `dragon_armor_handling() take-off for otyp ${otmp.otyp}`,
            );
        }
        break;
    case GREEN_DRAGON_SCALES:
    case GREEN_DRAGON_SCALE_MAIL:
        if (puton) {
            state.u.uprops[SICK_RES].extrinsic |= W_ARM;
        } else {
            throw new UnsupportedTakeOffError(
                `dragon_armor_handling() take-off for otyp ${otmp.otyp}`,
            );
        }
        break;
    case RED_DRAGON_SCALES:
    case RED_DRAGON_SCALE_MAIL:
        if (puton) {
            state.u.uprops[INFRAVISION].extrinsic |= W_ARM;
        } else {
            throw new UnsupportedTakeOffError(
                `dragon_armor_handling() take-off for otyp ${otmp.otyp}`,
            );
        }
        // C calls see_monsters() unconditionally for both put-on and take-off
        see_monsters(state);
        break;
    case GOLD_DRAGON_SCALES:
    case GOLD_DRAGON_SCALE_MAIL:
        // Needs make_hallucinated() which is not yet ported.
        throw new (puton ? UnsupportedWearError : UnsupportedTakeOffError)(
            `dragon_armor_handling() for otyp ${otmp.otyp}`,
        );
    case ORANGE_DRAGON_SCALES:
    case ORANGE_DRAGON_SCALE_MAIL:
        if (puton) {
            state.u.uprops[FREE_ACTION].extrinsic |= W_ARM;
        } else {
            throw new UnsupportedTakeOffError(
                `dragon_armor_handling() take-off for otyp ${otmp.otyp}`,
            );
        }
        break;
    case YELLOW_DRAGON_SCALES:
    case YELLOW_DRAGON_SCALE_MAIL:
        if (puton) {
            state.u.uprops[STONE_RES].extrinsic |= W_ARM;
        } else {
            // Take-off also calls wielding_corpse() for cockatrice check.
            throw new UnsupportedTakeOffError(
                `dragon_armor_handling() take-off for otyp ${otmp.otyp}`,
            );
        }
        break;
    case WHITE_DRAGON_SCALES:
    case WHITE_DRAGON_SCALE_MAIL:
        if (puton) {
            state.u.uprops[SLOW_DIGESTION].extrinsic |= W_ARM;
        } else {
            throw new UnsupportedTakeOffError(
                `dragon_armor_handling() take-off for otyp ${otmp.otyp}`,
            );
        }
        break;
    default:
        break;
    }
}

// C ref: do_wear.c Armor_on() (886-906), the ga.afternmv callback
// accessory_or_armor_on() installs for the suit slot. The leather jacket is
// the one suit objects.h gives an oc_delay of 0, so it alone reaches this
// through unmul("") on the turn the 'W' is typed; every other suit spends
// three to five helpless turns first and arrives through allmain.c
// moveloop_core() instead.
//
// dragon_armor_handling() is a no-op for grey and silver dragon armor (they
// take `default: break;`). artifact_light() answers TRUE only for gold
// dragon scales and mail, so the begin_burn block is dead for every other
// suit.
//
// The `known` write is the whole of what the callback does for non-dragon
// suits. C's comment at do_wear.c:2366-2372 says why it waits until here
// rather than running beside setworn(): a nymph who steals the suit
// mid-donning must leave the hero ignorant of its enchantment. As with
// Shield_on() below, only a suit the game creates after startup witnesses
// the write, because mkobj.c mksobj() (864) leaves obj->known 0 for armor
// where u_init.c ini_inv_adjust_obj() (1215-1216) sets it to 1.
async function Armor_on(state) {
    if (!state.uarm) /* no known instances of !uarm here but play it safe */
        return 0;
    if (!state.uarm.known) {
        /* suit's +/- evident because of status line AC */
        state.uarm.known = true;
        update_inventory({ state });
    }
    await dragon_armor_handling(state.uarm, true, true, state);
    /* gold DSM requires extra handling since it emits light when worn;
       do that after the special armor handling */
    if (artifact_light(state.uarm) && !state.uarm.lamplit) {
        // begin_burn() and arti_light_description() are not yet ported for
        // this call site. artifact_light() answers TRUE only for gold dragon
        // scales/mail (otyp 102, 112) when worn as W_ARM, so this block is
        // dead for every other suit.
        throw new UnsupportedWearError(
            `Armor_on() artifact_light for otyp ${state.uarm.otyp}`,
        );
    }
    return 0;
}

// C ref: do_wear.c Armor_off() (908-930). armoroff() reaches this both
// immediately, for the leather jacket that is the one suit with an oc_delay of
// 0, and through hack.c unmul() several turns later for every other suit.
//
// Both of C's tails at 920-928 belong to dragon armor alone. The guard
// refuses all dragon armor because the dragon_armor_handling() call and the
// artifact_light/end_burn block are not yet ported for the off path.
// Armor_on() above ports both for putting on; the take-off path belongs to
// a later slice.
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

// The boots Boots_on() answers with a bare break, C's five labels at
// do_wear.c:193-198. Two of them still change what the game does, and both do
// it outside this switch, so each was checked on its own before being carried
// rather than refused with the five arms that print, draw or call away.
//
// JUMPING_BOOTS has an oc_oprop of JUMPING (objects.h:712-714), so worn.c
// setworn() raises EJumping one statement before this callback runs. C reads
// that extrinsic in two places: apply.c jump() (1895, 1993-2001) and
// insight.c:1683. Neither can diverge here. `jump` is absent from js/cmd.js
// ADMITTED_COMMANDS, so the command cannot start; and insight.c runs
// attributes_enlightenment() only under MAGICENLIGHTENMENT, where
// js/insight.js holds a JUMPING row that stops the window by name rather than
// dropping C's line.
//
// KICKING_BOOTS has an oc_oprop of 0 (objects.h:718-720), so setworn() raises
// nothing and C reads the type by otyp instead, at dokick.c:10, :41 and :1328.
// The first of those is dokick.c's martial() macro, ported at js/dokick.js:127
// and live: kick_dumb() short-circuits its rn2(3) on it, so a kicking hero in
// these boots draws what C draws. The other two are unported and read by
// nothing -- kickdmg() has no ported caller, and js/dokick.js:316 leaves
// dokick()'s avrg_attrib uncomputed because every arm that would read it is
// refused.
//
// That is the test HELM_OF_TELEPATHY failed and these two pass. Its extrinsic
// feeds display.h sensemon(), which is ported and read on an ordinary turn
// from four call sites, against a C redraw that is not ported, so it stays out
// of PLAIN_HELMETS_ON below.
const PLAIN_BOOTS_ON = new Set([
    LOW_BOOTS, IRON_SHOES, HIGH_BOOTS, JUMPING_BOOTS, KICKING_BOOTS,
]);

// C ref: do_wear.c Boots_on() (186-259), the ga.afternmv callback
// accessory_or_armor_on() installs for the boots slot, and the call set_wear()
// below makes for a hero who starts in boots. No role does, so that second
// caller cannot reach it today.
//
// objects.h gives all ten boots an oc_delay of 2 (700-727), so this never runs
// on the turn the 'W' is typed: nomul(-2) spends two helpless turns first and
// allmain.c moveloop_core() reaches the callback through unmul().
//
// The four types PLAIN_BOOTS_ON and SPEED_BOOTS leave out all reach outside
// do_wear.c. WATER_WALKING_BOOTS calls spoteffects(); ELVEN_BOOTS calls
// toggle_stealth(); FUMBLE_BOOTS calls incr_itimeout(&HFumbling, rnd(20)), the
// one arm anywhere on this port's 'W' spine that would draw a random number;
// and LEVITATION_BOOTS calls float_up(), spoteffects() and float_vs_flight().
// accessory_or_armor_on() hoists their refusal above setworn() for the reason
// the cloak and helmet refusals give: by the time this callback runs the boots
// are worn, AC has moved and the two helpless turns are spent.
//
// C's `uarmf &&` at 254 is left out, as Helmet_on()'s equivalent guard is.
// C's own comment at 253 says what it is for: float_up() inside the
// LEVITATION_BOOTS arm can drop the boots down a sink. That arm is refused and
// no arm here empties the slot, so port it and the guard comes back with it.
async function Boots_on(state) {
    const otyp = state.uarmf.otyp;

    if (!PLAIN_BOOTS_ON.has(otyp) && otyp !== SPEED_BOOTS)
        throw new UnsupportedWearError(`Boots_on() for otyp ${otyp}`);
    if (otyp === SPEED_BOOTS) {
        const fast = state.u.uprops[FAST];
        const oldprop = fast.extrinsic & ~W_ARMF;

        if (!oldprop && !(fast.intrinsic & TIMEOUT)) {
            discover_object(otyp, true, true, true, state);
            await ttyPline(
                `You feel yourself speed up${fast.intrinsic
                    ? ' a bit more' : ''}.`,
                state,
            );
        }
    }
    if (!state.uarmf.known) {
        /* boots' +/- evident because of status line AC */
        state.uarmf.known = true;
        update_inventory({ state });
    }
    return 0;
}

// The cloaks each half of the slot handles with a bare `break`, which is not
// the same list twice. Cloak_off() has seven such labels at do_wear.c:393-400;
// Cloak_on() has five at 332-337, because two types do something on the way on
// that they do not do on the way off: CLOAK_OF_PROTECTION calls makeknown()
// and OILSKIN_CLOAK prints through Tobjnam() at 365-367. Wearing either
// through the take-off list would run neither, so the two sets are named apart
// even though five of their members coincide.
//
// Every cloak carries an oc_delay of 0 (objects.h:611-650), so all twelve
// types reach Cloak_off(), and Cloak_on() always runs on the turn the 'W' is
// typed rather than several turns later.
const PLAIN_CLOAKS_OFF = new Set([
    ORCISH_CLOAK, DWARVISH_CLOAK, CLOAK_OF_PROTECTION,
    CLOAK_OF_MAGIC_RESISTANCE, OILSKIN_CLOAK, ROBE, LEATHER_CLOAK,
]);
const PLAIN_CLOAKS_ON = new Set([
    ORCISH_CLOAK, DWARVISH_CLOAK, CLOAK_OF_MAGIC_RESISTANCE, ROBE,
    LEATHER_CLOAK,
]);

// The cloak types Cloak_on() carries: the five with no statement of their own,
// plus the two whose statement stays inside do_wear.c. Only
// accessory_or_armor_on() asks, because every cloak's oc_delay is 0 and so the
// callback would otherwise run with the slot and the status line already
// moved; set_wear() asks nothing, for the reason Cloak_on() records below.
function cloakOnPorted(otyp) {
    return otyp === OILSKIN_CLOAK || otyp === ALCHEMY_SMOCK
        || PLAIN_CLOAKS_ON.has(otyp);
}

// C ref: do_wear.c Cloak_on() (325-380), the ga.afternmv callback
// accessory_or_armor_on() installs for the cloak slot.
//
// C's switch has no statement of its own for the five types PLAIN_CLOAKS_ON
// names, and the two arms below are the whole of what the other seven do
// without leaving do_wear.c: OILSKIN_CLOAK prints at 365-367, ALCHEMY_SMOCK
// raises acid resistance at 369-371. The remaining five -- and C's `default:`
// impossible() -- reach outside this file, so accessory_or_armor_on() refuses
// those five by otyp above setworn(): hoisting is what keeps the refusal
// honest, because by the time this callback runs unmul() has already worn the
// cloak and moved AC. Armor_on()'s dragon-armor guard sits there for the same
// reason.
//
// The switch below therefore has no `default:`, and that is a second decision
// rather than a consequence of the first. set_wear() reaches this callback at
// startup with whatever u_init.c wore, which for a Ranger or an elf Ranger is
// a cloak the hoisted test would refuse -- so a guard here would stop a game C
// finishes. Falling through is safe because the arms those cloaks take,
// toggle_stealth() and toggle_displacement(), return without acting while
// gi.initial_don is set; set_wear()'s own comment carries that derivation.
//
// C's `oldprop` at 328 is read only by the arms that refusal stops --
// toggle_stealth(), toggle_displacement() and the invisibility test -- so it
// is not computed, which is the reasoning Cloak_off() below already records.
//
// Neither arm here touches AC or the slot: worn.c setworn() has already raised
// the extrinsic objects.h names as the type's oc_oprop, which for the smock is
// POISON_RES (630-632). C's comment at 368 says why this arm exists at all --
// the smock is the one cloak conferring two resistances, and only the second
// needs a statement.
//
// The `known` write then runs whatever the switch did, and it is what tells a
// cloak this callback finished donning from one setworn() merely moved. Only a
// cloak the game creates after startup witnesses it: mkobj.c mksobj() (864)
// leaves obj->known 0 for armor where u_init.c ini_inv_adjust_obj()
// (1215-1216) sets it to 1.
async function Cloak_on(state) {
    switch (state.uarmc.otyp) {
    case OILSKIN_CLOAK:
        await ttyPline(
            `${Tobjnam(state.uarmc, 'fit', state)} very tightly.`,
            state,
        );
        break;
    /* Alchemy smock gives poison _and_ acid resistance */
    case ALCHEMY_SMOCK:
        state.u.uprops[ACID_RES].extrinsic |= WORN_CLOAK;
        break;
    }
    if (state.uarmc && !state.uarmc.known) { /* no known instance of !uarmc */
        /* cloak's +/- evident because of status line AC */
        state.uarmc.known = true;
        update_inventory({ state });
    }
    return 0;
}

// C ref: do_wear.c Cloak_off() (382-431). C computes `oldprop` at 385 for
// toggle_stealth(), toggle_displacement() and the invisibility arm, and runs
// its switch after setworn(); all three of those arms stop here, so nothing
// reads oldprop and the type test is hoisted above the removal instead, which
// leaves the cloak on when it stops.
function Cloak_off(state) {
    const otyp = state.uarmc.otyp;

    if (!PLAIN_CLOAKS_OFF.has(otyp)) {
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

// The helmets Helmet_on() answers with a bare break. C's list at
// do_wear.c:441-446 holds six labels; HELM_OF_TELEPATHY is left out of this
// one, because its arm is bare only inside the switch. objects.h:485 gives the
// type an oc_oprop of TELEPAT, so worn.c setworn() raises ETelepat one
// statement earlier and recalc_telepat_range() sets u.unblind_telepat_range to
// BOLT_LIM squared. display.h sensemon(), ported at js/startup_a11y.js:1632,
// reads both, so the hero would start sensing every non-mindless monster
// within eight squares -- through hack.c domove_core()'s run test, mon.c's
// dknown clear and teleport.c's arrival tests, all of which call it. C feeds
// that state a redraw this port does not have, allmain.c moveloop_core()'s
// `Unblind_telepat` arm at 462-466, so a telepathy helm would diverge on the
// turn after it went on. It joins the five arms refused by otyp below.
const PLAIN_HELMETS_ON = new Set([
    HELMET, DENTED_POT, ELVEN_LEATHER_HELM, DWARVISH_IRON_HELM, ORCISH_HELM,
]);

// The helmet types Helmet_on() carries. Two callers ask: set_wear() below,
// for the helmet a new game starts in, and accessory_or_armor_on(), which
// hoists the question above setworn() because objects.h gives every helmet
// but the fedora and the dented pot an oc_delay of 1, so the callback itself
// runs a turn after the slot and the status line have already moved.
function helmetOnPorted(otyp) {
    return otyp === FEDORA || PLAIN_HELMETS_ON.has(otyp);
}

// C ref: do_wear.c Helmet_on() (433-515), reached both as the ga.afternmv
// callback accessory_or_armor_on() installs for the helmet slot and once per
// new game from set_wear() below.
//
// The FEDORA arm is the only <X>_on() arm this port carries that does anything
// beyond revealing an enchantment, and change_luck(1) is invisible until a
// caller asks rnd.c rnl() for a range over 15: at 15 or below rnl() folds the
// adjustment to (abs(Luck) + 1) / 3 * sgn(Luck), which is 0 for a single
// point. lock.c doopen_indir():904 asks for rnl(20), so an Archeologist who
// walks into a closed door -- hack.c:1097, no command needed -- draws one
// extra rn2(38) at rnd.c:143 and a shifted result while her hat is on.
//
// C's `uarmh &&` at 510 is left out. Its own comment at 509 says why it is
// there: uchangealign() inside the HELM_OF_OPPOSITE_ALIGNMENT arm can empty
// the slot. That arm is refused, and no other arm here touches uarmh, so the
// slot is still filled. Port that arm and the guard comes back with it.
function Helmet_on(state) {
    const otyp = state.uarmh.otyp;

    if (!helmetOnPorted(otyp))
        throw new UnsupportedWearError(`Helmet_on() for otyp ${otyp}`);

    switch (otyp) {
    case FEDORA:
        if (state.urole?.mnum === PM_ARCHEOLOGIST) change_luck(1, state);
        break;
    default: /* PLAIN_HELMETS_ON, C's bare-break labels at 441-446 */
        break;
    }
    if (!state.uarmh.known) {
        /* helmet's +/- evident because of status line AC */
        state.uarmh.known = true;
        update_inventory({ state });
    }
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
        // The mirror of Helmet_on()'s change_luck(1) at do_wear.c:439, and a
        // starting Archeologist has already had that point: u_init.c
        // ini_inv_use_obj() only calls setworn(), but set_wear() below runs
        // the callback over the finished gear before the first turn. So the
        // 'T' takes her from Luck 1 to Luck 0 rather than to Luck -1.
        if (state.urole?.mnum === PM_ARCHEOLOGIST) change_luck(-1, state);
        break;
    default: /* DENTED_POT, one of C's plain break labels at 528-533 */
        break;
    }
    setworn(null, W_ARMH, setwornEnv(state));
    return 0;
}

// C ref: do_wear.c Gloves_on() (575-603). Two callers ask: set_wear() below,
// for the leather gloves a Healer, Knight or Monk starts in (u_init.c:78, :57,
// :63), and accessory_or_armor_on(), which hoists the type question above
// setworn() because objects.h gives all four gloves an oc_delay of 1 (686-697),
// so the callback itself runs a turn after the slot and the status line have
// already moved.
//
// C's other three labels all reach outside do_wear.c: GAUNTLETS_OF_FUMBLING
// draws rnd(20) into HFumbling, GAUNTLETS_OF_POWER calls makeknown() and
// redraws the status line, and GAUNTLETS_OF_DEXTERITY calls adj_abon(). All
// three are refused. C's `oldprop` at 578 is read only by the fumbling arm, so
// it is not computed -- the reasoning Cloak_off() above already records for its
// own copy.
//
// Until 'W' could reach this callback the `known` write had no witness at all:
// u_init.c ini_inv_adjust_obj() (1215-1216) sets known on every starting piece,
// and the three roles above are the only heroes who had gloves. A wished pair
// arrives from mkobj.c mksobj() (864) with known 0, and is the first thing to
// turn the line over.
//
// C's known tail at 598-601 carries no `uarmg &&` guard, unlike Helmet_on()'s
// and Cloak_on()'s, because nothing in this switch can empty the slot.
function Gloves_on(state) {
    const otyp = state.uarmg.otyp;

    if (otyp !== LEATHER_GLOVES)
        throw new UnsupportedWearError(`Gloves_on() for otyp ${otyp}`);
    if (!state.uarmg.known) {
        /* gloves' +/- evident because of status line AC */
        state.uarmg.known = true;
        update_inventory({ state });
    }
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

// C ref: do_wear.c Shirt_on() (758-775), the ga.afternmv callback
// accessory_or_armor_on() installs for the shirt slot, and the one <X>_on()
// this port carries whole: both of C's labels fall to a bare break, so no
// shirt type has to be refused, and objects.h gives both an oc_delay of 0
// (603-608), so unmul("") always runs this on the turn the 'W' is typed.
//
// A shirt is the one slot whose wearing the status line cannot witness. The
// ARMOR macro stores 10 - ac, and objects.h gives both shirts ac 10, so a
// shirt's a_ac is 0 and find_ac() moves u.uac only by the enchantment. The
// message and the inventory window's "(being worn)" suffix are the rest of
// what the wearing shows.
function Shirt_on(state) {
    const otyp = state.uarmu.otyp;

    if (otyp !== HAWAIIAN_SHIRT && otyp !== T_SHIRT)
        throw new UnsupportedWearError(`Shirt_on() for otyp ${otyp}`);
    if (!state.uarmu.known) {
        /* shirt's +/- evident because of status line AC */
        state.uarmu.known = true;
        update_inventory({ state });
    }
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

// C ref: do_wear.c set_wear() (1537-1568), which allmain.c
// moveloop_preamble():73 runs once per new game as `set_wear((struct obj *) 0)`
// "for side-effects of starting gear". Only that arm is here: C's parameter
// selects one object instead of all of them, and zap.c poly_obj():1948 is the
// only caller that passes one, so the parameter has no reader and is left out.
//
// The point of the function is that u_init.c ini_inv_use_obj() (1262-1281)
// dresses the hero with bare setworn() calls, which move the slots, the
// extrinsics and the status line but run none of the <X>_on() callbacks. For
// six of the seven slots that costs nothing here, because every type a new
// game can start in falls to a callback whose whole body is a `known` write
// that u_init.c ini_inv_adjust_obj():1215-1216 has already made true. The
// seventh is the helmet: an Archeologist starts in a fedora, and Helmet_on()
// gives her the point of Luck that Helmet_off() takes back.
//
// C's gi.initial_don is not modelled. It has exactly two readers, both in
// do_wear.c -- toggle_stealth() at 112 and toggle_displacement() at 154 -- and
// both return before doing anything while it is TRUE. That is what makes the
// cloak call below complete without the arms accessory_or_armor_on() refuses
// for 'W': a Ranger starts in a cloak of displacement, or in an elven cloak
// when she is an elf (u_init.c:233), and at the initial don Cloak_on() is the
// `known` write for those two types as much as for the five plain ones.
// Whoever ports either toggle brings initial_don with it.
// Every refusal below ends the segment at a boundary with its matching prefix
// intact, which is not this file's doing: js/cmd.js failClosedCommandRefusals()
// lists the class, and js/moveloop_preamble.js
// runMoveloopPreambleAtStartupBoundary() wraps the preamble call this function
// arrives on and reads that list, as js/cmd.js failClosedCommand() does for a
// command and js/allmain.js for an elapsed turn. Nothing reaches one today --
// the accessory test below cannot fire, and the startup test walks the roles
// to show no worn piece reaches a refused otyp -- so that conversion is what
// keeps the next refusal added to an <X>_on() from costing a segment its whole
// prefix.
//
// The seven calls below are awaited, as js/hack.js unmul() awaits the same
// callbacks. Cloak_on() is what made that necessary rather than tidy: its
// OILSKIN_CLOAK arm prints through ttyPline(), so the callback is async, and
// an unawaited call would return a pending promise while the preamble ran on.
// The other six are plain functions, where awaiting is a no-op; they are
// awaited anyway, so that the next callback to print does not have to
// rediscover this.
export async function set_wear(state = game) {
    if (state.ublindf || state.uright || state.uleft || state.uamul) {
        // do_wear.c:1544-1551 Blindf_on(), Ring_on() twice and Amulet_on().
        // ini_inv_use_obj() fills only the seven armor slots, so a new game
        // leaves all four of these empty; no role's starting gear includes a
        // worn ring, amulet or blindfold.
        throw new UnsupportedWearError('set_wear() accessories');
    }
    if (state.uarmu) await Shirt_on(state);
    if (state.uarm) await Armor_on(state);
    if (state.uarmc) await Cloak_on(state);
    // do_wear.c:1558-1559. No role's starting gear fills W_ARMF: u_init.c
    // names boots nowhere but in the elven discovery list at :825, and
    // scripts/wear-armor.test.mjs pins the worn set of every distinct starting
    // configuration -- thirteen rows covering the eleven roles that differ,
    // plus the two racial substitutions; the Caveman and the Rogue share one
    // row because both start in leather armor and nothing else. So nothing
    // reaches this call. It is a call rather than a
    // refusal because Boots_on() is ported: a refusal standing in front of a
    // ported function would stop a game C finishes if a role ever gained
    // boots, which is the opposite of what a fail-closed boundary is for.
    if (state.uarmf) await Boots_on(state);
    if (state.uarmg) await Gloves_on(state);
    if (state.uarmh) await Helmet_on(state);
    if (state.uarms) await Shield_on(state);
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
// slots that can reach it: select_off() stops on a ring and on boots above,
// so their labels would be dead here. Gloves pass through since the
// glove-check branch is ported.
function takeoffMaskFor(otmp, state) {
    if (otmp === state.uarm) return WORN_ARMOR;
    if (otmp === state.uarmc) return WORN_CLOAK;
    if (otmp === state.uarmg) return WORN_GLOVES;
    if (otmp === state.uarmh) return WORN_HELMET;
    if (otmp === state.uarms) return WORN_SHIELD;
    if (otmp === state.uarmu) return WORN_SHIRT;
    if (otmp === state.uamul) return WORN_AMUL;
    if (otmp === state.ublindf) return WORN_BLINDF;
    // C's remaining labels are uwep, uswapwep and uquiver, which only the 'A'
    // command reaches, and then impossible("select_off: %s???").
    throw new UnsupportedTakeOffError('select_off() for a wielded item');
}

// C ref: do_wear.c better_not_take_that_off() (2990-3010). Prompts the hero
// before removing gloves while carrying a corpse that petrifies on touch.
// Returns true when the hero declines or when the prompt itself would stop
// execution (the spelled-out paranoid_ynq path is unported).
async function better_not_take_that_off(otmp, state = game) {
    const corpse = carrying_stoning_corpse(state);

    if (corpse
        && !u_safe_from_fatal_corpse(corpse, st_corpse | st_petrifies, state)) {
        const buf = `Take off your ${gloves_simple_name(otmp, state)}`
            + ` despite carrying a dead ${obj_pmname(corpse, state)}?`;
        return !(await paranoid_query(true, buf, state));
    }
    return false;
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
        if (welded(state.uwep, state)) {
            // do_wear.c:2731-2735
            await ttyPline(
                `You are unable to take off your ${c_gloves} while wielding`
                + ` that ${is_sword(state.uwep, state) ? c_sword : c_weapon}.`,
                state,
            );
            set_bknown(state.uwep, 1, { state });
            return 0;
        } else if (Glib(state)) {
            // do_wear.c:2736-2740. The inline comment in C says this is a
            // simplified Shk_Your(): unpaid items say "The", own items "Your".
            await ttyPline(
                `${state.uarmg.unpaid ? 'The' : 'Your'}`
                + ` ${gloves_simple_name(state.uarmg, state)}`
                + ` are too slippery to take off.`,
                state,
            );
            return 0;
        }
        if (await better_not_take_that_off(otmp, state))
            return 0;
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
                + `${the(xnameFresh(otmp, state), state)}.`,
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
// dowear('W') and doputon('P'). The armor half (2355-2404) is ported for all
// seven slots; the accessory half (2239-2353) handles rings, with fail-closed
// throws at Amulet_on() and Blindf_on() entry points.
//
// objects.h decides which of the armor tail's two arms a piece takes: all nine
// shields, all twelve cloaks, both shirts, the leather jacket among suits, and
// the fedora and dented pot among helmets carry oc_delay 0 and reach unmul("")
// and on_msg() on the spot. Every other suit, every other helmet, and all four
// gloves and ten boots spend one to five turns under nomul() first and print
// "You finish your dressing maneuver." instead of on_msg().
async function accessory_or_armor_on(obj, state = game) {
    if (obj.owornmask & (W_ACCESSORY | W_ARMOR)) {
        await already_wearing(c_that_, state);
        return ECMD_OK;
    }
    const armor = obj.oclass === ARMOR_CLASS;
    const ring = obj.oclass === RING_CLASS || obj.otyp === MEAT_RING;
    const amulet = obj.oclass === AMULET_CLASS;
    const eyewear = !ring && !amulet
        && (obj.otyp === BLINDFOLD || obj.otyp === TOWEL
            || obj.otyp === LENSES);
    let mask = 0;

    if (armor) {
        /* checks which are performed prior to actually touching the item */
        const worn = await canwearobj(obj, true, state);

        if (!worn.ok) return ECMD_OK;
        mask = worn.mask;

        if (obj.otyp === HELM_OF_OPPOSITE_ALIGNMENT
            && state.qstart_level?.dnum === state.u.uz.dnum) { /* in quest */
            // do_wear.c:2230-2237 zeroes u.ublessed, calls makeknown() and
            // redraws AC before returning ECMD_TIME without wearing the helm.
            // No ported path descends the Quest branch, so nothing reaches it.
            throw new UnsupportedWearError(
                'accessory_or_armor_on() quest helm',
            );
        }
    } else {
        /*
         * FIXME from C:
         *  except for the rings/nolimbs case, this allows you to put on
         *  accessories without having any hands to manipulate them
         */

        /* accessory */
        if (ring) {
            let res = 0;

            if (nolimbs(state.youmonst.data)) {
                await ttyPline(
                    'You cannot make the ring stick to your body.', state,
                );
                return ECMD_OK;
            }
            if (state.uleft && state.uright) {
                await ttyPline(
                    `There are no more ${humanoid(state.youmonst.data)
                        ? 'ring-' : ''}${fingers_or_gloves(false, state)}`
                    + ' to fill.',
                    state,
                );
                return ECMD_OK;
            }
            if (state.uleft) {
                mask = RIGHT_RING;
            } else if (state.uright) {
                mask = LEFT_RING;
            } else {
                /* both fingers free -- ask which one */
                let done = false;
                do {
                    const qbuf = `Which ${humanoid(state.youmonst.data)
                        ? 'ring-' : ''}${body_part(FINGER, state.youmonst)}`
                        + ', Right or Left?';
                    // C passes addcmdq TRUE for the repeat queue. #repeat is
                    // unported for this prompt, so FALSE omits an otherwise
                    // unobservable recording. The prompt and accepted
                    // characters are identical.
                    // yn_function returns a character code (number), so
                    // convert to a one-character string for the switch.
                    const answer = String.fromCharCode(
                        await yn_function(
                            qbuf, 'rl', '\0', false, state,
                        ),
                    );
                    switch (answer) {
                    case '\0':
                    case '\x1b': /* ESC */
                        return ECMD_OK;
                    case 'l':
                    case 'L':
                        mask = LEFT_RING;
                        done = true;
                        break;
                    case 'r':
                    case 'R':
                        mask = RIGHT_RING;
                        done = true;
                        break;
                    }
                } while (!done);
            }
            if (state.uarmg && Glib(state)) {
                await ttyPline(
                    `Your ${gloves_simple_name(state.uarmg, state)} are too `
                    + 'slippery to remove, so you cannot put on the ring.',
                    state,
                );
                return ECMD_TIME; /* always uses move */
            }
            if (state.uarmg && state.uarmg.cursed) {
                res = !state.uarmg.bknown ? 1 : 0;
                set_bknown(state.uarmg, 1, { state });
                await ttyPline(
                    `You cannot remove your ${c_gloves} to put on the ring.`,
                    state,
                );
                /* uses move iff we learned gloves are cursed */
                return res ? ECMD_TIME : ECMD_OK;
            }
            if (state.uwep) {
                res = !state.uwep.bknown ? 1 : 0; /* before calling welded() */
                const URIGHTY = state.u.uhandedness !== LEFT_HANDED;
                const ULEFTY = !URIGHTY;
                if (((mask === RIGHT_RING && URIGHTY)
                     || (mask === LEFT_RING && ULEFTY)
                     || bimanual(state.uwep, state))
                    && welded(state.uwep, state)) {
                    let hand = body_part(HAND, state.youmonst);
                    /* welded will set bknown */
                    if (bimanual(state.uwep, state))
                        hand = makeplural(hand);
                    await ttyPline(
                        `You cannot free your weapon ${hand} to put on`
                        + ' the ring.',
                        state,
                    );
                    /* uses move iff we learned weapon is cursed */
                    return res ? ECMD_TIME : ECMD_OK;
                }
            }
        } else if (amulet) {
            if (state.uamul) {
                await already_wearing('an amulet', state);
                return ECMD_OK;
            }
        } else if (eyewear) {
            if (!has_head(state.youmonst.data)) {
                // ansimpleoname() is unported; this arm fires only for a
                // headless polymorph form, which no ported path produces.
                throw new UnsupportedWearError(
                    'ansimpleoname() for headless polymorph',
                );
            }
            if (state.ublindf) {
                if (state.ublindf.otyp === TOWEL) {
                    await ttyPline(
                        `Your ${body_part(FACE, state.youmonst)} is already`
                        + ' covered by a towel.',
                        state,
                    );
                } else if (state.ublindf.otyp === BLINDFOLD) {
                    if (obj.otyp === LENSES)
                        await already_wearing2('lenses', 'a blindfold', state);
                    else
                        await already_wearing('a blindfold', state);
                } else if (state.ublindf.otyp === LENSES) {
                    if (obj.otyp === BLINDFOLD)
                        await already_wearing2(
                            'a blindfold', 'some lenses', state,
                        );
                    else
                        await already_wearing('some lenses', state);
                } else {
                    await already_wearing('something', state); /* ??? */
                }
                return ECMD_OK;
            }
        } else {
            /* neither armor nor accessory */
            await ttyPline("You can't wear that!", state);
            return ECMD_OK;
        }
    }

    // C ref: do_wear.c:2355 retouch_object(&obj, FALSE), on the same
    // derivation js/apply.js:219-232 and js/eat.js:2095-2105 record for
    // doapply() and doeat(): artifact.c retouch_object() answers 1 with no
    // side effect for every object that is not an artifact.
    if (obj.oartifact)
        throw new UnsupportedWearError('retouch_object() for an artifact');

    if (armor) {
        /* if the armor is wielded, release it for wearing (won't be
           welded even if cursed; that only happens for weapons/weptools) */
        if (obj.owornmask & W_WEAPONS) {
            // do_wear.c:2363-2364 remove_worn_item(), which
            // js/dothrow.js:550 also stops in front of. Nothing puts armor
            // in a weapon slot here: 'w', 'x' and 'Q' are unported and
            // u_init.c wields only weapons.
            throw new UnsupportedWearError('remove_worn_item()');
        }
        /*
         * C sets obj->known in the afternmv action rather than here, so
         * that a nymph who steals the armor mid-donning leaves the hero
         * ignorant of its enchantment; Armor_on() and Shield_on() above
         * are those actions.
         */
        // do_wear.c:2375 `gw.wasinwater = u.uinwater` is deliberately not
        // written. Boots_on() (do_wear.c:210-215) is its only reader, and
        // that read sits inside the WATER_WALKING_BOOTS arm the W_ARMF
        // case below refuses by otyp, so copying u.uinwater here would
        // give that value a second home with nothing to read it. It belongs
        // with a ported water-walking arm.

        // C's chain at 2377-2393 chooses the callback by comparing `obj`
        // against the slot pointers setworn() has just filled. `mask` names
        // the same slot one statement earlier, so switching on it here
        // answers all seven slots and refuses the callback arms that reach
        // outside do_wear.c before anything is written -- the shape
        // armoroff()'s delayed branch uses above.
        //
        // Every otyp refusal below is hoisted out of its callback rather
        // than left in it, because a callback runs too late to stop
        // anything: by then setworn() has moved AC, and on the delayed arm
        // the helpless turns are spent as well. Above setworn() a refusal
        // leaves the hero as it found her. Boots_on(), Helmet_on() and
        // Gloves_on() keep a copy of their question as well as being
        // hoisted here, because set_wear() reaches them with whatever
        // u_init.c wore and has no frame above it to hoist into.
        let afternmv;

        switch (mask) {
        case W_ARM:
            // dragon_armor_handling() has an arm for eight of the ten
            // colors; grey and silver take its default break and are
            // admitted. Seven colored put-on arms are ported. Gold is
            // refused above setworn() because it needs make_hallucinated.
            if (obj.otyp === GOLD_DRAGON_SCALES
                || obj.otyp === GOLD_DRAGON_SCALE_MAIL)
                throw new UnsupportedWearError(
                    `Armor_on() for otyp ${obj.otyp}`,
                );
            afternmv = Armor_on;
            break;
        case W_ARMC:
            if (!cloakOnPorted(obj.otyp))
                throw new UnsupportedWearError(
                    `Cloak_on() for otyp ${obj.otyp}`,
                );
            afternmv = Cloak_on;
            break;
        case W_ARMH:
            if (!helmetOnPorted(obj.otyp))
                throw new UnsupportedWearError(
                    `Helmet_on() for otyp ${obj.otyp}`,
                );
            afternmv = Helmet_on;
            break;
        case W_ARMG:
            if (obj.otyp !== LEATHER_GLOVES)
                throw new UnsupportedWearError(
                    `Gloves_on() for otyp ${obj.otyp}`,
                );
            afternmv = Gloves_on;
            break;
        case W_ARMF:
            if (!PLAIN_BOOTS_ON.has(obj.otyp) && obj.otyp !== SPEED_BOOTS)
                throw new UnsupportedWearError(
                    `Boots_on() for otyp ${obj.otyp}`,
                );
            afternmv = Boots_on;
            break;
        case W_ARMU:
            afternmv = Shirt_on;
            break;
        case W_ARMS:
            afternmv = Shield_on;
            break;
        default:
            throw new Error(
                `wearing armor not worn as armor? [${mask}]`,
            );
        }

        setworn(obj, mask, setwornEnv(state));
        /* if there's no delay, we'll execute 'afternmv' immediately */
        state.afternmv = afternmv;

        const delay = -objectType(obj, state).oc_delay;

        if (delay) {
            nomul(delay, state);
            state.multi_reason = 'dressing up';
            state.nomovemsg = 'You finish your dressing maneuver.';
        } else {
            /* call afternmv, clear it+nomovemsg+multi_reason */
            await unmul('', state);
            await on_msg(obj, state);
        }
        takeoffContext(state).mask = 0;
    } else { /* not armor */
        if (ring) {
            /* Ring_on() expects ring to already be worn as uleft or uright */
            setworn(obj, mask, setwornEnv(state));
            await Ring_on(obj, state);
            /* is_worn(): 'obj' will always be worn here except when putting
               on a ring of levitation while at a sink location */
            if (obj.owornmask)
                await on_msg(obj, state);
        } else if (amulet) {
            /* setworn() and on_msg() handled by Amulet_on() */
            await Amulet_on(obj, state);
        } else if (eyewear) {
            /* setworn() and on_msg() handled by Blindf_on() */
            await Blindf_on(obj, state);
        } else {
            throw new Error(
                `putting on unexpected type of accessory: otyp ${obj.otyp}`,
            );
        }
    }
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

// C ref: do_wear.c puton_ok() (3451-3454), the getobj() callback for 'P'.
export async function puton_ok(obj, state = game) {
    return equip_ok(obj, false, true, state);
}

// C ref: do_wear.c doputon() (2454-2469), the 'P' command.
export async function doputon(state = game) {
    if (state.uleft && state.uright && state.uamul && state.ublindf
        && state.uarm && state.uarmu && state.uarmc && state.uarmh
        && state.uarms && state.uarmg && state.uarmf) {
        /* 'P' message doesn't mention armor */
        await ttyPline(
            `Your ${humanoid(state.youmonst.data) ? 'ring-' : ''}`
            + `${fingers_or_gloves(false, state)} are full, and you're already`
            + ` wearing an amulet and ${(state.ublindf.otyp === LENSES)
                ? 'some lenses' : 'a blindfold'}.`,
            state,
        );
        return ECMD_OK;
    }
    const otmp = await getobj('put on', puton_ok, GETOBJ_NOFLAGS, state);

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
    } else if (obj === state.ublindf) {
        // do_wear.c:1820-1821. Blindf_off does its own off_msg.
        await Blindf_off(obj, state);
    } else {
        // do_wear.c:1809-1819 dispatches Ring_off() and Amulet_off();
        // a ring stops one frame earlier inside select_off().
        throw new UnsupportedTakeOffError(
            'Ring_off()/Amulet_off()',
        );
    }
    return ECMD_TIME;
}

// C ref: flag.h:570 ParanoidRemove.
//
// options.c optfn_paranoid_confirmation() stores every startup setting in the
// same flags.paranoia_bits field this macro reads.
function ParanoidRemove(state) {
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

// C ref: do_wear.c some_armor() (2630-2652). The hero's seven armor globals are
// kept in the same order as
// C's uarm, uarmc, uarmu, uarmh, uarmg, uarmf and uarms selection. This slice
// reaches only the hero arm; monster minvent selection belongs to its callers.
export function some_armor(victim, state = game, random = { rn2 }) {
    if (victim !== state.youmonst) {
        throw new Error('some_armor() requires the hero victim');
    }

    let selected = state.uarmc ?? state.uarm ?? state.uarmu ?? null;
    for (const field of ['uarmh', 'uarmg', 'uarmf', 'uarms']) {
        const armor = state[field];
        if (armor && (!selected || !random.rn2(4))) selected = armor;
    }
    return selected;
}

// C ref: do_wear.c obj_erode_type() (3258-3273). The order is observable for
// materials that satisfy more than one predicate, so keep the source order
// instead of delegating to isDamageable().
export function obj_erode_type(obj, state = game) {
    if (isFlammable(obj, state)) return ERODE_BURN;
    if (isRustprone(obj, state)) return ERODE_RUST;
    if (isCrackable(obj, state)) return ERODE_CRACK;
    if (isRottable(obj, state)) return ERODE_ROT;
    if (isCorrodeable(obj, state)) return ERODE_CORRODE;
    return ERODE_NONE;
}

// C ref: do_wear.c destroy_arm() (3278-3316). The caller supplies a hero
// object from some_armor(); erode_obj() owns the source-ordered messages,
// erosion fields, inventory refreshes and EF_PAY/EF_DESTROY handling.
export async function destroy_arm(state = game, random = { rn2, rnl }) {
    const hits = random.rn2(4) + 1;
    const armors = [
        state.uarm,
        state.uarmc,
        state.uarmh,
        state.uarms,
        state.uarmg,
        state.uarmf,
        state.uarmu,
    ].filter(Boolean);
    if (!armors.length) return false;

    // Dynamic import keeps do_wear.js's existing command-loop dependency graph
    // acyclic: trap_erode_obj.js reaches zap.js, which reaches do_wear.js.
    const { erode_obj } = await import('./trap_erode_obj.js');
    let ret = false;
    for (let i = 0; i < hits; ++i) {
        const armor = armors[random.rn2(armors.length)];
        if (erosionMatters(armor, state)
            && isDamageable(armor, state) && !armor.oerodeproof) {
            const erosion = obj_erode_type(armor, state);
            if (erosion !== ERODE_NONE) {
                const result = await erode_obj(
                    armor,
                    xnameFresh(armor, state),
                    erosion,
                    EF_PAY | EF_DESTROY,
                    { state, random },
                );
                if (result !== ER_NOTHING) ret = true;
                if (result === ER_DESTROYED) break;
            }
        }
    }

    if (ret) {
        // stop_occupation() has no visible work in the ordinary command case,
        // but it also clears an active occupation exactly where C does.
        const { stop_occupation } = await import('./allmain.js');
        await stop_occupation(state, { message: ttyPline });
    }
    return ret;
}

export const _doWearInternals = Object.freeze({
    Amulet_on,
    Blindf_on,
    Armor_off,
    Armor_on,
    Boots_on,
    Cloak_off,
    Cloak_on,
    Gloves_on,
    Helmet_off,
    Helmet_on,
    Ring_on,
    Shield_off,
    Shield_on,
    Shirt_off,
    Shirt_on,
    accessory_or_armor_on,
    already_wearing,
    already_wearing2,
    cancel_doff,
    off_msg,
    on_msg,
    reset_remarm,
    some_armor,
    obj_erode_type,
    destroy_arm,
    takeoffContext,
    setwornEnv,
});
