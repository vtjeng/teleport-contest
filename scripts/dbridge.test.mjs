import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DRAWBRIDGE_UP,
    ICE,
    LAVAPOOL,
    LAVAWALL,
    MOAT,
    POOL,
    WATER,
    DB_NORTH,
    PASSES_WALLS,
} from '../js/const.js';
import {
    close_drawbridge,
    create_drawbridge,
    E_phrase,
    automiss,
    e_at,
    e_nam,
    e_survives_at,
    get_wall_for_db,
    is_ice,
    is_lava,
    is_moat,
    is_pool_or_lava,
    is_waterwall,
    open_drawbridge,
} from '../js/dbridge.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

const DBRIDGE_C = readFileSync(
    new URL('../nethack-c/upstream/src/dbridge.c', import.meta.url), 'utf8',
);

// dbridge.c:795,857: an unseen bridge's moving gears are announced through
// You_hear, so the sound is absent when acoustics are disabled.
test('unseen drawbridge movement respects acoustics', async () => {
    for (const acoustics of [true, false]) {
        await runSegment({
            seed: 671903,
            datetime: '20261018120000',
            nethackrc: 'OPTIONS=name:BridgeSound,role:Wizard,race:human,gender:male,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        game.flags.acoustics = acoustics;
        const x = 66, y = 13;
        assert.equal(create_drawbridge(x, y, DB_NORTH, true, game), true);
        game.viz_array[y][x] = 0;
        game.viz_array[y - 1][x] = 0;
        const messages = [];
        const env = { message: async (line) => messages.push(line) };
        await close_drawbridge(x, y, game, env);
        assert.equal(game.level.at(x, y).typ, DRAWBRIDGE_UP);
        await open_drawbridge(x, y, game, env);
        assert.deepEqual(messages, acoustics ? [
            'You hear chains rattling and gears turning.',
            'You hear gears turning and chains rattling.',
        ] : []);
    }
});

function levelState(cells, overrides = {}) {
    return {
        ...overrides,
        level: {
            at(x, y) { return cells.get(`${x},${y}`); },
        },
    };
}

test('dbridge terrain predicates retain the C source guards and bridge surfaces', () => {
    assert.match(DBRIDGE_C,
        /is_waterwall\(coordxy x, coordxy y\)[\s\S]*?isok\(x, y\) && IS_WATERWALL\(levl\[x\]\[y\]\.typ\)/u);
    assert.match(DBRIDGE_C,
        /is_lava\(coordxy x, coordxy y\)[\s\S]*?ltyp == LAVAPOOL \|\| ltyp == LAVAWALL[\s\S]*?drawbridgemask & DB_UNDER\) == DB_LAVA/u);
    assert.match(DBRIDGE_C,
        /is_pool_or_lava\(coordxy x, coordxy y\)[\s\S]*?is_pool\(x, y\) \|\| is_lava\(x, y\)/u);
    assert.match(DBRIDGE_C,
        /is_ice\(coordxy x, coordxy y\)[\s\S]*?ltyp == ICE[\s\S]*?drawbridgemask & DB_UNDER\) == DB_ICE/u);
    assert.match(DBRIDGE_C,
        /is_moat\(coordxy x, coordxy y\)[\s\S]*?!Is_juiblex_level\(&u\.uz\)[\s\S]*?ltyp == MOAT[\s\S]*?drawbridgemask & DB_UNDER\) == DB_MOAT/u);

    const cells = new Map([
        ['1,1', { typ: WATER }],
        ['2,1', { typ: LAVAPOOL }],
        ['3,1', { typ: LAVAWALL }],
        ['4,1', { typ: ICE }],
        // DB_UNDER is a mask; the packed field stores the surface value bits.
        ['5,1', { typ: DRAWBRIDGE_UP, flags: DB_LAVA }],
        ['6,1', { typ: DRAWBRIDGE_UP, flags: DB_ICE }],
        ['7,1', { typ: DRAWBRIDGE_UP, flags: DB_MOAT }],
        ['8,1', { typ: POOL }],
        ['9,1', { typ: MOAT }],
    ]);
    const state = levelState(cells, { juiblex_level: {} });

    assert.equal(is_waterwall(1, 1, state), true);
    assert.equal(is_waterwall(2, 1, state), false);
    assert.equal(is_waterwall(0, 1, state), false);
    assert.equal(is_lava(2, 1, state), true);
    assert.equal(is_lava(3, 1, state), true);
    assert.equal(is_lava(5, 1, state), true);
    assert.equal(is_lava(6, 1, state), false);
    assert.equal(is_pool_or_lava(2, 1, state), true);
    assert.equal(is_ice(4, 1, state), true);
    assert.equal(is_ice(6, 1, state), true);
    assert.equal(is_ice(5, 1, state), false);
    assert.equal(is_pool_or_lava(7, 1, state), true);
    assert.equal(is_pool_or_lava(8, 1, state), true);
    assert.equal(is_pool_or_lava(9, 1, state), true);
    assert.equal(is_moat(9, 1, state), true);
    assert.equal(is_moat(7, 1, state), true);
    assert.equal(is_ice(80, 1, state), false);

    const juiblex = levelState(cells, {
        u: { uz: { dnum: 2, dlevel: 5 } },
        juiblex_level: { dnum: 2, dlevel: 5 },
    });
    // dbridge.c:is_moat suppresses its drawbridge/moat result on Juiblex's level.
    assert.equal(is_pool_or_lava(9, 1, juiblex), true);
    assert.equal(is_pool_or_lava(7, 1, juiblex), false);
    assert.equal(is_moat(9, 1, juiblex), false);
    assert.equal(is_moat(7, 1, juiblex), false);
});

