// Active level regions and the harmless gas-cloud turn path.
// C ref: region.c create_region(), add_region(), run_regions(),
// in_out_region(), m_in_out_region(), and the gas-cloud helpers.

import {
    ACCESSIBLE,
    BLINDED,
    COLNO,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DRAWBRIDGE_UP,
    IS_LAVA,
    IS_POOL,
    PLNMSG_ENVELOPED_IN_GAS,
    ROWNO,
    isok,
} from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { PM_FOG_CLOUD } from './monsters.js';
import { rn2 } from './rng.js';
import { S_cloud, S_poisoncloud } from './symbols.js';

const MAX_CLOUD_SIZE = 150;
const INSIDE_GAS_CLOUD = 'inside_gas_cloud';
const EXPIRE_GAS_CLOUD = 'expire_gas_cloud';

export class UnsupportedRegionOperationError extends Error {
    constructor(operation) {
        super(`region upkeep requires a ${operation} operation`);
        this.name = 'UnsupportedRegionOperationError';
        this.operation = operation;
    }
}

export class UnsupportedRegionCallbackError extends Error {
    constructor(callback, reason = '') {
        super(`unsupported region callback ${String(callback)}${reason}`);
        this.name = 'UnsupportedRegionCallbackError';
        this.callback = callback;
    }
}

function normalizedRegionEnv(rawEnv = {}) {
    return {
        ...rawEnv,
        state: rawEnv.state ?? game,
        random: rawEnv.random ?? { rn2 },
        callbacks: rawEnv.callbacks ?? {},
    };
}

function requiredOperation(env, operation) {
    const implementation = env[operation];
    if (typeof implementation !== 'function')
        throw new UnsupportedRegionOperationError(operation);
    return implementation;
}

function callbackName(callback) {
    if (callback === 0) return INSIDE_GAS_CLOUD;
    if (callback === 1) return EXPIRE_GAS_CLOUD;
    return callback;
}

function callbackIsSet(callback) {
    return callback !== null && callback !== undefined && callback !== -1;
}

function isFogCloud(monster, state) {
    return monster?.data === state.mons?.[PM_FOG_CLOUD]
        || monster?.data?.pmidx === PM_FOG_CLOUD
        || monster?.mnum === PM_FOG_CLOUD;
}

function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean(blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked;
}

function findMonsterById(id, state) {
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.m_id === id) return monster;
    }
    return null;
}

function regionCallback(callback, env) {
    if (!callbackIsSet(callback)) return null;
    const name = callbackName(callback);
    if (name === INSIDE_GAS_CLOUD) return inside_gas_cloud;
    if (name === EXPIRE_GAS_CLOUD) return expire_gas_cloud;
    if (typeof callback === 'function') return callback;
    const injected = env.callbacks?.[name];
    if (typeof injected === 'function') return injected;
    throw new UnsupportedRegionCallbackError(name);
}

function preflightCallback(callback, region, subject, env) {
    const implementation = regionCallback(callback, env);
    if (implementation === inside_gas_cloud
        && Math.trunc(region.arg ?? 0) >= 1) {
        // The harmful branch owns poison resistance, blindness, combat,
        // wakeup, anger, death, and several messages.  It is outside the
        // fresh-first-turn boundary, so reject it before ttl or membership
        // can change rather than partially approximating it.
        throw new UnsupportedRegionCallbackError(
            INSIDE_GAS_CLOUD,
            ' with positive damage',
        );
    }
    if (implementation === expire_gas_cloud
        && Math.trunc(region.arg ?? 0) < 5) {
        preflightGasDissipation(region, env);
    }
    return implementation;
}

export function create_region(rectangles = []) {
    const region = {
        bounding_box: { lx: COLNO, ly: ROWNO, hx: 0, hy: 0 },
        rects: [],
        ttl: -1,
        attach_2_u: false,
        attach_2_m: 0,
        enter_msg: null,
        leave_msg: null,
        expire_f: null,
        enter_f: null,
        can_enter_f: null,
        leave_f: null,
        can_leave_f: null,
        inside_f: null,
        hero_inside: false,
        heros_fault: false,
        monsters: [],
        arg: 0,
        visible: false,
        glyph: S_cloud,
    };
    for (const rectangle of rectangles) add_rect_to_reg(region, rectangle);
    return region;
}

