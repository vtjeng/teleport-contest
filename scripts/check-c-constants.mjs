#!/usr/bin/env node

// Check the port's numeric constants against the C compiler.
//
// Every upper-case integer constant that a js/ module declares with
// `export const` is written into a generated C file as
//
//     _Static_assert((NAME) == (value), "NAME");
//
// and the file is compiled against the recorder's headers
// (scripts/recorder-headers.mjs), so each value is checked by the compiler
// rather than by a parser of #define lines. Enum members, constants defined
// by expressions, and #ifdef-selected values are all checked. The method
// follows the compiler-verified constants check in
// https://mazesofmenace.ai/seeing-snakes/.
//
// The compiler sorts each name into one of four results:
//   match       the assertion holds;
//   mismatch    the assertion fails; a second, compiled-and-run program
//               prints C's value;
//   variable    C defines the name, but not as an integer constant
//               expression (a variable, or a macro that reads one);
//   undefined   the C headers do not declare the name.
//
// A name that a src/*.c file #defines or lists in an enum is asserted again
// after an #include of that whole file, so its local value is checked too.
// Of the names still undefined, the report marks those that some header
// #defines outside the recorder's configuration (the Amiga, curses and X11
// window ports, for example); the rest are port-only names.
//
// The check fails when a mismatch is not listed in KNOWN_MISMATCHES.
//
//   node scripts/check-c-constants.mjs           print the summary and lists
//   node scripts/check-c-constants.mjs --json    print every result as JSON

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

import {
    PROJECT_ROOT,
    UPSTREAM_ROOT,
    findCompiler,
    prepareRecorderIncludes,
} from './recorder-headers.mjs';

const JS_DIR = join(PROJECT_ROOT, 'js');

// The scorer replaces these files with its own copies.
const FROZEN_JS = new Set(['isaac64.js', 'terminal.js', 'storage.js']);

const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/u;

// Headers outside hack.h that declare constants the port mirrors.
const EXTRA_HEADERS = [
    'dgn_file.h', 'dlb.h', 'fnamesiz.h', 'func_tab.h', 'mail.h', 'mfndpos.h',
    'nhmd4.h', 'nhregex.h', 'sp_lev.h', 'tcap.h', 'tileset.h', 'wintty.h',
];

// Names whose C value the port deliberately does not copy, with the reason.
// A mismatch listed here is reported but does not fail the check.
export const KNOWN_MISMATCHES = new Map([
    // wintty.h includes the host's <curses.h>, which supplies A_ITALIC; the
    // port does not use it.
    ['A_ITALIC', 'value of the host curses library; unused in js/'],
    // tradstdc.h derives NH_C from the compiler's __STDC_VERSION__.
    ['NH_C', 'depends on the C compiler\'s language version; unused in js/'],
    // mfndpos.h defines 0x80000000UL. JavaScript's bitwise operators work on
    // signed 32-bit integers, so the port keeps the same bits as a negative.
    ['NOGARLIC', 'same 32 bits, stored signed for JavaScript bitwise operators'],
    // const.js uses these three names for prop.h's FROMFORM, FROMRACE and
    // FROMEXPER masks, while attrib.c uses them for innately()'s return
    // codes. Fixing that means renaming the masks at their callers.
    ['FROM_FORM', 'names prop.h FROMFORM, not attrib.c FROM_FORM'],
    ['FROM_RACE', 'names prop.h FROMRACE, not attrib.c FROM_RACE'],
    ['FROM_ROLE', 'names prop.h FROMEXPER, not attrib.c FROM_ROLE'],
]);

// Every `export const NAME = ...` with an upper-case NAME, by module.
export function declaredConstantNames(source) {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const names = [];
    for (const node of ast.body) {
        if (node.type !== 'ExportNamedDeclaration' || node.declaration?.type !== 'VariableDeclaration')
            continue;
        if (node.declaration.kind !== 'const') continue;
        for (const declarator of node.declaration.declarations) {
            if (declarator.id.type === 'Identifier' && CONSTANT_NAME.test(declarator.id.name))
                names.push(declarator.id.name);
        }
    }
    return names;
}

