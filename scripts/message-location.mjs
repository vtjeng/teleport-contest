#!/usr/bin/env node

// Checks that each message the port prints carries a map location exactly
// where C's carries one.
//
// C's pline.c prints every message through vpline(). pline_mon(), pline_xy()
// and pline_dir() call set_msg_xy() first, and a caller can call set_msg_xy()
// itself before pline(), You() and the rest of the family. When the
// accessiblemsg option is on, vpline() prefixes a message that has a location
// with it, as in "(east): The monkey tries to run away with your cloak.";
// every other message has no prefix. The port gives a message its location
// with js/pline.js pline_mon(), consume_msg_xy() after set_msg_xy(), or
// js/startup_a11y.js messageAt(), and each JS message site chooses one by
// hand. This check pairs each C message site with its JS site and reports a
// pair whose choices differ.
//
// C side: the preprocessed sources (scripts/c-message-coverage.mjs) give
// each call to a pline.c function, the function that contains it, and its
// format argument's string literals. A call records a location when it is
// pline_mon() of a monster other than gy.youmonst, pline_xy() or pline_dir(),
// or when it is the first message call after a set_msg_xy() or
// set_msg_dir() in the same function, with no return, break, goto or continue
// between them other than as the body of an if or else. A message call in another branch of the same if, else or
// switch statement as that first one records it too, because only one of
// the branches runs.
//
// JS side: each string expression in a JS function that corresponds to the
// C function: by name, as AGENTS.md requires; by a helper named for part of
// it, such as mon_break_armor_effects() for mon_break_armor(); or by a
// "file.c function()" reference in a comment before or inside it. The
// expression pairs with a C site when its fixed text matches the C format
// from end to end, where a conversion matches any text and the port may add
// pline.c's "You " or "The " itself. A %s whose argument is a literal, or a
// conditional between literals, also matches that literal, so "%s %s!"
// with "wails" or "cries" pairs with `${name} wails!`. A format with fewer
// than MIN_LETTERS letters outside its conversions is not paired.
//
// The expression records a location when it reaches the text argument of a
// location sink (SINKS, MEMBER_SINKS, or any JS function that passes one of
// its parameters on to a sink) through conditionals, '+', template
// literals, local variables, or a function's return value. A called name
// resolves to the function its scope declares or the module it is imported
// from.
//
// A pair disagrees when no JS expression for a C site makes C's choice, or
// when a JS expression makes a choice that none of its C sites makes. Every
// C site the method cannot pair is counted by the reason it was not paired.
//
//   node scripts/message-location.mjs           print disagreements and counts
//   node scripts/message-location.mjs --json    print every C site as JSON

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';

import {
    FUNCTION_NODES,
    PRINTF_CONVERSION,
    children,
    declarationsByFunction,
    decodeCString,
    matchingClose,
    messageKind,
    textAlternatives,
    tokenizeMessageSources,
} from './c-message-coverage.mjs';
import { PROJECT_ROOT, findCompiler } from './recorder-headers.mjs';

const JS_DIR = join(PROJECT_ROOT, 'js');
// The scorer replaces these files with its own copies; they hold no messages.
const FROZEN_JS = new Set(['isaac64.js', 'terminal.js', 'storage.js']);

// The pline.c message functions, each with the index of its format argument.
export const FORMAT_ARGUMENT = Object.freeze({
    pline: 0, pline_The: 0, urgent_pline: 0, Norep: 0, verbalize: 0,
    You: 0, Your: 0, You_feel: 0, You_cant: 0, You_hear: 0, You_see: 0, There: 0,
    custompline: 1, pline_mon: 1, pline_dir: 1, pline_xy: 2,
});
// The words pline.c puts before the format. A port may write them into the
// same string or leave them to js/pline.js youFeel(), youHear() or youSee().
const PREFIX = Object.freeze({
    You: 'You ', Your: 'Your ', pline_The: 'The ', There: 'There ',
    You_cant: 'You can\'t ', You_feel: 'You feel ', You_hear: 'You hear ',
    You_see: 'You see ',
});
const LOCATING_CALLS = new Set(['pline_mon', 'pline_xy', 'pline_dir']);
const SET_LOCATION = new Set(['set_msg_xy', 'set_msg_dir']);
const JUMPS = new Set(['return', 'break', 'goto', 'continue']);

