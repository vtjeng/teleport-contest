#!/usr/bin/env node
// Carry unchanged CI result files through the combine job's GitHub Check output.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';

export const FORMAT = 'teleport-ci-results/v1';
export const CHUNK_SIZE = 48000; // Below GitHub's 64 KB annotation-message limit.
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_CHUNKS = 2048;
const CONFIG = {
    checkpoint: {workflow: '.github/workflows/checkpoint-trial.yml', job: 'Combined checkpoint result'},
    admission: {workflow: '.github/workflows/admission.yml', job: 'Save complete admission evidence'},
};
const ensure = (value, message) => {if (!value) throw new Error(`hosted evidence: ${message}`);};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = path => typeof path === 'string' && /^[A-Za-z0-9_.\/-]+$/u.test(path)
    && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..');

function identity(run, repository, kind) {
    const config = CONFIG[kind];
    ensure(config && run.repository?.full_name === repository && run.head_repository?.full_name === repository
        && /^[a-f0-9]{40}$/u.test(run.head_sha ?? '')
        && Number.isSafeInteger(run.id) && run.id > 0
        && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0
        && Number.isSafeInteger(run.check_suite_id) && run.check_suite_id > 0
        && run.path?.split('@')[0] === config.workflow, 'run identity differs');
    return {format: FORMAT, kind, repository, runId: String(run.id), attempt: String(run.run_attempt),
        commit: run.head_sha, workflow: config.workflow};
}

export function encodeEvidence(files, run, repository, kind) {
    const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
    ensure(entries.length > 0, 'empty result bundle');
    const payload = {identity: identity(run, repository, kind), files: entries.map(([path, input]) => {
        ensure(safePath(path), 'unsafe result path');
        const bytes = Buffer.from(input);
        return {path, bytes: bytes.length, sha256: sha256(bytes), content: bytes.toString('base64')};
    })};
    const plain = Buffer.from(JSON.stringify(payload));
    ensure(plain.length <= MAX_BYTES, 'result bundle exceeds size limit');
    const packed = gzipSync(plain), encoded = packed.toString('base64');
    const chunks = encoded.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gu'));
    ensure(chunks.length <= MAX_CHUNKS, 'too many result chunks');
    const manifest = {...payload.identity, encoding: 'gzip+base64', sha256: sha256(packed),
        bytes: packed.length, plainBytes: plain.length, chunks: chunks.length, files: entries.length};
    const annotations = chunks.map((message, index) => ({path: CONFIG[kind].workflow,
        start_line: 1, end_line: 1, annotation_level: 'notice',
        title: `${FORMAT}:${index + 1}/${chunks.length}`, message}));
    return {manifest, annotations};
}

