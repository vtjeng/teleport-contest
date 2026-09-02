#!/usr/bin/env node

// Record and replay cfgfiles.c parse_config_line() through the startup error
// wait and first gameplay boundary. Eight unknown rows put
// config_error_done()'s absolute path below the recorder's 24-row screen; the
// segment API cannot supply that path, so a shorter error list cannot form a
// strict differential for this parser branch.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 5192701;
const DATETIME = '20360415113000';

function segment(name, statements) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: [
            `OPTIONS=name:${name},role:Healer,race:human,gender:male,`
                + 'align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
            ...statements,
            '',
        ].join('\n'),
        moves: '\n:',
    };
}

export function loadUnknownConfigStatementRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            segment('UnknownExact', [
                'ZORKMID=x', 'FROBNICATE=x', 'TILESETTINGS=x', 'KEYMAP=x',
                'PLAYERDIR=x', 'RECORDER=x', 'FOOBAR=x', 'NOPE=x',
            ]),
            segment('UnknownPrefix', [
                // Each name is one byte shorter than its source row permits.
                'OPT=x', 'AUTO=x', 'BIN=x', 'MSGTYP=x',
                'BO=x', 'HILIT=x', 'WARN=x', 'WIZKI=x',
            ]),
            segment('KnownAndUnknown', [
                // These newly cataloged handlers are inert in this Unix tty
                // build, or (WIZKIT) have no reader outside debug mode.
                'HACKDIR=x', 'LEVELDIR=x', 'LEVELS=x', 'SAVEDIR=x',
                'BONESDIR=x', 'DATADIR=x', 'SCOREDIR=x', 'LOCKDIR=x',
                'CONFIGDIR=x', 'TROUBLEDIR=x', 'WIZKIT=x',
                'QT_TILEWIDTH=x', 'QT_TILEHEIGHT=x', 'QT_FONTSIZE=x',
                'QT_COMPACT=x',
                // Extensions of known names are unknown because
                // match_optname() compares the whole supplied name.
                '=empty', 'OPTIONS_EXTRA=x', 'HACKDIRECTORY=x',
                'QT_TILEWIDTH_EXTRA=x', 'UNKNOWN=x', '_OPTIONS=x',
                'OPTIONSX=x', 'NOPE=x',
            ]),
        ],
    }, 'unknown config statement recipe');
}

export async function runUnknownConfigStatementMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'unknown config statements',
            recipe: loadUnknownConfigStatementRecipe(),
        }],
        summaryLabel: 'UNKNOWN CONFIG STATEMENTS',
    });
}

runMatrixCli(import.meta.url, runUnknownConfigStatementMatrix, 'unknown config statements');
