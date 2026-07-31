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
// is the whole set of owners between it and its last recorded screen, and it
// reports two measures over that set.
//
// `gated` is an ablation: take a port that matches every recorded screen,
// remove one owner, and count the screens that stop matching. A session cannot
// proceed past a capability it lacks, so everything from that owner's first use
// to the end of the session is lost. For a command the recording determines
// this outright, with no estimate in it, because the input stream states where
// the command is first issued. Owners overlap — a late screen stands behind
// every owner used before it — so the column is read per row and never summed.
//
// `advance` is what porting an owner next would earn: a session moves from its
// earliest unmet owner only as far as its second, so a candidate collects that
// gap in the sessions where it is the earliest. It is an upper bound, because
// the port stops at a session's first behavioral owner and never reports what
// stands behind it, so a gap measured to the next command can hide a
// behavioral gate inside it.
//
// The two disagree usefully, and `--by=` chooses which one orders the report.
// A high `gated` with a low `advance` is a dependency nothing reaches yet; a
// high `advance` is the goal to take next.
//
// Measured against the trap goal at 2f0e55e9, `advance` answered 46 where the
// goal delivered 8: an upper bound that held. The metric this replaced, which
// ranked by the sessions a candidate would COMPLETE, answered 0 for the same
// goal, because all three sessions holding that owner held others too. Gains
// come from sessions advancing to their next boundary, which a completion
// metric cannot see at all.
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
            commands.push({ index, command: extended.name });
            // The name's own bytes answered the prompt rather than issuing a
            // command, so skip them without counting them again.
            answers += extended.nextIndex - index - 1;
            index = extended.nextIndex - 1;
            continue;
        }
        // A byte bound to no command reaches rhack()'s bad-command path, which
        // the port already dispatches, so it is not debt.
        if (command !== null) commands.push({ index, command });
    }
    return { commands, answers, ambiguous };
}

/**
 * The owners a session needs, earliest use first.
 *
 * A command issued more than once keeps its EARLIEST index, because that is
 * where a port without it would first diverge; a later use changes nothing. The
 * behavioral owner, when the port reached one, enters at the step it stopped
 * on. Ties break by name so the order is total and the report is stable.
 */
