// Runtime object naming for the early movement, pet, trap, and combat paths.
// C refs: objnam.c xname(), corpse_xname(), minimal_xname(), simpleonames(),
// doname(), distant_name(), cxname(), The(), aobjnam(), yobjnam(), Yobjnam2(),
// otense(), singular(), yname() and Yname2().
//
// objnam.c is split across two files. Its wish-parsing group lives in
// js/objnam_readobjnam.js: readobjnam() and its five-function chain,
// wishymatch(), rnd_otyp_by_namedesc() and the o_ranges[], spellings[], wrp[]
// and wrpsym[] tables. Neither file imports the other. That file reaches the
// objects[] tables through js/objects.js OBJ_NAME() and OBJ_DESCR(), and
// object construction through js/obj.js.

import {
    ART_EYES_OF_THE_OVERWORLD, ART_ORB_OF_DETECTION, artifact_light,
    artifact_name, artiname, glow_color, glow_verb,
    find_artifact, undiscovered_artifact,
    permapoisoned,
} from './artifacts.js';
import {
    BLINDED, BUFSZ, BURN_OBJECT, COST_CONTENTS, CORPSTAT_FEMALE,
    CORPSTAT_GENDER, CORPSTAT_HISTORIC,
    CORPSTAT_MALE, CORPSTAT_RANDOM, CXN_ARTICLE, CXN_NOCORPSE, CXN_NORMAL,
    CXN_NO_PFX, CXN_PFX_THE, CXN_SINGULAR, FEMALE, FM_FMON, ismnum,
    HAND, MV_KNOWS_EGG,
    MALE, NEUTRAL, NON_PM,
    QBUFSZ,
    M_AP_OBJECT, M_AP_TYPE,
    P_BOW, W_AMUL, W_ARMOR, W_BALL, W_CHAIN, W_QUIVER, W_RING, W_RINGL, W_RINGR,
    WARN_OF_MON, W_SADDLE, W_SWAPWEP, W_TOOL, W_WEP, plur,
} from './const.js';
import {
    fruit_from_indx, fruit_from_name, makeplural, makesingular,
} from './fruit.js';
import { noit_mon_nam, obj_pmname } from './do_name.js';
import { doffing, donning } from './do_wear.js';
import { tin_details } from './eat.js';
import { game } from './gstate.js';
import { count_contents, currency } from './invent.js';
import {
    digit, dist2, encodeUtf8ByteString, eos, highc, lowc, mungspaces, s_suffix,
    strcasecpy, strstri, truncateByteString,
    upstart,
} from './hacklib.js';
import { arti_light_description, find_mid, get_obj_location } from './light.js';
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
import { peek_timer } from './timeout.js';
import { CapitalMon } from './random_text.js';
import { observe_object } from './o_init.js';
import {
    apron_text, candy_wrapper_text, hawaiian_motif, tshirt_text,
} from './read.js';
import {
    carried, hasContents, isBox, isCandle, isContainer,
    isCorrodeable, isCrackable,
    isDamageable, is_flammable, isMultigen, is_rottable, isRustprone,
    is_ammo, is_missile, is_weptool, objectType,
} from './obj.js';
import { JAPANESE_ITEM_NAMES } from './objnam_data.js';
import { Strlen_ } from './strutil.js';
import {
    AKLYS,
    ALCHEMY_SMOCK, AMULET_CLASS, AMULET_OF_YENDOR, ARMOR_CLASS, ARM_BOOTS,
    ARM_CLOAK, ARM_SUIT, ARM_SHIRT,
    BAG_OF_TRICKS,
    ARM_GLOVES, ARM_HELM, ARM_SHIELD, BALL_CLASS,
    BLACK_OPAL, BOULDER, BRASS_LANTERN, CANDELABRUM_OF_INVOCATION, CHAIN_CLASS,
    CANDY_BAR, CHEST, COIN_CLASS, CORPSE, CRYSKNIFE, DIAMOND, DILITHIUM_CRYSTAL, EGG,
    ELVEN_SHIELD, EMERALD, FAKE_AMULET_OF_YENDOR, FIGURINE, FLINT, FOOD_CLASS,
    GEMSTONE, GEM_CLASS, GRAY_DRAGON_SCALE_MAIL, GRAY_DRAGON_SCALES, IRON,
    LARGE_BOX, LEASH, LENSES, MAGIC_HARP, MAGIC_LAMP, MEAT_RING, MINERAL, MITHRIL,
    MAXOCLASSES,
    MUMMY_WRAPPING, OBJ_DESCR, OBJ_NAME, OIL_LAMP, OPAL, ORCISH_SHIELD,
    HAWAIIAN_SHIRT, POTION_CLASS, POT_OIL, POT_WATER, RING_CLASS, ROBE, ROCK_CLASS, RUBY,
    SAPPHIRE, SCR_MAIL, SCROLL_CLASS, SHIELD_OF_REFLECTION, SLIME_MOLD,
    SPBOOK_CLASS, SPE_BOOK_OF_THE_DEAD, SPE_NOVEL, STATUE, TIN, TOOL_CLASS,
    TOWEL, T_SHIRT, VENOM_CLASS, WAND_CLASS, WEAPON_CLASS, WOODEN_HARP,
    YELLOW_DRAGON_SCALE_MAIL, YELLOW_DRAGON_SCALES,
    HORN_OF_PLENTY,
    GOLD_PIECE, STRANGE_OBJECT,
} from './objects.js';
import {
    append_price_quote,
    get_cost_of_shop_item,
    is_unpaid,
    record_price_quote,
    shk_your,
    unpaid_cost,
} from './shk.js';
// wield.js holds the port's single reading of youprop.h:112 Glib. It imports
// naming helpers from this file in turn; the cycle is safe because neither
// side calls the other during module evaluation.
import { Glib } from './wield.js';
import { note_unported } from './unported.js';

// C ref: objnam.c erosion_matters() (1195-1215). Keep this predicate in the
// source-owned objnam module so its callers share the same implementation.
export function erosion_matters(obj, state = game) {
    switch (obj.oclass) {
    case TOOL_CLASS:
        return is_weptool(obj, state);
    case WEAPON_CLASS:
    case ARMOR_CLASS:
    case BALL_CLASS:
    case CHAIN_CLASS:
        return true;
    default:
        return false;
    }
}

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

