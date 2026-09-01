import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HALLUC,
    HALLUC_RES,
} from '../js/const.js';
import { GLYPH_SWALLOW_OFF } from '../js/glyph_offsets.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { docrt } from '../js/display.js';
import {
    initialize_symbols_from_options,
    S_sw_bc,
    S_sw_bl,
    S_sw_br,
    S_sw_ml,
    S_sw_mr,
    S_sw_tc,
    S_sw_tl,
    S_sw_tr,
} from '../js/symbols.js';
import { monst_globals_init, NUMMONS, PM_GOBLIN } from '../js/monsters.js';
import { cloneIsaacContext, initRng } from '../js/rng.js';
import { isaac64_next_uint64 } from '../js/isaac64.js';
import { GameDisplay } from '../js/game_display.js';

test('docrt redraws a swallowed stomach from a fresh display frame', async () => {
    resetGame();
    game.level = new GameMap();
    game.nhDisplay = new GameDisplay(null);
    game.program_state = {};
    game.disp = {};
    game.gb = { bot_disabled: true };
    game.u = {
        ux: 7,
        uy: 4,
        umonnum: 0,
        ulevel: 1,
        uswallow: 1,
        ustuck: { data: null },
    };
    game.u.uprops = [];
    game.u.uprops[HALLUC] = { intrinsic: 30, extrinsic: 0, blocked: 0 };
    game.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    monst_globals_init(game);
    game.u.ustuck.data = game.mons[PM_GOBLIN];
    initialize_symbols_from_options({ flags: {} }, game);

    initRng(383);
    const expectedContext = cloneIsaacContext(game.displayCtx);
    const species = [];
    for (let i = 0; i < 8; ++i) {
        species.push(Number(
            isaac64_next_uint64(expectedContext) % BigInt(NUMMONS),
        ));
    }
    const positions = [
        [game.u.ux - 1, game.u.uy - 1, S_sw_tl],
        [game.u.ux, game.u.uy - 1, S_sw_tc],
        [game.u.ux + 1, game.u.uy - 1, S_sw_tr],
        [game.u.ux - 1, game.u.uy, S_sw_ml],
        [game.u.ux + 1, game.u.uy, S_sw_mr],
        [game.u.ux - 1, game.u.uy + 1, S_sw_bl],
        [game.u.ux, game.u.uy + 1, S_sw_bc],
        [game.u.ux + 1, game.u.uy + 1, S_sw_br],
    ];

    await docrt();

    for (const [index, [x, y, symbol]] of positions.entries()) {
        assert.equal(
            game.level.at(x, y).disp_glyph.glyph,
            ((species[index] << 3) | (symbol - S_sw_tl))
                + GLYPH_SWALLOW_OFF,
            `stomach cell ${index} uses the corresponding display draw`,
        );
    }
    assert.deepEqual(
        game.displayCtx,
        expectedContext,
        'docrt consumes exactly the eight swallowed-frame display draws',
    );
});
