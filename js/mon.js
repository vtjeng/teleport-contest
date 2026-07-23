// mon.js -- Runtime monster turn and inventory state.
// C refs: mon.c movemon(), mcalcmove(), curr_mon_load(), max_mon_load();
// mthrowu.c m_carrying().

import {
    BOLT_LIM,
    CONFLICT,
    DEAF,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    FULL_MOON,
    HALLUC,
    HALLUC_RES,
    I_SPECIAL,
    ismnum,
    MAX_CARR_CAP,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    MFAST,
    MON_FLOOR,
    MON_MIGRATING,
    MSLOW,
    NORMAL_SPEED,
    PROT_FROM_SHAPE_CHANGERS,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    WT_HUMAN,
} from './const.js';
import { night } from './calendar.js';
import { newsym } from './display.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { any_light_source } from './light.js';
import {
    dmonsfree,
    newcham_distress,
    pick_vampire_shape,
    preflight_newcham_distress,
    set_mon_data,
} from './makemon_create.js';
import {
    amorphous,
    is_female,
    is_hider,
    is_human,
    is_male,
    is_neuter,
    is_vampshifter,
    is_were,
    regenerates,
    strongmonst,
    throws_rocks,
} from './mondata.js';
import {
    G_UNIQ,
    MZ_MEDIUM,
    PM_FLESH_GOLEM,
    PM_FOG_CLOUD,
    PM_HUMAN_WEREJACKAL,
    PM_HUMAN_WERERAT,
    PM_HUMAN_WEREWOLF,
    PM_WEREJACKAL,
    PM_WERERAT,
    PM_WEREWOLF,
    S_EEL,
    S_VAMPIRE,
} from './monsters.js';
import { clear_splitobjs } from './obj.js';
import { BOULDER } from './objects.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';
import { canSeeMonster, canSpotMonster } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';

function monsterTurnEnv(env = {}) {
    const state = env.state ?? game;
    const moveSingleMonster = env.moveSingleMonster;
    const clearBypasses = env.clearBypasses;
    const deferredGoto = env.deferredGoto;
    if (typeof moveSingleMonster !== 'function')
        throw new TypeError('movemon requires a moveSingleMonster operation');
    if (typeof clearBypasses !== 'function')
        throw new TypeError('movemon requires a clearBypasses operation');
    if (typeof deferredGoto !== 'function')
        throw new TypeError('movemon requires a deferredGoto operation');
    return {
        ...env,
        state,
        moveSingleMonster,
        clearBypasses,
        deferredGoto,
    };
}

// C ref: mon.c iter_mons_safe(). Snapshot identities before the first
// callback so deletion and insertion can safely mutate the live monlist.
export async function iter_mons_safe(callback, state = game) {
    if (typeof callback !== 'function')
        throw new TypeError('iter_mons_safe requires a callback');
    const monsters = [];
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        monsters.push(monster);
    }
    for (const monster of monsters) {
        if (await callback(monster)) break;
    }
}

// C ref: mon.c movemon(). moveSingleMonster owns movemon_singlemon(). Its
// Boolean result means "terminate traversal", not "monster moved"; like C, it
// separately maintains state.somebody_can_move for movemon()'s return value.
// The other two required operations own worn.c clear_bypasses() and do.c
// deferred_goto(). They are preflighted together so an unavailable later
// boundary cannot leave a partially processed monster list.
export async function movemon(env = {}) {
    const normalized = monsterTurnEnv(env);
    const { state } = normalized;

    state.somebody_can_move = false;
    await iter_mons_safe(
        (monster) => normalized.moveSingleMonster(monster, normalized),
        state,
    );

    if (any_light_source(state)) state.vision_full_recalc = 1;
    if (state.context?.bypasses)
        await normalized.clearBypasses(normalized);
    clear_splitobjs(state);
    dmonsfree(state);

    if (state.u?.utotype) {
        await normalized.deferredGoto(normalized);
        state.somebody_can_move = false;
    }
    return state.somebody_can_move;
}

function requiredSingleMonsterOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `movemon_singlemon requires a ${name} operation`,
        );
    }
    return operation;
}

