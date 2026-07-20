#!/usr/bin/env node

// Record a fresh case with the deterministic C recorder, replay the same
// inputs through the contestant API, and print the first strict divergence.

import { spawnSync } from 'node:child_process';
import {
    cpSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
    basename,
    isAbsolute,
    join,
    relative,
    resolve,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    COLS_80,
    decodeScreen,
    diffCell,
    renderCell,
    ROWS_24,
} from '../frozen/screen-decode.mjs';
import { normalizeSession } from '../frozen/session_loader.mjs';
import {
    createScoringWorkspace,
    PROJECT_ROOT,
    removeScoringWorkspace,
} from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RECORD_SCRIPT = join(PROJECT_ROOT, 'scripts', 'record-session.mjs');
const JS_WORKER_SCRIPT = join(PROJECT_ROOT, 'scripts', 'diff-fresh-worker.mjs');
const SEALED_HOLDOUT_DIR = join(PROJECT_ROOT, 'sessions', 'holdout');
const DEFAULT_RECORD_INSTALL = join(
    PROJECT_ROOT,
    'nethack-c',
    'recorder',
    'install',
    'games',
    'lib',
    'nethackdir',
);
const DEFAULT_RECORD_BINARY = join(DEFAULT_RECORD_INSTALL, 'nethack');
const DEFAULT_DATETIME = '20000110090000';
const DEFAULT_CHARACTER = {
    name: 'FreshDiff',
    role: 'Healer',
    race: 'human',
    gender: 'male',
    align: 'neutral',
};
const NONINTERACTIVE_DEFAULTS = ['legacy', 'tutorial', 'splash_screen'];
const RNG_CALL = /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/u;
const JS_RESULT_MARKER = '__FRESH_DIFF_RESULT__';

export const USAGE = `Usage:
  node scripts/diff-fresh.mjs <recipe.session.json>
  node scripts/diff-fresh.mjs --recipe <recipe.session.json>
  node scripts/diff-fresh.mjs --seed <integer> [fresh-case options]

Fresh-case options:
  --datetime <YYYYMMDDHHMMSS>   fixed clock (default ${DEFAULT_DATETIME})
  --moves <keys>                keys after launch (default: none)
  --name <name>                 character name (default FreshDiff)
  --role <role>                 role (default Healer)
  --race <race>                 race (default human)
  --gender <gender>             gender (default male)
  --align <alignment>           alignment (default neutral)
  --options <comma-list>        append an OPTIONS line; may be repeated
  --nethackrc <text>            use exact rc text instead of character flags
  --nethackrc-file <path>       read exact rc text from a file

Exit status is 0 for strict parity, 1 for a differential mismatch, and 2 for
invalid input, recorder failure, or runner failure. Recipe inputs must contain
only replay inputs, never previously recorded steps.`;

function optionValue(argv, index, option) {
    if (index + 1 >= argv.length) throw new Error(`${option} needs a value`);
    return argv[index + 1];
}

