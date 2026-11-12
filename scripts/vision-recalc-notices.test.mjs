import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'acorn';

// C's vision_recalc() prints display.c show_glyph()'s mention_map lines and
// notice_all_mons()'s monster notices before it returns. The port's
// vision_recalc() is synchronous and queues them, so game code recalculates
// through js/vision.js vision_recalc_async(), which prints them at once, and
// awaits it; otherwise the notices wait for the next message or window, or a
// promise left running prints them in the middle of a later message.
//
// This check fails on four patterns:
// - a reference to vision_recalc() outside the functions that print the queue
//   themselves, whether a call or a function passed on as a callback;
// - a call to vision_recalc_async(), or to an injected `visionRecalc`
//   operation, that is not awaited or returned to an awaiting caller;
// - a call to vision_recalc_steps() that a step generator does not delegate
//   to with yield*;
// - a `visionRecalc` operation that a caller supplies as vision_recalc.
//
// The allowed functions print the queue themselves: vision_recalc_async() is
// the shared definition, and vision_recalc_steps() its form for a `*_steps`
// generator (js/source_steps.js) whose callers are partly synchronous, such
// as worn.js m_dowear_type_steps() on the creation path;
// tty_message.js vplineVisionRecalc() prints the notices under its outer
// message's pline flags; display.js docrt() brackets its two recalculations
// with program_state.in_docrt and prints after both, so the suspendVision
// and restoreVision callbacks a caller passes to docrt() may call
// vision_recalc() too.
const ALLOWED = new Set([
    'js/vision.js vision_recalc_async',
    'js/vision.js vision_recalc_steps',
    'js/tty_message.js vplineVisionRecalc',
    'js/display.js docrt',
]);
const DOCRT_PHASES = new Set(['suspendVision', 'restoreVision']);

function propertyName(node) {
    if (!node || node.computed) return null;
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'Literal') return String(node.value);
    return null;
}

// True for a call of vision_recalc_async() or of a `visionRecalc` operation:
// visionRecalc(...), env.visionRecalc(...), or an accessor called with the
// operation's name, such as transientLightOperation(env, 'visionRecalc')(...).
function isAsyncRecalcCall(node) {
    if (node.type !== 'CallExpression') return false;
    const { callee } = node;
    if (callee.type === 'Identifier')
        return callee.name === 'vision_recalc_async'
            || callee.name === 'visionRecalc';
    if (callee.type === 'MemberExpression')
        return propertyName(callee.property) === 'visionRecalc';
    if (callee.type === 'CallExpression')
        return callee.arguments.some((arg) =>
            arg.type === 'Literal' && arg.value === 'visionRecalc');
    return false;
}

function isAwaited(parent, node) {
    if (!parent) return false;
    if (parent.type === 'AwaitExpression') return true;
    if (parent.type === 'ReturnStatement') return true;
    return parent.type === 'ArrowFunctionExpression' && parent.body === node;
}

