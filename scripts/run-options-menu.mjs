#!/usr/bin/env node

// Record and replay the '#optionsfull' menu against the patched C reference.
// Every segment types 'm' then 'O', which options.c doset_simple() hands to
// doset(). The first three page through every one of its pages without
// committing a selection: the first uses stock options, so the cmdassist help
// block leads the menu and the compiled-in defaults fill its value column; the
// second turns cmdassist off, which drops that block and shifts every page
// boundary, and sets seven option values the menu then has to report back; the
// third rebinds keys, which is the only input that moves the "bind keys" count
// on the menu's last page.
//
// The fourth commits eight boolean picks and covers what happens afterwards:
// parseoptions() and optfn_boolean() applying each one, and
// reset_needed_visuals() repainting once the loop ends. The fifth commits the
// one compound pick whose handler this port runs.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed weekday morning outside any calendar event, so no extra startup
// message can shift the menu's first screen.
const DATETIME = '20281114073500';
// 'm' is #reqmenu and 'O' is #options; extcmdlist_data.js gives the latter
// CMD_M_PREFIX, so the prefixed form reaches doset() rather than the simple
// menu. Six spaces then walk pages 2 through 7. A seventh space would commit
// the (empty) selection, which is the next behavior slice.
const OPEN_FULL_OPTIONS_MENU = 'mO      ';
// The same menu, with picks taken on pages 2, 3 and 4 before the walk
// resumes. The eight reach five of optfn_boolean()'s do_set arms: autopickup,
// lootabc and quick_farsight fall to its default, lit_corridor shuts vision
// down and asks for a redraw, menucolors asks for a prompt style,
// price_quotes refreshes the inventory, and showexp and time share the arm
// that reassesses the status line.
//
// Of the eight spaces that follow, three finish the walk to page 7 and the
// fourth commits there; the last four dismiss --More-- prompts, three raised
// by the eight messages as they fill the top line and the fourth by
// reset_needed_visuals()'s repaint. The Escape is the key the recorder has to
// read at the command prompt for the repainted screen to be captured.
const COMMIT_BOOLEAN_PICKS = 'mO g ijpu afp' + '        ' + '\x1b';

// The fifth recipe drives the one compound option whose do_handler this port
// runs: 'pickup_types', page 6's 'n', whose handler_pickup_types() asks
// parseoptions() to re-enter optfn_pickup_types() and open
// windows.c choose_classes_menu().
//
// Each round opens the menu, toggles one page-2 boolean so the pick loop
// prints a message, walks on to page 6, picks 'pickup_types' and commits with
// Return. The space that follows dismisses the --More-- that
// tty_display_nhwindow()'s NHW_MENU arm raises when the class menu covers that
// unacknowledged message; the keys after it answer the class menu.
//
// The five rounds cover choose_classes_menu()'s outcomes in turn: two classes
// picked by accelerator and by class symbol; the "all classes" entry, which
// collapses a mixed selection to a blank list; a single class; Escape, which
// leaves the incoming list standing; and deselecting that survivor, whose
// empty commit clears the list. Rounds four and five also open the menu with a
// class already selected, which is what preselects an entry.
// Round two toggles 'autopickup' rather than 'autoquiver', so rounds one and
// two also cover the two arms of the menu's trailing 'autopickup' line, and
// its wider note line moves the whole window eight columns left.
const EDIT_PICKUP_TYPES = [
    ['h', 'c%\r'], ['g', 'A\r'], ['h', '=\r'], ['h', '\x1b'], ['h', '=\r'],
].map(([boolean, answer]) => `mO ${boolean}    n\r ${answer}`).join('')
    + '\x1b';


function nethackrc(extra) {
    return [
        'OPTIONS=name:Optster,role:Valkyrie,race:human,gender:female,'
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...extra,
        '',
    ].join('\n');
}

