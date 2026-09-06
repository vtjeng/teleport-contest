// Player-specified fruit names and the named-fruit chain.
// C refs: options.c optfn_fruit(), initoptions_finish(), fruitadd();
// objnam.c makesingular(), fruitname(), fruit_from_indx(), fruit_from_name();
// hacklib.c mungspaces(), copynchars(); bones.c sanitize_name().

import { game } from './gstate.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
    encodeUtf8Text,
    strstri,
} from './hacklib.js';
import { name_to_mon } from './mondata.js';
import {
    FOOD_CLASS,
    NUM_OBJECTS,
    SLIME_MOLD,
} from './objects.js';
import { LOW_PM, NUMMONS } from './monsters.js';
import { rnd } from './rng.js';

export const PL_FSIZ = 32;
export const DEFAULT_FRUIT = 'slime mold';

const ONE_OFF = Object.freeze([
    ['child', 'children'],
    ['cubus', 'cubi'],
    ['culus', 'culi'],
    ['Cyclops', 'Cyclopes'],
    ['djinni', 'djinn'],
    ['erinys', 'erinyes'],
    ['foot', 'feet'],
    ['fungus', 'fungi'],
    ['goose', 'geese'],
    ['knife', 'knives'],
    ['labrum', 'labra'],
    ['louse', 'lice'],
    ['mouse', 'mice'],
    ['mumak', 'mumakil'],
    ['nemesis', 'nemeses'],
    ['ovum', 'ova'],
    ['ox', 'oxen'],
    ['passerby', 'passersby'],
    ['rtex', 'rtices'],
    ['serum', 'sera'],
    ['staff', 'staves'],
    ['tooth', 'teeth'],
]);

const AS_IS = Object.freeze([
    'boots', 'shoes', 'gloves', 'lenses', 'scales', 'eyes', 'gauntlets',
    'iron bars', 'bison', 'deer', 'elk', 'fish', 'fowl', 'tuna', 'yaki',
    '-hai', 'krill', 'manes', 'moose', 'ninja', 'sheep', 'ronin', 'roshi',
    'shito', 'tengu', 'ki-rin', 'Nazgul', 'gunyoki', 'piranha', 'samurai',
    'shuriken', 'haggis', 'Bordeaux',
]);

const SPECIAL_SUBJECTS = Object.freeze([
    'erinys', 'manes', 'Cyclops', 'Hippocrates', 'Pelias', 'aklys',
    'amnesia', 'detect monsters', 'paralysis', 'shape changers', 'nemesis',
]);

const COMPOUNDS = Object.freeze([
    ' of ', ' labeled ', ' called ', ' named ', ' above', ' versus ',
    ' from ', ' in ', ' on ', ' a la ', ' with', ' de ', " d'", ' du ',
    ' au ', '-in-', '-at-',
]);

const NO_MEN = Object.freeze([
    'albu', 'antihu', 'anti', 'ata', 'auto', 'bildungsro', 'cai', 'cay',
    'ceru', 'corner', 'decu', 'des', 'dura', 'fir', 'hanu', 'het',
    'infrahu', 'inhu', 'nonhu', 'otto', 'out', 'prehu', 'protohu', 'subhu',
    'superhu', 'talis', 'unhu', 'sha', 'hu', 'un', 'le', 're', 'so', 'to',
    'at', 'a',
]);

const NO_MAN = Object.freeze([
    'abdo', 'acu', 'agno', 'ceru', 'cogno', 'cycla', 'fleh', 'grava',
    'hegu', 'preno', 'sonar', 'speci', 'dai', 'exa', 'fla', 'sta', 'teg',
    'tegu', 'vela', 'da', 'hy', 'lu', 'no', 'nu', 'ra', 'ru', 'se', 'vi',
    'ya', 'o', 'a',
]);

