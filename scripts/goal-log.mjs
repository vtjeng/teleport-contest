#!/usr/bin/env node

// Owns GOALS.json, the record of queued, open, parked, and closed goals and
// spans. A goal is a C/Lua source port or divergence fix (.agents/glossary.md); the
// orchestrator writes it through the subcommands below. Goals recorded before
// 2026-09-05 carry the retired boundary, forecast, and slices fields. The
// reader accepts them as history; the writer never produces them.

import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { currentDevelopmentStanding } from './development-standing.mjs';
import { readCheckpointResult } from './checkpoint-results.mjs';
import {
    PROJECT_ROOT, cFunctions, jsFunctionNames, listCFiles, markDeclared,
    parseCFunctions,
} from './c-functions.mjs';
import { listLuaFiles, luaProgram } from './lua-sources.mjs';
import { completedFunctionNames, validatePortEvidence } from './port-evidence.mjs';

export const DEFAULT_PATH = fileURLToPath(new URL('../GOALS.json',
    import.meta.url));
export const SPAN_CONTEXT_PATH = join(PROJECT_ROOT, '.cache', 'span-context.json');

export const GOAL_STATUSES = Object.freeze(['queued', 'open', 'parked', 'closed']);
export const GOAL_KINDS = Object.freeze(['file-port', 'lua-port', 'divergence-fix']);

