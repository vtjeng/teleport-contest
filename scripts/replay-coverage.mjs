#!/usr/bin/env node

// Record one pinned session's execution without changing game code or scorer
// thresholds. Coverage identifies paths to investigate, not correct behavior.

import { spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
    readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { buildLineIndex, JUDGE_SUPPLIED, lineAtOffset } from './coverage-report.mjs';
import { localTmpdir } from './local-tmpdir.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESULT_MARKER = '__RESULT_ONE__';
// The existing coverage collector allows this long for instrumented replays.
const REPLAY_TIMEOUT_MS = 180_000;
const CAPTURE_BYTES = 128 * 1024 * 1024;

export const USAGE = `Usage:
  node scripts/replay-coverage.mjs --sha <full-commit-sha> \\
    --session sessions/<name>.session.json --target js/<file>.js:<function>

Repeat --target for additional functions. --session also accepts a file under
recordings/. The commit must contain every selected file. --repo <absolute-path>
selects another repository, including a disposable test fixture; the default is
this script's repository. --help prints this text.

The command archives only js/, frozen/, package.json, and the selected recording,
then overlays the three scorer-supplied modules. Plain and V8-instrumented frozen
workers replay the same file. Their complete results must agree except time.ms,
and exactly one coverage dump must contain the snapshot's js/jsmain.js.

Each run creates a new temporary directory and prints its summary.json path.
It retains the source snapshot, Git blob identifiers, worker output/results, and
raw V8 coverage. Function counts and nested block ranges include zeros; offsets
are UTF-16, end offsets are exclusive, and line numbers start at one. An unloaded
module, a missing function, and a function called zero times are distinct states.
Duplicate named functions are ambiguous and cause an error.

Coverage records execution only. It has no percentage, threshold, or completion
verdict. The scorer's pass/fail result is reported separately; a mismatching
recording can still produce useful coverage. Instrumentation or collection errors
exit with status 2 and retain available artifacts. No session directory is scanned,
and holdout references and archived symlinks are rejected before session reads.
`;

function safeRelative(path) {
    return typeof path === 'string' && !/[\\\0]/u.test(path)
        && path.split('/').every((part) => /^[A-Za-z0-9_.-]+$/u.test(part)
            && part !== '.' && part !== '..' && part.toLowerCase() !== 'holdout');
}

/** Validate every supplied path before filesystem or Git reads. */
export function parseReplayCoverageArgs(args) {
    if (args.length === 1 && args[0] === '--help') return { help: true };
    const options = { repo: PROJECT_ROOT, targets: [] };
    const seen = new Set();
    for (let index = 0; index < args.length; index += 2) {
        const option = args[index];
        const value = args[index + 1];
        if (!['--repo', '--sha', '--session', '--target'].includes(option)
            || !value || value.startsWith('--')) throw new Error(`invalid option or missing value: ${option}`);
        if (option === '--target') options.targets.push(value);
        else {
            if (seen.has(option)) throw new Error(`duplicate option: ${option}`);
            seen.add(option);
            options[option.slice(2)] = value;
        }
    }
    if (!/^[a-f0-9]{40}$/iu.test(options.sha ?? '')) throw new Error('--sha must be a full commit SHA');
    if (!safeRelative(options.session)
        || !(/^sessions\/[^/]+\.session\.json$/u.test(options.session)
            || /^recordings\/.+\.session\.json$/u.test(options.session))) {
        throw new Error('--session must name one direct development session or one recording; holdout paths are prohibited');
    }
    if (!isAbsolute(options.repo) || /[\\\0]/u.test(options.repo)
        || options.repo.split('/').some((part) => part === '..' || part === '.'
            || part.toLowerCase() === 'holdout')) throw new Error('--repo must be a safe absolute repository path');
    if (!options.targets.length) throw new Error('at least one --target js/file.js:function is required');
    options.targets = [...new Set(options.targets)].map((target) => {
        const match = /^(js\/.+\.js):([A-Za-z_$][A-Za-z0-9_$]*)$/u.exec(target);
        if (!match || !safeRelative(match[1])) throw new Error(`invalid target: ${target}`);
        if (JUDGE_SUPPLIED.has(match[1].slice('js/'.length)))
            throw new Error('target the port, not a scorer-supplied module');
        return { target, path: match[1], functionName: match[2] };
    });
    return options;
}

function requireDirectory(path) {
    let current = '/';
    for (const part of path.split('/').filter(Boolean)) {
        if (part.toLowerCase() === 'holdout') throw new Error('holdout paths are prohibited');
        current = join(current, part);
        const info = lstatSync(current);
        if (info.isSymbolicLink() || !info.isDirectory())
            throw new Error(`expected a directory without symlinks: ${path}`);
    }
}

function command(program, args, options = {}) {
    const child = spawnSync(program, args, { maxBuffer: CAPTURE_BYTES, ...options });
    if (child.error || child.status !== 0 || child.signal !== null)
        throw new Error(`${program} failed: ${child.error?.message || child.stderr?.toString().trim() || child.status}`);
    return child.stdout;
}

function git(repo, args, options = {}) {
    return command('git', ['-C', repo, ...args], options);
}

// Inspect only the explicit archive scope. Git symlink blobs are rejected
// before archive extraction can turn them into indirect session references.
function archiveInventory(options) {
    requireDirectory(options.repo);
    const commit = git(options.repo, ['rev-parse', '--verify', `${options.sha}^{commit}`],
        { encoding: 'utf8' }).trim();
    if (commit.toLowerCase() !== options.sha.toLowerCase()) throw new Error('commit differs from the requested SHA');
    const paths = ['js/', 'frozen/', 'package.json', options.session];
    const listing = git(options.repo, ['ls-tree', '-rz', '--full-tree', commit, '--', ...paths],
        { encoding: 'utf8' });
    const entries = new Map();
    for (const entry of listing.split('\0').filter(Boolean)) {
        const match = /^(\d+) blob ([a-f0-9]+)\t(.+)$/u.exec(entry);
        if (!match || !['100644', '100755'].includes(match[1]))
            throw new Error('archive scope contains a symlink or nonregular entry');
        const path = match[3];
        if (!safeRelative(path) || !(path.startsWith('js/') || path.startsWith('frozen/')
            || path === 'package.json' || path === options.session))
            throw new Error('Git returned an entry outside the explicit archive scope');
        entries.set(path, match[2]);
    }
    const required = ['package.json', options.session, 'js/jsmain.js', 'frozen/ps_test_runner.mjs',
        ...[...JUDGE_SUPPLIED].map((file) => `frozen/${file}`), ...options.targets.map(({ path }) => path)];
    for (const path of required)
        if (!entries.has(path)) throw new Error(`pinned commit has no regular file: ${path}`);
    return { commit, archivePaths: paths, sessionBlob: entries.get(options.session),
        sourceBlobs: Object.fromEntries(options.targets.map(({ path }) => [path, entries.get(path)])),
        scorerOverlays: Object.fromEntries([...JUDGE_SUPPLIED].map((file) => [file, entries.get(`frozen/${file}`)])) };
}

function createSnapshot(options, inventory, outputDirectory) {
    const root = mkdtempSync(join(outputDirectory, 'teleport-score-'));
    const archive = git(options.repo, ['archive', '--format=tar', inventory.commit, '--', ...inventory.archivePaths]);
    command('tar', ['-xf', '-', '-C', root], { input: archive });
    for (const file of JUDGE_SUPPLIED) copyFileSync(join(root, 'frozen', file), join(root, 'js', file));
    return { ...inventory, root };
}

function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }

