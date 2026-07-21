// Hero worn-object and weapon-slot primitives.
// C refs: src/worn.c setworn(), setnotworn(), recalc_telepat_range();
//         src/wield.c setuwep(), setuswapwep(), and setuqwep().

import {
    BLINDED,
    BOLT_LIM,
    CLAIRVOYANT,
    INVIS,
    P_BOW,
    P_BOOMERANG,
    P_CROSSBOW,
    P_DART,
    P_LANCE,
    P_POLEARMS,
    TELEPAT,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMOR,
    W_ARMS,
    W_ARMU,
    W_ART,
    W_BALL,
    W_CHAIN,
    W_QUIVER,
    W_RINGL,
    W_RINGR,
    W_SWAPWEP,
    W_TOOL,
    W_WEP,
} from './const.js';
import {
    ART_EYES_OF_THE_OVERWORLD,
    ART_OGRESMASHER,
    ART_SNICKERSNEE,
    ART_SUNSWORD,
} from './artifacts.js';
import { game } from './gstate.js';
import { update_inventory } from './invent.js';
import { PM_WIZARD } from './monsters.js';
import { isWeptool, objectType } from './obj.js';
import {
    CORNUTHAUM,
    GEM_CLASS,
    GOLD_DRAGON_SCALE_MAIL,
    GOLD_DRAGON_SCALES,
    MUMMY_WRAPPING,
    TOOL_CLASS,
    TOWEL,
    WEAPON_CLASS,
} from './objects.js';

const WORN_SLOTS = Object.freeze([
    Object.freeze({ mask: W_ARM, field: 'uarm' }),
    Object.freeze({ mask: W_ARMC, field: 'uarmc' }),
    Object.freeze({ mask: W_ARMH, field: 'uarmh' }),
    Object.freeze({ mask: W_ARMS, field: 'uarms' }),
    Object.freeze({ mask: W_ARMG, field: 'uarmg' }),
    Object.freeze({ mask: W_ARMF, field: 'uarmf' }),
    Object.freeze({ mask: W_ARMU, field: 'uarmu' }),
    Object.freeze({ mask: W_RINGL, field: 'uleft' }),
    Object.freeze({ mask: W_RINGR, field: 'uright' }),
    Object.freeze({ mask: W_WEP, field: 'uwep' }),
    Object.freeze({ mask: W_SWAPWEP, field: 'uswapwep' }),
    Object.freeze({ mask: W_QUIVER, field: 'uquiver' }),
    Object.freeze({ mask: W_AMUL, field: 'uamul' }),
    Object.freeze({ mask: W_TOOL, field: 'ublindf' }),
    Object.freeze({ mask: W_BALL, field: 'uball' }),
    Object.freeze({ mask: W_CHAIN, field: 'uchain' }),
]);

function wornEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function property(state, index) {
    const result = state.u?.uprops?.[index];
    if (!result)
        throw new RangeError(`setworn: missing hero property ${index}`);
    return result;
}

// WornEnv hook contract. These hooks own source subsystems which are not yet
// ported here, and run at their exact C call boundaries:
//
//   cancelDoff(obj, slotMask, env) -> do_wear.c cancel_doff().
//   monsterUnseesProperty(propertyIndex, env) -> monstunseesu_prop().
//   setArtifactIntrinsic(obj, on, mask, env) -> set_artifact_intrinsic().
//   endArtifactLight(obj, env) -> end_burn(obj, FALSE), including the visible
//     "stop shining" message when the hero is not blind.
function requiredHook(env, name, obj) {
    const hook = env.hooks[name];
    if (typeof hook !== 'function') {
        const type = Number.isInteger(obj?.otyp) ? ` for otyp ${obj.otyp}` : '';
        throw new Error(`worn requires ${name}${type}`);
    }
    return hook;
}

function blockedProperty(obj, mask, state) {
    if (obj.otyp === MUMMY_WRAPPING && (mask & W_ARMC)) return INVIS;
    if (obj.otyp === CORNUTHAUM
        && (mask & W_ARMH)
        && state.urole?.mnum !== PM_WIZARD) return CLAIRVOYANT;
    if ((mask & W_TOOL)
        && obj.oartifact === ART_EYES_OF_THE_OVERWORLD) {
        return BLINDED;
    }
    return 0;
}

function artifactIntrinsic(obj, on, mask, env) {
    if (!obj.oartifact) return;
    const hook = requiredHook(env, 'setArtifactIntrinsic', obj);
    hook(obj, on, mask, env);
}

function monsterUnseesProperty(index, obj, env) {
    requiredHook(env, 'monsterUnseesProperty', obj)(index, env);
}

function cancelDoff(obj, slotMask, env) {
    requiredHook(env, 'cancelDoff', obj)(obj, slotMask, env);
}