export function add_rect_to_reg(region, rectangle) {
    if (!region?.bounding_box || !Array.isArray(region.rects))
        throw new TypeError('add_rect_to_reg requires a region');
    const rect = {
        lx: Math.trunc(rectangle.lx),
        ly: Math.trunc(rectangle.ly),
        hx: Math.trunc(rectangle.hx),
        hy: Math.trunc(rectangle.hy),
    };
    region.rects.push(rect);
    const bounds = region.bounding_box;
    if (rect.lx < bounds.lx) bounds.lx = rect.lx;
    if (rect.ly < bounds.ly) bounds.ly = rect.ly;
    if (rect.hx > bounds.hx) bounds.hx = rect.hx;
    if (rect.hy > bounds.hy) bounds.hy = rect.hy;
    return region;
}

export function inside_region(region, x, y) {
    if (!region) return false;
    const bounds = region.bounding_box;
    if (!bounds || x < bounds.lx || x > bounds.hx
        || y < bounds.ly || y > bounds.hy) {
        return false;
    }
    return region.rects.some((rect) => x >= rect.lx && x <= rect.hx
        && y >= rect.ly && y <= rect.hy);
}

export function mon_in_region(region, monster) {
    return Boolean(region && monster
        && region.monsters.includes(monster.m_id));
}

export function add_mon_to_reg(region, monster) {
    if (!region || !Array.isArray(region.monsters))
        throw new TypeError('add_mon_to_reg requires a region');
    if (!monster || typeof monster !== 'object')
        throw new TypeError('add_mon_to_reg requires a monster');
    if (!mon_in_region(region, monster)) region.monsters.push(monster.m_id);
    return region;
}

export function remove_mon_from_reg(region, monster) {
    if (!region || !Array.isArray(region.monsters))
        throw new TypeError('remove_mon_from_reg requires a region');
    if (!monster || typeof monster !== 'object')
        throw new TypeError('remove_mon_from_reg requires a monster');
    const index = region.monsters.indexOf(monster.m_id);
    if (index >= 0) {
        // region.c fills the removed slot with the former tail.
        region.monsters[index] = region.monsters.at(-1);
        region.monsters.pop();
    }
    return region;
}

// C ref: region.c add_region(). Runtime visible regions require
// blockPoint(x,y), canSee(x,y), and newsym(x,y). Level generation explicitly
// passes deferVisual because vision_reset() reconstructs opacity and the
// initial display after mklev finishes.
export function add_region(region, state = game, rawEnv = {}) {
    if (!state.level)
        throw new Error('add_region requires an initialized level');
    const env = { ...rawEnv, state };
    const activatesVisual = Boolean(region.visible && !env.deferVisual);
    const blockPoint = activatesVisual
        ? requiredOperation(env, 'blockPoint') : null;
    const canSee = activatesVisual
        ? requiredOperation(env, 'canSee') : null;
    const redraw = activatesVisual
        ? requiredOperation(env, 'newsym') : null;

    state.level.regions ??= [];
    state.level.regions.push(region);

    // region.c scans the bounding box x-major when activating a region. Long
    // worms occupy several grid cells, so the ID check records each resident
    // monster only once.
    const bounds = region.bounding_box;
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (!isok(x, y)) continue;
            const isInside = inside_region(region, x, y);
            if (isInside) {
                const monster = state.level.monsters?.[x]?.[y];
                if (monster) add_mon_to_reg(region, monster);
                if (blockPoint) blockPoint(x, y, state, env);
            }
            if (canSee && canSee(x, y, state, env))
                redraw(x, y, state, env);
        }
    }
    region.hero_inside = inside_region(
        region,
        state.u?.ux ?? -1,
        state.u?.uy ?? -1,
    );
    return region;
}

