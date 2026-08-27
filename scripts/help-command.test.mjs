import assert from 'node:assert/strict';
import test from 'node:test';

import {
    cmdq_peek,
    extendedCommandListLines,
    key2extcmddesc,
    keyBindingLines,
} from '../js/cmd.js';
import { CMDQ_KEY, CQ_REPEAT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { next_opt, optionHelpLines, show_menu_controls } from '../js/options.js';
import {
    dowhatdoes_core,
    helpMenuItems,
    setopt_cmd,
} from '../js/pager.js';
import {
    HELP_MENU_WHATIS_MOVES,
    loadHelpMenuShellRecipe,
} from './run-help-menu-shell.mjs';
import {
    HELP_WHATDOES_MOVES,
    loadHelpWhatdoesRecipe,
} from './run-help-dowhatdoes.mjs';
import {
    HELP_VERSION_MOVES,
    loadHelpVersionRecipe,
} from './run-help-version-information.mjs';
import {
    HELP_OPTION_MOVES,
    loadHelpOptionRecipe,
} from './run-help-option-help.mjs';
import {
    HELP_KEY_BINDINGS_MOVES,
    loadHelpKeyBindingsRecipe,
} from './run-help-key-bindings.mjs';
import {
    HELP_MENU_CONTROLS_MOVES,
    loadHelpMenuControlsRecipe,
} from './run-help-menu-controls.mjs';
import {
    HELP_EXTENDED_COMMANDS_MOVES,
    loadHelpExtendedCommandsRecipe,
} from './run-help-extended-commands.mjs';
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

test('option help wraps Boolean names at the source column limit', () => {
    assert.deepEqual(
        next_opt([
            // These lengths put the comma-separated buffer exactly at and
            // then beyond options.c's COLNO - 2 (78-column) threshold.
            'a'.repeat(36),
            'b'.repeat(38),
            'c',
        ]),
        [
            `${'a'.repeat(36)}, ${'b'.repeat(38)}, `,
            'c.',
            '',
        ],
    );
});

test('option help derives its ordinary TTY page from allopt source order',
    async () => {
        const segment = loadHelpOptionRecipe().segments[0];
        await runSegment({ ...segment, moves: '' });
        const lines = optionHelpLines(game).map(({ text }) => text);

        // options.c opt_intro[] places the title at index 1 and reserves
        // CONFIG_SLOT 3 for the get_configfile()-dependent sentence.
        assert.equal(lines[1], '                 NetHack Options Help:');
        assert.equal(
            lines[3],
            'Set options as OPTIONS=<options> in .nethackrc',
        );
        // TTY advertises color but not popup dialogs, so the source-order
        // filters retain the former Boolean and omit the latter.
        assert(lines.some((line) => line.includes('color')));
        assert(!lines.some((line) => line.includes('popup_dialog')));
        // Normal play omits the source's set_wizonly and set_wiznofuz rows.
        assert(!lines.some((line) => line.includes('travel_debug')));
        // option_help() prints these two source literals around its type loops.
        assert(lines.includes('Compound options:'));
        assert(lines.includes('Other settings:'));
        // The final opt_epilog[] entry is the Guidebook reference.
        assert.equal(lines.at(-1), 'See NetHack\'s "Guidebook" for details.');
    });

test('option help returns through the restored command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpOptionRecipe().segments[0];
        assert.equal(segment.moves, HELP_OPTION_MOVES);

        // Cancelling the help menu executes the same first command loop, whose
        // preamble draws rnd(9000) and rnd(30), without spending a turn.
        const baseline = await runSegment({ ...segment, moves: '?\x1b' });
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
        // The fresh C case records startup, the help menu, five text pages,
        // and the restored map through eight observable boundaries.
        assert.equal(replay.getScreens().length, 8);
        assert.equal(replay.getCursors().length, 8);
    }));

test('whatdoes formats the ordinary inventory binding from extcmdlist',
    async () => {
        const segment = loadHelpMenuShellRecipe().segments[0];
        await runSegment({ ...segment, moves: '' });

        // cmd.c extcmdlist[] binds byte 0x69 ('i') to the inventory row.
        const inventoryKey = 0x69;
        assert.equal(
            key2extcmddesc(inventoryKey, game),
            'show your inventory (#inventory)',
        );
        // pager.c uses a minimum width of eight for the key, then adds the
        // sentence-ending period after the command description.
        assert.equal(
            dowhatdoes_core(inventoryKey, game),
            'i       show your inventory (#inventory).',
        );
    });

test('whatdoes records its unrestricted prompt answer for command repeat',
    async () => {
        const segment = loadHelpWhatdoesRecipe().segments[0];
        // Removing the final wait leaves the repeat queue as dowhatdoes()
        // wrote it, before a later command can replace the repeat sequence.
        await runSegment({
            ...segment,
            moves: HELP_WHATDOES_MOVES.slice(0, -1),
        });
        const answer = cmdq_peek(CQ_REPEAT, game);
        assert.equal(answer?.typ, CMDQ_KEY);
        // cmd.c yn_function() records the byte that answered `What command?`.
        assert.equal(answer?.key, 0x69);
    });

