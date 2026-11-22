#!/usr/bin/env node

// Generate the zero-valued C global structs the port creates at startup:
//
//   js/context.js        svc.context    struct context_info  (context.h)
//   js/flag.js           iflags         struct instance_flags (flag.h)
//                        flags          struct flag           (flag.h)
//   js/program_state.js  program_state  struct sinfo          (hack.h)
//
// Each output holds one function per struct that returns a new object with
// every member of that struct at C's zero value, and a table of each
// struct's members and C types.
//
// C zero-initializes its global structs (decl.c declares them without an
// initializer), so a member that no code has written yet reads as 0, FALSE
// or NULL. The port once built these objects member by member; a member read
// before it was first written was `undefined`, which is not `=== 0`, not
// `< 1` and not a number after `++`. Deriving the startup objects from the
// headers gives every member its zero value from process start, and --check
// fails when a header and its generated file disagree.
//
// Zero values: 0 for an integer or a Bitfield, false for a boolean, null for
// a pointer, '' for a char array that holds text, an array of zeros for any
// other scalar array, an array of zeroed structs for an array of structs,
// and a nested object for an embedded struct (coord.h's coord, dungeon.h's
// d_level, color.h's color_attr). BYTE_ARRAYS names the char arrays the port
// holds as arrays of byte values instead of strings, BYTE_LISTS the
// NUL-terminated char arrays it holds as lists of byte values without the
// terminator, CHAR_ARRAYS the NUL-terminated char arrays it holds as arrays
// of one-character strings without the terminator, and CHAR_TEXT the scalar
// chars the port holds as one-character strings.
//
// Preprocessor conditionals inside a struct are resolved against MACROS, the
// configuration of the recorder build; a conditional naming any other macro
// stops the generator, so a header change that adds one cannot pass
// unnoticed.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const INCLUDE = join(UPSTREAM_ROOT, 'include');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';

// The macros the struct bodies test, as the recorder build defines them.
// The recorder is built from sys/unix/hints/linux-minimal or
// nethack-c/macosx-minimal, whose CFLAGS (-I../include, plus -DNOTPARMDECL
// -DNO_TIMED_DELAY on macOS) define none of these, so each follows from the
// headers alone. `clang -E -dM` of hack.h with those flags agrees, on Linux
// against the built recorder tree and with -D__APPLE__ -D__MACH__ against
// the unpatched headers; no patch under nethack-c/patches/ changes a struct
// below.
export const MACROS = {
    // unixconf.h:224, which global.h:164 includes because config.h:18
    // defines UNIX.
    ALTMETA: true,
    // global.h:277-278, for UNIX.
    HANGUPHANDLING: true,
    // config.h:304.
    PANICLOG: true,
    // config.h:616.
    STATUS_HILITES: true,
    // config.h:55-56, since neither hints file defines NOTTYGRAPHICS.
    TTY_GRAPHICS: true,
    // config.h:607-608 leave both commented out.
    TTY_SOUND_ESCCODES: false,
    TTY_TILES_ESCCODES: false,
    // Only windconf.h:13 defines LAN_FEATURES, and global.h:171 includes
    // windconf.h only for WIN32.
    LAN_FEATURES: false,
    // Only pcconf.h:9 and amiconf.h:46 define MICRO; global.h includes them
    // only for MSDOS and AMIGA.
    MICRO: false,
    // config1.h:19-22 defines MSDOS only for a compiler that predefines
    // __MSDOS__ (or MSDOS itself), and config.h:20 leaves it commented out.
    MSDOS: false,
    // config1.h:121-131 defines WIN32 only for _WIN32 or _WIN32_WCE.
    WIN32: false,
};

// Sizes of the char arrays, from context.h's CONTEXTVERBSZ, global.h's BUFSZ,
// flag.h:109's NUM_DISCLOSURE_OPTIONS and objclass.h:136-142's MAXOCLASSES,
// which follows RANDOM_CLASS and defsym.h:466-484's 17 OBJCLASS entries.
// Enumerators such as flag.h's WC_COUNT are read from the headers.
const ARRAY_SIZES = {
    CONTEXTVERBSZ: 30, BUFSZ: 256, NUM_DISCLOSURE_OPTIONS: 6, MAXOCLASSES: 18,
};

// js/music.js holds the hero's jingle as the byte values of its five notes
// and terminator, which it compares and renders one at a time.
const BYTE_ARRAYS = new Set(['context_info.jingle']);