export function parseArgs(argv) {
    const parsed = {
        options: [],
        character: {},
        positionals: [],
    };
    let usedCharacterFlag = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            parsed.help = true;
        } else if (arg === '--recipe') {
            parsed.recipePath = optionValue(argv, i, arg);
            i++;
        } else if (arg === '--seed') {
            parsed.seedText = optionValue(argv, i, arg);
            i++;
        } else if (arg === '--datetime') {
            parsed.datetime = optionValue(argv, i, arg);
            i++;
        } else if (arg === '--moves') {
            parsed.moves = optionValue(argv, i, arg);
            i++;
        } else if (arg === '--nethackrc') {
            parsed.nethackrc = optionValue(argv, i, arg);
            i++;
        } else if (arg === '--nethackrc-file') {
            parsed.nethackrcFile = optionValue(argv, i, arg);
            i++;
        } else if (arg === '--options') {
            parsed.options.push(optionValue(argv, i, arg));
            usedCharacterFlag = true;
            i++;
        } else if (['--name', '--role', '--race', '--gender', '--align'].includes(arg)) {
            parsed.character[arg.slice(2)] = optionValue(argv, i, arg);
            usedCharacterFlag = true;
            i++;
        } else if (arg.startsWith('-')) {
            throw new Error(`unknown option: ${arg}`);
        } else {
            parsed.positionals.push(arg);
        }
    }

    if (parsed.help) return { mode: 'help' };
    if (parsed.positionals.length > 1) throw new Error('only one recipe path is accepted');
    if (parsed.recipePath && parsed.positionals.length) {
        throw new Error('specify the recipe either positionally or with --recipe');
    }

    const recipePath = parsed.recipePath || parsed.positionals[0];
    if (recipePath) {
        if (parsed.seedText !== undefined || parsed.datetime !== undefined
            || parsed.moves !== undefined || parsed.nethackrc !== undefined
            || parsed.nethackrcFile !== undefined || usedCharacterFlag) {
            throw new Error('recipe input cannot be combined with fresh-case options');
        }
        return { mode: 'recipe', recipePath };
    }

    if (parsed.seedText === undefined) throw new Error('provide a recipe or --seed');
    if (!/^(?:0|[1-9][0-9]*)$/u.test(parsed.seedText)) {
        throw new Error('--seed must be a non-negative decimal integer');
    }
    const seed = Number(parsed.seedText);
    if (!Number.isSafeInteger(seed)) {
        throw new Error('--seed must fit the judge API safe-integer number type');
    }
    const datetime = parsed.datetime ?? DEFAULT_DATETIME;
    if (!/^[0-9]{14}$/u.test(datetime)) {
        throw new Error('--datetime must have format YYYYMMDDHHMMSS');
    }
    if (parsed.nethackrc !== undefined && parsed.nethackrcFile !== undefined) {
        throw new Error('--nethackrc and --nethackrc-file are mutually exclusive');
    }
    if ((parsed.nethackrc !== undefined || parsed.nethackrcFile !== undefined)
        && usedCharacterFlag) {
        throw new Error('exact nethackrc input cannot be combined with character flags');
    }

    return {
        mode: 'fresh',
        seed,
        datetime,
        moves: parsed.moves ?? '',
        character: { ...DEFAULT_CHARACTER, ...parsed.character },
        options: parsed.options,
        nethackrc: parsed.nethackrc,
        nethackrcFile: parsed.nethackrcFile,
    };
}

function validateRcToken(value, option) {
    if (typeof value !== 'string' || value.length === 0 || /[,\r\n]/u.test(value)) {
        throw new Error(`${option} must be a nonempty rc value without commas or newlines`);
    }
    return value;
}

function normalizedBooleanOptionName(token) {
    let name = token.trim().toLowerCase();
    while (name.startsWith('!') || name.startsWith('no')) {
        name = name.startsWith('!')
            ? name.slice(1)
            : name.slice(name.startsWith('no-') ? 3 : 2);
    }
    return name.split(/[:=]/u, 1)[0].trim();
}

function optionListsSet(optionLists, canonicalName) {
    for (const optionList of optionLists) {
        const equals = optionList.indexOf('=');
        const value = optionList.slice(0, equals).trim().toUpperCase() === 'OPTIONS'
            ? optionList.slice(equals + 1)
            : optionList;
        for (const token of value.split(',')) {
            const name = normalizedBooleanOptionName(token);
            // NetHack accepts unambiguous option abbreviations of at least
            // three characters; all three generated defaults are unique then.
            if (name.length >= 3 && canonicalName.startsWith(name)) return true;
        }
    }
    return false;
}

