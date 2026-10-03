import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    parseReadTextTables,
    renderReadTextData,
} from './generate-read-text-data.mjs';
import {
    APRON_MESSAGES,
    CANDY_WRAPPERS,
    HAWAIIAN_BACKGROUNDS,
    HAWAIIAN_MOTIFS,
    SHIRT_MESSAGES,
} from '../js/read_text_data.js';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(projectRoot, 'nethack-c', 'upstream', 'src', 'read.c');
const outputPath = join(projectRoot, 'js', 'read_text_data.js');

test('read-text tables match deterministic output from read.c', () => {
    const tables = parseReadTextTables(readFileSync(sourcePath, 'utf8'));
    const generated = renderReadTextData(tables);
    assert.equal(readFileSync(outputPath, 'utf8'), generated);
    assert.deepEqual(Object.keys(tables), [
        'shirt_msgs', 'hawaiian_motifs', 'hawaiian_bgs', 'apron_msgs',
        'candy_wrappers',
    ]);
    // These counts are the exact initializer lengths in pinned read.c.
    assert.equal(SHIRT_MESSAGES.length, 70);
    assert.equal(HAWAIIAN_MOTIFS.length, 16);
    assert.equal(HAWAIIAN_BACKGROUNDS.length, 11);
    assert.equal(APRON_MESSAGES.length, 10);
    assert.equal(CANDY_WRAPPERS.length, 13);
    assert.deepEqual(SHIRT_MESSAGES, tables.shirt_msgs);
    assert.deepEqual(HAWAIIAN_MOTIFS, tables.hawaiian_motifs);
    assert.deepEqual(HAWAIIAN_BACKGROUNDS, tables.hawaiian_bgs);
    assert.deepEqual(APRON_MESSAGES, tables.apron_msgs);
    assert.deepEqual(CANDY_WRAPPERS, tables.candy_wrappers);
});
