#!/usr/bin/env node

// Generate the glyph-number offsets. include/display.h's `enum glyph_offsets`
// partitions one integer space into the ranges display.c reset_glyphmap()
// walks -- monsters, pets, invisible, detected, bodies, ridden, objects, cmap,
// zaps, swallow, explosions, warnings, statues, the four piletop families, and
// the two singletons -- and every arm of that chain is a subtraction of one of
// these offsets. Each member is an arithmetic expression over the counts and
// defsym indices that decide how wide each range is, so a change to NUMMONS or
// to defsym.h moves every offset above it.
//
// The expressions are emitted as expressions rather than as numbers, and every
// identifier they name is imported from the js/ module that owns it, so a
// count that drifts breaks the import or changes the offsets rather than
// leaving a stale literal behind. The offsets themselves are therefore never
// written down anywhere in this repository.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const SOURCE_PATH = join(UPSTREAM_ROOT, 'include', 'display.h');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'glyph_offsets.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';

// Where each identifier the enum names is exported from. An identifier that no
// listed module exports fails generation rather than the import, which is what
// caught NUM_ZAP, S_digbeam and S_goodpos as the three inputs js/ lacked.
// NUM_ZAP is display.h's own #define and is emitted below, so it is resolved
// from this file rather than looked up.
const CONSTANT_MODULES = [
    { path: join(PROJECT_ROOT, 'js', 'const.js'), specifier: './const.js' },
    { path: join(PROJECT_ROOT, 'js', 'monsters.js'), specifier: './monsters.js' },
    { path: join(PROJECT_ROOT, 'js', 'objects.js'), specifier: './objects.js' },
    { path: join(PROJECT_ROOT, 'js', 'symbols.js'), specifier: './symbols.js' },
];

const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > (checkOnly ? 3 : 2))
    throw new Error('usage: generate-glyph-offsets.mjs [--check]');

// Replace every comment with a single space so that a comment between two
// tokens cannot join them. display.h holds no string literal inside the enum,
// so quotes need no special handling here.
function stripComments(source) {
    let out = '';
    for (let i = 0; i < source.length;) {
        const two = source.slice(i, i + 2);
        if (two === '/*') {
            const end = source.indexOf('*/', i + 2);
            if (end < 0) throw new Error('unterminated block comment');
            out += ' ';
            i = end + 2;
        } else if (two === '//') {
            const end = source.indexOf('\n', i);
            out += ' ';
            i = end < 0 ? source.length : end;
        } else {
            out += source[i];
            i += 1;
        }
    }
    return out;
}

function enumBody(source) {
    const start = source.indexOf('enum glyph_offsets');
    if (start < 0) throw new Error('display.h holds no enum glyph_offsets');
    const open = source.indexOf('{', start);
    const close = source.indexOf('}', open);
    if (open < 0 || close < 0)
        throw new Error('enum glyph_offsets is not braced');
    return source.slice(open + 1, close);
}

// One member per comma-separated field. A member is either `NAME = expr` or a
// bare `NAME`, which C values as one past the member before it.
function parseMembers(body) {
    const members = [];
    for (const field of body.split(',')) {
        const text = field.trim();
        if (!text) continue;
        const equals = text.indexOf('=');
        if (equals < 0) {
            if (!/^\w+$/u.test(text))
                throw new Error(`unparsed enum member: ${text}`);
            const previous = members.at(-1);
            if (!previous)
                throw new Error(`${text} has no member before it to follow`);
            members.push({
                name: text,
                expression: `${previous.name} + 1`,
                implicit: true,
            });
            continue;
        }
        const name = text.slice(0, equals).trim();
        const expression = text.slice(equals + 1).trim().replace(/\s+/gu, ' ');
        if (!/^\w+$/u.test(name) || !expression)
            throw new Error(`unparsed enum member: ${text}`);
        members.push({ name, expression, implicit: false });
    }
    return members;
}

