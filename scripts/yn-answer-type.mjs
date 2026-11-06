#!/usr/bin/env node

// Lists every place in js/ that compares a yes/no answer with a key code.
//
// C's yn_function(), y_n(), ynq(), paranoid_ynq() and the window port's
// yn_function return a `char`, and the port returns that char as a
// one-character string (js/cmd.js, "Answer type rule"). A key code on the
// other side of `===` makes the comparison always false, which is the
// mistake this scan exists to catch: `await y_n(q, state) === 'y'.charCodeAt(0)`
// or `case 0x79:` after `switch (await ynq(q, state))`.
//
// An answer is the awaited result of a call whose callee is one of
// YN_FUNCTIONS, one of the INJECTED_NAMES that game code uses for an injected
// yes/no owner (`env.yn`, `askYesNo`, ...), or a local alias of either: a
// variable or function whose value or returned expression is one of them. A
// variable assigned an answer anywhere in a function is an answer throughout
// that function. A key code is a number literal, a `.charCodeAt()` call, a
// KEY_* or ESC identifier, which the port defines as numbers, or a const in
// the same file initialized with one of those.
//
// scripts/yn-answer-type.test.mjs runs the scan over js/ and requires an
// empty list. The scan is syntactic: it does not follow an answer through a
// function parameter, an object field, or a `.then()` callback.
//
// Usage: node scripts/yn-answer-type.mjs   (prints the findings, one a line)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as acorn from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

// The port's yes/no functions, each declared in js/cmd.js or js/topl.js.
export const YN_FUNCTIONS = Object.freeze([
    'yn_function', 'y_n', 'ynq', 'paranoid_ynq', 'tty_yn_function',
]);

// Names under which game code receives an injected yes/no owner.
export const INJECTED_NAMES = Object.freeze([
    'yn', 'yesNo', 'askYesNo', 'ynFunction',
]);

const CALLEE_NAMES = new Set([...YN_FUNCTIONS, ...INJECTED_NAMES]);
const KEY_CONSTANT = /^(?:KEY_[A-Z0-9_]+|ESC)$/u;
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function isNode(value) {
    return value && typeof value.type === 'string';
}

function children(node) {
    const found = [];
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) found.push(child);
        } else if (isNode(value)) {
            found.push(value);
        }
    }
    return found;
}

// Visit every node below `node`, passing the nearest enclosing function (or
// the program).
function walk(node, visit, scope = node) {
    visit(node, scope);
    const inner = FUNCTION_TYPES.has(node.type) ? node : scope;
    for (const child of children(node)) walk(child, visit, inner);
}

function unwrap(node) {
    let current = node;
    while (current && (current.type === 'AwaitExpression'
        || current.type === 'ParenthesizedExpression'
        || current.type === 'ChainExpression')) {
        current = current.type === 'AwaitExpression'
            ? current.argument : current.expression;
    }
    return current;
}

function calleeName(node) {
    const callee = unwrap(node);
    if (!callee) return null;
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed)
        return callee.property.name;
    return null;
}

// Each `return` argument of `fn` outside nested functions, or the body of an
// expression-bodied arrow.
function returnedExpressions(fn) {
    if (fn.type === 'ArrowFunctionExpression' && fn.expression) return [fn.body];
    const found = [];
    const visit = (node) => {
        if (FUNCTION_TYPES.has(node.type) && node !== fn) return;
        if (node.type === 'ReturnStatement' && node.argument) found.push(node.argument);
        for (const child of children(node)) visit(child);
    };
    visit(fn.body);
    return found;
}

