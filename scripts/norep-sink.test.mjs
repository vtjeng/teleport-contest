// pline.c Norep() prints a line unless it repeats the last one. Its sink in
// js/ is an env's `norepMessage`, and js/pline.js norep_printer() is the one
// place that chooses a fallback when a caller passes none: ttyNorep. A plain
// message sink in its place prints the repeat that C suppresses, as
// makemon.c's appearance line (1492-1499) did for three makemon callers
// (dig.js, trap.js animate_statue()) and for dokick.js's "You kick ...".
//
// This check fails when js/ picks a Norep sink any other way:
// - a `norepMessage` read inside `??`, `||` or `?:`, outside norep_printer();
// - a `norepMessage` property or variable given a plain message sink
//   (`message`, `ttyPline`, or a `.message` / `.ttyPline` member).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));
const PLAIN_SINKS = new Set(['message', 'ttyPline']);
const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function isNode(value) {
    return value && typeof value.type === 'string';
}

function walk(node, visit, ancestors = []) {
    visit(node, ancestors);
    ancestors.push(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, visit, ancestors);
        } else if (isNode(value)) {
            walk(value, visit, ancestors);
        }
    }
    ancestors.pop();
}

// The name an identifier or a non-computed member expression ends in.
function tailName(node) {
    if (node?.type === 'Identifier') return node.name;
    if (node?.type === 'MemberExpression' && !node.computed) return node.property.name;
    if (node?.type === 'ChainExpression') return tailName(node.expression);
    return null;
}

// Whether `node` can evaluate to a `norepMessage` value: the reference
// itself, or a choice with one among its results. A typeof test or a
// comparison only inspects it.
function picksNorep(node) {
    if (tailName(node) === 'norepMessage') return true;
    if (node.type === 'LogicalExpression' && node.operator !== '&&')
        return picksNorep(node.left) || picksNorep(node.right);
    if (node.type === 'ConditionalExpression')
        return picksNorep(node.consequent) || picksNorep(node.alternate);
    return false;
}

function insideNorepPrinter(ancestors) {
    return ancestors.some((node) => FUNCTION_TYPES.has(node.type)
        && node.id?.name === 'norep_printer');
}

// Each finding is "file:line reason".
function norepFindings(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const findings = [];
    const report = (node, reason) =>
        findings.push(`${file}:${node.loc.start.line} ${reason}`);
    walk(ast, (node, ancestors) => {
        const operands = node.type === 'LogicalExpression' && node.operator !== '&&'
            ? [node.left, node.right]
            : node.type === 'ConditionalExpression'
                ? [node.consequent, node.alternate]
                : null;
        if (operands) {
            // Report the outermost choice only.
            const parent = ancestors.at(-1);
            const nested = parent && (parent.type === 'LogicalExpression'
                || parent.type === 'ConditionalExpression');
            if (!nested && operands.some(picksNorep) && !insideNorepPrinter(ancestors))
                report(node, 'chooses a Norep sink; use norep_printer()');
            return;
        }
        let target = null;
        let value = null;
        if (node.type === 'Property' && !node.computed && !node.shorthand) {
            target = node.key.name ?? node.key.value;
            value = node.value;
        } else if (node.type === 'VariableDeclarator' && node.init) {
            target = node.id.name;
            value = node.init;
        } else if (node.type === 'AssignmentExpression') {
            target = tailName(node.left);
            value = node.right;
        }
        if (target === 'norepMessage' && PLAIN_SINKS.has(tailName(value)))
            report(node, 'gives norepMessage a plain message sink');
    });
    return findings;
}

function scanJs() {
    const findings = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort())
        findings.push(...norepFindings(file, readFileSync(join(JS_DIR, file), 'utf8')));
    return findings;
}

test('js/ gets every Norep sink from norep_printer()', () => {
    assert.deepEqual(scanJs(), []);
});

test('norep_printer() keeps a caller\'s sink and falls back to ttyNorep', async () => {
    const { norep_printer } = await import('../js/pline.js');
    const { ttyNorep, ttyPline } = await import('../js/tty_message.js');
    const own = async () => {};
    assert.equal(norep_printer({ norepMessage: own }), own);
    // A plain message sink in the env is not a Norep sink.
    assert.equal(norep_printer({ message: ttyPline }), ttyNorep);
    assert.equal(norep_printer(), ttyNorep);
});

test('the scan finds each way of choosing a Norep sink', () => {
    // Each numbered line holds one finding; line 1 is the module's first line.
    const source = [
        'const a = { norepMessage: rawEnv.norepMessage ?? message };', // 1
        'const b = env.norepMessage ?? ttyNorep;', // 2
        'await (rawEnv.norepMessage ?? rawEnv.message ?? ttyNorep)(line);', // 3
        'const c = env.norepMessage',
        '    ?? (env.message === ttyPline ? ttyNorep : env.message);', // 4 (starts)
        'const d = { norepMessage: message };', // 6
        'const norepMessage = env.message;', // 7
        'x.norepMessage = ttyPline;', // 8
        // Not findings: the helper, a pass-through, a custom sink, a guard.
        'export function norep_printer(env = {}) { return env.norepMessage ?? ttyNorep; }',
        'const e = { norepMessage: norep_printer(env), other: env.message ?? ttyPline };',
        'const f = { norepMessage: env.norepMessage };',
        'const g = { norepMessage: (text) => sink(text) };',
        'if (printing && typeof env.norepMessage !== "function") throw new Error();',
        'if (typeof message !== "function" || typeof norepMessage !== "function") throw 0;',
    ].join('\n');
    assert.deepEqual(
        norepFindings('t.js', source).map((line) => Number(line.split(/[: ]/u)[1])),
        [1, 2, 3, 4, 6, 7, 8],
    );
});
