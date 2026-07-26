// Ordinary-monster floor-item search.
// C ref: monmove.c mon_would_take_item(), mon_would_consume_item(),
// and m_search_items().

import {
    ACCFOOD, COLNO, MANFOOD, POISON_RES, ROOMOFFSET, ROWNO, SHOPBASE,
    SQSRCHRADIUS, STONE_RES,
} from './const.js';
import { obj_resists } from './bury.js';
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
    acidic, flesh_petrifies, hides_under, is_animal, is_rider, is_unicorn,
    likes_gems, likes_gold, likes_magic, likes_objs, metallivorous, mindless,
    mon_knows_traps, monster_resists_element, throws_rocks, touch_petrifies,
    vegan,
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

function artifactTouchable(obj, monster, env) {
    if (!obj.oartifact) return true;
    if (typeof env.touchArtifact !== 'function') {
        throw new TypeError(
            'postmov object selection requires a touchArtifact operation',
        );
    }
    return Boolean(env.touchArtifact(obj, monster, env));
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

// C refs: monmove.c postmov(); mon.c meatmetal(), meatcorpse(), and
// mpickstuff(). Clone-only planning runs this read-only selector before any
// live action; the live postmov() adapter repeats its selection and PRNG calls
// after movement output, track updates, and redraws.
export function select_postmove_object_action(
    monster,
    x,
    y,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const env = { ...rawEnv, state, random };
    const objects = state.level?.objects?.[x]?.[y] ?? null;
    if (!objects || !monster.mcanmove) return null;

    // Tests and bounded preflight callers may ask about another square. Give
    // source predicates those coordinates without mutating the real monster.
    const subject = monster.mx === x && monster.my === y
        ? monster
        : { ...monster, mx: x, my: y };
    const species = subject.data;

    if (!subject.mtame && metallivorous(species)) {
        const rustMonster = species?.pmidx === M.PM_RUST_MONSTER;
        for (let obj = objects; obj; obj = obj.nexthere) {
            const material = objectType(obj, state).oc_material;
            if ((rustMonster && material !== O.IRON)
                || obj.otyp === O.AMULET_OF_STRANGULATION
                || obj.otyp === O.RIN_SLOW_DIGESTION
                || (obj.opoisoned
                    && !monster_resists_element(
                        subject,
                        POISON_RES,
                        state,
                    ))) {
                continue;
            }
            if (material >= O.IRON && material <= O.MITHRIL
                && !obj_resists(obj, 5, 95, env)
                && artifactTouchable(obj, subject, env)) {
                return {
                    kind: rustMonster && obj.oerodeproof
                        ? 'reject rustproof metal'
                        : 'eat metal',
                    object: obj,
                };
            }
        }
    }

    if (!subject.mtame && CORPSE_EATERS.has(species?.pmidx)) {
        for (let obj = objects; obj; obj = obj.nexthere) {
            if (obj.otyp !== O.CORPSE) continue;
            const corpseSpecies = state.mons?.[obj.corpsenm];
            if (!corpseSpecies || vegan(corpseSpecies)
                || (flesh_petrifies(corpseSpecies)
                    && !monster_resists_element(
                        subject,
                        STONE_RES,
                        state,
                    ))) {
                continue;
            }
            return {
                kind: is_rider(corpseSpecies)
                    ? 'revive rider corpse'
                    : 'eat corpse',
                object: obj,
            };
        }
    }

    if (subject.isshk && inHisShop(subject, state)) return null;
    if (!subject.mtame && in_rooms(x, y, SHOPBASE, state).length
        && random.rn2(25)) {
        return null;
    }
    const canReach = rawEnv.couldReachItem ?? could_reach_item;
    if (!canReach(subject, x, y, state)) return null;

    for (let obj = objects; obj; obj = obj.nexthere) {
        if (prizeObject(obj, state)
            || !mon_would_take_item(subject, obj, env)) {
            continue;
        }
        if (obj.otyp === O.CORPSE && species?.mlet !== M.S_NYMPH) {
            const corpseSpecies = state.mons?.[obj.corpsenm];
            if (corpseSpecies && !touch_petrifies(corpseSpecies)
                && obj.corpsenm !== M.PM_LIZARD
                && !acidic(corpseSpecies)) {
                continue;
            }
        }
        if (!can_touch_safely(subject, obj, env)
            || can_carry(subject, obj, env) === 0) {
            continue;
        }
        return { kind: 'pick up', object: obj };
    }
    return null;
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
