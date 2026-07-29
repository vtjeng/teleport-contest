#!/usr/bin/env node

// Generate the extended-command table.  cmd.c's extcmdlist[] is the catalog
// that extcmds_match(), commands_init(), and doextcmd() all read, so the
// generated file carries every row in source order together with the flag
// constants func_tab.h defines for it.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const CMD_PATH = join(UPSTREAM_ROOT, 'src', 'cmd.c');
const FUNC_TAB_PATH = join(UPSTREAM_ROOT, 'include', 'func_tab.h');
const DEFSYM_PATH = join(UPSTREAM_ROOT, 'include', 'defsym.h');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'extcmdlist_data.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';

// Every preprocessor condition that appears inside extcmdlist[], keyed by the
// exact directive text and resolved against the recorder build rather than
// guessed.  A probe compiled with `clang -I include` over the recorder tree
// printed CRASHREPORT=1, DEBUG_MIGRATING_MONS=1, SHELL=1, SUSPEND=1, DEBUG=1
// and NH_DEVEL_STATUS == NH_STATUS_RELEASED, which settles all six macros:
//
//   CRASHREPORT           config.h:244-258 defines it on both __linux__ and
//                         MACOS because NOCRASHREPORT is never defined for
//                         the game build, so #bugreport is a real row.
//   DEBUG                 patchlevel.h:35-37 defines it unconditionally.
//   DEBUG_MIGRATING_MONS  config.h:620 derives it from DEBUG.
//   NH_DEVEL_STATUS       patchlevel.h:33 sets it to NH_STATUS_RELEASED, so
//                         the three `!= RELEASED || defined(DEBUG)` regions
//                         are admitted by DEBUG alone.
//   SHELL                 unixconf.h:321-323 defines it (no NOSHELL).
//   SUSPEND               unixconf.h:289-291 defines it because unixconf.h:41
//                         defines LINUX, which forces POSIX_JOB_CONTROL.
//
// An unlisted directive throws instead of defaulting, so a source change that
// adds one has to be resolved deliberately.
const PREPROCESSOR_CONDITIONS = new Map([
    ['#ifdef CRASHREPORT', true],
    ['#ifdef DEBUG', true],
    ['#ifdef DEBUG_MIGRATING_MONS', true],
    ['#ifndef SHELL', false],
    ['#ifndef SUSPEND', false],
    ['#if (NH_DEVEL_STATUS != NH_STATUS_RELEASED) || defined(DEBUG)', true],
]);

// Flag names emitted as named exports, in func_tab.h definition order.  The
// extended-command flags occupy one namespace and the extcmds_match() request
// flags another; both are read by js/cmd.js.
const EXTCMD_FLAG_NAMES = [
    'IFBURIED', 'AUTOCOMPLETE', 'WIZMODECMD', 'GENERALCMD',
    'CMD_NOT_AVAILABLE', 'NOFUZZERCMD', 'INTERNALCMD', 'CMD_M_PREFIX',
    'CMD_gGF_PREFIX', 'PREFIXCMD', 'MOVEMENTCMD', 'MOUSECMD', 'CMD_INSANE',
    'AUTOCOMP_ADJ', 'CMD_PARAM',
];
const ECM_FLAG_NAMES = [
    'ECM_NOFLAGS', 'ECM_IGNOREAC', 'ECM_EXACTMATCH', 'ECM_NO1CHARCMD',
];
// Flags func_tab.h defines as a union of other flags rather than a literal.
const COMPOSITE_FLAG_NAMES = ['CMD_MOVE_PREFIXES'];

function parseFlagDefinitions(source, names) {
    const values = new Map();
    for (const name of names) {
        const pattern = new RegExp(
            String.raw`^#define\s+${name}\s+(0x[0-9a-fA-F]+|\d+)`,
            'mu',
        );
        const match = source.match(pattern);
        if (!match) throw new Error(`func_tab.h defines no ${name}`);
        values.set(name, Number.parseInt(match[1], match[1].startsWith('0x') ? 16 : 10));
    }
    return values;
}

function parseCompositeFlags(source, names, flagValues) {
    const composites = new Map();
    for (const name of names) {
        const pattern = new RegExp(
            String.raw`^#define\s+${name}\s+\(([^)]*)\)`,
            'mu',
        );
        const match = source.match(pattern);
        if (!match) throw new Error(`func_tab.h defines no ${name}`);
        const parts = match[1].split('|').map((part) => part.trim());
        let value = 0;
        for (const part of parts) {
            if (!flagValues.has(part)) {
                throw new Error(`${name} refers to unknown flag ${part}`);
            }
            value |= flagValues.get(part);
        }
        composites.set(name, value);
    }
    return composites;
}