// js/options.js holds flags.inv_order and flags.pickup_types as the object
// class numbers before C's terminating NUL, so their zero, an empty C string,
// is an empty list.
const BYTE_LISTS = new Set(['flag.inv_order', 'flag.pickup_types']);

// js/options.js and js/end.js hold flags.end_disclose as one option letter
// per disclosure category, without C's terminating NUL, so its zero is that
// many empty strings.
const CHAR_ARRAYS = new Set(['flag.end_disclose']);

// js/tty_message.js and js/options.js hold the msg_window style as the
// option letter ('s', 'f', 'c', 'r'), and js/options.js, js/invent.js and
// js/o_init.js hold flags.sortloot and flags.discosort as the option letter,
// so their zero is the empty string.
const CHAR_TEXT = new Set([
    'instance_flags.prevmsg_window', 'flag.sortloot', 'flag.discosort',
]);

const INTEGER_TYPES = new Set([
    'int', 'unsigned', 'unsigned int', 'long', 'unsigned long', 'short',
    'schar', 'uchar', 'xint8', 'xint16', 'coordxy', 'size_t', 'char',
    'uint32_t',
]);
// Typedefs of a pointer type: tradstdc.h:178 `typedef genericptr
// genericptr_t`.
const POINTER_TYPES = new Set(['genericptr_t']);

export const TARGETS = [
    {
        output: 'js/context.js',
        headers: ['context.h', 'coord.h', 'dungeon.h'],
        roots: [{ root: 'context_info', table: 'CONTEXT_STRUCTS' }],
        source: 'include/context.h, coord.h and dungeon.h',
        about: [
            'C zero-initializes svc.context. Each zero_<struct>() returns a new',
            'object holding every field of that struct at C\'s zero value, and',
            'js/jsmain.js creates state.context from zero_context_info().',
        ],
    },
    {
        output: 'js/flag.js',
        headers: ['flag.h', 'coord.h', 'color.h'],
        roots: [
            { root: 'instance_flags', table: 'INSTANCE_FLAGS_STRUCTS' },
            { root: 'flag', table: 'FLAG_STRUCTS' },
        ],
        source: 'include/flag.h, coord.h and color.h',
        about: [
            'C zero-initializes iflags and flags. Each zero_<struct>() returns a',
            'new object holding every member of that struct at C\'s zero value;',
            'js/gstate.js creates state.iflags from zero_instance_flags() and',
            'state.flags from zero_flag() at process start, and js/options.js',
            'starts the options it parses from both.',
        ],
    },
    {
        output: 'js/program_state.js',
        headers: ['hack.h'],
        roots: [{ root: 'sinfo', table: 'SINFO_STRUCTS' }],
        source: 'include/hack.h',
        about: [
            'C zero-initializes program_state (struct sinfo). zero_sinfo()',
            'returns a new object holding every member at C\'s zero value, and',
            'js/gstate.js creates state.program_state from it at process start.',
        ],
    },
];

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

// The value of each enumerator of every `enum name { a, b, ... };` whose
// enumerators take no explicit value.
export function parseEnums(source) {
    const values = new Map();
    const block = /\benum\s+\w+\s*\{([^{}]*)\}\s*;/gu;
    for (const match of stripComments(source).matchAll(block)) {
        const names = match[1].split(',').map((name) => name.trim()).filter(Boolean);
        if (names.some((name) => !/^\w+$/u.test(name))) continue;
        names.forEach((name, index) => values.set(name, index));
    }
    return values;
}

// A preprocessor condition: `0`, `defined(X)`, `defined X`, `X`, with `!`,
// `&&`, `||` and parentheses.
function evaluateCondition(expression, macros, structName) {
    const lookup = (name) => {
        if (!(name in macros))
            throw new Error(`${structName}: no configuration for macro ${name}`);
        return macros[name] ? '1' : '0';
    };
    const reduced = expression
        .replace(/\bdefined\s*\(\s*(\w+)\s*\)|\bdefined\s+(\w+)/gu,
            (_, a, b) => lookup(a ?? b))
        .replace(/\b[A-Za-z_]\w*\b/gu, (name) => lookup(name));
    const tokens = reduced.match(/\d+|&&|\|\||[!()]|\S/gu) ?? [];
    let at = 0;
    const fail = () => {
        throw new Error(`${structName}: cannot evaluate #if ${expression}`);
    };
    // or := and ('||' and)*; and := unary ('&&' unary)*;
    // unary := '!' unary | '(' or ')' | number
    const unary = () => {
        const token = tokens[at++];
        if (token === '!') return !unary();
        if (token === '(') {
            const value = or();
            if (tokens[at++] !== ')') fail();
            return value;
        }
        if (!/^\d+$/u.test(token ?? '')) fail();
        return Number(token) !== 0;
    };
    const and = () => {
        let value = unary();
        while (tokens[at] === '&&') {
            at++;
            value = unary() && value;
        }
        return value;
    };
    const or = () => {
        let value = and();
        while (tokens[at] === '||') {
            at++;
            value = and() || value;
        }
        return value;
    };
    const value = or();
    if (at !== tokens.length) fail();
    return value;
}

