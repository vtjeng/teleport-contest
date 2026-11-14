#!/usr/bin/env node

// Classify every C function the port has no same-named JavaScript function
// for, and count the classes for the work log's Completeness table.
//
// The list. Every function parseCFunctions() finds in src/*.c and
// win/tty/*.c (scripts/c-functions.mjs), outside the files
// scripts/not-ported-by-design.mjs names, whose name jsFunctionNames() does
// not find under js/. This is the rule goal-log.mjs roadmap uses for its
// Declared column. A C file can define one name more than once under
// different #if arms; each definition is an entry of its own.
//
// Two rules classify an entry mechanically, in this order:
//
// 1. notCompiled. The recorder's build drops the definition. Each C file is
//    run through the real preprocessor against the recorder's headers, as
//    scripts/c-message-coverage.mjs does (tokenizeMessageSources()). The
//    preprocessor's line markers attribute every surviving token to its
//    source line, so a definition is compiled exactly when some token of its
//    own file sits between its name's line and the line of its body's '{'.
//    An #if arm the configuration turns off leaves no token there. This uses
//    only the repository and a C compiler, so the test can run it anywhere;
//    the coverage recorder's function list would also work, but it lives in
//    an uncommitted cache. The headers carry the recorder's patches; the .c
//    files are the unpatched upstream ones, as in the message coverage. The
//    patches add or remove #if lines in src/ and win/tty/ only inside
//    function bodies (u_init.c, rnd.c) or around code they add (end.c,
//    termcap.c), so none decides whether an upstream definition compiles.
//    When this was written, the rule agreed with the coverage build's
//    function list on every entry.
//
// 2. otherName. A `C ref: <file>.c <name>(` comment in js/ names the entry's
//    own C file and name, and that comment is inside a JavaScript function's
//    body or directly above a definition. acorn parses each js/ file; a
//    comment is inside a body when it lies within the braces (or arrow
//    expression) of any function, and directly above a definition when only
//    whitespace and further comments, with no blank line, separate it from
//    the statement that defines a function: a function declaration, its
//    export, a const/let/var bound to a function or arrow, a method or
//    property whose value is one, or an assignment of one. Consecutive line
//    comments are read as one block, so a reference split across lines
//    still matches. The name must follow the file directly; a line number
//    in between ("allmain.c:73 set_wear(") marks a call site, not a port,
//    and does not match.
//
// Every other entry needs a verdict in scripts/c-function-verdicts.mjs,
// which also gives the categories a person decided.
//
//   node scripts/c-function-map.mjs                  one line per entry
//   node scripts/c-function-map.mjs --json           every entry as JSON
//   node scripts/c-function-map.mjs --summary --json the work log's figures

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import * as acorn from 'acorn';

import { tokenizeMessageSources } from './c-message-coverage.mjs';
import { blankCommentsAndStrings } from './check-namespace-members.mjs';
import {
    PROJECT_ROOT,
    UPSTREAM_ROOT,
    jsFunctionNames,
    listCFiles,
    parseCFunctions,
} from './c-functions.mjs';
import { C_FUNCTION_VERDICTS, VERDICT_CATEGORIES } from './c-function-verdicts.mjs';
import { NOT_PORTED_BY_DESIGN } from './not-ported-by-design.mjs';
import { requireCompiler } from './recorder-headers.mjs';

const JS_ROOT = join(PROJECT_ROOT, 'js');

// The categories, in the order the summary lists them. notCompiled comes
// only from the first rule; otherName comes from the second rule or from a
// verdict; the rest only from verdicts.
export const CATEGORIES = Object.freeze([
    'notCompiled', ...VERDICT_CATEGORIES,
]);

// ---------------------------------------------------------------- C side

/** `file name` identifies an entry; `file` is the C file's basename. */
export const entryKey = (file, name) => `${file} ${name}`;

