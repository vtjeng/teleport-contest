// Ordinary monster movement selection and coordinate update.
// C ref: monmove.c m_move(), ordinary not_special path through postmov().

import {
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_ROCK,
    ALLOW_U,
    INVIS,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOMOVES,
    MMOVE_NOTHING,
    MTSZ,
    NOTONL,
} from './const.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import {
    haseyes,
    is_unicorn,
    is_wanderer,
    perceives,
} from './mondata.js';
import {
    PM_STALKER,
    S_BAT,
    S_LIGHT,
} from './monsters.js';
import {
    m_at,
    place_monster,
    remove_monster,
} from './monst.js';
import {
    mfndpos,
    mon_allowflags,
    mon_track_add,
    set_apparxy,
} from './monmove.js';
import { m_in_out_region } from './region.js';
import { rn2 } from './rng.js';
import { gettrack } from './track.js';
import { couldsee } from './vision.js';

function activeProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

function requiredOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`m_move requires a ${name} operation`);
    return operation;
}

// This bounded m_move() owner covers the ordinary new-game path. Special
// movers, aggression, displacement, and boulder breaking remain explicit
// seams until their source owners are connected.
export async function m_move_fresh(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const resolveTrappedMonster = requiredOperation(
        rawEnv,
        'resolveTrappedMonster',
    );
    const resistsTrapEffect = requiredOperation(
        rawEnv,
        'resistsTrapEffect',
    );
    const postMonsterMove = requiredOperation(rawEnv, 'postMonsterMove');
    const unsupported = requiredOperation(rawEnv, 'unsupported');
    const env = { ...rawEnv, state, random };
    const oldX = monster.mx;
    const oldY = monster.my;

    if (await resolveTrappedMonster(monster, env))
        return MMOVE_NOTHING;
    set_apparxy(monster, env);
    let goalX = monster.mux;
    let goalY = monster.muy;
    let approach = monster.mflee ? -1 : 1;

    if (monster.mconf) {
        approach = 0;
    } else {
        const sourceSquare = state.level.at(oldX, oldY);
        const goalSquare = state.level.at(goalX, goalY);
        const shouldSee = couldsee(oldX, oldY, state)
            && (goalSquare.lit || !sourceSquare.lit)
            && dist2(oldX, oldY, goalX, goalY) <= 36;
        if (!monster.mcansee
            || (shouldSee && activeProperty(state, INVIS)
                && !perceives(monster.data) && random.rn2(11))
            || state.u.uundetected
            || (monster.mpeaceful && !monster.isshk)
            || ((monster.data?.pmidx === PM_STALKER
                || monster.data?.mlet === S_BAT
                || monster.data?.mlet === S_LIGHT)
                && !random.rn2(3))) {
            approach = 0;
        }
        if (!shouldSee && haseyes(monster.data)) {
            const track = gettrack(oldX, oldY, state);
            if (track) {
                goalX = track.x;
                goalY = track.y;
            }
        }
    }

    // m_search_items() is inert under the simple-turn preflight's empty
    // search area. Preserve its source gate and let that preflight verify the
    // assumption only when the search is reached.
    if ((!monster.mpeaceful || !random.rn2(10))
        && typeof rawEnv.assertEmptyItemSearch === 'function') {
        rawEnv.assertEmptyItemSearch(monster, env);
    }

    const data = { cnt: 0, poss: [], info: [] };
    const count = mfndpos(
        monster,
        data,
        mon_allowflags(monster, env),
        { ...env, resistsTrapEffect },
    );
    if (!count && !is_unicorn(monster.data)) return MMOVE_NOMOVES;

    let nextX = oldX;
    let nextY = oldY;
    let chosen = -1;
    let choiceCount = 0;
    let moved = MMOVE_NOTHING;
    let nearestDistance = dist2(oldX, oldY, goalX, goalY);
    if (!monster.mpeaceful && state.level.flags?.shortsighted
        && nearestDistance > (couldsee(oldX, oldY, state) ? 144 : 36)
        && approach === 1) {
        approach = 0;
    }

    let avoidLine = false;
    if (is_unicorn(monster.data) && rawEnv.noTeleportLevel?.(monster)) {
        avoidLine = data.info.some((info) => !(info & NOTONL));
    }
    const trackLimit = Math.min(MTSZ, count - 1);
    for (let index = 0; index < count; ++index) {
        if (avoidLine && (data.info[index] & NOTONL)) continue;
        const { x, y } = data.poss[index];
        if (rawEnv.avoidKicked?.(monster, x, y, env)) continue;
        if (m_at(x, y, state)
            && (data.info[index] & ALLOW_MDISP)
            && !(data.info[index] & ALLOW_M)) {
            continue;
        }
        let rejectTrack = false;
        if (approach !== 0) {
            for (let trackIndex = 0;
                trackIndex < trackLimit;
                ++trackIndex) {
                if (x === monster.mtrack[trackIndex].x
                    && y === monster.mtrack[trackIndex].y
                    && random.rn2(4 * (count - trackIndex))) {
                    rejectTrack = true;
                    break;
                }
            }
        }
        if (rejectTrack) continue;

        const distance = dist2(x, y, goalX, goalY);
        const nearer = distance < nearestDistance;
        if ((approach === 1 && nearer)
            || (approach === -1 && !nearer)
            || (!approach && !random.rn2(++choiceCount))
            || moved === MMOVE_NOTHING) {
            nextX = x;
            nextY = y;
            nearestDistance = distance;
            chosen = index;
            moved = MMOVE_MOVED;
        }
    }
    if (moved === MMOVE_NOTHING) return moved;
    if (data.info[chosen] & ALLOW_U) {
        nextX = monster.mux;
        nextY = monster.muy;
    }
    if (nextX === state.u.ux && nextY === state.u.uy) {
        monster.mux = state.u.ux;
        monster.muy = state.u.uy;
        return MMOVE_NOTHING;
    }
    if ((data.info[chosen] & ALLOW_M)
        || (nextX === monster.mux && nextY === monster.muy
            && m_at(nextX, nextY, state))) {
        unsupported('ordinary monster aggression');
    }
    if (data.info[chosen] & ALLOW_MDISP)
        unsupported('ordinary monster displacement');
    const mayCrossRegion = rawEnv.mayCrossRegion ?? m_in_out_region;
    if (!await mayCrossRegion(monster, nextX, nextY, env))
        return MMOVE_DONE;
    if (data.info[chosen] & ALLOW_ROCK)
        unsupported('ordinary monster boulder breaking');

    remove_monster(oldX, oldY, state);
    place_monster(monster, nextX, nextY, state);
    mon_track_add(monster, oldX, oldY);
    return postMonsterMove(
        monster,
        oldX,
        oldY,
        MMOVE_MOVED,
        env,
    );
}