export function decodeEvidence(manifest, annotations, run, repository, kind) {
    const expected = identity(run, repository, kind);
    for (const [key, value] of Object.entries(expected))
        ensure(manifest?.[key] === value, `result ${key} differs`);
    ensure(manifest.encoding === 'gzip+base64' && /^[a-f0-9]{64}$/u.test(manifest.sha256 ?? '')
        && Number.isSafeInteger(manifest.bytes) && manifest.bytes > 0 && manifest.bytes <= MAX_BYTES
        && Number.isSafeInteger(manifest.plainBytes) && manifest.plainBytes > 0 && manifest.plainBytes <= MAX_BYTES
        && Number.isSafeInteger(manifest.chunks) && manifest.chunks > 0 && manifest.chunks <= MAX_CHUNKS
        && Number.isSafeInteger(manifest.files) && manifest.files > 0, 'invalid result manifest');
    const parts = new Map();
    for (const annotation of annotations) {
        if (!annotation.title?.startsWith(`${FORMAT}:`)) continue;
        const match = /^teleport-ci-results\/v1:([1-9]\d*)\/([1-9]\d*)$/u.exec(annotation.title);
        ensure(match && Number(match[2]) === manifest.chunks && Number(match[1]) <= manifest.chunks
            && !parts.has(Number(match[1])) && annotation.path === expected.workflow
            && annotation.start_line === 1 && annotation.end_line === 1 && annotation.annotation_level === 'notice'
            && typeof annotation.message === 'string' && annotation.message.length > 0
            && annotation.message.length <= CHUNK_SIZE && /^[A-Za-z0-9+/]*={0,2}$/u.test(annotation.message),
        'missing, duplicate, or malformed result chunk');
        parts.set(Number(match[1]), annotation.message);
    }
    ensure(parts.size === manifest.chunks, 'incomplete result chunks');
    const encoded = Array.from({length: manifest.chunks}, (_, i) => parts.get(i + 1)).join('');
    const packed = Buffer.from(encoded, 'base64');
    ensure(packed.toString('base64') === encoded && packed.length === manifest.bytes
        && sha256(packed) === manifest.sha256, 'result payload hash or length differs');
    const plain = gunzipSync(packed, {maxOutputLength: MAX_BYTES});
    ensure(plain.length === manifest.plainBytes, 'result decoded length differs');
    const payload = JSON.parse(plain);
    ensure(isDeepStrictEqual(payload.identity, expected) && Array.isArray(payload.files)
        && payload.files.length === manifest.files, 'result payload identity or membership differs');
    const files = new Map();
    for (const file of payload.files) {
        ensure(safePath(file.path) && !files.has(file.path) && typeof file.content === 'string'
            && Number.isSafeInteger(file.bytes) && file.bytes >= 0, 'invalid or duplicate result file');
        const bytes = Buffer.from(file.content, 'base64');
        ensure(bytes.toString('base64') === file.content && bytes.length === file.bytes
            && sha256(bytes) === file.sha256, 'result file hash or length differs');
        files.set(file.path, bytes);
    }
    return files;
}

