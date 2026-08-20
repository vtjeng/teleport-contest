#!/usr/bin/env node

// Record and replay cfgfiles.c parse_config_line() through the startup error
// wait and first gameplay boundary. Eight unknown rows put
// config_error_done()'s absolute path below the recorder's 24-row screen; the
// segment API cannot supply that path, so a shorter error list cannot form a
// strict differential for this parser branch.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
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

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runUnknownConfigStatementMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `unknown config statements: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