// The JS functions that give a message its location, with the index of the
// text argument. A function that passes a parameter on to one of these is a
// sink for that parameter too.
export const SINKS = Object.freeze({ messageAt: 0, pline_mon: 1, consume_msg_xy: 0 });
// Injected operations that print with a location, by the file that calls
// them and the property name. js/detect.js passes each search message to
// env.message(text, x, y, env), whose default, defaultSearchMessage(),
// prints messageAt(text, x, y).
export const MEMBER_SINKS = Object.freeze({ 'detect.js': Object.freeze({ message: 0 }) });

// A format must hold this many letters outside its conversions to be
// paired; "%s." or "%s %s!" matches too much of a function's text.
export const MIN_LETTERS = 5;

// ---------------------------------------------------------------- C side

const isPunct = (token, value) => token?.type === 'punct' && token.value === value;
const isIdent = (token, value) => token?.type === 'ident' && token.value === value;

// The top-level comma-separated arguments of the call whose '(' is at open.
function callArguments(tokens, open, close) {
    const args = [];
    let start = open + 1;
    let depth = 0;
    for (let j = open + 1; j < close; j++) {
        const t = tokens[j];
        if (t.type !== 'punct') continue;
        if ('([{'.includes(t.value)) depth++;
        else if (')]}'.includes(t.value)) depth--;
        else if (t.value === ',' && depth === 0) {
            args.push([start, j]);
            start = j + 1;
        }
    }
    if (start < close) args.push([start, close]);
    return args;
}

// The format strings an argument can be: each run of adjacent literals
// outside nested parentheses, so a ternary between literals gives both.
function formatLiterals(tokens, [start, end], sourceFile) {
    const literals = [];
    let run = null;
    let depth = 0;
    for (let j = start; j < end; j++) {
        const t = tokens[j];
        if (t.type === 'punct' && t.value === '(') depth++;
        if (t.type === 'punct' && t.value === ')') depth--;
        if (t.type === 'string' && depth === 0 && t.value !== sourceFile) {
            run = run === null ? decodeCString(t.value) : run + decodeCString(t.value);
        } else if (run !== null) {
            literals.push(run);
            run = null;
        }
    }
    if (run !== null) literals.push(run);
    return literals;
}

// The strings an argument can be when it is a literal or a conditional
// between literals, as `cond ? "a" : "b"`; null for any other argument and
// for a branch that is not a literal.
function argumentStrings(tokens, [start, end], sourceFile) {
    const branches = [];
    let from = start;
    let depth = 0;
    for (let j = start; j < end; j++) {
        const t = tokens[j];
        if (t.type !== 'punct') continue;
        if ('([{'.includes(t.value)) depth++;
        else if (')]}'.includes(t.value)) depth--;
        else if ((t.value === '?' || t.value === ':') && depth === 0) {
            if (t.value === ':') branches.push([from, j]);
            from = j + 1;
        }
    }
    branches.push([from, end]);
    const strings = branches.map(([a, b]) => {
        const run = tokens.slice(a, b);
        return run.length > 0 && run.every((r) => r.type === 'string' && r.value !== sourceFile)
            ? run.map((r) => decodeCString(r.value)).join('') : null;
    });
    return strings.some((text) => text !== null) ? strings : null;
}