// C ref: region.c update_monster_region(). Relocation updates each active
// region's cached monster-id membership after the coordinate grid changes.
export function update_monster_region(monster, state = game) {
    if (!monster || typeof monster !== 'object') {
        throw new TypeError('update_monster_region requires a monster');
    }
    for (const region of state.level?.regions ?? []) {
        if (inside_region(region, monster.mx, monster.my)) {
            if (!mon_in_region(region, monster))
                add_mon_to_reg(region, monster);
        } else if (mon_in_region(region, monster)) {
            remove_mon_from_reg(region, monster);
        }
    }
    return monster;
}

function preflightVisibleRemoval(region, env) {
    if (!region.visible) return null;
    const operations = {
        doesBlock: requiredOperation(env, 'doesBlock'),
        unblockPoint: requiredOperation(env, 'unblockPoint'),
        canSee: null,
        newsym: null,
    };
    if (!heroIsBlind(env.state)) {
        operations.canSee = requiredOperation(env, 'canSee');
        operations.newsym = requiredOperation(env, 'newsym');
    }
    return operations;
}

function preflightGasDissipation(region, env) {
    const operations = {
        doesBlock: requiredOperation(env, 'doesBlock'),
        unblockPoint: requiredOperation(env, 'unblockPoint'),
        canSee: null,
    };
    if (!heroIsBlind(env.state))
        operations.canSee = requiredOperation(env, 'canSee');
    // expire_gas_cloud() can aggregate either of its two messages.  Require
    // the output boundary before the callback mutates opacity or counters.
    requiredOperation(env, 'message');
    return operations;
}

// C ref: region.c remove_region().  The list is compacted before the region
// is marked invisible and before any redraw, matching visible_region_at()'s
// overlap behavior during doesBlock().
export function remove_region(region, state = game, rawEnv = {}) {
    const regions = state.level?.regions;
    if (!Array.isArray(regions))
        throw new Error('remove_region requires an initialized region list');
    const index = regions.indexOf(region);
    if (index < 0) return false;

    const env = { ...rawEnv, state };
    const visual = preflightVisibleRemoval(region, env);

    regions[index] = regions.at(-1);
    regions.pop();
    region.ttl = -2;
    if (!visual) return true;

    const savedInWater = Boolean(state.u?.uinwater);
    const passes = heroIsBlind(state) ? 1 : 2;
    try {
        for (let pass = 1; pass <= passes; ++pass) {
            if (state.u) state.u.uinwater = pass === 1 ? false : savedInWater;
            const bounds = region.bounding_box;
            for (let x = bounds.lx; x <= bounds.hx; ++x) {
                for (let y = bounds.ly; y <= bounds.hy; ++y) {
                    if (!isok(x, y) || !inside_region(region, x, y)) continue;
                    if (pass === 1) {
                        const location = state.level.at?.(x, y)
                            ?? state.level.locations?.[x]?.[y];
                        if (!visual.doesBlock(x, y, location, state, env))
                            visual.unblockPoint(x, y, state, env);
                    } else if (visual.canSee(x, y, state, env)) {
                        visual.newsym(x, y, state, env);
                    }
                }
            }
        }
    } finally {
        if (state.u) state.u.uinwater = savedInWater;
    }
    return true;
}

// C ref: region.c inside_gas_cloud().  A harmless vapor region has no hero
// or monster side effect.  Fog clouds nevertheless maintain its ttl in
// cached monster-id order, even while sleeping.
export function inside_gas_cloud(region, monster = null, rawEnv = {}) {
    const env = normalizedRegionEnv(rawEnv);
    const damage = Math.trunc(region.arg ?? 0);
    if (damage >= 1) {
        throw new UnsupportedRegionCallbackError(
            INSIDE_GAS_CLOUD,
            ' with positive damage',
        );
    }
    const occupant = monster ?? env.state.youmonst;
    if (region.ttl < 20 && occupant && isFogCloud(occupant, env.state))
        region.ttl += 5;
    return false;
}