const CH_K_SOUND = Object.freeze([
    'monarch', 'poch', 'tech', 'mech', 'stomach', 'psych', 'amphibrach',
    'anarch', 'atriarch', 'azedarach', 'broch', 'gastrotrich', 'isopach',
    'loch', 'oligarch', 'peritrich', 'sandarach', 'sumach', 'symposiarch',
]);

function asciiSpace(byte) {
    return byte === 0x20;
}

function bytesUntilTerminator(encoded, limit, terminators = {}) {
    const bytes = [];
    for (const byte of encoded) {
        if (byte === 0
            || (terminators.newline && byte === 0x0A)
            || (terminators.comma && byte === 0x2C)) break;
        if (bytes.length >= limit) break;
        bytes.push(byte);
    }
    return bytes;
}

function sanitizeBytes(bytes, stripEighthBit = true) {
    const sanitized = bytes.map((byte) => {
        const lowSeven = byte & 0x7F;
        if (lowSeven < 0x20 || lowSeven === 0x7F) return 0x2E;
        if (lowSeven !== byte && stripEighthBit) return 0x5F;
        return byte;
    });
    return decodeUtf8ByteString(sanitized);
}

function nmcpy(value, maxlen = PL_FSIZ) {
    return decodeUtf8ByteString(bytesUntilTerminator(
        encodeUtf8ByteString(value),
        maxlen - 1,
        { comma: true },
    ));
}

function copynchars(value, count = PL_FSIZ - 1) {
    return decodeUtf8ByteString(bytesUntilTerminator(
        encodeUtf8ByteString(value),
        count,
        { newline: true },
    ));
}

function mungspaceBytes(bytes) {
    const result = [];
    let wasSpace = true;
    for (let byte of bytes) {
        if (byte === 0 || byte === 0x0A) break;
        if (byte === 0x09) byte = 0x20;
        if (!asciiSpace(byte) || !wasSpace) result.push(byte);
        wasSpace = asciiSpace(byte);
    }
    if (wasSpace && result.length > 0) result.pop();
    return result;
}

export function mungspaces(value) {
    const result = mungspaceBytes(encodeUtf8Text(value));
    return decodeUtf8ByteString(result);
}

export function normalize_initial_fruit(value, eightBitTty = false) {
    const normalized = sanitizeBytes(
        bytesUntilTerminator(
            mungspaceBytes(encodeUtf8Text(value)),
            PL_FSIZ - 1,
            { comma: true },
        ),
        !eightBitTty,
    );
    return normalized || DEFAULT_FRUIT;
}

function endsWithCI(value, suffix) {
    return value.toLowerCase().endsWith(suffix.toLowerCase());
}

function equalsCI(left, right) {
    return left.toLowerCase() === right.toLowerCase();
}

function caseChar(oldCharacter, newCharacter) {
    if (oldCharacter >= 'a' && oldCharacter <= 'z')
        return newCharacter.toLowerCase();
    if (oldCharacter >= 'A' && oldCharacter <= 'Z')
        return newCharacter.toUpperCase();
    return newCharacter;
}

// objnam.c:strcasecpy() propagates the final destination character's case
// when the replacement is longer than the text it overwrites.
function caseCopy(oldText, replacement, priorCharacter = '') {
    let copied = '';
    for (let index = 0; index < replacement.length; ++index) {
        const oldCharacter = oldText[index]
            ?? copied.at(-1)
            ?? oldText.at(-1)
            ?? priorCharacter;
        copied += caseChar(oldCharacter, replacement[index]);
    }
    return copied;
}

function replaceSuffixCase(value, oldLength, replacement) {
    const split = value.length - oldLength;
    const prefix = value.slice(0, split);
    const oldText = value.slice(split);
    return prefix + caseCopy(oldText, replacement, prefix.at(-1));
}

function compoundIndex(value) {
    const lowered = value.toLowerCase();
    let selected = -1;
    for (const compound of COMPOUNDS) {
        const index = lowered.indexOf(compound.toLowerCase());
        if (index >= 0 && (selected < 0 || index < selected)) selected = index;
    }
    return selected;
}

