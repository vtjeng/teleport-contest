import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import * as pager from '../js/pager.js';
import {
    extendedCommandListLines,
    key2extcmddesc,
    keyBindingLines,
} from '../js/cmd.js';
import { CMDQ_EXTCMD, CMDQ_KEY, CQ_REPEAT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    next_opt,
    optionHelpLines,
    show_menu_controls,
} from '../js/options.js';
import { RECORDER_CONFIGFILE } from '../js/cfgfiles.js';
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
    HELP_CONTACT_MOVES,
    loadHelpContactRecipe,
} from './run-help-contact.mjs';
import {
    HELP_EXTENDED_COMMANDS_MOVES,
    loadHelpExtendedCommandsRecipe,
} from './run-help-extended-commands.mjs';
import {
    HELP_STATIC_CASES,
    loadHelpStaticRecipe,
} from './run-help-static-files.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

// These digests pin the complete serialized TTY cells (including attributes)
// and cursor triples from the fresh C-matched help recordings. Count-only
// assertions would not notice a changed row, --More-- cursor, or map repair.
const HELP_REPLAY_DIGESTS = new Map(Object.entries({
    option: ['1e1675121c9640cb7060c8793628aca747625fb07a97e13e129b595911db1ed0', '8aba73df59ed89da83cd843fda37eceddbb325e8e6e77fe9c9a837cfa74afc27'],
    extended: ['6c7d335c9c14d55e6fce889ef4b69b79f806da891054b5aafb7a298c131471e2', 'f2dd7afb6b140528e80002531f1c7a6a7c265da37c0713bb917978a7fbd81587'],
    controls: ['bcd7512fae63c8a3bf2cec7675982ed9874679b9a5690ed8008f651cc8ed7b68', '352687a17dba550e986b4ce382f7f3e902a4283e96c078d7e4c1c393a431a104'],
    contact: ['d2485ad1b76ad015f55e24eae39c19b40c42d023258db28f833a33898caa8747', 'ea518409b9490ca1b0f02dd5eb253714c9bc4f3f00dce35756be29e6b9f6d670'],
    keys: ['f91592d4ebbdde75e9fbe68766542e25c980c07080083dcc45a4b2fa902a2a41', '7a44e5e23d43717a1cc05c7f3a96d6bcd553f20987bb1013d58ff103b73ea967'],
    shell: ['92442c67684282ee9bf28823ca3981ae4ad52763ca8be66533f8399ffd3a4b89', 'f6f03651a90293a4a244eb3d5a219e3aa6d9c40d0896423c6eaa04bc2d01caa5'],
    whatdoes: ['7cf0436f9b22df5247246625dfc2d192d6e700d2d7bd1bff05fb1d7198ec81fd', 'ef740e0cf4a1b1f0cd598ce479e9b2a7daa55c7c4db4a0dd252df0ca761c60c7'],
    version: ['81355b14b16f5ba33dcdb16d4c01d9afd55207ee629c794385aec7386e9045c2', '7eea516c376ea5502e88230792f2d93479609b80e6c6cc6584b438d3a77192c2'],
    'static:help': ['f09497b040bc3e7ba3b392e5f1b023a9af617cfb87ae3b531d6a1f2b5e88f50f', '6e4d58a12c2736c31e567ea6967c179702d6276cd046e880a3ac3bce5b85c6be'],
    'static:hh': ['e1578b2fd66c5487957d266edcdcd71aa7f7c85ac7695f17e73b09434e1e710c', '328ad57a88ca664a4deca5186b89afb527b8f3aaef1fd067792502399e40be31'],
    'static:history': ['6f20e67d47aa41a9b20b21a11fceeed685279c859617c31d0e8c7e3c10b2cea3', 'efe43c525e0ac0b65672e1c6d434b796088a9aa447b89f81a82e28292e160795'],
    'static:opthelp': ['ccc3e15c48269730d132d2fff3c2eb0099000ec0842667656056440c6b5b91d5', '9224ec1fcec74bd79ec6eb338672ee05aee8dffa4cbd6d53cb277d3a4834adfe'],
    'static:optmenu': ['26d61179fe2a600f277ab8efdd5218ad8f5011dbf702a2c6cd8006fd4cbae059', '42d2625acd1b2622150908b37c9add272e3f33d40607c0329ab355e2483d3fbe'],
    'static:usagehlp': ['3b21c1d18f082c88fe4b4176f17b951430bbc0613a79e7c5e6f17437136c8737', '0c9f4a95a69b636f639064df38df7ec81bbe1fe7600d26580a951d44ea050502'],
    'static:license': ['149098fc0902f74f7405f73de988ceb30904e58660bec00056b2ee7d27791b4c', '9a1e84f62773406e0a40d9d19add384ffc52e5b0a042ea80796556a16b8ab102'],
}));

