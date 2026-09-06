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
import { acurr } from './attrib.js';
import { game } from './gstate.js';
import { PM_WIZARD, S_EEL } from './monsters.js';
import { rn1, rn2 } from './rng.js';

function propertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function canRegenerate(hero) {
    return propertyActive(hero, REGENERATION)
        || (propertyActive(hero, SLEEPY) && Boolean(hero.usleep));
}

// allmain.c regen_hp() and regen_pw() call interrupt_multi() unconditionally
// on reaching full, and interrupt_multi() owns the `gm.multi > 0 && !travel
// && !run` test. Keeping that condition here too would give one C test two
// owners, and would leave the injected dependency unchecked on every call that
// happens to have multi <= 0.
//
// `norepMessage` travels with the call because interrupt_multi() prints
// through it, and the elapsed turn substitutes a silent owner while it dry-runs
// a burdened turn on a cloned state.
async function reachedFull(kind, state, env) {
    if (typeof env.interruptMulti !== 'function') {
        throw new TypeError(
            `${kind} reaching full requires interruptMulti`,
        );
    }
    await env.interruptMulti(
        kind === 'hp'
            ? 'You are in full health.'
            : 'You feel full of energy.',
        state,
        { norepMessage: env.norepMessage },
    );
}

// No ported code makes u.umonnum differ from u.umonster: u_init.c writes the
// pair together, and polyself.c, the only writer that separates them, is
// unported. const.js Upolyd() is therefore false and the polymorphed arm below
// cannot run. Keep the boundary explicit until rehumanize and eel upkeep have
// a live owner.
export async function regen_hp(wtcap, state = game, env = {}) {
    const hero = state.u;
    if (Upolyd(hero)) {
        // allmain.c regen_hp()'s polymorphed arm. Its caller enters on
        // `u.mh < u.mhmax || mlet == S_EEL`, and the eel-out-of-water branch
        // runs at full mh, drawing rn2 twice and able to subtract a hit point,
        // so full health alone does not make this arm inert. `u.mh < 1` calls
        // rehumanize(). Only a non-eel polymorph at full health does nothing.
        const inert = (hero.mh ?? 0) >= 1
            && (hero.mh ?? 0) >= (hero.mhmax ?? 0)
            && state.youmonst?.data?.mlet !== S_EEL;
        if (inert) return false;
        throw new Error('regen_hp polymorphed branch is not implemented');
    }
    if ((hero.uhp ?? 0) >= (hero.uhpmax ?? 0)) return false;

    const regeneration = canRegenerate(hero);
    const encumbranceOk = wtcap < MOD_ENCUMBER || !hero.umoved;
    if (!encumbranceOk && !regeneration) return false;
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('regen_hp requires rn2');

    let heal = ((hero.ulevel ?? 0) + acurr(state, A_CON))
        > random.rn2(100) ? 1 : 0;
    if (regeneration) heal++;
    if (propertyActive(hero, SLEEPY) && hero.usleep) heal++;
    if (!heal) return false;

    hero.uhp = Math.min(hero.uhp + heal, hero.uhpmax);
    state.disp ??= {};
    state.disp.botl = true;
    if (hero.uhp === hero.uhpmax) await reachedFull('hp', state, env);
    return true;
}

// No ported code lowers u.uen: js/u_init.js and js/startup_skills.js write it
// equal to u.uenmax, and exper.c pluslvl() raises the pair by the same amount.
// The first line therefore returns on every production turn, and the
// interrupt_multi() call below has no live consumer. It is written out because
// allmain.c has it, and the tests in scripts/regen.test.mjs are the only proof
// it is right; spelleffects() is what will first spend a power point.
export async function regen_pw(wtcap, state = game, env = {}) {
    const hero = state.u;
    if ((hero.uen ?? 0) >= (hero.uenmax ?? 0)) return false;
    const energyRegeneration = propertyActive(hero, ENERGY_REGENERATION);
    const divisor = Math.trunc(
        (MAXULEV + 8 - (hero.ulevel ?? 0))
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
        (acurr(state, A_WIS)
            + acurr(state, A_INT)) / 15,
    ) + 1;
    if (hero.uprops?.[MAGICAL_BREATHING]?.extrinsic) upper += 2;
    hero.uen += random.rn1(upper, 1);
    if (hero.uen > hero.uenmax) hero.uen = hero.uenmax;
    state.disp ??= {};
    state.disp.botl = true;
    if (hero.uen === hero.uenmax) await reachedFull('pw', state, env);
    return true;
}
