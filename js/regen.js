// Hero health and energy regeneration.
// C ref: allmain.c regen_hp() and regen_pw().

import {
    A_CON,
    A_INT,
    A_WIS,
    ENERGY_REGENERATION,
    HALF_PHDAM,
    Is_waterlevel,
    MAGICAL_BREATHING,
    MAXULEV,
    MOD_ENCUMBER,
    REGENERATION,
    SLEEPY,
    Upolyd,
} from './const.js';
import { acurr } from './attrib.js';
import { game } from './gstate.js';
import { breathless } from './mondata.js';
import { PM_WIZARD, S_EEL } from './monsters.js';
import { rehumanize } from './polyself.js';
import { rn1, rn2 } from './rng.js';
import { is_pool } from './trap.js';

function propertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// youprop.h:276 Breathless: magical breathing from either source, or a form
// that does not breathe.
function Breathless(state) {
    return propertyActive(state.u, MAGICAL_BREATHING)
        || breathless(state.youmonst?.data);
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

// C ref: allmain.c regen_hp() (626-680). The polymorphed arm: a form with
// no hit points left reverts through rehumanize(); an eel out of water loses
// a point with a chance that falls as its hit points do; any other form
// regains one under the same conditions as the human arm below.
export async function regen_hp(wtcap, state = game, env = {}) {
    const hero = state.u;
    const encumbranceOk = wtcap < MOD_ENCUMBER || !hero.umoved;
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('regen_hp requires rn2');
    if (Upolyd(hero)) {
        let heal = 0;
        if (hero.mh < 1) { /* shouldn't happen... */
            await rehumanize(state);
        } else if (state.youmonst.data.mlet === S_EEL
                   && !is_pool(hero.ux, hero.uy, state)
                   && !Is_waterlevel(hero.uz)
                   && !Breathless(state)) {
            /* eel out of water loses hp, similar to monster eels;
               as hp gets lower, rate of further loss slows down */
            if (hero.mh > 1 && !propertyActive(hero, REGENERATION)
                && random.rn2(hero.mh) > random.rn2(8)
                && (!propertyActive(hero, HALF_PHDAM)
                    || !(state.moves % 2)))
                heal = -1;
        } else if (hero.mh < hero.mhmax) {
            if (canRegenerate(hero)
                || (encumbranceOk && !(state.moves % 20)))
                heal = 1;
        }
        if (!heal) return false;
        state.disp ??= {};
        state.disp.botl = true;
        hero.mh += heal;
        if (hero.mh === hero.mhmax) await reachedFull('hp', state, env);
        return true;
    }
    if ((hero.uhp ?? 0) >= (hero.uhpmax ?? 0)) return false;

    const regeneration = canRegenerate(hero);
    if (!encumbranceOk && !regeneration) return false;

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
