// Runtime object naming for the early movement, pet, trap, and combat paths.
// C refs: objnam.c xname(), corpse_xname(), doname(), distant_name(), cxname(),
// The(), aobjnam(), otense(), singular(), yname() and Yname2().
//
// objnam.c is split across two files. Its wish-parsing group lives in
// js/objnam_readobjnam.js: readobjnam() and its five-function chain,
// wishymatch(), rnd_otyp_by_namedesc() and the o_ranges[], spellings[], wrp[]
// and wrpsym[] tables. Neither file imports the other. That file reaches the
// objects[] tables through js/objects.js OBJ_NAME() and OBJ_DESCR(), and
// object construction through js/obj.js.

import {
    ART_EYES_OF_THE_OVERWORLD, find_artifact, permapoisoned,
} from './artifacts.js';
import {
    BLINDED, CORPSTAT_HISTORIC, HALLUC, HALLUC_RES, HAND, NON_PM, P_BOW,
    W_AMUL, W_ARMG, W_ARMOR, W_QUIVER, W_RING, W_RINGL, W_RINGR, W_SADDLE,
    W_SWAPWEP, W_TOOL, W_WEP,
} from './const.js';
import {
    fruit_from_indx, makeplural, makesingular, matching_artifact_fruit,
} from './fruit.js';
import { tin_details } from './eat.js';
import { game } from './gstate.js';
import { dist2, highc, lowc, strcasecpy } from './hacklib.js';
import { get_obj_location } from './light.js';
import { cansee } from './vision.js';
import { body_part } from './polyself.js';
import { RIGHT_HANDED } from './u_init.js';
import { bimanual } from './worn.js';
import { PM_CLERIC, PM_SAMURAI } from './monsters.js';
import { observe_object } from './o_init.js';
import {
    erosionMatters, hasContents, isBox, isCandle, isContainer,
    isCorrodeable, isCrackable,
    isDamageable, isFlammable, isMultigen, isRottable, isRustprone,
    is_ammo, is_missile, is_weptool, objectType,
} from './obj.js';
import { JAPANESE_ITEM_NAMES } from './objnam_data.js';
import {
    AKLYS,
    ALCHEMY_SMOCK, AMULET_CLASS, AMULET_OF_YENDOR, ARMOR_CLASS, ARM_BOOTS,
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
function monsterObjectName(obj, state) {
    if (obj.corpsenm === NON_PM) return 'thing';
    return state.mons?.[obj.corpsenm]?.pmnames?.[2] ?? 'monster';
}
function isPoisonable(obj, state) {
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
    default: // eslint-disable-line no-fallthrough
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
function preflightXname(obj, type, state) {
    if (state.iflags?.override_ID)
        unsupported('override identification', obj);
    if (state.program_state?.gameover)
        unsupported('end-of-game object text', obj);
    if (type.oc_uname)
        unsupported('user-assigned type name', obj);
}

function preflightDoname(obj, type, state, allowLiveShopPrice) {
    preflightXname(obj, type, state);
    if (obj.unpaid)
        unsupported('shop price suffix', obj);
    if (!allowLiveShopPrice && state.iflags?.pricequotes && !type.oc_name_known)
        unsupported('price quote suffix', obj);
    if (obj.owornmask & (W_RING | W_RINGL | W_RINGR))
        unsupported('worn-ring suffix', obj);
    if (obj.owornmask && state.u?.twoweap)
        unsupported('two-weapon suffix', obj);
    if ((obj.owornmask & W_WEP) && obj.otyp === AKLYS)
        unsupported('tethered weapon suffix', obj);
    if ((obj.owornmask & W_ARMOR) && (obj === state.u?.uskin
        || obj.owornmask & W_ARMG))
        unsupported('embedded or gloved armor suffix', obj);
    if (obj.owornmask && obj.lamplit)
        unsupported('lit worn-object suffix', obj);
    // C names a container's contents only when it holds some; counting them
    // is pickup.c count_contents(), which is not ported.
    if (obj.cknown && hasContents(obj))
        unsupported('container contents count', obj);
    // These two judge emptiness by charges rather than contents, and the
    // charge suffix that makes the prefix redundant is a separate branch.
    if (obj.cknown
        && (obj.otyp === BAG_OF_TRICKS || obj.otyp === HORN_OF_PLENTY)) {
        unsupported('charge-based emptiness', obj);
    }
    if (isCandle(obj) && obj.lamplit)
        unsupported('lit candle timer adjustment', obj);
}
function xnameBase(obj, type, state) {
    const knownType = Boolean(type.oc_name_known);
    const dknown = Boolean(obj.dknown);
    const actual = sourceActualName(obj, type, state) ?? 'object?';
    const description = sourceDescription(obj, type, state, actual);

    switch (obj.oclass) {
    case AMULET_CLASS:
        if (!dknown) return 'amulet';
        if (obj.otyp === AMULET_OF_YENDOR
            || obj.otyp === FAKE_AMULET_OF_YENDOR) {
            return obj.known ? actual : description;
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
            const species = monsterObjectName(obj, state);
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
        if (obj.otyp === TIN && obj.known)
            return tin_details(obj, obj.corpsenm, actual, { state });
        return actual;
    case COIN_CLASS:
    case CHAIN_CLASS:
        return actual;
    case ROCK_CLASS:
        if (obj.otyp === STATUE && obj.corpsenm !== NON_PM) {
            const species = monsterObjectName(obj, state);
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
                const holy = obj.otyp === POT_WATER && obj.bknown
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
function notFullyIdentified(obj, type, state) {
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
function objectIsPersonalName(obj, type, state) {
    return Boolean(obj.oartifact
        && obj.oextra?.oname
        && !notFullyIdentified(obj, type, state));
}
function theUniqueObject(obj, type) {
    if (!obj.dknown) return false;
    if (obj.otyp === FAKE_AMULET_OF_YENDOR && !obj.known) return true;
    return Boolean(type.oc_unique
        && (obj.known || obj.otyp === AMULET_OF_YENDOR));
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
    if (!type.oc_name_known && type.oc_uses_known && type.oc_unique)
        obj.known = false;
    // C ref: objnam.c xname_flags():627, `if (!Blind && !gd.distantname)`.
    // distant_name() raises that counter around a formatting call for an
    // object the hero cannot inspect up close, so naming it neither sets
    // dknown nor enters the type in the discoveries list.
    if (!heroIsBlind(state) && !state.gd?.distantname)
        observe_object(obj, state);
    if (state.urole?.mnum === PM_CLERIC)
        obj.bknown = true;
    if (obj.oartifact && obj.dknown)
        find_artifact(obj, state);
    const personalName = objectIsPersonalName(obj, type, state);
    let base = personalName
        ? String(obj.oextra.oname)
        : xnameBase(obj, type, state);
    if (quantity !== 1) {
        base = obj.otyp === SLIME_MOLD
            ? makeplural(makesingular(base))
            : makeplural(base);
    }
    if (!personalName && obj.oextra?.oname && obj.dknown)
        base += ` named ${obj.oextra.oname}`;
    return base.replace(/^the /iu, '');
}
function bucWord(obj, type, state) {
    if (!obj.bknown || obj.oclass === COIN_CLASS) return '';
    if (obj.otyp === POT_WATER && type.oc_name_known
        && (obj.cursed || obj.blessed)) {
        return '';
    }
    if (obj.cursed) return 'cursed';
    if (obj.blessed) return 'blessed';
    if (state.flags?.implicit_uncursed === false)
        return 'uncursed';
    const needsUncursed = !obj.known
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
function erosionWords(obj, state) {
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
    if (obj.rknown && obj.oerodeproof) {
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
function chargedSuffix(obj, type) {
    return obj.known && type.oc_charged
        ? ` (${Math.trunc(obj.recharged)}:${Math.trunc(obj.spe)})`
        : '';
}
function corpseDoname(obj, modifiers, state) {
    const species = monsterObjectName(obj, state);
    const quantity = Math.trunc(obj.quan);
    const corpse = `${species} corpse${quantity === 1 ? '' : 's'}`
        + (obj.oextra?.oname && obj.dknown
            ? ` named ${obj.oextra.oname}` : '');
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
// port assembles them in too. doffing() and donning() cannot hold here,
// because no Wear or Take-off is in progress while a name is formatted.
function wornSuffix(obj, type, state) {
    const mask = obj.owornmask ?? 0;
    if (!mask) return '';
    const classForSuffix = is_weptool(obj, state) ? WEAPON_CLASS : obj.oclass;
    let suffix = '';
    if ((classForSuffix === AMULET_CLASS && (mask & W_AMUL))
        || (classForSuffix === ARMOR_CLASS && (mask & W_ARMOR))
        || (classForSuffix === TOOL_CLASS && (mask & (W_TOOL | W_SADDLE)))) {
        suffix += ' (being worn)';
    }
    if (mask & W_WEP) {
        // C uses the alternate phrasing for stacks, for wielded ammo and
        // missiles, and for non-weapons that are not weapon-tools.
        const alternate = obj.quan !== 1
            || (obj.oclass === WEAPON_CLASS
                ? (is_ammo(obj, state) || is_missile(obj, state))
                : !is_weptool(obj, state));
        if (alternate) {
            suffix += ' (wielded)';
        } else {
            const hand = body_part(HAND, state.youmonst);
            const hands = bimanual(obj, state)
                ? makeplural(hand)
                : `${state.u.uhandedness === RIGHT_HANDED ? 'right' : 'left'
                } ${hand}`;
            suffix += ` (weapon in ${hands})`;
        }
    }
    if (mask & W_SWAPWEP)
        suffix += ` (alternate weapon${obj.quan === 1 ? '' : 's'}; not wielded)`;
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

// C ref: objnam.c cxname() (1922-1930). xname() drops a corpse's monster
// type, so a corpse goes to corpse_xname() instead; that helper is unported
// and no wish this port grants makes a corpse.
export function cxname(obj, state = game) {
    if (obj.otyp === CORPSE)
        unsupported('corpse_xname() for cxname()', obj);
    return xnameFresh(obj, state);
}

// C ref: objnam.c singular() (2087-2105). Names one item of a stack by
// running the caller's namer with quan temporarily set to 1. C swaps xname()
// for cxname() on a corpse, because xname() would drop the monster type.
// cxname() is ported above, but it refuses a corpse itself, needing
// corpse_xname(), which is not. So the swap stops here rather than routing a
// corpse into a helper that would throw one frame later.
export function singular(otmp, func, state) {
    if (otmp.otyp === CORPSE && func === xnameFresh)
        throw new UnsupportedObjectNameError('cxname() for singular()', otmp);
    const savequan = otmp.quan;
    otmp.quan = 1;
    try {
        return func(otmp, state);
    } finally {
        otmp.quan = savequan;
    }
}

// C ref: objnam.c the() (2170-2237). Prefixes "the " to a name that needs an
// article.
//
// Only the two branches a lower-case name reaches are ported. C's third branch
// decides whether a capitalized name is a proper noun, and needs CapitalMon(),
// fruit_from_name() and artifact_name(); the arm above it that spares an
// already-prefixed string is one `strncmpi`, so it is cheaper to port than to
// justify leaving out. eat.c food_xname() is the only caller, and a comestible
// whose xname() starts with a capital needs a named fruit, so the stop below is
// reachable only through the `fruit:` option.
export function the(str) {
    if (!str) {
        // C's impossible() returns "the []" and carries on. Reaching it means
        // a caller handed this an empty name, which is a defect here.
        throw new Error('the(): empty name');
    }
    if (str.slice(0, 4).toLowerCase() === 'the ')
        return str[0].toLowerCase() + str.slice(1);
    if (str[0] >= 'A' && str[0] <= 'Z') {
        throw new UnsupportedObjectNameError(
            'the() for a name that may be a proper noun',
            null,
        );
    }
    /* not a proper name, needs an article */
    return `the ${str}`;
}

// C ref: objnam.c The() (2234-2241). the() with its first character
// capitalized.
export function The(str) {
    const tmp = the(str);
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

// C ref: objnam.c yname() (2357-2374). "your <cxname>" for what the hero
// carries, "the <cxname>" for what she does not, and a shopkeeper's or a
// monster's possessive where shk_your() finds an owner.
//
// C skips the prefix for an artifact whose proper name stands alone. That
// test is obj_is_pname(), which answers FALSE for every object with no
// oartifact, so a non-artifact always takes the prefix and the artifact arm
// stops: naming one needs artiname() and not_fully_identified(), neither of
// which is ported.
export function yname(obj, state = game) {
    const s = cxname(obj, state);

    if (obj.oartifact)
        unsupported('obj_is_pname() for yname()', obj);
    return `${shk_your(obj, state)}${s}`;
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
    const quantity = Math.trunc(obj.quan);
    const modifiers = [];
    const buc = bucWord(obj, type, state);
    if (buc) modifiers.push(buc);
    // C ref: objnam.c doname(). "empty" comes first, before the blessed or
    // uncursed word, when the contents are known and there are none. A bag of
    // tricks or horn of plenty judges emptiness by its charges instead, and
    // both stop above.
    if (obj.cknown && (isContainer(obj) || obj.otyp === STATUE)
        && !hasContents(obj)) {
        modifiers.unshift('empty');
    }
    // A box announces a known trap and its known lock state before the
    // greased prefix.
    if (isBox(obj) && obj.otrapped && obj.tknown && obj.dknown)
        modifiers.push('trapped');
    if (obj.lknown && isBox(obj)) {
        modifiers.push(
            obj.obroken ? 'broken' : obj.olocked ? 'locked' : 'unlocked',
        );
    }
    if (obj.greased) modifiers.push('greased');
    const classForModifiers = is_weptool(obj, state)
        ? WEAPON_CLASS : obj.oclass;
    switch (classForModifiers) {
    case WEAPON_CLASS:
    case ARMOR_CLASS:
        if (base.startsWith('poisoned ') && obj.opoisoned) {
            base = base.slice('poisoned '.length);
            modifiers.push('poisoned');
        }
        modifiers.push(...erosionWords(obj, state));
        if (obj.known) modifiers.push(signed(obj.spe));
        break;
    case TOOL_CLASS:
        if (isCandle(obj)) {
            const fullBurnTime = 20 * type.oc_cost;
            if (obj.age < fullBurnTime)
                modifiers.push('partly used');
        }
        break;
    case RING_CLASS:
        if (obj.known && type.oc_charged)
            modifiers.push(signed(obj.spe));
        break;
    case FOOD_CLASS:
        if (obj.oeaten) modifiers.push('partly eaten');
        break;
    case BALL_CLASS:
    case CHAIN_CLASS:
        if (erosionMatters(obj, state))
            modifiers.push(...erosionWords(obj, state));
        break;
    default:
        break;
    }
    if (obj.otyp === CORPSE)
        return corpseDoname(obj, modifiers, state);
    if (obj.otyp === EGG && obj.corpsenm !== NON_PM && obj.known) {
        base = `${monsterObjectName(obj, state)} ${base}`;
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
    } else if (obj.oclass === WAND_CLASS
        || (obj.oclass === TOOL_CLASS && type.oc_charged)) {
        base += chargedSuffix(obj, type);
    }
    base += wornSuffix(obj, type, state);
    const words = [...modifiers, base].join(' ');
    if (quantity !== 1)
        return `${quantity} ${words}`;
    const fakeArtifact = obj.otyp === SLIME_MOLD
        ? matching_artifact_fruit(base, state) : null;
    if (fakeArtifact?.forceThe
        || objectIsPersonalName(obj, type, state)
        || theUniqueObject(obj, type)) {
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
