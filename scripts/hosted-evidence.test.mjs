import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {CHUNK_SIZE, decodeEvidence, encodeEvidence, materializeEvidence,
    publishHostedEvidence, readHostedEvidence, sha256} from './hosted-evidence.mjs';
import {evidenceApi} from './test-fixtures/hosted-evidence.mjs';

const repository = 'fixture/project';
const run = {id: 123, run_attempt: 2, check_suite_id: 500, head_sha: 'a'.repeat(40),
    repository: {full_name: repository}, head_repository: {full_name: repository},
    path: '.github/workflows/checkpoint-trial.yml', status: 'completed', conclusion: 'success'};

test('chunked API envelope preserves every original byte and file digest across annotation pages', () => {
    // More than one annotation and distinct nested names exercise sequence and byte transport.
    const files = {'summary.json': Buffer.from('{"exact":"bytes\\n"}\n'),
        'synthetic/ci-v1.json': randomBytes(CHUNK_SIZE * 3)};
    const {manifest, annotations} = encodeEvidence(files, run, repository, 'checkpoint');
    assert.ok(annotations.length > 1);
    assert.ok(annotations.every(entry => entry.message.length <= CHUNK_SIZE));
    const result = decodeEvidence(manifest, [...annotations].reverse(), run, repository, 'checkpoint');
    for (const [path, bytes] of Object.entries(files)) assert.deepEqual(result.get(path), bytes);
    const fetched = readHostedEvidence({github: evidenceApi(run, files), run, repository, kind: 'checkpoint'});
    assert.equal(fetched.proof.fileHashes['synthetic/ci-v1.json'], sha256(files['synthetic/ci-v1.json']));
});

test('truncation, duplicate or altered chunks and changed identity fail closed', () => {
    const {manifest, annotations} = encodeEvidence({'summary.json': randomBytes(CHUNK_SIZE * 2)}, run, repository, 'checkpoint');
    const reject = (m, a) => assert.throws(() => decodeEvidence(m, a, run, repository, 'checkpoint'));
    reject(manifest, annotations.slice(1));
    reject(manifest, [...annotations, annotations[0]]);
    reject(manifest, annotations.map((entry, i) => i ? entry : {...entry, message: entry.message.slice(4)}));
    reject(manifest, annotations.map((entry, i) => i ? entry : {...entry, title: 'teleport-ci-results/v1:999/999'}));
    reject(manifest, annotations.map((entry, i) => i ? entry : {...entry, path: '.github/workflows/other.yml'}));
    reject({...manifest, sha256: 'b'.repeat(64)}, annotations);
    for (const key of ['runId', 'attempt', 'commit', 'repository', 'workflow', 'kind', 'format'])
        reject({...manifest, [key]: 'other'}, annotations);
    reject({...manifest, plainBytes: 64 * 1024 * 1024 + 1}, annotations);
});

test('decompression limits and payload file hashes, duplicate names and traversal are enforced', () => {
    const original = encodeEvidence({'summary.json': Buffer.from('{}')}, run, repository, 'checkpoint');
    const rewrite = mutate => {
        const payload = {identity: Object.fromEntries(['format', 'kind', 'repository', 'runId', 'attempt', 'commit', 'workflow']
            .map(key => [key, original.manifest[key]])),
        files: [{path: 'summary.json', bytes: 2, sha256: sha256('{}'), content: Buffer.from('{}').toString('base64')}]};
        mutate(payload);
        const plain = Buffer.from(JSON.stringify(payload)), packed = gzipSync(plain);
        return {manifest: {...original.manifest, bytes: packed.length, plainBytes: plain.length,
            sha256: sha256(packed), files: payload.files.length},
        annotations: [{...original.annotations[0], message: packed.toString('base64')}]};
    };
    for (const mutate of [p => {p.files[0].path = '../escape';},
        p => {p.files[0].sha256 = 'f'.repeat(64);}, p => {p.files.push({...p.files[0]});},
        p => {p.identity.commit = 'b'.repeat(40);}]) {
        const {manifest, annotations} = rewrite(mutate);
        assert.throws(() => decodeEvidence(manifest, annotations, run, repository, 'checkpoint'));
    }
    // A small compressed bomb must also be refused, even if its claimed plain length is small.
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1));
    const chunks = bomb.toString('base64').match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gu'));
    const annotations = chunks.map((message, i) => ({...original.annotations[0],
        title: `teleport-ci-results/v1:${i + 1}/${chunks.length}`, message}));
    assert.throws(() => decodeEvidence({...original.manifest, bytes: bomb.length,
        chunks: chunks.length, sha256: sha256(bomb)}, annotations, run, repository, 'checkpoint'), /larger than/);
});

