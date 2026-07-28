// stairs.js — port of NetHack's stairs.c.
//
// The dungeon's stairways live in one singly linked list, game.stairs, which
// stands for C's gs.stairs. Every lookup below walks that list, so the list is
// the single owner of stairway state and nothing else may keep its own copy.

import { depth, on_level } from './dungeon.js';
import { game } from './gstate.js';
import { strsubst } from './hacklib.js';

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

// C ref: dungeon.c dunlev() and single_level_branch(). Both are one-line
// helpers that stairs_description() reads, so they stay beside their caller
// rather than becoming the whole of a dungeon.c port they do not represent.
function dunlev(level) {
    return level.dlevel;
}

function single_level_branch(level, state) {
    const knox = state.knox_level;
    return Boolean(knox
        && level.dnum === knox.dnum && level.dlevel === knox.dlevel);
}

// C ref: stairs.c stairs_description(). stcase true asks for the singular
// "staircase" or "ladder"; false asks for "stairs" or "ladder" and leaves the
// caller to form the sentence.
export function stairs_description(stway, stcase, state = game) {
    const tolev = stway.tolev;
    const stairs = stway.isladder
        ? 'ladder'
        : (stcase ? 'staircase' : 'stairs');
    const updown = stway.up ? 'up' : 'down';

    if (!known_branch_stairs(stway, state)) {
        // Ordinary stairs, or branch stairs to a branch not yet visited.
        let text = `${stairs} ${updown}`;
        if (stway.u_traversed) {
            const specialdepth = tolev.dnum === state.quest_dnum
                || single_level_branch(tolev, state);
            const to_dlev = specialdepth
                ? dunlev(tolev)
                : depth(tolev, state);
            text += ` to level ${to_dlev}`;
        }
        return text;
    }
    if (state.u.uz.dnum === 0 && state.u.uz.dlevel === 1 && stway.up) {
        // The stairs up from level one are marked traversed because the hero
        // came down them, but where they lead depends on the Amulet.
        const amulet = Boolean(state.u.uhave?.amulet);
        const elemental = [
            state.earth_level,
            state.air_level,
            state.fire_level,
            state.water_level,
        ].some((level) => level && on_level(tolev, level));
        return `${amulet ? 'branch ' : ''}${stairs} ${updown} ${
            !amulet
                ? 'out of the dungeon'
                : (elemental ? 'to the Elemental Planes' : 'to the end game')
        }`;
    }
    // Known branch stairs; naming the destination level too would be verbose.
    return strsubst(
        `branch ${stairs} ${updown} to ${state.dungeons[tolev.dnum].dname}`,
        'The ',
        'the ',
    );
}
