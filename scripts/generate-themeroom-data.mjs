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

// These sets are the closed bridge between the pinned Lua callbacks and the
// JavaScript handlers. Generic room and map callbacks are parsed below; every
// other callback must be named here so that source drift cannot silently fall
// back to different behavior.
const SIMPLE_ROOM_NAMES = new Set([
    'default',
    'Default room with themed fill',
    'Unlit room with themed fill',
    'Room with both normal contents and themed fill',
]);
const SIMPLE_FILLER_MAP_NAMES = new Set([
    'L-shaped',
    'L-shaped, rot 1',
    'L-shaped, rot 2',
    'L-shaped, rot 3',
    'Circular, small',
    'Circular, medium',
    'Circular, big',
    'T-shaped',
    'T-shaped, rot 1',
    'T-shaped, rot 2',
    'T-shaped, rot 3',
    'S-shaped',
    'S-shaped, rot 1',
    'Z-shaped',
    'Z-shaped, rot 1',
    'Cross',
    'Four-leaf clover',
]);
const COMPLEX_MAP_HANDLER_NAMES = new Set([
    'Blocked center',
    'Water-surrounded vault',
]);
const DIRECT_HANDLER_NAMES = new Set([
    'Fake Delphi',
    'Room in a room',
    'Huge room with another room inside',
    'Nesting rooms',
    'Pillars',
    'Mausoleum',
    'Random dungeon feature in the middle of an odd-sized room',
    'Twin businesses',
]);

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

function definitionId(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}

function parseSimpleRoomAction(text) {
    const match = text.match(
        /\bcontents\s*=\s*function\(\)\s*des\.room\s*\(\s*\{([\s\S]*)\}\s*\)\s*;\s*end\s*,?\s*\}$/u,
    );
    if (!match) return null;

    const fields = {};
    const body = match[1];
    const fieldPattern = /\s*(type|lit|filled|contents)\s*=\s*(?:"([^"]*)"|(-?[0-9]+)|([A-Za-z_][A-Za-z0-9_]*))\s*(?:,|$)/uy;
    let offset = 0;
    while (offset < body.length) {
        fieldPattern.lastIndex = offset;
        const field = fieldPattern.exec(body);
        if (!field) {
            if (!body.slice(offset).trim()) break;
            return null;
        }
        if (Object.hasOwn(fields, field[1])) return null;
        fields[field[1]] = field[2] ?? (field[3] != null ? Number(field[3]) : field[4]);
        offset = fieldPattern.lastIndex;
    }

    if (fields.type !== 'ordinary' && fields.type !== 'themed') return null;
    if (fields.contents != null && fields.contents !== 'themeroom_fill') return null;
    const room = { type: fields.type };
    if (fields.lit != null) room.lit = fields.lit;
    if (fields.filled != null) room.filled = fields.filled;
    const action = { kind: 'room', room };
    if (fields.contents === 'themeroom_fill') {
        action.contents = { kind: 'themeroom-fill' };
    }
    return action;
}

function extractMap(text, name) {
    const mapCallCount = text.match(/\bdes\.map\s*\(/gu)?.length ?? 0;
    if (!mapCallCount) return null;
    if (mapCallCount !== 1)
        throw new Error(`${name} has ${mapCallCount} des.map calls; expected one`);
    const match = text.match(
        /\bdes\.map\s*\(\s*\{\s*map\s*=\s*\[\[\r?\n([\s\S]*?)\]\]/u,
    );
    if (!match) throw new Error(`${name} has an unsupported des.map form`);
    const rows = match[1].replace(/\r/gu, '').split('\n');
    const width = Math.max(...rows.map((row) => row.length));
    if (rows.some((row) => row.length !== width))
        throw new Error(`${name} has unequal static-map row widths`);
    return { rows, width, height: rows.length };
}

function fillerCalls(text) {
    return [...text.matchAll(
        /\bfiller_region\s*\(\s*([0-9]+)\s*,\s*([0-9]+)\s*\)/gu,
    )].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

function hasDirectFillerCallback(text) {
    return /\]\],\s*contents\s*=\s*function\(m\)\s*filler_region\s*\(\s*[0-9]+\s*,\s*[0-9]+\s*\)\s*;\s*end\s*\}\s*\)\s*;\s*end\s*,?\s*\}$/u.test(text);
}