// C ref: objnam.c An(). The C helper capitalizes the first byte of an()'s
// nonempty result; callers pass a nonempty name, as required by an().
export function An(text) {
    return upstart(an(text));
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
function Japanese_item_name(otyp, ordinaryName) {
    return JAPANESE_ITEM_NAMES.get(otyp) ?? ordinaryName;
}
function sourceDescription(obj, type, state, actual) {
    if (state.urole?.mnum === PM_SAMURAI
        && (obj.otyp === WOODEN_HARP || obj.otyp === MAGIC_HARP)) {
        return 'koto';
    }
    return OBJ_DESCR(type, state) ?? actual;
}

// C objnam.c reserves PREFIX bytes for doname's prefixes in each BUFSZ buffer.
const PREFIX = 80;
const DONAME_BODY_CAPACITY = BUFSZ - PREFIX - 1;

// C objnam.c's Concat() uses strncat(spaceleft + delta), while ConcatF1/F2
// use snprintf(spaceleft + delta), which leaves one byte for the terminator.
// strncat scans to the terminating NUL even from eos-delta, so Concat
// preserves the last byte and only enlarges its copy bound. snprintf writes
// at eos-delta and therefore replaces that byte.
function nameBodySpaceLeft(body, pointerOffset = 0) {
    return Math.max(0, DONAME_BODY_CAPACITY - pointerOffset
        - encodeUtf8ByteString(body).length);
}

export function concatNameBody(body, text, delta = 0, pointerOffset = 0) {
    const spaceleft = nameBodySpaceLeft(body, pointerOffset);
    const count = Math.max(0, spaceleft + delta);
    return body + truncateByteString(String(text), count);
}

export function concatFormatNameBody(
    body, text, delta = 0, pointerOffset = 0, cachedSpaceLeft = null,
) {
    const bodyLength = encodeUtf8ByteString(body).length;
    const startLength = Math.max(0, bodyLength - delta);
    const start = truncateByteString(body, startLength);
    // append_price_quote() advances C's bp_eos without updating the cached
    // doname_base bpspaceleft; its following wizard-weight ConcatF uses that
    // earlier value even though the visible body already includes the quote.
    const spaceleft = cachedSpaceLeft
        ?? nameBodySpaceLeft(body, pointerOffset);
    const snprintfSize = Math.max(0, spaceleft + delta);
    return start + truncateByteString(String(text), Math.max(0, snprintfSize - 1));
}
const DONAME_WITH_PRICE = 1;
const DONAME_VAGUE_QUAN = 2;
const DONAME_FOR_MENU = 4;

// C ref: objnam.c xcalled():558–572. JavaScript returns the appended buffer;
// siz includes the terminating NUL, and only the user-supplied suffix truncates.
export function xcalled(buf, siz, pfx, sfx) {
    const bufsiz = siz - 1 - encodeUtf8ByteString(buf).length;
    const pfxlen = encodeUtf8ByteString(pfx).length + ' called '.length;
    if (pfxlen > bufsiz)
        throw new RangeError(`xcalled: not enough room for prefix (${pfxlen} > ${bufsiz})`);
    return `${buf}${pfx} called ${truncateByteString(sfx, bufsiz - pfxlen)}`;
}

// C ref: objnam.c obj_typename():201–293. Names a type for discoveries,
// preserving its appearance after a bounded user-assigned name.
export function obj_typename(otyp, state = game) {
    const ocl = state.objects[otyp];
    let actualn = OBJ_NAME(ocl, state);
    let dn = OBJ_DESCR(ocl, state);
    const un = ocl.oc_uname;
    let nn = ocl.oc_name_known;

    if (state.urole?.mnum === PM_SAMURAI) {
        actualn = Japanese_item_name(otyp, actualn);
        if (otyp === WOODEN_HARP || otyp === MAGIC_HARP) dn = 'koto';
    }
    // Generic items carry no actual name and should never reach here; C
    // substitutes a placeholder rather than asserting, so this does too.
    if (!actualn)
        actualn = (otyp > 0 && otyp < MAXOCLASSES) ? 'generic' : 'object?';

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
        if (un) buf = xcalled(buf, BUFSZ - (dn ? dn.length + 3 : 0), '', un);
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
            if (un) buf = xcalled(buf, BUFSZ - (dn ? dn.length + 3 : 0), '', un);
            if (dn) buf += ` (${dn})`;
        } else {
            buf += dn ?? actualn;
            if (ocl.oc_class === GEM_CLASS)
                buf += ocl.oc_material === MINERAL ? ' stone' : ' gem';
            if (un) buf = xcalled(buf, BUFSZ, '', un);
        }
        return buf;
    }
    // Here for ring, scroll, potion, wand, and spellbook.
    if (nn) {
        // oc_unique keeps the Book of the Dead from becoming "spellbook of
        // Book of the Dead".
        buf = ocl.oc_unique ? actualn : `${buf} of ${actualn}`;
    }
    if (un) buf = xcalled(buf, BUFSZ - (dn ? dn.length + 3 : 0), '', un);
    if (dn) buf += ` (${dn})`;
    return buf;
}

// C ref: objnam.c simple_typename() (296-307). Either the actual name or the
// description, never both, and never the name the player gave the type.
//
// C clears objects[otyp].oc_uname around obj_typename() and restores it.
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

