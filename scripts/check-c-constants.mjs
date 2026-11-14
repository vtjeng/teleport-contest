#!/usr/bin/env node

// Check the port's numeric constants against the C compiler.
//
// Every integer constant that a js/ module declares at top level (exported
// or not), and every upper-case const that a function initializes with a
// number literal, is written into a generated C file as
//
//     _Static_assert((C_NAME) == (value), "NAME");
//
// and the file is compiled against the recorder's headers
// (scripts/recorder-headers.mjs), so each value is checked by the compiler
// rather than by a parser of #define lines. Enum members, constants defined
// by expressions, and #ifdef-selected values are all checked. The method
// follows the compiler-verified constants check in
// https://mazesofmenace.ai/seeing-snakes/.
//
// C_NAME is the js/ name, or its C spelling: C_ALIASES names it, or a C name
// that differs only in case (display.c T_d for T_D) supplies it.
//
// The compiler sorts each name into one of four results:
//   match       the assertion holds;
//   mismatch    the assertion fails; a second, compiled-and-run program
//               prints C's value;
//   variable    C defines the name, but not as an integer constant
//               expression (a variable, or a macro that reads one);
//   undefined   the C headers do not declare the name.
//
// A name that one of the recorder's .c files #defines or lists in an enum is
// asserted again inside a copy of that file: just before the #undef that
// ends a local macro, or else at the end. Of the names still undefined, the
// report marks those that some header defines outside the recorder's
// configuration (the Amiga, curses and X11 window ports, for example); the
// rest are port-only names, which PORT_ONLY lists with reasons. A js/ name
// that is not upper case is checked only when C declares it.
//
// The check fails when a mismatch is not listed in KNOWN_MISMATCHES; the
// test (check-c-constants.test.mjs) also pins the exception lists.
//
//   node scripts/check-c-constants.mjs           print the summary and lists
//   node scripts/check-c-constants.mjs --json    print every result as JSON

import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
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
]);

// js/ names that spell a C constant differently, other than by case alone
// (which cSpellings() finds by itself), mapped to the C name, or to the C
// integer constant expression the port's value stands for. Each is checked
// against that C name or expression.
export const C_ALIASES = new Map([
    // const.js names prop.h's FROMFORM, FROMRACE and FROMEXPER masks this
    // way; attrib.c's FROM_FORM, FROM_RACE and FROM_ROLE are innately()'s
    // return codes, which js/attrib.js calls INNATE_*.
    ['FROM_FORM', 'FROMFORM'],
    ['FROM_RACE', 'FROMRACE'],
    ['FROM_ROLE', 'FROMEXPER'],
    ['INNATE_NONE', 'FROM_NONE'],
    ['INNATE_ROLE', 'FROM_ROLE'],
    ['INNATE_RACE', 'FROM_RACE'],
    ['INNATE_INTR', 'FROM_INTR'],
    ['INNATE_EXP', 'FROM_EXP'],
    ['INNATE_FORM', 'FROM_FORM'],
    ['INNATE_LYCN', 'FROM_LYCN'],
    // hack.h's scatter() flags.
    ['SCATTER_MAY_HITMON', 'MAY_HITMON'],
    ['SCATTER_MAY_HITYOU', 'MAY_HITYOU'],
    ['SCATTER_MAY_HIT', 'MAY_HIT'],
    ['SCATTER_MAY_DESTROY', 'MAY_DESTROY'],
    ['SCATTER_MAY_FRACTURE', 'MAY_FRACTURE'],
    ['SCATTER_VIS_EFFECTS', 'VIS_EFFECTS'],
    // wintype.h's inventory-mode enumerators.
    ['INV_NORMAL', 'InvNormal'],
    ['INV_SHOW_GOLD', 'InvShowGold'],
    ['INV_SPARSE', 'InvSparse'],
    ['INV_IN_USE', 'InvInUse'],
    ['INVOPT_NONE', 'InvOptNone'],
    ['INVOPT_ON', 'InvOptOn'],
    ['INVOPT_FULL', 'InvOptFull'],
    ['INVOPT_ON_GRID', 'InvOptOn_grid'],
    ['INVOPT_FULL_GRID', 'InvOptFull_grid'],
    ['INVOPT_IN_USE', 'InvOptInUse'],
    // pager.c's checkfile() flags.
    ['CHKFIL_USR_TYPED', 'chkfilUsrTyped'],
    ['CHKFIL_DONT_ASK', 'chkfilDontAsk'],
    ['CHKFIL_IA_CHECK', 'chkfilIaCheck'],
    // read.c's do_genocide() flags.
    ['GENOCIDE_REALLY', 'REALLY'],
    ['GENOCIDE_PLAYER', 'PLAYER'],
    ['GENOCIDE_ONTHRONE', 'ONTHRONE'],
    // display.c's map_location() display flags.
    ['DISPLAY_PHYSICALLY_SEEN', 'PHYSICALLY_SEEN'],
    ['DISPLAY_DETECTED', 'DETECTED'],
    // sp_lev.c's vertical alignments.
    ['SPLEV_TOP', 'TOP'],
    ['SPLEV_BOTTOM', 'BOTTOM'],
    // attrib.h's count of attributes.
    ['NUM_ATTRS', 'A_MAX'],
    // apply.c's enum jump_trajectory.
    ['JUMP_ANY', 'jAny'],
    ['JUMP_HORZ', 'jHorz'],
    ['JUMP_VERT', 'jVert'],
    ['JUMP_DIAG', 'jDiag'],
    // attrib.c's exercise tuning value.
    ['EXERCISE_LIMIT', 'AVAL'],
    // eat.c's tintxts[] ends in an empty terminator row, which the port's
    // table leaves out.
    ['TIN_VARIETY_COUNT', 'TTSZ - 1'],
    // files.c's novel-passage scopes.
    ['SECTION', 'SECTIONSCOPE'],
    ['TITLE', 'TITLESCOPE'],
    ['PASSAGE', 'PASSAGESCOPE'],
    // defsym.h's boomerang map symbols.
    ['S_BOOMLEFT', 'S_boomleft'],
    ['S_BOOMRIGHT', 'S_boomright'],
    // spell.c's spell-retention value for a freshly learned spell.
    ['SPELL_KNOWLEDGE_KEEN', 'KEEN'],
    // getpos.c get_count()'s limit in cmd.c.
    ['MAX_COMMAND_COUNT', 'LARGEST_INT'],
    // optlist.h's index of the roguesymset option.
    ['ROGUESYMSET_INDEX', 'opt_roguesymset'],
    // Buffer sizes the port derives from C expressions.
    ['JINGLE_SIZE', 'SIZE(svc.context.jingle)'],
    ['ROOM_STRING_SIZE', 'SIZE(u.urooms)'],
    ['PET_NAME_BYTE_LIMIT', 'PL_PSIZ - 1'],
    ['PLAYER_NAME_BYTE_LIMIT', 'PL_NSIZ - 1'],
    ['OPTION_ELEMENT_BYTE_LIMIT', 'BUFSZ / 2'],
    ['CONFIG_BUFFER_BYTE_CAPACITY', '4 * BUFSZ'],
    ['OPTION_WRAP_COLUMN', 'COLNO - 5'],
    ['LEVEL_ONE_SPELL_POWER', 'SPELL_LEV_PW(1)'],
]);

