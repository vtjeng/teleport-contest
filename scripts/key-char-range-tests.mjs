#!/usr/bin/env node

// Lists every one-sided range test js/ makes on an input key.
//
// C narrows a key to `char` in cmd.c readchar_core() (`return (char) sym`,
// line 5271), and char is signed in the recorder's build, so a byte above
// 0x7F is negative wherever C holds the key in a char, or in an int
// assigned from one. The port holds a key as the byte, 0 to 255. The two
// agree under `==`, under a test against both ends of a range inside
// 0 to 0x7F and under a mask, and they differ under a one-sided test:
// `c < ' '` is true of C's -23 and false of the port's 0xE9. Where C makes
// such a test on a char, the port must make it on schar(key) (js/global.js),
// and where C makes it on an unsigned value (`(uchar) c < 040` in hacklib.c
// visctrl()) the byte is right as it is.
//
// A key is a variable assigned from one of KEY_SOURCES, a parameter or
// variable with one of KEY_NAMES, or a `.key` member. A test is one-sided
// when it compares a key with a constant and the same condition does not
// bound the same expression from the other side below 0x80.
//
// Usage: node scripts/key-char-range-tests.mjs   prints file:line, the
// enclosing function and the test, one a line.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
export const JS_DIR = join(PROJECT_ROOT, 'js');

// The functions that return a key the player typed.
export const KEY_SOURCES = new Set([
    'readchar', 'readchar_poskey', 'readchar_core', 'pgetchar', 'nhgetch',
    'tty_nhgetch', 'nh_poskey', 'tgetch', 'xwaitforspace', 'get_count',
    'randomkey', 'queuedReadcharValue',
]);
// Names C and the port give a variable that holds a key.
export const KEY_NAMES = /^(?:key|keyCode|inkey|dirsym|sym|foo|ch|c|z|morc|input|cmd_key|ilet|keystroke|byte)$/u;
const RELATIONAL = new Set(['<', '<=', '>', '>=']);
// Files that hold no game logic on keys: generated tables, the frozen
// terminal and random source, and the regex engine, whose `c` is a pattern
// character.
const SKIPPED_FILES = /(?:_data\.js|^terminal\.js|^isaac64\.js|^storage\.js|^tre_.*\.js|^reg(?:comp|exec|error)\.js|^posixregex\.js)$/u;

const isNode = (value) => value && typeof value.type === 'string';

function walk(node, parent, visit) {
    node.parent = parent;
    visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, node, visit);
        } else if (isNode(value)) {
            walk(value, node, visit);
        }
    }
}

const FUNCTIONS = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function enclosingFunction(node) {
    for (let p = node.parent; p; p = p.parent) if (FUNCTIONS.has(p.type)) return p;
    return null;
}

