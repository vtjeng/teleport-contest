// extralev.js -- procedural Rogue-style level generation.
// C ref: extralev.c roguejoin(), roguecorr(), miniwalk(),
// makeroguerooms(), corr(), and makerogueghost().

import {
    CORR,
    OROOM,
    NO_MM_FLAGS,
    XL_UP,
    XL_DOWN,
    XL_LEFT,
    XL_RIGHT,
    SCORR,
    IS_WALL,
    D_NODOOR,
} from './const.js';
import {
    RING_MAIL,
    TWO_HANDED_SWORD,
    BOW,
    ARROW,
    FOOD_RATION,
    MACE,
    PLATE_MAIL,
    FAKE_AMULET_OF_YENDOR,
} from './objects.js';
import { PM_GHOST } from './monsters.js';
import {
    add_room,
    dodoor,
} from './mklev.js';
import { game } from './gstate.js';
import { rn1, rn2, rnd } from './rng.js';
import { somex, somey } from './room_coordinates.js';
import { makemon } from './makemon_create.js';
import { christen_monst, roguename } from './do_name.js';
import {
    mksobj_at,
    weight,
    curse,
} from './obj.js';
import { objectGenerationEnv } from './object_generation.js';

// C stores the 3x3 room graph in the file-global gr.r[][]. A level build
// overwrites all nine entries, so the JavaScript equivalent can live on the
// current game object and be discarded with the next level.
function rogueRooms(state = game) {
    state.rogueRooms ??= Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({
            real: false,
            rlx: 0,
            rly: 0,
            dx: 0,
            dy: 0,
            nroom: 0,
            doortable: 0,
        })));
    return state.rogueRooms;
}

function roguejoin(x1, y1, x2, y2, horiz, state = game) {
    if (horiz) {
        const middle = x1 + rn2(x2 - x1 + 1);
        for (let x = Math.min(x1, middle); x <= Math.max(x1, middle); ++x)
            corr(x, y1, state);
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); ++y)
            corr(middle, y, state);
        for (let x = Math.min(middle, x2); x <= Math.max(middle, x2); ++x)
            corr(x, y2, state);
    } else {
        const middle = y1 + rn2(y2 - y1 + 1);
        for (let y = Math.min(y1, middle); y <= Math.max(y1, middle); ++y)
            corr(x1, y, state);
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); ++x)
            corr(x, middle, state);
        for (let y = Math.min(middle, y2); y <= Math.max(middle, y2); ++y)
            corr(x2, y, state);
    }
}