// Upper-case js/ names with no C counterpart in the recorder's build, with
// the reason. The test fails when such a name is added to js/ without an
// entry here, or when an entry here no longer names a port-only constant.
const portOnly = (reason, names) => names.map((name) => [name, reason]);
export const PORT_ONLY = new Map([
    ...portOnly('glibc 2.39 regex internals (posix/regex_internal.h, regcomp.c),'
        + ' which no installed header declares', [
        'ANCHOR', 'BACK_SLASH', 'BITSET_WORD_BITS', 'BRACKET_NAME_BUF_SIZE', 'BUF_FIRST',
        'BUF_LAST', 'CHAR_CLASS', 'CHARACTER', 'COLL_SYM', 'CONCAT', 'CONTEXT_BEGBUF',
        'CONTEXT_ENDBUF', 'CONTEXT_NEWLINE', 'CONTEXT_WORD', 'END_OF_RE', 'EPSILON_BIT',
        'EQUIV_CLASS', 'INSIDE_NOTWORD', 'INSIDE_WORD', 'LINE_FIRST', 'LINE_LAST',
        'NEWLINE_CHAR', 'NEXT_ENDBUF_CONSTRAINT', 'NEXT_NEWLINE_CONSTRAINT',
        'NEXT_NOTWORD_CONSTRAINT', 'NEXT_WORD_CONSTRAINT', 'NON_TYPE', 'NOT_WORD_DELIM',
        'NOT_WORD_DELIM_CONSTRAINT', 'OP_ALT', 'OP_BACK_REF', 'OP_CHARSET_RANGE',
        'OP_CLOSE_BRACKET', 'OP_CLOSE_CHAR_CLASS', 'OP_CLOSE_COLL_ELEM', 'OP_CLOSE_DUP_NUM',
        'OP_CLOSE_EQUIV_CLASS', 'OP_CLOSE_SUBEXP', 'OP_DUP_ASTERISK', 'OP_DUP_PLUS',
        'OP_DUP_QUESTION', 'OP_NON_MATCH_LIST', 'OP_NOTSPACE', 'OP_NOTWORD',
        'OP_OPEN_BRACKET', 'OP_OPEN_CHAR_CLASS', 'OP_OPEN_COLL_ELEM', 'OP_OPEN_DUP_NUM',
        'OP_OPEN_EQUIV_CLASS', 'OP_OPEN_SUBEXP', 'OP_PERIOD', 'OP_SPACE', 'OP_WORD',
        'PREV_BEGBUF_CONSTRAINT', 'PREV_NEWLINE_CONSTRAINT', 'PREV_NOTWORD_CONSTRAINT',
        'PREV_WORD_CONSTRAINT', 'SB_CHAR', 'SBC_MAX', 'SIMPLE_BRACKET', 'SUBEXP',
        'WORD_DELIM', 'WORD_DELIM_CONSTRAINT', 'WORD_FIRST', 'WORD_LAST',
    ]),
    ...portOnly('a key byte that C writes as a character literal',
        ['BACKSPACE', 'CTRL_P', 'DELETE', 'ESC']),
    ...portOnly('the terminal\'s erase and kill characters, which unixtty.c reads from'
        + ' the terminal; the port fixes the recorder\'s values', ['ERASE_CHAR', 'KILL_CHAR']),
    ...portOnly('C\'s (char) EOF, -1, as the unsigned byte the port reads',
        ['CHAR_EOF', 'EOF_BYTE']),
    ...portOnly('from date.h, which makedefs writes at build time; pinned to the'
        + ' recorder build\'s value', ['BUILD_TIME', 'IGNORED_FEATURES']),
    ...portOnly('the port\'s model of the recorder\'s time zone, where C calls localtime()',
        ['HOUR_MILLIS', 'NEW_YORK_DAYLIGHT_OFFSET_MILLIS', 'TRANSITION_PROBE_MILLIS']),
    ['RECORDER_UID', 'the value getuid() answers for the recorder\'s process, which files.c'
        + ' and topten.c read at run time'],
    ...portOnly('a count of entries in a dat/*.lua level file', [
        'RAN_GOAL_TRAP_COUNT', 'RAN_LOCA_OBJECT_COUNT', 'SAM_STRT_LEVEL_TRAP_COUNT',
        'WIZ_GOAL_RANDOM_TRAP_COUNT',
    ]),
    ...portOnly('the port\'s result codes for a part of a C function it splits out',
        ['LOOKAROUND_CONTINUE', 'LOOKAROUND_STOP', 'SWIM_DANGER_AVOID', 'SWIM_DANGER_CONTINUE',
            'SWIM_DANGER_FORCE']),
    ...portOnly('options.c doset() and doset_simple_menu() local values (indexoffset,'
        + ' the help entry\'s k = -2)', ['DOSET_INDEXOFFSET', 'SIMPLE_HELP_A_INT', 'SIMPLE_HELP_K']),
    ...portOnly('the OR of C flags that are checked by their own names',
        ['CUSTOMPLINE_FLAGS', 'ORIGIN_MASK']),
    ['DONAME_BODY_CAPACITY', 'BUFSZ - PREFIX - 1; objnam.c\'s PREFIX is checked as PREFIX'],
    ['FEATURE_NOTICE_3_7_0', 'the result of cfgfiles.c get_feature_notice_ver("3.7.0")'],
    ['OVERWRITE_FILENAME_LIMIT', 'derived from the length of cfgfiles.c\'s prompt format'],
    ['SPACE_VISIBLE_ATTRS', 'the attributes frozen/screen-decode.mjs paints on a space'],
    ['STATUS_HP_BAR_WIDTH', 'the width of the hit-point bar that wintty.c draws over the'
        + ' 30-column status field'],
    ['SVC_START', 'a byte offset in the recorder\'s layout of the svc globals'],
    ['TTY_STATUS_WIDTH', 'COLNO - 1, the width wintty.c gives a status line'],
    ['UNSEEN_OBJECT_PRICE', 'the port\'s largest-price sentinel; JavaScript has no long'],
]);

