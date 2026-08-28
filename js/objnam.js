// Runtime object naming for the early movement, pet, trap, and combat paths.
// C refs: objnam.c xname(), corpse_xname(), minimal_xname(), simpleonames(),
// doname(), distant_name(), cxname(), The(), aobjnam(), otense(), singular(),
// yname() and Yname2().
//
// objnam.c is split across two files. Its wish-parsing group lives in
// js/objnam_readobjnam.js: readobjnam() and its five-function chain,
// wishymatch(), rnd_otyp_by_namedesc() and the o_ranges[], spellings[], wrp[]
// and wrpsym[] tables. Neither file imports the other. That file reaches the
// objects[] tables through js/objects.js OBJ_NAME() and OBJ_DESCR(), and
// object construction through js/obj.js.

import {
    ART_EYES_OF_THE_OVERWORLD, ART_ORB_OF_DETECTION, artifact_name,
    find_artifact,
    permapoisoned,
} from './artifacts.js';
import {
    BLINDED, CORPSTAT_FEMALE, CORPSTAT_GENDER, CORPSTAT_HISTORIC,
    CORPSTAT_MALE, CORPSTAT_RANDOM, CXN_ARTICLE, CXN_NOCORPSE, CXN_NORMAL,
    CXN_NO_PFX, CXN_PFX_THE, CXN_SINGULAR, FEMALE, HALLUC, HALLUC_RES, HAND,
    MALE, NEUTRAL, NON_PM,
    P_BOW, W_AMUL, W_ARMOR, W_QUIVER, W_RING, W_RINGR, W_SADDLE,
    W_SWAPWEP, W_TOOL, W_WEP,
} from './const.js';
import {
    fruit_from_indx, fruit_from_name, makeplural, makesingular,
    matching_artifact_fruit,
} from './fruit.js';
import { obj_pmname, pmname } from './do_name.js';
import { tin_details } from './eat.js';
import { game } from './gstate.js';
import {
    digit, dist2, highc, lowc, mungspaces, s_suffix, strcasecpy, strstri,
} from './hacklib.js';
import { get_obj_location } from './light.js';
import { cansee } from './vision.js';
import { body_part } from './polyself.js';
import { RIGHT_HANDED } from './u_init.js';
import { bimanual } from './worn.js';
import {
    G_UNIQ, PM_CLERIC, PM_HIGH_CLERIC, PM_LONG_WORM_TAIL, PM_SAMURAI,
    PM_WIZARD_OF_YENDOR,
} from './monsters.js';
import { type_is_pname } from './mondata.js';
import { genders } from './roles.js';
import { CapitalMon } from './random_text.js';
import { observe_object } from './o_init.js';
import {
    carried, erosionMatters, hasContents, isBox, isCandle, isContainer,
    isCorrodeable, isCrackable,
    isDamageable, isFlammable, isMultigen, isRottable, isRustprone,
    is_ammo, is_missile, is_weptool, objectType,
} from './obj.js';
import { JAPANESE_ITEM_NAMES } from './objnam_data.js';
import {
    AKLYS,
    ALCHEMY_SMOCK, AMULET_CLASS, AMULET_OF_YENDOR, ARMOR_CLASS, ARM_BOOTS,
    ARM_CLOAK, ARM_SUIT, ARM_SHIRT,
    BAG_OF_TRICKS,
    ARM_GLOVES, ARM_HELM, ARM_SHIELD, BALL_CLASS,
    BLACK_OPAL, BOULDER, BRASS_LANTERN, CANDELABRUM_OF_INVOCATION, CHAIN_CLASS,
    CHEST, COIN_CLASS, CORPSE, CRYSKNIFE, DIAMOND, DILITHIUM_CRYSTAL, EGG,
    ELVEN_SHIELD, EMERALD, FAKE_AMULET_OF_YENDOR, FIGURINE, FLINT, FOOD_CLASS,
    GEMSTONE, GEM_CLASS, GRAY_DRAGON_SCALE_MAIL, GRAY_DRAGON_SCALES, IRON,
    LARGE_BOX, LENSES, MAGIC_HARP, MAGIC_LAMP, MINERAL, MITHRIL,
    MAXOCLASSES,
    MUMMY_WRAPPING, OBJ_DESCR, OBJ_NAME, OIL_LAMP, OPAL, ORCISH_SHIELD,
    POTION_CLASS, POT_OIL, POT_WATER, RING_CLASS, ROBE, ROCK_CLASS, RUBY,
    SAPPHIRE, SCR_MAIL, SCROLL_CLASS, SHIELD_OF_REFLECTION, SLIME_MOLD,
    SPBOOK_CLASS, SPE_BOOK_OF_THE_DEAD, SPE_NOVEL, STATUE, TIN, TOOL_CLASS,
    TOWEL, VENOM_CLASS, WAND_CLASS, WEAPON_CLASS, WOODEN_HARP,
    YELLOW_DRAGON_SCALE_MAIL, YELLOW_DRAGON_SCALES,
    HORN_OF_PLENTY,
} from './objects.js';
import {
    get_cost_of_shop_item,
    record_price_quote,
    shk_your,
} from './shk.js';
// wield.js holds the port's single reading of youprop.h:112 Glib. It imports
// naming helpers from this file in turn; the cycle is safe because neither
// side calls the other during module evaluation.
import { Glib } from './wield.js';

export class UnsupportedObjectNameError extends Error {
    constructor(branch, obj) {
        super(`unsupported object name branch: ${branch}`);
        this.name = 'UnsupportedObjectNameError';
        this.branch = branch;
        this.object = obj;
    }
}
function unsupported(branch, obj) {
    throw new UnsupportedObjectNameError(branch, obj);
}
function heroIsBlind(state) {
    const blinded = state.u?.uprops?.[BLINDED];
    return Boolean((blinded?.intrinsic || blinded?.extrinsic)
        && !blinded?.blocked);
}

// C ref: objnam.c an(), whose article comes from just_an(). That helper is
// defined below with the other name formatters; C's own an() returns the
// article joined to the name, which is what this returns.
function articleName(text) {
    return an(text);
}
// C ref: obj.h is_poisonable() (264-268). The first disjunct repeats
// is_multigen()'s three terms verbatim, so it is written as that call here.
export function isPoisonable(obj, state) {
    return isMultigen(obj, state) || permapoisoned(obj);
}
// C ref: objnam.h GemStone(). Its argument is an object type, not an object.
function isGemStone(otyp, type) {
    if (otyp === FLINT) return true;
    if (type.oc_material !== GEMSTONE) return false;
    return otyp !== DILITHIUM_CRYSTAL
        && otyp !== RUBY
        && otyp !== DIAMOND
        && otyp !== SAPPHIRE
        && otyp !== BLACK_OPAL
        && otyp !== EMERALD
        && otyp !== OPAL;
}
function sourceActualName(obj, type, state) {
    if (state.urole?.mnum === PM_SAMURAI)
        return JAPANESE_ITEM_NAMES.get(obj.otyp) ?? OBJ_NAME(type, state);
    return OBJ_NAME(type, state);
}
function sourceDescription(obj, type, state, actual) {
    if (state.urole?.mnum === PM_SAMURAI
        && (obj.otyp === WOODEN_HARP || obj.otyp === MAGIC_HARP)) {
        return 'koto';
    }
    return OBJ_DESCR(type, state) ?? actual;
}

// C ref: objnam.c obj_typename(). Names an object type rather than an object,
// which is what the discoveries list shows. A type carrying oc_uname reaches
// xcalled() in four of the branches below; no ported path assigns one, and
// naming the type without the call would be wrong, so it stops instead.
export function obj_typename(otyp, state = game) {
    const ocl = state.objects[otyp];
    let actualn = OBJ_NAME(ocl, state);
    let dn = OBJ_DESCR(ocl, state);
    const un = ocl.oc_uname;
    let nn = ocl.oc_name_known;

    if (state.urole?.mnum === PM_SAMURAI) {
        actualn = JAPANESE_ITEM_NAMES.get(otyp) ?? actualn;
        if (otyp === WOODEN_HARP || otyp === MAGIC_HARP) dn = 'koto';
    }
    // Generic items carry no actual name and should never reach here; C
    // substitutes a placeholder rather than asserting, so this does too.
    if (!actualn)
        actualn = (otyp > 0 && otyp < MAXOCLASSES) ? 'generic' : 'object?';
    if (un) unsupported('user-assigned type name', null);

    let buf = '';
    switch (ocl.oc_class) {
    case COIN_CLASS:
        return actualn;
    case POTION_CLASS:
        buf = 'potion';
        break;
    case SCROLL_CLASS:
        buf = 'scroll';
        break;
    case WAND_CLASS:
        buf = 'wand';
        break;
    case SPBOOK_CLASS:
        if (otyp !== SPE_NOVEL) {
            buf = 'spellbook';
        } else {
            buf = !nn ? 'book' : 'novel';
            nn = 0;
        }
        break;
    case RING_CLASS:
        buf = 'ring';
        break;
    case AMULET_CLASS:
        buf = nn ? actualn : 'amulet';
        if (dn) buf += ` (${dn})`;
        return buf;
    case ARMOR_CLASS:
        if (ocl.oc_armcat === ARM_GLOVES || ocl.oc_armcat === ARM_BOOTS)
            buf = 'pair of ';
        else if (otyp >= GRAY_DRAGON_SCALES && otyp <= YELLOW_DRAGON_SCALES)
            buf = 'set of ';
    // FALLTHROUGH
    default:  
        if (nn) {
            buf += actualn;
            if (isGemStone(otyp, ocl)) buf += ' stone';
            if (dn) buf += ` (${dn})`;
        } else {
            buf += dn || actualn;
            if (ocl.oc_class === GEM_CLASS)
                buf += ocl.oc_material === MINERAL ? ' stone' : ' gem';
        }
        return buf;
    }
    // Here for ring, scroll, potion, wand, and spellbook.
    if (nn) {
        // oc_unique keeps the Book of the Dead from becoming "spellbook of
        // Book of the Dead".
        buf = ocl.oc_unique ? actualn : `${buf} of ${actualn}`;
    }
    if (dn) buf += ` (${dn})`;
    return buf;
}

