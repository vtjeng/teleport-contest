#!/usr/bin/env node

// Record and replay the '#optionsfull' menu against the patched C reference.
// Every segment types 'm' then 'O', which options.c doset_simple() hands to
// doset(), and pages through every one of its pages without committing a
// selection. The first uses stock options, so the cmdassist help block leads
// the menu and the compiled-in defaults fill its value column. The second
// turns cmdassist off, which drops that block and shifts every page boundary,
// and sets seven option values the menu then has to report back. The third
// rebinds keys, which is the only input that moves the "bind keys" count on
// the menu's last page.

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
    ];
    // record-session preserves the staged install between one recipe's
    // segments, and each of these leaves the recorder stopped inside a live
    // menu, so each gets its own recipe and fresh install.
    return segments.map((segment, index) => validateCleanRecipe({
        version: 5,
        segments: [segment],
    }, `options menu recipe ${index + 1}`));
}

export async function verifyOptionsMenuSegment(segment) {
    let boundary = null;
    await runSegment(
        { ...segment },
        { onBoundary: (error) => { boundary = error; } },
    );
    // Paging through the menu must not reach the unported pick loop; the
    // whole recorded stretch happens inside select_menu().
    if (boundary) throw boundary;
    // doset() spends no turn, so the hero must still be on the first one.
    if (game.moves !== 1)
        throw new Error('opening the options menu advanced the turn counter');
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
    const [stock, configured, bound] = loadOptionsMenuRecipes();
    return runFreshMatrix({
        entries: [
            { label: 'stock options menu', recipe: stock },
            { label: 'configured options menu', recipe: configured },
            { label: 'rebound options menu', recipe: bound },
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