// The constants a module declares, in three kinds:
//   exported  `export const name`, or a top-level const exported by name;
//   local     a top-level const the module does not export;
//   nested    an upper-case const inside a function, initialized by a
//             number literal (its value is read from the literal:
//             `{ name, value }`).
// Names of any case are returned; see `claimed` in collectJsConstants().
// Locals are read by importing the module with an extra export statement
// (localExportsHook); nested values cannot be imported at all.
export function declaredConstants(source) {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const topLevel = [];
    const exported = [];
    const exportedLocals = new Set();
    for (const node of ast.body) {
        const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
        if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') {
            for (const declarator of declaration.declarations) {
                if (declarator.id.type !== 'Identifier') continue;
                (declaration === node ? topLevel : exported).push(declarator.id.name);
            }
        }
        if (node.type === 'ExportNamedDeclaration' && !node.declaration && !node.source) {
            for (const specifier of node.specifiers) {
                exportedLocals.add(specifier.local.name);
                if (specifier.exported.type === 'Identifier') exported.push(specifier.exported.name);
            }
        }
    }
    const local = topLevel.filter((name) => !exportedLocals.has(name));
    const nested = [];
    const visit = (node, inFunction) => {
        if (!node || typeof node.type !== 'string') return;
        if (inFunction && node.type === 'VariableDeclaration' && node.kind === 'const') {
            for (const declarator of node.declarations) {
                const value = numberLiteral(declarator.init);
                if (declarator.id.type === 'Identifier' && CONSTANT_NAME.test(declarator.id.name)
                    && value !== null)
                    nested.push({ name: declarator.id.name, value });
            }
        }
        const inside = inFunction || /Function/u.test(node.type);
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) child.forEach((c) => visit(c, inside));
            else if (child && typeof child === 'object') visit(child, inside);
        }
    };
    visit(ast, false);
    return { exported, local, nested };
}