// A span stops growing at this many C lines. The cap was 400 from 2026-09-05
// until the 34 spans that closed under it were measured on 2026-09-06: 29
// ended at an already-ported neighbour rather than at the cap, at a median of
// 43 C lines, and commit timestamps put a worker's fixed cost near four
// minutes per span against about a minute per twelve C lines ported. Spans
// of 227 to 426 C lines took 20 to 39 minutes of worker time. Recalibrate
// from commit timestamps and `git diff --numstat` once ten spans have closed
// under this cap.
export const SPAN_LINE_CAP = 800;

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
            if (!nonempty(goal.kind === 'lua-port' ? goal.luaFile : goal.cFile)) {
                throw new Error(`goal ${goal.id} needs a source file`);
            }
            if (isSourcePort(goal) && !Array.isArray(goal.functions)) {
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

/** The current checkpoint supplies totals; SCORE.tsv remains the event log. */
export function checkpointClosingStanding(summary, head) {
    assertCheckpointCurrent(summary, head);
    const sha = summary.executionCommit;
    const screens = summary.score?.screensMatched;
    const rng = summary.score?.rngMatched;
    if (!/^[a-f0-9]{40}$/u.test(sha ?? '')
        || !Number.isSafeInteger(screens) || screens < 0
        || !Number.isSafeInteger(rng) || rng < 0)
        throw new Error('checkpoint lacks valid development figures; run npm run checkpoint -- --force');
    return { sha, screens, rng };
}

/** Delivered figures for a closing goal: the standing now minus at open. */
export function deliveredSince(openStanding, closeStanding) {
    if (!openStanding || !closeStanding) return null;
    return {
        screens: closeStanding.screens - openStanding.screens,
        rng: closeStanding.rng - openStanding.rng,
    };
}

export function addDelivered(previous, current) {
    if (previous === null || current === null) return null;
    return {
        screens: (previous?.screens ?? 0) + current.screens,
        rng: (previous?.rng ?? 0) + current.rng,
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

export function isSourcePort(goal) {
    return goal.kind === 'file-port' || goal.kind === 'lua-port';
}

function sourceFile(goal) {
    return goal.luaFile ?? goal.cFile;
}

/** Keep name inventory and evidence-backed completion separate. */
export function completionCount(goal) {
    const functions = goal.functions ?? [];
    return {
        declared: functions.filter((entry) => entry.declared).length,
        complete: functions.filter((entry) => entry.complete).length,
        total: functions.length,
    };
}

/** Evidence belongs to its source file, not to a globally matching name. */
export function verifiedNames(file, goals) {
    const names = new Set();
    for (const goal of goals) {
        if (sourceFile(goal) !== file) continue;
        for (const name of completedFunctionNames(goal)) names.add(name);
    }
    return names;
}

/** Historical `ported` booleans are name matches, never completion evidence. */
export function refreshCompletion(goal, names = null, goals = [goal]) {
    if (!isSourcePort(goal)) return goal;
    const complete = verifiedNames(sourceFile(goal), goals);
    const declared = names ?? jsFunctionNames();
    goal.functions = markDeclared(goal.functions, declared).map((entry) => ({
        ...entry,
        complete: complete.has(entry.name)
            && (goal.kind === 'lua-port' || entry.declared),
    }));
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
 * The next span of a source port: the unverified units, in source order, that
 * follow the last closed span, up to `cap` C lines.
 *
 * The first span starts at the file's first unverified unit. Every later
 * span starts at the first unverified unit after the last closed span,
 * wrapping to the top of the file. From there the span passes over verified
 * units and collects unverified ones until the next would exceed the cap
 * or the file ends; it always holds at least one function. Returns null
 * when every unit has completion evidence.
 */
export function nextSpan(functions, closedSpans, cap = SPAN_LINE_CAP) {
    if (!functions.some((entry) => !entry.complete)) return null;
    const firstUnverifiedFrom = (index) => {
        const after = functions.findIndex(
            (entry, position) => position >= index && !entry.complete,
        );
        return after >= 0 ? after : functions.findIndex((entry) => !entry.complete);
    };
    let startIndex;
    const lastClosed = closedSpans.at(-1);
    if (lastClosed?.functions?.length) {
        const lastName = lastClosed.functions.at(-1);
        const lastIndex = functions.findIndex((entry) => entry.name === lastName);
        startIndex = firstUnverifiedFrom(lastIndex + 1);
    } else {
        startIndex = firstUnverifiedFrom(0);
    }
    const run = [];
    let cLines = 0;
    for (let index = startIndex; index < functions.length; index += 1) {
        const entry = functions[index];
        if (entry.complete) continue;
        const size = entry.endLine - entry.line + 1;
        if (run.length > 0 && cLines + size > cap) break;
        run.push(entry);
        cLines += size;
    }
    return {
        functions: run.map((entry) => entry.name),
        lineRanges: lineRanges(run),
        cLines,
    };
}

/**
 * The C line ranges that `entries` cover, as `line-endLine` strings in file
 * order. Functions that touch or overlap merge into one range, so a span
 * whose functions sit apart in the file lists one range per stretch.
 */
export function lineRanges(entries) {
    const ranges = [];
    for (const entry of [...entries].sort((a, b) => a.line - b.line)) {
        const last = ranges.at(-1);
        if (last && entry.line <= last.endLine + 1) {
            last.endLine = Math.max(last.endLine, entry.endLine);
        } else {
            ranges.push({ line: entry.line, endLine: entry.endLine });
        }
    }
    return ranges.map((range) => `${range.line}-${range.endLine}`);
}

function spanName(span, previous) {
    const { functions } = span;
    const base = functions.length === 1
        ? functions[0]
        : `${functions[0]}..${functions.at(-1)}`;
    // An old span can be closed without completion evidence. Rechecking its
    // source units needs a distinct name so close-span addresses the new work.
    const names = new Set(previous.map((entry) => entry.name));
    let name = base;
    for (let attempt = 2; names.has(name); attempt += 1) name = `${base} (${attempt})`;
    return name;
}

function jsFileFor(cFile) {
    return `js/${cFile.replace(/\.c$/u, '.js')}`;
}

/** The context file the span worker reads, for a queued span of `goal`. */
export function spanContext(goal, span) {
    const entries = span.functions.map(
        (name) => goal.functions.find((entry) => entry.name === name),
    );
    return {
        goal: goal.id,
        kind: goal.kind,
        sourceFile: sourceFile(goal),
        ...(goal.luaFile ? { luaFile: goal.luaFile } : { cFile: goal.cFile }),
        functions: span.functions,
        lineRanges: lineRanges(entries),
        cLines: entries.reduce(
            (sum, entry) => sum + (entry.endLine - entry.line + 1), 0,
        ),
        jsFile: goal.luaFile ? null : jsFileFor(goal.cFile),
        sessions: goal.sessions ?? [],
        evidenceRequired: 'whole source, production callers, tests for pure '
            + 'functions, matching recordings for impure functions and entry points',
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
    if (isSourcePort(goal)) {
        const { declared, complete, total } = completionCount(goal);
        lines.push(`  ${goal.kind} of ${sourceFile(goal)}: ${complete} of ${total} `
            + 'source units verified'
            + (goal.kind === 'file-port' ? `; ${declared} declarations found` : ''));
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
 * The C roadmap counts declarations separately from completion evidence.
 */
export function roadmapRows(files, names, goals) {
    const latestGoal = new Map();
    for (const goal of goals) {
        if (goal.kind === 'file-port') latestGoal.set(goal.cFile, goal);
    }
    return files.map(({ name, text }) => {
        const functions = parseCFunctions(text);
        const declared = functions.filter((entry) => names.has(entry.name)).length;
        const evidence = verifiedNames(name, goals);
        const complete = functions.filter((entry) => names.has(entry.name)
            && evidence.has(entry.name)).length;
        const goal = latestGoal.get(name);
        return {
            cFile: name,
            total: functions.length,
            declared,
            complete,
            pending: functions.length - complete,
            goal: goal ? `${goal.id} (${goal.status})` : '',
        };
    }).sort((a, b) => b.pending - a.pending || a.cFile.localeCompare(b.cFile));
}

export function luaRoadmapRows(files, goals) {
    return files.map(({ name }) => ({
        luaFile: name,
        complete: verifiedNames(name, goals).has(name),
    }));
}

export function formatRoadmap(rows, head, luaRows = []) {
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const complete = rows.reduce((sum, row) => sum + row.complete, 0);
    const lines = [
        `Verified C functions: ${complete} of ${total}, at ${head.slice(0, 8)}.`,
        '',
        'Declarations are inventory only. Historical name matches carry no',
        'completion evidence. Resolve the mismatch queue before roadmap work.',
        '',
        '| C file | Functions | Declared | Verified | Unverified | Goal |',
        '| --- | ---: | ---: | ---: | ---: | --- |',
    ];
    for (const row of rows) {
        lines.push(`| ${row.cFile} | ${row.total} | ${row.declared} | ${row.complete} `
            + `| ${row.pending} `
            + `| ${row.goal} |`);
    }
    lines.push('', `Verified Lua programs: ${luaRows.filter((row) => row.complete).length}`
        + ` of ${luaRows.length}.`, '',
    'Each Lua file includes its top-level program. Loader registration alone',
    'does not establish completion.', '', '| Lua source | Completion evidence |',
    '| --- | --- |');
    for (const row of luaRows)
        lines.push(`| ${row.luaFile} | ${row.complete ? 'verified' : 'unverified'} |`);
    return `${lines.join('\n')}\n`;
}

// Help is static so discovering a command never depends on game state, Git,
// the C checkout, or a development scan. Keep syntax beside the CLI parser.
const COMMAND_HELP = {
    '--current': {
        description: 'Show queued, open, and parked goals (the default command).',
        usage: '[--detail]',
        details: '  --detail  Include source-unit evidence and goal details.',
    },
    roadmap: {
        description: 'List C declarations and verified C/Lua source units.',
        usage: '',
        details: 'Takes no operation arguments. Requires the C and Lua source checkout.',
    },
    'queue-goal': {
        description: 'Create a queued C port, Lua port, or divergence-fix goal.',
        usage: '--id <id> --kind <kind> --summary <text> <source options> [options]',
        details: `Source options by --kind:
  file-port       --c-file <name.c>
                  [--from-function <name>] [--to-function <name>]
                  Omitted bounds select the start/end of the C file.
  lua-port        --lua-file <name.lua>
                  Covers the whole Lua program, including top-level statements.
  divergence-fix  --c-file <name.c> --function <name> --session <session>
                  [--step <input-step>]

Optional for all kinds:
  --sessions <a,b,...>        Related development or holdout/ sessions.
  --selection-reason <text>  Source-based reason for choosing this goal.
  --detail <text>            Supporting source and mismatch evidence.

The goal ID must be new. Selection must satisfy the current mismatch queue.
Queueing does not open the goal; use open-goal before planning a span.`,
    },
    'open-goal': {
        description: 'Open a queued goal or resume a parked goal.',
        usage: '--id <id> [--selection-reason <text>]',
        details: 'Requires a queued or parked goal and a valid current selection.\n'
            + 'Captures the development standing; scoring inputs must be clean.',
    },
    'next-span': {
        description: 'Plan or resume the next span of a C or Lua source port.',
        usage: '--goal <id>',
        details: 'Requires an open source port. Writes .cache/span-context.json\n'
            + 'for the selected span. For a divergence fix, use queue-span.',
    },
    'queue-span': {
        description: 'Queue a named span for a divergence fix.',
        usage: '--goal <id> --name <name> [--functions <a,b,...>]',
        details: 'Requires an open divergence-fix goal, a new span name, and a valid\n'
            + 'current selection. For a C or Lua source port, use next-span.',
    },
    'record-evidence': {
        description: 'Record verified source completion evidence for a goal.',
        usage: '--goal <id> --evidence <relative-path.json>',
        details: 'Requires an open C or Lua source port and a regular evidence file\n'
            + 'inside this worktree. The schema is in .agents/validation.md.',
    },
    'close-span': {
        description: 'Close a queued span of an open goal.',
        usage: '--goal <id> --name <name>',
        details: 'Source ports require completion evidence for every planned unit\n'
            + 'and a passing checkpoint at HEAD, including the recordings corpus.',
    },
    'park-goal': {
        description: 'Park an open goal while preserving its progress and spans.',
        usage: '--goal <id> --reason <text>',
        details: 'Requires an open goal and clean scoring inputs to capture its\n'
            + 'development standing. Resume it later with open-goal.',
    },
    'discard-goal': {
        description: 'Remove a queued goal from GOALS.json.',
        usage: '--id <id> --reason <text>',
        details: 'Only queued goals can be discarded; open or parked goals cannot.',
    },
    'close-goal': {
        description: 'Close an open goal and record its delivered progress.',
        usage: '--goal <id>',
        details: 'Requires an open goal and a passing checkpoint for HEAD. Closing figures\n'
            + 'come from checkpoint; SCORE.tsv remains the event log. Source ports also\n'
            + 'require closed spans and complete source and entry-point evidence.\n'
            + 'See .agents/loop.md and .agents/scoring.md for the closure sequence.',
    },
};

function formatHelp(mode) {
    if (mode !== undefined) {
        const { description, usage, details } = COMMAND_HELP[mode];
        return `Usage: node scripts/goal-log.mjs ${mode}${usage ? ` ${usage}` : ''}\n\n`
            + `${description}\n\n${details}`;
    }
    return [
        'Usage: node scripts/goal-log.mjs [command] [options]',
        '',
        'Commands:',
        ...Object.entries(COMMAND_HELP).map(([command, { description }]) =>
            `  ${command.padEnd(17)} ${description}`),
        '',
        'Run node scripts/goal-log.mjs <command> --help for arguments and prerequisites.',
        'Help prints syntax without reading or changing repository state.',
    ].join('\n');
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
    required(options, ['id', 'kind', 'summary']);
    if (!GOAL_KINDS.includes(options.kind)) {
        throw new Error(`--kind must be one of ${GOAL_KINDS.join(', ')}`);
    }
    required(options, [options.kind === 'lua-port' ? 'lua-file' : 'c-file']);
    const goal = {
        id: options.id,
        kind: options.kind,
        status: 'queued',
        summary: options.summary,
        ...(options.kind === 'lua-port'
            ? { luaFile: options['lua-file'] } : { cFile: options['c-file'] }),
        sessions: commaSeparated(options.sessions),
        selectionReason: options['selection-reason'] ?? '',
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
        if (!functions.length) throw new Error(`${goal.cFile} has no function definitions`);
        goal.functions = markDeclared(functions, jsFunctionNames());
        goal.range = { from: functions[0].line, to: functions.at(-1).endLine };
    } else if (goal.kind === 'lua-port') {
        goal.functions = [luaProgram(goal.luaFile)];
    } else {
        required(options, ['function', 'session']);
        goal.function = options.function;
        goal.session = options.session;
        if (options.step !== undefined) goal.step = Number(options.step);
    }
    return goal;
}

/** A name inventory, an empty span list, or a unit test alone cannot close a port. */
export function assertPortComplete(goal) {
    if (!isSourcePort(goal)) return;
    const pending = goal.functions.filter((entry) => !entry.complete);
    if (pending.length) throw new Error(`unverified source units: ${pending.map((entry) => entry.name).join(', ')}`);
    if (goalSpans(goal).some((span) => span.status !== 'closed'))
        throw new Error('close every span before closing the goal');
    if (!nonempty(goal.evidence?.entryPointReview))
        throw new Error('record an entryPointReview covering every source entry point');
    if (!Array.isArray(goal.evidence?.entryPoints))
        throw new Error('record the entryPoints list, including an empty list for a helper-only range');
    for (const entry of goal.evidence.entryPoints) {
        if (!entry.recordings?.length)
            throw new Error(`entry point ${entry.name} has no matching recording`);
    }
}

/** Merge one span's evidence without discarding evidence for earlier spans. */
export function recordEvidence(goal, evidence, head) {
    const previous = goal.evidence ?? {};
    const functions = new Map((previous.functions ?? []).map((entry) => [entry.name, entry]));
    for (const entry of evidence.functions ?? [])
        functions.set(entry.name, { ...entry, checkedAt: head });
    goal.evidence = { ...previous, ...evidence, functions: [...functions.values()] };
    return goal;
}

function readEvidence(path) {
    // Worker evidence is an ephemeral JSON file in this worktree's cache.
    // Restrict the input before reading it; no session path is accepted.
    if (!/^\.cache\/[A-Za-z0-9_.-]+\.json$/u.test(path))
        throw new Error('--evidence must name a JSON file directly under .cache/');
    if (lstatSync(join(PROJECT_ROOT, '.cache')).isSymbolicLink()
        || !lstatSync(join(PROJECT_ROOT, path)).isFile()
        || lstatSync(join(PROJECT_ROOT, path)).isSymbolicLink())
        throw new Error('evidence must be a regular file in this worktree');
    return JSON.parse(readFileSync(join(PROJECT_ROOT, path), 'utf8'));
}

async function checkSelection(goal) {
    const { assertGoalSelection, loadMismatchQueue } = await import('./mismatch-queue.mjs');
    const queue = loadMismatchQueue();
    const candidate = assertGoalSelection(queue, goal);
    if (isSourcePort(goal) && !goal.sessions.length && candidate)
        goal.sessions = [...candidate.sessions];
    return queue;
}

function scopedMismatches(goal, queue) {
    const sessions = new Set([goal.session, ...(goal.sessions ?? [])]);
    return queue.sessions.filter((entry) => sessions.has(entry.session));
}

export function assertCheckpointCurrent(summary, head) {
    if (summary?.commit !== head || summary?.allPassed !== true
        || summary?.recordings?.passed !== true)
        throw new Error('run a passing npm run checkpoint at HEAD before closing source work');
}

function requireCheckpoint(head) {
    let summary;
    try {
        summary = readCheckpointResult(PROJECT_ROOT, head);
    } catch {
        // The same actionable error covers a missing or malformed summary.
    }
    assertCheckpointCurrent(summary, head);
    return summary;
}

async function main(args) {
    const mode = args[0];
    if (mode === '--help') {
        if (args.length !== 1) throw new Error('--help takes no other arguments');
        console.log(formatHelp());
        return;
    }
    if (mode !== undefined && !Object.hasOwn(COMMAND_HELP, mode))
        throw new Error(`unknown command: ${mode}`);
    if (args.includes('--help')) {
        if (args.length !== 2 || args[1] !== '--help')
            throw new Error('request command help without other arguments');
        console.log(formatHelp(mode));
        return;
    }
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
        const names = jsFunctionNames();
        for (const goal of visible)
            console.log(formatGoal(refreshCompletion(goal, names, store.goals), { detail }));
        return;
    }
    if (mode === 'roadmap') {
        if (args.length > 1) throw new Error('roadmap takes no options');
        const files = listCFiles().map((file) => ({
            name: file.name,
            text: readFileSync(file.path, 'utf8'),
        }));
        const goals = readGoals().goals;
        const rows = roadmapRows(files, jsFunctionNames(), goals);
        process.stdout.write(formatRoadmap(rows, repositoryHead(),
            luaRoadmapRows(listLuaFiles(), goals)));
        return;
    }
    const options = parseOptions(args.slice(1));
    if (mode === 'queue-goal') {
        const store = readGoals();
        if (store.goals.some((entry) => entry.id === options.id)) {
            throw new Error(`goal already exists: ${options.id}`);
        }
        const goal = newGoal(options);
        await checkSelection(goal);
        refreshCompletion(goal, null, store.goals);
        store.goals.push(goal);
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'open-goal') {
        required(options, ['id']);
        const store = readGoals();
        const goal = findGoal(store, options.id);
        if (goal.status !== 'queued' && goal.status !== 'parked') {
            throw new Error(`goal ${goal.id} is ${goal.status}, not queued or parked`);
        }
        if (options['selection-reason']) goal.selectionReason = options['selection-reason'];
        const queue = await checkSelection(goal);
        const opening = currentDevelopmentStanding();
        if (goal.openedAt == null) goal.openedAt = repositoryHead();
        if (goal.openStanding == null) goal.openStanding = opening;
        goal.status = 'open';
        goal.activeStanding = opening;
        goal.openMismatches ??= scopedMismatches(goal, queue);
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'next-span') {
        required(options, ['goal']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        if (!isSourcePort(goal)) {
            throw new Error(`goal ${goal.id} is not a source port; queue its span `
                + 'with queue-span');
        }
        if (goal.status !== 'open') {
            throw new Error(`goal ${goal.id} is ${goal.status}, not open`);
        }
        let span = goal.spans.find((entry) => entry.status === 'queued');
        if (!span) {
            refreshCompletion(goal, null, store.goals);
            const closed = goal.spans.filter((entry) => entry.status === 'closed');
            const next = nextSpan(goal.functions, closed);
            if (!next) {
                console.log(`every source unit of ${sourceFile(goal)} in ${goal.id} `
                    + 'has completion evidence; verify entry-point coverage before closing');
                writeGoals(store);
                return;
            }
            // Reconsider priorities between spans. A queued or open helper
            // goal must not bypass new gameplay blockers merely by existing.
            await checkSelection(goal);
            span = { name: spanName(next, goal.spans), status: 'queued', closedBy: null,
                functions: next.functions };
            goal.spans.push(span);
            writeGoals(store);
        } else {
            await checkSelection(goal);
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
        if (isSourcePort(goal)) throw new Error('plan source-port spans with next-span');
        if (goal.status !== 'open') throw new Error('queue-span requires an open goal');
        await checkSelection(goal);
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
        if (goal.status !== 'open' || span.status !== 'queued')
            throw new Error('close-span requires an open goal and a queued span');
        refreshCompletion(goal, null, store.goals);
        if (isSourcePort(goal)) {
            const complete = new Set(goal.functions.filter((entry) => entry.complete)
                .map((entry) => entry.name));
            const missing = span.functions.filter((name) => !complete.has(name));
            if (missing.length)
                throw new Error(`record completion evidence before closing: ${missing.join(', ')}`);
            requireCheckpoint(repositoryHead());
        }
        span.status = 'closed';
        span.closedBy = repositoryHead();
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'record-evidence') {
        required(options, ['goal', 'evidence']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        if (goal.status !== 'open' || !isSourcePort(goal))
            throw new Error('record-evidence requires an open C or Lua source port');
        const evidence = validatePortEvidence(goal, readEvidence(options.evidence));
        recordEvidence(goal, evidence, repositoryHead());
        refreshCompletion(goal, null, store.goals);
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'park-goal') {
        required(options, ['goal', 'reason']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        if (goal.status !== 'open') throw new Error('only an open goal can be parked');
        const parking = currentDevelopmentStanding();
        goal.progressBeforePark = addDelivered(goal.progressBeforePark,
            deliveredSince(goal.activeStanding ?? goal.openStanding, parking));
        goal.parkedStanding = parking;
        goal.status = 'parked';
        goal.parkedReason = options.reason;
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
        const closeStanding = checkpointClosingStanding(requireCheckpoint(head), head);
        refreshCompletion(goal, null, store.goals);
        assertPortComplete(goal);
        if (isSourcePort(goal)) {
            validatePortEvidence(goal, goal.evidence);
            const { loadMismatchQueue } = await import('./mismatch-queue.mjs');
            goal.closeMismatches = scopedMismatches(goal, loadMismatchQueue());
        }
        goal.status = 'closed';
        goal.closedAt = head;
        goal.closeStanding = closeStanding;
        goal.delivered = addDelivered(goal.progressBeforePark,
            deliveredSince(goal.activeStanding ?? goal.openStanding, closeStanding));
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`goal-log: ${error.message}`);
        const mode = process.argv[2] ?? '--current';
        const command = Object.hasOwn(COMMAND_HELP, mode) ? `${mode} ` : '';
        console.error(`Run node scripts/goal-log.mjs ${command}--help for usage.`);
        process.exitCode = 1;
    });
}
