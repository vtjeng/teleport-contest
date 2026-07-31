#!/usr/bin/env node

// Whole remaining command debt per development session, and the screens each
// candidate would unblock.
//
// scripts/scan-stops.mjs reports the fail-closed boundary each session reaches
// FIRST and is silent about everything behind it, so its step counts state an
// upper bound and nothing it prints says how far a session is from completing.
// Ranking a goal by the steps standing behind one boundary has overestimated by
// one to two orders of magnitude, because a session blocked on one owner
// routinely blocks again on another.
//
// This script answers the other question. It differences a session's ENTIRE
// recorded input against the commands the port dispatches, so a session's debt
// is the whole set of owners between it and its last recorded screen, and then
// ranks candidates by the screens in sessions whose whole debt that candidate
// would clear. A candidate that clears a session's only remaining debt earns
// that session's screens; a candidate that leaves another owner standing earns
// nothing, which is the overestimate this script exists to remove.
//
// Which recorded bytes are commands
// ---------------------------------
// A recorded step is one byte the reference program consumed, and roughly half
// of them are prompt answers, menu selections and --More-- dismissals rather
// than commands. Resolving every byte through the binding table would count the
// six bytes of `Tetra\r` at the opening name prompt as six extended commands.
//
// The recording separates the two itself. NetHack parks the cursor on the hero
// while it waits for a command, and inside its window, on the top line, or on
// the prompt while it waits for anything else. So the byte at step i is a
// command exactly when the cursor recorded at step i-1 rests on a map row over
// the hero's glyph. Over the 33 development sessions this splits 7,720 steps
// into 3,926 commands and 3,794 answers.
//
// The estimator this leaves is stated in `ambiguous` below: a step whose cursor
// rests on a map row over a non-blank glyph that is not the hero's is neither
// classified nor silently dropped, because a polymorphed or swallowed hero
// draws something else and would go uncounted.
//
// Sealed-holdout rule: DEVELOPMENT_DIR is fixed and this script accepts no path
// argument, so it cannot be aimed at sessions/holdout/.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeScreen } from '../frozen/screen-decode.mjs';
import { normalizeSession } from '../frozen/session_loader.mjs';
import {
    ADMITTED_COMMANDS,
    ADMITTED_RUN_MODES,
    MOVEMENT_INTENTS,
    UnsupportedHeroCommandBoundaryError,
} from '../js/cmd.js';
import { commandForKey } from '../js/command_bindings.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PROJECT_ROOT, listSessionFiles } from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const DEVELOPMENT_DIR = join(PROJECT_ROOT, 'sessions');

// The same guard scripts/scan-stops.mjs and scripts/score-development.mjs
// apply, keeping this on the reviewed side of the fixed 33/11 split.
const EXPECTED_DEVELOPMENT_COUNT = 33;

// tty rows 1 through 21 are the map. Row 0 is the top line and rows 22 and 23
// are the status lines, so a cursor on any of those three is not waiting for a
// command.
const FIRST_MAP_ROW = 1;
const LAST_MAP_ROW = 21;

// The hero's glyph in the default symbol set, which every development session
// uses. A polymorphed or engulfed hero draws something else; that case reports
// as ambiguous rather than as a command, because misreading it as a command
// would invent debt.
const HERO_GLYPH = '@';

// cmd.c parse() ends a getlin prompt on either terminator.
const PROMPT_TERMINATORS = new Set(['\r', '\n']);

const EXTENDED_COMMAND_KEY = '#';

/**
 * Where the reference program left the cursor, and what it drew there.
 *
 * Returns `command` when the cursor rests on the hero, `answer` when it rests
 * anywhere a command cannot be read, and `ambiguous` when it rests on a map row
 * over some other non-blank glyph.
 */
export function cursorState(step) {
    if (!step?.screen || !step?.cursor) return 'answer';
    const [column, row] = step.cursor;
    if (row < FIRST_MAP_ROW || row > LAST_MAP_ROW) return 'answer';
    const screen = decodeScreen(step.screen);
    const glyph = screen[row]?.[column]?.ch ?? ' ';
    if (glyph === HERO_GLYPH) return 'command';
    return glyph === ' ' ? 'answer' : 'ambiguous';
}

/**
 * The extended command a `#` opened, read from the bytes that answer its
 * prompt.
 *
 * `doextcmd()` autocompletes, so the recorded bytes are a prefix rather than
 * the whole name. A prefix matching exactly one entry of `extcmdlist[]` names
 * that entry; anything else keeps the raw text, so an ambiguous or unfinished
 * prompt reports as itself instead of being attributed to a command nobody
 * typed.
 */
