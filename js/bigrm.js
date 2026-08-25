// bigrm.js -- Big room special level definitions.
// C refs: dat/bigrm-1.lua through dat/bigrm-13.lua. Each function below
// translates one Lua file into the same sequence of des.* API calls, using
// the same nhlib.lua shims (percent, math.random = 1 + rn2, shuffle).

import { UnsupportedLevelChangeError } from './do.js';
import { rn2 } from './rng.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';
import {
    COLNO, ROWNO, ROOM, STONE, HWALL, VWALL,
} from './const.js';
import { splev_chr2typ } from './mklev.js';

// C ref: dat/nhlib.lua percent(). math.random(0, 99) is nh.random(0, 100),
// which is rn2(100).
function percent(threshold) {
    return rn2(100) < threshold;
}

// C ref: dat/nhlib.lua math.random(a, b). Returns a + rn2(b - a + 1).
// The one-argument form math.random(n) returns 1 + rn2(n).
function mathRandom(a, b) {
    if (b === undefined) return 1 + rn2(a);
    return a + rn2(b - a + 1);
}

// ============================================================
// Selection constructors
// ============================================================

// C ref: nhlsel.c l_selection_line(). Bresenham line from (x1,y1) to
// (x2,y2) on the selection grid.
export function selection_line(x1, y1, x2, y2) {
    const sel = new ThemeroomSelection();
    let dx = Math.abs(x2 - x1);
    let dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = x1, y = y1;
    for (;;) {
        sel.set(x, y);
        if (x === x2 && y === y2) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
    return sel;
}

// C ref: nhlsel.c l_selection_rect(). Outline of a rectangle: the four
// edges, not the interior.
export function selection_rect(x1, y1, x2, y2) {
    const sel = new ThemeroomSelection();
    for (let x = x1; x <= x2; ++x) {
        sel.set(x, y1);
        sel.set(x, y2);
    }
    for (let y = y1; y <= y2; ++y) {
        sel.set(x1, y);
        sel.set(x2, y);
    }
    return sel;
}

// C ref: nhlsel.c l_selection_fillrect() / l_selection_area(). Filled
// rectangle including all interior points.
export function selection_fillrect(x1, y1, x2, y2) {
    return selection_area(x1, y1, x2, y2);
}

// C ref: nhlsel.c selection_do_match(). Matches a map fragment pattern
// against the current level terrain. The pattern uses the same character
// set as des.map(); '.' in the pattern is a wildcard that matches any
// terrain.
//
// A multi-line pattern (lines separated by \n) matches a rectangular
// footprint centered on each cell. A single-line pattern matches a
// horizontal strip. The special pattern "[.w.]" is a 1x3 horizontal strip
// that matches wall-type cells flanked by non-wall cells on both sides.
export function selection_match(pattern, state) {
    const lines = pattern.split('\n').filter((l) => l.length > 0);
    const ph = lines.length;
    const pw = lines[0].length;
    // Center of the pattern: the cell the pattern is "about".
    const cx = Math.trunc(pw / 2);
    const cy = Math.trunc(ph / 2);
    const sel = new ThemeroomSelection();
    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 1; x < COLNO; ++x) {
            let match = true;
            for (let py = 0; py < ph && match; ++py) {
                for (let px = 0; px < pw && match; ++px) {
                    const ch = lines[py][px];
                    if (ch === '.') continue; // wildcard
                    const tx = x + px - cx;
                    const ty = y + py - cy;
                    if (tx < 0 || tx >= COLNO || ty < 0 || ty >= ROWNO) {
                        match = false;
                        continue;
                    }
                    const loc = state.level.at(tx, ty);
                    if (ch === 'w') {
                        // Match any wall type.
                        if (loc.typ < STONE || loc.typ > CROSSWALL
                            || loc.typ === ROOM) {
                            // More precisely: IS_STWALL or is a door boundary.
                            // Use the MATCH_WALL constant's semantics.
                            const t = loc.typ;
                            if (t !== STONE && t !== HWALL && t !== VWALL
                                && !(t >= 10 && t <= 19)) {
                                match = false;
                            }
                        }
                    } else {
                        const expected = splev_chr2typ(ch);
                        if (loc.typ !== expected) match = false;
                    }
                }
            }
            if (match) sel.set(x, y);
        }
    }
    return sel;
}

