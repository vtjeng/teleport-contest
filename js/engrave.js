// Engraving commands, creation, and erosion.
// C ref: engrave.c doengrave(), engrave(), make_engr_at(), wipe_engr_at(),
// wipeout_text(), and freehand().

import {
    A_WIS,
    BLINDED,
    BURN,
    BUFSZ,
    CONFUSION,
    CORR,
    DUST,
    ENGRAVE,
    ENGR_BLOOD,
    FLYING,
    GETOBJ_DOWNPLAY,
    GETOBJ_SUGGEST,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    ICE,
    LEVITATION,
    MARK,
    N_ENGRAVE,
    P_BASIC,
    P_RIDING,
    ROOM,
    STUNNED,
} from './const.js';
import { exercise_nonphysical } from './attrib.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { decodeUtf8ByteString, encodeUtf8ByteString } from './hacklib.js';
import { sticks } from './mondata.js';
import {
    AT_HUGS,
    M1_CLING,
    M1_FLY,
    M1_HIDE,
    MZ_HUGE,
    S_MIMIC,
} from './monsters.js';
import { rn2, rnd } from './rng.js';
import {
    GEM_CLASS,
    MAGIC_MARKER,
    RING_CLASS,
    TOOL_CLASS,
    TOWEL,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { t_at, uescaped_shaft, uteetering_at_seen_pit } from './trap.js';
import { welded } from './wield.js';
import { bimanual } from './worn.js';

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

// C ref: engrave.c engr_can_be_felt() (291-313). Only writing that cuts or
// scorches the floor survives being read by touch; dust, blood and a wand's
// mark do not. display.c feel_location():860 is the caller that reveals such
// an engraving to a hero who cannot see it.
export function engr_can_be_felt(engraving) {
    return [ENGRAVE, HEADSTONE, BURN].includes(engraving?.engr_type);
}

function asciiCaseFold(value) {
    return String(value).replace(/[A-Z]/g, (character) =>
        String.fromCharCode(character.charCodeAt(0) + 32));
}

// C ref: engrave.c sengr_at(). NetHack's strcmpi()/strstri() comparison is
// ASCII case-insensitive; strict callers require the intact complete text.
export function sengr_at(text, x, y, strict, state = game) {
    const engraving = engr_at(x, y, state);
    if (!engraving || engraving.engr_type === HEADSTONE
        || engraving.engr_time > state.moves) {
        return null;
    }
    const actual = asciiCaseFold(engraving.engr_txt?.[0] ?? '');
    const wanted = asciiCaseFold(text);
    const matches = strict ? actual === wanted : actual.includes(wanted);
    return matches ? engraving : null;
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
    const exactElbereth = sourceText === 'Elbereth';
    if (exactElbereth && !state.in_mklev)
        exercise_nonphysical(A_WIS, true, state, random);
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
        guardobjects: exactElbereth && Boolean(state.in_mklev),
        nowipeout: false,
        eread: false,
        erevealed: false,
    };
    state.head_engr = engraving;
    return engraving;
}

export class UnsupportedEngraveError extends Error {
    constructor(reason) {
        super(`engrave requires ${reason}`);
        this.name = 'UnsupportedEngraveError';
        this.reason = reason;
    }
}

function propertyIntrinsic(state, index) {
    return Boolean(state.u?.uprops?.[index]?.intrinsic ?? 0);
}

// C ref: engrave.c stylus_ok(). Bare hands are a suggested getobj() choice;
// object implements remain selectable but outside this slice.
export function stylus_ok(obj) {
    if (!obj) return GETOBJ_SUGGEST;
    if ([WEAPON_CLASS, WAND_CLASS, GEM_CLASS, RING_CLASS].includes(obj.oclass))
        return GETOBJ_SUGGEST;
    if (obj.oclass === TOOL_CLASS
        && [TOWEL, MAGIC_MARKER].includes(obj.otyp)) {
        return GETOBJ_SUGGEST;
    }
    return GETOBJ_DOWNPLAY;
}

// C ref: engrave.c u_can_engrave(), narrowed to the goal's ordinary floor.
// The caller supplies C's cantwield() and check_capacity() owners to avoid an
// engrave.js -> hack.js import cycle.
export async function u_can_engrave(state, { cantWield, checkCapacity }) {
    const typ = state.level?.at?.(state.u.ux, state.u.uy)?.typ;
    if (state.u.uswallow || ![ROOM, CORR].includes(typ)
        || !can_reach_floor(true, state)) {
        throw new UnsupportedEngraveError('an accessible ordinary floor');
    }
    if (cantWield(state.youmonst?.data ?? state.mons[state.u.umonnum])) {
        throw new UnsupportedEngraveError('a form that can hold a stylus');
    }
    if (await checkCapacity(null, state))
        throw new UnsupportedEngraveError('an unencumbered hero');
    return true;
}

