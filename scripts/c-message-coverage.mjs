#!/usr/bin/env node

// List C message texts that appear nowhere in the JavaScript port.
//
// A message the C program can print but whose text the port does not contain
// marks a code path the port has not implemented, and usually one no recorded
// game has reached. The method follows the string-literal coverage check
// described in https://mazesofmenace.ai/seeing-snakes/.
//
// C side: every C file the recorder links on Linux (MESSAGE_SOURCES) is run
// through the real preprocessor against the recorder's headers
// (scripts/recorder-headers.mjs), so code that the recorder's configuration
// compiles out (#if 0, #ifdef WIN32, and so on) is not reported, and macros
// such as pline1() expand to the calls they stand for. In the preprocessed
// text, each call to a MESSAGE_FUNCTIONS name contributes the string literals
// among its arguments, with adjacent literals joined as C joins them. A literal
// of MIN_LITERAL_LENGTH or more characters is split at its printf conversions
// (%s, %d, %%, ...) and at control characters; the longest piece, trimmed of
// surrounding spaces, is the fragment to look for.
//
// JavaScript side: every string literal, template-literal piece, and constant
// '+' concatenation of literals in js/*.js, decoded from JavaScript escapes.
// Comments are not searched, so a C quotation in a comment does not count as
// coverage. A fragment is covered when it occurs verbatim in one of those
// strings.
//
//   node scripts/c-message-coverage.mjs            write docs/c-message-coverage.md
//   node scripts/c-message-coverage.mjs --check    fail if that file is stale
//   node scripts/c-message-coverage.mjs --json     print every entry as JSON

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as acorn from 'acorn';

import {
    PROJECT_ROOT,
    UPSTREAM_ROOT,
    findCompiler,
    prepareRecorderIncludes,
} from './recorder-headers.mjs';

export const REPORT_PATH = join(PROJECT_ROOT, 'docs', 'c-message-coverage.md');
const JS_DIR = join(PROJECT_ROOT, 'js');

// The scorer replaces these files with its own copies; they hold no messages.
const FROZEN_JS = new Set(['isaac64.js', 'terminal.js', 'storage.js']);

// Calls whose string arguments the player can see: the pline.c family, the
// tty window port's raw output, prompts, and the error reports.
export const MESSAGE_FUNCTIONS = new Set([
    'pline', 'pline_dir', 'pline_xy', 'pline_mon', 'pline_The',
    'custompline', 'urgent_pline', 'Norep',
    'You', 'Your', 'You_feel', 'You_cant', 'You_hear', 'You_see', 'There',
    'verbalize',
    'raw_printf', 'raw_print', 'putstr',
    'impossible', 'panic',
    'yn_function', 'yn', 'ynq', 'getlin',
]);

export const MIN_LITERAL_LENGTH = 14;
// A piece this short ("the", "%s's") matches almost anywhere and says nothing.
export const MIN_FRAGMENT_LENGTH = 6;

// The C files nethack-c/build-recorder.sh links on Linux: every file in src/
// and win/tty/, and the SYSSRC and REGEXOBJ files of the linux-minimal hints.
const SYSTEM_SOURCES = [
    'sys/share/ioctl.c',
    'sys/share/posixregex.c',
    'sys/share/unixtty.c',
    'sys/unix/unixmain.c',
    'sys/unix/unixres.c',
    'sys/unix/unixunix.c',
];

export function messageSources() {
    const inDir = (dir) => readdirSync(join(UPSTREAM_ROOT, dir))
        .filter((name) => name.endsWith('.c'))
        .map((name) => `${dir}/${name}`);
    return [...inDir('src'), ...inDir('win/tty'), ...SYSTEM_SOURCES].sort();
}

// ---------------------------------------------------------------- C side

const C_ESCAPES = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v',
    '\\': '\\', '\'': '\'', '"': '"', '?': '?', e: '\x1b' };

