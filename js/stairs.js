// stairs.js — port of NetHack's stairs.c.
//
// The dungeon's stairways live in one singly linked list, game.stairs, which
// stands for C's gs.stairs. Every lookup below walks that list, so the list is
// the single owner of stairway state and nothing else may keep its own copy.

import { game } from './gstate.js';

// C ref: stairs.c stairway_add(). C also clears u_traversed here; the object
// literal omits it, and js/mklev.js sets it on the D:1 upstairs exactly where
// mklev.c does.
export function stairway_add(x, y, up, isladder, dest) {
    const node = {
        sx: x,
        sy: y,
        up,
        isladder,
        tolev: { ...dest },
        next: game.stairs,
    };
    game.stairs = node;
}

// C ref: stairs.c stairway_at().
export function stairway_at(x, y, state = game) {
    for (let stway = state.stairs; stway; stway = stway.next)
        if (stway.sx === x && stway.sy === y) return stway;
    return null;
}

// C ref: stairs.c stairway_find_dir().
export function stairway_find_dir(up, state = game) {
    const direction = Boolean(up);
    for (let stway = state.stairs; stway; stway = stway.next)
        if (Boolean(stway.up) === direction) return stway;
    return null;
}

// C ref: stairs.c stairway_find_special_dir().
export function stairway_find_special_dir(up, state = game) {
    const direction = Boolean(up);
    for (let stway = state.stairs; stway; stway = stway.next) {
        if (stway.tolev.dnum !== (state.u?.uz?.dnum ?? 0)
            && Boolean(stway.up) !== direction) {
            return stway;
        }
    }
    return null;
}

// C ref: stairs.c On_stairs().
export function On_stairs(x, y, state = game) {
    return stairway_at(x, y, state) !== null;
}

// C ref: stairs.c known_branch_stairs().
export function known_branch_stairs(stway, state = game) {
    return Boolean(stway
        && stway.tolev?.dnum !== state.u?.uz?.dnum
        && stway.u_traversed);
}
