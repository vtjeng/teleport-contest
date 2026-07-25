// Pet goal selection and reachability.
// C ref: dogmove.c droppables(), cursed_object_at(), dog_goal(),
// could_reach_item(), can_reach_location(), and wantdoor().

import {
    APPORT,
    COLNO,
    D_CLOSED,
    D_LOCKED,
    DOGFOOD,
    IS_DOOR,
    IS_OBSTRUCTED,
    IS_ROOM,
    MAGIC_PORTAL,
    MANFOOD,
    ROWNO,
    UNDEF,
    W_ARMS,
    isok,
} from './const.js';
import { on_level } from './dungeon.js';
import { dogfood as classifyDogFood } from './dogfood.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { can_carry } from './moncarry.js';
import {
    is_animal,
    is_swimmer,
    likes_lava,
    mindless,
    needspick,
    nohands,
    passes_walls,
    throws_rocks,
    tunnels,
    verysmall,
} from './mondata.js';
import { sobj_at } from './obj.js';
import {
    BOULDER,
    CREDIT_CARD,
    DWARVISH_MATTOCK,
    GOLD_PIECE,
    LOCK_PICK,
    PICK_AXE,
    SKELETON_KEY,
    UNICORN_HORN,
} from './objects.js';
import { rn2 } from './rng.js';
import { gettrack } from './track.js';
import { is_lava, is_pool } from './trap.js';
import { clear_path, couldsee, do_clear_area } from './vision.js';
import { may_dig } from './monmove.js';
import { which_armor } from './weapon.js';

const SQSRCHRADIUS = 5;
const FARAWAY = COLNO + 2;

// dogmove.c uses a static artifact dummy so unusable tools can never replace
// the sentinel and accidentally become reserved.
const UNUSABLE_TOOL = Object.freeze({
    oartifact: 1,
    otyp: GOLD_PIECE,
});

function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

function goalOperation(rawEnv, name, fallback) {
    const operation = rawEnv[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`dog_goal requires a ${name} operation`);
    return operation;
}

function onStairs(x, y, state) {
    for (let stairway = state.stairs; stairway; stairway = stairway.next) {
        if (stairway.sx === x && stairway.sy === y) return true;
    }
    return false;
}

// C ref: dogmove.c droppables(). Return the first carried object this pet
// does not reserve as its wielded weapon or one preferred utility tool.
export function droppables(monster) {
    const species = monster.data;
    const weapon = monster.mw;
    let pickaxe = null;
    let unicornHorn = null;
    let key = null;

    if (is_animal(species) || mindless(species)) {
        pickaxe = unicornHorn = key = UNUSABLE_TOOL;
    } else {
        if (!tunnels(species) || !needspick(species))
            pickaxe = UNUSABLE_TOOL;
        if (nohands(species) || verysmall(species))
            key = UNUSABLE_TOOL;
    }
    if (weapon) {
        if (weapon.otyp === PICK_AXE
            || weapon.otyp === DWARVISH_MATTOCK) {
            pickaxe = weapon;
        }
        if (weapon.otyp === UNICORN_HORN) unicornHorn = weapon;
    }

    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        switch (obj.otyp) {
        case DWARVISH_MATTOCK:
            if (which_armor(monster, W_ARMS)) break;
            if (pickaxe?.otyp === PICK_AXE && pickaxe !== weapon
                && (!pickaxe.oartifact || obj.oartifact)) {
                return pickaxe;
            }
            // Fall through: a mattock is otherwise a preferred pick.
        case PICK_AXE:
            if (pickaxe == null
                || (obj.oartifact && !pickaxe.oartifact)) {
                if (pickaxe) return pickaxe;
                pickaxe = obj;
                continue;
            }
            break;
        case UNICORN_HORN:
            if (obj.cursed) break;
            if (!unicornHorn
                || (obj.oartifact && !unicornHorn.oartifact)) {
                if (unicornHorn) return unicornHorn;
                unicornHorn = obj;
                continue;
            }
            break;
        case SKELETON_KEY:
            if (key?.otyp === LOCK_PICK
                && (!key.oartifact || obj.oartifact)) {
                return key;
            }
            // Fall through: skeleton keys outrank lock picks and cards.
        case LOCK_PICK:
            if (key?.otyp === CREDIT_CARD
                && (!key.oartifact || obj.oartifact)) {
                return key;
            }
            // Fall through: any of the three may become the reserved key.
        case CREDIT_CARD:
            if (key == null || (obj.oartifact && !key.oartifact)) {
                if (key) return key;
                key = obj;
                continue;
            }
            break;
        default:
            break;
        }
        if (!obj.owornmask && obj !== weapon) return obj;
    }
    return null;
}

