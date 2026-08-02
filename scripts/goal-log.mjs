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

function required(options, keys) {
    for (const key of keys) {
        if (!options[key]?.trim()) throw new Error(`--${key} is required`);
    }
}

function formatGoal(goal) {
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
    return lines.join('\n');
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
        options[key] = args[index + 1];
        index += 1;
    }
    return options;
}

function main(args) {
    const mode = args[0];
    const options = parseOptions(args.slice(1));
    if (mode === '--current' || mode === undefined) {
        const store = readGoals();
        const visible = store.goals.filter((goal) => goal.status !== 'closed');
        if (visible.length === 0) {
            console.log('No open or queued goal.');
            return;
        }
        for (const goal of visible) console.log(formatGoal(goal));
        return;
    }
    if (mode === 'queue-goal' || mode === 'open-goal') {
        required(options, ['id', 'boundary']);
        const store = readGoals();
        let goal = store.goals.find((entry) => entry.id === options.id);
        if (!goal) {
            goal = { id: options.id, status: 'queued', boundary: options.boundary,
                upstreamOwners: options.owners
                    ? options.owners.split(',').map((owner) => owner.trim())
                    : [],
                forecast: options['forecast-steps'] ? {
                    steps: Number(options['forecast-steps']),
                    basis: options['forecast-basis'] ?? '',
                    sessions: options.sessions
                        ? options.sessions.split(',').map((s) => s.trim())
                        : [],
                } : null,
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
            goal.status = 'open';
            goal.openedAt = repositoryHead();
            goal.openStanding = developmentStanding();
        }
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
    throw new Error('modes: --current, queue-goal, open-goal, queue-slice, '
        + 'close-slice, close-goal');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`goal-log: ${error.message}`);
        process.exitCode = 1;
    }
}