// C ref: objnam.c simple_typename() (296-307). Either the actual name or the
// description, never both, and never the name the player gave the type.
//
// C suppresses that user-assigned name by clearing objects[otyp].oc_uname
// around the obj_typename() call and putting it back afterwards, and the port
// does the same rather than passing a flag: obj_typename() reads the catalog
// entry, and it stops with 'user-assigned type name' for an entry that still
// carries one, so a port that skipped the clear would refuse a named type
// where C answers.
export function simple_typename(otyp, state = game) {
    const ocl = state.objects[otyp];
    const save_uname = ocl.oc_uname;

    ocl.oc_uname = 0; /* suppress any name given by user */
    const bufp = obj_typename(otyp, state);
    ocl.oc_uname = save_uname;
    const pp = bufp.indexOf(' (');
    /* strip the appended description */
    return pp >= 0 ? bufp.slice(0, pp) : bufp;
}

// C refs: objnam.c suit_simple_name(), cloak_simple_name(),
// helm_simple_name(), and gloves_simple_name().
export function suit_simple_name(suit, state = game) {
    if (!suit) return 'suit';
    if (suit.otyp >= GRAY_DRAGON_SCALE_MAIL
        && suit.otyp <= YELLOW_DRAGON_SCALE_MAIL) {
        return 'dragon mail';
    }
    if (suit.otyp >= GRAY_DRAGON_SCALES
        && suit.otyp <= YELLOW_DRAGON_SCALES) {
        return 'dragon scales';
    }
    const name = OBJ_NAME(objectType(suit, state), state) ?? '';
    if (name.endsWith(' mail')) return 'mail';
    if (name.endsWith(' jacket')) return 'jacket';
    return 'suit';
}

export function cloak_simple_name(cloak, state = game) {
    if (!cloak) return 'cloak';
    if (cloak.otyp === ROBE) return 'robe';
    if (cloak.otyp === MUMMY_WRAPPING) return 'wrapping';
    if (cloak.otyp === ALCHEMY_SMOCK) {
        const type = objectType(cloak, state);
        return type.oc_name_known && cloak.dknown ? 'smock' : 'apron';
    }
    return 'cloak';
}

export function helm_simple_name(helmet, state = game) {
    if (!helmet) return 'hat';
    const type = objectType(helmet, state);
    const isHelmet = helmet.oclass === ARMOR_CLASS
        && type.oc_armcat === ARM_HELM;
    const metallic = type.oc_material >= IRON
        && type.oc_material <= MITHRIL;
    return isHelmet && (metallic || isCrackable(helmet, state))
        ? 'helm'
        : 'hat';
}

export function gloves_simple_name(gloves, state = game) {
    if (!gloves?.dknown) return 'gloves';
    const type = objectType(gloves, state);
    const name = type.oc_name_known
        ? OBJ_NAME(type, state)
        : OBJ_DESCR(type, state);
    return name?.toLowerCase().includes('gauntlets')
        ? 'gauntlets'
        : 'gloves';
}

// C ref: objnam.c boots_simple_name() (5551-5566). Returns "shoes" when the
// description or the discovered name contains that word; "boots" otherwise.
export function boots_simple_name(boots, state = game) {
    if (boots?.dknown) {
        const type = objectType(boots, state);
        const actualn = OBJ_NAME(type, state) ?? '';
        const descrpn = OBJ_DESCR(type, state) ?? '';
        if (strstri(descrpn, 'shoes')
            || (type.oc_name_known && strstri(actualn, 'shoes')))
            return 'shoes';
    }
    return 'boots';
}

// C ref: objnam.c shield_simple_name() (5570-5596).
export function shield_simple_name(shield, _state = game) {
    if (shield) {
        if (shield.otyp === SHIELD_OF_REFLECTION)
            return shield.dknown ? 'silver shield' : 'smooth shield';
    }
    return 'shield';
}

// C ref: objnam.c shirt_simple_name() (5600-5603).
export function shirt_simple_name(_shirt, _state = game) {
    return 'shirt';
}

// C ref: objnam.c armor_simple_name() (5435-5468). Dispatches to the
// category-specific simple-name function for the armor's category.
export function armor_simple_name(armor, state = game) {
    const type = objectType(armor, state);
    switch (type.oc_armcat) {
    case ARM_SUIT:    return suit_simple_name(armor, state);
    case ARM_CLOAK:   return cloak_simple_name(armor, state);
    case ARM_HELM:    return helm_simple_name(armor, state);
    case ARM_GLOVES:  return gloves_simple_name(armor, state);
    case ARM_BOOTS:   return boots_simple_name(armor, state);
    case ARM_SHIELD:  return shield_simple_name(armor, state);
    case ARM_SHIRT:   return shirt_simple_name(armor, state);
    default:          return simpleonames(armor, state);
    }
}
// C refs: objnam.c xname_flags():632-639, doname_base():1254-1262,
// the_unique_obj():1108-1110 and add_erosion_words():1148. Each of those four
// reads iflags.override_ID for itself and substitutes TRUE for one or more of
// the object's identification flags; this collects the substitution all four
// make, so that a formatter below reads the effective flag instead of the
// stored one.
//
// Two further readings choose no flag at all, so both read the counter
// directly instead: objnam.c obj_is_pname():337 skips not_fully_identified(),
// which obj_is_pname() below spells as an early return, and eat.c
// tin_details():1442 belongs to js/eat.js, which xname() reaches from here.
//
// The counter has four writers in C, and half of them treat it as a boolean.
// invent.c reroll_menu():2580 increments it around its naming loop, so that
// the startup menu shows a full description of a kit the hero has not
// identified, and mkobj.c insane_object():3325 increments it around the
// doname() inside an impossible() diagnostic. wizcmds.c wiz_identify():53 and
// objnam.c actualoname():2494 assign: the first stores the command's own key,
// which invent.c display_pickinv():3249 offers as a menu accelerator and which
// is why the counter is an int rather than a boolean, and the second stores
// TRUE and then FALSE. A fifth site, invent.c:3391, assigns 0 with no matching
// raise, to keep a recursive perm_invent update out of the wizard-ID filter.
//
// Only reroll_menu() is ported. An assignment clobbers an outer raise where a
// decrement would restore it, so porting either assigning writer means
// deciding what happens when it runs inside reroll_menu()'s increment rather
// than nesting it there.
function identificationFlags(obj, type, state) {
    if (state.iflags?.override_ID) {
        return {
            known: true,
            dknown: true,
            cknown: true,
            bknown: true,
            lknown: true,
            rknown: true,
            // C's local `nn`, which starts at objects[otyp].oc_name_known.
            nameKnown: true,
        };
    }
    return {
        known: Boolean(obj.known),
        dknown: Boolean(obj.dknown),
        cknown: Boolean(obj.cknown),
        bknown: Boolean(obj.bknown),
        lknown: Boolean(obj.lknown),
        rknown: Boolean(obj.rknown),
        nameKnown: Boolean(type.oc_name_known),
    };
}

function preflightXname(obj, type, state) {
    if (state.program_state?.gameover)
        unsupported('end-of-game object text', obj);
    if (type.oc_uname)
        unsupported('user-assigned type name', obj);
}

