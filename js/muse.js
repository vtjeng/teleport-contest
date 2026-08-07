// Monster item-interest predicates.
// C refs: muse.c searches_for_item(), cures_stoning(),
// mcould_eat_tin(); mondata.c can_blow().

import {
    MFAST,
    NON_PM,
    OBJ_FLOOR,
    P_DAGGER,
    P_KNIFE,
    POLY_TRAP,
    SEE_INVIS,
    W_ACCESSORY,
    W_ARMOR,
    W_ARMF,
    W_ARMG,
    W_SADDLE,
    isok,
} from './const.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import {
    acidic, attacktype, breathless, has_head, is_animal, is_floater,
    is_unicorn, is_vampshifter, mindless, needspick, nohands, nonliving,
    passes_walls, slimeproof, throws_rocks, touch_petrifies, verysmall,
} from './mondata.js';
import * as M from './monsters.js';
import {
    isContainer,
    objectType,
    sobj_at,
} from './obj.js';
import * as O from './objects.js';
import { onscary } from './monmove.js';
import { rn2 } from './rng.js';
import { t_at } from './trap.js';
import { mwelded } from './wield.js';
import { which_armor } from './worn.js';

// The generated catalog stores these values but does not currently export
// their source enum names.
const AT_GAZE = 15;
const MS_SILENT = 0;
const MS_BUZZ = 10;

function activeHeroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function healingAction(monster) {
    for (const otyp of [
        O.POT_FULL_HEALING,
        O.POT_EXTRA_HEALING,
        O.POT_HEALING,
    ]) {
        for (let obj = monster.minvent; obj; obj = obj.nobj) {
            if (obj.otyp === otyp) return { kind: 'healing', object: obj };
        }
    }
    return null;
}

function canLetGoWithoutDiscovery(obj, state) {
    if (!obj) return false;
    if (obj.owornmask & (W_ARMOR | W_ACCESSORY)) return false;
    if (obj === state.uwep && mwelded(obj, state)) return false;
    if (obj.otyp === O.LOADSTONE && obj.cursed) return false;
    if (obj.otyp === O.LEASH && obj.leashmon) return false;
    return !(obj.owornmask & W_SADDLE);
}

