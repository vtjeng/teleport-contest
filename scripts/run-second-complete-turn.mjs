#!/usr/bin/env node

// Run the checked-in second-complete-turn matrix through fresh C recordings.
// Recipe segments contain replay inputs only; each run records new reference
// output in an isolated temporary workspace.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    validateCleanRecipe,
} from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);

export const SECOND_COMPLETE_TURN_FIXTURE = join(
    SCRIPT_DIR,
    'fixtures',
    'second-complete-turn.session.json',
);

export function loadSecondCompleteTurnFixture() {
    const fixture = JSON.parse(
        readFileSync(SECOND_COMPLETE_TURN_FIXTURE, 'utf8'),
    );
    if (!fixture || fixture.version !== 2
        || !Array.isArray(fixture.expectations)) {
        throw new Error(
            `${SECOND_COMPLETE_TURN_FIXTURE} must be a v2 second-turn fixture`,
        );
    }
    const recipe = validateCleanRecipe(
        fixture.recipe,
        `${SECOND_COMPLETE_TURN_FIXTURE} recipe`,
    );
    if (fixture.expectations.length !== recipe.segments.length) {
        throw new Error(
            `${SECOND_COMPLETE_TURN_FIXTURE} must have one expectation `
            + 'per recipe segment',
        );
    }
    const names = new Set();
    for (let index = 0; index < fixture.expectations.length; ++index) {
        const expectation = fixture.expectations[index];
        const name = expectation?.name;
        if (typeof name !== 'string' || !name.length || names.has(name)) {
            throw new Error(
                `${SECOND_COMPLETE_TURN_FIXTURE} expectation ${index + 1} `
                + 'must have a unique name',
            );
        }
        if (!recipe.segments[index].nethackrc.includes(`name:${name},`)) {
            throw new Error(
                `${SECOND_COMPLETE_TURN_FIXTURE} expectation ${index + 1} `
                + 'does not match its recipe segment',
            );
        }
        const oracle = expectation?.oracle;
        if (!oracle
            || !Array.isArray(oracle.heroTrack?.newestFirst)
            || !Object.hasOwn(oracle.scheduler ?? {}, 'somebodyCanMove')
            || !Object.hasOwn(oracle.scheduler ?? {}, 'visionFullRecalc')
            || !Object.hasOwn(oracle.scheduler ?? {}, 'purgeMonsters')) {
            throw new Error(
                `${SECOND_COMPLETE_TURN_FIXTURE} expectation ${index + 1} `
                + 'must include hero-track and scheduler oracles',
            );
        }
        names.add(name);
    }
    return { ...fixture, recipe };
}

export function loadSecondCompleteTurnRecipe() {
    return loadSecondCompleteTurnFixture().recipe;
}

export async function runSecondCompleteTurnMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'second complete turn',
            recipe: loadSecondCompleteTurnRecipe(),
        }],
        summaryLabel: 'SECOND COMPLETE TURN',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runSecondCompleteTurnMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `second complete turn: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
