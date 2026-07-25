// Shared monster-trap state and presentation helpers.
// C refs: trap.c mintrap(), seetrap(), mon_learns_traps(),
// mon_knows_traps(), and deltrap().

import {
    FORCETRAP,
    FORCEBUNGLE,
    HOLE,
    HURTLING,
    TOOKPLUNGE,
    VIASITTING,
} from './const.js';
import { newsym } from './display.js';
import { dist2 } from './hacklib.js';
import {
    haseyes,
    is_animal,
    is_floater,
    is_flyer,
    mindless,
} from './mondata.js';
import { clear_path } from './vision.js';

export function reveal_monster_trap(trap) {
    if (trap.tseen) return;
    trap.tseen = true;
    newsym(trap.tx, trap.ty);
}

export function monster_learns_trap(monster, trapType) {
    monster.mtrapseen = (monster.mtrapseen ?? 0)
        | (1 << (trapType - 1));
}

export function nearby_monsters_learn_trap(trap, state) {
    const lit = state.level.at(trap.tx, trap.ty).lit;
    const maximumDistance = lit ? 49 : 2;
    for (let observer = state.level.monlist;
        observer;
        observer = observer.nmon) {
        if (is_animal(observer.data) || mindless(observer.data)
            || !haseyes(observer.data) || !observer.mcansee
            || dist2(
                observer.mx,
                observer.my,
                trap.tx,
                trap.ty,
            ) > maximumDistance
            || !clear_path(
                observer.mx,
                observer.my,
                trap.tx,
                trap.ty,
            )) {
            continue;
        }
        monster_learns_trap(observer, trap.ttyp);
    }
}

export function delete_monster_trap(trap, state) {
    const index = state.level.traps.indexOf(trap);
    if (index < 0) throw new Error('deltrap: trap is not on the level');
    state.level.traps.splice(index, 1);
}

export function trap_at_monster(monster, state) {
    return (state.level?.traps ?? []).find(
        (trap) => trap.tx === monster.mx && trap.ty === monster.my,
    ) ?? null;
}

export function monster_skips_floor_trap(monster, env) {
    const flags = env.trapFlags ?? 0;
    if (flags & FORCETRAP) return false;
    const plunged = Boolean(flags & (TOOKPLUNGE | VIASITTING));
    return Boolean(flags & HURTLING)
        || is_floater(monster.data)
        || (is_flyer(monster.data) && !plunged);
}

export function monster_avoids_known_trap(monster, trap, env) {
    const known = Boolean(
        (monster.mtrapseen ?? 0) & (1 << (trap.ttyp - 1)),
    ) || (trap.ttyp === HOLE && !mindless(monster.data));
    return known
        && !(env.trapFlags & FORCETRAP)
        && !(env.trapFlags & FORCEBUNGLE)
        && Boolean(env.random.rn2(4));
}
