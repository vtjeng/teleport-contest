// weapon.js -- Monster weapon selection and wield state.
// C refs: weapon.c oselect(), select_hwep(), mon_wield_item(),
// setmnotwielded(); wield.c mwelded().

import { ART_SUNSWORD } from './artifacts.js';
import {
    NEED_AXE,
    NEED_HTH_WEAPON,
    NEED_PICK_AXE,
    NEED_PICK_OR_AXE,
    NEED_RANGED_WEAPON,
    NEED_WEAPON,
    NO_WEAPON_WANTED,
    W_ARM,
    W_ARMG,
    W_ARMS,
    W_WEP,
} from './const.js';
import { game } from './gstate.js';
import { m_carrying } from './mon.js';
import {
    is_covetous,
    is_giant,
    is_rider,
    mon_hates_silver,
    strongmonst,
} from './mondata.js';
import {
    PM_BALROG,
    PM_CHICKATRICE,
    PM_COCKATRICE,
} from './monsters.js';
import { isWeptool, objectType } from './obj.js';
import {
    AKLYS,
    ATHAME,
    AXE,
    BATTLE_AXE,
    BELL_OF_OPENING,
    BROADSWORD,
    BULLWHIP,
    CLUB,
    CORPSE,
    CRYSKNIFE,
    DAGGER,
    DWARVISH_MATTOCK,
    DWARVISH_SHORT_SWORD,
    DWARVISH_SPEAR,
    ELVEN_BROADSWORD,
    ELVEN_DAGGER,
    ELVEN_SHORT_SWORD,
    ELVEN_SPEAR,
    FLAIL,
    GOLD_DRAGON_SCALE_MAIL,
    GOLD_DRAGON_SCALES,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    JAVELIN,
    KATANA,
    KNIFE,
    LONG_SWORD,
    MACE,
    MORNING_STAR,
    ORCISH_DAGGER,
    ORCISH_SHORT_SWORD,
    ORCISH_SPEAR,
    PICK_AXE,
    QUARTERSTAFF,
    RUBBER_HOSE,
    RUNESWORD,
    SCALPEL,
    SCIMITAR,
    SHORT_SWORD,
    SILVER,
    SILVER_DAGGER,
    SILVER_MACE,
    SILVER_SABER,
    SILVER_SPEAR,
    SPEAR,
    TIN_OPENER,
    TRIDENT,
    TSURUGI,
    TWO_HANDED_SWORD,
    UNICORN_HORN,
    WAR_HAMMER,
    WEAPON_CLASS,
    WORM_TOOTH,
} from './objects.js';

const MR_STONE = 0x80;

// Source preference order is observable and independent of inventory order.
const HAND_TO_HAND_WEAPONS = Object.freeze([
    CORPSE,
    TSURUGI,
    RUNESWORD,
    DWARVISH_MATTOCK,
    TWO_HANDED_SWORD,
    BATTLE_AXE,
    KATANA,
    UNICORN_HORN,
    CRYSKNIFE,
    TRIDENT,
    LONG_SWORD,
    ELVEN_BROADSWORD,
    BROADSWORD,
    SCIMITAR,
    SILVER_SABER,
    MORNING_STAR,
    ELVEN_SHORT_SWORD,
    DWARVISH_SHORT_SWORD,
    SHORT_SWORD,
    ORCISH_SHORT_SWORD,
    SILVER_MACE,
    MACE,
    AXE,
    DWARVISH_SPEAR,
    SILVER_SPEAR,
    ELVEN_SPEAR,
    SPEAR,
    ORCISH_SPEAR,
    FLAIL,
    BULLWHIP,
    QUARTERSTAFF,
    JAVELIN,
    AKLYS,
    CLUB,
    PICK_AXE,
    RUBBER_HOSE,
    WAR_HAMMER,
    SILVER_DAGGER,
    ELVEN_DAGGER,
    DAGGER,
    ORCISH_DAGGER,
    ATHAME,
    SCALPEL,
    KNIFE,
    WORM_TOOTH,
]);

function weaponEnv(env = {}) {
    return { ...env, state: env.state ?? game };
}

function requiredOperation(env, name, owner) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`${owner} requires a ${name} operation`);
    return operation;
}

function isSpecies(monster, pmidx, state) {
    return monster.data === state.mons?.[pmidx]
        || monster.data?.pmidx === pmidx
        || monster.mnum === pmidx;
}

function touchPetrifies(species) {
    return species?.pmidx === PM_COCKATRICE
        || species?.pmidx === PM_CHICKATRICE;
}

function resistsStoning(monster) {
    const resistanceBits = (monster.data?.mresists ?? 0)
        | (monster.mextrinsics ?? 0)
        | (monster.mintrinsics ?? 0);
    return Boolean(resistanceBits & MR_STONE);
}

