#!/usr/bin/env node

// Read-only, loopback monitor for the C-player pilot. It serves only status
// and replay artifacts from the explicitly selected run directory.
import { createServer } from 'node:http';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorToCss, decodeScreen, renderCell } from '../frozen/screen-decode.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const TEMPLATE = join(dirname(SCRIPT), '../tools/c-explorer-monitor/index.html');
const ARTIFACTS = new Set(['recording.session.json', 'recipe.session.json', 'actions.jsonl']);

async function regularFile(path) {
    const info = await lstat(path);
    if (!info.isFile()) throw new Error('expected a regular file');
    return readFile(path, 'utf8');
}

export async function collectRuns(root) {
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return { runs: [], errors: [] };
        throw error;
    }
    const runs = [];
    const errors = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]+$/u.test(entry.name)) continue;
        try {
            const state = JSON.parse(await regularFile(join(root, entry.name, 'status.json')));
            const fields = ['id', 'mission', 'status', 'model', 'reasoningEffort',
                'seed', 'datetime', 'role', 'playmode', 'startedAt', 'updatedAt', 'observedAt',
                'keyCount', 'boundaries', 'screenText', 'cursor', 'latestIntent', 'summary', 'error'];
            const run = Object.fromEntries(fields.map((field) => [field, state[field] ?? null]));
            run.directory = entry.name;
            run.actions = Array.isArray(state.actions) ? state.actions.map((action) => ({
                time: action.time, keys: action.keys, intent: action.intent, outcome: action.outcome,
            })) : [];
            run.cells = state.screen ? decodeScreen(state.screen).map((row) => row.map((cell) => ({
                ch: renderCell(cell), color: colorToCss(cell.color), attr: cell.attr,
            }))) : null;
            run.artifacts = {};
            for (const artifact of ARTIFACTS) {
                try {
                    if ((await lstat(join(root, entry.name, artifact))).isFile()) {
                        run.artifacts[artifact] = `/runs/${encodeURIComponent(entry.name)}/${artifact}`;
                    }
                } catch (error) {
                    if (error.code !== 'ENOENT') throw error;
                }
            }
            runs.push(run);
        } catch (error) {
            // A newly started explorer has no status yet. Other failures
            // remain visible instead of making a broken run disappear.
            if (error.code !== 'ENOENT') errors.push({ run: entry.name, message: error.message });
        }
    }
    return { runs, errors };
}

export async function snapshotHtml(root) {
    const template = await readFile(TEMPLATE, 'utf8');
    const data = JSON.stringify({ ...await collectRuns(root), capturedAt: new Date().toISOString() })
        .replaceAll('<', '\\u003c');
    return template.replace('<script id="snapshot" type="application/json">null</script>',
        `<script id="snapshot" type="application/json">${data}</script>`);
}

export function monitorServer(root) {
    return createServer(async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        try {
            if (request.method !== 'GET') {
                response.writeHead(405).end('Read-only monitor');
                return;
            }
            const path = new URL(request.url, 'http://localhost').pathname;
            if (path === '/' || path === '/index.html') {
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(await readFile(TEMPLATE));
                return;
            }
            if (path === '/api/runs') {
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify(await collectRuns(root)));
                return;
            }
            const match = /^\/runs\/([a-zA-Z0-9_-]+)\/([a-z.]+)$/u.exec(path);
            if (match && ARTIFACTS.has(match[2])) {
                const directory = join(root, match[1]);
                if (!(await lstat(directory)).isDirectory()) throw new Error('invalid run directory');
                const content = await regularFile(join(directory, match[2]));
                response.setHeader('Content-Type', match[2].endsWith('.jsonl')
                    ? 'text/plain; charset=utf-8' : 'application/json');
                response.end(content);
                return;
            }
            response.writeHead(404).end('Not found');
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500,
                { 'Content-Type': 'text/plain; charset=utf-8' }).end('Artifact unavailable');
        }
    });
}

async function main(args) {
    if (args.includes('--help')) {
        console.log('Usage: node scripts/monitor-c-explorers.mjs --runs <directory> [--port 8766] [--snapshot <html>]\n'
            + 'Serves a read-only live monitor on 127.0.0.1. --snapshot writes standalone HTML and exits.\n'
            + 'Each run directory contains status.json, actions.jsonl, recipe.session.json and recording.session.json.');
        return;
    }
    const options = { port: 8766 };
    for (let i = 0; i < args.length; i += 2) {
        if (!['--runs', '--port', '--snapshot'].includes(args[i]) || !args[i + 1]) {
            throw new Error('Use --help for usage');
        }
        options[args[i].slice(2)] = args[i + 1];
    }
    if (!options.runs) throw new Error('--runs is required');
    const root = resolve(options.runs);
    if (options.snapshot) {
        await writeFile(resolve(options.snapshot), await snapshotHtml(root));
        console.log(`Snapshot: ${resolve(options.snapshot)}`);
        return;
    }
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
    const server = monitorServer(root);
    server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
        console.log(`C explorer monitor: http://127.0.0.1:${server.address().port}/\nRuns: ${root}`);
    });
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
    main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
