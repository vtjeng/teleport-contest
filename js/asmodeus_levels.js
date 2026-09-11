// asmodeus_levels.js — Asmodeus's Gehennom special level.
//
// C refs: dat/asmodeus.lua, dat/nhlib.lua hell_tweaks(), selvar.c selection
// operations, and sp_lev.c's des.* handlers.

import { selection_match } from './bigrm.js';
import { depth } from './dungeon.js';
import { rn2 } from './rng.js';
import {
    W_NORTH,
    W_SOUTH,
    W_EAST,
    W_WEST,
} from './const.js';
import { ThemeroomSelection, selection_area } from './themerooms.js';

const ASMODEUS_MAP = [
    '---------------------',
    '|.............|.....|',
    '|.............S.....|',
    '|---+------------...|',
    '|.....|.........|-+--',
    '|..---|.........|....',
    '|..|..S.........|....',
    '|..|..|.........|....',
    '|..|..|.........|-+--',
    '|..|..-----------...|',
    '|..S..........|.....|',
    '---------------------',
].join('\n');

const ASMODEUS_AUXILIARY_MAP = [
    '---------------------------------',
    '................................|',
    '................................+',
    '................................|',
    '---------------------------------',
].join('\n');

function selectionUnion(a, b) {
    const result = a.clone();
    const bounds = b.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (b.get(x, y)) result.set(x, y);
        }
    }
    return result;
}

function selectionIntersection(a, b) {
    const result = new ThemeroomSelection(null, true);
    const boundsA = a.bounds();
    const boundsB = b.bounds();
    const lx = Math.max(boundsA.lx, boundsB.lx);
    const ly = Math.max(boundsA.ly, boundsB.ly);
    const hx = Math.min(boundsA.hx, boundsB.hx);
    const hy = Math.min(boundsA.hy, boundsB.hy);
    for (let x = lx; x <= hx; ++x) {
        for (let y = ly; y <= hy; ++y) {
            if (a.get(x, y) && b.get(x, y)) result.set(x, y);
        }
    }
    return result;
}

function absoluteArea(x1, y1, x2, y2, frame) {
    const result = new ThemeroomSelection(null, true);
    // selection.fillrect() resolves its Lua-relative corners through the
    // active whole-level frame before returning an absolute selection.
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y)
            result.set(frame.xstart + x, frame.ystart + y);
    }
    return result;
}

function mapSelection(placed) {
    const result = new ThemeroomSelection(null, true);
    for (let x = placed.xstart; x < placed.xstart + placed.xsize; ++x) {
        for (let y = placed.ystart; y < placed.ystart + placed.ysize; ++y)
            result.set(x, y);
    }
    return result;
}

function randomPointSelection(des) {
    const result = new ThemeroomSelection(null, true);
    const frame = des.frame;
    // selection.set(selection.new()) calls get_location_coord() with an
    // ANY_LOC random coordinate: rn2(xsize), then rn2(ysize).
    result.set(frame.xstart + rn2(frame.xsize),
               frame.ystart + rn2(frame.ysize));
    return result;
}

function randline(x1, y1, x2, y2, rough, rec, result) {
    if (rec < 1 || (x2 === x1 && y2 === y1)) return;
    if (rough > Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)))
        rough = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

    let mx, my;
    if (rough < 2) {
        mx = Math.trunc((x1 + x2) / 2);
        my = Math.trunc((y1 + y2) / 2);
    } else {
        do {
            mx = Math.trunc((x1 + x2) / 2)
                + rn2(rough) - Math.trunc(rough / 2);
            my = Math.trunc((y1 + y2) / 2)
                + rn2(rough) - Math.trunc(rough / 2);
        } while (mx < 0 || mx > 79 || my < 0 || my > 20);
    }

    if (!result.get(mx, my)) result.set(mx, my);
    rough = Math.trunc((rough * 2) / 3);
    randline(x1, y1, mx, my, rough, rec - 1, result);
    randline(mx, my, x2, y2, rough, rec - 1, result);
    result.set(x2, y2);
}

function selectionRandline(x1, y1, x2, y2, roughness, frame) {
    const result = new ThemeroomSelection(null, true);
    // l_selection_rndcoord() returns coordinates relative to the current
    // level frame; l_selection_randline() resolves them back to map space.
    randline(
        x1 + frame.xstart, y1 + frame.ystart,
        x2 + frame.xstart, y2 + frame.ystart,
        roughness, 12, result,
    );
    return result;
}

function randomDirectionSelection(selection, direction) {
    const directions = {
        north: W_NORTH,
        south: W_SOUTH,
        east: W_EAST,
        west: W_WEST,
    };
    return selection.grow(directions[direction], rn2);
}

function randomDirectionGrow(selection) {
    return selection.grow([W_NORTH, W_SOUTH, W_EAST, W_WEST][rn2(4)], rn2);
}

function selectionIterateRelative(selection, frame, callback) {
    selection.iterate(callback, { x: frame.xstart, y: frame.ystart });
}

