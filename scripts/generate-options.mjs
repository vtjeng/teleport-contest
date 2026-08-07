#!/usr/bin/env node

// Generate allopt[], the option table options.c builds by including
// include/optlist.h three times with different macro definitions.
//
// optlist.h is not a plain data file: nearly a quarter of its 261 NHOPT*
// macro calls sit in #ifdef arms that the build configuration selects
// between, and the surviving 217 entries name their storage as C lvalues
// (&flags.acoustics). Reproducing that selection by rereading the header in
// JavaScript would mean reimplementing the C preprocessor over config.h,
// unixconf.h and options.c's own PREV_MSGS definition. Instead this script
// preprocesses src/options.c exactly as the recorder build's compiler does
// and parses the expanded allopt_init[] initializer, so the arms it keeps
// are the arms the recorded games ran.
//
// The build supplies two headers that makedefs writes and the pinned source
// tree does not carry, nhlua.h and date.h. Neither defines a macro that
// optlist.h tests, so empty stand-ins let the preprocessor reach the table;
// the script refuses to run if the pinned tree ever starts shipping them,
// which would mean a stand-in was shadowing real content.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync }
    from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const UPSTREAM_INCLUDE = join(UPSTREAM_ROOT, 'include');
const UPSTREAM_UNIX = join(UPSTREAM_ROOT, 'sys', 'unix');
const OPTIONS_C = join(UPSTREAM_ROOT, 'src', 'options.c');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'optlist_data.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';

// Headers makedefs generates into include/ during a build. The pinned source
// tree has neither, so an empty copy of each satisfies hack.h's include.
const GENERATED_HEADERS = Object.freeze(['nhlua.h', 'date.h']);

// global.h enum optset_restrictions.
const SETWHERE = Object.freeze({
    set_in_sysconf: 0,
    set_in_config: 1,
    set_viaprog: 2,
    set_gameview: 3,
    set_in_game: 4,
    set_wizonly: 5,
    set_wiznofuz: 6,
    set_hidden: 7,
});

// optlist.h enum menu_terminology_preference.
const TERMPREF = Object.freeze({
    Term_False: 0,
    Term_Off: 1,
    Term_Disabled: 2,
    Term_Excluded: 3,
});

const OPTTYPES = Object.freeze(['BoolOpt', 'CompOpt', 'OthrOpt']);

// Field positions in the expanded struct allopt_t initializer. optlist.h's
// struct declaration lists 22 members; the ones this port does not read are
// left out here rather than emitted unused.
const FIELD = Object.freeze({
    name: 0,
    setwhere: 5,
    opttyp: 6,
    pfx: 10,
    termpref: 11,
    addr: 13,
    optfn: 14,
    initval: 18,
});
const FIELD_COUNT = 22;

// Split one brace-delimited initializer into its top-level fields. Commas
// inside string literals ("normal play, non-scoring explore mode") and inside
// casts ((int (*)(int, int)) 0) do not separate fields.
function splitFields(body) {
    const fields = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    for (let index = 0; index < body.length; ++index) {
        const ch = body[index];
        if (quoted) {
            if (ch === '\\') ++index;
            else if (ch === '"') quoted = false;
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === '(' || ch === '[') ++depth;
        else if (ch === ')' || ch === ']') --depth;
        else if (ch === ',' && depth === 0) {
            fields.push(body.slice(start, index).trim());
            start = index + 1;
        }
    }
    fields.push(body.slice(start).trim());
    return fields;
}