// The value of a number literal, or of a negated one; otherwise null.
function numberLiteral(node) {
    if (node?.type === 'Literal' && typeof node.value === 'number') return node.value;
    if (node?.type === 'UnaryExpression' && node.operator === '-') {
        const value = numberLiteral(node.argument);
        return value === null ? null : -value;
    }
    return null;
}

// The export name under which localExportsHook exposes a module's local
// constant. A string name cannot collide with any identifier the module
// exports itself.
const localExportName = (name) => `c-constants:${name}`;

// A module loader hook that appends `export { NAME as "c-constants:NAME" }`
// to every js/ module for each of its local constants, so that importing the
// module yields their values as computed at load time.
function localExportsHook(declared, loaded) {
    const jsDirUrl = pathToFileURL(`${JS_DIR}/`).href;
    return {
        load(url, context, nextLoad) {
            const result = nextLoad(url, context);
            if (!url.startsWith(jsDirUrl) || result.format !== 'module') return result;
            loaded.add(url);
            const source = String(result.source);
            const { local } = declared(url, source);
            if (local.length === 0) return result;
            const list = local.map((name) => `${name} as ${JSON.stringify(localExportName(name))}`);
            return { ...result, source: `${source}\nexport { ${list.join(', ')} };\n` };
        },
    };
}

// The integer constants js/ declares, as [{ name, value, module, kind,
// claimed }], sorted by name. Exported and local values come from importing
// each module, so a constant defined by an expression has its computed
// value. An upper-case name is `claimed`: it reads as a C constant's name,
// and when C has no such constant it must be listed in PORT_ONLY. A name in
// any other case (S_stone, InvOptOn, maxLength) is checked only when C
// declares it as an integer constant.
export async function collectJsConstants() {
    const constants = [];
    const importErrors = [];
    // Each module is parsed once, by whichever of the loop below and the
    // hook (for a module another one imports first) reaches it first.
    const parsed = new Map();
    const declared = (url, source) => {
        if (!parsed.has(url)) parsed.set(url, declaredConstants(source));
        return parsed.get(url);
    };
    const loaded = new Set();
    const hooks = registerHooks(localExportsHook(declared, loaded));
    try {
        for (const file of readdirSync(JS_DIR).sort()) {
            if (!file.endsWith('.js') || FROZEN_JS.has(file)) continue;
            const url = pathToFileURL(join(JS_DIR, file)).href;
            const { exported, local, nested } = declared(url, readFileSync(join(JS_DIR, file), 'utf8'));
            for (const { name, value } of nested) {
                if (Number.isSafeInteger(value))
                    constants.push({ name, value, module: file, kind: 'nested', claimed: true });
            }
            if (exported.length === 0 && local.length === 0) continue;
            let module;
            try {
                module = await import(url);
                // A module this process loaded before the hook existed (the
                // test runner's --import of scripts/strict-argument-misuses.mjs
                // loads js/gstate.js) lacks the extra exports. A second copy,
                // under another URL, goes through the hook; its own imports
                // still resolve to the modules already loaded.
                if (!loaded.has(url)) {
                    const copy = `${url}?c-constants`;
                    module = await import(copy);
                    if (!loaded.has(copy)) throw new Error('the module loader hook did not run');
                }
            } catch (error) {
                importErrors.push({ module: file, error: String(error) });
                continue;
            }
            const read = [
                ...exported.map((name) => ({ name, key: name, kind: 'exported' })),
                ...local.map((name) => ({ name, key: localExportName(name), kind: 'local' })),
            ];
            for (const { name, key, kind } of read) {
                // Report a constant the module did not expose rather than
                // miss it.
                if (!(key in module)) {
                    importErrors.push({ module: file, error: `${name} was not exported to the check` });
                    continue;
                }
                const value = module[key];
                if (Number.isSafeInteger(value))
                    constants.push({ name, value, module: file, kind, claimed: CONSTANT_NAME.test(name) });
            }
        }
    } finally {
        hooks.deregister();
    }
    constants.sort((a, b) => a.name.localeCompare(b.name) || a.module.localeCompare(b.module));
    return { constants, importErrors };
}