// C ref: dat/nhlib.lua hell_tweaks(). The helper is kept here because every
// Asmodeus-level call to it changes terrain, objects, and the RNG stream.
function hellTweaks(des, protectedArea, state) {
    const liquid = 'L';
    const ground = '.';
    const nProtected = protectedArea.numpoints();
    const protectedComplement = protectedArea.negate();
    const frame = des.frame;

    // Random pools.
    if (rn2(100) < 20 + depth(state.u.uz, state)) {
        let pools = new ThemeroomSelection(null, true);
        const maxPools = 5 + (1 + rn2(depth(state.u.uz, state)));
        for (let i = 0; i < maxPools; ++i)
            pools = selectionUnion(pools, randomPointSelection(des));
        pools = selectionUnion(
            pools,
            randomDirectionSelection(randomPointSelection(des), 'west'),
        );
        pools = selectionUnion(
            pools,
            randomDirectionSelection(randomPointSelection(des), 'north'),
        );
        pools = selectionUnion(pools, randomDirectionGrow(randomPointSelection(des)));
        pools = selectionIntersection(pools, protectedComplement);

        if (rn2(100) < 80) {
            const poolground = selectionIntersection(
                pools.grow(), protectedComplement,
            );
            const percentage = (1 + rn2(8)) * 10;
            des.terrain(poolground.percentage(percentage, rn2), ground);
        }
        des.terrain(pools, liquid);
    }

    // Lava river.
    if (rn2(100) < 50) {
        let rivers = new ThemeroomSelection(null, true);
        const requiredPoints = ((80 * 21) - nProtected) / 12;
        let riverPoints = 0;
        let riverTries = 0;

        do {
            const floor = selection_match(ground, state);
            const a = floor.rndcoord(false, rn2, {
                x: frame.xstart, y: frame.ystart,
            });
            const b = floor.rndcoord(false, rn2, {
                x: frame.xstart, y: frame.ystart,
            });
            let river = selectionRandline(
                a.x, a.y, b.x, b.y, 10, frame,
            );
            if (rn2(100) < 50) river = river.grow(W_NORTH);
            if (rn2(100) < 50) river = river.grow(W_WEST);
            rivers = selectionIntersection(
                selectionUnion(rivers, river), protectedComplement,
            );
            riverPoints = rivers.numpoints();
            ++riverTries;
        } while (riverPoints <= requiredPoints && riverTries <= 7);

        if (rn2(100) < 60) {
            const percentage = (1 + rn2(6)) * 10;
            const banks = selectionIntersection(rivers.grow(), protectedComplement);
            des.terrain(banks.percentage(percentage, rn2), ground);
        }
        des.terrain(rivers, liquid);
    }

    // Replace some walls with boulders.
    if (rn2(100) < 20) {
        const amount = 3 * (1 + rn2(8));
        let walls = selectionUnion(
            selection_match('.w.', state).percentage(amount, rn2),
            selection_match('.\nw\n.', state).percentage(amount, rn2),
        );
        walls = selectionIntersection(walls, protectedComplement);
        selectionIterateRelative(walls, frame, (x, y) => {
            des.terrain(x, y, ground);
            des.object('boulder', x, y);
        });
    }

    // Replace some walls with iron bars.
    if (rn2(100) < 20) {
        const amount = 3 * (1 + rn2(8));
        let walls = selectionUnion(
            selection_match('.w.', state).percentage(amount, rn2),
            selection_match('.\nw\n.', state).percentage(amount, rn2),
        );
        walls = selectionIntersection(
            walls.grow(), selection_match('w', state),
        );
        walls = selectionIntersection(walls, protectedComplement);
        des.terrain(walls, 'F');
    }
}

// C ref: dat/asmodeus.lua, including its two map callbacks and the final
// hell_tweaks(protected) call. Each descriptor remains in source order.
export async function asmodeus(des, state) {
    des.level_init({ style: 'mazegrid', bg: '-' });
    des.level_flags('mazelevel');

    const tmpbounds = selection_match('-', state);
    const bnds = tmpbounds.bounds();
    const bounds2 = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );

    const asmo1 = des.map({
        halign: 'half-left',
        valign: 'center',
        map: ASMODEUS_MAP,
        contents() {
            des.door('closed', 4, 3);
            des.door('locked', 18, 4);
            des.door('closed', 18, 8);
            des.stair('down', 13, 7);
            des.non_diggable(selection_area(0, 0, 20, 11));
            des.region(selection_area(1, 1, 20, 10), 'unlit');
            des.monster('Asmodeus', 12, 7);
            des.object('[');
            des.object('[');
            des.object(')');
            des.object(')');
            des.object('*');
            des.object('!');
            des.object('!');
            des.object('?');
            des.object('?');
            des.object('?');
            des.trap('spiked pit', 5, 2);
            des.trap('fire', 8, 6);
            des.trap('sleep gas');
            des.trap('anti magic');
            des.trap('fire');
            des.trap('magic');
            des.trap('magic');
            des.monster('ghost', 11, 7);
            des.monster('horned devil', 10, 5);
            des.monster('L');
            des.monster('V');
            des.monster('V');
            des.monster('V');
        },
    });

    des.levregion({
        region: [1, 0, 6, 20], region_islev: 1,
        exclude: [6, 1, 70, 16], exclude_islev: 1,
        type: 'stair-up',
    });
    des.levregion({
        region: [1, 0, 6, 20], region_islev: 1,
        exclude: [6, 1, 70, 16], exclude_islev: 1,
        type: 'branch',
    });
    des.teleport_region({
        region: [1, 0, 6, 20], region_islev: 1,
        exclude: [6, 1, 70, 16], exclude_islev: 1,
    });

    const asmo2 = des.map({
        halign: 'half-right',
        valign: 'center',
        map: ASMODEUS_AUXILIARY_MAP,
        contents() {
            des.mazewalk(32, 2, 'east');
            des.non_diggable(selection_area(0, 0, 32, 4));
            des.door('closed', 32, 2);
            des.monster('&');
            des.monster('&');
            des.monster('&');
            des.trap('anti magic');
            des.trap('fire');
            des.trap('magic');
        },
    });

    const protectedArea = selectionUnion(
        bounds2.negate(),
        selectionUnion(mapSelection(asmo1), mapSelection(asmo2)),
    );
    hellTweaks(des, protectedArea, state);
}

export const ASMODEUS_LEVEL_LOADERS = Object.freeze({ asmodeus });