// A format with each %s whose argument is a literal, or a conditional
// between literals, replaced by that text: one result for each way the
// conditionals go, up to MAX_TEXTS, after which the format stands alone.
// "%s %s!" with arguments Monnam(mon) and (dmg > 2) ? "wails" : "cries"
// gives "%s wails!" and "%s cries!". A branch that is not a literal keeps
// its %s.
const MAX_TEXTS = 16;
export function substituteArguments(format, argumentTexts) {
    let results = [''];
    let argument = 0;
    let last = 0;
    for (const m of format.matchAll(PRINTF_CONVERSION)) {
        const literal = format.slice(last, m.index);
        results = results.map((r) => r + literal);
        last = m.index + m[0].length;
        if (m[0] === '%%') { results = results.map((r) => `${r}%%`); continue; }
        argument += (m[0].match(/\*/gu) ?? []).length; // a * width or precision
        const texts = m[0].endsWith('s') ? argumentTexts[argument] : null;
        argument++;
        if (!texts) { results = results.map((r) => r + m[0]); continue; }
        const escaped = texts.map((text) => (text === null ? m[0] : text.replaceAll('%', '%%')));
        results = results.flatMap((r) => escaped.map((text) => r + text));
        if (results.length > MAX_TEXTS) return [format];
    }
    const texts = results.map((r) => r + format.slice(last));
    return texts.includes(format) ? texts : [format, ...texts];
}

// Whether a return, break, goto or continue that is not the whole body of
// an if or else lies between two tokens, so that control cannot pass from
// one to the other.
function unconditionalJump(tokens, from, to) {
    for (let j = from; j < to; j++) {
        if (tokens[j].type !== 'ident' || !JUMPS.has(tokens[j].value)) continue;
        const before = tokens[j - 1];
        if (!isPunct(before, ')') && !isIdent(before, 'else')) return true;
    }
    return false;
}

// Whether the tokens between two message calls of one function only lead
// from one branch of an if, else or switch statement to another.
function otherBranch(tokens, from, to) {
    let branch = false;
    for (let j = from; j < to; j++) {
        const t = tokens[j];
        if (t.type === 'ident' && ['else', 'case', 'default'].includes(t.value)) branch = true;
        if (isIdent(t, 'break') && isPunct(tokens[j + 1], ';')) { j++; continue; }
        if (t.type === 'ident' && JUMPS.has(t.value)) return false;
        if (isPunct(t, ';')) return false;
    }
    return branch;
}

// Every pline.c message call in one preprocessed file, with whether it
// records a location. Only calls in `sourceFile` itself count.
export function extractCSites(tokens, sourceFile) {
    const sites = [];
    let depth = 0;
    let currentFunction = null;
    let pending = null; // index after a set_msg_xy() call not yet consumed
    let consumed = null; // the call that consumed it, for its other branches
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (isPunct(t, '{')) {
            if (depth === 0) {
                const prev = tokens[i - 1];
                currentFunction = null;
                if (isPunct(prev, ')')) {
                    let open = i - 1;
                    for (let d = 0; open >= 0; open--) {
                        if (isPunct(tokens[open], ')')) d++;
                        else if (isPunct(tokens[open], '(') && --d === 0) break;
                    }
                    if (tokens[open - 1]?.type === 'ident') currentFunction = tokens[open - 1].value;
                }
                pending = consumed = null;
            }
            depth++;
            continue;
        }
        if (isPunct(t, '}')) {
            depth = Math.max(0, depth - 1);
            if (depth === 0) currentFunction = pending = consumed = null;
            continue;
        }
        if (depth === 0 || t.type !== 'ident' || !isPunct(tokens[i + 1], '(')) continue;
        if (SET_LOCATION.has(t.value)) {
            const close = matchingClose(tokens, i + 1, '(', ')');
            const args = tokens.slice(i + 2, close).map((a) => a.value).join(' ');
            // set_msg_xy(0, 0) cancels a location no message used.
            pending = args === '0 , 0' ? null : close;
            consumed = null;
            i = close;
            continue;
        }
        if (!(t.value in FORMAT_ARGUMENT)) continue;
        const close = matchingClose(tokens, i + 1, '(', ')');
        const args = callArguments(tokens, i + 1, close);
        let located = false;
        if (LOCATING_CALLS.has(t.value)) {
            const first = args[0] ? tokens.slice(...args[0]).map((a) => a.value).join('') : '';
            located = !(t.value === 'pline_mon' && /^&(?:gy\.)?youmonst$/u.test(first));
            pending = consumed = null;
        } else if (pending !== null) {
            located = !unconditionalJump(tokens, pending, i);
            pending = null;
            consumed = located ? close : null;
        } else if (consumed !== null) {
            // The call's own ';' follows `consumed`.
            located = otherBranch(tokens, consumed + 2, i);
            consumed = located ? close : null;
        }
        if (t.file === sourceFile) {
            const debugTrace = tokens.slice(Math.max(0, i - 6), i)
                .some((b) => isIdent(b, 'save_plnmsg'));
            const formatIndex = FORMAT_ARGUMENT[t.value];
            const formatArg = args[formatIndex];
            const formats = formatArg ? formatLiterals(tokens, formatArg, sourceFile) : [];
            sites.push({
                file: sourceFile,
                function: currentFunction,
                line: t.line,
                callee: t.value,
                kind: messageKind(t.value, debugTrace),
                located,
                formats,
                texts: formats.flatMap((format) => substituteArguments(
                    format, args.slice(formatIndex + 1).map((arg) => argumentStrings(tokens, arg, sourceFile)))),
            });
        }
        // Calls in the arguments, such as a nested pline(), run first in C;
        // none of them prints, so skip past the whole call.
        i = close;
    }
    return sites;
}