function roguecorr(x, y, dir, state = game) {
    const rooms = rogueRooms(state);
    const here = rooms[x][y];
    let fromx, fromy, tox, toy;

    if (dir === XL_DOWN) {
        here.doortable &= ~XL_DOWN;
        if (!here.real) {
            fromx = here.rlx;
            fromy = here.rly;
            fromx += 1 + 26 * x;
            fromy += 7 * y;
        } else {
            fromx = here.rlx + rn2(here.dx);
            fromy = here.rly + here.dy;
            fromx += 1 + 26 * x;
            fromy += 7 * y;
            if (!IS_WALL(state.level.at(fromx, fromy).typ))
                throw new Error(`down: no wall at ${fromx},${fromy}?`);
            dodoor(fromx, fromy, state.level.rooms[here.nroom], state);
            state.level.at(fromx, fromy).doormask = D_NODOOR;
            ++fromy;
        }
        if (y >= 2)
            throw new Error(`down door from ${x},${y} going nowhere?`);
        ++y;
        const next = rooms[x][y];
        next.doortable &= ~XL_UP;
        if (!next.real) {
            tox = next.rlx;
            toy = next.rly;
            tox += 1 + 26 * x;
            toy += 7 * y;
        } else {
            tox = next.rlx + rn2(next.dx);
            toy = next.rly - 1;
            tox += 1 + 26 * x;
            toy += 7 * y;
            if (!IS_WALL(state.level.at(tox, toy).typ))
                throw new Error(`up: no wall at ${tox},${toy}?`);
            dodoor(tox, toy, state.level.rooms[next.nroom], state);
            state.level.at(tox, toy).doormask = D_NODOOR;
            --toy;
        }
        roguejoin(fromx, fromy, tox, toy, false, state);
        return;
    }

    if (dir === XL_RIGHT) {
        here.doortable &= ~XL_RIGHT;
        if (!here.real) {
            fromx = here.rlx;
            fromy = here.rly;
            fromx += 1 + 26 * x;
            fromy += 7 * y;
        } else {
            fromx = here.rlx + here.dx;
            fromy = here.rly + rn2(here.dy);
            fromx += 1 + 26 * x;
            fromy += 7 * y;
            if (!IS_WALL(state.level.at(fromx, fromy).typ))
                throw new Error(`down: no wall at ${fromx},${fromy}?`);
            dodoor(fromx, fromy, state.level.rooms[here.nroom], state);
            state.level.at(fromx, fromy).doormask = D_NODOOR;
            ++fromx;
        }
        if (x >= 2)
            throw new Error(`right door from ${x},${y} going nowhere?`);
        ++x;
        const next = rooms[x][y];
        next.doortable &= ~XL_LEFT;
        if (!next.real) {
            tox = next.rlx;
            toy = next.rly;
            tox += 1 + 26 * x;
            toy += 7 * y;
        } else {
            tox = next.rlx - 1;
            toy = next.rly + rn2(next.dy);
            tox += 1 + 26 * x;
            toy += 7 * y;
            if (!IS_WALL(state.level.at(tox, toy).typ))
                throw new Error(`left: no wall at ${tox},${toy}?`);
            dodoor(tox, toy, state.level.rooms[next.nroom], state);
            state.level.at(tox, toy).doormask = D_NODOOR;
            --tox;
        }
        roguejoin(fromx, fromy, tox, toy, true, state);
        return;
    }

    throw new Error(`corridor in direction ${dir}?`);
}

// Modified walkfrom() from mkmaze.c.
function miniwalk(x, y, state = game) {
    const rooms = rogueRooms(state);
    while (true) {
        const here = rooms[x][y];
        const dirs = [];
        if (x > 0 && !(here.doortable & XL_LEFT)
            && (!rooms[x - 1][y].doortable || !rn2(10)))
            dirs.push(0);
        if (x < 2 && !(here.doortable & XL_RIGHT)
            && (!rooms[x + 1][y].doortable || !rn2(10)))
            dirs.push(1);
        if (y > 0 && !(here.doortable & XL_UP)
            && (!rooms[x][y - 1].doortable || !rn2(10)))
            dirs.push(2);
        if (y < 2 && !(here.doortable & XL_DOWN)
            && (!rooms[x][y + 1].doortable || !rn2(10)))
            dirs.push(3);
        if (!dirs.length) return;
        const dir = dirs[rn2(dirs.length)];
        switch (dir) {
        case 0:
            here.doortable |= XL_LEFT;
            --x;
            rooms[x][y].doortable |= XL_RIGHT;
            break;
        case 1:
            here.doortable |= XL_RIGHT;
            ++x;
            rooms[x][y].doortable |= XL_LEFT;
            break;
        case 2:
            here.doortable |= XL_UP;
            --y;
            rooms[x][y].doortable |= XL_DOWN;
            break;
        case 3:
            here.doortable |= XL_DOWN;
            ++y;
            rooms[x][y].doortable |= XL_UP;
            break;
        default:
            break;
        }
        miniwalk(x, y, state);
    }
}

