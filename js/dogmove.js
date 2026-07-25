// Runtime pet movement.
// C ref: dogmove.c dog_move().

import {
    ACCFOOD,
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_TRAPS,
    ALLOW_U,
    CONFLICT,
    DEAF,
    DISMOUNT_THROWN,
    MANFOOD,
    M_ATTK_DEF_DIED,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    MTSZ,
} from './const.js';
import { dogfood as classifyDogFood } from './dogfood.js';
import { dog_hunger } from './dogmove_hunger.js';
import {
    could_reach_item,
    cursed_object_at,
    dog_goal,
    droppables,
} from './dogmove_goal.js';
import { dog_invent } from './dogmove_inventory.js';
import { game } from './gstate.js';
import { dist2, distmin } from './hacklib.js';
import { can_carry } from './moncarry.js';
import {
    haseyes,
    perceives,
    resist_conflict,
    touch_petrifies,
} from './mondata.js';
import {
    MS_GUARDIAN,
    MS_LEADER,
    PM_FLOATING_EYE,
    PM_GELATINOUS_CUBE,
} from './monsters.js';
import {
    m_at,
    place_monster,
    remove_monster,
} from './monst.js';
import { rn2 } from './rng.js';
import { t_at } from './trap.js';
import {
    mfndpos,
    mon_allowflags,
    mon_track_add,
    should_displace,
    undesirable_disp,
} from './monmove.js';

export {
    can_reach_location,
    could_reach_item,
    cursed_object_at,
    dog_goal,
    droppables,
} from './dogmove_goal.js';
export { dog_hunger } from './dogmove_hunger.js';
export { dog_invent } from './dogmove_inventory.js';

function petMoveOperation(rawEnv, name) {
    const operation = rawEnv[name];
    if (typeof operation !== 'function')
        throw new TypeError(`dog_move requires a ${name} operation`);
    return operation;
}

function conflictActive(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic)
        && !conflict?.blocked;
}

function heroDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(deafness?.intrinsic || deafness?.extrinsic)
        && !deafness?.blocked;
}

function monsterOffMap(monster) {
    return monster.mx === 0;
}

function setMonsterAttackPosition(target, x, y, state) {
    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = x;
    state.gb.bhitpos.y = y;
    state.gn ??= {};
    state.gn.notonhead = target.mx !== x || target.my !== y;
}

function normalizePetMoveEnv(rawEnv) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('dog_move random injection requires rn2');
    return {
        ...rawEnv,
        state,
        random,
        accfood: rawEnv.accfood ?? ACCFOOD,
        canCarry: rawEnv.canCarry ?? can_carry,
        dogfood: rawEnv.dogfood ?? classifyDogFood,
        droppables: rawEnv.droppables ?? droppables,
        couldReachItem: rawEnv.couldReachItem ?? could_reach_item,
        cursedObjectAt: rawEnv.cursedObjectAt ?? cursed_object_at,
        findPositions: rawEnv.findPositions ?? mfndpos,
        monAllowFlags: rawEnv.monAllowFlags ?? mon_allowflags,
    };
}

