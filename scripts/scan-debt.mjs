#!/usr/bin/env node

// Whole remaining command debt per development session, and the screens each
// candidate would unblock.
//
// scripts/scan-stops.mjs reports the fail-closed boundary each session reaches
// FIRST and is silent about everything behind it, so its step counts state an
// upper bound and nothing it prints says how far a session is from completing.
// Ranking a goal by the steps standing behind one boundary has overestimated by
// one to two orders of magnitude, because a session blocked on one behavior
// routinely blocks again on another.
//
// This script answers the other question. It differences a session's ENTIRE
// recorded input against the commands the port dispatches, so a session's debt
// is the whole set of behaviors between it and its last recorded screen, and it
// reports two measures over that set.
//
// `supports` counts screens that stop matching if a port matching all 7,765
// recorded screens loses this behavior. That is every screen from the
// behavior's first use to the end of each session that uses it. It is exact for
// a command, because the recording states where the command is first issued.
// Behaviors overlap, since a late screen rests on every behavior used before
// it, so this column does not sum to the total.
//
// `unlocks` counts screens porting this behavior next would earn. Those come
// from the sessions where it is the earliest unmet behavior. It is an upper
// bound: a second behavior hidden inside the gap is invisible, because the port
// stops at the first one it cannot do.
//
// For both, the sessions column counts the sessions holding those screens, as
// guidance. Every session with an unmet behavior has exactly one earliest, so
// the `unlocks` sessions column sums to the number of unfinished sessions.
//
// `--by=` chooses which column orders the report. `.agents/selection.md` states
// the selection rule: filter to behaviors whose `unlocks` is not 0, then rank
// those by `supports`. Do not rank by `unlocks`; measured against three closed
// goals it overstated by 5.8, 4.8 and 26 times.
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
    let dispatchAt = index;
    for (; cursor < steps.length; cursor++) {
        const key = steps[cursor].key;
        if (typeof key !== 'string' || key.length === 0) break;
        if (PROMPT_TERMINATORS.has(key)) { dispatchAt = cursor; cursor++; break; }
        typed += key;
        dispatchAt = cursor;
    }
    const matches = extcmdlist.filter(
        (entry) => entry.ef_txt?.startsWith(typed),
    );
    const name = typed && matches.length === 1 ? matches[0].ef_txt : typed;
    return { name: `#${name}`, nextIndex: cursor, dispatchAt };
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
            // The behavior sits at the byte that DISPATCHES the command, not at
            // the `#` that opened the prompt. `doextcmd()` is ported, so the
            // port paints every prompt frame the reference program painted for
            // `#`, the name bytes and the autocomplete, and diverges only at
            // the terminator that runs the command. Charging the behavior from the
            // `#` would take those frames off a function that already earns
            // them: 5 screens per `#ride` in each of the two sessions that use
            // it, which overstated that behavior by 10 of 92.
            commands.push({ index: extended.dispatchAt, command: extended.name });
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
 * The behaviors a session needs, earliest use first.
 *
 * A command issued more than once keeps its EARLIEST index, because that is
 * where a port without it would first diverge; a later use changes nothing. The
 * behavioral gate, when the port reached one, enters at the step it stopped
 * on. Ties break by name so the order is total and the report is stable.
 */
export function assembleBehaviors(issued, supported, behavioral = null) {
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

export async function scanSession(file) {
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
        // A stop that is not a command refusal names a behavior the input stream
        // cannot: the port reached a behavior it has not ported. Its first use
        // is the step the port never consumed. Only the FIRST such behavior per
        // session is visible, because the port stops there and never reports
        // what stands behind it; that censoring is why `unlocks` below is an
        // upper bound.
        if (boundary && !(boundary instanceof UnsupportedHeroCommandBoundaryError)
            && behavioral === null)
            behavioral = { member: boundary.message, at: screensEmitted };
        if (boundary) stopped = true;
        stepOffset += (segment.steps || []).length;
    }

    // Behaviors are assembled by the caller, once every session has been scanned,
    // because the supported set depends on what the port executed across all of
    // them. See executedCommands() below.
    return {
        file,
        screensEmitted,
        recordedSteps,
        behavioral,
        issued: issuedAll,
        answers,
        ambiguous,
    };
}

