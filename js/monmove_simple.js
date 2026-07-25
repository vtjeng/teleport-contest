// Atomic ordinary monster and starting-pet actions for the simple second turn.
// C refs: monmove.c dochugw(), dochug(), m_move(); dogmove.c dog_move().

import {
    BURN,
    CONFLICT,
    CORR,
    HEADSTONE,
    I_SPECIAL,
    INVIS,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    MON_FLOOR,
    MON_MIGRATING,
    NORMAL_SPEED,
    ROOM,
    STRAT_ARRIVE,
    STRAT_CLOSE,
    W_SADDLE,
} from './const.js';
import { newsym } from './display.js';
import {
    dog_move,
    droppables,
} from './dogmove.js';
import { engr_at } from './engrave.js';
import { game } from './gstate.js';
import { wake_msg } from './mon.js';
import {
    attacktype,
    can_teleport,
    is_covetous,
    is_hider,
    perceives,
} from './mondata.js';
import {
    AT_MAGC,
    AT_WEAP,
    PM_ERINYS,
    PM_GELATINOUS_CUBE,
    PM_KILLER_BEE,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_MEDUSA,
    PM_PONY,
    PM_SHRIEKER,
    S_EEL,
} from './monsters.js';
import {
    dochugw,
    m_avoid_kicked_loc,
    m_avoid_soko_push_loc,
} from './monmove.js';
import {
    dochug_fresh_monster,
} from './monmove_dochug.js';
import {
    dochug_fresh_pet,
} from './monmove_dochug_pet.js';
import { m_move_fresh } from './monmove_move.js';
import { SADDLE } from './objects.js';
import {
    inside_region,
    mon_in_region,
} from './region.js';
import {
    createCoreRandom,
    d,
    rn1,
    rn2,
    rnd,
    rne,
    rnl,
    rnz,
} from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    collectMonsterNoticeMessage,
} from './startup_a11y.js';
import { is_ice } from './terrain.js';
import {
    is_lava,
    is_pool,
    t_at,
} from './trap.js';
import { ttyPline } from './tty_message.js';
import { couldsee } from './vision.js';

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);
const SPECIAL_RESPONDERS = new Set([PM_SHRIEKER, PM_MEDUSA, PM_ERINYS]);

export class UnsupportedSimpleMonsterActionError extends Error {
    constructor(reason) {
        super(`simple monster action requires ${reason}`);
        this.name = 'UnsupportedSimpleMonsterActionError';
        this.reason = reason;
    }
}

function unsupported(reason) {
    throw new UnsupportedSimpleMonsterActionError(reason);
}

function activeProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

function liveOnMap(monster) {
    return monster.mhp > 0
        && (monster.mstate ?? MON_FLOOR) === MON_FLOOR;
}

// C refs: dog.c:makedog(), dogmove.c:droppables(). A Knight's starting pony
// carries a worn saddle, but dog_invent() cannot select that saddle to drop.
export function hasOnlyInertStartingSaddle(monster, state) {
    const saddle = monster.minvent;
    return monster.data?.pmidx === PM_PONY
        && state.context?.startingpet_mid === monster.m_id
        && monster.misc_worn_check === W_SADDLE
        && saddle?.otyp === SADDLE
        && saddle.owornmask === W_SADDLE
        && saddle.leashmon === monster.m_id
        && !saddle.nobj
        && droppables(monster) === null;
}

function assertSimpleScanState(monster, state) {
    const parkedGuard = monster.isgd
        && !monster.mx
        && !((monster.mstate ?? MON_FLOOR) & MON_MIGRATING);
    if (parkedGuard) {
        if ((state.moves ?? 0) > (monster.mlstmv ?? 0))
            unsupported('parked guard handling');
        return false;
    }
    if (!liveOnMap(monster) || monster.movement < NORMAL_SPEED) return false;
    if (monster.misc_worn_check & I_SPECIAL)
        unsupported('monster equipment changes');
    if (is_pool(monster.mx, monster.my, state)
        || is_lava(monster.mx, monster.my, state)) {
        unsupported('monster liquid effects');
    }
    if (is_hider(monster.data) || monster.data?.mlet === S_EEL)
        unsupported('monster hiding');
    if (activeProperty(state, CONFLICT))
        unsupported('conflict combat');
    return true;
}

