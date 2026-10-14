#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SAM_FILB_LEVEL_MAP } from '../js/sam_filb_level_data.js';
import { extractSamFilbMap, renderSamFilbMap } from './generate-sam-filb-level.mjs';

const source = await readFile(new URL('../nethack-c/upstream/dat/Sam-filb.lua', import.meta.url), 'utf8');
const rows = extractSamFilbMap(source);
assert.deepEqual(SAM_FILB_LEVEL_MAP, rows);
assert.equal(SAM_FILB_LEVEL_MAP.length, 16);
assert(SAM_FILB_LEVEL_MAP.every(row => row.length === 60));
assert.equal(await readFile(new URL('../js/sam_filb_level_data.js', import.meta.url), 'utf8'),
    renderSamFilbMap(rows));
console.log('Sam-filb level data matches nethack-c/upstream/dat/Sam-filb.lua');
