#!/usr/bin/env node

// Owns GOALS.json, the record of queued, open, and closed goals and their
// spans. A goal is a file port or a divergence fix (.agents/glossary.md); the
// orchestrator writes it through the subcommands below. Goals recorded before
// 2026-09-05 carry the retired boundary, forecast, and slices fields. The
// reader accepts them as history; the writer never produces them.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRows, standing } from './score-log.mjs';
import {
    PROJECT_ROOT, cFunctions, jsFunctionNames, listCFiles, markPorted,
    parseCFunctions,
} from './c-functions.mjs';

export const DEFAULT_PATH = fileURLToPath(new URL('../GOALS.json',
    import.meta.url));
export const ROADMAP_PATH = join(PROJECT_ROOT, 'ROADMAP.md');
export const SPAN_CONTEXT_PATH = join(PROJECT_ROOT, '.cache', 'span-context.json');

export const GOAL_STATUSES = Object.freeze(['queued', 'open', 'closed']);
export const GOAL_KINDS = Object.freeze(['file-port', 'divergence-fix']);

// A span stops growing at this many C lines. It is a starting cap: the last
// 213 slices closed before 2026-09-05 landed a median of 101 JavaScript lines
// with per-slice recording overhead the span rules remove. Recalibrate from
// `git diff --numstat` once ten spans have closed.
export const SPAN_LINE_CAP = 400;

export function readGoals(path = DEFAULT_PATH) {
    const store = JSON.parse(readFileSync(path, 'utf8'));
    validateGoals(store);
    return store;
}

/** The one-line description: `summary` on a current goal, `boundary` before. */
export function goalSummary(goal) {
    return goal.summary ?? goal.boundary;
}

/** The work units under a goal: `spans` on a current goal, `slices` before. */
export function goalSpans(goal) {
    return goal.spans ?? goal.slices ?? [];
}