// The body with its preprocessor directives applied: the lines inside a
// false conditional are dropped, and so is each #define (flag.h defines the
// TER_* constants among the members of instance_flags).
export function preprocessBody(body, macros, structName) {
    const out = [];
    // One entry per open conditional: whether its enclosing text is kept,
    // whether some branch was taken, and whether this branch is kept.
    const stack = [];
    const keeping = () => stack.every((frame) => frame.active);
    for (const line of body.split('\n')) {
        const directive = /^\s*#\s*(\w+)\s*(.*?)\s*$/u.exec(line);
        if (!directive) {
            if (keeping()) out.push(line);
            continue;
        }
        const [, name, rest] = directive;
        const top = stack.at(-1);
        switch (name) {
        case 'ifdef': case 'ifndef': case 'if': {
            const value = name === 'if'
                ? evaluateCondition(rest, macros, structName)
                : evaluateCondition(`defined(${rest})`, macros, structName) === (name === 'ifdef');
            stack.push({ active: value, taken: value });
            break;
        }
        case 'elif':
            if (!top) throw new Error(`${structName}: #elif without #if`);
            top.active = !top.taken && evaluateCondition(rest, macros, structName);
            top.taken ||= top.active;
            break;
        case 'else':
            if (!top) throw new Error(`${structName}: #else without #if`);
            top.active = !top.taken;
            top.taken = true;
            break;
        case 'endif':
            if (!top) throw new Error(`${structName}: #endif without #if`);
            stack.pop();
            break;
        case 'define':
            break;
        default:
            throw new Error(`${structName}: unexpected #${name}`);
        }
    }
    if (stack.length) throw new Error(`${structName}: unterminated #if`);
    return out.join('\n');
}

function parseFields(body, structName, sizes) {
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
        // `volatile` changes nothing about a member's zero value.
        const head = /^((?:struct |unsigned |const )*\w+)\s+(.*)$/u
            .exec(decl.replace(/^volatile /u, ''));
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
                pointer: declarator[1] === '*' || POINTER_TYPES.has(ctype),
                length: declarator[3] === undefined
                    ? null : arrayLength(declarator[3], structName, sizes),
            });
        }
    }
    return fields;
}

function arrayLength(expression, structName, sizes) {
    const value = expression.replace(/[A-Z_]+/gu, (word) => {
        if (!sizes.has(word))
            throw new Error(`${structName}: unknown array size ${word}`);
        return String(sizes.get(word));
    });
    if (!/^[\d +]+$/u.test(value))
        throw new Error(`${structName}: cannot size [${expression}]`);
    return value.split('+').reduce((sum, term) => sum + Number(term), 0);
}

// The struct a field embeds or holds an array of, or null for a scalar or
// pointer.
function memberStruct(field, structs) {
    if (field.pointer) return null;
    const name = field.ctype.replace(/^struct /u, '');
    return structs.has(name) ? name : null;
}

// The struct a field embeds, or null for a scalar, pointer or array.
function embeddedStruct(field, structs) {
    return field.length === null ? memberStruct(field, structs) : null;
}