function parseStringLiteral(field, what) {
    const match = field.match(/^"((?:[^"\\]|\\.)*)"$/u);
    if (!match) throw new Error(`${what} is not a string literal: ${field}`);
    return match[1]
        .replace(/\\(["\\])/gu, '$1')
        .replace(/\\n/gu, '\n')
        .replace(/\\t/gu, '\t');
}

function parseEnum(field, table, what) {
    if (!Object.hasOwn(table, field))
        throw new Error(`unknown ${what}: ${field}`);
    return table[field];
}

// The boolean storage the option reads and writes, as the C lvalue the
// preprocessor produced minus its address-of. A compound or other option has
// no storage and expands to a null pointer cast.
function parseAddress(field) {
    if (/^\(boolean\s*\*\)\s*0$/u.test(field)) return null;
    const match = field.match(/^&([A-Za-z_][A-Za-z0-9_.]*)$/u);
    if (!match) throw new Error(`unexpected option address: ${field}`);
    return match[1];
}

// A prefix option (optlist.h NHOPTP) is handled by pfxfn_<name> rather than
// optfn_<name>; the entry's pfx field says which.
function parseOptfn(field, prefixed) {
    const kind = prefixed ? 'pfxfn' : 'optfn';
    const match = field.match(new RegExp(`^&${kind}_([A-Za-z0-9_]+)$`, 'u'));
    if (!match) throw new Error(`unexpected option function: ${field}`);
    return match[1];
}

function parseYesNo(field, what) {
    if (field === 'Yes') return true;
    if (field === 'No') return false;
    throw new Error(`unexpected ${what}: ${field}`);
}

function parseInitval(field) {
    if (field === 'On') return true;
    if (field === 'Off') return false;
    throw new Error(`unexpected option initial value: ${field}`);
}

function parseEntries(expanded) {
    const start = expanded.indexOf('static struct allopt_t allopt_init[] = {');
    if (start < 0) throw new Error('allopt_init[] is missing from options.c');
    const end = expanded.indexOf('\n};', start);
    if (end < 0) throw new Error('allopt_init[] initializer is unterminated');
    const block = expanded.slice(start, end);
    if (/NHOPT[BCOP]\s*\(/u.test(block))
        throw new Error('allopt_init[] still holds unexpanded NHOPT macros');

    const entries = [];
    for (const match of block.matchAll(/^ {4}\{ (.*) \},$/gmu)) {
        const fields = splitFields(match[1]);
        if (fields.length !== FIELD_COUNT) {
            throw new Error(
                `option entry has ${fields.length} fields, expected `
                + `${FIELD_COUNT}: ${match[1]}`,
            );
        }
        const opttyp = fields[FIELD.opttyp];
        if (!OPTTYPES.includes(opttyp))
            throw new Error(`unknown option type: ${opttyp}`);
        const addr = parseAddress(fields[FIELD.addr]);
        if ((opttyp === 'BoolOpt') !== (fields[FIELD.termpref] !== '0')) {
            throw new Error(
                `option ${fields[FIELD.name]} mixes its type and terminology`,
            );
        }
        const pfx = parseYesNo(fields[FIELD.pfx], 'option prefix flag');
        entries.push({
            name: parseStringLiteral(fields[FIELD.name], 'option name'),
            setwhere: parseEnum(
                fields[FIELD.setwhere], SETWHERE, 'option restriction',
            ),
            opttyp,
            pfx,
            termpref: opttyp === 'BoolOpt'
                ? parseEnum(
                    fields[FIELD.termpref], TERMPREF, 'option terminology',
                )
                : TERMPREF.Term_False,
            addr,
            optfn: parseOptfn(fields[FIELD.optfn], pfx),
            initval: parseInitval(fields[FIELD.initval]),
        });
    }
    if (!entries.length) throw new Error('allopt_init[] parsed as empty');
    return entries;
}

function formatEntry(entry) {
    const addr = entry.addr === null ? 'null' : `'${entry.addr}'`;
    return `    { name: '${entry.name}', setwhere: ${entry.setwhere},`
        + ` opttyp: '${entry.opttyp}', pfx: ${entry.pfx},`
        + ` termpref: ${entry.termpref},`
        + ` addr: ${addr}, optfn: '${entry.optfn}',`
        + ` initval: ${entry.initval} },`;
}

function formatModule(entries) {
    return `// Generated by scripts/generate-options.mjs. Do not edit by hand.
// Source: NetHack 5.0 include/optlist.h as src/options.c expands it into
// allopt_init[], at ${PINNED_REVISION}.

// One entry per option, in the order doset() and doset_simple_menu() walk.
// setwhere is global.h enum optset_restrictions, termpref is optlist.h enum
// menu_terminology_preference, addr names the C lvalue holding a boolean
// option's value, and optfn names the options.c handler minus its optfn_
// prefix, or its pfxfn_ prefix when pfx is true. initval is the compiled-in
// default initoptions_init() stores.
export const allopt = Object.freeze([
${entries.map(formatEntry).join('\n')}
].map(Object.freeze));
`;
}

function assertPinnedSource() {
    const revision = execFileSync(
        'git', ['-C', UPSTREAM_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
    ).trim();
    if (revision !== PINNED_REVISION) {
        throw new Error(
            `expected NetHack source ${PINNED_REVISION}; found ${revision}`,
        );
    }
    const status = execFileSync(
        'git',
        ['-C', UPSTREAM_ROOT, 'status', '--porcelain=v1',
            '--untracked-files=no'],
        { encoding: 'utf8' },
    ).trim();
    if (status)
        throw new Error('Refusing to generate from modified upstream sources');
    for (const header of GENERATED_HEADERS) {
        if (existsSync(join(UPSTREAM_INCLUDE, header))) {
            throw new Error(
                `${header} now ships with the pinned source; the empty `
                + 'stand-in this script supplies would hide it',
            );
        }
    }
}

function expandOptions() {
    const workDir = mkdtempSync(join(tmpdir(), 'teleport-option-export-'));
    try {
        for (const header of GENERATED_HEADERS)
            writeFileSync(join(workDir, header), '');
        return execFileSync(
            'clang',
            ['-E', '-I', workDir, '-I', UPSTREAM_INCLUDE, '-I', UPSTREAM_UNIX,
                OPTIONS_C],
            { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        );
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

function main() {
    const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
    if (process.argv.length > (checkOnly ? 3 : 2))
        throw new Error('Usage: node scripts/generate-options.mjs [--check]');

    assertPinnedSource();
    const generatedModule = formatModule(parseEntries(expandOptions()));
    if (checkOnly) {
        if (readFileSync(OUTPUT_PATH, 'utf8') !== generatedModule)
            throw new Error(`${OUTPUT_PATH} is stale; regenerate it`);
        process.stdout.write(`Verified ${OUTPUT_PATH}\n`);
    } else {
        writeFileSync(OUTPUT_PATH, generatedModule);
        process.stdout.write(`Generated ${OUTPUT_PATH}\n`);
    }
}

main();