function activeMonsterOperations(env) {
    return {
        visionRecalc: requiredSingleMonsterOperation(env, 'visionRecalc'),
        clearBypasses: requiredSingleMonsterOperation(env, 'clearBypasses'),
        minLiquid: requiredSingleMonsterOperation(env, 'minLiquid'),
        dowear: requiredSingleMonsterOperation(env, 'dowear'),
        restrap: requiredSingleMonsterOperation(env, 'restrap'),
        canSeeMonster: requiredSingleMonsterOperation(env, 'canSeeMonster'),
        hideUnder: requiredSingleMonsterOperation(env, 'hideUnder'),
        canSeeHero: requiredSingleMonsterOperation(env, 'canSeeHero'),
        canSeeSquare: requiredSingleMonsterOperation(env, 'canSeeSquare'),
        fightMonster: requiredSingleMonsterOperation(env, 'fightMonster'),
        moveMonster: requiredSingleMonsterOperation(env, 'moveMonster'),
    };
}

function conflictActive(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic);
}

function monsterOnMap(monster) {
    return (monster.mstate ?? MON_FLOOR) === MON_FLOOR;
}

// C ref: mon.c movemon_singlemon(). The injected operations retain the source
// subsystem boundaries for guard cleanup, liquid effects, runtime equipment,
// hiding, perception, monster combat, and dochugw(). All operations reachable
// after the movement debit are preflighted before m_everyturn_effect() so a
// missing owner cannot duplicate its fog-cloud side effect on retry.
export async function movemon_singlemon(monster, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };

    if (state.u?.utotype) {
        state.somebody_can_move = false;
        return true;
    }

    const parkedGuard = monster.isgd
        && !monster.mx
        && !((monster.mstate ?? MON_FLOOR) & MON_MIGRATING);
    if (parkedGuard) {
        if ((state.moves ?? 0) > (monster.mlstmv ?? 0)) {
            const guardMove = requiredSingleMonsterOperation(env, 'guardMove');
            await guardMove(monster, { ...env, state, random });
            monster.mlstmv = state.moves;
        }
        return false;
    }
    if (monster.mhp < 1 || !monsterOnMap(monster)) return false;

    const everyTurnEffect = requiredSingleMonsterOperation(
        env,
        'everyTurnEffect',
    );
    const willSpendMovement = monster.movement >= NORMAL_SPEED;
    const operations = willSpendMovement ? activeMonsterOperations(env) : null;
    if (willSpendMovement && monster.data?.mlet === S_EEL
        && typeof random.rn2 !== 'function') {
        throw new TypeError(
            'movemon_singlemon random injection requires rn2',
        );
    }
    const normalized = {
        ...env,
        state,
        random,
        ...operations,
    };

    await everyTurnEffect(monster, normalized);
    if (!willSpendMovement) return false;

    monster.movement -= NORMAL_SPEED;
    if (monster.movement >= NORMAL_SPEED) state.somebody_can_move = true;

    if (state.vision_full_recalc)
        await operations.visionRecalc(0, normalized);
    if (state.context?.bypasses)
        await operations.clearBypasses(normalized);
    clear_splitobjs(state);
    if (await operations.minLiquid(monster, normalized)) return false;

    if (monster.misc_worn_check & I_SPECIAL) {
        const believedHeroIsDistant = dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        ) > 9;
        if (monster.mpeaceful || monster.mtame || believedHeroIsDistant) {
            monster.misc_worn_check &= ~I_SPECIAL;
            const oldWorn = monster.misc_worn_check;
            await operations.dowear(monster, false, normalized);
            if (monster.misc_worn_check !== oldWorn || !monster.mcanmove)
                return false;
        }
    }

    if (is_hider(monster.data)) {
        if (await operations.restrap(monster, normalized)) return false;
        const appearance = monster.m_ap_type & M_AP_TYPMASK;
        if (appearance === M_AP_FURNITURE || appearance === M_AP_OBJECT)
            return false;
        if (monster.mundetected) return false;
    } else if (monster.data?.mlet === S_EEL
        && !monster.mundetected
        && (monster.mflee
            || dist2(
                monster.mx,
                monster.my,
                state.u?.ux,
                state.u?.uy,
        ) > 2)
        && !operations.canSeeMonster(monster, normalized)) {
        if (!random.rn2(4)
            && await operations.hideUnder(monster, normalized)) {
            return false;
        }
    }

    if (conflictActive(state) && !monster.iswiz
        && operations.canSeeHero(monster, normalized)) {
        if (operations.canSeeSquare(monster.mx, monster.my, normalized)
            && dist2(
                monster.mx,
                monster.my,
                state.u?.ux,
                state.u?.uy,
            ) <= BOLT_LIM * BOLT_LIM
            && await operations.fightMonster(monster, normalized)) {
            return false;
        }
    }
    await operations.moveMonster(monster, true, normalized);
    return false;
}

