// hell_levels.js -- Gehennom filler-level definitions.
//
// C refs: dat/hellfill.lua, dat/nhlib.lua, mkmaze.c makemaz(), and
// sp_lev.c lspo_level_init()/lspo_terrain().  The selected open-cavern arm
// is ported here in source order; the other six generator arms remain an
// explicit boundary until their maze and prefab helpers are reached.

import { UnsupportedLevelChangeError } from './do.js';
import { selection_match, selection_rect } from './bigrm.js';
import { PM_MINOTAUR } from './monsters.js';
import { rn2 } from './rng.js';

// C ref: dat/nhlib.lua math.random() and percent().
function mathRandom(n, random = rn2) {
    return 1 + random(n);
}

function percent(threshold, random = rn2) {
    return random(100) < threshold;
}

// C ref: hellfill.lua hells[7]. The level_init calls explicitly pass lit=0,
// so no hidden lit-state RNG is consumed by this arm.
export function hell_open_cavern(des, state, random = rn2) {
    const wallTerrain = percent(50, random) ? ' ' : 'L';
    des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    des.level_flags('mazelevel', 'noflip');
    des.level_init({
        style: 'mines',
        fg: '.',
        bg: wallTerrain,
        smoothed: true,
        joined: true,
        lit: 0,
    });

    const room = selection_match('.', state).grow();
    des.terrain({ selection: room, typ: '.', lit: 0 });
    const border = selection_rect(0, 0, 78, 20);
    des.terrain({ selection: border, typ: wallTerrain, lit: 0 });
    des.wallify();
}

function unsupportedHellGenerator(number) {
    throw new UnsupportedLevelChangeError(
        `hellfill generator ${number} not ported`,
    );
}

// Keep the seven source table slots so the selector consumes rn2(7), even
// while this slice implements only the arm reached by its selected boundary.
export const HELL_GENERATORS = Object.freeze([
    () => unsupportedHellGenerator(1),
    () => unsupportedHellGenerator(2),
    () => unsupportedHellGenerator(3),
    () => unsupportedHellGenerator(4),
    () => unsupportedHellGenerator(5),
    () => unsupportedHellGenerator(6),
    hell_open_cavern,
]);

// C ref: dat/hellfill.lua populatemaze(). Each Lua math.random(n) is one
// rn2(n) draw plus one, and each object/monster/trap/gold call retains the
// special-level API's source ordering and random placement.
export function populatemaze(des, random = rn2) {
    for (let i = 1; i <= mathRandom(8, random) + 11; ++i) {
        if (percent(50, random)) des.object('*');
        else des.object();
    }
    for (let i = 1; i <= mathRandom(10, random) + 2; ++i)
        des.object('`');
    for (let i = 1; i <= mathRandom(3, random); ++i)
        des.monster({ id: PM_MINOTAUR, peaceful: 0 });
    for (let i = 1; i <= mathRandom(5, random) + 7; ++i)
        des.monster({ peaceful: 0 });
    for (let i = 1; i <= mathRandom(6, random) + 7; ++i)
        des.gold();
    for (let i = 1; i <= mathRandom(6, random) + 7; ++i)
        des.trap();
}

// C ref: hellfill.lua top-level chunk. The selected generator is followed by
// the common stair/invocation tail and then populatemaze().
export async function hellfill(des, state, random = rn2) {
    const generatorNumber = mathRandom(HELL_GENERATORS.length, random);
    const generator = HELL_GENERATORS[generatorNumber - 1];
    await generator(des, state, random);
    des.stair('up');
    if (state.invocation_level) des.trap('vibrating square');
    else des.stair('down');
    populatemaze(des, random);
}

export const HELL_LEVEL_LOADERS = Object.freeze({ hellfill });
