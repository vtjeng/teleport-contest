#!/usr/bin/env node

// One replay of the development sessions, reporting where the JavaScript port
// stops and what each session's recorded input still owes it.
//
// The port is fail-closed: it ends a segment at a boundary rather than guess at
// unported behavior. That splits every question about the port's remaining work
// in two, and every figure this script prints is labelled with the half it
// comes from.
//
// OBSERVED. Everything up to a session's first stop is replayed, so the stop is
// a measurement: the boundary the port raised, the recorded keystroke it
// refused, that keystroke's command under the session's own bindings, and C's
// message on that step. The two censuses group those measurements and carry the
// recorded steps standing behind each one. Those steps state an upper bound on
// what porting the boundary could earn; they do not forecast it, because a
// session blocked on one owner routinely blocks again on another.
//
// MODELED. Nothing past a stop is observable, so the debt behind it is derived
// instead: this script differences each session's ENTIRE recorded input against
// the commands the port dispatches. A session's debt, `supports` and `unlocks`
// all come from that model.
//
// RECONCILED. The two halves are computed by different routes over the same
// replay, so they can disagree, and a disagreement nobody sees is what this
// script exists to prevent. The refused-command census resolves the refused
// byte through the binding table alone; the model reads the recorded cursor
// first, so it can tell a command from a byte answering a prompt. Where they
// disagree the census names a command no session issued and no row of the
// behavior table can carry, and the reconciliation section says so instead of
// leaving the row to be found by running two scans and diffing them by hand.
//
// `supports` counts screens that stop matching if a port matching every
// recorded screen loses this behavior. That is every screen from the behavior's
// first use to the end of each session that uses it. It is exact for a command,
// because the recording states where the command is first issued. Behaviors
// overlap, since a late screen rests on every behavior used before it, so this
// column does not sum to the total.
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
// `--by=` chooses which column orders the behavior table. `AGENTS.md` makes
// `.agents/selection.md` the authority on selection, and that file states the
// rule: `--by=unlocks` orders the candidates by the look-ahead forecast's
// starting figure, and a classifier caps each session's stretch before the
// figure is trusted. `--ahead=<behavior>` prints the message stream that
// capping read works from. The raw `unlocks` count is an upper bound; measured
// against three closed goals it overstated by 5.8, 4.8 and 26 times.
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
// the hero's glyph.
//
// The estimator this leaves is stated in `ambiguous` below: a step whose cursor
// rests on a map row over a non-blank glyph that is not the hero's is neither
// classified nor silently dropped, because a polymorphed or swallowed hero
// draws something else and would go uncounted.
//
// Sealed-holdout rule: DEVELOPMENT_DIR is fixed and this script accepts no path
// argument, so it cannot be aimed at sessions/holdout/. Every option carries
// its value in the same token, so no argument can be read as a directory, and
// `--ahead=`'s value is only ever compared against the behavior names this scan
// produced -- it is never opened.

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

// Keep routine scanning on the reviewed side of the fixed 33/11 split, the
// same guard scripts/score-development.mjs applies.
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

