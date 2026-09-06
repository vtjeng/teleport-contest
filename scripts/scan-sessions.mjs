#!/usr/bin/env node

// Replays the development sessions and reports where the JavaScript port stops
// and where it diverges from the C recording. `scripts/divergence-queue.mjs`
// reads the `--json` output to build the goal selection queue.
//
// The scanned directory is fixed and this script accepts no path argument, so
// it cannot be aimed at sessions/holdout/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeScreen, renderCell } from '../frozen/screen-decode.mjs';
import { normalizeSession } from '../frozen/session_loader.mjs';
import {
    ADMITTED_COMMANDS,
    ADMITTED_RUN_MODES,
    MOVEMENT_INTENTS,
    UnsupportedHeroCommandBoundaryError,
    UnsupportedHeroCommandBranchBoundaryError,
} from '../js/cmd.js';
import { commandForKey } from '../js/command_bindings.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { Terminal } from '../js/terminal.js';
import { Terminal as FrozenTerminal } from '../frozen/terminal.js';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { PROJECT_ROOT, listSessionFiles } from './scoring-workspace.mjs';

// The judge replaces js/terminal.js with frozen/terminal.js before scoring,
// and only the frozen copy defines serialize(), the method js/jsmain.js's
// screen capture calls (`term?.serialize ? term.serialize() : ''`). This scan
// replays in the working tree, where every captured screen is therefore ''
// and no screen comparison is possible. Grafting the judge's serializer onto
// the tree's Terminal reproduces the scoring serialization exactly,
// including its known defects, which is the point: the divergence report
// below must agree with the scorer, not improve on it. The two files differ
// by exactly this one method (`diff js/terminal.js frozen/terminal.js`).
if (!Terminal.prototype.serialize) {
    Terminal.prototype.serialize = FrozenTerminal.prototype.serialize;
}

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

const CACHE_DIR = join(PROJECT_ROOT, '.cache');
const SCAN_CACHE_PATH = join(CACHE_DIR, 'scan-cache.json');

function repositoryHead() {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT })
        .toString().trim();
}

function writeScanCache(rows) {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(SCAN_CACHE_PATH, JSON.stringify({
        sha: repositoryHead(),
        rows,
    }));
}

function readScanCache() {
    if (!existsSync(SCAN_CACHE_PATH)) return null;
    try {
        const cache = JSON.parse(readFileSync(SCAN_CACHE_PATH, 'utf8'));
        if (cache.sha !== repositoryHead()) return null;
        return cache.rows;
    } catch {
        return null;
    }
}


/**
 * Load scan rows from the cache or by replaying all development sessions.
 * Uses the scan cache when HEAD has not changed; replays and writes the cache
 * on a miss.
 */
export async function loadAnnotatedRows() {
    const cached = readScanCache();
    if (cached) return cached;
    const files = listSessionFiles(DEVELOPMENT_DIR);
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT)
        throw new Error('development count changed');
    const scanned = [];
    for (const file of files) scanned.push(await scanSession(file));
    const rows = attachBehaviors(scanned);
    writeScanCache(rows);
    return rows;
}
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