// The JavaScript zero value of one field, as source text.
function zeroValue(structName, field, structs) {
    const qualified = `${structName}.${field.name}`;
    if (field.pointer) return 'null';
    const nested = memberStruct(field, structs);
    if (field.length !== null) {
        if (nested)
            return `Array.from({ length: ${field.length} }, () => zero_${nested}())`;
        if (BYTE_LISTS.has(qualified)) return '[]';
        if (CHAR_ARRAYS.has(qualified)) return `Array(${field.length - 1}).fill('')`;
        if (field.ctype === 'char' && !BYTE_ARRAYS.has(qualified)) return "''";
        return `Array(${field.length}).fill(0)`;
    }
    if (nested) return `zero_${nested}()`;
    if (field.ctype === 'boolean') return 'false';
    if (CHAR_TEXT.has(qualified)) return "''";
    if (field.ctype.startsWith('Bitfield') || INTEGER_TYPES.has(field.ctype))
        return '0';
    throw new Error(`${qualified}: no zero value for C type ${field.ctype}`);
}

// The root struct and every struct it embeds, each after the ones it uses.
export function collectStructs(sources, root, macros = MACROS) {
    const bodies = new Map();
    const sizes = new Map(Object.entries(ARRAY_SIZES));
    for (const source of sources) {
        for (const [name, body] of parseStructs(source)) bodies.set(name, body);
        for (const [name, value] of parseEnums(source)) sizes.set(name, value);
    }
    // A struct is parsed only when the root reaches it, so an unrelated
    // declaration in a header that this reader cannot follow does no harm.
    const structs = new Map();
    for (const name of bodies.keys()) structs.set(name, null);
    const ordered = [];
    const visit = (name) => {
        if (ordered.includes(name)) return;
        if (!bodies.has(name)) throw new Error(`no definition of struct ${name}`);
        const body = preprocessBody(bodies.get(name), macros, name);
        const fields = parseFields(body, name, sizes);
        structs.set(name, fields);
        for (const field of fields) {
            const nested = memberStruct(field, structs);
            if (nested) visit(nested);
        }
        ordered.push(name);
    };
    visit(root);
    return { structs, ordered };
}

function cType(field) {
    const pointer = field.pointer && !POINTER_TYPES.has(field.ctype) ? ' *' : '';
    const array = field.length === null ? '' : `[${field.length}]`;
    return `${field.ctype}${pointer}${array}`;
}

// One zero_<struct>() for every struct the target's roots reach, each once,
// and one table per root of the structs that root reaches.
export function renderTarget(target, sources) {
    const emitted = new Set();
    const functions = [];
    const tables = [];
    for (const { root, table } of target.roots) {
        const { structs, ordered } = collectStructs(sources, root);
        for (const name of ordered) {
            if (emitted.has(name)) continue;
            emitted.add(name);
            const rows = structs.get(name).map((field) => (
                `        ${field.name}: ${zeroValue(name, field, structs)}, // ${cType(field)}`
            ));
            functions.push(`export function zero_${name}() {\n    return {\n${rows.join('\n')}\n    };\n}\n`);
        }
        const entries = ordered.map((name) => {
            const rows = structs.get(name).map((field) => {
                const nested = embeddedStruct(field, structs);
                return `        [${JSON.stringify(field.name)}, ${JSON.stringify(cType(field))}`
                    + `${nested ? `, ${JSON.stringify(nested)}` : ''}],`;
            });
            return `    ${name}: [\n${rows.join('\n')}\n    ],`;
        });
        tables.push(`export const ${table} = {\n${entries.join('\n')}\n};\n`);
    }
    return '// Generated by scripts/generate-zero-structs.mjs; do not edit.\n'
        + `// Source: NetHack 5.0 ${target.source} at\n`
        + `// ${PINNED_REVISION}.\n`
        + '//\n'
        + target.about.map((line) => `// ${line}\n`).join('')
        + '\n'
        + functions.join('\n')
        + '\n// Each struct\'s fields in declaration order: [name, C type] and, for\n'
        + '// an embedded struct, the name of its struct.\n'
        + tables.join('\n');
}

export function readHeaders(target) {
    return target.headers.map((name) => readFileSync(join(INCLUDE, name), 'utf8'));
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
        throw new Error('Usage: node scripts/generate-zero-structs.mjs [--check]');
    assertPinnedSource();
    for (const target of TARGETS) {
        const path = join(PROJECT_ROOT, target.output);
        const output = renderTarget(target, readHeaders(target));
        if (checkOnly) {
            let existing = '';
            try {
                existing = readFileSync(path, 'utf8');
            } catch {
                // The comparison below reports a missing generated file.
            }
            if (existing !== output) {
                console.error(`${target.output} is stale; run node scripts/generate-zero-structs.mjs`);
                process.exitCode = 1;
            }
        } else {
            writeFileSync(path, output);
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