// The header check's opening lines: the recorder's headers, <regex.h>, and
// the enum that mcastu.c builds from mcastu.h.
function prelude() {
    return [
        '#include "hack.h"',
        // js/regcomp.js and js/regex_internal.js port the host's (glibc's)
        // regex, which the recorder links through sys/share/posixregex.c,
        // the file that includes <regex.h> after hack.h this way.
        '#include <regex.h>',
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

const assertEqual = (c) => `_Static_assert((${c.cName}) == (${c.value}LL), "${c.name}");`;

function pushCanaries(lines, lineOf) {
    lineOf.set(lines.length + 1, 'canary-mismatch');
    lines.push(CANARY_MISMATCH);
    lineOf.set(lines.length + 1, 'canary-undefined');
    lines.push(CANARY_UNDEFINED);
}

export function renderAssertions(constants) {
    const lines = prelude();
    const lineOf = new Map();
    for (const [index, c] of constants.entries()) {
        lineOf.set(lines.length + 1, index);
        lines.push(assertEqual(c));
    }
    pushCanaries(lines, lineOf);
    return { text: `${lines.join('\n')}\n`, lineOf };
}

// The index of the line that #undefs `name` after the file first #defines
// it, or -1.
function undefLine(sourceLines, name) {
    const define = new RegExp(`^\\s*#\\s*define\\s+${name}\\b`, 'u');
    const undef = new RegExp(`^\\s*#\\s*undef\\s+${name}\\b`, 'u');
    const start = sourceLines.findIndex((line) => define.test(line));
    if (start === -1) return -1;
    return sourceLines.findIndex((line, index) => index > start && undef.test(line));
}

// A copy of the .c file `sourceFile` with each entry's lines from
// `linesFor(entry)` (as [tag, text] pairs) inserted where its name is in
// scope: just before the #undef that ends a local macro, or else at the end
// of the file. lineOf maps each inserted line to `${index}:${tag}`.
export function renderInSource(entries, sourceFile, linesFor) {
    const source = readFileSync(join(UPSTREAM_ROOT, sourceFile), 'utf8').split('\n');
    const before = new Map();
    const atEnd = [];
    entries.forEach((entry, index) => {
        const at = undefLine(source, cKey(entry.cName));
        if (at === -1) atEnd.push(index);
        else before.set(at, [...(before.get(at) ?? []), index]);
    });
    const lines = [];
    const lineOf = new Map();
    const emit = (index) => {
        for (const [tag, text] of linesFor(entries[index])) {
            lineOf.set(lines.length + 1, `${index}:${tag}`);
            lines.push(text);
        }
    };
    source.forEach((line, at) => {
        (before.get(at) ?? []).forEach(emit);
        lines.push(line);
    });
    atEnd.forEach(emit);
    pushCanaries(lines, lineOf);
    return { text: `${lines.join('\n')}\n`, lineOf };
}

// Sort compiler errors on the assertion lines into results. clang and gcc
// word these diagnostics differently; both forms are recognized. Any other
// error on an assertion line (comparing a struct, say) is 'other'; errors
// elsewhere are returned as unexplained.
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
            results.set(index, 'other');
    }
    return { results, unexplained };
}

// One entry's result inside a .c file, from its assertion and the twin
// that asserts the opposite: exactly one of the two fails when both were
// compiled. Inside a copied .c file a syntax error near an inserted line
// could otherwise leave an assertion unevaluated and read as a match.
export function pairResult(equal, twin) {
    if (equal === 'undefined' || equal === 'variable' || equal === 'other') return equal;
    if (equal === 'mismatch' && twin === undefined) return 'mismatch';
    if (equal === undefined && twin === 'mismatch') return 'match';
    return null;
}

function compile(compiler, args) {
    return spawnSync(compiler, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

// clang stops after 20 errors unless told otherwise; gcc does not stop.
function errorLimitFlags(compiler) {
    const version = spawnSync(compiler, ['--version'], { encoding: 'utf8' }).stdout ?? '';
    return /clang/u.test(version) ? ['-ferror-limit=0'] : ['-fmax-errors=0'];
}

// Compiles `text` as `cFile` for its diagnostics; resolves to { stderr }.
function syntaxCheck(compiler, headers, cFile, text) {
    writeFileSync(cFile, text);
    const args = ['-fsyntax-only', ...errorLimitFlags(compiler), '-w', `-I${headers.includeDir}`, cFile];
    return new Promise((resolve, reject) => {
        const child = spawn(compiler, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        const chunks = [];
        child.stderr.on('data', (chunk) => chunks.push(chunk));
        child.on('error', reject);
        child.on('close', () => resolve({ stderr: Buffer.concat(chunks).toString('utf8') }));
    });
}

// Runs `task` on each item, at most availableParallelism() at a time.
async function mapConcurrently(items, task) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await task(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(availableParallelism(), items.length) }, worker));
    return results;
}

