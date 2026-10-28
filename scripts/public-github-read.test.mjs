import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {PUBLIC_REPOSITORY, publicReadUrl, publicGithubRead, requestPublicJson} from './public-github-read.mjs';
import {CHUNK_SIZE, readHostedEvidence} from './hosted-evidence.mjs';
import {evidenceApi} from './test-fixtures/hosted-evidence.mjs';
const path = `repos/${PUBLIC_REPOSITORY}/actions/runs/123`;
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});

test('public transport ignores invalid tokens and sends only explicit anonymous GET headers', async t => {
    const before = {GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN};
    t.after(() => { for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }});
    process.env.GH_TOKEN = 'invalid-token';
    process.env.GITHUB_TOKEN = 'also-invalid';
    const text = await requestPublicJson(path, {fetchFn: async (url, options) => {
        assert.equal(url, `https://api.github.com/${path}`);
        assert.equal(options.method, 'GET');
        assert.equal(options.redirect, 'error');
        assert.equal(options.credentials, 'omit');
        assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'User-Agent', 'X-GitHub-Api-Version']);
        assert.ok(!JSON.stringify(options).includes('invalid'));
        return json({id: 123});
    }});
    assert.deepEqual(JSON.parse(text), {id: 123});
    publicGithubRead(path, {execute: (binary, args, options) => {
        assert.equal(binary, process.execPath);
        assert.equal(args.at(-1), path);
        assert.deepEqual(options.env, {});
        assert.equal(options.timeout, 35000);
        return text;
    }});
});

test('host, repository, endpoint, queries, credentials and redirects cannot widen public scope', async () => {
    for (const bad of ['https://api.github.com/'+path, 'repos/other/project/actions/runs/123',
        path+'?access_token=x', path+'/artifacts', path+'/../456',
        `repos/${PUBLIC_REPOSITORY}/check-runs/1/annotations?per_page=100&page=1&foo=bar`])
        assert.throws(() => publicReadUrl(bad), /not allowed/u);
    await assert.rejects(requestPublicJson(path, {fetchFn: async () => new Response('', {status: 302})}), /HTTP 302/u);
});

test('HTTP errors, anonymous limits, malformed replies and timeouts fail without fallback', async () => {
    for (const status of [401, 403, 404, 429, 500]) {
        let calls = 0;
        await assert.rejects(requestPublicJson(path, {fetchFn: async () => {
            calls++;
            return new Response('', {status, headers: {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '123', 'retry-after': '60'}});
        }}), new RegExp(`HTTP ${status}.*anonymous rate limit.*reset=123.*no retry`));
        assert.equal(calls, 1);
    }
    for (const response of [json(null), json([]), json({message: 'Bad credentials'}),
        new Response('not-json', {headers: {'content-type': 'application/json'}}),
        new Response('<html>error</html>'),
        new Response('{}', {headers: {'content-type': 'application/json', 'content-length': '999999999'}})])
        await assert.rejects(requestPublicJson(path, {fetchFn: async () => response}), /public read:/u);
    await assert.rejects(requestPublicJson(path, {timeoutMs: 5, fetchFn: () => new Promise(() => {})}), /timed out/u);
});

test('anonymous multi-page annotation data retains existing chunk completeness and hash gates', async () => {
    const run = {id: 123, run_attempt: 1, check_suite_id: 500, head_sha: 'a'.repeat(40),
        repository: {full_name: PUBLIC_REPOSITORY}, head_repository: {full_name: PUBLIC_REPOSITORY},
        path: '.github/workflows/checkpoint-trial.yml', status: 'completed', conclusion: 'success'};
    const files = {'summary.json': randomBytes(CHUNK_SIZE * 85)};
    const api = evidenceApi(run, files);
    const paths = [`repos/${PUBLIC_REPOSITORY}/actions/runs/123/attempts/1/jobs?per_page=100&page=1`,
        `repos/${PUBLIC_REPOSITORY}/check-runs/800`,
        ...[1, 2].map(page => `repos/${PUBLIC_REPOSITORY}/check-runs/800/annotations?per_page=100&page=${page}`)];
    const responses = new Map();
    for (const p of paths) responses.set(p, await requestPublicJson(p, {fetchFn: async () => json(JSON.parse(api(p)))}));
    assert.equal(JSON.parse(responses.get(paths[2])).length, 100);
    const read = p => {assert.ok(responses.has(p)); return responses.get(p);};
    assert.deepEqual(readHostedEvidence({github: read, run, repository: PUBLIC_REPOSITORY, kind: 'checkpoint'}).files.get('summary.json'), files['summary.json']);
    responses.set(paths[3], '[]');
    assert.throws(() => readHostedEvidence({github: read, run, repository: PUBLIC_REPOSITORY, kind: 'checkpoint'}), /incomplete result chunks/u);
});