export function buildFreshRecipe(config, exactNethackrc) {
    let nethackrc = exactNethackrc;
    if (nethackrc === undefined) {
        const character = config.character;
        const fields = [
            ['name', character.name],
            ['role', character.role],
            ['race', character.race],
            ['gender', character.gender],
            ['align', character.align],
        ].map(([key, value]) => `${key}:${validateRcToken(value, `--${key}`)}`);
        const lines = [`OPTIONS=${fields.join(',')}`];
        const generatedDefaults = NONINTERACTIVE_DEFAULTS.filter(
            (name) => !optionListsSet(config.options, name),
        );
        if (generatedDefaults.length) {
            lines.push(`OPTIONS=${generatedDefaults.map((name) => `!${name}`).join(',')}`);
        }
        for (const value of config.options) {
            if (/[\r\n]/u.test(value)) throw new Error('--options must be one rc line');
            lines.push(value.toUpperCase().startsWith('OPTIONS=')
                ? value
                : `OPTIONS=${value}`);
        }
        nethackrc = `${lines.join('\n')}\n`;
    }
    if (typeof nethackrc !== 'string') throw new Error('nethackrc must be text');

    return {
        version: 5,
        segments: [{
            seed: config.seed,
            datetime: config.datetime,
            nethackrc,
            moves: config.moves,
        }],
    };
}

export function isSealedHoldoutPath(candidate) {
    return isPathWithinDirectory(candidate, SEALED_HOLDOUT_DIR);
}

export function isPathWithinDirectory(candidate, directory) {
    const absoluteDirectory = resolve(directory);
    const isWithinDirectory = (path) => {
        const rel = relative(absoluteDirectory, path);
        return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    };
    const absolute = resolve(candidate);
    if (isWithinDirectory(absolute)) return true;

    // An outside symlink must not turn into a path beneath the sealed tree.
    // Missing paths are handled by their eventual read operation.
    try {
        return isWithinDirectory(realpathSync(absolute));
    } catch {
        return false;
    }
}

function validFixedDatetime(value) {
    const match = typeof value === 'string'
        ? value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u)
        : null;
    if (!match) return false;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText]
        = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (year < 1 || month < 1 || month > 12
        || hour > 23 || minute > 59 || second > 59) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30,
        31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= monthLengths[month - 1];
}

export function validateCleanRecipe(
    data,
    label = 'recipe',
    { steps = 'forbid' } = {},
) {
    if (steps !== 'forbid' && steps !== 'require') {
        throw new Error(`invalid steps policy: ${steps}`);
    }
    if (!data || typeof data !== 'object' || data.version !== 5
        || !Array.isArray(data.segments) || data.segments.length === 0) {
        throw new Error(`${label} must be a clean v5 session with at least one segment`);
    }
    for (let i = 0; i < data.segments.length; i++) {
        const segment = data.segments[i];
        const prefix = `${label} segment ${i + 1}`;
        if (!segment || typeof segment !== 'object') throw new Error(`${prefix} must be an object`);
        if (!Number.isSafeInteger(segment.seed) || segment.seed < 0) {
            throw new Error(`${prefix} seed must be a non-negative safe integer`);
        }
        if (!validFixedDatetime(segment.datetime)) {
            throw new Error(`${prefix} datetime must be a valid YYYYMMDDHHMMSS value`);
        }
        if (typeof segment.nethackrc !== 'string') throw new Error(`${prefix} nethackrc must be text`);
        if (typeof segment.moves !== 'string') throw new Error(`${prefix} moves must be text`);
        const hasSteps = Object.hasOwn(segment, 'steps');
        if (steps === 'forbid' && hasSteps) {
            throw new Error(`${prefix} must not contain recorded steps`);
        }
        if (steps === 'require'
            && (!hasSteps || !Array.isArray(segment.steps)
                || segment.steps.length === 0)) {
            throw new Error(`${prefix} must contain nonempty recorded steps`);
        }
    }
    return data;
}

function withoutJsIndex(entry) {
    return String(entry).replace(/^\d+\s+/u, '');
}

function normalizeRng(entry) {
    return withoutJsIndex(entry).replace(/\s*@\s.*$/u, '').trim();
}

function rngCaller(entry) {
    const match = withoutJsIndex(entry).match(/\s*@\s(.*)$/u);
    return match?.[1] ?? null;
}

function isRngCall(entry) {
    return typeof entry === 'string' && RNG_CALL.test(withoutJsIndex(entry));
}

