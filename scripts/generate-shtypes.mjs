#!/usr/bin/env node

// Generate the shop-type table. shknam.c's shtypes[] is the catalog that
// mkroom.c mkshop() rolls against and that shknam.c stock_room(), shkinit()
// and nameshk() read afterwards, so the generated file carries every row in
// source order: the shop's names, its identifying object-class symbol, its
// percentage share of the roll, its object-placement type, its item
// probabilities, and its shopkeeper name list.
//
// Everything the table names is emitted as an imported constant rather than a
// number, so a drift in js/objects.js or js/const.js breaks the import instead
// of silently changing a shop's stock.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const SOURCE_PATH = join(UPSTREAM_ROOT, 'src', 'shknam.c');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'shtypes_data.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';

// Every preprocessor condition that appears inside a shopkeeper name list,
// keyed by the exact directive text and resolved against the recorder build.
// All six guard platform ports the recorder is not: sys/unix builds define
// none of them, and include/pcconf.h:36 leaves OVERLAY commented out for the
// only compilers that ever set it. An unlisted directive throws instead of
// defaulting, so a source change that adds one has to be resolved
// deliberately.
const PREPROCESSOR_CONDITIONS = new Map([
    ['#ifdef OVERLAY', false],
    ['#ifdef WIN32', false],
    ['#ifdef MACOS9', false],
    ['#ifdef AMIGA', false],
    ['#ifdef TOS', false],
    ['#ifdef OS2', false],
    ['#ifdef VMS', false],
]);

// shknam.c:19 defines VEGETARIAN_CLASS as (MAXOCLASSES + 1), the one item type
// in the table that names no object class and no object. It is a sentinel that
// only shknam.c understands, so it is emitted as that expression rather than
// as a number.
const VEGETARIAN_CLASS_EXPRESSION = 'MAXOCLASSES + 1';

// Where each identifier the table names is exported from. The generator checks
// every identifier it emits against these modules, so a name the port has not
// defined fails generation rather than the import.
const CONSTANT_MODULES = [
    { path: join(PROJECT_ROOT, 'js', 'objects.js'), specifier: './objects.js' },
    { path: join(PROJECT_ROOT, 'js', 'const.js'), specifier: './const.js' },
];

const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > (checkOnly ? 3 : 2))
    throw new Error('usage: generate-shtypes.mjs [--check]');

// Replace every comment with a single space so that a comment sitting between
// two tokens cannot join them. String literals are copied through untouched,
// including their escapes, because a name such as "Evad\'kh" holds a quote.
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
        } else if (source[i] === '"' || source[i] === "'") {
            const quote = source[i];
            let j = i + 1;
            while (j < source.length && source[j] !== quote) {
                j += source[j] === '\\' ? 2 : 1;
            }
            if (j >= source.length) throw new Error('unterminated string literal');
            out += source.slice(i, j + 1);
            i = j + 1;
        } else {
            out += source[i];
            i += 1;
        }
    }
    return out;
}

// Resolve the #ifdef regions inside one declaration's body. Only the forms
// shknam.c actually uses are accepted: #ifdef with no #else, closed by #endif.
function resolveConditionals(body) {
    const kept = [];
    const stack = [];
    for (const line of body.split('\n')) {
        const directive = line.trim();
        if (directive.startsWith('#')) {
            if (directive === '#endif') {
                if (!stack.length) throw new Error('#endif without #ifdef');
                stack.pop();
                continue;
            }
            if (!PREPROCESSOR_CONDITIONS.has(directive))
                throw new Error(`unresolved preprocessor directive: ${directive}`);
            stack.push(PREPROCESSOR_CONDITIONS.get(directive));
            continue;
        }
        if (stack.every(Boolean)) kept.push(line);
    }
    if (stack.length) throw new Error('unterminated #ifdef');
    return kept.join('\n');
}

// The text between the brace that follows `opening` and its matching close.
function braceBody(source, opening) {
    const start = source.indexOf(opening);
    if (start < 0) throw new Error(`shknam.c holds no ${opening}`);
    const open = source.indexOf('{', start);
    if (open < 0) throw new Error(`${opening} is followed by no brace`);
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
        if (source[i] === '"') {
            i += 1;
            while (source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
            continue;
        }
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') {
            depth -= 1;
            if (!depth) return source.slice(open + 1, i);
        }
    }
    throw new Error(`${opening} is not closed`);
}