// The texts a JS string may hold for one C site, as anchored patterns: the
// format, and the format inside the words pline.c adds, each only if it
// holds MIN_LETTERS letters outside its conversions. A conversion matches
// any text, so the port may inline an argument C passes as %s; the port may
// also build a prefix in a separate hole (a NUL in the JS text).
export function sitePatterns(site) {
    const patterns = [];
    for (const format of site.texts ?? site.formats) {
        const texts = [format];
        if (PREFIX[site.callee]) texts.push(PREFIX[site.callee] + format);
        if (site.callee === 'verbalize') texts.push(`"${format}"`);
        for (const text of texts) {
            let body = '';
            let letters = 0;
            let last = 0;
            for (const m of text.matchAll(PRINTF_CONVERSION)) {
                const literal = text.slice(last, m.index);
                letters += (literal.match(/[A-Za-z]/gu) ?? []).length;
                body += escapeRegExp(literal) + (m[0] === '%%' ? '%' : '[^]*?');
                last = m.index + m[0].length;
            }
            const tail = text.slice(last);
            letters += (tail.match(/[A-Za-z]/gu) ?? []).length;
            body += escapeRegExp(tail);
            if (letters >= MIN_LETTERS)
                patterns.push(new RegExp(`^(?:[^]*\\0)?${body}(?:\\0[^]*)?$`, 'u'));
        }
    }
    return patterns;
}

function escapeRegExp(text) {
    return text.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
}

// ---------------------------------------------------------------- JS side

const C_REFERENCE = /\b([A-Za-z0-9_]+\.c)\s+([A-Za-z_][A-Za-z0-9_]*)\(\)/gu;

function calleeName(callee) {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
    return null;
}

function functionName(node, parent) {
    if (node.id?.name) return node.id.name;
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
    if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition')
        && parent.key.type === 'Identifier') return parent.key.name;
    return null;
}

