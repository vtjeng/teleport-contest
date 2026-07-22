import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLCORNER,
    BRCORNER,
    CROSSWALL,
    HWALL,
    ROOM,
    SDOOR,
    STONE,
    SV0,
    SV1,
    SV2,
    SV3,
    SV4,
    SV5,
    SV6,
    SV7,
    TDWALL,
    TLCORNER,
    TLWALL,
    TRCORNER,
    TRWALL,
    TUWALL,
    VWALL,
    W_NONDIGGABLE,
    WM_C_INNER,
    WM_C_OUTER,
    WM_MASK,
    WM_T_BL,
    WM_T_BR,
    WM_T_LONG,
    WM_W_BOTTOM,
    WM_W_LEFT,
    WM_W_RIGHT,
    WM_W_TOP,
    WM_X_BL,
    WM_X_BLTR,
    WM_X_BR,
    WM_X_TL,
    WM_X_TLBR,
    WM_X_TR,
} from '../js/const.js';
import {
    set_wall_state,
    terrain_glyph,
    wall_angle,
    xy_set_wall_state,
} from '../js/display.js';
import { GameMap } from '../js/game.js';
import {
    cmap_symbol,
    initialize_symbols_from_options,
    S_blcorn,
    S_brcorn,
    S_hwall,
    S_stone,
    S_tree,
    S_tlcorn,
    S_trcorn,
    S_vwall,
} from '../js/symbols.js';

test('back_to_glyph hides every unseen wall type as stone', () => {
    const state = {};
    initialize_symbols_from_options({ flags: {} }, state);
    const wallTypes = [
        SDOOR, VWALL, HWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER,
        CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
    ];
    const stone = cmap_symbol(S_stone, state);
    // Wall rendering does not inspect coordinates; these identify a valid
    // interior map cell for terrain_glyph().
    const x = 7;
    const y = 4;

    for (const typ of wallTypes) {
        const glyph = terrain_glyph(
            { typ, seenv: 0, wall_info: 0 }, x, y, state,
        );
        assert.deepEqual(
            { ch: glyph.ch, dec: glyph.dec },
            { ch: stone.ch, dec: stone.dec },
            `terrain type ${typ}`,
        );
    }
});

test('T-wall seen vectors rotate into the source wall-matrix rows', () => {
    const cases = [
        // Each vector rotates to SV4, the top-left-corner column for TDWALL.
        { typ: TDWALL, seenv: SV4, expected: S_tlcorn },
        { typ: TUWALL, seenv: SV0, expected: S_brcorn },
        { typ: TLWALL, seenv: SV6, expected: S_trcorn },
        { typ: TRWALL, seenv: SV2, expected: S_blcorn },
    ];

    for (const { typ, seenv, expected } of cases) {
        assert.equal(wall_angle({ typ, seenv, wall_info: 0 }), expected);
    }
});

test('unfinished straight and corner walls suppress their rock-facing side', () => {
    const cases = [
        // Left unfinished vertical wall: westward SV7 is rock; eastward SV3 is wall.
        { typ: VWALL, seenv: SV7, wall_info: WM_W_LEFT, expected: S_stone },
        { typ: VWALL, seenv: SV3, wall_info: WM_W_LEFT, expected: S_vwall },
        // Top unfinished horizontal wall: northward SV1 is rock; southward SV5 is wall.
        { typ: HWALL, seenv: SV1, wall_info: WM_W_TOP, expected: S_stone },
        { typ: HWALL, seenv: SV5, wall_info: WM_W_TOP, expected: S_hwall },
        // TLCORNER outer mode exposes only the southern/western octants.
        { typ: TLCORNER, seenv: SV0, wall_info: WM_C_OUTER, expected: S_stone },
        { typ: TLCORNER, seenv: SV4, wall_info: WM_C_OUTER, expected: S_tlcorn },
        // TLCORNER inner mode hides the diagonal inner SV4 octant alone.
        { typ: TLCORNER, seenv: SV4, wall_info: WM_C_INNER, expected: S_stone },
        { typ: TLCORNER, seenv: SV3, wall_info: WM_C_INNER, expected: S_tlcorn },
    ];

    for (const loc of cases) {
        const { expected, ...wall } = loc;
        assert.equal(wall_angle(wall), expected);
    }
});

test('single-solid crosswalls rotate their hidden and visible corners', () => {
    const cases = [
        // First vector in each pair rotates onto the hidden solid SV4 quarter.
        { wall_info: WM_X_TL, hidden: SV0, visible: SV4, expected: S_tlcorn },
        { wall_info: WM_X_TR, hidden: SV2, visible: SV6, expected: S_trcorn },
        { wall_info: WM_X_BL, hidden: SV6, visible: SV2, expected: S_blcorn },
        { wall_info: WM_X_BR, hidden: SV4, visible: SV0, expected: S_brcorn },
    ];

    for (const { wall_info, hidden, visible, expected } of cases) {
        assert.equal(
            wall_angle({ typ: CROSSWALL, seenv: hidden, wall_info }),
            S_stone,
        );
        assert.equal(
            wall_angle({ typ: CROSSWALL, seenv: visible, wall_info }),
            expected,
        );
    }
});

test('secret doors share wall geometry unless their tree alias is set', () => {
    assert.equal(
        wall_angle({ typ: SDOOR, seenv: SV3, wall_info: 0 }),
        S_vwall,
    );
    assert.equal(
        wall_angle({ typ: SDOOR, seenv: SV5, wall_info: 0, horizontal: true }),
        S_hwall,
    );
    assert.equal(
        // rm.h aliases arboreal_sdoor to the location's candig bit.
        wall_angle({ typ: SDOOR, seenv: SV3, wall_info: 0, candig: true }),
        S_tree,
    );
});

