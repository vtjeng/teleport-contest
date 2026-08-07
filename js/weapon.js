// weapon.js -- Monster weapon selection and wield state.
// C refs: weapon.c oselect(), select_rwep(), select_hwep(), mon_wield_item(),
// setmnotwielded().

import {
    ART_SNICKERSNEE,
    ART_SUNSWORD,
    artifactTouchable,
} from './artifacts.js';
import { effective_attribute } from './attrib.js';
import {
    AKLYS_LIM,
    A_DEX,
    A_STR,
    NEED_AXE,
    NEED_HTH_WEAPON,
    NEED_PICK_AXE,
    NEED_PICK_OR_AXE,
    NEED_RANGED_WEAPON,
    NEED_WEAPON,
    NO_WEAPON_WANTED,
    P_BASIC,
    P_BARE_HANDED_COMBAT,
    P_BOW,
    P_CROSSBOW,
    P_EXPERT,
    P_FLAIL,
    P_GRAND_MASTER,
    P_ISRESTRICTED,
    P_LAST_WEAPON,
    P_MASTER,
    P_NONE,
    P_NUM_SKILLS,
    P_PICK_AXE,
    P_RIDING,
    P_SKILLED,
    P_SKILL_LIMIT,
    P_SLING,
    P_TWO_WEAPON_COMBAT,
    P_UNSKILLED,
    STR18,
    W_ARM,
    W_ARMG,
    W_ARMS,
    W_WEP,
} from './const.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { m_carrying } from './mon.js';
import {
    is_animal,
    is_covetous,
    is_giant,
    is_rider,
    is_swimmer,
    likes_gems,
    mindless,
    mon_hates_blessings,
    mon_hates_silver,
    passes_walls,
    strongmonst,
    thick_skinned,
    throws_rocks,
} from './mondata.js';
import {
    PM_BALROG,
    PM_CHICKATRICE,
    PM_COCKATRICE,
    PM_MONK,
    PM_SAMURAI,
    S_DRAGON,
    S_EEL,
    S_GIANT,
    S_JABBERWOCK,
    S_KOP,
    S_NAGA,
    S_SNAKE,
    S_XORN,
} from './monsters.js';
import {
    is_ammo,
    is_graystone,
    is_pick,
    is_spear,
    isWeptool,
    objectType,
} from './obj.js';
import {
    AKLYS,
    ARROW,
    ATHAME,
    AXE,
    BARDICHE,
    BATTLE_AXE,
    BEC_DE_CORBIN,
    BELL_OF_OPENING,
    BILL_GUISARME,
    BOOMERANG,
    BOULDER,
    BOW,
    BROADSWORD,
    BULLWHIP,
    CLUB,
    CORPSE,
    CREAM_PIE,
    CROSSBOW,
    CROSSBOW_BOLT,
    CRYSKNIFE,
    DAGGER,
    DART,
    DWARVISH_MATTOCK,
    DWARVISH_SHORT_SWORD,
    DWARVISH_SPEAR,
    EGG,
    ELVEN_ARROW,
    ELVEN_BROADSWORD,
    ELVEN_BOW,
    ELVEN_DAGGER,
    ELVEN_SHORT_SWORD,
    ELVEN_SPEAR,
    FAUCHARD,
    FLAIL,
    FLINT,
    GEM_CLASS,
    GLAIVE,
    GOLD_DRAGON_SCALE_MAIL,
    GOLD_DRAGON_SCALES,
    GRAPPLING_HOOK,
    GUISARME,
    HALBERD,
    JAVELIN,
    KATANA,
    KNIFE,
    LANCE,
    LONG_SWORD,
    LOADSTONE,
    LUCKSTONE,
    LUCERN_HAMMER,
    MACE,
    MORNING_STAR,
    ORCISH_DAGGER,
    ORCISH_ARROW,
    ORCISH_BOW,
    ORCISH_SHORT_SWORD,
    ORCISH_SPEAR,
    PARTISAN,
    PICK_AXE,
    QUARTERSTAFF,
    RANSEUR,
    ROCK,
    RUBBER_HOSE,
    RUNESWORD,
    SCALPEL,
    SCIMITAR,
    SHURIKEN,
    SHORT_SWORD,
    SILVER,
    SILVER_ARROW,
    SILVER_DAGGER,
    SILVER_MACE,
    SILVER_SABER,
    SILVER_SPEAR,
    OBJ_NAME,
    SLING,
    SPEAR,
    SPETUM,
    STATUE,
    TIN,
    TIN_OPENER,
    TOWEL,
    TRIDENT,
    TSURUGI,
    TWO_HANDED_SWORD,
    UNICORN_HORN,
    VOULGE,
    WAR_HAMMER,
    WEAPON_CLASS,
    WORM_TOOTH,
    YA,
    YUMI,
} from './objects.js';
import { makesingular } from './fruit.js';
import {
    P_ADVANCE,
    P_MAX_SKILL,
    P_SKILL,
    practice_needed_to_advance,
    weapon_type,
} from './startup_skills.js';
import { is_pool } from './trap.js';
import { couldsee } from './vision.js';
import { mwelded, will_weld } from './wield.js';
import { which_armor } from './worn.js';

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