// defsym.h's OBJCLASS/OBJCLASS2 rows define the <basename>_SYM object-class
// characters that extcmdlist[] uses as keys for #seeamulet and its siblings.
function parseObjectClassSymbols(source) {
    const symbols = new Map();
    const objclass = /^\s*OBJCLASS\(\s*\d+,\s*'(.)',\s*(\w+),/gmu;
    for (const match of source.matchAll(objclass)) {
        symbols.set(`${match[2]}_SYM`, match[1].charCodeAt(0));
    }
    const objclass2 = /^\s*OBJCLASS2\(\s*\d+,\s*'(.)',\s*\w+,\s*(\w+),/gmu;
    for (const match of source.matchAll(objclass2)) {
        symbols.set(match[2], match[1].charCodeAt(0));
    }
    return symbols;
}

// Remove C comments without touching string or character literals, so a
// description containing '/' or '*' survives intact.
function stripComments(text) {
    let output = '';
    let index = 0;
    while (index < text.length) {
        const ch = text[index];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            output += ch;
            ++index;
            while (index < text.length && text[index] !== quote) {
                if (text[index] === '\\') {
                    output += text[index];
                    ++index;
                }
                output += text[index];
                ++index;
            }
            output += text[index] ?? '';
            ++index;
        } else if (ch === '/' && text[index + 1] === '*') {
            const end = text.indexOf('*/', index + 2);
            if (end < 0) throw new Error('unterminated block comment');
            // Keep any newlines so line-oriented directive handling still works.
            output += text.slice(index, end + 2).replace(/[^\n]/gu, '');
            index = end + 2;
        } else if (ch === '/' && text[index + 1] === '/') {
            const end = text.indexOf('\n', index);
            index = end < 0 ? text.length : end;
        } else {
            output += ch;
            ++index;
        }
    }
    return output;
}

// Resolve #ifdef/#ifndef/#if/#else/#endif inside the table body against
// PREPROCESSOR_CONDITIONS.  Nesting is supported; an unknown directive throws.
function resolveDirectives(text) {
    const stack = [];
    const kept = [];
    for (const line of text.split('\n')) {
        const directive = line.trim();
        if (directive.startsWith('#')) {
            if (directive.startsWith('#endif')) {
                if (!stack.length) throw new Error('unbalanced #endif');
                stack.pop();
            } else if (directive.startsWith('#else')) {
                if (!stack.length) throw new Error('unbalanced #else');
                stack[stack.length - 1] = !stack[stack.length - 1];
            } else {
                // Trailing comments were already removed; normalize whitespace
                // so the lookup key matches the recorded directive text.
                const key = directive.replace(/\s+/gu, ' ').trimEnd();
                if (!PREPROCESSOR_CONDITIONS.has(key)) {
                    throw new Error(
                        `unresolved preprocessor directive in extcmdlist[]: ${key}`,
                    );
                }
                stack.push(PREPROCESSOR_CONDITIONS.get(key));
            }
            kept.push('');
            continue;
        }
        kept.push(stack.every(Boolean) ? line : '');
    }
    if (stack.length) throw new Error('unbalanced preprocessor directive');
    return kept.join('\n');
}

function extractTableBody(source) {
    const start = source.indexOf('struct ext_func_tab extcmdlist[] = {');
    if (start < 0) throw new Error('cmd.c defines no extcmdlist[]');
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; ++index) {
        if (source[index] === '{') ++depth;
        else if (source[index] === '}') {
            --depth;
            if (!depth) return source.slice(open + 1, index);
        }
    }
    throw new Error('unterminated extcmdlist[] initializer');
}

// Split one initializer's fields on top-level commas.
function splitFields(body) {
    const fields = [];
    let depth = 0;
    let current = '';
    let index = 0;
    while (index < body.length) {
        const ch = body[index];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            current += ch;
            ++index;
            while (index < body.length && body[index] !== quote) {
                if (body[index] === '\\') {
                    current += body[index];
                    ++index;
                }
                current += body[index];
                ++index;
            }
            current += body[index] ?? '';
            ++index;
            continue;
        }
        if (ch === '(' || ch === '{') ++depth;
        else if (ch === ')' || ch === '}') --depth;
        if (ch === ',' && !depth) {
            fields.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
        ++index;
    }
    if (current.trim()) fields.push(current.trim());
    return fields;
}

