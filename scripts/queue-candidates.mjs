#!/usr/bin/env node

// Queues goal candidates from a JSON file into GOALS.json.
//
// The goal-selector writes .cache/selector-candidates.json with every
// candidate it capped. This script reads that file and queues each one,
// replacing the orchestrator's manual composition of queue-goal CLI
// arguments.
//
// Usage: node scripts/queue-candidates.mjs <path>
//
// The JSON file holds an array of candidate objects:
//
//   [{
//     "id":            "kebab-case-boundary-id",
//     "boundary":      "The boundary condition ...",
//     "owners":        ["do_name.c"],
//     "forecastSteps": 16,
//     "forecastBasis": "Capped look-ahead at ...",
//     "sessions":      ["seed0102-ranger-name-cancel"],
//     "witnesses":     [{ "session": "seed0102-...", "evidence": "..." }],
//     "detail":        "The port needs ..."
//   }]
//
// Each candidate that already exists in GOALS.json (by id) is skipped.
// The script prints one line per candidate: queued or skipped.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
    buildForecast,
    DEFAULT_PATH,
    readGoals,
    validateGoals,
} from './goal-log.mjs';

function writeGoals(store, path = DEFAULT_PATH) {
    validateGoals(store);
    writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

export function queueCandidates(candidates, store) {
    const results = [];
    for (const candidate of candidates) {
        if (!candidate.id || typeof candidate.id !== 'string') {
            throw new Error('each candidate needs a string id');
        }
        if (!candidate.boundary || typeof candidate.boundary !== 'string') {
            throw new Error(`candidate ${candidate.id} needs a boundary`);
        }
        const existing = store.goals.find((g) => g.id === candidate.id);
        if (existing) {
            results.push({ id: candidate.id, action: 'skipped' });
            continue;
        }

        const options = {
            'forecast-steps': String(candidate.forecastSteps ?? 0),
            'forecast-basis': candidate.forecastBasis ?? '',
            sessions: (candidate.sessions ?? []).join(','),
            'forecast-witness': (candidate.witnesses ?? []).map(
                (w) => `${w.session}=${w.evidence}`,
            ),
        };
        const forecast = buildForecast(options);

        const goal = {
            id: candidate.id,
            status: 'queued',
            boundary: candidate.boundary,
            upstreamOwners: candidate.owners ?? [],
            forecast,
            detail: candidate.detail ?? '',
            slices: [],
            openedAt: null,
            openStanding: null,
            closedAt: null,
            delivered: null,
        };
        store.goals.push(goal);
        results.push({ id: candidate.id, action: 'queued' });
    }
    return results;
}

function main(args) {
    const path = args[0];
    if (!path) {
        throw new Error(
            'usage: queue-candidates.mjs <path-to-candidates.json>',
        );
    }
    const candidates = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(candidates)) {
        throw new Error('candidates file must contain a JSON array');
    }
    const store = readGoals();
    const results = queueCandidates(candidates, store);
    writeGoals(store);
    for (const { id, action } of results) {
        console.log(`${action}: ${id}`);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`queue-candidates: ${error.message}`);
        process.exitCode = 1;
    }
}
