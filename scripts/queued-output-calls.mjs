#!/usr/bin/env node

// Finds the synchronous calls in js/ that can leave a line in the notice
// queue, and says whether the caller prints the queue at once.
//
// C prints display.c show_glyph()'s mention_map notice inside the draw that
// raises it, and waits at its --More-- before the caller goes on. The port's
// display functions are synchronous, so the notice joins the queue
// (js/startup_a11y.js queueGlyphUpdateNotice()); js/rng.js, "Queued output",
// says why the line must print before the next core random-number draw or key
// read. A caller that can wait therefore prints the queue right after each
// synchronous call that can queue a notice:
//
//     newsym(x, y);
//     if (noticesQueued()) await emitQueuedNotices();
//
// or calls a form that prints itself, such as `await newsym_async(x, y)`.
// The flush awaits only when a line is queued, so a quiet draw stays
// synchronous.
//
// "Can queue a notice" is derived, not listed: a synchronous function is a
// draw when a chain of synchronous calls leads from it to
// queueGlyphUpdateNotice(). The call graph resolves a callee that is an
// identifier bound to a function in the same file or imported, a namespace
// member, a local name bound to such a callee (`const redraw = env.redraw ??
// newsym`, or a parameter's default), the fallback of `(hook ?? callee)(...)`,
// a member call through a display hook name (`env.newsym(...)`,
// `hooks.redraw(...)`), and the step generator a finish_steps() call drives.
// A method call on any other object is not resolved; js/rng.js checks the
// rule at run time for everything this misses.
//
// scripts/queued-output-calls.test.mjs pins the calls left unprinted and the
// synchronous functions that call a draw. Usage:
//
//   node scripts/queued-output-calls.mjs   (prints both lists as JSON)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as acorn from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

// Member calls through these property names are the port's display hooks: a
// caller injects its own redraw, and the game's is the function named here.
const HOOK_TARGETS = new Map([
    ['newsym', 'newsym'], ['redraw', 'newsym'], ['map_location', 'map_location'],
    ['feel_location', 'feel_location'], ['show_glyph', 'show_glyph_cell'],
    ['redrawSquare', 'redrawSquare'], ['see_monsters', 'see_monsters'],
    ['see_objects', 'see_objects'],
]);

// The queue's own machinery, which raises and prints the lines.
const QUEUE_FILES = new Set(['js/startup_a11y.js', 'js/tty_message.js']);

// Synchronous forms that print the lines their draw queued before they
// return (each returns a promise only then), so an awaited call needs no
// flush after it. A function whose every return is a call of one of these,
// such as monmove.js postmov()'s `draw = (x, y) => newsym_async(...)`,
// prints too (printingForms()).
export const PRINTING_FORMS = new Set(['newsym_async', 'killRedrawAsync', 'redrawSquareWaiting']);

// Each `return` argument of a function record's node, or an arrow's body.
function returned(fnNode) {
    if (fnNode.type === 'ArrowFunctionExpression' && fnNode.expression) return [fnNode.body];
    const found = [];
    const visit = (node) => {
        if (FUNCTION_TYPES.has(node.type) && node !== fnNode) return;
        if (node.type === 'ReturnStatement') found.push(node.argument);
        for (const child of children(node)) visit(child);
    };
    visit(fnNode.body);
    return found;
}

function printingForms(graph) {
    const printing = new Set(graph.fns.filter((fn) => PRINTING_FORMS.has(fn.name)));
    for (let changed = true; changed;) {
        changed = false;
        for (const fn of graph.fns) {
            if (printing.has(fn) || !fn.node || !isSync(fn)) continue;
            const results = returned(fn.node);
            if (!results.length) continue;
            const prints = results.every((expr) => expr?.type === 'CallExpression'
                && fn.calls.some((call) => call.node === expr
                    && call.targets.length && call.targets.every((to) => printing.has(to))));
            if (prints) {
                printing.add(fn);
                changed = true;
            }
        }
    }
    return printing;
}

const isNode = (value) => value && typeof value.type === 'string';

function children(node) {
    const out = [];
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) out.push(child);
        } else if (isNode(value)) {
            out.push(value);
        }
    }
    return out;
}

function importTarget(fromFile, specifier) {
    if (!specifier.startsWith('.')) return null;
    return posix.normalize(posix.join(posix.dirname(fromFile), specifier));
}

function functionName(node, parent) {
    if (node.id) return node.id.name;
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
        return parent.id.name;
    if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition')
        && parent.key.type === 'Identifier')
        return parent.key.name;
    if (parent?.type === 'AssignmentExpression' && parent.left.type === 'Identifier')
        return parent.left.name;
    return null;
}