function preflightDoname(obj, type, state, allowLiveShopPrice) {
    preflightXname(obj, type, state);
    const { cknown } = identificationFlags(obj, type, state);
    if (obj.unpaid)
        unsupported('shop price suffix', obj);
    if (!allowLiveShopPrice && state.iflags?.pricequotes && !type.oc_name_known)
        unsupported('price quote suffix', obj);
    // objnam.c:1563 and :1592. wornSuffix() below ports the "wielded in" and
    // "weapon in" arms of that word choice; "tethered to" would also have to
    // follow the aklys back to the hand it is attached to, so it still stops.
    if ((obj.owornmask & W_WEP) && obj.otyp === AKLYS)
        unsupported('tethered weapon suffix', obj);
    // objnam.c:1391 names uskin " (embedded in your skin)" instead of
    // " (being worn)". wornSuffix() below emits only the latter, so dragon
    // scales fused to a polymorphed hero must still refuse. Only two lines
    // set uskin: polyself.c break_armor():656, which fuses them, and
    // worn.c setworn():80, which restores the fusion from a saved game.
    // Neither is ported, so nothing reaches this today.
    if ((obj.owornmask & W_ARMOR) && obj === state.u?.uskin)
        unsupported('skin-embedded armor suffix', obj);
    if (obj.owornmask && obj.lamplit)
        unsupported('lit worn-object suffix', obj);
    // C names a container's contents only when it holds some; counting them
    // is pickup.c count_contents(), which is not ported.
    if (cknown && hasContents(obj))
        unsupported('container contents count', obj);
    // These two judge emptiness by charges rather than contents, and the
    // charge suffix that makes the prefix redundant is a separate branch.
    if (cknown
        && (obj.otyp === BAG_OF_TRICKS || obj.otyp === HORN_OF_PLENTY)) {
        unsupported('charge-based emptiness', obj);
    }
    if (isCandle(obj) && obj.lamplit)
        unsupported('lit candle timer adjustment', obj);
}
function xnameBase(obj, type, state, ident) {
    const knownType = ident.nameKnown;
    const dknown = ident.dknown;
    const actual = sourceActualName(obj, type, state) ?? 'object?';
    const description = sourceDescription(obj, type, state, actual);

    switch (obj.oclass) {
    case AMULET_CLASS:
        if (!dknown) return 'amulet';
        if (obj.otyp === AMULET_OF_YENDOR
            || obj.otyp === FAKE_AMULET_OF_YENDOR) {
            return ident.known ? actual : description;
        }
        if (knownType) return actual;
        return `${description} amulet`;
    case WEAPON_CLASS:
    case VENOM_CLASS:
    case TOOL_CLASS: {
        let prefix = '';
        if (obj.oclass === WEAPON_CLASS
            && isPoisonable(obj, state) && obj.opoisoned) {
            prefix = 'poisoned ';
        }
        if (obj.otyp === LENSES)
            prefix = 'pair of ';
        else if (obj.otyp === TOWEL && obj.spe > 0)
            prefix = obj.spe < 3 ? 'moist ' : 'wet ';
        let result = `${prefix}${!dknown
            ? description
            : knownType ? actual : description}`;
        if (obj.otyp === FIGURINE && obj.corpsenm !== NON_PM) {
            const species = obj_pmname(obj, state);
            result += ` of ${articleName(species)}`;
        }
        return result;
    }
    case ARMOR_CLASS: {
        if (obj.otyp >= GRAY_DRAGON_SCALES
            && obj.otyp <= YELLOW_DRAGON_SCALES) {
            return `set of ${actual}`;
        }
        let prefix = type.oc_armcat === ARM_BOOTS
            || type.oc_armcat === ARM_GLOVES ? 'pair of ' : '';
        if (type.oc_armcat === ARM_SHIELD && !dknown) {
            if (obj.otyp >= ELVEN_SHIELD && obj.otyp <= ORCISH_SHIELD)
                return 'shield';
            if (obj.otyp === SHIELD_OF_REFLECTION)
                return 'smooth shield';
        }
        const base = knownType ? actual : description;
        return `${prefix}${base}`;
    }
    case FOOD_CLASS:
        if (obj.otyp === SLIME_MOLD) {
            const fruit = fruit_from_indx(obj.spe, state);
            return fruit?.fname ?? 'fruit';
        }
        if (obj.globby) {
            const size = obj.owt <= 100 ? 'small'
                : obj.owt <= 300 ? 'medium'
                    : obj.owt <= 500 ? 'large' : 'very large';
            return `${size} ${actual}`;
        }
        // C ref: objnam.c xname(). `known` here is the object's own flag, set
        // when the hero knows what is inside the tin, not the type's.
        if (obj.otyp === TIN && ident.known)
            return tin_details(obj, obj.corpsenm, actual, { state });
        return actual;
    case COIN_CLASS:
    case CHAIN_CLASS:
        return actual;
    case ROCK_CLASS:
        if (obj.otyp === STATUE && obj.corpsenm !== NON_PM) {
            const species = obj_pmname(obj, state);
            const historic = state.urole?.filecode === 'Arc'
                && (obj.spe & CORPSTAT_HISTORIC) ? 'historic ' : '';
            return `${historic}${actual} of ${articleName(species)}`;
        }
        if (obj.otyp === BOULDER && obj.next_boulder === 1) {
            obj.next_boulder = 0;
            return `next ${actual}`;
        }
        return actual;
    case BALL_CLASS:
        return `${obj.owt > type.oc_weight ? 'very ' : ''}heavy iron ball`;
    case POTION_CLASS: {
        const prefix = dknown && obj.odiluted ? 'diluted ' : '';
        if (knownType || !dknown) {
            if (!dknown) return `${prefix}potion`;
            if (knownType) {
                const holy = obj.otyp === POT_WATER && ident.bknown
                    && (obj.blessed || obj.cursed)
                    ? `${obj.blessed ? 'holy' : 'unholy'} `
                    : '';
                return `${prefix}potion of ${holy}${actual}`;
            }
        }
        return `${prefix}${description} potion`;
    }
    case SCROLL_CLASS:
        if (!dknown) return 'scroll';
        if (knownType) return `scroll of ${actual}`;
        return type.oc_magic
            ? `scroll labeled ${description}`
            : `${description} scroll`;
    case WAND_CLASS:
        if (!dknown) return 'wand';
        if (knownType) return `wand of ${actual}`;
        return `${description} wand`;
    case SPBOOK_CLASS:
        if (obj.otyp === SPE_NOVEL) {
            if (!dknown) return 'book';
            if (knownType) return actual;
            return `${description} book`;
        }
        if (!dknown) return 'spellbook';
        if (knownType)
            return `${obj.otyp === SPE_BOOK_OF_THE_DEAD
                ? '' : 'spellbook of '}${actual}`;
        return `${description} spellbook`;
    case RING_CLASS:
        if (!dknown) return 'ring';
        if (knownType) return `ring of ${actual}`;
        return `${description} ring`;
    case GEM_CLASS: {
        const rock = type.oc_material === MINERAL ? 'stone' : 'gem';
        if (!dknown) return rock;
        if (!knownType) {
            return `${description} ${rock}`;
        }
        return `${actual}${isGemStone(obj.otyp, type) ? ' stone' : ''}`;
    }
    default:
        unsupported(`object class ${obj.oclass}`, obj);
    }
}
// C ref: objnam.c not_fully_identified() (1787-1818). Callers which already
// resolved the type use the private third argument; the public shape matches
// C and resolves objects[obj->otyp] here.
export function not_fully_identified(obj, state = game, resolvedType = null) {
    const type = resolvedType ?? objectType(obj, state);
    if (obj.oclass === COIN_CLASS) return false;
    if (!obj.known || !obj.dknown
        || (!obj.bknown && obj.otyp !== SCR_MAIL)
        || !type.oc_name_known) {
        return true;
    }
    if ((!obj.cknown && (isContainer(obj) || obj.otyp === STATUE))
        || (!obj.lknown
            && (obj.otyp === LARGE_BOX || obj.otyp === CHEST))) {
        return true;
    }
    if (obj.oartifact && !state.artiexist?.[obj.oartifact]?.found)
        return true;
    if (obj.rknown
        || (obj.oclass !== ARMOR_CLASS
            && obj.oclass !== WEAPON_CLASS
            && !is_weptool(obj, state)
            && obj.oclass !== BALL_CLASS)) {
        return false;
    }
    return isDamageable(obj, state);
}
// C ref: objnam.c obj_is_pname() (332-342). Whether an object's name stands on
// its own as a proper name, so that a caller writes "the Excalibur" rather than
// "an Excalibur". :337 skips the not_fully_identified() test while
// iflags.override_ID is raised, so an artifact the hero has not identified
// still answers by its own name.
//
// Its four callers are xname_flags(), doname_base() and yname() below, and
// do_wear.c on_msg(). C reads objects[obj->otyp] inside not_fully_identified()
// rather than taking it as an argument, so this looks the type up for itself
// the way every other exported name in this file does.
export function obj_is_pname(obj, state = game) {
    if (!obj.oartifact || !obj.oextra?.oname) return false;
    // C's guard at objnam.c:337 is a conjunction, and both halves skip the
    // identification test: `!program_state.gameover && !iflags.override_ID`.
    // Once the game is over the tombstone names an artifact whatever the hero
    // learned about it, which is why gameover suppresses the check rather than
    // only the wizard-mode override does.
    if (state.program_state?.gameover || state.iflags?.override_ID) return true;
    return !not_fully_identified(obj, state, objectType(obj, state));
}
// C ref: objnam.c the_unique_obj() (1106-1117).
// The public export resolves the type internally for callers that don't
// already have it, matching the C function's single-argument signature.
export function the_unique_obj(obj, state = game) {
    return theUniqueObject(obj, objectType(obj, state), state);
}
function theUniqueObject(obj, type, state) {
    const { known, dknown } = identificationFlags(obj, type, state);
    if (!dknown) return false;
    if (obj.otyp === FAKE_AMULET_OF_YENDOR && !known) return true;
    return Boolean(type.oc_unique
        && (known || obj.otyp === AMULET_OF_YENDOR));
}
// C ref: decl.c vowels[].
const VOWELS = 'aeiouAEIOU';