// A scratch file name for work on `sourceFile`, distinct per source file so
// that concurrent compiles do not share one.
const scratchName = (prefix, sourceFile) => `${prefix}-${sourceFile.replace(/[^\w.]/gu, '_')}`;

function requireCanaries(compiler, results, stderr) {
    if (results.get('canary-mismatch') !== 'mismatch' || results.get('canary-undefined') !== 'undefined')
        throw new Error(`${compiler}'s diagnostics were not recognized:\n${stderr.slice(0, 2000)}`);
}

// Runs `run` (which resolves to { results, stderr }, results by index) once
// for each distinct C name and value among `entries`, and returns each
// entry's result by index. gcc reports an undeclared name only at its first
// use in a file, so a second assertion of the same name would read as
// 'other'. A claimed name whose result is 'other' stops the check.
async function distinctly(entries, run) {
    const keyOf = (e) => `${e.cName}\n${e.value}`;
    const unique = [...new Map(entries.map((e) => [keyOf(e), e])).values()];
    const indexOf = new Map(unique.map((e, index) => [keyOf(e), index]));
    const { results, stderr } = await run(unique);
    const byEntry = new Map(entries.map((e, index) => [index, results.get(indexOf.get(keyOf(e)))]));
    for (const [index, result] of byEntry) {
        if (result === 'other' && entries[index].claimed)
            throw new Error(`unexpected compiler error on ${entries[index].name}'s assertion:\n${stderr.slice(0, 2000)}`);
    }
    return byEntry;
}

// Compile the header assertions for `entries` and return each entry's
// result by index. Any compiler error off the assertion lines is fatal.
function runAssertions(compiler, headers, entries) {
    return distinctly(entries, async (unique) => {
        const { text, lineOf } = renderAssertions(unique);
        const cFile = join(headers.dir, 'constants.c');
        const { stderr } = await syntaxCheck(compiler, headers, cFile, text);
        const { results, unexplained } = classifyDiagnostics(stderr, cFile, lineOf);
        requireCanaries(compiler, results, stderr);
        if (unexplained.length > 0)
            throw new Error(`unexpected compiler errors:\n${unexplained.slice(0, 20).join('\n')}`);
        return { results, stderr };
    });
}

// The same, inside a copy of the .c file that defines the entries' names.
// Errors outside the assertion lines are ignored: the file is compiled
// against the Lua stub.
function runSourceAssertions(compiler, headers, entries, sourceFile) {
    return distinctly(entries, async (unique) => {
        const { text, lineOf } = renderInSource(unique, sourceFile, (c) => [
            ['equal', assertEqual(c)],
            ['twin', `_Static_assert(!((${c.cName}) == (${c.value}LL)), "${c.name} twin");`],
        ]);
        const cFile = join(headers.dir, scratchName('local', sourceFile));
        const { stderr } = await syntaxCheck(compiler, headers, cFile, text);
        const { results } = classifyDiagnostics(stderr, cFile, lineOf);
        requireCanaries(compiler, results, stderr);
        return {
            stderr,
            results: new Map(unique.map((entry, index) => {
                const result = pairResult(results.get(`${index}:equal`), results.get(`${index}:twin`));
                if (result === null)
                    throw new Error(`${entry.name}'s assertions in ${sourceFile} were not both compiled`);
                return [index, result];
            })),
        };
    });
}

// C's values for the header names whose assertions failed, from a program
// that prints them.
function cValues(compiler, headers, names) {
    if (names.length === 0) return new Map();
    const source = [
        ...prelude(),
        '#include <stdio.h>',
        'int main(void) {',
        ...names.map((n, i) => `    printf("${i} %lld\\n", (long long) (${n}));`),
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
        const [index, value] = line.split(' ');
        return [names[Number(index)], Number(value)];
    }));
}