function appendAll(target, source) {
    if (!Array.isArray(source)) return;
    for (const value of source) target.push(value);
}

function recordedTrace(recording) {
    const rng = [];
    const screens = [];
    const cursors = [];
    const segments = normalizeSession(recording).segments;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        const segment = segments[segmentIndex];
        for (let stepIndex = 0; stepIndex < (segment.steps || []).length; stepIndex++) {
            const step = segment.steps[stepIndex];
            const location = {
                segmentIndex,
                stepIndex,
                key: step.key ?? null,
            };
            for (const entry of step.rng || []) {
                if (isRngCall(entry)) rng.push({ entry, location });
            }
            // Match the official scorer: only a truthy canonical screen enters
            // the positional screen/cursor streams.
            if (step.screen) {
                screens.push({ screen: step.screen, location });
                cursors.push(Array.isArray(step.cursor) ? step.cursor : null);
            }
        }
    }
    return { rng, screens, cursors };
}

function preDecode(screen) {
    // Keep this in lockstep with frozen/ps_test_runner.mjs. Decoding and cell
    // comparison below are imported directly from the frozen scorer support.
    return String(screen)
        .replace(/Version\s+\d+\.\d+\.\d+[^\n]*/u, '<<VERSION_BANNER>>')
        .replace(/^\d{2}:\d{2}:\d{2}\.$/gmu, '<time>.');
}

function firstCellMismatch(cScreen, jsScreen) {
    const cGrid = decodeScreen(preDecode(cScreen));
    const jsGrid = decodeScreen(preDecode(jsScreen));
    for (let row = 0; row < ROWS_24; row++) {
        for (let column = 0; column < COLS_80; column++) {
            const kind = diffCell(cGrid[row][column], jsGrid[row][column]);
            if (kind) {
                return {
                    kind,
                    row,
                    column,
                    cCell: cGrid[row][column],
                    jsCell: jsGrid[row][column],
                };
            }
        }
    }
    return null;
}

function cursorsEqual(cCursor, jsCursor) {
    if (!Array.isArray(cCursor)) return true;
    if (!Array.isArray(jsCursor)) return false;
    return cCursor[0] === jsCursor[0]
        && cCursor[1] === jsCursor[1]
        && cCursor[2] === jsCursor[2];
}

export function compareSessionOutputs(recording, jsOutput) {
    const c = recordedTrace(recording);
    const jsRng = (jsOutput.rng || []).filter(isRngCall);
    const jsScreens = jsOutput.screens || [];
    const jsCursors = jsOutput.cursors || [];

    let rngMismatch = null;
    const rngCommon = Math.min(c.rng.length, jsRng.length);
    for (let i = 0; i < rngCommon; i++) {
        if (normalizeRng(c.rng[i].entry) !== normalizeRng(jsRng[i])) {
            rngMismatch = {
                index: i,
                cEntry: normalizeRng(c.rng[i].entry),
                cCaller: rngCaller(c.rng[i].entry),
                jsEntry: normalizeRng(jsRng[i]),
                location: c.rng[i].location,
            };
            break;
        }
    }
    if (!rngMismatch && c.rng.length !== jsRng.length) {
        const i = rngCommon;
        rngMismatch = {
            index: i,
            cEntry: c.rng[i] ? normalizeRng(c.rng[i].entry) : undefined,
            cCaller: c.rng[i] ? rngCaller(c.rng[i].entry) : null,
            jsEntry: jsRng[i] === undefined ? undefined : normalizeRng(jsRng[i]),
            location: c.rng[i]?.location,
        };
    }

    let screenMismatch = null;
    const screenCommon = Math.min(c.screens.length, jsScreens.length);
    for (let i = 0; i < screenCommon; i++) {
        const cell = firstCellMismatch(c.screens[i].screen, jsScreens[i]);
        if (cell) {
            screenMismatch = {
                index: i,
                location: c.screens[i].location,
                ...cell,
            };
            break;
        }
    }
    if (!screenMismatch && c.screens.length !== jsScreens.length) {
        screenMismatch = {
            index: screenCommon,
            location: c.screens[screenCommon]?.location,
            kind: c.screens[screenCommon] ? 'js-missing' : 'c-missing',
        };
    }

    let cursorMismatch = null;
    const cursorCommon = Math.min(c.cursors.length, jsCursors.length);
    for (let i = 0; i < cursorCommon; i++) {
        if (!cursorsEqual(c.cursors[i], jsCursors[i])) {
            cursorMismatch = {
                index: i,
                location: c.screens[i]?.location,
                cCursor: c.cursors[i],
                jsCursor: jsCursors[i],
            };
            break;
        }
    }
    if (!cursorMismatch && c.cursors.length !== jsCursors.length) {
        const i = cursorCommon;
        cursorMismatch = {
            index: i,
            location: c.screens[i]?.location,
            cCursor: c.cursors[i],
            jsCursor: jsCursors[i],
        };
    }

    const lengths = {
        rng: { c: c.rng.length, js: jsRng.length },
        screens: { c: c.screens.length, js: jsScreens.length },
        cursors: { c: c.cursors.length, js: jsCursors.length },
    };
    return {
        passed: !jsOutput.error && !rngMismatch && !screenMismatch && !cursorMismatch,
        error: jsOutput.error || null,
        lengths,
        rngMismatch,
        screenMismatch,
        cursorMismatch,
    };
}