function replay(mode, options, snapshot, outputDirectory, coverageDirectory = '') {
    const prefix = join(outputDirectory, mode);
    const argv = [join(snapshot.root, 'frozen/ps_test_runner.mjs'),
        `--worker-session=${join(snapshot.root, options.session)}`];
    process.stderr.write(`Running ${mode} worker for ${options.session} at ${snapshot.commit.slice(0, 12)}\n`);
    const child = spawnSync(process.execPath, argv, {
        cwd: snapshot.root, encoding: 'utf8', maxBuffer: CAPTURE_BYTES,
        timeout: REPLAY_TIMEOUT_MS,
        // An explicit empty value disables Node's inherited coverage in the
        // plain worker. Omitting the variable does not prevent propagation.
        env: { ...process.env, NODE_V8_COVERAGE: coverageDirectory },
    });
    writeFileSync(`${prefix}.stdout.log`, child.stdout ?? '');
    writeFileSync(`${prefix}.stderr.log`, child.stderr ?? '');
    const processResult = { command: process.execPath, args: argv,
        coverageDirectory: coverageDirectory || null, status: child.status,
        signal: child.signal, error: child.error?.message ?? null,
        stdout: `${prefix}.stdout.log`, stderr: `${prefix}.stderr.log` };
    writeJson(`${prefix}.process.json`, processResult);
    if (child.error || child.status !== 0 || child.signal !== null)
        throw new Error(`${mode} worker did not exit normally; see ${prefix}.process.json`);
    const parts = (child.stdout ?? '').split(RESULT_MARKER);
    if (parts.length !== 2) throw new Error(`${mode} worker must emit exactly one ${RESULT_MARKER}`);
    const result = JSON.parse(parts[1].trim());
    if (result?.session !== basename(options.session) || typeof result.passed !== 'boolean'
        || !result.metrics || !Object.hasOwn(result, 'error')) throw new Error(`${mode} worker result is malformed`);
    writeJson(`${prefix}.result.json`, result);
    return { process: processResult, result };
}

