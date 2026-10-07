#!/usr/bin/env node
// Parallel-checkpoint trial runner. Outputs are not installed in the shared
// acceptance archive: the local checkpoint remains authoritative until rollout.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { checkpointGroups, checkpointSummary, requireCleanCheckpointTree,
    runCheckpointChecks } from './checkpoint-checks.mjs';
import { PROJECT_ROOT } from './scoring-workspace.mjs';
import { boundedMain } from './run-bounded.mjs';
import { digest } from './checkpoint-reuse.mjs';

const VERSION = 1;
export const TEST_SHARDS = 4; // Separate the three known slow files and leave one general shard.
export const RECORDING_SHARDS = 4; // Trial: divide the six-minute replay stage without duplicating setup per recording.
const ARTIFACTS = { score: ['development-standing.json', 'session-results.json'], scan: ['scan-cache.json'] };
const USAGE = `Usage:
  node scripts/checkpoint-stage.mjs --list
  node scripts/checkpoint-stage.mjs run <group> <output-directory>
  node scripts/checkpoint-stage.mjs combine <output-directory>

Run groups in separate clean checkouts of the same commit. Use an ignored
output directory (for example .cache/checkpoint-stages). Download every group
into that directory before combining. Results retain GitHub run/attempt identity.
This trial command does not install acceptance evidence or replace checkpoint.`;

function check(condition, message) {
    if (!condition) throw new Error(message);
}

export function trialGroups(registry = checkpointGroups()) {
    for (const group of ['tests', 'recordings'])
        check(registry[group]?.length === 1, `sharding requires exactly one ${group} command`);
    const { tests: [tests], recordings: [recordings], ...groups } = registry;
    return { ...Object.fromEntries(Array.from({ length: TEST_SHARDS }, (_, index) => {
        const shard = `${index + 1}/${TEST_SHARDS}`;
        return [`tests-${index + 1}`, [{ ...tests, label: `test shard ${shard}`,
            command: process.execPath, args: ['scripts/run-test-suite.mjs', 'default', '--shard', shard] }]];
    })), ...Object.fromEntries(Array.from({ length: RECORDING_SHARDS }, (_, index) => {
        const shard = `${index + 1}/${RECORDING_SHARDS}`;
        return [`recordings-${index + 1}`, [{ ...recordings, label: `recordings batch ${shard}`,
            args: [...recordings.args, '--shard', shard] }]];
    })), ...groups };
}

export function runIdentity(env = process.env) {
    if (env.GITHUB_ACTIONS !== 'true') return { provider: 'local' };
    const { GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: id, GITHUB_RUN_ATTEMPT: attempt } = env;
    check(repository && /^\d+$/u.test(id ?? '') && /^\d+$/u.test(attempt ?? ''),
        'GitHub checkpoint needs repository, run ID, and attempt');
    return { provider: 'github', repository, id, attempt };
}

export function combineStages(stages, commit, run) {
    const groups = trialGroups();
    check(stages.length === Object.keys(groups).length, 'missing or duplicate checkpoint stage');
    const byGroup = new Map();
    for (const stage of stages) {
        // A native failed-job retry keeps successful artifacts from earlier
        // attempts of this exact workflow run. Preserve their actual attempt.
        const sameRun = isDeepStrictEqual(stage.run, run)
            || (run.provider === 'github' && stage.run?.provider === 'github'
                && stage.run.repository === run.repository && stage.run.id === run.id
                && /^[1-9]\d*$/u.test(stage.run.attempt ?? '')
                && Number(stage.run.attempt) <= Number(run.attempt));
        check(stage.version === VERSION && stage.commit === commit && sameRun,
            'checkpoint stage has a different schema, commit, run, or attempt');
        check(Object.hasOwn(groups, stage.group) && !byGroup.has(stage.group), 'unknown or duplicate checkpoint stage');
        const expected = groups[stage.group];
        check(Array.isArray(stage.results) && stage.results.length === expected.length, 'incomplete checkpoint stage');
        for (const [index, result] of stage.results.entries()) {
            check(result.label === expected[index].label
                && result.informational === Boolean(expected[index].informational)
                && typeof result.passed === 'boolean' && typeof result.skipped === 'boolean'
                && (!result.skipped || expected[index].informational
                    || result.label === 'end-of-input over-read'),
            'checkpoint stage checks or verdicts differ from the registry');
        }
        byGroup.set(stage.group, stage);
    }
    const tests = Array.from({ length: TEST_SHARDS }, (_, index) =>
        byGroup.get(`tests-${index + 1}`).results[0]);
    return [{ label: 'full test suite', passed: tests.every(result => result.passed),
        informational: false, skipped: false,
        detail: tests.filter(result => !result.passed).map(result => result.label).join(', ') },
    ...Object.keys(checkpointGroups()).filter(group => group !== 'tests')
        .flatMap(group => {
            if (group !== 'recordings') return byGroup.get(group).results;
            const batches = Array.from({ length: RECORDING_SHARDS }, (_, index) =>
                byGroup.get(`recordings-${index + 1}`).results[0]);
            return [{ label: 'recordings corpus', passed: batches.every(result => result.passed),
                informational: false, skipped: false,
                detail: batches.map(result => result.detail).join('; ') }];
        })];
}

