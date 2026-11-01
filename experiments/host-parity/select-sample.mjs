#!/usr/bin/env node
// select-sample.mjs -- Choose the host-parity recipe sample from a local
// fresh-game run.
//
// Usage:
//   node experiments/host-parity/select-sample.mjs <run-dir> <results.jsonl>
//
// <run-dir> holds recipes/<id>.session.json and recordings/<id>.session.json;
// <results.jsonl> holds one result row per game ({id, status, hostKinds,
// ...}). The script replaces recipes/ and sample.jsonl next to this file.
// The rule, which README.md also states:
//   1. Every game whose status is "hostOnly" or whose hostKinds is
//      non-empty, in id order, up to SAMPLE_SIZE.
//   2. The remaining places split evenly between passing games (status
//      "pass") and failing games (status "fail", "crash" or "refusal"),
//      with the odd place going to passing games. A group that has fewer
//      games than its share gives the rest to the other group.
//   3. Within each group, in id order, take the games at indexes
//      floor(i * n / k) for i = 0 .. k - 1, where n is the group's size and
//      k its share.
// Games without a local recording ("cfail") cannot be compared and are
// never chosen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_SIZE = 500;
const FAILING = new Set(['fail', 'crash', 'refusal']);
const HERE = path.dirname(fileURLToPath(import.meta.url));

export function evenlySpaced(items, count) {
    const picked = [];
    for (let i = 0; i < count; ++i) {
        picked.push(items[Math.floor(i * items.length / count)]);
    }
    return picked;
}

export function selectSample(rows, size = SAMPLE_SIZE) {
    const byId = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const isHost = (r) => r.status === 'hostOnly' || (r.hostKinds?.length ?? 0) > 0;
    const host = byId.filter(isHost).slice(0, size);
    const passing = byId.filter((r) => !isHost(r) && r.status === 'pass');
    const failing = byId.filter((r) => !isHost(r) && FAILING.has(r.status));
    const remaining = size - host.length;
    let failShare = Math.min(Math.floor(remaining / 2), failing.length);
    const passShare = Math.min(remaining - failShare, passing.length);
    failShare = Math.min(remaining - passShare, failing.length);
    return [
        ...host.map((r) => ({ group: 'host', row: r })),
        ...evenlySpaced(passing, passShare).map((r) => ({ group: 'pass', row: r })),
        ...evenlySpaced(failing, failShare).map((r) => ({ group: 'fail', row: r })),
    ].sort((a, b) => a.row.id.localeCompare(b.row.id));
}

function main() {
    const [runDir, resultsPath] = process.argv.slice(2);
    if (!runDir || !resultsPath) {
        console.error('Usage: node experiments/host-parity/select-sample.mjs <run-dir> <results.jsonl>');
        process.exitCode = 2;
        return;
    }
    const rows = fs.readFileSync(resultsPath, 'utf8').trim().split('\n')
        .map((line) => JSON.parse(line))
        .filter((r) => fs.existsSync(path.join(runDir, 'recordings', `${r.id}.session.json`)));
    const sample = selectSample(rows);
    const recipeDir = path.join(HERE, 'recipes');
    fs.rmSync(recipeDir, { recursive: true, force: true });
    fs.mkdirSync(recipeDir);
    const lines = [];
    for (const { group, row } of sample) {
        const name = `${row.id}.session.json`;
        fs.copyFileSync(path.join(runDir, 'recipes', name), path.join(recipeDir, name));
        lines.push(JSON.stringify({
            id: row.id, group, status: row.status, hostKinds: row.hostKinds ?? [],
            family: row.family, twoSeg: row.twoSeg, commit: row.commit,
        }));
    }
    fs.writeFileSync(path.join(HERE, 'sample.jsonl'), `${lines.join('\n')}\n`);
    const counts = {};
    for (const { group } of sample) counts[group] = (counts[group] ?? 0) + 1;
    console.log(`${sample.length} recipes`, counts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
