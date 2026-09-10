// Goal boundaries need a measurement of the current game even when unfinished
// work cannot append a SCORE.tsv event. The development scorer also writes
// this cache during checkpoint, independently of the other checks' verdicts.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readRows, standing } from './score-log.mjs';
import { PROJECT_ROOT, listSessionFiles } from './scoring-workspace.mjs';

// These are the inputs copied into the scoring workspace and the code that
// builds it. Goal metadata and checkpoint's other checks do not affect replay.
const SCORE_PATHS = [
    'js/', 'frozen/', 'package.json', 'scripts/score-development.mjs',
    'scripts/scoring-workspace.mjs', 'scripts/local-tmpdir.mjs',
    'scripts/development-standing.mjs', 'scripts/score-log.mjs',
];
const CACHE_NAME = 'development-standing.json';
const CACHE_VERSION = 1; // First cache with clean-input and successful-run evidence.
export const EXPECTED_DEVELOPMENT_COUNT = 33; // The fixed, reviewed development set.

function git(root, args) {
    return execFileSync('git', ['--literal-pathspecs', ...args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function scorePaths(files) {
    // Exact direct filenames keep every Git operation out of the sealed set.
    return [...SCORE_PATHS, ...files.map(file => `sessions/${file}`)];
}

export function developmentInputs(root = PROJECT_ROOT) {
    const files = listSessionFiles(join(root, 'sessions'));
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT)
        throw new Error('development count changed');
    const sha = git(root, ['rev-parse', 'HEAD']);
    const clean = git(root, ['status', '--porcelain=v1', '-z',
        '--untracked-files=all', '--ignored=matching', '--', ...scorePaths(files)]) === '';
    return { sha, files, clean };
}

function sameFiles(left, right) {
    return Array.isArray(left) && left.length === right.length
        && left.every((file, index) => file === right[index]);
}

export function sameDevelopmentInputs(before, after) {
    return before.clean && after.clean && before.sha === after.sha
        && sameFiles(before.files, after.files);
}

function validStanding(value) {
    return /^[a-f0-9]{7,40}$/u.test(value?.sha ?? '')
        && Number.isSafeInteger(value.screens) && value.screens >= 0
        && Number.isSafeInteger(value.rng) && value.rng >= 0;
}

/** Called only after the runner succeeds and its complete bundle is parsed. */
export function cacheDevelopmentStanding(before, bundle, root = PROJECT_ROOT) {
    const names = bundle.results.map(result => result.session).sort();
    if (!sameFiles(names, before.files)) throw new Error('development results changed');
    const score = { sha: before.sha, screens: 0, rng: 0 };
    for (const { metrics } of bundle.results) {
        const screens = metrics?.screens?.matched;
        const rng = metrics?.rngCalls?.matched;
        if (!Number.isSafeInteger(screens) || screens < 0
            || !Number.isSafeInteger(rng) || rng < 0)
            throw new Error('development results are incomplete');
        score.screens += screens;
        score.rng += rng;
    }
    if (!validStanding(score)) throw new Error('development totals are invalid');
    if (!sameDevelopmentInputs(before, developmentInputs(root))) return;
    mkdirSync(join(root, '.cache'), { recursive: true });
    writeFileSync(join(root, '.cache', CACHE_NAME), `${JSON.stringify({
        version: CACHE_VERSION, files: before.files, score,
    }, null, 2)}\n`);
}

function equivalentStanding(score, inputs, root) {
    if (!validStanding(score)) return null;
    try {
        const sha = git(root, ['rev-parse', '--verify', `${score.sha}^{commit}`]);
        git(root, ['diff', '--quiet', sha, inputs.sha, '--', ...scorePaths(inputs.files)]);
        return { ...score, sha };
    } catch {
        // A missing commit or changed scoring input requires a fresh run.
        return null;
    }
}

function cachedStanding(inputs, root) {
    try {
        const cache = JSON.parse(readFileSync(join(root, '.cache', CACHE_NAME), 'utf8'));
        if (cache.version !== CACHE_VERSION || !sameFiles(cache.files, inputs.files)) return null;
        return equivalentStanding(cache.score, inputs, root);
    } catch {
        return null;
    }
}

/** Acquire an endpoint without inventing a span or goal closure event. */
export function currentDevelopmentStanding(root = PROJECT_ROOT) {
    const inputs = developmentInputs(root);
    if (!inputs.clean)
        throw new Error('commit scoring inputs before opening, resuming, or parking a goal');
    let score = cachedStanding(inputs, root);
    if (!score) {
        const { development } = standing(readRows(join(root, 'SCORE.tsv')));
        // Event rows already name their measured commit. Reuse one only after
        // proving that every scoring input is identical to the current tree.
        score = equivalentStanding(development && {
            sha: development.sha,
            screens: development.screens_matched === '' ? NaN : Number(development.screens_matched),
            rng: development.rng_matched === '' ? NaN : Number(development.rng_matched),
        }, inputs, root);
    }
    if (!score) {
        console.error(`Measuring development score at ${inputs.sha.slice(0, 7)} for the goal boundary.`);
        execFileSync(process.execPath, [join(root, 'scripts/score-development.mjs')], {
            cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        score = cachedStanding(inputs, root);
    }
    if (!score || !sameDevelopmentInputs(inputs, developmentInputs(root)))
        throw new Error('development measurement is unavailable or its inputs changed; retry the goal boundary');
    return score;
}
