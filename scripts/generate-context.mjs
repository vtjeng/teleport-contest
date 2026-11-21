#!/usr/bin/env node

// Generate js/context.js from include/context.h: one function per struct that
// returns a new object holding every field of that struct at C's zero value.
//
// C zero-initializes svc.context (decl.c declares it without an initializer),
// so a field that no code has written yet reads as 0, FALSE or NULL. The port
// once created state.context with a handful of fields and let the rest appear
// when first written; a field read before then was `undefined`, which is not
// `=== 0`, not `< 1` and not a number after `++`. Deriving the startup object
// from the header gives every field its zero value from the first turn, and
// the --check mode fails when the header and the generated file disagree.
//
// Zero values: 0 for an integer or a Bitfield, false for a boolean, null for
// a pointer, '' for a char array that holds text, an array of zeros for any
// other array, and a nested object for an embedded struct or for coord.h's
// coord and dungeon.h's d_level. BYTE_ARRAYS names the char arrays the port
// holds as arrays of byte values instead of strings.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const INCLUDE = join(UPSTREAM_ROOT, 'include');
export const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'context.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';

// The headers that define context_info and the typedef'd structs it embeds.
const HEADERS = ['context.h', 'coord.h', 'dungeon.h'];
// context.h's CONTEXTVERBSZ and global.h's BUFSZ size its char arrays.
const ARRAY_SIZES = { CONTEXTVERBSZ: 30, BUFSZ: 256 };

// js/music.js holds the hero's jingle as the byte values of its five notes
// and terminator, which it compares and renders one at a time.
const BYTE_ARRAYS = new Set(['context_info.jingle']);

const INTEGER_TYPES = new Set([
    'int', 'unsigned', 'unsigned int', 'long', 'unsigned long', 'short',
    'schar', 'xint8', 'xint16', 'coordxy', 'size_t', 'char',
]);

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/.*$/gmu, '');
}

// Every `struct name { ... };` and `typedef struct tag { ... } name;` in the
// source, as a map from name to the unparsed body.
export function parseStructs(source) {
    const text = stripComments(source);
    const structs = new Map();
    const block = /(typedef\s+)?struct\s+(\w+)\s*\{([^{}]*)\}\s*(\w+)?\s*;/gu;
    for (const match of text.matchAll(block)) {
        const name = match[1] ? match[4] : match[2];
        structs.set(name, match[3]);
    }
    return structs;
}

function parseFields(body, structName) {
    const fields = [];
    for (const raw of body.split(';')) {
        const decl = raw.replace(/\s+/gu, ' ').trim();
        if (!decl) continue;
        const bitfield = /^Bitfield\((\w+), ?(\d+)\)$/u.exec(decl);
        if (bitfield) {
            fields.push({
                name: bitfield[1], ctype: `Bitfield(${bitfield[2]})`,
                pointer: false, length: null,
            });
            continue;
        }
        const head = /^((?:struct |unsigned |const )*\w+)\s+(.*)$/u.exec(decl);
        if (!head) throw new Error(`${structName}: cannot read "${decl}"`);
        let ctype = head[1];
        let rest = head[2];
        // `unsigned long`, `unsigned int`: the second word is part of the type.
        const second = /^(long|int)\b\s*(.*)$/u.exec(rest);
        if (ctype === 'unsigned' && second) {
            ctype = `unsigned ${second[1]}`;
            rest = second[2];
        }
        for (const part of rest.split(',')) {
            const declarator = /^\s*(\*?)\s*(\w+)\s*(?:\[([^\]]+)\])?\s*$/u.exec(part);
            if (!declarator) throw new Error(`${structName}: cannot read "${part}"`);
            fields.push({
                name: declarator[2],
                ctype,
                pointer: declarator[1] === '*',
                length: declarator[3] === undefined
                    ? null : arrayLength(declarator[3], structName),
            });
        }
    }
    return fields;
}

function arrayLength(expression, structName) {
    const value = expression.replace(/[A-Z_]+/gu, (word) => {
        if (!(word in ARRAY_SIZES))
            throw new Error(`${structName}: unknown array size ${word}`);
        return String(ARRAY_SIZES[word]);
    });
    if (!/^[\d +]+$/u.test(value))
        throw new Error(`${structName}: cannot size [${expression}]`);
    return value.split('+').reduce((sum, term) => sum + Number(term), 0);
}

// The struct a field embeds, or null for a scalar, pointer or array.
function embeddedStruct(field, structs) {
    if (field.pointer || field.length !== null) return null;
    const name = field.ctype.replace(/^struct /u, '');
    return structs.has(name) ? name : null;
}