/**
 * Every C function in a portable file whose name js/ does not define, as
 * `{ file, dir, name, line, endLine, bodyLine }` in file and definition
 * order; `bodyLine` holds the '{' that opens the body.
 */
export function unnamedCFunctions({ root = UPSTREAM_ROOT, jsNames = jsFunctionNames() } = {}) {
    const entries = [];
    for (const { name: file, path } of listCFiles(root)) {
        if (Object.hasOwn(NOT_PORTED_BY_DESIGN, file)) continue;
        const dir = relative(root, path).slice(0, -file.length - 1);
        const text = readFileSync(path, 'utf8');
        const lines = blankCommentsAndStrings(text).split('\n');
        for (const fn of parseCFunctions(text)) {
            if (jsNames.has(fn.name)) continue;
            // The first '{' outside comments and strings opens the body. A
            // definition whose signature has #if arms (tty_nh_poskey) keeps
            // its alternate signatures above that line.
            let bodyLine = fn.line;
            while (bodyLine <= fn.endLine && !lines[bodyLine - 1].includes('{')) bodyLine++;
            if (bodyLine > fn.endLine)
                throw new Error(`${file}:${fn.line} ${fn.name}: no '{' opens its body`);
            entries.push({ file, dir, ...fn, bodyLine });
        }
    }
    return entries;
}

/**
 * The lines of each C source that hold a token after preprocessing, as a
 * map from the source's path under nethack-c/upstream (`src/mail.c`) to a
 * set of 1-based line numbers.
 */
export async function compiledLines({ compiler, jobs = 4 } = {}) {
    return tokenLines(await tokenizeMessageSources({ compiler, jobs }));
}

/** compiledLines() for `{ source, tokens }` pairs already tokenized. */
export function tokenLines(tokenized) {
    const lines = new Map();
    for (const { source, tokens } of tokenized) {
        const set = new Set();
        for (const token of tokens) if (token.file === source) set.add(token.line);
        lines.set(source, set);
    }
    return lines;
}

// ---------------------------------------------------------------- JS side

// `C ref: <file>.c <name>(` or `C refs: <dir>/<file>.c:<name>(`. A digit
// after the colon is a line number, so `allmain.c:73 set_wear(` names a call
// site and does not match.
const C_REF = /C refs?:\s*(?:[\w.-]+\/)*([A-Za-z0-9_-]+\.c)(?:\s+|:(?=[A-Za-z_]))([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu;
// What may follow a name's '(' before the next name of a list: the rest of
// an empty argument list, then a line range such as `(113-123)`.
const AFTER_NAME = /^\)?(?:\s*\(\d+(?:-\d+)?\))?/u;
// The next name of a list: `, name(`, `, and name(`, ` and name(`,
// ` or name(` or `/name(`.
const LIST_NAME = /^(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\/)([A-Za-z_][A-Za-z0-9_]*)\s*\(/u;

/**
 * The C functions a comment's text names in `C ref:` form, as
 * `{ file, name }`. After the first name, a list that continues with
 * `, name()`, `and name()` or `/name()` names more functions of the same
 * file: "C refs: options.c handler_msgtype(), query_msgtype(),
 * free_one_msgtype()".
 */
export function cRefNames(text) {
    const names = [];
    for (const m of text.matchAll(C_REF)) {
        names.push({ file: m[1], name: m[2] });
        let rest = text.slice(m.index + m[0].length);
        for (;;) {
            rest = rest.slice(AFTER_NAME.exec(rest)[0].length);
            const next = LIST_NAME.exec(rest);
            if (!next) break;
            names.push({ file: m[1], name: next[1] });
            rest = rest.slice(next[0].length);
        }
    }
    return names;
}

function walk(node, visit, parent = null) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent);
    for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) walk(child, visit, node);
        } else if (value && typeof value.type === 'string') {
            walk(value, visit, node);
        }
    }
}