/** The recorded inputs a source trace needs before it assigns a forecast. */
export function formatReplayContext(context) {
    if (!context) return '  replay context unavailable';
    const segments = context.segments ?? [context];
    const lines = [];
    for (const segment of segments) {
        const rc = segment.nethackrc?.trimEnd() || '(empty)';
        lines.push(
            ...(segment.segment === undefined
                ? [] : [`  segment: ${segment.segment}`]),
            `  seed: ${segment.seed}`,
            `  datetime: ${segment.datetime}`,
            '  nethackrc:',
            ...rc.split('\n').map((line) => `    ${line}`),
            `  input through stop: ${JSON.stringify(
                segment.inputThroughStop ?? '',
            )}`,
        );
    }
    lines.push(
        '  verify the exact C branch and its governing state before counting '
            + 'this session',
    );
    return lines.join('\n');
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
 * `admitParsedCommand()` admits ADMITTED_COMMANDS, a movement command whose run
 * mode is one of ADMITTED_RUN_MODES, Escape, and a byte bound to no command.
 * The last two carry no command name and so cannot appear as debt.
 *
 * It answers for the command byte alone. A command this set names is still
 * refused when the count typed ahead of it left more than one repetition, so a
 * stop on such a step reads as unreconciled rather than as debt.
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
/**
 * Whether the port refused the COMMAND, which is the one kind of stop the
 * recorded input can name for itself.
 *
 * `supportedCommands()` resolves each recorded byte against ADMITTED_COMMANDS,
 * which admits a command by its first byte alone. A refusal at that byte is
 * therefore a behavior the model derives from the recording. A refusal below it
 * is not: failClosedCommand() raises js/cmd.js
 * UnsupportedHeroCommandBranchBoundaryError inside a command the port did
 * dispatch, so it refuses a branch rather than the command and no recorded byte
 * stands for it. A boundary raised outside any command is that same case and
 * always was.
 */
export function isCommandRefusal(boundary) {
    return boundary instanceof UnsupportedHeroCommandBoundaryError
        && !(boundary instanceof UnsupportedHeroCommandBranchBoundaryError);
}

/**
 * The first mismatch between the port's replayed output and the recording,
 * confined to replayed input.
 *
 * The observed half of this report otherwise treats every replayed screen as
 * faithful, and the score disagrees for some sessions: a session can emit a
 * screen at every recorded step and still differ from the recording, which
 * `.agents/selection.md` calls a silent divergence. This reports where
 * matching first breaks; scripts/score-development.mjs stays the authority
 * on how many screens match.
 *
 * The caller truncates the C side to the steps the port replayed, so the
 * screen and cursor streams compare value against value. The RNG logs can
 * still differ in length at the truncation tail: the port stops before
 * consuming randomness at a refused step, but the two logs need not end on
 * the same call. A length-only difference therefore reports null for a
 * stopped session, and reports for a session that finished its input, where
 * nothing was truncated and a shorter or longer log is a real divergence.
 */
export function silentDivergence(replayedSegments, jsOutput, stopped) {
    const comparison = compareSessionOutputs(
        { version: 5, segments: replayedSegments },
        jsOutput,
    );
    const lengthKinds = new Set(['js-missing', 'c-missing']);
    const screen = comparison.screenMismatch
        && !(stopped && lengthKinds.has(comparison.screenMismatch.kind))
        ? comparison.screenMismatch : null;
    const rng = comparison.rngMismatch
        && !(stopped && (comparison.rngMismatch.cEntry === undefined
            || comparison.rngMismatch.jsEntry === undefined))
        ? comparison.rngMismatch : null;
    const cursor = comparison.cursorMismatch
        && !(stopped && (!Array.isArray(comparison.cursorMismatch.cCursor)
            || !Array.isArray(comparison.cursorMismatch.jsCursor)))
        ? comparison.cursorMismatch : null;
    return screen || rng || cursor ? { screen, rng, cursor } : null;
}

/**
 * Whether a screen mismatch is caused by the serialize bug (davidbau/teleport-contest#18):
 * frozen/terminal.js serialize() drops attributes from leading spaces, so
 * inverse or underline on a space before the first non-space column is lost
 * in the JS screen string while the C recording preserves it.
 */
export function isSerializeBugMismatch(mismatch) {
    if (!mismatch || mismatch.kind !== 'attr') return false;
    return renderCell(mismatch.cCell) === ' '
        && renderCell(mismatch.jsCell) === ' ';
}

/**
 * Convert an RNG divergence's per-segment stepIndex to a cumulative step
 * index comparable with behavior.at and screen divergence indices.
 */
function cumulativeRngStep(rngDiv, replayedSegments) {
    if (!rngDiv?.location) return null;
    let offset = 0;
    for (let i = 0; i < rngDiv.location.segmentIndex; i++)
        offset += (replayedSegments[i]?.steps || []).length;
    return offset + rngDiv.location.stepIndex;
}

/**
 * Enrich a divergence object with cumulative step indices and serialize-bug
 * detection. The raw divergence from silentDivergence() has per-segment RNG
 * locations and does not classify screen mismatches by cause.
 */
function enrichDivergence(divergence, replayedSegments) {
    if (!divergence) return null;
    const result = { ...divergence };
    if (result.rng) {
        result.rng = {
            ...result.rng,
            stepIndex: cumulativeRngStep(result.rng, replayedSegments),
        };
    }
    if (result.screen) {
        result.serializeBug = isSerializeBugMismatch(result.screen);
    }
    return result;
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
 * The replayed screens, cursors, and RNG calls are also compared with the
 * recording, and the first difference reports through silentDivergence()
 * above.
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
    // The replayed slice of the session, both sides, for silentDivergence():
    // the recorded segments truncated to what the port emitted, and the
    // port's own output streams.
    const replayedSegments = [];
    const replayedRng = [];
    const replayedScreens = [];
    const replayedCursors = [];
    const completedContexts = [];
    // Every command the session issued, numbered across segments so one index
    // orders the whole recording.
    const issuedAll = [];
    let answers = 0;
    let ambiguous = 0;
    const unported = new Set();
    let inputExhausted = false;

    for (const [segmentIndex, segment] of data.segments.entries()) {
        let boundary = null;
        const segmentGame = await runSegment(
            { ...replayInputFor(segment), storage },
            { onBoundary: (error) => { boundary ??= error; } },
        );
        const segmentScreenList = segmentGame.getScreens?.() ?? [];
        const segmentScreens = segmentScreenList.length;
        for (const fn of segmentGame.getUnported?.() ?? []) unported.add(fn);
        if (segmentGame.getInputExhausted?.()) inputExhausted = true;
        const steps = segment.steps || [];
        const contextFor = (inputThroughStop) => ({
            segment: segmentIndex,
            seed: segment.seed,
            datetime: segment.datetime,
            nethackrc: segment.nethackrc ?? '',
            inputThroughStop,
        });
        if (stop === null) {
            screensEmitted += segmentScreens;
            // The port emits one screen per recorded step, so the slice pairs
            // each emitted screen with the step it answers; steps past the
            // emitted count were never consumed.
            replayedSegments.push(
                { ...segment, steps: steps.slice(0, segmentScreens) },
            );
            for (const entry of segmentGame.getRngLog?.() ?? [])
                replayedRng.push(entry);
            for (const screen of segmentScreenList) replayedScreens.push(screen);
            for (const cursor of segmentGame.getCursors?.() ?? [])
                replayedCursors.push(cursor);
        }
        // Read the bindings before the next segment overwrites the shared game
        // singleton. Both the refused keystroke below and this segment's issued
        // commands resolve through them.
        if (boundary && stop === null) {
            const stopIndex = stopStepIndex(segmentScreens);
            const step = steps[stopIndex];
            stop = {
                boundary: boundary.message,
                commandRefusal: isCommandRefusal(boundary),
                key: step?.key ?? null,
                command: resolvedCommand(step?.key),
                // Whether the refused byte began a command, read the way
                // commandsIssued() reads it: from the cursor the step before.
                // Step 0 has no predecessor, so its role cannot be read; say so
                // rather than let cursorState()'s missing-step answer stand in.
                keyCursor: stopIndex > 0
                    ? cursorState(steps[stopIndex - 1])
                    : 'ambiguous',
                message: recordedTopLine(step),
                context: {
                    segments: [
                        ...completedContexts,
                        contextFor(steps.slice(1, stopIndex + 1)
                            .map((entry) => entry.key ?? '').join('')),
                    ],
                },
            };
            // A stop that is not a command refusal names a behavior the input
            // stream cannot: the port reached a behavior it has not ported,
            // either outside any command or inside one it dispatched. Its
            // first use is the step the port never consumed. Only the FIRST
            // such behavior per session is visible, because the port stops
            // there and never reports what stands behind it; that censoring is
            // why `unlocks` is an upper bound.
            //
            // This sits inside the first-boundary block because `at` is only
            // meaningful for that boundary. `screensEmitted` stops growing
            // once a session has stopped, so a later segment's boundary would
            // enter at the step the FIRST one stopped on, in a segment it
            // never ran in -- and would sort ahead of the behavior actually
            // measured there, taking that behavior's `unlocks` with it.
            if (!isCommandRefusal(boundary))
                behavioral = { member: boundary.message, at: screensEmitted };
        }
        const issued = commandsIssued(steps);
        answers += issued.answers;
        ambiguous += issued.ambiguous;
        for (const { index, command } of issued.commands)
            issuedAll.push({ index: stepOffset + index, command });
        stepOffset += steps.length;
        completedContexts.push(contextFor(
            steps.slice(1).map((entry) => entry.key ?? '').join(''),
        ));
    }

    // Behaviors are assembled by the caller, once every session has been
    // scanned, because the supported set depends on what the port executed
    // across all of them. See executedCommands() below.
    const rawDivergence = silentDivergence(
        replayedSegments,
        {
            rng: replayedRng,
            screens: replayedScreens,
            cursors: replayedCursors,
        },
        stop !== null,
    );
    return {
        file,
        screensEmitted,
        recordedSteps,
        divergence: enrichDivergence(rawDivergence, replayedSegments),
        boundary: stop?.boundary ?? null,
        commandRefusal: stop?.commandRefusal ?? false,
        key: stop?.key ?? null,
        command: stop?.command ?? null,
        keyCursor: stop?.keyCursor ?? null,
        message: stop?.message ?? '',
        stopContext: stop?.context ?? null,
        behavioral,
        issued: issuedAll,
        answers,
        ambiguous,
        unported: [...unported],
        inputExhausted,
    };
}

/**
 * Every command the port demonstrably ran, taken from the sessions themselves.
 *
 * `supportedCommands()` reads `ADMITTED_COMMANDS`, which gates only the COMMAND
 * byte, never the count typed ahead of it. An extended command reaches its
 * handler through
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

/**
 * The refused command census key for one observed row.
 *
 * `row.command` resolves the refused byte through the session's binding model,
 * which answers for every byte, including the roughly half that answer
 * prompts. Enter is 0x0A, and so is Ctrl-J, the rush form of the `j` direction
 * key, so a session that pressed Enter to answer a prompt would otherwise be
 * filed under `rushsouth` and read as a ranking candidate.
 *
 * cursorState() already decides whether a byte began a command, and the
 * modeled half uses it for exactly this. Applying it here labels the row
 * instead of dropping it, so the reconciliation section still sees the
 * disagreement it exists to surface.
 */

function reportStops(rows) {
    const nameWidth = Math.max(...rows.map((r) => r.file.length));
    console.log('Where each development session first stops (observed)\n');
    for (const row of rows) {
        console.log(
            [
                row.file.padEnd(nameWidth),
                `${row.screensEmitted}/${row.recordedSteps}`.padStart(10),
                (row.command ?? '-').padEnd(14),
                row.boundary ?? 'no stop (input exhausted)',
                row.message ? `| C: ${JSON.stringify(row.message)}` : '',
            ].join('  ').trimEnd(),
        );
    }
}

// The observed half's third section: sessions whose replayed output differs
// from the recording while the port plays on. ".agents/selection.md", "Cap a
// session that already mismatches", reads this section to cap the session's
// contribution to a boundary candidate at its first mismatch.
function reportDivergences(rows) {
    console.log('\nSilent divergences, observed (first mismatch inside '
        + 'replayed input)');
    const divergent = rows.filter((row) => row.divergence);
    if (divergent.length === 0) {
        console.log('  (none: every replayed screen, cursor, and RNG call '
            + 'matches its recording)');
        return;
    }
    const nameWidth = Math.max(...divergent.map((row) => row.file.length));
    const at = (location) => (location
        ? `segment ${location.segmentIndex} step ${location.stepIndex}`
        : 'past the recorded steps');
    const rngSide = (value) => value ?? '(log ends)';
    for (const row of divergent) {
        const { screen, rng, cursor, serializeBug } = row.divergence;
        const parts = [];
        if (screen) {
            const bugTag = serializeBug ? ' [serialize bug]' : '';
            parts.push(`screen ${screen.index} of ${row.screensEmitted} `
                + `replayed (${at(screen.location)}) differs at row `
                + `${screen.row} column ${screen.column}${bugTag}`);
        }
        if (cursor && (!screen || cursor.index < screen.index)) {
            parts.push(`cursor ${cursor.index} (${at(cursor.location)}) is `
                + `${JSON.stringify(cursor.jsCursor)} where C recorded `
                + `${JSON.stringify(cursor.cCursor)}`);
        }
        parts.push(rng
            ? `RNG call ${rng.index} (${at(rng.location)}, `
                + `step ${rng.stepIndex}) is `
                + `${rngSide(rng.jsEntry)} where C recorded `
                + `${rngSide(rng.cEntry)}`
            : 'RNG aligned');
        console.log(`  ${row.file.padEnd(nameWidth)}  ${parts.join('; ')}`);
    }
}

function report(rows) {
    reportStops(rows);
    reportDivergences(rows);

    const emitted = rows.reduce((n, r) => n + r.screensEmitted, 0);
    const recorded = rows.reduce((n, r) => n + r.recordedSteps, 0);
    console.log(
        `\n${rows.length} sessions; ${emitted} screens emitted of ${recorded} `
        + `recorded. `
        + 'scripts/score-development.mjs is the authority on how many of those '
        + 'emitted screens match.\n'
        + 'Use scripts/divergence-queue.mjs for goal selection.',
    );
}

export async function main(args) {
    if (args.includes('--help')) {
        console.log(
            'Usage: node scripts/scan-sessions.mjs [--json] [--debug-full-replay]\n'
            + '\n  --json                   emit per-session rows in'
            + ' machine-readable form.'
            + '\n  --debug-full-replay      force a fresh replay even when'
            + ' .cache/scan-cache.json\n'
            + '                           matches HEAD. For debugging only.'
            + '\n\nThe scanned directory is fixed and no path argument is'
            + ' accepted, so this scan\ncannot be aimed at sessions/holdout/.',
        );
        return undefined;
    }
    const rejected = args.find((arg) => arg !== '--json'
        && arg !== '--debug-full-replay');
    if (rejected !== undefined) {
        throw new Error('only --json and --debug-full-replay are accepted');
    }
    const json = args.includes('--json');
    const forceReplay = args.includes('--debug-full-replay');

    let rows;
    if (forceReplay) {
        const files = listSessionFiles(DEVELOPMENT_DIR);
        if (files.length !== EXPECTED_DEVELOPMENT_COUNT)
            throw new Error('development count changed');
        const scanned = [];
        for (const file of files) scanned.push(await scanSession(file));
        rows = attachBehaviors(scanned);
        writeScanCache(rows);
    } else {
        rows = await loadAnnotatedRows();
    }

    if (json) {
        console.log(JSON.stringify({ rows }, null, 2));
    } else {
        report(rows);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`Session scan failed: ${error.message}`);
        process.exitCode = 1;
    });
}