// C ref: mthrowu.c m_carrying(). The hero-form case is retained because
// source callers can pass &youmonst even though ordinary movement passes a
// level monster.
export function m_carrying(monster, type, state = game) {
    const inventory = monster === state.youmonst
        ? state.invent
        : monster.minvent;
    for (let obj = inventory; obj; obj = obj.nobj) {
        if (obj.otyp === type) return obj;
    }
    return null;
}

// C ref: mon.c curr_mon_load(). Boulder throwers' boulders do not contribute
// to their current load, matching their unlimited-boulder carrying rule.
export function curr_mon_load(monster) {
    let currentLoad = 0;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp !== BOULDER || !throws_rocks(monster.data))
            currentLoad += obj.owt;
    }
    return currentLoad;
}

// C ref: mon.c max_mon_load(). MZ_HUMAN is the source alias for MZ_MEDIUM.
// All operands are nonnegative, so Math.trunc reproduces C integer division.
export function max_mon_load(monster) {
    const species = monster.data;
    const strong = strongmonst(species);
    let maxLoad;

    if (!species.cwt) {
        maxLoad = Math.trunc(
            MAX_CARR_CAP * species.msize / MZ_MEDIUM,
        );
    } else if (!strong || (strong && species.cwt > WT_HUMAN)) {
        maxLoad = Math.trunc(MAX_CARR_CAP * species.cwt / WT_HUMAN);
    } else {
        maxLoad = MAX_CARR_CAP;
    }

    if (!strong) maxLoad = Math.trunc(maxLoad / 2);
    return Math.max(maxLoad, 1);
}

// C ref: mon.c mcalcmove(). Adjust a monster's base speed, then randomly
// round a moving monster to a multiple of NORMAL_SPEED. The rounding draw is
// unconditional, including when the adjusted speed already has no remainder.
export function mcalcmove(
    monster,
    monsterMoving,
    state = game,
    random = rn2,
) {
    let movement = monster.data.mmove;

    if (monster.mspeed === MSLOW) {
        movement = movement < NORMAL_SPEED
            ? Math.trunc((2 * movement + 1) / 3)
            : 4 + Math.trunc(movement / 3);
    } else if (monster.mspeed === MFAST) {
        movement = Math.trunc((4 * movement + 2) / 3);
    }

    if (monster === state.u?.usteed && state.u.ugallop
        && state.context?.mv) {
        movement = Math.trunc((random(2) ? 4 : 5) * movement / 3);
    }

    if (monsterMoving) {
        const adjustment = movement % NORMAL_SPEED;
        movement -= adjustment;
        if (random(NORMAL_SPEED) < adjustment)
            movement += NORMAL_SPEED;
    }
    return movement;
}

// C ref: monmove.c mon_regen().  Meal digestion is owned by each actual
// monster action; mcalcdistress() passes false and only performs turn-based
// healing plus special-attack cooldown.
export function mon_regen(monster, digestMeal = false, state = game) {
    if (!(Math.trunc(state.moves ?? 0) % 20)
        || regenerates(monster.data)) {
        monster.mhp = Math.min(
            Math.trunc(monster.mhp ?? 0) + 1,
            Math.trunc(monster.mhpmax ?? 0),
        );
    }
    if (monster.mspec_used) monster.mspec_used--;
    if (digestMeal) {
        throw new Error('mon_regen meal-digestion branch is not implemented');
    }
}

export class UnsupportedMonsterDistressError extends Error {
    constructor(operation) {
        super(`unsupported monster distress state: ${operation}`);
        this.name = 'UnsupportedMonsterDistressError';
        this.operation = operation;
    }
}

function distressRandom(env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    for (const name of ['d', 'rn1', 'rn2', 'rnd', 'rne']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(
                `monster distress random injection requires ${name}`,
            );
        }
    }
    return random;
}

function distressPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function distressHallucinating(state) {
    return distressPropertyActive(state, HALLUC)
        && !distressPropertyActive(state, HALLUC_RES);
}

function distressDeaf(state) {
    return distressPropertyActive(state, DEAF)
        || Boolean(state.u?.uroleplay?.deaf);
}