/** Ignore wall-clock duration only; move counts and all scorer fields remain. */
export function assertInstrumentationParity(plain, instrumented) {
    const withoutTiming = (result) => {
        const copy = structuredClone(result);
        if (copy.time) delete copy.time.ms;
        return copy;
    };
    if (!isDeepStrictEqual(withoutTiming(plain), withoutTiming(instrumented)))
        throw new Error('instrumentation changed the scorer result; coverage evidence is invalid');
}

/** A worker that failed before dumping jsmain must not imply zero execution. */
export function selectWorkerCoverage(dumps, snapshotRoot) {
    const requiredUrl = pathToFileURL(join(snapshotRoot, 'js/jsmain.js')).href;
    for (const { data } of dumps)
        if (!Array.isArray(data?.result)) throw new Error('malformed V8 coverage dump');
    const workers = dumps.filter(({ data }) => data.result.some((entry) => entry.url === requiredUrl));
    if (workers.length !== 1)
        throw new Error(`expected exactly one coverage dump loading the snapshot js/jsmain.js; found ${workers.length}`);
    return workers[0];
}

/** Preserve nested ranges: a zero block overrides its executed outer range. */
export function functionCoverage(script, functionName, source) {
    if (!script) return { status: 'module-not-loaded', outerCount: null, ranges: [] };
    if (!Array.isArray(script.functions)) throw new Error('malformed script coverage');
    const matches = script.functions.filter((entry) => entry.functionName === functionName);
    if (!matches.length) return { status: 'function-not-found', outerCount: null, ranges: [] };
    if (matches.length > 1) throw new Error(`ambiguous coverage: multiple functions named ${functionName}`);
    const fn = matches[0];
    if (!fn.ranges?.length) throw new Error(`V8 reports no outer range for ${functionName}`);
    const index = buildLineIndex(source);
    const ranges = fn.ranges.map((range, at) => {
        if (!Number.isInteger(range.startOffset) || !Number.isInteger(range.endOffset)
            || range.startOffset < 0 || range.endOffset > source.length || range.startOffset >= range.endOffset
            || !Number.isInteger(range.count) || range.count < 0) throw new Error('invalid V8 source range');
        return { kind: at === 0 ? 'function' : 'block', ...range,
            startLine: lineAtOffset(index, range.startOffset),
            endLine: lineAtOffset(index, range.endOffset - 1),
            snippet: source.slice(range.startOffset, range.endOffset).trim().replace(/\s+/gu, ' ').slice(0, 180) };
    });
    return { status: ranges[0].count > 0 ? 'executed' : 'zero',
        outerCount: ranges[0].count, isBlockCoverage: fn.isBlockCoverage, ranges };
}

