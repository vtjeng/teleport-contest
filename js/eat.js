// The #eat command, the hunger clock, and the food helpers that object
// creation and naming share.
// C refs: src/eat.c is_edible(), gethungry(), newuhs(), nonrotting_corpse(),
//         vegan(), vegetarian(), tin_variety(), set_tin_variety(),
//         tin_details(), eat_ok(), floorfood(), doeat(), and vomit().

import {
    ACID_RES,
    AGGRAVATE_MONSTER,
    A_CHA,
    A_CON,
    A_DEX,
    A_STR,
    A_WIS,
    BY_COOKIE,
    BLINDED,
    COST_DSTROY,
    COST_OPEN,
    IS_ALTAR,
    COLD_RES,
    CONFUSION,
    CONFLICT,
    COST_BITE,
    CXN_PFX_THE,
    CXN_SINGULAR,
    DEAF,
    DISINT_RES,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FAINTED,
    FAINTING,
    FIRE_RES,
    FIXED_ABIL,
    FROMFORM,
    FROMOUTSIDE,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    GLIB,
    Has_contents,
    IRONBARS,
    HEALTHY_TIN,
    HOMEMADE_TIN,
    HUNGER,
    HUNGRY,
    HALLUC,
    HALLUC_RES,
    INVIS,
    Is_airlevel,
    Is_astralevel,
    Is_waterlevel,
    KILLED_BY_AN,
    LL_CONDUCT,
    LAST_PROP,
    LIGHT_HEADED,
    MAGICAL_BREATHING,
    NOT_HUNGRY,
    POISON_RES,
    PROTECTION,
    REGENERATION,
    ROTTEN_TIN,
    SATIATED,
    SEE_INVIS,
    SHOCK_RES,
    SICK,
    SICK_RES,
    SICK_VOMITABLE,
    SLEEP_RES,
    SLEEPY,
    SLIMED,
    SLOW_DIGESTION,
    SLT_ENCUMBER,
    SPINACH_TIN,
    STOMACH,
    STONED,
    STONE_RES,
    STRANGLED,
    TELEPAT,
    TELEPORT,
    TELEPORT_CONTROL,
    TIMEOUT,
    UNCHANGING,
    Upolyd,
    VOMITING,
    WEAK,
    W_AMUL,
    W_ARMOR,
    W_ARTI,
    W_RINGL,
    W_RINGR,
    W_SADDLE,
    W_TOOL,
    W_WEP,
    W_NONDIGGABLE,
    WWALKING,
    TT_BEARTRAP,
    BEAR_TRAP,
    NEUTRAL,
} from './const.js';
import {
    acurr, acurrstr, adjalign, adjattrib, exercise, gainstr, poison_strdmg,
} from './attrib.js';
import { ART_ORB_OF_DETECTION } from './artifacts.js';
import { set_occupation, y_n, yn_function } from './cmd.js';
import { tinnable } from './apply.js';
import { on_level, surface } from './dungeon.js';
import { newsym, see_monsters } from './display.js';
import { can_reach_floor } from './engrave.js';
import { game } from './gstate.js';
import { note_unported } from './unported.js';
import { livelog_printf } from './pline.js';
import {
    check_capacity, endRunning, inv_cnt, losehp, nomul, rounddiv,
    still_chewing,
    You_can_move_again,
} from './hack.js';
import { dist2, lcase } from './hacklib.js';
import {
    INVLET_BASIC,
    addinv_nomerge,
    carrying,
    feel_cockatrice,
    freeinv,
    getobj,
    hands_obj,
    obj_extract_self,
    obj_here,
    stackobj,
    useup,
    useupall,
    useupf,
    will_feel_cockatrice,
} from './invent.js';
import { dropx, dropy, trycall } from './do.js';
import { makeplural } from './fruit.js';
import { iter_mons_safe, mon_offmap, rescham } from './mon.js';
import {
    acidic,
    attacktype,
    attacktype_fordmg,
    can_teleport,
    carnivorous,
    cantvomit,
    control_teleport,
    defended,
    dmgtype,
    flesh_petrifies,
    herbivorous,
    is_giant,
    is_rider,
    is_clinger,
    is_were,
    metallivorous,
    poisonous,
    poly_when_stoned,
    same_race,
    slimeproof,
    telepathic,
    type_is_pname,
    your_race,
    is_undead,
    olfaction,
    breathless,
    perceives,
} from './mondata.js';
import { AD_ACID, AD_DISE, AT_BREA } from './monsters.js';
import { hcolor, rndmonnam } from './do_name.js';
import { monflee } from './monmove.js';
import {
    AD_HALU,
    AD_STUN,
    AT_MAGC,
    LOW_PM,
    M1_CARNIVORE,
    M1_HERBIVORE,
    M1_METALLIVORE,
    MR_ACID,
    MR_COLD,
    MR_DISINT,
    MR_ELEC,
    MR_FIRE,
    MR_POISON,
    MR_SLEEP,
    MR_STONE,
    NON_PM,
    NUMMONS,
    PM_ACID_BLOB,
    PM_BAT,
    PM_CHAMELEON,
    PM_DEATH,
    PM_DISENCHANTER,
    PM_DISPLACER_BEAST,
    PM_DOG,
    PM_DOPPELGANGER,
    PM_FAMINE,
    PM_GENETIC_ENGINEER,
    PM_GIANT_BAT,
    PM_GIANT_MIMIC,
    PM_GELATINOUS_CUBE,
    PM_GHOUL,
    PM_HOUSECAT,
    PM_HUMAN_WEREJACKAL,
    PM_HUMAN_WERERAT,
    PM_HUMAN_WEREWOLF,
    PM_KITTEN,
    PM_LARGE_CAT,
    PM_LARGE_DOG,
    PM_LARGE_MIMIC,
    PM_LITTLE_DOG,
    PM_MASTER_MIND_FLAYER,
    PM_MIND_FLAYER,
    PM_KILLER_BEE,
    PM_SCORPION,
    PM_NURSE,
    PM_PESTILENCE,
    PM_QUANTUM_MECHANIC,
    PM_RUST_MONSTER,
    PM_SANDESTIN,
    PM_SMALL_MIMIC,
    PM_WRAITH,
    PM_YELLOW_LIGHT,
    PM_BLACK_PUDDING,
    PM_CAVE_DWELLER,
    PM_CHICKATRICE,
    PM_COCKATRICE,
    PM_DWARF,
    PM_FIRE_ELEMENTAL,
    PM_FLESH_GOLEM,
    PM_FLOATING_EYE,
    PM_ELF,
    PM_GREEN_SLIME,
    PM_LEATHER_GOLEM,
    PM_LICHEN,
    PM_LIZARD,
    PM_MONK,
    PM_NEWT,
    PM_ORC,
    PM_RAVEN,
    PM_STALKER,
    PM_TIGER,
    PM_VALKYRIE,
    PM_VIOLET_FUNGUS,
    PM_WIZARD,
    S_BLOB,
    S_ELEMENTAL,
    S_FUNGUS,
    S_GHOST,
    S_GOLEM,
    S_JELLY,
    S_LIGHT,
    S_PUDDING,
    S_VORTEX,
} from './monsters.js';
import { change_luck } from './moveloop_preamble.js';
import {
    dopotion, incr_itimeout, make_blinded, make_confused, make_deaf,
    make_glib,
} from './potion.js';
import {
    carried,
    costly_alteration,
    bcsign,
    is_flammable,
    isMetallic,
    isRustprone,
    is_rottable,
    objectType,
    peek_at_iced_corpse_age,
    remove_object,
    set_bknown,
    splitobj,
    weight,
    g_at,
    mksobj,
} from './obj.js';
import {
    an, ansimpleoname, corpse_xname, donameFresh, obj_is_pname,
    otense, safe_qbuf,
    singular, the, the_unique_pm, xnameFresh,
} from './objnam.js';
import {
    APPLE,
    AMULET_CLASS,
    AMULET_OF_CHANGE,
    AMULET_OF_FLYING,
    AMULET_OF_GUARDING,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_REFLECTION,
    AMULET_OF_RESTFUL_SLEEP,
    AMULET_OF_STRANGULATION,
    AMULET_OF_UNCHANGING,
    AMULET_OF_YENDOR,
    CANDY_BAR,
    CARROT,
    CLOVE_OF_GARLIC,
    COIN_CLASS,
    CORPSE,
    CRAM_RATION,
    CREAM_PIE,
    C_RATION,
    EGG,
    ENORMOUS_MEATBALL,
    EUCALYPTUS_LEAF,
    FAKE_AMULET_OF_YENDOR,
    BONE,
    DRAGON_HIDE,
    FLESH,
    FOOD_CLASS,
    BALL_CLASS,
    CHAIN_CLASS,
    GEM_CLASS,
    GLASS,
    FOOD_RATION,
    FORTUNE_COOKIE,
    K_RATION,
    LEATHER,
    LEMBAS_WAFER,
    LUMP_OF_ROYAL_JELLY,
    PAPER,
    POTION_CLASS,
    RIN_ADORNMENT,
    RIN_FREE_ACTION,
    RIN_GAIN_CONSTITUTION,
    RIN_GAIN_STRENGTH,
    RIN_INCREASE_ACCURACY,
    RIN_INCREASE_DAMAGE,
    RIN_INVISIBILITY,
    RIN_LEVITATION,
    RIN_PROTECTION_FROM_SHAPE_CHAN,
    RING_CLASS,
    RIN_SEE_INVISIBLE,
    RIN_SUSTAIN_ABILITY,
    SCROLL_CLASS,
    MEATBALL,
    MEAT_RING,
    MEAT_STICK,
    PANCAKE,
    PEAR,
    RIN_PROTECTION,
    RIN_SLOW_DIGESTION,
    SLIME_MOLD,
    SPRIG_OF_WOLFSBANE,
    TRIDENT,
    FLINT,
    LEASH,
    SCR_MAIL,
    SCR_SCARE_MONSTER,
    DAGGER,
    SILVER_DAGGER,
    ELVEN_DAGGER,
    ORCISH_DAGGER,
    ATHAME,
    KNIFE,
    STILETTO,
    CRYSKNIFE,
    PICK_AXE,
    AXE,
    TIN,
    TIN_OPENER,
    TRIPE_RATION,
    BEARTRAP,
    WAX,
    WOOD,
    WEAPON_CLASS,
} from './objects.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    discover_object, observe_object, objdescr_is,
} from './o_init.js';
import { encumber_msg } from './pickup.js';
import { body_part, change_sex, rehumanize } from './polyself.js';
import { heroIsBlind } from './startup_a11y.js';
import { fingers_or_gloves } from './do_wear.js';
import { d, rn1, rn2, rnd } from './rng.js';
import { outrumor } from './random_text.js';
import { obj_stop_timers } from './timeout.js';
import {
    Flying,
    Levitation, deltrap, float_up, is_pool_or_lava, reset_utrap, t_at,
    unconscious,
} from './trap.js';
import { ttyPline } from './tty_message.js';
import { remove_worn_item } from './steal.js';
import { costly_spot } from './shk.js';
import {
    cantwield, uwepgone, uswapwepgone, uqwepgone, welded, wield_tool,
} from './wield.js';

// C ref: eat.c hu_stat[], indexed by u.uhs and shared with botl.c and
// insight.c. Every entry is eight columns wide, so a reader that wants the
// bare word runs mungspaces() over it as insight.c does.
export const hu_stat = Object.freeze([
    'Satiated', '        ', 'Hungry  ', 'Weak    ',
    'Fainting', 'Fainted ', 'Starved ',
]);

// C ref: eat.c tintxts[]. obj.spe stores the index (negated and offset), so
// table order is part of the object representation.
export const TIN_VARIETIES = Object.freeze([
    Object.freeze({ name: 'rotten', healthFood: false }),
    Object.freeze({ name: 'homemade', healthFood: true }),
    Object.freeze({ name: 'soup made from', healthFood: true }),
    Object.freeze({ name: 'french fried', healthFood: false }),
    Object.freeze({ name: 'pickled', healthFood: true }),
    Object.freeze({ name: 'boiled', healthFood: true }),
    Object.freeze({ name: 'smoked', healthFood: true }),
    Object.freeze({ name: 'dried', healthFood: true }),
    Object.freeze({ name: 'deep fried', healthFood: false }),
    Object.freeze({ name: 'szechuan', healthFood: true }),
    Object.freeze({ name: 'broiled', healthFood: false }),
    Object.freeze({ name: 'stir fried', healthFood: false }),
    Object.freeze({ name: 'sauteed', healthFood: false }),
    Object.freeze({ name: 'candied', healthFood: true }),
    Object.freeze({ name: 'pureed', healthFood: true }),
]);
const TIN_VARIETY_COUNT = TIN_VARIETIES.length;

// C ref: eat.c costly_tin() (1389-1402). The one persistent C tin context
// lives beside victual in state.context; opening, pricing and consuming all
// share this pointer and object id.
function tinContext(state = game) {
    state.context ??= {};
    state.context.tin ??= {
        tin: null,
        o_id: 0,
        reqtime: 0,
        usedtime: 0,
    };
    return state.context.tin;
}

function costly_tin(alterType, state = game) {
    const context = tinContext(state);
    let tin = context.tin;
    if (!tin) return tin;

    const needsCharge = carried(tin)
        ? Boolean(tin.unpaid)
        : (costly_spot(tin.ox, tin.oy, state) && !tin.no_charge);
    if (!needsCharge) return tin;

    if ((tin.quan ?? 1) > 1) {
        tin = splitobj(tin, 1, { state });
        context.tin = tin;
        context.o_id = tin.o_id;
    }
    // mkobj.c costly_alteration() is a discarded void callee whose billed
    // shop path still needs its own port. Keep the source gap explicit.
    note_unported('mkobj.c costly_alteration');
    return tin;
}

// C ref: eat.c tin_variety_txt() (1405-1421). Find a known tin variety at
// the start of a description and return the number of characters consumed,
// including the following space. The final empty tintxts[] row is a
// terminator and is therefore excluded from the scan.
export function tin_variety_txt(text, varietyRef = null) {
    // C initializes *tinvariety whenever both pointers are non-null;
    // an empty string still takes that initialization before the scan.
    if (typeof text !== 'string'
        || !varietyRef || typeof varietyRef !== 'object')
        return 0;
    varietyRef.value = -1;
    if (text.length === 0) return 0;
    for (let index = 0; index < TIN_VARIETY_COUNT; index++) {
        const name = TIN_VARIETIES[index].name;
        if (strncmpi(text, name) && text.length > name.length
            && text[name.length] === ' ') {
            varietyRef.value = index;
            return name.length + 1;
        }
    }
    return 0;
}

function strncmpi(text, prefix) {
    return text.length >= prefix.length
        && lcase(text.slice(0, prefix.length)) === lcase(prefix);
}
function tinEnv(env = {}) {
    const random = { rn1, rn2, rnd, ...(env.random ?? {}) };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('tin variety random injection requires rn2');
    return { state: env.state ?? game, random };
}

function ismnum(index) {
    return Number.isInteger(index) && index >= 0 && index < NUMMONS;
}

function hungerProperty(state, index) {
    return state.u?.uprops?.[index] ?? {};
}

// The `(HFoo || EFoo)` shape, and only that shape. youprop.h spells
// Sleep_resistance (36), Hunger (147), Slow_digestion (291) and
// Halluc_resistance (119) this way; the maladies at :108-113 and
// Hallucination's own positive term at :116 are the bare intrinsic, so they
// read hungerProperty().intrinsic instead.
//
// youprop.h:218 spells Conflict this way too, but gethungry() must not read it
// through this helper: eat.c:3202-3203 tests `HConflict || (EConflict &
// (~W_ARTI))` rather than the macro, so an artifact is the one conflict source
// that costs no nutrition. That masked test stays spelled out below.
function propertyActive(state, index) {
    const property = hungerProperty(state, index);
    return Boolean(property.intrinsic || property.extrinsic);
}

// C ref: eat.c temp_resist() (453-470). The timeout portion is temporary
// only when no other intrinsic source, worn source, or blocker contributes.
export function temp_resist(prop, state = game) {
    const property = hungerProperty(state, prop);
    const intrinsic = Number(property.intrinsic ?? 0);
    const timeout = intrinsic & TIMEOUT;
    return timeout
        && (intrinsic & ~TIMEOUT) === 0
        && !property.extrinsic
        && !property.blocked
        ? timeout : 0;
}

// C ref: youprop.h Sick_resistance (67-70). In addition to the intrinsic and
// extrinsic property bits, a wielded sickness-defending artifact or green
// dragon armor (through mondata.c defended()) confers this resistance.
function sickResistance(state) {
    const property = hungerProperty(state, SICK_RES);
    return Boolean(property.intrinsic || property.extrinsic
        || defended(state.youmonst, AD_DISE, state));
}

// C ref: eat.c is_fainted() (3346-3350). Keep the hunger status predicate in
// its source owner; youprop.h Unaware and steal.c unresponsive() both use it.
export function is_fainted(state = game) {
    return state.u?.uhs === FAINTED;
}

// C ref: youprop.h:399 Unaware. js/trap.js unconscious() carries the pending-
// message half; eat.c is_fainted() carries the hunger-status half.
function Unaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || is_fainted(state));
}

function hungerStatus(nutrition) {
    return nutrition > 1000 ? SATIATED
        : nutrition > 150 ? NOT_HUNGRY
            : nutrition > 50 ? HUNGRY
                : nutrition > 0 ? WEAK : FAINTING;
}

function ringConsumesNutrition(ring, side, state) {
    if (!ring || ring.otyp === MEAT_RING) return false;
    const definition = state.objects?.[ring.otyp];
    if (!definition) {
        throw new Error(
            `gethungry requires object data for ring ${ring.otyp}`,
        );
    }
    if (ring.spe || !definition.oc_charged) return true;
    if (ring.otyp !== RIN_PROTECTION) return false;

    const extrinsic = Math.trunc(
        hungerProperty(state, PROTECTION).extrinsic ?? 0,
    );
    if (side === W_RINGL) {
        const otherSources = extrinsic & ~W_RINGL;
        return otherSources === 0
            || (otherSources === W_RINGR
                && state.uright?.otyp === RIN_PROTECTION
                && !state.uright.spe);
    }
    return (extrinsic & ~W_RINGR) === 0;
}