export function assembleOwners(issued, supported, behavioral = null) {
    const firstUse = new Map();
    for (const { index, command } of issued) {
        if (isSupported(command, supported)) continue;
        if (!firstUse.has(command) || firstUse.get(command) > index)
            firstUse.set(command, index);
    }
    if (behavioral) firstUse.set(behavioral.member, behavioral.at);
    return [...firstUse.entries()]
        .map(([member, at]) => ({ member, at }))
        .sort((a, b) => a.at - b.at || a.member.localeCompare(b.member));
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
    let stepOffset = 0;
    const supported = supportedCommands();
    // Every command the session issued, numbered across segments so one index
    // orders the whole recording.
    const issuedAll = [];
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
        // Read the bindings before the next segment overwrites the shared game
        // singleton, the same ordering scripts/scan-stops.mjs relies on.
        const issued = commandsIssued(segment.steps || []);
        answers += issued.answers;
        ambiguous += issued.ambiguous;
        for (const { index, command } of issued.commands)
            issuedAll.push({ index: stepOffset + index, command });
        // A stop that is not a command refusal names an owner the input stream
        // cannot: the port reached a behavior it has not ported. Its first use
        // is the step the port never consumed. Only the FIRST such owner per
        // session is visible, because the port stops there and never reports
        // what stands behind it; that censoring is why `advance` below is an
        // upper bound.
        if (boundary && !(boundary instanceof UnsupportedHeroCommandBoundaryError)
            && behavioral === null)
            behavioral = { member: boundary.message, at: screensEmitted };
        if (boundary) stopped = true;
        stepOffset += (segment.steps || []).length;
    }

    // The first entry is the session's current bottleneck, and the gap to the
    // second is what porting it would earn.
    const owners = assembleOwners(issuedAll, supported, behavioral);

    return {
        file,
        screensEmitted,
        recordedSteps,
        behavioral: behavioral?.member ?? null,
        debt: owners.map((owner) => owner.member).sort(),
        owners,
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
 * Rank every owner by how much of the recorded score depends on it.
 *
 * `gated` is the ablation measure: take a port that matches every recorded
 * screen, remove this one owner, and count the screens that stop matching. A
 * session cannot proceed past a capability it lacks, so everything from that
 * owner's first use to the end of the session is lost. Summed over the sessions
 * that use it, that is the share of the whole 7,765-screen population standing
 * on this owner. Owners overlap by design: a screen late in a session is gated
 * behind every owner used before it, so these columns total far more than 7,765
 * and are read per row, never added up.
 *
 * `advance` is what porting it next would actually earn. A session moves from
 * its earliest unmet owner only as far as its second, so a candidate collects
 * the gap between the two in the sessions where it is the current bottleneck.
 * It is an upper bound: a session's later behavioral owners are invisible,
 * because the port stops at the first one and never reports what stands behind
 * it, so a gap measured to the next COMMAND may hide a behavioral gate inside
 * it.
 *
 * The two answer different questions and disagree usefully. A high `gated` with
 * a low `advance` is a bottleneck buried behind another one; a high `advance`
 * is the next goal to take.
 */
export const RANK_ORDERS = Object.freeze({
    // What to port next: the screens a candidate earns now.
    advance: (a, b) => b.advance - a.advance || b.gated - a.gated,
    // What the score rests on: the screens that depend on it at all.
    gated: (a, b) => b.gated - a.gated || b.advance - a.advance,
});

export function rankCandidates(rows, order = 'advance') {
    const compare = RANK_ORDERS[order];
    if (!compare) throw new Error(`unknown order: ${order}`);
    const candidates = new Map();
    for (const row of rows) {
        for (const [position, owner] of row.owners.entries()) {
            const entry = candidates.get(owner.member) ?? {
                member: owner.member,
                gated: 0,
                gatedSessions: 0,
                advance: 0,
                bottleneckIn: 0,
            };
            entry.gated += row.recordedSteps - owner.at;
            entry.gatedSessions += 1;
            if (position === 0) {
                entry.bottleneckIn += 1;
                const next = row.owners[1];
                entry.advance += (next ? next.at : row.recordedSteps) - owner.at;
            }
            candidates.set(owner.member, entry);
        }
    }
    return [...candidates.values()].sort(
        (a, b) => compare(a, b) || a.member.localeCompare(b.member),
    );
}

/** Center a group heading over the columns it names. */
function centered(label, width) {
    const left = Math.floor((width - label.length) / 2);
    return ' '.repeat(left) + label + ' '.repeat(width - label.length - left);
}

function report(rows, order = 'advance') {
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
        `\nOwners by the screens that depend on them, of ${recorded} recorded`
        + `, ordered by ${order}`,
    );
    // Each measure is a (screens, sessions) pair, so the header groups its two
    // columns under one name rather than leaving four columns to be read as
    // four separate quantities.
    console.log(`\n  ${centered('gated', 17)}  ${centered('advance', 17)}`);
    console.log(
        `  ${'screens'.padStart(7)}  ${'sessions'.padStart(8)}  `
        + `${'screens'.padStart(7)}  ${'sessions'.padStart(8)}  owner`,
    );
    for (const entry of rankCandidates(rows, order)) {
        console.log(
            `  ${String(entry.gated).padStart(7)}  `
            + `${String(entry.gatedSessions).padStart(8)}  `
            + `${String(entry.advance).padStart(7)}  `
            + `${String(entry.bottleneckIn).padStart(8)}  ${entry.member}`,
        );
    }
    console.log(
        '\ngated    screens that stop matching if a perfect port loses this '
        + 'owner, and the sessions that lose them: every screen from the '
        + "owner's first use to the end of each session that uses it. Owners "
        + 'overlap, so this column does not sum to the total.'
        + '\nadvance  screens porting this owner next would earn, and the '
        + 'sessions it would earn them in, which are the sessions where it is '
        + 'the earliest unmet owner. Every session with an owner has exactly '
        + 'one earliest, so that column sums to the number of unfinished '
        + 'sessions. An upper bound: a later behavioral owner inside the gap '
        + 'is invisible.',
    );
}

export async function main(args) {
    const json = args.includes('--json');
    // Reject every other argument, including any path: this scan must not be
    // aimable at sessions/holdout/. `--by` takes its value in the same token
    // for that reason, so no argument here can ever be read as a directory.
    const orders = Object.keys(RANK_ORDERS);
    const accepted = new Set(['--json', ...orders.map((o) => `--by=${o}`)]);
    const rejected = args.find((arg) => !accepted.has(arg));
    if (rejected !== undefined) {
        throw new Error(
            `only --json and --by=<${orders.join('|')}> are accepted`,
        );
    }
    const order = args.find((arg) => arg.startsWith('--by='))
        ?.slice('--by='.length) ?? 'advance';

    const files = listSessionFiles(DEVELOPMENT_DIR);
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT)
        throw new Error('development count changed');

    const rows = [];
    for (const file of files) rows.push(await scanSession(file));

    if (json) {
        console.log(JSON.stringify(
            { rows, order, ranking: rankCandidates(rows, order) }, null, 2,
        ));
    } else report(rows, order);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`Debt scan failed: ${error.message}`);
        process.exitCode = 1;
    });
}