export function decodeCString(body) {
    let out = '';
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch !== '\\') { out += ch; continue; }
        const next = body[++i];
        if (/[0-7]/u.test(next)) {
            let digits = next;
            while (digits.length < 3 && /[0-7]/u.test(body[i + 1] ?? '')) digits += body[++i];
            out += String.fromCharCode(parseInt(digits, 8));
        } else if (next === 'x') {
            let digits = '';
            while (/[0-9a-fA-F]/u.test(body[i + 1] ?? '')) digits += body[++i];
            out += String.fromCharCode(parseInt(digits, 16));
        } else {
            out += C_ESCAPES[next] ?? next;
        }
    }
    return out;
}

// Tokenize preprocessor output. Each token records the source file and line
// that the preprocessor's line markers attribute it to.
export function tokenizePreprocessed(text) {
    const tokens = [];
    let file = '';
    let line = 1;
    let i = 0;
    let atLineStart = true;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '\n') { line++; i++; atLineStart = true; continue; }
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f' || ch === '\v') { i++; continue; }
        if (atLineStart && ch === '#') {
            const end = text.indexOf('\n', i);
            const directive = text.slice(i, end === -1 ? text.length : end);
            const marker = /^#\s*(?:line\s+)?(\d+)\s+"((?:[^"\\]|\\.)*)"/u.exec(directive);
            if (marker) {
                line = Number(marker[1]) - 1; // the newline below advances it
                file = marker[2];
            }
            i = end === -1 ? text.length : end;
            continue;
        }
        atLineStart = false;
        const start = i;
        if (ch === '"' || ch === '\'') {
            i++;
            while (i < text.length && text[i] !== ch) i += text[i] === '\\' ? 2 : 1;
            i++;
            const body = text.slice(start + 1, i - 1);
            tokens.push({ type: ch === '"' ? 'string' : 'char', value: body, file, line });
            continue;
        }
        if (/[A-Za-z_]/u.test(ch)) {
            while (i < text.length && /[A-Za-z0-9_]/u.test(text[i])) i++;
            const word = text.slice(start, i);
            // An encoding prefix (L"", u8"") belongs to the literal after it.
            if (text[i] === '"' && /^(?:L|u8?|U)$/u.test(word)) continue;
            tokens.push({ type: 'ident', value: word, file, line });
            continue;
        }
        if (/[0-9]/u.test(ch) || (ch === '.' && /[0-9]/u.test(text[i + 1]))) {
            while (i < text.length && /[0-9A-Za-z_.]/u.test(text[i])) i++;
            tokens.push({ type: 'number', value: text.slice(start, i), file, line });
            continue;
        }
        i++;
        tokens.push({ type: 'punct', value: ch, file, line });
    }
    return tokens;
}

// Tokens from "save_plnmsg" to the pline( of an expanded debugpline*():
// "save_plnmsg = iflags . last_msg ;".
const DEBUG_LOOKBACK = 6;

// Report groups. A diagnostic reports a bug in the game and a debug trace
// needs sysconf DEBUGFILES, so neither prints in a correct recorded game.
export const KINDS = ['gameplay', 'diagnostic', 'debug'];
export function messageKind(callee, debugTrace) {
    if (debugTrace) return 'debug';
    if (callee === 'impossible' || callee === 'panic') return 'diagnostic';
    return 'gameplay';
}

// Return the index of the token matching the opener at `open`.
function matchingClose(tokens, open, openChar, closeChar) {
    let depth = 0;
    for (let j = open; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.type !== 'punct') continue;
        if (t.value === openChar) depth++;
        else if (t.value === closeChar && --depth === 0) return j;
    }
    return tokens.length - 1;
}

function matchingOpen(tokens, close, openChar, closeChar) {
    let depth = 0;
    for (let j = close; j >= 0; j--) {
        const t = tokens[j];
        if (t.type !== 'punct') continue;
        if (t.value === closeChar) depth++;
        else if (t.value === openChar && --depth === 0) return j;
    }
    return 0;
}