const isFunction = (node) => node && (node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression');

/**
 * Where a JS file's functions are: `bodies`, the [start, end) character
 * ranges of every function body, and `definitions`, a map from the start of
 * each statement or member that defines a function to the function's name
 * (or null when it has none).
 */
export function functionSites(ast) {
    const bodies = [];
    const definitions = new Map();
    const nameOf = (node) => node?.type === 'Identifier' ? node.name
        : node?.type === 'Literal' ? String(node.value) : null;
    walk(ast, (node) => {
        if (isFunction(node)) bodies.push([node.body.start, node.body.end]);
        if (node.type === 'FunctionDeclaration')
            definitions.set(node.start, nameOf(node.id));
        else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
            const d = node.declaration;
            if (d?.type === 'FunctionDeclaration') definitions.set(node.start, nameOf(d.id));
            else if (d?.type === 'VariableDeclaration') {
                const fn = d.declarations.find((v) => isFunction(v.init));
                if (fn) definitions.set(node.start, nameOf(fn.id));
            }
        } else if (node.type === 'VariableDeclaration') {
            const fn = node.declarations.find((v) => isFunction(v.init));
            if (fn) definitions.set(node.start, nameOf(fn.id));
        } else if ((node.type === 'Property' || node.type === 'MethodDefinition'
            || node.type === 'PropertyDefinition') && isFunction(node.value)) {
            definitions.set(node.start, nameOf(node.key));
        } else if (node.type === 'ExpressionStatement'
            && node.expression.type === 'AssignmentExpression'
            && isFunction(node.expression.right)) {
            const left = node.expression.left;
            definitions.set(node.start, nameOf(left.type === 'MemberExpression' ? left.property : left));
        }
    });
    return { bodies, definitions };
}

/** The names of the functions one JS file's source defines, methods included. */
export function definedNames(source) {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    return new Set([...functionSites(ast).definitions.values()].filter(Boolean));
}

/**
 * Group a file's comments into blocks: consecutive comments separated only
 * by whitespace holding at most one line break. Each block is
 * `{ start, end, text }`.
 */
function commentBlocks(source, comments) {
    const blocks = [];
    for (const c of comments) {
        const last = blocks.at(-1);
        const gap = last ? source.slice(last.end, c.start) : null;
        if (last && /^[ \t\r]*\n?[ \t\r]*$/u.test(gap)) {
            last.end = c.end;
            last.text += `\n${c.value}`;
        } else {
            blocks.push({ start: c.start, end: c.end, text: c.value });
        }
    }
    return blocks;
}

/**
 * The `C ref: <file>.c <name>(` references in one JS file's source that sit
 * inside a function body or directly above a definition, as
 * `{ file, name, line, placement, jsFunction }`. `placement` is 'body' or
 * 'above'; `jsFunction` is the function defined below an 'above' reference.
 */
export function cRefsInSource(source) {
    const comments = [];
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', onComment: comments,
    });
    const { bodies, definitions } = functionSites(ast);
    const lineOf = (offset) => source.slice(0, offset).split('\n').length;
    const refs = [];
    for (const block of commentBlocks(source, comments)) {
        const matches = cRefNames(block.text);
        if (matches.length === 0) continue;
        let placement = null;
        let jsFunction = null;
        if (bodies.some(([start, end]) => block.start >= start && block.end <= end)) {
            placement = 'body';
        } else {
            const after = /^[ \t\r]*\n?[ \t\r]*/u.exec(source.slice(block.end))[0];
            const next = block.end + after.length;
            if (definitions.has(next)) {
                placement = 'above';
                jsFunction = definitions.get(next);
            }
        }
        if (!placement) continue;
        const line = lineOf(block.start);
        for (const m of matches) refs.push({ ...m, line, placement, jsFunction });
    }
    return refs;
}

function jsFiles(directory, out = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) jsFiles(path, out);
        else if (entry.name.endsWith('.js')) out.push(path);
    }
    return out.sort();
}