function preflightNutritionRing(ring, state) {
    if (!ring || ring.otyp === MEAT_RING) return;
    if (!state.objects?.[ring.otyp]) {
        throw new Error(
            `gethungry requires object data for ring ${ring.otyp}`,
        );
    }
}

// Which statuses newuhs() can be asked to move to. It carries the whole of
// eat.c newuhs() (3361-3513) except the FAINTING arm, which needs
// is_fainted(), stop_occupation(), incr_itimeout(HDeaf), nomul() with
// afternmv, selftouch(), done(STARVING) and the rn2(20 - uhunger/10) draw that
// picks between fainting and starving. hungerStatus() answers only the five
// values below FAINTED, so FAINTED and STARVED cannot arrive here.
function supportedHungerTransition(newStatus) {
    return newStatus !== FAINTING;
}

// The operations eat.c reaches through globals -- pline(), end_running() and
// bot() -- and this port injects, because the elapsed-turn caller substitutes
// silent versions of all three when it dry-runs a turn on a cloned state.
// Resolving by name means a caller that omits one fails here rather than
// silently skipping the output C produces.
function requireEatOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`eat.c requires ${name}`);
    return operation;
}

// Raised by gethungry()'s preflight and by newuhs() itself. newuhs() is shared:
// gethungry() calls it from the turn loop, and done_eating() and lesshungry()
// call it from doeat(), so this class reaches the caller down both paths and
// js/allmain.js and js/cmd.js each convert it at their own seam.
export class UnsupportedHungerTransitionError extends Error {
    constructor(reason) {
        super(`the hunger clock reached ${reason}`);
        this.name = 'UnsupportedHungerTransitionError';
        this.reason = reason;
    }
}

// Thrown where eat.c doeat() or floorfood() reaches an arm this port has not
// implemented. Every stop names the C function or hero state that is missing.
export class UnsupportedEatError extends Error {
    constructor(reason) {
        super(`eating requires ${reason}`);
        this.name = 'UnsupportedEatError';
        this.reason = reason;
    }
}

// C ref: eat.c is_edible() (91-121). This is a pure predicate: it reads the
// current form and object definition but makes no random draw, output, or
// state change. The form-specific arms intentionally precede FOOD_CLASS just
// as in C, so a non-food object can be eaten by a compatible polymorph.
export function is_edible(obj, state = game) {
    const type = objectType(obj, state);
    /* protect invocation tools but not Rider corpses (handled elsewhere) */
    if (type.oc_unique) return false;
    /* above also prevents the Amulet from being eaten, so we must never
       allow fake amulets to be eaten either [which is already the case] */

    const species = state.youmonst?.data;
    if (species === state.mons?.[PM_FIRE_ELEMENTAL]
        && is_flammable(obj, state))
        return true;

    if (metallivorous(species) && isMetallic(obj, state)
        && (species !== state.mons?.[PM_RUST_MONSTER]
            || isRustprone(obj, state)))
        return true;

    /* Ghouls only eat non-veggy corpses or eggs (see dogfood()). */
    if (state.u?.umonnum === PM_GHOUL)
        return (obj.otyp === CORPSE
                && !vegan(state.mons?.[obj.corpsenm]))
            || obj.otyp === EGG;

    if (state.u?.umonnum === PM_GELATINOUS_CUBE
        && type.oc_material <= WOOD
        /* g-cubes can eat containers and retain all contents, but a
           polymorphed player can't do that */
        && !Has_contents(obj))
        return true;

    return obj.oclass === FOOD_CLASS;
}

// Pure admission for eat.c:gethungry(). allmain.c uses this before changing
// any elapsed-turn state; gethungry() reuses the returned source inputs at its
// actual source-ordered call site.
export function preflightGetHungry(state = game, env = {}) {
    const u = state.u;
    if (!u || !Number.isSafeInteger(u.uhunger)) {
        throw new Error('gethungry requires initialized hero nutrition');
    }
    if (u.uinvulnerable || state.iflags?.debug_hunger)
        return { skipped: true };
    // C ref: eat.c gethungry():3174 `(!Unaware || !rn2(10))`, the slow
    // metabolic rate of a hero who is asleep or fainted. The draw itself
    // belongs to gethungry(), at its source position ahead of the rn2(20), so
    // this stays pure and only reports which hero it is admitting. A hero
    // immobilized with a message waiting -- pray.c dopray() is one -- is not
    // Unaware and burns nutrition at the ordinary rate with no draw.
    const unaware = Unaware(state);

    if (typeof env.nearCapacity !== 'function') {
        throw new Error('gethungry requires nearCapacity');
    }
    const species = state.youmonst?.data;
    if (!species || !Number.isInteger(species.mflags1)) {
        throw new Error('gethungry requires initialized hero form');
    }

    if (u.uhs === FAINTED || hungerStatus(u.uhunger) !== u.uhs) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
        );
    }
    // Either ring can be selected by rn2(20). Validate both definitions
    // before that draw so malformed admitted state cannot consume RNG.
    preflightNutritionRing(state.uleft, state);
    preflightNutritionRing(state.uright, state);

    const eatsNormally = Boolean(species.mflags1
        & (M1_CARNIVORE | M1_HERBIVORE | M1_METALLIVORE));
    const slowDigestion = propertyActive(state, SLOW_DIGESTION);
    const ordinaryLoss = eatsNormally && !slowDigestion ? 1 : 0;
    const regeneration = hungerProperty(state, REGENERATION);
    const regenerationLoss = (Math.trunc(regeneration.intrinsic ?? 0)
            & ~FROMFORM)
        || (Math.trunc(regeneration.extrinsic ?? 0) & ~(W_ARTI | W_WEP))
        ? 1 : 0;
    const capacity = env.nearCapacity(state);
    const oddLoss = ordinaryLoss + regenerationLoss
        + (capacity > SLT_ENCUMBER ? 1 : 0);
    const hungerLoss = propertyActive(state, HUNGER) ? 1 : 0;
    const conflict = hungerProperty(state, CONFLICT);
    const conflictLoss = conflict.intrinsic
        || (Math.trunc(conflict.extrinsic ?? 0) & ~W_ARTI) ? 1 : 0;
    const accessoryLoss = Math.max(
        slowDigestion
            && state.uright?.otyp !== RIN_SLOW_DIGESTION
            && state.uleft?.otyp !== RIN_SLOW_DIGESTION ? 1 : 0,
        ringConsumesNutrition(state.uleft, W_RINGL, state) ? 1 : 0,
        state.uamul && state.uamul.otyp !== FAKE_AMULET_OF_YENDOR ? 1 : 0,
        ringConsumesNutrition(state.uright, W_RINGR, state) ? 1 : 0,
        u.uhave?.amulet ? 1 : 0,
    );
    const evenLoss = ordinaryLoss + hungerLoss + conflictLoss + accessoryLoss;
    // An Unaware hero pays `ordinaryLoss` only when rn2(10) comes up 0, so
    // this over-states the loss for nine turns in ten. That is the safe
    // direction: it is an upper bound on what the turn can spend, and its only
    // job is to reject a turn whose worst case reaches an unported status.
    const maximumReachableLoss = Math.max(oddLoss, evenLoss);
    const earliestStatus = hungerStatus(
        u.uhunger - maximumReachableLoss,
    );
    const mayChangeStatus = earliestStatus !== u.uhs;
    const supported = supportedHungerTransition(earliestStatus);
    // newuhs()'s `newhs >= WEAK && u.uhs < WEAK` arm writes ATEMP(A_STR), and
    // its WEAK message reads the role and the race. Widening `<` to `<=` here
    // is equivalent for every well-formed state: it only adds the case where
    // the status does not move, and this guard rejects malformed input rather
    // than deciding any game behavior.
    if (earliestStatus === WEAK && u.uhs < WEAK
        && (!Array.isArray(u.atemp)
            || !Number.isInteger(u.atemp[A_STR])
            || !Number.isInteger(state.urole?.mnum)
            || !Number.isInteger(state.urace?.mnum))) {
        throw new Error(
            'weakness transition requires hero attributes, role, and race',
        );
    }
    // newuhs() resolves these at its own call sites; resolving them here as
    // well rejects a caller that cannot supply them before the rn2(20) draw
    // that decides whether the transition happens. Every transition newuhs()
    // takes rewrites the status line; only its HUNGRY and WEAK arms print a
    // message and end a run.
    if (mayChangeStatus && supported) {
        requireEatOperation(env, 'statusRefresh');
        if (earliestStatus === HUNGRY || earliestStatus === WEAK) {
            requireEatOperation(env, 'message');
            requireEatOperation(env, 'endRunning');
        }
    }

    // Use only costs reachable from the current form, properties, burden, and
    // equipment so harmless low-loss ticks are not rejected before their
    // source draw. gethungry() only spends nutrition, so every status the
    // rn2(20) branches can land on lies between u.uhs and earliestStatus, and
    // newuhs() owns all of them unless the worst case is FAINTING.
    if (mayChangeStatus && !supported) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
        );
    }

    return {
        capacity,
        conflictLoss,
        hungerLoss,
        ordinaryLoss,
        regenerationLoss,
        skipped: false,
        slowDigestion,
        unaware,
    };
}

// C ref: eat.c gethungry() and its live newuhs(TRUE) consumer. This owns the
// nutrition decision for an alert hero down to the WEAK status. Fainting and
// death remain fail-closed before any elapsed-turn mutation.
export async function gethungry(state = game, env = {}) {
    const plan = preflightGetHungry(state, env);
    if (plan.skipped) return 0;

    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function') {
        throw new TypeError('gethungry random injection requires rn2');
    }
    const {
        capacity,
        conflictLoss,
        hungerLoss,
        ordinaryLoss,
        regenerationLoss,
        slowDigestion,
        unaware,
    } = plan;
    const { u } = state;
    // C ref: eat.c gethungry():3172-3179. `ordinaryLoss` carries the three
    // form tests and Slow_digestion, which spend nothing; the rn2(10) that
    // precedes them does, and only for a hero who is asleep or fainted. C's
    // `||` short-circuits, so an alert hero never reaches the draw, and C
    // evaluates it ahead of the form tests, so a sleeping hero who could not
    // eat anyway still spends it.
    let nutritionLoss = (!unaware || !random.rn2(10)) ? ordinaryLoss : 0;

    const accessoryTime = random.rn2(20);
    if (accessoryTime % 2) {
        nutritionLoss += regenerationLoss;
        if (capacity > SLT_ENCUMBER) nutritionLoss++;
    } else {
        nutritionLoss += hungerLoss + conflictLoss;
        switch (accessoryTime) {
        case 0:
            if (slowDigestion
                && state.uright?.otyp !== RIN_SLOW_DIGESTION
                && state.uleft?.otyp !== RIN_SLOW_DIGESTION) {
                nutritionLoss++;
            }
            break;
        case 4:
            if (ringConsumesNutrition(state.uleft, W_RINGL, state))
                nutritionLoss++;
            break;
        case 8:
            if (state.uamul
                && state.uamul.otyp !== FAKE_AMULET_OF_YENDOR) {
                nutritionLoss++;
            }
            break;
        case 12:
            if (ringConsumesNutrition(state.uright, W_RINGR, state))
                nutritionLoss++;
            break;
        case 16:
            if (u.uhave?.amulet) nutritionLoss++;
            break;
        default:
            break;
        }
    }

    const nextNutrition = u.uhunger - nutritionLoss;
    const nextStatus = hungerStatus(nextNutrition);
    if (nextStatus !== u.uhs && !supportedHungerTransition(nextStatus)) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
        );
    }
    u.uhunger = nextNutrition;
    await newuhs(true, state, env);
    return nutritionLoss;
}

// C ref: eat.c eating_dangerous_corpse() (475-494). A temporary resistance
// must survive until the active corpse meal finishes or is interrupted.
export function eating_dangerous_corpse(res, state = game) {
    const food = state.context?.victual?.piece;
    if (state.go?.occupation === eatfood
        && food
        && food.otyp === CORPSE
        && food.corpsenm >= LOW_PM
        && (carried(food) || obj_here(food, state.u.ux, state.u.uy, state))) {
        const species = state.mons[food.corpsenm];
        if (res === ACID_RES && acidic(species)) return true;
        if (res === STONE_RES && flesh_petrifies(species)) return true;
    }
    return false;
}

export function nonrotting_corpse(mnum, state = game) {
    if (!ismnum(mnum)) return false;
    return mnum === PM_LIZARD
        || mnum === PM_LICHEN
        || mnum === PM_ACID_BLOB
        || is_rider(state.mons?.[mnum]);
}

function vegan(monster) {
    return monster.mlet === S_BLOB
        || monster.mlet === S_JELLY
        || monster.mlet === S_FUNGUS
        || monster.mlet === S_VORTEX
        || monster.mlet === S_LIGHT
        || (monster.mlet === S_ELEMENTAL && monster.pmidx !== PM_STALKER)
        || (monster.mlet === S_GOLEM
            && monster.pmidx !== PM_FLESH_GOLEM
            && monster.pmidx !== PM_LEATHER_GOLEM)
        || monster.mlet === S_GHOST;
}

export function vegetarian(monster) {
    return vegan(monster)
        || (monster.mlet === S_PUDDING
            && monster.pmidx !== PM_BLACK_PUDDING);
}

// C ref: eat.c eating_conducts() (576-599).  The helper is used by the
// mind-flayer brain attack and by start_tin(); those callers remain explicit
// unsupported boundaries until their surrounding effects are ported.  Keep
// this helper source-complete so both callers can share the conduct state and
// first-event suppression when they are admitted.
export async function eating_conducts(pd, state = game) {
    const u = state.u;
    u.uconduct ??= {};
    let ll_conduct = 0;
    const name = pd?.pmnames?.[NEUTRAL] ?? '';

    if (!(u.uconduct.food ?? 0)) {
        livelog_printf(LL_CONDUCT, `ate for the first time - ${name}`, state);
        ll_conduct++;
    }
    u.uconduct.food = Math.trunc(u.uconduct.food ?? 0) + 1;

    if (!vegan(pd)) {
        if (!(u.uconduct.unvegan ?? 0) && !ll_conduct) {
            livelog_printf(
                LL_CONDUCT,
                `consumed animal products (${name}) for the first time`,
                state,
            );
            ll_conduct++;
        }
        u.uconduct.unvegan = Math.trunc(u.uconduct.unvegan ?? 0) + 1;
    }
    if (!vegetarian(pd)) {
        if (!(u.uconduct.unvegetarian ?? 0) && !ll_conduct)
            livelog_printf(
                LL_CONDUCT,
                `tasted meat (${name}) for the first time`,
                state,
            );
        await violated_vegetarian(state);
    }
}

// C ref: eat.c tin_details(). Appends the contents to a tin's name; the
// caller supplies the name xname() built so far.
export function tin_details(obj, mnum, base, env = {}) {
    const normalized = tinEnv(env);
    const variety = tin_variety(obj, normalized, true);
    if (variety === SPINACH_TIN) return `${base} of spinach`;
    if (mnum === NON_PM) return 'empty tin';

    let text;
    if ((obj.cknown || normalized.state.iflags?.override_ID) && obj.spe < 0) {
        const word = TIN_VARIETIES[variety].name;
        // C puts these two before the word "tin" and the rest after it.
        text = (variety === ROTTEN_TIN || variety === HOMEMADE_TIN)
            ? `${word} ${base} of `
            : `${base} of ${word} `;
    } else {
        text = `${base} of `;
    }
    const monster = normalized.state.mons[mnum];
    const name = monster.pmnames[NEUTRAL];
    return text + (vegetarian(monster) ? name : `${name} meat`);
}

export function set_tin_variety(obj, forcetype, env = {}) {
    const normalized = tinEnv(env);
    const { random, state } = normalized;
    const mnum = obj.corpsenm;
    const monster = ismnum(mnum) ? state.mons?.[mnum] : null;

    if (forcetype === SPINACH_TIN
        || (forcetype === HEALTHY_TIN
            && (mnum === NON_PM || !monster || !vegetarian(monster)))) {
        obj.corpsenm = NON_PM;
        obj.spe = 1;
        return;
    }

    let variety;
    if (forcetype === HEALTHY_TIN) {
        variety = tin_variety(obj, normalized);
        if (variety < 0 || variety >= TIN_VARIETY_COUNT)
            variety = ROTTEN_TIN;
        while ((variety === ROTTEN_TIN && !obj.cursed)
               || !TIN_VARIETIES[variety].healthFood) {
            variety = random.rn2(TIN_VARIETY_COUNT);
        }
    } else if (forcetype >= 0 && forcetype < TIN_VARIETY_COUNT) {
        variety = forcetype;
    } else {
        // C's final arm covers RANDOM_TIN and every other value outside the
        // explicit forced varieties; it does not reject an unknown value.
        variety = random.rn2(TIN_VARIETY_COUNT);
        if (variety === ROTTEN_TIN
            && nonrotting_corpse(mnum, state)) {
            variety = HOMEMADE_TIN;
        }
    }
    obj.spe = -(variety + 1);
}

// C ref: eat.c tin_variety() (1489-1510). `displ` means the caller is only
// formatting a name, which skips the homemade-tin spoilage draw.
function tin_variety(obj, env, displ = false) {
    const { random, state } = env;
    let variety;
    if (obj.spe === 1) variety = SPINACH_TIN;
    else if (obj.cursed) variety = ROTTEN_TIN;
    else if (obj.spe < 0) variety = -obj.spe - 1;
    else variety = random.rn2(TIN_VARIETY_COUNT);

    if (!displ && variety === HOMEMADE_TIN && !obj.blessed
        && !random.rn2(7)) {
        variety = ROTTEN_TIN;
    }
    if (variety === ROTTEN_TIN
        && nonrotting_corpse(obj.corpsenm, state)) {
        variety = HOMEMADE_TIN;
    }
    return variety;
}

// C ref: eat.c use_up_tin() (1516-1526). This resets only the tin pointer and
// id; reqtime and usedtime belong to the same persistent svc.context.tin.
async function use_up_tin(tin, state = game) {
    if (carried(tin))
        useup(tin, { state });
    else
        await useupf(tin, 1, { state });
    const context = tinContext(state);
    context.tin = null;
    context.o_id = 0;
}