// The call graph. Each function record holds its calls; an anonymous
// synchronous function (a callback such as forEach()'s) joins the function
// around it for reachability, since such callbacks run at once, but every
// call also keeps the innermost function around it, which decides whether
// the caller can wait.
export function buildGraph(sources) {
    const fns = [];
    const modules = new Map();
    for (const [file, text] of Object.entries(sources)) {
        const ast = acorn.parse(text, {
            ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true,
        });
        const module = { file, text, functions: new Map(), imports: new Map(),
            namespaces: new Map(), exports: new Map(), reexports: [] };
        modules.set(file, module);
        const top = { file, name: '<module>', line: 1, async: true, generator: false,
            calls: [], module, parent: null, aliases: new Map() };
        fns.push(top);
        const alias = (scope, name, expr) => {
            if (!scope.aliases.has(name)) scope.aliases.set(name, []);
            scope.aliases.get(name).push(expr);
        };
        const walk = (node, parent, grand, owner, innermost) => {
            let current = owner;
            let inner = innermost;
            if (FUNCTION_TYPES.has(node.type)) {
                const name = functionName(node, parent);
                inner = { node, name, async: node.async, generator: node.generator };
                if (name || node.async || node.generator) {
                    current = { file, name: name ?? '<anonymous>', line: node.loc.start.line,
                        async: node.async, generator: node.generator, calls: [], module,
                        parent: owner, aliases: new Map(), node };
                    fns.push(current);
                    if (name) {
                        if (!module.functions.has(name)) module.functions.set(name, []);
                        module.functions.get(name).push(current);
                    }
                }
            }
            switch (node.type) {
            case 'ImportDeclaration': {
                const target = importTarget(file, node.source.value);
                if (!target) break;
                for (const spec of node.specifiers) {
                    if (spec.type === 'ImportSpecifier')
                        module.imports.set(spec.local.name, { module: target, name: spec.imported.name });
                    else if (spec.type === 'ImportNamespaceSpecifier')
                        module.namespaces.set(spec.local.name, target);
                }
                break;
            }
            case 'ExportNamedDeclaration': {
                const target = node.source ? importTarget(file, node.source.value) : null;
                for (const spec of node.specifiers) {
                    const local = spec.local.name ?? spec.local.value;
                    const exported = spec.exported.name ?? spec.exported.value;
                    if (target) module.reexports.push({ module: target, imported: local, exported });
                    else module.exports.set(exported, local);
                }
                const decl = node.declaration;
                if (decl?.type === 'FunctionDeclaration') module.exports.set(decl.id.name, decl.id.name);
                else if (decl?.type === 'VariableDeclaration') {
                    for (const d of decl.declarations)
                        if (d.id.type === 'Identifier') module.exports.set(d.id.name, d.id.name);
                }
                break;
            }
            case 'ExportAllDeclaration': {
                const target = importTarget(file, node.source.value);
                if (target && !node.exported) module.reexports.push({ module: target, star: true });
                break;
            }
            case 'VariableDeclarator':
                if (node.id.type === 'Identifier' && node.init && !FUNCTION_TYPES.has(node.init.type))
                    alias(current, node.id.name, node.init);
                break;
            case 'AssignmentPattern':
                if (node.left.type === 'Identifier') alias(current, node.left.name, node.right);
                break;
            case 'CallExpression':
                current.calls.push({ node, parent, grand, inner, owner: current });
                break;
            default:
                break;
            }
            for (const child of children(node)) walk(child, node, parent, current, inner);
        };
        walk(ast, null, null, top, null);
    }

    const resolveExport = (file, name, seen = new Set()) => {
        const key = `${file}#${name}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const module = modules.get(file);
        if (!module) return [];
        if (module.exports.has(name)) return resolveName(module, module.exports.get(name), null, seen);
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
    const byName = new Map();
    const resolveName = (module, name, scope, seen = new Set(), depth = 0) => {
        for (let s = scope; s && depth < 3; s = s.parent) {
            if (s.aliases.has(name))
                return s.aliases.get(name).flatMap((e) => resolveExpr(module, e, s, depth + 1));
        }
        if (module.functions.has(name)) return module.functions.get(name);
        const imported = module.imports.get(name);
        if (imported) return resolveExport(imported.module, imported.name, seen);
        return [];
    };
    const resolveExpr = (module, expr, scope, depth = 0) => {
        if (!expr) return [];
        switch (expr.type) {
        case 'Identifier':
            return resolveName(module, expr.name, scope, new Set(), depth);
        case 'LogicalExpression':
            return [...resolveExpr(module, expr.left, scope, depth),
                ...resolveExpr(module, expr.right, scope, depth)];
        case 'ConditionalExpression':
            return [...resolveExpr(module, expr.consequent, scope, depth),
                ...resolveExpr(module, expr.alternate, scope, depth)];
        case 'ChainExpression':
            return resolveExpr(module, expr.expression, scope, depth);
        case 'MemberExpression': {
            if (expr.computed) return [];
            if (expr.object.type === 'Identifier' && module.namespaces.has(expr.object.name))
                return resolveExport(module.namespaces.get(expr.object.name), expr.property.name);
            const hook = HOOK_TARGETS.get(expr.property.name);
            return hook ? byName.get(hook) ?? [] : [];
        }
        default:
            return [];
        }
    };
    const resolveCallee = (call) => {
        const { callee } = call.node;
        const module = call.owner.module;
        if (callee.type === 'MemberExpression' && !callee.computed
            && ['call', 'apply'].includes(callee.property.name))
            return resolveExpr(module, callee.object, call.owner);
        return resolveExpr(module, callee, call.owner);
    };
    for (const fn of fns) {
        if (fn.name === '<module>') continue;
        if (!byName.has(fn.name)) byName.set(fn.name, []);
        byName.get(fn.name).push(fn);
    }
    // Hook names resolve to the display function of that name only.
    for (const [hook, target] of HOOK_TARGETS) {
        void hook;
        byName.set(target, (byName.get(target) ?? []).filter((fn) => fn.file === 'js/display.js'
            || fn.file === 'js/makemon_create.js'));
    }
    for (const fn of fns) {
        fn.out = [];
        for (const call of fn.calls) {
            call.targets = [...new Set(resolveCallee(call))];
            for (const to of call.targets) fn.out.push({ to, call });
            // finish_steps(gen_steps(...), ...) runs the generator now.
            const { callee, arguments: args } = call.node;
            if (callee.type === 'Identifier' && callee.name === 'finish_steps'
                && args[0]?.type === 'CallExpression') {
                const driven = resolveExpr(fn.module, args[0].callee, fn);
                for (const to of driven) fn.out.push({ to, call, driven: true });
            }
        }
    }
    return { fns, modules };
}

const isSync = (fn) => !fn.async && !fn.generator;

// Every synchronous function from which synchronous calls lead to
// queueGlyphUpdateNotice(), and that function itself. A step generator driven
// by finish_steps() counts as synchronous to its driver.
export function draws(graph) {
    const found = new Set(graph.fns.filter((fn) => fn.file === 'js/startup_a11y.js'
        && fn.name === 'queueGlyphUpdateNotice'));
    for (let changed = true; changed;) {
        changed = false;
        for (const fn of graph.fns) {
            if (found.has(fn) || fn.async || QUEUE_FILES.has(fn.file)) continue;
            if (fn.out.some(({ to, driven }) => found.has(to) && (isSync(to) || driven))) {
                found.add(fn);
                changed = true;
            }
        }
    }
    return found;
}

// `if (noticesQueued()) await emitQueuedNotices();`
function isFlush(statement) {
    if (statement?.type !== 'IfStatement' || statement.alternate) return false;
    const test = statement.test;
    if (test.type !== 'CallExpression' || test.callee.type !== 'Identifier'
        || test.callee.name !== 'noticesQueued') return false;
    let body = statement.consequent;
    if (body.type === 'BlockStatement' && body.body.length === 1) [body] = body.body;
    const awaited = body.type === 'ExpressionStatement' && body.expression.type === 'AwaitExpression'
        && body.expression.argument;
    return awaited?.type === 'CallExpression' && awaited.callee.type === 'Identifier'
        && awaited.callee.name === 'emitQueuedNotices';
}

// The statement list a statement sits in, if any.
function siblings(statement, parent) {
    if (parent?.type === 'BlockStatement' || parent?.type === 'Program'
        || parent?.type === 'StaticBlock') return parent.body;
    if (parent?.type === 'SwitchCase') return parent.consequent;
    return null;
}

function calleeText(callee, text) {
    return text.slice(callee.start, callee.end);
}

// Every call an `async` function makes to a draw, as
// { key, file, line, start, end, statement, form }, where form is
// 'flushed' (the next statement is the flush, or the callee prints itself),
// 'statement' (a whole statement with no flush after it) or 'expression'
// (a call inside a larger expression or statement). `key` is
// "<file> | <function> | <callee>". Also every synchronous function outside
// the queue's machinery that calls a draw, as "<file> | <function>": count.
export function scanQueuedOutputCalls(sources) {
    const graph = buildGraph(sources);
    const drawSet = draws(graph);
    const printing = printingForms(graph);
    const calls = [];
    const syncCallers = {};
    for (const fn of graph.fns) {
        for (const call of fn.calls) {
            if (!call.targets.some((to) => drawSet.has(to))) continue;
            if (QUEUE_FILES.has(fn.file)) continue;
            const text = fn.module.text;
            const callee = calleeText(call.node.callee, text);
            const named = call.targets.find((to) => drawSet.has(to)).name;
            const inner = call.inner;
            const where = inner?.name ?? fn.name;
            if (!inner?.async) {
                if (!inner?.generator) {
                    const key = `${fn.file} | ${where}`;
                    syncCallers[key] = (syncCallers[key] ?? 0) + 1;
                }
                continue;
            }
            let form;
            let statement = null;
            const { parent, grand } = call;
            if (call.targets.every((to) => printing.has(to)) && parent?.type === 'AwaitExpression') {
                form = 'flushed';
            } else {
                const awaitedStatement = parent?.type === 'AwaitExpression'
                    && grand?.type === 'ExpressionStatement';
                if (parent?.type === 'ExpressionStatement') statement = parent;
                else if (awaitedStatement) statement = grand;
                form = statement ? 'statement' : 'expression';
            }
            calls.push({ key: `${fn.file} | ${where} | ${callee}`, file: fn.file,
                line: call.node.loc.start.line, start: call.node.start, end: call.node.end,
                statement, form, fn: inner });
        }
    }
    // Where each call sits: the nearest statement around it, inside the
    // innermost function, that belongs to a statement list. The call is
    // flushed when the next statement of that list is the flush and no loop
    // lies between the call and that statement, so that a draw in a
    // brace-less `if` arm is flushed after the `if`, but a loop's draws each
    // print before the next square; a draw in an `if` or `switch` test is
    // never flushed after the statement. A second walk over each file finds
    // it.
    const byFile = new Map();
    for (const call of calls) {
        if (call.form === 'flushed') continue;
        if (!byFile.has(call.file)) byFile.set(call.file, new Map());
        byFile.get(call.file).set(`${call.start}:${call.end}`, call);
    }
    const LOOPS = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement',
        'WhileStatement', 'DoWhileStatement']);
    for (const [file, byOffset] of byFile) {
        const ast = acorn.parse(sources[file], {
            ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true,
        });
        const stack = [];
        const visit = (node) => {
            const call = node.type === 'CallExpression' && byOffset.get(`${node.start}:${node.end}`);
            if (call) {
                let inLoop = false;
                for (let i = stack.length - 1; i >= 0; i--) {
                    const ancestor = stack[i];
                    if (FUNCTION_TYPES.has(ancestor.type)) break;
                    if (LOOPS.has(ancestor.type)) inLoop = true;
                    // A draw in an `if` or `switch` test runs before the
                    // branch it chooses, so a flush after the statement
                    // comes too late.
                    const test = ancestor.test ?? ancestor.discriminant;
                    if ((ancestor.type === 'IfStatement' || ancestor.type === 'SwitchStatement')
                        && node.start >= test.start && node.end <= test.end) inLoop = true;
                    // Nor is one whose statement returns or throws: the flush
                    // after it never runs.
                    if (ancestor.type === 'ReturnStatement' || ancestor.type === 'ThrowStatement')
                        inLoop = true;
                    const list = siblings(ancestor, stack[i - 1]);
                    if (list && /Statement|Declaration/u.test(ancestor.type)) {
                        const index = list.indexOf(ancestor);
                        call.statementStart = ancestor.start;
                        call.statementEnd = ancestor.end;
                        call.container = ancestor.type;
                        call.inLoop = inLoop;
                        if (!inLoop && isFlush(list[index + 1])) call.form = 'flushed';
                        break;
                    }
                }
            }
            stack.push(node);
            for (const child of children(node)) visit(child);
            stack.pop();
        };
        visit(ast);
    }
    return { calls, syncCallers, drawSet };
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

export function readJsSources(root = PROJECT_ROOT) {
    return Object.fromEntries(listJsFiles(root)
        .map((file) => [file, readFileSync(join(root, file), 'utf8')]));
}

// The unflushed calls as { "<file> | <function> | <callee>": count }.
export function unflushedCalls(calls) {
    const counts = {};
    for (const call of calls) {
        if (call.form === 'flushed') continue;
        counts[call.key] = (counts[call.key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    const { calls, syncCallers, drawSet } = scanQueuedOutputCalls(readJsSources());
    console.log(JSON.stringify({
        draws: drawSet.size,
        flushed: calls.filter((c) => c.form === 'flushed').length,
        unflushed: unflushedCalls(calls),
        syncCallers: Object.fromEntries(Object.entries(syncCallers).sort(([a], [b]) => a.localeCompare(b))),
    }, null, 2));
}