/**
 * Every command the port demonstrably ran, taken from the sessions themselves.
 *
 * `supportedCommands()` reads `ADMITTED_COMMANDS`, which gates only the FIRST
 * byte of a command. An extended command reaches its handler through
 * `doextcmd()` and never appears in that list, so porting one leaves it reading
 * as debt. A command issued before the step the port stopped on is one the port
 * executed, which settles the question without a second table to maintain.
 *
 * `stopPointAgreement()` is what exposed the gap: porting `#ride` left both
 * ride sessions with an earliest behavior sitting 15 and 2 steps before the step
 * they actually stopped on.
 */
export function executedCommands(rows) {
    const executed = new Set();
    for (const row of rows)
        for (const { index, command } of row.issued)
            if (index < row.screensEmitted) executed.add(command);
    return executed;
}

/** Attach behaviors to every scanned row, using one supported set for all. */
export function attachBehaviors(rows) {
    const supported = supportedCommands();
    for (const command of executedCommands(rows)) supported.add(command);
    return rows.map((row) => {
        const behaviors = assembleBehaviors(row.issued, supported, row.behavioral);
        return {
            ...row,
            behavioral: row.behavioral?.member ?? null,
            debt: behaviors.map((behavior) => behavior.member).sort(),
            behaviors,
        };
    });
}

/**
 * An extended command is supported when the port dispatches the command its
 * name resolves to; `#` itself opens the prompt and is admitted already.
 */
function isSupported(command, supported) {
    // Two spellings reach this set. `executedCommands()` adds what the report
    // prints, `#ride`, while `ADMITTED_COMMANDS` names the command a `#` prompt
    // resolves to, `look`, without the prefix. Accept either.
    if (supported.has(command)) return true;
    if (!command.startsWith(EXTENDED_COMMAND_KEY)) return false;
    return supported.has(command.slice(EXTENDED_COMMAND_KEY.length));
}

/**
 * Rank every behavior by how much of the recorded score depends on it.
 *
 * `supports` is the ablation measure: take a port that matches every recorded
 * screen, remove this one behavior, and count the screens that stop matching. A
 * session cannot proceed past a capability it lacks, so everything from that
 * behavior's first use to the end of the session is lost. Summed over the sessions
 * that use it, that is the share of the whole 7,765-screen population standing
 * on this behavior. Behaviors overlap by design: a screen late in a session is supports
 * behind every behavior used before it, so these columns total far more than 7,765
 * and are read per row, never added up.
 *
 * `unlocks` is what porting it next would actually earn. A session moves from
 * its earliest unmet behavior only as far as its second, so a candidate collects
 * the gap between the two in the sessions where it is the current bottleneck.
 * It is an upper bound: a session's later behavioral gates are invisible,
 * because the port stops at the first one and never reports what stands behind
 * it, so a gap measured to the next COMMAND may hide a behavioral gate inside
 * it.
 *
 * The two answer different questions and disagree usefully. A high `supports` with
 * a low `unlocks` is a bottleneck buried behind another one; a high `unlocks`
 * is the next goal to take.
 */
export const RANK_ORDERS = Object.freeze({
    // What to port next: the screens a candidate earns now.
    unlocks: (a, b) => b.unlocks - a.unlocks || b.supports - a.supports,
    // What the score rests on: the screens that depend on it at all.
    supports: (a, b) => b.supports - a.supports || b.unlocks - a.unlocks,
});

export function rankCandidates(rows, order = 'unlocks') {
    const compare = RANK_ORDERS[order];
    if (!compare) throw new Error(`unknown order: ${order}`);
    const candidates = new Map();
    for (const row of rows) {
        for (const [position, behavior] of row.behaviors.entries()) {
            const entry = candidates.get(behavior.member) ?? {
                member: behavior.member,
                supports: 0,
                supportsSessions: 0,
                unlocks: 0,
                unlocksSessions: 0,
            };
            entry.supports += row.recordedSteps - behavior.at;
            entry.supportsSessions += 1;
            if (position === 0) {
                entry.unlocksSessions += 1;
                const next = row.behaviors[1];
                entry.unlocks += (next ? next.at : row.recordedSteps) - behavior.at;
            }
            candidates.set(behavior.member, entry);
        }
    }
    return [...candidates.values()].sort(
        (a, b) => compare(a, b) || a.member.localeCompare(b.member),
    );
}