// Union of two selections (Lua's | operator on selections).
function selUnion(a, b) {
    const result = a.clone();
    const bounds = b.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (b.get(x, y)) result.set(x, y);
        }
    }
    return result;
}

// ============================================================
// bigrm-1 through bigrm-13
// ============================================================

// C ref: dat/bigrm-1.lua. Plain rectangle, 80% chance of a terrain
// pattern (line, plus, brackets, snake).
async function bigrm1(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '---------------------------------------------------------------------------',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '---------------------------------------------------------------------------',
    ]);

    if (percent(80)) {
        const terrains = ['-', 'F', 'L', 'T', 'C'];
        const tidx = mathRandom(1, terrains.length) - 1;
        const choice = mathRandom(0, 5);
        if (choice === 0) {
            des.terrain(selection_line(10, 8, 65, 8), terrains[tidx]);
        } else if (choice === 1) {
            const sel = selUnion(
                selection_line(15, 4, 15, 13),
                selection_line(59, 4, 59, 13),
            );
            des.terrain(sel, terrains[tidx]);
        } else if (choice === 2) {
            const sel = selUnion(
                selection_line(10, 8, 64, 8),
                selection_line(37, 3, 37, 14),
            );
            des.terrain(sel, terrains[tidx]);
        } else if (choice === 3) {
            des.terrain(selection_rect(4, 4, 70, 13), terrains[tidx]);
            const sel = selUnion(
                selection_line(25, 4, 50, 4),
                selection_line(25, 13, 50, 13),
            );
            des.terrain(sel, '.');
        } else if (choice === 4) {
            des.terrain(selection_fillrect(5, 5, 69, 12), terrains[tidx]);
            for (let i = 0; i < 8; ++i) {
                const x = 6 + i * 8;
                const y = 5 + (i % 2);
                des.terrain(selection_fillrect(x, y, x + 6, y + 6), '.');
            }
        }
        // else choice === 5: nothing
    }

    des.region(selection_area(1, 1, 73, 16), 'lit');
    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-2.lua. Plain rectangle with random dark regions and
// optional ice/invisible-stalker replacement.
async function bigrm2(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '---------------------------------------------------------------------------',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '---------------------------------------------------------------------------',
    ]);
    des.region(selection_area(1, 1, 73, 16), 'lit');

    let darkness = null;
    const choice = mathRandom(0, 3);
    if (choice === 0) {
        darkness = selUnion(
            selUnion(
                selection_area(1, 7, 22, 9),
                selection_area(24, 1, 50, 5),
            ),
            selUnion(
                selection_area(24, 11, 50, 16),
                selection_area(52, 7, 73, 9),
            ),
        );
    } else if (choice === 1) {
        darkness = selection_area(24, 1, 50, 16);
    } else if (choice === 2) {
        darkness = selUnion(
            selection_area(1, 1, 22, 16),
            selection_area(52, 1, 73, 16),
        );
    }
    // choice === 3: darkness stays null

    if (darkness != null) {
        des.region(darkness, 'unlit');
        if (percent(25)) {
            des.replace_terrain({
                selection: darkness.grow(),
                fromterrain: '.',
                toterrain: 'I',
            });
        }
    }

    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-3.lua. Pillared grid room with optional wall
