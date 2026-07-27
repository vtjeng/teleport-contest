// Hero-versus-monster interaction owned by uhitm.c.

import {
    CONFUSION,
    HALLUC,
    HALLUC_RES,
    STUNNED,
} from './const.js';
import { capitalizedAlwaysVisibleMonsterName } from './do_name.js';
import { game } from './gstate.js';
import { monflee } from './monmove.js';
import { rn2, rnd } from './rng.js';
import { canSpotMonster } from './startup_a11y.js';

function intrinsicProperty(hero, index) {
    return Boolean(hero?.uprops?.[index]?.intrinsic);
}

function propertyPresent(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: display.h is_safemon().
export function is_safemon(monster, state = game) {
    const hero = state.u;
    const hallucinating = intrinsicProperty(hero, HALLUC)
        && !propertyPresent(hero, HALLUC_RES);
    return Boolean(
        state.flags?.safe_dog
        && monster?.mpeaceful
        && canSpotMonster(monster, state)
        && !intrinsicProperty(hero, CONFUSION)
        && !hallucinating
        && !intrinsicProperty(hero, STUNNED),
    );
}

function requireAttackOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`do_attack requires ${name}`);
    return operation;
}

// C ref: uhitm.c do_attack(), safe-monster branch for an ordinary active
// starting pet. The repeated-command boundary makes punishment, shops, and
// Stormbringer unreachable and preflights long worms, helplessness, and
// obstructed source squares before this function can draw. Result false lets
// hack.c swap places; true consumes the move after the pet refuses.
export async function do_attack(monster, state = game, env = {}) {
    if (!is_safemon(monster, state) || state.context?.forcefight)
        return requireAttackOperation(env, 'unsupported')(
            'hero combat',
            monster,
            state,
        );

    const random = env.random ?? { rn2, rnd };
    if (typeof random.rn2 !== 'function'
        || typeof random.rnd !== 'function') {
        throw new TypeError('do_attack random injection requires rn2 and rnd');
    }
    const message = requireAttackOperation(env, 'message');
    const stopRunning = requireAttackOperation(env, 'endRunning');
    const makeFlee = env.monFlee ?? monflee;
    if (typeof makeFlee !== 'function')
        throw new TypeError('do_attack requires monFlee');

    if (random.rn2(7)) return false;

    await makeFlee(monster, random.rnd(6), false, false, {
        ...env,
        state,
        random,
    });
    await message(
        `You stop.  ${capitalizedAlwaysVisibleMonsterName(monster, state)} `
            + 'is in the way!',
        state,
    );
    stopRunning(state);
    return true;
}
