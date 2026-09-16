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
    await des.level_init({ style: 'mazegrid', bg: '-' });
    await des.level_flags('mazelevel', 'shortsighted');

    const tmpbounds = selection_match('-', state);
    const bnds = tmpbounds.bounds();
    const bounds2 = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );

    const orcus1 = await des.map({
        halign: 'right',
        valign: 'center',
        map: ORCUS_MAP,
        async contents() {
            await des.mazewalk(0, 6, 'west');

            await des.region(selection_area(1, 0, 44, 16), 'unlit');
            await des.stair('down', 33, 15);

            await des.object('boulder', 19, 2);
            await des.object('boulder', 20, 2);
            await des.object('boulder', 21, 2);
            await des.object('boulder', 36, 2);
            await des.object('boulder', 36, 3);
            await des.object('boulder', 6, 4);
            await des.object('boulder', 5, 5);
            await des.object('boulder', 6, 5);
            await des.object('boulder', 7, 5);
            await des.object('boulder', 39, 5);
            await des.object('boulder', 8, 8);
            await des.object('boulder', 9, 8);
            await des.object('boulder', 10, 8);
            await des.object('boulder', 11, 8);
            await des.object('boulder', 6, 10);
            await des.object('boulder', 5, 11);
            await des.object('boulder', 6, 11);
            await des.object('boulder', 7, 11);
            await des.object('boulder', 21, 11);
            await des.object('boulder', 21, 12);
            await des.object('boulder', 13, 13);
            await des.object('boulder', 14, 13);
            await des.object('boulder', 15, 13);
            await des.object('boulder', 14, 14);

            await des.door('closed', 23, 2);
            await des.door('open', 31, 3);
            await des.door('nodoor', 3, 5);
            await des.door('closed', 9, 5);
            await des.door('closed', 14, 5);
            await des.door('closed', 41, 5);
            await des.door('open', 3, 8);
            await des.door('nodoor', 13, 8);
            await des.door('open', 41, 8);
            await des.door('closed', 24, 9);
            await des.door('closed', 31, 11);
            await des.door('open', 11, 13);
            await des.door('closed', 18, 13);
            await des.door('closed', 41, 13);
            await des.door('open', 26, 14);
            await des.door('closed', 6, 15);

            await des.altar({ x: 24, y: 7, align: 'noalign', type: 'sanctum' });
            await des.region({ region: [22, 12, 25, 16], lit: 0,
                type: 'morgue', filled: 1 });
            await des.region({ region: [32, 9, 37, 12], lit: 1,
                type: 'shop', filled: 1 });
            await des.region({ region: [12, 0, 15, 4], lit: 1,
                type: 'shop', filled: 1 });

            await des.trap('spiked pit');
            await des.trap('sleep gas');
            await des.trap('anti magic');
            await des.trap('fire');
            await des.trap('fire');
            await des.trap('fire');
            await des.trap('magic');
            await des.trap('magic');

            await des.object();
            await des.object();
            await des.object();
            await des.object();
            await des.object();
            await des.object();
            await des.object();
            await des.object();
            await des.object();
            await des.object();
            // The source's compensation item uses one math.random(0, 1)
            // draw, represented by rn2(2) in the special-level API.
            if (des.random.rn2(2) === 1) await des.object('magic marker');
            else await des.object('magic lamp');

            await des.monster('Orcus', 33, 15);
            await des.monster('human zombie', 32, 15);
            await des.monster('shade', 32, 14);
            await des.monster('shade', 32, 16);
            await des.monster('vampire', 35, 16);
            await des.monster('vampire', 35, 14);
            await des.monster('vampire lord', 36, 14);
            await des.monster('vampire lord', 36, 15);

            for (const id of [
                'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton',
                'shade', 'shade', 'shade', 'shade',
                'giant zombie', 'giant zombie', 'giant zombie',
                'ettin zombie', 'ettin zombie', 'ettin zombie',
                'human zombie', 'human zombie', 'human zombie',
                'vampire', 'vampire', 'vampire',
                'vampire lord', 'vampire lord',
            ]) {
                await des.monster(id);
            }

            for (let i = 0; i < 5; ++i) await des.monster();
        },
    });

    await des.levregion({
        region: [1, 0, 12, 20], region_islev: 1,
        exclude: [20, 1, 70, 20], exclude_islev: 1,
        type: 'stair-up',
    });
    await des.levregion({
        region: [1, 0, 12, 20], region_islev: 1,
        exclude: [20, 1, 70, 20], exclude_islev: 1,
        type: 'branch',
    });
    await des.teleport_region({
        region: [1, 0, 12, 20], region_islev: 1,
        exclude: [20, 1, 70, 20], exclude_islev: 1,
    });

    const protectedArea = selectionUnion(bounds2.negate(), mapSelection(orcus1));
    await hellTweaks(des, protectedArea, state);
}

export const ORCUS_LEVEL_LOADERS = Object.freeze({ orcus });
