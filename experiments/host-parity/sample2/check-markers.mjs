#!/usr/bin/env node
// check-markers.mjs -- Report the sample-2 recipes whose recording never
// shows the recipe's marker string, so a recipe that missed its target
// screen is found before the macOS run.
//
// Usage: node experiments/host-parity/sample2/check-markers.mjs <recordings-dir>
//
// Reads sample2.jsonl next to this script and <recordings-dir>/<id>.session.json.
// Prints one line per recipe that has no recording or whose screens never
// contain its marker, then a count. Exits 1 if any recipe is listed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeScreen, renderCell } from '../../../frozen/screen-decode.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) {
    console.error('Usage: node experiments/host-parity/sample2/check-markers.mjs <recordings-dir>');
    process.exit(2);
}
const rows = fs.readFileSync(path.join(HERE, 'sample2.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line));
let missed = 0;
for (const row of rows) {
    const file = path.join(dir, `${row.id}.session.json`);
    if (!fs.existsSync(file)) {
        console.log(`${row.id}: no recording`);
        ++missed;
        continue;
    }
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    const found = rec.segments.some((seg) => (seg.steps ?? []).some((step) => decodeScreen(step.screen ?? '')
        .some((r) => r.map(renderCell).join('').includes(row.marker))));
    if (!found) {
        console.log(`${row.id}: marker ${JSON.stringify(row.marker)} not shown`);
        ++missed;
    }
}
console.log(`${rows.length - missed} of ${rows.length} recipes reached their marker`);
process.exit(missed ? 1 : 0);
