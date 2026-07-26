// Ordinary-monster floor-item search.
// C ref: monmove.c mon_would_take_item(), mon_would_consume_item(),
// and m_search_items().

import {
    ACCFOOD, COLNO, MANFOOD, ROOMOFFSET, ROWNO, SHOPBASE, SQSRCHRADIUS,
} from './const.js';
import { on_level } from './dungeon.js';
import { dogfood } from './dogfood.js';
import { could_reach_item } from './dogmove_goal.js';
import { game } from './gstate.js';
import { distmin } from './hacklib.js';
import {
    curr_mon_load, max_mon_load,
} from './mon.js';
import { can_carry } from './moncarry.js';
import {
    hides_under, is_animal, is_unicorn, likes_gems, likes_gold, likes_magic,
    likes_objs, mindless, mon_knows_traps, throws_rocks, touch_petrifies,
} from './mondata.js';
import * as M from './monsters.js';
import { m_at } from './monst.js';
import { searches_for_item } from './muse.js';
import { objectType } from './obj.js';
import * as O from './objects.js';
import { onscary } from './monmove.js';
import { rn2 } from './rng.js';
import { in_rooms } from './rooms.js';
import { t_at } from './trap.js';
import { cansee, clear_path } from './vision.js';
import { can_touch_safely } from './weapon.js';

const PRACTICAL = new Set([
    O.WEAPON_CLASS,
    O.ARMOR_CLASS,
    O.GEM_CLASS,
    O.FOOD_CLASS,
]);
const MAGICAL = new Set([
    O.AMULET_CLASS,
    O.POTION_CLASS,
    O.SCROLL_CLASS,
    O.WAND_CLASS,
    O.RING_CLASS,
    O.SPBOOK_CLASS,
]);
const CORPSE_EATERS = new Set([
    M.PM_PURPLE_WORM,
    M.PM_BABY_PURPLE_WORM,
    M.PM_GHOUL,
    M.PM_PIRANHA,
]);

function isMercenary(species) {
    return Boolean((species?.mflags2 ?? 0) & M.M2_MERC);
}

function prizeObject(obj, state) {
    const tracking = state.context?.achieveo;
    return Boolean(tracking
        && ((tracking.mines_prize_oid
            && obj.o_id === tracking.mines_prize_oid)
            || (tracking.soko_prize_oid
                && obj.o_id === tracking.soko_prize_oid)));
}

function inHisShop(shopkeeper, state) {
    const eshk = shopkeeper?.mextra?.eshk;
    return Boolean(eshk
        && on_level(eshk.shoplevel, state.u?.uz)
        && in_rooms(
            shopkeeper.mx,
            shopkeeper.my,
            SHOPBASE,
            state,
        ).includes(eshk.shoproom));
}

function costlySpot(x, y, state) {
    if (!state.level?.flags?.has_shop) return false;
    const room = in_rooms(x, y, SHOPBASE, state)[0];
    const shopkeeper = room >= ROOMOFFSET
        ? state.level.rooms?.[room - ROOMOFFSET]?.resident
        : null;
    const location = state.level.at(x, y);
    const eshk = shopkeeper?.mextra?.eshk;
    return Boolean(shopkeeper && inHisShop(shopkeeper, state)
        && location?.roomno === room && !location.edge
        && state.level.rooms?.[room - ROOMOFFSET]?.rtype >= SHOPBASE
        && (x !== eshk.shk.x || y !== eshk.shk.y));
}

export function mon_would_take_item(monster, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const species = monster.data;
    const type = objectType(obj, state);
    const percentLoad = Math.trunc(
        curr_mon_load(monster) * 100 / max_mon_load(monster),
    );

    if (obj === state.uball || obj === state.uchain) return false;
    if (monster.mtame && obj.cursed) return false;
    if (is_unicorn(species) && type.oc_material !== O.GEMSTONE) return false;
    if (!mindless(species) && !is_animal(species) && percentLoad < 75
        && searches_for_item(monster, obj, state)) {
        return true;
    }
    if (likes_gold(species) && obj.otyp === O.GOLD_PIECE
        && percentLoad < 95) return true;
    if (likes_gems(species) && obj.oclass === O.GEM_CLASS
        && type.oc_material !== O.MINERAL && percentLoad < 85) return true;
    if (likes_objs(species) && PRACTICAL.has(obj.oclass)
        && percentLoad < 75) return true;
    if (likes_magic(species) && MAGICAL.has(obj.oclass)
        && percentLoad < 85) return true;
    if (throws_rocks(species) && obj.otyp === O.BOULDER
        && percentLoad < 50 && !state.level?.flags?.sokoban_rules) return true;
    if (species?.pmidx === M.PM_GELATINOUS_CUBE
        && obj.oclass !== O.ROCK_CLASS && obj.oclass !== O.BALL_CLASS
        && !(obj.otyp === O.CORPSE
            && touch_petrifies(state.mons?.[obj.corpsenm]))) return true;
    return false;
}