function badman(value, toPlural) {
    const suffix = toPlural ? 'man' : 'men';
    if (!endsWithCI(value, suffix)) return false;
    const prefixes = toPlural ? NO_MEN : NO_MAN;
    const lowered = value.toLowerCase();
    for (const prefix of prefixes) {
        const start = value.length - suffix.length - prefix.length;
        if (start < 0) continue;
        if (lowered.slice(start, start + prefix.length) !== prefix) continue;
        if (start === 0 || value[start - 1] === ' ') return true;
    }
    return false;
}

function singularLookup(value) {
    for (const suffix of AS_IS) {
        if (endsWithCI(value, suffix)) return { matched: true, value };
    }
    for (const suffix of SPECIAL_SUBJECTS) {
        if (endsWithCI(value, suffix)) return { matched: true, value };
    }
    if (value.length > 5 && endsWithCI(value, 'craft'))
        return { matched: true, value };
    if (equalsCI(value, 'slice') || equalsCI(value, 'mongoose'))
        return { matched: true, value };
    if (value.length > 2 && endsWithCI(value, 'men') && badman(value, false))
        return { matched: true, value };

    for (const [singular, plural] of ONE_OFF) {
        if (endsWithCI(value, singular)) return { matched: true, value };
        if (endsWithCI(value, plural)) {
            return {
                matched: true,
                value: replaceSuffixCase(value, plural.length, singular),
            };
        }
    }
    return { matched: false, value };
}

function appendCase(value, suffix) {
    return value + caseCopy('', suffix, value.at(-1));
}

function pluralLookup(value) {
    for (const suffix of AS_IS) {
        if (endsWithCI(value, suffix)) return { matched: true, value };
    }
    for (const suffix of ['ae', 'eaux', 'matzot']) {
        if (endsWithCI(value, suffix)) return { matched: true, value };
    }
    if (value.length > 5 && endsWithCI(value, 'craft'))
        return { matched: true, value };
    if (equalsCI(value, 'slice') || equalsCI(value, 'mongoose')) {
        return { matched: true, value: appendCase(value, 's') };
    }
    if (value.length > 2 && endsWithCI(value, 'ox')
        && !(value.length > 5 && endsWithCI(value, 'muskox'))) {
        return { matched: true, value: appendCase(value, 'es') };
    }
    if (value.length > 2 && endsWithCI(value, 'man')
        && badman(value, true)) {
        return { matched: true, value: appendCase(value, 's') };
    }

    for (const [singular, plural] of ONE_OFF) {
        if (endsWithCI(value, plural)) return { matched: true, value };
        if (endsWithCI(value, singular)) {
            return {
                matched: true,
                value: replaceSuffixCase(value, singular.length, plural),
            };
        }
    }
    return { matched: false, value };
}

function chKsound(value) {
    return value.length >= 4
        && CH_K_SOUND.some((suffix) => endsWithCI(value, suffix));
}