// The integer constants js/ exports, as [{ name, value, module }], sorted by
// name. The values come from importing each module, so a constant defined
// by an expression has its computed value.
export async function collectJsConstants() {
    const constants = [];
    const importErrors = [];
    for (const file of readdirSync(JS_DIR).sort()) {
        if (!file.endsWith('.js') || FROZEN_JS.has(file)) continue;
        const names = declaredConstantNames(readFileSync(join(JS_DIR, file), 'utf8'));
        if (names.length === 0) continue;
        let module;
        try {
            module = await import(pathToFileURL(join(JS_DIR, file)).href);
        } catch (error) {
            importErrors.push({ module: file, error: String(error) });
            continue;
        }
        for (const name of names) {
            const value = module[name];
            if (Number.isSafeInteger(value)) constants.push({ name, value, module: file });
        }
    }
    constants.sort((a, b) => a.name.localeCompare(b.name) || a.module.localeCompare(b.module));
    return { constants, importErrors };
}

// The generated file's opening lines: the recorder's headers, or, for a name
// that a .c file defines, that whole file, so its local macros and enums are
// in scope.
function prelude(sourceFile = null) {
    if (sourceFile) return [`#include "${join(UPSTREAM_ROOT, sourceFile)}"`, ''];
    return [
        '#include "hack.h"',
        ...EXTRA_HEADERS.map((h) => `#include "${h}"`),
        // mcastu.c builds its spell enum from mcastu.h this way.
        '#define MCASTU_ENUM',
        'enum mcast_spells {',
        '#include "mcastu.h"',
        '};',
        '#undef MCASTU_ENUM',
        '',
    ];
}

// Two assertions with known results end every generated file. If the
// compiler's diagnostics for them are not recognized, the check stops
// instead of reading silence as a pass.
const CANARY_MISMATCH = '_Static_assert(1 == 0, "canary: mismatch");';
const CANARY_UNDEFINED = '_Static_assert((CHECK_C_CONSTANTS_UNDECLARED) == 0, "canary: undefined");';

export function renderAssertions(constants, sourceFile = null) {
    const lines = prelude(sourceFile);
    const lineOf = new Map();
    for (const [index, c] of constants.entries()) {
        lineOf.set(lines.length + 1, index);
        lines.push(`_Static_assert((${c.name}) == (${c.value}LL), "${c.name}");`);
    }
    lineOf.set(lines.length + 1, 'canary-mismatch');
    lines.push(CANARY_MISMATCH);
    lineOf.set(lines.length + 1, 'canary-undefined');
    lines.push(CANARY_UNDEFINED);
    return { text: `${lines.join('\n')}\n`, lineOf };
}