function digest(values) {
    return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function assertHelpReplay(replay, name) {
    const expected = HELP_REPLAY_DIGESTS.get(name);
    assert.ok(expected, `missing help replay evidence for ${name}`);
    assert.equal(digest(replay.getScreens()), expected[0], `${name} screens`);
    assert.equal(digest(replay.getCursors()), expected[1], `${name} cursors`);
}

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

test('contact help preserves the recorder contact lines', () => {
    // The recorder's sysconf has no SUPPORT value, but cfgfiles.c formats its
    // default WIZARDS list for pager.c docontact(). Each empty line separates
    // the local-support and development-team paragraphs.
    assert.deepEqual(pager.contactLines({
        sysopt: { fmtd_wizard_list: 'root or games' },
    }), [
        'To contact local support, contact root or games.',
        '',
        'To contact the NetHack development team directly,',
        "see the 'Contact' form on our website or email <devteam@nethack.org>.",
        '',
        'For more information on NetHack, or to report a bug,',
        'visit our website "https://www.nethack.org/".',
    ]);
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
            `Set options as OPTIONS=<options> in ${RECORDER_CONFIGFILE}`,
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

test('a fresh valid config startup initializes the recorder path before help',
    async () => {
        // This independently chosen valid configuration exercises the live
        // startup path and option-help reader without copying seed2200's
        // invalid-option input or its recorded screen data.
        const segment = {
            ...loadHelpOptionRecipe().segments[0],
            seed: 20260918,
            nethackrc: 'OPTIONS=name:A48Fresh,role:Wizard,race:human\n',
            moves: '',
        };
        await runSegment(segment);
        assert.equal(game.configfile, RECORDER_CONFIGFILE);
        assert.equal(
            optionHelpLines(game)[3].text,
            `Set options as OPTIONS=<options> in ${RECORDER_CONFIGFILE}`,
        );
    });

test('option help prints the configuration path stored by cfgfiles.c', () => {
    // cfgfiles.c fopen_config_file() passes the path it opened to
    // set_configfile_name(), and options.c option_help() prints the exact
    // get_configfile() result. A replay segment supplies configuration text
    // without that machine-local path, but callers which do define it must
    // retain the source behavior.
    const [,,, configLine] = optionHelpLines({
        configfile: '/configured-user/.nethackrc',
    });
    assert.equal(
        configLine.text,
        'Set options as OPTIONS=<options> in /configured-user/.nethackrc',
    );
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
        assertHelpReplay(replay, 'option');
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
        const repeatQueue = game.command_queue[CQ_REPEAT];
        // cmd.c rhack() puts dohelp() at the head after # has cleared the
        // repeat queue; yn_function() appends its unrestricted answer after
        // that command.
        assert.equal(repeatQueue[0]?.typ, CMDQ_EXTCMD);
        assert.equal(repeatQueue[0]?.ec_entry?.ef_funct, 'dohelp');
        const answer = repeatQueue[1];
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
        assertHelpReplay(replay, 'extended');
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
        assertHelpReplay(replay, 'controls');
    }));

test('contact help returns through the next command boundary',
    () => withSerializedGrids(async () => {
        const segment = loadHelpContactRecipe().segments[0];
        assert.equal(segment.moves, HELP_CONTACT_MOVES);

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
        // The fresh C case records startup, the help menu, one contact page,
        // the repaired map, and the final wait through five boundaries.
        assert.equal(replay.getScreens().length, 5);
        assert.equal(replay.getCursors().length, 5);
        assertHelpReplay(replay, 'contact');
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
        assertHelpReplay(replay, 'keys');
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
        assertHelpReplay(replay, 'shell');
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
        assertHelpReplay(replay, 'whatdoes');
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
            assertHelpReplay(replay, `static:${entry.filename}`);
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
        assertHelpReplay(replay, 'version');

        const rngAfterFirstDisplay = replay.getRngLog().length;
        const screensBeforeSecondDisplay = replay.getScreens().length;
        const cursorsBeforeSecondDisplay = replay.getCursors().length;
        game.nhDisplay.pushKey('a'.charCodeAt(0));
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        await pager.dohelp(game);
        // version.c caches gl.lua_ver within one process, so the second
        // display renders normally without another nhl_init() shuffle.
        assert.equal(replay.getRngLog().length, rngAfterFirstDisplay);
        assert.equal(replay.getScreens().length, screensBeforeSecondDisplay + 3);
        assert.equal(replay.getCursors().length, cursorsBeforeSecondDisplay + 3);
        assert.equal(
            digest(replay.getScreens().slice(screensBeforeSecondDisplay)),
            '59d7917739c20eb23537db101f4cf5600abf6627a83718e0dfb2311e8b8c3ceb',
        );
        assert.equal(
            digest(replay.getCursors().slice(cursorsBeforeSecondDisplay)),
            '2dccb1ea31568a5504146686a74d83d5b7aae0081e5be1b840d6121878d914c2',
        );
        assert.equal(game.nhDisplay.inputQueueLength, 0);
    }));

test('cmd.c doextlist includes wizard sections, autocomplete filtering and searches', async () => {
    const segment = loadHelpExtendedCommandsRecipe().segments[0];
    await runSegment({ ...segment, moves: ' ' });
    const wizard = { ...game, wizard: true };
    const all = extendedCommandListLines(wizard).map(row => row.text);
    assert(all.includes('z - Switch to showing all alphabetically, including debugging commands'));
    assert(all.includes('Debugging Extended Commands'));
    assert(all.some(line => line.includes('wizkill')));
    const merged = extendedCommandListLines(wizard, { onelist: 1 }).map(row => row.text);
    assert(!merged.includes('Debugging Extended Commands'));
    assert(merged.includes('z - Switch to showing debugging commands in separate section'));
    const searched = extendedCommandListLines(wizard, { searchbuf: 'WIZK?LL' }).map(row => row.text);
    assert(searched.some(line => line.includes('wizkill')));
    assert(!searched.some(line => line.includes('wizwish')));
    assert(searched.includes('s - Switch back from search ("WIZK?LL")'));
    const missed = extendedCommandListLines(wizard, { searchbuf: 'no such command ever' }).map(row => row.text);
    assert(missed.includes('no matches'));
    assert(!missed.includes('[A] Command autocompletes'));
    const filtered = extendedCommandListLines(wizard, { menumode: 1 }).map(row => row.text);
    assert(filtered.includes("a - Switch to including commands that don't autocomplete"));
    assert(filtered.length < all.length);
});

// These results follow cmd.c's source gates rather than a second model of
// the list: mutable flags, ordinary/discover descriptions and accumulated n.
import { extcmdlist, AUTOCOMPLETE, CMD_M_PREFIX, CMD_NOT_AVAILABLE, INTERNALCMD } from '../js/extcmdlist_data.js';
import { readFileSync } from 'node:fs';
test('the whole extended list retains source flag formatting and pass separators', async () => {
    const c = readFileSync('nethack-c/upstream/src/cmd.c', 'utf8');
    assert(c.includes('for (pass = 0; pass <= 1; ++pass)'));
    assert(c.includes('if (n)\n                add_menu_str(menuwin, "");'));
    const segment = loadHelpExtendedCommandsRecipe().segments[0];
    await runSegment({ ...segment, moves: ' ' });
    const state = { ...game, wizard: true, extcmdFlags: extcmdlist.map(row => row.flags) };
    const index = extcmdlist.findIndex(row => row.ef_txt === 'genocided');
    for (const [flags, text] of [[0, ''], [AUTOCOMPLETE, '[A]'], [CMD_M_PREFIX, '[m]'], [AUTOCOMPLETE | CMD_M_PREFIX, '[mA]']]) {
        state.extcmdFlags[index] = flags;
        const lines = extendedCommandListLines(state, { searchbuf: 'genocided' }).map(row => row.text);
        assert(lines.includes(` genocided      ${text.padStart(4)} ${extcmdlist[index].ef_desc}`));
        assert.deepEqual(lines.slice(-4), ['', '', '[A] Command autocompletes', "[m] Command accepts 'm' prefix"]);
    }
    for (const flags of [CMD_NOT_AVAILABLE, INTERNALCMD]) {
        state.extcmdFlags[index] = flags;
        assert(!extendedCommandListLines(state).some(row => row.text.includes(' genocided ')));
    }
    const ordinary = extendedCommandListLines({ ...game, wizard: false, discover: false });
    const discovery = extendedCommandListLines({ ...game, wizard: false, discover: true });
    assert(!ordinary.some(row => row.text.includes('become extinct')));
    assert(discovery.some(row => row.text.includes('become extinct')));
    const long = extendedCommandListLines(state, { searchbuf: '*'.repeat(200) }).map(row => row.text);
    assert(long.includes('s - Switch back from search')); // QBUFSZ guard omits the long phrase
    const multibyte = extendedCommandListLines(state, { searchbuf: 'é'.repeat(60) }).map(row => row.text);
    assert(multibyte.includes('s - Switch back from search')); // C strlen counts 120 UTF-8 bytes
});