function storageHandle() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        get length() { return values.size; },
        key(index) {
            let current = 0;
            for (const key of values.keys()) {
                if (current === index) return key;
                current++;
            }
            return null;
        },
    };
}

export async function runJsSession(recording, scoringRoot) {
    const runnerUrl = pathToFileURL(join(scoringRoot, 'js', 'jsmain.js')).href;
    const { runSegment } = await import(runnerUrl);
    const output = { rng: [], screens: [], cursors: [], error: null };
    const storage = storageHandle();

    try {
        for (const segment of normalizeSession(recording).segments) {
            const game = await runSegment({
                seed: segment.seed,
                datetime: segment.datetime,
                nethackrc: segment.nethackrc,
                moves: segment.moves,
                recorderIsDst: segment.recorderIsDst,
                storage,
            });
            const rng = (game.getRngLog?.() || []).map(withoutJsIndex).filter(isRngCall);
            appendAll(output.rng, rng);
            appendAll(output.screens, game.getScreens?.() || []);
            appendAll(output.cursors, game.getCursors?.() || []);
        }
    } catch (error) {
        output.error = error?.message || String(error);
    }
    return output;
}

export function assertRecordingMatchesRecipe(recording, recipe) {
    if (recording.segments.length !== recipe.segments.length) {
        throw new Error('C recording segment count does not match the fresh recipe');
    }
    const fields = ['seed', 'datetime', 'nethackrc', 'moves'];
    for (let index = 0; index < recipe.segments.length; ++index) {
        for (const field of fields) {
            if (recording.segments[index][field] !== recipe.segments[index][field]) {
                throw new Error(
                    `C recording segment ${index + 1} changed replay field ${field}`,
                );
            }
        }
    }
}

function stageRecorderEnvironment(workRoot, recorderEnv) {
    const sourceInstall = resolve(
        PROJECT_ROOT,
        recorderEnv.NETHACK_INSTALL || DEFAULT_RECORD_INSTALL,
    );
    const sourceBinary = resolve(
        PROJECT_ROOT,
        recorderEnv.NETHACK_BINARY || DEFAULT_RECORD_BINARY,
    );
    const stagedInstall = join(workRoot, 'recorder-install');
    cpSync(sourceInstall, stagedInstall, { recursive: true });

    const binaryRelative = relative(sourceInstall, sourceBinary);
    const binaryInsideInstall = binaryRelative === ''
        || (!binaryRelative.startsWith('..') && !isAbsolute(binaryRelative));
    return {
        ...recorderEnv,
        NETHACK_INSTALL: stagedInstall,
        NETHACK_BINARY: binaryInsideInstall
            ? join(stagedInstall, binaryRelative)
            : sourceBinary,
    };
}

