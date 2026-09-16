// wizard1_levels.js — The top (real) Wizard's Tower level.
//
// C refs: dat/wizard1.lua, dat/nhlib.lua hell_tweaks(), selvar.c selection
// operations, and sp_lev.c's des.* handlers.

import { selection_match } from './bigrm.js';
import { hellTweaks } from './asmodeus_levels.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

// C ref: dat/wizard1.lua's des.map() literal. The trailing x on every row is
// transparent and therefore deliberately remains part of the source map.
const WIZARD1_MAP = [
    '----------------------------x',
    '|.......|..|.........|.....|x',
    '|.......S..|.}}}}}}}.|.....|x',
    '|..--S--|..|.}}---}}.|---S-|x',
    '|..|....|..|.}--.--}.|..|..|x',
    '|..|....|..|.}|...|}.|..|..|x',
    '|..--------|.}--.--}.|..|..|x',
    '|..|.......|.}}---}}.|..|..|x',
    '|..S.......|.}}}}}}}.|..|..|x',
    '|..|.......|.........|..|..|x',
    '|..|.......|-----------S-S-|x',
    '|..|.......S...............|x',
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
    for (let x = placed.xstart; x < placed.xstart + placed.xsize; ++x) {
        for (let y = placed.ystart; y < placed.ystart + placed.ysize; ++y)
            result.set(x, y);
    }
    return result;
}

// C ref: dat/wizard1.lua, including the room callback and final
// hell_tweaks(protected) call. Descriptor order is significant because the
// callback's random door and hell_tweaks consume the level RNG stream.
export async function wizard1(des, state) {
    await des.level_init({ style: 'mazegrid', bg: '-' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor');

    const tmpbounds = selection_match('-', state);
    const bnds = tmpbounds.bounds();
    const bounds2 = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );

    const wiz1 = await des.map({
        halign: 'center',
        valign: 'center',
        map: WIZARD1_MAP,
        async contents() {
            await des.levregion({
                type: 'stair-up', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12],
            });
            await des.levregion({
                type: 'stair-down', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12],
            });
            await des.levregion({
                type: 'branch', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12],
            });
            await des.teleport_region({
                region: [1, 0, 79, 20], region_islev: 1,
                exclude: [0, 0, 27, 12],
            });
            await des.region({
                region: [12, 1, 20, 9], lit: 0, type: 'morgue', filled: 2,
                async contents() {
                    const sdwall = ['south', 'west', 'east'];
                    await des.door({
                        wall: sdwall[des.random.rn2(sdwall.length)],
                        state: 'secret',
                    });
                },
            });
            // Another region to constrain monster arrival.
            await des.region({
                region: [1, 1, 10, 11], lit: 0, type: 'ordinary',
                arrival_room: true,
            });
            await des.mazewalk(28, 5, 'east');
            await des.ladder('down', 6, 5);

            // Non-diggable and non-passwall walls. Walls inside the moat stay
            // diggable, so the four source areas intentionally have gaps.
            await des.non_diggable(selection_area(0, 0, 11, 12));
            await des.non_diggable(selection_area(11, 0, 21, 0));
            await des.non_diggable(selection_area(11, 10, 27, 12));
            await des.non_diggable(selection_area(21, 0, 27, 10));
            await des.non_passwall(selection_area(0, 0, 11, 12));
            await des.non_passwall(selection_area(11, 0, 21, 0));
            await des.non_passwall(selection_area(11, 10, 27, 12));
            await des.non_passwall(selection_area(21, 0, 27, 10));

            await des.monster({ id: 'Wizard of Yendor', x: 16, y: 5, asleep: 1 });
            await des.monster('hell hound', 15, 5);
            await des.monster('vampire lord', 17, 5);
            await des.object('Book of the Dead', 16, 5);

            await des.monster('kraken', 14, 2);
            await des.monster('giant eel', 17, 2);
            await des.monster('kraken', 13, 4);
            await des.monster('giant eel', 13, 6);
            await des.monster('kraken', 19, 4);
            await des.monster('giant eel', 19, 6);
            await des.monster('kraken', 15, 8);
            await des.monster('giant eel', 17, 8);
            await des.monster('piranha', 15, 2);
            await des.monster('piranha', 19, 8);

            await des.monster('D');
            await des.monster('H');
            await des.monster('&');
            await des.monster('&');
            await des.monster('&');
            await des.monster('&');

            await des.trap('board', 16, 4);
            await des.trap('board', 16, 6);
            await des.trap('board', 15, 5);
            await des.trap('board', 17, 5);
            await des.trap('spiked pit');
            await des.trap('sleep gas');
            await des.trap('anti magic');
            await des.trap('magic');

            await des.object('ruby');
            await des.object('!');
            await des.object('!');
            await des.object('?');
            await des.object('?');
            await des.object('+');
            await des.object('+');
            await des.object('+');
        },
    });

    const protectedArea = selectionUnion(bounds2.negate(), mapSelection(wiz1));
    await hellTweaks(des, protectedArea, state);
}

export const WIZARD1_LEVEL_LOADERS = Object.freeze({ wizard1 });