function startsWithFold(text, prefix) {
    return text.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
}

// C ref: objnam.c just_an(). Returns the article, with its trailing space,
// that an() would prepend, or the empty string where C leaves outbuf empty.
export function just_an(str) {
    const c0 = lowc(str[0] ?? '');
    if (!str[1] || str[1] === ' ') {
        // A single letter, as used for a named fruit or a musical note.
        return 'aefhilmnosx'.includes(c0) ? 'an ' : 'a ';
    }
    if (startsWithFold(str, 'the ')
        || str.toLowerCase() === 'molten lava'
        || str.toLowerCase() === 'iron bars'
        || str.toLowerCase() === 'ice') {
        return '';
    }
    // The normal case is "an <vowel>" or "a <consonant>".
    const vowelStart = VOWELS.includes(c0)
        // 'wun' initial sound
        && (!startsWithFold(str, 'one')
            || (str[3] && !'-_ '.includes(str[3])))
        // long 'u' initial sound
        && !startsWithFold(str, 'eu') // "eucalyptus leaf"
        && !startsWithFold(str, 'uke') && !startsWithFold(str, 'ukulele')
        && !startsWithFold(str, 'unicorn') && !startsWithFold(str, 'uranium')
        && !startsWithFold(str, 'useful'); // "useful tool"
    return (vowelStart || (c0 === 'x' && !VOWELS.includes(lowc(str[1]))))
        ? 'an ' : 'a ';
}

// C ref: objnam.c an(). C answers "an []" through impossible() for an empty
// name; nothing in the port can supply one, so that stays a thrown error.
export function an(str) {
    if (!str) throw new Error(`an() requires a name; got ${String(str)}`);
    return just_an(str) + str;
}

// C ref: objnam.c special_subjs[]. Singular subjects that end in 's'.
const SPECIAL_SUBJS = Object.freeze([
    'erinys', 'manes', /* this one is ambiguous */
    'Cyclops', 'Hippocrates', 'Pelias', 'aklys',
    'amnesia', 'detect monsters', 'paralysis', 'shape changers',
    'nemesis',
]);

// C ref: objnam.c vtense(). `verb` arrives in the plural, without a trailing
// s, and comes back agreeing with `subj`. A null subject asks for the
// singular third person directly.
export function vtense(subj, verb) {
    if (subj) {
        // C jumps straight to its `sing:` label for an "a "/"an " subject.
        if (!startsWithFold(subj, 'a ') && !startsWithFold(subj, 'an ')) {
            // C scans for the first " of "/" from "/" called "/" named "/
            // " labeled " and takes the character before it as the subject's
            // head; otherwise the head is the last character.
            let spot = -1;
            for (let index = subj.indexOf(' '); index >= 0;
                index = subj.indexOf(' ', index + 1)) {
                const tail = subj.slice(index);
                if (startsWithFold(tail, ' of ')
                    || startsWithFold(tail, ' from ')
                    || startsWithFold(tail, ' called ')
                    || startsWithFold(tail, ' named ')
                    || startsWithFold(tail, ' labeled ')) {
                    if (index !== 0) spot = index - 1;
                    break;
                }
            }
            if (spot < 0) spot = subj.length - 1;
            const endsWith = (offset, text) => (
                spot - offset >= 0
                && subj.slice(spot - offset, spot - offset + text.length)
                    .toLowerCase() === text
            );
            const plural = (lowc(subj[spot]) === 's' && spot !== 0
                    && !'us'.includes(lowc(subj[spot - 1])))
                || endsWith(3, 'eeth') || endsWith(3, 'feet')
                || endsWith(1, 'ia') || endsWith(1, 'ae');
            if (plural) {
                const len = spot + 1;
                const special = SPECIAL_SUBJS.some((entry) => (
                    (len === entry.length
                        && subj.slice(0, len).toLowerCase()
                            === entry.toLowerCase())
                    || (len > entry.length && subj[spot - entry.length] === ' '
                        && subj.slice(spot - entry.length + 1, spot + 1)
                            .toLowerCase() === entry.toLowerCase())
                ));
                if (!special) return verb;
            } else if (subj.toLowerCase() === 'they'
                || subj.toLowerCase() === 'you') {
                // Third person plural without a telltale s, and second person
                // singular, which behaves as if plural.
                return verb;
            }
        }
    }
    const buf = verb;
    const last = buf.length - 1;
    if (buf.toLowerCase() === 'are') return strcasecpy(buf, 0, 'is');
    if (buf.toLowerCase() === 'have') return strcasecpy(buf, last - 1, 's');
    if ('zxs'.includes(lowc(buf[last]))
        || (buf.length >= 2 && lowc(buf[last]) === 'h'
            && 'cs'.includes(lowc(buf[last - 1])))
        || (buf.length === 2 && lowc(buf[last]) === 'o')) {
        // Ends in z, x, s, ch, or sh, so the third person adds "es". C writes
        // it with Strcasecpy(bspot + 1, "es"), which takes the case of the
        // last character already there.
        return strcasecpy(buf, last + 1, 'es');
    }
    if (lowc(buf[last]) === 'y' && !VOWELS.includes(lowc(buf[last - 1])))
        return strcasecpy(buf, last, 'ies');
    return strcasecpy(buf, last + 1, 's');
}

// The normal xname() entry point: it observes a nearby object, marks a
// displayed artifact found, formats its class branch, pluralizes, and appends
// an instance name.
export function xnameFresh(obj, state) {
    if (!obj || typeof obj !== 'object')
        throw new TypeError('xnameFresh requires an object');
    const quantity = Math.trunc(obj.quan ?? 1);
    if (quantity <= 0)
        throw new RangeError('xnameFresh requires positive quantity');
    const type = objectType(obj, state);
    preflightXname(obj, type, state);
    // C ref: objnam.c xname_flags():625-626. This runs ahead of the
    // override_ID block at :632, so it reads the type's stored flag rather
    // than the `nn` that block forces to 1.
    if (!type.oc_name_known && type.oc_uses_known && type.oc_unique)
        obj.known = false;
    // C ref: objnam.c xname_flags():627, `if (!Blind && !gd.distantname)`.
    // distant_name() raises that counter around a formatting call for an
    // object the hero cannot inspect up close, so naming it neither sets
    // dknown nor enters the type in the discoveries list. invent.c
    // reroll_menu():2579 raises it for the same reason: a character the
    // player has not accepted yet must discover nothing.
    if (!heroIsBlind(state) && !state.gd?.distantname)
        observe_object(obj, state);
    if (state.urole?.mnum === PM_CLERIC)
        obj.bknown = true;
    const ident = identificationFlags(obj, type, state);
    // C ref: objnam.c xname_flags():660. C reads the stored dknown here
    // and says why: wizard-mode ^I must not find an artifact the hero has
    // only ever held while blind.
    if (obj.oartifact && obj.dknown)
        find_artifact(obj, state);
    const personalName = obj_is_pname(obj, state);
    let base = personalName
        ? String(obj.oextra.oname)
        : xnameBase(obj, type, state, ident);
    if (quantity !== 1) {
        base = obj.otyp === SLIME_MOLD
            ? makeplural(makesingular(base))
            : makeplural(base);
    }
    if (!personalName && obj.oextra?.oname && ident.dknown)
        base += ` named ${obj.oextra.oname}`;
    return base.replace(/^the /iu, '');
}

// C ref: objnam.c mshot_xname() (1088-1102), quantity-one arm. The multishot
// prefix belongs to a volley this port still refuses before naming a missile.
export function mshot_xname(obj, state = game) {
    if ((state.m_shot?.n ?? 0) > 1 && state.m_shot.o === obj.otyp)
        unsupported('multishot missile ordinal', obj);
    return xnameFresh(obj, state);
}