// C ref: worn.c setworn(), old-object branch. slotMask owns the slot-local
// bits; callerMask is deliberately retained for w_blocks() and artifact calls.
function removeSlotEffects(obj, slotMask, callerMask, env) {
    const { state } = env;
    const oprop = Math.trunc(objectType(obj, state).oc_oprop ?? 0);
    property(state, oprop).extrinsic &= ~slotMask;
    monsterUnseesProperty(oprop, obj, env);
    const blocked = blockedProperty(obj, callerMask, state);
    if (blocked) property(state, blocked).blocked &= ~slotMask;
    artifactIntrinsic(obj, false, callerMask, env);
}

function addSlotEffects(obj, slotMask, callerMask, env) {
    const { state } = env;
    if (slotMask & (W_SWAPWEP | W_QUIVER)) return;
    if (obj.oclass === WEAPON_CLASS || isWeptool(obj, state)
        || callerMask !== W_WEP) {
        const oprop = Math.trunc(objectType(obj, state).oc_oprop ?? 0);
        property(state, oprop).extrinsic |= slotMask;
        const blocked = blockedProperty(obj, callerMask, state);
        if (blocked) property(state, blocked).blocked |= slotMask;
    }
    artifactIntrinsic(obj, true, callerMask, env);
}

function preflightSetworn(obj, mask, env) {
    const { state } = env;
    for (const slot of WORN_SLOTS) {
        if (!(slot.mask & mask)) continue;
        const old = state[slot.field] ?? null;
        if (old) {
            requiredHook(env, 'cancelDoff', old);
            if (!(slot.mask & (W_SWAPWEP | W_QUIVER))) {
                requiredHook(env, 'monsterUnseesProperty', old);
                if (old.oartifact)
                    requiredHook(env, 'setArtifactIntrinsic', old);
            }
        }
        if (obj?.oartifact && !(slot.mask & (W_SWAPWEP | W_QUIVER)))
            requiredHook(env, 'setArtifactIntrinsic', obj);
    }
}

// C ref: worn.c recalc_telepat_range(). Artifact ESP is injected because the
// artifact table owns SPFX_ESP; ordinary starting gear uses oc_oprop directly.
export function recalc_telepat_range(state = game, hooks = {}) {
    let count = 0;
    for (const { field } of WORN_SLOTS) {
        const obj = state[field];
        if (obj && objectType(obj, state).oc_oprop === TELEPAT) ++count;
    }
    if (typeof hooks.hasArtifactTelepathy === 'function'
        ? hooks.hasArtifactTelepathy(state)
        : Boolean(property(state, TELEPAT).extrinsic & W_ART)) {
        ++count;
    }
    state.u.unblind_telepat_range = count
        ? BOLT_LIM * BOLT_LIM * count
        : -1;
    return state.u.unblind_telepat_range;
}

export function set_twoweap(enabled, state = game) {
    const on = Boolean(enabled);
    if (on !== Boolean(state.u.twoweap)) {
        state.u.twoweap = on;
        if (state.flags?.weaponstatus) {
            state.disp ??= {};
            state.disp.botl = true;
        }
    }
    return state.u.twoweap;
}

// C ref: worn.c setworn(). The I_SPECIAL/uskin restore case is deliberately
// outside the new-game boundary; all ordinary worn slots are complete here.
export function setworn(obj, mask, env = {}) {
    const normalized = wornEnv(env);
    const { state } = normalized;
    preflightSetworn(obj, mask, normalized);
    for (const slot of WORN_SLOTS) {
        if (!(slot.mask & mask)) continue;
        const old = state[slot.field] ?? null;
        if (old) {
            if (state.u.twoweap && (old.owornmask & (W_WEP | W_SWAPWEP)))
                set_twoweap(false, state);
            old.owornmask &= ~slot.mask;
            if (!(slot.mask & (W_SWAPWEP | W_QUIVER)))
                removeSlotEffects(old, slot.mask, mask, normalized);
            cancelDoff(old, slot.mask, normalized);
        }
        state[slot.field] = obj ?? null;
        if (obj) {
            obj.owornmask |= slot.mask;
            addSlotEffects(obj, slot.mask, mask, normalized);
        }
    }

    if (obj && (obj.owornmask & W_ARMOR))
        state.u.uroleplay.nudist = false;
    state.iflags ??= {};
    state.iflags.tux_penalty = Boolean(
        state.uarm
        && state.urole?.filecode === 'Mon'
        && state.urole.spelarmr,
    );
    if ((state.flags?.weaponstatus && (mask & W_WEP))
        || (state.flags?.armorstatus && (mask & W_ARMOR))) {
        state.disp ??= {};
        state.disp.botl = true;
    }
    update_inventory(normalized);
    recalc_telepat_range(state, normalized.hooks);
    return obj ?? null;
}