// replacement and explicit monster grid.
async function bigrm3(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '---------------------------------------------------------------------------',
        '|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|..............---.......................................---..............|',
        '|...............|.........................................|...............|',
        '|.....|.|.|.|.|---|.|.|.|.|...................|.|.|.|.|.|---|.|.|.|.|.....|',
        '|.....|--------   --------|...................|----------   --------|.....|',
        '|.....|.|.|.|.|---|.|.|.|.|...................|.|.|.|.|.|---|.|.|.|.|.....|',
        '|...............|.........................................|...............|',
        '|..............---.......................................---..............|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|.|',
        '---------------------------------------------------------------------------',
    ]);
    des.region(selection_area(1, 1, 73, 16), 'lit');

    if (percent(66)) {
        const sel = selection_match('[.w.]', state);
        const terrains = ['F', 'T', 'W', 'Z'];
        const choice = terrains[mathRandom(1, terrains.length) - 1];
        des.terrain(sel, choice);
    }

    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();

    // 28 monsters at fixed positions.
    const positions = [
        [1, 1], [13, 1], [25, 1], [37, 1], [49, 1], [61, 1], [73, 1],
        [7, 7], [13, 7], [25, 7], [37, 7], [49, 7], [61, 7], [67, 7],
        [7, 9], [13, 9], [25, 9], [37, 9], [49, 9], [61, 9], [67, 9],
        [1, 16], [13, 16], [25, 16], [37, 16], [49, 16], [61, 16], [73, 16],
    ];
    for (const [mx, my] of positions) {
        des.monster({ coord: [mx, my] });
    }
}

// C ref: dat/bigrm-4.lua. Diamond-ish room with a central lake and four
// corner fountains.
async function bigrm4(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '-----------                                                     -----------',
        '|.........|                                                     |.........|',
        '|.........-------------                             -------------.........|',
        '---...................------------       ------------...................---',
        '  --.............................---------.............................--  ',
        '   --.................................................................--   ',
        '    --...............................................................--    ',
        '     --......LLLLL.......................................LLLLL......--     ',
        '      --.....LLLLL.......................................LLLLL.....--      ',
        '      --.....LLLLL.......................................LLLLL.....--      ',
        '     --......LLLLL.......................................LLLLL......--     ',
        '    --...............................................................--    ',
        '   --.................................................................--   ',
        '  --.............................---------.............................--  ',
        '---...................------------       ------------...................---',
        '|.........-------------                             -------------.........|',
        '|.........|                                                     |.........|',
        '-----------                                                     -----------',
    ]);

    const terrains = ['.', '.', '.', '.', 'P', 'L', '-', 'T', 'W', 'Z'];
    const tidx = mathRandom(1, terrains.length) - 1;
    const toterr = terrains[tidx];
    if (toterr !== 'L') {
        des.replace_terrain({ fromterrain: 'L', toterrain: toterr });
    }

    des.feature('fountain', 5, 2);
    des.feature('fountain', 5, 15);
    des.feature('fountain', 69, 2);
    des.feature('fountain', 69, 15);

    des.region(selection_area(1, 1, 73, 16), 'lit');
    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-5.lua. Elliptical room with optional random cloud or
// ice patches.
async function bigrm5(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '                            ------------------                            ',
        '                    ---------................---------                    ',
        '              -------................................-------              ',
        '         ------............................................------         ',
        '      ----......................................................----      ',
        '    ---............................................................---    ',
        '  ---................................................................---  ',
        '---....................................................................---',
        '|........................................................................|',
        '|........................................................................|',
        '|........................................................................|',
        '---....................................................................---',
        '  ---................................................................---  ',
        '    ---............................................................---    ',
        '      ----......................................................----      ',
        '         ------............................................------         ',
        '              -------................................-------              ',
        '                    ---------................---------                    ',
        '                            ------------------                            ',
    ]);

    if (percent(25)) {
        const allRoom = selection_match('.', state);
        const sel = allRoom.percentage(2).grow();
        const toterr = percent(50) ? 'I' : 'C';
        des.replace_terrain({
            selection: sel,
            fromterrain: '.',
            toterrain: toterr,
        });
    }

    des.region(selection_area(0, 0, 72, 18), 'lit');
    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-6.lua. Four-lobed clover room with trees and a