// C ref: objnam.c minimal_xname() (1038-1086). Builds a bare object with
// only otyp, oclass, dknown, known, and quan=1, suppresses oc_uname and
// conditionally oc_name_known on the type, formats through
// distant_name(xname), and strips any "uncursed " prefix the cleric role
// forces. The result is the simplest type name: "potion", "brown potion",
// or "potion of object detection" depending on what the hero has seen.
function minimal_xname(obj, state = game) {
    const otyp = obj.otyp;
    const type = objectType(obj, state);
    // Save and suppress oc_uname.
    const save_oc_uname = type.oc_uname;
    type.oc_uname = null;
    // Save oc_name_known; suppress it if the object's description is unknown,
    // unless override_ID is raised (which forces it on).
    const save_oc_name_known = type.oc_name_known;
    if (state.iflags?.override_ID)
        type.oc_name_known = true;
    else if (!obj.dknown)
        type.oc_name_known = false;

    // Build a bare object with minimal fields.
    const bareobj = {
        otyp,
        oclass: obj.oclass,
        dknown: (obj.dknown || state.iflags?.override_ID) ? 1 : 0,
        // Suppress known except for amulets (needed for fakes and the real
        // Amulet of Yendor); default "on" for types that do not use it.
        known: (obj.oclass === AMULET_CLASS)
            ? obj.known
            : !type.oc_uses_known,
        quan: 1,
        // For a boulder, leave corpsenm as 0 (undefined); non-zero produces
        // "next boulder".
        corpsenm: otyp !== BOULDER ? NON_PM : undefined,
        // Slime mold needs spe for the fruit name.
        spe: otyp === SLIME_MOLD ? obj.spe : 0,
    };

    let bufp;
    try {
        bufp = distant_name(bareobj, xnameFresh, state);
    } finally {
        // Restore the type's saved fields even if xname throws.
        type.oc_uname = save_oc_uname;
        type.oc_name_known = save_oc_name_known;
    }
    // Undo forced "uncursed" prefix that the cleric role adds via bknown.
    if (bufp.startsWith('uncursed '))
        bufp = bufp.slice(9);
    return bufp;
}

// C ref: objnam.c simpleonames() (2427-2442). "scroll" or "scrolls":
// minimal_xname's result, pluralized when quan > 1.
export function simpleonames(obj, state = game) {
    let name = minimal_xname(obj, state);
    if (Math.trunc(obj.quan ?? 1) !== 1)
        name = makeplural(makesingular(name));
    return name;
}

// C ref: objnam.c thesimpleoname() (2474-2483). "the scroll" or "the scrolls".
export function thesimpleoname(obj, state = game) {
    return the(simpleonames(obj, state), state);
}

// C ref: objnam.c ysimple_name() (2391-2398). "your <minimal_xname>" for what
// the hero carries, "the <minimal_xname>" for what she does not, or a
// shopkeeper's possessive where shk_your() finds an owner.
export function ysimple_name(obj, state = game) {
    return `${shk_your(obj, state)}${minimal_xname(obj, state)}`;
}

// C ref: objnam.c Ysimple_name2() (2402-2408). Capitalized variant of
// ysimple_name().
export function Ysimple_name2(obj, state = game) {
    const s = ysimple_name(obj, state);
    return highc(s[0]) + s.slice(1);
}
function bucWord(obj, type, state, ident) {
    if (!ident.bknown || obj.oclass === COIN_CLASS) return '';
    // C ref: objnam.c doname_base():1319. The water type's stored discovery
    // flag, not the `nn` override_ID forces: C allows "blessed clear potion"
    // where the hero does not yet know that clear potions are water.
    if (obj.otyp === POT_WATER && type.oc_name_known
        && (obj.cursed || obj.blessed)) {
        return '';
    }
    if (obj.cursed) return 'cursed';
    if (obj.blessed) return 'blessed';
    if (state.flags?.implicit_uncursed === false)
        return 'uncursed';
    const needsUncursed = !ident.known
        || !type.oc_charged
        || obj.oclass === ARMOR_CLASS
        || obj.oclass === RING_CLASS;
    return needsUncursed
        && obj.otyp !== SCR_MAIL
        && obj.otyp !== FAKE_AMULET_OF_YENDOR
        && obj.otyp !== AMULET_OF_YENDOR
        && state.urole?.mnum !== PM_CLERIC
        ? 'uncursed' : '';
}
// C ref: objnam.c add_erosion_words() (1143-1191). Its first line reads
// iflags.override_ID for itself, so this takes the effective rknown rather
// than the object's own.
function erosionWords(obj, state, rknown) {
    const crysknife = obj.otyp === CRYSKNIFE;
    if (!isDamageable(obj, state) && !crysknife) return [];
    const words = [];
    const severity = (amount) => amount === 2 ? 'very'
        : amount === 3 ? 'thoroughly' : '';
    if (obj.oeroded && !crysknife) {
        const level = severity(obj.oeroded);
        if (level) words.push(level);
        words.push(isRustprone(obj, state) ? 'rusty'
            : isCrackable(obj, state) ? 'cracked' : 'burnt');
    }
    if (obj.oeroded2 && !crysknife) {
        const level = severity(obj.oeroded2);
        if (level) words.push(level);
        words.push(isCorrodeable(obj, state) ? 'corroded' : 'rotted');
    }
    if (rknown && obj.oerodeproof) {
        words.push(crysknife ? 'fixed'
            : isRustprone(obj, state) ? 'rustproof'
                : isCorrodeable(obj, state) ? 'corrodeproof'
                    : isFlammable(obj, state) ? 'fireproof'
                        : isCrackable(obj, state) ? 'tempered'
                            : isRottable(obj, state) ? 'rotproof' : '');
    }
    return words.filter(Boolean);
}
function signed(value) {
    const number = Math.trunc(value);
    return number >= 0 ? `+${number}` : String(number);
}
function chargedSuffix(obj, type, known) {
    return known && type.oc_charged
        ? ` (${Math.trunc(obj.recharged)}:${Math.trunc(obj.spe)})`
        : '';
}
// C ref: objnam.c doname_base():1549-1559. A debug game with 'wizmgender' on
// names the gender that mkcorpstat() stored in obj->spe, for the three object
// types that carry one. CORPSTAT_RANDOM is the value spe holds when no gender
// was ever chosen, which is why it reads as a fourth answer rather than as one
// of the three genders[] rows.
function wizmgenderSuffix(obj, state) {
    if (!(obj.otyp === STATUE || obj.otyp === CORPSE || obj.otyp === FIGURINE)
        || !state.wizard || !state.iflags?.wizmgender) {
        return '';
    }
    const cgend = obj.spe & CORPSTAT_GENDER;
    const mgend = cgend === CORPSTAT_MALE ? MALE
        : cgend === CORPSTAT_FEMALE ? FEMALE : NEUTRAL;
    return ` (${cgend !== CORPSTAT_RANDOM
        ? genders[mgend].adj : 'unspecified gender'})`;
}

function corpseDoname(obj, modifiers, state) {
    const species = obj_pmname(obj, state);
    const quantity = Math.trunc(obj.quan);
    // objnam.c appends " named " inside xname_flags() (999-1005) and the
    // gender in doname_base() below it, so the gender comes last.
    const corpse = `${species} corpse${quantity === 1 ? '' : 's'}`
        + (obj.oextra?.oname && obj.dknown
            ? ` named ${obj.oextra.oname}` : '')
        + wizmgenderSuffix(obj, state);
    if (quantity !== 1)
        return `${quantity} ${[...modifiers, corpse].join(' ')}`;
    const body = [...modifiers, corpse].join(' ');
    return articleName(body);
}
// The mutation-free half of naming an object: every branch this port has not
// reached throws here, and nothing is written. xnameFresh() calls
// observe_object() as it formats, so a caller that must not change discovery
// state until every object is nameable runs this over all of them first.
export function assertObjectNameable(obj, state = game) {
    preflightDoname(obj, objectType(obj, state), state, false);
}

// C refs: objnam.c doname_base(DONAME_WITH_PRICE) and invent.c currency().
// This check is mutation-free so movement can refuse every pile member before
// the hero, discovery catalog, quote catalog, or display changes.
export function assertPricedObjectNameable(obj, state = game) {
    const type = objectType(obj, state);
    preflightDoname(obj, type, state, true);
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    if (hallucination?.intrinsic
        && !(resistance?.intrinsic || resistance?.extrinsic)) {
        unsupported('hallucinated currency', obj);
    }
    return get_cost_of_shop_item(obj, state, { observed: true });
}