export function extendedCommandAt(steps, index) {
    let typed = '';
    let cursor = index + 1;
    for (; cursor < steps.length; cursor++) {
        const key = steps[cursor].key;
        if (typeof key !== 'string' || key.length === 0) break;
        if (PROMPT_TERMINATORS.has(key)) { cursor++; break; }
        typed += key;
    }
    const matches = extcmdlist.filter(
        (entry) => entry.ef_txt?.startsWith(typed),
    );
    const name = typed && matches.length === 1 ? matches[0].ef_txt : typed;
    return { name: `#${name}`, nextIndex: cursor };
}

/**
 * Every command the port dispatches today, named from js/cmd.js rather than
 * copied, so this census cannot drift from the boundary it measures.
 *
 * `readSimpleCommand()` admits ADMITTED_COMMANDS, a movement command whose run
 * mode is one of ADMITTED_RUN_MODES, Escape, and a byte bound to no command.
 * The last two carry no command name and so cannot appear as debt.
 */
export function supportedCommands() {
    const supported = new Set(ADMITTED_COMMANDS);
    for (const [command, intent] of Object.entries(MOVEMENT_INTENTS))
        if (ADMITTED_RUN_MODES.includes(intent[2])) supported.add(command);
    return supported;
}

/**
 * Resolve the refused keystroke through the port's own binding model for this
 * session, as scripts/scan-stops.mjs does. Sessions rebind keys, so matching
 * raw characters against a fixed table misnames their commands.
 */
function resolvedCommand(key) {
    const model = game?.commandBindings;
    if (!model || typeof key !== 'string' || key.length === 0) return null;
    return commandForKey(model, key.charCodeAt(0));
}

/**
 * Walk a segment's recorded steps and return the commands it issued, the count
 * of bytes that answered a prompt, and the count that could not be classified.
 */
export function commandsIssued(steps, resolve = resolvedCommand) {
    const commands = [];
    let answers = 0;
    let ambiguous = 0;
    for (let index = 1; index < steps.length; index++) {
        const state = cursorState(steps[index - 1]);
        if (state === 'ambiguous') { ambiguous++; continue; }
        if (state === 'answer') { answers++; continue; }
        const command = resolve(steps[index].key);
        if (command === EXTENDED_COMMAND_KEY) {
            const extended = extendedCommandAt(steps, index);
            commands.push(extended.name);
            // The name's own bytes answered the prompt rather than issuing a
            // command, so skip them without counting them again.
            answers += extended.nextIndex - index - 1;
            index = extended.nextIndex - 1;
            continue;
        }
        // A byte bound to no command reaches rhack()'s bad-command path, which
        // the port already dispatches, so it is not debt.
        if (command !== null) commands.push(command);
    }
    return { commands, answers, ambiguous };
}

function createStorageHandle() {
    const entries = new Map();
    return {
        getItem(k) { return entries.has(k) ? entries.get(k) : null; },
        setItem(k, v) { entries.set(k, String(v)); },
        removeItem(k) { entries.delete(k); },
        get length() { return entries.size; },
        key(i) {
            let n = 0;
            for (const k of entries.keys()) { if (n === i) return k; n++; }
            return null;
        },
        clear() { entries.clear(); },
    };
}

// The judge builds each segment's input from exactly these fields.
function replayInputFor(segment) {
    return {
        seed: segment.seed,
        datetime: segment.datetime,
        nethackrc: segment.nethackrc,
        moves: segment.moves,
    };
}

/** The screens a session has yet to earn: every recorded step it never drew. */
export function ceilingFor(row) {
    return row.recordedSteps - row.screensEmitted;
}

async function scanSession(file) {
    const data = normalizeSession(
        JSON.parse(readFileSync(join(DEVELOPMENT_DIR, file), 'utf8')),
    );
    const storage = createStorageHandle();
    const recordedSteps = data.segments.reduce(
        (total, segment) => total + (segment.steps || []).length,
        0,
    );

    let screensEmitted = 0;
    let stopped = false;
    let behavioral = null;
    const supported = supportedCommands();
    const commandDebt = new Set();
    let answers = 0;
    let ambiguous = 0;

    for (const segment of data.segments) {
        let boundary = null;
        const segmentGame = await runSegment(
            { ...replayInputFor(segment), storage },
            { onBoundary: (error) => { boundary ??= error; } },
        );
        // Screens are counted up to the first boundary only, which is the
        // convention scripts/scan-stops.mjs uses and the one that equals the
        // matched count: everything the port draws before its first refusal
        // matches C, and a later segment still runs on its own but replays from
        // a state the stopped segment never reached, so its screens are emitted
        // and wrong. Counting those would overstate the total by 106, at 573
        // against the 467 scripts/score-development.mjs matched on 31 July 2026.
        if (!stopped) screensEmitted += (segmentGame.getScreens?.() ?? []).length;
        if (boundary) stopped = true;
        // Read the bindings before the next segment overwrites the shared game
        // singleton, the same ordering scripts/scan-stops.mjs relies on.
        const issued = commandsIssued(segment.steps || []);
        answers += issued.answers;
        ambiguous += issued.ambiguous;
        for (const command of issued.commands)
            if (!isSupported(command, supported)) commandDebt.add(command);
        // A stop that is not a command refusal names an owner the input stream
        // cannot: the port reached a behavior it has not ported. Only the first
        // is visible, which is the censoring this script cannot remove.
        if (boundary && !(boundary instanceof UnsupportedHeroCommandBoundaryError)
            && behavioral === null)
            behavioral = boundary.message;
    }

    const debt = new Set(commandDebt);
    if (behavioral !== null) debt.add(behavioral);

    return {
        file,
        screensEmitted,
        recordedSteps,
        behavioral,
        commandDebt: [...commandDebt].sort(),
        debt: [...debt].sort(),
        answers,
        ambiguous,
    };
}