// Split a brace body on the commas at its own depth.
function splitFields(body) {
    const fields = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i += 1) {
        if (body[i] === '"') {
            i += 1;
            while (body[i] !== '"') i += body[i] === '\\' ? 2 : 1;
            continue;
        }
        if (body[i] === '{') depth += 1;
        else if (body[i] === '}') depth -= 1;
        else if (body[i] === ',' && !depth) {
            fields.push(body.slice(start, i));
            start = i + 1;
        }
    }
    fields.push(body.slice(start));
    return fields.map((field) => field.trim()).filter((field) => field !== '');
}

// A C string literal's value. Only the escapes shknam.c uses are accepted.
function stringValue(literal) {
    const text = literal.trim();
    if (!text.startsWith('"') || !text.endsWith('"'))
        throw new Error(`not a string literal: ${literal}`);
    return text.slice(1, -1).replace(/\\(.)/gu, (whole, escaped) => {
        if (escaped === '\\' || escaped === '"' || escaped === "'") return escaped;
        throw new Error(`unsupported escape ${whole}`);
    });
}

function parseNameList(source, listName) {
    const body = resolveConditionals(
        braceBody(source, `static const char *const ${listName}[]`),
    );
    const entries = splitFields(body);
    const terminator = entries.pop();
    if (terminator !== '0')
        throw new Error(`${listName} is not terminated by 0`);
    return entries.map(stringValue);
}

// One shtypes[] item-probability pair. `itype` is an object class when it is
// non-negative and a specific object when it is negative, which is the sign
// test mkshobj_at() makes.
function parseItemProbability(text) {
    const [iprob, itype] = splitFields(braceBody(`x${text}`, 'x'));
    return { iprob: Number(iprob), itype };
}

function parseShopEntries(source) {
    const body = braceBody(source, 'const struct shclass shtypes[]');
    const rows = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < body.length; i += 1) {
        if (body[i] === '"') {
            i += 1;
            while (body[i] !== '"') i += body[i] === '\\' ? 2 : 1;
            continue;
        }
        if (body[i] === '{') {
            if (!depth) start = i;
            depth += 1;
        } else if (body[i] === '}') {
            depth -= 1;
            if (!depth) rows.push(body.slice(start, i + 1));
        }
    }
    return rows.map((row) => {
        const fields = splitFields(row.slice(1, -1));
        if (fields.length !== 7)
            throw new Error(`shtypes[] row has ${fields.length} fields, not 7`);
        const [name, annotation, symb, prob, shdist, iprobs, shknms] = fields;
        return {
            name: name === '(char *) 0' ? null : stringValue(name),
            annotation: annotation === 'NULL' ? null : stringValue(annotation),
            symb,
            prob: Number(prob),
            shdist,
            iprobs: splitFields(iprobs.slice(1, -1)).map(parseItemProbability),
            shknms,
        };
    });
}

// Every identifier the emitted table names, checked against the modules that
// are supposed to export it.
function collectIdentifiers(shops) {
    const names = new Set();
    for (const shop of shops) {
        names.add(shop.symb);
        names.add(shop.shdist);
        for (const { itype } of shop.iprobs) {
            const bare = itype.replace(/^-/u, '');
            if (/^\d+$/u.test(bare)) continue;
            if (bare === 'VEGETARIAN_CLASS') {
                names.add('MAXOCLASSES');
                continue;
            }
            names.add(bare);
        }
    }
    return names;
}

function exportedNames(path) {
    const source = readFileSync(path, 'utf8');
    const names = new Set();
    for (const match of source.matchAll(/^export const (\w+)/gmu))
        names.add(match[1]);
    return names;
}

function importPlan(identifiers) {
    const available = CONSTANT_MODULES.map(({ path, specifier }) => ({
        specifier,
        names: exportedNames(path),
    }));
    const plan = new Map(available.map(({ specifier }) => [specifier, []]));
    for (const name of [...identifiers].sort()) {
        const owner = available.find((module) => module.names.has(name));
        if (!owner)
            throw new Error(`no js/ module exports ${name}`);
        plan.get(owner.specifier).push(name);
    }
    return plan;
}

function itemTypeExpression(itype) {
    if (/^-?\d+$/u.test(itype)) return itype;
    if (itype === 'VEGETARIAN_CLASS') return `(${VEGETARIAN_CLASS_EXPRESSION})`;
    return itype;
}

