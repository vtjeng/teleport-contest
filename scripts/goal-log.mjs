#!/usr/bin/env node

// Owns GOALS.json, the record of queued, open, and closed goals and their
// slices. The orchestrator writes it through the subcommands below in place
// of hand-editing ROADMAP.md prose, and the delivered-versus-forecast
// comparison that closes a goal is computed from SCORE.tsv through
// scripts/score-log.mjs: the standing at open is captured in the entry, so
// nothing is retyped. ROADMAP.md describes the systems the current goals
// belong to and points here.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRows, standing } from './score-log.mjs';

export const DEFAULT_PATH = fileURLToPath(new URL('../GOALS.json',
    import.meta.url));

export const GOAL_STATUSES = Object.freeze(['queued', 'open', 'closed']);

export function readGoals(path = DEFAULT_PATH) {
    const store = JSON.parse(readFileSync(path, 'utf8'));
    validateGoals(store);
    return store;
}

export function validateGoals(store) {
    if (!store || typeof store !== 'object' || !Array.isArray(store.goals)) {
        throw new Error('GOALS.json must hold a goals array');
    }
    const ids = new Set();
    for (const goal of store.goals) {
        if (typeof goal.id !== 'string' || goal.id.trim().length === 0) {
            throw new Error('every goal needs a nonempty id');
        }
        if (ids.has(goal.id)) throw new Error(`duplicate goal id: ${goal.id}`);
        ids.add(goal.id);
        if (!GOAL_STATUSES.includes(goal.status)) {
            throw new Error(`goal ${goal.id} has unknown status ${goal.status}`);
        }
        if (typeof goal.boundary !== 'string' || goal.boundary.trim().length === 0) {
            throw new Error(`goal ${goal.id} needs a boundary`);
        }
        for (const slice of goal.slices ?? []) {
            if (typeof slice.name !== 'string' || slice.name.trim().length === 0) {
                throw new Error(`goal ${goal.id} has a slice without a name`);
            }
            if (slice.status !== 'queued' && slice.status !== 'closed') {
                throw new Error(
                    `slice ${slice.name} has unknown status ${slice.status}`,
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

/** Build a forecast whose named sessions each carry an exact C-path trace. */
export function buildForecast(options) {
    if (options['forecast-steps'] === undefined) return null;
    const steps = Number(options['forecast-steps']);
    if (!Number.isInteger(steps) || steps < 0) {
        throw new Error('--forecast-steps must be a nonnegative integer');
    }
    const basis = options['forecast-basis']?.trim();
    if (!basis) throw new Error('--forecast-basis is required');

    const sessions = commaSeparated(options.sessions);
    if (steps > 0 && sessions.length === 0) {
        throw new Error('a nonzero forecast requires --sessions');
    }
    if (new Set(sessions).size !== sessions.length) {
        throw new Error('--sessions contains a duplicate session');
    }

    const witnessValues = options['forecast-witness'] === undefined
        ? []
        : Array.isArray(options['forecast-witness'])
            ? options['forecast-witness']
            : [options['forecast-witness']];
    const witnesses = witnessValues.map((value) => {
        const separator = value.indexOf('=');
        const session = value.slice(0, separator).trim();
        const evidence = value.slice(separator + 1).trim();
        if (separator < 1 || !evidence) {
            throw new Error(
                '--forecast-witness must be SESSION=C-path evidence',
            );
        }
        return { session, evidence };
    });
    const witnessed = new Set();
    for (const witness of witnesses) {
        if (!sessions.includes(witness.session)) {
            throw new Error(
                `forecast witness names a session outside the forecast: ${
                    witness.session}`,
            );
        }
        if (witnessed.has(witness.session)) {
            throw new Error(`duplicate C-path witness: ${witness.session}`);
        }
        witnessed.add(witness.session);
    }
    const missing = sessions.filter((session) => !witnessed.has(session));
    if (missing.length) {
        throw new Error(`missing C-path witness for ${missing.join(', ')}`);
    }
    return { steps, basis, sessions, witnesses };
}

/** Replace only a queued goal's forecast; opened calibration is immutable. */
export function restateForecast(store, id, forecast) {
    const goal = findGoal(store, id);
    if (goal.status !== 'queued') {
        throw new Error(`goal ${goal.id} is ${goal.status}, not queued`);
    }
    goal.forecast = forecast;
    return goal;
}

function required(options, keys) {
    for (const key of keys) {
        if (!options[key]?.trim()) throw new Error(`--${key} is required`);
    }
}

// The default stays terse because `--current` opens every task; `--detail`
// adds the upstream owners and the traced source findings recorded at
// queue-goal, which the selectors and the worker read before touching source.
export function formatGoal(goal, { detail = false } = {}) {
    const lines = [
        `${goal.status.toUpperCase()} ${goal.id}: ${goal.boundary}`,
    ];
    if (goal.forecast) {
        lines.push(`  forecast: ${goal.forecast.steps} steps (${
            goal.forecast.basis})`);
    }
    if (goal.delivered) {
        lines.push(`  delivered: ${goal.delivered.screens} screens, `
            + `${goal.delivered.rng} rng values`);
    }
    for (const slice of goal.slices ?? []) {
        lines.push(`  [${slice.status}] ${slice.name}`
            + (slice.closedBy ? ` (${slice.closedBy.slice(0, 8)})` : ''));
    }
    if (detail) {
        if (goal.upstreamOwners?.length) {
            lines.push(`  owners: ${goal.upstreamOwners.join(', ')}`);
        }
        for (const witness of goal.forecast?.witnesses ?? []) {
            lines.push(`  witness ${witness.session}: ${witness.evidence}`);
        }
        if (goal.detail) {
            lines.push('  detail:');
            for (const line of goal.detail.split('\n')) {
                lines.push(`    ${line}`);
            }
        }
    }
    return lines.join('\n');
}

// The calibration record behind .agents/selection.md's retirement rule: a
// ranking statistic leaves selection when the last three closed goals each
// delivered less than a tenth of its forecast. GOALS.json carries the
// forecast and delivered figures for goals closed through close-goal;
// SCORE.tsv's `goal` rows carry the standing at every goal close, including
// closes that predate GOALS.json, so both are printed and a blank cell
// renders as `-` instead of dropping the row.
export function calibrationLines(store, rows) {
    const lines = ['Closed goals in GOALS.json (delivered versus forecast):'];
    const closed = store.goals.filter((goal) => goal.status === 'closed');
    if (closed.length === 0) lines.push('  (none recorded)');
    for (const goal of closed) {
        const forecastSteps = goal.forecast?.steps;
        const deliveredScreens = goal.delivered?.screens;
        const ratio = forecastSteps > 0 && Number.isFinite(deliveredScreens)
            ? ` (${(deliveredScreens / forecastSteps).toFixed(2)} of forecast)`
            : '';
        lines.push(`  ${goal.id}: delivered ${deliveredScreens ?? '-'} `
            + `screens, forecast ${forecastSteps ?? '-'} steps${ratio}`);
    }
    lines.push('');
    lines.push('SCORE.tsv goal rows (standing at each close; - is unrecorded):');
    const cell = (value) => (value === '' || value === undefined ? '-' : value);
    for (const row of rows.filter((entry) => entry.event === 'goal')) {
        lines.push(`  ${row.utc.slice(0, 10)}  ${row.sha.slice(0, 8)}  `
            + `screens ${cell(row.screens_matched)}/${cell(row.screens_total)}  `
            + `holdout ${cell(row.holdout_screens_matched)}/${
                cell(row.holdout_screens_total)}  ${row.note}`);
    }
    return lines;
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
        const value = args[index + 1];
        if (key === 'forecast-witness') {
            options[key] ??= [];
            options[key].push(value);
        } else if (Object.hasOwn(options, key)) {
            throw new Error(`--${key} was provided twice`);
        } else {
            options[key] = value;
        }
        index += 1;
    }
    return options;
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
    if (mode === 'calibration') {
        if (args.length > 1) throw new Error('calibration takes no options');
        for (const line of calibrationLines(readGoals(), readRows())) {
            console.log(line);
        }
        return;
    }
    const options = parseOptions(args.slice(1));
    if (mode === 'queue-goal' || mode === 'open-goal') {
        required(options, ['id', 'boundary']);
        const store = readGoals();
        let goal = store.goals.find((entry) => entry.id === options.id);
        if (!goal) {
            goal = { id: options.id, status: 'queued', boundary: options.boundary,
                upstreamOwners: options.owners
                    ? options.owners.split(',').map((owner) => owner.trim())
                    : [],
                forecast: buildForecast(options),
                detail: options.detail ?? '',
                slices: [],
                openedAt: null,
                openStanding: null,
                closedAt: null,
                delivered: null,
            };
            store.goals.push(goal);
        }
        if (mode === 'open-goal') {
            if (goal.forecast?.sessions?.length
                && goal.forecast.sessions.some((session) =>
                    !goal.forecast.witnesses?.some(
                        (witness) => witness.session === session,
                    ))) {
                throw new Error(
                    `goal ${goal.id} needs one C-path witness per forecast `
                    + 'session before it can open',
                );
            }
            goal.status = 'open';
            goal.openedAt = repositoryHead();
            goal.openStanding = developmentStanding();
        }
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'restate-forecast') {
        required(options, ['id', 'forecast-steps', 'forecast-basis']);
        const store = readGoals();
        const goal = restateForecast(
            store,
            options.id,
            buildForecast(options),
        );
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'queue-slice' || mode === 'close-slice') {
        required(options, ['goal', 'name']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        let slice = (goal.slices ?? []).find((s) => s.name === options.name);
        if (mode === 'queue-slice') {
            if (slice) throw new Error(`slice already exists: ${options.name}`);
            slice = { name: options.name, status: 'queued', closedBy: null };
            goal.slices.push(slice);
        } else {
            if (!slice) throw new Error(`no slice named: ${options.name}`);
            slice.status = 'closed';
            slice.closedBy = repositoryHead();
        }
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    if (mode === 'close-goal') {
        required(options, ['goal']);
        const store = readGoals();
        const goal = findGoal(store, options.goal);
        if (goal.status !== 'open') {
            throw new Error(`goal ${goal.id} is ${goal.status}, not open`);
        }
        goal.status = 'closed';
        goal.closedAt = repositoryHead();
        goal.delivered = deliveredSince(goal.openStanding,
            developmentStanding());
        writeGoals(store);
        console.log(formatGoal(goal));
        return;
    }
    throw new Error('modes: --current [--detail], calibration, queue-goal, '
        + 'restate-forecast, open-goal, queue-slice, close-slice, close-goal');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`goal-log: ${error.message}`);
        process.exitCode = 1;
    }
}
