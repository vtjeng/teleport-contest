import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { helpMenuItems, setopt_cmd } from '../js/pager.js';
import {
    HELP_MENU_WHATIS_MOVES,
    loadHelpMenuShellRecipe,
} from './run-help-menu-shell.mjs';
import {
    HELP_VERSION_MOVES,
    loadHelpVersionRecipe,
} from './run-help-version-information.mjs';
import {
    HELP_STATIC_CASES,
    loadHelpStaticRecipe,
} from './run-help-static-files.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

test('the default help menu preserves pager.c rows and source selectors', () => {
    assert.equal(setopt_cmd(), "'#optionsfull' or 'm O'");
    assert.deepEqual(
        helpMenuItems().map(({ value, selector, label }) => ({
            value, selector, label,
        })),
        [
            { value: 1, selector: 'a', label: 'About NetHack (version information).' },
            { value: 2, selector: 'b', label: 'Long description of the game and commands.' },
            { value: 3, selector: 'c', label: 'List of game commands.' },
            { value: 4, selector: 'd', label: 'Concise history of NetHack.' },
            { value: 5, selector: 'e', label: 'Info on a character in the game display.' },
            { value: 6, selector: 'f', label: 'Info on what a given key does.' },
            { value: 7, selector: 'g', label: 'List of game options.' },
            { value: 8, selector: 'h', label: 'Longer explanation of game options.' },
            { value: 9, selector: 'i', label: "Using the '#optionsfull' or 'm O' command to set options." },
            { value: 10, selector: 'j', label: 'Full list of keyboard commands.' },
            { value: 11, selector: 'k', label: 'List of extended commands.' },
            { value: 12, selector: 'l', label: 'List menu control keys.' },
            { value: 13, selector: 'm', label: "Description of NetHack's command line." },
            { value: 14, selector: 'n', label: 'The NetHack license.' },
            { value: 15, selector: 'o', label: 'Support information.' },
        ],
    );
});

test('the help whatis target returns through the next command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpMenuShellRecipe().segments[0];
        assert.equal(segment.moves, HELP_MENU_WHATIS_MOVES);

        const baseline = await runSegment({ ...segment, moves: '.' });
        const baselineMoves = game.moves;
        const baselineRng = baseline.getRngLog().length;

        let boundary;
        const replay = await runSegment(segment, {
            onBoundary: (error) => { boundary = error; },
        });
        assert.equal(boundary, undefined);
        assert.equal(game.context.pendingCommand, undefined);
        assert.equal(game.moves, baselineMoves);
        assert.equal(replay.getRngLog().length, baselineRng);
        // Fresh C seed 73519 records the help menu, nested whatis menu, both
        // repaired map screens, and the final wait through five boundaries.
        assert.equal(replay.getScreens().length, 5);
        assert.equal(replay.getCursors().length, 5);
    }));

test('an unported dynamic help target stops after its menu selection', async () => {
    const segment = loadHelpMenuShellRecipe().segments[0];
    let boundary;
    const replay = await runSegment({
        ...segment,
        // `f` selects source table index 5, the later what-does target.
        moves: '?f',
    }, {
        onBoundary: (error) => { boundary = error; },
    });

    assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
    assert.match(boundary.message, /unsupported help: menu target 6/u);
    // The start screen and complete help menu remain available to scoring.
    assert.equal(replay.getScreens().length, 2);
    assert.equal(game.context.pendingCommand?.key, '?'.charCodeAt(0));
});

test('all static help files return through the restored command boundary',
    () => withSerializedGrids(async () => {
        for (const entry of HELP_STATIC_CASES) {
            const segment = loadHelpStaticRecipe(entry).segments[0];
            assert.equal(segment.moves, entry.moves);

            let boundary;
            const replay = await runSegment(segment, {
                onBoundary: (error) => { boundary = error; },
            });
            assert.equal(boundary, undefined, entry.filename);
            assert.equal(game.context.pendingCommand, undefined, entry.filename);
            // A new game starts at move 1. C's dohelp() and display_file()
            // return ECMD_OK without advancing it.
            assert.equal(game.moves, 1, entry.filename);
            // Startup, the help menu, every 23-line text page, and the repaired
            // map each produce one captured screen and cursor position.
            const expectedBoundaries = entry.dismissals + 3;
            assert.equal(
                replay.getScreens().length,
                expectedBoundaries,
                entry.filename,
            );
            assert.equal(
                replay.getCursors().length,
                expectedBoundaries,
                entry.filename,
            );
        }
    }));

test('help version information returns through the next command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpVersionRecipe().segments[0];
        assert.equal(segment.moves, HELP_VERSION_MOVES);

        const baseline = await runSegment({ ...segment, moves: '' });
        const baselineMoves = game.moves;
        const baselineRng = baseline.getRngLog().length;

        let boundary;
        const replay = await runSegment(segment, {
            onBoundary: (error) => { boundary = error; },
        });
        assert.equal(boundary, undefined);
        assert.equal(game.context.pendingCommand, undefined);
        assert.equal(game.moves, baselineMoves);
        // nhlua.c nhl_init() loads nhlib.lua, whose three-entry alignment
        // shuffle adds the only two draws made by this command.
        assert.equal(replay.getRngLog().length, baselineRng + 2);
        // Fresh C seed 918273 records startup, the menu, two text pages, and
        // the repaired map screen through five observable boundaries.
        assert.equal(replay.getScreens().length, 5);
        assert.equal(replay.getCursors().length, 5);
    }));
