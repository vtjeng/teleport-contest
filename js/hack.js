// Movement-adjacent world effects owned by hack.c.

import {
    FLYING,
    HEADSTONE,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_TREE,
    IS_WALL,
    LEVITATION,
    MAX_TYPE,
    STEALTH,
    STONE,
    TIMER_OBJECT,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    WT_ELF,
    ZOMBIFY_MON,
} from './const.js';
import { classify_terrain, newsym, wall_angle } from './display.js';
import { alwaysVisibleMonsterName } from './do_name.js';
import {
    can_reach_floor,
    engr_at,
    wipe_engr_at,
} from './engrave.js';
import { game } from './gstate.js';
import {
    is_flyer,
    needspick,
    passes_walls,
    tunnels,
} from './mondata.js';
import { sobj_at } from './obj.js';
import { BOULDER, CORPSE } from './objects.js';
import { place_monster, remove_monster } from './monst.js';
import { rn2, rnd } from './rng.js';
import { S_stone } from './symbols.js';
import {
    peek_timer,
    start_timer,
    stop_timer,
} from './timeout.js';

function propertyActiveUnblocked(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
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