// C ref: eat.c consume_tin() (1528-1700). `env` supplies the display and
// hunger-clock operations used by the ordinary #eat caller and its occupation.
async function consume_tin(mesg, state = game, env = {}) {
    const context = tinContext(state);
    let tin = context.tin;
    const { random } = tinEnv({ ...env, state });
    const eatEnv = env.message ? env : eatOperations(
        state, env.statusRefresh, env.message,
    );
    const message = eatEnv.message ?? ttyPline;
    const hero = state.youmonst?.data ?? state.mons?.[state.u?.umonnum];
    const alwaysEat = metallivorous(hero);
    const variety = tin_variety(tin, tinEnv({ ...env, state }));

    if (tin.otrapped
        || (tin.cursed && variety !== HOMEMADE_TIN && !random.rn2(8))) {
        // trap.c b_trapped() is a discarded void call and remains unported.
        note_unported('trap.c b_trapped');
        tin = costly_tin(COST_DSTROY, state);
        await use_up_tin(tin, state);
        return;
    }

    await message(mesg, state);
    if (variety !== SPINACH_TIN) {
        const monsterNumber = tin.corpsenm;
        if (monsterNumber === NON_PM) {
            if (Hallucination(state)) {
                await message(`It's full of ${random.rn2(2)
                    ? 'air elemental souffle' : 'dehydrated water'}.`, state);
            } else {
                await message('It turns out to be empty.', state);
            }
            observe_object(tin, state);
            tin.known = true;
            tin = costly_tin(COST_OPEN, state);
            await use_up_tin(tin, state);
            if (alwaysEat) await lesshungry(5, state, eatEnv);
            return;
        }

        let what;
        let which = 0; // 0 pluralizes, 1 leaves a proper name alone, 2 adds the.
        const monster = state.mons[monsterNumber];
        if ((monsterNumber === PM_COCKATRICE
            || monsterNumber === PM_CHICKATRICE)
            && (propertyActive(state, STONE_RES) || Hallucination(state))) {
            what = 'chicken';
            which = 1;
        } else if (Hallucination(state)) {
            what = rndmonnam({ state });
        } else {
            what = monster.pmnames[NEUTRAL];
            if (the_unique_pm(monster)) which = 2;
            else if (type_is_pname(monster)) which = 1;
        }
        if (which === 0) what = makeplural(what);
        else if (which === 2) what = the(what, state);

        if (!alwaysEat) {
            await message(`It smells like ${what}.`, state);
            if (await y_n('Eat it?', state) === 'n'.charCodeAt(0)) {
                if (state.flags?.verbose)
                    await message('You discard the open tin.', state);
                if (!Hallucination(state)) {
                    observe_object(tin, state);
                    tin.known = true;
                }
                tin = costly_tin(COST_OPEN, state);
                await use_up_tin(tin, state);
                return;
            }
        }

        // C clears the previous victual before corpse effects can install a
        // new activity or remove the tin from its context.
        state.context.victual = zero_victual();
        await message(
            `You consume ${TIN_VARIETIES[variety].name} ${monster.pmnames[NEUTRAL]}.`,
            state,
        );
        await eating_conducts(monster, state);
        observe_object(tin, state);
        tin.known = true;
        tin = context.tin = costly_tin(COST_OPEN, state);
        // eat.c discards both void results. These existing same-file helpers
        // remain partial for species-specific corpse effects, so do not expose
        // their refusal placeholders from the new tin entry point.
        note_unported('eat.c cprefx');
        if (context.tin) note_unported('eat.c cpostfx');
        if (!context.tin) return;

        if (TIN_VARIETIES[variety].nutrition < 0) {
            // C evaluates rn1() before calling the still-unported void effect.
            random.rn1(15, 10);
            note_unported('potion.c make_vomiting');
        } else {
            let nutrition = TIN_VARIETIES[variety].nutrition;
            if (variety === HOMEMADE_TIN
                && nutrition > monster.cnutrit) {
                nutrition = monster.cnutrit;
            }
            if (alwaysEat) nutrition += 5;
            await use_up_tin(tin, state);
            tin = null;
            await lesshungry(nutrition, state, eatEnv);
        }

        if (TIN_VARIETIES[variety].greasy) {
            const glib = (state.u.uprops[GLIB]?.intrinsic ?? 0) & TIMEOUT;
            await make_glib(glib + random.rn1(11, 5), state, eatEnv);
            await message(
                `Eating ${TIN_VARIETIES[variety].name} food made your `
                    + `${fingers_or_gloves(true, state)} `
                    + `${glib ? 'even more' : 'very'} slippery.`,
                state,
            );
        }
    } else {
        if (tin.cursed) {
            const blind = heroIsBlind(state);
            const color = blind ? '' : ` ${hcolor('green', state)}`;
            await message(`It contains some decaying${color} substance.`, state);
        } else {
            await message('It contains spinach.', state);
            observe_object(tin, state);
            tin.known = true;
        }

        if (!alwaysEat && await y_n('Eat it?', state) === 'n'.charCodeAt(0)) {
            if (state.flags?.verbose)
                await message('You discard the open tin.', state);
            tin = costly_tin(COST_OPEN, state);
            await use_up_tin(tin, state);
            return;
        }

        const conduct = state.u.uconduct ??= {};
        if (!(conduct.food ?? 0)) {
            livelog_printf(LL_CONDUCT, 'ate for the first time (spinach)', state);
        }
        conduct.food = Math.trunc(conduct.food ?? 0) + 1;
        if (!tin.cursed) {
            const fixed = Boolean(state.u.uprops[FIXED_ABIL]?.extrinsic);
            const feeling = Hallucination(state)
                ? "Swee'pea"
                : !fixed ? 'Popeye'
                    : state.flags?.female ? 'Olive Oyl' : 'Bluto';
            await message(`This makes you feel like ${feeling}!`, state);
        }
        await gainstr(tin, 0, false, state, {
            message,
            encumberMessage: (target) => encumber_msg(target, { message }),
        });

        tin = context.tin = costly_tin(COST_OPEN, state);
        let nutrition;
        if (tin.blessed) nutrition = 600;
        else if (!tin.cursed) nutrition = 400 + random.rnd(200);
        else nutrition = 200 + random.rnd(400);
        if (alwaysEat) nutrition += 5;
        await use_up_tin(tin, state);
        tin = null;
        await lesshungry(nutrition, state, eatEnv);
    }

    if (tin) await use_up_tin(tin, state);
}

// C ref: eat.c opentin() (1703-1720). Each occupation turn advances usedtime
// before checking the required delay, and a completed opening clears only the
// object pointer/id through consume_tin()->use_up_tin().
async function opentin(state = game, env = {}) {
    const context = tinContext(state);
    if (!carried(context.tin)
        && (!obj_here(context.tin, state.u.ux, state.u.uy, state)
            || !(await can_reach_floor(true, state)))) {
        return 0;
    }
    if (context.usedtime++ >= 50) {
        await (env.message ?? ttyPline)(
            'You give up your attempt to open the tin.', state,
        );
        return 0;
    }
    if (context.usedtime < context.reqtime) return 1;
    await consume_tin('You succeed in opening the tin.', state, env);
    return 0;
}

// C ref: eat.c start_tin() (1723-1800). Opening time is the C source's
// weapon-specific delay or its integer-strength unarmed delay. The occupation
// closure reads the same context object on every later turn.
async function start_tin(otmp, state = game, env = {}) {
    const random = tinEnv({ ...env, state }).random;
    const message = env.message ?? ttyPline;
    let mesg = null;
    let tmp;
    const hero = state.youmonst?.data ?? state.mons?.[state.u.umonnum];

    if (metallivorous(hero)) {
        mesg = 'You bite right into the metal tin...';
        tmp = 0;
    } else if (cantwield(hero)) {
        await message('You cannot handle the tin properly to open it.', state);
        return;
    } else if (otmp.blessed) {
        tmp = state.uwep?.otyp === TIN_OPENER && state.uwep.blessed
            ? 0 : random.rn2(2);
        if (!tmp) mesg = 'The tin opens like magic!';
        else await message('The tin seems easy to open.', state);
    } else if (state.uwep) {
        const opener = state.uwep;
        switch (opener.otyp) {
        case TIN_OPENER:
            mesg = 'You easily open the tin.';
            tmp = random.rn2(opener.cursed ? 3 : !opener.blessed ? 2 : 1);
            break;
        case DAGGER:
        case SILVER_DAGGER:
        case ELVEN_DAGGER:
        case ORCISH_DAGGER:
        case ATHAME:
        case KNIFE:
        case STILETTO:
        case CRYSKNIFE:
            tmp = 3;
            break;
        case PICK_AXE:
        case AXE:
            tmp = 6;
            break;
        default:
            tmp = undefined;
            break;
        }
        if (tmp === undefined) {
            await message('It is not so easy to open this tin.', state);
            if (state.u.uprops[GLIB]?.intrinsic) {
                await message(
                    `The tin slips from your ${fingers_or_gloves(false, state)}.`,
                    state,
                );
                if ((otmp.quan ?? 1) > 1)
                    otmp = splitobj(otmp, 1, { state });
                if (carried(otmp)) await dropx(otmp, { state });
                else stackobj(otmp, { state });
                return;
            }
            const dexterity = acurr(state, A_DEX);
            tmp = random.rn1(
                1 + Math.trunc(500 / (dexterity + acurrstr(state))), 10,
            );
        } else {
            await message(
                `Using ${xnameFresh(opener, state)} you try to open the tin.`,
                state,
            );
        }
    } else {
        await message('It is not so easy to open this tin.', state);
        if (state.u.uprops[GLIB]?.intrinsic) {
            await message(
                `The tin slips from your ${fingers_or_gloves(false, state)}.`,
                state,
            );
            if ((otmp.quan ?? 1) > 1)
                otmp = splitobj(otmp, 1, { state });
            if (carried(otmp)) await dropx(otmp, { state });
            else stackobj(otmp, { state });
            return;
        }
        const dexterity = acurr(state, A_DEX);
        tmp = random.rn1(
            1 + Math.trunc(500 / (dexterity + acurrstr(state))), 10,
        );
    }

    const context = tinContext(state);
    context.tin = otmp;
    context.o_id = otmp.o_id;
    if (!tmp) {
        await consume_tin(mesg, state, env);
    } else {
        context.reqtime = tmp;
        context.usedtime = 0;
        set_occupation((occupationState, occupationEnv = {}) => opentin(
            occupationState,
            { ...env, ...occupationEnv, state: occupationState },
        ), 'opening the tin', 0, state);
    }
}

// C ref: eat.c tinopen_ok() (3086-3093). This pure getobj callback accepts a
// tin and excludes every other inventory object.
export function tinopen_ok(obj) {
    return obj?.otyp === TIN ? GETOBJ_SUGGEST : GETOBJ_EXCLUDE;
}

// C ref: eat.c use_tin_opener() (3098-3127). Its object argument is the
// TIN_OPENER selected by apply.c doapply(); a second getobj() selects the tin.
export async function use_tin_opener(obj, state = game, env = {}) {
    if (!carrying(TIN, state)) {
        await (env.message ?? ttyPline)('You have no tin to open.', state);
        return ECMD_OK;
    }

    let result = ECMD_OK;
    if (obj !== state.uwep) {
        if (obj.cursed && obj.bknown) {
            const qbuf = safe_qbuf(
                'Really wield ', '?', obj, donameFresh, ansimpleoname,
                'that', state,
            );
            if (await yn_function(qbuf, 'ynq', 'n', true, state)
                !== 'y'.charCodeAt(0)) {
                return ECMD_OK;
            }
        }
        if (!await wield_tool(obj, 'use', state)) return ECMD_OK;
        result = ECMD_TIME;
    }

    const tin = await getobj('open', tinopen_ok, GETOBJ_NOFLAGS, state);
    if (!tin) return result | ECMD_CANCEL;
    await start_tin(tin, state, env);
    return ECMD_TIME;
}

// ---------------------------------------------------------------------------
// The meal in progress.
// ---------------------------------------------------------------------------

// C ref: youprop.h Hallucination (120). Its positive term is HHallucination
// (116), the intrinsic alone -- "Hallucination is solely a timeout" (115) --
// while Halluc_resistance (119) is the intrinsic or the extrinsic.
function Hallucination(state) {
    return Boolean(hungerProperty(state, HALLUC).intrinsic)
        && !propertyActive(state, HALLUC_RES);
}

// C ref: eat.c nonrotting_food() (64-66). Fortune cookies are handled by the
// separate otyp test beside this macro's only call site.
export function nonrotting_food(otyp) {
    return otyp === LEMBAS_WAFER || otyp === CRAM_RATION;
}

// C ref: eat.c foodwords[] (2490-2495). Indexed by oc_material; each entry
// gives the food-category name for that material.
const foodwords = Object.freeze([
    'meal',    'liquid',  'wax',       'food', 'meat',     'paper',
    'cloth',   'leather', 'wood',      'bone', 'scale',    'metal',
    'metal',   'metal',   'silver',    'gold', 'platinum', 'mithril',
    'plastic', 'glass',   'rich food', 'stone',
]);

// C ref: eat.c foodword() (2497-2506). Returns a material-based food name.
// For glass gems whose description is known, discovers the object type.
function foodword(otmp, state) {
    if (otmp.oclass === FOOD_CLASS)
        return 'food';
    if (otmp.oclass === GEM_CLASS
        && objectType(otmp, state).oc_material === GLASS
        && otmp.dknown) {
        discover_object(otmp.otyp, true, true, true, state);
    }
    return foodwords[objectType(otmp, state).oc_material];
}

// C ref: eat.c Hear_again() (1800-1809). The ga.afternmv callback after
// rotten-food fainting.  50% chance to clear timed deafness; always returns 0.
async function Hear_again(state) {
    /* Chance of deafness going away while fainted/sleeping/etc. */
    if (!rn2(2)) {
        await make_deaf(0, false, state);
        state.disp ??= {};
        state.disp.botl = true;
    }
    return 0;
}

// C ref: eat.c rottenfood() (1812-1851). Prints "Blecch!" and applies one
// of three effects through a cascading rn2 test: confusion (rn2(4)),
// blindness (rn2(4), only if not blind), or fainting (rn2(3)).  Returns 1
// when the hero faints (skipping start_eating), 0 otherwise.
async function rottenfood(obj, state) {
    const u = state.u;

    await ttyPline(
        `Blecch!  ${is_rottable(obj, state) ? 'Rotten' : 'Awful'} ${
            foodword(obj, state)}!`,
        state,
    );

    if (!rn2(4)) {
        // Confusion arm.
        if (Hallucination(state))
            await ttyPline('You feel rather trippy.', state);
        else
            await ttyPline(
                `You feel rather ${body_part(LIGHT_HEADED, state.youmonst)}.`,
                state,
            );
        await make_confused(
            (hungerProperty(state, CONFUSION).intrinsic & 0x00FFFFFF)
                + d(2, 4),
            false,
            state,
        );
    } else if (!rn2(4) && !heroIsBlind(state)) {
        // Blindness arm.  The hero is not Blind, but BlindedTimeout might
        // be nonzero if blindness is being overridden by Eyes of the Overworld.
        const blindedProp = state.u.uprops[BLINDED];
        const blindedTimeout = (blindedProp?.intrinsic ?? 0) & 0x00FFFFFF;
        await ttyPline('Everything suddenly goes dark.', state);
        await make_blinded(blindedTimeout + d(2, 10), false, state);
        if (!heroIsBlind(state))
            await ttyPline('Your vision quickly clears.', state);
    } else if (!rn2(3)) {
        // Fainting arm.
        const duration = rnd(10);
        let what, where;

        if (!heroIsBlind(state)) {
            what = 'goes';
            where = 'dark';
        } else if (Levitation(state)
                   || Is_airlevel(u.uz) || Is_waterlevel(u.uz)) {
            what = 'you lose control of';
            where = 'yourself';
        } else {
            what = 'you slap against the';
            where = u.usteed ? 'saddle' : surface(u.ux, u.uy, state);
        }
        await ttyPline(
            `The world spins and ${what} ${where}.`, state,
        );
        incr_itimeout(hungerProperty(state, DEAF), duration);
        state.disp ??= {};
        state.disp.botl = true;
        nomul(-duration, state);
        state.multi_reason = 'unconscious from rotten food';
        state.nomovemsg = 'You are conscious again.';
        state.afternmv = Hear_again;
        return 1;
    }
    return 0;
}

// C ref: context.h struct victual_info (59-76) and eat.c's file-scope
// `zero_victual` (75). One meal's whole state lives here, at
// state.context.victual, beside the rest of the flattened svc.context:
//
//   * doeat() writes piece, o_id and usedtime when it has a food to eat, and
//     reqtime, nmod and canchoke once it knows how long the meal takes;
//   * start_eating() writes fullwarn, eating and doreset, and counts usedtime
//     up for the first bite;
//   * eatfood() counts usedtime up once for every later turn of the meal;
//   * lesshungry() raises fullwarn once its nearly-full warning has printed,
//     which is what stops a later bite repeating it;
//   * bite() lowers reqtime through consume_oeaten() when the food runs out;
//   * done_eating() returns every field to zero after the last bite, and
//     food_disappears() does the same when the object is deleted from under
//     an unfinished meal.
//
// Nothing else writes it. C zeroes the whole of svc.context at startup; this
// port builds state.context field by field, as js/obj.js clear_splitobjs()
// already does for context.objsplit, so state.context.victual appears when
// doeat() first needs it. Until then there is no meal, and food_disappears()
// -- the one reader that can run before any meal -- reads the absent field as
// the zeroed struct it stands for rather than creating one.
export function zero_victual() {
    return {
        piece: null,
        o_id: 0,
        usedtime: 0,
        reqtime: 0,
        nmod: 0,
        canchoke: 0,
        fullwarn: 0,
        eating: 0,
        doreset: 0,
    };
}

function victual(state) {
    state.context ??= {};
    state.context.victual ??= zero_victual();
    return state.context.victual;
}

// C ref: the `go.occupation == eatfood` test eat.c makes in eight places.
// eatfood() below is the callback cmd.c set_occupation() installs, so this
// answers "a meal of more than one turn is in progress". It is deliberately
// not the same question as svc.context.victual.eating, which start_eating()
// raises one bite earlier and do_reset_eat() lowers on an interruption.
function eating_occupation(state) {
    return state.go?.occupation === eatfood;
}

// C ref: eat.c eating_glob() (2078-2081). True when the hero's multi-turn
// meal is in progress and the piece being eaten is this glob.
export function eating_glob(glob, state = game) {
    return eating_occupation(state) && glob === victual(state).piece;
}