// One parsed JS file: its AST with parent links, its functions with the C
// functions they correspond to, and its string expressions.
function parseJs(file, source, cFunctions) {
    const comments = [];
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', onComment: comments,
    });
    const parents = new Map();
    const functions = [];
    const strings = [];
    const scopes = declarationsByFunction(ast);
    const cFile = file.replace(/\.js$/u, '.c');
    const references = (text) => [...text.matchAll(C_REFERENCE)].map((m) => `${m[1]}\0${m[2]}`);
    // The contiguous comment block that ends where `start` begins.
    const leadingComments = (start) => {
        const found = [];
        let end = start;
        for (let k = comments.length - 1; k >= 0; k--) {
            const c = comments[k];
            if (c.end > end) continue;
            if (source.slice(c.end, end).trim() !== '') break;
            found.push(c.value);
            end = c.start;
        }
        return found.join('\n');
    };
    const statementStart = (node) => {
        let start = node.start;
        for (let p = parents.get(node); p; p = parents.get(p)) {
            if (p.type === 'Program' || p.type === 'BlockStatement' || p.type === 'ClassBody') break;
            start = p.start;
        }
        return start;
    };
    // A piece of a larger string expression is one of its alternatives, not
    // a message of its own.
    const insideString = (node) => {
        for (let p = parents.get(node); p; node = p, p = parents.get(p)) {
            if (p.type === 'TemplateLiteral' || (p.type === 'BinaryExpression' && p.operator === '+'))
                return true;
            if (!((p.type === 'ConditionalExpression' && p.test !== node)
                || p.type === 'LogicalExpression')) return false;
        }
        return false;
    };
    const visit = (node, parent, stack) => {
        parents.set(node, parent);
        if (FUNCTION_NODES.has(node.type)) {
            const name = functionName(node, parent);
            const keys = new Set();
            // A helper named for part of a C function, such as
            // mon_break_armor_effects(), stands for that function.
            let cName = name;
            while (cName && !cFunctions.has(cName))
                cName = cName.includes('_') ? cName.slice(0, cName.lastIndexOf('_')) : null;
            if (cName) {
                const files = cFunctions.get(cName);
                for (const f of files.has(cFile) ? [cFile] : files) keys.add(`${f}\0${cName}`);
            }
            const inner = comments.filter((c) => c.start >= node.start && c.end <= node.end)
                .map((c) => c.value).join('\n');
            for (const key of references(`${leadingComments(statementStart(node))}\n${inner}`)) keys.add(key);
            const entry = { node, name, keys };
            functions.push(entry);
            stack = [...stack, entry];
        }
        const isChain = node.type === 'BinaryExpression' && node.operator === '+';
        if ((isChain || node.type === 'TemplateLiteral'
            || (node.type === 'Literal' && typeof node.value === 'string'))
            && !insideString(node)) {
            const lookup = (name) => {
                for (let k = stack.length - 1; k >= 0; k--) {
                    const names = scopes.get(stack[k].node);
                    if (names.has(name)) return names.get(name);
                }
                const top = scopes.get(ast);
                return top.has(name) ? top.get(name) : null;
            };
            const keys = new Set(stack.flatMap((entry) => [...entry.keys]));
            if (keys.size > 0) {
                const texts = textAlternatives(node, lookup).map((runs) => runs.join('\0'));
                strings.push({ file, node, keys, texts, line: lineOf(source, node.start) });
            }
        }
        for (const child of children(node)) visit(child, node, stack);
    };
    visit(ast, null, []);
    return { file, ast, parents, functions, strings };
}

function lineOf(source, offset) {
    let line = 1;
    for (let k = source.indexOf('\n'); k !== -1 && k < offset; k = source.indexOf('\n', k + 1)) line++;
    return line;
}