// The JavaScript zero value of one field, as source text.
function zeroValue(structName, field, structs) {
    const qualified = `${structName}.${field.name}`;
    if (field.pointer) return 'null';
    if (field.length !== null) {
        if (field.ctype === 'char' && !BYTE_ARRAYS.has(qualified)) return "''";
        return `Array(${field.length}).fill(0)`;
    }
    const nested = embeddedStruct(field, structs);
    if (nested) return `zero_${nested}()`;
    if (field.ctype === 'boolean') return 'false';
    if (field.ctype.startsWith('Bitfield') || INTEGER_TYPES.has(field.ctype))
        return '0';
    throw new Error(`${qualified}: no zero value for C type ${field.ctype}`);
}

// context_info and every struct it embeds, each after the ones it uses.
export function contextStructs(sources) {
    const bodies = new Map();
    for (const source of sources)
        for (const [name, body] of parseStructs(source)) bodies.set(name, body);
    // A struct is parsed only when context_info reaches it, so an unrelated
    // declaration in dungeon.h that this reader cannot follow does no harm.
    const structs = new Map();
    for (const name of bodies.keys()) structs.set(name, null);
    const ordered = [];
    const visit = (name) => {
        if (ordered.includes(name)) return;
        if (!bodies.has(name)) throw new Error(`no definition of struct ${name}`);
        const fields = parseFields(bodies.get(name), name);
        structs.set(name, fields);
        for (const field of fields) {
            const nested = embeddedStruct(field, structs);
            if (nested) visit(nested);
        }
        ordered.push(name);
    };
    visit('context_info');
    return { structs, ordered };
}

function cType(field) {
    const pointer = field.pointer ? ' *' : '';
    const array = field.length === null ? '' : `[${field.length}]`;
    return `${field.ctype}${pointer}${array}`;
}

export function renderContext(sources) {
    const { structs, ordered } = contextStructs(sources);
    const functions = ordered.map((name) => {
        const rows = structs.get(name).map((field) => (
            `        ${field.name}: ${zeroValue(name, field, structs)}, // ${cType(field)}`
        ));
        return `export function zero_${name}() {\n    return {\n${rows.join('\n')}\n    };\n}\n`;
    });
    const table = ordered.map((name) => {
        const rows = structs.get(name).map((field) => {
            const nested = embeddedStruct(field, structs);
            return `        [${JSON.stringify(field.name)}, ${JSON.stringify(cType(field))}`
                + `${nested ? `, ${JSON.stringify(nested)}` : ''}],`;
        });
        return `    ${name}: [\n${rows.join('\n')}\n    ],`;
    });
    return '// Generated by scripts/generate-context.mjs; do not edit.\n'
        + `// Source: NetHack 5.0 include/context.h, coord.h and dungeon.h at\n`
        + `// ${PINNED_REVISION}.\n`
        + '//\n'
        + '// C zero-initializes svc.context. Each zero_<struct>() returns a new\n'
        + '// object holding every field of that struct at C\'s zero value, and\n'
        + '// js/jsmain.js creates state.context from zero_context_info().\n\n'
        + functions.join('\n')
        + '\n// Each struct\'s fields in declaration order: [name, C type] and, for\n'
        + '// an embedded struct, the name of its struct.\n'
        + `export const CONTEXT_STRUCTS = {\n${table.join('\n')}\n};\n`;
}

export function readHeaders() {
    return HEADERS.map((name) => readFileSync(join(INCLUDE, name), 'utf8'));
}

function assertPinnedSource() {
    const actualRevision = execFileSync(
        'git', ['-C', UPSTREAM_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
    ).trim();
    if (actualRevision !== PINNED_REVISION) {
        throw new Error(
            `expected NetHack source ${PINNED_REVISION}; found ${actualRevision}`,
        );
    }
}

function main() {
    const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
    if (process.argv.length > (checkOnly ? 3 : 2))
        throw new Error('Usage: node scripts/generate-context.mjs [--check]');
    assertPinnedSource();
    const output = renderContext(readHeaders());
    if (checkOnly) {
        let existing = '';
        try {
            existing = readFileSync(OUTPUT_PATH, 'utf8');
        } catch {
            // The comparison below reports a missing generated file.
        }
        if (existing !== output) {
            console.error('js/context.js is stale; run node scripts/generate-context.mjs');
            process.exitCode = 1;
        }
    } else {
        writeFileSync(OUTPUT_PATH, output);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