// C ref: region.c expire_gas_cloud().  This includes the source's two-stage
// thinning and visual dissipation bookkeeping; harmful per-creature effects
// remain isolated in inside_gas_cloud().
export function expire_gas_cloud(region, _subject = null, rawEnv = {}) {
    const env = normalizedRegionEnv(rawEnv);
    let damage = Math.trunc(region.arg ?? 0);
    if (damage >= 5) {
        damage = Math.trunc(damage / 2);
        region.arg = damage;
        region.ttl = 2;
        return false;
    }

    const visual = preflightGasDissipation(region, env);
    env.state.gg ??= {};
    const passes = heroIsBlind(env.state) ? 1 : 2;
    const bounds = region.bounding_box;
    for (let pass = 1; pass <= passes; ++pass) {
        for (let x = bounds.lx; x <= bounds.hx; ++x) {
            for (let y = bounds.ly; y <= bounds.hy; ++y) {
                if (!isok(x, y) || !inside_region(region, x, y)) continue;
                if (pass === 1) {
                    const location = env.state.level.at?.(x, y)
                        ?? env.state.level.locations?.[x]?.[y];
                    if (!visual.doesBlock(x, y, location, env.state, env))
                        visual.unblockPoint(x, y, env.state, env);
                } else if (!env.state.u?.uswallow) {
                    if (env.state.u?.ux === x && env.state.u?.uy === y) {
                        env.state.gg.gas_cloud_diss_within = true;
                    } else if (visual.canSee(x, y, env.state, env)) {
                        env.state.gg.gas_cloud_diss_seen =
                            (env.state.gg.gas_cloud_diss_seen ?? 0) + 1;
                    }
                }
            }
        }
    }
    return true;
}

function preflightRunRegions(env) {
    const plans = new Map();
    let canDissipate = false;
    for (const region of env.state.level?.regions ?? []) {
        const plan = { expire: null, inside: null, removal: null };
        if (region.ttl === 0) {
            plan.expire = preflightCallback(
                region.expire_f,
                region,
                null,
                env,
            );
            // A callback can elect to remove the region, so resolve the
            // removal boundary before any earlier expiration callback runs.
            const thickGasProlongs = plan.expire === expire_gas_cloud
                && Math.trunc(region.arg ?? 0) >= 5;
            if (!thickGasProlongs)
                plan.removal = preflightVisibleRemoval(region, env);
            canDissipate ||= Boolean(plan.expire) && !thickGasProlongs;
        }
        plan.inside = regionCallback(region.inside_f, env);
        if (plan.inside) {
            if (region.hero_inside) {
                preflightCallback(region.inside_f, region, null, env);
            }
            for (const id of region.monsters) {
                const monster = findMonsterById(id, env.state);
                if (monster && monster.mhp >= 1)
                    preflightCallback(region.inside_f, region, monster, env);
            }
        }
        plans.set(region, plan);
    }
    if (canDissipate) requiredOperation(env, 'message');
    return plans;
}

// C ref: region.c run_regions().  Callback and visual-operation resolution is
// an atomic JS preflight: an unsupported later branch cannot leave an earlier
// region aged, a cached monster removed, or a gas message half-produced.
export async function run_regions(rawEnv = {}) {
    const env = normalizedRegionEnv(rawEnv);
    if (!Array.isArray(env.state.level?.regions))
        throw new Error('run_regions requires an initialized region list');
    const plans = preflightRunRegions(env);

    env.state.gg ??= {};
    env.state.gg.gas_cloud_diss_within = false;
    env.state.gg.gas_cloud_diss_seen = 0;

    const regions = env.state.level.regions;
    for (let index = regions.length - 1; index >= 0; --index) {
        const region = regions[index];
        if (region.ttl !== 0) continue;
        const expire = plans.get(region)?.expire ?? null;
        if (!expire || await expire(region, null, env))
            remove_region(region, env.state, env);
    }

    for (let index = 0; index < regions.length; ++index) {
        const region = regions[index];
        if (region.ttl > 0) --region.ttl;
        const inside = plans.get(region)?.inside
            ?? regionCallback(region.inside_f, env);
        if (!inside) continue;
        if (region.hero_inside) await inside(region, null, env);

        for (let monIndex = 0; monIndex < region.monsters.length; ++monIndex) {
            const id = region.monsters[monIndex];
            const monster = findMonsterById(id, env.state);
            if (!monster || monster.mhp < 1
                || await inside(region, monster, env)) {
                const last = region.monsters.length - 1;
                region.monsters[monIndex] = region.monsters[last];
                region.monsters.pop();
                --monIndex;
            }
        }
    }

    const message = env.message;
    if (env.state.gg.gas_cloud_diss_within) {
        await message('The gas cloud around you dissipates.', env.state, env);
        if ((env.state.u?.xray_range ?? 0) <= 1)
            env.state.gg.gas_cloud_diss_seen = 0;
        env.state.gg.gas_cloud_diss_within = false;
    }
    const seen = env.state.gg.gas_cloud_diss_seen;
    if (seen) {
        await message(
            seen === 1
                ? 'You see a gas cloud dissipate.'
                : 'You see some gas clouds dissipate.',
            env.state,
            env,
        );
        env.state.gg.gas_cloud_diss_seen = 0;
    }
    return regions.length;
}

