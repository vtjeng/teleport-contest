#!/usr/bin/env node
// Generate js/tribute_data.js from the checked-out NetHack source data.
// Keep the generated string byte-for-byte equivalent to dat/tribute.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'nethack-c/upstream/dat/tribute');
const outputPath = resolve(root, 'js/tribute_data.js');
const source = await readFile(sourcePath, 'utf8');
const generated = `// Generated from nethack-c/upstream/dat/tribute by\n`
    + `// scripts/generate-tribute-data.mjs. Do not edit by hand.\n`
    + `export const TRIBUTE_DATA = ${JSON.stringify(source)};\n`;

if (process.argv.includes('--check')) {
    const current = await readFile(outputPath, 'utf8').catch(() => '');
    if (current !== generated) {
        console.error('js/tribute_data.js is stale; run the generator.');
        process.exitCode = 1;
    }
} else {
    await writeFile(outputPath, generated);
}