// C ref: objnam.c makeplural(). This accepts the complete name and separates a
// compound suffix itself before pluralizing the leading noun, so "potion of
// healing" becomes "potions of healing" rather than "potion of healings".
export function makeplural(oldstr) {
    const original = String(oldstr ?? '').replace(/^ +/u, '');
    if (!original) return 's';

    const pronouns = new Map([
        ['he', 'they'],
        ['she', 'they'],
        ['it', 'they'],
        ['him', 'them'],
        ['her', 'them'],
        ['his', 'their'],
        ['hers', 'their'],
        ['its', 'their'],
    ]);
    const pronoun = pronouns.get(original.toLowerCase());
    if (pronoun) {
        return original[0] === original[0].toUpperCase()
            ? pronoun[0].toUpperCase() + pronoun.slice(1)
            : pronoun;
    }
    if (/^pair of /iu.test(original)) return original;

    const split = compoundIndex(original);
    const excess = split >= 0 ? original.slice(split) : '';
    let base = (split >= 0 ? original.slice(0, split) : original)
        .replace(/ +$/u, '');
    const len = base.length;
    const last = base.at(-1);
    // C's letter() intentionally treats '@' as a letter alongside A-Z/a-z.
    if (len === 1 || !/[A-Za-z@]/u.test(last))
        return appendCase(base, "'s") + excess;

    const lookup = pluralLookup(base);
    if (lookup.matched) return lookup.value + excess;
    if (equalsCI(base, 'ya') || endsWithCI(base, ' ya'))
        return base + excess;

    const prior = base.at(-2)?.toLowerCase() ?? '';
    if (len >= 3 && endsWithCI(base, 'man') && !badman(base, true))
        return replaceSuffixCase(base, 2, 'en') + excess;
    if (last.toLowerCase() === 'f'
        && !endsWithCI(base, 'erf')
        && 'aeioulr'.includes(prior)) {
        return replaceSuffixCase(base, 1, 'ves') + excess;
    }
    if (len >= 3 && endsWithCI(base, 'ium'))
        return replaceSuffixCase(base, 3, 'ia') + excess;
    if (endsWithCI(base, 'alga')
        || endsWithCI(base, 'hypha')
        || endsWithCI(base, 'larva')
        || endsWithCI(base, 'amoeba')
        || endsWithCI(base, 'vertebra')) {
        return appendCase(base, 'e') + excess;
    }
    if (len > 3 && endsWithCI(base, 'us')
        && !endsWithCI(base, 'lotus')
        && !endsWithCI(base, 'wumpus')) {
        return replaceSuffixCase(base, 2, 'i') + excess;
    }
    if (len >= 3 && endsWithCI(base, 'sis'))
        return replaceSuffixCase(base, 2, 'es') + excess;
    if (len >= 3 && endsWithCI(base, 'eau')
        && !endsWithCI(base, 'bureau')) {
        return appendCase(base, 'x') + excess;
    }
    if (len >= 6
        && (endsWithCI(base, 'matzoh') || endsWithCI(base, 'matzah'))) {
        return replaceSuffixCase(base, 2, 'ot') + excess;
    }
    if (len >= 5
        && (endsWithCI(base, 'matzo') || endsWithCI(base, 'matza'))) {
        return replaceSuffixCase(base, 1, 'ot') + excess;
    }
    if (len >= 5
        && (endsWithCI(base, 'dex')
            || endsWithCI(base, 'dix')
            || endsWithCI(base, 'tex'))
        && !endsWithCI(base, 'index')) {
        return replaceSuffixCase(base, 2, 'ices') + excess;
    }

    const lowerLast = last.toLowerCase();
    const sibilant = 'zxs'.includes(lowerLast)
        || (lowerLast === 'h'
            && 'cs'.includes(prior)
            && !(prior === 'c' && chKsound(base)))
        || endsWithCI(base, 'ato')
        || endsWithCI(base, 'dingo');
    if (sibilant) return appendCase(base, 'es') + excess;
    if (lowerLast === 'y' && !'aeiou'.includes(prior))
        return replaceSuffixCase(base, 1, 'ies') + excess;
    return appendCase(base, 's') + excess;
}