// C ref: objnam.c mimic_obj_name() (5606–5616).
export function mimic_obj_name(mtmp, state = game) {
    if (M_AP_TYPE(mtmp) === M_AP_OBJECT) {
        if (mtmp.mappearance === GOLD_PIECE) return 'gold';
        if (mtmp.mappearance !== STRANGE_OBJECT)
            return simple_typename(mtmp.mappearance, state);
    }
    return 'whatcha-may-callit';
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

function xnameBase(obj, type, state, ident) {
    const knownType = ident.nameKnown;
    const dknown = ident.dknown;
    const un = type.oc_uname;
    let actual = OBJ_NAME(type, state);
    if (state.urole?.mnum === PM_SAMURAI)
        actual = Japanese_item_name(obj.otyp, actual);
    actual ??= 'object?';
    const description = sourceDescription(obj, type, state, actual);

    switch (obj.oclass) {
    case AMULET_CLASS:
        if (!dknown) return 'amulet';
        if (obj.otyp === AMULET_OF_YENDOR
            || obj.otyp === FAKE_AMULET_OF_YENDOR) {
            return ident.known ? actual : description;
        }
        if (knownType) return actual;
        if (un) return xcalled('', BUFSZ - PREFIX, 'amulet', un);
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
        let result = dknown && !knownType && un
            ? xcalled(prefix, BUFSZ - PREFIX, description, un)
            : `${prefix}${!dknown ? description : knownType ? actual : description}`;
        if (obj.otyp === FIGURINE && obj.corpsenm !== NON_PM) {
            const species = obj_pmname(obj, state);
            // C ConcatF2 copies only the remaining bytes after xcalled;
            // a full alias must not turn the suffix into a buffer overflow.
            result = truncateByteString(`${result} of ${articleName(species)}`,
                BUFSZ - PREFIX - 1);
        } else if (obj.otyp === TOWEL && obj.spe > 0 && state.wizard) {
            // C xname_flags:716–718 uses the same bounded ConcatF1.
            result = truncateByteString(`${result} (${obj.spe})`,
                BUFSZ - PREFIX - 1);
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
        if (!knownType && un)
            return xcalled(prefix, BUFSZ - PREFIX, armor_simple_name(obj, state), un);
        const base = knownType ? actual : description;
        return `${prefix}${base}`;
    }
    case FOOD_CLASS:
        if (obj.otyp === SLIME_MOLD) {
            const fruit = fruit_from_indx(obj.spe, state);
            return fruit?.fname ?? 'fruit';
        }
        // C applies the xname_flags hook to every non-fruit FOOD_CLASS item
        // before selecting the glob/non-glob formatting arm.
        const partlyEaten = state.iflags?.partly_eaten_hack && obj.oeaten
            ? 'partly eaten ' : '';
        if (obj.globby) {
            // C ref: objnam.c xname_flags():776-789. shrink_glob() sets
            // iflags.partly_eaten_hack; xname() uses it for every food arm.
            const size = obj.owt <= 100 ? 'small'
                : obj.owt <= 300 ? 'medium'
                    : obj.owt <= 500 ? 'large' : 'very large';
            return `${partlyEaten}${size} ${actual}`;
        }
        // C ref: objnam.c xname(). `known` here is the object's own flag, set
        // when the hero knows what is inside the tin, not the type's.
        if (obj.otyp === TIN && ident.known)
            return tin_details(
                obj, obj.corpsenm, `${partlyEaten}${actual}`, { state },
            );
        return `${partlyEaten}${actual}`;
    case COIN_CLASS:
    case CHAIN_CLASS:
        return actual;
    case ROCK_CLASS:
        if (obj.otyp === STATUE && obj.corpsenm !== NON_PM) {
            const species = obj_pmname(obj, state);
            const monster = state.mons[obj.corpsenm];
            const speciesArticle = type_is_pname(monster) ? ''
                : the_unique_pm(monster) ? 'the ' : just_an(species);
            const historic = state.urole?.filecode === 'Arc'
                && (obj.spe & CORPSTAT_HISTORIC) ? 'historic ' : '';
            return `${historic}${actual} of ${speciesArticle}${species}`;
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
        if (knownType || un || !dknown) {
            if (!dknown) return `${prefix}potion`;
            if (knownType) {
                const holy = obj.otyp === POT_WATER && ident.bknown
                    && (obj.blessed || obj.cursed)
                    ? `${obj.blessed ? 'holy' : 'unholy'} `
                    : '';
                return `${prefix}potion of ${holy}${actual}`;
            }
            return xcalled(`${prefix}potion`, BUFSZ - PREFIX, '', un);
        }
        return `${prefix}${description} potion`;
    }
    case SCROLL_CLASS:
        if (!dknown) return 'scroll';
        if (knownType) return `scroll of ${actual}`;
        if (un) return xcalled('scroll', BUFSZ - PREFIX, '', un);
        return type.oc_magic
            ? `scroll labeled ${description}`
            : `${description} scroll`;
    case WAND_CLASS:
        if (!dknown) return 'wand';
        if (knownType) return `wand of ${actual}`;
        if (un) return xcalled('', BUFSZ - PREFIX, 'wand', un);
        return `${description} wand`;
    case SPBOOK_CLASS:
        if (obj.otyp === SPE_NOVEL) {
            if (!dknown) return 'book';
            if (knownType) return actual;
            if (un) return xcalled('', BUFSZ - PREFIX, 'novel', un);
            return `${description} book`;
        }
        if (!dknown) return 'spellbook';
        if (knownType)
            return `${obj.otyp === SPE_BOOK_OF_THE_DEAD
                ? '' : 'spellbook of '}${actual}`;
        if (un) return xcalled('', BUFSZ - PREFIX, 'spellbook', un);
        return `${description} spellbook`;
    case RING_CLASS:
        if (!dknown) return 'ring';
        if (knownType) return `ring of ${actual}`;
        if (un) return xcalled('', BUFSZ - PREFIX, 'ring', un);
        return `${description} ring`;
    case GEM_CLASS: {
        const rock = type.oc_material === MINERAL ? 'stone' : 'gem';
        if (!dknown) return rock;
        if (!knownType) {
            if (un) return xcalled('', BUFSZ - PREFIX, rock, un);
            return `${description} ${rock}`;
        }
        return `${actual}${isGemStone(obj.otyp, type) ? ' stone' : ''}`;
    }
    default:
        // C xname_flags() formats oclass numerically, then calls the
        // discarded-void pline.c:impossible() helper before continuing.
        const objectClass = typeof obj.oclass === 'number' ? obj.oclass
            : obj.oclass.charCodeAt(0);
        note_unported('pline.c impossible');
        return `glorkum ${objectClass} ${obj.otyp} ${obj.spe ?? 0}`;
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
    if (obj.oartifact
        && undiscovered_artifact(obj.oartifact, state))
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
    const article = just_an(str);
    // C an() uses strncat(BUFSZ - 1 - Strlen(buf)); preserve its byte limit.
    const remaining = BUFSZ - 1 - Strlen_(article, 'an', 2154);
    const text = truncateByteString(str, Math.min(
        remaining, Strlen_(str, 'an', 2154),
    ));
    return article + text;
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
                const special = SPECIAL_SUBJS.some((entry) => {
                    const entryLength = Strlen_(entry, 'vtense', 2610);
                    return (len === entryLength
                        && subj.slice(0, len).toLowerCase()
                            === entry.toLowerCase())
                    || (len > entryLength && subj[spot - entryLength] === ' '
                        && subj.slice(spot - entryLength + 1, spot + 1)
                            .toLowerCase() === entry.toLowerCase())
                });
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

// C objnam.c nextobuf() rotates scratch buffers. JavaScript strings are
// immutable and have independent lifetimes, so this named adapter returns the
// completed buffer value without emulating a mutable ring or pointer alias.
function nextobuf(value = '') {
    return String(value);
}

// C objnam.c xname_flags() (581-1030). Its C char-pointer result is represented
// by the immutable name plus the byte offset that doname_base retains.
export function xname_flags(obj, state, cxnFlags = CXN_NORMAL) {
    if (!obj || typeof obj !== 'object')
        throw new TypeError('xname_flags requires an object');
    const quantity = Math.trunc(obj.quan ?? 1);
    if (quantity <= 0)
        throw new RangeError('xname_flags requires positive quantity');
    const type = objectType(obj, state);
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
    const instanceName = obj.oextra?.oname;
    // C ref: objnam.c xname_flags():1006-1008. When an artifact instance
    // name starts with "The ", C lowercases only that initial T after it
    // appends the name, whether the name is the whole result or a suffix.
    const displayedInstanceName = obj.oartifact
        && typeof instanceName === 'string'
        && instanceName.startsWith('The ')
        ? `t${instanceName.slice(1)}` : instanceName;
    let base = personalName
        ? String(displayedInstanceName)
        : xnameBase(obj, type, state, ident);
    base = nextobuf(base);
    if (!personalName && eos(base) > BUFSZ - PREFIX - 1)
        throw new RangeError('xname: buffer overflow before appending name.');
    if (quantity !== 1 && !(cxnFlags & CXN_SINGULAR)) {
        base = obj.otyp === SLIME_MOLD
            ? makeplural(makesingular(base))
            : makeplural(base);
        // C Concat() copies the pluralized result back into obuf[PREFIX..].
        base = truncateByteString(base, BUFSZ - PREFIX - 1);
    }
    // C's personal-name branch also copies through Concat().
    if (personalName) base = truncateByteString(base, BUFSZ - PREFIX - 1);
    // objnam.c:xname_flags() adds readable-object disclosure text after
    // pluralization; its nameit fast path rejoins before this block.
    if (state.program_state?.gameover && obj.o_id
        && eos(base) < BUFSZ - PREFIX - 1) {
        if (obj.otyp === T_SHIRT || obj.otyp === ALCHEMY_SMOCK) {
            const text = obj.otyp === T_SHIRT
                ? tshirt_text(obj, state) : apron_text(obj, state);
            base = concatFormatNameBody(base, ` with text "${text}"`);
        } else if (obj.otyp === CANDY_BAR) {
            const label = candy_wrapper_text(obj);
            if (label)
                base = concatFormatNameBody(base, ` labeled "${label}"`);
        } else if (obj.otyp === HAWAIIAN_SHIRT) {
            base = concatFormatNameBody(
                base, ` with ${articleName(hawaiian_motif(obj, state))} motif`,
            );
        }
    }
    if (!personalName && instanceName && ident.dknown)
        base = truncateByteString(`${base} named ${displayedInstanceName}`, BUFSZ - PREFIX - 1);
    const bufferOffset = base.slice(0, 4).toLowerCase() === 'the ' ? 4 : 0;
    return {
        name: bufferOffset ? base.slice(bufferOffset) : base,
        // C returns buf+4 after stripping "the "; doname_base() retains the
        // original gx.xnamep-based end pointer and does not regain those bytes.
        bufferOffset,
    };
}

export const xnameFreshWithOffset = xname_flags;

// C objnam.c xname() (575-578) selects CXN_NORMAL. The optional result form
// carries the interior-buffer offset that C callers retain from its char *;
// ordinary callers still receive the pointed-to string.
export function xname(obj, state, { withOffset = false } = {}) {
    const result = xname_flags(obj, state);
    return withOffset ? result : result.name;
}
export const xnameFresh = xname;

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

// C ref: objnam.c actualoname() (2494). Temporarily force full type
// identification while formatting the simplest name, then clear the flag as
// the C assignment does.
export function actualoname(obj, state = game) {
    state.iflags ??= {};
    state.iflags.override_ID = true;
    try {
        return minimal_xname(obj, state);
    } finally {
        state.iflags.override_ID = false;
    }
}

// C ref: objnam.c simpleonames() (2427-2442). "scroll" or "scrolls":
// minimal_xname's result, pluralized when quan != 1.
export function simpleonames(obj, state = game) {
    let name = minimal_xname(obj, state);
    if (Math.trunc(obj.quan ?? 1) !== 1)
        name = makeplural(name);
    return name;
}

// C ref: objnam.c ansimpleoname() (2446-2470). "a scroll" or "scrolls";
// "the Bell of Opening" for unique items whose actual name was used.
export function ansimpleoname(obj, state = game) {
    const simpleoname = simpleonames(obj, state);
    let otyp = obj.otyp;
    if (otyp === FAKE_AMULET_OF_YENDOR)
        otyp = AMULET_OF_YENDOR;
    const type = state.objects?.[otyp];
    if (type?.oc_unique && OBJ_NAME(type, state)
        && simpleoname === OBJ_NAME(type, state))
        return the(simpleoname, state);
    if ((obj.quan ?? 1) === 1)
        return an(simpleoname);
    return simpleoname;
}

// C ref: objnam.c thesimpleoname() (2474-2483). "the scroll" or "the scrolls".
export function thesimpleoname(obj, state = game) {
    return the(simpleonames(obj, state), state);
}

// C ref: objnam.c short_oname() (2009-2085). Produces a short object name
// for tight prompts. Tries func(obj) first; if the result exceeds lenlimit,
// truncates user-named and object-named strings, then strips bknown, rknown,
// greased, oeroded, and oeroded2 before retrying func and finally altfunc.
// The object is not permanently modified.
export function short_oname(obj, func, altfunc, lenlimit, state = game) {
    let out = func(obj, state);
    const byteLength = (value) => encodeUtf8ByteString(value).length;
    if (byteLength(out) <= lenlimit) return out;

    // C ref: objnam.c:2023-2063. The fixed local buffers hold eight bytes
    // followed by "...". Both naming locations are restored along with the
    // object fields before returning, even if a formatter refuses a branch.
    const type = state.objects?.[obj.otyp];
    const savedUname = type?.oc_uname;
    const savedOname = obj.oextra?.oname;
    const unameShort = typeof savedUname === 'string'
        && byteLength(savedUname) >= 12
        ? `${truncateByteString(savedUname, 8)}...` : null;
    const onameShort = typeof savedOname === 'string'
        && byteLength(savedOname) >= 12
        ? `${truncateByteString(savedOname, 8)}...` : null;
    const savedAttributes = Object.fromEntries(
        ['bknown', 'rknown', 'greased', 'oeroded', 'oeroded2'].map((key) => [
            key,
            { present: Object.hasOwn(obj, key), value: obj[key] },
        ]),
    );
    const fits = (value) => byteLength(value) <= lenlimit;
    try {
        if (unameShort !== null) {
            type.oc_uname = unameShort;
            out = func(obj, state);
            type.oc_uname = savedUname;
            if (fits(out)) return out;
        }
        if (onameShort !== null) {
            obj.oextra.oname = onameShort;
            out = func(obj, state);
            obj.oextra.oname = savedOname;
            if (fits(out)) return out;
        }
        if (unameShort !== null && onameShort !== null) {
            type.oc_uname = unameShort;
            obj.oextra.oname = onameShort;
            out = func(obj, state);
            if (fits(out)) return out;
        }

        // C ref: objnam.c:2065-2077. Strip name-lengthening attributes,
        // retry the primary formatter, then use the alternate only if needed.
        obj.bknown = 0;
        obj.rknown = 0;
        obj.greased = 0;
        obj.oeroded = 0;
        obj.oeroded2 = 0;
        out = func(obj, state);
        if (altfunc && !fits(out)) {
            out = altfunc(obj, state);
        }
    } finally {
        if (type && unameShort !== null) type.oc_uname = savedUname;
        if (obj.oextra && onameShort !== null)
            obj.oextra.oname = savedOname;
        for (const [key, saved] of Object.entries(savedAttributes)) {
            if (saved.present) obj[key] = saved.value;
            else delete obj[key];
        }
    }
    return out;
}

// C ref: objnam.c ysimple_name() (2391-2398). "your <minimal_xname>" for what
// the hero carries, "the <minimal_xname>" for what she does not, or a
// shopkeeper's possessive where shk_your() finds an owner.
export function ysimple_name(obj, state = game) {
    const prefix = shk_your(obj, state);
    const remaining = BUFSZ - 1 - Strlen_(prefix, 'ysimple_name', 2395);
    const name = minimal_xname(obj, state);
    return prefix + truncateByteString(name, Math.min(
        remaining, Strlen_(name, 'ysimple_name', 2395),
    ));
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
                    : is_flammable(obj, state) ? 'fireproof'
                        : isCrackable(obj, state) ? 'tempered'
                            : is_rottable(obj, state) ? 'rotproof' : '');
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

// C refs: objnam.c doname_base(DONAME_WITH_PRICE) and invent.c currency().
// This check is mutation-free so movement can refuse every pile member before
// the hero, discovery catalog, quote catalog, or display changes.
export function assertPricedObjectNameable(obj, state = game) {
    return get_cost_of_shop_item(obj, state, { observed: true });
}

// C ref: objnam.c doname(), the owornmask suffixes. Amulets, armor, and worn
// tools are answered inside its class switch; the wielded, alternate-weapon,
// and quiver phrases follow the charge and lit text, which is the order the
// port assembles them in too.
//
// C ref: objnam.c:1391-1621. Keep the class-switch worn text and the later
// weapon/swap/quiver suffixes in this source order.
function wornClassSuffix(obj, type, state, body, bufferOffset) {
    const mask = obj.owornmask ?? 0;
    if (!mask) return body;
    const classForSuffix = obj.otyp === MEAT_RING ? RING_CLASS
        : is_weptool(obj, state) ? WEAPON_CLASS : obj.oclass;
    // objnam.c:1540-1546. Punishment's ball and chain are named before the
    // remaining worn-mask phrases; W_BALL takes precedence when both bits
    // are present, matching C's conditional expression.
    if ((classForSuffix === BALL_CLASS || classForSuffix === CHAIN_CLASS)
        && (mask & (W_BALL | W_CHAIN))) {
        body = concatFormatNameBody(
            body, ` (${mask & W_BALL ? 'chained' : 'attached'} to you)`,
            0, bufferOffset,
        );
    }
    if (classForSuffix === ARMOR_CLASS && (mask & W_ARMOR)) {
        const phrase = obj === state.uskin ? 'embedded in your skin'
            : doffing(obj, state) ? 'being doffed'
                : donning(obj, state) ? 'being donned' : 'being worn';
        body = concatNameBody(body, ` (${phrase})`, 0, bufferOffset);
        // objnam.c:1404-1406 appends after the just-written closing paren
        // through Concat; :1410-1414 uses ConcatF to replace the next paren.
        if (obj === state.uarmg && Glib(state) && body.endsWith(')'))
            body = concatNameBody(body, '; slippery)', 1, bufferOffset);
        if (!heroIsBlind(state) && obj.lamplit && artifact_light(obj)
            && body.endsWith(')')) {
            body = concatFormatNameBody(
                body, `, ${arti_light_description(obj, state)} lit)`, 1,
                bufferOffset,
            );
        }
    } else if ((classForSuffix === AMULET_CLASS && (mask & W_AMUL))
        || (classForSuffix === TOOL_CLASS && (mask & (W_TOOL | W_SADDLE)))) {
        body = concatNameBody(body, ' (being worn)', 0, bufferOffset);
    }
    // objnam.c:1492-1499. Ring class adds "(on right hand)" or "(on left hand)"
    // based on which ring slot the hero wears it in. body_part(HAND) adapts
    // to polymorphed forms.
    if (classForSuffix === RING_CLASS) {
        if (mask & W_RINGR)
            body = concatNameBody(body, ' (on right ', 0, bufferOffset);
        if (mask & W_RINGL)
            body = concatNameBody(body, ' (on left ', 0, bufferOffset);
        if (mask & W_RING)
            body = concatFormatNameBody(
                body, `${body_part(HAND, state.youmonst)})`,
                0, bufferOffset,
            );
    }
    return body;
}

// C objnam.c:1561-1621; this group runs after the optional wizard gender
// suffix, so each bounded append sees the body produced by earlier groups.
function wornWeaponSuffix(obj, type, state, body, bufferOffset) {
    const mask = obj.owornmask ?? 0;
    // objnam.c:1561 also requires !gm.mrg_to_wielded. pickup.c:1881-1882 sets
    // that per-game flag only while pickup_prinv() names a stack merged into
    // the wielded weapon; options.js initializes it with the other gm fields.
    if ((mask & W_WEP) && !state.gm?.mrg_to_wielded) {
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
            body = concatNameBody(body, ' (wielded)', 0, bufferOffset);
        } else {
            const hand = body_part(HAND, state.youmonst);
            const hands = bimanual(obj, state)
                ? makeplural(hand)
                : `${state.u.uhandedness === RIGHT_HANDED ? 'right' : 'left'
                } ${hand}`;
            // objnam.c:1591-1595. An AKLYS uses the dedicated tethered phrase
            // while every other single weapon follows the same hand choice.
            const handPrefix = obj.otyp === AKLYS ? 'tethered to'
                : twoweapPrimary ? 'wielded in' : 'weapon in';
            body = concatFormatNameBody(
                body, ` (${handPrefix} ${hands})`, 0, bufferOffset,
            );
            const warnCount = Math.trunc(state.warn_obj_cnt ?? 0);
            const warnOfMon = Math.trunc(
                state.u?.uprops?.[WARN_OF_MON]?.extrinsic ?? 0,
            );
            const spaceleft = nameBodySpaceLeft(body, bufferOffset);
            if (!heroIsBlind(state) && spaceleft > 0 && body.endsWith(')')
                && warnCount && obj === state.uwep && (warnOfMon & W_WEP)) {
                body = concatFormatNameBody(
                    body, `, ${glow_verb(warnCount, true)} ${glow_color(
                        obj.oartifact, state,
                    )})`, 1,
                    bufferOffset,
                );
            } else if (!heroIsBlind(state) && spaceleft > 0
                && body.endsWith(')')
                && obj.lamplit && artifact_light(obj)) {
                body = concatFormatNameBody(
                    body, `, ${arti_light_description(obj, state)} lit)`, 1,
                    bufferOffset,
                );
            }
        }
    }
    if (mask & W_SWAPWEP) {
        // objnam.c:1613-1621. The secondary names the other hand from the
        // primary, so URIGHTY picks "left" here where :1586 picked "right".
        if (state.u.twoweap) {
            const side = state.u.uhandedness === RIGHT_HANDED
                ? 'left' : 'right';
            const hand = body_part(HAND, state.youmonst);
            body = concatFormatNameBody(
                body, ` (wielded in ${side} ${hand})`, 0, bufferOffset,
            );
        } else {
            body = concatFormatNameBody(
                body, ` (alternate weapon${obj.quan === 1 ? '' : 's'
                }; not wielded)`,
                0, bufferOffset,
            );
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
        body = concatFormatNameBody(body, ` (${qtyp === 1 ? 'in quiver'
            : qtyp === 2 ? 'in quiver pouch' : 'at the ready'})`,
        0, bufferOffset);
    }
    return body;
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
        // C OBJ_NAME(objects[otyp]); glob names have no corpse suffix and
        // their quantity is always treated as one.
        mnam = OBJ_NAME(objectType(otmp, state), state);
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

    if (!adjective || adjective.length === 0) {
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

    if (!glob && !omit_corpse) {
        nambuf += ' corpse';
        /* makeplural(nambuf) => append "s" to "corpse" */
        if (otmp.quan > 1 && !ignore_quan) {
            nambuf += 's';
            any_prefix = false; /* avoid "a newt corpses" */
        }
    }

    if (any_prefix)
        nambuf = an(nambuf);
    return nextobuf(nambuf);
}

// C ref: objnam.c cxname() (1922-1930). xname() drops a corpse's monster
// type, so a corpse goes to corpse_xname() instead.
export function cxname(obj, state = game) {
    if (obj.otyp === CORPSE)
        return corpse_xname(obj, null, CXN_NORMAL, state);
    return xnameFresh(obj, state);
}

// C ref: objnam.c cxname_singular() (1933-1938). Unlike changing quan on the
// object, CXN_SINGULAR suppresses only xname_flags' pluralization decision.
export function cxname_singular(obj, state = game) {
    if (obj.otyp === CORPSE)
        return corpse_xname(obj, null, CXN_SINGULAR, state);
    return xname_flags(obj, state, CXN_SINGULAR).name;
}

// C ref: objnam.c killer_xname() (1942-2005). Death reasons identify the
// object type but suppress BUC, erosion-proof, grease, poison, and
// player-assigned names. All temporary identification is restored before
// returning, so calculating a killer string does not teach the hero anything.
export function killer_xname(obj, state = game) {
    if (obj.oartifact)
        return bare_artifactname(obj, state);

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
        obj.bknown = obj.otyp === POT_WATER;
        obj.rknown = false;
        obj.greased = false;
        if (obj.otyp !== POT_WATER) {
            obj.blessed = false;
            obj.cursed = false;
        }
        obj.opoisoned = false;
        if (savedExtra?.oname) {
            obj.oextra = { ...savedExtra };
            delete obj.oextra.oname;
        }
        type.oc_name_known = true;
        type.oc_uname = null;

        let name;
        if (obj.otyp === CORPSE) {
            name = corpse_xname(obj, null, CXN_NORMAL, state);
        } else if (obj.otyp === SLIME_MOLD) {
            name = `deadly slime mold${plur(obj.quan)}`;
        } else {
            name = xnameFresh(obj, state);
        }
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
                } else if (namingIndex < 0) {
                    const length = Strlen_(str, 'the', 2220);
                    if (length >= 31) {
                        const bytes = encodeUtf8ByteString(str).slice(0, length);
                        const suffix = encodeUtf8ByteString(
                            'Platinum Yendorian Express Card',
                        );
                        if (bytes.length >= suffix.length
                            && suffix.every((byte, index) => (
                                bytes[bytes.length - suffix.length + index] === byte
                            )))
                            insertThe = true;
                    }
                }
            }
        }
    }
    const prefix = insertThe ? 'the ' : '';
    const remaining = BUFSZ - 1 - Strlen_(prefix, 'the', 2230);
    const text = truncateByteString(str, Math.min(
        remaining, Strlen_(str, 'the', 2230),
    ));
    return prefix + text;
}