// C ref: dogmove.c cursed_object_at().
export function cursed_object_at(x, y, state = game) {
    for (let obj = state.level?.objects?.[x]?.[y] ?? null;
        obj;
        obj = obj.nexthere) {
        if (obj.cursed) return true;
    }
    return false;
}

// C ref: dogmove.c could_reach_item().
export function could_reach_item(monster, x, y, state = game) {
    return (!is_pool(x, y, state) || is_swimmer(monster.data))
        && (!is_lava(x, y, state) || likes_lava(monster.data))
        && (!sobj_at(BOULDER, x, y, state)
            || throws_rocks(monster.data));
}

// C ref: dogmove.c can_reach_location(). The source recursion is bounded by
// dog_goal()'s five-square search radius; retain its x-major/y-minor order.
export function can_reach_location(
    monster,
    startX,
    startY,
    goalX,
    goalY,
    state = game,
) {
    if (startX === goalX && startY === goalY) return true;
    if (!isok(startX, startY)) return false;

    const distance = dist2(startX, startY, goalX, goalY);
    for (let x = startX - 1; x <= startX + 1; ++x) {
        for (let y = startY - 1; y <= startY + 1; ++y) {
            if (!isok(x, y) || dist2(x, y, goalX, goalY) >= distance)
                continue;
            const location = state.level?.at?.(x, y);
            if (!location) continue;
            if (IS_OBSTRUCTED(location.typ)
                && !passes_walls(monster.data)
                && (!may_dig(x, y, state)
                    || !tunnels(monster.data)
                    || on_level(state.u?.uz, state.rogue_level))) {
                continue;
            }
            if (IS_DOOR(location.typ)
                && (doorMask(location) & (D_CLOSED | D_LOCKED))) {
                continue;
            }
            if (!could_reach_item(monster, x, y, state)) continue;
            if (can_reach_location(
                monster,
                x,
                y,
                goalX,
                goalY,
                state,
            )) {
                return true;
            }
        }
    }
    return false;
}

function nearestVisibleGoal(monster, state, clearArea) {
    let distance = FARAWAY * FARAWAY;
    let goal = null;
    clearArea(
        monster.mx,
        monster.my,
        9,
        (x, y) => {
            const nextDistance = dist2(x, y, state.u.ux, state.u.uy);
            if (distance > nextDistance) {
                goal = { x, y };
                distance = nextDistance;
            }
        },
        null,
        state,
    );
    return goal;
}

