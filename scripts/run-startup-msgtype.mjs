#!/usr/bin/env node

// Record and replay cfgfiles.c cnf_line_MSGTYPE(), options.c's MSGTYPE list,
// and pline.c vpline() from startup parsing through the first initialized
// message or #optionsfull. Interactive rule editing remains outside the slice.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    MSGTYP_NOREP,
    MSGTYP_NORMAL,
    MSGTYP_NOSHOW,
    MSGTYP_STOP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import {
    msgtype_type,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const OPEN_FULL_OPTIONS_MENU = ' mO      ';
const MESSAGE_TYPES = allopt.find(({ name }) => name === 'message types');

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,align:lawful`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements,
        '',
    ].join('\n');
}

function messageCase({ label, seed, datetime, statements, moves = 's',
    expected, probes = [], errors = 0, name = `Msg${seed}` }) {
    return Object.freeze({
        label,
        seed,
        datetime,
        nethackrc: startupRc(name, ...statements),
        moves: `${errors ? '\n' : ''}${moves}`,
        statements: Object.freeze([...statements]),
        expected: Object.freeze(expected.map(Object.freeze)),
        probes: Object.freeze(probes.map(Object.freeze)),
        errors,
    });
}

const atLimit = 'x'.repeat(255);

export const STARTUP_MSGTYPE_CASES = Object.freeze([
    messageCase({
        label: 'hide suppresses the first initialized message',
        seed: 9812359,
        datetime: '20420415133700',
        statements: ['MSGTYPE=hide ".*"'],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: '.*' }],
        probes: [['ordinary text', false, MSGTYP_NOSHOW]],
    }),
    messageCase({
        label: 'stop forces More at the first initialized message',
        seed: 9812347,
        datetime: '20420415123700',
        statements: ['MSGTYPE=stop ".*"'],
        moves: 's ',
        expected: [{ msgtype: MSGTYP_STOP, pattern: '.*' }],
        probes: [['ordinary text', false, MSGTYP_STOP]],
    }),
    messageCase({
        label: 'prior Escape then explicit STOP Space reaches startup input',
        seed: 9812459,
        datetime: '20420415145900',
        statements: [
            'OPTIONS=playmode:debug',
            'MSGTYPE=stop "^You are in debug mode\\."',
        ],
        moves: '\x1b s',
        expected: [{
            msgtype: MSGTYP_STOP,
            pattern: '^You are in debug mode\\.',
        }],
        probes: [['You are in debug mode.', false, MSGTYP_STOP],
            ['ordinary text', false, MSGTYP_NORMAL]],
        name: 'PersistentStop',
    }),
    messageCase({
        label: 'one-letter s selects show before stop',
        seed: 9812411,
        datetime: '20420415141100',
        statements: ['MSGTYPE=s ".*"'],
        expected: [{ msgtype: MSGTYP_NORMAL, pattern: '.*' }],
        probes: [['ordinary text', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'colon and POSIX classes suppress the welcome line',
        seed: 9812413,
        datetime: '20420415141300',
        statements: ['MSGTYPE:hide "^[[:upper:]][[:lower:]]+"'],
        expected: [{
            msgtype: MSGTYP_NOSHOW,
            pattern: '^[[:upper:]][[:lower:]]+',
        }],
        probes: [['Velkommen', false, MSGTYP_NOSHOW],
            ['12', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'collating and equivalence elements match the welcome line',
        seed: 9812417,
        datetime: '20420415141700',
        statements: ['MSGTYPE=hide "^[[=V=]][[.e.]]"'],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: '^[[=V=]][[.e.]]' }],
        probes: [['Velkommen', false, MSGTYP_NOSHOW]],
    }),
    messageCase({
        label: 'numeric backreference suppresses the welcome line',
        seed: 9812416,
        datetime: '20420415141600',
        statements: [String.raw`MSGTYPE=hide "(l)\1"`],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: String.raw`(l)\1` }],
        probes: [['Hello', false, MSGTYP_NOSHOW],
            ['Hel1o', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'unmatched optional backreference does not suppress welcome',
        seed: 9812415,
        datetime: '20420415141500',
        statements: [String.raw`MSGTYPE=hide "^(X)?\1Hello"`],
        expected: [{
            msgtype: MSGTYP_NOSHOW,
            pattern: String.raw`^(X)?\1Hello`,
        }],
        probes: [['Hello', false, MSGTYP_NORMAL],
            ['XXHello', false, MSGTYP_NOSHOW]],
    }),
    messageCase({
        label: 'GNU word boundaries suppress the welcome line',
        seed: 9812418,
        datetime: '20420415141800',
        statements: [String.raw`MSGTYPE=hide "\bHell\B"`],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: String.raw`\bHell\B` }],
        probes: [['Hello', false, MSGTYP_NOSHOW],
            ['Shell', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'GNU word and space classes suppress the welcome line',
        seed: 9812420,
        datetime: '20420415142000',
        statements: [String.raw`MSGTYPE=hide "\<Hello\>\s\w+\W"`],
        expected: [{
            msgtype: MSGTYP_NOSHOW,
            pattern: String.raw`\<Hello\>\s\w+\W`,
        }],
        probes: [['Hello Msg9812420,', false, MSGTYP_NOSHOW],
            ['xHello Msg9812420,', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'leading close-bracket range suppresses the welcome line',
        seed: 9812422,
        datetime: '20420415142200',
        statements: ['MSGTYPE=hide "[]-a]"'],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: '[]-a]' }],
        probes: [['a', false, MSGTYP_NOSHOW],
            ['b', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'adjacent quantifiers retain the libc repetition language',
        seed: 9812419,
        datetime: '20420415141900',
        statements: ['MSGTYPE=hide "^(V+?)elkommen"'],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: '^(V+?)elkommen' }],
        probes: [['Velkommen', false, MSGTYP_NOSHOW],
            ['elkommen', false, MSGTYP_NOSHOW]],
    }),
    messageCase({
        label: 'overlapping backreference candidate suppresses welcome',
        seed: 9812416,
        datetime: '20420415141600',
        statements: [String.raw`MSGTYPE=hide "(o|(m))m?\2"`],
        expected: [{
            msgtype: MSGTYP_NOSHOW,
            pattern: String.raw`(o|(m))m?\2`,
        }],
        probes: [['Velkommen', false, MSGTYP_NOSHOW],
            ['Hello', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'same-start nested alternative suppresses welcome',
        seed: 9812415,
        datetime: '20420415141500',
        statements: [String.raw`MSGTYPE=hide "((V)?\2|V)"`],
        expected: [{
            msgtype: MSGTYP_NOSHOW,
            pattern: String.raw`((V)?\2|V)`,
        }],
        probes: [['Velkommen', false, MSGTYP_NOSHOW],
            ['Hello', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'empty same-reference alternative suppresses welcome',
        seed: 9812447,
        datetime: '20420415144700',
        statements: [String.raw`MSGTYPE=hide "(|())\2"`],
        expected: [{
            msgtype: MSGTYP_NOSHOW,
            pattern: String.raw`(|())\2`,
        }],
        probes: [['', false, MSGTYP_NOSHOW],
            ['ordinary text', false, MSGTYP_NOSHOW]],
    }),
    messageCase({
        label: 'repeated subgroup retains its last participating value',
        seed: 9812449,
        datetime: '20420415144900',
        statements: [String.raw`MSGTYPE=hide "^Hello ((a)|b)*\2,"`],
        expected: [{
            msgtype: MSGTYP_NOSHOW,
            pattern: String.raw`^Hello ((a)|b)*\2,`,
        }],
        probes: [['Hello aba,', false, MSGTYP_NOSHOW],
            ['Hello abb,', false, MSGTYP_NORMAL]],
        name: 'aba',
    }),
    messageCase({
        label: 'comma-only interval installs with zero-or-more semantics',
        seed: 9812359,
        datetime: '20420415133700',
        statements: ['MSGTYPE=hide "V{,}"'],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: 'V{,}' }],
        probes: [['', false, MSGTYP_NOSHOW],
            ['VVV', false, MSGTYP_NOSHOW]],
    }),
    messageCase({
        label: 'GNU absolute-buffer anchors install through MSGTYPE',
        seed: 9812418,
        datetime: '20420415141800',
        statements: [
            String.raw`MSGTYPE=hide "\`Vel"`,
            String.raw`MSGTYPE=hide "\.\'"`,
        ],
        expected: [
            { msgtype: MSGTYP_NOSHOW, pattern: String.raw`\.\'` },
            { msgtype: MSGTYP_NOSHOW, pattern: String.raw`\`Vel` },
        ],
        probes: [['Velkommen', false, MSGTYP_NOSHOW],
            ['xVelkommen', false, MSGTYP_NORMAL],
            ['done.', false, MSGTYP_NOSHOW],
            ['done.!', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'contextual internal anchor installs for newline messages',
        seed: 9812411,
        datetime: '20420415141100',
        statements: ['MSGTYPE=hide "$."'],
        expected: [{ msgtype: MSGTYP_NOSHOW, pattern: '$.' }],
        probes: [['a\n', false, MSGTYP_NOSHOW],
            ['a', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'repeated GNU anchors report and later config continues',
        seed: 9812441,
        datetime: '20420415144100',
        moves: OPEN_FULL_OPTIONS_MENU,
        statements: [
            ...Array(30).fill(String.raw`MSGTYPE=hide "\`*"`),
            String.raw`MSGTYPE=hide "\'+"`,
            'MSGTYPE=show "^never$"',
        ],
        expected: [{ msgtype: MSGTYP_NORMAL, pattern: '^never$' }],
        errors: 31,
    }),
    messageCase({
        label: 'later show rule wins over earlier matching hide rule',
        seed: 9812423,
        datetime: '20420415142300',
        statements: [
            'MSGTYPE=hide ".*"',
            'MSGTYPE=show ".*"',
        ],
        expected: [
            { msgtype: MSGTYP_NORMAL, pattern: '.*' },
            { msgtype: MSGTYP_NOSHOW, pattern: '.*' },
        ],
        probes: [['ordinary text', false, MSGTYP_NORMAL]],
    }),
    messageCase({
        label: 'later hide rule wins over earlier matching show rule',
        seed: 9812429,
        datetime: '20420415142900',
        statements: [
            'MSGTYPE=show ".*"',
            'MSGTYPE=hide ".*"',
        ],
        expected: [
            { msgtype: MSGTYP_NOSHOW, pattern: '.*' },
            { msgtype: MSGTYP_NORMAL, pattern: '.*' },
        ],
        probes: [['ordinary text', false, MSGTYP_NOSHOW]],
    }),
    messageCase({
        label: 'all action names and aliases reach optionsfull count',
        seed: 9812431,
        datetime: '20420415143100',
        moves: OPEN_FULL_OPTIONS_MENU,
        statements: [
            'MSGTYPE=show "^never one$"',
            'MSGTYPE=hide "^never two$"',
            'MSGTYPE=noshow "^never three$"',
            'MSGTYPE=stop "^never four$"',
            'MSGTYPE=more "^never five$"',
            'MSGTYPE=norep "^never six$"',
        ],
        expected: [
            { msgtype: MSGTYP_NOREP, pattern: '^never six$' },
            { msgtype: MSGTYP_STOP, pattern: '^never five$' },
            { msgtype: MSGTYP_STOP, pattern: '^never four$' },
            { msgtype: MSGTYP_NOSHOW, pattern: '^never three$' },
            { msgtype: MSGTYP_NOSHOW, pattern: '^never two$' },
            { msgtype: MSGTYP_NORMAL, pattern: '^never one$' },
        ],
    }),
    messageCase({
        label: 'sscanf assignments and malformed rows continue to optionsfull',
        seed: 9812437,
        datetime: '20420415143700',
        moves: OPEN_FULL_OPTIONS_MENU,
        statements: [
            ...Array(31).fill('MSGTYPE=hide"joined"'),
            'MSGTYPE=hide "unclosed',
            `MSGTYPE=hide "${atLimit}Z" trailing`,
        ],
        expected: [
            { msgtype: MSGTYP_NOSHOW, pattern: atLimit },
            { msgtype: MSGTYP_NOSHOW, pattern: 'unclosed' },
        ],
        errors: 31,
    }),
    messageCase({
        label: 'invalid regular expressions continue to a valid rule',
        seed: 9812441,
        datetime: '20420415144100',
        moves: OPEN_FULL_OPTIONS_MENU,
        statements: [
            ...Array(31).fill('MSGTYPE=hide "[z-a]"'),
            'MSGTYPE=show "^never$"',
        ],
        expected: [{ msgtype: MSGTYP_NORMAL, pattern: '^never$' }],
        errors: 31,
    }),
    messageCase({
        label: 'unknown actions continue to a valid rule',
        seed: 9812443,
        datetime: '20420415144300',
        moves: OPEN_FULL_OPTIONS_MENU,
        statements: [
            ...Array(31).fill('MSGTYPE=unknown "ignored"'),
            'MSGTYPE=norep "^never$"',
        ],
        expected: [{ msgtype: MSGTYP_NOREP, pattern: '^never$' }],
        errors: 31,
    }),
]);

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: entry.nethackrc,
        moves: entry.moves,
    };
}

