#!/usr/bin/env node
// verify-rerecord.mjs — Re-record each session in sessions/ and compare
// to the canonical version, ignoring the binary build-date string in
// screen output (a known artifact of rebuilding the recorder binary).
//
// Usage: node scripts/verify-rerecord.mjs [--session <id>]

import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

import { fixedWorkload } from './fixed-workload.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RECORD = path.join(SCRIPT_DIR, 'record-session.mjs');
const USAGE = 'Usage: node scripts/verify-rerecord.mjs [--session <id>]';

// Strip recording-environment artifacts from screen output so
// recordings made from different machines / build clocks can compare.
//
// 1. The build-date string baked into the binary banner and the
//    extended-version (`?v`) help screen.
// 2. The HOME-path string shown by the `?g` options-help screen
//    ("Set options as OPTIONS=<options> in /home/.../.nethackrc").
//    NetHack splits the path across one line, then the contestant's
//    home dir would never match the canonical home dir, so we elide
//    the line.
const BUILD_DATE_RE = /(built|last build) [A-Z][a-z]{2}\s+\d{1,2} \d{4} \d{2}:\d{2}:\d{2}/g;
const RC_PATH_RE = /Set options as OPTIONS=<options> in\n[^\n]*\n/g;

function normalize(session) {
    const out = JSON.parse(JSON.stringify(session));
    for (const seg of out.segments || []) {
        for (const step of seg.steps || []) {
            if (typeof step.screen === 'string') {
                step.screen = step.screen
                    .replace(BUILD_DATE_RE, '$1 <DATE>')
                    .replace(RC_PATH_RE, 'Set options as OPTIONS=<options> in\n<RCPATH>\n');
            }
        }
    }
    return out;
}

function diffSummary(a, b) {
    if (a.segments.length !== b.segments.length) {
        return `segments len ${a.segments.length} vs ${b.segments.length}`;
    }
    for (let si = 0; si < a.segments.length; si++) {
        const sa = a.segments[si];
        const sb = b.segments[si];
        const la = (sa.steps || []).length;
        const lb = (sb.steps || []).length;
        if (la !== lb) return `seg ${si} steps len ${la} vs ${lb}`;
        for (let i = 0; i < la; i++) {
            const x = sa.steps[i];
            const y = sb.steps[i];
            for (const f of ['key', 'screen', 'cursor']) {
                if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) {
                    return `seg ${si} step ${i} ${f}`;
                }
            }
            const xr = x.rng || [];
            const yr = y.rng || [];
            if (xr.length !== yr.length) return `seg ${si} step ${i} rng len ${xr.length} vs ${yr.length}`;
            for (let j = 0; j < xr.length; j++) {
                if (xr[j] !== yr[j]) return `seg ${si} step ${i} rng[${j}]`;
            }
        }
    }
    return null;
}

async function recordOne(input, output) {
    return await new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [RECORD, input, output], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        c.stderr.on('data', (b) => { stderr += b.toString('utf8'); });
        c.on('error', reject);
        c.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`recorder exit=${code}\n${stderr}`));
        });
    });
}

function sessionId(file, holdout = false) {
    const name = file.replace(/\.session\.json$/u, '');
    return holdout ? `holdout/${name}` : name;
}

function parseArgs(args) {
    if (args.length === 0) return { session: null };
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))
        return { help: true };
    if (args.length === 2 && args[0] === '--session' && args[1]
        && !args[1].startsWith('--')) return { session: args[1] };
    throw new Error(USAGE);
}

function workloadEntries(session) {
    const workload = fixedWorkload(TEMPLATE_ROOT);
    const entries = [
        ...workload.publicFiles.map((file) => ({
            id: sessionId(file), label: 'development',
            full: path.join(TEMPLATE_ROOT, 'sessions', file),
        })),
        ...workload.holdoutFiles.map((file) => ({
            id: sessionId(file, true), label: 'local-holdout',
            full: path.join(TEMPLATE_ROOT, 'sessions', 'holdout', file),
        })),
    ];
    if (session && !entries.some((entry) => entry.id === session))
        throw new Error(`unknown fixed-workload session: ${session}`);
    return entries.filter((entry) => !session || entry.id === session);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(USAGE);
        return;
    }
    const all = workloadEntries(options.session);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-rerecord-'));
    let pass = 0;
    let fail = 0;
    const failures = [];
    try {
        for (const entry of all) {
            const input = entry.full;
            const output = path.join(tmpDir, `${entry.id.replaceAll('/', '--')}.session.json`);
            const display = `[${entry.label}] ${entry.id}`;
            process.stdout.write(`[..] ${display} `);
            // Skip jsGroundTruth sessions — those are recorded by the
            // JS port and not by the C recorder, so the recorder under
            // test here cannot reproduce them by design.
            try {
                const meta = JSON.parse(await fs.readFile(input, 'utf8'));
                if (meta.jsGroundTruth) {
                    process.stdout.write('SKIP (jsGroundTruth)\n');
                    continue;
                }
            } catch {}
            try {
                await recordOne(input, output);
                const a = normalize(JSON.parse(await fs.readFile(input, 'utf8')));
                const b = normalize(JSON.parse(await fs.readFile(output, 'utf8')));
                const d = diffSummary(a, b);
                if (d) {
                    process.stdout.write(`FAIL: ${d}\n`);
                    fail += 1;
                    failures.push({ name: display, reason: d });
                } else {
                    process.stdout.write('OK\n');
                    pass += 1;
                }
            } catch (err) {
                process.stdout.write(`ERROR: ${err.message.split('\n')[0]}\n`);
                fail += 1;
                failures.push({ name: display, reason: err.message });
            }
        }
        console.log(`\n=== ${pass}/${pass + fail} pass ===`);
        if (failures.length) {
            console.log('Failures:');
            for (const f of failures) console.log(`  ${f.name} — ${f.reason}`);
        }
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