function runJsDifferentialWorker(recordingPath, scoringRoot, workerEnv) {
    const configuredTimeout = Number(
        workerEnv.SESSION_REPLAY_TIMEOUT_MS || 45000,
    );
    if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
        throw new Error('SESSION_REPLAY_TIMEOUT_MS must be a positive number');
    }
    const worker = spawnSync(
        process.execPath,
        [JS_WORKER_SCRIPT, recordingPath, scoringRoot],
        {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            env: workerEnv,
            timeout: configuredTimeout,
            maxBuffer: 64 * 1024 * 1024,
        },
    );
    if (worker.error || worker.status !== 0) {
        const detail = (worker.stderr || '').trim();
        throw new Error(worker.error?.message
            || `JS differential worker exited ${worker.status}`
                + `${detail ? `\n${detail}` : ''}`);
    }
    const markerIndex = worker.stdout.lastIndexOf(JS_RESULT_MARKER);
    if (markerIndex < 0) {
        throw new Error('JS differential worker result marker missing');
    }
    try {
        return JSON.parse(
            worker.stdout.slice(markerIndex + JS_RESULT_MARKER.length).trim(),
        );
    } catch (error) {
        throw new Error(`JS differential worker result is invalid: ${error.message}`);
    }
}

function locationText(location) {
    if (!location) return '';
    const key = location.key === null ? 'initial input' : `key ${JSON.stringify(location.key)}`;
    return ` (segment ${location.segmentIndex + 1}, step ${location.stepIndex + 1}, ${key})`;
}

function lengthLine(label, lengths) {
    const noun = lengths.c === lengths.js ? 'length' : 'length mismatch';
    return `${label} ${noun}: C=${lengths.c}, JS=${lengths.js}`;
}

function printable(value) {
    return value === undefined ? '<missing>' : String(value);
}

function attrNames(attr) {
    const names = [];
    if (attr & 1) names.push('inverse');
    if (attr & 2) names.push('bold');
    if (attr & 4) names.push('underline');
    return names.length ? names.join('|') : 'none';
}

function cellText(cell) {
    return `{ch:${JSON.stringify(cell.ch)}, rendered:${JSON.stringify(renderCell(cell))}, `
        + `color:${cell.color}, attr:${cell.attr} (${attrNames(cell.attr)}), decgfx:${cell.decgfx}}`;
}

export function formatReport(result) {
    const lines = [];
    if (result.error) lines.push(`JS error: ${result.error}`);

    lines.push(lengthLine('PRNG', result.lengths.rng));
    if (result.rngMismatch) {
        const mismatch = result.rngMismatch;
        lines.push(`First PRNG mismatch at call ${mismatch.index + 1}${locationText(mismatch.location)}:`);
        lines.push(`  C: ${printable(mismatch.cEntry)}`);
        lines.push(`  C caller: ${mismatch.cCaller || '<unavailable>'}`);
        lines.push(`  JS: ${printable(mismatch.jsEntry)}`);
    } else {
        lines.push('PRNG values: match');
    }

    lines.push(lengthLine('Screen', result.lengths.screens));
    if (result.screenMismatch) {
        const mismatch = result.screenMismatch;
        lines.push(`First screen mismatch at boundary ${mismatch.index + 1}${locationText(mismatch.location)}:`);
        if (mismatch.kind === 'js-missing') {
            lines.push('  C: screen present');
            lines.push('  JS: <missing>');
        } else if (mismatch.kind === 'c-missing') {
            lines.push('  C: <missing>');
            lines.push('  JS: screen present');
        } else {
            lines.push(`  Cell row ${mismatch.row + 1}, column ${mismatch.column + 1} (${mismatch.kind}):`);
            lines.push(`  C: ${cellText(mismatch.cCell)}`);
            lines.push(`  JS: ${cellText(mismatch.jsCell)}`);
        }
    } else {
        lines.push('Screen cells and attributes: match');
    }

    lines.push(lengthLine('Cursor', result.lengths.cursors));
    if (result.cursorMismatch) {
        const mismatch = result.cursorMismatch;
        lines.push(`First cursor mismatch at boundary ${mismatch.index + 1}${locationText(mismatch.location)}:`);
        lines.push(`  C: ${mismatch.cCursor === undefined ? '<missing>' : JSON.stringify(mismatch.cCursor)}`);
        lines.push(`  JS: ${mismatch.jsCursor === undefined ? '<missing>' : JSON.stringify(mismatch.jsCursor)}`);
    } else {
        lines.push('Cursor values: match');
    }

    lines.push(`RESULT: ${result.passed ? 'PASS' : 'FAIL'}`);
    return `${lines.join('\n')}\n`;
}