// C ref: objnam.c doname(), the owornmask suffixes. Amulets, armor, and worn
// tools are answered inside its class switch; the wielded, alternate-weapon,
// and quiver phrases follow the charge and lit text, which is the order the
// port assembles them in too.
//
// objnam.c:1391-1395 prefers " (being doffed)" or " (being donned)" over
// " (being worn)" while a Wear or Take-off is under way, and its own comment
// names a perm_invent redraw as the case that reaches it. Both windows are
// open in this port, and there are more of them than there once were. Doffing
// holds only for the suit, whose armoroff() leaves ga.afternmv at Armor_off;
// armoroff() refuses the other delayed slots. Donning holds for every slot
// whose oc_delay is non-zero, which accessory_or_armor_on() now reaches for
// four of them: the suit at 0 to 5 turns, spread as objects.h gives it, with
// the leather jacket at 0 opening no window at all, both mithril-coats at 1,
// leather and studded leather armor at 3 and the remaining thirty rows at 5;
// the helmet at 1 for all but the fedora and the dented pot; the gloves at 1
// and the boots at 2. Neither ever
// reaches a name, because
// nothing in this port redraws inventory on its own and moveloop_core() reads
// no key while gm.multi is negative, so nothing is formatted inside either
// window.
function wornSuffix(obj, type, state) {
    const mask = obj.owornmask ?? 0;
    if (!mask) return '';
    const classForSuffix = is_weptool(obj, state) ? WEAPON_CLASS : obj.oclass;
    let suffix = '';
    if ((classForSuffix === AMULET_CLASS && (mask & W_AMUL))
        || (classForSuffix === ARMOR_CLASS && (mask & W_ARMOR))
        || (classForSuffix === TOOL_CLASS && (mask & (W_TOOL | W_SADDLE)))) {
        suffix += ' (being worn)';
        // objnam.c:1404-1406. Slippery fingers are a condition of the hero,
        // not of the gloves, but C describes worn gloves as slippery while she
        // has them: Concat(bp, 1, "; slippery)") backs up over the closing
        // paren it just wrote, turning "(being worn)" into
        // "(being worn; slippery)". C guards that with bp_eos[-1] == ')' at
        // :1401 in case the name overran BUFSZ and lost the paren. This port
        // builds names as JavaScript strings with no length bound, so the
        // paren is always the last character here and the guard is vacuous.
        if (obj === state.uarmg && Glib(state))
            suffix = `${suffix.slice(0, -1)}; slippery)`;
    }
    // objnam.c:1492-1499. Ring class adds "(on right hand)" or "(on left hand)"
    // based on which ring slot the hero wears it in. body_part(HAND) adapts
    // to polymorphed forms.
    if (classForSuffix === RING_CLASS && (mask & W_RING)) {
        const side = (mask & W_RINGR) ? 'right' : 'left';
        suffix += ` (on ${side} ${body_part(HAND, state.youmonst)})`;
    }
    // objnam.c:1561 also requires !gm.mrg_to_wielded, which pickup.c:1881-1882
    // raises only while pickup_prinv() names a stack that just merged into the
    // wielded weapon. Nothing here owns that flag: js/pickup.js:461 refuses
    // that merge outright, so the guard is always true at this point.
    if (mask & W_WEP) {
        // objnam.c:1562. The primary of a dual-wield keeps the hand phrasing
        // even when the alternate test below would otherwise take it, and
        // reads "wielded in" rather than "weapon in".
        const twoweapPrimary = obj === state.uwep && Boolean(state.u.twoweap);
        // C uses the alternate phrasing for stacks, for wielded ammo and
        // missiles, and for non-weapons that are not weapon-tools.
        const alternate = (obj.quan !== 1
            || (obj.oclass === WEAPON_CLASS
                ? (is_ammo(obj, state) || is_missile(obj, state))
                : !is_weptool(obj, state)))
            && !twoweapPrimary;
        if (alternate) {
            suffix += ' (wielded)';
        } else {
            const hand = body_part(HAND, state.youmonst);
            const hands = bimanual(obj, state)
                ? makeplural(hand)
                : `${state.u.uhandedness === RIGHT_HANDED ? 'right' : 'left'
                } ${hand}`;
            // objnam.c:1591-1595. The "tethered to" arm of the same choice is
            // an AKLYS, which preflightDoname() refuses above.
            suffix += ` (${twoweapPrimary ? 'wielded in' : 'weapon in'
            } ${hands})`;
        }
    }
    if (mask & W_SWAPWEP) {
        // objnam.c:1613-1621. The secondary names the other hand from the
        // primary, so URIGHTY picks "left" here where :1586 picked "right".
        if (state.u.twoweap) {
            const side = state.u.uhandedness === RIGHT_HANDED
                ? 'left' : 'right';
            const hand = body_part(HAND, state.youmonst);
            suffix += ` (wielded in ${side} ${hand})`;
        } else {
            suffix += ` (alternate weapon${obj.quan === 1 ? '' : 's'
            }; not wielded)`;
        }
    }
    if (mask & W_QUIVER) {
        // C's Qtyp: 1 is bow ammo, 2 is anything small enough for the pouch,
        // and 3 is everything else.
        let qtyp;
        if (obj.oclass === WEAPON_CLASS) {
            qtyp = !is_ammo(obj, state) ? 3
                : (type.oc_skill !== -P_BOW) ? 2 : 1;
        } else if ([RING_CLASS, AMULET_CLASS, WAND_CLASS, COIN_CLASS,
            GEM_CLASS].includes(obj.oclass)) {
            qtyp = 2;
        } else {
            qtyp = 3;
        }
        suffix += ` (${qtyp === 1 ? 'in quiver'
            : qtyp === 2 ? 'in quiver pouch' : 'at the ready'})`;
    }
    return suffix;
}

// C ref: objnam.c the_unique_pm() (1801-1821). "Unique" for naming: a species
// whose one member deserves "the", which excludes the personally named ones
// because they deserve their bare name instead.
export function the_unique_pm(species) {
    /* even though monsters with personal names are unique, we want to
       describe them as "Name" rather than "the Name" */
    if (type_is_pname(species)) return false;

    let uniq = Boolean(species.geno & G_UNIQ);
    /* high priest is unique if it includes "of <deity>", otherwise not
       (caller needs to handle the 1st possibility; we assume the 2nd);
       worm tail should be irrelevant but is included for completeness */
    if (species.pmidx === PM_HIGH_CLERIC
        || species.pmidx === PM_LONG_WORM_TAIL)
        uniq = false;
    /* Wizard no longer needs this; he's flagged as unique these days */
    if (species.pmidx === PM_WIZARD_OF_YENDOR)
        uniq = true;
    return uniq;
}

// C ref: objnam.c corpse_xname() (1823-1919), "<mnam> corpse" with the article
// and the adjective placed to suit the monster's name. C builds the answer in
// the obuf[] that xname() would have used, so aobjnam() can still write into
// the prefix area; this port returns the string and has no such buffer.
//
// The glob arm stops. Its input is a globby object that is not a CORPSE, which
// only shrink_glob() and eat.c's glob meal produce, and neither is ported.
export function corpse_xname(otmp, adjective, cxn_flags, state = game) {
    const omndx = otmp.corpsenm;
    /* override quantity if greater than 1 */
    const ignore_quan = (cxn_flags & CXN_SINGULAR) !== 0;
    /* suppress "the" from "the unique monster corpse" */
    let no_prefix = (cxn_flags & CXN_NO_PFX) !== 0;
    /* include "the" for "the woodchuck corpse" */
    let the_prefix = (cxn_flags & CXN_PFX_THE) !== 0;
    /* include "an" for "an ogre corpse" */
    let any_prefix = (cxn_flags & CXN_ARTICLE) !== 0;
    /* leave off suffix (do_name() appends "corpse" itself) */
    const omit_corpse = (cxn_flags & CXN_NOCORPSE) !== 0;
    let possessive = false;
    const glob = otmp.otyp !== CORPSE && otmp.globby;
    let mnam;

    if (glob) {
        unsupported('corpse_xname() for a glob', otmp);
    } else if (omndx === NON_PM) { /* paranoia */
        mnam = 'thing';
    } else {
        mnam = obj_pmname(otmp, state);
        const species = state.mons[omndx];
        if (the_unique_pm(species) || type_is_pname(species)) {
            mnam = s_suffix(mnam);
            possessive = true;
            /* don't precede personal name like "Medusa" with an article */
            if (type_is_pname(species))
                no_prefix = true;
            /* always precede non-personal unique monster name like
               "Oracle" with "the" unless explicitly overridden */
            else if (the_unique_pm(species) && !no_prefix)
                the_prefix = true;
        }
    }
    if (no_prefix)
        the_prefix = any_prefix = false;
    else if (the_prefix)
        any_prefix = false; /* mutually exclusive */

    let nambuf = '';
    /* can't use the() the way we use an() below because any capitalized
       Name causes it to assume a personal name and return Name as-is */
    if (the_prefix)
        nambuf += 'the ';

    if (!adjective) {
        /* normal case:  newt corpse */
        nambuf += mnam;
    } else {
        /* adjective positioning depends upon format of monster name */
        nambuf += possessive
            ? `${mnam} ${adjective}` /* Medusa's cursed partly eaten corpse */
            : `${adjective} ${mnam}`; /* cursed partly eaten troll corpse */
        /* in case adjective has a trailing space, squeeze it out */
        nambuf = mungspaces(nambuf);
        /* doname() might include a count in the adjective argument;
           if so, don't prepend an article */
        if (digit(adjective[0]))
            any_prefix = false;
    }

    if (!omit_corpse) {
        nambuf += ' corpse';
        /* makeplural(nambuf) => append "s" to "corpse" */
        if (otmp.quan > 1 && !ignore_quan) {
            nambuf += 's';
            any_prefix = false; /* avoid "a newt corpses" */
        }
    }

    if (any_prefix)
        nambuf = an(nambuf);
    return nambuf;
}