function assertSimpleActionState(monster, state) {
    if (!monster.mcanmove) return;
    if (monster.mstrategy & STRAT_ARRIVE)
        unsupported('monster arrival strategy');
    if (monster.mstrategy & STRAT_CLOSE)
        unsupported('quest wait strategy');
    if (monster.mfrozen)
        unsupported('inconsistent frozen monster state');
    if (monster.mtrapped)
        unsupported('a trapped monster');
    if (monster.mconf || monster.mstun || monster.mflee || monster.meating)
        unsupported('altered monster movement state');

    if (monster.mtame && !monster.isminion) {
        if (!STARTING_PETS.has(monster.data?.pmidx))
            unsupported('a non-starting pet');
        if (monster.msleeping || monster.mleashed
            || monster === state.u?.usteed) {
            unsupported('special starting-pet state');
        }
        if (!monster.mextra?.edog)
            unsupported('missing starting-pet state');
        if (monster.minvent
            && !hasOnlyInertStartingSaddle(monster, state)) {
            unsupported('pet inventory');
        }
        return;
    }

    if (monster.mtame || monster.isminion)
        unsupported('minion movement');
    if (monster.wormno || monster.isshk || monster.isgd
        || monster.ispriest || is_covetous(monster.data)) {
        unsupported('special monster movement');
    }
    if (SPECIAL_RESPONDERS.has(monster.data?.pmidx)
        || can_teleport(monster.data)
        || monster.data?.pmidx === PM_KILLER_BEE
        || monster.data?.pmidx === PM_GELATINOUS_CUBE) {
        unsupported('a special monster action');
    }
    if (monster.minvent || attacktype(monster.data, AT_WEAP)
        || attacktype(monster.data, AT_MAGC)) {
        unsupported('monster item or ranged action');
    }
}

function cloneIsaacContext(context) {
    if (!context
        || !Array.isArray(context.m)
        || !Array.isArray(context.r)) {
        throw new TypeError('simple preflight requires initialized core RNG');
    }
    return {
        ...context,
        m: [...context.m],
        r: [...context.r],
    };
}

function clonedRandom(state) {
    const context = cloneIsaacContext(state.coreCtx);
    return createCoreRandom(context, state);
}

function cloneMonster(monster) {
    return {
        ...monster,
        mgoal: monster.mgoal ? { ...monster.mgoal } : monster.mgoal,
        mtrack: monster.mtrack?.map((position) => ({ ...position })),
        mextra: monster.mextra ? {
            ...monster.mextra,
            edog: monster.mextra.edog ? {
                ...monster.mextra.edog,
                ogoal: { ...monster.mextra.edog.ogoal },
            } : monster.mextra.edog,
        } : monster.mextra,
    };
}

function planningState(state) {
    const monsterMap = new Map();
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        monsterMap.set(monster, cloneMonster(monster));
    }
    for (const [original, clone] of monsterMap)
        clone.nmon = monsterMap.get(original.nmon) ?? null;

    const level = Object.assign(
        Object.create(Object.getPrototypeOf(state.level)),
        state.level,
        {
            monsters: state.level.monsters.map(
                (column) => column.map(
                    (monster) => monsterMap.get(monster) ?? null,
                ),
            ),
            monlist: monsterMap.get(state.level.monlist) ?? null,
            regions: state.level.regions.map((region) => ({
                ...region,
                monsters: [...(region.monsters ?? [])],
            })),
        },
    );
    const hero = {
        ...state.u,
        usteed: monsterMap.get(state.u?.usteed) ?? state.u?.usteed,
        ustuck: monsterMap.get(state.u?.ustuck) ?? state.u?.ustuck,
    };
    return {
        ...state,
        context: { ...state.context },
        gg: { ...state.gg },
        level,
        u: hero,
    };
}

function actionRandom(rawEnv) {
    return rawEnv.random ?? { d, rn1, rn2, rnd, rne, rnl, rnz };
}

function freshMonsterCanSeeHero(monster, state) {
    return (!activeProperty(state, INVIS) || perceives(monster.data))
        && !state.u.uinwater
        && couldsee(monster.mx, monster.my, state);
}

function resistsTrapEffect() {
    unsupported('monster trap-resistance evaluation');
}

function assertEmptyItemSearch(monster, env) {
    for (let object = env.state.level?.objlist ?? null;
        object;
        object = object.nobj) {
        if (Math.max(
            Math.abs(object.ox - monster.mx),
            Math.abs(object.oy - monster.my),
        ) <= 5) {
            unsupported('ordinary monster item search');
        }
    }
}

function assertSimpleDestination(monster, x, y, env) {
    const { state } = env;
    const location = state.level.at(x, y);
    if (location?.typ !== ROOM && location?.typ !== CORR)
        unsupported('door or special terrain movement');
    if (state.level.objects[x]?.[y])
        unsupported('a floor object');
    if (t_at(x, y, state))
        unsupported('trap activation');
    for (const region of state.level.regions) {
        if (region.attach_2_m === monster.m_id) continue;
        if (mon_in_region(region, monster)
            !== inside_region(region, x, y)) {
            unsupported('a region transition');
        }
    }
    return true;
}