// Sort compiler errors on the assertion lines into results. clang and gcc
// word these diagnostics differently; both forms are recognized.
export function classifyDiagnostics(stderr, fileName, lineOf) {
    const results = new Map();
    const unexplained = [];
    const pattern = new RegExp(`^${fileName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}:(\\d+):\\d+: error: (.*)$`, 'gmu');
    for (const match of stderr.matchAll(pattern)) {
        const index = lineOf.get(Number(match[1]));
        const message = match[2];
        if (index === undefined) { unexplained.push(match[0]); continue; }
        if (results.has(index)) continue; // the first error on a line decides
        if (/undeclared identifier|undeclared here|undeclared \(first use/u.test(message))
            results.set(index, 'undefined');
        else if (/static assertion failed|static_assert failed/u.test(message))
            results.set(index, 'mismatch');
        else if (/not an integral constant|not an integer constant|is not constant|not a constant/u.test(message))
            results.set(index, 'variable');
        else
            unexplained.push(match[0]);
    }
    return { results, unexplained };
}

function compile(compiler, args) {
    return spawnSync(compiler, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

// clang stops after 20 errors unless told otherwise; gcc does not stop.
function errorLimitFlags(compiler) {
    const version = spawnSync(compiler, ['--version'], { encoding: 'utf8' }).stdout ?? '';
    return /clang/u.test(version) ? ['-ferror-limit=0'] : ['-fmax-errors=0'];
}

// Compile the assertions for `entries` and return each entry's result by
// index. Errors outside the assertion lines are ignored when `sourceFile`
// is set (that file is compiled against the Lua stub) and fatal otherwise.
function runAssertions(compiler, headers, entries, sourceFile = null) {
    const { text, lineOf } = renderAssertions(entries, sourceFile);
    const cFile = join(headers.dir, sourceFile ? 'local.c' : 'constants.c');
    writeFileSync(cFile, text);
    const compiled = compile(compiler, ['-fsyntax-only', ...errorLimitFlags(compiler), '-w',
        `-I${headers.includeDir}`, cFile]);
    const { results, unexplained } = classifyDiagnostics(compiled.stderr, cFile, lineOf);
    if (results.get('canary-mismatch') !== 'mismatch' || results.get('canary-undefined') !== 'undefined')
        throw new Error(`${compiler}'s diagnostics were not recognized:\n${compiled.stderr.slice(0, 2000)}`);
    if (!sourceFile && unexplained.length > 0)
        throw new Error(`unexpected compiler errors:\n${unexplained.slice(0, 20).join('\n')}`);
    return results;
}

// C's values for the names whose assertions failed, from a program that
// prints them.
function cValues(compiler, headers, names, sourceFile = null) {
    if (names.length === 0) return new Map();
    if (sourceFile) {
        // A whole .c file does not link on its own; read each value from a
        // failing assertion instead, which clang prints with its operands.
        return valuesFromDiagnostics(compiler, headers, names, sourceFile);
    }
    const source = [
        ...prelude(),
        '#include <stdio.h>',
        'int main(void) {',
        ...names.map((n) => `    printf("%s %lld\\n", "${n}", (long long) (${n}));`),
        '    return 0;',
        '}',
        '',
    ].join('\n');
    const cFile = join(headers.dir, 'values.c');
    const binary = join(headers.dir, 'values');
    writeFileSync(cFile, source);
    const built = compile(compiler, [`-I${headers.includeDir}`, '-w', '-o', binary, cFile]);
    if (built.status !== 0) throw new Error(`building the value printer failed:\n${built.stderr}`);
    const run = spawnSync(binary, [], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`the value printer failed:\n${run.stderr}`);
    return new Map(run.stdout.trim().split('\n').map((line) => {
        const [name, value] = line.split(' ');
        return [name, Number(value)];
    }));
}

function valuesFromDiagnostics(compiler, headers, names, sourceFile) {
    const lines = prelude(sourceFile);
    const lineOf = new Map();
    for (const name of names) {
        lineOf.set(lines.length + 1, name);
        // An impossible requirement, so clang reports the value it evaluated.
        // gcc does not, and these values stay unknown under gcc.
        lines.push(`_Static_assert((long long) (${name}) == -9223372036854775807LL - 1, "${name}");`);
    }
    const cFile = join(headers.dir, 'local-values.c');
    writeFileSync(cFile, `${lines.join('\n')}\n`);
    const compiled = compile(compiler, ['-fsyntax-only', ...errorLimitFlags(compiler), '-w',
        `-I${headers.includeDir}`, cFile]);
    const values = new Map();
    const escaped = cFile.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = new RegExp(`^${escaped}:(\\d+):\\d+: note: expression evaluates to '(-?\\d+) ==`, 'gmu');
    for (const match of compiled.stderr.matchAll(pattern)) {
        const name = lineOf.get(Number(match[1]));
        if (name) values.set(name, Number(match[2]));
    }
    return values;
}

// Names #defined only in headers the recorder build does not include, such
// as the Amiga or curses window ports' headers.
function otherHeaderDefinitions(names) {
    const wanted = new Set(names);
    const found = new Map();
    const dir = join(UPSTREAM_ROOT, 'include');
    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith('.h')) continue;
        const text = readFileSync(join(dir, file), 'utf8');
        for (const match of text.matchAll(/^\s*#\s*define\s+([A-Z][A-Z0-9_]*)\b/gmu)) {
            if (wanted.has(match[1]) && !found.has(match[1])) found.set(match[1], file);
        }
    }
    return found;
}

// Object-like and function-like macros the headers define, from -dM.
function headerMacros(compiler, headers) {
    const cFile = join(headers.dir, 'macros.c');
    writeFileSync(cFile, prelude().join('\n'));
    const result = compile(compiler, ['-E', '-dM', `-I${headers.includeDir}`, cFile]);
    if (result.status !== 0) throw new Error(`listing macros failed:\n${result.stderr}`);
    const functionLike = new Set();
    for (const match of result.stdout.matchAll(/^#define ([A-Za-z_]\w*)\(/gmu)) functionLike.add(match[1]);
    return functionLike;
}

// Names that some src/*.c file defines with #define or as an enum member,
// which the header check cannot see.
function sourceFileDefinitions(names) {
    const wanted = new Set(names);
    const found = new Map();
    const dir = join(UPSTREAM_ROOT, 'src');
    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith('.c')) continue;
        const text = readFileSync(join(dir, file), 'utf8');
        for (const match of text.matchAll(/^\s*#\s*define\s+([A-Z][A-Z0-9_]*)\b/gmu)) {
            if (wanted.has(match[1]) && !found.has(match[1])) found.set(match[1], `src/${file}`);
        }
        for (const body of text.matchAll(/\benum\b[^{;]*\{([^}]*)\}/gu)) {
            for (const member of body[1].matchAll(/\b([A-Z][A-Z0-9_]*)\b\s*(?:=[^,]*)?,?/gu)) {
                if (wanted.has(member[1]) && !found.has(member[1])) found.set(member[1], `src/${file}`);
            }
        }
    }
    return found;
}

export async function checkConstants({ compiler }) {
    const { constants, importErrors } = await collectJsConstants();
    const headers = prepareRecorderIncludes();
    try {
        const results = runAssertions(compiler, headers, constants);
        const entries = constants.map((c, index) => ({ ...c, result: results.get(index) ?? 'match' }));
        const undefinedNames = entries.filter((e) => e.result === 'undefined').map((e) => e.name);
        const inSource = sourceFileDefinitions(undefinedNames);
        // A name a .c file defines is checked again in that file's context.
        const bySource = new Map();
        for (const e of entries.filter((x) => x.result === 'undefined' && inSource.has(x.name))) {
            const file = inSource.get(e.name);
            if (!bySource.has(file)) bySource.set(file, []);
            bySource.get(file).push(e);
        }
        for (const [file, group] of bySource) {
            const local = runAssertions(compiler, headers, group, file);
            group.forEach((e, index) => {
                e.result = local.get(index) ?? 'match';
                if (e.result === 'undefined') e.where = `#defined in ${file}, which #undefs it before the file ends`;
                else e.definedIn = file;
            });
        }
        const functionLike = headerMacros(compiler, headers);
        const otherHeaders = otherHeaderDefinitions(
            entries.filter((e) => e.result === 'undefined').map((e) => e.name));
        for (const e of entries.filter((x) => x.result === 'undefined' && !x.where)) {
            if (functionLike.has(e.name)) e.where = 'function-like macro in the headers';
            else if (otherHeaders.has(e.name))
                e.where = `#defined in include/${otherHeaders.get(e.name)}, but not in the recorder's configuration`;
        }
        const mismatched = entries.filter((e) => e.result === 'mismatch');
        for (const e of mismatched) {
            const reason = KNOWN_MISMATCHES.get(e.name);
            if (reason) e.known = reason;
        }
        const headerValues = cValues(compiler, headers,
            [...new Set(mismatched.filter((e) => !e.definedIn).map((e) => e.name))]);
        for (const e of mismatched.filter((x) => !x.definedIn)) e.cValue = headerValues.get(e.name);
        for (const [file, group] of bySource) {
            const names = [...new Set(group.filter((e) => e.result === 'mismatch').map((e) => e.name))];
            const values = cValues(compiler, headers, names, file);
            for (const e of group.filter((x) => x.result === 'mismatch')) e.cValue = values.get(e.name);
        }
        return { compiler, entries, importErrors };
    } finally {
        headers.cleanup();
    }
}

function printReport({ entries, importErrors }) {
    const by = (result) => entries.filter((e) => e.result === result);
    const undefinedEntries = by('undefined');
    const portOnly = undefinedEntries.filter((e) => !e.where);
    for (const e of by('mismatch')) {
        console.log(`MISMATCH ${e.name}: js/${e.module} has ${e.value}, C has ${e.cValue}`
            + `${e.definedIn ? ` in ${e.definedIn}` : ''}${e.known ? ` (known: ${e.known})` : ''}`);
    }
    for (const e of by('variable')) console.log(`VARIABLE ${e.name} (js/${e.module})`);
    for (const e of undefinedEntries.filter((x) => x.where))
        console.log(`NOT-IN-BUILD ${e.name} (js/${e.module}): ${e.where}`);
    for (const e of portOnly) console.log(`PORT-ONLY ${e.name} (js/${e.module})`);
    for (const e of importErrors) console.log(`IMPORT-ERROR js/${e.module}: ${e.error}`);
    const local = entries.filter((e) => e.definedIn).length;
    const failing = by('mismatch').filter((e) => !e.known).length;
    console.log(`c-constants: ${entries.length} integer constants exported from js/;`
        + ` ${by('match').length} match (${local} of them checked inside the .c file that defines them),`
        + ` ${by('mismatch').length} mismatch (${failing} not in KNOWN_MISMATCHES),`
        + ` ${by('variable').length} not constant in C,`
        + ` ${undefinedEntries.length - portOnly.length} not in the recorder's build, ${portOnly.length} port-only`);
}

async function main() {
    const compiler = findCompiler();
    if (!compiler) {
        console.log('c-constants: no C compiler (clang, cc, or gcc) found');
        process.exitCode = 1;
        return;
    }
    const report = await checkConstants({ compiler });
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
    } else {
        printReport(report);
    }
    const failing = report.entries.filter((e) => e.result === 'mismatch' && !e.known);
    if (failing.length > 0 || report.importErrors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