// C ref: objnam.c cxname() (1922-1930). xname() drops a corpse's monster
// type, so a corpse goes to corpse_xname() instead.
export function cxname(obj, state = game) {
    if (obj.otyp === CORPSE)
        return corpse_xname(obj, null, CXN_NORMAL, state);
    return xnameFresh(obj, state);
}

// C ref: objnam.c killer_xname() (1940-2005), ordinary non-artifact object
// arm. Death reasons identify the object type but suppress BUC, erosion-proof,
// grease, poison, and player-assigned names. All temporary identification is
// restored before returning, so calculating a nonfatal hit's killer string
// does not teach the hero anything.
export function killer_xname(obj, state = game) {
    if (obj.oartifact)
        unsupported('artifact killer name', obj);
    if (obj.otyp === CORPSE || obj.otyp === SLIME_MOLD)
        unsupported('corpse or slime-mold killer name', obj);

    const type = objectType(obj, state);
    const savedObject = { ...obj };
    const savedExtra = obj.oextra;
    const savedNameKnown = type.oc_name_known;
    const savedUserName = type.oc_uname;
    state.gd ??= {};
    state.gd.distantname = (state.gd.distantname ?? 0) + 1;
    try {
        obj.known = true;
        obj.dknown = true;
        obj.bknown = false;
        obj.rknown = false;
        obj.greased = false;
        obj.blessed = false;
        obj.cursed = false;
        obj.opoisoned = false;
        if (savedExtra?.oname) {
            obj.oextra = { ...savedExtra };
            delete obj.oextra.oname;
        }
        type.oc_name_known = true;
        type.oc_uname = null;

        let name = xnameFresh(obj, state);
        const possessive = name.toLowerCase().includes("'s ")
            || name.toLowerCase().includes("s' ");
        if (obj.quan === 1 && !possessive) {
            name = (obj_is_pname(obj, state) || the_unique_obj(obj, state))
                ? the(name, state) : an(name);
        }
        return name;
    } finally {
        Object.assign(obj, savedObject);
        obj.oextra = savedExtra;
        type.oc_name_known = savedNameKnown;
        type.oc_uname = savedUserName;
        state.gd.distantname -= 1;
    }
}

// C ref: objnam.c singular() (2087-2105). Names one item of a stack by
// running the caller's namer with quan temporarily set to 1. C swaps xname()
// for cxname() on a corpse, because xname() would drop the monster type.
export function singular(otmp, func, state) {
    /* using xname for corpses does not give the monster type */
    let namer = func;
    if (otmp.otyp === CORPSE && namer === xnameFresh)
        namer = cxname;

    const savequan = otmp.quan;
    otmp.quan = 1;
    try {
        return namer(otmp, state);
    } finally {
        otmp.quan = savequan;
    }
}

// C ref: objnam.c the() (2170-2237). Prefixes "the " to a name that needs an
// article.
//
// The capitalized branch distinguishes monster titles and types from personal
// names, and treats a configured fruit as an ordinary noun unless an artifact
// of that name deliberately lacks the article.
export function the(str, state = game) {
    if (!str) {
        // C's impossible() returns "the []" and carries on. Reaching it means
        // a caller handed this an empty name, which is a defect here.
        throw new Error('the(): empty name');
    }
    if (str.slice(0, 4).toLowerCase() === 'the ')
        return str[0].toLowerCase() + str.slice(1);
    let insertThe = str[0] < 'A' || str[0] > 'Z'
        || CapitalMon(str, state);
    if (!insertThe) {
        const fruit = fruit_from_name(str, true, state);
        if (fruit) {
            const artifact = artifact_name(str, null, false, state);
            insertThe = !artifact
                || artifact.slice(0, 4).toLowerCase() === 'the ';
        }
    }
    if (!insertThe) {
        const lastSpace = str.lastIndexOf(' ');
        const separator = lastSpace >= 0 ? lastSpace : str.lastIndexOf('-');
        if (separator >= 0
            && (str[separator + 1] < 'A' || str[separator + 1] > 'Z')) {
            insertThe = !str.includes("'");
        } else if (separator >= 0) {
            const firstSpace = str.indexOf(' ');
            if (firstSpace >= 0 && firstSpace < separator) {
                const folded = str.toLowerCase();
                const ofIndex = folded.indexOf(' of ');
                const namedIndex = folded.indexOf(' named ');
                const calledIndex = folded.indexOf(' called ');
                const namingIndex = calledIndex >= 0
                    && (namedIndex < 0 || calledIndex < namedIndex)
                    ? calledIndex : namedIndex;
                if (ofIndex >= 0
                    && (namingIndex < 0 || ofIndex < namingIndex)) {
                    insertThe = true;
                } else if (namingIndex < 0 && str.length >= 31
                    && str.endsWith('Platinum Yendorian Express Card')) {
                    insertThe = true;
                }
            }
        }
    }
    return `${insertThe ? 'the ' : ''}${str}`;
}

// C ref: objnam.c The() (2234-2241). the() with its first character
// capitalized.
export function The(str, state = game) {
    const tmp = the(str, state);
    return highc(tmp[0]) + tmp.slice(1);
}

// C ref: obj.h is_plural() (421-427). The Eyes of the Overworld are plural
// once discovered but not while they are still "a pair of lenses";
// undiscovered_artifact() is unported and no wish this port grants makes an
// artifact, so that arm stops.
export function is_plural(otmp) {
    if (otmp.quan !== 1) return true;
    if (otmp.oartifact === ART_EYES_OF_THE_OVERWORLD)
        unsupported('undiscovered_artifact() for is_plural()', otmp);
    return false;
}

// C ref: objnam.c otense() (2529-2545). `verb` arrives in the plural, without
// a trailing s, and comes back agreeing with what xname(otmp) would be.
export function otense(otmp, verb) {
    if (!is_plural(otmp))
        return vtense(null, verb);
    return verb;
}

// C ref: objnam.c aobjnam() (2242-2258). "count cxname(otmp)", or just
// cxname(otmp) when the count is 1, with the verb agreed and appended.
export function aobjnam(otmp, verb, state = game) {
    let bp = cxname(otmp, state);

    if (otmp.quan !== 1)
        bp = `${otmp.quan} ${bp}`;
    if (verb)
        bp = `${bp} ${otense(otmp, verb)}`;
    return bp;
}

// C ref: objnam.c Tobjnam() (2288-2299). Its own comment: "like aobjnam, but
// prepend 'The', not count, and use xname". zap.c dozap() names the wand that
// crumbles with it.
export function Tobjnam(otmp, verb, state = game) {
    const bp = The(xnameFresh(otmp, state), state);

    if (verb)
        return `${bp} ${otense(otmp, verb)}`;
    return bp;
}

// C ref: objnam.c yname() (2358-2374). "your <cxname>" for what the hero
// carries, "the <cxname>" for what she does not, and a shopkeeper's or a
// monster's possessive where shk_your() finds an owner.
//
// The prefix is dropped only for an artifact the hero is holding whose proper
// name stands alone, and C's own comment says why the other two conjuncts are
// there: "leave off 'your' for most of your artifacts, but prepend 'your' for
// unique objects and 'foo of bar' quest artifacts". obj.h any_quest_artifact()
// (271) is that second test spelled out, and artilist.h orders the quest
// artifacts last, from The Orb of Detection at 219 onward, so one comparison
// separates them. C evaluates carried() first, which is why an artifact lying
// on the floor keeps the prefix without obj_is_pname() being asked at all.
export function yname(obj, state = game) {
    const s = cxname(obj, state);

    if (!carried(obj)
        || !obj_is_pname(obj, state)
        || obj.oartifact >= ART_ORB_OF_DETECTION) {
        return `${shk_your(obj, state)}${s}`;
    }
    return s;
}

