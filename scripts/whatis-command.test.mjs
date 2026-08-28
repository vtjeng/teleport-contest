import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARROW_TRAP,
    BEAR_TRAP,
    D_BROKEN,
    D_TRAPPED,
    DOOR,
    GRAVE,
    HEADSTONE,
    TRAPPED_CHEST,
    TRAPPED_DOOR,
    TRAPNUM,
    TIP_GETPOS,
} from '../js/const.js';
import { GETPOS_TIP_LINES, handle_tip } from '../js/hack.js';
import { trapped_chest_at } from '../js/detect.js';
import { GameMap } from '../js/game.js';
import { getpos, truncate_to_map } from '../js/getpos.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import {
    NO_GLYPH,
    cmap_to_glyph,
    glyph_is_monster,
    glyph_is_trap,
    glyph_to_trap,
    map_glyphinfo,
    trap_to_glyph,
} from '../js/display.js';
import {
    GLYPH_BODY_OFF,
    GLYPH_DETECT_FEM_OFF,
    GLYPH_DETECT_MALE_OFF,
    GLYPH_INVIS_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_PET_FEM_OFF,
    GLYPH_PET_MALE_OFF,
    GLYPH_RIDDEN_FEM_OFF,
    GLYPH_RIDDEN_MALE_OFF,
} from '../js/glyph_offsets.js';
import { NUMMONS } from '../js/monsters.js';
import { CHEST, POT_WATER } from '../js/objects.js';
import {
    do_screen_description,
    add_quoted_engraving,
    look_engrs,
    look_traps,
    look_region_nearby,
    self_lookat,
    trap_description,
    whatisMenuItems,
} from '../js/pager.js';
import {
    S_brupstair,
    S_corr,
    S_darkroom,
    S_ndoor,
    S_room,
    initialize_symbols_from_options,
} from '../js/symbols.js';
import {
    NEXT_COMMAND,
    MORE_KEYS,
    TRADITIONAL_PICK,
    WHATIS_COMMAND,
    WHATIS_MAP_CHOICE,
    WHATIS_SETUP,
    loadWhatisMapHeroRecipe,
} from './run-whatis-map-getpos-hero.mjs';
import {
    loadWhatisMapCursorTerrainRecipe,
} from './run-whatis-map-cursor-terrain.mjs';
import {
    CARRIED_QUARTERSTAFF_MOVES,
    TYPED_FOUNTAIN_MOVES,
    loadWhatisTypedInventoryRecipe,
} from './run-whatis-typed-inventory-lookup.mjs';
import {
    MONSTER_OBJECT_LIST_MOVES,
    loadWhatisMonsterObjectListRecipe,
} from './run-whatis-monster-object-lists.mjs';
import {
    EMPTY_TRAP_LIST_MOVES,
    TRAP_ENGRAVING_LIST_MOVES,
    loadWhatisTrapEngravingListRecipe,
} from './run-whatis-trap-engraving-lists.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

test('the default whatis menu preserves pager.c order and accelerators', () => {
    const state = {
        // pager.c do_look() shows all 11 rows only for the ordinary sighted,
        // non-hallucinating, unswallowed default-lootabc branch.
        flags: { lootabc: false },
        u: { uswallow: false },
    };
    assert.deepEqual(
        whatisMenuItems(state).map(({ value, selector, label }) => ({
            value, selector, label,
        })),
        [
            { value: '/', selector: '/', label: 'something on the map' },
            { value: 'i', selector: 'i', label: "something you're carrying" },
            { value: '?', selector: '?', label: 'something else (by symbol or name)' },
            { value: 'm', selector: 'm', label: 'nearby monsters' },
            { value: 'M', selector: 'M', label: 'all monsters shown on map' },
            { value: 'o', selector: 'o', label: 'nearby objects' },
            { value: 'O', selector: 'O', label: 'all objects shown on map' },
            { value: 't', selector: 't', label: 'nearby traps' },
            { value: 'T', selector: 'T', label: 'all seen or remembered traps' },
            { value: 'e', selector: 'e', label: 'nearby engravings' },
            { value: 'E', selector: 'E', label: 'all seen or remembered engravings' },
        ],
    );
});

