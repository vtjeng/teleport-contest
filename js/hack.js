// Movement-adjacent world effects owned by hack.c.

import {
    ACCESSIBLE,
    CORR,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    FLYING,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_TREE,
    IS_WALL,
    LEVITATION,
    MAX_TYPE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    ROOM,
    STEALTH,
    STONE,
    TIMER_OBJECT,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    WT_ELF,
    ZOMBIFY_MON,
    isok,
} from './const.js';
import { classify_terrain, newsym, wall_angle } from './display.js';
import { alwaysVisibleMonsterName } from './do_name.js';
import {
    can_reach_floor,
    engr_at,
    read_engr_at,
    wipe_engr_at,
} from './engrave.js';
import { game } from './gstate.js';
import { look_here_single_object } from './invent.js';
import {
    is_flyer,
    is_hider,
    needspick,
    noattacks,
    passes_walls,
    tunnels,
} from './mondata.js';
import { sobj_at } from './obj.js';
import { BOULDER, CORPSE } from './objects.js';
import {
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
} from './monsters.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { onscary } from './monmove.js';
import { in_out_region, inside_region } from './region.js';
import { rn2, rnd } from './rng.js';
import { check_special_room_state } from './rooms.js';
import { canSpotMonster } from './startup_a11y.js';
import { S_stone } from './symbols.js';
import {
    peek_timer,
    start_timer,
    stop_timer,
} from './timeout.js';
import { t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { do_attack, is_safemon } from './uhitm.js';
import { vision_recalc } from './vision.js';

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);

export class UnsupportedHeroMoveBoundaryError extends Error {
    constructor(reason) {
        super(`unsupported hero move: ${reason}`);
        this.name = 'UnsupportedHeroMoveBoundaryError';
        this.reason = reason;
    }
}

