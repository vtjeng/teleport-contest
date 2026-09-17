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
    ACID_RES,
    ANTIMAGIC,
    COLD_RES,
    DISINT_RES,
    DISPLACED,
    FAST,
    FIRE_RES,
    FLYING,
    FUMBLING,
    JUMPING,
    INVIS,
    LEVITATION,
    MFAST,
    MSLOW,
    OBJ_MINVENT,
    POISON_RES,
    PROTECTION,
    REFLECTING,
    SHOCK_RES,
    SLEEP_RES,
    STONE_RES,
    STEALTH,
    P_LANCE,
    P_POLEARMS,
    TELEPAT,
    WWALKING,
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
    SEE_INVIS,
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
import { Monnam, mon_nam, hcolor } from './do_name.js';
import { obj_extract_self, update_inventory } from './invent.js';
import { check_gear_next_turn } from './mon.js';
import {
    M1_ANIMAL,
    M1_MINDLESS,
    M1_NOHANDS,
    M1_SLITHY,
    MZ_MEDIUM,
    MZ_SMALL,
    PM_HOBBIT,
    PM_SKELETON,
    PM_LONG_WORM,
    PM_WIZARD,
    S_CENTAUR,
    S_MUMMY,
} from './monsters.js';
import {
    ARM_BONUS,
    WrappingAllowed,
    curse,
    is_flimsy,
    is_ammo,
    is_launcher,
    is_missile,
    is_weptool,
    obj_no_longer_held,
    objectType,
} from './obj.js';
import { cantweararm, has_horns, raceptr } from './mondata.js';
import { s_suffix, strsubst, strncmpi } from './hacklib.js';
import {
    AMULET_OF_GUARDING,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_REFLECTION,
    AMULET_CLASS,
    ALCHEMY_SMOCK,
    ARM_BOOTS,
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
    ARMOR_CLASS,
    CORNUTHAUM,
    DUNCE_CAP,
    ELVEN_BOOTS,
    ELVEN_CLOAK,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ELVEN_SHIELD,
    HELM_OF_OPPOSITE_ALIGNMENT,
    MUMMY_WRAPPING,
    LENSES,
    MEAT_RING,
    RING_CLASS,
    SADDLE,
    TIN_OPENER,
    TOOL_CLASS,
    TOWEL,
    WEAPON_CLASS,
    SPEED_BOOTS,
} from './objects.js';
import { learnwand } from './zap.js';
import { ttyPline } from './tty_message.js';
import { messageAt } from './startup_a11y.js';
import { cansee, canseemon, vision_recalc } from './vision.js';
import { arti_light_description } from './light.js';
import { objectGenerationEnv } from './object_generation.js';
import { begin_burn, end_burn } from './timeout.js';
import { discover_object } from './o_init.js';
import { note_unported } from './unported.js';
import {
    distant_name,
    donameFresh,
    simpleonames,
    otense,
    Yname2,
} from './objnam.js';

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
//   endArtifactLight(obj, env) -> an optional integration override for
//     end_burn(obj, FALSE); extraction uses the canonical timeout owner when
//     this hook is absent.
//   updateMonExtrinsics(mon, obj, on, silently, env) ->
//     update_mon_extrinsics(), which extract_from_minvent() reaches only for
//     an object the monster still has equipped.  When omitted,
//     extract_from_minvent() calls the canonical owner below directly.
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

// C refs: worn.c update_mon_extrinsics() (579-712), m_dowear() (757-797),
// and m_dowear_type() (799-1002).  Monster equipment belongs to worn.c even
// though level creation historically kept a narrow copy in makemon_create.js.
// Creation stays synchronous; planning follows the runtime state and ordering
// on a clone while suppressing presentation; live reassessment returns a
// promise so its messages and speed recalculation finish before movemon
// continues.

function monsterArmorEnv(rawEnv = {}) {
    if (rawEnv && rawEnv.state) {
        return {
            ...rawEnv,
            state: rawEnv.state,
            silent: rawEnv.silent ?? false,
        };
    }
    return {
        state: rawEnv && rawEnv.objects ? rawEnv : game,
        silent: true,
    };
}