function runReplayCoverage(options) {
    const inventory = archiveInventory(options);
    const tempRoot = localTmpdir();
    requireDirectory(tempRoot);
    const outputDirectory = mkdtempSync(join(tempRoot, 'teleport-replay-coverage-'));
    const summaryPath = join(outputDirectory, 'summary.json');
    const summary = { status: 'incomplete', createdAt: new Date().toISOString(), node: process.version,
        repo: options.repo, session: options.session, outputDirectory,
        meaning: 'Execution only; coverage does not establish correctness or completion.',
        offsetConvention: 'UTF-16 offsets; endOffset exclusive; line numbers one-based.',
        timingComparison: 'Only result.time.ms is excluded; all other scorer fields are compared.' };
    try {
        summary.snapshot = createSnapshot(options, inventory, outputDirectory);
        const coverageDirectory = join(outputDirectory, 'coverage');
        mkdirSync(coverageDirectory);
        summary.plain = replay('plain', options, summary.snapshot, outputDirectory);
        summary.instrumented = replay('instrumented', options, summary.snapshot, outputDirectory, coverageDirectory);
        // Only this run's new coverage directory is enumerated. Session
        // directories are never enumerated, copied, or passed to the worker.
        const dumps = readdirSync(coverageDirectory).filter((name) => name.endsWith('.json')).map((name) => {
            const path = join(coverageDirectory, name);
            if (!lstatSync(path).isFile()) throw new Error('coverage output must be a regular file');
            return { path, data: JSON.parse(readFileSync(path, 'utf8')) };
        });
        summary.coverageDumps = dumps.map(({ path }) => path);
        const worker = selectWorkerCoverage(dumps, summary.snapshot.root);
        summary.workerCoverageDump = worker.path;
        summary.instrumentationParity = false;
        assertInstrumentationParity(summary.plain.result, summary.instrumented.result);
        summary.instrumentationParity = true;
        summary.targets = options.targets.map((target) => {
            const sourcePath = join(summary.snapshot.root, target.path);
            const url = pathToFileURL(sourcePath).href;
            const scripts = worker.data.result.filter((entry) => entry.url === url);
            if (scripts.length > 1) throw new Error(`duplicate script coverage entries for ${target.path}`);
            return { ...target, sourcePath, sourceBlob: inventory.sourceBlobs[target.path],
                ...functionCoverage(scripts[0], target.functionName, readFileSync(sourcePath, 'utf8')) };
        });
        summary.status = 'complete';
        writeJson(summaryPath, summary);
        console.log(JSON.stringify({ summary: summaryPath, commit: inventory.commit,
            session: options.session, instrumentationParity: true, replay: summary.plain.result,
            targets: summary.targets.map(({ target, status, outerCount }) => ({ target, status, outerCount })) }, null, 2));
    } catch (error) {
        summary.status = 'invalid';
        summary.error = error.message;
        writeJson(summaryPath, summary);
        throw new Error(`${error.message}; artifacts: ${summaryPath}`, { cause: error });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const options = parseReplayCoverageArgs(process.argv.slice(2));
        if (options.help) process.stdout.write(USAGE);
        else runReplayCoverage(options);
    } catch (error) {
        console.error(`replay-coverage: ${error.message}`);
        process.exitCode = 2;
    }
}