export function visionRecalcViolations(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const found = [];
    // ancestors[i] is the parent of ancestors[i + 1]; the last is the node.
    const ancestors = [];
    const context = () => {
        let fnName = '(module)';
        let docrtPhase = false;
        for (let i = 0; i < ancestors.length; i++) {
            const node = ancestors[i];
            if (!/Function/u.test(node.type)) continue;
            if (node.id?.name) fnName = node.id.name;
            const parent = ancestors[i - 1];
            const grand = ancestors[i - 2];
            const great = ancestors[i - 3];
            if (parent?.type === 'Property' && parent.value === node
                && DOCRT_PHASES.has(propertyName(parent.key))
                && grand?.type === 'ObjectExpression'
                && great?.type === 'CallExpression'
                && great.callee.type === 'Identifier'
                && great.callee.name === 'docrt') {
                docrtPhase = true;
            }
        }
        return { fnName, docrtPhase };
    };
    const where = (node) => {
        const { fnName } = context();
        return `${file}:${node.loc.start.line} ${fnName}()`;
    };
    const walk = (node) => {
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        if (!node || typeof node.type !== 'string') return;
        const parent = ancestors.at(-1);
        ancestors.push(node);
        if (node.type === 'Identifier' && node.name === 'vision_recalc') {
            const declaration = (parent?.type === 'ImportSpecifier')
                || (parent?.type === 'ExportSpecifier')
                || (parent?.type === 'FunctionDeclaration'
                    && parent.id === node)
                || (parent?.type === 'MemberExpression'
                    && parent.property === node && !parent.computed)
                || (parent?.type === 'Property' && parent.key === node
                    && !parent.computed && !parent.shorthand);
            if (!declaration) {
                const { fnName, docrtPhase } = context();
                const called = parent?.type === 'CallExpression'
                    && parent.callee === node;
                if (!called || !(ALLOWED.has(`${file} ${fnName}`)
                    || docrtPhase))
                    found.push(`${where(node)} references vision_recalc`);
            }
        }
        if (isAsyncRecalcCall(node) && !isAwaited(parent, node))
            found.push(`${where(node)} does not await a vision recalculation`);
        if (node.type === 'CallExpression'
            && node.callee.type === 'Identifier'
            && node.callee.name === 'vision_recalc_steps'
            && !(parent?.type === 'YieldExpression' && parent.delegate))
            found.push(`${where(node)} does not yield* a vision recalculation`);
        for (const [key, value] of Object.entries(node)) {
            if (key !== 'loc' && value && typeof value === 'object')
                walk(value);
        }
        ancestors.pop();
    };
    walk(ast);
    return found;
}

test('game code prints vision notices where vision_recalc() runs', () => {
    const files = readdirSync(new URL('../js/', import.meta.url))
        .filter((name) => name.endsWith('.js'))
        .map((name) => `js/${name}`);
    const found = files.flatMap((file) => visionRecalcViolations(
        file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    ));
    assert.deepEqual(found, []);
});

// Each pattern below is one this check exists to stop; the postmov() door
// case passed movemon_singlemon()'s vision_recalc_async through env and
// called it without await.
test('the check reports each bypass', () => {
    const cases = [
        // A synchronous callback queues the notices until the next message.
        ['function f() { return { visionRecalc: (c) => vision_recalc(c) }; }',
            'references vision_recalc'],
        // A synchronous operation passed on as a value.
        ['function f(env) { return op(env, "visionRecalc", vision_recalc); }',
            'references vision_recalc'],
        // A direct call from an async function.
        ['async function f() { vision_recalc(0); }',
            'references vision_recalc'],
        // An injected operation called without await.
        ['async function f(visionRecalc) { visionRecalc(0); }',
            'does not await'],
        ['async function f(env) { env.visionRecalc(0); }',
            'does not await'],
        ['async function f(env) { get(env, "visionRecalc")(0); }',
            'does not await'],
        ['async function f() { vision_recalc_async(0); }',
            'does not await'],
        // A step generator that runs the recalculation without yielding its
        // print, or yields the generator object instead of delegating.
        ['function* f() { vision_recalc_steps(1); }', 'does not yield*'],
        ['function* f() { yield vision_recalc_steps(1); }', 'does not yield*'],
    ];
    for (const [source, expected] of cases) {
        const found = visionRecalcViolations('js/x.js', source);
        assert.ok(found.some((line) => line.includes(expected)),
            `${source}: ${JSON.stringify(found)}`);
    }
    const allowed = [
        'async function f(v) { await v.visionRecalc(0); }',
        'const g = { visionRecalc: (c) => vision_recalc_async(c) };',
        'async function f() { await docrt({'
            + ' suspendVision: () => vision_recalc(2),'
            + ' restoreVision: () => vision_recalc(0) }); }',
        'import { vision_recalc } from "./vision.js";',
        'function* f() { yield* vision_recalc_steps(1); }',
    ];
    for (const source of allowed) {
        assert.deepEqual(visionRecalcViolations('js/x.js', source), [],
            source);
    }
});
