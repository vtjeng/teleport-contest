import assert from 'node:assert/strict';
import test from 'node:test';

import { UnsupportedHeroCommandBoundaryError } from '../js/cmd.js';
import { TIP_GETPOS } from '../js/const.js';
import { GETPOS_TIP_LINES, handle_tip } from '../js/hack.js';
import { truncate_to_map } from '../js/getpos.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { cmap_to_glyph } from '../js/display.js';
import {
    do_screen_description,
    self_lookat,
    whatisMenuItems,
} from '../js/pager.js';
import {
    S_brupstair,
    S_corr,
    S_darkroom,
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

function terrainDescription(cmap) {
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
        ? { disp_glyph: { glyph: cmap_to_glyph(cmap, state) } }
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
                { x: game.gg.getposx, y: game.gg.getposy },
                { x: 0, y: 0 },
            );
        }
    });

test('unsupported whatis menu choices retain the drawn command prefix',
    async () => {
        const segment = loadWhatisMapHeroRecipe().segments[0];
        let boundary;
        const replay = await runSegment({
            ...segment,
            // `i` is the first deferred do_look() menu arm. The ordinary
            // welcome dismissal and `/` command reach it without spending a
            // turn or consuming randomness.
            moves: `${WHATIS_SETUP}/i`,
        }, { onBoundary: (error) => { boundary = error; } });

        assert.equal(
            boundary instanceof UnsupportedHeroCommandBoundaryError,
            true,
        );
        assert.equal(replay.getScreens().length > 1, true);
    });
