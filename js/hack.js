// Movement-adjacent world effects owned by hack.c.

import {
    FLYING,
    HEADSTONE,
    LEVITATION,
    MAX_TYPE,
    STEALTH,
    TIMER_OBJECT,
    WT_ELF,
    ZOMBIFY_MON,
} from './const.js';
import { classify_terrain } from './display.js';
import {
    can_reach_floor,
    engr_at,
    wipe_engr_at,
} from './engrave.js';
import { game } from './gstate.js';
import { is_flyer } from './mondata.js';
import { CORPSE } from './objects.js';
import { rn2, rnd } from './rng.js';
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