function serializeShop(shop) {
    const iprobs = shop.iprobs
        .filter(({ iprob, itype }) => iprob !== 0 || itype !== '0')
        .map(({ iprob, itype }) => (
            `            { iprob: ${iprob}, itype: ${itemTypeExpression(itype)} },`
        ));
    return [
        '    {',
        `        name: ${JSON.stringify(shop.name)},`,
        `        annotation: ${JSON.stringify(shop.annotation)},`,
        `        symb: ${shop.symb},`,
        `        prob: ${shop.prob},`,
        `        shdist: ${shop.shdist},`,
        '        iprobs: [',
        ...iprobs,
        '        ],',
        `        shknms: ${shop.shknms},`,
        '    },',
    ].join('\n');
}

// One name list per C array, wrapped so that a line stays readable. Two rows
// of shtypes[] share shkbooks, and shkinit() and nameshk() both branch on the
// list's identity rather than on the shop, so the lists are declared once and
// referenced.
function serializeNameList(listName, names) {
    const lines = [];
    let line = '   ';
    for (const name of names) {
        const literal = ` ${JSON.stringify(name)},`;
        if (line.length + literal.length > 79) {
            lines.push(line);
            line = '   ';
        }
        line += literal;
    }
    lines.push(line);
    return `export const ${listName} = Object.freeze([\n${lines.join('\n')}\n]);`;
}

function generatedSource(shops, nameLists) {
    const plan = importPlan(collectIdentifiers(shops));
    const imports = [...plan.entries()]
        .filter(([, names]) => names.length)
        .map(([specifier, names]) => (
            `import {\n${names.map((name) => `    ${name},`).join('\n')}\n} from '${specifier}';`
        ))
        .join('\n');
    const lists = [...nameLists.entries()]
        .map(([listName, names]) => serializeNameList(listName, names))
        .join('\n\n');
    const rows = shops.map(serializeShop).join('\n');
    return `// GENERATED FILE - do not edit.
// Regenerate with: node scripts/generate-shtypes.mjs
// Source: nethack-c/upstream/src/shknam.c at ${PINNED_REVISION}.
//
// shknam.c shtypes[], one entry per shop type in source order, so the index
// into this table is the rtype offset from SHOPBASE that mkroom.c mkshop()
// stores. The trailing sentinel row is dropped: it terminates C's iteration
// and carries no shop. Every {0, 0} filler in an iprobs[] array is dropped
// too, because get_shop_item() stops once the accumulated probability reaches
// 100 and never reads past the last real pair.
//
// symb identifies the shop type, prob is its percentage share of mkshop()'s
// single rnd(100), and an iprobs[] itype is an object class when it is
// non-negative and a specific object when it is negative.

${imports}

${lists}

export const SHTYPES = Object.freeze([
${rows}
].map((shop) => Object.freeze({
    ...shop,
    iprobs: Object.freeze(shop.iprobs.map(Object.freeze)),
})));
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
const entries = parseShopEntries(source);
const sentinel = entries.pop();
if (sentinel.name !== null || sentinel.prob !== 0)
    throw new Error('shtypes[] does not end with its sentinel row');
// mkshop() rolls rnd(100) and walks the table subtracting prob, so the shares
// have to total 100 or the walk runs off the end. shknam.c's own disabled
// init_shop_selection() checks the same two totals.
const probTotal = entries.reduce((sum, shop) => sum + shop.prob, 0);
if (probTotal !== 100)
    throw new Error(`shop probabilities total ${probTotal}, not 100`);
for (const shop of entries) {
    const itemTotal = shop.iprobs.reduce((sum, { iprob }) => sum + iprob, 0);
    if (itemTotal !== 100)
        throw new Error(`item probabilities total ${itemTotal} for ${shop.name}`);
}

const nameLists = new Map();
for (const shop of entries) {
    if (!nameLists.has(shop.shknms))
        nameLists.set(shop.shknms, parseNameList(source, shop.shknms));
}

const output = generatedSource(entries, nameLists);
if (checkOnly) {
    let existing = '';
    try {
        existing = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
        // The comparison below reports the missing generated file.
    }
    if (existing !== output) {
        console.error('js/shtypes_data.js is stale; run node scripts/generate-shtypes.mjs');
        process.exitCode = 1;
    }
} else {
    writeFileSync(OUTPUT_PATH, output);
}