/**
 * An extended command is supported when the port dispatches the command its
 * name resolves to; `#` itself opens the prompt and is admitted already.
 */
function isSupported(command, supported) {
    if (!command.startsWith(EXTENDED_COMMAND_KEY)) return supported.has(command);
    return supported.has(command.slice(EXTENDED_COMMAND_KEY.length));
}

/**
 * Rank every debt member by the screens it would unblock: the sessions whose
 * WHOLE debt is this one member, summed over their unearned screens. A session
 * carrying two owners contributes to neither until the other lands, which is
 * exactly the correction this ranking makes to a first-boundary census.
 */
export function rankCandidates(rows) {
    const candidates = new Map();
    for (const row of rows) {
        for (const member of row.debt) {
            const entry = candidates.get(member)
                ?? { member, sessions: 0, screens: 0, blockedWith: 0 };
            if (row.debt.length === 1) {
                entry.sessions += 1;
                entry.screens += ceilingFor(row);
            } else {
                entry.blockedWith += 1;
            }
            candidates.set(member, entry);
        }
    }
    return [...candidates.values()].sort(
        (a, b) => b.screens - a.screens
            || b.sessions - a.sessions
            || a.member.localeCompare(b.member),
    );
}

function report(rows) {
    const nameWidth = Math.max(...rows.map((r) => r.file.length));
    console.log('Whole remaining debt per development session\n');
    for (const row of rows) {
        console.log(
            [
                row.file.padEnd(nameWidth),
                `${row.screensEmitted}/${row.recordedSteps}`.padStart(10),
                `debt ${row.debt.length}`.padStart(8),
                row.debt.length ? row.debt.join(' + ') : '(none: input exhausted)',
            ].join('  ').trimEnd(),
        );
    }

    const emitted = rows.reduce((n, r) => n + r.screensEmitted, 0);
    const recorded = rows.reduce((n, r) => n + r.recordedSteps, 0);
    const ambiguous = rows.reduce((n, r) => n + r.ambiguous, 0);
    const answers = rows.reduce((n, r) => n + r.answers, 0);
    console.log(
        `\n${rows.length} sessions; ${emitted} screens emitted of ${recorded} `
        + `recorded; ${answers} recorded bytes answered a prompt and `
        + `${ambiguous} could not be classified.`,
    );

    console.log(
        '\nCandidates by screens unblocked '
        + '(sessions whose whole debt is this one member)',
    );
    console.log(
        `  ${'screens'.padStart(7)}  ${'sess'.padStart(4)}  `
        + `${'also'.padStart(4)}  member`,
    );
    for (const entry of rankCandidates(rows)) {
        console.log(
            `  ${String(entry.screens).padStart(7)}  `
            + `${String(entry.sessions).padStart(4)}  `
            + `${String(entry.blockedWith).padStart(4)}  ${entry.member}`,
        );
    }
    console.log(
        '\n`also` counts sessions holding this member alongside another, which '
        + 'earn nothing until every member they hold lands.',
    );
}

export async function main(args) {
    const json = args.includes('--json');
    // Reject every other argument, including any path: this scan must not be
    // aimable at sessions/holdout/.
    if (args.some((arg) => arg !== '--json'))
        throw new Error('only --json is accepted');

    const files = listSessionFiles(DEVELOPMENT_DIR);
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT)
        throw new Error('development count changed');

    const rows = [];
    for (const file of files) rows.push(await scanSession(file));

    if (json) console.log(JSON.stringify({ rows, ranking: rankCandidates(rows) }, null, 2));
    else report(rows);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`Debt scan failed: ${error.message}`);
        process.exitCode = 1;
    });
}
