#!/usr/bin/env node

// Generate the complete questtext table from dat/quest.lua.
// C ref: questpgr.c com_pager_core() loads the whole Lua program and looks up
// questtext[section][msgid], including common pager messages and role text.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const SOURCE_PATH = join(UPSTREAM_ROOT, 'dat', 'quest.lua');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'quest_text_data.js');

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

    if (array.length > 0) {
        if (Object.keys(table).length > 0) {
            throw new Error('Mixed keyed and array values are unsupported in quest.lua');
        }
        return { value: array, pos };
    }
    return { value: table, pos };
}

// ---------------------------------------------------------------------------
// The Lua file is one assignment surrounded by comments and whitespace. This
// parser rejects any executable prefix or suffix rather than silently
// generating data from only part of the program.
// ---------------------------------------------------------------------------

export function parseQuestText(src) {
    const assignmentStart = skipWhitespaceAndComments(src, 0);
    const assignment = /^questtext\s*=\s*/u.exec(src.slice(assignmentStart));
    if (!assignment) throw new Error('questtext assignment not found');

    const tableStart = assignmentStart + assignment[0].length;
    const result = parseLuaTable(src, tableStart);
    if (!result) throw new Error('questtext is not a Lua table');

    const sourceEnd = skipWhitespaceAndComments(src, result.pos);
    if (sourceEnd !== src.length)
        throw new Error(`Unexpected top-level Lua code at position ${sourceEnd}`);
    if (!result.value || Array.isArray(result.value)
        || typeof result.value !== 'object')
        throw new Error('questtext must be a keyed Lua table');

    return result.value;
}

function renderModule(questtext) {
    return [
        '// Generated by scripts/generate-quest-text.mjs from dat/quest.lua.',
        '// Do not edit by hand. Rerun the script to update.',
        '//',
        '// C ref: questpgr.c com_pager_core() looks up the raw Lua table.',
        '// Keep array values in Lua order; the pager chooses a variant when',
        '// the selected message has no text field.',
        '',
        `export const QUEST_TEXT_DATA = ${JSON.stringify(questtext, null, 4)};`,
        '',
        '// Role-section view for existing quest callers; entries reference',
        '// the one generated table above rather than copying its messages.',
        'export const QUEST_TEXT = Object.fromEntries(',
        '    Object.entries(QUEST_TEXT_DATA).filter(([section]) =>',
        "        section !== 'common' && section !== 'msg_fallbacks'),",
        ');',
        '',
        '// This export is an alias of the single generated fallback table.',
        'export const QUEST_TEXT_FALLBACKS = QUEST_TEXT_DATA.msg_fallbacks;',
        '',
    ].join('\n');
}

function main() {
    const src = readFileSync(SOURCE_PATH, 'utf8');
    const questtext = parseQuestText(src);
    const generated = renderModule(questtext);

    if (process.argv.includes('--check')) {
        const current = readFileSync(OUTPUT_PATH, 'utf8');
        if (current !== generated)
            throw new Error(`${OUTPUT_PATH} differs from generated quest text`);
        console.log(`Checked ${OUTPUT_PATH}`);
    } else {
        writeFileSync(OUTPUT_PATH, generated);
        console.log(`Wrote ${OUTPUT_PATH}`);
    }
    console.log(`Sections: ${Object.keys(questtext).join(', ')}`);
}

if (process.argv[1]
    && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main();
}
