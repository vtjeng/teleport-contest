#!/usr/bin/env node
// Explicit anonymous reads for this public repository's checkpoint importer.
// No gh invocation, credential lookup, redirects, writes, or artifact downloads.
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const PUBLIC_REPOSITORY = 'vtjeng/teleport-contest';
const TIMEOUT_MS = 30000;
const MAX_BYTES = 16 * 1024 * 1024; // One API page, not the reconstructed archive.
const script = fileURLToPath(import.meta.url);

export function publicReadUrl(path) {
    const prefix = `repos/${PUBLIC_REPOSITORY}/`;
    if (typeof path !== 'string' || !path.startsWith(prefix)) throw new Error('public read: repository/path not allowed');
    const tail = path.slice(prefix.length);
    const single = /^(?:actions\/runs|check-runs)\/[1-9]\d*$/u;
    const paged = /^(?:actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*\/jobs|check-runs\/[1-9]\d*\/annotations)\?per_page=100&page=[1-9]\d*$/u;
    const published = /^actions\/runs\?head_sha=[a-f0-9]{40}&branch=main&event=push&per_page=100&page=[1-9]\d*$/u;
    if (!single.test(tail) && !paged.test(tail) && !published.test(tail))
        throw new Error('public read: endpoint/query not allowed');
    const url = new URL(`https://api.github.com/${path}`);
    if (url.origin !== 'https://api.github.com' || url.username || url.password || url.hash)
        throw new Error('public read: host not allowed');
    return url.href;
}

export async function requestPublicJson(path, {fetchFn = globalThis.fetch, timeoutMs = TIMEOUT_MS} = {}) {
    const url = publicReadUrl(path);
    const controller = new AbortController();
    let timer;
    // Race also bounds injected transports and body readers that ignore abort.
    const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {controller.abort(); reject(new Error('public read: request timed out'));}, timeoutMs);
    });
    try {
        return await Promise.race([deadline, (async () => {
            const response = await fetchFn(url, {method: 'GET', redirect: 'error', credentials: 'omit',
                signal: controller.signal, headers: {
                    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'teleport-public-checkpoint-importer',
                }});
            if (response.status !== 200) {
                const rate = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
                const reset = response.headers.get('x-ratelimit-reset');
                const retry = response.headers.get('retry-after');
                throw new Error(`public read: HTTP ${response.status}${rate ? ' anonymous rate limit' : ''}`
                    + `${/^\d+$/u.test(reset || '') ? `; reset=${reset}` : ''}`
                    + `${/^\d+$/u.test(retry || '') ? `; retry-after=${retry}` : ''}; no retry or authenticated fallback`);
            }
            if (response.url && response.url !== url) throw new Error('public read: response URL changed');
            if (!/^application\/(?:json|vnd.github\+json)(?:;|$)/iu.test(response.headers.get('content-type') || ''))
                throw new Error('public read: expected JSON content type');
            if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('public read: response exceeds size limit');
            const chunks = [];
            let size = 0;
            if (!response.body) throw new Error('public read: missing response body');
            for await (const chunk of response.body) {
                size += chunk.byteLength;
                if (size > MAX_BYTES) throw new Error('public read: response exceeds size limit');
                chunks.push(Buffer.from(chunk));
            }
            const text = Buffer.concat(chunks).toString('utf8');
            let data;
            try {data = JSON.parse(text);} catch {throw new Error('public read: malformed JSON');}
            const annotations = path.includes('/annotations?');
            const jobs = path.includes('/jobs?');
            const published = path.includes('/actions/runs?');
            if (annotations ? !Array.isArray(data) : !data || typeof data !== 'object' || Array.isArray(data)
                || (jobs ? !Array.isArray(data.jobs) : published ? !Array.isArray(data.workflow_runs)
                    : !Number.isSafeInteger(data.id)))
                throw new Error('public read: malformed API response');
            if ((annotations ? data : jobs ? data.jobs : published ? data.workflow_runs : []).length > 100)
                throw new Error('public read: oversized API page');
            return text;
        })()]);
    } finally {clearTimeout(timer); controller.abort();}
}

// Only platform networking/trust configuration crosses into the worker.
// GitHub tokens, NODE_OPTIONS hooks and TLS-disable settings are never forwarded.
export function publicReadEnvironment(env = process.env) {
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
        throw new Error('public read: TLS verification must remain enabled');
    const child = {};
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
        'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_USE_SYSTEM_CA']) {
        if (env[key] !== undefined) child[key] = env[key];
    }
    // Enable Node's documented handling of the already configured proxy. Keep
    // NO_PROXY intact; neither choose another proxy nor route around this one.
    if (child.HTTP_PROXY || child.HTTPS_PROXY || child.http_proxy || child.https_proxy)
        child.NODE_USE_ENV_PROXY = '1';
    return child;
}

// Keep the existing synchronous importer interface. CA variables must reach the
// child at startup; Node does not reload NODE_EXTRA_CA_CERTS during execution.
export function publicGithubRead(path, {execute = execFileSync, env = process.env} = {}) {
    publicReadUrl(path);
    const child = publicReadEnvironment(env);
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (child.NODE_USE_ENV_PROXY && !(major >= 24 || major === 22 && minor >= 21))
        throw new Error('public read: configured proxy requires Node 22.21+ or 24+');
    // Retain only supported trust-selection flags, never arbitrary Node hooks.
    const trustFlags = (env.NODE_OPTIONS || '').split(/\s+/u)
        .filter(flag => ['--use-system-ca', '--use-openssl-ca', '--use-bundled-ca'].includes(flag));
    return execute(process.execPath, [...trustFlags, script, path], {env: child, encoding: 'utf8',
        timeout: TIMEOUT_MS + 5000, maxBuffer: MAX_BYTES + 1024});
}

// Adapter for the existing read-only publication and receipt verifiers. Their
// gh-shaped argument lists are intentionally limited to these public GETs.
export function publicGithubCliRead(args, read = publicGithubRead) {
    if (Array.isArray(args) && args.length === 6
        && args.join('\0') === ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'].join('\0'))
        return PUBLIC_REPOSITORY;
    if (!Array.isArray(args) || args.length !== 2 || args[0] !== 'api')
        throw new Error('public read: CLI operation not allowed');
    const path = args[1].replace(/(\/jobs)\?per_page=100$/u, '$1?per_page=100&page=1');
    publicReadUrl(path);
    return read(path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    if (process.argv.length !== 3) {console.error('Usage: public-github-read.mjs <allowed-api-path>'); process.exitCode = 1;}
    else requestPublicJson(process.argv[2]).then(text => process.stdout.write(text)).catch(error => {
        console.error(error.message); process.exitCode = 1;
    });
}