// Find every message call in the tokens of one preprocessed file and return
// its string arguments. Only calls located in `sourceFile` itself count;
// header code is attributed to the headers.
export function extractMessageCalls(tokens, sourceFile) {
    const calls = [];
    let depth = 0;
    let currentFunction = null;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'punct' && t.value === '{') {
            if (depth === 0) {
                // A function body opens at file scope after "name ( ... )".
                const prev = tokens[i - 1];
                currentFunction = null;
                if (prev?.type === 'punct' && prev.value === ')') {
                    const open = matchingOpen(tokens, i - 1, '(', ')');
                    const name = tokens[open - 1];
                    if (name?.type === 'ident') currentFunction = name.value;
                }
            }
            depth++;
            continue;
        }
        if (t.type === 'punct' && t.value === '}') {
            depth = Math.max(0, depth - 1);
            if (depth === 0) currentFunction = null;
            continue;
        }
        if (depth === 0 || t.type !== 'ident' || !MESSAGE_FUNCTIONS.has(t.value)) continue;
        if (tokens[i + 1]?.type !== 'punct' || tokens[i + 1].value !== '(') continue;
        if (t.file !== sourceFile) continue;
        const close = matchingClose(tokens, i + 1, '(', ')');
        // debugpline*() expands, under the DEBUG the recorder build defines,
        // to "if (showdebug(__FILE__)) { int save_plnmsg = iflags.last_msg;
        // pline(...)" (include/lint.h ifdebug()). Such a trace prints only
        // for files listed in sysconf DEBUGFILES. No other code declares
        // save_plnmsg.
        const debugTrace = tokens.slice(Math.max(0, i - DEBUG_LOOKBACK), i)
            .some((b) => b.type === 'ident' && b.value === 'save_plnmsg');
        const literals = [];
        let run = null;
        for (let j = i + 2; j < close; j++) {
            const a = tokens[j];
            // A literal equal to the file name is __FILE__ from a macro in the
            // arguments, such as the recorder's rn2() logging wrapper.
            if (a.type === 'string' && a.value !== sourceFile) {
                if (run) run.text += decodeCString(a.value);
                else run = { text: decodeCString(a.value), line: a.line };
            } else if (run) {
                literals.push(run);
                run = null;
            }
        }
        if (run) literals.push(run);
        calls.push({
            callee: t.value,
            function: currentFunction,
            line: t.line,
            kind: messageKind(t.value, debugTrace),
            literals,
        });
    }
    return calls;
}

// printf conversions: flags, width, precision, length modifier, conversion.
const PRINTF_CONVERSION = /%[-+ #0']*(?:\*|\d+)?(?:\.(?:\*|\d+))?(?:hh|h|ll|l|L|z|j|t|q)?[diouxXeEfFgGaAcspn%]/gu;
const CONTROL_CHARS = /[\x00-\x1f\x7f]+/gu;

export function longestFragment(literal) {
    let best = '';
    for (const piece of literal.split(PRINTF_CONVERSION)) {
        for (const part of piece.split(CONTROL_CHARS)) {
            const trimmed = part.trim();
            if (trimmed.length > best.length) best = trimmed;
        }
    }
    return best;
}

function preprocess(compiler, includeDir, sourcePath) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(compiler, ['-E', `-I${includeDir}`, sourcePath], {
            cwd: UPSTREAM_ROOT,
        });
        const out = [];
        const err = [];
        child.stdout.on('data', (chunk) => out.push(chunk));
        child.stderr.on('data', (chunk) => err.push(chunk));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`${compiler} -E ${sourcePath} failed:\n${Buffer.concat(err)}`));
            } else {
                resolvePromise(Buffer.concat(out).toString('latin1'));
            }
        });
    });
}

