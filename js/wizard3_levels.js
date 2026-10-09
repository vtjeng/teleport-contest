// wizard3_levels.js — The bottom Wizard's Tower level.
// Source: dat/wizard3.lua, including its map callback and hell_tweaks call.

import { selection_match } from './bigrm.js';
import { hellTweaks } from './asmodeus_levels.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

const WIZARD3_MAP = [
    '----------------------------x',
    '|..|............S..........|x',
    '|..|..------------------S--|x',
    '|..|..|.........|..........|x',
    '|..S..|.}}}}}}}.|..........|x',
    '|..|..|.}}---}}.|-S--------|x',
    '|..|..|.}--.--}.|..|.......|x',
    '|..|..|.}|...|}.|..|.......|x',
    '|..---|.}--.--}.|..|.......|x',
    '|.....|.}}---}}.|..|.......|x',
    '|.....S.}}}}}}}.|..|.......|x',
    '|.....|.........|..|.......|x',
    '----------------------------x',
].join('\n');

function selectionUnion(a, b) {
    const result = a.clone();
    const bounds = b.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x)
        for (let y = bounds.ly; y <= bounds.hy; ++y)
            if (b.get(x, y)) result.set(x, y);
    return result;
}

function absoluteArea(x1, y1, x2, y2, frame) {
    const result = new ThemeroomSelection(null, true);
    // Lua selection.fillrect resolves coordinates through the current frame.
    for (let x = x1; x <= x2; ++x)
        for (let y = y1; y <= y2; ++y)
            result.set(frame.xstart + x, frame.ystart + y);
    return result;
}

export async function wizard3(des, state) {
    await des.level_init({ style: 'mazegrid', bg: '-' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor');

    const bnds = selection_match('-', state).bounds();
    const bounds2 = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );
    const wiz3 = await des.map({
        halign: 'center', valign: 'center', map: WIZARD3_MAP,
        async contents() {
            await des.levregion({ type: 'stair-up', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12] });
            await des.levregion({ type: 'stair-down', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12] });
            await des.levregion({ type: 'branch', region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 28, 12] });
            await des.teleport_region({ region: [1, 0, 79, 20],
                region_islev: 1, exclude: [0, 0, 27, 12] });
            await des.levregion({ region: [25, 11, 25, 11],
                type: 'portal', name: 'fakewiz1' });
            await des.mazewalk(28, 9, 'east');
            await des.region({ region: [7, 3, 15, 11],
                lit: 0, type: 'morgue', filled: 2 });
            await des.region({ region: [17, 6, 18, 11],
                lit: 0, type: 'beehive', filled: 1 });
            await des.region({ region: [20, 6, 26, 11],
                lit: 0, type: 'ordinary', arrival_room: true,
                async contents() {
                    // nhlib.lua percent(50): math.random(0,99) < 50.
                    const wall = des.random.rn2(100) < 50 ? 'west' : 'north';
                    await des.door({ state: 'secret', wall });
                } });
            await des.door('closed', 18, 5);
            await des.ladder('up', 11, 7);

            // Source49–57: moat interior walls remain diggable/passable.
            await des.non_diggable(selection_area(0, 0, 6, 12));
            await des.non_diggable(selection_area(6, 0, 27, 2));
            await des.non_diggable(selection_area(16, 2, 27, 12));
            await des.non_diggable(selection_area(6, 12, 16, 12));
            await des.non_passwall(selection_area(0, 0, 6, 12));
            await des.non_passwall(selection_area(6, 0, 27, 2));
            await des.non_passwall(selection_area(16, 2, 27, 12));
            await des.non_passwall(selection_area(6, 12, 16, 12));

            await des.monster('L', 10, 7);
            await des.monster('vampire lord', 12, 7);
            await des.monster('kraken', 8, 5);
            await des.monster('giant eel', 8, 8);
            await des.monster('kraken', 14, 5);
            await des.monster('giant eel', 14, 8);
            await des.monster('L');
            await des.monster('D');
            await des.monster('D', 26, 9);
            await des.monster('&');
            await des.monster('&');
            await des.monster('&');
            await des.trap('board', 10, 7);
            await des.trap('board', 12, 7);
            await des.trap('board', 11, 6);
            await des.trap('board', 11, 8);
            await des.object(')');
            await des.object('!');
            await des.object('?');
            await des.object('?');
            await des.object('(');
            await des.object('"', 11, 7);
        },
    });

    // des.map returns only cells actually written; transparent 'x' cells must
    // remain available to hell_tweaks after the map callback restores the frame.
    const protectedArea = selectionUnion(bounds2.negate(), wiz3.selection);
    await hellTweaks(des, protectedArea, state);
}

export const WIZARD3_LEVEL_LOADERS = Object.freeze({ wizard3 });
