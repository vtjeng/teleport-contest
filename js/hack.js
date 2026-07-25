// Movement-adjacent world effects owned by hack.c.

import {
    FLYING,
    LEVITATION,
    STEALTH,
    TIMER_OBJECT,
    WT_ELF,
    ZOMBIFY_MON,
} from './const.js';
import { game } from './gstate.js';
import { is_flyer } from './mondata.js';
import { CORPSE } from './objects.js';
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