const CHARACTER_ESCAPES = new Map([
    ['n', 10], ['t', 9], ['r', 13], ['b', 8], ['f', 12], ['v', 11],
    ['a', 7], ['\\', 92], ["'", 39], ['"', 34], ['?', 63],
]);

function characterLiteralValue(literal) {
    const inner = literal.slice(1, -1);
    if (inner[0] !== '\\') return inner.charCodeAt(0);
    const escape = inner.slice(1);
    if (CHARACTER_ESCAPES.has(escape)) return CHARACTER_ESCAPES.get(escape);
    if (/^[0-7]{1,3}$/u.test(escape)) return Number.parseInt(escape, 8);
    if (/^x[0-9a-fA-F]+$/u.test(escape)) return Number.parseInt(escape.slice(1), 16);
    throw new Error(`unsupported character escape ${literal}`);
}

// global.h:480-488 defines M(c) as 0x80 | c and C(c) as 0x1f & c.  The NHSTDC
// spelling `(c) - 128` differs only in signedness and lands on the same uchar.
function keyValue(expression, objectClassSymbols) {
    const text = expression.trim();
    if (/^'(\\.[0-7]*|[^\\])'$/u.test(text)) return characterLiteralValue(text);
    const meta = text.match(/^M\(\s*('(?:\\.[0-7]*|[^\\])')\s*\)$/u);
    if (meta) return 0x80 | characterLiteralValue(meta[1]);
    const control = text.match(/^C\(\s*('(?:\\.[0-7]*|[^\\])')\s*\)$/u);
    if (control) return 0x1F & characterLiteralValue(control[1]);
    if (objectClassSymbols.has(text)) return objectClassSymbols.get(text);
    throw new Error(`unsupported extcmdlist key expression: ${text}`);
}

function stringValue(expression) {
    const text = expression.trim();
    if (text === 'NULL' || text === '0' || /^\(\s*char\s*\*\s*\)\s*0$/u.test(text)) {
        return null;
    }
    const literals = [...text.matchAll(/"((?:[^"\\]|\\.)*)"/gu)];
    if (!literals.length) throw new Error(`unsupported string field: ${text}`);
    return literals.map((literal) => literal[1].replace(
        /\\(.)/gu,
        (whole, escaped) => (CHARACTER_ESCAPES.has(escaped)
            ? String.fromCharCode(CHARACTER_ESCAPES.get(escaped))
            : escaped),
    )).join('');
}

function flagNames(expression, flagValues) {
    const text = expression.trim().replace(/^\(|\)$/gu, '');
    if (text === '0') return [];
    return text.split('|').map((token) => {
        const name = token.trim();
        if (!flagValues.has(name)) {
            throw new Error(`unknown extended command flag ${name}`);
        }
        return name;
    });
}

function parseRows(body, flagValues, objectClassSymbols) {
    const rows = [];
    let depth = 0;
    let start = -1;
    for (let index = 0; index < body.length; ++index) {
        const ch = body[index];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            ++index;
            while (index < body.length && body[index] !== quote) {
                if (body[index] === '\\') ++index;
                ++index;
            }
            continue;
        }
        if (ch === '{') {
            if (!depth) start = index;
            ++depth;
        } else if (ch === '}') {
            --depth;
            if (!depth) {
                const fields = splitFields(body.slice(start + 1, index));
                if (fields.length !== 6) {
                    throw new Error(
                        `extcmdlist[] row has ${fields.length} fields: ${fields.join(' | ')}`,
                    );
                }
                const name = stringValue(fields[1]);
                // extcmds_match() and commands_init() both stop at the row
                // whose ef_txt is Null, so the sentinel carries no behavior.
                if (name === null) break;
                rows.push({
                    key: keyValue(fields[0], objectClassSymbols),
                    ef_txt: name,
                    ef_desc: stringValue(fields[2]),
                    ef_funct: fields[3].trim(),
                    flags: flagNames(fields[4], flagValues),
                    // The sixth column, f_text. rhack() reads it at
                    // cmd.c:3728 as `if (tlist->f_text && !go.occupation &&
                    // gm.multi) set_occupation(func, tlist->f_text, gm.multi)`,
                    // so dropping it would lose the occupation name. Only
                    // 'search' and 'wait' carry one.
                    f_text: stringValue(fields[5]),
                });
            }
        }
    }
    return rows;
}

function quote(value) {
    return value === null ? 'null' : JSON.stringify(value);
}

