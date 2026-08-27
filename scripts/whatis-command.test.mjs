import assert from 'node:assert/strict';
import test from 'node:test';

import { D_BROKEN, D_TRAPPED, TIP_GETPOS } from '../js/const.js';
import { GETPOS_TIP_LINES, handle_tip } from '../js/hack.js';
import { getpos, truncate_to_map } from '../js/getpos.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { cmap_to_glyph, glyph_is_monster } from '../js/display.js';
import {
    GLYPH_DETECT_FEM_OFF,
    GLYPH_DETECT_MALE_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_PET_FEM_OFF,
    GLYPH_PET_MALE_OFF,
    GLYPH_RIDDEN_FEM_OFF,
    GLYPH_RIDDEN_MALE_OFF,
} from '../js/glyph_offsets.js';
import { NUMMONS } from '../js/monsters.js';
import {
    do_screen_description,
    look_region_nearby,
    self_lookat,
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
