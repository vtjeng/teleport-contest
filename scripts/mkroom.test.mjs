import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AIR,
    ALTAR,
    ANY_TYPE,
    BLCORNER,
    BRCORNER,
    CLOUD,
    CORR,
    CROSSWALL,
    DBWALL,
    DOOR,
    DRAWBRIDGE_DOWN,
    FOUNTAIN,
    GRAVE,
    HWALL,
    ICE,
    IRONBARS,
    LADDER,
    LAVAPOOL,
    LAVAWALL,
    OROOM,
    POOL,
    ROOM,
    SINK,
    STAIRS,
    STONE,
    TDWALL,
    THRONE,
    TLCORNER,
    TLWALL,
    TREE,
    TRCORNER,
    TRWALL,
    TUWALL,
    VAULT,
    VWALL,
    WATER,
    ZOO,
} from '../js/const.js';
import { cmap_to_type, search_special } from '../js/mkroom.js';
import {
    S_air,
    S_altar,
    S_bars,
    S_blcorn,
    S_brcorn,
    S_cloud,
    S_corr,
    S_crwall,
    S_darkroom,
    S_dnladder,
    S_dnstair,
    S_fountain,
    S_grave,
    S_hcdoor,
    S_hcdbridge,
    S_hodbridge,
    S_hodoor,
    S_hwall,
    S_ice,
    S_lava,
    S_lavawall,
    S_litcorr,
    S_ndoor,
    S_pool,
    S_room,
    S_sink,
    S_stone,
    S_tdwall,
    S_throne,
    S_tlcorn,
    S_tlwall,
    S_tree,
    S_trcorn,
    S_trwall,
    S_tuwall,
    S_upladder,
    S_upstair,
    S_vcdoor,
    S_vcdbridge,
    S_vodbridge,
    S_vodoor,
    S_vwall,
    S_water,
} from '../js/symbols.js';

test('cmap_to_type covers the complete source terrain projection', () => {
    const cases = [
        [S_stone, STONE],
        [S_vwall, VWALL],
        [S_hwall, HWALL],
        [S_tlcorn, TLCORNER],
        [S_trcorn, TRCORNER],
        [S_blcorn, BLCORNER],
        [S_brcorn, BRCORNER],
        [S_crwall, CROSSWALL],
        [S_tuwall, TUWALL],
        [S_tdwall, TDWALL],
        [S_tlwall, TLWALL],
        [S_trwall, TRWALL],
        [S_ndoor, DOOR],
        [S_vodoor, DOOR],
        [S_hodoor, DOOR],
        [S_vcdoor, DOOR],
        [S_hcdoor, DOOR],
        [S_bars, IRONBARS],
        [S_tree, TREE],
        [S_room, ROOM],
        [S_darkroom, ROOM],
        [S_corr, CORR],
        [S_litcorr, CORR],
        [S_upstair, STAIRS],
        [S_dnstair, STAIRS],
        [S_upladder, LADDER],
        [S_dnladder, LADDER],
        [S_altar, ALTAR],
        [S_grave, GRAVE],
        [S_throne, THRONE],
        [S_sink, SINK],
        [S_fountain, FOUNTAIN],
        [S_pool, POOL],
        [S_ice, ICE],
        [S_lava, LAVAPOOL],
        [S_vodbridge, DRAWBRIDGE_DOWN],
        [S_hodbridge, DRAWBRIDGE_DOWN],
        [S_vcdbridge, DBWALL],
        [S_hcdbridge, DBWALL],
        [S_air, AIR],
        [S_cloud, CLOUD],
        [S_water, WATER],
        [S_lavawall, LAVAWALL],
    ];
    for (const [symbol, expected] of cases)
        assert.equal(cmap_to_type(symbol), expected, `symbol ${symbol}`);
    assert.equal(cmap_to_type(-1), STONE);
});

// C ref: mkroom.c search_special() (764-780). Each room here is the minimum
// the scan reads: hx (the `croom->hx >= 0` end test) and rtype. The room
// bounds are otherwise unused, so every hx is 1.
function room(rtype, sbrooms = []) {
    return { hx: 1, rtype, nsubrooms: sbrooms.length, sbrooms };
}

test('search_special ANY_TYPE skips ordinary rooms for the first special one',
    () => {
        // mkroom.c:772 `type == ANY_TYPE && croom->rtype != OROOM`. Room 0 is
        // ordinary and must be passed over; room 1 is a zoo, any non-OROOM
        // rtype, and room 2 a vault that an early return must never reach.
        const zoo = room(ZOO);
        const state = { level: { rooms: [room(OROOM), zoo, room(VAULT)] } };
        assert.equal(search_special(ANY_TYPE, state), zoo);
        // With only ordinary rooms the scan finds nothing.
        assert.equal(
            search_special(ANY_TYPE, { level: { rooms: [room(OROOM)] } }),
            null,
        );
    });

test('search_special descends into a subroom of a subroom', () => {
    // mkroom.c:776-779 scans the flat gs.subrooms[] array, which holds every
    // subroom whatever its depth. The port keeps subrooms under their parent,
    // so the vault sits two levels below the level's only top-level room: an
    // ordinary room whose single subroom is ordinary too. Neither pass finds
    // it without recursing.
    const vault = room(VAULT);
    const state = {
        level: { rooms: [room(OROOM, [room(OROOM, [vault])])] },
    };
    assert.equal(search_special(VAULT, state), vault);
    assert.equal(search_special(ANY_TYPE, state), vault);
    assert.equal(search_special(ZOO, state), null);
});
