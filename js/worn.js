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
    FAST,
    INVIS,
    MFAST,
    MSLOW,
    OBJ_MINVENT,
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
    W_SADDLE,
    W_SWAPWEP,
    W_TOOL,
    W_WEP,
    NON_PM,
    has_mcorpsenm,
} from './const.js';
import {
    ART_EYES_OF_THE_OVERWORLD,
    ART_OGRESMASHER,
    ART_SNICKERSNEE,
    artifact_light,
} from './artifacts.js';
import { game } from './gstate.js';
import { newsym } from './display.js';
import { Monnam } from './do_name.js';
import { obj_extract_self, update_inventory } from './invent.js';
import { check_gear_next_turn } from './mon.js';
import { PM_LONG_WORM, PM_WIZARD } from './monsters.js';
import {
    ARM_BONUS,
    is_ammo,
    is_launcher,
    is_missile,
    is_weptool,
    obj_no_longer_held,
    objectType,
} from './obj.js';
import {
    AMULET_OF_GUARDING,
    AMULET_CLASS,
    ARM_BOOTS,
    ARMOR_CLASS,
    ARM_CLOAK,
    BALL_CLASS,
    BLINDFOLD,
    CHAIN_CLASS,
    FOOD_CLASS,
    GEM_CLASS,
    ARM_GLOVES,
    ARM_HELM,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
    CORNUTHAUM,
    MUMMY_WRAPPING,
    LENSES,
    MEAT_RING,
    RING_CLASS,
    SADDLE,
    TIN_OPENER,
    TOOL_CLASS,
    TOWEL,
    WEAPON_CLASS,
} from './objects.js';
import { learnwand } from './zap.js';
import { ttyPline } from './tty_message.js';
import { messageAt } from './startup_a11y.js';
import { canseemon } from './vision.js';

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
    if (obj.oclass === WEAPON_CLASS || is_weptool(obj, state)
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

// C ref: worn.c mon_set_minvis() (474-488). The monster's permanent
// invisibility is copied to its current visibility unless invisibility is
// blocked, then the occupied square is redrawn.
export function mon_set_minvis(monster, cursedPotion, state = game) {
    monster.perminvis = cursedPotion ? 0 : 1;
    if (!monster.invis_blkd) {
        monster.minvis = monster.perminvis;
        newsym(monster.mx, monster.my, state);
    }
}

// C ref: worn.c mon_adjust_speed() (488-578). The adjustment changes only
// permanent speed; active speed is then recalculated from any equipped FAST
// object. The message and learnwand hooks keep this source-shaped helper
// usable by tests without changing the production defaults.
export async function mon_adjust_speed(
    monster,
    adjust,
    obj,
    state = game,
    rawEnv = {},
) {
    let giveMsg = !state.in_mklev && !rawEnv.silent;
    let petrify = false;
    const oldSpeed = monster.mspeed;

    switch (adjust) {
    case 2:
        monster.permspeed = MFAST;
        giveMsg = false;
        break;
    case 1:
        monster.permspeed = monster.permspeed === MSLOW
            ? 0 : MFAST;
        break;
    case 0:
        break;
    case -1:
        monster.permspeed = monster.permspeed === MFAST
            ? 0 : MSLOW;
        break;
    case -2:
        monster.permspeed = MSLOW;
        giveMsg = false;
        break;
    case -3:
        if (monster.permspeed === MFAST)
            monster.permspeed = 0;
        petrify = true;
        break;
    case -4:
        if (monster.permspeed === MFAST)
            monster.permspeed = 0;
        giveMsg = false;
        break;
    }

    let hasSpeedObject = false;
    for (let current = monster.minvent; current; current = current.nobj) {
        if (current.owornmask
            && objectType(current, state).oc_oprop === FAST) {
            hasSpeedObject = true;
            break;
        }
    }
    monster.mspeed = hasSpeedObject ? MFAST : monster.permspeed;

    const seeMonster = rawEnv.canseemon ?? canseemon;
    if (!giveMsg
        || (monster.mspeed === oldSpeed && !petrify)
        || !monster.data?.mmove
        || monster.mfrozen
        || monster.msleeping
        || !seeMonster(monster, state)) {
        return;
    }

    const howMuch = monster.mspeed + oldSpeed === MFAST + MSLOW
        ? 'much ' : '';
    let text = null;
    if (petrify) {
        if (state.flags?.verbose)
            text = `${Monnam(monster, state)} is slowing down.`;
    } else if (adjust > 0 || monster.mspeed === MFAST) {
        text = `${Monnam(monster, state)} is suddenly moving ${howMuch}faster.`;
    } else {
        text = `${Monnam(monster, state)} seems to be moving ${howMuch}slower.`;
    }

    const message = rawEnv.message ?? ttyPline;
    if (text != null)
        await message(messageAt(text, monster.mx, monster.my, state), state);
    if (obj != null)
        (rawEnv.learnwand ?? learnwand)(obj, state);
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

export function bimanual(obj, state = game) {
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && Boolean(objectType(obj, state).oc_bimanual);
}

// C ref: worn.c armcat_to_wornmask() (250-278). Converts an armor category
// constant to the corresponding W_ARM* bitmask.
export function armcat_to_wornmask(cat) {
    switch (cat) {
    case ARM_SUIT:    return W_ARM;
    case ARM_CLOAK:   return W_ARMC;
    case ARM_HELM:    return W_ARMH;
    case ARM_SHIELD:  return W_ARMS;
    case ARM_GLOVES:  return W_ARMG;
    case ARM_BOOTS:   return W_ARMF;
    case ARM_SHIRT:   return W_ARMU;
    default:          return 0;
    }
}

// C ref: worn.c wearmask_to_obj() (206-214). Returns the object currently
// occupying the equipment slot identified by the given wornmask, or null.
export function wearmask_to_obj(wornmask, state = game) {
    for (const slot of WORN_SLOTS) {
        if (slot.mask & wornmask) return state[slot.field] ?? null;
    }
    return null;
}

// C ref: worn.c wearslot() (282-350). Returns every equipment mask in which
// an object could be worn. Callers narrow a multi-slot answer to the mask that
// was occupied before replacing the object.
export function wearslot(obj, state = game) {
    if (!obj || typeof obj !== 'object') return 0;
    const type = objectType(obj, state);
    switch (obj.oclass) {
    case AMULET_CLASS:
        return W_AMUL;
    case RING_CLASS:
        return W_RINGL | W_RINGR;
    case ARMOR_CLASS:
        return armcat_to_wornmask(type.oc_armcat);
    case WEAPON_CLASS:
        return W_WEP | W_SWAPWEP
            | (type.oc_merge ? W_QUIVER : 0);
    case TOOL_CLASS:
        if (obj.otyp === BLINDFOLD || obj.otyp === TOWEL
            || obj.otyp === LENSES)
            return W_TOOL;
        if (is_weptool(obj, state) || obj.otyp === TIN_OPENER)
            return W_WEP | W_SWAPWEP;
        if (obj.otyp === SADDLE) return W_SADDLE;
        return 0;
    case FOOD_CLASS:
        return obj.otyp === MEAT_RING ? W_RINGL | W_RINGR : 0;
    case GEM_CLASS:
        return W_QUIVER;
    case BALL_CLASS:
        return W_BALL;
    case CHAIN_CLASS:
        return W_CHAIN;
    default:
        return 0;
    }
}

// C ref: worn.c clear_bypass() (1053-1064). `nobj` is the chain for every
// object list, while `cobj` is the head of a container's contents.
export function clear_bypass(objchain) {
    for (let obj = objchain ?? null; obj; obj = obj.nobj) {
        obj.bypass = false;
        if (obj.cobj) clear_bypass(obj.cobj);
    }
}

// C ref: worn.c bypass_obj() (1118-1123). The context flag is part of the
// same state owner as each object's bit, so a cleanup pass can be skipped when
// no object has been marked.
export function bypass_obj(obj, state = game) {
    if (!obj) return;
    obj.bypass = true;
    state.context ??= {};
    state.context.bypasses = true;
}

function clearMonsterObjectLists(monsters, state, resetLongWorm) {
    for (let monster = monsters ?? null; monster; monster = monster.nmon) {
        if (resetLongWorm && monster.mhp < 1) continue;
        if (resetLongWorm
            && (monster.data === state.mons?.[PM_LONG_WORM]
                || monster.mnum === PM_LONG_WORM)
            && has_mcorpsenm(monster)) {
            monster.mextra.mcorpsenm = NON_PM;
        }
        clear_bypass(monster.minvent);
    }
}

// C ref: worn.c clear_bypasses() (1066-1116). This walks every object owner,
// including lists which are normally empty in the JavaScript runtime, and then
// clears the long-worm polymorph marker and the floating ball/chain pointers.
export function clear_bypasses(rawEnv = {}) {
    // Callers pass either a state or an environment containing `state`. The
    // source no-argument call uses the canonical global game; the default
    // parameter is an empty environment, so do not mistake it for a state.
    const state = rawEnv?.state
        ?? (rawEnv === game || Object.keys(rawEnv ?? {}).length
            ? rawEnv : game);
    clear_bypass(state.level?.objlist);
    clear_bypass(state.invent);
    clear_bypass(state.gm?.migrating_objs);
    clear_bypass(state.level?.buriedobjlist);
    clear_bypass(state.gb?.billobjs);
    clear_bypass(state.go?.objs_deleted);
    clearMonsterObjectLists(state.level?.monlist, state, true);
    clearMonsterObjectLists(state.gm?.migrating_mons, state, false);
    clearMonsterObjectLists(state.gm?.mydogs, state, false);
    if (state.uball) state.uball.bypass = false;
    if (state.uchain) state.uchain.bypass = false;
    if (state.u?.uball) state.u.uball.bypass = false;
    if (state.u?.uchain) state.u.uchain.bypass = false;
    state.context ??= {};
    state.context.bypasses = false;
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
            : !is_weptool(obj, state)
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