function artifactTouchable(obj, monster, env) {
    if (!obj.oartifact) return true;
    const touchArtifact = requiredOperation(
        env,
        'touchArtifact',
        'artifact weapon selection',
    );
    return Boolean(touchArtifact(obj, monster, env));
}

// C ref: worn.c which_armor().
export function which_armor(monster, mask) {
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.owornmask & mask) return obj;
    }
    return null;
}

// C ref: mon.c can_touch_safely(). Artifact acceptance remains with
// artifact.c's complete touchArtifact owner; ordinary objects need no hook.
export function can_touch_safely(monster, obj, env = {}) {
    const normalized = weaponEnv(env);
    const corpseSpecies = obj.otyp === CORPSE
        ? normalized.state.mons?.[obj.corpsenm]
        : null;

    if (corpseSpecies && touchPetrifies(corpseSpecies)
        && !(monster.misc_worn_check & W_ARMG)
        && !resistsStoning(monster)) {
        return false;
    }
    if (corpseSpecies && is_rider(corpseSpecies)) return false;
    if (objectType(obj, normalized.state).oc_material === SILVER
        && mon_hates_silver(monster)
        && (obj.otyp !== BELL_OF_OPENING
            || !is_covetous(monster.data))) {
        return false;
    }
    return artifactTouchable(obj, monster, normalized);
}

// C ref: weapon.c oselect().
function selectObject(monster, type, env) {
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp !== type) continue;
        if (type === CORPSE) {
            const species = env.state.mons?.[obj.corpsenm];
            if (!species || !touchPetrifies(species)) continue;
        }
        if (!can_touch_safely(monster, obj, env)) continue;
        return obj;
    }
    return null;
}

// C ref: weapon.c select_hwep().
export function select_hwep(monster, env = {}) {
    const normalized = weaponEnv(env);
    const state = normalized.state;
    const strong = strongmonst(monster.data);
    const wearingShield = Boolean(monster.misc_worn_check & W_ARMS);

    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.oclass === WEAPON_CLASS && obj.oartifact
            && artifactTouchable(obj, monster, normalized)
            && ((strong && !wearingShield)
                || !objectType(obj, state).oc_bimanual)) {
            return obj;
        }
    }

    if (is_giant(monster.data)) {
        const club = selectObject(monster, CLUB, normalized);
        if (club) return club;
    } else if (isSpecies(monster, PM_BALROG, state) && state.uwep) {
        const whip = selectObject(monster, BULLWHIP, normalized);
        if (whip) return whip;
    }

    for (const type of HAND_TO_HAND_WEAPONS) {
        if (type === CORPSE
            && !(monster.misc_worn_check & W_ARMG)
            && !resistsStoning(monster)) {
            continue;
        }
        const objectData = objectType(type, state);
        if (((strong && !wearingShield) || !objectData.oc_bimanual)
            && (objectData.oc_material !== SILVER
                || !mon_hates_silver(monster))) {
            const obj = selectObject(monster, type, normalized);
            if (obj) return obj;
        }
    }
    return null;
}

function artifactLight(obj) {
    return ((obj?.otyp === GOLD_DRAGON_SCALE_MAIL
             || obj?.otyp === GOLD_DRAGON_SCALES)
            && Boolean(obj.owornmask & W_ARM))
        || obj?.oartifact === ART_SUNSWORD;
}

function willWeld(obj, state) {
    const erodeableWeapon = obj.oclass === WEAPON_CLASS
        || isWeptool(obj, state)
        || obj.otyp === HEAVY_IRON_BALL
        || obj.otyp === IRON_CHAIN;
    return Boolean(obj.cursed
        && (erodeableWeapon || obj.otyp === TIN_OPENER));
}

// C ref: wield.c mwelded().
export function mwelded(obj, state = game) {
    return Boolean(obj && (obj.owornmask & W_WEP) && willWeld(obj, state));
}

async function clearMonsterWeapon(
    monster,
    obj,
    normalized,
    preflightEndArtifactLight,
) {
    if (!obj) return;
    if (artifactLight(obj) && obj.lamplit) {
        const endArtifactLight = preflightEndArtifactLight
            ?? requiredOperation(
                normalized,
                'endArtifactLight',
                'setmnotwielded',
            );
        await endArtifactLight(monster, obj, normalized);
    }
    if (monster.mw === obj) monster.mw = null;
    obj.owornmask &= ~W_WEP;
}

// C ref: weapon.c setmnotwielded(). The artifact-light operation owns
// end_burn(FALSE) and its visibility-dependent message.
export async function setmnotwielded(monster, obj, env = {}) {
    return clearMonsterWeapon(monster, obj, weaponEnv(env));
}