function head() {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();
}

function writeJson(path, value) {
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

export function runStage(group, output) {
    const commands = trialGroups()[group];
    check(Array.isArray(commands), `unknown checkpoint group: ${group}`);
    requireCleanCheckpointTree();
    const commit = head();
    const directory = join(output, group);
    check(!existsSync(directory), `checkpoint stage already exists: ${directory}`);
    mkdirSync(directory, { recursive: true });
    const started = performance.now();
    const { results, allPassed } = runCheckpointChecks(commands);
    requireCleanCheckpointTree();
    check(head() === commit, 'HEAD changed during checkpoint stage');
    const artifacts = {};
    for (const name of ARTIFACTS[group] ?? []) {
        const source = join(PROJECT_ROOT, '.cache', name);
        if (existsSync(source)) {
            copyFileSync(source, join(directory, name));
            artifacts[name] = digest(readFileSync(source));
        }
    }
    writeJson(join(directory, 'stage.json'), { version: VERSION, group, commit,
        run: runIdentity(), durationMs: performance.now() - started,
        runtime: { node: process.version, platform: process.platform, arch: process.arch }, artifacts, results });
    return allPassed ? 0 : 1;
}

export function combineDirectory(output) {
    const commit = head();
    const run = runIdentity();
    const stages = Object.keys(trialGroups()).map(group =>
        JSON.parse(readFileSync(join(output, group, 'stage.json'), 'utf8')));
    const results = combineStages(stages, commit, run);
    const summary = { ...checkpointSummary(results, commit), hostedRun: run,
        stages: stages.map(({ group, durationMs, runtime, run: executedRun }) =>
            ({ group, durationMs, runtime, run: executedRun })) };
    // A successful trial must contain the same artifacts closure consumes.
    // Do not manufacture a passing summary from incomplete remote output.
    if (summary.allPassed) for (const [group, names] of Object.entries(ARTIFACTS)) {
        for (const name of names) {
            const contents = readFileSync(join(output, group, name));
            check(stages.find(stage => stage.group === group).artifacts?.[name] === digest(contents),
                `checkpoint stage artifact missing or changed: ${name}`);
            copyFileSync(join(output, group, name), join(output, name));
        }
    }
    writeJson(join(output, 'summary.json'), summary);
    console.log(`${summary.allPassed ? 'PASS' : 'FAIL'} trial checkpoint: ${join(output, 'summary.json')}`);
    return summary.allPassed ? 0 : 1;
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') { console.log(USAGE); return 0; }
    if (args.length === 1 && args[0] === '--list') {
        console.log(JSON.stringify(Object.keys(trialGroups()))); return 0;
    }
    process.chdir(PROJECT_ROOT);
    if (args.length === 3 && args[0] === 'run')
        return boundedMain('full', () => runStage(args[1], resolve(args[2])));
    if (args.length === 2 && args[0] === 'combine') return combineDirectory(resolve(args[1]));
    throw new Error(USAGE);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try { process.exitCode = await main(process.argv.slice(2)); }
    catch (error) { console.error(`checkpoint-stage: ${error.message}`); process.exitCode = 1; }
}
