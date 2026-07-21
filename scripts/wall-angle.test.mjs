import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLCORNER,
    BRCORNER,
    CROSSWALL,
    HWALL,
    SDOOR,
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
    WM_C_INNER,
    WM_C_OUTER,
    WM_W_LEFT,
    WM_W_TOP,
    WM_X_BL,
    WM_X_BR,
    WM_X_TL,
    WM_X_TR,
} from '../js/const.js';
import { terrain_glyph, wall_angle } from '../js/display.js';
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