// C ref: objnam.c Yname2() (2376-2383). yname() with its first character
// capitalized, so that the name can open a sentence.
export function Yname2(obj, state = game) {
    const s = yname(obj, state);

    return highc(s[0]) + s.slice(1);
}

// C ref: objnam.c doname(). Shop, known-container, worn-item, end-game, and
// lit-candle branches stop before xname() can mutate discovery state. The
// private allowLiveShopPrice seam is owned only by doname_with_price(), which
// appends and records that price after this ordinary name is complete.
function donameFreshInternal(obj, state, allowLiveShopPrice) {
    const type = objectType(obj, state);
    preflightDoname(obj, type, state, allowLiveShopPrice);
    let base = xnameFresh(obj, state);
    // C ref: objnam.c doname_base():1254-1262, which reads these after its own
    // `bp = xname(obj)` at :1247. xnameFresh() above can clear obj.known for
    // an undiscovered unique type, so the order matters here as it does there.
    const ident = identificationFlags(obj, type, state);
    const quantity = Math.trunc(obj.quan);
    const modifiers = [];
    const buc = bucWord(obj, type, state, ident);
    if (buc) modifiers.push(buc);
    // C ref: objnam.c doname(). "empty" comes first, before the blessed or
    // uncursed word, when the contents are known and there are none. A bag of
    // tricks or horn of plenty judges emptiness by its charges instead, and
    // both stop above.
    if (ident.cknown && (isContainer(obj) || obj.otyp === STATUE)
        && !hasContents(obj)) {
        modifiers.unshift('empty');
    }
    // A box announces a known trap and its known lock state before the
    // greased prefix. C reads the stored dknown for the trap, and there is no
    // override for tknown at all.
    if (isBox(obj) && obj.otrapped && obj.tknown && obj.dknown)
        modifiers.push('trapped');
    if (ident.lknown && isBox(obj)) {
        modifiers.push(
            obj.obroken ? 'broken' : obj.olocked ? 'locked' : 'unlocked',
        );
    }
    if (obj.greased) modifiers.push('greased');
    // C ref: objnam.c doname_base():1382. One switch on
    // `is_weptool(obj) ? WEAPON_CLASS : obj->oclass` picks both the prefix
    // words below and the parenthesized suffix further down, so a weapon-tool
    // takes the enchantment prefix and never reaches the `charges:` label at
    // :1484. This port splits that switch three ways rather than two: the
    // prefix switch below, the suffix chain further down, and wornSuffix() at
    // :745, which holds the switch's AMULET_CLASS, ARMOR_CLASS and TOOL_CLASS
    // worn arms. All three derive the class the same way; wornSuffix() computes
    // it for itself because it is called from elsewhere too.
    const nameClass = is_weptool(obj, state) ? WEAPON_CLASS : obj.oclass;
    switch (nameClass) {
    case WEAPON_CLASS:
    case ARMOR_CLASS:
        if (base.startsWith('poisoned ') && obj.opoisoned) {
            base = base.slice('poisoned '.length);
            modifiers.push('poisoned');
        }
        modifiers.push(...erosionWords(obj, state, ident.rknown));
        if (ident.known) modifiers.push(signed(obj.spe));
        break;
    case TOOL_CLASS:
        if (isCandle(obj)) {
            const fullBurnTime = 20 * type.oc_cost;
            if (obj.age < fullBurnTime)
                modifiers.push('partly used');
        }
        break;
    case RING_CLASS:
        if (ident.known && type.oc_charged)
            modifiers.push(signed(obj.spe));
        break;
    case FOOD_CLASS:
        if (obj.oeaten) modifiers.push('partly eaten');
        break;
    case BALL_CLASS:
    case CHAIN_CLASS:
        if (erosionMatters(obj, state))
            modifiers.push(...erosionWords(obj, state, ident.rknown));
        break;
    default:
        break;
    }
    if (obj.otyp === CORPSE)
        return corpseDoname(obj, modifiers, state);
    if (obj.otyp === EGG && obj.corpsenm !== NON_PM && ident.known) {
        base = `${pmname(state.mons[obj.corpsenm], NEUTRAL)} ${base}`;
        if (obj.spe === 1) base += ' (laid by you)';
    }
    if (obj.otyp === CANDELABRUM_OF_INVOCATION) {
        const candles = Math.trunc(obj.spe);
        base += ` (${candles} of 7 candle${candles === 1 ? '' : 's'}`
            + `${obj.lamplit ? ', lit' : ' attached'})`;
    } else if (obj.otyp === OIL_LAMP
        || obj.otyp === MAGIC_LAMP
        || obj.otyp === BRASS_LANTERN
        || isCandle(obj)) {
        if (obj.lamplit) base += ' (lit)';
    } else if (obj.otyp === POT_OIL && obj.lamplit) {
        base += ' (lit)';
    } else if (nameClass === WAND_CLASS
        || (nameClass === TOOL_CLASS && type.oc_charged)) {
        base += chargedSuffix(obj, type, ident.known);
    }
    // objnam.c:1549-1559 sits between the class switch above and the
    // owornmask suffixes wornSuffix() holds, and this is that position. The
    // CORPSE arm of the same branch is in corpseDoname(), which the early
    // return above took.
    base += wizmgenderSuffix(obj, state);
    base += wornSuffix(obj, type, state);
    const words = [...modifiers, base].join(' ');
    if (quantity !== 1)
        return `${quantity} ${words}`;
    const fakeArtifact = obj.otyp === SLIME_MOLD
        ? matching_artifact_fruit(base, state) : null;
    if (fakeArtifact?.forceThe
        || obj_is_pname(obj, state)
        || theUniqueObject(obj, type, state)) {
        return `the ${words.replace(/^the /iu, '')}`;
    }
    if (fakeArtifact) return words;
    return articleName(words);
}

export function donameFresh(obj, state) {
    return donameFreshInternal(obj, state, false);
}

// C ref: objnam.c doname_base(DONAME_WITH_PRICE), through its ordinary floor
// item branch. xname() observes first, the suffix uses the resulting price,
// and record_price_quote() is the final durable write.
export function doname_with_price(
    obj,
    state,
    { currencyName } = {},
) {
    if (typeof currencyName !== 'function')
        throw new TypeError('doname_with_price needs the currency owner');
    assertPricedObjectNameable(obj, state);
    const name = donameFreshInternal(obj, state, true);
    const quote = get_cost_of_shop_item(obj, state);
    const suffix = `${quote.cost} ${currencyName(quote.cost, state)}`;
    const result = `${name} (for sale, ${suffix})`;
    // get_cost_of_shop_item() totals get_pricing_units(), but C remembers the
    // displayed quote per object quantity, which can be a different divisor.
    record_price_quote(obj.otyp, quote.cost / obj.quan, true, state);
    return result;
}

// C ref: objnam.c distant_name(). Format an object seen from wherever the
// hero stands. `func` is xname() or doname(); the near test rounds the corners
// of a square whose radius is 2, or the hero's larger xray range, and an
// artifact always counts as near. Everything else formats with
// gd.distantname raised, which suppresses the dknown and discovery writes
// xname() would otherwise make.
//
// C also saves obj->o_id and zeroes it while `program_state.gameover` is set,
// so that a disclosure name omits a T-shirt slogan or candy wrapper label.
// preflightXname() refuses gameover outright, so no path here reaches
// that save and restore.
export function distant_name(obj, func, state = game) {
    if (typeof func !== 'function')
        throw new TypeError('distant_name requires a formatting function');
    const range = state.u?.xray_range > 2 ? state.u.xray_range : 2;
    const neardist = range * range * 2 - range;
    const location = get_obj_location(obj, 0, state);
    if (location
        && cansee(location.x, location.y, state)
        && (obj.oartifact
            || dist2(location.x, location.y, state.u?.ux, state.u?.uy)
                <= neardist)) {
        return func(obj, state);
    }
    state.gd ??= {};
    state.gd.distantname = (state.gd.distantname ?? 0) + 1;
    try {
        return func(obj, state);
    } finally {
        // C's `--gd.distantname` cannot be skipped; a JavaScript formatter
        // that refuses an unported name branch throws instead of returning,
        // and leaving the counter raised would silence observe_object() for
        // every later name in the same game.
        state.gd.distantname -= 1;
    }
}

// C ref: objnam.c safe_qbuf() (5624-5698). Builds a prompt string from an
// optional prefix, an object name, and an optional suffix. The C version
// guards against QBUFSZ overflow by trying the primary function, then a
// shorter alternative, then a last-resort literal. JavaScript strings have no
// fixed-size buffer, so only the first formatting function is tried; the
// fallback and last resort exist for API fidelity with callers ported from C.
export function safe_qbuf(
    prefix, suffix, obj, func, altfunc, lastR, state = game,
) {
    const mid = func(obj, state);
    return `${prefix ?? ''}${mid}${suffix ?? ''}`;
}
