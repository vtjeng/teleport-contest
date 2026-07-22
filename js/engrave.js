// Engraving creation and erosion.
// C ref: engrave.c make_engr_at(), wipe_engr_at(), and wipeout_text().

import {
    BLINDED,
    BURN,
    BUFSZ,
    DUST,
    ENGRAVE,
    ENGR_BLOOD,
    HEADSTONE,
    ICE,
    MARK,
    N_ENGRAVE,
} from './const.js';
import { game } from './gstate.js';
import { decodeUtf8ByteString, encodeUtf8ByteString } from './hacklib.js';
import { rn2, rnd } from './rng.js';

const RUBOUTS = new Map([
    ['A', '^'], ['B', 'Pb['], ['C', '('], ['D', '|)['], ['E', '|FL[_'],
    ['F', '|-'], ['G', 'C('], ['H', '|-'], ['I', '|'], ['K', '|<'],
    ['L', '|_'], ['M', '|'], ['N', '|\\'], ['O', 'C('], ['P', 'F'],
    ['Q', 'C('], ['R', 'PF'], ['T', '|'], ['U', 'J'], ['V', '/\\'],
    ['W', 'V/\\'], ['Z', '/'], ['b', '|'], ['d', 'c|'], ['e', 'c'],
    ['g', 'c'], ['h', 'n'], ['j', 'i'], ['k', '|'], ['l', '|'],
    ['m', 'nr'], ['n', 'r'], ['o', 'c'], ['q', 'c'], ['w', 'v'],
    ['y', 'v'], [':', '.'], [';', ',:'], [',', '.'], ['=', '-'],
    ['+', '-|'], ['*', '+'], ['@', '0'], ['0', 'C('], ['1', '|'],
    ['6', 'o'], ['7', '/'], ['8', '3o'],
]);

const SMALL_PUNCTUATION = "?.,'`-|_";

function engravingEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        random: env.random ?? { rn2, rnd },
    };
}

export function engr_at(x, y, state = game) {
    for (let engraving = state.head_engr ?? null;
        engraving;
        engraving = engraving.nxt_engr) {
        if (engraving.engr_x === x && engraving.engr_y === y)
            return engraving;
    }
    return null;
}

export function del_engr_at(x, y, state = game) {
    let previous = null;
    for (let engraving = state.head_engr ?? null;
        engraving;
        engraving = engraving.nxt_engr) {
        if (engraving.engr_x !== x || engraving.engr_y !== y) {
            previous = engraving;
            continue;
        }
        if (previous) previous.nxt_engr = engraving.nxt_engr;
        else state.head_engr = engraving.nxt_engr;
        return;
    }
}

export function make_engr_at(
    x,
    y,
    text,
    pristineText,
    engravingTime,
    engravingType,
    env = {},
) {
    const normalized = engravingEnv(env);
    const { random, state } = normalized;
    del_engr_at(x, y, state);
    const sourceText = String(text);
    const pristine = pristineText == null ? sourceText : String(pristineText);
    const stringBytes = Math.max(
        encodeUtf8ByteString(sourceText).length,
        encodeUtf8ByteString(pristine).length,
    ) + 1;
    const engraving = {
        nxt_engr: state.head_engr ?? null,
        engr_x: x,
        engr_y: y,
        engr_txt: [sourceText, sourceText, pristine],
        engr_time: engravingTime,
        engr_type: engravingType > 0
            ? engravingType
            : random.rnd(N_ENGRAVE - 1),
        engr_szeach: stringBytes,
        engr_alloc: stringBytes * 3,
        guardobjects: sourceText === 'Elbereth' && Boolean(state.in_mklev),
        nowipeout: false,
        eread: false,
        erevealed: false,
    };
    state.head_engr = engraving;
    return engraving;
}

function propertyActiveUnblocked(hero, propertyIndex) {
    const property = hero?.uprops?.[propertyIndex];
    return Boolean(property
        && ((property.intrinsic ?? 0) || (property.extrinsic ?? 0))
        && !(property.blocked ?? 0));
}

