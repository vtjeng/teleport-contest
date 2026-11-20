#!/usr/bin/env node
// run-oracle.mjs -- build regex-oracle.c with the host's C compiler and ask
// it every case in cases.jsonl.
//
// Usage: node experiments/host-parity/regex-oracle/run-oracle.mjs <out-dir>
//
// Writes <out-dir>/results.jsonl: one line per case, {id, result, ms},
// where result is the oracle's output line ("ok\t<digits>" or
// "err\t<code>\t<text>"), "timeout" or "signal <name>". Ordinary cases go
// through one oracle process in batches; each isolated case gets its own
// process and ISOLATED_TIMEOUT_MS.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ISOLATED_TIMEOUT_MS = 60_000;
const BATCH = 500;

const out = resolve(process.argv[2] ?? 'regex-oracle-out');
mkdirSync(out, { recursive: true });
const oracle = join(out, 'regex-oracle');
execFileSync('cc', ['-O2', '-o', oracle, join(HERE, 'regex-oracle.c')], { stdio: 'inherit' });

const [header, ...cases] = readFileSync(join(HERE, 'cases.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
const hex = (s) => Buffer.from(s, 'latin1').toString('hex');
const textsHex = header.texts.map(hex).join('\t');
const inputLine = (c) => `${hex(c.pattern)}\t${textsHex}\n`;

const results = [];
const ordinary = cases.filter((c) => !c.isolated);
for (let i = 0; i < ordinary.length; i += BATCH) {
    const batch = ordinary.slice(i, i + BATCH);
    const start = Date.now();
    const r = spawnSync(oracle, [], {
        input: batch.map(inputLine).join(''),
        encoding: 'latin1',
        maxBuffer: 1 << 28,
        timeout: 600_000,
    });
    const lines = r.stdout.split('\n').filter(Boolean);
    if (r.status !== 0 || lines.length !== batch.length)
        throw new Error(`batch ${i}: status ${r.status} signal ${r.signal}, ${lines.length} of ${batch.length} lines`);
    const ms = (Date.now() - start) / batch.length;
    batch.forEach((c, k) => results.push({ id: c.id, result: lines[k], ms }));
}
for (const c of cases.filter((x) => x.isolated)) {
    const start = Date.now();
    const r = spawnSync(oracle, [], {
        input: inputLine(c),
        encoding: 'latin1',
        maxBuffer: 1 << 28,
        timeout: ISOLATED_TIMEOUT_MS,
        killSignal: 'SIGKILL',
    });
    const ms = Date.now() - start;
    let result;
    if (r.error?.code === 'ETIMEDOUT' || (r.signal === 'SIGKILL' && ms >= ISOLATED_TIMEOUT_MS)) result = 'timeout';
    else if (r.signal) result = `signal ${r.signal}`;
    else result = r.stdout.split('\n')[0];
    results.push({ id: c.id, result, ms });
    console.log(`isolated ${JSON.stringify(c.pattern)}: ${result.slice(0, 40)} in ${ms} ms`);
}
results.sort((a, b) => a.id - b.id);
writeFileSync(join(out, 'results.jsonl'), `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
console.log(`${results.length} results in ${join(out, 'results.jsonl')}`);