function selectToolWeapon(monster, weaponCheck, state) {
    switch (weaponCheck) {
    case NEED_PICK_AXE:
        return m_carrying(monster, PICK_AXE, state)
            || (!which_armor(monster, W_ARMS)
                ? m_carrying(monster, DWARVISH_MATTOCK, state)
                : null);
    case NEED_AXE: {
        const battleAxe = m_carrying(monster, BATTLE_AXE, state);
        return battleAxe && !which_armor(monster, W_ARMS)
            ? battleAxe
            : m_carrying(monster, AXE, state);
    }
    case NEED_PICK_OR_AXE: {
        let obj = m_carrying(monster, DWARVISH_MATTOCK, state)
            || m_carrying(monster, BATTLE_AXE, state);
        if (!obj || which_armor(monster, W_ARMS)) {
            obj = m_carrying(monster, PICK_AXE, state)
                || m_carrying(monster, AXE, state);
        }
        return obj;
    }
    default:
        return null;
    }
}

// C ref: weapon.c mon_wield_item(). Ranged selection and presentation remain
// explicit downstream owners; this function owns selection order and every
// monster/object state transition.
export async function mon_wield_item(monster, env = {}) {
    const normalized = weaponEnv(env);
    const state = normalized.state;
    const weaponCheck = monster.weapon_check;
    if (weaponCheck === NO_WEAPON_WANTED) return 0;

    let obj;
    let exclaim = true;
    if (weaponCheck === NEED_HTH_WEAPON) {
        obj = select_hwep(monster, normalized);
    } else if (weaponCheck === NEED_RANGED_WEAPON) {
        const selectRangedWeapon = requiredOperation(
            normalized,
            'selectRangedWeapon',
            'mon_wield_item',
        );
        obj = await selectRangedWeapon(monster, normalized);
    } else if (weaponCheck === NEED_PICK_AXE
        || weaponCheck === NEED_AXE
        || weaponCheck === NEED_PICK_OR_AXE) {
        obj = selectToolWeapon(monster, weaponCheck, state);
        exclaim = false;
    } else {
        throw new RangeError(`unsupported monster weapon_check ${weaponCheck}`);
    }

    if (obj && obj !== normalized.handsObject) {
        const current = monster.mw;
        if (current && current.otyp === obj.otyp) {
            monster.weapon_check = NEED_WEAPON;
            return 0;
        }

        if (current && mwelded(current, state)) {
            const canSeeMonster = requiredOperation(
                normalized,
                'canSeeMonster',
                'mon_wield_item',
            );
            if (canSeeMonster(monster, normalized)) {
                const weldedMessage = requiredOperation(
                    normalized,
                    'weldedMessage',
                    'mon_wield_item',
                );
                await weldedMessage(monster, current, obj, normalized);
                current.bknown = true;
            }
            monster.weapon_check = NO_WEAPON_WANTED;
            return 1;
        }

        // Resolve every operation before the first mutation. In particular,
        // the old-light hook is deliberately preflighted here and invoked by
        // clearMonsterWeapon() after the new weapon has been assigned.
        const transition = {
            canSeeMonster: requiredOperation(
                normalized,
                'canSeeMonster',
                'mon_wield_item',
            ),
            wieldMessage: requiredOperation(
                normalized,
                'wieldMessage',
                'mon_wield_item',
            ),
            endArtifactLight: current
                && artifactLight(current) && current.lamplit
                ? requiredOperation(
                    normalized,
                    'endArtifactLight',
                    'mon_wield_item',
                )
                : null,
        };
        const startsArtifactLight = artifactLight(obj) && !obj.lamplit;
        transition.startArtifactLight = startsArtifactLight
            ? requiredOperation(
                normalized,
                'startArtifactLight',
                'mon_wield_item',
            )
            : null;

        monster.mw = obj;
        await clearMonsterWeapon(
            monster,
            current,
            normalized,
            transition.endArtifactLight,
        );
        monster.weapon_check = NEED_WEAPON;
        if (transition.canSeeMonster(monster, normalized)) {
            const newlyWelded = willWeld(obj, state);
            await transition.wieldMessage(
                monster,
                obj,
                { exclaim, newlyWelded },
                normalized,
            );
            if (newlyWelded) obj.bknown = true;
        }
        if (transition.startArtifactLight) {
            await transition.startArtifactLight(monster, obj, normalized);
        }
        obj.owornmask = W_WEP;
        return 1;
    }

    monster.weapon_check = NEED_WEAPON;
    return 0;
}

export const _weaponInternals = Object.freeze({
    HAND_TO_HAND_WEAPONS,
    artifactLight,
    resistsStoning,
    willWeld,
});