function loadRecipe(config) {
    if (config.mode === 'recipe') {
        const inputPath = resolve(config.recipePath);
        if (isSealedHoldoutPath(inputPath)) {
            throw new Error('sealed holdout recipes are not accepted by the fresh differential');
        }
        let data;
        try {
            data = JSON.parse(readFileSync(inputPath, 'utf8'));
        } catch (error) {
            throw new Error(`cannot read recipe ${inputPath}: ${error.message}`);
        }
        return validateCleanRecipe(data, inputPath);
    }

    let exactNethackrc = config.nethackrc;
    if (config.nethackrcFile !== undefined) {
        const rcPath = resolve(config.nethackrcFile);
        if (isSealedHoldoutPath(rcPath)) {
            throw new Error('sealed holdout paths are not accepted by the fresh differential');
        }
        exactNethackrc = readFileSync(rcPath, 'utf8');
    }
    return validateCleanRecipe(buildFreshRecipe(config, exactNethackrc), 'fresh recipe');
}

export async function runDifferential(recipe, recorderEnv = process.env) {
    validateCleanRecipe(recipe, 'fresh recipe');
    const workRoot = mkdtempSync(join(tmpdir(), 'teleport-fresh-diff-'));
    let scoringRoot = null;
    try {
        const isolatedRecorderEnv = stageRecorderEnvironment(
            workRoot,
            recorderEnv,
        );
        const recipePath = join(workRoot, 'recipe.session.json');
        const recordingPath = join(workRoot, 'recorded.session.json');
        writeFileSync(recipePath, JSON.stringify(recipe));

        const recorder = spawnSync(
            process.execPath,
            [RECORD_SCRIPT, recipePath, recordingPath],
            {
                cwd: PROJECT_ROOT,
                encoding: 'utf8',
                env: isolatedRecorderEnv,
                timeout: 10 * 60 * 1000,
                maxBuffer: 64 * 1024 * 1024,
            },
        );
        if (recorder.error || recorder.status !== 0) {
            const detail = (recorder.stderr || '').trim();
            throw new Error(recorder.error?.message
                || `C recorder exited ${recorder.status}${detail ? `\n${detail}` : ''}`);
        }

        const recording = JSON.parse(readFileSync(recordingPath, 'utf8'));
        validateCleanRecipe(recording, 'C recording', { steps: 'require' });
        assertRecordingMatchesRecipe(recording, recipe);

        // createScoringWorkspace copies contestant modules and overlays the
        // three frozen judge files before jsmain.js is imported.
        scoringRoot = createScoringWorkspace(workRoot, [basename(recordingPath)]);
        return runJsDifferentialWorker(
            recordingPath,
            scoringRoot,
            isolatedRecorderEnv,
        );
    } finally {
        if (scoringRoot) removeScoringWorkspace(scoringRoot);
        rmSync(workRoot, { recursive: true, force: true });
    }
}

async function main(argv) {
    const config = parseArgs(argv);
    if (config.mode === 'help') {
        process.stdout.write(`${USAGE}\n`);
        return 0;
    }
    const recipe = loadRecipe(config);
    const result = await runDifferential(recipe);
    process.stdout.write(formatReport(result));
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`diff-fresh: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