/**
 * Check each session's earliest behavior against where the port actually stopped.
 *
 * The port fail-closes at the first behavior it has not ported, so the earliest
 * behavior this script derives from the recorded input must sit at exactly the
 * step the port never consumed. The two are computed by different routes: the
 * stop comes from replaying the port, the behavior from reading cursors and
 * bindings out of the recording. Any disagreement means the classifier read the
 * input wrongly, so the report states the count.
 *
 * This caught the extended-command behaviors being charged from the `#` that opens
 * the prompt instead of the terminator that runs the command.
 */
export function stopPointAgreement(rows) {
    const scored = rows.filter((row) => row.behaviors.length > 0);
    const mismatches = scored.filter(
        (row) => row.behaviors[0].at !== row.screensEmitted,
    );
    return { agree: scored.length - mismatches.length, total: scored.length,
        mismatches };
}

/** Center a group heading over the columns it names. */
function centered(label, width) {
    const left = Math.floor((width - label.length) / 2);
    return ' '.repeat(left) + label + ' '.repeat(width - label.length - left);
}

function report(rows, order = 'unlocks') {
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

    const agreement = stopPointAgreement(rows);
    console.log(
        `${agreement.agree} of ${agreement.total} sessions place their earliest `
        + 'behavior at the step the port stopped on.',
    );
    for (const row of agreement.mismatches) {
        console.log(
            `  MISMATCH ${row.file}: stopped at ${row.screensEmitted}, `
            + `earliest behavior ${row.behaviors[0].member} at ${row.behaviors[0].at}`,
        );
    }

    console.log(
        `\nBehaviors by the screens that depend on them, of ${recorded} recorded`
        + `, ordered by ${order}`,
    );
    // Each measure is a (screens, sessions) pair, so the header groups its two
    // columns under one name rather than leaving four columns to be read as
    // four separate quantities.
    console.log(`\n  ${centered('supports', 17)}  ${centered('unlocks', 17)}`);
    console.log(
        `  ${'screens'.padStart(7)}  ${'sessions'.padStart(8)}  `
        + `${'screens'.padStart(7)}  ${'sessions'.padStart(8)}  behavior`,
    );
    for (const entry of rankCandidates(rows, order)) {
        console.log(
            `  ${String(entry.supports).padStart(7)}  `
            + `${String(entry.supportsSessions).padStart(8)}  `
            + `${String(entry.unlocks).padStart(7)}  `
            + `${String(entry.unlocksSessions).padStart(8)}  ${entry.member}`,
        );
    }
    console.log(
        '\nsupports counts screens that stop matching if a port matching all '
        + `${recorded} recorded screens loses this behavior. That is every `
        + "screen from the behavior's first use to the end of each session that "
        + 'uses it. It is exact for a command, because the recording states where '
        + 'the command is first issued. Behaviors overlap, since a late screen '
        + 'rests on every behavior used before it, so this column does not sum to '
        + 'the total.'
        + '\n\nunlocks counts screens porting this behavior next would earn. '
        + 'Those come from the sessions where it is the earliest unmet behavior. '
        + 'It is an upper bound: a second behavior hidden inside the gap is '
        + 'invisible, because the port stops at the first one it cannot do.'
        + '\n\nFor both, the sessions column counts the sessions holding those '
        + 'screens, as guidance. Every session with an unmet behavior has exactly '
        + 'one earliest, so the unlocks sessions column sums to the number of '
        + 'unfinished sessions.',
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
        ?.slice('--by='.length) ?? 'unlocks';

    const files = listSessionFiles(DEVELOPMENT_DIR);
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT)
        throw new Error('development count changed');

    const scanned = [];
    for (const file of files) scanned.push(await scanSession(file));
    const rows = attachBehaviors(scanned);

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
