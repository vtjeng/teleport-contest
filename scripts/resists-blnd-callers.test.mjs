// mondata.c resists_blnd() prints impossible("'Blnd_resist' but not
// resists_blnd()?") for a hero who has light-induced blindness resistance
// that no form attack or artifact explains, which #wizintrinsic gives. C
// reaches it from every hero resists_blnd() call: directly, and through
// mondata.c can_blnd() and muse.c find_offensive(). impossible() waits for
// keys, so, as for In_W_tower() (scripts/in-w-tower-callers.test.mjs), each
// function on those paths is written once as a `*_steps` generator
// (js/source_steps.js): a caller that can wait drives it with
// finish_steps(..., impossible_printer(state)) or `yield*`. The synchronous
// form under the C name runs its twin with no printer and records the print
// as a gap.
//
// This check keeps the gap from spreading or coming back:
// - every call of a synchronous form in js/ is listed below with the reason
//   it cannot reach the print, so a new one, or a converted caller going
//   back to the synchronous form, fails; a listed call that is gone fails
//   too;
// - every call of a step generator is driven by `yield*` or by
//   finish_steps() with an onImpossible; only the synchronous form of the
//   same function may drive it without one.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { parse } from 'acorn';

// Synchronous forms: each runs its *_steps twin with gap_impossible().
const SYNC_FORMS = new Set([
    'resists_blnd',
    'can_blnd',
    'find_offensive',
]);

// Step generators: each must be driven by its caller.
const STEP_FORMS = new Set([
    'resists_blnd_steps',
    'can_blnd_steps',
    'find_offensive_steps',
]);

// "<file> | <outermost named function> | <synchronous form>": [count, reason].
const ALLOWED = {
    'mondata.js | Resists_Elem | resists_blnd': [1,
        'no C or JavaScript caller passes BLND_RES to Resists_Elem(); the '
        + 'resists_fire() family of macros names other properties'],
};

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

// The outermost named function around a node, or <module>.
function enclosingName(ancestors) {
    for (let i = 0; i < ancestors.length; i++) {
        const node = ancestors[i];
        if (!FUNCTION_TYPES.has(node.type)) continue;
        const parent = ancestors[i - 1];
        const own = node.id?.name
            ?? (parent?.type === 'VariableDeclarator' ? parent.id?.name : null);
        if (own) return own;
    }
    return '<module>';
}

function calleeName(callee) {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed)
        return callee.property.name;
    return null;
}

export function scanSource(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const syncCalls = {};
    const undriven = [];
    walk(ast, (node, ancestors) => {
        if (node.type !== 'CallExpression') return;
        const name = calleeName(node.callee);
        if (SYNC_FORMS.has(name)) {
            const key = `${file} | ${enclosingName(ancestors)} | ${name}`;
            syncCalls[key] = (syncCalls[key] ?? 0) + 1;
        } else if (STEP_FORMS.has(name)) {
            const parent = ancestors[ancestors.length - 1];
            const delegated = parent?.type === 'YieldExpression' && parent.delegate;
            const finished = parent?.type === 'CallExpression'
                && calleeName(parent.callee) === 'finish_steps'
                && parent.arguments[0] === node;
            const printed = finished && parent.arguments.length > 1;
            const ownSyncForm = finished
                && `${enclosingName(ancestors)}_steps` === name;
            if (!delegated && !printed && !ownSyncForm)
                undriven.push(`${file}:${node.loc.start.line} ${name}`);
        }
    });
    return { syncCalls, undriven };
}

function scanJs() {
    const dir = new URL('../js/', import.meta.url);
    const syncCalls = {};
    const undriven = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
        const found = scanSource(file, readFileSync(new URL(file, dir), 'utf8'));
        Object.assign(syncCalls, found.syncCalls);
        undriven.push(...found.undriven);
    }
    return { syncCalls, undriven };
}

// Function that only checks a found-calls map against ALLOWED.
function problemsFor(syncCalls) {
    const problems = [];
    for (const [key, count] of Object.entries(syncCalls)) {
        const entry = ALLOWED[key];
        if (!entry) {
            problems.push(`new: ${key} (${count}); drive the *_steps form `
                + 'from a caller that can wait, or list it with a reason');
        } else if (entry[0] !== count) {
            problems.push(`changed: ${key} (${entry[0]} -> ${count})`);
        }
    }
    for (const key of Object.keys(ALLOWED))
        if (!Object.hasOwn(syncCalls, key)) problems.push(`stale: ${key}; remove it`);
    return problems;
}

test('every synchronous resists_blnd() path is listed', () => {
    assert.deepEqual(problemsFor(scanJs().syncCalls), []);
    for (const [key, [, reason]] of Object.entries(ALLOWED))
        assert.ok(reason?.trim(), `no reason: ${key}`);
});

test('every step generator call is driven', () => {
    assert.deepEqual(scanJs().undriven, []);
});

test('the scan reports each bypass', () => {
    const source = [
        'export async function flashburn(duration, state) {',
        // A converted caller going back to the synchronous form.
        '    const a = resists_blnd(state.youmonst, state);',
        '    const b = await finish_steps(resists_blnd_steps(state.youmonst, state), p);',
        // A generator that is called and dropped runs none of its body.
        '    can_blnd_steps(null, state.youmonst, 0, null, state);',
        // Driven, but with no printer: the impossible() becomes a gap.
        '    await finish_steps(find_offensive_steps(m, env));',
        '    return a && b;',
        '}',
        // The synchronous form may run its own twin without a printer.
        'export function can_blnd(magr, mdef, aatyp, obj, state) {',
        '    return finish_steps(can_blnd_steps(magr, mdef, aatyp, obj, state));',
        '}',
        'function* can_blnd_steps(magr, mdef, aatyp, obj, state) {',
        '    return !(yield* resists_blnd_steps(mdef, state));',
        '}',
    ].join('\n');
    const found = scanSource('zap.js', source);
    assert.deepEqual(found.syncCalls, { 'zap.js | flashburn | resists_blnd': 1 });
    assert.deepEqual(found.undriven, [
        'zap.js:4 can_blnd_steps',
        'zap.js:5 find_offensive_steps',
    ]);
    assert.ok(problemsFor({ ...found.syncCalls })
        .some((line) => line.startsWith('new: zap.js | flashburn')));
});