function propertyActiveUnblocked(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

function propertyIntrinsic(state, property) {
    return Boolean(state.u?.uprops?.[property]?.intrinsic);
}

function heroHallucinating(state) {
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return propertyIntrinsic(state, HALLUC)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: hack.c monster_nearby(). This deliberately has stricter concealment,
// disposition, helplessness, and scare checks than canspotmon().
export function monsterNearby(state = game) {
    const { ux, uy } = state.u;
    const hallucinating = heroHallucinating(state);
    for (let x = ux - 1; x <= ux + 1; ++x) {
        for (let y = uy - 1; y <= uy + 1; ++y) {
            if (!isok(x, y) || (x === ux && y === uy)) continue;
            const monster = m_at(x, y, state);
            if (!monster) continue;
            const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
            if (appearance === M_AP_FURNITURE
                || appearance === M_AP_OBJECT) {
                continue;
            }
            if (!hallucinating
                && (monster.mpeaceful || noattacks(monster.data))) {
                continue;
            }
            if (is_hider(monster.data) && monster.mundetected) continue;
            if (monster.msleeping || !monster.mcanmove) continue;
            if (onscary(ux, uy, monster, state)) continue;
            if (canSpotMonster(monster, state)) return true;
        }
    }
    return false;
}

// C ref: hack.c end_running(TRUE). The current finite-movement caller always
// requests travel cancellation, so this helper clears travel, travel1, and mv.
// Status refresh and travel-map cleanup remain with their owning subsystems.
export function endRunning(state = game) {
    state.context.run = 0;
    state.context.travel = 0;
    state.context.travel1 = 0;
    state.context.mv = 0;
    if (state.multi > 0) state.multi = 0;
}

function blocksMove(x, y, state) {
    const loc = state.level?.at(x, y);
    if (!loc || loc.typ === STONE || IS_WALL(loc.typ)) return true;
    return loc.typ === DOOR && (loc.doormask & (D_CLOSED | D_LOCKED));
}

// This repeated-command boundary owns entry into an unoccupied ROOM or CORR
// square plus the ordinary single-object description produced when autopickup
// is disabled. These checks are a temporary admission seam in front of
// hack.c:domove_core(); each rejected branch will move to its upstream owner
// when that behavior is ported.
function requireSimpleHeroDestination(x, y, state) {
    if (m_at(x, y, state))
        throw new UnsupportedHeroMoveBoundaryError(
            'hero combat or displacement',
        );

    const location = state.level?.at(x, y);
    if (!location || (location.typ !== ROOM && location.typ !== CORR)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'door or special terrain movement',
        );
    }
    const floorObject = state.level?.objects?.[x]?.[y] ?? null;
    if (floorObject && state.flags?.pickup)
        throw new UnsupportedHeroMoveBoundaryError('automatic pickup');
    if (floorObject?.nexthere)
        throw new UnsupportedHeroMoveBoundaryError('floor object pile');
    if (t_at(x, y, state))
        throw new UnsupportedHeroMoveBoundaryError('trap activation');

    for (const region of state.level?.regions ?? []) {
        if (region.attach_2_u) continue;
        if (Boolean(region.hero_inside) !== inside_region(region, x, y))
            throw new UnsupportedHeroMoveBoundaryError('region crossing');
    }
    if (engr_at(x, y, state))
        throw new UnsupportedHeroMoveBoundaryError('engraving interaction');
}

function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

function requireOrdinaryStartingPetSwap(monster, x, y, state) {
    const startingPet = monster
        && monster.m_id === state.context?.startingpet_mid
        && STARTING_PETS.has(monster.data?.pmidx)
        && monster.mtame
        && monster.mpeaceful;
    if (!startingPet || !is_safemon(monster, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'hero combat or displacement',
        );
    }
    const specialState = monster.mhp < 1
        || !monster.mcanmove
        || monster.mfrozen
        || monster.msleeping
        || monster.mtrapped
        || monster.mflee
        || monster.meating
        || monster.wormno;
    if (specialState) {
        throw new UnsupportedHeroMoveBoundaryError(
            'hero combat or exceptional pet displacement',
        );
    }

    const destination = state.level?.at(x, y);
    const ordinaryDestination = destination
        && (destination.typ === ROOM
            || destination.typ === CORR
            || (destination.typ === DOOR && doorMask(destination) === 0));
    if (!ordinaryDestination) {
        throw new UnsupportedHeroMoveBoundaryError(
            'door or special terrain movement',
        );
    }

    const source = state.level?.at(state.u.ux, state.u.uy);
    const sourceAccessible = source
        && ACCESSIBLE(source.typ)
        && !(source.typ === DOOR
            && (doorMask(source) & (D_CLOSED | D_LOCKED)));
    if (!sourceAccessible) {
        throw new UnsupportedHeroMoveBoundaryError(
            'exceptional pet displacement terrain',
        );
    }
    if (t_at(x, y, state)
        || t_at(state.u.ux, state.u.uy, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap trap interaction',
        );
    }
    if (state.level?.objects?.[x]?.[y]) {
        throw new UnsupportedHeroMoveBoundaryError(
            'combined pet and floor object interaction',
        );
    }
    if (state.level?.regions?.length) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap region crossing',
        );
    }
    if (engr_at(x, y, state)
        || engr_at(state.u.ux, state.u.uy, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap engraving interaction',
        );
    }
}

// cmd.c establishes movement intent only after this hack.c admission seam has
// shown that the destination is inside the currently ported domove() subset.
export function preflightDomoveDestination(x, y, state = game) {
    const destination = state.level?.at(x, y);
    const destinationMonster = m_at(x, y, state);
    if (destinationMonster) {
        requireOrdinaryStartingPetSwap(destinationMonster, x, y, state);
    } else if (destination?.typ === DOOR || !blocksMove(x, y, state)) {
        requireSimpleHeroDestination(x, y, state);
    }
}

// C ref: hack.c test_move(), physical-obstacle branch for ordinary wall and
// rock refusals. Other test_move() terrain and ability branches remain at the
// command admission boundary. This live subset consumes no time or PRNG.
export async function test_move(
    ux,
    uy,
    dx,
    dy,
    state = game,
    env = {},
) {
    const location = state.level?.at?.(ux + dx, uy + dy);
    if (!location
        || (location.typ !== STONE && !IS_WALL(location.typ))) {
        return true;
    }

    if (state.flags?.mention_walls) {
        const symbol = location.typ === STONE
            ? S_stone : wall_angle(location);
        const description = symbol === S_stone ? 'solid stone' : 'a wall';
        const message = env.message;
        if (typeof message !== 'function')
            throw new TypeError('wall refusal requires a message operation');
        await message(`It's ${description}.`, state);
    }
    return false;
}

