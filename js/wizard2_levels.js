// wizard2_levels.js — The middle Wizard's Tower level.
//
// C refs: dat/wizard2.lua, dat/nhlib.lua hell_tweaks(), selvar.c selection
// operations, and sp_lev.c's des.* handlers.

import { selection_match } from './bigrm.js';
import { hellTweaks } from './asmodeus_levels.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

// C ref: dat/wizard2.lua's des.map() literal. The trailing x on every row is
// transparent and therefore deliberately remains part of the source map.
const WIZARD2_MAP = [
    '----------------------------x',
    '|.....|.S....|.............|x',
    '|.....|.-------S--------S--|x',
    '|.....|.|.........|........|x',
    '|..-S--S|.........|........|x',
    '|..|....|.........|------S-|x',
    '|..|....|.........|.....|..|x',
    '|-S-----|.........|.....|..|x',
    '|.......|.........|S--S--..|x',
    '|.......|.........|.|......|x',
    '|-----S----S-------.|......|x',
    '|............|....S.|......|x',
    '----------------------------x',
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

function absoluteArea(x1, y1, x2, y2, frame) {
    const result = new ThemeroomSelection(null, true);
    // selection.fillrect() resolves Lua-relative coordinates through the
    // active frame before the source computes its protected complement.
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y)
            result.set(frame.xstart + x, frame.ystart + y);
    }
    return result;
}

function mapSelection(placed) {
    const result = new ThemeroomSelection(null, true);
    const rows = WIZARD2_MAP.split('\n');
    // lspo_map() returns only cells whose map characters have terrain. The
    // trailing `x` on each source row is transparent and remains unselected.
    for (let y = 0; y < rows.length; ++y) {
        for (let x = 0; x < rows[y].length; ++x) {
            if (rows[y][x] !== 'x') result.set(placed.xstart + x,
                                               placed.ystart + y);
        }
    }
    return result;
}

// C ref: dat/wizard2.lua, including its map callback and final
// hell_tweaks(protected) call. Descriptor order is significant because the
// callback's level placements and hell_tweaks consume the level RNG stream.
export async function wizard2(des, state) {
    des.level_init({ style: 'mazegrid', bg: '-' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor');

    const tmpbounds = selection_match('-', state);
    const bnds = tmpbounds.bounds();
    const bounds2 = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );

    const wiz2 = des.map({
        halign: 'center',
        valign: 'center',
        map: WIZARD2_MAP,
        contents() {
            des.levregion({
                type: 'stair-up', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12],
            });
            des.levregion({
                type: 'stair-down', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12],
            });
            des.levregion({
                type: 'branch', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12],
            });
            des.teleport_region({
                region: [1, 0, 79, 20], region_islev: 1,
                exclude: [0, 0, 27, 12],
            });
            // Entire tower in a region, constraining monster migration.
            des.region({
                region: [1, 1, 26, 11], lit: 0, type: 'ordinary',
                arrival_room: true,
            });
            des.region({
                region: [9, 3, 17, 9], lit: 0, type: 'zoo', filled: 1,
            });
            des.door('closed', 15, 2);
            des.door('closed', 11, 10);
            des.mazewalk(28, 5, 'east');
            des.ladder('up', 12, 1);
            des.ladder('down', 14, 11);

            // Non-diggable and non-passwall walls everywhere in the map.
            des.non_diggable(selection_area(0, 0, 27, 12));
            des.non_passwall(selection_area(0, 0, 27, 12));

            des.trap('spiked pit');
            des.trap('sleep gas');
            des.trap('anti magic');
            des.trap('magic');

            des.object('!');
            des.object('!');
            des.object('?');
            des.object('?');
            des.object('+');
            // Treasures.
            des.object('"', 4, 6);
        },
    });

    const protectedArea = selectionUnion(bounds2.negate(), mapSelection(wiz2));
    hellTweaks(des, protectedArea, state);
}

export const WIZARD2_LEVEL_LOADERS = Object.freeze({ wizard2 });