class FileScan {
    constructor(source) {
        this.ast = acorn.parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true,
            allowHashBang: true,
        });
        this.source = source;
        this.aliases = new Set();
        this.answers = new Map(); // scope node -> Set of answer variable names
        this.keyCodeNames = new Set();
        this.collectKeyCodeNames();
        this.collectAliases();
        this.collectAnswers();
    }

    isCallee(node) {
        const callee = unwrap(node);
        if (!callee) return false;
        const name = calleeName(callee);
        if (name && (CALLEE_NAMES.has(name) || this.aliases.has(name)))
            return true;
        if (callee.type === 'LogicalExpression')
            return this.isCallee(callee.left) || this.isCallee(callee.right);
        if (FUNCTION_TYPES.has(callee.type))
            return returnedExpressions(callee).some((expr) => this.isCall(expr));
        // A factory handed a yes/no function, as in
        // teleportInput(env, 'y_n', y_n), answers with that function.
        if (callee.type === 'CallExpression')
            return callee.arguments.some((arg) => arg.type === 'Identifier'
                && (CALLEE_NAMES.has(arg.name) || this.aliases.has(arg.name)));
        return false;
    }

    isCall(node) {
        const expr = unwrap(node);
        if (!expr) return false;
        if (expr.type === 'CallExpression') return this.isCallee(expr.callee);
        if (expr.type === 'ConditionalExpression')
            return this.isCall(expr.consequent) || this.isCall(expr.alternate);
        return false;
    }

    // A const holding a key code, as in `const KEY_Y = 'y'.charCodeAt(0)`.
    collectKeyCodeNames() {
        walk(this.ast, (node) => {
            if (node.type === 'VariableDeclaration' && node.kind === 'const')
                for (const declarator of node.declarations)
                    if (declarator.id.type === 'Identifier' && declarator.init
                        && this.isKeyCode(declarator.init))
                        this.keyCodeNames.add(declarator.id.name);
        });
    }

    isKeyCode(node) {
        const expr = unwrap(node);
        if (!expr) return false;
        if (expr.type === 'Literal') return typeof expr.value === 'number';
        if (expr.type === 'Identifier')
            return KEY_CONSTANT.test(expr.name) || this.keyCodeNames.has(expr.name);
        if (expr.type === 'CallExpression' && expr.callee.type === 'MemberExpression'
            && !expr.callee.computed)
            return expr.callee.property.name === 'charCodeAt';
        return false;
    }

    // Repeat until no alias is added, so an alias of an alias is found. A
    // parameter default such as `{ ask = (query) => y_n(query, state) }` is
    // an alias too.
    collectAliases() {
        for (let size = -1; size !== this.aliases.size;) {
            size = this.aliases.size;
            walk(this.ast, (node) => {
                if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier'
                    && node.init && node.init.type !== 'AwaitExpression'
                    && this.isCallee(node.init))
                    this.aliases.add(node.id.name);
                if (node.type === 'AssignmentPattern' && node.left.type === 'Identifier'
                    && this.isCallee(node.right))
                    this.aliases.add(node.left.name);
                if (node.type === 'FunctionDeclaration' && node.id
                    && returnedExpressions(node).some((expr) => this.isCall(expr)))
                    this.aliases.add(node.id.name);
            });
        }
    }

    collectAnswers() {
        walk(this.ast, (node, scope) => {
            let name = null;
            let value = null;
            if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
                name = node.id.name;
                value = node.init;
            } else if (node.type === 'AssignmentExpression'
                && node.left.type === 'Identifier') {
                name = node.left.name;
                value = node.right;
            }
            if (!name || !value || this.aliases.has(name)) return;
            if (value.type !== 'AwaitExpression' && value.type !== 'ConditionalExpression')
                return;
            if (!this.isCall(value)) return;
            if (!this.answers.has(scope)) this.answers.set(scope, new Set());
            this.answers.get(scope).add(name);
        });
    }

    isAnswer(node, scope) {
        const expr = unwrap(node);
        if (!expr) return false;
        if (expr.type === 'Identifier')
            return this.answers.get(scope)?.has(expr.name) ?? false;
        return this.isCall(node);

    }

    findings() {
        const found = [];
        const report = (node, what) => {
            const line = node.loc.start.line;
            const text = this.source.split('\n')[line - 1].trim();
            found.push({ line, what, text });
        };
        walk(this.ast, (node, scope) => {
            if (node.type === 'BinaryExpression' && EQUALITY.has(node.operator)) {
                if ((this.isAnswer(node.left, scope) && this.isKeyCode(node.right))
                    || (this.isAnswer(node.right, scope) && this.isKeyCode(node.left)))
                    report(node, 'compares a yes/no answer with a key code');
            } else if (node.type === 'SwitchStatement'
                && this.isAnswer(node.discriminant, scope)) {
                for (const clause of node.cases)
                    if (clause.test && this.isKeyCode(clause.test))
                        report(clause, 'switches on a yes/no answer with a key-code case');
            }
        });
        return found;
    }
}

// Findings for one module's source text.
export function ynAnswerFindings(source) {
    return new FileScan(source).findings();
}

// Findings for every module directly under js/, as "js/file.js:line: text".
export function scanRepository(root = PROJECT_ROOT) {
    const dir = join(root, 'js');
    const lines = [];
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.js')).sort()) {
        const source = readFileSync(join(dir, name), 'utf8');
        for (const { line, what, text } of ynAnswerFindings(source))
            lines.push(`js/${name}:${line}: ${what}: ${text}`);
    }
    return lines;
}

if (process.argv[1] === SCRIPT_PATH) {
    const lines = scanRepository();
    for (const line of lines) console.log(line);
    process.exitCode = lines.length ? 1 : 0;
}