// C ref: eat.c food_xname() (215-235), ``[the(] singular(food, xname) [)]''.
function food_xname(food, the_pfx, state) {
    let prefix_the = the_pfx;
    let result;

    if (food.otyp === CORPSE) {
        result = corpse_xname(
            food,
            null,
            CXN_SINGULAR | (prefix_the ? CXN_PFX_THE : 0),
            state,
        );
        /* not strictly needed since pname values are capitalized
           and the() is a no-op for them */
        if (type_is_pname(state.mons[food.corpsenm]))
            prefix_the = false;
    } else {
        /* the ordinary case */
        result = singular(food, xnameFresh, state);
    }
    return prefix_the ? the(result, state) : result;
}

// C ref: eat.c obj_nutrition() (322-334).
export function obj_nutrition(otmp, state = game) {
    if (otmp.otyp === CORPSE)
        return Math.trunc(state.mons[otmp.corpsenm].cnutrit);
    if (otmp.globby) return Math.trunc(otmp.owt);
    return Math.trunc(objectType(otmp, state).oc_nutrition);
}

// C ref: eat.c eaten_stat() (3786-3805). Scales a whole food's weight or price
// down to the fraction that is left. mkobj.c weight() is the caller, and
// reaches it through the object env's eatenStat seam.
export function eaten_stat(base, obj, env = {}) {
    const state = env.state ?? game;
    const full_amount = obj_nutrition(obj, state);
    const uneaten_amt = Math.trunc(obj.oeaten);
    if (uneaten_amt > full_amount) {
        // C's impossible() clamps and carries on; reaching it means this port
        // has let oeaten outgrow the food, which is a defect rather than an
        // unported branch.
        throw new Error(
            `partly eaten food (${uneaten_amt}) more nutritious than `
            + `untouched food (${full_amount})`,
        );
    }
    const scaled = full_amount
        ? Math.trunc(base * uneaten_amt / full_amount)
        : 0;
    return scaled < 1 ? 1 : scaled;
}

// C ref: eat.c adj_victual_nutrition() (336-357). The nutrition one bite is
// worth, which two races read differently for the two foods they were made
// for. Only start_eating() and bite() call it, and only with nmod negative.
//
// C's maybe_polyd(is_elf(gy.youmonst.data), Race_if(PM_ELF)) uses the current
// form only when the completed food meal reaches this nutrition adjustment.
export function adj_victual_nutrition(state) {
    const otyp = victual(state).piece.otyp;
    let nut = -victual(state).nmod; /* convert 'nmod' to positive */
    if (nut <= 0)
        throw new Error('adj_victual_nutrition requires a negative nmod');
    if (otyp === LEMBAS_WAFER) {
        if (state.urace.mnum === PM_ELF)
            nut += Math.trunc((nut + 2) / 4); /* 800 -> 1000 */
        else if (state.urace.mnum === PM_ORC)
            nut -= Math.trunc((nut + 2) / 4); /* 800 -> 600 */
    } else if (otyp === CRAM_RATION) {
        if (state.urace.mnum === PM_DWARF)
            nut += Math.trunc((nut + 3) / 6); /* 600 -> 700 */
    }
    return Math.max(nut, 1);
}

// C ref: eat.c touchfood() (359-393). Splits one item off the stack, marks it
// partly eaten, and puts it back in inventory under its own letter so the rest
// of the stack stays untouched.
function touchfood(otmp, env) {
    const { state } = env;
    if (otmp.quan > 1) {
        // Only the inventory arm is reachable: floorfood() stops before it can
        // offer a floor object, so carried() is always true here.
        if (!carried(otmp)) {
            throw new UnsupportedEatError(
                'touchfood() splitting a stack on the floor',
            );
        }
        otmp = splitobj(otmp, 1, env);
    }

    if (!otmp.oeaten) {
        costly_alteration(otmp, COST_BITE, env);
        otmp.oeaten = obj_nutrition(otmp, state);
    }

    if (carried(otmp)) {
        freeinv(otmp, env);
        if (inv_cnt(false, state) >= INVLET_BASIC) {
            // A full pack drops the bite on the floor instead, through
            // sellobj_state() and dropy(); neither is ported, and the object
            // has already left inventory by now.
            throw new UnsupportedEatError(
                'touchfood() dropping a bite from a full pack',
            );
        }
        otmp = addinv_nomerge(otmp, env);
    }
    return otmp;
}

// C ref: eat.c food_disappears() (394-402). js/invent.js obfree() is its only
// caller and keeps the obj_stop_timers() half, where the timer hook resolves.
export function food_disappears(obj, state = game) {
    if (obj === state.context?.victual?.piece)
        state.context.victual = zero_victual();
}

// C ref: eat.c recalc_wt() (291-306).
function recalc_wt(env) {
    const piece = victual(env.state).piece;
    if (!piece) throw new Error('recalc_wt without piece');
    piece.owt = weight(piece, env);
}

// C ref: eat.c reset_eat() (308-319). Called when an event interrupts a meal.
// C only raises a flag here; the reset itself waits for bite(), which is why
// interrupting a meal on the turn it ends leaves nothing to reset.
export function reset_eat(state = game) {
    const meal = victual(state);
    if (meal.eating && !meal.doreset) meal.doreset = 1;
}

// C ref: eat.c consume_oeaten() (3806-3872). Lowers how much of the food is
// left, and never all the way to zero: an oeaten of 0 would restore the object
// to untouched, so the last bite leaves 1 and shortens the meal instead.
export function consume_oeaten(obj, amt, state = game) {
    if (!obj_nutrition(obj, state)) {
        // C's impossible(); a zero-nutrition food never reaches a bite here.
        throw new Error(
            `oeaten: attempting to set 0 nutrition food (${obj.otyp}) `
            + 'partially eaten',
        );
    }

    if (amt > 0) {
        /* bit shift to divide the remaining amount of food */
        obj.oeaten = Math.trunc(obj.oeaten) >>> amt;
    } else {
        /* simple decrement; value is negative so we actually add it */
        if (Math.trunc(obj.oeaten) > -amt) obj.oeaten += amt;
        else obj.oeaten = 0;
    }

    if (obj.oeaten === 0) {
        const meal = victual(state);
        if (obj === meal.piece) /* always true unless wishing */
            meal.reqtime = meal.usedtime;
        obj.oeaten = 1; /* smallest possible positive value */
    }
}

// C ref: eat.c maybe_finished_meal() (3876-3889). allmain.c stop_occupation()
// asks this before it prints, so a meal interrupted on the turn its last bite
// was taken ends with "You finish eating ..." rather than "You stop eating ...".
// consume_oeaten() above is the other producer of that state: it shortens
// reqtime to usedtime once the food runs out.
//
// C clears go.occupation before calling eatfood() so that done_eating() can
// take do_reset_eat()'s place, and eatfood() uses up victual.piece from there.
export async function maybe_finished_meal(stopping, state = game, env = {}) {
    /* in case consume_oeaten() has decided that the food is all gone */
    const meal = state.go?.occupation === eatfood ? victual(state) : null;
    if (meal && meal.usedtime >= meal.reqtime) {
        if (stopping) state.go.occupation = null; /* for do_reset_eat */
        /* eatfood() calls done_eating() to use up svc.context.victual.piece */
        await eatfood(state, env);
        return true;
    }
    return false;
}

// C ref: eat.c newuhs() (3361-3510). Recomputes the hunger status from the
// hero's nutrition and comments on it.
//
// Two hunger statuses are in play while a meal runs, which is what C's
// `static save_hs` and `saved_hs` are for: bite() raises force_save_hs so each
// mouthful updates u.uhs silently, and the first call after the meal restores
// the status the hero started it with, so the message describes the whole meal
// rather than one bite. C keeps the pair in function statics; this port keeps
// them on the game state, so a new game starts with neither set.
//
// `env` supplies message(), endRunning() and statusRefresh(), because the
// elapsed-turn caller substitutes silent versions of all three when it is
// dry-running a turn on a cloned state.
export async function newuhs(incr, state = game, env = {}) {
    const u = state.u;
    let newhs = hungerStatus(u.uhunger);

    // C ref: `if (go.occupation == eatfood || gf.force_save_hs)`. The first
    // term covers every turn of a multi-turn meal, including the once-per-turn
    // gethungry() call, which is why a meal that crosses a hunger boundary says
    // nothing until it ends. The second covers start_eating()'s first bite,
    // which C takes before it sets the occupation.
    if (eating_occupation(state) || state.force_save_hs) {
        if (!state.saved_hs) {
            state.save_hs = u.uhs;
            state.saved_hs = true;
        }
        u.uhs = newhs;
        return;
    }
    if (state.saved_hs) {
        u.uhs = state.save_hs;
        state.saved_hs = false;
    }

    if (newhs === FAINTING) {
        // The fainting and starvation arms need is_fainted(), stop_occupation(),
        // incr_itimeout(HDeaf), nomul() with afternmv, selftouch() and
        // done(STARVING), and the rn2(20 - uhunger/10) draw that picks between
        // them.
        throw new UnsupportedHungerTransitionError(
            'newuhs() fainting or starvation',
        );
    }

    if (newhs !== u.uhs) {
        if (newhs >= WEAK && u.uhs < WEAK) {
            /* temporary loss overrides Fixed_abil */
            u.atemp[A_STR] = -1;
        } else if (newhs < WEAK && u.uhs >= WEAK) {
            /* repair of loss also overrides Fixed_abil */
            u.atemp[A_STR] = 0;
        }

        if (newhs === HUNGRY || newhs === WEAK) {
            const message = requireEatOperation(env, 'message');
            const stopRunning = requireEatOperation(
                env,
                'endRunning',
            );
            await message(hungerTransitionMessage(newhs, incr, state), state);
            // C ref: `if (incr && go.occupation
            //          && (go.occupation != eatfood
            //              && go.occupation != opentin)) stop_occupation();`.
            // eatfood is the only occupation this port installs and C's own
            // condition excludes it, so the call cannot happen. It is also
            // unreachable from here for a second reason: the arm above returns
            // early while eatfood is running, so a meal never gets this far.
            stopRunning(state);
        }
        u.uhs = newhs;
        state.disp ??= {};
        state.disp.botl = true;
        await requireEatOperation(env, 'statusRefresh')(state);
        if (u.uhp < 1) {
            // C prints "You die from hunger and exhaustion." and calls
            // done(STARVING).
            throw new UnsupportedHungerTransitionError(
                'newuhs() death from hunger and exhaustion',
            );
        }
    }
}

// C ref: the HUNGRY and WEAK arms of newuhs()'s switch (3468-3496).
function hungerTransitionMessage(newhs, incr, state) {
    const u = state.u;
    const hallucinating = Hallucination(state);
    if (newhs === HUNGRY) {
        if (hallucinating) {
            return incr
                ? 'You are getting the munchies.'
                : 'You now have a lesser case of the munchies.';
        }
        return !incr ? 'You only feel hungry now.'
            : u.uhunger < 145 ? 'You feel hungry.'
                : 'You are beginning to feel hungry.';
    }
    if (hallucinating) {
        return incr
            ? 'The munchies are interfering with your motor capabilities.'
            : 'You still have the munchies.';
    }
    const specialRole = state.urole.mnum === PM_WIZARD
        || state.urole.mnum === PM_VALKYRIE;
    if (incr && (specialRole || state.urace.mnum === PM_ELF)) {
        return `${specialRole ? state.urole.name.m : 'Elf'} `
            + 'needs food, badly!';
    }
    return !incr ? 'You are still weak.'
        : u.uhunger < 45 ? 'You feel weak.'
            : 'You are beginning to feel weak.';
}

// C ref: eat.c morehungry() (3281-3285). Subtracts hunger and lets newuhs()
// comment on the result. Used by spell casting to charge for energy spent.
export async function morehungry(num, state, env) {
    state.u.uhunger -= num;
    await newuhs(true, state, env);
}

// C ref: eat.c vomit() (3736-3785). This is the ordinary, unpolymorphed hero
// continuation used by fountain.c's foul-water arm. The other arms are kept
// explicit boundaries: their C callees (make_sick(), ubreatheu(),
// altar_wrath(), and melt_ice()) are not ported, and dry-heaving has its own
// body-part message. Preflight all of them before nomul() so an unsupported
// form cannot leave a partial vomiting state behind.
export function vomit(state = game) {
    const hero = state.u;
    const species = state.youmonst?.data;

    if (!hero || !species)
        throw new UnsupportedEatError('vomit() without an initialized hero');
    if (Upolyd(hero))
        throw new UnsupportedEatError('vomit() for a polymorphed hero');
    if (cantvomit(species))
        throw new UnsupportedEatError('vomit() cantvomit() arm');
    if (hero.uprops?.[SICK]?.intrinsic
        || (hero.usick_type & SICK_VOMITABLE)) {
        throw new UnsupportedEatError('vomit() sickness arm');
    }
    if (hero.uhs >= FAINTING)
        throw new UnsupportedEatError('vomit() dry-heave arm');
    if ((state.multi ?? 0) !== 0)
        throw new UnsupportedEatError('vomit() while already multi-turn');
    if (attacktype_fordmg(species, AT_BREA, AD_ACID))
        throw new UnsupportedEatError('vomit() acid-breath arm');
    if (IS_ALTAR(state.level?.at(hero.ux, hero.uy)?.typ))
        throw new UnsupportedEatError('vomit() altar arm');
    if (acidic(species))
        throw new UnsupportedEatError('vomit() acidic-form arm');

    // C ref: eat.c:3759-3763. On the ordinary command path gm.multi is zero,
    // so nomul(-2) installs the vomiting delay and end_running() clears any
    // pending run/travel state before the reason and completion message are
    // stored.
    nomul(-2, state);
    state.multi_reason = 'vomiting';
    state.nomovemsg = You_can_move_again;
}

// C ref: eat.c lesshungry() (3287-3334). Adds a bite's nutrition and lets
// newuhs() comment on the result.
export async function lesshungry(num, state, env) {
    const u = state.u;
    const meal = victual(state);
    /* See comments in newuhs() for discussion on force_save_hs */
    // C ref: `(go.occupation == eatfood) || gf.force_save_hs`.
    const iseating = eating_occupation(state) || Boolean(state.force_save_hs);

    u.uhunger += num;
    if (u.uhunger >= 2000) {
        if (!iseating || meal.canchoke) {
            throw new UnsupportedEatError(
                'lesshungry() choking on an overfull stomach',
            );
        }
    } else if (u.uhunger >= 1500
        && !propertyActive(state, HUNGER)
        // C spells this `!eating || (eating && !fullwarn)`.
        && (!meal.eating || !meal.fullwarn)) {
        await requireEatOperation(env, 'message')(
            "You're having a hard time getting all of it down.",
            state,
        );
        state.nomovemsg = "You're finally finished.";
        if (!meal.eating) {
            // C sets gm.multi = -2, which paralyses the hero for two turns and
            // needs nomul()'s afternmv machinery. Only potion.c's fruit juice
            // reaches lesshungry() with no meal in progress, and no potion is
            // ported, so nothing can take this arm.
            throw new UnsupportedEatError(
                "lesshungry()'s nearly-full warning outside a meal",
            );
        }
        meal.fullwarn = 1;
        if (meal.canchoke && (meal.reqtime - meal.usedtime) > 1) {
            // paranoid_query(ParanoidEating, "Continue eating?") asks before
            // risking a choke, and reset_eat() abandons the meal on a refusal.
            // canchoke is set only when the hero was already SATIATED when the
            // meal began.
            throw new UnsupportedEatError(
                "lesshungry()'s paranoid_query() for continued eating",
            );
        }
    }
    await newuhs(false, state, env);
}

// C ref: eat.c bite() (3126-3161). One turn's worth of the meal: the nutrition
// it pays out, the food it uses up, and the weight that leaves. Returns 1 when
// the hero choked and survived, which no ported arm can answer yet.
async function bite(state, env) {
    const meal = victual(state);

    if (meal.canchoke && state.u.uhunger >= 2000) {
        // choke() prints, may kill through done(CHOKING), and is the only
        // producer of bite()'s nonzero result.
        throw new UnsupportedEatError('choke()');
    }
    if (meal.doreset) {
        // reset_eat() raises this when moveloop_core() interrupts a meal, so
        // reaching it needs doeat()'s already-partly-eaten arm to resume that
        // meal, which stops before it gets here.
        throw new UnsupportedEatError('do_reset_eat()');
    }
    state.force_save_hs = true;
    if (meal.nmod < 0) {
        await lesshungry(adj_victual_nutrition(state), state, env);
        consume_oeaten(meal.piece, meal.nmod, state); /* -= -nmod */
    } else if (meal.nmod > 0 && (meal.usedtime % meal.nmod)) {
        await lesshungry(1, state, env);
        consume_oeaten(meal.piece, -1, state); /* -= 1 */
    }
    state.force_save_hs = false;
    recalc_wt(env);
    return 0;
}

// C ref: eat.c CANNIBAL_ALLOWED() (51). The two starts whose heroes eat their
// own kind without penalty.
function CANNIBAL_ALLOWED(state) {
    return state.urole.mnum === PM_CAVE_DWELLER
        || state.urace.mnum === PM_ORC;
}

// C ref: eat.c maybe_cannibal() (756-787), "eating a corpse or egg of one's own
// species is usually naughty".
//
// C's `static long ate_brains` guards against charging one turn's digestion
// twice. It lives on the game state here, which js/gstate.js resetGame()
// replaces for every runSegment(), so a new game starts it absent; C starts it
// at 0, and neither value is a turn number, so the first meal's
// `svm.moves == ate_brains` test is false either way.
async function maybe_cannibal(pm, allowmsg, state) {
    const u = state.u;
    const fptr = state.mons[pm]; /* food type */

    /* when poly'd into a mind flayer, multiple tentacle hits in one
       turn cause multiple digestion checks to occur; avoid giving
       multiple luck penalties for the same attack */
    if (state.moves === state.ate_brains)
        return false;
    state.ate_brains = state.moves; /* ate_anything, not just brains... */

    /* non-cannibalistic heroes shouldn't eat own species ever
       and also shouldn't eat current species when polymorphed
       (even if having the form of something which doesn't care
       about cannibalism--hero's innate traits aren't altered) */
    if (!CANNIBAL_ALLOWED(state)) {
        const own_kind = your_race(fptr, state)
            || (Upolyd(u) && same_race(state.youmonst.data, fptr));

        if (!own_kind && ismnum(u.ulycn)) {
            // C's third disjunct is `were_beastie(pm) == u.ulycn`. were.c
            // were_beastie() has no port because js/u_init.js:368 writes NON_PM
            // into u.ulycn and nothing writes it again, so this disjunct has no
            // reachable input.
            throw new UnsupportedEatError('were_beastie()');
        }
        if (own_kind) {
            if (allowmsg) {
                if (Upolyd(u) && your_race(fptr, state)) {
                    await ttyPline(
                        'You have a bad feeling deep inside.', state,
                    );
                }
                await ttyPline(
                    'You cannibal!  You will regret this!', state,
                );
            }
            hungerProperty(state, AGGRAVATE_MONSTER).intrinsic |= FROMOUTSIDE;
            change_luck(-rn1(4, 2), state); /* -5..-2 */
            return true;
        }
    }
    return false;
}

