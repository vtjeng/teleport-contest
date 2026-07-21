// Engraving creation and erosion.
// C ref: engrave.c make_engr_at(), wipe_engr_at(), and wipeout_text().

import {
    BURN,
    BUFSZ,
    DUST,
    ENGR_BLOOD,
    HEADSTONE,
    ICE,
    N_ENGRAVE,
} from './const.js';
import { game } from './gstate.js';
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
    const stringBytes = Math.max(sourceText.length, pristine.length) + 1;
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
        guardobjects: text === 'Elbereth' && Boolean(state.in_mklev),
        nowipeout: false,
        eread: false,
        erevealed: false,
    };
    state.head_engr = engraving;
    return engraving;
}

// Degrade exactly `count` character selections. A selected space still uses
// the position and rubout draws, matching the source's continue statement.
export function wipeout_text(text, count, seed = 0, env = {}) {
    const { random } = engravingEnv(env);
    const characters = [...String(text)];
    const length = characters.length;
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

            const character = characters[next];
            if (character === ' ') continue;
            if (SMALL_PUNCTUATION.includes(character)) {
                characters[next] = ' ';
                continue;
            }

            const replacements = useRubout ? RUBOUTS.get(character) : null;
            if (!replacements) {
                characters[next] = '?';
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
            characters[next] = replacements[replacementIndex];
        }
    }
    while (characters.at(-1) === ' ') characters.pop();
    return characters.join('');
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