test('drawbridge entity lookup, survival, and wall coordinates follow dbridge.c', () => {
    assert.match(DBRIDGE_C,
        /e_at\(coordxy x, coordxy y\)[\s\S]*?occupants\[entitycnt\]\.edata[\s\S]*?occupants\[entitycnt\]\.ex == x[\s\S]*?occupants\[entitycnt\]\.ey == y/u);
    assert.match(DBRIDGE_C,
        /e_survives_at\(struct entity \*etmp, coordxy x, coordxy y\)[\s\S]*?noncorporeal\(etmp->edata\)[\s\S]*?is_pool\(x, y\)[\s\S]*?is_lava\(x, y\)[\s\S]*?is_db_wall\(x, y\)/u);
    assert.match(DBRIDGE_C,
        /get_wall_for_db\(coordxy \*x, coordxy \*y\)[\s\S]*?case DB_NORTH:[\s\S]*?\(\*y\)--;[\s\S]*?case DB_SOUTH:[\s\S]*?\(\*y\)\+\+;/u);
    assert.match(DBRIDGE_C,
        /e_nam\(struct entity \*etmp\)[\s\S]*?is_u\(etmp\) \? "you" : mon_nam/u);
    assert.match(DBRIDGE_C,
        /E_phrase\(struct entity \*etmp, const char \*verb\)[\s\S]*?is_u\(etmp\) \? "You" : Monnam/u);
    assert.match(DBRIDGE_C,
        /automiss\(struct entity \*etmp\)[\s\S]*?Passes_walls : passes_walls[\s\S]*?noncorporeal/u);

    // C's DB_NORTH wall coordinate decrements y; this small map checks that
    // direction while keeping the hero and moat on known adjacent squares.
    const bridge = { typ: DRAWBRIDGE_UP, flags: DB_NORTH };
    const hero = { data: { mlet: 'h' } };
    const cells = new Map([
        ['3,3', bridge],
        ['3,4', { typ: MOAT }],
    ]);
    const state = levelState(cells, {
        go: { occupants: [
            { emon: hero, edata: hero.data, ex: 3, ey: 3 },
            { emon: null, edata: null, ex: 0, ey: 0 },
        ] },
        youmonst: hero,
        u: {
            ux: 3,
            uy: 3,
            uprops: Array.from({ length: 64 }, () => ({ intrinsic: 0, extrinsic: 0 })),
        },
    });
    // dbridge.c:e_at matches both saved coordinates and skips an empty entity.
    assert.equal(e_at(3, 3, state), state.go.occupants[0]);
    assert.equal(e_at(4, 3, state), null);
    assert.equal(e_nam(state.go.occupants[0], state), 'you');
    assert.equal(E_phrase(state.go.occupants[0], 'are', state), 'You are');
    assert.equal(automiss(state.go.occupants[0], state), false);
    // C tests the Passes_walls property before noncorporeality.
    state.u.uprops[PASSES_WALLS].intrinsic = 1;
    assert.equal(automiss(state.go.occupants[0], state), true);
    state.u.uprops[PASSES_WALLS].intrinsic = 0;
    assert.equal(e_survives_at(state.go.occupants[0], 3, 4, state), false);
    const wall = { x: 3, y: 3 };
    get_wall_for_db(wall, state);
    assert.deepEqual(wall, { x: 3, y: 2 });
});
