// Monster item-interest predicates.
// C refs: muse.c searches_for_item(), cures_stoning(),
// mcould_eat_tin(); mondata.c can_blow().

import {
    MFAST, NON_PM, OBJ_FLOOR, P_DAGGER, P_KNIFE, W_ARMG,
} from './const.js';
import { game } from './gstate.js';
import {
    acidic, attacktype, breathless, has_head, is_animal, is_floater,
    is_unicorn, is_vampshifter, mindless, needspick, nonliving, slimeproof,
    touch_petrifies, verysmall,
} from './mondata.js';
import * as M from './monsters.js';
import {
    isContainer,
    objectType,
} from './obj.js';
import * as O from './objects.js';
import { onscary } from './monmove.js';
import { mwelded } from './weapon.js';

// The generated catalog stores these values but does not currently export
// their source enum names.
const AT_GAZE = 15;
const MS_SILENT = 0;
const MS_BUZZ = 10;

function resistsStoning(monster) {
    const resistanceBits = (monster.data?.mresists ?? 0)
        | (monster.mextrinsics ?? 0)
        | (monster.mintrinsics ?? 0);
    return Boolean(resistanceBits & M.MR_STONE);
}

export function can_blow(monster) {
    const species = monster.data;
    const silentOrBuzzing = species?.msound === MS_SILENT
        || species?.msound === MS_BUZZ;
    return !(silentOrBuzzing
        && (breathless(species)
            || verysmall(species)
            || !has_head(species)
            || species?.mlet === M.S_EEL));
}

export function cures_stoning(monster, obj, tinok, state = game) {
    if (obj.otyp === O.POT_ACID) return true;
    if (obj.otyp === O.GLOB_OF_GREEN_SLIME)
        return slimeproof(monster.data);
    if (obj.otyp !== O.CORPSE && (obj.otyp !== O.TIN || !tinok))
        return false;
    if (obj.corpsenm === NON_PM) return false;
    const corpseSpecies = state.mons?.[obj.corpsenm];
    return Boolean(corpseSpecies
        && (obj.corpsenm === M.PM_LIZARD || acidic(corpseSpecies)));
}

export function mcould_eat_tin(monster, state = game) {
    if (is_animal(monster.data)) return false;

    const weapon = monster.mw;
    const weldedWeapon = weapon && mwelded(weapon, state);
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (weldedWeapon && obj !== weapon) continue;
        const skill = obj.oclass === O.WEAPON_CLASS
            ? objectType(obj, state).oc_skill
            : 0;
        if (obj.otyp === O.TIN_OPENER
            || skill === P_DAGGER
            || skill === P_KNIFE) {
            return true;
        }
    }
    return false;
}

function isMagicBag(obj) {
    return obj.otyp === O.BAG_OF_HOLDING || obj.otyp === O.BAG_OF_TRICKS;
}

export function searches_for_item(monster, obj, state = game) {
    const species = monster.data;
    const type = objectType(obj, state);
    const otyp = obj.otyp;

    if (obj.where === OBJ_FLOOR
        && obj.ox === monster.mx
        && obj.oy === monster.my
        && onscary(obj.ox, obj.oy, monster, state)) {
        return false;
    }
    if (is_animal(species) || mindless(species)
        || species?.pmidx === M.PM_GHOST) {
        return false;
    }

    if (otyp === O.WAN_MAKE_INVISIBLE || otyp === O.POT_INVISIBILITY) {
        return !monster.minvis && !monster.invis_blkd
            && !attacktype(species, AT_GAZE);
    }
    if (otyp === O.WAN_SPEED_MONSTER || otyp === O.POT_SPEED)
        return monster.mspeed !== MFAST;

    switch (obj.oclass) {
    case O.WAND_CLASS:
        if (obj.spe <= 0) return false;
        if (otyp === O.WAN_DIGGING) return !is_floater(species);
        if (otyp === O.WAN_POLYMORPH) return species?.difficulty < 6;
        return type.oc_dir === O.RAY
            || otyp === O.WAN_STRIKING
            || otyp === O.WAN_UNDEAD_TURNING
            || otyp === O.WAN_TELEPORTATION
            || otyp === O.WAN_CREATE_MONSTER;
    case O.POTION_CLASS:
        if (otyp === O.POT_HEALING || otyp === O.POT_EXTRA_HEALING
            || otyp === O.POT_FULL_HEALING || otyp === O.POT_POLYMORPH
            || otyp === O.POT_GAIN_LEVEL || otyp === O.POT_PARALYSIS
            || otyp === O.POT_SLEEPING || otyp === O.POT_ACID
            || otyp === O.POT_CONFUSION) {
            return true;
        }
        return otyp === O.POT_BLINDNESS
            && !attacktype(species, AT_GAZE);
    case O.SCROLL_CLASS:
        return otyp === O.SCR_TELEPORTATION
            || otyp === O.SCR_CREATE_MONSTER
            || otyp === O.SCR_EARTH
            || otyp === O.SCR_FIRE;
    case O.AMULET_CLASS:
        if (otyp === O.AMULET_OF_LIFE_SAVING)
            return !(nonliving(species) || is_vampshifter(monster));
        return otyp === O.AMULET_OF_REFLECTION
            || otyp === O.AMULET_OF_GUARDING;
    case O.TOOL_CLASS:
        if (otyp === O.PICK_AXE) return needspick(species);
        if (otyp === O.UNICORN_HORN) {
            return !obj.cursed && !is_unicorn(species)
                && species?.pmidx !== M.PM_KI_RIN;
        }
        if (otyp === O.FROST_HORN || otyp === O.FIRE_HORN)
            return obj.spe > 0 && can_blow(monster);
        if (isContainer(obj)
            && !(isMagicBag(obj) && obj.cursed)
            && !obj.olocked) {
            return true;
        }
        return otyp === O.EXPENSIVE_CAMERA && obj.spe > 0;
    case O.FOOD_CLASS:
        if (otyp === O.CORPSE) {
            const corpseSpecies = state.mons?.[obj.corpsenm];
            return Boolean(corpseSpecies
                && (((monster.misc_worn_check & W_ARMG)
                    && touch_petrifies(corpseSpecies))
                    || (!resistsStoning(monster)
                        && cures_stoning(monster, obj, false, state))));
        }
        if (otyp === O.TIN) {
            return mcould_eat_tin(monster, state)
                && !resistsStoning(monster)
                && cures_stoning(monster, obj, true, state);
        }
        if (otyp === O.EGG) {
            const eggSpecies = state.mons?.[obj.corpsenm];
            return Boolean(eggSpecies && touch_petrifies(eggSpecies));
        }
        return false;
    default:
        return false;
    }
}