/** Every accepted C ref under js/, as a map from entryKey() to its sites. */
export function cRefs(jsRoot = JS_ROOT) {
    const refs = new Map();
    for (const path of jsFiles(jsRoot)) {
        const where = relative(PROJECT_ROOT, path);
        for (const ref of cRefsInSource(readFileSync(path, 'utf8'))) {
            const key = entryKey(ref.file, ref.name);
            if (!refs.has(key)) refs.set(key, []);
            refs.get(key).push({ ...ref, path: where });
        }
    }
    return refs;
}

// ---------------------------------------------------------------- the map

/**
 * Classify every entry. Returns `{ entries, unusedVerdicts }`: each entry
 * gains `category` (null when nothing classifies it) and `evidence`, and
 * `unusedVerdicts` lists the verdict keys that no entry needed.
 */
export function classify(entries, { compiled, refs, verdicts = C_FUNCTION_VERDICTS }) {
    const used = new Set();
    const classified = entries.map((entry) => {
        const key = entryKey(entry.file, entry.name);
        const source = `${entry.dir}/${entry.file}`;
        const lines = compiled.get(source);
        if (!lines) throw new Error(`no preprocessed text for ${source}`);
        let compiledLine = false;
        for (let line = entry.line; line <= entry.bodyLine && !compiledLine; line++)
            compiledLine = lines.has(line);
        if (!compiledLine)
            return { ...entry, category: 'notCompiled', evidence: `${source}:${entry.line} leaves no token after preprocessing` };
        const sites = refs.get(key);
        if (sites) {
            const site = sites[0];
            return {
                ...entry, category: 'otherName',
                evidence: `${site.path}:${site.line} C ref ${site.placement === 'above'
                    ? `above ${site.jsFunction ?? 'an unnamed function'}` : 'in a function body'}`,
            };
        }
        const verdict = verdicts[key];
        if (verdict) {
            used.add(key);
            return {
                ...entry, category: verdict.category,
                evidence: verdict.js ? `${verdict.js}: ${verdict.reason}` : verdict.reason,
                verdict,
            };
        }
        return { ...entry, category: null, evidence: null };
    });
    const unusedVerdicts = Object.keys(verdicts).filter((key) => !used.has(key));
    return { entries: classified, unusedVerdicts };
}

export async function buildFunctionMap({ compiler = requireCompiler('the map needs the C preprocessor'), jobs = 4 } = {}) {
    const entries = unnamedCFunctions();
    const [compiled, refs] = [await compiledLines({ compiler, jobs }), cRefs()];
    return classify(entries, { compiled, refs });
}

/**
 * The work log's figures: the total, each category's count, how many of
 * them a rule decided and how many a verdict did, and the unported functions
 * with a visible effect.
 */
export function summarize(entries) {
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    let byRule = 0;
    let unclassified = 0;
    for (const e of entries) {
        if (e.category === null) unclassified++;
        else counts[e.category]++;
        if (e.category !== null && !e.verdict) byRule++;
    }
    return {
        total: entries.length,
        counts,
        byRule,
        byVerdict: entries.length - byRule - unclassified,
        unclassified,
        unportedVisible: entries.filter((e) => e.category === 'unportedVisible')
            .map((e) => ({ file: e.file, name: e.name, line: e.line, reason: e.evidence })),
    };
}

async function main(args) {
    const { entries, unusedVerdicts } = await buildFunctionMap();
    if (args.includes('--summary')) {
        const summary = { ...summarize(entries), staleVerdicts: unusedVerdicts };
        if (args.includes('--json')) console.log(JSON.stringify(summary, null, 1));
        else console.log(summary);
    } else if (args.includes('--json')) {
        console.log(JSON.stringify(entries, null, 1));
    } else {
        for (const e of entries)
            console.log(`${e.dir}/${e.file}:${e.line}\t${e.name}\t${e.category ?? '-'}\t${e.evidence ?? ''}`);
    }
}

if (process.argv[1] && basename(process.argv[1]) === 'c-function-map.mjs')
    await main(process.argv.slice(2));