// C ref: dogmove.c dog_goal(). Food classification, droppable selection,
// carry capacity, and the fallback clear-area scan retain source control flow.
export function dog_goal(
    monster,
    edog,
    after,
    heroDistance,
    whistleApproach,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const hero = state.u;
    if (monster === hero?.usteed) return -2;

    const random = rawEnv.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('dog_goal random injection requires rn2');
    const dogfood = goalOperation(rawEnv, 'dogfood', classifyDogFood);
    const findDroppable = goalOperation(rawEnv, 'droppables', droppables);
    const canCarry = goalOperation(rawEnv, 'canCarry', can_carry);
    const couldSee = rawEnv.couldSee
        ?? ((x, y) => couldsee(x, y, state));
    const petCanSee = rawEnv.petCanSee
        ?? ((subject, x, y) =>
            clear_path(subject.mx, subject.my, x, y));
    const canReach = rawEnv.canReachLocation
        ?? ((subject, fromX, fromY, toX, toY) =>
            can_reach_location(
                subject,
                fromX,
                fromY,
                toX,
                toY,
                state,
            ));
    const clearArea = rawEnv.clearArea ?? do_clear_area;
    const operationEnv = { ...rawEnv, state, random };
    const goal = state.gg ??= {};
    const originX = monster.mx;
    const originY = monster.my;
    const masterVisible = couldSee(originX, originY, operationEnv);
    const hasDroppable = Boolean(findDroppable(monster, operationEnv));

    if (!edog || monster.mleashed) {
        goal.gtyp = APPORT;
        goal.gx = hero.ux;
        goal.gy = hero.uy;
    } else {
        goal.gtyp = UNDEF;
        goal.gx = 0;
        goal.gy = 0;
        const minX = Math.max(1, originX - SQSRCHRADIUS);
        const maxX = Math.min(COLNO - 1, originX + SQSRCHRADIUS);
        const minY = Math.max(0, originY - SQSRCHRADIUS);
        const maxY = Math.min(ROWNO - 1, originY + SQSRCHRADIUS);

        for (let obj = state.level?.objlist ?? null; obj; obj = obj.nobj) {
            const x = obj.ox;
            const y = obj.oy;
            if (x < minX || x > maxX || y < minY || y > maxY)
                continue;
            const foodType = dogfood(monster, obj, operationEnv);
            if (foodType > goal.gtyp || foodType === UNDEF) continue;
            if (cursed_object_at(x, y, state)
                && !(edog.mhpmax_penalty && foodType < MANFOOD)) {
                continue;
            }
            if (!could_reach_item(monster, x, y, state)
                || !canReach(
                    monster,
                    originX,
                    originY,
                    x,
                    y,
                    operationEnv,
                )) {
                continue;
            }
            if (foodType < MANFOOD) {
                if (foodType < goal.gtyp
                    || dist2(x, y, originX, originY)
                        < dist2(goal.gx, goal.gy, originX, originY)) {
                    goal.gx = x;
                    goal.gy = y;
                    goal.gtyp = foodType;
                }
            } else if (goal.gtyp === UNDEF && masterVisible
                && !hasDroppable
                && (!state.level.at(originX, originY).lit
                    || state.level.at(hero.ux, hero.uy).lit)
                && (foodType === MANFOOD
                    || petCanSee(monster, x, y, operationEnv))
                && edog.apport > random.rn2(8)
                && canCarry(monster, obj, operationEnv) > 0) {
                goal.gx = x;
                goal.gy = y;
                goal.gtyp = APPORT;
            }
        }
    }

    let approach;
    if (goal.gtyp === UNDEF
        || (goal.gtyp !== DOGFOOD && goal.gtyp !== APPORT
            && state.moves < edog.hungrytime)) {
        goal.gx = hero.ux;
        goal.gy = hero.uy;
        if (after && heroDistance <= 4) return -2;
        approach = heroDistance >= 9 ? 1 : monster.mflee ? -1 : 0;
        if (heroDistance > 1
            && (!IS_ROOM(state.level.at(hero.ux, hero.uy).typ)
                || random.rn2(4) === 0
                || whistleApproach
                || (hasDroppable && random.rn2(edog.apport) !== 0))) {
            approach = 1;
        }
        if (approach === 0) {
            if (onStairs(hero.ux, hero.uy, state)) {
                approach = 1;
            } else {
                for (let obj = state.invent ?? state.gi?.invent ?? null;
                    obj;
                    obj = obj.nobj) {
                    if (dogfood(monster, obj, operationEnv) === DOGFOOD) {
                        approach = 1;
                        break;
                    }
                }
                if (approach === 0) {
                    for (const trap of state.level?.traps ?? []) {
                        if (trap.ttyp !== MAGIC_PORTAL) continue;
                        if (dist2(hero.ux, hero.uy, trap.tx, trap.ty) <= 2)
                            approach = 1;
                        break;
                    }
                }
            }
        }
    } else {
        approach = 1;
    }
    if (monster.mconf) approach = 0;

    if (goal.gx === hero.ux && goal.gy === hero.uy && !masterVisible) {
        const track = gettrack(originX, originY, state);
        if (track) {
            goal.gx = track.x;
            goal.gy = track.y;
            if (edog) edog.ogoal.x = 0;
        } else if (edog?.ogoal?.x
            && (edog.ogoal.x !== originX || edog.ogoal.y !== originY)) {
            goal.gx = edog.ogoal.x;
            goal.gy = edog.ogoal.y;
            edog.ogoal.x = 0;
        } else {
            const found = nearestVisibleGoal(monster, state, clearArea);
            if (!found
                || (found.x === originX && found.y === originY)) {
                goal.gx = hero.ux;
                goal.gy = hero.uy;
            } else {
                goal.gx = found.x;
                goal.gy = found.y;
                if (edog) {
                    edog.ogoal.x = found.x;
                    edog.ogoal.y = found.y;
                }
            }
        }
    } else if (edog) {
        edog.ogoal.x = 0;
    }

    return approach;
}
