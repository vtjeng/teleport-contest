#!/usr/bin/env node

// SCORE.tsv is tab-delimited. A double quote inside a field value causes
// GitHub's TSV renderer to flag the line as illegally quoted, because TSV
// inherits CSV's use of double quotes as field delimiters.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(REPO_ROOT, 'SCORE.tsv');
const lines = readFileSync(file, 'utf8').split('\n');

const bad = [];
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"')) {
        bad.push(i + 1);
    }
}

if (bad.length) {
    console.error(
        `SCORE.tsv: double quotes on line${bad.length > 1 ? 's' : ''} ${bad.join(', ')}; use single quotes instead`,
    );
    process.exit(1);
}