function distressSpeciesName(monster) {
    const names = monster.data?.pmnames ?? [];
    return names[monster.female ? 1 : 0] ?? names[2] ?? 'monster';
}

function distressMonnam(monster) {
    const assigned = monster.mextra?.mgivenname;
    if (assigned) {
        const text = String(assigned);
        return text ? text[0].toUpperCase() + text.slice(1) : text;
    }
    const article = monster.mtame ? 'Your' : 'The';
    return `${article} ${distressSpeciesName(monster)}`;
}

function normalizedDistressEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = distressRandom(rawEnv);
    const seeMonster = rawEnv.canSeeMonster
        ?? ((monster) => canSeeMonster(monster, state));
    const spotMonster = rawEnv.canSpotMonster
        ?? ((monster) => canSpotMonster(monster, state));
    const message = rawEnv.message ?? ttyPline;
    const redrawSquare = rawEnv.redrawSquare
        ?? (state === game ? (x, y) => newsym(x, y) : null);
    if (typeof seeMonster !== 'function'
        || typeof spotMonster !== 'function'
        || typeof message !== 'function') {
        throw new TypeError(
            'monster distress perception and message operations must be functions',
        );
    }
    return {
        ...rawEnv,
        state,
        random,
        canSeeMonster: seeMonster,
        canSpotMonster: spotMonster,
        message,
        redrawSquare,
    };
}

function locationDoorMask(location) {
    return location?.flags || location?.doormask || 0;
}

function closedDoorAt(x, y, state) {
    const location = state.level?.at(x, y);
    return location?.typ === DOOR
        && Boolean(locationDoorMask(location) & (D_LOCKED | D_CLOSED));
}

function newchamDistressEnv(normalized) {
    return {
        ...normalized,
        hooks: {
            ...normalized.hooks,
            newsym: normalized.redrawSquare
                ? (x, y) => normalized.redrawSquare(
                    x,
                    y,
                    normalized.state,
                    normalized,
                )
                : normalized.hooks?.newsym,
        },
    };
}

// C ref: mon.c decide_to_shapeshift(). The only naturally live initial-D:1
// shifters are restored Mausoleum vampires with STRAT_WAITFORU, which exit
// without RNG. The remaining empty-inventory chameleon/vampire cases are
// retained for the same source boundary. Relocating an amorphous shifted
// vampire out of a closed door belongs to the general enexto()/rloc_to()
// owner and is rejected before any draw.
export async function decide_to_shapeshift(monster, rawEnv = {}) {
    const normalized = normalizedDistressEnv(rawEnv);
    const { random, state } = normalized;
    const vampireShifter = is_vampshifter(monster);
    if (vampireShifter
        && (monster.mstrategy & STRAT_WAITFORU)) {
        return false;
    }
    if (vampireShifter && monster.data?.mlet !== S_VAMPIRE
        && amorphous(monster.data)
        && closedDoorAt(monster.mx, monster.my, state)) {
        throw new UnsupportedMonsterDistressError(
            'closed-door vampire relocation',
        );
    }

    const shapeEnv = newchamDistressEnv(normalized);
    preflight_newcham_distress(monster, shapeEnv);
    let target = null;
    let change = false;
    const wasFemale = Boolean(monster.female);

    if (!vampireShifter) {
        if (!monster.mspec_used && !random.rn2(6)) {
            change = true;
            monster.mspec_used = 3 + random.rn2(10);
        }
    } else if (monster.data?.mlet !== S_VAMPIRE) {
        if (monster.mhp <= Math.trunc((monster.mhpmax + 5) / 6)
            && random.rn2(4)
            && ismnum(monster.cham)) {
            target = state.mons[monster.cham];
            change = true;
        } else if (monster.data === state.mons?.[PM_FOG_CLOUD]
            && monster.mhp === monster.mhpmax
            && !random.rn2(4)
            && (!normalized.canSeeMonster(monster, normalized)
                || dist2(
                    monster.mx,
                    monster.my,
                    state.u?.ux,
                    state.u?.uy,
                ) > BOLT_LIM * BOLT_LIM)) {
            const mndx = pick_vampire_shape(monster, shapeEnv);
            if (ismnum(mndx)) {
                target = state.mons[mndx];
                change = target !== monster.data;
            }
        }
    } else if (monster.mhp >= Math.trunc(9 * monster.mhpmax / 10)
        && !random.rn2(6)
        && (!normalized.canSeeMonster(monster, normalized)
            || dist2(
                monster.mx,
                monster.my,
                state.u?.ux,
                state.u?.uy,
            ) > BOLT_LIM * BOLT_LIM)) {
        change = true;
    }

    if (!change) return false;
    const changed = await newcham_distress(monster, target, shapeEnv);
    if (changed && is_vampshifter(monster)) {
        const species = monster.data;
        if (!is_male(species) && !is_female(species)
            && !is_neuter(species)) {
            monster.female = wasFemale;
        }
    }
    return changed;
}