// fountain pair.
async function bigrm6(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '     ---------         ---------         ---------         ---------     ',
        '   ---.......---     ---.......---     ---.......---     ---.......---   ',
        '  --...........--   --...........--   --...........--   --...........--  ',
        ' --.............-- --.............-- --.............-- --.............-- ',
        ' -...............- -...............- -...............- -...............- ',
        '--...............---...............---...............---...............--',
        '|.................-.................-.................-.................|',
        '|........T.................T.................T.................T........|',
        '|.......................................................................|',
        '|......T.{.....................................................{.T......|',
        '|.......................................................................|',
        '|........T.................T.................T.................T........|',
        '|.................-.................-.................-.................|',
        '--...............---...............---...............---...............--',
        ' -...............- -...............- -...............- -...............- ',
        ' --.............-- --.............-- --.............-- --.............-- ',
        '  --...........--   --...........--   --...........--   --...........--  ',
        '   ---.......---     ---.......---     ---.......---     ---.......---   ',
        '     ---------         ---------         ---------         ---------     ',
    ]);
    des.region(selection_area(1, 1, 72, 17), 'lit');
    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-7.lua. Diagonal diamond room with lava/tree/fountain
// markers.
async function bigrm7(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel');
    des.map([
        '                                                        -----              ',
        '                                                ---------...---            ',
        '                                        ---------.........L...---          ',
        '                                ---------.......................---        ',
        '                        ---------.................................---      ',
        '                ---------...........................................---    ',
        '        ---------.....................................................---  ',
        '---------...............................................................---',
        '|.........................................................................|',
        '|.L.....................................................................L.|',
        '|.........................................................................|',
        '---...............................................................---------',
        '  ---.....................................................---------        ',
        '    ---...........................................---------                ',
        '      ---.................................---------                        ',
        '        ---.......................---------                                ',
        '          ---...L.........---------                                        ',
        '            ---...---------                                                ',
        '              -----                                                        ',
    ]);

    const terrain = ['L', 'T', '{', '.'];
    const tidx = mathRandom(1, terrain.length) - 1;
    des.replace_terrain({
        region: [0, 0, 74, 18],
        fromterrain: 'L',
        toterrain: terrain[tidx],
    });

    des.region(selection_area(1, 1, 73, 17), 'lit');
    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-8.lua. Diagonal room with an iron-bars stripe.
async function bigrm8(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel');
    des.map([
        '----------------------------------------------                             ',
        '|............................................---                           ',
        '--.............................................---                         ',
        ' ---......................................FF.....---                       ',
        '   ---...................................FF........---                     ',
        '     ---................................FF...........---                   ',
        '       ---.............................FF..............---                 ',
        '         ---..........................FF.................---               ',
        '           ---.......................FF....................---             ',
        '             ---....................FF.......................---           ',
        '               ---.................FF..........................---         ',
        '                 ---..............FF.............................---       ',
        '                   ---...........FF................................----    ',
        '                     ---........FF...................................---   ',
        '                       ---.....FF......................................--- ',
        '                         ---.............................................--',
        '                           ---............................................|',
        '                             ----------------------------------------------',
    ]);

    if (percent(40)) {
        const terrain = ['L', '}', 'T', '.', '-', 'C'];
        const tidx = mathRandom(1, terrain.length) - 1;
        des.replace_terrain({
            region: [0, 0, 74, 17],
            fromterrain: 'F',
            toterrain: terrain[tidx],
        });
    }

    des.region(selection_area(1, 1, 73, 16), 'lit');
    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-9.lua. "Eye" room with a lava lake pupil, unlit
// outer ring, lit inner rings.
async function bigrm9(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}................................}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}............................................}}}}}}}}}}}}}}}',
        '}}}}}}}}}}......................................................}}}}}}}}}}',
        '}}}}}}}............................................................}}}}}}}',
        '}}}}}.......................LLLLLLLLLLLLLLLLLL.......................}}}}}',
        '}}}....................LLLLLLLLLLLLLLLLLLLLLLLLLLL.....................}}}',
        '}....................LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL....................}',
        '}....................LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL....................}',
        '}....................LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL....................}',
        '}}}....................LLLLLLLLLLLLLLLLLLLLLLLLLLL.....................}}}',
        '}}}}}.......................LLLLLLLLLLLLLLLLLL.......................}}}}}',
        '}}}}}}}............................................................}}}}}}}',
        '}}}}}}}}}}......................................................}}}}}}}}}}',
        '}}}}}}}}}}}}}}}............................................}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}................................}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
    ]);

    des.region(selection_area(0, 0, 73, 18), 'unlit');
    des.region(selection_area(26, 4, 47, 14), 'lit');
    des.region(selection_area(21, 5, 51, 13), 'lit');
    des.region(selection_area(19, 6, 54, 12), 'lit');

    des.stair('up');
    des.stair('down');
    des.non_diggable();
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-10.lua. Cloud "fog maze" with mazewalk, levregion,
// and teleport region exclusions.
async function bigrm10(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '.......................................................................',
        '.......................................................................',
        '.......................................................................',
        '.......................................................................',
        '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
        '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
        '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
        '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
        '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
        '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
        '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
        '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
        '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
        '...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...',
        '...C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C...',
        '.......................................................................',
        '.......................................................................',
        '.......................................................................',
        '.......................................................................',
    ]);

    if (percent(40)) {
        const terrain = ['L', '}', 'T', '-', 'F'];
        const tidx = mathRandom(1, terrain.length) - 1;
        des.replace_terrain({
            region: [0, 0, 70, 18],
            fromterrain: 'C',
            toterrain: '.',
            chance: 5,
        });
        des.replace_terrain({
            region: [0, 0, 70, 18],
            fromterrain: 'C',
            toterrain: terrain[tidx],
        });
    }

    des.region(selection_area(0, 0, 70, 18), 'lit');
    des.teleport_region({
        region: [0, 0, 70, 18],
        exclude: [2, 3, 68, 15],
        dir: 'down',
    });

    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();

    des.mazewalk({ x: 4, y: 2, dir: 'south', stocked: 0 });

    des.levregion({
        region: [0, 0, 70, 18],
        exclude: [2, 3, 68, 15],
        type: 'stair-up',
    });
    des.stair('down');
}