// C ref: muse.c find_misc(). This is selection only; use_misc() remains
// outside the simple-turn boundary.
export function select_misc_action(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const species = monster.data;
    const hero = state.u;

    if (is_animal(species) || mindless(species)) return null;
    if (hero?.uswallow && monster === hero.ustuck) return null;
    if (dist2(
        monster.mx,
        monster.my,
        monster.mux,
        monster.muy,
    ) > 36) return null;

    const mobile = species?.mmove !== 0;
    if (monster !== hero?.ustuck && mobile && !monster.mtrapped
        && monster.cham === NON_PM && species?.difficulty < 6) {
        const ignoresBoulders = verysmall(species)
            || throws_rocks(species)
            || passes_walls(species);
        const diagonal = species?.pmidx !== M.PM_GRID_BUG;
        const shoes = which_armor(monster, W_ARMF);
        const ironShoes = shoes
            && objectType(shoes, state).oc_material === O.IRON;
        for (let x = monster.mx - 1; x <= monster.mx + 1; ++x) {
            for (let y = monster.my - 1; y <= monster.my + 1; ++y) {
                if (!isok(x, y)
                    || (hero?.ux === x && hero?.uy === y)
                    || (!diagonal && x !== monster.mx && y !== monster.my)
                    || ((x !== monster.mx || y !== monster.my)
                        && state.level.monsters[x]?.[y])) {
                    continue;
                }
                const trap = t_at(x, y, state);
                if (trap?.ttyp === POLY_TRAP
                    && (ignoresBoulders
                        || !sobj_at(O.BOULDER, x, y, state))
                    && !onscary(x, y, monster, state)
                    && !ironShoes) {
                    return {
                        kind: 'polymorph trap',
                        object: null,
                        x,
                        y,
                    };
                }
            }
        }
    }
    if (nohands(species)) return null;

    let selected = null;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp === O.POT_GAIN_LEVEL
            && (!obj.cursed
                || (!monster.isgd
                    && !monster.isshk
                    && !monster.ispriest))) {
            selected = { kind: 'gain level', object: obj };
        }
        if (selected?.kind === 'bullwhip') continue;
        if (obj.otyp === O.BULLWHIP && !monster.mpeaceful
            && state.uwep && !random.rn2(5) && obj === monster.mw
            && monster.mux === hero?.ux && monster.muy === hero?.uy
            && dist2(monster.mx, monster.my, hero.ux, hero.uy) <= 2
            && !hero.uswallow
            && (canLetGoWithoutDiscovery(state.uwep, state)
                || (hero.twoweap
                    && canLetGoWithoutDiscovery(state.uswapwep, state)))) {
            selected = { kind: 'bullwhip', object: obj };
        }
        if (selected?.kind === 'make invisible') continue;
        if (obj.otyp === O.WAN_MAKE_INVISIBLE && obj.spe > 0
            && !monster.minvis && !monster.invis_blkd
            && (!monster.mpeaceful
                || activeHeroProperty(state, SEE_INVIS))
            && (!attacktype(species, AT_GAZE) || monster.mcan)) {
            selected = { kind: 'make invisible', object: obj };
        }
        if (selected?.kind === 'invisibility') continue;
        if (obj.otyp === O.POT_INVISIBILITY
            && !monster.minvis && !monster.invis_blkd
            && (!monster.mpeaceful
                || activeHeroProperty(state, SEE_INVIS))
            && (!attacktype(species, AT_GAZE) || monster.mcan)) {
            selected = { kind: 'invisibility', object: obj };
        }
        if (selected?.kind === 'speed wand') continue;
        if (obj.otyp === O.WAN_SPEED_MONSTER && obj.spe > 0
            && monster.mspeed !== MFAST && !monster.isgd) {
            selected = { kind: 'speed wand', object: obj };
        }
        if (selected?.kind === 'speed potion') continue;
        if (obj.otyp === O.POT_SPEED
            && monster.mspeed !== MFAST && !monster.isgd) {
            selected = { kind: 'speed potion', object: obj };
        }
        if (selected?.kind === 'polymorph wand') continue;
        if (obj.otyp === O.WAN_POLYMORPH && obj.spe > 0
            && monster.cham === NON_PM && species?.difficulty < 6) {
            selected = { kind: 'polymorph wand', object: obj };
        }
        if (selected?.kind === 'polymorph potion') continue;
        if (obj.otyp === O.POT_POLYMORPH
            && monster.cham === NON_PM && species?.difficulty < 6) {
            selected = { kind: 'polymorph potion', object: obj };
        }
        if (selected?.kind === 'container') continue;
        if (isContainer(obj) && obj.otyp !== O.BAG_OF_TRICKS
            && !random.rn2(5)
            && !(obj.otyp === O.LARGE_BOX && obj.spe === 1)
            && !selected && obj.cobj && !obj.olocked && !obj.otrapped) {
            selected = { kind: 'container', object: obj };
        }
    }
    return selected;
}

// Complete source path for an ordinary, unaltered initial monster. The
// full-health branch makes find_defensive(FALSE) inert before its escape and
// inventory scan; all find_misc() selection gates then run in source order.
export function select_fresh_monster_item_action(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const species = monster.data;
    if (!is_animal(species) && !mindless(species)
        && dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        ) <= 25) {
        if (monster.mconf || monster.mstun) {
            return { kind: 'altered defensive state', object: null };
        }
        if (!monster.mcansee) {
            if (!nohands(species)) {
                for (let obj = monster.minvent; obj; obj = obj.nobj) {
                    if (obj.otyp === O.UNICORN_HORN && !obj.cursed)
                        return { kind: 'unicorn horn', object: obj };
                }
            }
            if (is_unicorn(species)
                || species?.pmidx === M.PM_KI_RIN) {
                return { kind: 'unicorn horn', object: null };
            }
            if (!nohands(species)
                && species?.pmidx !== M.PM_PESTILENCE) {
                const healing = healingAction(monster);
                if (healing) return healing;
            }
        }
        if (!monster.mpeaceful && !nohands(species)
            && state.uwep?.otyp === O.CORPSE) {
            return { kind: 'corpse defense evaluation', object: null };
        }
        const fraction = (state.u?.ulevel ?? 1) < 10
            ? 5
            : (state.u?.ulevel ?? 1) < 14 ? 4 : 3;
        if (monster.mhp < monster.mhpmax
            && (monster.mhp < 10
                || monster.mhp * fraction < monster.mhpmax)) {
            if (monster.mpeaceful) {
                if (!nohands(species)) {
                    const healing = healingAction(monster);
                    if (healing) return healing;
                }
                return select_misc_action(monster, rawEnv);
            }
            return { kind: 'wounded defensive state', object: null };
        }
    }
    return select_misc_action(monster, rawEnv);
}

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