export function mon_would_consume_item(monster, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (obj.otyp === O.CORPSE
        && !touch_petrifies(state.mons?.[obj.corpsenm])
        && CORPSE_EATERS.has(monster.data?.pmidx)) return true;

    const edog = monster.mextra?.edog;
    if (monster.mtame && edog) {
        const foodType = dogfood(monster, obj, { ...rawEnv, state });
        return foodType < MANFOOD
            && (foodType < ACCFOOD || edog.hungrytime <= state.moves);
    }
    return false;
}

export function m_search_items(
    monster,
    initialGoalX,
    initialGoalY,
    initialApproach,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const env = { ...rawEnv, state, random };
    const canReach = rawEnv.couldReachItem ?? could_reach_item;
    const canSee = rawEnv.canSee ?? cansee;
    const mCanSee = rawEnv.monsterCanSee ?? clear_path;
    const isCostly = rawEnv.costlySpot ?? costlySpot;
    let goalX = initialGoalX;
    let goalY = initialGoalY;
    let approach = initialApproach;
    let selectedObject = null;
    let minRadius = SQSRCHRADIUS;
    const originX = monster.mx;
    const originY = monster.my;

    if (distmin(monster.mux, monster.muy, originX, originY)
        < SQSRCHRADIUS && !monster.mpeaceful) minRadius--;
    if (!monster.mpeaceful && isMercenary(monster.data)) minRadius = 1;
    if (in_rooms(originX, originY, SHOPBASE, state).length
        && (random.rn2(25) || monster.isshk)) {
        return finishSearch();
    }

    const highX = Math.min(COLNO - 1, originX + minRadius);
    const highY = Math.min(ROWNO - 1, originY + minRadius);
    const lowX = Math.max(1, originX - minRadius);
    const lowY = Math.max(0, originY - minRadius);
    for (let x = lowX; x <= highX; ++x) {
        for (let y = lowY; y <= highY; ++y) {
            if (!state.level.objects[x]?.[y]
                || minRadius < distmin(originX, originY, x, y)
                || !canReach(monster, x, y, state)
                || (hides_under(monster.data) && canSee(x, y, state))) continue;

            const occupant = m_at(x, y, state);
            if (occupant && (occupant.msleeping || !occupant.mcanmove
                || occupant.mundetected
                || (occupant.mappearance && !occupant.iswiz)
                || !occupant.data?.mmove)) continue;
            if (onscary(x, y, monster, state)) continue;

            const trap = t_at(x, y, state);
            if (trap && mon_knows_traps(monster, trap.ttyp)) {
                if (goalX === x && goalY === y) {
                    goalX = monster.mux;
                    goalY = monster.muy;
                }
                continue;
            }
            if (!mCanSee(originX, originY, x, y)) continue;

            const costly = isCostly(x, y, state);
            for (let obj = state.level.objects[x][y];
                obj;
                obj = obj.nexthere) {
                if (obj.otyp === O.ROCK || prizeObject(obj, state)
                    || (costly && !obj.no_charge)) continue;
                const wanted = mon_would_take_item(monster, obj, env)
                    && can_carry(monster, obj, env) > 0;
                if ((wanted
                    || mon_would_consume_item(monster, obj, env))
                    && can_touch_safely(monster, obj, env)) {
                    minRadius = distmin(originX, originY, x, y);
                    selectedObject = obj;
                    goalX = obj.ox;
                    goalY = obj.oy;
                    if (goalX === originX && goalY === originY) {
                        return {
                            approach,
                            complete: true,
                            goalX,
                            goalY,
                            object: selectedObject,
                        };
                    }
                    break;
                }
            }
        }
    }
    return finishSearch();

    function finishSearch() {
        if (minRadius < SQSRCHRADIUS && approach === -1) {
            if (distmin(
                originX,
                originY,
                monster.mux,
                monster.muy,
            ) <= 3) {
                goalX = monster.mux;
                goalY = monster.muy;
            } else {
                approach = 1;
            }
        }
        return {
            approach,
            complete: false,
            goalX,
            goalY,
            object: selectedObject,
        };
    }
}