// C ref: dat/bigrm-11.lua. Boulder "maze" with wide corridors, generated
// by level_init({style:"maze"}) then replacing inner walls with boulders.
async function bigrm11(des, state) {
    // bigrm-11 uses level_init({style:"maze"}) which is not yet ported.
    // The maze init produces the same result as mazegrid + walkfrom. For
    // this variant we throw until the maze init is ported, since it is not
    // hit by any development session.
    throw new UnsupportedLevelChangeError(
        'bigrm-11: level_init({style:"maze"}) not yet ported',
    );
}

// C ref: dat/bigrm-12.lua. Two hexagons with lava/water pools. Heavy
// replace_terrain randomization and des.wallify().
async function bigrm12(des, state) {
    des.level_flags('mazelevel', 'noflipy');
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.map([
        '                                                                           ',
        '         .......................           .......................         ',
        '        .........................         .........................        ',
        '       ...........................       ...........................       ',
        '      .............................     .............................      ',
        '     ........PPPPPPPPPPPPPPP........   ........LLLLLLLLLLLLLLL........     ',
        '    ........PPPPPPPPPPPPPPPPP........ ........LLLLLLLLLLLLLLLLL........    ',
        '   ........PPPWWWWWWWWWWWWWPPP...............LLLZZZZZZZZZZZZZLLL........   ',
        '  ........PPPWWWWWWWWWWWWWWWPPP.............LLLZZZZZZZZZZZZZZZLLL........  ',
        ' ........PPPWWWWWWWWWWWWWWWWWPPP...........LLLZZZZZZZZZZZZZZZZZLLL........ ',
        '  ........PPPWWWWWWWWWWWWWWWPPP.............LLLZZZZZZZZZZZZZZZLLL........  ',
        '   ........PPPWWWWWWWWWWWWWPPP...............LLLZZZZZZZZZZZZZLLL........   ',
        '    ........PPPPPPPPPPPPPPPPP........ ........LLLLLLLLLLLLLLLLL........    ',
        '     ........PPPPPPPPPPPPPPP........   ........LLLLLLLLLLLLLLL........     ',
        '      .............................     .............................      ',
        '       ...........................       ...........................       ',
        '        .........................         .........................        ',
        '         .......................           .......................         ',
        '                                                                           ',
    ]);

    // Maybe replace lava walls / water walls with stone walls.
    if (percent(20)) {
        if (percent(50)) {
            des.replace_terrain({ fromterrain: 'W', toterrain: '-' });
        }
        if (percent(50)) {
            des.replace_terrain({ fromterrain: 'Z', toterrain: '-' });
        }
    }

    // Maybe replace pools with floor and then walls with pools.
    if (percent(25)) {
        des.replace_terrain({ fromterrain: 'P', toterrain: '.' });
        if (percent(75)) {
            des.replace_terrain({ fromterrain: 'W', toterrain: 'P' });
        }
    }
    if (percent(25)) {
        des.replace_terrain({ fromterrain: 'L', toterrain: '.' });
        if (percent(75)) {
            des.replace_terrain({ fromterrain: 'Z', toterrain: 'L' });
        }
    }

    // Maybe make both sides have the same terrain.
    if (percent(20)) {
        if (percent(50)) {
            des.replace_terrain({ fromterrain: 'P', toterrain: 'L' });
            des.replace_terrain({ fromterrain: 'W', toterrain: 'Z' });
        } else {
            des.replace_terrain({ fromterrain: 'L', toterrain: 'P' });
            des.replace_terrain({ fromterrain: 'Z', toterrain: 'W' });
        }
    }

    des.region(selection_area(0, 0, 75, 19), 'lit');
    des.non_diggable();
    des.wallify();
    des.stair('up');
    des.stair('down');
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// C ref: dat/bigrm-13.lua. "Pillars" room with a small pillar sub-map
// stamped in a grid, filtered by one of eight pattern functions.
async function bigrm13(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.map([
        '---------------------------------------------------------------------------',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '|.........................................................................|',
        '---------------------------------------------------------------------------',
    ]);

    const pillar = '---\n| |\n---';

    const filters = [
        // 1: all pillars
        () => true,
        // 2: 3 vertical lines
        (x) => (x % 2 === 1),
        // 3: checkerboard
        (x, y) => ((x + y) % 2 === 0),
        // 4: center row
        (x, y) => (y % 2 === 1),
        // 5: top and bottom rows
        (x, y) => (y % 2 === 0),
        // 6: random 50%
        () => (mathRandom(0, 1) === 0),
        // 7: corners and center
        (x, y) => (Math.trunc(x / 3) % 2 === y % 2),
        // 8: slanted
        (x, y) => (Math.trunc((x + 1) / 3) === y),
    ];

    const idx = mathRandom(1, filters.length) - 1;

    for (let y = 0; y < 3; ++y) {
        for (let x = 0; x < 7; ++x) {
            if (filters[idx](x, y)) {
                des.map({
                    coord: [12 + x * 9, 4 + y * 5],
                    map: pillar,
                    contents() {},
                });
            }
        }
    }

    des.region(selection_area(0, 0, 75, 18), 'lit');
    des.wallify();
    des.non_diggable();
    des.stair('up');
    des.stair('down');
    for (let i = 0; i < 15; ++i) des.object();
    for (let i = 0; i < 6; ++i) des.trap();
    for (let i = 0; i < 28; ++i) des.monster();
}

// ============================================================
// Registry
// ============================================================

export const BIGRM_LOADERS = {
    'bigrm-1': bigrm1,
    'bigrm-2': bigrm2,
    'bigrm-3': bigrm3,
    'bigrm-4': bigrm4,
    'bigrm-5': bigrm5,
    'bigrm-6': bigrm6,
    'bigrm-7': bigrm7,
    'bigrm-8': bigrm8,
    'bigrm-9': bigrm9,
    'bigrm-10': bigrm10,
    'bigrm-11': bigrm11,
    'bigrm-12': bigrm12,
    'bigrm-13': bigrm13,
};
