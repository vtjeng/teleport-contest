// Hero health and energy regeneration.
// C ref: allmain.c regen_hp() and regen_pw().

import {
    A_CON,
    A_INT,
    A_WIS,
    ENERGY_REGENERATION,
    MAGICAL_BREATHING,
    MAXULEV,
    MOD_ENCUMBER,
    REGENERATION,
    SLEEPY,
    Upolyd,
} from './const.js';
import { effective_attribute } from './attrib.js';
import { game } from './gstate.js';
import { PM_WIZARD } from './monsters.js';
import { rn1, rn2 } from './rng.js';

function propertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function canRegenerate(hero) {
    return propertyActive(hero, REGENERATION)
        || (propertyActive(hero, SLEEPY) && Boolean(hero.usleep));
}

function reachedFull(kind, state, env) {
    if ((state.multi ?? 0) <= 0) return;
    if (typeof env.interruptMulti !== 'function') {
        throw new TypeError(
            `${kind} reaching full during multi requires interruptMulti`,
        );
    }
    env.interruptMulti(
        kind === 'hp'
            ? 'You are in full health.'
            : 'You feel full of energy.',
        state,
    );
}

// The fresh-game first-turn caller can only reach the ordinary, unpolymorphed
// branch. Keep the polymorphed boundary explicit until rehumanize/eel upkeep
// has a live owner.
export function regen_hp(wtcap, state = game, env = {}) {
    const hero = state.u;
    if (Upolyd(hero)) {
        if ((hero.mh ?? 0) >= (hero.mhmax ?? 0)) return false;
        throw new Error('regen_hp polymorphed branch is not implemented');
    }
    if ((hero.uhp ?? 0) >= (hero.uhpmax ?? 0)) return false;

    const regeneration = canRegenerate(hero);
    const encumbranceOk = wtcap < MOD_ENCUMBER || !hero.umoved;
    if (!encumbranceOk && !regeneration) return false;
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('regen_hp requires rn2');

    let heal = ((hero.ulevel ?? 0) + effective_attribute(state, A_CON))
        > random.rn2(100) ? 1 : 0;
    if (regeneration) heal++;
    if (propertyActive(hero, SLEEPY) && hero.usleep) heal++;
    if (!heal) return false;

    hero.uhp = Math.min(hero.uhp + heal, hero.uhpmax);
    state.disp ??= {};
    state.disp.botl = true;
    if (hero.uhp === hero.uhpmax) reachedFull('hp', state, env);
    return true;
}

export function regen_pw(wtcap, state = game, env = {}) {
    const hero = state.u;
    if ((hero.uen ?? 0) >= (hero.uenmax ?? 0)) return false;
    const energyRegeneration = propertyActive(hero, ENERGY_REGENERATION);
    const divisor = Math.trunc(
        (MAXULEV + 8 - hero.ulevel)
        * (state.urole?.mnum === PM_WIZARD ? 3 : 4)
        / 6,
    );
    if (!energyRegeneration
        && !(wtcap < MOD_ENCUMBER
            && !((state.moves ?? 0) % divisor))) {
        return false;
    }

    const random = env.random ?? { rn1 };
    if (typeof random.rn1 !== 'function')
        throw new TypeError('regen_pw requires rn1');
    let upper = Math.trunc(
        (effective_attribute(state, A_WIS)
            + effective_attribute(state, A_INT)) / 15,
    ) + 1;
    if (hero.uprops?.[MAGICAL_BREATHING]?.extrinsic) upper += 2;
    hero.uen += random.rn1(upper, 1);
    if (hero.uen > hero.uenmax) hero.uen = hero.uenmax;
    state.disp ??= {};
    state.disp.botl = true;
    if (hero.uen === hero.uenmax) reachedFull('pw', state, env);
    return true;
}