function classifyAction(name, text, staticMap) {
    const id = definitionId(name);
    const simpleRoom = parseSimpleRoomAction(text);
    if (SIMPLE_ROOM_NAMES.has(name)) {
        if (!simpleRoom || staticMap)
            throw new Error(`${name} no longer has its expected simple des.room callback`);
        return simpleRoom;
    }
    if (simpleRoom)
        throw new Error(`${name} has an unclassified simple des.room callback`);

    if (staticMap) {
        const fillers = fillerCalls(text);
        if (SIMPLE_FILLER_MAP_NAMES.has(name)) {
            if (!hasDirectFillerCallback(text) || fillers.length !== 1)
                throw new Error(`${name} no longer has its expected direct filler_region callback`);
            return {
                kind: 'map',
                contents: { kind: 'filler-region', filler: fillers[0] },
            };
        }
        if (COMPLEX_MAP_HANDLER_NAMES.has(name)) {
            if (hasDirectFillerCallback(text) || fillers.length > 1)
                throw new Error(`${name} has an unexpected filler_region callback shape`);
            const contents = { kind: 'handler', handler: id };
            if (fillers.length === 1) contents.filler = fillers[0];
            return { kind: 'map', contents };
        }
        throw new Error(`${name} has an unclassified des.map callback`);
    }

    if (!DIRECT_HANDLER_NAMES.has(name))
        throw new Error(`${name} has an unclassified room callback`);
    return { kind: 'handler', handler: id };
}

function parseEntry(entry, source) {
    const text = entry.text;
    const nameMatch = text.match(/\bname\s*=\s*(["'])(.*?)\1/u);
    if (!nameMatch) throw new Error('themeroom entry has no literal name');
    const contentsIndex = text.indexOf('contents = function');
    if (contentsIndex < 0) throw new Error(`${nameMatch[2]} has no contents callback`);
    const prefix = text.slice(0, contentsIndex);
    const id = definitionId(nameMatch[2]);
    const definition = {
        id,
        name: nameMatch[2],
        frequency: integerField(prefix, 'frequency', 1),
        sourceLine: source.slice(0, entry.offset).split('\n').length,
    };
    const mindiff = integerField(prefix, 'mindiff', null);
    const maxdiff = integerField(prefix, 'maxdiff', null);
    if (mindiff !== null) definition.mindiff = mindiff;
    if (maxdiff !== null) definition.maxdiff = maxdiff;

    const staticMap = extractMap(text, definition.name);
    definition.sourceKind = staticMap ? 'map' : 'room';
    definition.action = classifyAction(definition.name, text, staticMap);
    if (staticMap) {
        definition.map = staticMap.rows;
        definition.width = staticMap.width;
        definition.height = staticMap.height;
        const actionFiller = definition.action.contents?.filler;
        if (actionFiller) {
            if (actionFiller.x < 0 || actionFiller.x >= definition.width
                || actionFiller.y < 0 || actionFiller.y >= definition.height) {
                throw new Error(`${definition.name} filler coordinate is outside its map`);
            }
            // Keep the legacy field only for callbacks which are already safe
            // for the current runtime's direct filler-map path.
            if (definition.action.contents.kind === 'filler-region')
                definition.filler = actionFiller;
        }
    }
    return definition;
}

function generatedSource(definitions) {
    const serialized = JSON.stringify(definitions, null, 4)
        .split('\n').map((line) => `    ${line}`).join('\n');
    return `// Generated by scripts/generate-themeroom-data.mjs.\n`
        + `// Source: nethack-c/upstream/dat/themerms.lua at ${PINNED_REVISION}.\n\n`
        + `// sourceLine is the Lua table entry's opening line. action is a closed,\n`
        + `// source-derived description of how its contents callback is dispatched.\n\n`
        + `function deepFreeze(value) {\n`
        + `    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;\n`
        + `    for (const nested of Object.values(value)) deepFreeze(nested);\n`
        + `    return Object.freeze(value);\n`
        + `}\n\n`
        + `export const THEMEROOM_DEFINITIONS = Object.freeze(\n`
        + `${serialized}.map(deepFreeze),\n`
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
const ids = new Set(definitions.map((definition) => definition.id));
if (ids.size !== definitions.length) {
    throw new Error('themeroom definition ids are not unique');
}
const mapActions = definitions.filter((definition) => definition.action.kind === 'map');
if (mapActions.length !== 19) {
    throw new Error(`expected 19 map actions, found ${mapActions.length}`);
}
const directFillerMaps = definitions.filter(
    (definition) => definition.action.contents?.kind === 'filler-region',
);
if (directFillerMaps.length !== 17) {
    throw new Error(`expected 17 direct filler maps, found ${directFillerMaps.length}`);
}
const fillerCallbacks = definitions.filter(
    (definition) => definition.action.contents?.filler,
);
if (fillerCallbacks.length !== 18) {
    throw new Error(`expected 18 filler_region callbacks, found ${fillerCallbacks.length}`);
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