function monsterHeroProperty(state, index) {
    const value = state.u?.uprops?.[index];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// C ref: worn.c extra_pref() (1339-1356). Speed boots receive a preference
// only while the monster does not already have permanent FAST.
export function extra_pref(monster, obj) {
    return obj?.otyp === SPEED_BOOTS && monster.permspeed !== MFAST ? 20 : 0;
}

// C ref: worn.c racial_exception() (1360-1389). Use raceptr() so the hero's
// polymorphed race follows the same source owner as do_wear.c and polyself.c;
// the only accepted combination is an elven armor item on a hobbit.
export function racial_exception(monster, obj, state = game) {
    return raceptr(monster, state)?.pmidx === PM_HOBBIT
        && (obj.otyp === ELVEN_LEATHER_HELM
            || obj.otyp === ELVEN_MITHRIL_COAT
            || obj.otyp === ELVEN_CLOAK
            || obj.otyp === ELVEN_SHIELD
            || obj.otyp === ELVEN_BOOTS)
        ? 1 : 0;
}

function monsterAltProperty(obj, state) {
    const primary = Math.trunc(objectType(obj, state).oc_oprop ?? 0);
    return obj.otyp === ALCHEMY_SMOCK
        ? POISON_RES + ACID_RES - primary : 0;
}

function monsterResistanceMask(which) {
    return which >= FIRE_RES && which <= STONE_RES ? (1 << (which - 1)) : 0;
}

function updateMonsterExtrinsicsCore(monster, obj, on, env) {
    const { state } = env;
    const wasUnseen = !canseemon(monster, state);
    const primary = Math.trunc(objectType(obj, state).oc_oprop ?? 0);
    const alternate = monsterAltProperty(obj, state);
    const apply = (which) => {
        if (!which) return;
        if (on) {
            switch (which) {
            case INVIS:
                monster.minvis = !monster.invis_blkd;
                break;
            case FAST:
                return mon_adjust_speed(monster, 0, obj, state, {
                    ...env,
                    silent: Boolean(env.silent),
                });
            case ANTIMAGIC:
            case REFLECTING:
            case PROTECTION:
            case CLAIRVOYANT:
            case STEALTH:
            case TELEPAT:
            case LEVITATION:
            case FLYING:
            case WWALKING:
            case DISPLACED:
            case FUMBLING:
            case JUMPING:
                break;
            default: {
                const resistance = monsterResistanceMask(which);
                if (resistance) monster.mextrinsics =
                    (monster.mextrinsics ?? 0) | resistance;
                break;
            }
            }
        } else {
            switch (which) {
            case INVIS:
                monster.minvis = Boolean(monster.perminvis);
                break;
            case FAST:
                return mon_adjust_speed(monster, 0, obj, state, {
                    ...env,
                    silent: Boolean(env.silent),
                });
            case FIRE_RES:
            case COLD_RES:
            case SLEEP_RES:
            case DISINT_RES:
            case SHOCK_RES:
            case POISON_RES:
            case ACID_RES:
            case STONE_RES: {
                let retained = false;
                for (let other = monster.minvent; other; other = other.nobj) {
                    if (other === obj || !other.owornmask) continue;
                    if (Math.trunc(objectType(other, state).oc_oprop ?? 0)
                        === which || monsterAltProperty(other, state) === which) {
                        retained = true;
                        break;
                    }
                }
                if (!retained) {
                    const resistance = monsterResistanceMask(which);
                    if (resistance) monster.mextrinsics =
                        (monster.mextrinsics ?? 0) & ~resistance;
                }
                break;
            }
            default:
                break;
            }
        }
    };

    const first = apply(primary);
    const second = alternate && alternate !== primary ? apply(alternate) : null;
    if (!on && monster === state.u?.usteed && obj.otyp === SADDLE) {
        // worn.c:708-709 discards dismount_steed(DISMOUNT_FELL)'s result.
        // Its fall-specific implementation remains an explicit unported
        // steed.c boundary, so record the call and continue the worn update.
        note_unported('steed.c dismount_steed DISMOUNT_FELL');
    }
    const finish = () => {
        const blocked = blockedProperty(obj, W_ARMOR | W_TOOL, state);
        if (blocked === INVIS) {
            monster.invis_blkd = Boolean(on);
            monster.minvis = on ? false : Boolean(monster.perminvis);
        }
        if (!env.silent && wasUnseen !== !canseemon(monster, state))
            newsym(monster.mx, monster.my, state);
    };
    if (first?.then || second?.then)
        return Promise.all([first, second]).then(finish);
    finish();
}

export function update_mon_extrinsics(monster, obj, on, rawEnv = {}) {
    const env = monsterArmorEnv(rawEnv);
    const result = updateMonsterExtrinsicsCore(monster, obj, on, env);
    if (env.silent) return result;
    return Promise.resolve(result);
}

function selectMonsterArmor(monster, mask, env, racialException) {
    const { state } = env;
    const old = which_armor(monster, mask, state);
    if (old?.cursed) return { old, best: old };
    if (old && mask === W_AMUL && old.otyp !== AMULET_OF_GUARDING)
        return { old, best: old };
    let best = old;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (mask === W_AMUL) {
            if (obj.oclass !== AMULET_CLASS
                || (obj.otyp !== AMULET_OF_LIFE_SAVING
                    && obj.otyp !== AMULET_OF_REFLECTION
                    && obj.otyp !== AMULET_OF_GUARDING)) continue;
            if (!best || obj.otyp !== AMULET_OF_GUARDING) {
                best = obj;
                if (best.otyp !== AMULET_OF_GUARDING) break;
            }
            continue;
        }
        if (obj.oclass !== ARMOR_CLASS) continue;
        const category = objectType(obj, state).oc_armcat;
        if ((mask === W_ARMU && category !== ARM_SHIRT)
            || (mask === W_ARMC && category !== ARM_CLOAK)
            || (mask === W_ARMH && category !== ARM_HELM)
            || (mask === W_ARMS && category !== ARM_SHIELD)
            || (mask === W_ARMG && category !== ARM_GLOVES)
            || (mask === W_ARMF && category !== ARM_BOOTS)
            || (mask === W_ARM && category !== ARM_SUIT)) continue;
        if (mask === W_ARMC && monster.data.msize > MZ_MEDIUM
            && obj.otyp !== MUMMY_WRAPPING) continue;
        if (mask === W_ARMC && monster.minvis
            && obj.otyp === MUMMY_WRAPPING
            && !monsterHeroProperty(state, SEE_INVIS) && !env.creation) continue;
        if (mask === W_ARMH && obj.otyp === HELM_OF_OPPOSITE_ALIGNMENT
            && (monster.ispriest || monster.isminion)) continue;
        if (mask === W_ARMH && has_horns(monster.data)
            && !is_flimsy(obj, state)) continue;
        if (mask === W_ARM && racialException
            && racial_exception(monster, obj, state) < 1) continue;
        if (obj.owornmask) continue;
        if (best && ARM_BONUS(best, state) + extra_pref(monster, best)
            >= ARM_BONUS(obj, state) + extra_pref(monster, obj)) continue;
        best = obj;
    }
    return { old, best };
}