// C ref: eat.c cprefx() (789-869), "called before a corpse is eaten": the
// cannibalism penalty and the corpses that act before the first bite rather
// than after the last one.
async function cprefx(pm, state) {
    await maybe_cannibal(pm, true, state);
    if (flesh_petrifies(state.mons[pm])) {
        if (!propertyActive(state, STONE_RES)) {
            // eatcorpse()'s `stoneable` stop already covers the hero this arm
            // turns to stone, so what is left needs polyself.c polymon() to
            // make a stone golem of them instead.
            throw new UnsupportedEatError('polymon() for a petrifying corpse');
        }
    }

    switch (pm) {
    case PM_LITTLE_DOG:
    case PM_DOG:
    case PM_LARGE_DOG:
    case PM_KITTEN:
    case PM_HOUSECAT:
    case PM_LARGE_CAT:
        /* cannibals are allowed to eat domestic animals without penalty */
        if (!CANNIBAL_ALLOWED(state)) {
            await ttyPline(
                'You feel that eating the '
                + `${state.mons[pm].pmnames[NEUTRAL]} was a bad idea.`,
                state,
            );
            hungerProperty(state, AGGRAVATE_MONSTER).intrinsic |= FROMOUTSIDE;
        }
        break;
    case PM_LIZARD:
        if (hungerProperty(state, STONED).intrinsic) {
            // fix_petrification() calls make_stoned(0L, ...), and nothing
            // ported makes the hero stoned in the first place.
            throw new UnsupportedEatError('fix_petrification()');
        }
        break;
    case PM_DEATH:
    case PM_PESTILENCE:
    case PM_FAMINE:
        // "Eating that is instantly fatal." then done(DIED), and on the far
        // side of life-saving exercise(A_WIS) and revive_corpse().
        throw new UnsupportedEatError('done(DIED) for a Rider corpse');
    case PM_GREEN_SLIME:
        // C's arm needs make_slimed() and delayed_killer(); eatcorpse()'s
        // `slimeable` stop covers every hero it runs for. What is left is a
        // hero already sliming, Unchanging or slimeproof, and that is exactly
        // when C's guard fails and control falls through to `default`.
        /* FALLTHROUGH */
    default:
        if (acidic(state.mons[pm])
            && hungerProperty(state, STONED).intrinsic) {
            throw new UnsupportedEatError('fix_petrification()');
        }
        break;
    }
}

// C ref: eat.c intrinsic_possible() (888-953), "returns TRUE iff a monster can
// give an intrinsic". C's debug-only ifdebugresist() calls expand to nothing.
export function intrinsic_possible(type, ptr) {
    switch (type) {
    case FIRE_RES:
        return (ptr.mconveys & MR_FIRE) !== 0;
    case SLEEP_RES:
        return (ptr.mconveys & MR_SLEEP) !== 0;
    case COLD_RES:
        return (ptr.mconveys & MR_COLD) !== 0;
    case DISINT_RES:
        return (ptr.mconveys & MR_DISINT) !== 0;
    case SHOCK_RES: /* shock (electricity) resistance */
        return (ptr.mconveys & MR_ELEC) !== 0;
    case POISON_RES:
        return (ptr.mconveys & MR_POISON) !== 0;
    case ACID_RES:
        return (ptr.mconveys & MR_ACID) !== 0;
    case STONE_RES:
        return (ptr.mconveys & MR_STONE) !== 0;
    case TELEPORT:
        return can_teleport(ptr);
    case TELEPORT_CONTROL:
        return control_teleport(ptr);
    case TELEPAT:
        return telepathic(ptr);
    default:
        /* res stays 0 */
        return false;
    }
}

// C ref: eat.c corpse_intrinsic() (1337-1372). Picks one of the intrinsics a
// species can convey, uniformly, in one pass: "a 1 in count chance of replacing
// the old choice with this one". -1 stands in for strength, and 0 for nothing.
export function corpse_intrinsic(ptr, random = { rn2 }) {
    /* Check the monster for all of the intrinsics.  If this
     * monster can give more than one, pick one to try to give
     * from among all it can give.
     */
    const conveys_STR = is_giant(ptr);
    let count = 0; /* number of possible intrinsics */
    let prop = 0; /* which one we will try to give */

    if (conveys_STR) {
        count = 1;
        prop = -1; /* use -1 as fake prop index for STR */
    }
    for (let i = 1; i <= LAST_PROP; i++) {
        if (!intrinsic_possible(i, ptr))
            continue;
        ++count;
        /* a 1 in count chance of replacing the old choice
           with this one, and a count-1 in count chance
           of keeping the old choice (note that 1 in 1 and
           0 in 1 are what we want for the first candidate) */
        if (!random.rn2(count))
            prop = i;
    }
    /* if strength is the only candidate, give it 50% chance */
    if (conveys_STR && count === 1 && !random.rn2(2))
        prop = 0;

    return prop;
}

// C ref: eat.c should_givit() (961-991). Monster intrinsic chances use the
// corpse species' level, with the killer bee and scorpion poison exception.
export function should_givit(type, ptr, random = { rn2 }) {
    let chance;
    if (type === POISON_RES) {
        const isFastPoison = ptr?.pmidx === PM_KILLER_BEE
            || ptr?.pmidx === PM_SCORPION;
        chance = isFastPoison && !random.rn2(4) ? 1 : 15;
    } else if (type === TELEPORT) {
        chance = 10;
    } else if (type === TELEPORT_CONTROL) {
        chance = 12;
    } else if (type === TELEPAT) {
        chance = 1;
    } else {
        chance = 15;
    }
    return (ptr?.mlevel ?? 0) > random.rn2(chance);
}

/*
 * C ref: eat.c eye_of_newt_buzz() (1103-1123).
 * Eating an eye of newt can give the player a small magical energy boost.
 */
async function eye_of_newt_buzz(state) {
    if (rn2(3) || 3 * state.u.uen <= 2 * state.u.uenmax) {
        const old_uen = state.u.uen;

        state.u.uen += rnd(3);
        if (state.u.uen > state.u.uenmax) {
            if (!rn2(3)) {
                state.u.uenmax++;
                if (state.u.uenmax > state.u.uenpeak)
                    state.u.uenpeak = state.u.uenmax;
            }
            state.u.uen = state.u.uenmax;
        }
        if (old_uen !== state.u.uen) {
            await ttyPline('You feel a mild buzz.', state);
            state.disp ??= {};
            state.disp.botl = true;
        }
    }
}

// C ref: eat.c cpostfx() (1127-1319), "called after a corpse is eaten".
//
// The `default` arm and the intrinsic check that follows it are ported; every
// species with an effect of its own stops, because each one changes hero state
// C would not let the meal skip. ge.eatmbuf and its eatmdone() cleanup belong
// to the mimic arm alone, so nothing reachable here can have left one behind.
async function cpostfx(pm, state) {
    let check_intrinsics = false;

    switch (pm) {
    case PM_WRAITH:
        throw new UnsupportedEatError('pluslvl() for a wraith corpse');
    case PM_HUMAN_WERERAT:
    case PM_HUMAN_WEREJACKAL:
    case PM_HUMAN_WEREWOLF:
        // set_ulycn() and retouch_equipment(2) at the end of cpostfx().
        throw new UnsupportedEatError('set_ulycn() for a were corpse');
    case PM_NURSE:
        // The full heal, make_blinded(0L, !u.ucreamed) and disp.botl.
        throw new UnsupportedEatError("cpostfx()'s nurse arm");
    case PM_STALKER:
        // set_itimeout(&HInvis, rn1(100, 50)) and self_invis_message(), then
        // the stun the bats share.
        throw new UnsupportedEatError("cpostfx()'s stalker arm");
    case PM_YELLOW_LIGHT:
    case PM_GIANT_BAT:
    case PM_BAT:
        // make_stunned() twice for the first two and once for the bat.
        throw new UnsupportedEatError('make_stunned() for a bat corpse');
    case PM_GIANT_MIMIC:
    case PM_LARGE_MIMIC:
    case PM_SMALL_MIMIC:
        // nomul() with an afternmv, the polyselfs conduct, and the object
        // appearance that makes the hero look like a pile of gold.
        throw new UnsupportedEatError("cpostfx()'s mimic arms");
    case PM_QUANTUM_MECHANIC:
        // The HFast toggle and its two messages.
        throw new UnsupportedEatError("cpostfx()'s quantum mechanic arm");
    case PM_LIZARD:
        // make_stunned() and make_confused() cap the two timeouts at 2, and
        // then the arm falls into the intrinsic check.
        throw new UnsupportedEatError("cpostfx()'s lizard arm");
    case PM_CHAMELEON:
    case PM_DOPPELGANGER:
    case PM_SANDESTIN: /* moot--they don't leave corpses */
    case PM_GENETIC_ENGINEER:
        // polyself() or, for an Unchanging hero, "You feel momentarily
        // different."
        throw new UnsupportedEatError('polyself() for a shapechanger corpse');
    case PM_DISPLACER_BEAST:
        // toggle_displacement() and incr_itimeout(&HDisplaced, d(6, 6)).
        throw new UnsupportedEatError("cpostfx()'s displacer beast arm");
    case PM_DISENCHANTER:
        // attrcurse() strips a random intrinsic.
        throw new UnsupportedEatError('attrcurse()');
    case PM_DEATH:
    case PM_PESTILENCE:
    case PM_FAMINE:
        // C confers nothing here because the hero was life-saved, but cprefx()
        // stops a Rider corpse before the meal starts.
        throw new UnsupportedEatError("cpostfx()'s Rider arm");
    case PM_MIND_FLAYER:
    case PM_MASTER_MIND_FLAYER:
        // The rn2(2) that decides between adjattrib(A_INT, 1) and falling
        // through to the intrinsic check.
        throw new UnsupportedEatError("cpostfx()'s mind flayer arms");
    default:
        check_intrinsics = true;
        break;
    }

    /* possibly convey an intrinsic */
    if (check_intrinsics) {
        const ptr = state.mons[pm];

        if (dmgtype(ptr, AD_STUN) || dmgtype(ptr, AD_HALU)
            || pm === PM_VIOLET_FUNGUS) {
            // "Oh wow!  Great stuff!" and make_hallucinated().
            throw new UnsupportedEatError('make_hallucinated()');
        }

        /* Eating magical monsters can give you some magical energy. */
        if (attacktype(ptr, AT_MAGC) || pm === PM_NEWT) {
            if (pm === PM_NEWT)
                await eye_of_newt_buzz(state);
            else
                throw new UnsupportedEatError('eye_of_newt_buzz()');
        }

        const tmp = corpse_intrinsic(ptr);

        /* if something was chosen, give it now (givit() might fail) */
        if (tmp === -1) {
            await gainstr(null, 0, true, state, {
                message: ttyPline,
                encumberMessage: (target) => encumber_msg(target),
            });
        } else if (tmp > 0) {
            // givit() weighs the monster's level against a per-intrinsic
            // chance in should_givit() and temp_givit(), and each intrinsic it
            // grants has its own message and its own timeout.
            throw new UnsupportedEatError(`givit() for intrinsic ${tmp}`);
        }
    } /* check_intrinsics */

    // C's `if (ismnum(catch_lycanthropy)) { set_ulycn(); retouch_equipment(2); }`
    // tail belongs to the three were arms above, which are the only writers of
    // that variable and all stop.
    await Promise.resolve();
}

// C ref: eat.c violated_vegetarian() (1375-1384). Both callers -- doeat()'s
// FLESH arm and eatcorpse() -- reach it for any food that is not vegetarian.
async function violated_vegetarian(state) {
    state.u.uconduct.unvegetarian++;
    if (state.urole.mnum === PM_MONK) {
        await ttyPline('You feel guilty.', state);
        adjalign(-1, state);
    }
}

// C ref: eat.c eatcorpse()'s palatable_msgs[] (1985-1990). The first character
// picks the verb: T for "tastes ...", I for "is ...". "veggies are always just
// okay", so a vegetarian corpse always takes index 0 and draws nothing.
const PALATABLE_MSGS = Object.freeze([
    'Tokay', 'Istringy', 'Igamey', 'Ifatty', 'Itough',
]);

// C ref: eat.c eatcorpse() (1853-2018). Everything a corpse settles before the
// meal starts: the conducts it breaks, how far it has rotted, the harm it does,
// how many turns it takes and what it tastes like. Answers 0 to eat normally,
// 1 to skip start_eating(), and 2 when the corpse is gone.
async function eatcorpse(otmp, state) {
    const u = state.u;
    let retcode = 0;
    let tp = 0;
    const mnum = otmp.corpsenm;
    let rotted = 0;
    const uptr = state.youmonst.data;
    const glob = Boolean(otmp.globby);
    const slimeable = mnum === PM_GREEN_SLIME
        && !hungerProperty(state, SLIMED).intrinsic
        && !propertyActive(state, UNCHANGING)
        && !slimeproof(uptr);

    if (!ismnum(mnum))
        throw new Error(`eatcorpse: corpsenm ${mnum} is not a monster`);
    const corpse = state.mons[mnum];
    const stoneable = flesh_petrifies(corpse)
        && !propertyActive(state, STONE_RES)
        && !poly_when_stoned(uptr, state);

    if (glob) {
        // A glob's nutrition and delay come from its own owt rather than the
        // species, it shrinks on a timer instead of rotting, and eating_glob()
        // ties that timer to the meal.
        throw new UnsupportedEatError('eatcorpse() for a glob');
    }
    if (slimeable) {
        // cprefx()'s green slime arm: make_slimed() and delayed_killer().
        throw new UnsupportedEatError('make_slimed() for a green slime corpse');
    }
    if (stoneable) {
        // cprefx() turns this hero to stone through done(STONING).
        throw new UnsupportedEatError('done(STONING) for a petrifying corpse');
    }

    /* KMH, conduct */
    // C's local ll_conduct suppresses the meat event only when the same
    // corpse also establishes the first animal-products conduct.
    let ll_conduct = 0;
    u.uconduct ??= {};
    if (!vegan(corpse)) {
        if (!(u.uconduct.unvegan ?? 0)) {
            livelog_printf(
                LL_CONDUCT,
                `consumed animal products for the first time, by eating ${an(food_xname(otmp, false, state))}`,
                state,
            );
            ll_conduct++;
        }
        u.uconduct.unvegan = Math.trunc(u.uconduct.unvegan ?? 0) + 1;
    }
    if (!vegetarian(corpse)) {
        if (!(u.uconduct.unvegetarian ?? 0) && !ll_conduct)
            livelog_printf(
                LL_CONDUCT,
                `tasted meat for the first time, by eating ${an(food_xname(otmp, false, state))}`,
                state,
            );
        await violated_vegetarian(state);
    }

    if (!nonrotting_corpse(mnum, state)) {
        const age = peek_at_iced_corpse_age(otmp, state);

        rotted = Math.trunc((state.moves - age) / (10 + rn2(20)));
        if (otmp.cursed)
            rotted += 2;
        else if (otmp.blessed)
            rotted -= 2;
    }

    /* 5.0: globs don't become tainted, they shrink away */
    if (!glob && !stoneable && !slimeable && rotted > 5) {
        // The tainted arm: maybe_cannibal(mnum, FALSE), "Ulch - that %s was
        // tainted%s!", and then make_sick() with an rn1(10, 10) timeout unless
        // the hero resists sickness.
        throw new UnsupportedEatError('make_sick() for a tainted corpse');
    } else if (acidic(corpse) && !propertyActive(state, ACID_RES)) {
        tp++;
        /* not body_part() */
        await ttyPline('You have a very bad case of stomach acid.', state);
        await losehp(
            rnd(15),
            !glob ? 'acidic corpse' : 'acidic glob',
            KILLED_BY_AN,
            state,
        ); /* acid damage */
    } else if (poisonous(corpse) && rn2(5)) {
        tp++;
        await ttyPline('Ecch - that must have been poisonous!', state);
        if (!propertyActive(state, POISON_RES)) {
            // attrib.c poison_strdmg() takes hack.c losehp() and, through
            // adjattrib(), pickup.c encumber_msg() from its caller; both
            // files import attrib.js, so attrib.js cannot import them back.
            await poison_strdmg(
                rnd(4), rnd(15),
                !glob ? 'poisonous corpse' : 'poisonous glob',
                KILLED_BY_AN,
                state,
                {
                    losehp: (n, killerName, killerFormat) =>
                        losehp(n, killerName, killerFormat, state),
                    encumberMessage: (target) => encumber_msg(target),
                },
            );
        } else {
            await ttyPline('You seem unaffected by the poison.', state);
        }

    /* now any corpse left too long will make you mildly ill */
    } else if ((rotted > 5 || (rotted > 3 && rn2(5)))
               && !sickResistance(state)) {
        tp++;
        await ttyPline(
            `${hungerProperty(state, SICK).intrinsic ? 'You feel very sick.'
                : 'You feel sick.'}`,
            state,
        );
        await losehp(
            rnd(8),
            !glob ? 'cadaver' : 'rotted glob',
            KILLED_BY_AN,
            state,
        );
    }

    /* delay is weight dependent */
    victual(state).reqtime = 3 + ((!glob ? corpse.cwt : otmp.owt) >> 6);

    if (!tp && !nonrotting_corpse(mnum, state)
        && (otmp.orotten || !rn2(7))) {
        if (await rottenfood(otmp, state)) {
            otmp.orotten = true;
            otmp = touchfood(otmp, { state });
            if (!otmp)
                return 1;
            retcode = 1;
        }

        if (!state.mons[otmp.corpsenm].cnutrit) {
            /* no nutrition: rots away, no message if you passed out */
            if (!retcode)
                await ttyPline('The corpse rots away completely.', state);
            if (carried(otmp))
                useup(otmp, { state });
            else
                await useupf(otmp, 1, { state });
            retcode = 2;
        }

        if (!retcode)
            consume_oeaten(otmp, 2, state); /* oeaten >>= 2 */
    } else if ((mnum === PM_COCKATRICE || mnum === PM_CHICKATRICE)
               && (propertyActive(state, STONE_RES) || Hallucination(state))) {
        await ttyPline('This tastes just like chicken!', state);
    } else if (mnum === PM_FLOATING_EYE && u.umonnum === PM_RAVEN) {
        await ttyPline('You peck the eyeball with delight.', state);
    } else if (tp) {
        /* we've already delivered a message; don't add "it tastes okay" */
    } else {
        /* yummy is always False for omnivores, palatable always True */
        const yummy = vegan(corpse)
            ? (!carnivorous(uptr) && herbivorous(uptr))
            : (carnivorous(uptr) && !herbivorous(uptr));
        const palatable = (vegetarian(corpse)
            ? herbivorous(uptr) : carnivorous(uptr))
            && rn2(10) !== 0
            && (rotted < 1 || rn2(rotted + 1) === 0);
        let pmxnam = food_xname(otmp, false, state);
        const idx = vegetarian(corpse)
            ? 0 : rn2(PALATABLE_MSGS.length);
        const palat_msg = PALATABLE_MSGS[idx];
        const use_is = Hallucination(state)
            || (palatable && palat_msg[0] === 'I');

        if (pmxnam.slice(0, 4).toLowerCase() === 'the ')
            pmxnam = pmxnam.slice(4);
        await ttyPline(
            `${type_is_pname(corpse) ? ''
                : the_unique_pm(corpse) ? 'The ' : 'This '}${pmxnam} ${
                use_is ? 'is' : 'tastes'} ${
                /* tiger reference is to TV ads for "Frosted Flakes",
                   breakfast cereal targeted at kids by "Tony the tiger" */
                Hallucination(state)
                    ? (yummy ? (u.umonnum === PM_TIGER ? 'gr-r-reat' : 'gnarly')
                        : palatable ? 'copacetic' : 'grody')
                    : (yummy ? 'delicious'
                        : palatable ? palat_msg.slice(1) : 'terrible')
            }${(yummy || !palatable) ? '!' : '.'}`,
            state,
        );
    }

    return retcode;
}