async function mapLimited(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

// Every message literal in the recorder's C sources, one entry per distinct
// (file, function, fragment), in source order.
export async function collectCMessages({ compiler, jobs = 2 } = {}) {
    const headers = prepareRecorderIncludes();
    try {
        const sources = messageSources();
        const texts = await mapLimited(sources, jobs,
            (source) => preprocess(compiler, headers.includeDir, source));
        const entries = [];
        let shortFragments = 0;
        sources.forEach((source, index) => {
            const tokens = tokenizePreprocessed(texts[index]);
            const seen = new Set();
            for (const call of extractMessageCalls(tokens, source)) {
                for (const literal of call.literals) {
                    if (literal.text.length < MIN_LITERAL_LENGTH) continue;
                    const fragment = longestFragment(literal.text);
                    if (fragment.length < MIN_FRAGMENT_LENGTH) { shortFragments++; continue; }
                    const key = `${call.function}\0${fragment}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    entries.push({
                        file: source,
                        function: call.function ?? '(file scope)',
                        line: literal.line,
                        callee: call.callee,
                        kind: call.kind,
                        literal: literal.text,
                        fragment,
                    });
                }
            }
        });
        return { entries, shortFragments };
    } finally {
        headers.cleanup();
    }
}

// ---------------------------------------------------------------- JS side

// The fixed text of a string expression, as the runs between its holes: a
// literal is one run, a template literal has a hole at each ${...}, and a
// '+' joins the last run of its left side to the first run of its right
// side. Any other expression is a hole. So `${a} have ` + 'difficulty.'
// yields ['', ' have difficulty.'], matching a C "%s have difficulty."
// that the port wrapped across two source lines.
//
// A conditional between strings, where C has a ternary in its arguments or
// two calls, is expanded: the result is a list of alternatives, one runs list
// for each way the conditionals can go, up to MAX_ALTERNATIVES; past that the
// conditional is a hole. An identifier that its function declares exactly
// once, as a const with a string initializer, stands for that initializer's
// text, so `const verb = c ? 'rises' : 'falls'; ... \`${name} ${verb}!\``
// yields both messages; `lookup` resolves such names.
const MAX_ALTERNATIVES = 64;
const HOLE = [['', '']];

function joinRuns(left, right) {
    return [...left.slice(0, -1), left.at(-1) + right[0], ...right.slice(1)];
}

function product(lefts, rights) {
    if (lefts.length * rights.length > MAX_ALTERNATIVES) return null;
    return lefts.flatMap((l) => rights.map((r) => joinRuns(l, r)));
}

function textAlternatives(node, lookup = () => null, seen = new Set()) {
    if (node.type === 'Literal' && typeof node.value === 'string') return [[node.value]];
    if (node.type === 'TemplateLiteral') {
        let alts = [[node.quasis[0].value.cooked ?? node.quasis[0].value.raw]];
        node.expressions.forEach((expression, index) => {
            const quasi = node.quasis[index + 1];
            const inner = textAlternatives(expression, lookup, seen);
            const withInner = product(alts, inner) ?? product(alts, HOLE);
            alts = withInner.map((runs) => joinRuns(runs, [quasi.value.cooked ?? quasi.value.raw]));
        });
        return alts;
    }
    if (node.type === 'BinaryExpression' && node.operator === '+')
        return product(textAlternatives(node.left, lookup, seen),
            textAlternatives(node.right, lookup, seen))
            ?? product(textAlternatives(node.left, lookup, seen), HOLE);
    if (node.type === 'ConditionalExpression') {
        const alts = [...textAlternatives(node.consequent, lookup, seen),
            ...textAlternatives(node.alternate, lookup, seen)];
        return alts.length > MAX_ALTERNATIVES ? HOLE : alts;
    }
    const init = node.type === 'Identifier' && !seen.has(node.name) ? lookup(node.name) : null;
    if (init) {
        seen.add(node.name);
        const alts = textAlternatives(init, lookup, seen);
        seen.delete(node.name);
        return alts;
    }
    return HOLE;
}

const STRING_NODES = new Set(['Literal', 'TemplateLiteral', 'BinaryExpression', 'ConditionalExpression']);
const FUNCTION_NODES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function children(node) {
    const out = [];
    for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) out.push(...child.filter((c) => c && typeof c.type === 'string'));
        else if (child && typeof child === 'object' && typeof child.type === 'string') out.push(child);
    }
    return out;
}

// For each function (and the module), the names it declares: a const with a
// string-like initializer maps to that initializer, and any other
// declaration, parameter, or repeat declaration maps to null.
function declarationsByFunction(ast) {
    const scopes = new Map();
    const declare = (scope, name, init) => {
        const names = scopes.get(scope);
        names.set(name, names.has(name) ? null : init);
    };
    const walk = (node, scope, parent) => {
        if (FUNCTION_NODES.has(node.type)) {
            scopes.set(node, new Map());
            for (const param of node.params)
                if (param.type === 'Identifier') declare(node, param.name, null);
            scope = node;
        }
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
            const stringy = parent.kind === 'const' && node.init && STRING_NODES.has(node.init.type);
            declare(scope, node.id.name, stringy ? node.init : null);
        }
        for (const child of children(node)) walk(child, scope, node);
    };
    scopes.set(ast, new Map());
    walk(ast, ast, null);
    return scopes;
}

export function jsStringsOf(source) {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const scopes = declarationsByFunction(ast);
    const strings = [];
    const visit = (node, parent, stack) => {
        if (FUNCTION_NODES.has(node.type)) stack = [...stack, node];
        const isChain = node.type === 'BinaryExpression' && node.operator === '+';
        const chainRoot = isChain
            && !(parent?.type === 'BinaryExpression' && parent.operator === '+');
        if (chainRoot || node.type === 'TemplateLiteral') {
            // The innermost function that declares the name decides.
            const lookup = (name) => {
                for (let i = stack.length - 1; i >= 0; i--) {
                    const names = scopes.get(stack[i]);
                    if (names.has(name)) return names.get(name);
                }
                return null;
            };
            for (const runs of textAlternatives(node, lookup))
                strings.push(...runs.filter((run) => run !== ''));
        } else if (!isChain && node.type === 'Literal' && typeof node.value === 'string') {
            strings.push(node.value);
        }
        // Descend for the strings inside holes, such as call arguments.
        for (const child of children(node)) visit(child, node, stack);
    };
    visit(ast, null, [ast]);
    return strings;
}

export function collectJsStrings() {
    const strings = [];
    for (const name of readdirSync(JS_DIR).sort()) {
        if (!name.endsWith('.js') || FROZEN_JS.has(name)) continue;
        strings.push(...jsStringsOf(readFileSync(join(JS_DIR, name), 'utf8')));
    }
    // NUL never occurs in a C message fragment, so it separates strings.
    return strings.join('\0');
}

// ---------------------------------------------------------------- report

function jsModuleExists(cFile) {
    const base = cFile.split('/').pop().replace(/\.c$/u, '.js');
    return readdirSync(JS_DIR).includes(base);
}

// Inline code for a fragment: JSON escapes for control characters, and a
// longer backtick fence when the text itself holds a backtick.
function code(text) {
    const body = JSON.stringify(text).slice(1, -1).replace(/\\"/gu, '"');
    return body.includes('`') ? `\`\` ${body} \`\`` : `\`${body}\``;
}

const KIND_HEADINGS = {
    gameplay: 'Missing gameplay messages',
    diagnostic: 'Missing diagnostics (impossible, panic)',
    debug: 'Missing debug traces (debugpline)',
};

export function renderReport({ entries, shortFragments }) {
    const files = [...new Set(entries.map((e) => e.file))].sort();
    const count = (list, kind) => list.filter((e) => e.kind === kind).length;
    const missing = entries.filter((e) => !e.covered);
    const lines = [];
    const push = (...more) => lines.push(...more);
    push('# C message coverage', '',
        '<!-- Generated by scripts/c-message-coverage.mjs; do not edit. -->', '',
        'This report lists message texts that the C program can print and that',
        'appear nowhere in the string literals of `js/`. Each one marks a path the',
        'port has not implemented, or one it builds from different pieces.',
        '`scripts/c-message-coverage.mjs` describes the method. After changing',
        'messages in `js/`, regenerate the report:', '',
        '```', 'node scripts/c-message-coverage.mjs', '```', '',
        'A gameplay message is any other message call. A diagnostic',
        '(`impossible()`, `panic()`) reports a bug in the game, and a debug trace',
        '(`debugpline*()`) prints only for files named in sysconf `DEBUGFILES`;',
        'neither appears in a correct recorded game.', '',
        `Message literals of ${MIN_LITERAL_LENGTH} or more characters: ${entries.length + shortFragments}.`,
        `Of these, ${shortFragments} have no fixed piece of ${MIN_FRAGMENT_LENGTH} or more characters and are not checked.`, '',
        '| Kind | Checked | Found in `js/` | Missing |',
        '| --- | ---: | ---: | ---: |');
    for (const kind of KINDS) {
        const checked = count(entries, kind);
        const lost = count(missing, kind);
        push(`| ${kind} | ${checked} | ${checked - lost} | ${lost} |`);
    }
    push(`| total | ${entries.length} | ${entries.length - missing.length} | ${missing.length} |`, '',
        '## Missing by C file', '',
        'The JS module column says whether `js/` has a module with the C file\'s name.', '',
        '| C file | JS module | Gameplay | Diagnostic | Debug |',
        '| --- | --- | ---: | ---: | ---: |');
    for (const file of files) {
        const lost = missing.filter((e) => e.file === file);
        if (lost.length === 0) continue;
        push(`| ${file} | ${jsModuleExists(file) ? 'yes' : 'no'} | ${KINDS.map((k) => count(lost, k)).join(' | ')} |`);
    }
    for (const kind of KINDS) {
        push('', `## ${KIND_HEADINGS[kind]}`, '',
            'Each line gives the C line, the message function, and the fragment searched for.');
        for (const file of files) {
            const lost = missing.filter((e) => e.file === file && e.kind === kind);
            if (lost.length === 0) continue;
            push('', `### ${file}`);
            let fn = null;
            for (const e of lost) {
                if (e.function !== fn) {
                    fn = e.function;
                    push('', `- \`${fn}()\``);
                }
                push(`  - ${e.line} ${e.callee}: ${code(e.fragment)}`);
            }
        }
    }
    push('');
    return lines.join('\n');
}

export async function buildCoverage({ compiler, jobs } = {}) {
    const { entries, shortFragments } = await collectCMessages({ compiler, jobs });
    const corpus = collectJsStrings();
    for (const e of entries) e.covered = corpus.includes(e.fragment);
    return { entries, shortFragments };
}

async function main() {
    const args = process.argv.slice(2);
    const compiler = findCompiler();
    if (!compiler) {
        console.error('c-message-coverage: no C compiler (clang, cc, or gcc) found');
        process.exit(2);
    }
    const jobsArg = args.find((a) => a.startsWith('--jobs='));
    const jobs = jobsArg ? Number(jobsArg.slice(7)) : 2;
    const coverage = await buildCoverage({ compiler, jobs });
    if (args.includes('--json')) {
        process.stdout.write(`${JSON.stringify(coverage, null, 1)}\n`);
        return;
    }
    const report = renderReport(coverage);
    const rel = relative(PROJECT_ROOT, REPORT_PATH);
    if (args.includes('--check')) {
        let current = '';
        try { current = readFileSync(REPORT_PATH, 'utf8'); } catch { /* missing */ }
        if (current !== report) {
            console.error(`${rel} is stale; run node scripts/c-message-coverage.mjs`);
            process.exit(1);
        }
        console.log(`${rel} is current`);
        return;
    }
    writeFileSync(REPORT_PATH, report);
    const missing = coverage.entries.filter((e) => !e.covered).length;
    console.log(`wrote ${rel}: ${coverage.entries.length} checked, ${missing} missing`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
