#!/usr/bin/env node

// Lists every statement-level call in js/ that discards a promise: the call
// is a whole expression statement (or `void call()`), and its callee is an
// `async` function or a function that returns a promise on some path.
//
// js/end.js nh_terminate() ends a game by suspending the chain that called
// it, so no caller resumes, as in C, where it exits the process. A promise
// that some caller discarded is not part of that chain: the code behind it
// keeps running after the game ended. The runtime guard in js/rng.js
// ("Segment termination") and the drain in NethackGame.start() bound what it
// can do; this list keeps new ones from appearing unnoticed.
// scripts/discarded-promises.test.mjs compares it with
// scripts/discarded-promise-allowlist.json, where each entry needs a reason.
//
// The scan is a review aid, not a proof. It resolves a callee only when it is
// an identifier bound to a function in the same file, a static import, a
// namespace import's member, or a name destructured from `await import()`;
// a method call on any other object (`env.message()`, `display.readKey()`)
// is not resolved. It sees only statement-level calls: not `.then()` chains,
// callbacks handed to synchronous code, or `cond && f()` forms.
//
// Usage: node scripts/discarded-promises.mjs   (prints the current list as
// JSON keyed like the allowlist)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as acorn from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

function parse(source) {
    return acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        allowHashBang: true,
    });
}

function isNode(value) {
    return value && typeof value.type === 'string';
}

// Visit every node below `node`, passing its ancestors (outermost first).
function walk(node, visit, ancestors = []) {
    visit(node, ancestors);
    ancestors.push(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, visit, ancestors);
        } else if (isNode(value)) {
            walk(value, visit, ancestors);
        }
    }
    ancestors.pop();
}

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

// Each `return` argument of `fn` that is not inside a nested function, or the
// body of an expression-bodied arrow.
function returnedExpressions(fn) {
    if (fn.type === 'ArrowFunctionExpression' && fn.expression) return [fn.body];
    const found = [];
    const visit = (node) => {
        if (FUNCTION_TYPES.has(node.type) && node !== fn) return;
        if (node.type === 'ReturnStatement' && node.argument) found.push(node.argument);
        for (const key of Object.keys(node)) {
            if (key === 'loc') continue;
            const value = node[key];
            if (Array.isArray(value)) {
                for (const child of value) if (isNode(child)) visit(child);
            } else if (isNode(value)) {
                visit(value);
            }
        }
    };
    visit(fn.body);
    return found;
}

function importTarget(fromFile, specifier) {
    if (!specifier.startsWith('.')) return null;
    return posix.normalize(posix.join(posix.dirname(fromFile), specifier));
}

// One file's bindings: functions defined in it by name, and names bound to
// another module's export.
function indexModule(file, ast) {
    const functions = new Map(); // name -> [function nodes]
    const imports = new Map(); // local name -> { module, name }
    const namespaces = new Map(); // local name -> module
    const exports = new Map(); // exported name -> local name
    const reexports = []; // { module, imported, exported } or { module, star }
    const addFunction = (name, node) => {
        if (!functions.has(name)) functions.set(name, []);
        functions.get(name).push(node);
    };
    walk(ast, (node, ancestors) => {
        if (node.type === 'FunctionDeclaration' && node.id)
            addFunction(node.id.name, node);
        else if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier'
            && node.init && FUNCTION_TYPES.has(node.init.type))
            addFunction(node.id.name, node.init);
        else if (node.type === 'ImportDeclaration') {
            const module = importTarget(file, node.source.value);
            if (!module) return;
            for (const spec of node.specifiers) {
                if (spec.type === 'ImportSpecifier')
                    imports.set(spec.local.name, { module, name: spec.imported.name });
                else if (spec.type === 'ImportNamespaceSpecifier')
                    namespaces.set(spec.local.name, module);
            }
        } else if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern'
            && node.init?.type === 'AwaitExpression'
            && node.init.argument.type === 'ImportExpression'
            && node.init.argument.source.type === 'Literal') {
            // const { a, b: c } = await import('./x.js');
            const module = importTarget(file, node.init.argument.source.value);
            if (!module) return;
            for (const prop of node.id.properties) {
                if (prop.type !== 'Property' || prop.key.type !== 'Identifier'
                    || prop.value.type !== 'Identifier') continue;
                imports.set(prop.value.name, { module, name: prop.key.name });
            }
        } else if (node.type === 'ExportNamedDeclaration') {
            const module = node.source ? importTarget(file, node.source.value) : null;
            for (const spec of node.specifiers) {
                const local = spec.local.name ?? spec.local.value;
                const exported = spec.exported.name ?? spec.exported.value;
                if (module) reexports.push({ module, imported: local, exported });
                else exports.set(exported, local);
            }
            const decl = node.declaration;
            if (decl?.type === 'FunctionDeclaration') exports.set(decl.id.name, decl.id.name);
            else if (decl?.type === 'VariableDeclaration')
                for (const d of decl.declarations)
                    if (d.id.type === 'Identifier') exports.set(d.id.name, d.id.name);
        } else if (node.type === 'ExportAllDeclaration' && !node.exported) {
            const module = importTarget(file, node.source.value);
            if (module) reexports.push({ module, star: true });
        }
        void ancestors;
    });
    return { file, ast, functions, imports, namespaces, exports, reexports };
}