function nonempty(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function validateGoals(store) {
    if (!store || typeof store !== 'object' || !Array.isArray(store.goals)) {
        throw new Error('GOALS.json must hold a goals array');
    }
    const ids = new Set();
    for (const goal of store.goals) {
        if (!nonempty(goal.id)) throw new Error('every goal needs a nonempty id');
        if (ids.has(goal.id)) throw new Error(`duplicate goal id: ${goal.id}`);
        ids.add(goal.id);
        if (!GOAL_STATUSES.includes(goal.status)) {
            throw new Error(`goal ${goal.id} has unknown status ${goal.status}`);
        }
        if (!nonempty(goalSummary(goal))) {
            throw new Error(`goal ${goal.id} needs a summary`);
        }
        if (goal.kind !== undefined) {
            if (!GOAL_KINDS.includes(goal.kind)) {
                throw new Error(`goal ${goal.id} has unknown kind ${goal.kind}`);
            }
            if (!nonempty(goal.cFile)) {
                throw new Error(`goal ${goal.id} needs a cFile`);
            }
            if (goal.kind === 'file-port' && !Array.isArray(goal.functions)) {
                throw new Error(`goal ${goal.id} needs a functions array`);
            }
            if (goal.kind === 'divergence-fix'
                && !(nonempty(goal.function) && nonempty(goal.session))) {
                throw new Error(
                    `goal ${goal.id} needs the function and session it fixes`,
                );
            }
        }
        for (const span of goalSpans(goal)) {
            if (!nonempty(span.name)) {
                throw new Error(`goal ${goal.id} has a span without a name`);
            }
            if (span.status !== 'queued' && span.status !== 'closed') {
                throw new Error(
                    `span ${span.name} has unknown status ${span.status}`,
                );
            }
        }
    }
    const open = store.goals.filter((goal) => goal.status === 'open');
    if (open.length > 1) {
        throw new Error(`only one goal may be open; found ${open.length}`);
    }
    return store;
}

function writeGoals(store, path = DEFAULT_PATH) {
    validateGoals(store);
    writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

function repositoryHead() {
    return execFileSync('git', ['rev-parse', 'HEAD'],
        { encoding: 'utf8' }).trim();
}

function developmentStanding() {
    const { development } = standing(readRows());
    if (!development) return null;
    return {
        sha: development.sha,
        screens: Number(development.screens_matched),
        rng: Number(development.rng_matched),
    };
}

/**
 * Refuse a close whose standing predates the head.
 *
 * `developmentStanding()` reads `SCORE.tsv` rather than scoring the tree, so a
 * close run before the goal's own row is appended subtracts the previous
 * goal's standing from itself. Closing `chat-command` did that and recorded
 * `delivered: 0 screens, 0 rng values` for a goal that delivered 21 and 31.
 * Nothing in the output said the standing was stale, and `GOALS.json` would
 * have carried the zero forward.
 *
 * A `SCORE.tsv` sha is the short form, so the head is matched by prefix.
 *
 * The check cannot tell a stale row from a correct row whose figures nobody
 * re-measured, so it catches the ordering mistake rather than a wrong
 * measurement. A goal that genuinely delivers zero still records zero, which
 * is right and indistinguishable here.
 */
export function assertStandingIsCurrent(standing, head) {
    const append = `Append the goal row for ${head.slice(0, 7)} with `
        + '`node scripts/score-log.mjs --append`, as .agents/scoring.md '
        + 'states, then close the goal.';
    if (!standing) {
        throw new Error(`SCORE.tsv states no development figure. ${append}`);
    }
    if (!head.startsWith(standing.sha)) {
        throw new Error(
            `the development standing in SCORE.tsv is at ${standing.sha}, not `
            + `the repository head ${head.slice(0, 7)}. close-goal reads `
            + 'SCORE.tsv rather than scoring the tree, so closing now would '
            + `subtract the standing at open from a standing that predates `
            + `this goal. ${append}`,
        );
    }
}

/** Delivered figures for a closing goal: the standing now minus at open. */
export function deliveredSince(openStanding, closeStanding) {
    if (!openStanding || !closeStanding) return null;
    return {
        screens: closeStanding.screens - openStanding.screens,
        rng: closeStanding.rng - openStanding.rng,
    };
}

function findGoal(store, id) {
    const goal = store.goals.find((entry) => entry.id === id);
    if (!goal) throw new Error(`no goal has id: ${id}`);
    return goal;
}

function commaSeparated(value) {
    return value
        ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
        : [];
}

/** How many of a file port's functions have a same-named JavaScript function. */
export function portedCount(goal) {
    const functions = goal.functions ?? [];
    return {
        ported: functions.filter((entry) => entry.ported).length,
        total: functions.length,
    };
}

/** Re-read js/ and update a file port's `ported` marks in place. */
export function refreshPorted(goal, names = null) {
    if (goal.kind !== 'file-port') return goal;
    goal.functions = markPorted(goal.functions, names ?? jsFunctionNames());
    return goal;
}

/**
 * The functions of one C file that a goal covers: every function between
 * `from` and `to` inclusive, in C order, or the whole file when both are
 * omitted.
 */
export function selectFunctionRange(functions, from, to) {
    const start = from ? functions.findIndex((entry) => entry.name === from) : 0;
    const end = to
        ? functions.findIndex((entry) => entry.name === to)
        : functions.length - 1;
    if (start < 0) throw new Error(`no function named ${from} in the file`);
    if (end < 0) throw new Error(`no function named ${to} in the file`);
    if (end < start) throw new Error(`${to} is defined before ${from}`);
    return functions.slice(start, end + 1);
}

/**
 * The next span of a file port: the contiguous run of unported functions
 * that follows the last closed span, capped at `cap` C lines.
 *
 * The first span starts at `startFunction` (the function the divergence
 * queue named) or at the file's first unported function. Every later span
 * starts at the first unported function after the last closed span, wrapping
 * to the top of the file. A run ends at the first ported function or at the
 * cap, and always holds at least one function. Returns null when every
 * function is ported.
 */
export function nextSpan(functions, closedSpans, startFunction, cap = SPAN_LINE_CAP) {
    if (!functions.some((entry) => !entry.ported)) return null;
    const firstUnportedFrom = (index) => {
        const after = functions.findIndex(
            (entry, position) => position >= index && !entry.ported,
        );
        return after >= 0 ? after : functions.findIndex((entry) => !entry.ported);
    };
    let startIndex;
    const lastClosed = closedSpans.at(-1);
    if (lastClosed?.functions?.length) {
        const lastName = lastClosed.functions.at(-1);
        const lastIndex = functions.findIndex((entry) => entry.name === lastName);
        startIndex = firstUnportedFrom(lastIndex + 1);
    } else {
        const named = startFunction
            ? functions.findIndex((entry) => entry.name === startFunction)
            : -1;
        startIndex = firstUnportedFrom(Math.max(named, 0));
    }
    const run = [];
    let cLines = 0;
    for (let index = startIndex; index < functions.length; index += 1) {
        const entry = functions[index];
        if (entry.ported) break;
        const size = entry.endLine - entry.line + 1;
        if (run.length > 0 && cLines + size > cap) break;
        run.push(entry);
        cLines += size;
    }
    return {
        functions: run.map((entry) => entry.name),
        lineRange: `${run[0].line}-${run.at(-1).endLine}`,
        cLines,
    };
}

function spanName(span) {
    const { functions } = span;
    return functions.length === 1
        ? functions[0]
        : `${functions[0]}..${functions.at(-1)}`;
}

function jsFileFor(cFile) {
    return `js/${cFile.replace(/\.c$/u, '.js')}`;
}

/** The context file the span worker reads, for a queued span of `goal`. */
export function spanContext(goal, span) {
    const first = goal.functions.find((entry) => entry.name === span.functions[0]);
    const last = goal.functions.find((entry) => entry.name === span.functions.at(-1));
    return {
        goal: goal.id,
        cFile: goal.cFile,
        functions: span.functions,
        lineRange: `${first.line}-${last.endLine}`,
        cLines: span.functions.reduce((sum, name) => {
            const entry = goal.functions.find((candidate) => candidate.name === name);
            return sum + (entry.endLine - entry.line + 1);
        }, 0),
        jsFile: jsFileFor(goal.cFile),
        sessions: goal.sessions ?? [],
    };
}

function required(options, keys) {
    for (const key of keys) {
        if (!options[key]?.trim()) throw new Error(`--${key} is required`);
    }
}

export function formatGoal(goal, { detail = false } = {}) {
    const lines = [
        `${goal.status.toUpperCase()} ${goal.id}: ${goalSummary(goal)}`,
    ];
    if (goal.kind === 'file-port') {
        const { ported, total } = portedCount(goal);
        lines.push(`  file port of ${goal.cFile}: ${ported} of ${total} `
            + 'functions ported'
            + (goal.startFunction ? `, first span starts at ${goal.startFunction}` : ''));
    } else if (goal.kind === 'divergence-fix') {
        lines.push(`  divergence fix in ${goal.cFile} ${goal.function}() `
            + `for ${goal.session}`
            + (goal.step !== undefined ? ` at step ${goal.step}` : ''));
    }
    if (goal.sessions?.length) {
        lines.push(`  sessions: ${goal.sessions.join(', ')}`);
    }
    if (goal.delivered) {
        lines.push(`  delivered: ${goal.delivered.screens} screens, `
            + `${goal.delivered.rng} rng values`);
    }
    for (const span of goalSpans(goal)) {
        lines.push(`  [${span.status}] ${span.name}`
            + (span.closedBy ? ` (${span.closedBy.slice(0, 8)})` : ''));
    }
    if (detail && goal.detail) {
        lines.push('  detail:');
        for (const line of goal.detail.split('\n')) {
            lines.push(`    ${line}`);
        }
    }
    return lines.join('\n');
}

/**
 * The roadmap table: one row per C file with its function counts and the
 * goal that covers it, ordered by the number of unported functions.
 */
export function roadmapRows(files, names, goals) {
    const latestGoal = new Map();
    for (const goal of goals) {
        if (goal.kind === 'file-port') latestGoal.set(goal.cFile, goal);
    }
    return files.map(({ name, text }) => {
        const functions = parseCFunctions(text);
        const ported = functions.filter((entry) => names.has(entry.name)).length;
        const goal = latestGoal.get(name);
        return {
            cFile: name,
            total: functions.length,
            ported,
            unported: functions.length - ported,
            goal: goal ? `${goal.id} (${goal.status})` : '',
        };
    }).sort((a, b) => b.unported - a.unported || a.cFile.localeCompare(b.cFile));
}

export function formatRoadmap(rows, head) {
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const ported = rows.reduce((sum, row) => sum + row.ported, 0);
    const lines = [
        '# Roadmap',
        '',
        `Generated by \`node scripts/goal-log.mjs roadmap\` at ${head.slice(0, 8)}. `
        + 'Do not edit by hand.',
        '',
        'This table lists every C file under `src/` and `win/tty/` in',
        '`nethack-c/upstream/`, the functions it defines, and how many of them',
        'have a same-named JavaScript function under `js/`. A name match says a',
        'port exists, not that it is complete or correct. The rows are the',
        'remaining work, ordered by unported functions; `.agents/selection.md`',
        'states how the divergence queue chooses the next file.',
        '',
        `Ported functions: ${ported} of ${total}.`,
        '',
        '| C file | Functions | Ported | Unported | Goal |',
        '| --- | ---: | ---: | ---: | --- |',
    ];
    for (const row of rows) {
        lines.push(`| ${row.cFile} | ${row.total} | ${row.ported} | ${row.unported} `
            + `| ${row.goal} |`);
    }
    return `${lines.join('\n')}\n`;
}

function parseOptions(args) {
    const options = {};
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (!argument.startsWith('--')) {
            throw new Error(`unexpected argument: ${argument}`);
        }
        const key = argument.slice(2);
        if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
            throw new Error(`${argument} needs a value`);
        }
        if (Object.hasOwn(options, key)) {
            throw new Error(`--${key} was provided twice`);
        }
        options[key] = args[index + 1];
        index += 1;
    }
    return options;
}