// The judge builds each segment's input from exactly these fields; mirroring
// frozen/ps_test_runner.mjs replayInputFor() keeps this scan aligned with the
// development score rather than with a slightly different replay.
function replayInputFor(segment) {
    return {
        seed: segment.seed,
        datetime: segment.datetime,
        nethackrc: segment.nethackrc,
        moves: segment.moves,
    };
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

// The port emits one screen per input boundary, in the same order the recorder
// captured its steps, so the count of screens a segment emitted indexes the
// recorded step whose keystroke the port never consumed.
export function stopStepIndex(screensEmitted) {
    return screensEmitted;
}

// C's own top line at the stop step. It says what the reference program did
// with the refused keystroke, which is a diagnostic pointer to the upstream
// owner — never a specification. The specification is the C function.
export function recordedTopLine(step) {
    if (!step?.screen) return '';
    return decodeScreen(step.screen)[0].map(cell => cell.ch).join('').trimEnd();
}

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
 * copied, so this scan cannot drift from the boundary it measures.
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
 * Resolve a keystroke through the port's own binding model for this session.
 * Sessions rebind keys — seed2600 carries `BIND=v:inventory` — so matching raw
 * characters against a fixed table misnames their commands.
 */
function resolvedCommand(key) {
    const model = game?.commandBindings;
    if (!model || typeof key !== 'string' || key.length === 0) return null;
    // bindingAt() indexes by character code, not by character.
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
            // the terminator that runs the command. Charging the behavior from
            // the `#` would take those frames off a function that already earns
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

/** The screens a session has yet to earn: every recorded step it never drew. */
export function ceilingFor(row) {
    return row.recordedSteps - row.screensEmitted;
}

/**
 * Replay one session once, collecting both halves of the report.
 *
 * The observed half is fixed at the first boundary: after that the port is
 * replaying from a state the stopped segment never reached, so its later
 * screens are emitted and wrong. Counting those would overstate the total by
 * 106, at 573 against the 467 scripts/score-development.mjs matched on 31 July
 * 2026. The modeled half keeps reading every later segment, because a session's
 * debt is the whole set of behaviors between it and its last recorded screen.
 */
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
    let stop = null;
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
        const segmentScreens = (segmentGame.getScreens?.() ?? []).length;
        const steps = segment.steps || [];
        if (stop === null) screensEmitted += segmentScreens;
        // Read the bindings before the next segment overwrites the shared game
        // singleton. Both the refused keystroke below and this segment's issued
        // commands resolve through them.
        if (boundary && stop === null) {
            const step = steps[stopStepIndex(segmentScreens)];
            stop = {
                boundary: boundary.message,
                commandRefusal:
                    boundary instanceof UnsupportedHeroCommandBoundaryError,
                key: step?.key ?? null,
                command: resolvedCommand(step?.key),
                message: recordedTopLine(step),
            };
        }
        const issued = commandsIssued(steps);
        answers += issued.answers;
        ambiguous += issued.ambiguous;
        for (const { index, command } of issued.commands)
            issuedAll.push({ index: stepOffset + index, command });
        // A stop that is not a command refusal names a behavior the input
        // stream cannot: the port reached a behavior it has not ported. Its
        // first use is the step the port never consumed. Only the FIRST such
        // behavior per session is visible, because the port stops there and
        // never reports what stands behind it; that censoring is why `unlocks`
        // is an upper bound.
        if (boundary && !(boundary instanceof UnsupportedHeroCommandBoundaryError)
            && behavioral === null)
            behavioral = { member: boundary.message, at: screensEmitted };
        stepOffset += steps.length;
    }

    // Behaviors are assembled by the caller, once every session has been
    // scanned, because the supported set depends on what the port executed
    // across all of them. See executedCommands() below.
    return {
        file,
        screensEmitted,
        recordedSteps,
        boundary: stop?.boundary ?? null,
        commandRefusal: stop?.commandRefusal ?? false,
        key: stop?.key ?? null,
        command: stop?.command ?? null,
        message: stop?.message ?? '',
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
 * ride sessions with an earliest behavior sitting 15 and 2 steps before the
 * step they actually stopped on.
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

// Group observed rows by a caller-chosen field, carrying the summed ceiling so
// the output states how much of the set each class stands in front of.
export function censusBy(rows, field) {
    const groups = new Map();
    for (const row of rows) {
        const key = row[field] ?? '(none)';
        const group = groups.get(key) ?? { key, sessions: 0, ceiling: 0 };
        group.sessions += 1;
        group.ceiling += ceilingFor(row);
        groups.set(key, group);
    }
    return [...groups.values()].sort(
        (a, b) => b.sessions - a.sessions || b.ceiling - a.ceiling,
    );
}

/**
 * Rank every behavior by how much of the recorded score depends on it.
 *
 * The two columns answer different questions and disagree usefully. A high
 * `supports` with a low `unlocks` is a bottleneck buried behind another one; a
 * high `unlocks` is the next goal to take. The header states what each counts.
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
 * Check each session's earliest behavior against where the port actually
 * stopped.
 *
 * The port fail-closes at the first behavior it has not ported, so the earliest
 * behavior the model derives from the recorded input must sit at exactly the
 * step the port never consumed. The two are computed by different routes: the
 * stop comes from replaying the port, the behavior from reading cursors and
 * bindings out of the recording. Any disagreement means the model read the
 * input wrongly, so the report states the count.
 *
 * This caught the extended-command behaviors being charged from the `#` that
 * opens the prompt instead of the terminator that runs the command.
 */
export function stopPointAgreement(rows) {
    const scored = rows.filter((row) => row.behaviors.length > 0);
    const mismatches = scored.filter(
        (row) => row.behaviors[0].at !== row.screensEmitted,
    );
    return { agree: scored.length - mismatches.length, total: scored.length,
        mismatches };
}

/**
 * Sort every stopped session into how its observed stop meets its modeled
 * earliest behavior.
 *
 * - `carried`: the boundary is not a command refusal, so the model has no way
 *   to derive it from the recorded input and carries the port's own message
 *   instead. The two agree by construction.
 * - `alike`: a command refusal whose refused byte resolves, through the
 *   session's bindings, to the behavior the model names.
 * - `differing`: a command refusal the two name differently. The model reads
 *   the recorded cursor and the census does not, so this is where the census
 *   names a command nobody issued. The `\n` that terminates an
 *   extended-command prompt is the standing case: it is Ctrl-J, which the
 *   binding table names `rushsouth`.
 * - `unreconciled`: the model has no behavior at the step the port refused.
 *   That means it believes the port supports what the port just refused, and
 *   no row of the behavior table stands for the stop. Any row here needs a
 *   human. A counted rush would land here: `readSimpleCommand()` refuses the
 *   count's leading digit, which is bound to no command and so is never debt,
 *   while `ADMITTED_RUN_MODES` admits the rush that follows it.
 */
export function reconcile(rows) {
    const carried = [];
    const alike = [];
    const differing = [];
    const unreconciled = [];
    for (const row of rows) {
        if (row.boundary === null) continue;
        const modeled = row.behaviors[0] ?? null;
        if (!row.commandRefusal) {
            if (modeled?.member === row.boundary) carried.push(row);
            else unreconciled.push(row);
        } else if (!modeled || modeled.at !== row.screensEmitted) {
            unreconciled.push(row);
        } else if (modeled.member === row.command) {
            alike.push(row);
        } else {
            differing.push(row);
        }
    }
    return { carried, alike, differing, unreconciled };
}

/**
 * Collapse the differing sessions into the refused-command census rows they
 * produce, each carrying the behaviors the model names for those same sessions.
 */
export function refusalsWithoutBehavior(differing) {
    const groups = new Map();
    for (const row of differing) {
        const key = row.command ?? '(none)';
        const group = groups.get(key)
            ?? { key, sessions: 0, ceiling: 0, modeled: new Map() };
        group.sessions += 1;
        group.ceiling += ceilingFor(row);
        const member = row.behaviors[0].member;
        group.modeled.set(member, (group.modeled.get(member) ?? 0) + 1);
        groups.set(key, group);
    }
    return [...groups.values()].sort(
        (a, b) => b.sessions - a.sessions || b.ceiling - a.ceiling,
    );
}

/**
 * The census ceiling of each behavior sessions stop on, beside that behavior's
 * `supports`.
 *
 * The census sums the steps behind the sessions that STOP on a behavior;
 * `supports` sums the steps behind every session that NEEDS it. They are the
 * same figure whenever no other session needs the behavior past its own stop,
 * which holds for every boundary the model cannot read out of the input at all.
 * Reporting both makes the census's column a projection of `supports` rather
 * than a second measurement to maintain.
 */
export function ceilingAgainstSupports(rows, ranking) {
    const supports = new Map(ranking.map((e) => [e.member, e.supports]));
    const observed = new Map();
    for (const row of rows) {
        const modeled = row.behaviors[0];
        if (row.boundary === null || !modeled) continue;
        const entry = observed.get(modeled.member)
            ?? { member: modeled.member, ceiling: 0, supports: 0 };
        entry.ceiling += ceilingFor(row);
        entry.supports = supports.get(modeled.member) ?? 0;
        observed.set(modeled.member, entry);
    }
    const same = [];
    const differs = [];
    for (const entry of observed.values())
        (entry.ceiling === entry.supports ? same : differs).push(entry);
    differs.sort((a, b) => b.supports - a.supports
        || a.member.localeCompare(b.member));
    return { same, differs };
}

/** Every recorded step of one session, flattened across its segments. */
export function recordedStepsFor(file) {
    const data = normalizeSession(
        JSON.parse(readFileSync(join(DEVELOPMENT_DIR, file), 'utf8')),
    );
    return data.segments.flatMap((segment) => segment.steps || []);
}

/**
 * The stretch a session replays next if its current stop is ported: from its
 * earliest unmet behavior to its second, or to the recording's end when no
 * second one is visible. Returns null for a session with no unmet behavior.
 */
export function aheadStretch(row) {
    const [current, next] = row.behaviors;
    if (!current) return null;
    return {
        member: current.member,
        from: current.at,
        to: next ? next.at : row.recordedSteps,
    };
}

/** Collapse consecutive identical message lines into {line, count} runs. */
export function dedupeMessages(lines) {
    const runs = [];
    for (const line of lines) {
        const last = runs[runs.length - 1];
        if (last && last.line === line) last.count += 1;
        else runs.push({ line, count: 1 });
    }
    return runs;
}

function formatKey(key) {
    return key == null ? '-' : JSON.stringify(key);
}

/** Center a group heading over the columns it names. */
function centered(label, width) {
    const left = Math.floor((width - label.length) / 2);
    return ' '.repeat(left) + label + ' '.repeat(width - label.length - left);
}

function reportStops(rows) {
    const nameWidth = Math.max(...rows.map((r) => r.file.length));
    console.log('Where each development session first stops (observed)\n');
    for (const row of rows) {
        console.log(
            [
                row.file.padEnd(nameWidth),
                `${row.screensEmitted}/${row.recordedSteps}`.padStart(10),
                formatKey(row.key).padEnd(9),
                (row.command ?? '-').padEnd(14),
                row.boundary ?? 'no stop (input exhausted)',
                row.message ? `| C: ${JSON.stringify(row.message)}` : '',
            ].join('  ').trimEnd(),
        );
    }

    for (const [title, field] of [
        ['\nBoundary census, observed (sessions, screens standing behind it)',
            'boundary'],
        ['\nRefused command census, observed', 'command'],
    ]) {
        console.log(title);
        for (const group of censusBy(rows, field)) {
            console.log(
                `  ${String(group.sessions).padStart(2)}  `
                + `${String(group.ceiling).padStart(5)}  ${group.key}`,
            );
        }
    }
}

function reportDebt(rows) {
    const nameWidth = Math.max(...rows.map((r) => r.file.length));
    console.log('\nWhole remaining debt per development session (modeled)\n');
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
}

function reportReconciliation(rows, ranking) {
    const { carried, alike, differing, unreconciled } = reconcile(rows);
    const agreement = stopPointAgreement(rows);
    console.log(
        '\nReconciliation of the observed stops against the modeled behaviors\n',
    );
    console.log(
        `  ${String(agreement.agree).padStart(3)} of ${agreement.total} `
        + 'sessions place their earliest modeled behavior at the step the port '
        + 'stopped on',
    );
    for (const row of agreement.mismatches) {
        console.log(
            `      MISMATCH ${row.file}: stopped at ${row.screensEmitted}, `
            + `earliest behavior ${row.behaviors[0].member} at `
            + `${row.behaviors[0].at}`,
        );
    }
    console.log(
        `  ${String(carried.length).padStart(3)} stops the model carries as `
        + "themselves, the boundary being the port's own message rather than a "
        + 'command refusal',
    );
    console.log(
        `  ${String(alike.length).padStart(3)} command refusals the refused `
        + "byte's binding and the model name alike",
    );
    console.log(
        `  ${String(differing.length).padStart(3)} command refusals the two `
        + 'name differently',
    );
    console.log(
        `  ${String(unreconciled.length).padStart(3)} stops with no modeled `
        + 'behavior at the step the port refused',
    );
    for (const row of unreconciled) {
        const modeled = row.behaviors[0];
        console.log(
            `      UNRECONCILED ${row.file}: stopped at ${row.screensEmitted} `
            + `on ${JSON.stringify(row.boundary)}; the model names `
            + `${modeled ? `${modeled.member} at ${modeled.at}`
                : 'no behavior at all'}`,
        );
    }

    if (differing.length) {
        console.log(
            '\n  Refused-command census rows the behavior table cannot hold. '
            + 'The census\n  resolves the refused byte through the binding '
            + 'table alone; the model reads\n  the recorded cursor first, so a '
            + 'byte answering a prompt is not a command to\n  it. Where the two '
            + 'differ, the census row names a command no session issued,\n  and '
            + 'the behavior it stands in for is the one after the arrow.\n',
        );
        for (const group of refusalsWithoutBehavior(differing)) {
            const named = [...group.modeled.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([member, count]) => (count > 1
                    ? `${member} (${count})` : member))
                .join(', ');
            console.log(
                `  ${String(group.sessions).padStart(2)}  `
                + `${String(group.ceiling).padStart(5)}  `
                + `${group.key}  ->  ${named}`,
            );
        }
    }

    const { same, differs } = ceilingAgainstSupports(rows, ranking);
    console.log(
        `\n  ${same.length} of ${same.length + differs.length} behaviors that `
        + 'sessions stop on report the same figure in the\n  census and in '
        + "supports, so the census's screens-standing-behind column is a\n  "
        + 'projection of supports rather than a second measurement. The rest '
        + 'are\n  commands a session also needs past its own stop, which the '
        + 'census cannot see:',
    );
    for (const entry of differs) {
        console.log(
            `  ${String(entry.ceiling).padStart(6)} -> `
            + `${String(entry.supports).padStart(6)}  ${entry.member}`,
        );
    }
}

function reportRanking(rows, recorded, order) {
    console.log(
        `\nBehaviors by the screens that depend on them, of ${recorded} `
        + `recorded, ordered by ${order} (modeled)`,
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
}

function report(rows, order) {
    reportStops(rows);
    reportDebt(rows);

    const emitted = rows.reduce((n, r) => n + r.screensEmitted, 0);
    const recorded = rows.reduce((n, r) => n + r.recordedSteps, 0);
    const ambiguous = rows.reduce((n, r) => n + r.ambiguous, 0);
    const answers = rows.reduce((n, r) => n + r.answers, 0);
    console.log(
        `\n${rows.length} sessions; ${emitted} screens emitted of ${recorded} `
        + `recorded; ${answers} recorded bytes answered a prompt and `
        + `${ambiguous} could not be classified. `
        + 'scripts/score-development.mjs is the authority on how many of those '
        + 'emitted screens match.',
    );

    reportReconciliation(rows, rankCandidates(rows, order));
    reportRanking(rows, recorded, order);

    console.log(legend(recorded));
}

// The legend defines every column this report prints, so it is built here
// rather than inline: a test can read it without paying for a replay.
export function legend(recorded) {
    return (
        '\nObserved figures come from replaying the port, and cover everything '
        + "up to each\nsession's first stop. Modeled figures are derived from "
        + 'the recorded input,\nbecause nothing past a stop is observable at '
        + 'all.'
        + '\n\nBoth tables sort for display alone. Neither ordering ranks a row '
        + 'by priority, and the order a candidate is selected in is the one '
        + '.agents/selection.md states.'
        + '\n\nsupports counts screens that stop matching if a port matching '
        + `all ${recorded} recorded screens loses this behavior. That is every `
        + "screen from the behavior's first use to the end of each session that "
        + 'uses it. It is exact for a command, because the recording states '
        + 'where the command is first issued. Behaviors overlap, since a late '
        + 'screen rests on every behavior used before it, so this column does '
        + 'not sum to the total.'
        + '\n\nunlocks counts screens porting this behavior next would earn. '
        + 'Those come from the sessions where it is the earliest unmet '
        + 'behavior. It is an upper bound: a second behavior hidden inside the '
        + 'gap is invisible, because the port stops at the first one it cannot '
        + 'do.'
        + '\n\nFor both, the sessions column counts the sessions holding those '
        + 'screens, as guidance. Every session with an unmet behavior has '
        + 'exactly one earliest, so the unlocks sessions column sums to the '
        + 'number of unfinished sessions.'
    );
}

/**
 * The look-ahead read: every stopped session's recorded message lines between
 * its current stop and its next unmet behavior, for one candidate behavior.
 * "Rank by the look-ahead forecast" in `.agents/selection.md` hands each
 * session's stream to a classifier subagent, which caps the session's forecast
 * at the first message implying an unported or partly ported behavior inside
 * the stretch.
 */
function reportAhead(rows, target) {
    const matched = rows.filter((row) => aheadStretch(row)?.member === target);
    if (matched.length === 0) {
        const members = [...new Set(rows.map((row) => aheadStretch(row)?.member)
            .filter(Boolean))].sort();
        console.log(`No session stops first on "${target}". Current first stops:`);
        for (const member of members) console.log(`  ${member}`);
        return false;
    }
    let total = 0;
    for (const row of matched) {
        const stretch = aheadStretch(row);
        const steps = recordedStepsFor(row.file).slice(stretch.from, stretch.to);
        total += steps.length;
        console.log(`== ${row.file}: steps ${stretch.from}..${stretch.to} `
            + `(${steps.length} ahead)`);
        for (const { line, count } of dedupeMessages(steps.map(recordedTopLine)))
            console.log(count > 1 ? `${line}  [x${count}]` : line);
        console.log('');
    }
    console.log(`${matched.length} session(s), ${total} recorded steps ahead `
        + `of "${target}".`);
    return true;
}

/** The stretches `--ahead=<behavior>` prints, as data. */
function aheadStretches(rows, target) {
    return rows
        .filter((row) => aheadStretch(row)?.member === target)
        .map((row) => {
            const stretch = aheadStretch(row);
            return {
                file: row.file,
                ...stretch,
                messages: dedupeMessages(
                    recordedStepsFor(row.file)
                        .slice(stretch.from, stretch.to)
                        .map(recordedTopLine),
                ),
            };
        });
}

const AHEAD_PREFIX = '--ahead=';

export async function main(args) {
    const orders = Object.keys(RANK_ORDERS);
    // .agents/selection.md documents --ahead alone and sends a reader here for
    // the rest, so --help answers before the replay rather than by being
    // rejected as an unknown flag.
    if (args.includes('--help')) {
        console.log(
            `Usage: node scripts/scan-sessions.mjs [--by=<${orders.join('|')}>]`
            + ' [--ahead=<behavior>] [--json]\n'
            + `\n  --by=<${orders.join('|')}>  order the behavior table.`
            + ' Default: unlocks.'
            + '\n  --ahead=<behavior>       print each stopped session\'s'
            + ' recorded messages between\n'
            + '                           its stop and its next unmet behavior.'
            + '\n  --json                   emit the same figures in'
            + ' machine-readable form.'
            + '\n\nThe scanned directory is fixed and no path argument is'
            + ' accepted, so this scan\ncannot be aimed at sessions/holdout/.',
        );
        return undefined;
    }
    // Reject every other argument, including any bare path: this scan must not
    // be aimable at sessions/holdout/. Every option carries its value in the
    // same token for that reason, so no argument here can ever be read as a
    // directory.
    const rejected = args.find((arg) => arg !== '--json'
        && !orders.some((order) => arg === `--by=${order}`)
        && !arg.startsWith(AHEAD_PREFIX));
    if (rejected !== undefined) {
        throw new Error(
            `only --json, --by=<${orders.join('|')}> and `
            + `${AHEAD_PREFIX}<behavior> are accepted`,
        );
    }
    const json = args.includes('--json');
    const order = args.find((arg) => arg.startsWith('--by='))
        ?.slice('--by='.length) ?? 'unlocks';
    const ahead = args.find((arg) => arg.startsWith(AHEAD_PREFIX))
        ?.slice(AHEAD_PREFIX.length);

    const files = listSessionFiles(DEVELOPMENT_DIR);
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT)
        throw new Error('development count changed');

    const scanned = [];
    for (const file of files) scanned.push(await scanSession(file));
    const rows = attachBehaviors(scanned);

    if (ahead !== undefined) {
        if (json) {
            const stretches = aheadStretches(rows, ahead);
            console.log(JSON.stringify({ ahead, stretches }, null, 2));
            if (stretches.length === 0) process.exitCode = 1;
        } else if (!reportAhead(rows, ahead)) process.exitCode = 1;
        return;
    }

    if (json) {
        const { carried, alike, differing, unreconciled } = reconcile(rows);
        const ranking = rankCandidates(rows, order);
        console.log(JSON.stringify({
            rows,
            order,
            ranking,
            reconciliation: {
                stopPointAgreement: stopPointAgreement(rows),
                carried: carried.map((row) => row.file),
                alike: alike.map((row) => row.file),
                differing: differing.map((row) => ({
                    file: row.file,
                    refused: row.command,
                    modeled: row.behaviors[0].member,
                })),
                unreconciled: unreconciled.map((row) => row.file),
                ceilingAgainstSupports: ceilingAgainstSupports(rows, ranking),
            },
        }, null, 2));
    } else report(rows, order);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`Session scan failed: ${error.message}`);
        process.exitCode = 1;
    });
}
