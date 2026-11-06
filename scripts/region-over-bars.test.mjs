import assert from 'node:assert/strict';
import test from 'node:test';

import { IRONBARS, ROOM } from '../js/const.js';
import { cmap_to_glyph, newsym } from '../js/display.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { light_globals_init } from '../js/light.js';
import { create_gas_cloud, visible_region_at } from '../js/region.js';
import { S_bars, S_cloud } from '../js/symbols.js';
import { block_point, cansee, init_vision_globals, vision_recalc,
    vision_reset } from '../js/vision.js';

// display.c newsym() shows a visible region early only on ACCESSIBLE
// terrain, but its last arm, _map_location(x, y, 1), ends by drawing any
// visible region over the location it mapped (display.c:470-471). A fog
// cloud's vapor (monmove.c m_everyturn_effect()) left on iron bars therefore
// shows as the cloud glyph once the square is redrawn without a monster.
test('newsym draws a visible region over iron bars through _map_location',
    async () => {
    // An independent Healer game supplies a live display; the map below is
    // a lit 14x12 room so vision and lighting are fixed by the test.
    await runSegment({
        seed: 5520917,
        datetime: '20350402101500',
        nethackrc: 'OPTIONS=name:Bars,role:Healer,race:human,gender:female,'
            + 'align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,'
            + '!tips\n',
        moves: ' ',
    });
    game.level = new GameMap();
    game.head_engr = null;
    for (let x = 2; x <= 15; x++) {
        for (let y = 2; y <= 13; y++) {
            game.level.at(x, y).typ = ROOM;
            game.level.at(x, y).lit = true;
        }
    }
    game.u.ux = 5;
    game.u.uy = 7;
    // Iron bars two squares east of the hero: in sight, not ACCESSIBLE.
    game.level.at(7, 7).typ = IRONBARS;
    light_globals_init(game);
    init_vision_globals();
    vision_reset(game);
    vision_recalc(0);
    // A size-1, zero-damage cloud is the fog cloud's harmless vapor; it
    // covers its centre square whatever the terrain there.
    await create_gas_cloud(7, 7, 1, 0, {
        state: game, blockPoint: block_point, canSee: cansee, newsym,
        message: async () => {},
    });
    vision_recalc(0);
    assert.ok(visible_region_at(7, 7, game));
    await newsym(7, 7, game);
    // Both symbols are '#' in the default symset, so compare glyphs.
    assert.notEqual(cmap_to_glyph(S_cloud, game), cmap_to_glyph(S_bars, game));
    assert.equal(game.level.at(7, 7).disp_glyph?.glyph,
        cmap_to_glyph(S_cloud, game), 'S_cloud covers the bars glyph');
});