function wipeSimpleEngraving(x, y, _count, _magical, env) {
    const engraving = engr_at(x, y, env.state);
    if (!engraving || engraving.engr_type === HEADSTONE
        || engraving.nowipeout
        || (engraving.engr_type === BURN && !is_ice(x, y, env.state))) {
        return;
    }
    unsupported('monster engraving wear');
}

async function postSimpleMove(monster, oldX, oldY, status, env) {
    const notice = collectMonsterNoticeMessage(monster, env.state);
    if (notice && !env.planning) {
        const message = env.message ?? ttyPline;
        await message(notice, env.state, env);
    }
    if (status !== MMOVE_MOVED) return status;
    assertSimpleDestination(monster, monster.mx, monster.my, env);
    if (!env.planning) {
        const redraw = env.redraw ?? newsym;
        redraw(oldX, oldY);
        redraw(monster.mx, monster.my);
    }
    return status;
}

async function moveSimpleOrdinary(monster, env) {
    return m_move_fresh(monster, {
        ...env,
        assertEmptyItemSearch,
        mayCrossRegion: assertSimpleDestination,
        postMonsterMove: postSimpleMove,
        resolveTrappedMonster: () => false,
        resistsTrapEffect,
        unsupported,
    });
}

async function moveSimplePet(monster, after, env) {
    return dog_move(monster, after, {
        ...env,
        attackHero: () => unsupported('pet attack on the hero'),
        attackMonster: () => unsupported('pet combat'),
        avoidKicked: (subject, x, y) =>
            m_avoid_kicked_loc(subject, x, y, env.state),
        avoidSokobanPush: (subject, x, y) =>
            m_avoid_soko_push_loc(subject, x, y, env.state),
        bestTarget: () => unsupported('pet ranged targeting'),
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        digWeaponCheck: () => false,
        displaceMonster: () => unsupported('pet displacement'),
        dropInventory: () => unsupported('pet inventory drop'),
        eatObject: () => unsupported('pet eating'),
        maxPassiveDamage: () => unsupported('pet combat evaluation'),
        mayCrossRegion: assertSimpleDestination,
        monsterReflects: () => unsupported('pet combat evaluation'),
        petRangedAttack: () => MMOVE_NOTHING,
        pickObject: () => unsupported('pet object pickup'),
        reportCursedStep: () => unsupported('pet cursed-object feedback'),
        resistsStone: () => unsupported('pet combat evaluation'),
        resistsTrapEffect,
    });
}

// Execute one already-preflighted monster action. The same function is used
// by the clone-only planning pass and the live movemon() adapter.
export async function runSimpleMonsterAction(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = actionRandom(rawEnv);
    const env = { ...rawEnv, state, random };
    assertSimpleActionState(monster, state);
    return dochugw(monster, true, {
        ...env,
        canSpotMonster: (subject) => canSpotMonster(subject, state),
        dochug: monster.mtame && !monster.isminion
            ? (subject, actionEnv) => dochug_fresh_pet(subject, {
                ...actionEnv,
                finishEating: () => unsupported('pet eating'),
                monFlee: () => unsupported('pet flight'),
                movePet: moveSimplePet,
                postMonsterMove: postSimpleMove,
                preflightPet: assertSimpleActionState,
                resolveTrappedMonster: () => false,
                wipeEngraving: wipeSimpleEngraving,
            })
            : (subject, actionEnv) => dochug_fresh_monster(subject, {
                ...actionEnv,
                attackHero: () => unsupported('monster attack on the hero'),
                monFlee: () => unsupported('monster flight'),
                monsterCanSeeHero: freshMonsterCanSeeHero,
                moveMonster: moveSimpleOrdinary,
                preflightMonster: assertSimpleActionState,
                wakeMessage: env.planning ? () => {} : wake_msg,
                wipeEngraving: wipeSimpleEngraving,
            }),
        stopOccupation: () => unsupported('occupation interruption'),
    });
}

// Dry-run every action scan against cloned coordinates and a cloned ISAAC
// context. Any excluded selected path throws while the live game and PRNG
// remain unchanged and retryable.
export async function preflightSimpleMonsterActions(state = game) {
    if (state.context?.bypasses || state.u?.utotype || state.occupation)
        unsupported('deferred monster cleanup or level transition');
    const planned = planningState(state);
    const random = clonedRandom(state);
    const heroMovement = state.u.umovement - NORMAL_SPEED;
    let somebodyCanMove;
    do {
        somebodyCanMove = false;
        for (let monster = planned.level.monlist;
            monster;
            monster = monster.nmon) {
            if (!assertSimpleScanState(monster, planned)) continue;
            monster.movement -= NORMAL_SPEED;
            if (monster.movement >= NORMAL_SPEED) somebodyCanMove = true;
            await runSimpleMonsterAction(monster, {
                state: planned,
                random,
                planning: true,
            });
        }
        if (heroMovement >= NORMAL_SPEED) break;
    } while (somebodyCanMove);
}
