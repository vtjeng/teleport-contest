#!/usr/bin/env node
import { boundedMain } from './run-bounded.mjs';

// Replays the fixed session workload and reports where the JavaScript port stops
// and where it diverges from the C recording. `scripts/mismatch-queue.mjs`
// reads the `--json` output to build the goal selection queue.
//
// The fixed workload includes the 33 historical development sessions and the
// 11 opened local-holdout sessions, preserving holdout/ in each identifier.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
import * as challengeResults from './challenge-results.mjs';
import { PROJECT_ROOT } from './scoring-workspace.mjs';
import { fixedWorkload } from './fixed-workload.mjs';

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

// tty rows 1 through 21 are the map. Row 0 is the top line and rows 22 and 23
// are the status lines, so a cursor on any of those three is not waiting for a
// command.
const FIRST_MAP_ROW = 1;
const LAST_MAP_ROW = 21;

// The hero's glyph in the default symbol set, which every fixed-workload session
// uses. A polymorphed or engulfed hero draws something else; that case reports
// as ambiguous rather than as a command, because misreading it as a command
// would invent debt.
const HERO_GLYPH = '@';

// cmd.c parse() ends a getlin prompt on either terminator.
const PROMPT_TERMINATORS = new Set(['\r', '\n']);

const EXTENDED_COMMAND_KEY = '#';

// Version 4 separates input-boundary agreement from strict animation parity.
const SCAN_CACHE_VERSION = 4;

// Synthetic first-mismatch diagnostics are replay artifacts, so their cache
// identity includes both the replay-input snapshot and the diagnostic code.
// The challenge-results module owns the former; keeping this small tool list
// here makes a scanner/queue edit invalidate an old source attribution too.
export const DIAGNOSTIC_TOOL_FILES = Object.freeze([
    'scripts/scan-sessions.mjs',
    'scripts/diff-fresh.mjs',
    'scripts/mismatch-queue.mjs',
    'scripts/c-functions.mjs',
]);

export function diagnosticToolIdentity(root = PROJECT_ROOT) {
    const files = [];
    for (const path of DIAGNOSTIC_TOOL_FILES) {
        const fullPath = join(root, path);
        if (!existsSync(fullPath)) return { version: 1, files: [], sha256: null };
        files.push({ path, sha256: createHash('sha256')
            .update(readFileSync(fullPath)).digest('hex') });
    }
    return {
        version: 1, files,
        sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    };
}

function repositoryHead(root) {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
        .toString().trim();
}

function sameFiles(left, right) {
    return Array.isArray(left) && left.length === right.length
        && left.every((file, index) => file === right[index]);
}

function scanFiles(root) {
    return fixedWorkload(root).scanFiles;
}

function scanInputsUnchanged(root, sha, files) {
    if (!sameFiles(scanFiles(root), files)) return false;
    // Check only the selected corpora, plus every replay input. Include
    // untracked source, index changes, and an uncommitted merge.
    const status = execFileSync('git', [
        '--literal-pathspecs', 'status', '--porcelain=v1', '-z',
        '--untracked-files=all', '--', 'js/', 'frozen/', 'scripts/',
        'package.json', ...files.map(file => `sessions/${file}`),
    ], { cwd: root, encoding: 'utf8' });
    return status.length === 0 && repositoryHead(root) === sha;
}

function readScanCache(path, sha, files) {
    if (!existsSync(path)) return null;
    try {
        const cache = JSON.parse(readFileSync(path, 'utf8'));
        if (cache.version !== SCAN_CACHE_VERSION || cache.sha !== sha
            || !sameFiles(cache.files, files) || !Array.isArray(cache.rows)
            || !sameFiles(cache.rows.map(row => row.file), files)) return null;
        return cache.rows;
    } catch {
        return null;
    }
}


// The root and replay callback let fixture repositories exercise the same
// cache lifecycle without replaying real games. The CLI always uses this
// repository and the selected fixed corpora through loadAnnotatedRows().
export async function loadScanRows(root, replay, {
    forceReplay = false,
} = {}) {
    const files = scanFiles(root);
    const sha = repositoryHead(root);
    const cacheable = scanInputsUnchanged(root, sha, files);
    const cacheDir = join(root, '.cache');
    const cachePath = join(cacheDir, 'scan-cache.json');
    if (cacheable && !forceReplay) {
        const cached = readScanCache(cachePath, sha, files);
        if (cached && scanInputsUnchanged(root, sha, files)) return cached;
    }
    const rows = await replay(files);
    if (cacheable && scanInputsUnchanged(root, sha, files)) {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cachePath, JSON.stringify({
            version: SCAN_CACHE_VERSION, sha, files, rows,
        }));
    }
    return rows;
}