// Source-faithful singularization is part of fruit identity: fruitadd()
// stores the singular name, and later slime molds retain that spelling.
export function makesingular(oldstr) {
    let original = String(oldstr ?? '').replace(/^ +/u, '');
    if (!original) return '';

    const pronouns = new Map([
        ['they', 'it'],
        ['them', 'it'],
        ['their', 'its'],
    ]);
    const pronoun = pronouns.get(original.toLowerCase());
    if (pronoun) {
        return original[0] === original[0].toUpperCase()
            ? pronoun[0].toUpperCase() + pronoun.slice(1)
            : pronoun;
    }

    const split = compoundIndex(original);
    const excess = split >= 0 ? original.slice(split) : '';
    let base = split >= 0 ? original.slice(0, split) : original;
    const lookup = singularLookup(base);
    if (lookup.matched) return lookup.value + excess;
    base = lookup.value;

    if (endsWithCI(base, 's')) {
        if (endsWithCI(base, 'es')) {
            if (endsWithCI(base, 'ies')) {
                const dropOnly = endsWithCI(base, 'cookies')
                    || (endsWithCI(base, 'pies')
                        && (base.length === 4
                            || base.at(-(4 + 1)) === ' '))
                    || (endsWithCI(base, 'genies')
                        && (base.length === 6
                            || base.at(-(6 + 1)) === ' '))
                    || endsWithCI(base, 'mbies')
                    || endsWithCI(base, 'yries');
                base = dropOnly
                    ? base.slice(0, -1)
                    : replaceSuffixCase(base, 3, 'y');
                return base + excess;
            }

            const fourthFromEnd = base.at(-4)?.toLowerCase();
            if (endsWithCI(base, 'ves')
                && fourthFromEnd
                && ('aeioulr'.includes(fourthFromEnd))) {
                base = endsWithCI(base, 'cloves')
                    || endsWithCI(base, 'nerves')
                    ? base.slice(0, -1)
                    : replaceSuffixCase(base, 3, 'f');
                return base + excess;
            }

            const dropEs = [
                'eses', 'oxes', 'nxes', 'ches', 'uses', 'shes', 'sses',
                'atoes', 'dingoes', 'Aleaxes',
            ].some((suffix) => endsWithCI(base, suffix));
            if (dropEs) return base.slice(0, -2) + excess;
        } else if (endsWithCI(base, 'us')) {
            if (!endsWithCI(base, 'tengus') && !endsWithCI(base, 'hezrous'))
                return base + excess;
        } else if (endsWithCI(base, 'ss')
                   || endsWithCI(base, ' lens')
                   || equalsCI(base, 'lens')) {
            return base + excess;
        }
        return base.slice(0, -1) + excess;
    }

    if (endsWithCI(base, 'men') && !badman(base, false))
        return replaceSuffixCase(base, 2, 'an') + excess;
    if (endsWithCI(base, 'matzot')
        || endsWithCI(base, 'ae')
        || endsWithCI(base, 'eaux')) {
        return base.slice(0, -1) + excess;
    }
    if (base.length >= 4 && endsWithCI(base, 'ia')
        && 'lr'.includes(base.at(-3)?.toLowerCase() ?? '')
        && base.at(-4)?.toLowerCase() === 'e') {
        base = replaceSuffixCase(base, 1, 'um');
    }
    return base + excess;
}

function requireFruitGlobals(state, operation) {
    if (!Array.isArray(state?.objects)
        || state.objects.length !== NUM_OBJECTS + 1
        || !Array.isArray(state?.obj_descr)
        || state.obj_descr.length !== NUM_OBJECTS + 1) {
        throw new Error(`${operation} requires objects_globals_init()`);
    }
}

function fruitChain(state) {
    state.gf ??= {};
    if (state.gf.ffruit === undefined) state.gf.ffruit = null;
    return state.gf.ffruit;
}

function fruitNodes(state) {
    const nodes = [];
    const seen = new Set();
    for (let fruit = fruitChain(state); fruit; fruit = fruit.nextf) {
        if (seen.has(fruit)) throw new Error('named fruit chain contains a cycle');
        seen.add(fruit);
        if (typeof fruit.fname !== 'string'
            || !Number.isInteger(fruit.fid)
            || fruit.fid < 1 || fruit.fid > 127) {
            throw new Error('named fruit chain contains an invalid fruit');
        }
        nodes.push(fruit);
    }
    return nodes;
}

// C ref: objnam.c fruitname() (411-427). Converts the player's fruit name into
// the matching juice name, so "slice of pizza" becomes "pizza juice" rather
// than "slice of pizza juice".
export function fruitname(juice, state = game) {
    const configured = state.svp?.pl_fruit ?? DEFAULT_FRUIT;
    const marker = strstri(configured, ' of ');
    const base = marker >= 0 ? configured.slice(marker + 4) : configured;
    return makesingular(base) + (juice ? ' juice' : '');
}