// C ref: eat.c fpostfx() (2508-2597), the effects that follow a finished
// non-corpse meal. Arms whose effects are still unported stop rather than
// silently skipping, because each one changes hero state.
async function fpostfx(otmp, state, env) {
    switch (otmp.otyp) {
    case SPRIG_OF_WOLFSBANE:
        if (ismnum(state.u.ulycn) || is_were(state.youmonst.data))
            throw new UnsupportedEatError('you_unwere()');
        break;
    case CARROT:
        // C ref: eat.c:2518-2520. Clears cream from the hero's face. The
        // swallow/engulf guard is unreachable: uswallow stops the eat command.
        if (!state.u.uswallow)
            await make_blinded(state.u.ucreamed ?? 0, true, state);
        break;
    case FORTUNE_COOKIE:
        await outrumor(
            bcsign(otmp),
            BY_COOKIE,
            state,
            { message: env.message ?? ttyPline },
        );
        if (!heroIsBlind(state)) {
            const firstLiterate = !(state.u.uconduct.literate ?? 0);
            state.u.uconduct.literate = Math.trunc(
                state.u.uconduct.literate ?? 0,
            ) + 1;
            if (firstLiterate)
                livelog_printf(
                    LL_CONDUCT,
                    'became literate by reading the fortune inside a cookie',
                    state,
                );
        }
        break;
    case LUMP_OF_ROYAL_JELLY:
        // gainstr(), the rnd(20) hit points and the rn2(17) maximum increase.
        throw new UnsupportedEatError('the royal jelly effects');
    case EGG:
        // A petrifying egg reaches make_stoned() through flesh_petrifies().
        throw new UnsupportedEatError("fpostfx()'s petrifying egg arm");
    case EUCALYPTUS_LEAF:
        // youprop.h:108 and :111 define Sick and Vomiting as the bare
        // intrinsic, as doeat()'s Strangled read below does for :110.
        if ((hungerProperty(state, SICK).intrinsic
                || hungerProperty(state, VOMITING).intrinsic)
            && !otmp.cursed) {
            throw new UnsupportedEatError('make_sick() and make_vomiting()');
        }
        break;
    case APPLE:
        if (otmp.cursed && !propertyActive(state, SLEEP_RES)) {
            // The Snow White arm: verbalize() or You_hear() and then
            // fall_asleep(-rn1(11, 20), TRUE).
            throw new UnsupportedEatError('fall_asleep() for a cursed apple');
        }
        break;
    default:
        break;
    }
    await Promise.resolve();
}

// C ref: eat.c garlic_breath() (2084-2089). Scare one nearby monster when it
// has olfaction and is within squared distance 7 of the hero. Called for each
// monster on the level via iter_mons(garlic_breath) in fprefx()'s
// CLOVE_OF_GARLIC arm. The dead/offmap check reproduces C's iter_mons() filter,
// since the JS caller uses iter_mons_safe() which does not filter.
async function garlic_breath(monster, state) {
    if (monster.mhp < 1 || mon_offmap(monster)) return;
    if (olfaction(monster.data)
        && dist2(monster.mx, monster.my, state.u.ux, state.u.uy) < 7) {
        await monflee(monster, 0, false, false, { state });
    }
}

// C ref: eat.c fprefx() (2091-2213), the message on the first bite of a
// non-corpse, non-tin food. Answers false when eating must not proceed.
//
// The food ration arm, the CLOVE_OF_GARLIC arm (non-undead hero), and the
// default arm are ported. Every other arm needs an unported effect.
async function fprefx(otmp, state) {
    switch (otmp.otyp) {
    case EGG:
        // A pyrolisk egg explodes; a stale one calls make_vomiting().
        throw new UnsupportedEatError("fprefx()'s egg arms");
    case FOOD_RATION: /* nutrition 800 */
        /* 200+800 remains below 1000+1, the satiation threshold */
        if (state.u.uhunger <= 200) {
            if (Hallucination(state)) {
                // C spells this arm as one pline() whose text is a ternary on
                // Hallucination, so the hallucinating wording replaces this
                // message and no other. Nothing reachable on dungeon level one
                // makes the hero hallucinate.
                throw new UnsupportedEatError(
                    "fprefx()'s hallucinating food ration message",
                );
            }
            await ttyPline('This food really hits the spot!', state);
        } else if (state.u.uhunger < 700) {
            /* 700-1+800 remains below 1500, the choking threshold which
               triggers "you're having a hard time getting it down" feedback */
            await ttyPline(
                `This satiates your ${body_part(STOMACH, state.youmonst)}!`,
                state,
            );
        }
        break;
    case TRIPE_RATION:
        // The three wordings need carnivorous(), humanoid() and the orc race
        // test, and the "Yak - dog food!" arm also calls more_experienced(),
        // newexplevel() and, on rn2(2) outside CANNIBAL_ALLOWED(),
        // make_vomiting().
        throw new UnsupportedEatError("fprefx()'s tripe ration arm");
    case LEMBAS_WAFER:
        // The orc and elf wordings, and the fall through to give_feedback for
        // every other race.
        throw new UnsupportedEatError("fprefx()'s lembas wafer arm");
    case MEATBALL:
    case MEAT_STICK:
    case ENORMOUS_MEATBALL:
    case MEAT_RING:
        // These reach the same give_feedback label as the default arm, but
        // every one of them is FLESH, which doeat() stops above.
        throw new UnsupportedEatError("fprefx()'s meat arms");
    case CLOVE_OF_GARLIC:
        if (is_undead(state.youmonst.data)) {
            // C calls make_vomiting(rn1(reqtime, 5), FALSE), which is unported.
            throw new UnsupportedEatError(
                "fprefx()'s garlic undead-hero vomiting",
            );
        }
        await iter_mons_safe(
            (monster) => garlic_breath(monster, state),
            state,
        );
        // FALLTHROUGH to default (C's give_feedback label)
    default:
        if (otmp.otyp === SLIME_MOLD && !otmp.cursed
            && otmp.spe === state.context.current_fruit) {
            // "My, this is a yummy <fruit>!", or "primo" while hallucinating.
            // No role starts with a slime mold, and picking one up off the
            // floor needs the unported autopickup and pickup commands, so no
            // recorded case can check either wording or the fruit name
            // singular() would format.
            throw new UnsupportedEatError("fprefx()'s slime mold arm");
        } else if (otmp.otyp === APPLE && otmp.cursed
            && !propertyActive(state, SLEEP_RES)) {
            /* skip core joke; feedback deferred til fpostfx() */
        } else if (otmp.otyp === APPLE) {
            // The `#if defined(MACOS9) || defined(MACOS)` arm (2179-2185).
            // build-recorder.sh:31-35 configures its Darwin host through
            // sys/unix, so config.h:18 leaves UNIX defined while
            // config1.h:43-45 adds MACOS on top of it from clang's __APPLE__
            // and __MACH__; config1.h:64-67, the one #undef of UNIX, needs
            // MACOS9 or __BEOS__. Both arms are therefore compiled, and C's
            // comment at 2180-2182 says what their order then means: the
            // apple is answered here, and "the '#if UNIX' code will still
            // kick in for pear". Hallucination changes nothing on this arm.
            await ttyPline('Delicious!  Must be a Macintosh!', state);
        } else if (otmp.otyp === APPLE || otmp.otyp === PEAR) {
            // The `#ifdef UNIX` arm (2187-2202). C tests the apple here too,
            // but the MACOS arm above has already answered it, so the pear is
            // the only food that arrives.
            if (Hallucination(state)) {
                // rnd(100) (2193) picks between three segmentation-fault
                // wordings, and it is the only draw anywhere in this default
                // arm. No u_init.c row holds a pear and picking one up needs
                // the unported pickup commands, so no recorded case can check
                // it; a wrong string would cost one screen, but a draw taken
                // where C takes none shifts every call after it.
                throw new UnsupportedEatError("fprefx()'s hallucinating pear");
            }
            await ttyPline('Core dumped.', state);
        } else {
            // A fortune cookie is the only food that reaches this line
            // cursed: doeat() (3027-3031) exempts it by otyp and sends every
            // other cursed food to rottenfood() instead of to fprefx().
            await ttyPline(
                `This ${singular(otmp, xnameFresh, state)} is ${
                    otmp.cursed
                        ? (Hallucination(state) ? 'grody!' : 'terrible!')
                        : (otmp.otyp === CRAM_RATION
                            || otmp.otyp === K_RATION
                            || otmp.otyp === C_RATION)
                            ? 'bland.'
                            : (Hallucination(state) ? 'gnarly!' : 'delicious!')
                }`,
                state,
            );
        }
        break;
    }
    return true;
}

// The operations eat.c's own code reaches through globals. doeat() and
// eatfood() both build this, so a meal behaves the same whether the turn came
// from the command or from the occupation. Only statusRefresh differs, because
// display.c bot() would close an import cycle with this file and arrives from
// the caller instead.
function eatOperations(state, statusRefresh, message = ttyPline) {
    return {
        state,
        // C ref: mkobj.c weight()'s partly-eaten arms, which reach eat.c
        // eaten_stat() through this port's object env; mkobj.c
        // remove_object(), which done_eating() reaches through useupf() ->
        // delobj() -> delobj_core() -> obj_extract_self() for a meal the hero
        // ate off the floor; and timeout.c obj_stop_timers(), which
        // done_eating() reaches through useup() -> obfree() for a corpse,
        // whose ROT_CORPSE timer mkobj.c start_corpse_timeout() hung on it.
        // No other hook is reachable: a food carries no light, no shop bill
        // and no worn mask, so freeinv(), addinv_nomerge() and splitobj() take
        // their hookless path, and a hook this meal did need would stop the
        // command rather than be skipped.  costlyAlteration covers
        // touchfood()'s COST_BITE: C returns early from costly_alteration()
        // when the object is not in a shop (the common case for a floor
        // corpse), so a no-op is correct for non-shop items.
        hooks: {
            eatenStat: eaten_stat,
            extractExternalObject: remove_object,
            stopObjectTimers: (obj, hookEnv) => {
                obj_stop_timers(obj, hookEnv.state, hookEnv);
            },
            costlyAlteration: () => {},
        },
        message,
        endRunning,
        // newuhs() resolves this only when the meal moves the hunger status,
        // which is the one place C's doeat() reaches bot().
        statusRefresh,
    };
}

// C ref: eat.c eatfood() (517-541), the occupation callback set_occupation()
// installs at the end of start_eating(). allmain.c moveloop_core() runs it once
// a turn and clears go.occupation when it answers 0.
//
// `env` carries the display operations that differ for the live game and an
// atomic planning clone; every other operation is this file's own.
export async function eatfood(state = game, env = {}) {
    const meal = victual(state);
    const eatEnv = eatOperations(state, env.statusRefresh, env.message);
    let food = meal.piece;

    // C ref: `if (food && !carried(food) && !obj_here(food, u.ux, u.uy))
    // food = 0;`. A floor corpse stays on the floor during a multi-turn
    // meal; obj_here checks that it is still at the hero's feet.
    if (food && !carried(food)) {
        let here = false;
        for (let o = state.level.objects[state.u.ux]?.[state.u.uy];
            o; o = o.nexthere) {
            if (o === food) { here = true; break; }
        }
        if (!here) food = null;
    }
    if (!food) {
        /* maybe it was stolen? */
        // food_disappears() zeroes the victual without clearing the
        // occupation, which is how C reaches this arm; obfree() is its only
        // caller and, during a meal, done_eating()'s own useup() is the only
        // ported route into obfree().
        throw new UnsupportedEatError(
            'do_reset_eat() for a meal whose food went away',
        );
    }
    if (!meal.eating) {
        // do_reset_eat() lowers `eating` when an interruption abandons the
        // meal, and nothing ported calls it.
        throw new UnsupportedEatError("eatfood()'s abandoned meal");
    }

    if (++meal.usedtime <= meal.reqtime) {
        if (await bite(state, eatEnv)) return 0;
        return 1; /* still busy */
    }
    /* done */
    await done_eating(true, state, eatEnv);
    return 0;
}

// C ref: eat.c done_eating() (542-573). The end of a meal: the food is used
// up, its remaining effects run, and the victual struct returns to zero.
async function done_eating(message, state, env) {
    const meal = victual(state);
    const piece = meal.piece;

    piece.in_use = true;
    // C ref: `go.occupation = 0; /* do this early, so newuhs() knows we're
    // done */`. Clearing it here is what lets the newuhs() below restore the
    // status the hero started the meal with and comment on the whole meal;
    // leaving it set would take newuhs()'s silent arm instead. moveloop_core()
    // clears it a second time when this callback answers 0.
    if (state.go) state.go.occupation = null;
    await newuhs(false, state, env);
    const plineMessage = requireEatOperation(env, 'message');
    if (state.nomovemsg) {
        if (message) await plineMessage(state.nomovemsg, state);
        // C's `gn.nomovemsg = 0` assigns NULL to a `const char *`. The number
        // 0 is not that: js/trap.js unconscious() resolves this field with
        // `??`, which passes 0 through to String.prototype.startsWith.
        state.nomovemsg = null;
    } else if (message) {
        await plineMessage(
            `You finish ${
                state.youmonst.data === state.mons[PM_FIRE_ELEMENTAL]
                    ? 'consuming' : 'eating'
            } ${food_xname(piece, true, state)}.`,
            state,
        );
    }

    if (piece.otyp === CORPSE || piece.globby)
        await cpostfx(piece.corpsenm, state);
    else
        await fpostfx(piece, state, env);

    if (carried(piece)) useup(piece, env);
    else await useupf(piece, 1, env);

    state.context.victual = zero_victual();
}

// C ref: eat.c start_eating() (2020-2074). Takes the first bite and either ends
// the meal at once or hands the rest of it to the eatfood() occupation.
async function start_eating(otmp, already_partly_eaten, state, env) {
    const meal = victual(state);

    meal.fullwarn = 0;
    meal.doreset = 0;
    meal.eating = 1;

    if (otmp.otyp === CORPSE || otmp.globby) {
        await cprefx(victual(state).piece.corpsenm, state);
        // C ref: `if (!svc.context.victual.piece
        //           || !svc.context.victual.eating) return;`, the rider
        // revived or the hero died and was lifesaved. cprefx() stops on both
        // of the arms that clear either field.
    }

    if (await bite(state, env)) {
        // bite() answers nonzero only after choke(), which stops above.
        throw new Error('start_eating: unreachable choke continuation');
    }

    if (++meal.usedtime >= meal.reqtime) {
        /* print "finish eating" message if they just resumed -dlc */
        await done_eating(
            meal.reqtime > 1 || already_partly_eaten,
            state,
            env,
        );
        return;
    }

    // C ref: `Sprintf(msgbuf, "eating %s", food_xname(otmp, TRUE));
    // set_occupation(eatfood, msgbuf, 0);`. msgbuf is a static buffer whose
    // only reader is stop_occupation()'s "You stop %s." Runtime monster
    // creation now reaches that owner through makemon()->dochugw(FALSE).
    //
    // Three other paths can reach allmain.c stop_occupation() while the meal
    // runs. Two are now ported and print; the third still refuses:
    //   - allmain.c moveloop_core():505-508, monster_nearby() after a bite,
    //     which prints "You stop eating ..." and then runs reset_eat(). This
    //     is the common one: over 1500 seeds typing `ed`, it fired 303 times
    //     against dochugw()'s 10, because dochugw() needs the monster to be
    //     newly in range and one already visible nearby skips it;
    //   - monmove.c dochugw():223-235, a hostile spottable monster newly
    //     inside (BOLT_LIM + 1) * (BOLT_LIM + 1), reached both from
    //     makemon()'s runtime tail and from the live and planning monster
    //     scans. It prints the same line and runs no reset_eat(). Its radius
    //     is nine where hack.c monster_nearby() scans the eight adjacent
    //     squares alone, so when it does fire it fires earlier;
    //   - teleport.c rloc_to_core():1761-1762, whose whole tail js/teleport.js
    //     still refuses.
    // makemon.c:1503 is the supported fourth call. js/allmain.js owns its exact
    // complete-meal versus "You stop eating ..." behavior.
    set_occupation(
        eatfood,
        `eating ${food_xname(otmp, true, state)}`,
        0,
        state,
    );
}