function functionName(fn) {
    if (!fn) return '(module)';
    if (fn.id) return fn.id.name;
    const p = fn.parent;
    if (p?.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
    if (p?.type === 'Property' && p.key.type === 'Identifier') return p.key.name;
    return functionName(enclosingFunction(fn));
}

// The call a value comes from, through `await`, parentheses, `Number()`,
// `& 0xFF` and `?? x`.
function sourceCall(node) {
    if (!node) return null;
    if (node.type === 'AwaitExpression') return sourceCall(node.argument);
    if (node.type === 'ChainExpression') return sourceCall(node.expression);
    if (node.type === 'BinaryExpression' && node.operator === '&')
        return sourceCall(node.left);
    if (node.type === 'LogicalExpression') return sourceCall(node.left);
    if (node.type === 'CallExpression') {
        const callee = node.callee;
        const name = callee.type === 'Identifier' ? callee.name
            : callee.type === 'MemberExpression' && !callee.computed
                ? callee.property.name : null;
        if (name === 'Number') return sourceCall(node.arguments[0]);
        return name;
    }
    return null;
}

// A number the test compares with: a numeric literal, a negated one, or
// `'x'.charCodeAt(0)`.
function constantValue(node) {
    if (node.type === 'Literal' && typeof node.value === 'number') return node.value;
    // A one-character string, for a key the port holds as text: `c < ' '`.
    if (node.type === 'Literal' && typeof node.value === 'string'
        && node.value.length === 1)
        return node.value.charCodeAt(0);
    if (node.type === 'UnaryExpression' && node.operator === '-') {
        const value = constantValue(node.argument);
        return value === null ? null : -value;
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
        && node.callee.property.name === 'charCodeAt'
        && node.callee.object.type === 'Literal'
        && typeof node.callee.object.value === 'string')
        return node.callee.object.value.charCodeAt(0);
    return null;
}

// The findings in one file's source: { line, name, fn, test, bound }.
export function rangeTests(source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const text = (node) => source.slice(node.start, node.end);
    // Variables assigned from a key source, per enclosing function.
    const sourced = new Map(); // function node -> Set of names
    const note = (fn, name) => {
        if (!sourced.has(fn)) sourced.set(fn, new Set());
        sourced.get(fn).add(name);
    };
    const all = [];
    walk(ast, null, (node) => all.push(node));
    for (const node of all) {
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier'
            && KEY_SOURCES.has(sourceCall(node.init)))
            note(enclosingFunction(node), node.id.name);
        if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier'
            && KEY_SOURCES.has(sourceCall(node.right)))
            note(enclosingFunction(node), node.left.name);
    }
    const isKey = (node) => {
        if (node.type === 'Identifier') {
            if (KEY_NAMES.test(node.name)) return true;
            for (let fn = enclosingFunction(node); fn; fn = enclosingFunction(fn))
                if (sourced.get(fn)?.has(node.name)) return true;
            return Boolean(sourced.get(null)?.has(node.name));
        }
        return node.type === 'MemberExpression' && !node.computed
            && node.property.name === 'key';
    };
    // A test's key expression, its operator with the key on the left, and
    // its constant.
    const reading = (node) => {
        if (node.type !== 'BinaryExpression' || !RELATIONAL.has(node.operator)) return null;
        const flip = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };
        const right = constantValue(node.right);
        if (right !== null && isKey(node.left))
            return { key: text(node.left), operator: node.operator, bound: right };
        const left = constantValue(node.left);
        if (left !== null && isKey(node.right))
            return { key: text(node.right), operator: flip[node.operator], bound: left };
        return null;
    };
    // The `&&` chain a test belongs to, which is where its other bound is.
    const conjuncts = (node) => {
        let top = node;
        while (top.parent?.type === 'LogicalExpression' && top.parent.operator === '&&')
            top = top.parent;
        const out = [];
        const collect = (n) => {
            if (n.type === 'LogicalExpression' && n.operator === '&&') {
                collect(n.left);
                collect(n.right);
            } else {
                out.push(n);
            }
        };
        collect(top);
        return out;
    };
    const findings = [];
    for (const node of all) {
        const test = reading(node);
        if (!test) continue;
        const lower = test.operator.startsWith('>');
        const paired = conjuncts(node).some((other) => {
            if (other === node) return false;
            const second = reading(other);
            return second && second.key === test.key
                && second.operator.startsWith('>') !== lower
                // Both ends inside 0 to 0x7F: a byte above 0x7F and C's
                // negative char both fall outside.
                && Math.max(second.bound, test.bound) < 0x80
                && Math.min(second.bound, test.bound) >= 0;
        });
        if (paired) continue;
        findings.push({
            line: node.loc.start.line,
            name: test.key,
            fn: functionName(enclosingFunction(node)),
            test: text(node),
            bound: test.bound,
        });
    }
    return findings;
}

export function scanRepository(dir = JS_DIR) {
    return readdirSync(dir).filter((name) => name.endsWith('.js')
        && !SKIPPED_FILES.test(name)).sort().flatMap((name) =>
        rangeTests(readFileSync(join(dir, name), 'utf8')).map((finding) => ({
            file: name, ...finding,
        })));
}

if (process.argv[1] === SCRIPT_PATH) {
    const findings = scanRepository();
    for (const { file, line, fn, test } of findings)
        console.log(`${file}:${line}\t${fn}\t${test}`);
    console.log(`${findings.length} one-sided range tests on a key`);
}
