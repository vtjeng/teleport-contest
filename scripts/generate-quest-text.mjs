#!/usr/bin/env node

// Extract quest text messages from dat/quest.lua into a JavaScript module.
// C ref: questpgr.c com_pager_core() loads quest.lua, looks up
// questtext[<role>][<msgid>], and reads the .text, .output, and .synopsis
// fields.  This script extracts those fields for messages used by
// quest.c on_start(), on_locate(), and on_goal() so the JS port can display
// them without a Lua runtime.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const SOURCE_PATH = join(UPSTREAM_ROOT, 'dat', 'quest.lua');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'quest_text_data.js');

// Messages used by on_start(), on_locate(), on_goal():
const NEEDED_MESSAGES = [
    'firsttime', 'nexttime', 'othertime',
    'locate_first', 'locate_next',
    'goal_first', 'goal_next', 'goal_alt',
    'leader_first', 'assignquest',
];

// All role filecodes, in the order they appear in quest.lua.
const ROLE_SECTIONS = [
    'common', 'Arc', 'Bar', 'Cav', 'Hea', 'Kni', 'Mon',
    'Pri', 'Ran', 'Rog', 'Sam', 'Tou', 'Val', 'Wiz',
];

// ---------------------------------------------------------------------------
// Minimal Lua literal parser.  quest.lua uses only tables, strings (double-
// quoted and long-bracket), numbers, and booleans.
// ---------------------------------------------------------------------------

function skipWhitespaceAndComments(src, pos) {
    while (pos < src.length) {
        if (src[pos] === ' ' || src[pos] === '\t' || src[pos] === '\r'
            || src[pos] === '\n') {
            pos++;
        } else if (src[pos] === '-' && src[pos + 1] === '-') {
            // line comment
            pos += 2;
            while (pos < src.length && src[pos] !== '\n') pos++;
        } else {
            break;
        }
    }
    return pos;
}

function parseLuaString(src, pos) {
    if (src[pos] === '"') {
        // short string
        pos++;
        let value = '';
        while (pos < src.length && src[pos] !== '"') {
            if (src[pos] === '\\') {
                pos++;
                if (src[pos] === 'n') { value += '\n'; pos++; }
                else if (src[pos] === 't') { value += '\t'; pos++; }
                else if (src[pos] === '\\') { value += '\\'; pos++; }
                else if (src[pos] === '"') { value += '"'; pos++; }
                else if (src[pos] === '`') { value += '`'; pos++; }
                else { value += src[pos]; pos++; }
            } else {
                value += src[pos];
                pos++;
            }
        }
        pos++; // skip closing "
        return { value, pos };
    }
    if (src[pos] === '[' && src[pos + 1] === '[') {
        // long string [[...]]
        pos += 2;
        let value = '';
        while (pos < src.length) {
            if (src[pos] === ']' && src[pos + 1] === ']') {
                pos += 2;
                return { value, pos };
            }
            value += src[pos];
            pos++;
        }
        throw new Error(`Unterminated long string at position ${pos}`);
    }
    return null;
}

function parseLuaValue(src, pos) {
    pos = skipWhitespaceAndComments(src, pos);
    if (pos >= src.length) return null;

    // string
    if (src[pos] === '"' || (src[pos] === '[' && src[pos + 1] === '[')) {
        return parseLuaString(src, pos);
    }

    // table
    if (src[pos] === '{') {
        return parseLuaTable(src, pos);
    }

    // number
    if (src[pos] >= '0' && src[pos] <= '9') {
        let numStr = '';
        while (pos < src.length && /[\d.]/.test(src[pos])) {
            numStr += src[pos];
            pos++;
        }
        return { value: Number(numStr), pos };
    }

    // boolean/keyword
    if (src.startsWith('true', pos)) {
        return { value: true, pos: pos + 4 };
    }
    if (src.startsWith('false', pos)) {
        return { value: false, pos: pos + 5 };
    }

    return null;
}