// C ref: eat.c getobj_else (79-85), a file-scope int rather than a member of
// the bulk-reinitialized globals because floorfood() clears it at every entry
// before anything reads it. It counts the floor alternatives the player
// declined, which is what puts "else" into "You don't have anything else to
// eat."
let getobj_else = 0;

// C ref: eat.c eat_ok() (3514-3533), the getobj() callback for #eat.
function eat_ok(obj, state = game) {
    /* 'getobj_else' will be non-zero if floor food is present and
       player declined to eat that */
    if (!obj)
        return getobj_else ? GETOBJ_EXCLUDE_NONINVENT : GETOBJ_EXCLUDE;

    if (is_edible(obj, state)) return GETOBJ_SUGGEST;

    /* make sure to exclude, not downplay, gold (if not is_edible) in order to
     * produce the "You cannot eat gold" message in getobj */
    if (obj.oclass === COIN_CLASS) return GETOBJ_EXCLUDE;

    return GETOBJ_EXCLUDE_SELECTABLE;
}

// C ref: eat.c offer_ok() (3539-3567), the getobj() callback used by
// pray.c dosacrifice(). Corpses are suggested on ordinary levels while
// amulets are downplayed away from Astral; the inverse is true on Astral.
// This callback is pure: it only classifies the candidate and reads the
// caller's floor-alternative counter for the null candidate.
export function offer_ok(obj, state = game) {
    if (!obj)
        return getobj_else ? GETOBJ_EXCLUDE_NONINVENT : GETOBJ_EXCLUDE;

    if (obj.oclass !== FOOD_CLASS && obj.oclass !== AMULET_CLASS)
        return GETOBJ_EXCLUDE;

    if (obj.otyp !== CORPSE && obj.otyp !== AMULET_OF_YENDOR
        && obj.otyp !== FAKE_AMULET_OF_YENDOR)
        return GETOBJ_EXCLUDE_SELECTABLE;

    // C's `Is_astralevel(&u.uz) ^ (obj->oclass == AMULET_CLASS)` suppresses
    // corpses on Astral and amulets elsewhere from the suggested set.
    const astral = Is_astralevel(state.u?.uz);
    if (Boolean(astral) !== (obj.oclass === AMULET_CLASS))
        return GETOBJ_DOWNPLAY;

    return GETOBJ_SUGGEST;
}

// C ref: eat.c tin_ok() (3569-3575). Like offer_ok(), this callback is pure;
// its null result preserves floorfood()'s "else" wording after a declined
// floor corpse.
export function tin_ok(obj, state = game) {
    if (!obj)
        return getobj_else ? GETOBJ_EXCLUDE_NONINVENT : GETOBJ_EXCLUDE;
    if (obj.oclass !== FOOD_CLASS)
        return GETOBJ_EXCLUDE;
    if (obj.otyp !== CORPSE || !tinnable(obj, state))
        return GETOBJ_EXCLUDE_SELECTABLE;
    return GETOBJ_SUGGEST;
}

// C ref: eat.c floorfood() (3577-3730). The eat and sacrifice selectors share
// the floor-object and inventory prompt ordering. The bear-trap, iron-bars,
// gold, and tinning branches below preserve the same source call order.
export async function floorfood(verb, corpsecheck, state = game) {
    const u = state.u;
    const uptr = state.youmonst?.data;
    const feeding = verb === 'eat'; /* corpsecheck==0 */
    const offering = verb === 'sacrifice'; /* corpsecheck==1 */

    getobj_else = 0; /* haven't asked about floor food */

    /* if we can't touch floor objects then use invent food only;
       same when 'm' prefix is used--for #eat, it means "skip floor food" */
    const walking = Boolean(
        state.u?.uprops?.[WWALKING]?.intrinsic
        || state.u?.uprops?.[WWALKING]?.extrinsic,
    ) && !Is_waterlevel(u.uz);
    const breathlessHero = Boolean(
        state.u?.uprops?.[MAGICAL_BREATHING]?.intrinsic
        || state.u?.uprops?.[MAGICAL_BREATHING]?.extrinsic,
    ) || breathless(uptr);
    const skipfloor = state.iflags.menu_requested
        || !can_reach_floor(true, state)
        || (feeding && u.usteed);
    if (!skipfloor
        && !(is_pool_or_lava(u.ux, u.uy, state)
            && (walking || is_clinger(uptr)
                || (Flying(state) && !breathlessHero)))) {

        if (feeding && metallivorous(uptr)) {
            const trap = t_at(u.ux, u.uy, state);
            if (trap && trap.tseen && trap.ttyp === BEAR_TRAP) {
                const uInBeartrap = Boolean(
                    u.utrap && u.utraptype === TT_BEARTRAP,
                );
                const qbuf = `There is a bear trap here (${uInBeartrap
                    ? 'holding you' : 'armed'}); eat it?`;
                const c = await yn_function(qbuf, 'ynq', 'n', true, state);
                if (c === 'y'.charCodeAt(0)) {
                    deltrap(trap, state);
                    if (uInBeartrap) await reset_utrap(true, state);
                    const objectEnv = objectGenerationEnv({ state });
                    const beartrap = mksobj(
                        BEARTRAP, true, false, objectEnv,
                    );
                    const dropQbuf = `You only manage to ${uInBeartrap
                        ? 'free yourself from' : 'disarm'} the bear trap.`;
                    if (await check_capacity(dropQbuf, state) && beartrap) {
                        obj_extract_self(beartrap, { state });
                        await dropy(beartrap, {
                            ...objectEnv,
                            hooks: {
                                ...objectEnv.hooks,
                                encumberMessage: encumber_msg,
                                extractExternalObject: remove_object,
                                newsym,
                            },
                        });
                        return null;
                    }
                    return beartrap;
                } else if (c === 'q'.charCodeAt(0)) {
                    return null;
                }
                ++getobj_else;
            }

            if (state.level.at(u.ux, u.uy).typ === IRONBARS) {
                const nodig = Boolean(
                    state.level.at(u.ux, u.uy).wall_info & W_NONDIGGABLE,
                );
                let c = 'n'.charCodeAt(0);
                const qbuf = 'There are iron bars here';
                if (nodig || u.uhunger > 1500) {
                    await ttyPline(
                        `${qbuf} but you ${nodig ? 'cannot' : 'are too full to'} eat them.`,
                        state,
                    );
                } else {
                    const digging = state.context?.digging;
                    const resume = Boolean(
                        digging?.chew
                        && digging.pos?.x === u.ux
                        && digging.pos?.y === u.uy
                        && on_level(digging.level, u.uz),
                    );
                    c = await yn_function(
                        `${qbuf}; ${resume ? 'resume eating them' : 'eat them'}?`,
                        'ynq', 'n', true, state,
                    );
                }
                if (c === 'y'.charCodeAt(0)) return hands_obj;
                if (c === 'q'.charCodeAt(0)) return null;
                ++getobj_else;
            }

            if (uptr !== state.mons?.[PM_RUST_MONSTER]) {
                const gold = g_at(u.ux, u.uy, state);
                if (gold) {
                    const qbuf = gold.quan === 1
                        ? 'There is 1 gold piece here; eat it?'
                        : `There are ${gold.quan} gold pieces here; eat them?`;
                    const c = await yn_function(
                        qbuf, 'ynq', 'n', true, state,
                    );
                    if (c === 'y'.charCodeAt(0)) return gold;
                    if (c === 'q'.charCodeAt(0)) return null;
                    ++getobj_else;
                }
            }
        }

        /* Is there some food (probably a heavy corpse) here on the ground? */
        for (let otmp = state.level.objects[u.ux]?.[u.uy] ?? null;
            otmp;
            otmp = otmp.nexthere) {
            const candidate = corpsecheck
                ? (otmp.otyp === CORPSE
                    && (corpsecheck === 1 || tinnable(otmp, state)))
                : feeding
                    ? (otmp.oclass !== COIN_CLASS && is_edible(otmp, state))
                    : otmp.oclass === FOOD_CLASS;
            if (candidate) {
                if (otmp.otyp === CORPSE
                    && will_feel_cockatrice(otmp, false, state)) {
                    await feel_cockatrice(otmp, false, state);
                    return null;
                }
                const one = (otmp.quan ?? 1) === 1;
                const prefix = `There ${otense(otmp, 'are')} `;
                const suffix = ` here; ${verb} ${one ? 'it' : 'one'}?`;
                const qbuf = safe_qbuf(
                    prefix, suffix, otmp, donameFresh, ansimpleoname,
                    one ? 'something' : 'things', state,
                );
                const c = await yn_function(
                    qbuf, 'ynq', 'n', true, state,
                );
                if (c === 'y'.charCodeAt(0)) return otmp;
                if (c === 'q'.charCodeAt(0)) return null;
                ++getobj_else;
            }
        }
    }

    /* skipfloor: */
    /* We cannot use GETOBJ_PROMPT since we don't want a prompt in the case
       where nothing edible is being carried. */
    let otmp;
    if (feeding) {
        otmp = await getobj('eat', eat_ok, GETOBJ_NOFLAGS, state);
    } else if (offering) {
        otmp = await getobj('sacrifice', offer_ok, GETOBJ_NOFLAGS, state);
    } else if (corpsecheck === 2) {
        otmp = await getobj(verb, tin_ok, GETOBJ_NOFLAGS, state);
    } else {
        // C's impossible() arm has no return value and leaves no selected
        // object. Preserve the source gap until an owning diagnostic sink
        // is ported; this call is deliberately not used as data.
        note_unported('pline.c impossible');
        otmp = null;
    }
    if (otmp && corpsecheck && !(offering && otmp.oclass === AMULET_CLASS)) {
        if (otmp.otyp !== CORPSE
            || (corpsecheck === 2 && !tinnable(otmp, state))) {
            await ttyPline(`You can't ${verb} that!`, state);
            otmp = null;
        }
    }
    /* resetting 'getobj_else' here isn't essential; it will be cleared the
       next time it needs to be used */
    getobj_else = 0;
    return otmp;
}

// C ref: eat.c bounded_increase() (2222-2255). Keep protection contributed by
// worn rings in the total while constraining this new accessory's modifier.
function bounded_increase(old, inc, typ, state = game) {
    if (state.uright?.otyp === typ && typ !== RIN_PROTECTION)
        old -= state.uright.spe;
    if (state.uleft?.otyp === typ && typ !== RIN_PROTECTION)
        old -= state.uleft.spe;

    const signOld = Math.sign(old);
    const signInc = Math.sign(inc);
    let amount = Math.abs(inc);
    const absOld = Math.abs(old);

    if (amount === 0 || signOld !== signInc || absOld + amount < 10) {
        // Use inc as-is.
    } else if (absOld + amount < 20) {
        amount = rnd(amount);
        if (absOld + amount < 10) amount = 10 - absOld;
        inc = signInc * amount;
    } else if (absOld + amount < 40) {
        amount = rn2(amount) ? 1 : 0;
        if (absOld + amount < 20) amount = rnd(20 - absOld);
        inc = signInc * amount;
    } else {
        inc = 0;
    }

    if (state.uright?.otyp === typ && typ !== RIN_PROTECTION)
        old += state.uright.spe;
    if (state.uleft?.otyp === typ && typ !== RIN_PROTECTION)
        old += state.uleft.spe;
    return old + inc;
}

// C ref: eat.c accessory_has_effect() (2258-2262).
async function accessory_has_effect(otmp, state, env) {
    await (env.message ?? ttyPline)(
        `Magic spreads through your body as you digest the ${
            otmp.oclass === RING_CLASS ? 'ring' : 'amulet'
        }.`,
        state,
    );
}

// C ref: eat.c eataccessory() (2265-2404). Eating a ring or amulet has the
// same one-in-three/one-in-five effect roll and property updates as C. Void
// helpers without a port are recorded at their call sites and skipped.
async function eataccessory(otmp, state, env) {
    const typ = otmp.otyp;
    const type = objectType(otmp, state);
    const prop = state.u.uprops[type.oc_oprop];
    const oldprop = prop.intrinsic;

    if (otmp === state.uleft || otmp === state.uright) {
        // eat.c discards Ring_gone()'s result, but its source-owned side
        // effects include ending levitation before the eaten ring is observed.
        const { Ring_gone } = await import('./do_wear.js');
        await Ring_gone(otmp, state);
        if (state.u.uhp <= 0) return;
    }
    observe_object(otmp, state);
    otmp.known = true;

    if (rn2(otmp.oclass === RING_CLASS ? 3 : 5) !== 0) return;

    const message = env.message ?? ttyPline;
    const effect = () => accessory_has_effect(otmp, state, env);
    switch (typ) {
    default:
        if (!type.oc_oprop) break;
        if (!(prop.intrinsic & FROMOUTSIDE)) await effect();
        prop.intrinsic |= FROMOUTSIDE;

        switch (typ) {
        case RIN_SEE_INVISIBLE: {
            note_unported('display.c set_mimic_blocking');
            see_monsters(state);
            const invis = state.u.uprops[INVIS];
            const seeInvisible = state.u.uprops[SEE_INVIS];
            const invisible = Boolean(
                (invis.intrinsic || invis.extrinsic) && !invis.blocked,
            );
            if (invisible && !oldprop && !seeInvisible.extrinsic
                && !perceives(state.youmonst.data)
                && !heroIsBlind(state)) {
                newsym(state.u.ux, state.u.uy, state);
                await message('Suddenly you can see yourself.', state);
                discover_object(typ, true, true, true, state);
            }
            break;
        }
        case RIN_INVISIBILITY: {
            const invis = state.u.uprops[INVIS];
            const seeInvisible = state.u.uprops[SEE_INVIS];
            const seeInvis = Boolean(
                seeInvisible.intrinsic || seeInvisible.extrinsic,
            );
            if (!oldprop && !seeInvisible.extrinsic && !invis.blocked
                && !seeInvis && !heroIsBlind(state)) {
                newsym(state.u.ux, state.u.uy, state);
                await message(
                    `Your body takes on a ${Hallucination(state)
                        ? 'normal' : 'strange'} transparency...`,
                    state,
                );
                discover_object(typ, true, true, true, state);
            }
            break;
        }
        case RIN_PROTECTION_FROM_SHAPE_CHAN:
            await rescham(state);
            break;
        case RIN_LEVITATION:
            prop.intrinsic = oldprop;
            if (!Levitation(state)) {
                await float_up(state);
                incr_itimeout(prop, d(10, 20));
                discover_object(typ, true, true, true, state);
            }
            break;
        }
        break;
    case RIN_ADORNMENT:
        await effect();
        if (await adjattrib(A_CHA, otmp.spe, -1, state))
            discover_object(typ, true, true, true, state);
        break;
    case RIN_GAIN_STRENGTH:
        await effect();
        if (await adjattrib(A_STR, otmp.spe, -1, state))
            discover_object(typ, true, true, true, state);
        break;
    case RIN_GAIN_CONSTITUTION:
        await effect();
        if (await adjattrib(A_CON, otmp.spe, -1, state))
            discover_object(typ, true, true, true, state);
        break;
    case RIN_INCREASE_ACCURACY:
        await effect();
        state.u.uhitinc = bounded_increase(
            state.u.uhitinc, otmp.spe, RIN_INCREASE_ACCURACY, state,
        );
        break;
    case RIN_INCREASE_DAMAGE:
        await effect();
        state.u.udaminc = bounded_increase(
            state.u.udaminc, otmp.spe, RIN_INCREASE_DAMAGE, state,
        );
        break;
    case RIN_PROTECTION:
    case AMULET_OF_GUARDING:
        await effect();
        state.u.uprops[PROTECTION].intrinsic |= FROMOUTSIDE;
        state.u.ublessed = bounded_increase(
            state.u.ublessed,
            typ === RIN_PROTECTION ? otmp.spe : 2,
            typ,
            state,
        );
        state.disp.botl = true;
        break;
    case RIN_FREE_ACTION: {
        const sleepResistance = state.u.uprops[SLEEP_RES];
        if (!(sleepResistance.intrinsic & FROMOUTSIDE)) await effect();
        if (!(sleepResistance.intrinsic || sleepResistance.extrinsic)
            || sleepResistance.blocked)
            await message('You feel wide awake.', state);
        sleepResistance.intrinsic |= FROMOUTSIDE;
        break;
    }
    case AMULET_OF_CHANGE:
        await effect();
        discover_object(typ, true, true, true, state);
        change_sex(state);
        await message(
            `You are suddenly very ${state.flags.female
                ? 'feminine' : 'masculine'}!`,
            state,
        );
        state.disp.botl = true;
        break;
    case AMULET_OF_UNCHANGING:
        if (!(state.u.uprops[UNCHANGING].intrinsic
            || state.u.uprops[UNCHANGING].extrinsic) && Upolyd(state.u)) {
            await effect();
            discover_object(typ, true, true, true, state);
            await rehumanize(state);
        }
        break;
    case AMULET_OF_STRANGULATION:
        note_unported('eat.c choke');
        break;
    case AMULET_OF_RESTFUL_SLEEP: {
        const newnap = rnd(100);
        const sleepy = state.u.uprops[SLEEPY];
        const oldnap = sleepy.intrinsic & TIMEOUT;
        if (!(sleepy.intrinsic & FROMOUTSIDE)) await effect();
        sleepy.intrinsic |= FROMOUTSIDE;
        if (newnap < oldnap || oldnap === 0)
            sleepy.intrinsic = (sleepy.intrinsic & ~TIMEOUT) | newnap;
        break;
    }
    case RIN_SUSTAIN_ABILITY:
    case AMULET_OF_LIFE_SAVING:
    case AMULET_OF_FLYING:
    case AMULET_OF_REFLECTION:
        break;
    }
}