export function loadStartupMsgtypeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_MSGTYPE_CASES.map(segmentFor),
    }, 'startup MSGTYPE recipe');
}

function caseFor(segment) {
    return STARTUP_MSGTYPE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function list(state) {
    const result = [];
    for (let rule = state.gp?.plinemsg_types; rule; rule = rule.next) {
        result.push({ msgtype: rule.msgtype, pattern: rule.pattern });
    }
    return result;
}

function verifyState(state, entry, phase) {
    if (JSON.stringify(list(state)) !== JSON.stringify(entry.expected)) {
        throw new Error(`${entry.label} ${phase} the wrong MSGTYPE list`);
    }
    const expectedCount = `(${entry.expected.length} currently set)`;
    if (optionValue(state, MESSAGE_TYPES, {}) !== expectedCount) {
        throw new Error(`${entry.label} ${phase} the wrong optionsfull count`);
    }
    for (const [message, norepeat, expected] of entry.probes) {
        if (msgtype_type(message, norepeat, state) !== expected) {
            throw new Error(`${entry.label} ${phase} the wrong rule match`);
        }
    }
}

export async function verifyStartupMsgtypeSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup MSGTYPE case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    verifyState(parsed, entry, 'parsed');
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }
    if (parsed.unportedConfigStatements.includes('msgtype')) {
        throw new Error(`${entry.label} left cnf_line_MSGTYPE unported`);
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    verifyState(game, entry, 'installed');
}

export async function runStartupMsgtypeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup MSGTYPE to vpline and optionsfull',
            recipe: loadStartupMsgtypeRecipe(),
        }],
        summaryLabel: 'STARTUP MSGTYPE',
        verifySegment: verifyStartupMsgtypeSegment,
        // Every segment stops a debug game at the startup boundary. Isolate
        // their recorder install state so a preceding terminated game cannot
        // affect the next case's save/lock discovery.
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupMsgtypeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup MSGTYPE: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