export function loadOptionsMenuRecipes() {
    const segments = [
        {
            seed: 4210041,
            datetime: DATETIME,
            nethackrc: nethackrc([]),
            // Space dismisses startup before the menu opens.
            moves: ' ' + OPEN_FULL_OPTIONS_MENU,
        },
        {
            seed: 4210041,
            datetime: DATETIME,
            // Every option here is one parseNethackrc() interprets, so the
            // menu reads a session value rather than a compiled-in default:
            // !cmdassist also removes doset()'s five-line help block.
            nethackrc: nethackrc([
                'OPTIONS=!cmdassist,msg_window:reversed,statuslines:3',
                'OPTIONS=versinfo:7,whatis_coord:map,runmode:walk',
                'OPTIONS=pile_limit:3,catname:Mittens,fruit:kiwi',
                'OPTIONS=hilite_pet,!color,sortloot:full',
            ]),
            moves: ' ' + OPEN_FULL_OPTIONS_MENU,
        },
        {
            seed: 4210041,
            datetime: DATETIME,
            // Four shapes of BINDINGS statement, none of them touching the
            // keys this recording types. cmd.c count_bind_keys() answers each
            // from gc.Cmd.cmdbinds, which holds one entry per key: '^X' ends
            // on #kick because cmdbind_add() overwrote the #jump entry rather
            // than adding a second, 'Z' ends on #apply because
            // parsebindings() applies a comma list right to left, 'q' takes
            // the CMD_PARAM row #toggle that bind_key() finds after splitting
            // the parameter off at '(', and 'v' loses its entry to
            // cmdbind_remove(). That leaves three moved commands for the
            // first loop and #version's orphaned 'v' for the second.
            nethackrc: nethackrc([
                'BINDINGS=^X:jump',
                'BINDINGS=^X:kick',
                'BINDINGS=Z:apply,Z:eat',
                'BINDINGS=q:toggle(showexp)',
                'BINDINGS=v:nothing',
            ]),
            moves: ' ' + OPEN_FULL_OPTIONS_MENU,
        },
        {
            seed: 4210041,
            datetime: DATETIME,
            // Stock options again, so the menu pages -- and with them the
            // selector each pick names -- are the first segment's.
            nethackrc: nethackrc([]),
            moves: ' ' + COMMIT_BOOLEAN_PICKS,
        },
        {
            seed: 4210041,
            datetime: DATETIME,
            // Stock options once more, for the same reason.
            nethackrc: nethackrc([]),
            moves: ' ' + EDIT_PICKUP_TYPES,
        },
    ];
    // record-session preserves the staged install between one recipe's
    // segments, and each of these leaves the recorder stopped inside a live
    // menu, so each gets its own recipe and fresh install.
    return segments.map((segment, index) => validateCleanRecipe({
        version: 5,
        segments: [segment],
    }, `options menu recipe ${index + 1}`));
}

// The eight booleans the committing recipe picks, in the order doset() walks
// them, each paired with the allopt[] storage it writes.
const COMMITTED_PICKS = Object.freeze([
    ['autopickup', 'flags', 'pickup'],
    ['lit_corridor', 'flags', 'lit_corridor'],
    ['lootabc', 'flags', 'lootabc'],
    ['menucolors', 'iflags', 'use_menu_color'],
    ['price_quotes', 'iflags', 'pricequotes'],
    ['quick_farsight', 'flags', 'quick_farsight'],
    ['showexp', 'flags', 'showexp'],
    ['time', 'flags', 'time'],
]);

export async function verifyOptionsMenuSegment(segment) {
    let boundary = null;
    await runSegment(
        { ...segment },
        { onBoundary: (error) => { boundary = error; } },
    );
    // Neither shape of run may stop early: the paging ones stay inside
    // select_menu(), and the committing one runs the whole pick loop.
    if (boundary) throw boundary;
    // doset() spends no turn, so the hero must still be on the first one.
    if (game.moves !== 1)
        throw new Error('opening the options menu advanced the turn counter');

    if (segment.moves.includes(EDIT_PICKUP_TYPES)) {
        // The rounds leave [WEAPON, FOOD], [], [RING], [RING] and [] in turn;
        // only the last survives to here, and the screens the differential
        // compares carry the four before it.
        assert.deepEqual(
            game.flags.pickup_types, [],
            'the class menu left the wrong pickup_types',
        );
        // Five rounds toggled 'autoquiver' four times and 'autopickup' once.
        if (game.flags.pickup !== true || game.flags.autoquiver !== false)
            throw new Error('the pickup_types rounds toggled the wrong boolean');
        return;
    }

    if (segment.moves.includes(COMMIT_BOOLEAN_PICKS)) {
        for (const [name, owner, field] of COMMITTED_PICKS) {
            if (game[owner][field] !== true) {
                throw new Error(
                    `committing the options menu left '${name}' off`,
                );
            }
        }
        // reset_needed_visuals() spends every flag it consumes, so a second
        // 'O' would find the same clean slate the first one did.
        if (game.go.opt_need_redraw !== false
            || game.go.opt_need_promptstyle !== false) {
            throw new Error('reset_needed_visuals() left a repair pending');
        }
        return;
    }

    // Paging the menu must apply nothing. These four are the options the two
    // recipes disagree about or that the recorded pages show as togglable:
    // autopickup and lit_corridor stay off, menucolors stays off, and
    // cmdassist and pile_limit keep whatever the configuration file set.
    const configured = segment.nethackrc.includes('!cmdassist');
    if (game.flags.pickup !== false || game.flags.lit_corridor !== false
        || game.iflags.use_menu_color !== false) {
        throw new Error('paging the options menu toggled a boolean option');
    }
    if (game.iflags.cmdassist !== !configured
        || game.flags.pile_limit !== (configured ? 3 : 5)) {
        throw new Error('paging the options menu changed a configured value');
    }
}

export async function runOptionsMenuMatrix() {
    const [stock, configured, bound, committed, classes]
        = loadOptionsMenuRecipes();
    return runFreshMatrix({
        entries: [
            { label: 'stock options menu', recipe: stock },
            { label: 'configured options menu', recipe: configured },
            { label: 'rebound options menu', recipe: bound },
            { label: 'committed options menu', recipe: committed },
            { label: 'pickup_types class menu', recipe: classes },
        ],
        summaryLabel: 'OPTIONS MENU',
        verifySegment: verifyOptionsMenuSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runOptionsMenuMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`options menu: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