// C ref: eat.c eatspecial() (2414-2486), the common completion tail for an
// object that doeat_nonfood() admits. C keeps this helper in eat.c, so its
// state transitions stay here too. Remaining leash and punishment helpers
// are recorded at their call sites when those branches are reached.
async function eatspecial(state, env) {
    const meal = victual(state);
    const otmp = meal.piece;

    // lesshungry() checks go.occupation to decide whether choking and the
    // nearly-full warning are allowed.  This temporary occupation is why the
    // one-turn non-food action uses the same hunger machinery as a meal.
    set_occupation(eatfood, 'eating non-food', 0, state);
    await lesshungry(meal.nmod, state, env);
    if (state.program_state?.gameover) return;
    if (state.go) state.go.occupation = null;
    state.context.victual = zero_victual();

    if (otmp.oclass === COIN_CLASS) {
        if (carried(otmp))
            useupall(otmp, env);
        else
            await useupf(otmp, otmp.quan, env);
        // The watcher result is discarded by C. Its source owner is not
        // ported, so do not invent a shop update for eaten gold.
        note_unported('vault.c vault_gd_watching');
        return;
    }

    const type = objectType(otmp, state);
    if (type.oc_material === PAPER) {
        if (otmp.otyp === SCR_MAIL) {
            await env.message('This junk mail is less than satisfying.', state);
        } else if (otmp.otyp === SCR_SCARE_MONSTER) {
            await env.message(`Yuck${otmp.blessed ? '!' : '.'}`, state);
        } else if (otmp.oclass === SCROLL_CLASS
            && objdescr_is(otmp, 'YUM YUM', state)) {
            await env.message(`Yum${otmp.blessed ? '!' : '.'}`, state);
        } else {
            await env.message('Needs salt...', state);
        }
    }

    if (otmp.oclass === POTION_CLASS) {
        // C increments first so that dopotion's useup() does not remove the
        // object before this function's final useup() call.
        otmp.quan = Math.trunc(otmp.quan ?? 1) + 1;
        await dopotion(otmp, state);
        if (state.program_state?.gameover) return;
    } else if (otmp.oclass === RING_CLASS || otmp.oclass === AMULET_CLASS) {
        await eataccessory(otmp, state, env);
    } else if (otmp.otyp === LEASH && otmp.leashmon) {
        note_unported('dog.c o_unleash');
    }

    // These two object jokes are fully local to eat.c and their C calls to
    // exercise() are already implemented.  Awaiting the call preserves its
    // optional encumbrance message before consuming the object.
    if (otmp.otyp === TRIDENT && !otmp.cursed) {
        await env.message(
            Hallucination(state)
                ? 'Four out of five dentists agree.'
                : 'That was pure chewing satisfaction!',
            state,
        );
        await exercise(A_WIS, true, state, { rn2 }, {
            encumberMessage: encumber_msg,
        });
    }
    if (otmp.otyp === FLINT && !otmp.cursed) {
        await env.message('Yabba-dabba delicious!', state);
        await exercise(A_CON, true, state, { rn2 }, {
            encumberMessage: encumber_msg,
        });
    }

    if (otmp === state.uwep && otmp.quan === 1)
        uwepgone({ state });
    if (otmp === state.uquiver && otmp.quan === 1)
        uqwepgone({ state });
    if (otmp === state.uswapwep && otmp.quan === 1)
        uswapwepgone({ state });

    if (otmp === state.uball)
        note_unported('ball.c unpunish');
    if (otmp === state.uchain) {
        note_unported('ball.c unpunish');
    } else if (carried(otmp)) {
        useup(otmp, env);
    } else {
        await useupf(otmp, 1, env);
    }
}

// C ref: eat.c doeat_nonfood() (2734-2813).  This is the return-valued
// dependency of doeat(): a compatible polymorphed form gets exactly one turn
// of nutrition, conduct updates, poisoned-weapon handling and then the common
// eatspecial() tail.  Callers pass the same operation seams as ordinary food
// so death and status output cannot escape a planning clone.
export async function doeat_nonfood(otmp, state = game, env = {}) {
    const u = state.u;
    const meal = victual(state);
    let nodelicious = false;
    let ll_conduct = 0;
    const type = objectType(otmp, state);

    meal.reqtime = 1;
    meal.piece = otmp;
    meal.o_id = otmp.o_id;
    meal.usedtime = 0;
    meal.canchoke = u.uhs === SATIATED ? 1 : 0;

    let basenutrit;
    if (otmp.oclass === COIN_CLASS) {
        basenutrit = otmp.quan > 200000
            ? 2000 : Math.trunc(otmp.quan / 100);
    } else if (otmp.oclass === BALL_CLASS || otmp.oclass === CHAIN_CLASS) {
        basenutrit = weight(otmp, { state });
    } else {
        basenutrit = Math.trunc(type.oc_nutrition ?? 0);
    }
    if (otmp.otyp === SCR_MAIL) {
        basenutrit = 0;
        nodelicious = true;
    }
    meal.nmod = basenutrit;
    meal.eating = 1;

    u.uconduct ??= {};
    if (!(u.uconduct.food ?? 0)) {
        ll_conduct++;
        livelog_printf(
            LL_CONDUCT,
            `ate for the first time (${food_xname(otmp, false, state)})`,
            state,
        );
    }
    u.uconduct.food = Math.trunc(u.uconduct.food ?? 0) + 1;

    const material = type.oc_material;
    if (material === LEATHER || material === BONE
        || material === DRAGON_HIDE || material === WAX) {
        if (!(u.uconduct.unvegan ?? 0) && !ll_conduct) {
            livelog_printf(
                LL_CONDUCT,
                `consumed animal products for the first time, by eating ${an(food_xname(otmp, false, state))}`,
                state,
            );
            ll_conduct++;
        }
        u.uconduct.unvegan = Math.trunc(u.uconduct.unvegan ?? 0) + 1;
        if (material !== WAX) {
            if (!(u.uconduct.unvegetarian ?? 0) && !ll_conduct)
                livelog_printf(
                    LL_CONDUCT,
                    `tasted meat by-products for the first time, by eating ${an(food_xname(otmp, false, state))}`,
                    state,
                );
            await violated_vegetarian(state);
        }
    }

    if (otmp.cursed) {
        await rottenfood(otmp, state);
        nodelicious = true;
    } else if (material === PAPER) {
        nodelicious = true;
    }

    if (otmp.oclass === WEAPON_CLASS && otmp.opoisoned) {
        await env.message('Ecch - that must have been poisonous!', state);
        if (!propertyActive(state, POISON_RES)) {
            await poison_strdmg(
                rnd(4), rnd(15), xnameFresh(otmp, state), KILLED_BY_AN,
                state,
                {
                    losehp: (n, killer, format) =>
                        losehp(n, killer, format, state, env),
                    encumberMessage: (target) => encumber_msg(target),
                },
            );
            if (state.program_state?.gameover) return ECMD_TIME;
        } else {
            await env.message('You seem unaffected by the poison.', state);
        }
    } else if (!nodelicious) {
        const prefix = obj_is_pname(otmp, state)
            && (otmp.oartifact ?? 0) < ART_ORB_OF_DETECTION ? '' : 'This ';
        const name = otmp.oclass === COIN_CLASS
            ? foodword(otmp, state)
            : singular(otmp, xnameFresh, state);
        await env.message(`${prefix}${name} is delicious!`, state);
    }

    await eatspecial(state, env);
    return ECMD_TIME;
}

// C ref: eat.c doeat() (2815-3084), the #eat command. A glob, a tin and a
// resumed meal each stop at their own arm below, and so does anything the
// ordinary path cannot reach.
//
// `env` supplies statusRefresh(), which newuhs() calls as C's bot(); the other
// two operations newuhs() needs are this file's own.
export async function doeat(state = game, env = {}) {
    const u = state.u;
    const eatEnv = eatOperations(state, env.statusRefresh, env.message);

    if (u.uprops[STRANGLED].intrinsic) {
        await ttyPline(
            "If you can't breathe air, how can you consume solids?",
            state,
        );
        return ECMD_OK;
    }
    let otmp = await floorfood('eat', 0, state);
    if (!otmp)
        return ECMD_OK;
    if (await check_capacity(null, state))
        return ECMD_OK;

    if (u.uedibility) {
        // edibility_prompts() reads the corpse age, the petrification and
        // slime tests and eight message arms, and then asks yn_function().
        // Only blessed food detection sets u.uedibility, and neither the
        // potion nor the scroll that grants it is ported.
        throw new UnsupportedEatError('edibility_prompts()');
    }

    /* from floorfood(), &hands_obj means iron bars at current spot; the
       metallivorous arm treats this as digging rather than as an object meal. */
    if (otmp === hands_obj) {
        if (await still_chewing(u.ux, u.uy, state)
            && state.level.at(u.ux, u.uy).typ === IRONBARS) {
            await ttyPline('You pause to swallow.', state);
        }
        return ECMD_TIME;
    }

    /* We have to make non-foods take 1 move to eat, unless we want to
     * do ridiculous amounts of coding to deal with partly eaten plate
     * mails, players who polymorph back to human in the middle of their
     * metallic meal, etc....
     */
    if (!is_edible(otmp, state)) {
        await ttyPline('You cannot eat that!', state);
        return ECMD_OK;
    } else if ((otmp.owornmask
        & (W_ARMOR | W_TOOL | W_AMUL | W_SADDLE)) !== 0) {
        // C answers You_cant("eat %s you're wearing.", something). is_edible()
        // admits only FOOD_CLASS above, and no comestible can carry any of
        // those four masks, so this arm has no reachable input.
        throw new UnsupportedEatError("doeat()'s worn-object arm");
    }
    // C ref: `!(carried(otmp) ? retouch_object(&otmp, FALSE)
    //           : touch_artifact(otmp, &gy.youmonst))`, which spends a turn
    // when the hero is blasted. floorfood() cannot answer a floor object, and
    // artifact.c retouch_object() (2510-2528) returns 1 with no side effect
    // for anything that is neither an artifact nor SILVER carried against
    // Hate_silver. objects.h's FOOD rows are ten FLESH, twenty-one VEGGY and
    // the METAL tin (1117), so none is SILVER, and no food is an artifact.
    // The stop below keeps that derivation honest.
    if (otmp.oartifact)
        throw new UnsupportedEatError('retouch_object() for an artifact');

    // C ref: eat.c rust-monster arm (2876-2907).  A rust monster can eat a
    // rustproof metallic object, but spits it back out without nutrition.
    // make_stunned() is a discarded void call whose potion.c
    // owner is not yet ported, so record that source gap at the call site.
    if (isMetallic(otmp, state)
        && u.umonnum === PM_RUST_MONSTER && otmp.oerodeproof) {
        otmp.rknown = true;
        if ((otmp.quan ?? 1) > 1) {
            if (!carried(otmp))
                splitobj(otmp, otmp.quan - 1, { state });
            else
                otmp = splitobj(otmp, 1, { state });
        }
        await eatEnv.message(
            `Ulch - that ${xnameFresh(otmp, state)} was rustproofed!`, state,
        );
        otmp.oerodeproof = 0;
        // eat.c evaluates the timeout argument before make_stunned(). This
        // caller-owned draw remains even while the stun effect is unported.
        rn2(10);
        note_unported('potion.c make_stunned');
        if (welded(otmp, state)
            || (otmp.cursed
                && (otmp.owornmask & (W_RINGL | W_RINGR)))) {
            set_bknown(otmp, 1, { state });
            await eatEnv.message(
                `You spit out ${the(xnameFresh(otmp, state), state)}.`, state,
            );
        } else {
            await eatEnv.message(
                `You spit ${the(xnameFresh(otmp, state), state)} out onto the ${surface(u.ux, u.uy, state)}.`,
                state,
            );
            if (carried(otmp)) {
                if (otmp.owornmask)
                    await remove_worn_item(otmp, false, state);
                freeinv(otmp, eatEnv);
                await dropy(otmp, {
                    ...eatEnv,
                    hooks: {
                        ...eatEnv.hooks,
                        encumberMessage: encumber_msg,
                        extractExternalObject: remove_object,
                        newsym,
                    },
                });
            }
            stackobj(otmp, eatEnv);
        }
        return ECMD_TIME;
    }

    // C ref: eat.c RIN_SLOW_DIGESTION arm (2909-2916). rottenfood() is
    // complete; trycall() is the source's identification side effect and is
    // only reached when the ring was already described to the hero.
    if (otmp.otyp === RIN_SLOW_DIGESTION) {
        await eatEnv.message('This ring is indigestible!', state);
        await rottenfood(otmp, state);
        if (otmp.dknown)
            await trycall(otmp, state);
        return ECMD_TIME;
    }

    if (otmp.oclass !== FOOD_CLASS)
        return doeat_nonfood(otmp, state, eatEnv);

    if (otmp === victual(state).piece) {
        // A meal interrupted and then resumed, which needs touchfood() against
        // a partly eaten piece and the "You resume your meal." wording. Only a
        // meal of more than one turn can be interrupted.
        throw new UnsupportedEatError("doeat()'s resumed meal");
    }

    /* nothing in progress - so try to find something. */
    /* tins are a special case */
    /* tins must also check conduct separately in case they're discarded */
    if (otmp.otyp === TIN) {
        await start_tin(otmp, state, eatEnv);
        return ECMD_TIME;
    }

    // C ref: `if (!u.uconduct.food++) livelog_printf(...)`. The chronicle is
    // state; only the external live-log sink is unavailable.
    let ll_conduct = 0;
    if (!(u.uconduct.food ?? 0)) {
        livelog_printf(
            LL_CONDUCT,
            `ate for the first time - ${food_xname(otmp, false, state)}`,
            state,
        );
        ll_conduct++;
    }
    u.uconduct.food = Math.trunc(u.uconduct.food ?? 0) + 1;

    const already_partly_eaten = Boolean(otmp.oeaten);
    if (already_partly_eaten) {
        // Only an interrupted meal leaves oeaten set on an object doeat() then
        // meets fresh; the resume arm above covers the rest.
        throw new UnsupportedEatError("doeat()'s partly eaten food");
    }
    otmp = touchfood(otmp, eatEnv);
    const meal = victual(state);
    meal.piece = otmp;
    meal.o_id = otmp.o_id;
    meal.usedtime = 0;

    /* Now we need to calculate delay and nutritional info.
     * The base nutrition calculated here and in eatcorpse() accounts
     * for normal vs. rotten food.  The reqtime and nutrit values are
     * then adjusted in accordance with the amount of food left.
     */
    // eatcorpse() answers 1 after rottenfood() fainting and 2 when the
    // corpse is used up (no nutrition after rotting, or tainted).  The
    // make_sick() taint path still stops inside eatcorpse().
    let dont_start = false;
    if (otmp.otyp === CORPSE || otmp.globby) {
        const tmp = await eatcorpse(otmp, state);

        if (tmp === 2) {
            /* used up */
            state.context.victual = zero_victual();
            return ECMD_TIME;
        } else if (tmp) {
            dont_start = true;
        }
        /* if not used up, eatcorpse sets up reqtime and may modify oeaten */
    } else {
        /* No checks for WAX, LEATHER, BONE, DRAGON_HIDE.  These are
         * all handled in the != FOOD_CLASS case, above.
         */
        if (objectType(otmp, state).oc_material === FLESH) {
            if (!(u.uconduct.unvegan ?? 0) && !ll_conduct) {
                livelog_printf(
                    LL_CONDUCT,
                    `consumed animal products for the first time, by eating ${an(food_xname(otmp, false, state))}`,
                    state,
                );
                ll_conduct++;
            }
            u.uconduct.unvegan = Math.trunc(u.uconduct.unvegan ?? 0) + 1;
            if (otmp.otyp !== EGG) {
                if (!(u.uconduct.unvegetarian ?? 0) && !ll_conduct)
                    livelog_printf(
                        LL_CONDUCT,
                        `tasted meat for the first time, by eating ${an(food_xname(otmp, false, state))}`,
                        state,
                    );
                await violated_vegetarian(state);
            }
        } else if (otmp.otyp === PANCAKE
            || otmp.otyp === FORTUNE_COOKIE /*eggs*/
            || otmp.otyp === CREAM_PIE || otmp.otyp === CANDY_BAR /*milk*/
            || otmp.otyp === LUMP_OF_ROYAL_JELLY) {
            if (!(u.uconduct.unvegan ?? 0) && !ll_conduct)
                livelog_printf(
                    LL_CONDUCT,
                    `consumed animal products (${food_xname(otmp, false, state)}) for the first time`,
                    state,
                );
            u.uconduct.unvegan = Math.trunc(u.uconduct.unvegan ?? 0) + 1;
        }

        meal.reqtime = objectType(otmp, state).oc_delay;
        if (otmp.otyp !== FORTUNE_COOKIE
            && (otmp.cursed || (!nonrotting_food(otmp.otyp)
                && (state.moves - otmp.age) > (otmp.blessed ? 50 : 30)
                && (otmp.orotten || !rn2(7))))) {
            if (await rottenfood(otmp, state)) {
                otmp.orotten = true;
                dont_start = true;
            }
            consume_oeaten(otmp, 1, state); /* oeaten >>= 1 */
        } else if (!already_partly_eaten) {
            if (!await fprefx(otmp, state)) {
                throw new UnsupportedEatError('do_reset_eat() after fprefx()');
            }
        } else {
            // You("%s %s.", reqtime == 1 ? "eat" : "begin eating",
            // doname(otmp)); unreachable: the partly eaten stop above precedes
            // it.
            throw new UnsupportedEatError("doeat()'s resumed-meal wording");
        }
    }

    /* re-calc the nutrition */
    const basenutrit = obj_nutrition(otmp, state);

    meal.reqtime = basenutrit === 0
        ? 0
        : rounddiv(meal.reqtime * otmp.oeaten, basenutrit);

    /*
     * calculate the modulo value (nutrit. units per round eating)
     * note: this isn't exact - you actually lose a little nutrition due
     *       to this method.
     */
    if (meal.reqtime === 0 || otmp.oeaten === 0) {
        /* possible if most has been eaten before */
        meal.nmod = 0;
    } else if (otmp.oeaten >= meal.reqtime) {
        meal.nmod = -Math.trunc(otmp.oeaten / meal.reqtime);
    } else {
        meal.nmod = meal.reqtime % otmp.oeaten;
    }
    meal.canchoke = u.uhs === SATIATED ? 1 : 0;

    if (!dont_start) {
        await start_eating(otmp, already_partly_eaten, state, eatEnv);
    } else {
        otmp.owt = weight(otmp, eatEnv);
    }
    return ECMD_TIME;
}
