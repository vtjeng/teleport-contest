// dungeon.c In_W_tower() prints impossible("No boundary for Wizard's
// Tower?") on a tower level that has no dndest boundary, which #wizloaddes
// of another level file onto a tower level leaves, and C reaches it from
// every In_W_tower() call made there. impossible() waits for keys, so, as for
// builds_up() (scripts/level-difficulty-steps.test.mjs), each function on a
// path from a caller to In_W_tower() is written once as a `*_steps`
// generator (js/source_steps.js): a caller that can wait drives it with
// finish_steps(..., impossible_printer(state)) or `yield*`. The synchronous
// form under the C name runs its twin with no printer and records the print
// as a gap.
//
// C reaches In_W_tower() through mon.c mfndpos() -> mm_aggression() ->
// mm_2way_aggression() in every monster, pet and priest move, through
// mcastu.c castmu() -> choose_monster_spell() / spell_would_be_useless() ->
// wizard.c has_aggravatables(), through wizard.c aggravate(), and through
// dungeon.c Can_rise_up().
//
// This check keeps the gap from spreading or coming back:
// - every call of a synchronous form in js/ is listed below with the reason
//   it cannot wait yet, so a new one, or a converted caller going back to
//   the synchronous form, fails; a listed call that is gone fails too;
// - every call of a step generator is driven by `yield*` or by
//   finish_steps() with an onImpossible; only the synchronous form of the
//   same function may drive it without one.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { parse } from 'acorn';

// Synchronous forms: each runs its *_steps twin with gap_impossible().
const SYNC_FORMS = new Set([
    'In_W_tower',
    'Can_rise_up',
    'mfndpos',
    'has_aggravatables',
    'aggravate',
]);

// Step generators: each must be driven by its caller.
const STEP_FORMS = new Set([
    'In_W_tower_steps',
    'Can_rise_up_steps',
    'mm_2way_aggression_steps',
    'mm_aggression_steps',
    'mfndpos_steps',
    'has_aggravatables_steps',
    'aggravate_steps',
    'spell_would_be_useless_steps',
    'choose_monster_spell_steps',
]);

// "<file> | <outermost named function> | <synchronous form>": [count, reason].
const ALLOWED = {
    'teleport.js | rloc | In_W_tower': [1,
        'rloc() is synchronous and relocates every monster; C reaches '
        + 'In_W_tower() only when the Wizard of Yendor teleports'],
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

test('every synchronous In_W_tower() path is listed', () => {
    assert.deepEqual(problemsFor(scanJs().syncCalls), []);
    for (const [key, [, reason]] of Object.entries(ALLOWED))
        assert.ok(reason?.trim(), `no reason: ${key}`);
});

test('every step generator call is driven', () => {
    assert.deepEqual(scanJs().undriven, []);
});

test('the scan reports each bypass', () => {
    const source = [
        'export async function wiz_makemap(state) {',
        // A converted caller going back to the synchronous form.
        '    const a = In_W_tower(1, 2, state.u.uz, state);',
        '    const b = await finish_steps(In_W_tower_steps(1, 2, state.u.uz, state), p);',
        // A generator that is called and dropped runs none of its body.
        '    In_W_tower_steps(1, 2, state.u.uz, state);',
        // Driven, but with no printer: the impossible() becomes a gap.
        '    await finish_steps(mfndpos_steps(m, d, f, env));',
        '    return a && b;',
        '}',
        // The synchronous form may run its own twin without a printer.
        'export function aggravate(state, random) {',
        '    return finish_steps(aggravate_steps(state, random));',
        '}',
        'function* mm_aggression_steps(magr, mdef, state) {',
        '    return (yield* mm_2way_aggression_steps(magr, mdef, state));',
        '}',
    ].join('\n');
    const found = scanSource('wizcmds.js', source);
    assert.deepEqual(found.syncCalls, { 'wizcmds.js | wiz_makemap | In_W_tower': 1 });
    assert.deepEqual(found.undriven, [
        'wizcmds.js:4 In_W_tower_steps',
        'wizcmds.js:5 mfndpos_steps',
    ]);
    assert.ok(problemsFor({ ...found.syncCalls })
        .some((line) => line.startsWith('new: wizcmds.js | wiz_makemap')));
});