function preflightHeroTransition(x, y, env) {
    const plans = new Map();
    for (const region of env.state.level?.regions ?? []) {
        const plan = {
            canEnter: null,
            canLeave: null,
            enter: null,
            leave: null,
        };
        if (region.attach_2_u) {
            plans.set(region, plan);
            continue;
        }
        const destinationInside = inside_region(region, x, y);
        if (destinationInside && !region.hero_inside) {
            plan.canEnter = preflightCallback(
                region.can_enter_f,
                region,
                null,
                env,
            );
            plan.enter = preflightCallback(
                region.enter_f,
                region,
                null,
                env,
            );
            if (region.enter_msg) requiredOperation(env, 'message');
        } else if (!destinationInside && region.hero_inside) {
            plan.canLeave = preflightCallback(
                region.can_leave_f,
                region,
                null,
                env,
            );
            plan.leave = preflightCallback(
                region.leave_f,
                region,
                null,
                env,
            );
            if (region.leave_msg) requiredOperation(env, 'message');
        }
        plans.set(region, plan);
    }
    return plans;
}

// C ref: region.c in_out_region().  Permission checks precede all leaving
// callbacks; every leave precedes every enter, and membership flips before
// that region's message and callback.
export async function in_out_region(x, y, rawEnv = {}) {
    const env = normalizedRegionEnv(rawEnv);
    if (!Array.isArray(env.state.level?.regions))
        throw new Error('in_out_region requires an initialized region list');
    const plans = preflightHeroTransition(x, y, env);
    const regions = env.state.level.regions;

    for (const region of regions) {
        if (region.attach_2_u) continue;
        const plan = plans.get(region);
        const permission = inside_region(region, x, y)
            ? (!region.hero_inside ? plan.canEnter : null)
            : (region.hero_inside ? plan.canLeave : null);
        if (permission && !await permission(region, null, env)) return false;
    }

    for (const region of regions) {
        if (region.attach_2_u
            || !region.hero_inside
            || inside_region(region, x, y)) {
            continue;
        }
        region.hero_inside = false;
        if (region.leave_msg)
            await env.message(region.leave_msg, env.state, env);
        const leave = plans.get(region).leave;
        if (leave) await leave(region, null, env);
    }

    for (const region of regions) {
        if (region.attach_2_u
            || region.hero_inside
            || !inside_region(region, x, y)) {
            continue;
        }
        region.hero_inside = true;
        if (region.enter_msg)
            await env.message(region.enter_msg, env.state, env);
        const enter = plans.get(region).enter;
        if (enter) await enter(region, null, env);
    }
    return true;
}

function preflightMonsterTransition(monster, x, y, env) {
    const plans = new Map();
    for (const region of env.state.level?.regions ?? []) {
        const plan = {
            canEnter: null,
            canLeave: null,
            enter: null,
            leave: null,
        };
        if (region.attach_2_m === monster.m_id) {
            plans.set(region, plan);
            continue;
        }
        const destinationInside = inside_region(region, x, y);
        const currentlyInside = mon_in_region(region, monster);
        if (destinationInside && !currentlyInside) {
            plan.canEnter = preflightCallback(
                region.can_enter_f,
                region,
                monster,
                env,
            );
            plan.enter = preflightCallback(
                region.enter_f,
                region,
                monster,
                env,
            );
        } else if (!destinationInside && currentlyInside) {
            plan.canLeave = preflightCallback(
                region.can_leave_f,
                region,
                monster,
                env,
            );
            plan.leave = preflightCallback(
                region.leave_f,
                region,
                monster,
                env,
            );
        }
        plans.set(region, plan);
    }
    return plans;
}