// Decides, for a JS expression, whether its value reaches a sink's text
// argument. A called name resolves to the function its scope declares, or
// to the top-level function of that name in the module it is imported from.
function locationAnalysis(parsed) {
    const parents = new Map();
    const programs = new Map(); // file -> Program node
    const files = new Map(); // Program node -> file
    const imports = new Map(); // Program -> local name -> { file, name }
    const declared = new Map(); // scope node -> name -> function node or null
    for (const p of parsed) {
        for (const [node, parent] of p.parents) parents.set(node, parent);
        programs.set(p.file, p.ast);
        files.set(p.ast, p.file);
        const named = new Map();
        for (const statement of p.ast.body) {
            if (statement.type !== 'ImportDeclaration') continue;
            const from = statement.source.value.replace(/^\.\//u, '');
            for (const spec of statement.specifiers) {
                if (spec.type === 'ImportSpecifier')
                    named.set(spec.local.name, { file: from, name: spec.imported.name });
            }
        }
        imports.set(p.ast, named);
    }
    const scopeOf = (node) => {
        for (let p = parents.get(node); p; p = parents.get(p))
            if (FUNCTION_NODES.has(p.type) || p.type === 'Program') return p;
        return null;
    };
    for (const node of parents.keys()) {
        let name = null;
        let fn = null;
        if (node.type === 'FunctionDeclaration' && node.id) {
            name = node.id.name;
            fn = node;
        } else if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
            name = node.id.name;
            fn = node.init && FUNCTION_NODES.has(node.init.type) ? node.init : null;
        } else {
            continue;
        }
        const scope = scopeOf(node);
        if (!declared.has(scope)) declared.set(scope, new Map());
        const names = declared.get(scope);
        names.set(name, names.has(name) && names.get(name) !== fn ? null : fn);
    }
    const topLevel = (file, name, seen = new Set()) => {
        const program = programs.get(file);
        if (!program || seen.has(`${file}\0${name}`)) return null;
        seen.add(`${file}\0${name}`);
        const fn = declared.get(program)?.get(name);
        if (fn) return fn;
        const imported = imports.get(program).get(name);
        return imported ? topLevel(imported.file, imported.name, seen) : null;
    };
    const resolve = (call) => {
        if (call.callee.type !== 'Identifier') return null;
        const name = call.callee.name;
        for (let scope = scopeOf(call); scope; scope = scopeOf(scope)) {
            const names = declared.get(scope);
            if (names?.has(name)) return names.get(name);
            if (scope.type === 'Program') {
                const imported = imports.get(scope).get(name);
                return imported ? topLevel(imported.file, imported.name) : null;
            }
        }
        return null;
    };
    const callsByFunction = new Map();
    for (const node of parents.keys()) {
        if (node.type !== 'CallExpression') continue;
        const fn = resolve(node);
        if (!fn) continue;
        if (!callsByFunction.has(fn)) callsByFunction.set(fn, []);
        callsByFunction.get(fn).push(node);
    }
    const identifiers = new Map(); // scope node -> name -> Identifier nodes
    const identifiersIn = (scope, name) => {
        if (!identifiers.has(scope)) {
            const names = new Map();
            const walk = (node) => {
                if (node.type === 'Identifier') {
                    if (!names.has(node.name)) names.set(node.name, []);
                    names.get(node.name).push(node);
                }
                for (const child of children(node)) walk(child);
            };
            walk(scope);
            identifiers.set(scope, names);
        }
        return identifiers.get(scope).get(name) ?? [];
    };
    // flow() follows a value up to where it ends: at a sink's text argument
    // (`sink`) or at its function's return value (`ret`). A parameter that
    // reaches a return continues from each call site separately, so
    // youFeel(line) returns a located line only where its caller locates it.
    const memo = new Map();
    const NONE = Object.freeze({ sink: false, ret: false });
    // Keyed by an AST node and a name, since offsets repeat across files.
    const memoized = (node, name, compute) => {
        if (!memo.has(node)) memo.set(node, new Map());
        const values = memo.get(node);
        if (values.has(name)) return values.get(name);
        values.set(name, NONE); // a cycle reaches nothing new
        const value = compute();
        values.set(name, value);
        return value;
    };
    const either = (flows) => ({
        sink: flows.some((f) => f.sink),
        ret: flows.some((f) => f.ret),
    });
    const isReference = (id) => {
        const p = parents.get(id);
        if (p.type === 'MemberExpression' && p.property === id && !p.computed) return false;
        if (p.type === 'Property' && p.key === id && !p.shorthand) return false;
        if (p.type === 'VariableDeclarator' && p.id === id) return false;
        if (FUNCTION_NODES.has(p.type) && p.params.includes(id)) return false;
        return true;
    };
    const variableFlow = (scope, name) => memoized(scope, `var ${name}`,
        () => either(identifiersIn(scope, name).filter(isReference).map((id) => flow(id))));
    const parameterFlow = (fn, index) => memoized(fn, `param ${index}`, () => {
        const param = fn.params[index];
        const id = param?.type === 'AssignmentPattern' ? param.left : param;
        return id?.type === 'Identifier' ? variableFlow(fn, id.name) : NONE;
    });
    function flow(start) {
        return memoized(start, 'flow', () => {
            let node = start;
            for (;;) {
                const p = parents.get(node);
                if (!p) return NONE;
                switch (p.type) {
                case 'ConditionalExpression':
                    if (p.test === node) return NONE;
                    node = p;
                    continue;
                case 'LogicalExpression':
                case 'TemplateLiteral':
                case 'ParenthesizedExpression':
                case 'AwaitExpression':
                    node = p;
                    continue;
                case 'BinaryExpression':
                    if (p.operator !== '+') return NONE;
                    node = p;
                    continue;
                case 'SequenceExpression':
                    if (p.expressions.at(-1) !== node) return NONE;
                    node = p;
                    continue;
                case 'CallExpression': {
                    const index = p.arguments.indexOf(node);
                    const name = index < 0 ? null : calleeName(p.callee);
                    if (name === null) return NONE;
                    if (name in SINKS) return SINKS[name] === index ? { sink: true, ret: false } : NONE;
                    if (p.callee.type === 'MemberExpression') {
                        let program = p;
                        while (program.type !== 'Program') program = scopeOf(program);
                        const member = MEMBER_SINKS[files.get(program)]?.[name];
                        return member === index ? { sink: true, ret: false } : NONE;
                    }
                    const fn = resolve(p);
                    if (!fn) return NONE;
                    const through = parameterFlow(fn, index);
                    return through.ret ? either([{ sink: through.sink, ret: false }, flow(p)]) : through;
                }
                case 'VariableDeclarator':
                    return p.init === node && p.id.type === 'Identifier'
                        ? variableFlow(scopeOf(p), p.id.name) : NONE;
                case 'AssignmentExpression':
                    return p.right === node && p.left.type === 'Identifier'
                        ? variableFlow(scopeOf(p), p.left.name) : NONE;
                case 'ReturnStatement':
                    return { sink: false, ret: true };
                case 'ArrowFunctionExpression':
                    return p.body === node ? { sink: false, ret: true } : NONE;
                default:
                    return NONE;
                }
            }
        });
    }
    // A string the function itself writes reaches a sink when it does, or
    // when it is returned and any call of the function reaches one.
    const callersReach = (fn) => memoized(fn, 'callers', () => ({
        sink: (callsByFunction.get(fn) ?? []).some((call) => reaches(call)),
    })).sink;
    function reaches(node) {
        const f = flow(node);
        if (f.sink) return true;
        const fn = scopeOf(node);
        return f.ret && fn.type !== 'Program' && callersReach(fn);
    }
    return reaches;
}