test('reader binds exact attempt job, GitHub Actions app, check suite and completed verdict', () => {
    const good = evidenceApi(run, {'summary.json': '{}'});
    const reject = mutate => assert.throws(() => readHostedEvidence({run, repository, kind: 'checkpoint',
        github: path => JSON.stringify(mutate(path, JSON.parse(good(path))))}));
    for (const changed of [{head_sha: 'b'.repeat(40)}, {run_attempt: 1}, {run_id: 124},
        {status: 'in_progress'}, {conclusion: 'failure'}, {check_run_url: 'https://example.invalid/800'}])
        reject((path, value) => path.includes('/jobs') ? {...value, jobs: [{...value.jobs[0], ...changed}]} : value);
    reject((path, value) => path.includes('/jobs') ? {...value, jobs: [...value.jobs, ...value.jobs]} : value);
    for (const changed of [{head_sha: 'b'.repeat(40)}, {id: 801}, {name: 'Other job'},
        {status: 'in_progress'}, {conclusion: 'failure'}, {check_suite: {id: 501}},
        {app: {id: 15368, slug: 'other'}}, {app: {id: 1, slug: 'github-actions'}},
        {output: {summary: ''}}])
        reject((path, value) => path.endsWith('/check-runs/800') ? {...value, ...changed} : value);
});

test('API pagination reads all chunks and rejects lost pages', () => {
    const files = {'summary.json': randomBytes(CHUNK_SIZE * 85)};
    const good = evidenceApi(run, files);
    const result = readHostedEvidence({github: good, run, repository, kind: 'checkpoint'});
    assert.deepEqual(result.files.get('summary.json'), files['summary.json']);
    assert.throws(() => readHostedEvidence({run, repository, kind: 'checkpoint', github: path =>
        path.includes('/annotations') && path.includes('page=2') ? '[]' : good(path)}), /incomplete/);
});

test('publisher appends at most 50 bounded annotations and seals manifest only after all writes', t => {
    const root = mkdtempSync(join(tmpdir(), 'hosted-api-publish-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const output = join(root, 'output');
    mkdirSync(join(output, 'synthetic'), {recursive: true});
    for (const name of ['summary.json', 'development-standing.json', 'session-results.json', 'scan-cache.json'])
        writeFileSync(join(output, name), '{}');
    writeFileSync(join(output, 'synthetic/ci-v1.json'), randomBytes(CHUNK_SIZE * 45));
    const api = evidenceApi(run, {'summary.json': '{}'}), writes = [];
    const manifest = publishHostedEvidence('checkpoint', output, {root,
        env: {GITHUB_ACTIONS: 'true', GITHUB_JOB: 'combine', GITHUB_REPOSITORY: repository,
            GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: run.head_sha},
        request: (path, body) => {
            if (body) {writes.push(body); return '{}';}
            const value = JSON.parse(api(path));
            if (path.includes('/jobs')) value.jobs[0].status = 'in_progress';
            if (path.endsWith('/check-runs/800')) value.output = {};
            if (path.includes('/annotations')) return '[]';
            return JSON.stringify(value);
        }});
    assert.ok(writes.length >= 3);
    assert.ok(writes.slice(0, -1).every(body => body.output.annotations.length <= 50 && !body.status && !body.conclusion));
    assert.deepEqual(JSON.parse(writes.at(-1).output.summary), manifest);
    assert.equal(writes.at(-1).output.annotations, undefined);
    const files = decodeEvidence(manifest, writes.flatMap(body => body.output.annotations ?? []), run, repository, 'checkpoint');
    const target = join(root, 'read');
    materializeEvidence(target, files);
    assert.deepEqual(readFileSync(join(target, 'synthetic/ci-v1.json')), readFileSync(join(output, 'synthetic/ci-v1.json')));
});

test('declared job and annotation totals detect truncated successful API pages', () => {
    const good = evidenceApi(run, {'summary.json': '{}'});
    for (const target of ['jobs', 'annotations']) {
        assert.throws(() => readHostedEvidence({run, repository, kind: 'checkpoint', github: path => {
            const value = JSON.parse(good(path));
            if (target === 'jobs' && path.includes('/jobs')) value.total_count = 2;
            if (target === 'annotations' && path.endsWith('/check-runs/800')) value.output.annotations_count = 2;
            return JSON.stringify(value);
        }}), /incomplete .*pages/u);
    }
});