function parseLuaTable(src, pos) {
    if (src[pos] !== '{') return null;
    pos++; // skip {

    const table = {};
    const array = [];
    let arrayIndex = 1;
    let isArray = true;

    while (true) {
        pos = skipWhitespaceAndComments(src, pos);
        if (pos >= src.length) throw new Error('Unterminated table');
        if (src[pos] === '}') {
            pos++;
            break;
        }

        // Try key = value
        const keyStart = pos;
        let key = null;

        // Identifier key
        if (/[a-zA-Z_]/.test(src[pos])) {
            let ident = '';
            while (pos < src.length && /[a-zA-Z0-9_]/.test(src[pos])) {
                ident += src[pos];
                pos++;
            }
            pos = skipWhitespaceAndComments(src, pos);
            if (src[pos] === '=') {
                key = ident;
                pos++; // skip =
                isArray = false;
            } else {
                // Not a key=value, reset and try as array element
                // But identifiers that aren't keys are not valid values
                // in quest.lua context.  Could be 'true'/'false'.
                pos = keyStart;
            }
        }

        if (key !== null) {
            const result = parseLuaValue(src, pos);
            if (!result) throw new Error(`No value at pos ${pos}`);
            table[key] = result.value;
            pos = result.pos;
        } else {
            // Array element (string)
            const result = parseLuaValue(src, pos);
            if (!result) throw new Error(`No value at pos ${pos}`);
            array.push(result.value);
            pos = result.pos;
        }

        pos = skipWhitespaceAndComments(src, pos);
        if (src[pos] === ',') pos++;
    }

    if (array.length > 0 && Object.keys(table).length === 0) {
        return { value: array, pos };
    }
    if (array.length > 0) {
        // Mixed: put array elements into table with numeric keys.
        // quest.lua uses this for discourage/encourage arrays that also
        // have text/synopsis fields, but those are separate entries.
        // Actually, quest.lua arrays don't mix with named keys in the
        // same table.  The array-style tables ARE the value for keys
        // like "discourage".
        table._array = array;
    }
    return { value: table, pos };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const src = readFileSync(SOURCE_PATH, 'utf8');

// Find "questtext = {" and parse the top-level table.
const questtextMatch = src.indexOf('questtext = {');
if (questtextMatch === -1) throw new Error('questtext table not found');
const result = parseLuaTable(src, questtextMatch + 'questtext = '.length);
const questtext = result.value;

// Extract needed messages for each role.
const output = {};
for (const section of ROLE_SECTIONS) {
    const roleData = questtext[section];
    if (!roleData) {
        console.warn(`Warning: section ${section} not found`);
        continue;
    }
    const roleOutput = {};
    for (const msgid of NEEDED_MESSAGES) {
        const entry = roleData[msgid];
        if (!entry) continue;

        if (typeof entry === 'string') {
            roleOutput[msgid] = { text: entry };
        } else if (Array.isArray(entry)) {
            roleOutput[msgid] = { choices: entry };
        } else if (typeof entry === 'object') {
            const record = {};
            if (entry.text !== undefined) record.text = entry.text;
            if (entry.output !== undefined) record.output = entry.output;
            if (entry.synopsis !== undefined) record.synopsis = entry.synopsis;
            if (Array.isArray(entry._array)) record.choices = entry._array;
            roleOutput[msgid] = record;
        }
    }
    if (Object.keys(roleOutput).length > 0) {
        output[section] = roleOutput;
    }
}

// Also extract msg_fallbacks
if (questtext.msg_fallbacks) {
    output._fallbacks = questtext.msg_fallbacks;
}

// Generate JS module.
const lines = [
    '// Generated by scripts/generate-quest-text.mjs from dat/quest.lua.',
    '// Do not edit by hand.  Rerun the script to update.',
    '//',
    '// C ref: questpgr.c com_pager_core().  Each entry maps a message ID to',
    '// its text, optional output mode, and optional synopsis.  For messages',
    '// with multiple variants (arrays), com_pager_core() picks one at random',
    '// via rn2(nelems).',
    '',
    '// eslint-disable-next-line no-unused-vars',
    `export const QUEST_TEXT = ${JSON.stringify(output, null, 4)};`,
    '',
    `export const QUEST_TEXT_FALLBACKS = ${JSON.stringify(output._fallbacks || {}, null, 4)};`,
    '',
];

writeFileSync(OUTPUT_PATH, lines.join('\n'));
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`Sections: ${Object.keys(output).filter(k => k !== '_fallbacks').join(', ')}`);
for (const [section, msgs] of Object.entries(output)) {
    if (section === '_fallbacks') continue;
    console.log(`  ${section}: ${Object.keys(msgs).join(', ')}`);
}
