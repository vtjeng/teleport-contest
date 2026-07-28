// Runtime object naming for the early movement, pet, trap, and combat paths.
// C refs: objnam.c xname(), corpse_xname(), and doname().

import { find_artifact, permapoisoned } from './artifacts.js';
import {
    BLINDED, CORPSTAT_HISTORIC, NON_PM,
} from './const.js';
import {
    fruit_from_indx, makeplural, makesingular, matching_artifact_fruit,
} from './fruit.js';
import { lowc, strcasecpy } from './hacklib.js';
import { PM_CLERIC, PM_SAMURAI } from './monsters.js';
import { observe_object } from './o_init.js';
import {
    erosionMatters, isCandle, isContainer, isCorrodeable, isCrackable,
    isDamageable, isFlammable, isMultigen, isRottable, isRustprone,
    isWeptool, objectType,
} from './obj.js';
import { JAPANESE_ITEM_NAMES } from './objnam_data.js';
import {
    ALCHEMY_SMOCK, AMULET_CLASS, AMULET_OF_YENDOR, ARMOR_CLASS, ARM_BOOTS,
    ARM_GLOVES, ARM_HELM, ARM_SHIELD, BALL_CLASS,
    BLACK_OPAL, BOULDER, BRASS_LANTERN, CANDELABRUM_OF_INVOCATION, CHAIN_CLASS,
    CHEST, COIN_CLASS, CORPSE, CRYSKNIFE, DIAMOND, DILITHIUM_CRYSTAL, EGG,
    ELVEN_SHIELD, EMERALD, FAKE_AMULET_OF_YENDOR, FIGURINE, FLINT, FOOD_CLASS,
    GEMSTONE, GEM_CLASS, GRAY_DRAGON_SCALE_MAIL, GRAY_DRAGON_SCALES, IRON,
    LARGE_BOX, LENSES, MAGIC_HARP, MAGIC_LAMP, MINERAL, MITHRIL,
    MUMMY_WRAPPING, OBJ_DESCR, OBJ_NAME, OIL_LAMP, OPAL, ORCISH_SHIELD,
    POTION_CLASS, POT_OIL, POT_WATER, RING_CLASS, ROBE, ROCK_CLASS, RUBY,
    SAPPHIRE, SCR_MAIL, SCROLL_CLASS, SHIELD_OF_REFLECTION, SLIME_MOLD,
    SPBOOK_CLASS, SPE_BOOK_OF_THE_DEAD, SPE_NOVEL, STATUE, TIN, TOOL_CLASS,
    TOWEL, VENOM_CLASS, WAND_CLASS, WEAPON_CLASS, WOODEN_HARP,
    YELLOW_DRAGON_SCALE_MAIL, YELLOW_DRAGON_SCALES,
} from './objects.js';

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

// C ref: objnam.c just_an().
function justAn(text) {
    const lower = String(text).toLowerCase();
    const first = lower[0] ?? '';
    if (!lower[1] || lower[1] === ' ')
        return 'aefhilmnosx'.includes(first) ? 'an' : 'a';
    if (lower.startsWith('the ')
        || lower === 'molten lava'
        || lower === 'iron bars'
        || lower === 'ice') {
        return '';
    }
    const vowel = 'aeiou'.includes(first);
    const oneException = lower.startsWith('one')
        && (!lower[3] || '-_ '.includes(lower[3]));
    const longU = lower.startsWith('eu')
        || lower.startsWith('uke')
        || lower.startsWith('ukulele')
        || lower.startsWith('unicorn')
        || lower.startsWith('uranium')
        || lower.startsWith('useful');
    const xVowelSound = first === 'x' && !'aeiou'.includes(lower[1] ?? '');
    return (vowel && !oneException && !longU) || xVowelSound ? 'an' : 'a';
}
function articleName(text) {
    const article = justAn(text);
    return article ? `${article} ${text}` : text;
}
function monsterObjectName(obj, state) {
    if (obj.corpsenm === NON_PM) return 'thing';
    return state.mons?.[obj.corpsenm]?.pmnames?.[2] ?? 'monster';
}
function isPoisonable(obj, state) {
    return isMultigen(obj, state) || permapoisoned(obj);
}
function isGemStone(obj, type) {
    if (obj.otyp === FLINT) return true;
    if (type.oc_material !== GEMSTONE) return false;
    return obj.otyp !== DILITHIUM_CRYSTAL
        && obj.otyp !== RUBY
        && obj.otyp !== DIAMOND
        && obj.otyp !== SAPPHIRE
        && obj.otyp !== BLACK_OPAL
        && obj.otyp !== EMERALD
        && obj.otyp !== OPAL;
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
function preflightObjectName(obj, type, state, forDoname = false) {
    if (state.iflags?.override_ID)
        unsupported('override identification', obj);
    if (state.program_state?.gameover)
        unsupported('end-of-game object text', obj);
    if (type.oc_uname)
        unsupported('user-assigned type name', obj);
    if (obj.otyp === TIN && obj.known)
        unsupported('identified tin contents', obj);
    if (!forDoname) return;
    if (obj.unpaid)
        unsupported('shop price suffix', obj);
    if (state.iflags?.pricequotes && !type.oc_name_known)
        unsupported('price quote suffix', obj);
    if (obj.owornmask)
        unsupported('worn-object suffix', obj);
    if ((isContainer(obj) || obj.otyp === STATUE)
        && (obj.cknown || obj.lknown || obj.tknown)) {
        unsupported('known container state', obj);
    }
    if ((obj.otyp === LARGE_BOX || obj.otyp === CHEST)
        && (obj.olocked || obj.obroken || obj.otrapped)
        && (obj.lknown || obj.tknown)) {
        unsupported('known box state', obj);
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
        return `${actual}${isGemStone(obj, type) ? ' stone' : ''}`;
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
            && !isWeptool(obj, state)
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
    let singular = !subj;
    if (subj) {
        if (startsWithFold(subj, 'a ') || startsWithFold(subj, 'an ')) {
            singular = true;
        } else {
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
    void singular;

    const buf = verb;
    const last = buf.length - 1;
    if (buf.toLowerCase() === 'are') return strcasecpy(buf, 0, 'is');
    if (buf.toLowerCase() === 'have') return strcasecpy(buf, last - 1, 's');
    if ('zxs'.includes(lowc(buf[last]))
        || (buf.length >= 2 && lowc(buf[last]) === 'h'
            && 'cs'.includes(lowc(buf[last - 1])))
        || (buf.length === 2 && lowc(buf[last]) === 'o')) {
        // Ends in z, x, s, ch, or sh, so the third person adds "es".
        return `${buf}es`;
    }
    if (lowc(buf[last]) === 'y' && !VOWELS.includes(lowc(buf[last - 1])))
        return strcasecpy(buf, last, 'ies');
    return `${buf}s`;
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
    preflightObjectName(obj, type, state);
    if (!type.oc_name_known && type.oc_uses_known && type.oc_unique)
        obj.known = false;
    if (!heroIsBlind(state))
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
// C ref: objnam.c doname(). Shop, known-container, worn-item, end-game, and
// lit-candle branches stop before xname() can mutate discovery state.
export function donameFresh(obj, state) {
    const type = objectType(obj, state);
    preflightObjectName(obj, type, state, true);
    let base = xnameFresh(obj, state);
    const quantity = Math.trunc(obj.quan);
    const modifiers = [];
    const buc = bucWord(obj, type, state);
    if (buc) modifiers.push(buc);
    if (obj.greased) modifiers.push('greased');
    const classForModifiers = isWeptool(obj, state)
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