// C ref: region.c m_in_out_region().  The cached ID array uses tail-fill
// removal, preserving the order that run_regions() will observe next.
export async function m_in_out_region(monster, x, y, rawEnv = {}) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('m_in_out_region requires a monster');
    const env = normalizedRegionEnv(rawEnv);
    if (!Array.isArray(env.state.level?.regions)) {
        throw new Error(
            'm_in_out_region requires an initialized region list',
        );
    }
    const plans = preflightMonsterTransition(monster, x, y, env);
    const regions = env.state.level.regions;

    for (const region of regions) {
        if (region.attach_2_m === monster.m_id) continue;
        const currentlyInside = mon_in_region(region, monster);
        const permission = inside_region(region, x, y)
            ? (!currentlyInside ? plans.get(region).canEnter : null)
            : (currentlyInside ? plans.get(region).canLeave : null);
        if (permission && !await permission(region, monster, env)) return false;
    }

    for (const region of regions) {
        if (region.attach_2_m === monster.m_id
            || !mon_in_region(region, monster)
            || inside_region(region, x, y)) {
            continue;
        }
        remove_mon_from_reg(region, monster);
        const leave = plans.get(region).leave;
        if (leave) await leave(region, monster, env);
    }

    for (const region of regions) {
        if (region.attach_2_m === monster.m_id
            || mon_in_region(region, monster)
            || !inside_region(region, x, y)) {
            continue;
        }
        add_mon_to_reg(region, monster);
        const enter = plans.get(region).enter;
        if (enter) await enter(region, monster, env);
    }
    return true;
}

export function visible_region_at(x, y, state = game) {
    for (const region of state.level?.regions ?? []) {
        if (!region.visible || region.ttl === -2) continue;
        if (inside_region(region, x, y)) return region;
    }
    return null;
}

// C ref: read.c valid_cloud_pos().
export function valid_cloud_pos(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y)
        ?? state.level?.locations?.[x]?.[y];
    const terrain = location?.typ;
    if (!Number.isInteger(terrain)) return false;
    const drawbridgeUnder =
        (location.flags || location.drawbridgemask || 0) & DB_UNDER;
    const pool = terrain === DRAWBRIDGE_UP
        ? drawbridgeUnder === DB_MOAT
            && !on_level(state.u?.uz, state.juiblex_level)
        : IS_POOL(terrain);
    const lava = IS_LAVA(terrain)
        || (terrain === DRAWBRIDGE_UP && drawbridgeUnder === DB_LAVA);
    return ACCESSIBLE(terrain) || pool || lava;
}

function heroInsideGasCloud(state) {
    return (state.level?.regions ?? []).some((region) => (
        region.hero_inside
        && callbackName(region.inside_f) === INSIDE_GAS_CLOUD
    ));
}

function preflightGasCreation(env, damage) {
    if (!Number.isInteger(damage) || damage < 0)
        throw new RangeError(`invalid gas-cloud damage ${damage}`);
    if (damage > 0) {
        throw new UnsupportedRegionCallbackError(
            INSIDE_GAS_CLOUD,
            ' with positive damage',
        );
    }
    if (typeof env.random?.rn2 !== 'function')
        throw new TypeError('create_gas_cloud random injection requires rn2');
    if (!env.state.in_mklev) {
        requiredOperation(env, 'blockPoint');
        requiredOperation(env, 'canSee');
        requiredOperation(env, 'newsym');
        requiredOperation(env, 'message');
    }
}

async function makeGasCloud(cloud, damage, insideCloud, env) {
    const state = env.state;
    if (!state.in_mklev && !state.context?.mon_moving)
        cloud.heros_fault = true;
    cloud.inside_f = INSIDE_GAS_CLOUD;
    cloud.expire_f = EXPIRE_GAS_CLOUD;
    cloud.arg = damage;
    cloud.visible = true;
    cloud.glyph = damage ? S_poisoncloud : S_cloud;
    add_region(cloud, state, {
        ...env,
        deferVisual: Boolean(state.in_mklev),
    });

    if (!state.in_mklev && !insideCloud && heroInsideGasCloud(state)) {
        await env.message(
            `You are enveloped in a cloud of ${
                damage ? 'noxious gas' : 'steam'
            }!`,
            state,
            env,
        );
        state.iflags ??= {};
        state.iflags.last_msg = PLNMSG_ENVELOPED_IN_GAS;
    }
    return cloud;
}