// C ref: engrave.c read_engr_at(). The message callback is injected to avoid
// making the engraving substrate depend on the tty display implementation.
export async function read_engr_at(
    x,
    y,
    state = game,
    { pline } = {},
) {
    const engraving = engr_at(x, y, state);
    const text = engraving?.engr_txt?.[0] ?? '';
    if (!text) return false;
    if (typeof pline !== 'function')
        throw new TypeError('read_engr_at requires a pline callback');

    const blind = propertyActiveUnblocked(state.u, BLINDED);
    const onIce = state.level?.at(x, y)?.typ === ICE;
    const surface = onIce ? 'ice' : 'floor';
    let sensed = false;
    switch (engraving.engr_type) {
    case DUST:
        if (!blind) {
            sensed = true;
            await pline(
                `Something is written here in the ${onIce ? 'frost' : 'dust'}.`,
                state,
            );
        }
        break;
    case ENGRAVE:
    case HEADSTONE:
        // Initial tutorial entry is never swallowed and can reach the floor;
        // retain that source result even when a startup condition is blind.
        sensed = true;
        await pline(`Something is engraved here on the ${surface}.`, state);
        break;
    case BURN:
        sensed = true;
        await pline(
            `Some text has been ${onIce ? 'melted' : 'burned'} into the ${surface} here.`,
            state,
        );
        break;
    case MARK:
        if (!blind) {
            sensed = true;
            await pline(`There's some graffiti on the ${surface} here.`, state);
        }
        break;
    case ENGR_BLOOD:
        if (!blind) {
            sensed = true;
            await pline('You see a message scrawled in blood here.', state);
        }
        break;
    default:
        sensed = true;
        break;
    }
    if (!sensed) return false;

    const pristine = engraving.engr_txt[2] ?? text;
    const finalCharacter = text.at(-1) ?? '';
    const hasOriginalPunctuation = text.length >= 2
        && '.!?'.includes(finalCharacter)
        && pristine.at(-1) === finalCharacter;
    await pline(
        `You ${blind ? 'feel the words' : 'read'}: "${text}"${hasOriginalPunctuation ? '' : '.'}`,
        state,
    );
    engraving.engr_txt[1] = text;
    engraving.eread = true;
    engraving.erevealed = true;
    return true;
}

// Degrade exactly `count` character selections. A selected space still uses
// the position and rubout draws, matching the source's continue statement.
export function wipeout_text(text, count, seed = 0, env = {}) {
    const { random } = engravingEnv(env);
    // C indexes the raw bytes of its UTF-8 char array. Surrogate escapes from
    // decodeUtf8ByteString preserve a byte when rubbing out one byte leaves a
    // malformed sequence, so later byte-oriented operations can round-trip it.
    const bytes = encodeUtf8ByteString(text);
    const length = bytes.length;
    let currentSeed = seed >>> 0;

    if (length && count > 0) {
        while (count-- > 0) {
            let next;
            let useRubout;
            if (!currentSeed) {
                next = random.rn2(length);
                useRubout = random.rn2(4);
            } else {
                next = currentSeed % length;
                currentSeed = Math.imul(currentSeed, 31) >>> 0;
                currentSeed %= BUFSZ - 1;
                useRubout = currentSeed & 3;
            }

            const character = String.fromCharCode(bytes[next]);
            if (character === ' ') continue;
            if (SMALL_PUNCTUATION.includes(character)) {
                bytes[next] = ' '.charCodeAt(0);
                continue;
            }

            const replacements = useRubout ? RUBOUTS.get(character) : null;
            if (!replacements) {
                bytes[next] = '?'.charCodeAt(0);
                continue;
            }

            let replacementIndex;
            if (!currentSeed) {
                replacementIndex = random.rn2(replacements.length);
            } else {
                currentSeed = Math.imul(currentSeed, 31) >>> 0;
                currentSeed %= BUFSZ - 1;
                replacementIndex = currentSeed % replacements.length;
            }
            bytes[next] = replacements.charCodeAt(replacementIndex);
        }
    }
    while (bytes.at(-1) === ' '.charCodeAt(0)) bytes.pop();
    return decodeUtf8ByteString(bytes);
}

export function wipe_engr_at(x, y, count, magical = false, env = {}) {
    const normalized = engravingEnv(env);
    const { random, state } = normalized;
    const engraving = engr_at(x, y, state);
    if (!engraving || engraving.engr_type === HEADSTONE || engraving.nowipeout)
        return engraving;

    const onIce = state.level?.at?.(x, y)?.typ === ICE;
    if (engraving.engr_type === BURN && !onIce
        && !(magical && !random.rn2(2))) {
        return engraving;
    }
    if (engraving.engr_type !== DUST && engraving.engr_type !== ENGR_BLOOD) {
        const bound = 1 + Math.trunc(50 / (count + 1));
        count = random.rn2(bound) ? 0 : 1;
    }

    engraving.engr_txt[0] = wipeout_text(
        engraving.engr_txt[0],
        count,
        0,
        normalized,
    ).replace(/^ +/u, '');
    if (!engraving.engr_txt[0])
        del_engr_at(x, y, state);
    return engr_at(x, y, state);
}