async function applyMonsterArmorRuntime(
    monster,
    mask,
    old,
    best,
    env,
    sourceName,
) {
    const { state } = env;
    const silent = Boolean(env.silent);
    let delay = 0;
    const autocurse = (best.otyp === HELM_OF_OPPOSITE_ALIGNMENT
        || best.otyp === DUNCE_CAP) && !best.cursed;
    if ((mask === W_ARM || mask === W_ARMU)
        && (monster.misc_worn_check & W_ARMC)) delay += 2;
    let oldMask = 0;
    if (old) {
        delay += Math.trunc(state.objects[old.otyp].oc_delay ?? 0);
        oldMask = old.owornmask;
        old.owornmask = 0;
    }
    const sawMonster = canseemon(monster, state);
    const sawLocation = cansee(monster.mx, monster.my, state);
    let oldName = '';
    let newName = '';
    if (sawMonster) {
        oldName = old ? distant_name(old, donameFresh, state) : '';
        newName = distant_name(best, donameFresh, state);
        if (newName.toLowerCase() === oldName.toLowerCase()) {
            if (strncmpi(newName, 'a ', 2) === 0)
                newName = strsubst(newName, 'a ', 'another ');
            else if (strncmpi(newName, 'an ', 3) === 0)
                newName = strsubst(newName, 'an ', 'another ');
        }
        if (!silent) {
            const subject = Monnam(monster, state, env);
            const message = env.message ?? ttyPline;
            const text = old
                ? `${subject} removes ${oldName} and puts on ${newName}.`
                : `${subject} puts on ${newName}.`;
            await message(messageAt(text, monster.mx, monster.my, state), state);
            if (autocurse) {
                // C calls Monnam() again for this plain pline(), which can
                // consume another hallucinated-name draw.
                const curseSubject = Monnam(monster, state, env);
                await message(
                    `${s_suffix(curseSubject)} ${simpleonames(best, state)} `
                    + `${otense(best, 'glow')} ${hcolor('black', state, env)} for a moment.`,
                    state,
                );
            }
        }
    }
    delay += Math.trunc(state.objects[best.otyp].oc_delay ?? 0);
    monster.mfrozen = delay;
    if (monster.mfrozen) monster.mcanmove = false;
    if (old) {
        await update_mon_extrinsics(monster, old, false, {
            ...env, state, silent,
        });
        old.owornmask = oldMask;
        if (old.lamplit && artifact_light(old)) {
            end_burn(old, false, objectGenerationEnv({ ...env, state }));
        }
        old.owornmask = 0;
    }
    monster.misc_worn_check = (monster.misc_worn_check ?? 0) | mask;
    best.owornmask |= mask;
    if (autocurse) curse(best, { state });
    if (artifact_light(best) && !best.lamplit) {
        begin_burn(best, false, { ...env, state });
        vision_recalc(1, {
            ...env,
            state,
            redraw: env.redraw ?? (() => {}),
        });
        if (!silent && best.lamplit && cansee(monster.mx, monster.my, state)) {
            const adesc = arti_light_description(best, state);
            const message = env.message ?? ttyPline;
            if (sawMonster) {
                await message(
                    `${Yname2(best, state)} ${otense(best, 'begin')} to shine ${adesc}.`,
                    state,
                );
            } else if (canseemon(monster, state)) {
                await message(
                    `${Yname2(best, state)} ${otense(best, 'are')} shining ${adesc}.`,
                    state,
                );
            } else if (sawLocation) {
                await message(
                    `Something begins to shine ${adesc}.`,
                    state,
                );
            } else {
                await message(
                    `Something is shining ${adesc}.`,
                    state,
                );
            }
        }
    }
    await update_mon_extrinsics(monster, best, true, {
        ...env, state, silent,
    });
    if (!silent && sawMonster !== canseemon(monster, state)) {
        if (monster.minvis && !monsterHeroProperty(state, SEE_INVIS)) {
            const message = env.message ?? ttyPline;
            await message(`Suddenly you cannot see ${sourceName}.`, state);
            discover_object(best.otyp, true, true, true, state, env);
        }
    }
}