// C ref: objnam.c The() (2234-2241). the() with its first character
// capitalized.
export function The(str, state = game) {
    const tmp = the(str, state);
    return highc(tmp[0]) + tmp.slice(1);
}

// C ref: obj.h is_plural() (421-427). The Eyes of the Overworld are plural
// once they appear in artidisco, independently of artiexist[].found.
export function is_plural(otmp, state = game) {
    if (otmp.quan !== 1) return true;
    if (otmp.oartifact === ART_EYES_OF_THE_OVERWORLD)
        return !undiscovered_artifact(ART_EYES_OF_THE_OVERWORLD, state);
    return false;
}

// C ref: objnam.c otense() (2529-2545). `verb` arrives in the plural, without
// a trailing s, and comes back agreeing with what xname(otmp) would be.
export function otense(otmp, verb, state = game) {
    if (!is_plural(otmp, state))
        return vtense(null, verb);
    return verb;
}

// C ref: objnam.c strprepend() (123-135). C writes into the prefix area
// before the existing string. JavaScript returns the equivalent string and
// retains C's discarded impossible() path when a prefix exceeds PREFIX bytes.
export function strprepend(s, pref) {
    if (Strlen_(pref, 'strprepend', 126) > PREFIX) {
        note_unported('pline.c impossible');
        return s;
    }
    return `${pref}${s}`;
}

