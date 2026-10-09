#!/usr/bin/env node
// Regenerate the Medusa-4 map argument in its source owner from dat/medusa-4.lua.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL('../nethack-c/upstream/dat/medusa-4.lua', import.meta.url);
const outputUrl = new URL('../js/medusa_levels.js', import.meta.url);

export function extractMedusa4Map(source) {
    const block = source.match(/des\.map\(\[\[\n([\s\S]*?)\n\]\]\)/u);
    if (!block) throw new SyntaxError('medusa-4.lua has no map block');
    const rows = block[1].split('\n');
    if (rows.length !== 21 || rows.some(row => row.length !== 76))
        throw new SyntaxError('medusa-4.lua map must have 21 rows of 76 columns');
    return rows;
}

export function regenerateMedusa4Map(owner, source) {
    const rows = extractMedusa4Map(source);
    const start = owner.indexOf('async function medusa4(des) {');
    if (start === -1) throw new SyntaxError('Medusa-4 loader is missing');
    const tail = owner.slice(start);
    const block = tail.match(/    await des\.map\(\[[\s\S]*?\n    \]\);/u);
    if (!block) throw new SyntaxError('Medusa-4 map argument is missing');
    const rendered = '    await des.map([\n'
        + rows.map(row => `        ${JSON.stringify(row)},`).join('\n')
        + '\n    ]);';
    return owner.slice(0, start) + tail.replace(block[0], rendered);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const source = await readFile(sourceUrl, 'utf8');
    const owner = await readFile(outputUrl, 'utf8');
    const generated = regenerateMedusa4Map(owner, source);
    if (process.argv.includes('--check')) {
        if (owner !== generated)
            throw new Error('Medusa-4 map is stale; run node scripts/generate-medusa-levels.mjs');
    } else {
        await writeFile(outputUrl, generated);
    }
}