function m_dowear_type(
    monster,
    mask,
    creation,
    env,
    racialException = false,
) {
    if (monster.mfrozen) return undefined;
    const runtime = !creation;
    const sourceName = monsterHeroProperty(env.state, SEE_INVIS)
        ? Monnam(monster, env.state, env)
        : mon_nam(monster, env.state, env);
    const selected = selectMonsterArmor(monster, mask, {
        ...env, creation,
    }, racialException);
    if (!selected.best || selected.best === selected.old) return undefined;
    if (runtime)
        return applyMonsterArmorRuntime(
            monster, mask, selected.old, selected.best, env, sourceName,
        );
    const { old, best } = selected;
    const oldMask = old?.owornmask ?? 0;
    if (old) {
        old.owornmask = 0;
        update_mon_extrinsics(monster, old, false, {
            ...env, state: env.state, silent: true,
        });
        // C restores owornmask before end_burn(), since artifact_light()
        // reads it, then clears the mask again.  This applies to creation and
        // planning too; objectGenerationEnv supplies the canonical light
        // deletion hook for both live and cloned states.
        old.owornmask = oldMask;
        if (old.lamplit && artifact_light(old)) {
            end_burn(old, false, objectGenerationEnv({
                ...env, state: env.state,
            }));
        }
        old.owornmask = 0;
    }
    monster.misc_worn_check = (monster.misc_worn_check ?? 0) | mask;
    best.owornmask |= mask;
    if ((best.otyp === HELM_OF_OPPOSITE_ALIGNMENT || best.otyp === DUNCE_CAP)
        && !best.cursed) {
        best.cursed = true;
        best.blessed = false;
    }
    if (artifact_light(best) && !best.lamplit) {
        begin_burn(best, false, { ...env, state: env.state });
        vision_recalc(1, {
            ...env,
            state: env.state,
            redraw: env.redraw ?? (() => {}),
        });
    }
    update_mon_extrinsics(monster, best, true, {
        ...env, state: env.state, silent: true,
    });
    return undefined;
}

