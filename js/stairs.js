// stairs.js — port of NetHack's stairs.c.
//
// The dungeon's stairways live in one singly linked list, game.stairs, which
// stands for C's gs.stairs. Every lookup below walks that list, so the list is
// the single owner of stairway state and nothing else may keep its own copy.

import {
    depth,
    dunlev,
    on_level,
    single_level_branch,
    u_on_newpos,
    u_on_rndspot,
} from './dungeon.js';
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

// C ref: stairs.c stairway_free_all(), which do.c goto_level() calls once the
// hero's level has changed and before the destination is built. C frees each
// node; dropping the list head is the port's equivalent.
export function stairway_free_all(state = game) {
    state.stairs = null;
}

// C ref: stairs.c stairway_find_from(). Answers the stairway on this level
// that leads back to `fromdlev` and matches `isladder`, which is how an
// arriving hero finds the foot of the staircase she just came down.
export function stairway_find_from(fromdlev, isladder, state = game) {
    const wantsLadder = Boolean(isladder);
    for (let stway = state.stairs; stway; stway = stway.next) {
        if (stway.tolev.dnum === fromdlev.dnum
            && stway.tolev.dlevel === fromdlev.dlevel
            && Boolean(stway.isladder) === wantsLadder) {
            return stway;
        }
    }
    return null;
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

// C ref: stairs.c u_on_sstairs(). Places the hero on the branch staircase that
// leads the other way from `upflag`, and falls back to a random spot when this
// level has none.
export function u_on_sstairs(upflag, state = game) {
    const stway = stairway_find_special_dir(upflag, state);

    if (stway)
        u_on_newpos(stway.sx, stway.sy, state);
    else
        u_on_rndspot(upflag, state);
}

// C ref: stairs.c u_on_dnstairs() (137-145). Fallback placement for a hero
// ascending at stairs: the destination level has no staircase back to the
// level just left, so place her on the downstair. The sstairs fallback
// passes 1 (moving up) so that stairway_find_special_dir looks for a branch
// staircase in the upward direction.
export function u_on_dnstairs(state = game) {
    const stway = stairway_find_dir(false, state);

    if (stway)
        u_on_newpos(stway.sx, stway.sy, state);
    else
        u_on_sstairs(1, state); /* destination dnstairs implies moving up */
}

// C ref: stairs.c u_on_upstairs(). allmain.c newgame() places the starting
// hero with it, and do.c goto_level() uses it for a descent whose destination
// carries no staircase back to the level just left.
export function u_on_upstairs(state = game) {
    const stway = stairway_find_dir(true, state);

    if (stway)
        u_on_newpos(stway.sx, stway.sy, state);
    else
        u_on_sstairs(0, state); /* destination upstairs implies moving down */
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