// C ref: hack.c domove(). This remains the narrow ordinary-floor subset; the
// movement milestone will replace its collision and terrain branches in source
// order without changing the command intent established by cmd.c. It requires
// established u.dx/u.dy and context.move = 1. Success updates the position and
// leaves that turn flag untouched; a blocked step sets it to 0 and cancels
// multi, context.mv, and context.run. moveloop_core() calls this directly only
// for already-established movement intent. Like hack.c, a changed hero
// position sets u.umoved for the subsequent turn effects.
export async function domove(state = game) {
    const u = state.u;
    const newx = u.ux + u.dx;
    const newy = u.uy + u.dy;

    if (blocksMove(newx, newy, state)) {
        await test_move(u.ux, u.uy, u.dx, u.dy, state, {
            message: ttyPline,
        });
        state.context.move = 0;
        state.multi = 0;
        state.context.mv = 0;
        state.context.run = 0;
        state.domoveAttempting = 0;
        return;
    }
    const destinationMonster = m_at(newx, newy, state);
    if (destinationMonster) {
        requireOrdinaryStartingPetSwap(
            destinationMonster,
            newx,
            newy,
            state,
        );
    } else {
        requireSimpleHeroDestination(newx, newy, state);
    }

    const oldx = u.ux;
    const oldy = u.uy;
    u.ux0 = oldx;
    u.uy0 = oldy;
    if (destinationMonster) {
        const attackConsumedMove = await do_attack(
            destinationMonster,
            state,
            {
                endRunning,
                message: ttyPline,
                unsupported: (reason) => {
                    throw new UnsupportedHeroMoveBoundaryError(reason);
                },
            },
        );
        if (attackConsumedMove) {
            state.domoveAttempting = 0;
            return;
        }
    }
    if (!await in_out_region(newx, newy, { state })) return;
    u.ux = newx;
    u.uy = newy;
    if (destinationMonster) {
        await domove_swap_with_pet(
            destinationMonster,
            newx,
            newy,
            state,
            { message: ttyPline },
        );
    }
    u.umoved = true;

    if (hero_tread_disturbs_buried_zombies(state))
        disturb_buried_zombies(newx, newy, state);

    newsym(oldx, oldy);
    vision_recalc(1);
    newsym(newx, newy);
    switch_terrain_for_legal_move(state);
    check_special_room_state(false, state);
    await read_engr_at(newx, newy, state, {
        pline: ttyPline,
        canReachFloor: can_reach_floor,
    });
    const floorObject = state.level?.objects?.[newx]?.[newy] ?? null;
    if (floorObject && !floorObject.nexthere) {
        // C ref: domove() -> spoteffects(TRUE) -> pickup(1) -> check_here()
        // -> invent.c look_here().
        await look_here_single_object(
            floorObject,
            state,
            { message: ttyPline },
        );
    }
    maybe_smudge_engr(oldx, oldy, newx, newy, state);
    state.domoveAttempting = 0;
}

// C ref: hack.c domove_swap_with_pet(), successful ordinary starting-pet
// branch. The caller preflights traps, liquids, boulders, inaccessible source
// terrain, and special monster state before either position changes.
export async function domove_swap_with_pet(
    monster,
    x,
    y,
    state = game,
    env = {},
) {
    const message = env.message;
    if (typeof message !== 'function')
        throw new TypeError('pet swap requires a message operation');
    const { u } = state;
    const oldX = u.ux0;
    const oldY = u.uy0;

    monster.mundetected = false;
    monster.mtrapped = false;
    remove_monster(x, y, state);
    place_monster(monster, oldX, oldY, state);
    newsym(x, y);
    newsym(oldX, oldY);
    await message(
        `You swap places with ${alwaysVisibleMonsterName(monster, state)}.`,
        state,
    );
    return true;
}

