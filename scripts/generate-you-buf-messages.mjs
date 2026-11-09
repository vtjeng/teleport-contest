#!/usr/bin/env node

// Generate js/you_buf_messages_data.js: for each pline.c You()-family
// function, the formats without '%' that its calls pass.
//
// pline.c You(), Your(), You_cant(), pline_The(), There(), You_feel(),
// You_hear() and You_see() build "prefix + format" in the shared buffer
// gy.you_buf and pass it to vpline(). When that text has no '%', vpline()
// prints the buffer itself rather than a formatted copy, after its
// vision_recalc() may have run notice_mon()'s You("%s %s.", ...) into the
// same buffer. js/tty_message.js needs these formats to know which messages
// read the buffer late. The table keeps formats, not whole texts, so that
// js/pline.js stays the one owner of the You_feel(), You_hear() and You_see()
// prefixes (scripts/you-feel-literal.mjs, scripts/you-see-prefix.test.mjs).
//
// A format whose text some other string literal in the C source also spells
// exactly is left out, because the port could not tell the two calls apart.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = join(PROJECT_ROOT, 'nethack-c', 'upstream', 'src');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'you_buf_messages_data.js');

// pline.c's YouPrefix() prefixes, one entry per branch of each function.
export const YOU_BUF_PREFIXES = Object.freeze({
    You: ['You '],
    Your: ['Your '],
    You_cant: ["You can't "],
    pline_The: ['The '],
    There: ['There '],
    You_feel: ['You feel ', 'You dream that you feel '],
    You_hear: ['You barely hear ', 'You dream that you hear ', 'You hear '],
    You_see: ['You dream that you see ', 'You sense ', 'You see '],
});

const ESCAPES = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'", '?': '?' };

// Tokens: { type: 'str' | 'id' | 'punct', value }. Comments, preprocessor
// lines and character literals are dropped.
export function tokenize(source) {
    const tokens = [];
    let i = 0;
    let lineStart = true;
    while (i < source.length) {
        const c = source[i];
        if (c === '\n') { lineStart = true; ++i; continue; }
        if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { ++i; continue; }
        if (lineStart && c === '#') {
            // A preprocessor directive, with backslash continuations.
            while (i < source.length && source[i] !== '\n') {
                if (source[i] === '\\' && source[i + 1] === '\n') i += 2;
                else ++i;
            }
            continue;
        }
        lineStart = false;
        if (c === '/' && source[i + 1] === '*') {
            const end = source.indexOf('*/', i + 2);
            i = end < 0 ? source.length : end + 2;
            continue;
        }
        if (c === '/' && source[i + 1] === '/') {
            while (i < source.length && source[i] !== '\n') ++i;
            continue;
        }
        if (c === '"' || c === "'") {
            let value = '';
            ++i;
            while (i < source.length && source[i] !== c) {
                if (source[i] === '\\') {
                    const e = source[i + 1];
                    const octal = /^[0-7]{1,3}/u.exec(source.slice(i + 1, i + 4));
                    const hex = /^x[0-9A-Fa-f]+/u.exec(source.slice(i + 1, i + 12));
                    if (e === '\n') {
                        // A backslash-newline continues the literal.
                        i += 2;
                    } else if (octal) {
                        value += String.fromCharCode(parseInt(octal[0], 8));
                        i += 1 + octal[0].length;
                    } else if (hex) {
                        value += String.fromCharCode(parseInt(hex[0].slice(1), 16));
                        i += 1 + hex[0].length;
                    } else if (e in ESCAPES) {
                        value += ESCAPES[e];
                        i += 2;
                    } else {
                        throw new Error(`unhandled escape \\${e} near ${source.slice(i - 20, i + 20)}`);
                    }
                } else {
                    value += source[i++];
                }
            }
            ++i;
            if (c === '"') tokens.push({ type: 'str', value });
            continue;
        }
        if (/[A-Za-z_]/u.test(c)) {
            let j = i;
            while (j < source.length && /[A-Za-z0-9_]/u.test(source[j])) ++j;
            tokens.push({ type: 'id', value: source.slice(i, j) });
            i = j;
            continue;
        }
        tokens.push({ type: 'punct', value: c });
        ++i;
    }
    return tokens;
}