export function setnotworn(obj, env = {}) {
    if (!obj) return null;
    const normalized = wornEnv(env);
    const { state } = normalized;
    for (const slot of WORN_SLOTS) {
        if (state[slot.field] !== obj) continue;
        requiredHook(normalized, 'cancelDoff', obj);
        requiredHook(normalized, 'monsterUnseesProperty', obj);
        if (obj.oartifact)
            requiredHook(normalized, 'setArtifactIntrinsic', obj);
    }
    if (state.u.twoweap && (obj === state.uwep || obj === state.uswapwep))
        set_twoweap(false, state);
    let unworn = 0;
    for (const slot of WORN_SLOTS) {
        if (state[slot.field] !== obj) continue;
        cancelDoff(obj, slot.mask, normalized);
        state[slot.field] = null;
        unworn |= slot.mask;
        const oprop = Math.trunc(objectType(obj, state).oc_oprop ?? 0);
        property(state, oprop).extrinsic &= ~slot.mask;
        monsterUnseesProperty(oprop, obj, normalized);
        obj.owornmask &= ~slot.mask;
        artifactIntrinsic(obj, false, slot.mask, normalized);
        const blocked = blockedProperty(obj, slot.mask, state);
        if (blocked) property(state, blocked).blocked &= ~slot.mask;
    }
    state.iflags ??= {};
    if (!state.uarm) state.iflags.tux_penalty = false;
    if ((state.flags?.weaponstatus && (unworn & W_WEP))
        || (state.flags?.armorstatus && (unworn & W_ARMOR))) {
        state.disp ??= {};
        state.disp.botl = true;
    }
    update_inventory(normalized);
    recalc_telepat_range(state, normalized.hooks);
    return obj;
}

export function is_ammo(obj, state = game) {
    const skill = objectType(obj, state).oc_skill;
    return (obj.oclass === WEAPON_CLASS || obj.oclass === GEM_CLASS)
        && skill >= -P_CROSSBOW && skill <= -P_BOW;
}

export function is_missile(obj, state = game) {
    const skill = objectType(obj, state).oc_skill;
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && skill >= -P_BOOMERANG && skill <= -P_DART;
}

export function bimanual(obj, state = game) {
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && Boolean(objectType(obj, state).oc_bimanual);
}

function isLauncher(obj, state) {
    const skill = objectType(obj, state).oc_skill;
    return obj.oclass === WEAPON_CLASS
        && skill >= P_BOW && skill <= P_CROSSBOW;
}

function isPole(obj, state) {
    const skill = objectType(obj, state).oc_skill;
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && (skill === P_POLEARMS || skill === P_LANCE
            || obj.oartifact === ART_SNICKERSNEE);
}

function artifactLight(obj) {
    if (!obj) return false;
    if ((obj.otyp === GOLD_DRAGON_SCALE_MAIL
         || obj.otyp === GOLD_DRAGON_SCALES)
        && (obj.owornmask & W_ARM)) return true;
    return obj.oartifact === ART_SUNSWORD;
}

function markBottomLine(state) {
    state.disp ??= {};
    state.disp.botl = true;
}

export function setuwep(obj, env = {}) {
    const normalized = wornEnv(env);
    const { state } = normalized;
    if ((state.uwep ?? null) === (obj ?? null)) return obj ?? null;
    const olduwep = state.uwep ?? null;
    const endArtifactLightHook = olduwep
        && artifactLight(olduwep) && olduwep.lamplit
        ? requiredHook(normalized, 'endArtifactLight', olduwep)
        : null;
    setworn(obj, W_WEP, normalized);
    if ((state.uwep ?? null) === (obj ?? null)
        && ((state.uwep?.oartifact === ART_OGRESMASHER)
            || olduwep?.oartifact === ART_OGRESMASHER)) {
        markBottomLine(state);
    }
    if ((state.uwep ?? null) === (obj ?? null)
        && endArtifactLightHook && olduwep.lamplit) {
        endArtifactLightHook(
            olduwep,
            normalized,
        );
        if (olduwep.lamplit) {
            throw new Error(
                'endArtifactLight must extinguish the old wielded artifact',
            );
        }
    }
    if ((state.uwep ?? null) === (obj ?? null)
        && ((state.uwep?.oartifact === ART_OGRESMASHER)
            || olduwep?.oartifact === ART_OGRESMASHER)) {
        markBottomLine(state);
    }
    if (obj) {
        state.unweapon = obj.oclass === WEAPON_CLASS
            ? isLauncher(obj, state) || is_ammo(obj, state)
                || is_missile(obj, state)
                || (isPole(obj, state) && !state.u.usteed
                    && obj.oartifact !== ART_SNICKERSNEE)
            : !isWeptool(obj, state)
                && !(obj.otyp === TOWEL && Math.trunc(obj.spe ?? 0) > 0);
    } else {
        state.unweapon = true;
    }
    return obj ?? null;
}

export function setuswapwep(obj, env = {}) {
    return setworn(obj, W_SWAPWEP, wornEnv(env));
}

export function setuqwep(obj, env = {}) {
    return setworn(obj, W_QUIVER, wornEnv(env));
}

export const _wornInternals = Object.freeze({
    WORN_SLOTS,
    addSlotEffects,
    artifactLight,
    blockedProperty,
    isPole,
    preflightSetworn,
    removeSlotEffects,
});
