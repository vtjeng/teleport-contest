// Hero worn-object and weapon-slot primitives, plus the monster-inventory
// extraction that shares them.
// C refs: src/worn.c setworn(), setnotworn(), recalc_telepat_range(),
//         find_mac(), which_armor(), extract_from_minvent();
//         src/wield.c setuwep(), setuswapwep(), and setuqwep().

import {
    AC_MAX,
    BLINDED,
    BOLT_LIM,
    CLAIRVOYANT,
    INVIS,
    OBJ_MINVENT,
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
    artifact_light,
} from './artifacts.js';
import { game } from './gstate.js';
import { obj_extract_self, update_inventory } from './invent.js';
import { check_gear_next_turn } from './mon.js';
import { PM_WIZARD } from './monsters.js';
import {
    ARM_BONUS,
    isWeptool,
    obj_no_longer_held,
    objectType,
} from './obj.js';
import {
    AMULET_OF_GUARDING,
    CORNUTHAUM,
    GEM_CLASS,
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
//   updateMonExtrinsics(mon, obj, on, silently, env) ->
//     update_mon_extrinsics(), which extract_from_minvent() reaches only for
//     an object the monster still has equipped.
//   mwepgone(mon, env) -> weapon.c mwepgone(), the wield reset the same
//     equipped-object arm performs for W_WEP.
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

// C ref: worn.c find_mac(). A monster's armor class: its species base, less
// every ARM_BONUS() it wears, capped at AC_MAX the way do_wear.c find_ac()
// caps the hero's. misc_worn_check names the slots the monster actually uses,
// so a wielded weapon in minvent contributes nothing.
export function find_mac(monster, state = game) {
    let base = Math.trunc(monster.data.ac);
    const mwflags = monster.misc_worn_check ?? 0;

    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (!((obj.owornmask ?? 0) & mwflags)) continue;
        if (obj.otyp === AMULET_OF_GUARDING)
            base -= 2; /* fixed amount, not impacted by erosion */
        else
            base -= ARM_BONUS(obj, state);
        /* since ARM_BONUS is positive, subtracting it increases AC */
    }
    /* same cap as for hero [find_ac(do_wear.c)] */
    if (Math.abs(base) > AC_MAX)
        base = Math.sign(base) * AC_MAX;
    return base;
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

// C ref: worn.c which_armor() (1006-1035). C splits the hero from every other
// monster: the hero's worn armor lives in the uarm* globals rather than in a
// minvent list, and C reads exactly one of them by slot. WORN_SLOTS above holds
// that same mask-to-field mapping, so the switch is a lookup here.
//
// C's switch answers for the seven armor masks and nothing else: every other
// flag reaches `default: impossible("bad flag in which_armor"); return 0;`,
// which only warns and answers "nothing worn". WORN_SLOTS carries the ring,
// weapon and tool slots too, so the seven are named again here rather than
// searched for; a hero asked for W_WEP must answer null, not uwep.
// weapon.c special_dmgval() is the caller that passes the hero.
const HERO_ARMOR_MASKS = W_ARM | W_ARMC | W_ARMH | W_ARMS | W_ARMG | W_ARMF
    | W_ARMU;

export function which_armor(monster, mask, state = game) {
    if (monster === state.youmonst) {
        if ((mask & ~HERO_ARMOR_MASKS) !== 0) return null;
        const slot = WORN_SLOTS.find((entry) => entry.mask === mask);
        return slot ? (state[slot.field] ?? null) : null;
    }
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.owornmask & mask) return obj;
    }
    return null;
}

// C ref: worn.c extract_from_minvent() (1376-1416). Take obj out of a
// monster's inventory and undo whatever equipped state it still carries.
// `do_extrinsics` selects update_mon_extrinsics(); `silently` is only that
// call's message flag, which is why steal.c mdrop_obj() can pass FALSE for the
// first and TRUE for the second and defer the extrinsics to after the drop.
export function extract_from_minvent(
    mon,
    obj,
    do_extrinsics,
    silently,
    env = {},
) {
    const normalized = wornEnv(env);
    const unwornmask = obj.owornmask ?? 0;

    // C reports impossible() and returns; the port has no caller that can
    // legitimately arrive with a non-minvent object, so this stops instead.
    if (obj.where !== OBJ_MINVENT) {
        throw new Error(
            'extract_from_minvent called on object not in minvent',
        );
    }
    if ((unwornmask & W_ARM) !== 0 && obj.lamplit && artifact_light(obj))
        requiredHook(normalized, 'endArtifactLight', obj)(obj, normalized);

    obj_extract_self(obj, normalized);
    obj.owornmask = 0;
    if (unwornmask) {
        if (!(mon.mhp < 1) /* !DEADMONSTER() */ && do_extrinsics) {
            requiredHook(normalized, 'updateMonExtrinsics', obj)(
                mon,
                obj,
                false,
                silently,
                normalized,
            );
        }
        mon.misc_worn_check &= ~unwornmask;
        // give monster a chance to wear other equipment on its next move
        check_gear_next_turn(mon);
    }
    obj_no_longer_held(obj, normalized);
    if (unwornmask & W_WEP)
        requiredHook(normalized, 'mwepgone', obj)(mon, normalized);
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

// C ref: obj.h is_launcher() (235-237). Exported beside is_ammo() and
// is_missile() because wield.c TWOWEAPOK() reads all three.
export function is_launcher(obj, state = game) {
    const skill = objectType(obj, state).oc_skill;
    return obj.oclass === WEAPON_CLASS
        && skill >= P_BOW && skill <= P_CROSSBOW;
}

// C ref: obj.h:228 is_pole(). Snickersnee is not a polearm, but can hit from
// a distance, which is why the artifact term sits inside the macro rather than
// at its call sites. steed.c reads it on both sides of a ride, so it is
// exported under its source name.
export function is_pole(obj, state = game) {
    const skill = objectType(obj, state).oc_skill;
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && (skill === P_POLEARMS || skill === P_LANCE
            || obj.oartifact === ART_SNICKERSNEE);
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
        && artifact_light(olduwep) && olduwep.lamplit
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
            ? is_launcher(obj, state) || is_ammo(obj, state)
                || is_missile(obj, state)
                || (is_pole(obj, state) && !state.u.usteed
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
    blockedProperty,
    is_pole,
    preflightSetworn,
    removeSlotEffects,
});