test('self_lookat names the ordinary human Wizard from C state', () => {
    const state = {
        // These values select self_lookat()'s unpolymorphed, unmounted,
        // untrapped branch for the male human Wizard named in the assertion.
        flags: { female: false },
        plname: 'merlin',
        // Equal current and base forms make Upolyd false.
        u: { umonnum: 343, umonster: 343 },
        urace: { adj: 'human' },
        mons: {
            // monsters.h PM_WIZARD has male, female, and neutral names.
            343: { pmnames: ['wizard', 'wizard', 'wizard'] },
        },
    };
    assert.equal(self_lookat(state), 'human wizard called merlin');
});

test('the getpos tip is shown once and records TIP_GETPOS', async () => {
    const state = {
        flags: { tips: true },
        context: { tips: 0 },
    };
    const shown = [];
    const first = await handle_tip(TIP_GETPOS, state, {
        textWindow: async (lines) => shown.push(lines.map(({ text }) => text)),
    });
    const second = await handle_tip(TIP_GETPOS, state, {
        textWindow: async () => assert.fail('a recorded tip must not repeat'),
    });

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(state.context.tips, 1 << TIP_GETPOS);
    assert.deepEqual(shown, [GETPOS_TIP_LINES.map((text) => text)]);
});

test('ordinary hero farlook returns to command mode without taking time',
    async () => {
        const segment = loadWhatisMapHeroRecipe().segments[0];
        await runSegment({
            ...segment,
            // The baseline clears the welcome message and spends only the
            // same final wait used to cross the post-whatis boundary.
            moves: WHATIS_SETUP + NEXT_COMMAND,
        });
        const baselineMoves = game.moves;

        const replay = await runSegment(segment);
        assert.equal(game.moves, baselineMoves);
        assert.equal(game.context.tips, 1 << TIP_GETPOS);
        assert.equal(game.flags.verbose, true);
        assert.equal(game.context.pendingCommand, undefined);
        assert.deepEqual(
            { x: game.gg.getposx, y: game.gg.getposy },
            { x: 0, y: 0 },
        );
        assert.equal(replay.getRngLog().length > 0, true);
    });

test('ordinary hero farlook renders the source-derived description',
    async () => {
    const segment = loadWhatisMapHeroRecipe().segments[0];
    await runSegment({
        ...segment,
        moves: WHATIS_SETUP + WHATIS_COMMAND + WHATIS_MAP_CHOICE
            + MORE_KEYS + TRADITIONAL_PICK,
    });
    assert.equal(
        game._ttyToplines,
        '@        a human or elf (human wizard called Farley)',
    );
});

function terrainDescription(cmap, flags = 0) {
    // The separate hero coordinate keeps pager.c lookat() on its ordinary
    // glyph_is_cmap() branch. D:1 selects the main-dungeon glyph family.
    const state = {
        u: { ux: 40, uy: 10, uz: { dnum: 0, dlevel: 1 } },
        level: {},
        iflags: { terrainmode: 0 },
    };
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=symset:DECgraphics\n'), state,
    );
    // display.c reglyph_darkroom() makes a sighted dark-room square use the
    // active room symbol before pager.c scans gs.showsyms[].
    state.gs.showsyms[S_darkroom] = state.gs.showsyms[S_room];
    state.level.at = (x, y) => (x === 3 && y === 4
        ? { flags, disp_glyph: { glyph: cmap_to_glyph(cmap, state) } }
        : undefined);
    return do_screen_description({ x: 3, y: 4 }, true, 0, state);
}

test('branch stairs retain the symbol ambiguity and specific terrain', () => {
    // DECgraphics gives S_upstair and S_brupstair the '<' byte while its
    // ladders use '/', so pager.c lists these two before lookat() refines it.
    assert.deepEqual(terrainDescription(S_brupstair), {
        found: 1,
        out: '<        a staircase up or a branch staircase up (branch staircase up)',
        firstmatch: 'branch staircase up',
    });
});

test('room floor retains every dot ambiguity before lookat refinement', () => {
    // DECgraphics assigns its middle-dot byte to S_ndoor, S_room, S_darkroom,
    // and S_ice, in defsym.h order.
    assert.deepEqual(terrainDescription(S_room), {
        found: 1,
        out: '·        a doorway or the floor of a room or the dark part of a room or ice (floor of a room)',
        firstmatch: 'floor of a room',
    });
});

test('corridor ambiguity uses pager.c many-things truncation', () => {
    // At least five defsym.h entries use '#'. pager.c replaces their list
    // after the fifth match, then lookat() appends the actual S_corr detail.
    assert.deepEqual(terrainDescription(S_corr), {
        found: 1,
        out: '#        can be many things (corridor)',
        firstmatch: 'corridor',
    });
});

