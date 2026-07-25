// Item erosion for monster-carried objects.
// C refs: trap.c erode_obj() and grease_protect(), monster-victim arms.

import {
    EF_DESTROY,
    EF_GREASE,
    EF_PAY,
    EF_VERBOSE,
    ERODE_BURN,
    ERODE_CORRODE,
    ERODE_CRACK,
    ERODE_ROT,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    MAX_ERODE,
    OBJ_MINVENT,
} from './const.js';
import { monsterPossessive } from './do_name.js';
import {
    erosionMatters,
    isCorrodeable,
    isCrackable,
    isFlammable,
    isRottable,
    isRustprone,
} from './obj.js';
import { xnameFresh } from './objnam.js';
import { canSeeMonster } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';

const EROSION = Object.freeze({
    [ERODE_BURN]: {
        action: 'smoulder',
        affectedBy: 'heat',
        primary: true,
        result: 'burnt',
        vulnerable: isFlammable,
    },
    [ERODE_RUST]: {
        action: 'rust',
        affectedBy: 'oxidation',
        primary: true,
        result: 'rusted',
        vulnerable: isRustprone,
    },
    [ERODE_ROT]: {
        action: 'rot',
        affectedBy: 'decay',
        primary: false,
        result: 'rotten',
        vulnerable: isRottable,
    },
    [ERODE_CORRODE]: {
        action: 'corrode',
        affectedBy: 'corrosion',
        primary: false,
        result: 'corroded',
        vulnerable: isCorrodeable,
    },
    [ERODE_CRACK]: {
        action: 'crack',
        affectedBy: 'impact',
        primary: true,
        result: 'cracked',
        vulnerable: isCrackable,
    },
});

function erosionOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`monster erosion requires a ${name} operation`);
    return operation;
}

function pluralDescription(description) {
    return /(?:s|teeth)$/u.test(description)
        && !/(?:ss|us)$/u.test(description);
}

function verbFor(description, verb) {
    if (pluralDescription(description)) return verb;
    if (verb === 'are') return 'is';
    return `${verb}s`;
}

function currentErosion(obj, primary) {
    return Math.trunc(primary ? obj.oeroded ?? 0 : obj.oeroded2 ?? 0);
}

function setErosion(obj, primary, amount) {
    if (primary) obj.oeroded = amount;
    else obj.oeroded2 = amount;
}

// The current callers pass monster equipment and do not request shop payment
// or destruction. Keep those unowned mutations fail-closed at entry.
export async function erode_monster_object(
    obj,
    description,
    type,
    flags,
    env,
) {
    if (!obj) return ER_NOTHING;
    if (flags & (EF_PAY | EF_DESTROY)) {
        throw new RangeError(
            'monster erosion does not own payment or object destruction',
        );
    }
    if (obj.where !== OBJ_MINVENT || !obj.ocarry) {
        throw new RangeError(
            'monster erosion requires a monster-carried object',
        );
    }

    const details = EROSION[type];
    if (!details) throw new RangeError(`invalid erosion type ${type}`);
    const { state } = env;
    const random = env.random;
    const message = erosionOperation(env, 'message', ttyPline);
    const visible = erosionOperation(
        env,
        'canSeeMonster',
        canSeeMonster,
    )(obj.ocarry, state);
    const name = description || xnameFresh(obj, state);
    const possessive = monsterPossessive(obj.ocarry, state, true);
    const verbose = state.flags?.verbose !== false;
    const print = Boolean(flags & EF_VERBOSE);

    if ((flags & EF_GREASE) && obj.greased) {
        if (visible) {
            await message(
                `${possessive} ${name} ${verbFor(name, 'are')} `
                + 'protected by the layer of grease!',
                state,
            );
        }
        if (!random.rn2(2)) obj.greased = false;
        return ER_GREASED;
    }
    if (!erosionMatters(obj, state)) return ER_NOTHING;

    const vulnerable = details.vulnerable(obj, state);
    if (!vulnerable || (obj.oerodeproof && obj.rknown)) {
        if (verbose && print && visible) {
            await message(
                `${possessive} ${name} ${verbFor(name, 'are')} `
                + `not affected by ${details.affectedBy}.`,
                state,
            );
        }
        return ER_NOTHING;
    }

    if (obj.oerodeproof
        || (obj.blessed && !random.rnl(4))) {
        if (verbose && (print || obj.oerodeproof) && visible) {
            await message(
                `Somehow, ${monsterPossessive(obj.ocarry, state)} `
                + `${name} ${verbFor(name, 'are')} not affected by the `
                + `${details.affectedBy}.`,
                state,
            );
        }
        if (obj.oerodeproof) obj.rknown = true;
        return ER_NOTHING;
    }

    const erosion = currentErosion(obj, details.primary);
    if (erosion < MAX_ERODE) {
        const next = erosion + 1;
        if (visible) {
            const adverb = next === MAX_ERODE
                ? ' completely'
                : erosion ? ' further' : '';
            await message(
                `${possessive} ${name} `
                + `${verbFor(name, details.action)}${adverb}!`,
                state,
            );
        }
        setErosion(obj, details.primary, next);
        return ER_DAMAGED;
    }

    if (verbose && print && visible) {
        await message(
            `${possessive} ${name} ${verbFor(name, 'look')} completely `
            + `${details.result}.`,
            state,
        );
    }
    return ER_NOTHING;
}