function pages(github, path, field) {
    const values = [];
    for (let page = 1; ; page++) {
        ensure(page <= 1000, 'API pagination exceeds limit');
        const response = JSON.parse(github(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`));
        const rows = field ? response[field] : response;
        ensure(Array.isArray(rows), 'invalid paginated API response');
        values.push(...rows);
        if (rows.length < 100) return values;
    }
}

export function evidenceJob(github, run, repository, kind, publishing = false) {
    identity(run, repository, kind);
    const jobs = pages(github, `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs')
        .filter(job => job.name === CONFIG[kind].job);
    ensure(jobs.length === 1, 'missing or duplicate combine job');
    const job = jobs[0];
    ensure(job.head_sha === run.head_sha && job.run_id === run.id && job.run_attempt === run.run_attempt
        && (publishing ? job.status === 'in_progress' : job.status === 'completed' && job.conclusion === 'success'),
    'combine job identity or verdict differs');
    const prefix = `https://api.github.com/repos/${repository}/check-runs/`;
    ensure(job.check_run_url?.startsWith(prefix) && /^[1-9]\d*$/u.test(job.check_run_url.slice(prefix.length)),
        'combine job check URL differs');
    const checkId = job.check_run_url.slice(prefix.length);
    const check = JSON.parse(github(`repos/${repository}/check-runs/${checkId}`));
    ensure(String(check.id) === checkId && check.name === CONFIG[kind].job && check.head_sha === run.head_sha
        && check.check_suite?.id === run.check_suite_id && check.app?.id === 15368 && check.app?.slug === 'github-actions'
        && (publishing || check.status === 'completed' && check.conclusion === 'success'),
    'combine check identity, app, suite, or verdict differs');
    return {check, checkId};
}

export function readHostedEvidence({github, run, repository, kind}) {
    const {check, checkId} = evidenceJob(github, run, repository, kind);
    let manifest;
    try {manifest = JSON.parse(check.output?.summary);} catch {throw new Error('hosted evidence: combine job has no API result manifest');}
    const annotations = pages(github, `repos/${repository}/check-runs/${checkId}/annotations`);
    const files = decodeEvidence(manifest, annotations, run, repository, kind);
    return {files, proof: {provider: 'github-checks', checkRunId: checkId,
        manifest, fileHashes: Object.fromEntries([...files].map(([path, bytes]) => [path, sha256(bytes)]))}};
}

export function materializeEvidence(output, files) {
    // Validation of the entire envelope precedes any write.
    for (const [path, bytes] of files) {
        ensure(safePath(path), 'unsafe result path');
        const destination = join(output, path);
        mkdirSync(dirname(destination), {recursive: true});
        writeFileSync(destination, bytes, {flag: 'wx'});
    }
}

export function collectEvidence(root, output, kind) {
    const read = path => {ensure(lstatSync(path).isFile(), 'result must be a regular file'); return readFileSync(path);};
    const files = {};
    if (kind === 'checkpoint') {
        for (const name of ['summary.json', 'development-standing.json', 'session-results.json', 'scan-cache.json'])
            files[name] = read(join(output, name));
        for (const name of readdirSync(join(output, 'synthetic')).sort()) {
            ensure(/^ci-v[1-9]\d*\.json$/u.test(name), 'unexpected synthetic result file');
            files[`synthetic/${name}`] = read(join(output, 'synthetic', name));
        }
        ensure(Object.keys(files).length > 4, 'missing synthetic evidence');
    } else {
        ensure(kind === 'admission', 'unknown evidence kind');
        files['.cache/admission-ci/summary.json'] = read(join(output, 'summary.json'));
        const summary = JSON.parse(files['.cache/admission-ci/summary.json']);
        ensure(Array.isArray(summary.evaluations) && summary.evaluations.length > 0, 'missing admission evaluations');
        for (const path of summary.evaluations) {
            ensure(/^challenges\/evaluations\/admission-[a-f0-9]{40}-v[1-9]\d*\.json$/u.test(path),
                'unexpected admission evaluation path');
            files[path] = read(join(root, path));
        }
    }
    return files;
}

export function publishHostedEvidence(kind, output, {root = process.cwd(), env = process.env, request} = {}) {
    ensure(env.GITHUB_ACTIONS === 'true' && env.GITHUB_JOB === 'combine', 'publish only from hosted combine job');
    const repository = env.GITHUB_REPOSITORY;
    ensure(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? '') && /^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? ''),
        'missing hosted execution identity');
    request ??= (path, body) => execFileSync('gh', ['api', path,
        ...(body ? ['--method', 'PATCH', '--input', '-'] : [])],
    {cwd: root, encoding: 'utf8', input: body ? JSON.stringify(body) : undefined, maxBuffer: MAX_BYTES});
    const run = JSON.parse(request(`repos/${repository}/actions/runs/${env.GITHUB_RUN_ID}`));
    ensure(String(run.run_attempt) === env.GITHUB_RUN_ATTEMPT && run.head_sha === env.GITHUB_SHA,
        'hosted run changed before publication');
    const {check, checkId} = evidenceJob(request, run, repository, kind, true);
    ensure(!check.output?.summary && !pages(request, `repos/${repository}/check-runs/${checkId}/annotations`)
        .some(annotation => annotation.title?.startsWith(`${FORMAT}:`)),
        'combine check already has output; rerun the job as a new workflow attempt');
    const {manifest, annotations} = encodeEvidence(collectEvidence(root, output, kind), run, repository, kind);
    const path = `repos/${repository}/check-runs/${checkId}`;
    for (let start = 0; start < annotations.length; start += 50)
        request(path, {output: {title: 'Teleport CI result files', summary: 'Writing result chunks.',
            annotations: annotations.slice(start, start + 50)}});
    request(path, {output: {title: 'Teleport CI result files', summary: JSON.stringify(manifest)}});
    console.log(`Published ${manifest.files} ${kind} files in ${manifest.chunks} API result chunks (${manifest.bytes} compressed bytes).`);
    return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const [kind, output, ...extra] = process.argv.slice(2);
        ensure(CONFIG[kind] && output && !extra.length, 'Usage: hosted-evidence.mjs <checkpoint|admission> <output-directory>');
        publishHostedEvidence(kind, resolve(output));
    } catch (error) {console.error(error.message); process.exitCode = 1;}
}