function newGoal(options) {
    required(options, ['id', 'kind', 'summary', 'c-file']);
    if (!GOAL_KINDS.includes(options.kind)) {
        throw new Error(`--kind must be one of ${GOAL_KINDS.join(', ')}`);
    }
    const goal = {
        id: options.id,
        kind: options.kind,
        status: 'queued',
        summary: options.summary,
        cFile: options['c-file'],
        sessions: commaSeparated(options.sessions),
        detail: options.detail ?? '',
        spans: [],
        openedAt: null,
        openStanding: null,
        closedAt: null,
        delivered: null,
    };
    if (goal.kind === 'file-port') {
        const functions = selectFunctionRange(
            cFunctions(goal.cFile),
            options['from-function'],
            options['to-function'],
        );
        goal.functions = markPorted(functions, jsFunctionNames());
        goal.range = { from: functions[0].line, to: functions.at(-1).endLine };
        if (options['start-function']
            && !functions.some((entry) => entry.name === options['start-function'])) {
            throw new Error(
                `--start-function ${options['start-function']} is outside the range`,
            );
        }
        goal.startFunction = options['start-function'] ?? null;
    } else {
        required(options, ['function', 'session']);
        goal.function = options.function;
        goal.session = options.session;
        if (options.step !== undefined) goal.step = Number(options.step);
    }
    return goal;
}