// display.h's own `#define NUM_ZAP 8`, the count that sizes the zap range.
function parseNumZap(source) {
    // stripComments() leaves the trailing comment as a space, so the line does
    // not end at the number.
    const match = /^#define NUM_ZAP (\d+)\s*$/mu.exec(source);
    if (!match) throw new Error('display.h holds no #define NUM_ZAP');
    return Number(match[1]);
}

function exportedNames(path) {
    const source = readFileSync(path, 'utf8');
    const names = new Set();
    for (const match of source.matchAll(/^export const (\w+)/gmu))
        names.add(match[1]);
    return names;
}

// Every identifier an expression names that the enum does not define itself.
function freeIdentifiers(members) {
    const defined = new Set(members.map(({ name }) => name));
    const free = new Set();
    for (const { expression } of members) {
        for (const match of expression.matchAll(/[A-Za-z_]\w*/gu)) {
            if (!defined.has(match[0])) free.add(match[0]);
        }
    }
    return free;
}

function importPlan(identifiers, selfDefined) {
    const available = CONSTANT_MODULES.map(({ path, specifier }) => ({
        specifier,
        names: exportedNames(path),
    }));
    const plan = new Map(available.map(({ specifier }) => [specifier, []]));
    for (const name of [...identifiers].sort()) {
        if (selfDefined.has(name)) continue;
        const owner = available.find((module) => module.names.has(name));
        if (!owner) throw new Error(`no js/ module exports ${name}`);
        plan.get(owner.specifier).push(name);
    }
    return plan;
}

function generatedSource(members, numZap) {
    const plan = importPlan(freeIdentifiers(members), new Set(['NUM_ZAP']));
    const imports = [...plan.entries()]
        .filter(([, names]) => names.length)
        .map(([specifier, names]) => (
            `import {\n${names.map((name) => `    ${name},`).join('\n')}\n} from '${specifier}';`
        ))
        .join('\n');
    const lines = members.map(({ name, expression, implicit }) => (
        implicit
            ? `// One past the last range, which is C's value for a bare final member.\nexport const ${name} = ${expression};`
            : `export const ${name} = ${expression};`
    )).join('\n');
    return `// GENERATED FILE - do not edit.
// Regenerate with: node scripts/generate-glyph-offsets.mjs
// Source: nethack-c/upstream/include/display.h at ${PINNED_REVISION}.
//
// display.h enum glyph_offsets, in source order, plus the NUM_ZAP it reads.
// Each offset is the first glyph number of one range; the range runs to the
// offset below it in this list, which is why the members are chained rather
// than written as literals. display.c reset_glyphmap() walks the chain
// downwards, subtracting each offset in turn, so the order here is the order
// its arms must be tested in.

${imports}

// display.h:359. The number of zap beam types; four cmap symbols per type.
export const NUM_ZAP = ${numZap};

${lines}
`;
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

const source = stripComments(readFileSync(SOURCE_PATH, 'utf8'));
const members = parseMembers(enumBody(source));
// The chain is only a chain if every member but the first names the one above
// it; a member that stopped doing so would silently detach its whole range.
if (members[0].name !== 'GLYPH_MON_OFF' || members[0].expression !== '0')
    throw new Error('enum glyph_offsets no longer starts at GLYPH_MON_OFF = 0');
for (const [index, member] of members.entries()) {
    if (!index) continue;
    const names = [...member.expression.matchAll(/[A-Za-z_]\w*/gu)]
        .map((match) => match[0]);
    if (!names.some((name) => name.startsWith('GLYPH_')))
        throw new Error(`${member.name} names no offset before it`);
}
const output = generatedSource(members, parseNumZap(source));
if (checkOnly) {
    let existing = '';
    try {
        existing = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
        // The comparison below reports the missing generated file.
    }
    if (existing !== output) {
        console.error('js/glyph_offsets.js is stale; run node scripts/generate-glyph-offsets.mjs');
        process.exitCode = 1;
    }
} else {
    writeFileSync(OUTPUT_PATH, output);
}