// C ref: region.c create_gas_cloud().  Coordinates are discovered breadth
// first; each expanded point independently shuffles N,S,W,E, and an already
// occupied cloud region never merges with or suppresses the new one.
export async function create_gas_cloud(
    x,
    y,
    cloudSize,
    damage = 0,
    rawEnv = {},
) {
    const env = normalizedRegionEnv(rawEnv);
    x = Math.trunc(x);
    y = Math.trunc(y);
    cloudSize = Math.trunc(cloudSize);
    damage = Math.trunc(damage);
    if (cloudSize < 1)
        throw new RangeError(`invalid gas-cloud size ${cloudSize}`);
    preflightGasCreation(env, damage);

    let insideCloud = heroInsideGasCloud(env.state);
    if (!env.state.context?.mon_moving
        && env.state.u?.ux === x
        && env.state.u?.uy === y
        && cloudSize === 1
        && damage === 0) {
        insideCloud = true;
    }
    if (cloudSize > MAX_CLOUD_SIZE) cloudSize = MAX_CLOUD_SIZE;

    const coordinates = [{ x, y }];
    for (let current = 0;
        current < coordinates.length && coordinates.length < cloudSize;
        ++current) {
        const origin = coordinates[current];
        const directions = [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
        ];
        for (let count = 4; count > 0; --count) {
            const swapIndex = env.random.rn2(count);
            const last = count - 1;
            [directions[swapIndex], directions[last]] =
                [directions[last], directions[swapIndex]];
        }

        let validCount = 0;
        for (const direction of directions) {
            const nextX = origin.x + direction.x;
            const nextY = origin.y + direction.y;
            if (valid_cloud_pos(nextX, nextY, env.state)) {
                ++validCount;
                const unpicked = !coordinates.some(
                    (coordinate) => coordinate.x === nextX
                        && coordinate.y === nextY,
                );
                if (validCount === 4 && env.random.rn2(2) === 0) continue;
                if (unpicked) coordinates.push({ x: nextX, y: nextY });
            }
            if (coordinates.length >= cloudSize) break;
        }
    }

    const cloud = create_region();
    for (const coordinate of coordinates) {
        add_rect_to_reg(cloud, {
            lx: coordinate.x,
            ly: coordinate.y,
            hx: coordinate.x,
            hy: coordinate.y,
        });
    }
    cloud.ttl = env.random.rn2(3) + 4;
    cloud.ttl = Math.trunc(cloud.ttl * cloudSize / coordinates.length);
    return makeGasCloud(cloud, damage, insideCloud, env);
}

export function create_gas_cloud_selection(selection, damage = 0, rawEnv = {}) {
    if (!selection || typeof selection.bounds !== 'function'
        || typeof selection.get !== 'function') {
        throw new TypeError('create_gas_cloud_selection requires a selection');
    }
    damage = Math.trunc(damage);
    if (damage < 0)
        throw new RangeError(`invalid gas-cloud damage ${damage}`);
    if (damage > 0) {
        throw new UnsupportedRegionCallbackError(
            INSIDE_GAS_CLOUD,
            ' with positive damage',
        );
    }
    const state = rawEnv.state ?? game;
    if (!state.in_mklev) {
        throw new UnsupportedRegionOperationError(
            'runtime create_gas_cloud_selection',
        );
    }
    const cloud = create_region();
    const bounds = selection.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (!selection.get(x, y)) continue;
            add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
        }
    }
    cloud.inside_f = INSIDE_GAS_CLOUD;
    cloud.expire_f = EXPIRE_GAS_CLOUD;
    cloud.arg = damage;
    cloud.visible = true;
    cloud.glyph = damage ? S_poisoncloud : S_cloud;
    return add_region(cloud, state, {
        ...rawEnv,
        deferVisual: true,
    });
}