const WALL_X = 20;
const WALL_Y = 10;

function modeForWall(typ, { horizontal = false, rock = [] } = {}) {
    const level = new GameMap();
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            level.at(WALL_X + dx, WALL_Y + dy).typ = ROOM;
        }
    }
    const loc = level.at(WALL_X, WALL_Y);
    loc.typ = typ;
    loc.horizontal = horizontal;
    loc.wall_info = W_NONDIGGABLE | WM_MASK;
    for (const [dx, dy] of rock) {
        level.at(WALL_X + dx, WALL_Y + dy).typ = STONE;
    }

    xy_set_wall_state(WALL_X, WALL_Y, { level });
    return loc.wall_info;
}

test('xy_set_wall_state assigns every source wall-mode orientation', () => {
    const cases = [
        { name: 'vertical secret door', typ: SDOOR, rock: [[-1, 0]], expected: WM_W_LEFT },
        { name: 'horizontal secret door', typ: SDOOR, horizontal: true, rock: [[0, -1]], expected: WM_W_TOP },
        { name: 'vertical wall', typ: VWALL, rock: [[1, 0]], expected: WM_W_RIGHT },
        { name: 'horizontal wall', typ: HWALL, rock: [[0, 1]], expected: WM_W_BOTTOM },

        { name: 'down T long', typ: TDWALL, rock: [[0, -1]], expected: WM_T_LONG },
        { name: 'down T bottom-left', typ: TDWALL, rock: [[-1, 1]], expected: WM_T_BL },
        { name: 'down T bottom-right', typ: TDWALL, rock: [[1, 1]], expected: WM_T_BR },
        { name: 'up T long', typ: TUWALL, rock: [[0, 1]], expected: WM_T_LONG },
        { name: 'up T bottom-left', typ: TUWALL, rock: [[1, -1]], expected: WM_T_BL },
        { name: 'up T bottom-right', typ: TUWALL, rock: [[-1, -1]], expected: WM_T_BR },
        { name: 'left T long', typ: TLWALL, rock: [[1, 0]], expected: WM_T_LONG },
        { name: 'left T bottom-left', typ: TLWALL, rock: [[-1, -1]], expected: WM_T_BL },
        { name: 'left T bottom-right', typ: TLWALL, rock: [[-1, 1]], expected: WM_T_BR },
        { name: 'right T long', typ: TRWALL, rock: [[-1, 0]], expected: WM_T_LONG },
        { name: 'right T bottom-left', typ: TRWALL, rock: [[1, 1]], expected: WM_T_BL },
        { name: 'right T bottom-right', typ: TRWALL, rock: [[1, -1]], expected: WM_T_BR },

        { name: 'top-left inner corner', typ: TLCORNER, rock: [[1, 1]], expected: WM_C_INNER },
        { name: 'top-left outer corner', typ: TLCORNER, rock: [[-1, -1], [0, -1], [-1, 0]], expected: WM_C_OUTER },
        { name: 'top-right inner corner', typ: TRCORNER, rock: [[-1, 1]], expected: WM_C_INNER },
        { name: 'top-right outer corner', typ: TRCORNER, rock: [[0, -1], [1, -1], [1, 0]], expected: WM_C_OUTER },
        { name: 'bottom-left inner corner', typ: BLCORNER, rock: [[1, -1]], expected: WM_C_INNER },
        { name: 'bottom-left outer corner', typ: BLCORNER, rock: [[0, 1], [-1, 1], [-1, 0]], expected: WM_C_OUTER },
        { name: 'bottom-right inner corner', typ: BRCORNER, rock: [[-1, -1]], expected: WM_C_INNER },
        { name: 'bottom-right outer corner', typ: BRCORNER, rock: [[1, 0], [1, 1], [0, 1]], expected: WM_C_OUTER },

        { name: 'cross top-left', typ: CROSSWALL, rock: [[-1, -1]], expected: WM_X_TL },
        { name: 'cross top-right', typ: CROSSWALL, rock: [[1, -1]], expected: WM_X_TR },
        { name: 'cross bottom-right', typ: CROSSWALL, rock: [[1, 1]], expected: WM_X_BR },
        { name: 'cross bottom-left', typ: CROSSWALL, rock: [[-1, 1]], expected: WM_X_BL },
        { name: 'cross top-left/bottom-right', typ: CROSSWALL, rock: [[-1, -1], [1, 1]], expected: WM_X_TLBR },
        { name: 'cross bottom-left/top-right', typ: CROSSWALL, rock: [[1, -1], [-1, 1]], expected: WM_X_BLTR },
        { name: 'ambiguous cross', typ: CROSSWALL, rock: [[-1, -1], [1, -1]], expected: 0 },
    ];

    for (const { name, typ, expected, ...configuration } of cases) {
        assert.equal(
            modeForWall(typ, configuration),
            W_NONDIGGABLE | expected,
            name,
        );
    }
});

test('set_wall_state scans the level with source map-boundary semantics', () => {
    const level = new GameMap();
    const edgeWall = level.at(1, 2);
    edgeWall.typ = VWALL;
    edgeWall.wall_info = W_NONDIGGABLE | WM_MASK;
    // Column zero exists in levl[][] but is outside isok(), so it remains an
    // unfinished exterior even if its terrain is otherwise accessible.
    level.at(0, 2).typ = ROOM;
    level.at(2, 2).typ = ROOM;

    const floor = level.at(10, 10);
    floor.typ = ROOM;
    floor.wall_info = W_NONDIGGABLE | WM_X_BLTR;

    set_wall_state({ level });

    assert.equal(edgeWall.wall_info, W_NONDIGGABLE | WM_W_LEFT);
    assert.equal(floor.wall_info, W_NONDIGGABLE | WM_X_BLTR);
});