/** Reuse a scan only for the same commit with clean replay inputs. */
export async function loadAnnotatedRows(options) {
    return loadScanRows(PROJECT_ROOT, async (files) => {
        const scanned = [];
        for (const file of files) scanned.push(await scanSession(file));
        return attachBehaviors(scanned);
    }, options);
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
    return scanRecordedSession(file, data);
}

/** Diagnose a normalized recording while retaining unexpected replay errors. */
export async function scanRecordedSession(file, data, replaySegment = runSegment) {
    try {
        return await replaySession(file, data, replaySegment);
    } catch (error) {
        // An unexpected runtime error must not hide the rest of the corpus.
        // runSegment does not return its capture after a throw, so neither
        // the emitted count nor the failing step is known here.
        return {
            file, screensEmitted: null,
            recordedSteps: data.segments.reduce((sum, segment) =>
                sum + (segment.steps?.length ?? 0), 0),
            divergence: null, boundary: 'Replay error: ' + error.message,
            scanError: String(error.stack ?? error).replaceAll(PROJECT_ROOT + '/', ''),
            commandRefusal: false, key: null, command: null, keyCursor: null,
            message: '', stopContext: null, behavioral: null, issued: [],
            answers: null, ambiguous: null, unported: [], segmentEndStates: [],
        };
    }
}

const SYNTHETIC_BATCH = /^v[1-9][0-9]*$/u;
const SYNTHETIC_CASE = /^[a-z0-9][a-z0-9-]*$/u;

function syntheticCachePath(root, batch, caseId) {
    if (!SYNTHETIC_BATCH.test(batch) || !SYNTHETIC_CASE.test(caseId))
        throw new Error('synthetic scan identity is not path-safe');
    return join(root, '.cache', 'synthetic-scans', batch, `${caseId}.json`);
}