function engravingContext(state) {
    state.context ??= {};
    state.context.engraving ??= {};
    return state.context.engraving;
}

// C ref: engrave.c engrave(). This slice owns the bare-fingertip DUST arm
// whose at most ten non-space bytes finish in the first rate-10 action.
export async function engrave(state, { redraw, handsObject }) {
    const context = engravingContext(state);
    if (context.pos?.x !== state.u.ux || context.pos?.y !== state.u.uy)
        throw new UnsupportedEngraveError('the original engraving square');
    if (context.stylus !== handsObject)
        throw new UnsupportedEngraveError('bare fingertips');

    context.actionct = (context.actionct ?? 0) + 1;
    const text = String(context.text ?? '');
    const nonspaces = [...text].filter((character) => character !== ' ').length;
    if (nonspaces > 10)
        throw new UnsupportedEngraveError('a one-action rate-10 string');

    const engraving = make_engr_at(
        state.u.ux,
        state.u.uy,
        text,
        null,
        (state.moves ?? 0) - (state.multi ?? 0),
        DUST,
        { state },
    );
    engraving.eread = true;
    engraving.erevealed = true;
    context.text = '';
    context.nextc = null;
    context.stylus = null;
    redraw(context.pos.x, context.pos.y);
    return 0;
}

// C ref: engrave.c doengrave(), narrowed to a sighted, clear-minded hero,
// bare fingertips, no prior engraving, ordinary dust, and one action.
export async function doengrave(state, env) {
    await u_can_engrave(state, env);
    const impaired = propertyActiveUnblocked(state.u, BLINDED)
        || propertyIntrinsic(state, CONFUSION)
        || propertyIntrinsic(state, STUNNED)
        || (propertyIntrinsic(state, HALLUC)
            && !propertyIntrinsic(state, HALLUC_RES));
    if (impaired)
        throw new UnsupportedEngraveError('a sighted, clear-minded hero');
    if (engr_at(state.u.ux, state.u.uy, state))
        throw new UnsupportedEngraveError('a square without an engraving');

    state.multi = 0;
    state.nomovemsg = null;
    const selected = await env.getObject(
        'write with', stylus_ok, env.GETOBJ_PROMPT, state,
    );
    if (!selected) return env.ECMD_CANCEL;
    if (selected !== env.handsObject)
        throw new UnsupportedEngraveError('bare fingertips');
    if (!freehand(state))
        throw new UnsupportedEngraveError('a free hand');

    await env.message('You write in the dust with your fingertip.', state);
    let text = await env.getLine(
        'What do you want to write in the dust here?', state,
    );
    text = env.mungspaces(text);
    const bytes = encodeUtf8ByteString(text);
    const nonspaces = bytes.filter((byte) => byte !== 0x20).length;
    if (!nonspaces || text.includes('\x1b'))
        throw new UnsupportedEngraveError('nonempty engraving text');
    if (bytes.some((byte) => byte < 0x20 || byte > 0x7e) || nonspaces > 10)
        throw new UnsupportedEngraveError('at most ten printable ASCII bytes');

    if (nonspaces !== 1 || (!text.includes('x') && !text.includes('X')))
        state.u.uconduct.literate++;

    const mixed = [];
    for (const byte of bytes) {
        if (byte === 0x20) {
            mixed.push(byte);
            continue;
        }
        if (!env.random.rn2(25)) mixed.push(0x20 + env.random.rnd(94));
        else mixed.push(byte);
    }
    text = decodeUtf8ByteString(mixed);

    const context = engravingContext(state);
    context.text = text;
    context.nextc = text;
    context.stylus = env.handsObject;
    context.type = DUST;
    context.pos = { x: state.u.ux, y: state.u.uy };
    context.actionct = 0;
    env.setOccupation(
        (current) => engrave(current, env), 'engraving', 0, state,
    );
    return env.ECMD_OK;
}

function propertyActiveUnblocked(hero, propertyIndex) {
    const property = hero?.uprops?.[propertyIndex];
    return Boolean(property
        && ((property.intrinsic ?? 0) || (property.extrinsic ?? 0))
        && !(property.blocked ?? 0));
}