const RANGED_WEAPONS = Object.freeze([
    DWARVISH_SPEAR,
    SILVER_SPEAR,
    ELVEN_SPEAR,
    SPEAR,
    ORCISH_SPEAR,
    JAVELIN,
    SHURIKEN,
    YA,
    SILVER_ARROW,
    ELVEN_ARROW,
    ARROW,
    ORCISH_ARROW,
    CROSSBOW_BOLT,
    SILVER_DAGGER,
    ELVEN_DAGGER,
    DAGGER,
    ORCISH_DAGGER,
    KNIFE,
    FLINT,
    ROCK,
    LOADSTONE,
    LUCKSTONE,
    DART,
    CREAM_PIE,
]);

const POLEARMS = Object.freeze([
    HALBERD,
    BARDICHE,
    SPETUM,
    BILL_GUISARME,
    VOULGE,
    RANSEUR,
    GUISARME,
    GLAIVE,
    LUCERN_HAMMER,
    BEC_DE_CORBIN,
    FAUCHARD,
    PARTISAN,
    LANCE,
]);

// C ref: weapon.c kebabable[] (70-73), the monster classes a spear gets a
// to-hit bonus against. C stores it as a NUL-terminated string and reads it
// with strchr(); an array membership test is the same question without the
// terminator, which strchr() would match against an mlet of 0. Only the
// pmidx -1 sentinel that closes monsters.h carries that class, and no live
// monster's data points at it.
const kebabable = Object.freeze([
    S_XORN, S_DRAGON, S_JABBERWOCK, S_NAGA, S_GIANT,
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

// C ref: weapon.c hitval() (148-187). The "to hit" bonus a wielded object
// gives against one target. Pure: it reads objects[], the object and the
// target and nothing else.
//
// The artifact arm (weapon.c:184-185) needs artifact.c spec_abon(), which has
// no port, so an artifact weapon stops here rather than silently losing its
// bonus. Every other arm is complete.
export function hitval(otmp, mon, state = game, env = {}) {
    let tmp = 0;
    const ptr = mon.data;
    const objectData = objectType(otmp, state);
    const isWeapon = otmp.oclass === WEAPON_CLASS || isWeptool(otmp, state);

    if (isWeapon) tmp += otmp.spe;

    /* Put weapon-specific "to hit" bonuses in below: */
    tmp += objectData.oc_hitbon;

    /* Blessed weapons used against undead or demons */
    if (isWeapon && otmp.blessed && mon_hates_blessings(mon)) tmp += 2;

    if (is_spear(otmp, state) && kebabable.includes(ptr.mlet)) tmp += 2;

    /* trident is highly effective against swimmers */
    if (otmp.otyp === TRIDENT && is_swimmer(ptr)) {
        if (is_pool(mon.mx, mon.my, state)) tmp += 4;
        else if (ptr.mlet === S_EEL || ptr.mlet === S_SNAKE) tmp += 2;
    }

    /* Picks used against xorns and earth elementals */
    if (is_pick(otmp, state) && passes_walls(ptr) && thick_skinned(ptr))
        tmp += 2;

    if (otmp.oartifact) {
        requiredOperation(env, 'unsupported', 'hitval')(
            'artifact to-hit bonus',
        );
    }
    return tmp;
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
        if (type === CORPSE || type === EGG) {
            const species = env.state.mons?.[obj.corpsenm];
            if (!species || !touchPetrifies(species)) continue;
        }
        if (!can_touch_safely(monster, obj, env)) continue;
        return obj;
    }
    return null;
}

function launcherFor(monster, skill, env) {
    switch (skill) {
    case P_BOW:
        return selectObject(monster, YUMI, env)
            || selectObject(monster, ELVEN_BOW, env)
            || selectObject(monster, BOW, env)
            || selectObject(monster, ORCISH_BOW, env);
    case P_SLING:
        return selectObject(monster, SLING, env);
    case P_CROSSBOW:
        return selectObject(monster, CROSSBOW, env);
    default:
        return null;
    }
}

// C ref: weapon.c select_rwep(). The C propellor global is deliberately not
// copied here: current callers only need the selected object, and launcher
// choice remains a local prerequisite of that selection.
export function select_rwep(monster, env = {}) {
    const normalized = weaponEnv(env);
    const state = normalized.state;
    const canSeeSquare = normalized.couldSee ?? couldsee;
    let selected = selectObject(monster, EGG, normalized);
    if (selected) return selected;
    if (monster.data?.mlet === S_KOP) {
        selected = selectObject(monster, CREAM_PIE, normalized);
        if (selected) return selected;
    }
    if (throws_rocks(monster.data)) {
        selected = selectObject(monster, BOULDER, normalized);
        if (selected) return selected;
    }

    const current = monster.mw;
    const wieldedOnly = mwelded(current, state)
        && monster.weapon_check === NO_WEAPON_WANTED;
    const seesHeroLine = () => canSeeSquare(
        monster.mx,
        monster.my,
        state,
    );
    if (dist2(
        monster.mx,
        monster.my,
        monster.mux,
        monster.muy,
    ) <= 13 && seesHeroLine()) {
        if (current?.oartifact === ART_SNICKERSNEE) return current;
        const strong = strongmonst(monster.data);
        const wearingShield = Boolean(monster.misc_worn_check & W_ARMS);
        for (const type of POLEARMS) {
            const objectData = objectType(type, state);
            if (!((strong && !wearingShield) || !objectData.oc_bimanual)
                || (objectData.oc_material === SILVER
                    && mon_hates_silver(monster))) {
                continue;
            }
            selected = selectObject(monster, type, normalized);
            if (selected && (selected === current || !wieldedOnly))
                return selected;
        }
    }

    if (!mindless(monster.data)
        && !is_animal(monster.data)
        && !wieldedOnly
        && dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        ) <= AKLYS_LIM * AKLYS_LIM
        && seesHeroLine()) {
        const aklysData = objectType(AKLYS, state);
        if (!(monster.misc_worn_check & W_ARMS)
            || !aklysData.oc_bimanual) {
            if (aklysData.oc_material !== SILVER
                || !mon_hates_silver(monster)) {
                selected = selectObject(monster, AKLYS, normalized);
                if (selected && (selected === current || !wieldedOnly))
                    return selected;
            }
        }
    }

    for (const type of RANGED_WEAPONS) {
        if (type === DART
            && !likes_gems(monster.data)
            && m_carrying(monster, SLING, state)) {
            for (let obj = monster.minvent; obj; obj = obj.nobj) {
                if (obj.oclass === GEM_CLASS
                    && (obj.otyp !== LOADSTONE || !obj.cursed)) {
                    return obj;
                }
            }
        }

        const skill = objectType(type, state).oc_skill;
        let launcher = skill < 0
            ? launcherFor(monster, -skill, normalized)
            : true;
        if (skill < 0
            && current
            && mwelded(current, state)
            && current !== launcher
            && monster.weapon_check === NO_WEAPON_WANTED) {
            launcher = null;
        }
        if (!launcher) continue;

        if (type === LOADSTONE) {
            for (let obj = monster.minvent; obj; obj = obj.nobj) {
                if (obj.otyp === LOADSTONE && !obj.cursed) return obj;
            }
            continue;
        }
        selected = selectObject(monster, type, normalized);
        if (selected
            && !selected.oartifact
            && !(selected === current && mwelded(selected, state))) {
            return selected;
        }
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

// C ref: weapon.c abon() (949-987), the hero's Strength and Dexterity attack
// bonus. C's Upolyd arm returns adj_lev(&mons[u.umonnum]) - 3; polyself is
// unported, so Upolyd() is constantly false (js/regen.js:52 records the same
// fact) and that arm is left out rather than restated.
//
// ACURR(A_STR) is the 3..125 encoding, which is what STR18() indexes, so this
// reads effective_attribute() rather than acurrstr().
export function abon(state = game) {
    const str = effective_attribute(state, A_STR);
    const dex = effective_attribute(state, A_DEX);
    let sbon;

    if (str < 6) sbon = -2;
    else if (str < 8) sbon = -1;
    else if (str < 17) sbon = 0;
    else if (str < STR18(50)) sbon = 1; /* up to 18/49 */
    else if (str < STR18(100)) sbon = 2;
    else sbon = 3;

    /* Game tuning kludge: make it a bit easier for a low level character
     * to hit */
    sbon += (state.u.ulevel < 3) ? 1 : 0;

    if (dex < 4) return sbon - 3;
    if (dex < 6) return sbon - 2;
    if (dex < 8) return sbon - 1;
    if (dex < 14) return sbon;
    return sbon + dex - 14;
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
        // weapon.c mon_wield_item() evaluates canseemon() here, after
        // setmnotwielded() has already run end_burn() on the old weapon, so a
        // monster lit only by that artifact is unseen by this test. Resolving
        // wieldMessage inside the branch keeps the operation optional for an
        // unseen monster, which C never prints for, and matches the welded
        // branch above. The preflight above still resolves every operation
        // this path can reach before the first mutation.
        if (transition.canSeeMonster(monster, normalized)) {
            const wieldMessage = requiredOperation(
                normalized,
                'wieldMessage',
                'mon_wield_item',
            );
            const newlyWelded = will_weld(obj, state);
            await wieldMessage(
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

// C ref: weapon.c's PN_* pseudo-indices. skill_names_indices[] stores an
// object type for a skill named after a representative item and one of these
// negative codes for every other skill.
const PN_BARE_HANDED = -1;
const PN_TWO_WEAPONS = -2;
const PN_RIDING = -3;
const PN_POLEARMS = -4;
const PN_SABER = -5;
const PN_HAMMER = -6;
const PN_WHIP = -7;
const PN_ATTACK_SPELL = -8;
const PN_HEALING_SPELL = -9;
const PN_DIVINATION_SPELL = -10;
const PN_ENCHANTMENT_SPELL = -11;
const PN_CLERIC_SPELL = -12;
const PN_ESCAPE_SPELL = -13;
const PN_MATTER_SPELL = -14;

// C ref: weapon.c skill_names_indices[], indexed by skill and listed in the
// same order as the p_skills enum.
const skill_names_indices = Object.freeze([
    /* Weapon */
    0, DAGGER, KNIFE, AXE, PICK_AXE, SHORT_SWORD, BROADSWORD, LONG_SWORD,
    TWO_HANDED_SWORD, PN_SABER, CLUB, MACE, MORNING_STAR, FLAIL, PN_HAMMER,
    QUARTERSTAFF, PN_POLEARMS, SPEAR, TRIDENT, LANCE, BOW, SLING, CROSSBOW,
    DART, SHURIKEN, BOOMERANG, PN_WHIP, UNICORN_HORN,
    /* Spell */
    PN_ATTACK_SPELL, PN_HEALING_SPELL, PN_DIVINATION_SPELL,
    PN_ENCHANTMENT_SPELL, PN_CLERIC_SPELL, PN_ESCAPE_SPELL, PN_MATTER_SPELL,
    /* Other */
    PN_BARE_HANDED, PN_TWO_WEAPONS, PN_RIDING,
]);

// C ref: weapon.c odd_skill_names[], indexed by the negated PN_* code. Entry
// zero serves P_NONE, whose skill_names_indices[] entry is 0.
const odd_skill_names = Object.freeze([
    'no skill', 'bare hands', /* use barehands_or_martial[] instead */
    'two weapon combat', 'riding', 'polearms', 'saber', 'hammer', 'whip',
    'attack spells', 'healing spells', 'divination spells',
    'enchantment spells', 'clerical spells', 'escape spells', 'matter spells',
]);

// C ref: weapon.c barehands_or_martial[], indexed via martial_bonus().
const barehands_or_martial = Object.freeze([
    'bare handed combat', 'martial arts',
]);

// C ref: skills.h martial_bonus().
function martial_bonus(state) {
    const mnum = state.urole?.mnum;
    return mnum === PM_SAMURAI || mnum === PM_MONK;
}

// C ref: drawing.c def_oc_syms[].name, the plural class names oc_to_str()'s
// neighbours use. weapon_descr() singularizes whichever one it picks.
const def_oc_syms_names = Object.freeze([
    '', 'illegal objects', 'weapons', 'armor', 'rings', 'amulets', 'tools',
    'food', 'potions', 'scrolls', 'spellbooks', 'wands', 'coins', 'rocks',
    'large stones', 'iron balls', 'chains', 'venoms',
]);

// C ref: weapon.c P_NAME().
export function P_NAME(type, state = game) {
    const index = skill_names_indices[type];
    if (index > 0) return OBJ_NAME(objectType(index, state), state);
    if (type === P_BARE_HANDED_COMBAT)
        return barehands_or_martial[martial_bonus(state) ? 1 : 0];
    return odd_skill_names[-index];
}

// C ref: weapon.c skill_name().
export function skill_name(skill, state = game) {
    return P_NAME(skill, state);
}

// C ref: weapon.c weapon_descr(). The skill category name that stands in for
// a weapon, or the object class name for something that is not one.
export function weapon_descr(obj, state = game) {
    const skill = weapon_type(obj, state);
    let descr = P_NAME(skill, state);

    /* assorted special cases */
    switch (skill) {
    case P_NONE:
        descr = ([CORPSE, TIN, EGG, STATUE, BOULDER, TOWEL, TIN_OPENER]
            .includes(obj.otyp))
            ? OBJ_NAME(objectType(obj, state), state)
            : obj.globby ? 'glob'
                : def_oc_syms_names[obj.oclass];
        break;
    case P_SLING:
        if (is_ammo(obj, state))
            descr = (obj.otyp === ROCK || is_graystone(obj))
                ? 'stone'
                : (obj.oclass === GEM_CLASS)
                    ? 'gem'
                    : def_oc_syms_names[obj.oclass];
        break;
    case P_BOW:
        if (is_ammo(obj, state)) descr = 'arrow';
        break;
    case P_CROSSBOW:
        if (is_ammo(obj, state)) descr = 'bolt';
        break;
    case P_FLAIL:
        if (obj.otyp === GRAPPLING_HOOK) descr = 'hook';
        break;
    case P_PICK_AXE:
        /* even if "dwarvish mattock" hasn't been discovered yet */
        if (obj.otyp === DWARVISH_MATTOCK) descr = 'mattock';
        break;
    default:
        break;
    }
    return makesingular(descr);
}

// C ref: weapon.c skill_level_name(). P_ISRESTRICTED reaches the default arm.
export function skill_level_name(skill, state = game) {
    switch (P_SKILL(skill, state)) {
    case P_UNSKILLED: return 'Unskilled';
    case P_BASIC: return 'Basic';
    case P_SKILLED: return 'Skilled';
    case P_EXPERT: return 'Expert';
    /* these are for unarmed combat/martial arts only */
    case P_MASTER: return 'Master';
    case P_GRAND_MASTER: return 'Grand Master';
    default: return 'Unknown';
    }
}

// C ref: weapon.c weapon_hit_bonus() (1544-1636). The to-hit bonus the hero's
// skill in `weapon` is worth; a null weapon means bare-handed combat.
//
// C's three `default: impossible(bad_skill, ...)` arms fall through into the
// P_ISRESTRICTED/P_UNSKILLED case, so an out-of-range skill scores as
// unskilled. Each is written here as the switch's default value rather than as
// a separate arm, because impossible() only warns.
export function weapon_hit_bonus(weapon, state = game) {
    let bonus = 0;
    const wep_type = weapon_type(weapon, state);
    /* use two weapon skill only if attacking with one of the wielded
       weapons */
    const type = (state.u.twoweap
        && (weapon === state.uwep || weapon === state.uswapwep))
        ? P_TWO_WEAPON_COMBAT
        : wep_type;

    if (type === P_NONE) {
        bonus = 0;
    } else if (type <= P_LAST_WEAPON) {
        switch (P_SKILL(type, state)) {
        case P_BASIC: bonus = 0; break;
        case P_SKILLED: bonus = 2; break;
        case P_EXPERT: bonus = 3; break;
        default: bonus = -4; break;
        }
    } else if (type === P_TWO_WEAPON_COMBAT) {
        let skill = P_SKILL(P_TWO_WEAPON_COMBAT, state);
        if (P_SKILL(wep_type, state) < skill)
            skill = P_SKILL(wep_type, state);
        switch (skill) {
        case P_BASIC: bonus = -7; break;
        case P_SKILLED: bonus = -5; break;
        case P_EXPERT: bonus = -3; break;
        default: bonus = -9; break;
        }
    } else if (type === P_BARE_HANDED_COMBAT) {
        /*
         *        b.h. m.a.
         * unskl:  +1  n/a
         * basic:  +1   +3
         * skild:  +2   +4
         * exprt:  +2   +5
         * mastr:  +3   +6
         * grand:  +3   +7
         */
        bonus = P_SKILL(type, state);
        bonus = Math.max(bonus, P_UNSKILLED) - 1; /* unskilled => 0 */
        bonus = Math.trunc(((bonus + 2) * (martial_bonus(state) ? 2 : 1)) / 2);
    }

    /* KMH -- It's harder to hit while you are riding */
    if (state.u.usteed) {
        switch (P_SKILL(P_RIDING, state)) {
        case P_ISRESTRICTED:
        case P_UNSKILLED:
            bonus -= 2;
            break;
        case P_BASIC:
            bonus -= 1;
            break;
        default:
            break;
        }
        if (state.u.twoweap) bonus -= 2;
    }

    return bonus;
}

// C ref: weapon.c slots_required().
function slots_required(skill, state) {
    const tmp = P_SKILL(skill, state);

    if (skill <= P_LAST_WEAPON || skill === P_TWO_WEAPON_COMBAT) return tmp;
    /* fewer slots used up for unarmed or martial */
    return Math.trunc((tmp + 1) / 2);
}

// C ref: weapon.c can_advance(). C answers FALSE for a restricted, maxed, or
// limit-reached skill before it consults `speedy`, and `speedy` alone does
// nothing: the shortcut is `wizard && speedy`. Keeping that order matters,
// because a restricted skill is an ordinary FALSE that needs nothing unported.
export function can_advance(skill, speedy, state = game) {
    if (P_SKILL(skill, state) === P_ISRESTRICTED
        || P_SKILL(skill, state) >= P_MAX_SKILL(skill, state)
        || state.u.skills_advanced >= P_SKILL_LIMIT)
        return false;
    if (state.wizard && speedy)
        throw new UnsupportedWeaponSkillError('can_advance(speedy)');

    return P_ADVANCE(skill, state)
            >= practice_needed_to_advance(P_SKILL(skill, state))
        && state.u.weapon_slots >= slots_required(skill, state);
}

// C ref: weapon.c add_weapon_skill(), which attrib.c adjabil() calls once per
// experience level gained. can_advance() also requires practice, so a slot
// alone never lifts the count: a hero who has struck nothing has zero
// P_ADVANCE for every skill and `before == after`. Where the count does rise,
// give_may_advance_msg() prints "You feel more confident in your skills." and
// then calls handle_tip(TIP_ENHANCE), which has no owner here, so that arm
// stays fail-closed.
export function add_weapon_skill(n, state = game) {
    let before = 0;
    for (let i = 0; i < P_NUM_SKILLS; i++)
        if (can_advance(i, false, state)) before++;
    state.u.weapon_slots += n;
    let after = 0;
    for (let i = 0; i < P_NUM_SKILLS; i++)
        if (can_advance(i, false, state)) after++;
    if (before < after)
        throw new UnsupportedWeaponSkillError('give_may_advance_msg(P_NONE)');
}

// Thrown where weapon.c reaches a skill branch this port has not ported.
export class UnsupportedWeaponSkillError extends Error {
    constructor(branch) {
        super(`weapon skill handling requires ${branch}`);
        this.name = 'UnsupportedWeaponSkillError';
        this.branch = branch;
    }
}
