import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'acorn';

// shk.c onbill() prints impossible("onbill: unpaid obj ...?") when it does not
// find an unpaid object and its caller passed silent = FALSE. The port's
// impossible() is async, so js/shk.js has two entry points: onbill_async(),
// the whole function, and onbill(), the synchronous bill search. onbill()
// records the diagnostic as a gap when silent is false.
//
// This check fails on two patterns:
// - an onbill() call whose silent argument is not the literal `true`, unless
//   it is in one of the synchronous functions listed below;
// - an onbill_async() call that is not awaited.
//
// Each listed function is synchronous, and making it async would reach too
// far up its callers:
// - shk.js billable(): obj.js costly_alteration() calls it, and release()
//   and place_object() call that.
// - shk.js sub_one_frombill(): through subfrombill(), steal.js mpickobj(),
//   which makemon() reaches.
// - shk.js obfree_shop_bill(): invent.js obfree(), called by every object
//   deletion.
// - shk.js onshopbill() passes its caller's silent on; every C and JS caller
//   passes TRUE.
const SYNC_CALLERS = new Set([
    'js/shk.js billable',
    'js/shk.js sub_one_frombill',
    'js/shk.js obfree_shop_bill',
    'js/shk.js onshopbill',
]);

function isAwaited(parent, node) {
    if (!parent) return false;
    if (parent.type === 'AwaitExpression') return true;
    if (parent.type === 'ReturnStatement') return true;
    return parent.type === 'ArrowFunctionExpression' && parent.body === node;
}

export function onbillViolations(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const found = [];
    const ancestors = [];
    // The innermost enclosing function and the name it is known by.
    const enclosing = () => {
        for (let i = ancestors.length - 1; i >= 0; i--) {
            const node = ancestors[i];
            if (!/Function/u.test(node.type)) continue;
            const parent = ancestors[i - 1];
            const name = node.id?.name
                ?? (parent?.type === 'VariableDeclarator'
                    ? parent.id.name : null)
                ?? '(anonymous)';
            return { name, async: node.async };
        }
        return { name: '(module)', async: false };
    };
    const walk = (node) => {
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        if (!node || typeof node.type !== 'string') return;
        const parent = ancestors.at(-1);
        ancestors.push(node);
        if (node.type === 'CallExpression'
            && node.callee.type === 'Identifier') {
            const fn = enclosing();
            const where = `${file}:${node.loc.start.line} ${fn.name}()`;
            if (node.callee.name === 'onbill') {
                const silent = node.arguments[2];
                const silentTrue = silent?.type === 'Literal'
                    && silent.value === true;
                if (!silentTrue && (fn.async
                    || !SYNC_CALLERS.has(`${file} ${fn.name}`))) {
                    found.push(`${where} calls onbill() without silent`
                        + ' = true; use onbill_async()');
                }
            }
            if (node.callee.name === 'onbill_async'
                && !isAwaited(parent, node))
                found.push(`${where} does not await onbill_async()`);
        }
        for (const [key, value] of Object.entries(node)) {
            if (key !== 'loc' && value && typeof value === 'object')
                walk(value);
        }
        ancestors.pop();
    };
    walk(ast);
    return found;
}

test('onbill() callers that may report a stray item print impossible()', () => {
    const files = readdirSync(new URL('../js/', import.meta.url))
        .filter((name) => name.endsWith('.js'))
        .map((name) => `js/${name}`);
    const found = files.flatMap((file) => onbillViolations(
        file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    ));
    assert.deepEqual(found, []);
});

test('the onbill() check reports each bypass', () => {
    const cases = [
        // An async caller that would drop the diagnostic.
        ['async function f(o, s) { return onbill(o, s, false); }',
            'without silent'],
        // A silent argument that is only sometimes true.
        ['async function f(o, s, q) { return onbill(o, s, q); }',
            'without silent'],
        // A new synchronous caller outside the list.
        ['function f(o, s) { return onbill(o, s, false); }',
            'without silent'],
        // The listed name in another file is not the listed function.
        ['function billable(o, s) { return onbill(o, s, false); }',
            'without silent'],
        // The async entry point called without await.
        ['async function f(o, s) { const b = onbill_async(o, s, false); }',
            'does not await'],
    ];
    for (const [source, expected] of cases) {
        const found = onbillViolations('js/x.js', source);
        assert.ok(found.some((line) => line.includes(expected)),
            `${source}: ${JSON.stringify(found)}`);
    }
    const allowed = [
        ['js/x.js', 'function f(o, s) { return onbill(o, s, true); }'],
        ['js/x.js',
            'async function f(o, s) { return await onbill_async(o, s, false); }'],
        ['js/shk.js', 'function billable(o, s) { return onbill(o, s, false); }'],
    ];
    for (const [file, source] of allowed)
        assert.deepEqual(onbillViolations(file, source), [], source);
});