export function fruit_from_indx(indx, state = game) {
    return fruitNodes(state).find((fruit) => fruit.fid === indx) ?? null;
}

// C ref: objnam.c doname_base()'s fake_arti handling. Named fruit can borrow
// an artifact's proper-name article rules without becoming an artifact.
export function matching_artifact_fruit(name, state = game) {
    const candidate = String(name).replace(/^the /iu, '').toLowerCase();
    for (let index = 1; state.artilist?.[index]?.otyp; ++index) {
        const artifactName = state.artilist[index].name;
        if (typeof artifactName !== 'string') continue;
        const comparable = artifactName.replace(/^the /iu, '').toLowerCase();
        if (candidate === comparable)
            return { forceThe: /^the /iu.test(artifactName) };
    }
    return null;
}

function fruitLookup(fname, exact, state) {
    const nodes = fruitNodes(state);
    let highestFid = 0;
    for (const fruit of nodes) {
        if (fruit.fname === fname) return { fruit, highestFid };
        if (fruit.fid > highestFid) highestFid = fruit.fid;
    }

    let tentative = null;
    if (!exact) {
        for (const fruit of nodes) {
            const length = fruit.fname.length;
            if (fname.startsWith(fruit.fname)
                && (!fname[length] || fname[length] === ' ')
                && (!tentative
                    || length > tentative.fname.length)) {
                tentative = fruit;
            }
        }
        if (tentative) return { fruit: tentative, highestFid };
    }

    const singular = makesingular(fname);
    const singularMatch = nodes.find((fruit) => fruit.fname === singular);
    if (singularMatch) return { fruit: singularMatch, highestFid };

    if (!exact) {
        tentative = null;
        for (const fruit of nodes) {
            const length = fruit.fname.length;
            if (fname.length < length) continue;
            const space = fname.indexOf(' ', length);
            if (space < 0) continue;
            const prefix = makesingular(fname.slice(0, space));
            if (fruit.fname === prefix
                && (!tentative
                    || prefix.length > tentative.fname.length)) {
                tentative = fruit;
            }
        }
    }
    return { fruit: tentative, highestFid };
}

export function fruit_from_name(fname, exact = false, state = game) {
    return fruitLookup(String(fname), Boolean(exact), state).fruit;
}

function monsterName(name, env) {
    const hook = env.hooks?.nameToMon;
    const index = typeof hook === 'function'
        ? hook(name, env)
        : name_to_mon(name, { state: env.state });
    if (!Number.isInteger(index))
        throw new TypeError('nameToMon must return an integer monster index');
    return index >= LOW_PM && index < NUMMONS;
}

function objectName(state, object) {
    const index = object?.oc_name_idx;
    return Number.isInteger(index) ? state.obj_descr[index]?.oc_name : null;
}

function collidesWithFood(name, state) {
    const globpfx = name.startsWith('small ') || name.startsWith('large ')
        ? 6
        : name.startsWith('medium ')
            ? 7
            : name.startsWith('very large ')
                ? 11
                : 0;
    let index = state.svb?.bases?.[FOOD_CLASS] ?? 0;
    while (state.objects[index]?.oc_class === FOOD_CLASS) {
        const candidate = objectName(state, state.objects[index]);
        if (candidate === name
            || (globpfx > 0 && candidate === name.slice(globpfx))) {
            return { found: true, globpfx };
        }
        ++index;
    }
    return { found: false, globpfx };
}