export function m_dowear(monster, creation = false, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = {
        ...rawEnv,
        state,
        creation,
        silent: rawEnv.silent ?? Boolean(creation || rawEnv.planning),
    };
    const species = monster.data;
    const flags = species.mflags1 ?? 0;
    if (species.msize < MZ_SMALL || (flags & (M1_NOHANDS | M1_ANIMAL)))
        return monster;
    if ((flags & M1_MINDLESS)
        && (!creation || (species.mlet !== S_MUMMY
            && species.pmidx !== PM_SKELETON))) return monster;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.where !== OBJ_MINVENT || obj.ocarry !== monster)
            throw new Error('m_dowear found invalid monster inventory ownership');
    }
    const canWearArmor = !cantweararm(species);
    const calls = [
        [W_AMUL, false],
        ...(canWearArmor && !(monster.misc_worn_check & W_ARM)
            ? [[W_ARMU, false]] : []),
        ...(canWearArmor || WrappingAllowed(species) ? [[W_ARMC, false]] : []),
        [W_ARMH, false],
        ...(!monster.mw || !objectType(monster.mw, state).oc_bimanual
            ? [[W_ARMS, false]] : []),
        [W_ARMG, false],
        ...(!(flags & M1_SLITHY) && species.mlet !== S_CENTAUR
            ? [[W_ARMF, false]] : []),
        [W_ARM, !canWearArmor],
    ];
    if (!creation) {
        return (async () => {
            for (const [mask, racial] of calls)
                await m_dowear_type(monster, mask, creation, env, racial);
            return monster;
        })();
    }
    for (const [mask, racial] of calls)
        m_dowear_type(monster, mask, creation, env, racial);
    return monster;
}

// C ref: worn.c extract_from_minvent() (1376-1416). Take obj out of a
// monster's inventory and undo whatever equipped state it still carries.
// `do_extrinsics` selects update_mon_extrinsics(); `silently` is only that
// call's message flag, which is why steal.c mdrop_obj() can pass FALSE for the
// first and TRUE for the second and defer the extrinsics to after the drop.
export async function extract_from_minvent(
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
    if ((unwornmask & W_ARM) !== 0 && obj.lamplit && artifact_light(obj)) {
        const endArtifactLight = normalized.hooks.endArtifactLight;
        if (endArtifactLight !== undefined) {
            await requiredHook(normalized, 'endArtifactLight', obj)(
                obj,
                normalized,
            );
        } else {
            // C runs end_burn(FALSE) while owornmask still contains W_ARM;
            // retain that ordering for live and planning monster inventories.
            end_burn(obj, false, objectGenerationEnv(normalized));
        }
    }

    obj_extract_self(obj, normalized);
    obj.owornmask = 0;
    let updateResult;
    if (unwornmask) {
        if (!(mon.mhp < 1) /* !DEADMONSTER() */ && do_extrinsics) {
            const update = normalized.hooks.updateMonExtrinsics
                ?? ((target, item, on, silent, actionEnv) =>
                    update_mon_extrinsics(target, item, on, {
                        ...actionEnv,
                        state: normalized.state,
                        silent,
                    }));
            updateResult = update(
                mon,
                obj,
                false,
                silently,
                normalized,
            );
        }
    }
    const finish = async () => {
        if (unwornmask) {
            mon.misc_worn_check &= ~unwornmask;
            // give monster a chance to wear other equipment on its next move
            check_gear_next_turn(mon);
        }
        obj_no_longer_held(obj, normalized);
        if (unwornmask & W_WEP) {
            const mwepgoneHook = normalized.hooks.mwepgone;
            if (mwepgoneHook !== undefined) {
                await requiredHook(normalized, 'mwepgone', obj)(mon, normalized);
            } else {
                // mwepgone() is a used-return asynchronous source owner here:
                // its setmnotwielded light cleanup must finish before callers
                // can free or merge this object.
                const { mwepgone } = await import('./weapon.js');
                await mwepgone(mon, normalized);
            }
        }
    };
    if (updateResult?.then)
        return updateResult.then(finish);
    return finish();
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