// Adjacent string literals concatenate, as in C.
function literalGroups(tokens) {
    const groups = [];
    for (let i = 0; i < tokens.length; ++i) {
        if (tokens[i].type !== 'str') continue;
        let value = '';
        while (i < tokens.length && tokens[i].type === 'str') value += tokens[i++].value;
        groups.push(value);
        --i;
    }
    return groups;
}

// The string-literal formats a call's first argument can evaluate to: the
// literal groups at that argument's own parenthesis level, which covers a
// plain literal and a conditional between literals, and leaves out literals
// passed to a nested call.
function firstArgumentFormats(tokens, open) {
    const formats = [];
    let depth = 0;
    let group = null;
    for (let i = open + 1; i < tokens.length; ++i) {
        const t = tokens[i];
        if (t.type === 'punct' && (t.value === '(' || t.value === '[')) ++depth;
        else if (t.type === 'punct' && (t.value === ')' || t.value === ']')) {
            if (depth === 0) break;
            --depth;
        } else if (depth === 0 && t.type === 'punct' && t.value === ',') break;
        if (depth === 0 && t.type === 'str') {
            group = (group ?? '') + t.value;
            continue;
        }
        if (group !== null) formats.push(group);
        group = null;
    }
    if (group !== null) formats.push(group);
    return formats;
}

// Answers, for each You()-family function, the formats without '%' its
// calls pass; a format some prefix of which makes a text that another
// literal spells exactly is left out.
export function collectYouBufFormats(sources) {
    const candidates = Object.fromEntries(
        Object.keys(YOU_BUF_PREFIXES).map((fn) => [fn, new Set()]));
    const otherLiterals = new Set();
    for (const source of sources) {
        const tokens = tokenize(source);
        const formatTokens = new Set();
        for (let i = 0; i + 1 < tokens.length; ++i) {
            const t = tokens[i];
            if (t.type !== 'id' || !Object.hasOwn(YOU_BUF_PREFIXES, t.value)) continue;
            if (tokens[i + 1].value !== '(') continue;
            // Skip pline.c's own definitions and prototypes.
            if (tokens[i + 2]?.value === 'const') continue;
            for (const format of firstArgumentFormats(tokens, i + 1))
                if (!format.includes('%')) candidates[t.value].add(format);
            // Mark this call's own first-argument literals so they are not
            // counted as other literals below.
            let depth = 0;
            for (let j = i + 2; j < tokens.length; ++j) {
                const u = tokens[j];
                if (u.value === '(' || u.value === '[') ++depth;
                else if (u.value === ')' || u.value === ']') { if (!depth--) break; }
                else if (!depth && u.value === ',') break;
                if (!depth && u.type === 'str') formatTokens.add(j);
            }
        }
        const rest = tokens.map((t, j) => (formatTokens.has(j) ? { type: 'punct', value: ';' } : t));
        for (const literal of literalGroups(rest)) otherLiterals.add(literal);
    }
    return Object.fromEntries(Object.entries(candidates).map(([fn, formats]) => [
        fn,
        [...formats].filter((format) => !YOU_BUF_PREFIXES[fn]
            .some((prefix) => otherLiterals.has(prefix + format))).sort(),
    ]));
}

export function readSources(dir = SOURCE_DIR) {
    return readdirSync(dir).filter((name) => name.endsWith('.c')).sort()
        .map((name) => readFileSync(join(dir, name), 'utf8'));
}

export function renderYouBufFormats(formats) {
    return [
        '// Generated by scripts/generate-you-buf-messages.mjs from',
        '// nethack-c/upstream/src/*.c; do not edit.',
        '//',
        "// For each pline.c You()-family function, every format without '%' that",
        '// a call passes it; vpline() prints such a message from gy.you_buf itself',
        '// (see js/tty_message.js).',
        'export const YOU_BUF_FORMATS = Object.freeze({',
        ...Object.entries(formats).flatMap(([fn, list]) => [
            `    ${fn}: new Set([`,
            ...list.map((format) => `        ${JSON.stringify(format)},`),
            '    ]),',
        ]),
        '});',
        '',
    ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    writeFileSync(OUTPUT_PATH, renderYouBufFormats(collectYouBufFormats(readSources())));
}