function renderExtcmdData(rows, extcmdFlags, ecmFlags, compositeFlags) {
    const flagLines = (values) => [...values].map(
        ([name, value]) => `export const ${name} = 0x${value.toString(16).toUpperCase().padStart(4, '0')};`,
    ).join('\n');
    const rowLines = rows.map((row) => {
        const flags = row.flags.length ? row.flags.join(' | ') : '0';
        // f_text is null on all but two rows, so it is emitted only where C
        // has one; row() defaults the rest.
        const occupation = row.f_text === null
            ? '' : `, ${quote(row.f_text)}`;
        return `    row(0x${row.key.toString(16).toUpperCase().padStart(2, '0')}, `
            + `${quote(row.ef_txt)}, ${quote(row.ef_desc)}, `
            + `${quote(row.ef_funct)}, ${flags}${occupation}),`;
    }).join('\n');
    return '// Generated by scripts/generate-extcmds.mjs.\n'
        + `// Source: NetHack 5.0 src/cmd.c extcmdlist[], include/func_tab.h,\n`
        + `// and include/defsym.h at ${PINNED_REVISION}.\n`
        + '\n'
        + '// Extended command flags, from include/func_tab.h.\n'
        + `${flagLines(extcmdFlags)}\n`
        + `${flagLines(compositeFlags)}\n`
        + '\n'
        + '// extcmds_match() request flags, from include/func_tab.h.\n'
        + `${flagLines(ecmFlags)}\n`
        + '\n'
        + '// ef_funct holds the C function name.  js/cmd.js maps the names it\n'
        + '// has ported to JavaScript handlers and refuses the rest.\n'
        + '//\n'
        + '// f_text is extcmdlist[]\'s sixth column, the occupation name\n'
        + '// rhack() passes to set_occupation() when the command runs under a\n'
        + '// count.  Only \'search\' and \'wait\' carry one.\n'
        + 'function row(key, ef_txt, ef_desc, ef_funct, flags, f_text = null) {\n'
        + '    return Object.freeze({\n'
        + '        key, ef_txt, ef_desc, ef_funct, flags, f_text,\n'
        + '    });\n'
        + '}\n'
        + '\n'
        + '// extcmdlist[] in source order, without its Null-ef_txt sentinel.\n'
        + 'export const extcmdlist = Object.freeze([\n'
        + `${rowLines}\n`
        + ']);\n';
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
    const upstreamStatus = execFileSync(
        'git', ['-C', UPSTREAM_ROOT, 'status', '--porcelain=v1', '--untracked-files=no'],
        { encoding: 'utf8' },
    ).trim();
    if (upstreamStatus) {
        throw new Error('Refusing to generate from modified tracked upstream sources');
    }
}

export function buildExtcmdData() {
    const funcTabSource = readFileSync(FUNC_TAB_PATH, 'utf8');
    const extcmdFlags = parseFlagDefinitions(funcTabSource, EXTCMD_FLAG_NAMES);
    const ecmFlags = parseFlagDefinitions(funcTabSource, ECM_FLAG_NAMES);
    const compositeFlags = parseCompositeFlags(
        funcTabSource, COMPOSITE_FLAG_NAMES, extcmdFlags,
    );
    const objectClassSymbols = parseObjectClassSymbols(
        readFileSync(DEFSYM_PATH, 'utf8'),
    );
    const body = resolveDirectives(
        stripComments(extractTableBody(readFileSync(CMD_PATH, 'utf8'))),
    );
    const rows = parseRows(
        body,
        new Map([...extcmdFlags, ...compositeFlags]),
        objectClassSymbols,
    );
    return { rows, extcmdFlags, ecmFlags, compositeFlags };
}

function main() {
    const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
    if (process.argv.length > (checkOnly ? 3 : 2)) {
        throw new Error('Usage: node scripts/generate-extcmds.mjs [--check]');
    }
    assertPinnedSource();
    const { rows, extcmdFlags, ecmFlags, compositeFlags } = buildExtcmdData();
    const output = renderExtcmdData(rows, extcmdFlags, ecmFlags, compositeFlags);
    if (checkOnly) {
        let existing = '';
        try {
            existing = readFileSync(OUTPUT_PATH, 'utf8');
        } catch {
            // The comparison below reports the missing generated file.
        }
        if (existing !== output) {
            console.error(
                'js/extcmdlist_data.js is stale; run '
                + 'node scripts/generate-extcmds.mjs',
            );
            process.exitCode = 1;
        }
    } else {
        writeFileSync(OUTPUT_PATH, output);
        console.log(`wrote ${rows.length} extcmdlist[] rows`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