// C's values for names a .c file defines. A whole .c file does not link on
// its own; each value is read from a failing assertion instead, which clang
// prints with its operands. gcc does not, and these values stay unknown
// under gcc.
async function sourceValues(compiler, headers, names, sourceFile) {
    if (names.length === 0) return new Map();
    const entries = names.map((name) => ({ cName: name }));
    const { text, lineOf } = renderInSource(entries, sourceFile, ({ cName: name }) => [
        ['value', `_Static_assert((long long) (${name}) == -9223372036854775807LL - 1, "${name}");`],
    ]);
    const cFile = join(headers.dir, scratchName('values', sourceFile));
    const compiled = await syntaxCheck(compiler, headers, cFile, text);
    const values = new Map();
    const escaped = cFile.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = new RegExp(`^${escaped}:(\\d+):\\d+: note: expression evaluates to '(-?\\d+) ==`, 'gmu');
    for (const match of compiled.stderr.matchAll(pattern)) {
        const tag = lineOf.get(Number(match[1]));
        if (tag) values.set(names[Number(tag.split(':')[0])], Number(match[2]));
    }
    return values;
}

// Names defined only in headers the recorder build does not include, such
// as the Amiga or curses window ports' headers.
function otherHeaderDefinitions(names) {
    const wanted = new Set(names);
    const found = new Map();
    const dir = join(UPSTREAM_ROOT, 'include');
    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith('.h')) continue;
        for (const name of definedNames(readFileSync(join(dir, file), 'utf8'))) {
            if (wanted.has(name) && !found.has(name)) found.set(name, file);
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

// The .c files the recorder compiles besides src/*.c: the tty window port
// and the Unix system files (sys/unix/Makefile.src, WINTTYSRC, SYSSRC and
// REGEXOBJ).
const OTHER_SOURCES = [
    'win/tty/getline.c', 'win/tty/termcap.c', 'win/tty/topl.c', 'win/tty/wintty.c',
    'sys/share/ioctl.c', 'sys/share/unixtty.c', 'sys/share/posixregex.c',
    'sys/unix/unixmain.c', 'sys/unix/unixunix.c', 'sys/unix/unixres.c',
];

function recorderSources() {
    const src = readdirSync(join(UPSTREAM_ROOT, 'src')).filter((f) => f.endsWith('.c')).sort();
    return [...src.map((f) => `src/${f}`), ...OTHER_SOURCES];
}

// The names a C file defines with #define or lists in an enum. A textual
// scan: it finds where to look, and the compiler then decides.
function definedNames(text) {
    const names = [];
    // Object-like macros only: a function-like macro is not a constant.
    for (const match of text.matchAll(/^\s*#\s*define\s+([A-Za-z_]\w*)\b(?!\()/gmu)) names.push(match[1]);
    for (const body of text.matchAll(/\benum\b[^{;]*\{([^}]*)\}/gu)) {
        const members = body[1].replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
        for (const member of members.matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*(?==|,|$)/gu)) names.push(member[1]);
    }
    return names;
}

// For each name that a recorder .c file defines, which the header check
// cannot see, the files that define it.
function sourceFileDefinitions(names) {
    const wanted = new Set(names);
    const found = new Map();
    for (const file of recorderSources()) {
        for (const name of definedNames(readFileSync(join(UPSTREAM_ROOT, file), 'utf8'))) {
            if (!wanted.has(name)) continue;
            if (!found.has(name)) found.set(name, []);
            if (!found.get(name).includes(file)) found.get(name).push(file);
        }
    }
    return found;
}

// The .c file whose definition of a name a js/ constant is checked against:
// the one named like the module (js/dogmove.js, src/dogmove.c) when it
// defines the name, else the first in the build's order.
function sourceFileFor(files, module) {
    return files.find((file) => basename(file, '.c') === basename(module, '.js')) ?? files[0];
}

// The name to look a C spelling up by: the spelling itself, or the first
// identifier of an expression in C_ALIASES ('TTSZ - 1' is looked up as TTSZ).
const cKey = (cName) => cName.match(/[A-Za-z_]\w*/u)[0];

// The C spelling of each upper-case js/ name. C_ALIASES names it outright;
// otherwise a C name that differs from the js/ name only in case (display.c
// T_d, global.h builtin_opt) is that name's C spelling when it is the only
// such name. Everything else is looked up as spelled.
function cSpellings(names) {
    const byFolded = new Map();
    const files = [
        ...readdirSync(join(UPSTREAM_ROOT, 'include')).filter((f) => f.endsWith('.h')).map((f) => `include/${f}`),
        ...recorderSources(),
    ];
    for (const file of files) {
        for (const name of definedNames(readFileSync(join(UPSTREAM_ROOT, file), 'utf8'))) {
            const folded = name.toUpperCase();
            if (!byFolded.has(folded)) byFolded.set(folded, new Set());
            byFolded.get(folded).add(name);
        }
    }
    return new Map(names.map((name) => {
        if (C_ALIASES.has(name)) return [name, C_ALIASES.get(name)];
        const spellings = [...(byFolded.get(name) ?? [])];
        if (spellings.includes(name) || spellings.length !== 1) return [name, name];
        return [name, spellings[0]];
    }));
}

export async function checkConstants({ compiler }) {
    const { constants, importErrors } = await collectJsConstants();
    return { compiler, entries: await compareWithC(compiler, constants), importErrors };
}

// Each of `constants` ({ name, value, module, claimed }) with its result and,
// for a mismatch, C's value.
export async function compareWithC(compiler, constants) {
    const spelling = cSpellings([...new Set(constants.filter((c) => c.claimed).map((c) => c.name))]);
    const headers = prepareRecorderIncludes();
    try {
        const named = constants.map((c) => ({ ...c, cName: spelling.get(c.name) ?? c.name }));
        const results = await runAssertions(compiler, headers, named);
        const entries = named.map((c, index) => ({ ...c, result: results.get(index) ?? 'match' }));
        const undefinedNames = entries.filter((e) => e.result === 'undefined').map((e) => cKey(e.cName));
        const inSource = sourceFileDefinitions(undefinedNames);
        // A name a .c file defines is checked again in that file's context.
        const bySource = new Map();
        for (const e of entries.filter((x) => x.result === 'undefined' && inSource.has(cKey(x.cName)))) {
            const file = sourceFileFor(inSource.get(cKey(e.cName)), e.module);
            if (!bySource.has(file)) bySource.set(file, []);
            bySource.get(file).push(e);
        }
        await mapConcurrently([...bySource], async ([file, group]) => {
            const local = await runSourceAssertions(compiler, headers, group, file);
            group.forEach((e, index) => {
                e.result = local.get(index);
                if (e.result === 'undefined') e.where = `#defined in ${file}, but not in the recorder's configuration`;
                else e.definedIn = file;
            });
        });
        // An unclaimed name that C does not declare as an integer constant
        // is an ordinary JavaScript name; drop it.
        for (let i = entries.length - 1; i >= 0; i--) {
            if (!entries[i].claimed && !['match', 'mismatch'].includes(entries[i].result)) entries.splice(i, 1);
        }
        const functionLike = headerMacros(compiler, headers);
        const otherHeaders = otherHeaderDefinitions(
            entries.filter((e) => e.result === 'undefined').map((e) => cKey(e.cName)));
        for (const e of entries.filter((x) => x.result === 'undefined' && !x.where)) {
            if (functionLike.has(cKey(e.cName))) e.where = 'function-like macro in the headers';
            else if (otherHeaders.has(cKey(e.cName)))
                e.where = `defined in include/${otherHeaders.get(cKey(e.cName))}, but not in the recorder's configuration`;
            else if (PORT_ONLY.has(e.name)) e.portOnly = PORT_ONLY.get(e.name);
        }
        const mismatched = entries.filter((e) => e.result === 'mismatch');
        for (const e of mismatched) {
            const reason = KNOWN_MISMATCHES.get(e.name);
            if (reason) e.known = reason;
        }
        const headerValues = cValues(compiler, headers,
            [...new Set(mismatched.filter((e) => !e.definedIn).map((e) => e.cName))]);
        for (const e of mismatched.filter((x) => !x.definedIn)) e.cValue = headerValues.get(e.cName);
        await mapConcurrently([...bySource], async ([file, group]) => {
            const names = [...new Set(group.filter((e) => e.result === 'mismatch').map((e) => e.cName))];
            const values = await sourceValues(compiler, headers, names, file);
            for (const e of group.filter((x) => x.result === 'mismatch')) e.cValue = values.get(e.cName);
        });
        return entries;
    } finally {
        headers.cleanup();
    }
}

function printReport({ entries, importErrors }) {
    const by = (result) => entries.filter((e) => e.result === result);
    const undefinedEntries = by('undefined');
    const portOnly = undefinedEntries.filter((e) => !e.where);
    for (const e of by('mismatch')) {
        console.log(`MISMATCH ${e.name}${e.cName === e.name ? '' : ` (C ${e.cName})`}: js/${e.module} has ${e.value}, C has ${e.cValue}`
            + `${e.definedIn ? ` in ${e.definedIn}` : ''}${e.known ? ` (known: ${e.known})` : ''}`);
    }
    for (const e of by('variable')) console.log(`VARIABLE ${e.name} (js/${e.module})`);
    for (const e of undefinedEntries.filter((x) => x.where))
        console.log(`NOT-IN-BUILD ${e.name} (js/${e.module}): ${e.where}`);
    for (const e of portOnly)
        console.log(`PORT-ONLY ${e.name} (js/${e.module})${e.portOnly ? '' : ' (not in PORT_ONLY)'}`);
    for (const e of importErrors) console.log(`IMPORT-ERROR js/${e.module}: ${e.error}`);
    const local = entries.filter((e) => e.definedIn).length;
    const failing = by('mismatch').filter((e) => !e.known).length;
    console.log(`c-constants: ${entries.length} js/ integer constants checked;`
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
