// orcus_levels.js — Orcus's Gehennom special level.
//
// C refs: dat/orcus.lua, dat/nhlib.lua hell_tweaks(), selvar.c selection
// operations, and sp_lev.c's des.* handlers.

import { selection_match } from './bigrm.js';
import { hellTweaks } from './asmodeus_levels.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

const ORCUS_MAP = [
    '.|....|....|....|..............|....|........',
    '.|....|....|....|..............|....|........',
    '.|....|....|....|--...-+-------|.............',
    '.|....|....|....|..............+.............',
    '.|.........|....|..............|....|........',
    '.--+-...-+----+--....-------...--------.-+---',
    '.....................|.....|.................',
    '.....................|.....|.................',
    '.--+----....-+---....|.....|...----------+---',
    '.|....|....|....|....---+---...|......|......',
    '.|.........|....|..............|......|......',
    '.----...---------.....-----....+......|......',
    '.|........................|....|......|......',
    '.----------+-...--+--|....|....----------+---',
    '.|....|..............|....+....|.............',
    '.|....+.......|......|....|....|.............',
    '.|....|.......|......|....|....|.............',
].join('\n');

// C ref: dat/orcus.lua. The source computes this selection before placing the
// map, while the level frame still starts at column 1 and row 0. Constructing
// an absolute selection keeps selection.fillrect()'s get_location_coord()
// conversion visible after the JS selection API returns its relative points.
function absoluteArea(x1, y1, x2, y2, frame) {
    const result = new ThemeroomSelection(null, true);
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y)
            result.set(frame.xstart + x, frame.ystart + y);
    }
    return result;
}

function selectionUnion(a, b) {
    const result = a.clone();
    const bounds = b.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y)
            if (b.get(x, y)) result.set(x, y);
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

// C ref: dat/orcus.lua, including the map callback and hell_tweaks() call.
// Each descriptor remains in source order so level generation and its random
// stream follow the Lua program.
export async function orcus(des, state) {
    des.level_init({ style: 'mazegrid', bg: '-' });
    des.level_flags('mazelevel', 'shortsighted');

    const tmpbounds = selection_match('-', state);
    const bnds = tmpbounds.bounds();
    const bounds2 = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );

    const orcus1 = des.map({
        halign: 'right',
        valign: 'center',
        map: ORCUS_MAP,
        contents() {
            des.mazewalk(0, 6, 'west');

            des.region(selection_area(1, 0, 44, 16), 'unlit');
            des.stair('down', 33, 15);

            des.object('boulder', 19, 2);
            des.object('boulder', 20, 2);
            des.object('boulder', 21, 2);
            des.object('boulder', 36, 2);
            des.object('boulder', 36, 3);
            des.object('boulder', 6, 4);
            des.object('boulder', 5, 5);
            des.object('boulder', 6, 5);
            des.object('boulder', 7, 5);
            des.object('boulder', 39, 5);
            des.object('boulder', 8, 8);
            des.object('boulder', 9, 8);
            des.object('boulder', 10, 8);
            des.object('boulder', 11, 8);
            des.object('boulder', 6, 10);
            des.object('boulder', 5, 11);
            des.object('boulder', 6, 11);
            des.object('boulder', 7, 11);
            des.object('boulder', 21, 11);
            des.object('boulder', 21, 12);
            des.object('boulder', 13, 13);
            des.object('boulder', 14, 13);
            des.object('boulder', 15, 13);
            des.object('boulder', 14, 14);

            des.door('closed', 23, 2);
            des.door('open', 31, 3);
            des.door('nodoor', 3, 5);
            des.door('closed', 9, 5);
            des.door('closed', 14, 5);
            des.door('closed', 41, 5);
            des.door('open', 3, 8);
            des.door('nodoor', 13, 8);
            des.door('open', 41, 8);
            des.door('closed', 24, 9);
            des.door('closed', 31, 11);
            des.door('open', 11, 13);
            des.door('closed', 18, 13);
            des.door('closed', 41, 13);
            des.door('open', 26, 14);
            des.door('closed', 6, 15);

            des.altar({ x: 24, y: 7, align: 'noalign', type: 'sanctum' });
            des.region({ region: [22, 12, 25, 16], lit: 0,
                type: 'morgue', filled: 1 });
            des.region({ region: [32, 9, 37, 12], lit: 1,
                type: 'shop', filled: 1 });
            des.region({ region: [12, 0, 15, 4], lit: 1,
                type: 'shop', filled: 1 });

            des.trap('spiked pit');
            des.trap('sleep gas');
            des.trap('anti magic');
            des.trap('fire');
            des.trap('fire');
            des.trap('fire');
            des.trap('magic');
            des.trap('magic');

            des.object();
            des.object();
            des.object();
            des.object();
            des.object();
            des.object();
            des.object();
            des.object();
            des.object();
            des.object();
            // The source's compensation item uses one math.random(0, 1)
            // draw, represented by rn2(2) in the special-level API.
            if (des.random.rn2(2) === 1) des.object('magic marker');
            else des.object('magic lamp');

            des.monster('Orcus', 33, 15);
            des.monster('human zombie', 32, 15);
            des.monster('shade', 32, 14);
            des.monster('shade', 32, 16);
            des.monster('vampire', 35, 16);
            des.monster('vampire', 35, 14);
            des.monster('vampire lord', 36, 14);
            des.monster('vampire lord', 36, 15);

            for (const id of [
                'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton',
                'shade', 'shade', 'shade', 'shade',
                'giant zombie', 'giant zombie', 'giant zombie',
                'ettin zombie', 'ettin zombie', 'ettin zombie',
                'human zombie', 'human zombie', 'human zombie',
                'vampire', 'vampire', 'vampire',
                'vampire lord', 'vampire lord',
            ]) {
                des.monster(id);
            }

            for (let i = 0; i < 5; ++i) des.monster();
        },
    });

    des.levregion({
        region: [1, 0, 12, 20], region_islev: 1,
        exclude: [20, 1, 70, 20], exclude_islev: 1,
        type: 'stair-up',
    });
    des.levregion({
        region: [1, 0, 12, 20], region_islev: 1,
        exclude: [20, 1, 70, 20], exclude_islev: 1,
        type: 'branch',
    });
    des.teleport_region({
        region: [1, 0, 12, 20], region_islev: 1,
        exclude: [20, 1, 70, 20], exclude_islev: 1,
    });

    const protectedArea = selectionUnion(bounds2.negate(), mapSelection(orcus1));
    hellTweaks(des, protectedArea, state);
}

export const ORCUS_LEVEL_LOADERS = Object.freeze({ orcus });