export function parseJsFiles(files, cFunctions) {
    return files.map(({ file, source }) => parseJs(file, source, cFunctions));
}

function readJsFiles() {
    return readdirSync(JS_DIR).filter((name) => name.endsWith('.js') && !FROZEN_JS.has(name))
        .sort().map((file) => ({ file, source: readFileSync(join(JS_DIR, file), 'utf8') }));
}

// ---------------------------------------------------------------- pairing

// Pairs C sites with JS strings and returns every C site with its status
// and the disagreements.
export function pairSites(cSites, jsFiles) {
    const cFunctions = new Map();
    for (const site of cSites) {
        if (!site.function) continue;
        const base = site.file.split('/').pop();
        if (!cFunctions.has(site.function)) cFunctions.set(site.function, new Set());
        cFunctions.get(site.function).add(base);
    }
    const parsed = parseJsFiles(jsFiles, cFunctions);
    const reaches = locationAnalysis(parsed);
    const stringsByKey = new Map();
    const mappedKeys = new Set();
    for (const p of parsed) {
        for (const entry of p.functions) for (const key of entry.keys) mappedKeys.add(key);
        for (const s of p.strings) {
            for (const key of s.keys) {
                if (!stringsByKey.has(key)) stringsByKey.set(key, []);
                stringsByKey.get(key).push(s);
            }
        }
    }
    const located = new Map();
    const isLocated = (s) => {
        if (!located.has(s)) located.set(s, reaches(s.node));
        return located.get(s);
    };
    const matchedBy = new Map(); // JS string -> C sites
    const results = [];
    for (const site of cSites) {
        const result = { ...site, status: null, js: [] };
        results.push(result);
        if (site.kind !== 'gameplay') { result.status = 'not gameplay'; continue; }
        if (site.formats.length === 0) { result.status = 'format not a literal'; continue; }
        const patterns = sitePatterns(site);
        if (patterns.length === 0) { result.status = 'too little text'; continue; }
        const key = `${site.file.split('/').pop()}\0${site.function}`;
        if (!mappedKeys.has(key)) { result.status = 'no JS function'; continue; }
        const candidates = (stringsByKey.get(key) ?? []).filter((s) =>
            s.texts.some((text) => patterns.some((pattern) => pattern.test(text))));
        if (candidates.length === 0) { result.status = 'no JS text'; continue; }
        result.status = 'paired';
        result.js = candidates;
        for (const s of candidates) {
            if (!matchedBy.has(s)) matchedBy.set(s, []);
            matchedBy.get(s).push(result);
        }
    }
    const findings = [];
    for (const site of results) {
        if (site.status !== 'paired') continue;
        if (site.js.some((s) => isLocated(s) === site.located)) continue;
        findings.push({ site, js: site.js, reason: site.located
            ? 'C records a location; JS does not' : 'JS records a location; C does not' });
    }
    for (const [s, sites] of matchedBy) {
        if (sites.some((site) => site.located === isLocated(s))) continue;
        if (findings.some((f) => f.js.includes(s))) continue;
        findings.push({ site: sites[0], js: [s], reason: isLocated(s)
            ? 'JS records a location; C does not' : 'C records a location; JS does not' });
    }
    return { results, findings, isLocated };
}

export async function scan({ compiler = findCompiler(), jobs = 2 } = {}) {
    if (!compiler) throw new Error('message-location: no C compiler (clang, cc, or gcc) found');
    const cSites = [];
    for (const { source, tokens } of await tokenizeMessageSources({ compiler, jobs }))
        cSites.push(...extractCSites(tokens, source));
    return pairSites(cSites, readJsFiles());
}

export function formatFinding({ site, js, reason }, isLocated) {
    const where = js.map((s) => `js/${s.file}:${s.line}=${isLocated(s) ? 'located' : 'plain'}`).join(' ');
    return `${site.file}:${site.line} ${site.function}() ${site.callee}: ${reason}`
        + ` (${JSON.stringify(site.formats.join(' | '))}; ${where})`;
}

export function counts(results) {
    const tally = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
    return tally;
}

async function main() {
    const { results, findings, isLocated } = await scan();
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(results.map((r) => ({
            ...r, js: r.js.map((s) => ({ file: s.file, line: s.line, located: isLocated(s) })),
        })), null, 1)}\n`);
        return;
    }
    for (const f of findings) console.log(formatFinding(f, isLocated));
    console.error(JSON.stringify(counts(results)));
    console.error(`${findings.length} disagreements`);
    if (findings.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