// C ref: objnam.c aobjnam() (2242-2258). "count cxname(otmp)", or just
// cxname(otmp) when the count is 1, with the verb agreed and appended.
export function aobjnam(otmp, verb, state = game) {
    let bp = cxname(otmp, state);

    if (otmp.quan !== 1)
        bp = strprepend(bp, `${otmp.quan} `);
    if (verb)
        bp = `${bp} ${otense(otmp, verb, state)}`;
    return bp;
}

// C ref: objnam.c yobjnam() (2262-2276). Combines aobjnam() with the
// possessive prefix used by yname(), retaining counts for plural objects.
export function yobjnam(obj, verb, state = game) {
    const s = aobjnam(obj, verb, state);

    if (!carried(obj)
        || !obj_is_pname(obj, state)
        || obj.oartifact >= ART_ORB_OF_DETECTION) {
        const prefix = shk_your(obj, state);
        const remaining = BUFSZ - 1 - Strlen_(prefix, 'yobjnam', 2271);
        return prefix + truncateByteString(s, Math.min(
            remaining, Strlen_(s, 'yobjnam', 2271),
        ));
    }
    return s;
}

// C ref: objnam.c Yobjnam2() (2280-2285). Capitalized yobjnam().
export function Yobjnam2(obj, verb, state = game) {
    const s = yobjnam(obj, verb, state);
    return highc(s[0]) + s.slice(1);
}