// C ref: were.c counter_were().
export function counter_were(mndx) {
    switch (mndx) {
    case PM_WEREWOLF:
        return PM_HUMAN_WEREWOLF;
    case PM_HUMAN_WEREWOLF:
        return PM_WEREWOLF;
    case PM_WEREJACKAL:
        return PM_HUMAN_WEREJACKAL;
    case PM_HUMAN_WEREJACKAL:
        return PM_WEREJACKAL;
    case PM_WERERAT:
        return PM_HUMAN_WERERAT;
    case PM_HUMAN_WERERAT:
        return PM_WERERAT;
    default:
        return -1;
    }
}

function preflightNewWere(monster, normalized) {
    const { state } = normalized;
    if (distressPropertyActive(state, PROT_FROM_SHAPE_CHANGERS)
        && is_human(monster.data)) {
        return null;
    }
    const targetIndex = counter_were(monster.data?.pmidx);
    const target = state.mons?.[targetIndex];
    if (!target || target.pmidx !== targetIndex) {
        throw new UnsupportedMonsterDistressError(
            `unknown lycanthrope ${monster.data?.pmidx}`,
        );
    }
    // No live initial-D:1 generator admits a lycanthrope. Preserve the exact
    // inventory-free transformation for focused boundary tests and fail
    // before feedback/state changes if later gameplay supplies gear or a
    // monster-moving scary-square interaction.
    if (monster.minvent || monster.misc_worn_check
        || monster.mleashed || state.u?.usteed === monster
        || state.u?.ustuck === monster) {
        throw new UnsupportedMonsterDistressError(
            'equipped or attached lycanthrope',
        );
    }
    if (state.context?.mon_moving) {
        throw new UnsupportedMonsterDistressError(
            'monster-moving lycanthrope fear check',
        );
    }
    if (typeof normalized.redrawSquare !== 'function') {
        throw new TypeError(
            'new_were requires a redrawSquare operation',
        );
    }
    return target;
}

// C ref: were.c new_were(), bounded to the inventory-free, non-mon_moving
// distress state. Transformation feedback precedes the data change; wakeup,
// one-quarter lost-HP regeneration, and redraw preserve source order.
export async function new_were(monster, rawEnv = {}) {
    const normalized = normalizedDistressEnv(rawEnv);
    const { state } = normalized;
    const target = preflightNewWere(monster, normalized);
    if (!target) return false;

    if (normalized.canSeeMonster(monster, normalized)
        && !distressHallucinating(state)) {
        const targetName = is_human(target)
            ? 'human'
            : (target.pmnames?.[2] ?? '').slice(4);
        await normalized.message(
            `${distressMonnam(monster)} changes into a ${targetName}.`,
            state,
            normalized,
        );
    }

    set_mon_data(monster, target);
    if (monster.msleeping || !monster.mcanmove) {
        monster.msleeping = false;
        monster.mfrozen = 0;
        monster.mcanmove = true;
    }
    const healing = Math.trunc((monster.mhpmax - monster.mhp) / 4);
    monster.mhp = Math.min(monster.mhp + healing, monster.mhpmax);
    normalized.redrawSquare(
        monster.mx,
        monster.my,
        state,
        normalized,
    );
    return true;
}

async function wakeNearForWereHowl(x, y, distance, normalized) {
    const { state } = normalized;
    if (state.level?.buriedobjlist) {
        throw new UnsupportedMonsterDistressError(
            'howl disturbance of buried zombies',
        );
    }
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1
            || (distance
                && dist2(monster.mx, monster.my, x, y) >= distance)) {
            continue;
        }
        if (monster.msleeping
            && normalized.canSeeMonster(monster, normalized)) {
            const alive = monster.data?.pmidx === PM_FLESH_GOLEM
                ? " It's alive!" : '';
            await normalized.message(
                `${distressMonnam(monster)} wakes up.${alive}`,
                state,
                normalized,
            );
        }
        monster.msleeping = false;
        if (!(monster.data?.geno & G_UNIQ))
            monster.mstrategy &= ~STRAT_WAITMASK;
    }
}