function recordingDigest(data) {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function challengeBatches(root) {
    return challengeResults.readChallengeBatches(root);
}

function challengeCase(root, batchName, caseId) {
    const batch = challengeBatches(root).find(entry => entry.batch === batchName);
    const entry = batch?.cases?.find(candidate => candidate.id === caseId);
    if (!batch || !entry) throw new Error(
        `no admitted synthetic case ${batchName}/${caseId}`,
    );
    const snapshot = challengeResults.challengeInputSnapshot(root, batch);
    const tool = diagnosticToolIdentity(root);
    return {
        root, batch: batch.batch, caseId: entry.id,
        manifestPath: batch.manifestPath, manifestSha256: batch.manifestSha256,
        recordingPath: entry.recording, recordingSha256: entry.recordingSha256,
        recipeSha256: entry.recipeSha256 ?? null,
        replayInputSha256: snapshot.sha256,
        diagnosticToolSha256: tool.sha256,
    };
}

function relativeChallengePath(root, requested) {
    const value = String(requested ?? '').replaceAll('\\', '/');
    const rootPath = resolve(root).replaceAll('\\', '/').replace(/\/$/u, '');
    const absolute = resolve(root, requested).replaceAll('\\', '/');
    const prefix = `${rootPath}/`;
    if (!absolute.startsWith(prefix)) throw new Error(
        '--recording must name a file in the admitted challenges corpus',
    );
    const relative = absolute.slice(prefix.length);
    return value.startsWith('challenges/') ? value : relative;
}

export function syntheticMetadataForSelector(root, selector) {
    const match = /^v([1-9][0-9]*)\/([a-z0-9][a-z0-9-]*)$/u.exec(selector ?? '');
    if (!match) throw new Error('--synthetic requires vN/case-id');
    return challengeCase(root, `v${match[1]}`, match[2]);
}

export function syntheticMetadataForRecording(root, requested) {
    const relative = relativeChallengePath(root, requested);
    const found = challengeBatches(root).flatMap(batch => batch.cases
        .map(entry => ({ batch, entry })))
        .find(({ entry }) => entry.recording === relative);
    if (!found) throw new Error('--recording must name an admitted challenge recording');
    return challengeCase(root, found.batch.batch, found.entry.id);
}

function syntheticIdentity(metadata, root, data) {
    const identity = metadata.inputIdentity ?? {};
    const tools = diagnosticToolIdentity(root);
    return {
        ...identity,
        version: 1,
        corpus: 'synthetic',
        batch: metadata.batch,
        caseId: metadata.caseId,
        manifestPath: metadata.manifestPath ?? null,
        manifestSha256: metadata.manifestSha256 ?? null,
        recordingPath: metadata.recordingPath ?? null,
        recordingSha256: metadata.recordingSha256 ?? recordingDigest(data),
        recipeSha256: metadata.recipeSha256 ?? null,
        evaluationPath: metadata.evaluationPath ?? null,
        evaluationCommit: metadata.evaluationCommit ?? null,
        replayInputSha256: metadata.replayInputSha256
            ?? identity.replayInputSha256 ?? null,
        diagnosticToolSha256: metadata.diagnosticToolSha256
            ?? tools.sha256,
        replayCommit: metadata.commit ?? identity.replayCommit ?? repositoryHead(root),
    };
}

function sameIdentity(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

/** Replay one admitted synthetic recording without copying it into sessions/. */
export async function scanSyntheticSession(metadata, replaySegment = runSegment) {
    const root = metadata.root ?? PROJECT_ROOT;
    if (!SYNTHETIC_BATCH.test(metadata.batch ?? '')
        || !SYNTHETIC_CASE.test(metadata.caseId ?? ''))
        throw new Error('synthetic scans require a versioned batch and case ID');
    const raw = metadata.recording ?? JSON.parse(readFileSync(
        resolve(root, metadata.recordingPath), 'utf8'));
    const data = normalizeSession(raw);
    const session = `synthetic/${metadata.batch}/${metadata.caseId}`;
    const result = await scanRecordedSession(session, data, replaySegment);
    return {
        ...result,
        corpus: 'synthetic', batch: metadata.batch, caseId: metadata.caseId,
        session, inputIdentity: syntheticIdentity(metadata, root, raw),
    };
}

/** Reuse a synthetic diagnostic only when the recording and replay identity match. */
export async function loadSyntheticScan(metadata, replaySegment = runSegment) {
    const root = metadata.root ?? PROJECT_ROOT;
    const path = syntheticCachePath(root, metadata.batch, metadata.caseId);
    const raw = metadata.recording ?? JSON.parse(readFileSync(
        resolve(root, metadata.recordingPath), 'utf8'));
    const identity = syntheticIdentity(metadata, root, raw);
    if (existsSync(path)) {
        try {
            const cached = JSON.parse(readFileSync(path, 'utf8'));
            if (sameIdentity(cached.inputIdentity, identity)) return cached;
        } catch { /* replay and replace malformed or stale diagnostics */ }
    }
    const result = await scanSyntheticSession({ ...metadata, root, recording: raw }, replaySegment);
    mkdirSync(join(root, '.cache', 'synthetic-scans', metadata.batch), { recursive: true });
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
    return result;
}

async function replaySession(file, data, replaySegment) {
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
    const segmentEndStates = [];

    for (const [segmentIndex, segment] of data.segments.entries()) {
        let boundary = null;
        const segmentGame = await replaySegment(
            { ...replayInputFor(segment), storage },
            { onBoundary: (error) => { boundary ??= error; } },
        );
        const segmentScreenList = segmentGame.getScreens?.() ?? [];
        const segmentScreens = segmentScreenList.length;
        const segmentUnported = segmentGame.getUnported?.() ?? [];
        for (const fn of segmentUnported) unported.add(fn);
        const comparison = compareSessionOutputs(
            { version: 5, segments: [segment] },
            {
                rng: segmentGame.getRngLog?.() ?? [],
                screens: segmentScreenList,
                cursors: segmentGame.getCursors?.() ?? [],
                animFrames: segmentGame.getAnimationFramesByStep?.() ?? [],
            },
        );
        // Recordings can end at an input prompt. Exact RNG, screen and cursor
        // streams, including their lengths, establish that recorded boundary.
        // Animation differences still fail strict parity but do not establish
        // that the replay consumed extra input.
        const inputBoundaryMatched = !boundary && !comparison.error
            && !comparison.segmentMismatch && !comparison.rngMismatch
            && !comparison.screenMismatch && !comparison.cursorMismatch;
        // A gap in one game cannot explain input exhaustion in another.
        // Capture both before the next segment resets the game singleton.
        segmentEndStates.push({
            segment: segmentIndex,
            unported: segmentUnported,
            inputExhausted: Boolean(segmentGame.getInputExhausted?.()),
            recordingMatched: !boundary && comparison.passed,
            inputBoundaryMatched,
        });
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
        segmentEndStates,
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
    console.log('Where each selected session first stops (observed)\n');
    for (const row of rows) {
        console.log(
            [
                row.file.padEnd(nameWidth),
                `${row.screensEmitted ?? '?'}/${row.recordedSteps}`.padStart(10),
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
    const errored = rows.filter(row => row.scanError).length;
    if (errored) console.log(`${errored} replay errors; their emitted counts and failure steps are unknown.`);
    reportStops(rows);
    reportDivergences(rows);

    const emitted = rows.reduce((n, r) => n + r.screensEmitted, 0);
    const recorded = rows.reduce((n, r) => n + r.recordedSteps, 0);
    console.log(
        `\n${rows.length} sessions; ${emitted} screens emitted of ${recorded} `
        + `recorded. `
        + 'scripts/score-development.mjs is the authority on how many of those '
        + 'emitted screens match.\n'
        + 'Use scripts/mismatch-queue.mjs for goal selection.',
    );
}

export async function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log(
            'Usage: node scripts/scan-sessions.mjs [--json] [--debug-full-replay]\n'
            + '       node scripts/scan-sessions.mjs --json --recording <path>\n'
            + '       node scripts/scan-sessions.mjs --json --synthetic vN/case-id\n'
            + '\n  --json                   emit per-session rows in'
            + ' machine-readable form.'
            + '\n  --debug-full-replay      force a fresh replay even when'
            + ' .cache/scan-cache.json\n'
            + '                           matches clean replay inputs at HEAD.'
            + ' For debugging only.'
            + '\n  --recording <path>       diagnose one admitted synthetic recording.'
            + '\n  --synthetic vN/case-id   diagnose one admitted synthetic case.'
            + '\n\nScans the fixed 44-session workload: direct development sessions and'
            + ' sessions/holdout/.',
        );
        return undefined;
    }
    if (args.includes('--help')) {
        throw new Error('request --help without other arguments');
    }
    const json = args.includes('--json');
    let recording = null;
    let synthetic = null;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--recording') {
            recording = args[++index];
            if (!recording || recording.startsWith('--'))
                throw new Error('--recording requires a path');
        } else if (arg === '--synthetic') {
            synthetic = args[++index];
            if (!synthetic || synthetic.startsWith('--'))
                throw new Error('--synthetic requires vN/case-id');
        }
    }
    if (recording !== null || synthetic !== null) {
        if (!json) throw new Error('--recording/--synthetic require --json');
        if (recording !== null && synthetic !== null)
            throw new Error('--recording and --synthetic are mutually exclusive');
        if (args.includes('--debug-full-replay'))
            throw new Error('diagnostic replay cannot use --debug-full-replay');
        const unexpected = args.find((arg, index) => {
            if (arg === '--json' || arg === '--recording' || arg === '--synthetic') return false;
            if (index > 0 && (args[index - 1] === '--recording'
                || args[index - 1] === '--synthetic')) return false;
            return true;
        });
        if (unexpected !== undefined) throw new Error(
            `unexpected argument in diagnostic mode: ${unexpected}`,
        );
        const metadata = recording !== null
            ? syntheticMetadataForRecording(PROJECT_ROOT, recording)
            : syntheticMetadataForSelector(PROJECT_ROOT, synthetic);
        console.log(JSON.stringify(await loadSyntheticScan(metadata), null, 2));
        return undefined;
    }
    const rejected = args.find((arg) => arg !== '--json'
        && arg !== '--debug-full-replay');
    if (rejected !== undefined) {
        throw new Error('only --json and --debug-full-replay are accepted');
    }
    const forceReplay = args.includes('--debug-full-replay');

    const rows = await loadAnnotatedRows({ forceReplay });

    if (json) {
        console.log(JSON.stringify({ rows }, null, 2));
    } else {
        report(rows);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    boundedMain('full', () => main(process.argv.slice(2))).then(code => {
        if (code !== undefined) process.exitCode = code;
    }).catch((error) => {
        console.error(`Session scan failed: ${error.message}`);
        process.exitCode = 1;
    });
}
