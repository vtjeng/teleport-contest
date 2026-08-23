#!/usr/bin/env node

// Record and replay cfgfiles.c cnf_line_AUTOPICKUP_EXCEPTION() and options.c
// add_autopickup_exception()/count_apes() from startup parsing through
// ga.apelist, config_error_done(), #optionsfull, and the Ctrl-X attributes
// line. pickup.c object filtering remains at its existing named refusal.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { truncateByteString } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const OPEN_FULL_OPTIONS_MENU = ' mO      ';
const OPEN_ATTRIBUTES = '\x18\x1b:';
const AUTOPICKUP_ROW = allopt.find(
    ({ name }) => name === 'autopickup exceptions',
);

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,align:lawful`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,autopickup',
        ...statements,
        '',
    ].join('\n');
}

function parserCase({ label, seed, datetime, statements, expected,
    errors = 0, attributes = false, diagnostic = null }) {
    return Object.freeze({
        label,
        seed,
        datetime,
        nethackrc: startupRc(`Ape${seed}`, ...statements),
        moves: `${errors ? '\n' : ''}`
            + (attributes ? OPEN_ATTRIBUTES : OPEN_FULL_OPTIONS_MENU),
        expected: Object.freeze(expected.map(Object.freeze)),
        errors,
        diagnostic,
    });
}

function diagnosticCase(label, seed, datetime, pattern, diagnostic) {
    const statement = `AUTOPICKUP_EXCEPTION=\">${pattern}\"`;
    return parserCase({
        label,
        seed,
        datetime,
        // Thirty-one reports scroll config_error_done()'s absolute rc path,
        // which runSegment cannot know, above the captured terminal. This
        // also fresh-probes the exact libc regerror() wording in `diagnostic`.
        statements: Array(31).fill(statement),
        expected: [],
        errors: 31,
        diagnostic,
    });
}

const atLimit = 'a'.repeat(253);
const splitUtf8 = `${'a'.repeat(252)}é`;

export const STARTUP_AUTOPICKUP_EXCEPTION_CASES = Object.freeze([
    parserCase({
        label: 'exact statement and POSIX class reach optionsfull',
        seed: 9684301,
        datetime: '20390418120100',
        statements: ['AUTOPICKUP_EXCEPTION=\">[[:digit:]]+ wand\"'],
        expected: [{ pattern: '[[:digit:]]+ wand', grab: false }],
    }),
    parserCase({
        label: 'short statement and repeated rows preserve head insertion',
        seed: 9684303,
        datetime: '20390418120300',
        statements: [
            'AUTOP=\"<food\"',
            'AUTOP=\">wand\"',
            'AUTOP=\"corpse\"',
            'AUTOP=\">wand\"',
        ],
        expected: [
            { pattern: 'wand', grab: false },
            { pattern: 'corpse', grab: false },
            { pattern: 'wand', grab: false },
            { pattern: 'food', grab: true },
        ],
    }),
    parserCase({
        label: 'unclosed and byte-width mappings preserve sscanf assignments',
        seed: 9684305,
        datetime: '20390418120500',
        statements: [
            'AUTOPICKUP_EXCEPTION=\"<unclosed',
            `AUTOPICKUP_EXCEPTION=\">${atLimit}Z\" junk`,
            `AUTOPICKUP_EXCEPTION=\">${splitUtf8}\"`,
        ],
        expected: [
            { pattern: truncateByteString(splitUtf8, 253), grab: false },
            { pattern: atLimit, grab: false },
            { pattern: 'unclosed', grab: true },
        ],
    }),
    parserCase({
        label: 'configured exception reaches the attributes line',
        seed: 9684307,
        datetime: '20390418120700',
        statements: ['AUTOPICKUP_EXCEPTION=\">.*wand\"'],
        expected: [{ pattern: '.*wand', grab: false }],
        attributes: true,
    }),
    parserCase({
        label: 'syntax errors continue to a commented valid row',
        seed: 9684309,
        datetime: '20390418120900',
        statements: [
            ...Array(31).fill('AUTOPICKUP_EXCEPTION=\"\" junk'),
            'AUTOPICKUP_EXCEPTION=\">wand\" # comment',
        ],
        // The commented '>' form is reparsed by the prefixless sscanf().
        expected: [{ pattern: '>wand', grab: false }],
        errors: 31,
        diagnostic: 'syntax error in AUTOPICKUP_EXCEPTION',
    }),
    diagnosticCase(
        'bare bracket reports Invalid regular expression',
        9684311, '20390418121100', '[', 'Invalid regular expression',
    ),
    diagnosticCase(
        'unclosed bracket reports its libc category',
        9684313, '20390418121300', '[a',
        'Unmatched [, [^, [:, [., or [=',
    ),
    diagnosticCase(
        'descending range reports Invalid range end',
        9684315, '20390418121500', '[z-a]', 'Invalid range end',
    ),
    diagnosticCase(
        'multi-character equivalence reports Invalid collation character',
        9684317, '20390418121700', '[[=ab=]]',
        'Invalid collation character',
    ),
    diagnosticCase(
        'unknown class reports Invalid character class name',
        9684319, '20390418121900', '[[:bogus:]]',
        'Invalid character class name',
    ),
    diagnosticCase(
        'reversed interval reports Invalid content',
        9684321, '20390418122100', 'a{2,1}',
        'Invalid content of \\{\\}',
    ),
    diagnosticCase(
        'oversized interval reports Regular expression too big',
        9684323, '20390418122300', 'a{32768}',
        'Regular expression too big',
    ),
    diagnosticCase(
        'terminal escape reports Trailing backslash',
        9684325, '20390418122500', '\\', 'Trailing backslash',
    ),
    diagnosticCase(
        'JavaScript-only group reports Invalid preceding expression',
        9684327, '20390418122700', '(?:wand)',
        'Invalid preceding regular expression',
    ),
    diagnosticCase(
        'open group reports Unmatched group',
        9684329, '20390418122900', '(', 'Unmatched ( or \\(',
    ),
    diagnosticCase(
        'open interval reports Unmatched interval',
        9684331, '20390418123100', 'a{1', 'Unmatched \\{',
    ),
]);

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: entry.nethackrc,
        moves: entry.moves,
    };
}

export function loadStartupAutopickupExceptionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_AUTOPICKUP_EXCEPTION_CASES.map(segmentFor),
    }, 'startup autopickup exception recipe');
}

function caseFor(segment) {
    return STARTUP_AUTOPICKUP_EXCEPTION_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function list(state) {
    const entries = [];
    for (let ape = state.ga?.apelist; ape; ape = ape.next) {
        entries.push({ pattern: ape.pattern, grab: ape.grab });
    }
    return entries;
}

function verifyState(state, entry, phase) {
    if (JSON.stringify(list(state)) !== JSON.stringify(entry.expected)) {
        throw new Error(`${entry.label} ${phase} the wrong ga.apelist`);
    }
    const value = optionValue(state, AUTOPICKUP_ROW, {});
    const expectedValue = `(${entry.expected.length} currently set)`;
    if (value !== expectedValue) {
        throw new Error(
            `${entry.label} ${phase} reported ${value}, not ${expectedValue}`,
        );
    }
}

export async function verifyStartupAutopickupExceptionSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no autopickup-exception case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    verifyState(parsed, entry, 'parsed');
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }
    if (entry.diagnostic) {
        const messages = parsed.configErrorFrame.output.filter(
            (line) => line.startsWith(' * '),
        );
        const expected = `: ${entry.diagnostic}.`;
        if (messages.length !== entry.errors
            || messages.some((message) => !message.endsWith(expected))) {
            throw new Error(`${entry.label} reported the wrong diagnostic`);
        }
    }
    if (parsed.unportedConfigStatements.includes('autopickup_exception')) {
        throw new Error(`${entry.label} left the direct handler unported`);
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    verifyState(game, entry, 'installed');
}

export async function runStartupAutopickupExceptionMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup autopickup exceptions to live consumers',
            recipe: loadStartupAutopickupExceptionRecipe(),
        }],
        summaryLabel: 'STARTUP AUTOPICKUP EXCEPTIONS',
        verifySegment: verifyStartupAutopickupExceptionSegment,
        chunkLimit: 8,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupAutopickupExceptionMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup autopickup exceptions: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