// C ref: were.c were_change(). The chance denominator and draw placement
// retain day/night and full-moon behavior. The optional soundEffect hook owns
// frontend audio only; the screen message and wake_nearto() state are handled
// here for the ordinary initial-level monster list.
export async function were_change(monster, rawEnv = {}) {
    if (!is_were(monster?.data)) return false;
    const normalized = normalizedDistressEnv(rawEnv);
    const { random, state } = normalized;
    if (!state.gw || !Number.isInteger(state.gw.were_changes)) {
        throw new TypeError(
            'were_change requires initialized gw.were_changes',
        );
    }
    const protection = distressPropertyActive(
        state,
        PROT_FROM_SHAPE_CHANGERS,
    );
    const humanForm = is_human(monster.data);
    if (humanForm && protection) return false;

    // Validate the complete possible success path before the chance draw.
    preflightNewWere(monster, normalized);
    let change = false;
    if (humanForm) {
        const fullMoon = state.flags?.moonphase === FULL_MOON;
        const denominator = night(state)
            ? (fullMoon ? 3 : 30)
            : (fullMoon ? 10 : 50);
        change = !random.rn2(denominator);
    } else {
        change = !random.rn2(30) || protection;
    }
    if (!change) return false;

    await new_were(monster, normalized);
    state.gw.were_changes++;
    if (humanForm && !distressDeaf(state)
        && !normalized.canSeeMonster(monster, normalized)) {
        let howler = null;
        if (monster.data?.pmidx === PM_WEREWOLF) howler = 'wolf';
        else if (monster.data?.pmidx === PM_WEREJACKAL) howler = 'jackal';
        if (howler) {
            if (typeof normalized.soundEffect === 'function') {
                await normalized.soundEffect(
                    'canine-howl',
                    50,
                    normalized,
                );
            }
            await normalized.message(
                `You hear a ${howler} howling at the moon.`,
                state,
                normalized,
            );
            await wakeNearForWereHowl(
                monster.mx,
                monster.my,
                4 * 4,
                normalized,
            );
        }
    }
    return true;
}

function requiredDistressOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`mcalcdistress requires a ${name} operation`);
    return operation;
}

// C refs: mon.c mcalcdistress() and m_calcdistress(). Resolve every downstream
// owner for the current list before changing any monster, so an unsupported
// rare shape/liquid branch cannot leave earlier monsters partially advanced.
export async function mcalcdistress(state = game, env = {}) {
    const monsters = [];
    let needsLiquid = false;
    let needsShapechange = false;
    let needsWerechange = false;
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1
            || (monster.mstate ?? MON_FLOOR) !== MON_FLOOR) {
            continue;
        }
        monsters.push(monster);
        if (!monster.data?.mmove) {
            needsLiquid = true;
        }
        needsShapechange ||= ismnum(monster.cham);
        needsWerechange ||= is_were(monster.data);
    }
    // An earlier liquid or shapechange operation can dirty vision before a
    // later immobile monster. Resolve the owner atomically whenever that
    // source check can be reached, then consult the live flag in list order.
    const visionRecalc = needsLiquid
        ? requiredDistressOperation(env, 'visionRecalc') : null;
    const minLiquid = needsLiquid
        ? requiredDistressOperation(env, 'minLiquid') : null;
    const decideToShapeshift = needsShapechange
        ? requiredDistressOperation(env, 'decideToShapeshift') : null;
    const wereChange = needsWerechange
        ? requiredDistressOperation(env, 'wereChange') : null;

    for (const monster of monsters) {
        if (!monster.data?.mmove) {
            if (state.vision_full_recalc)
                await visionRecalc(0, { ...env, state });
            if (await minLiquid(monster, { ...env, state })) continue;
        }
        mon_regen(monster, false, state);
        if (ismnum(monster.cham))
            await decideToShapeshift(monster, { ...env, state });
        if (is_were(monster.data))
            await wereChange(monster, { ...env, state });
        if (monster.mblinded && !--monster.mblinded)
            monster.mcansee = true;
        if (monster.mfrozen && !--monster.mfrozen)
            monster.mcanmove = true;
        if (monster.mfleetim && !--monster.mfleetim)
            monster.mflee = false;
    }
}