test('the default key list preserves source sections and fixed-width rows',
    async () => {
        const segment = loadHelpKeyBindingsRecipe().segments[0];
        await runSegment({ ...segment, moves: ' ' });
        const lines = keyBindingLines(game).map(({ text }) => text);

        // dokeylist() starts with one empty line. Its title combines the
        // seven-column source field, one separator, and four leading spaces.
        assert.deepEqual(lines.slice(0, 4), [
            '',
            '            Full Current Key Bindings List',
            '        (also commands with no key assignment)',
            '',
        ]);
        // The default non-debug list has 152 source-formatted rows, which the
        // 23-line TTY pager divides across seven pages.
        assert.equal(lines.length, 152);
        assert(lines.includes('Directional keys:'));
        assert(lines.includes('Menu control keys:'));
        assert(lines.includes('General commands:'));
        assert(lines.includes('Game commands:'));
        // Normal play excludes cmd.c's WIZMODECMD group even for the Wizard
        // role; state.wizard is the separate debug-play flag.
        assert(!lines.includes('Debug mode commands:'));
        // The source formats ordinary bindings in 7- and 13-character fields.
        assert(lines.includes('i       inventory     show your inventory'));
    });

test('standalone menu controls preserve the source columns and descriptions',
    () => {
        const lines = [];
        show_menu_controls(lines, false, {
            // The recorder has the default menu aliases, so each displayed
            // key is the command byte from default_menu_cmd_info[].
            iflags: { mapped_menu_op: '', mapped_menu_cmds: '' },
        });

        // options.c show_menu_controls() emits these 20 fixed-width rows when
        // the TTY backend does not advertise WC2_MENU_SHIFT.
        assert.deepEqual(lines.map(({ text }) => text), [
            'Menu control keys:',
            '',
            '           Whole  Current',
            '            Menu   Page',
            '  Select     .      ,',
            '  Invert     @      ~',
            'Deselect     -      \\',
            '',
            '   Go to     >      Next page',
            '             <      Previous page',
            '             ^      First page',
            '             |      Last page',
            '',
            '  Search     :      Exter a target string and invert all matching entries',
            '',
            '   Other   Return   Accept current choice(s) and dismiss menu',
            '           Enter    Same as Return',
            '           Space    If not on last page, advance one page;',
            '                    when on last page, treat like Return',
            '           Escape   Cancel menu without making any choice(s)',
        ]);
    });

test('the default extended-command list preserves source filtering and rows',
    async () => {
        const segment = loadHelpExtendedCommandsRecipe().segments[0];
        await runSegment({ ...segment, moves: ' ' });
        const lines = extendedCommandListLines(game).map(({ text }) => text);

        // cmd.c doextlist() contributes two controls, one ordinary heading,
        // 129 available non-debug rows, one separator, and two flag notes.
        assert.equal(lines.length, 138);
        assert.deepEqual(lines.slice(0, 6), [
            'Extended Commands List',
            '',
            'a - Switch to excluding commands that don\'t autocomplete',
            ': - Search extended commands',
            '',
            'Extended commands',
        ]);
        assert(lines.includes(
            ' genocided      [mA] list monsters that have been genocided',
        ));
        assert(!lines.some((line) => line.includes('become extinct')));
        assert(!lines.some((line) => line.includes('wizrumorcheck')));
        assert.deepEqual(lines.slice(-3), [
            '',
            '[A] Command autocompletes',
            "[m] Command accepts 'm' prefix",
        ]);
    });

test('the extended-command help target returns through the next command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpExtendedCommandsRecipe().segments[0];
        assert.equal(segment.moves, HELP_EXTENDED_COMMANDS_MOVES);

        // The final wait spends one turn, so compare against that command
        // without the preceding help interaction.
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
        // Fresh C seed 481516 records startup, the help menu, six extended-
        // command pages, the repaired map, and the final wait.
        assert.equal(replay.getScreens().length, 11);
        assert.equal(replay.getCursors().length, 11);
    }));

test('the standalone menu-controls target returns through the next command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpMenuControlsRecipe().segments[0];
        assert.equal(segment.moves, HELP_MENU_CONTROLS_MOVES);

        // The final wait spends one turn, so compare against that command
        // without the preceding help interaction.
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
        // Fresh C seed 319427 records startup, the help menu, one text page,
        // the repaired map, and the final wait through five boundaries.
        assert.equal(replay.getScreens().length, 5);
        assert.equal(replay.getCursors().length, 5);
    }));

test('the help key-list target returns through the next command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpKeyBindingsRecipe().segments[0];
        assert.equal(segment.moves, HELP_KEY_BINDINGS_MOVES);

        const baseline = await runSegment({ ...segment, moves: ' .' });
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
        // Fresh C seed 736491 records startup, the help menu, seven text
        // pages, the repaired map, and the final wait through twelve screens.
        assert.equal(replay.getScreens().length, 12);
        assert.equal(replay.getCursors().length, 12);
    }));

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

test('the help whatdoes target returns through the next command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpWhatdoesRecipe().segments[0];
        assert.equal(segment.moves, HELP_WHATDOES_MOVES);

        // The final wait spends one turn, so compare against the same wait
        // without the preceding help interaction.
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
        // Fresh C seed 642871 records startup, the help menu, the first-use
        // explanation, the query, its result, and the restored map.
        assert.equal(replay.getScreens().length, 6);
        assert.equal(replay.getCursors().length, 6);
    }));

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