test('doorway refinement distinguishes broken and trapped-broken masks', () => {
    const prefix = '·        a doorway or the floor of a room or the dark part of a room or ice';
    assert.deepEqual(terrainDescription(S_ndoor), {
        found: 1,
        out: `${prefix} (doorway)`,
        firstmatch: 'doorway',
    });
    assert.deepEqual(terrainDescription(S_ndoor, D_BROKEN), {
        found: 1,
        out: `${prefix} (broken door)`,
        firstmatch: 'broken door',
    });
    assert.deepEqual(terrainDescription(S_ndoor, D_BROKEN | D_TRAPPED), {
        found: 1,
        out: `${prefix} (broken door)`,
        firstmatch: 'broken door',
    });
});

test('truncate_to_map preserves diagonal travel along map edges', () => {
    // From <2,1>, an eight-cell northwest run reaches C's left edge first;
    // truncate_to_map() removes seven vertical cells and lands at <1,0>.
    assert.deepEqual(truncate_to_map(2, 1, -8, -8), { x: 1, y: 0 });
    // The mirror case reaches C's right edge first and lands at <79,20>.
    assert.deepEqual(truncate_to_map(78, 19, 8, 8), { x: 79, y: 20 });
});

test('ordinary and fast cursor movement return through the next boundary',
    async () => {
        const expected = [
            // Fresh C seed 42046: west, a traditional floor pick, then Escape.
            { screens: 19, rng: 2748 },
            // Fresh C seed 42050: an eight-cell H move, then Escape.
            { screens: 17, rng: 2749 },
        ];
        const segments = loadWhatisMapCursorTerrainRecipe().segments;
        for (let index = 0; index < segments.length; ++index) {
            let boundary;
            const replay = await runSegment(segments[index], {
                onBoundary: (error) => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            assert.equal(replay.getScreens().length, expected[index].screens);
            assert.equal(replay.getCursors().length, expected[index].screens);
            assert.equal(replay.getRngLog().length, expected[index].rng);
            assert.deepEqual(
                replay.getCursors()[14],
                index === 0 ? [30, 5, 1] : [27, 17, 1],
            );
            assert.deepEqual(
                { x: game.gg.getposx, y: game.gg.getposy },
                { x: 0, y: 0 },
            );
        }
    });

test('getpos restores the caller direction after moving its cursor', async () => {
    const segment = loadWhatisMapCursorTerrainRecipe().segments[0];
    await runSegment({ ...segment, moves: WHATIS_SETUP });
    game.flags.tips = false;
    game.flags.verbose = false;
    game.u.dx = 3;
    game.u.dy = -4;
    game.u.dz = 5;
    game.nhDisplay.pushKey('h'.charCodeAt(0));
    game.nhDisplay.pushKey(0x1B);

    const coordinate = { x: game.u.ux, y: game.u.uy };
    assert.equal(await getpos(coordinate, false, 'a target', game), -1);
    assert.deepEqual(
        [game.u.dx, game.u.dy, game.u.dz],
        [3, -4, 5],
    );
});

test('typed fountain lookup displays its entry through the next boundary',
    async () => {
        const [segment] = loadWhatisTypedInventoryRecipe().segments;
        assert.equal(segment.moves, TYPED_FOUNTAIN_MOVES);
        const replay = await runSegment(segment);

        // Fresh C seed 42051 records these exact boundary and PRNG totals.
        assert.equal(replay.getScreens().length, 15);
        assert.equal(replay.getCursors().length, 15);
        assert.equal(replay.getRngLog().length, 2552);
        // Startup begins at move one; only the final dot advances it to two.
        assert.equal(game.moves, 2);
    });

test('carried quarterstaff lookup displays its wildcard entry', async () => {
    const [, segment] = loadWhatisTypedInventoryRecipe().segments;
    assert.equal(segment.moves, CARRIED_QUARTERSTAFF_MOVES);
    const replay = await runSegment(segment);

    // Fresh C seed 42052 records these totals after selecting Wizard invlet a.
    assert.equal(replay.getScreens().length, 7);
    assert.equal(replay.getCursors().length, 7);
    assert.equal(replay.getRngLog().length, 6271);
    // Startup begins at move one; only the final dot advances it to two.
    assert.equal(game.moves, 2);
});

test('typed and carried lookups render their source encyclopedia text',
    () => withSerializedGrids(async () => {
        const [typed, carried] = loadWhatisTypedInventoryRecipe().segments;
        const typedReplay = await runSegment(typed);
        const carriedReplay = await runSegment(carried);
        const screenText = (replay) => replay.getScreens()
            .map((screen) => JSON.parse(screen))
            .map((grid) => grid.map((row) => row.map(({ ch }) => ch).join(''))
                .join('\n'));

        assert.equal(screenText(typedReplay).some((screen) => (
            screen.includes('Rest! This little Fountain runs')
            && screen.includes('[ For a Fountain, by Bryan Waller Procter ]')
        )), true);
        assert.equal(screenText(carriedReplay).some((screen) => (
            screen.includes('So they stood, each in his place')
            && screen.includes('[ The Merry Adventures of Robin Hood, by Howard Pyle ]')
        )), true);
    }));

test('three-line status repair matches the inventory docorner rectangle',
    () => withSerializedGrids(async () => {
        const segment = loadWhatisTypedInventoryRecipe().segments[2];
        const replay = await runSegment(segment);
        assert.equal(replay.getScreens().length, 7);
        assert.equal(replay.getCursors().length, 7);
        assert.equal(replay.getRngLog().length, 6271);

        const grids = replay.getScreens().map((screen) => JSON.parse(screen));
        const textRows = grids.map((grid) => grid.map(
            (row) => row.map(({ ch }) => ch).join('').trimEnd(),
        ));
        const encyclopedia = textRows.find((rows) => rows.some(
            (row) => row.includes('So they stood, each in his place'),
        ));
        assert.ok(encyclopedia);
        // C docorner(offx, maxrow + 1, 0) reaches physical rows 21 and 22
        // for this inventory, leaving only their pre-overlay status prefixes.
        assert.deepEqual(encyclopedia.slice(21), [
            'Hypatia the Evoker',
            'Neutral $:0 HP:12(1',
            'Dlvl:1',
        ]);
    }));

test('nearby whatis bounds clamp to the playable map', () => {
    // BOLT_LIM is eight. A hero at <20,3> reaches y=0 before the upper
    // radius, while the ordinary x bounds remain eight columns away.
    assert.deepEqual(look_region_nearby(true, {
        u: { ux: 20, uy: 3 },
    }), { loX: 12, loY: 0, hiX: 28, hiY: 11 });
    // A hero at <2,19> reaches C's x=1 and y=20 playable edges.
    assert.deepEqual(look_region_nearby(true, {
        u: { ux: 2, uy: 19 },
    }), { loX: 1, loY: 11, hiX: 10, hiY: 20 });
    // The all-map arm includes every playable coordinate and excludes x=0.
    assert.deepEqual(look_region_nearby(false, {
        u: { ux: 20, uy: 3 },
    }), { loX: 1, loY: 0, hiX: 79, hiY: 20 });
});

test('monster glyph recognition includes every display.h monster family', () => {
    const familyOffsets = [
        GLYPH_MON_MALE_OFF,
        GLYPH_MON_FEM_OFF,
        GLYPH_PET_MALE_OFF,
        GLYPH_PET_FEM_OFF,
        GLYPH_DETECT_MALE_OFF,
        GLYPH_DETECT_FEM_OFF,
        GLYPH_RIDDEN_MALE_OFF,
        GLYPH_RIDDEN_FEM_OFF,
    ];
    for (const offset of familyOffsets) {
        // Each generated offset begins a source NUMMONS-wide range. Testing
        // its first and last values pins both comparisons in the predicate.
        assert.equal(glyph_is_monster(offset), true);
        assert.equal(glyph_is_monster(offset + NUMMONS - 1), true);
    }
    assert.equal(glyph_is_monster(Math.min(...familyOffsets) - 1), false);
    assert.equal(
        glyph_is_monster(Math.max(...familyOffsets) + NUMMONS),
        false,
    );
    assert.equal(glyph_is_monster(cmap_to_glyph(S_room)), false);
    assert.equal(
        glyph_is_monster(trap_to_glyph({ ttyp: ARROW_TRAP })),
        false,
    );
    assert.equal(glyph_is_monster(NO_GLYPH), false);
    assert.equal(glyph_is_monster(GLYPH_INVIS_OFF), false);
    assert.equal(glyph_is_monster(GLYPH_BODY_OFF), false);
    assert.equal(glyph_is_monster(GLYPH_BODY_OFF + NUMMONS - 1), false);
});

test('trapped_chest_at scans each direct inventory owner only', () => {
    const x = 7;
    const y = 4;
    const trapped = () => ({
        otyp: CHEST,
        otrapped: true,
        nobj: null,
    });
    const makeState = () => {
        const level = new GameMap();
        level.at(x, y).disp_glyph = {
            glyph: trap_to_glyph({ ttyp: TRAPPED_CHEST }),
        };
        return {
            invent: null,
            u: { ux: x, uy: y, usteed: null },
            level,
        };
    };

    const heroState = makeState();
    heroState.invent = trapped();
    assert.equal(trapped_chest_at(TRAPPED_CHEST, x, y, heroState), true);

    const steedState = makeState();
    steedState.u.usteed = { minvent: trapped() };
    assert.equal(trapped_chest_at(TRAPPED_CHEST, x, y, steedState), true);

    const monsterState = makeState();
    const monster = {
        mx: x,
        my: y,
        minvent: trapped(),
        nmon: null,
    };
    monsterState.level.monlist = monster;
    monsterState.level.monsters[x][y] = monster;
    assert.equal(trapped_chest_at(
        TRAPPED_CHEST, x, y, monsterState,
    ), true);

    const untrappedState = makeState();
    untrappedState.invent = { ...trapped(), otrapped: false };
    assert.equal(trapped_chest_at(
        TRAPPED_CHEST, x, y, untrappedState,
    ), false);

    const nestedState = makeState();
    nestedState.invent = {
        otyp: POT_WATER,
        nobj: null,
        cobj: trapped(),
    };
    assert.equal(trapped_chest_at(
        TRAPPED_CHEST, x, y, nestedState,
    ), false);
});

test('trap glyph recognition covers exactly the source trap range', () => {
    for (let ttyp = ARROW_TRAP; ttyp < TRAPNUM; ++ttyp) {
        // ARROW_TRAP through TRAPNUM - 1 is display.h's MAXTCHARS-wide
        // glyph range; the inverse must recover every endpoint and interior.
        const glyph = trap_to_glyph({ ttyp });
        assert.equal(glyph_is_trap(glyph), true);
        assert.equal(glyph_to_trap(glyph), ttyp);
    }
    const first = trap_to_glyph({ ttyp: ARROW_TRAP });
    const last = trap_to_glyph({ ttyp: TRAPNUM - 1 });
    assert.equal(glyph_is_trap(first - 1), false);
    assert.equal(glyph_to_trap(last + 1), NO_GLYPH);
});

test('trap descriptions preserve synthetic trapped chest and door names', () => {
    // An interior coordinate keeps all three descriptions on an ordinary
    // playable square; only its attached glyph, door, and chest vary.
    const x = 7;
    const y = 4;
    const chest = { otyp: CHEST, otrapped: false, nexthere: null };
    const level = new GameMap();
    level.objects[x][y] = chest;
    const location = level.at(x, y);
    location.typ = DOOR;
    location.flags = D_TRAPPED;
    const state = {
        u: { ux: 1, uy: 1 },
        // D_TRAPPED is the remembered-door mask whose synthetic glyph
        // pager.c refines to "trapped door".
        level,
    };
    location.disp_glyph = {
        glyph: trap_to_glyph({ ttyp: TRAPPED_CHEST }, state),
    };
    assert.equal(
        trap_description(TRAPPED_CHEST, x, y, state), 'trapped chest',
    );
    location.disp_glyph.glyph = trap_to_glyph(
        { ttyp: TRAPPED_DOOR }, state,
    );
    assert.equal(
        trap_description(TRAPPED_DOOR, x, y, state), 'trapped door',
    );
    location.disp_glyph.glyph = trap_to_glyph({ ttyp: ARROW_TRAP }, state);
    assert.equal(
        trap_description(ARROW_TRAP, x, y, state), 'arrow trap',
    );
});

test('quoted engraving text distinguishes memory, unread text, and graves',
    () => {
        // An interior coordinate gives engr_at() one unambiguous list match.
        const x = 8;
        const y = 5;
        const engraving = {
            engr_x: x,
            engr_y: y,
            engr_txt: ['current', 'remembered', 'pristine'],
            eread: true,
            nxt_engr: null,
        };
        const state = { head_engr: engraving };
        assert.equal(
            add_quoted_engraving(x, y, ' (engraving', true, state),
            ' (engraving with remembered text: "remembered"',
        );
        assert.equal(
            add_quoted_engraving(x, y, ' (grave', true, state),
            ' (grave with headstone reading: "remembered"',
        );
        engraving.eread = false;
        assert.equal(
            add_quoted_engraving(x, y, ' (engraving', true, state),
            " (engraving that you haven't read",
        );
        assert.equal(
            add_quoted_engraving(x, y, ' (grave', true, state),
            " (grave whose headstone you haven't read",
        );
    });

test('trap lists keep visible and obscured traps in map order', async () => {
    const segment = loadWhatisTrapEngravingListRecipe().segments[1];
    await runSegment({ ...segment, moves: ' ' });
    const y = game.u.uy;
    const visibleX = game.u.ux + 1;
    const obscuredX = game.u.ux + 2;
    const visible = {
        tx: visibleX, ty: y, ttyp: ARROW_TRAP, tseen: true,
    };
    const obscured = {
        tx: obscuredX, ty: y, ttyp: BEAR_TRAP, tseen: true,
    };
    game.level.traps = [visible, obscured];

    const installGlyph = (x, glyph) => {
        const presentation = map_glyphinfo(glyph, game);
        const location = game.level.at(x, y);
        location.disp_glyph = { ...presentation, glyph };
        location.disp_ch = presentation.ch;
        location.disp_decgfx = presentation.dec;
        location.disp_browser_ch = presentation.displayCh;
    };
    installGlyph(visibleX, trap_to_glyph(visible, game));
    installGlyph(obscuredX, cmap_to_glyph(S_room, game));

    let rows;
    game._preNhgetchHook = () => {
        rows = game.nhDisplay.grid.map(
            (row) => row.map(({ ch }) => ch).join('').trimEnd(),
        );
    };
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await look_traps(true, game);

    assert.deepEqual(rows.slice(0, 5), [
        'Nearby seen or remembered traps:',
        '',
        `${`<${visibleX},${y}>`.padStart(8)}  ^  arrow trap`,
        `${`<${obscuredX},${y}>`.padStart(8)}  ^  bear trap, obscured by ·`,
        '',
    ]);
});

test('engraving lists use remembered grave terrain for obscured headstones',
    async () => {
        const segment = loadWhatisTrapEngravingListRecipe().segments[1];
        await runSegment({ ...segment, moves: ' ' });
        const x = game.u.ux + 1;
        const y = game.u.uy;
        const location = game.level.at(x, y);
        const floor = map_glyphinfo(cmap_to_glyph(S_room, game), game);
        location.disp_glyph = {
            ...floor, glyph: cmap_to_glyph(S_room, game),
        };
        location.disp_ch = floor.ch;
        location.disp_decgfx = floor.dec;
        location.disp_browser_ch = floor.displayCh;
        // SVALL is 0xFF: C admits an engraving after any nonzero seenv bit;
        // the full mask avoids making this test about one viewing direction.
        location.seenv = 0xFF;
        game.level.lastseentyp[x][y] = GRAVE;
        game.head_engr = {
            engr_x: x,
            engr_y: y,
            // These three entries model current, remembered, and pristine
            // text; look_engrs() must choose the remembered middle entry.
            engr_txt: ['weathered', 'Rest in peace', 'Rest in peace'],
            engr_type: HEADSTONE,
            eread: true,
            nxt_engr: null,
        };

        let rows;
        game._preNhgetchHook = () => {
            rows = game.nhDisplay.grid.map(
                (row) => row.map(({ ch }) => ch).join('').trimEnd(),
            );
        };
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        await look_engrs(true, game);

        assert.deepEqual(rows.slice(0, 4), [
            'Nearby seen or remembered engravings:',
            '',
            `${`<${x},${y}>`.padStart(8)}  |  headstone reading: "Rest in peace", obscured by ·`,
            '',
        ]);
    });

test('monster and object lists preserve map order and text-window cells',
    () => withSerializedGrids(async () => {
        const [segment] = loadWhatisMonsterObjectListRecipe().segments;
        assert.equal(segment.moves, MONSTER_OBJECT_LIST_MOVES);
        const replay = await runSegment(segment);

        // Fresh C seed 42057 records fifteen boundaries and 2,379 startup
        // draws through the dot command after all four list dismissals.
        assert.equal(replay.getScreens().length, 15);
        assert.equal(replay.getCursors().length, 15);
        assert.equal(replay.getRngLog().length, 2379);
        assert.equal(game.moves, 2);

        const grids = replay.getScreens().map((screen) => JSON.parse(screen));
        const rows = (index) => grids[index].map(
            (row) => row.map(({ ch }) => ch).join('').trimEnd(),
        );
        assert.deepEqual(rows(3).slice(0, 6), [
            'Monsters currently shown near <38,13>:',
            '',
            ' <36,12>  d  jackal',
            ' <38,13>  @  human wizard called Euclid',
            ' <39,13>  f  tame kitten',
            '',
        ]);
        assert.deepEqual(rows(6).slice(0, 6), [
            'All monsters currently shown on the map:',
            '',
            ' <36,12>  d  jackal',
            ' <38,13>  @  human wizard called Euclid',
            ' <39,13>  f  tame kitten',
            '',
        ]);
        assert.deepEqual(rows(9).slice(0, 4), [
            'Objects currently shown near <38,13>:',
            '',
            ' <39,12>  (  a chest',
            '',
        ]);
        assert.deepEqual(rows(12).slice(0, 4), [
            'All objects currently shown on the map:',
            '',
            ' <39,12>  (  a chest',
            '',
        ]);
        // Each mixed-glyph list line places its glyph in physical column 10.
        assert.deepEqual(
            [grids[3][2][10].ch, grids[3][3][10].ch,
                grids[3][4][10].ch, grids[9][2][10].ch],
            ['d', '@', 'f', '('],
        );
    }));

test('monster and object lists report an empty shown-object set',
    () => withSerializedGrids(async () => {
        const [, segment] = loadWhatisMonsterObjectListRecipe().segments;
        const replay = await runSegment(segment);

        // Fresh C seed 42056 records the same fifteen boundaries, no objects,
        // and 2,725 startup draws through the next command boundary.
        assert.equal(replay.getScreens().length, 15);
        assert.equal(replay.getCursors().length, 15);
        assert.equal(replay.getRngLog().length, 2725);
        assert.equal(game.moves, 2);
        const topRow = (index) => JSON.parse(replay.getScreens()[index])[0]
            .map(({ ch }) => ch).join('').trimEnd();
        assert.equal(topRow(9), 'No objects are currently shown nearby.');
        assert.equal(topRow(12), 'No objects are currently shown on the map.');
    }));

test('trap and engraving list choices return through the next boundary',
    () => withSerializedGrids(async () => {
        const [engraved, empty] = loadWhatisTrapEngravingListRecipe().segments;
        assert.equal(engraved.moves, TRAP_ENGRAVING_LIST_MOVES);
        assert.equal(empty.moves, EMPTY_TRAP_LIST_MOVES);
        const expected = [
            // Fresh C seed 42058 includes one read obscured engraving and one
            // unread visible engraving through all four list dismissals.
            { screens: 29, rng: 2295 },
            // Fresh C seed 42059 reaches both empty-trap messages.
            { screens: 9, rng: 3022 },
        ];
        for (let index = 0; index < 2; ++index) {
            let boundary;
            const replay = await runSegment([engraved, empty][index], {
                onBoundary: (error) => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            assert.equal(replay.getScreens().length, expected[index].screens);
            assert.equal(replay.getCursors().length, expected[index].screens);
            assert.equal(replay.getRngLog().length, expected[index].rng);
            assert.equal(game.context.pendingCommand, undefined);
            if (index === 0) {
                const rows = JSON.parse(replay.getScreens()[23]).map(
                    (row) => row.map(({ ch }) => ch).join('').trimEnd(),
                );
                assert.deepEqual(rows.slice(0, 5), [
                    'Nearby seen or remembered engravings:',
                    '',
                    '  <58,2>  `  remembered text: "Elbereth", obscured by @',
                    "  <66,3>  `  engraving that you haven't read",
                    '',
                ]);
            } else {
                const topRows = [3, 6].map((screen) => (
                    JSON.parse(replay.getScreens()[screen])[0]
                        .map(({ ch }) => ch).join('').trimEnd()
                ));
                assert.deepEqual(topRows, [
                    'No traps seen or remembered nearby.',
                    'No traps seen or remembered.',
                ]);
            }
        }
    }));