// Own the x-major mfndpos candidate scan, source tie-breaking draws, and
// coordinate movement. Combat, object mutation, region crossing, and
// post-move effects remain with their injected upstream owners.
export async function dog_move(monster, after, rawEnv = {}) {
    const env = normalizePetMoveEnv(rawEnv);
    const { random, state } = env;
    const edog = monster.mtame && !monster.isminion
        ? monster.mextra?.edog : null;
    if (!edog && !monster.isminion) {
        rawEnv.impossible?.('dog_move for non-pet?');
        return MMOVE_NOTHING;
    }
    if (edog && await dog_hunger(monster, edog, env)) return MMOVE_DIED;

    const originX = monster.mx;
    const originY = monster.my;
    let heroDistance = dist2(originX, originY, state.u.ux, state.u.uy);
    if (monster === state.u.usteed) {
        const resistConflict = env.resistConflict
            ?? ((subject) => resist_conflict(subject, state, random));
        if (conflictActive(state) && !resistConflict(monster, env)) {
            await petMoveOperation(env, 'dismountSteed')(
                DISMOUNT_THROWN,
                env,
            );
            return MMOVE_MOVED;
        }
        heroDistance = 1;
    } else if (!heroDistance) {
        return MMOVE_NOTHING;
    }

    let nextX = originX;
    let nextY = originY;
    let eatAfterMoving = null;
    const curseMessages = new Array(9).fill(false);

    let whistleApproach = false;
    if (edog) {
        const inventoryResult = await dog_invent(
            monster,
            edog,
            heroDistance,
            env,
        );
        const offMap = (env.monsterOffMap ?? monsterOffMap)(monster, env);
        if (inventoryResult === MMOVE_DIED || offMap)
            return monster.mhp < 1 ? MMOVE_DIED : MMOVE_DONE;
        if (inventoryResult === MMOVE_MOVED) {
            if (monster.mleashed && heroDistance > 4) {
                await petMoveOperation(env, 'repositionLeashedPet')(
                    monster,
                    heroDistance,
                    nextX,
                    nextY,
                    env,
                );
            }
            return MMOVE_MOVED;
        }
        whistleApproach = state.moves - edog.whistletime < 5;
    }

    const approach = dog_goal(
        monster,
        edog,
        after,
        heroDistance,
        whistleApproach,
        env,
    );
    if (approach === -2) return MMOVE_NOTHING;
    if (conflictActive(state)) {
        const resistConflict = env.resistConflict
            ?? ((subject) => resist_conflict(subject, state, random));
        if (!resistConflict(monster, env) && !edog) {
            await petMoveOperation(env, 'loseGuardianAngel')(
                monster,
                env,
            );
            return MMOVE_DIED;
        }
    }

    const data = { cnt: 0, poss: [], info: [] };
    const allowflags = env.monAllowFlags(monster, env);
    const count = env.findPositions(monster, data, allowflags, env);
    let uncursedCount = 0;
    for (let index = 0; index < count; ++index) {
        const { x, y } = data.poss[index];
        if (m_at(x, y, state)
            && !(data.info[index] & (ALLOW_M | ALLOW_MDISP))) {
            continue;
        }
        if (!env.cursedObjectAt(x, y, state)) uncursedCount++;
    }

    const betterWithDisplacing = should_displace(
        monster,
        data,
        state.gg.gx,
        state.gg.gy,
        env,
    );
    let chosenIndex = -1;
    let choiceCount = 0;
    let nearestDistance = dist2(
        nextX,
        nextY,
        state.gg.gx,
        state.gg.gy,
    );

    for (let index = 0; index < count; ++index) {
        const { x, y } = data.poss[index];
        if (monster.mleashed
            && dist2(x, y, state.u.ux, state.u.uy) > 4) {
            continue;
        }
        if (!edog) {
            const distance = dist2(x, y, state.u.ux, state.u.uy);
            if (distance > 16 && distance >= heroDistance) continue;
        }

        const occupant = m_at(x, y, state);
        if ((data.info[index] & ALLOW_M) && occupant) {
            const balk = monster.m_lev
                + Math.trunc(5 * monster.mhp / monster.mhpmax) - 2;
            if (occupant.m_lev >= balk
                || (occupant.mtame && monster.mtame
                    && !conflictActive(state))
                || petMoveOperation(env, 'maxPassiveDamage')(
                    occupant,
                    monster,
                    env,
                ) >= monster.mhp
                || ((monster.mhp * 4 < monster.mhpmax
                    || occupant.data?.msound === MS_GUARDIAN
                    || occupant.data?.msound === MS_LEADER)
                    && occupant.mpeaceful
                    && !conflictActive(state))) {
                continue;
            }
            const hazardousTarget = (
                occupant.data?.pmidx === PM_FLOATING_EYE
                    && random.rn2(10)
                    && monster.mcansee
                    && haseyes(monster.data)
                    && occupant.mcansee
                    && (!occupant.minvis || perceives(monster.data))
                    && !petMoveOperation(env, 'monsterReflects')(
                        monster,
                        env,
                    )
            ) || (occupant.data?.pmidx === PM_GELATINOUS_CUBE
                && random.rn2(10))
                || (touch_petrifies(occupant.data)
                    && !petMoveOperation(env, 'resistsStone')(
                        monster,
                        env,
                    ));
            if (hazardousTarget) {
                if (dist2(
                    monster.mx,
                    monster.my,
                    occupant.mx,
                    occupant.my,
                ) <= 2 || petMoveOperation(env, 'bestTarget')(
                    monster,
                    false,
                    env,
                ) !== occupant) {
                    continue;
                }
                // dogmove.c sets ranged_only here, then immediately skips the
                // target due to its retained FIXME.
                continue;
            }
            if (after) return MMOVE_NOTHING;
            setMonsterAttackPosition(occupant, x, y, state);
            const result = await petMoveOperation(env, 'attackMonster')(
                monster,
                occupant,
                after,
                env,
            );
            if (result !== MMOVE_DONE && result !== MMOVE_DIED)
                throw new RangeError('dog_move attackMonster status');
            return result;
        }
        if ((data.info[index] & ALLOW_MDISP) && occupant
            && betterWithDisplacing
            && !undesirable_disp(monster, x, y, env)) {
            const result = await petMoveOperation(env, 'displaceMonster')(
                monster,
                occupant,
                env,
            );
            return result & M_ATTK_DEF_DIED
                ? MMOVE_DIED : MMOVE_NOTHING;
        }
        if (petMoveOperation(env, 'avoidKicked')(
            monster,
            x,
            y,
            env,
        ) || petMoveOperation(env, 'avoidSokobanPush')(
            monster,
            x,
            y,
            env,
        )) {
            continue;
        }

        const trap = (data.info[index] & ALLOW_TRAPS)
            ? t_at(x, y, state) : null;
        if (trap) {
            if (monster.mleashed) {
                if (!heroDeaf(state)) {
                    await petMoveOperation(env, 'whimper')(monster, env);
                }
            } else if (trap.tseen && random.rn2(40)) {
                continue;
            }
        }

        if (edog) {
            const canReachFood = env.couldReachItem(
                monster,
                x,
                y,
                state,
            );
            for (let obj = state.level?.objects?.[x]?.[y] ?? null;
                obj;
                obj = obj.nexthere) {
                if (obj.cursed) {
                    curseMessages[index] = true;
                    continue;
                }
                if (!canReachFood) continue;
                const foodType = env.dogfood(monster, obj, env);
                if (foodType < MANFOOD
                    && (foodType < env.accfood
                        || edog.hungrytime <= state.moves)) {
                    nextX = x;
                    nextY = y;
                    chosenIndex = index;
                    eatAfterMoving = obj;
                    curseMessages[index] = false;
                    break;
                }
            }
            if (eatAfterMoving) break;
        }
        if (curseMessages[index] && !monster.mleashed
            && uncursedCount > 0
            && random.rn2(13 * uncursedCount)) {
            continue;
        }

        if (!monster.mleashed
            && distmin(
                monster.mx,
                monster.my,
                state.u.ux,
                state.u.uy,
            ) > 5) {
            const backtrackCount = edog ? uncursedCount : count;
            let rejected = false;
            for (let trackIndex = 0;
                trackIndex < MTSZ && trackIndex < backtrackCount - 1;
                ++trackIndex) {
                if (x === monster.mtrack[trackIndex].x
                    && y === monster.mtrack[trackIndex].y
                    && random.rn2(MTSZ * (backtrackCount - trackIndex))) {
                    rejected = true;
                    break;
                }
            }
            if (rejected) continue;
        }

        const distance = dist2(x, y, state.gg.gx, state.gg.gy);
        const relative = (distance - nearestDistance) * approach;
        if ((relative === 0 && !random.rn2(++choiceCount))
            || relative < 0
            || (relative > 0 && !whistleApproach
                && ((originX === nextX && originY === nextY
                    && !random.rn2(3))
                    || !random.rn2(12)))) {
            nextX = x;
            nextY = y;
            nearestDistance = distance;
            if (relative < 0) choiceCount = 0;
            chosenIndex = index;
        }
    }

    if (!eatAfterMoving) {
        const rangedResult = await petMoveOperation(
            env,
            'petRangedAttack',
        )(monster, false, env);
        if (rangedResult !== MMOVE_NOTHING) return rangedResult;
    }

    if (nextX !== originX || nextY !== originY) {
        if (data.info[chosenIndex] & ALLOW_U) {
            if (monster.mleashed) {
                await petMoveOperation(env, 'reportLeashBreak')(
                    monster,
                    env,
                );
                petMoveOperation(env, 'unleashMonster')(monster, false, env);
            }
            await petMoveOperation(env, 'attackHero')(monster, env);
            return MMOVE_DONE;
        }
        if (!await petMoveOperation(env, 'mayCrossRegion')(
            monster,
            nextX,
            nextY,
            env,
        )) {
            return MMOVE_MOVED;
        }
        if (petMoveOperation(env, 'digWeaponCheck')(
            monster,
            nextX,
            nextY,
            env,
        )) {
            return MMOVE_NOTHING;
        }
        const wasSeen = Boolean(petMoveOperation(env, 'canSeeMonster')(
            monster,
            state,
        ));
        remove_monster(originX, originY, state);
        place_monster(monster, nextX, nextY, state);
        if (curseMessages[chosenIndex]
            && (wasSeen || Boolean(petMoveOperation(
                env,
                'canSeeMonster',
            )(monster, state)))) {
            await petMoveOperation(env, 'reportCursedStep')(
                monster,
                { ...env, wasSeen },
            );
        }
        mon_track_add(monster, originX, originY);
        if (eatAfterMoving) {
            const result = await petMoveOperation(env, 'eatObject')(
                monster,
                eatAfterMoving,
                originX,
                originY,
                false,
                env,
            );
            if (result === MMOVE_DIED) return MMOVE_DIED;
        }
    } else if (monster.mleashed && heroDistance > 4) {
        await petMoveOperation(env, 'repositionLeashedPet')(
            monster,
            heroDistance,
            nextX,
            nextY,
            env,
        );
    }
    // Upstream reports a completed pet movement opportunity as MMOVE_MOVED
    // even when no candidate changed the coordinates.  m_move() uses this
    // result to run postmov() and finish the action.
    return MMOVE_MOVED;
}