function main(args) {
    const mode = args[0];
    if (mode === '--current' || mode === undefined) {
        const rest = args.slice(1);
        const unexpected = rest.find((argument) => argument !== '--detail');
        if (unexpected) throw new Error(`unexpected argument: ${unexpected}`);
        const detail = rest.includes('--detail');
        const store = readGoals();
        const visible = store.goals.filter((goal) => goal.status !== 'closed');
        if (visible.length === 0) {
            console.log('No open or queued goal.');
            return;
        }
        for (const goal of visible) console.log(formatGoal(goal, { detail }));
        return;
    }
    if (mode === 'roadmap') {
        if (args.length > 1) throw new Error('roadmap takes no options');
        const files = listCFiles().map((file) => ({
            name: file.name,
            text: readFileSync(file.path, 'utf8'),
        }));
        const rows = roadmapRows(files, jsFunctionNames(), readGoals().goals);
        writeFileSync(ROADMAP_PATH, formatRoadmap(rows, repositoryHead()));
        console.log(`wrote ${ROADMAP_PATH}: ${rows.length} C files`);
        return;
    }
    const options = parseOptions(args.slice(1));
    if (mode === 'queue-goal') {
        const store = readGoals();
        if (store.goals.some((entry) => entry.id === options.id)) {
            throw new Error(`goal already exists: ${options.id}`);
        }
        const goal = newGoal(options);
        store.goals.push(goal);
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'open-goal') {
        required(options, ['id']);
        const store = readGoals();
        const goal = findGoal(store, options.id);
        if (goal.status !== 'queued') {
            throw new Error(`goal ${goal.id} is ${goal.status}, not queued`);
        }
        goal.status = 'open';
        goal.openedAt = repositoryHead();
        goal.openStanding = developmentStanding();
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'next-span') {
        required(options, ['goal']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        if (goal.kind !== 'file-port') {
            throw new Error(`goal ${goal.id} is not a file port; queue its span `
                + 'with queue-span');
        }
        if (goal.status !== 'open') {
            throw new Error(`goal ${goal.id} is ${goal.status}, not open`);
        }
        let span = goal.spans.find((entry) => entry.status === 'queued');
        if (!span) {
            refreshPorted(goal);
            const closed = goal.spans.filter((entry) => entry.status === 'closed');
            const next = nextSpan(goal.functions, closed, goal.startFunction);
            if (!next) {
                console.log(`every function of ${goal.cFile} in ${goal.id} is `
                    + 'ported; close the goal');
                writeGoals(store);
                return;
            }
            span = { name: spanName(next), status: 'queued', closedBy: null,
                functions: next.functions };
            goal.spans.push(span);
            writeGoals(store);
        }
        const context = spanContext(goal, span);
        mkdirSync(join(PROJECT_ROOT, '.cache'), { recursive: true });
        writeFileSync(SPAN_CONTEXT_PATH, `${JSON.stringify(context, null, 2)}\n`);
        console.log(JSON.stringify(context, null, 2));
        return;
    }
    if (mode === 'queue-span') {
        required(options, ['goal', 'name']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        const spans = goalSpans(goal);
        if (spans.some((entry) => entry.name === options.name)) {
            throw new Error(`span already exists: ${options.name}`);
        }
        goal.spans = spans;
        goal.spans.push({ name: options.name, status: 'queued', closedBy: null,
            functions: commaSeparated(options.functions) });
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'close-span') {
        required(options, ['goal', 'name']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        const span = goalSpans(goal).find((entry) => entry.name === options.name);
        if (!span) throw new Error(`no span named: ${options.name}`);
        span.status = 'closed';
        span.closedBy = repositoryHead();
        refreshPorted(goal);
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'discard-goal') {
        required(options, ['id', 'reason']);
        const store = readGoals();
        const index = store.goals.findIndex((entry) => entry.id === options.id);
        if (index === -1) throw new Error(`no goal with id: ${options.id}`);
        const goal = store.goals[index];
        if (goal.status !== 'queued') {
            throw new Error(
                `goal ${goal.id} is ${goal.status}; only queued goals can be `
                + 'discarded',
            );
        }
        store.goals.splice(index, 1);
        writeGoals(store);
        console.log(`discarded ${goal.id}: ${options.reason}`);
        return;
    }
    if (mode === 'close-goal') {
        required(options, ['goal']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        if (goal.status !== 'open') {
            throw new Error(`goal ${goal.id} is ${goal.status}, not open`);
        }
        const head = repositoryHead();
        const closeStanding = developmentStanding();
        assertStandingIsCurrent(closeStanding, head);
        refreshPorted(goal);
        goal.status = 'closed';
        goal.closedAt = head;
        goal.delivered = deliveredSince(goal.openStanding, closeStanding);
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    throw new Error('modes: --current [--detail], queue-goal, open-goal, '
        + 'next-span, queue-span, close-span, discard-goal, close-goal, roadmap');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`goal-log: ${error.message}`);
        process.exitCode = 1;
    }
}
