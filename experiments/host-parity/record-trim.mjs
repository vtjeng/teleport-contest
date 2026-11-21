#!/usr/bin/env node
// record-trim.mjs -- Record recipes with scripts/record-session.mjs, trimming a
// segment whose game ends before it reads every key (throwaway branch
// integration-checkpoint/macos-regex-flips-trim only).
//
// Usage: node experiments/host-parity/record-trim.mjs <out-dir> <jobs> <recipe>...
//
// The batch worker (.cache/c-diff-b13/tools/worker.mjs) does the same on
// Linux: when record-session.mjs fails with "got G, expected E (exit code 0)",
// C's game ended (death, save or quit) after reading G-1 keys of the segment,
// because end.c nh_terminate() captures one final boundary after the last
// key. The segment's moves are cut to G-1 keys and the game is recorded
// again, at most once per segment.
//
// Writes <out-dir>/<id>.session.json, <out-dir>/recipes/<id>.session.json (the
// recipe that recorded), <out-dir>/logs/<id>.log, <out-dir>/trims.jsonl and
// <out-dir>/failed.txt. Exits 1 if any recipe failed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [outArg, jobsArg, ...recipes] = process.argv.slice(2);
if (!outArg || !jobsArg || recipes.length === 0) {
    console.error('usage: record-trim.mjs <out-dir> <jobs> <recipe>...');
    process.exit(2);
}
const OUT = path.resolve(outArg);
const RECORD = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'scripts', 'record-session.mjs');
fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'recipes'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'failed.txt'), '');

function run(args) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let text = '';
        child.stdout.on('data', (c) => { text += c; });
        child.stderr.on('data', (c) => { text += c; });
        child.on('close', (code) => resolve({ code, text }));
    });
}

async function recordOne(recipePath) {
    const id = path.basename(recipePath, '.session.json');
    const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
    const work = path.join(OUT, 'recipes', `${id}.session.json`);
    const log = path.join(OUT, 'logs', `${id}.log`);
    fs.writeFileSync(log, '');
    const trimmed = new Set();
    for (let attempt = 0; attempt <= recipe.segments.length; attempt++) {
        fs.writeFileSync(work, JSON.stringify(recipe));
        const r = await run([RECORD, work, path.join(OUT, `${id}.session.json`)]);
        fs.appendFileSync(log, `== attempt ${attempt + 1}\n${r.text}`);
        if (r.code === 0) return true;
        const segs = [...r.text.matchAll(/\[seg (\d+)\/(\d+)\]/gu)];
        const seg = segs.length ? Number(segs.at(-1)[1]) - 1 : 0;
        const m = r.text.match(/got (\d+), expected (\d+) \(exit code 0\)/u);
        if (!m || trimmed.has(seg)) break;
        trimmed.add(seg);
        const got = Number(m[1]);
        const planned = recipe.segments[seg].moves.length;
        recipe.segments[seg].moves = recipe.segments[seg].moves.slice(0, got - 1);
        fs.appendFileSync(path.join(OUT, 'trims.jsonl'),
            `${JSON.stringify({ id, segment: seg, keysRead: got - 1, keysPlanned: planned })}\n`);
    }
    fs.appendFileSync(path.join(OUT, 'failed.txt'), `${id}\n`);
    return false;
}

let next = 0; let failed = 0;
async function lane() {
    while (next < recipes.length) {
        const p = recipes[next++];
        if (!await recordOne(p)) { failed++; console.error(`[fail] ${path.basename(p)}`); }
    }
}
await Promise.all(Array.from({ length: Number(jobsArg) }, lane));
console.log(`Recorded ${recipes.length - failed} of ${recipes.length} recipes into ${OUT} (${failed} failed).`);
process.exitCode = failed ? 1 : 0;
