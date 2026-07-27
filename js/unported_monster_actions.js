// The fail-closed boundary for monster actions. This file holds no port; the
// ports of monmove.c and dogmove.c live in js/monmove.js and js/dogmove.js.
//
// Every action is first dry-run against a cloned ISAAC context and cloned
// monster state. If the dry run selects a branch that is not ported yet, it
// throws before the live game or its PRNG has changed, so the replay stops on
// the last matching screen instead of diverging. runSimpleMonsterAction()
// executes one already-preflighted action and is shared by the clone-only
// planning pass and the live movemon() adapter.
//
// Delete this file once ported coverage makes the boundary unnecessary.

import {
    BURN,
    CONFLICT,
    CORR,
    DOOR,
    HEADSTONE,
    I_SPECIAL,
    INVIS,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    MON_FLOOR,
    MON_MIGRATING,
    NEED_WEAPON,
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
    find_targ,
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
    dochug,
    dochugw,
    m_avoid_kicked_loc,
    m_avoid_soko_push_loc,
    m_move,
    select_postmove_object_action,
} from './monmove.js';
import { select_fresh_monster_item_action } from './muse.js';
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
import {
    mon_wield_item,
    select_hwep,
    select_rwep,
} from './weapon.js';

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

function activeProperty(state, property, blockedMatters = true) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && (!blockedMatters || !value?.blocked);
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
    if (activeProperty(state, CONFLICT, false))
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
    if (monster.mconf || monster.mstun || monster.meating)
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
        // uhitm.c:do_attack() can call monflee(rnd(6), FALSE, FALSE) when
        // safe_pet refuses an attack. mon.c:m_calcdistress() decrements this
        // seven-bit timer during once-per-turn distress, before the later
        // dochug() action scan, so a live fleeing starting pet must retain a
        // positive source-bounded timeout here.
        if (monster.mflee
            && (!Number.isInteger(monster.mfleetim)
                || monster.mfleetim < 1
                || monster.mfleetim > 127)) {
            unsupported('altered monster movement state');
        }
        if (monster.minvent
            && !hasOnlyInertStartingSaddle(monster, state)) {
            unsupported('pet inventory');
        }
        return;
    }

    if (monster.mtame || monster.isminion)
        unsupported('minion movement');
    if (monster.mflee)
        unsupported('altered monster movement state');
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
    if (attacktype(monster.data, AT_MAGC))
        unsupported('monster ranged or magical action');
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
            // vision.c keeps one cached transparency index. Planning replaces
            // only monster identities and retains the active geometry which
            // produced that index, so off-hero do_clear_area() may share it.
            _visionTransparencyOwner: state.level,
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

function ordinaryMonsterCanSeeHero(monster, state) {
    return (!activeProperty(state, INVIS) || perceives(monster.data))
        && !state.u.uinwater
        && couldsee(monster.mx, monster.my, state);
}

function resistsTrapEffect() {
    unsupported('monster trap-resistance evaluation');
}

function assertSimpleDestination(monster, x, y, env) {
    const { state } = env;
    const location = state.level.at(x, y);
    const doorMask = location?.flags || location?.doormask || 0;
    const ordinaryDestination = location
        && (location.typ === ROOM
            || location.typ === CORR
            || (location.typ === DOOR && doorMask === 0));
    if (!ordinaryDestination)
        unsupported('door or special terrain movement');
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
    if (status === MMOVE_MOVED) {
        assertSimpleDestination(monster, monster.mx, monster.my, env);
        if (!env.planning) {
            const redraw = env.redraw ?? newsym;
            redraw(oldX, oldY);
            redraw(monster.mx, monster.my);
        }
    }
    if ((status === MMOVE_MOVED || status === MMOVE_DONE)
        && env.state.level.objects[monster.mx]?.[monster.my]) {
        const selected = select_postmove_object_action(
            monster,
            monster.mx,
            monster.my,
            {
                ...env,
                touchArtifact: () =>
                    unsupported('monster artifact item interaction'),
            },
        );
        if (selected)
            unsupported('ordinary monster item interaction');
    }
    return status;
}

async function moveSimpleOrdinary(monster, env) {
    return m_move(monster, {
        ...env,
        mayCrossRegion: assertSimpleDestination,
        postMonsterMove: postSimpleMove,
        resolveTrappedMonster: () => false,
        resistsTrapEffect,
        unsupported,
    });
}

function rejectPetRangedTarget(monster, _forced, env) {
    if (!monster.mcansee) return MMOVE_NOTHING;
    for (let dy = -1; dy <= 1; ++dy) {
        for (let dx = -1; dx <= 1; ++dx) {
            if (!dx && !dy) continue;
            const target = find_targ(monster, dx, dy, 7, env);
            // score_targ() rejects the remembered hero before its random
            // fuzz. Any monster target enters the unowned scoring branch.
            if (target && target !== env.state.youmonst)
                unsupported('pet ranged targeting');
        }
    }
    return MMOVE_NOTHING;
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
        petRangedAttack: rejectPetRangedTarget,
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
        // One dochug() now serves both, as in C. m_move() picks the mover.
        dochug: (subject, actionEnv) => dochug(subject, {
                ...actionEnv,
                attackHero: () => unsupported('monster attack on the hero'),
                monFlee: () => unsupported('monster flight'),
                monsterCanSeeHero: ordinaryMonsterCanSeeHero,
                moveMonster: moveSimpleOrdinary,
                postMoveRangedAttack: (weaponUser, weaponEnv) => {
                    const selected = select_rwep(weaponUser, {
                        ...weaponEnv,
                        touchArtifact: () => unsupported(
                            'monster artifact weapon selection',
                        ),
                    });
                    if (selected)
                        unsupported('monster ranged weapon action');
                    if (weaponUser.weapon_check === NEED_WEAPON
                        || !weaponUser.mw) {
                        weaponUser.weapon_check = NEED_WEAPON;
                    }
                },
                selectRangedWeapon: () =>
                    unsupported('monster ranged weapon selection'),
                usePreMoveItems: (itemUser, itemEnv) => {
                    const selected = select_fresh_monster_item_action(
                        itemUser,
                        itemEnv,
                    );
                    if (selected) unsupported('monster item use');
                    return false;
                },
                wieldMonsterItem: async (weaponUser, weaponEnv) => {
                    const selectionEnv = {
                        ...weaponEnv,
                        touchArtifact: () =>
                            unsupported('monster artifact weapon selection'),
                    };
                    const selected = select_hwep(
                        weaponUser,
                        selectionEnv,
                    );
                    if (selected
                        && weaponUser.mw?.otyp !== selected.otyp) {
                        unsupported('monster wield action');
                    }
                    return mon_wield_item(weaponUser, selectionEnv);
                },
                wakeMessage: env.planning ? () => {} : wake_msg,
                wipeEngraving: wipeSimpleEngraving,
                finishEating: () => unsupported('pet eating'),
                movePet: moveSimplePet,
                postMonsterMove: postSimpleMove,
                preflight: assertSimpleActionState,
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
    return {
        runsOncePerTurnUpkeep:
            !somebodyCanMove && heroMovement < NORMAL_SPEED,
    };
}