export function listJsFiles(root = PROJECT_ROOT) {
    const found = [];
    const visit = (dir) => {
        for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
            const path = posix.join(dir, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith('.js')) found.push(path);
        }
    };
    visit('js');
    return found.sort();
}

// The current list: { "<file> | <enclosing function> | <callee>": count }.
// `sources` maps each js/ path to its text (tests pass edited copies).
export function scanDiscardedPromises(sources) {
    const modules = new Map();
    for (const [file, text] of Object.entries(sources))
        modules.set(file, indexModule(file, parse(text)));

    // Resolve a name in `module` to function nodes, following imports.
    const resolveExport = (moduleFile, name, seen = new Set()) => {
        const key = `${moduleFile}#${name}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const module = modules.get(moduleFile);
        if (!module) return [];
        if (module.exports.has(name)) return resolveLocal(module, module.exports.get(name), seen);
        for (const re of module.reexports) {
            if (re.star) {
                const found = resolveExport(re.module, name, seen);
                if (found.length) return found;
            } else if (re.exported === name) {
                return resolveExport(re.module, re.imported, seen);
            }
        }
        return [];
    };
    const resolveLocal = (module, name, seen = new Set()) => {
        if (module.functions.has(name)) return module.functions.get(name);
        const imported = module.imports.get(name);
        if (imported) return resolveExport(imported.module, imported.name, seen);
        return [];
    };
    const resolveCallee = (module, callee) => {
        if (callee.type === 'Identifier') return resolveLocal(module, callee.name);
        if (callee.type === 'MemberExpression' && !callee.computed
            && callee.object.type === 'Identifier'
            && module.namespaces.has(callee.object.name))
            return resolveExport(module.namespaces.get(callee.object.name), callee.property.name);
        return [];
    };

    // Which function nodes return a promise on some path, to a fixed point.
    const owner = new Map(); // function node -> module
    for (const module of modules.values())
        for (const nodes of module.functions.values())
            for (const fn of nodes) owner.set(fn, module);
    const promising = new Set();
    for (const fn of owner.keys()) if (fn.async) promising.add(fn);
    const isPromise = (module, expr) => {
        switch (expr.type) {
        case 'NewExpression':
            return expr.callee.type === 'Identifier' && expr.callee.name === 'Promise';
        case 'CallExpression': {
            const callee = expr.callee;
            if (callee.type === 'MemberExpression' && !callee.computed) {
                if (callee.object.type === 'Identifier' && callee.object.name === 'Promise')
                    return true;
                if (['then', 'catch', 'finally'].includes(callee.property.name)) return true;
            }
            return resolveCallee(module, callee).some((fn) => promising.has(fn));
        }
        case 'ChainExpression':
            return isPromise(module, expr.expression);
        case 'ConditionalExpression':
            return isPromise(module, expr.consequent) || isPromise(module, expr.alternate);
        case 'LogicalExpression':
            return isPromise(module, expr.left) || isPromise(module, expr.right);
        case 'SequenceExpression':
            return isPromise(module, expr.expressions.at(-1));
        case 'ImportExpression':
            return true;
        default:
            return false;
        }
    };
    for (let changed = true; changed;) {
        changed = false;
        for (const [fn, module] of owner) {
            if (promising.has(fn)) continue;
            if (returnedExpressions(fn).some((expr) => isPromise(module, expr))) {
                promising.add(fn);
                changed = true;
            }
        }
    }

    const counts = {};
    for (const module of modules.values()) {
        walk(module.ast, (node, ancestors) => {
            if (node.type !== 'ExpressionStatement') return;
            let expr = node.expression;
            if (expr.type === 'UnaryExpression' && expr.operator === 'void') expr = expr.argument;
            if (expr.type === 'ChainExpression') expr = expr.expression;
            if (expr.type !== 'CallExpression') return;
            if (!resolveCallee(module, expr.callee).some((fn) => promising.has(fn))) return;
            const key = `${module.file} | ${enclosingName(ancestors)} | ${calleeText(expr.callee)}`;
            counts[key] = (counts[key] ?? 0) + 1;
        });
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function calleeText(callee) {
    if (callee.type === 'Identifier') return callee.name;
    return `${callee.object.name}.${callee.property.name}`;
}

// The nearest named function around a statement, or <module>.
function enclosingName(ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const node = ancestors[i];
        if (!FUNCTION_TYPES.has(node.type)) continue;
        if (node.id) return node.id.name;
        const parent = ancestors[i - 1];
        if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
            return parent.id.name;
        if ((parent?.type === 'MethodDefinition' || parent?.type === 'Property')
            && parent.key.type === 'Identifier')
            return parent.key.name;
    }
    return '<module>';
}

export function readJsSources(root = PROJECT_ROOT) {
    return Object.fromEntries(listJsFiles(root)
        .map((file) => [file, readFileSync(join(root, file), 'utf8')]));
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH)
    console.log(JSON.stringify(scanDiscardedPromises(readJsSources()), null, 2));
