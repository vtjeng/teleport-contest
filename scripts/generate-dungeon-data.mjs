#!/usr/bin/env node

// Generate js/dungeon_data.js from the declarative Lua subset used by
// dat/dungeon.lua. This is intentionally a data parser, not a Lua evaluator.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const SOURCE_PATH = path.join(ROOT, 'nethack-c', 'upstream', 'dat', 'dungeon.lua');
const OUTPUT_PATH = path.join(ROOT, 'js', 'dungeon_data.js');

function tokenize(source) {
    const tokens = [];
    let offset = 0;

    while (offset < source.length) {
        const character = source[offset];
        if (/\s/u.test(character)) {
            ++offset;
            continue;
        }
        if (source.startsWith('--', offset)) {
            const newline = source.indexOf('\n', offset + 2);
            offset = newline === -1 ? source.length : newline + 1;
            continue;
        }
        if ('{},='.includes(character)) {
            tokens.push({ type: character, value: character, offset });
            ++offset;
            continue;
        }
        if (character === '"') {
            const start = offset++;
            let escaped = false;
            while (offset < source.length) {
                const current = source[offset++];
                if (!escaped && current === '"')
                    break;
                if (!escaped && current === '\\')
                    escaped = true;
                else
                    escaped = false;
            }
            const literal = source.slice(start, offset);
            if (!literal.endsWith('"'))
                throw new SyntaxError(`unterminated string at byte ${start}`);
            tokens.push({
                type: 'string',
                value: JSON.parse(literal),
                offset: start,
            });
            continue;
        }
        const number = source.slice(offset).match(/^-?\d+/u);
        if (number) {
            tokens.push({
                type: 'number',
                value: Number(number[0]),
                offset,
            });
            offset += number[0].length;
            continue;
        }
        const identifier = source.slice(offset).match(/^[A-Za-z_][A-Za-z0-9_]*/u);
        if (identifier) {
            tokens.push({
                type: 'identifier',
                value: identifier[0],
                offset,
            });
            offset += identifier[0].length;
            continue;
        }
        throw new SyntaxError(`unsupported Lua token at byte ${offset}`);
    }
    return tokens;
}

export function parseDungeonSource(source) {
    const tokens = tokenize(source);
    let index = 0;

    function peek(distance = 0) {
        return tokens[index + distance];
    }

    function consume(type, value = undefined) {
        const token = tokens[index];
        if (!token
            || token.type !== type
            || (value !== undefined && token.value !== value)) {
            const expected = value === undefined ? type : `${type} ${value}`;
            const actual = token ? `${token.type} ${token.value}` : 'end of file';
            throw new SyntaxError(`expected ${expected}, found ${actual}`);
        }
        ++index;
        return token.value;
    }

    function parseValue() {
        const token = peek();
        if (!token)
            throw new SyntaxError('expected Lua value, found end of file');
        if (token.type === 'string' || token.type === 'number') {
            ++index;
            return token.value;
        }
        if (token.type === '{')
            return parseTable();
        if (token.type === 'identifier') {
            ++index;
            if (token.value === 'true') return true;
            if (token.value === 'false') return false;
            if (token.value === 'nil') return null;
        }
        throw new SyntaxError(`unsupported Lua value at byte ${token.offset}`);
    }

    function parseTable() {
        consume('{');
        const keyedEntries = [];
        const arrayEntries = [];
        while (peek()?.type !== '}') {
            if (!peek())
                throw new SyntaxError('unterminated Lua table');
            if (peek().type === 'identifier' && peek(1)?.type === '=') {
                const key = consume('identifier');
                consume('=');
                keyedEntries.push([key, parseValue()]);
            } else {
                arrayEntries.push(parseValue());
            }
            if (peek()?.type === ',')
                consume(',');
            else if (peek()?.type !== '}')
                throw new SyntaxError('expected comma or closing brace');
        }
        consume('}');

        if (keyedEntries.length && arrayEntries.length)
            throw new SyntaxError('mixed keyed and array Lua table');
        if (arrayEntries.length)
            return arrayEntries;

        const result = {};
        for (const [key, value] of keyedEntries) {
            if (Object.hasOwn(result, key))
                throw new SyntaxError(`duplicate Lua table key ${key}`);
            result[key] = value;
        }
        return result;
    }

    consume('identifier', 'dungeon');
    consume('=');
    const data = parseTable();
    if (index !== tokens.length)
        throw new SyntaxError(`unexpected token ${peek().value} after dungeon table`);
    return data;
}

export function renderDungeonData(data) {
    return `// Generated by scripts/generate-dungeon-data.mjs from\n`
        + `// nethack-c/upstream/dat/dungeon.lua. Do not edit by hand.\n\n`
        + `export const DUNGEON_DATA = ${JSON.stringify(data, null, 4)};\n`;
}

async function main() {
    const unknown = process.argv.slice(2).filter((argument) => argument !== '--check');
    if (unknown.length)
        throw new Error(`unknown argument: ${unknown[0]}`);

    const source = await fs.readFile(SOURCE_PATH, 'utf8');
    const rendered = renderDungeonData(parseDungeonSource(source));
    if (process.argv.includes('--check')) {
        const current = await fs.readFile(OUTPUT_PATH, 'utf8');
        if (current !== rendered) {
            process.stderr.write('js/dungeon_data.js is stale; run the generator\n');
            process.exitCode = 1;
        }
        return;
    }
    await fs.writeFile(OUTPUT_PATH, rendered);
}

if (process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    await main();
}