// C ref: hack.c domove(), the heavy-tread branch immediately after the hero
// position update. Flying includes a flying steed, as the C macro does.
export function hero_tread_disturbs_buried_zombies(state = game) {
    const flyingProperty = state.u?.uprops?.[FLYING] ?? {};
    const flying = Boolean(
        (flyingProperty.intrinsic
            || flyingProperty.extrinsic
            || (state.u?.usteed && is_flyer(state.u.usteed.data)))
        && !flyingProperty.blocked,
    );
    return !propertyActiveUnblocked(state, LEVITATION)
        && !flying
        && !propertyActiveUnblocked(state, STEALTH)
        && (state.youmonst?.data?.cwt ?? 0) >= (WT_ELF / 2);
}

// C ref: hack.c spoteffects() -> switch_terrain() -> classify_terrain().
// Within the stable-level legal-move checkpoint, the destination cannot be
// solid terrain and the starting hero cannot carry terrain-blocked levitation
// or flight into this call. Those earlier switch_terrain() branches therefore
// have no effect; this owns its reachable terrain-status tail.
export function switch_terrain_for_legal_move(state = game) {
    const { u } = state;
    const current = state.level?.at(u?.ux, u?.uy);
    const previous = state.level?.at(u?.ux0, u?.uy0);
    if (!current || !previous) return false;
    if (current.typ === previous.typ
        && state.iflags?.terrain_typ !== MAX_TYPE) {
        return false;
    }
    if (state.flags?.terrainstatus) classify_terrain(state);
    return true;
}

// C ref: hack.c maybe_smudge_engr(). Each eligible engraving consumes rnd(5)
// before wipe_engr_at() applies its type-specific erosion draws.
export function maybe_smudge_engr(
    x1,
    y1,
    x2,
    y2,
    state = game,
    random = { rn2, rnd },
) {
    if (!can_reach_floor(true, state)) return false;
    let smudged = false;
    const smudge = (x, y) => {
        const engraving = engr_at(x, y, state);
        if (!engraving || engraving.engr_type === HEADSTONE) return;
        wipe_engr_at(x, y, random.rnd(5), false, { state, random });
        smudged = true;
    };
    smudge(x1, y1);
    if (x2 !== x1 || y2 !== y1) smudge(x2, y2);
    return smudged;
}

// C ref: hack.c disturb_buried_zombies(). Nearby noise shortens only active
// zombification timers; other corpse timers and distant burials are untouched.
export function disturb_buried_zombies(x, y, state = game) {
    for (let obj = state.level?.buriedobjlist ?? null;
        obj;
        obj = obj.nobj) {
        if (obj.otyp !== CORPSE
            || !obj.timed
            || obj.ox < x - 1
            || obj.ox > x + 1
            || obj.oy < y - 1
            || obj.oy > y + 1
            || peek_timer(ZOMBIFY_MON, obj, state) <= 0) {
            continue;
        }
        const remaining = stop_timer(ZOMBIFY_MON, obj, state);
        start_timer(
            Math.max(1, Math.trunc(remaining * 2 / 3)),
            TIMER_OBJECT,
            ZOMBIFY_MON,
            obj,
            state,
        );
    }
}

// C refs: hack.c may_dig() and may_passwall().
export function may_dig(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !((IS_STWALL(location.typ) || IS_TREE(location.typ, state))
        && ((location.wall_info ?? 0) & W_NONDIGGABLE));
}

export function may_passwall(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !(IS_STWALL(location.typ)
        && ((location.wall_info ?? 0) & W_NONPASSWALL));
}

// C ref: hack.c bad_rock(), specialized only by its supplied monster species.
export function bad_rock(species, x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return true;
    return Boolean(
        (state.level?.flags?.sokoban_rules && sobj_at(BOULDER, x, y, state))
        || (IS_OBSTRUCTED(location.typ)
            && (!tunnels(species) || needspick(species)
                || !may_dig(x, y, state))
            && !(passes_walls(species) && may_passwall(x, y, state))),
    );
}