function ambiguousObjectName(name, state, env) {
    const { found, globpfx } = collidesWithFood(name, state);
    if (found || /^\d+(?:$| )/u.test(name)) return true;
    if (name.startsWith('cursed ')
        || name.startsWith('uncursed ')
        || name.startsWith('blessed ')
        || name.startsWith('partly eaten ')) {
        return true;
    }
    if (name.startsWith('tin of ')) {
        const contents = name.slice(7);
        if (contents === 'spinach') return true;
        if (monsterName(contents, env)) return true;
    }
    if (name === 'empty tin' || name === 'glob'
        || (globpfx > 0 && name.slice(globpfx) === 'glob')) {
        return true;
    }
    if ((name.endsWith(' corpse') || name.endsWith(' egg'))
        && monsterName(name, env)) {
        return true;
    }
    return false;
}

function candied(name) {
    // nmcpy(pl_fruit + 8, buf, PL_FSIZ - 8) leaves 23 source bytes after
    // the eight-byte prefix.
    return `candied ${nmcpy(name, PL_FSIZ - 8)}`;
}

export function fruitadd(str, replace_fruit = null, env = {}) {
    const state = env.state ?? game;
    requireFruitGlobals(state, 'fruitadd');
    state.flags ??= {};
    state.context ??= {};
    state.svp ??= {};
    const userSpecified = env.userSpecified === true;
    let name;

    if (userSpecified) {
        name = str == null ? state.svp.pl_fruit : String(str);
        name = nmcpy(makesingular(name));
        if (!name) name = DEFAULT_FRUIT;
        state.svp.pl_fruit = name;
        if (ambiguousObjectName(name, state, env)) {
            name = candied(name);
            state.svp.pl_fruit = name;
        }
        state.flags.made_fruit = false;
        if (replace_fruit) {
            if (!fruitNodes(state).includes(replace_fruit))
                throw new Error('replacement fruit is not in the fruit chain');
            replace_fruit.fname = copynchars(name);
            state.context.current_fruit = replace_fruit.fid;
            return replace_fruit.fid;
        }
    } else {
        if (str == null) throw new TypeError('fruitadd requires a fruit name');
        name = sanitizeBytes(
            bytesUntilTerminator(
                encodeUtf8ByteString(str),
                PL_FSIZ - 1,
                { newline: true },
            ),
            !state.iflags?.wc_eight_bit_input,
        );
        state.flags.made_fruit = true;
    }

    const { fruit: existing, highestFid } = fruitLookup(name, false, state);
    let fruit = existing;
    if (!fruit) {
        if (highestFid >= 127) {
            const random = env.random ?? { rnd };
            if (typeof random.rnd !== 'function')
                throw new TypeError('fruitadd random injection requires rnd');
            return random.rnd(127);
        }
        fruit = {
            fname: copynchars(name),
            fid: highestFid + 1,
            nextf: fruitChain(state),
        };
        state.gf.ffruit = fruit;
    }
    if (userSpecified) state.context.current_fruit = fruit.fid;
    return fruit.fid;
}

// This is the fruit-owned portion of options.c:initoptions_finish().
// `parsedOptions` is parseNethackrc()'s result or a fruit-name string.
export function finish_fruit_option(parsedOptions = {}, state = game, env = {}) {
    requireFruitGlobals(state, 'finish_fruit_option');
    const configured = typeof parsedOptions === 'string'
        ? parsedOptions
        : parsedOptions?.pl_fruit ?? DEFAULT_FRUIT;
    state.svp ??= {};
    state.gf ??= {};
    if (state.gf.ffruit === undefined) state.gf.ffruit = null;
    state.context ??= {};
    state.flags ??= {};
    state.objects[SLIME_MOLD].oc_name_idx = SLIME_MOLD;
    state.svp.pl_fruit = typeof parsedOptions === 'string'
        ? normalize_initial_fruit(
            configured,
            Boolean(state.iflags?.wc_eight_bit_input),
        )
        : String(configured);

    const fid = fruitadd(state.svp.pl_fruit, null, {
        ...env,
        state,
        userSpecified: true,
    });
    state.obj_descr[SLIME_MOLD].oc_name = 'fruit';
    return fid;
}

export const _fruitInternals = Object.freeze({
    nmcpy,
    copynchars,
    internalBytes: encodeUtf8ByteString,
    ambiguousObjectName,
});