// C ref: objnam.c Tobjnam() (2288-2299). Its own comment: "like aobjnam, but
// prepend 'The', not count, and use xname". zap.c dozap() names the wand that
// crumbles with it.
export function Tobjnam(otmp, verb, state = game) {
    const bp = The(xnameFresh(otmp, state), state);

    if (verb)
        return `${bp} ${otense(otmp, verb, state)}`;
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
export function yname(obj, state = game, env = {}) {
    const s = cxname(obj, state);

    if (!carried(obj)
        || !obj_is_pname(obj, state)
        || obj.oartifact >= ART_ORB_OF_DETECTION) {
        const prefix = shk_your(obj, state, env);
        const remaining = BUFSZ - 1 - Strlen_(prefix, 'yname', 2368);
        return prefix + truncateByteString(s, Math.min(
            remaining, Strlen_(s, 'yname', 2368),
        ));
    }
    return s;
}

// C ref: objnam.c Yname2() (2376-2383). yname() with its first character
// capitalized, so that the name can open a sentence.
export function Yname2(obj, state = game, env = {}) {
    const s = yname(obj, state, env);

    return highc(s[0]) + s.slice(1);
}

// C ref: objnam.c doname_base() (1223-1752). `xname()` is deliberately first;
// every flag below is read after its source-ordered discovery updates.
function doname_base(
    obj,
    donameFlags = 0,
    state = game,
    { currencyName = currency } = {},
) {
    const withPrice = Boolean(donameFlags & DONAME_WITH_PRICE);
    const vagueQuantity = Boolean(donameFlags & DONAME_VAGUE_QUAN);
    const forMenu = Boolean(donameFlags & DONAME_FOR_MENU);
    const type = objectType(obj, state);
    const omndx = Math.trunc(obj.corpsenm ?? NON_PM);
    const xnameBuffer = xname(obj, state, { withOffset: true });
    let base = xnameBuffer.name;
    let bufferOffset = xnameBuffer.bufferOffset;
    const xnameResult = base;
    // objnam.c:1254-1262 reads these after `bp = xname(obj)` at :1247;
    // xnameFresh() can clear known for an undiscovered unique object.
    const ident = identificationFlags(obj, type, state);
    const quantity = Math.trunc(obj.quan);
    const modifiers = [];
    let corpsePrefix = null;
    const fakeArtifact = obj.otyp === SLIME_MOLD
        ? artifact_name(xnameResult, null, false, state) : null;
    const buc = bucWord(obj, type, state, ident);
    if (buc) modifiers.push(buc);
    // objnam.c:1291-1300. Known bags of tricks and horns judge emptiness by
    // charges; other containers and statues use their known content chain.
    if (ident.cknown
        && ((obj.otyp === BAG_OF_TRICKS || obj.otyp === HORN_OF_PLENTY)
            ? obj.spe === 0 && !ident.known
            : (isContainer(obj) || obj.otyp === STATUE) && !hasContents(obj))) {
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
    // objnam.c:1373-1380 counts top-level stacks, not quantities or nested
    // contents. Keep invent.c's count_contents as the one implementation.
    if (ident.cknown && hasContents(obj)
        && nameBodySpaceLeft(base, bufferOffset) > 0) {
        const itemcount = count_contents(obj, false, false, true, false, state);
        base = concatFormatNameBody(
            base, ` containing ${itemcount} item${itemcount !== 1 ? 's' : ''}`,
            0, bufferOffset,
        );
    }
    // objnam.c:1382-1537. One class switch determines prefix words and tool,
    // charge, candle, corpse, egg and ring-specific suffixes.
    const nameClass = is_weptool(obj, state) ? WEAPON_CLASS : obj.oclass;
    let allowToolChargeSuffix = true;
    switch (nameClass) {
    case WEAPON_CLASS:
    case ARMOR_CLASS:
        if (base.startsWith('poisoned ') && obj.opoisoned) {
            base = base.slice('poisoned '.length);
            bufferOffset += encodeUtf8ByteString('poisoned ').length;
            modifiers.push('poisoned');
        }
        modifiers.push(...erosionWords(obj, state, ident.rknown));
        if (ident.known) modifiers.push(signed(obj.spe));
        break;
    case TOOL_CLASS:
        if (obj.owornmask & (W_TOOL | W_SADDLE)) {
            allowToolChargeSuffix = false;
            break;
        }
        if (obj.otyp === LEASH && obj.leashmon) {
            const monster = find_mid(obj.leashmon, FM_FMON, state);
            if (monster && monster.mhp >= 1) {
                base = concatFormatNameBody(
                    base, ` (attached to ${noit_mon_nam(monster, state)})`,
                    0, bufferOffset,
                );
            } else {
                note_unported('pline.c impossible');
                obj.leashmon = 0;
            }
            allowToolChargeSuffix = false;
            break;
        }
        if (obj.otyp === CANDELABRUM_OF_INVOCATION) {
            const candles = Math.trunc(obj.spe);
            base = concatFormatNameBody(
                base, ` (${candles} of 7 candle${plur(candles)}`
                    + `${obj.lamplit ? ', lit' : ' attached'})`,
                0, bufferOffset,
            );
            allowToolChargeSuffix = false;
            break;
        }
        if (obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP
            || obj.otyp === BRASS_LANTERN || isCandle(obj)) {
            if (isCandle(obj)) {
                const fullBurnTime = 20 * Math.trunc(type.oc_cost);
                let turnsLeft = Math.trunc(obj.age);
                if (obj.lamplit) {
                    // timeout.c:1471 obtains the absolute BURN_OBJECT timer;
                    // subtracting current moves recovers its remaining burn.
                    turnsLeft += peek_timer(BURN_OBJECT, obj, state)
                        - Math.trunc(state.moves ?? 0);
                }
                if (turnsLeft < fullBurnTime)
                    modifiers.push('partly used');
            }
            if (obj.lamplit)
                base = concatNameBody(base, ' (lit)', 0, bufferOffset);
            allowToolChargeSuffix = false;
        }
        break;
    case RING_CLASS:
        if (ident.known && type.oc_charged)
            modifiers.push(signed(obj.spe));
        break;
    case FOOD_CLASS:
        if (obj.oeaten) modifiers.push('partly eaten');
        if (obj.otyp === CORPSE) {
            const countPrefix = quantity !== 1
                ? (ident.dknown || !vagueQuantity
                    ? String(quantity) : 'some') : '';
            const adjective = [countPrefix, ...modifiers].filter(Boolean)
                .join(' ');
            const corpseFlags = (quantity === 1 ? CXN_ARTICLE : 0)
                | CXN_NOCORPSE;
            // C stores corpse_xname() in prefix[] while bp remains xname()'s
            // separate "corpse" buffer, where later suffixes are bounded.
            corpsePrefix = `${corpse_xname(
                obj, adjective, corpseFlags, state,
            )} `;
            modifiers.length = 0;
        } else if (obj.otyp === EGG && ismnum(omndx)
            && (ident.known
                || (state.mvitals?.[omndx]?.mvflags & MV_KNOWS_EGG))) {
            // objnam.c keeps the species in prefix[] and appends only the
            // "laid by you" phrase to bp, in that order.
            modifiers.push(state.mons[omndx].pmnames[NEUTRAL]);
            if (obj.spe === 1)
                base = concatNameBody(base, ' (laid by you)', 0, bufferOffset);
        } else if (obj.otyp === MEAT_RING) {
            if (ident.known && type.oc_charged)
                modifiers.push(signed(obj.spe));
        }
        break;
    case BALL_CLASS:
    case CHAIN_CLASS:
        if (erosion_matters(obj, state))
            modifiers.push(...erosionWords(obj, state, ident.rknown));
        break;
    default:
        break;
    }
    if (nameClass === POTION_CLASS && obj.otyp === POT_OIL && obj.lamplit) {
        base = concatNameBody(base, ' (lit)', 0, bufferOffset);
    } else if (nameClass === WAND_CLASS
        || (nameClass === TOOL_CLASS && type.oc_charged
            && allowToolChargeSuffix)) {
        base = concatFormatNameBody(
            base, chargedSuffix(obj, type, ident.known),
            0, bufferOffset,
        );
    }
    // C's class-switch suffixes precede wizard gender, which in turn comes
    // before W_WEP, W_SWAPWEP and W_QUIVER.
    base = wornClassSuffix(obj, type, state, base, bufferOffset);
    base = concatFormatNameBody(
        base, wizmgenderSuffix(obj, state), 0, bufferOffset,
    );
    base = wornWeaponSuffix(obj, type, state, base, bufferOffset);

    // objnam.c:1648-1749 performs unpaid/live/remembered pricing, then adds
    // wizard weight before the constructed prefix is prepended.
    const pricesSuppressed = Boolean(
        state.iflags?.suppress_price || state.program_state?.restoring,
    );
    let wizardWeightSpaceLeft = null;
    if (!pricesSuppressed && is_unpaid(obj)) {
        const quotedprice = unpaid_cost(obj, COST_CONTENTS, state);
        base = concatFormatNameBody(
            base, ` (${obj.unpaid ? 'unpaid' : 'contents'}, ${quotedprice} ${
                currencyName(quotedprice, state)})`,
            0, bufferOffset,
        );
        record_price_quote(
            obj.otyp, Math.trunc(quotedprice / obj.quan), true, state,
        );
    } else if (!pricesSuppressed && withPrice) {
        const quote = get_cost_of_shop_item(obj, state);
        if (quote.cost > 0) {
            base = concatFormatNameBody(
                base, ` (${quote.noCharge ? 'contents' : 'for sale'}, `
                    + `${quote.cost} ${currencyName(quote.cost, state)})`,
                0, bufferOffset,
            );
            record_price_quote(
                obj.otyp, Math.trunc(quote.cost / obj.quan), true, state,
            );
        } else if (quote.noCharge) {
            base = concatNameBody(base, ' (no charge)', 0, bufferOffset);
        } else if (state.iflags?.pricequotes && !type.oc_name_known) {
            wizardWeightSpaceLeft = nameBodySpaceLeft(base, bufferOffset);
            base += append_price_quote(base, obj.otyp, state);
        }
    } else if (!pricesSuppressed && state.iflags?.pricequotes
        && !type.oc_name_known) {
        wizardWeightSpaceLeft = nameBodySpaceLeft(base, bufferOffset);
        base += append_price_quote(base, obj.otyp, state);
    }

    // C appends wizard weight to bp before inserting the constructed prefix.
    // Its actual last byte selects the priced closing-paren replacement.
    if (state.wizard && state.iflags?.wizweight) {
        const amount = `${Math.trunc(obj.owt)} aum`;
        if (withPrice && base.endsWith(')'))
            base = concatFormatNameBody(
                base, `, ${amount})`, 1, bufferOffset,
                wizardWeightSpaceLeft,
            );
        else
            base = concatFormatNameBody(
                base, ` (${amount})`, 0, bufferOffset,
                wizardWeightSpaceLeft,
            );
    }
    const corpsePrefixConsumed = corpsePrefix !== null;
    const unprefixedWords = [...modifiers, base].filter(Boolean).join(' ');
    let words;
    if (corpsePrefixConsumed) {
        // C stores corpse_xname()'s complete article/count prefix separately,
        // then inserts it into bp with strprepend() at the end of doname_base.
        words = strprepend(base, corpsePrefix);
    } else if (quantity !== 1) {
        const count = ident.dknown || !vagueQuantity ? quantity : 'some';
        words = strprepend(unprefixedWords, `${count} `);
    } else if (fakeArtifact?.slice(0, 4).toLowerCase() === 'the '
        || obj_is_pname(obj, state)
        || theUniqueObject(obj, type, state)) {
        words = strprepend(unprefixedWords.replace(/^the /iu, ''), 'the ');
    } else if (!fakeArtifact) {
        // C's just_an() builds the ordinary article in prefix[] before the
        // final strprepend(bp, prefix) call.
        words = strprepend(unprefixedWords, just_an(unprefixedWords));
    } else {
        words = unprefixedWords;
    }

    const byteLength = encodeUtf8ByteString(words).length;
    if (byteLength > BUFSZ - 1)
        throw new RangeError('doname: long object description overflow.');
    const menuOffset = forMenu ? 4 : 0;
    if (byteLength + menuOffset >= BUFSZ - 1)
        words = truncateByteString(words, BUFSZ - 1 - menuOffset);
    return words;
}

// C ref: objnam.c doname_base() (1648-1664), shared by ordinary inventory
// names and the existing separate corpse formatter.
export function donameFresh(obj, state = game) {
    return doname_base(obj, 0, state);
}

// C ref: objnam.c doname_vague_quan(). Farlook keeps an unknown stack's
// quantity vague while preserving the ordinary doname formatter for every
// other object and identification state.
export function doname_vague_quan(obj, state = game) {
    return doname_base(obj, DONAME_VAGUE_QUAN, state);
}

// C ref: objnam.c Doname2() (2303-2309).
export function Doname2(obj, state = game) {
    const name = donameFresh(obj, state);
    return highc(name[0]) + name.slice(1);
}

// C ref: objnam.c paydoname() (2313-2355). The pay menu owns the price;
// hide contents and wizard weights while formatting its object name.
export function paydoname(obj, state = game) {
    const savedKnown = obj.cknown;
    const savedWeight = state.iflags.wizweight;
    const contents = hasContents(obj);
    if (contents) obj.cknown = 0;
    state.iflags.wizweight = false;
    state.iflags.suppress_price = (state.iflags.suppress_price ?? 0) + 1;
    let name;
    try {
        name = donameFresh(obj, state);
    } catch (error) {
        // An existing naming refusal must not leak the temporary flag.
        obj.cknown = savedKnown;
        throw error;
    } finally {
        --state.iflags.suppress_price;
        state.iflags.wizweight = savedWeight;
    }
    if (contents) {
        if (!obj.no_charge) {
            name = name.replace(/^an? /u, '');
            name = strprepend(name, obj.unpaid ? 'an unpaid ' : 'your ');
        }
        if (!obj.cknown) {
            if (obj.unpaid) {
                const suffix = ' and its contents';
                if (name.length + suffix.length < BUFSZ - PREFIX) name += suffix;
            } else name = strprepend(name, 'the contents of ');
        }
    }
    obj.cknown = savedKnown;
    return name;
}

// C ref: objnam.c doname_base(DONAME_WITH_PRICE), through its ordinary floor
// item branch, its container-contents caller, and inventory items (OBJ_INVENT,
// e.g. worn hero items during theft). xname() observes first, the suffix uses
// the resulting price, and record_price_quote() is the final durable write.
// For a contained or inventory item outside a shop, C's helper returns no live
// price and doname_base() falls through to the remembered quote branch.
export function doname_with_price(
    obj,
    state,
    { currencyName = currency } = {},
) {
    return doname_base(obj, DONAME_WITH_PRICE, state, { currencyName });
}

// C ref: objnam.c distant_name(). Format an object seen from wherever the
// hero stands. `func` is xname() or doname(); the near test rounds the corners
// of a square whose radius is 2, or the hero's larger xray range, and an
// artifact always counts as near. Everything else formats with
// gd.distantname raised, which suppresses the dknown and discovery writes
// xname() would otherwise make.
//
// C saves obj->o_id and zeroes it before either the near check or formatter
// call during gameover, then restores it even when formatting exits early.
export function distant_name(obj, func, state = game) {
    if (typeof func !== 'function')
        throw new TypeError('distant_name requires a formatting function');
    const gameover = Boolean(state.program_state?.gameover);
    const hadObjectId = Object.hasOwn(obj, 'o_id');
    const savedObjectId = obj.o_id;
    if (gameover) obj.o_id = 0;
    try {
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
            // C's `--gd.distantname` cannot be skipped; the counter controls
            // observation for later names in the same game.
            state.gd.distantname -= 1;
        }
    } finally {
        if (hadObjectId) obj.o_id = savedObjectId;
        else delete obj.o_id;
    }
}

// C ref: objnam.c bare_artifactname() (2502-2515). Returns the artifact's
// name with a leading "The" lowered to "the", or xnameFresh for non-artifacts.
export function bare_artifactname(obj, state = game) {
    if (obj.oartifact) {
        let name = artiname(obj.oartifact, state);
        if (name.startsWith('The '))
            name = 't' + name.slice(1);
        return name;
    }
    return xnameFresh(obj, state);
}

// C ref: objnam.c safe_qbuf() (5624-5698). Builds a prompt string from an
// optional prefix, an object name, and an optional suffix. The C version
// guards against QBUFSZ overflow by trying the primary function, then a
// shorter alternative, then a last-resort literal. Buffer lengths count
// encoded C-string bytes, including when output is reused as the next prefix.
export function safe_qbuf(
    prefix, suffix, obj, func, altfunc, lastR, state = game,
) {
    const limit = QBUFSZ - 1;
    const qprefix = prefix == null ? '' : String(prefix);
    const qsuffix = suffix == null ? '' : String(suffix);
    const fallback = String(lastR);
    const byteLength = (value) => encodeUtf8ByteString(value).length;
    let result = truncateByteString(qprefix, limit);

    if (byteLength(result) + byteLength(fallback) + byteLength(qsuffix)
        > limit) {
        result += truncateByteString(
            fallback, Math.max(0, limit - byteLength(result)),
        );
        if (byteLength(result) < limit)
            result += truncateByteString(
                qsuffix, limit - byteLength(result),
            );
        return result;
    }

    const name = short_oname(
        obj, func, altfunc,
        limit - byteLength(result) - byteLength(qsuffix), state,
    );
    result += byteLength(result) + byteLength(name) + byteLength(qsuffix)
        <= limit ? name : fallback;
    result += qsuffix;
    return result;
}
