#!/usr/bin/env node

// Generate the source-shaped room-selection table and static map descriptors
// used by the JavaScript port. The Lua callbacks remain the behavior source;
// this generator only projects fields that can be represented without a Lua
// interpreter at runtime.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const SOURCE_PATH = join(UPSTREAM_ROOT, 'dat', 'themerms.lua');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'themeroom_data.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';
const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > (checkOnly ? 3 : 2))
    throw new Error('Usage: node scripts/generate-themeroom-data.mjs [--check]');

function quotedStringEnd(source, start, quote) {
    for (let index = start + 1; index < source.length; index++) {
        if (source[index] === '\\') index++;
        else if (source[index] === quote) return index + 1;
    }
    throw new Error('unterminated quoted string in themerms.lua');
}

function luaLongStringEnd(source, start) {
    const end = source.indexOf(']]', start + 2);
    if (end < 0) throw new Error('unterminated Lua long string in themerms.lua');
    return end + 2;
}

function lineCommentEnd(source, start) {
    const end = source.indexOf('\n', start + 2);
    return end < 0 ? source.length : end + 1;
}

function extractThemeroomEntries(source) {
    const marker = 'themerooms = {';
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) throw new Error(`missing ${marker}`);
    const outerOpen = source.indexOf('{', markerIndex);
    const entries = [];
    let depth = 0;
    let entryStart = -1;

    for (let index = outerOpen; index < source.length;) {
        const char = source[index];
        if (char === '"' || char === "'") {
            index = quotedStringEnd(source, index, char);
            continue;
        }
        if (source.startsWith('[[', index)) {
            index = luaLongStringEnd(source, index);
            continue;
        }
        if (source.startsWith('--', index)) {
            index = lineCommentEnd(source, index);
            continue;
        }
        if (char === '{') {
            if (depth === 1) entryStart = index;
            depth++;
        } else if (char === '}') {
            if (depth === 2 && entryStart >= 0) {
                entries.push({
                    text: source.slice(entryStart, index + 1),
                    offset: entryStart,
                });
                entryStart = -1;
            }
            depth--;
            if (depth === 0) return entries;
        }
        index++;
    }
    throw new Error('unterminated themerooms table');
}

function integerField(prefix, field, fallback) {
    const match = prefix.match(new RegExp(`\\b${field}\\s*=\\s*(-?[0-9]+)`, 'u'));
    return match ? Number(match[1]) : fallback;
}

function parseEntry(entry, source) {
    const text = entry.text;
    const nameMatch = text.match(/\bname\s*=\s*(["'])(.*?)\1/u);
    if (!nameMatch) throw new Error('themeroom entry has no literal name');
    const contentsIndex = text.indexOf('contents = function');
    if (contentsIndex < 0) throw new Error(`${nameMatch[2]} has no contents callback`);
    const prefix = text.slice(0, contentsIndex);
    const definition = {
        name: nameMatch[2],
        frequency: integerField(prefix, 'frequency', 1),
        sourceLine: source.slice(0, entry.offset).split('\n').length,
    };
    const mindiff = integerField(prefix, 'mindiff', null);
    const maxdiff = integerField(prefix, 'maxdiff', null);
    if (mindiff !== null) definition.mindiff = mindiff;
    if (maxdiff !== null) definition.maxdiff = maxdiff;

    definition.sourceKind = /\bdes\.map\s*\(/u.test(text) ? 'map' : 'room';
    const staticMap = text.match(
        /des\.map\(\{\s*map\s*=\s*\[\[\r?\n([\s\S]*?)\]\],\s*contents\s*=\s*function\(m\)\s*filler_region\(\s*([0-9]+)\s*,\s*([0-9]+)\s*\);\s*end\s*\}\);/u,
    );
    if (staticMap) {
        const rows = staticMap[1].replace(/\r/gu, '').split('\n');
        definition.map = rows;
        definition.width = Math.max(...rows.map((row) => row.length));
        definition.height = rows.length;
        if (rows.some((row) => row.length !== definition.width)) {
            throw new Error(`${definition.name} has unequal static-map row widths`);
        }
        definition.filler = { x: Number(staticMap[2]), y: Number(staticMap[3]) };
        if (definition.filler.x < 0 || definition.filler.x >= definition.width
            || definition.filler.y < 0 || definition.filler.y >= definition.height) {
            throw new Error(`${definition.name} filler coordinate is outside its map`);
        }
    }
    return definition;
}

function generatedSource(definitions) {
    const serialized = JSON.stringify(definitions, null, 4)
        .split('\n').map((line) => `    ${line}`).join('\n');
    return `// Generated by scripts/generate-themeroom-data.mjs.\n`
        + `// Source: nethack-c/upstream/dat/themerms.lua at ${PINNED_REVISION}.\n\n`
        + `function freezeDefinition(definition) {\n`
        + `    if (definition.map) Object.freeze(definition.map);\n`
        + `    if (definition.filler) Object.freeze(definition.filler);\n`
        + `    return Object.freeze(definition);\n`
        + `}\n\n`
        + `export const THEMEROOM_DEFINITIONS = Object.freeze(\n`
        + `${serialized}.map(freezeDefinition),\n`
        + `);\n`;
}

const actualRevision = execFileSync(
    'git', ['-C', UPSTREAM_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
).trim();
if (actualRevision !== PINNED_REVISION) {
    throw new Error(`expected NetHack source ${PINNED_REVISION}; found ${actualRevision}`);
}
const upstreamStatus = execFileSync(
    'git', ['-C', UPSTREAM_ROOT, 'status', '--porcelain=v1', '--untracked-files=no'],
    { encoding: 'utf8' },
).trim();
if (upstreamStatus) {
    throw new Error('Refusing to generate from modified tracked upstream sources');
}

const source = readFileSync(SOURCE_PATH, 'utf8');
const definitions = extractThemeroomEntries(source)
    .map((entry) => parseEntry(entry, source));
if (definitions.length !== 31) {
    throw new Error(`expected 31 themeroom definitions, found ${definitions.length}`);
}
const staticMaps = definitions.filter((definition) => definition.map);
if (staticMaps.length !== 17) {
    throw new Error(`expected 17 static filler maps, found ${staticMaps.length}`);
}

const output = generatedSource(definitions);
if (checkOnly) {
    let existing = '';
    try {
        existing = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
        // The comparison below reports the missing generated file.
    }
    if (existing !== output) {
        console.error('js/themeroom_data.js is stale; run node scripts/generate-themeroom-data.mjs');
        process.exitCode = 1;
    }
} else {
    writeFileSync(OUTPUT_PATH, output);
}