function makeroguerooms(state = game) {
    const rooms = rogueRooms(state);
    let nroom = 0;

    for (let y = 0; y < 3; ++y) {
        for (let x = 0; x < 3; ++x) {
            const here = rooms[x][y];
            if (!rn2(5) && (nroom || (x < 2 && y < 2))) {
                here.real = false;
                here.rlx = rn1(22, 2);
                here.rly = rn1(y === 2 ? 4 : 3, 2);
            } else {
                here.real = true;
                here.dx = rn1(22, 2);
                here.dy = rn1(y === 2 ? 4 : 3, 2);
                here.rlx = rnd(23 - here.dx + 1);
                here.rly = rnd((y === 2 ? 5 : 4) - here.dy + 1);
                ++nroom;
            }
            here.doortable = 0;
        }
    }

    miniwalk(rn2(3), rn2(3), state);

    nroom = 0;
    for (let y = 0; y < 3; ++y) {
        for (let x = 0; x < 3; ++x) {
            const here = rooms[x][y];
            if (!here.real) continue;
            here.nroom = nroom;
            state.smeq[nroom] = nroom;
            const lowx = 1 + 26 * x + here.rlx;
            const lowy = 7 * y + here.rly;
            const hix = lowx + here.dx - 1;
            const hiy = lowy + here.dy - 1;
            add_room(
                lowx,
                lowy,
                hix,
                hiy,
                Boolean(!rn2(7)),
                OROOM,
                false,
            );
            ++nroom;
        }
    }

    for (let y = 0; y < 3; ++y) {
        for (let x = 0; x < 3; ++x) {
            const here = rooms[x][y];
            if (here.doortable & XL_DOWN) roguecorr(x, y, XL_DOWN, state);
            if (here.doortable & XL_RIGHT) roguecorr(x, y, XL_RIGHT, state);
            if (here.doortable & XL_LEFT)
                throw new Error(`left end of ${x},${y} never connected?`);
            if (here.doortable & XL_UP)
                throw new Error(`up end of ${x},${y} never connected?`);
        }
    }
}

function corr(x, y, state = game) {
    state.level.at(x, y).typ = rn2(50) ? CORR : SCORR;
}

function makerogueghost(state = game) {
    if (!state.level.nroom) return;
    const croom = state.level.rooms[rn2(state.level.nroom)];
    const x = somex(croom);
    const y = somey(croom);
    const env = objectGenerationEnv({ state });
    const ghost = makemon(state.mons[PM_GHOST], x, y, NO_MM_FLAGS, env);
    if (!ghost) return;
    ghost.msleeping = true;
    christen_monst(ghost, roguename(state));

    let ghostobj;
    if (rn2(4)) {
        ghostobj = mksobj_at(FOOD_RATION, x, y, false, false, env);
        ghostobj.quan = rnd(7);
        ghostobj.owt = weight(ghostobj, env);
    }
    if (rn2(2)) {
        ghostobj = mksobj_at(MACE, x, y, false, false, env);
        ghostobj.spe = rnd(3);
        if (rn2(4)) curse(ghostobj, env);
    } else {
        ghostobj = mksobj_at(TWO_HANDED_SWORD, x, y, false, false, env);
        ghostobj.spe = rnd(5) - 2;
        if (rn2(4)) curse(ghostobj, env);
    }
    ghostobj = mksobj_at(BOW, x, y, false, false, env);
    ghostobj.spe = 1;
    if (rn2(4)) curse(ghostobj, env);

    ghostobj = mksobj_at(ARROW, x, y, false, false, env);
    ghostobj.spe = 0;
    ghostobj.quan = rn1(10, 25);
    ghostobj.owt = weight(ghostobj, env);
    if (rn2(4)) curse(ghostobj, env);

    if (rn2(2)) {
        ghostobj = mksobj_at(RING_MAIL, x, y, false, false, env);
        ghostobj.spe = rn2(3);
        if (!rn2(3)) ghostobj.oerodeproof = true;
        if (rn2(4)) curse(ghostobj, env);
    } else {
        ghostobj = mksobj_at(PLATE_MAIL, x, y, false, false, env);
        ghostobj.spe = rnd(5) - 2;
        if (!rn2(3)) ghostobj.oerodeproof = true;
        if (rn2(4)) curse(ghostobj, env);
    }
    if (rn2(2)) {
        ghostobj = mksobj_at(FAKE_AMULET_OF_YENDOR, x, y, true, false, env);
        ghostobj.known = true;
    }
}

export {
    roguejoin,
    roguecorr,
    miniwalk,
    makeroguerooms,
    corr,
    makerogueghost,
};
