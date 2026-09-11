// juiblex_levels.js — Juiblex's Gehennom special level definition.
//
// C refs: dat/juiblex.lua and sp_lev.c's des.* handlers.

import { ThemeroomSelection } from './themerooms.js';

const JUIBLEX_AUXILIARY_MAPS = Object.freeze([
    [
        'xxxxxxxx',
        'xx...xxx',
        'xxx...xx',
        'xxxx.xxx',
        'xxxxxxxx',
    ].join('\n'),
    [
        'xxxxxxxx',
        'xxxx.xxx',
        'xxx...xx',
        'xx...xxx',
        'xxxxxxxx',
    ].join('\n'),
]);

const JUIBLEX_LAIR_MAP = [
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
    'xxx...xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...xxx',
    'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxx}}}xxxxxxxxxxxxxxx}}}}}xxxx',
    'xxxxxxxxxxxxxxxxxxxxxxx}}}}}xxxxxxxxxxxxx}.....}xxx',
    'xxxxxxxxxxxxxxxxxxxxxx}}...}}xxxxxxxxxxx}..P.P..}xx',
    'xxxxxxxxxxxxxxxxxxxxx}}..P..}}xxxxxxxxxxx}.....}xxx',
    'xxxxxxxxxxxxxxxxxxxxx}}.P.P.}}xxxxxxxxxxxx}...}xxxx',
    'xxxxxxxxxxxxxxxxxxxxx}}..P..}}xxxxxxxxxxxx}...}xxxx',
    'xxxxxxxxxxxxxxxxxxxxxx}}...}}xxxxxxxxxxxxxx}}}xxxxx',
    'xxxxxxxxxxxxxxxxxxxxxxx}}}}}xxxxxxxxxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxx}}}xxxxxxxxxxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
    'xxx...xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...xxx',
    'xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
].join('\n');

// C ref: dat/juiblex.lua. The selection is created after the lair map, so
// selection.set() resolves these map-relative points through the active map
// frame. Removing a point before each random placement preserves
// selection:rndcoord(1)'s x-major traversal and draw order.
function lairPlacementSelection() {
    const place = new ThemeroomSelection();
    place.set(4, 2);
    place.set(46, 2);
    place.set(4, 15);
    place.set(46, 15);
    return place;
}

// C ref: dat/juiblex.lua. The Gehennom level whose swamp lair contains
// Juiblex, blobby monsters, random liquids, and the level-region exits.
export async function juiblex(des) {
    des.level_flags('mazelevel', 'shortsighted', 'noflip', 'temperate');
    des.level_init({ style: 'swamp', lit: 0 });

    // Each auxiliary map guarantees an open square for its boulder. Their
    // source order matters because each map's object creation follows it.
    des.map({
        halign: 'left',
        valign: 'bottom',
        map: JUIBLEX_AUXILIARY_MAPS[0],
    });
    des.object('boulder');
    des.map({
        halign: 'right',
        valign: 'top',
        map: JUIBLEX_AUXILIARY_MAPS[1],
    });
    des.object('boulder');

    des.map(JUIBLEX_LAIR_MAP.split('\n'));

    // The Lua shuffle uses math.random(i), which des.shuffle maps to rn2(i)
    // in the same source order.
    const monster = ['j', 'b', 'P', 'F'];
    des.shuffle(monster);

    const place = lairPlacementSelection();

    des.region({
        region: [0, 0, 50, 17],
        lit: 0,
        type: 'swamp',
        filled: 2,
    });
    des.levregion({
        region: [1, 0, 11, 20],
        region_islev: 1,
        exclude: [0, 0, 50, 17],
        type: 'stair-down',
    });
    des.levregion({
        region: [69, 0, 79, 20],
        region_islev: 1,
        exclude: [0, 0, 50, 17],
        type: 'stair-up',
    });
    des.levregion({
        region: [1, 0, 11, 20],
        region_islev: 1,
        exclude: [0, 0, 50, 17],
        type: 'branch',
    });
    des.teleport_region({
        region: [1, 0, 11, 20],
        region_islev: 1,
        exclude: [0, 0, 50, 17],
        dir: 'up',
    });
    des.teleport_region({
        region: [69, 0, 79, 20],
        region_islev: 1,
        exclude: [0, 0, 50, 17],
        dir: 'down',
    });

    des.feature('fountain', place.rndcoord(true));
    des.monster({
        id: 'giant mimic',
        coord: place.rndcoord(true),
        appear_as: 'ter:fountain',
    });
    des.monster({
        id: 'giant mimic',
        coord: place.rndcoord(true),
        appear_as: 'ter:fountain',
    });
    des.monster({
        id: 'giant mimic',
        coord: place.rndcoord(true),
        appear_as: 'ter:fountain',
    });

    des.monster('Juiblex', 25, 8);
    des.monster('lemure', 43, 8);
    des.monster('lemure', 44, 8);
    des.monster('lemure', 45, 8);

    des.object('*', 43, 6);
    des.object('*', 45, 6);
    des.object('!', 43, 9);
    des.object('!', 44, 9);
    des.object('!', 45, 9);

    des.monster(monster[3], 25, 6);
    des.monster(monster[0], 24, 7);
    des.monster(monster[1], 26, 7);
    des.monster(monster[2], 23, 8);
    des.monster(monster[2], 27, 8);
    des.monster(monster[1], 24, 9);
    des.monster(monster[0], 26, 9);
    des.monster(monster[3], 25, 10);

    for (const id of ['j', 'j', 'j', 'j', 'P', 'P', 'P', 'P',
        'b', 'b', 'b', 'F', 'F', 'F', 'm', 'm', 'jellyfish',
        'jellyfish']) {
        des.monster(id);
    }

    for (const id of ['!', '!', '!', '%', '%', '%', 'boulder'])
        des.object(id);

    for (const type of ['sleep gas', 'sleep gas', 'anti magic',
        'anti magic', 'magic', 'magic']) {
        des.trap(type);
    }
}

export const JUIBLEX_LEVEL_LOADERS = Object.freeze({ juiblex });