function hasAttackType(species, attackType) {
    return Boolean(species?.mattk?.some(
        (attack) => attack.aatyp === attackType,
    ));
}

function ceilingHider(species) {
    return Boolean(species?.mflags1 & M1_HIDE)
        && ((Boolean(species.mflags1 & M1_CLING)
                && species.mlet !== S_MIMIC)
            || Boolean(species.mflags1 & M1_FLY));
}

function heroFlying(state) {
    const hero = state.u;
    const property = hero?.uprops?.[FLYING] ?? {};
    return Boolean(
        property.intrinsic
            || property.extrinsic
            || (hero?.usteed?.data?.mflags1 & M1_FLY),
    ) && !property.blocked;
}

// C ref: engrave.c can_reach_floor(), mondata.c sticks(), and trap.c
// uteetering_at_seen_pit()/uescaped_shaft().
export function can_reach_floor(checkPit = true, state = game) {
    const hero = state.u;
    const species = state.youmonst?.data;
    if (!hero || !species || !Number.isInteger(species.mflags1)
        || !Number.isInteger(species.msize)
        || !Array.isArray(species.mattk)) {
        throw new Error('can_reach_floor requires initialized hero form');
    }

    const holderSpecies = hero.ustuck?.data;
    const levitating = propertyActiveUnblocked(hero, LEVITATION);
    if (hero.uswallow
        || (holderSpecies && !sticks(species)
            && hasAttackType(holderSpecies, AT_HUGS))
        || (levitating
            && !(on_level(hero.uz, state.air_level)
                || on_level(hero.uz, state.water_level)))) {
        return false;
    }

    const ridingSkill = hero.weapon_skills?.[P_RIDING]?.skill ?? 0;
    if (hero.usteed && ridingSkill < P_BASIC) return false;
    if (hero.uundetected && ceilingHider(species)) return false;
    if (heroFlying(state) || species.msize >= MZ_HUGE) return true;

    if (checkPit) {
        const trap = t_at(hero.ux, hero.uy, state);
        if (uteetering_at_seen_pit(trap, state) || uescaped_shaft(trap, state))
            return false;
    }
    return true;
}

// C ref: engrave.c freehand() (469-477). Answers whether the hero has a hand
// free for something other than her weapon. A weapon that is not welded leaves
// one free whatever else she wears; a welded one leaves the off hand free
// unless the weapon is two-handed or a cursed shield occupies it.
export function freehand(state = game, env = {}) {
    const uwep = state.uwep;
    return !uwep || !welded(uwep, state, env)
        || (!bimanual(uwep, state) && (!state.uarms || !state.uarms.cursed));
}

// C ref: engrave.c read_engr_at(). The message callback is injected to avoid
// making the engraving substrate depend on the tty display implementation.
// Blind tactile ENGRAVE, HEADSTONE, and BURN paths invoke
// canReachFloor(true, state) synchronously; other paths do not require the
// callback.
export async function read_engr_at(
    x,
    y,
    state = game,
    { pline, canReachFloor } = {},
) {
    const engraving = engr_at(x, y, state);
    const text = engraving?.engr_txt?.[0] ?? '';
    if (!text) return false;
    if (typeof pline !== 'function')
        throw new TypeError('read_engr_at requires a pline callback');

    const blind = propertyActiveUnblocked(state.u, BLINDED);
    const onIce = state.level?.at(x, y)?.typ === ICE;
    const surface = onIce ? 'ice' : 'floor';
    const tactileFloor = () => {
        if (!blind) return true;
        if (typeof canReachFloor !== 'function') {
            throw new TypeError(
                'blind read_engr_at requires a canReachFloor callback',
            );
        }
        return Boolean(canReachFloor(true, state));
    };
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
        if (tactileFloor()) {
            sensed = true;
            await pline(`Something is engraved here on the ${surface}.`, state);
        }
        break;
    case BURN:
        if (tactileFloor()) {
            sensed = true;
            await pline(
                `Some text has been ${onIce ? 'melted' : 'burned'} into the ${surface} here.`,
                state,
            );
        }
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

// C ref: engrave.c u_wipe_engr() (264-268). Rubs out part of whatever the hero
// is standing on. With nothing engraved there wipe_engr_at() returns before
// its first draw, so an ordinary square costs nothing.
export function u_wipe_engr(count, env = {}) {
    const { state } = engravingEnv(env);
    if (can_reach_floor(true, state))
        wipe_engr_at(state.u.ux, state.u.uy, count, false, env);
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
