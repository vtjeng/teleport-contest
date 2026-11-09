// Enforces js/region.js's default-at-source rule: region.c calls
// block_point(), unblock_point(), does_block(), cansee(), newsym(), pline()
// and safe_teleds() directly, so region.js runs those C functions whenever
// a caller supplies no operation of its own. It must not refuse instead.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const REGION_JS = readFileSync(new URL('../js/region.js', import.meta.url), 'utf8');
const MONSTER_ACTIONS_JS = readFileSync(
    new URL('../js/unported_monster_actions.js', import.meta.url),
    'utf8',
);

function defaultedOperations(source) {
    const table = source.match(/const REGION_OPERATIONS = \{([\s\S]*?)\n\};/u)?.[1];
    assert.ok(table, 'REGION_OPERATIONS table is present');
    return [...table.matchAll(/^ {4}(\w+):/gmu)].map((match) => match[1]).sort();
}

// Every operation region.js calls through its env, as `env.name(`,
// `visual.name(` or `operations.name =`.
function calledOperations(source) {
    const names = new Set();
    for (const match of source.matchAll(/\b(?:env|visual)\.(\w+)\(/gu))
        names.add(match[1]);
    for (const match of source.matchAll(/\boperations\.(\w+) =/gu))
        names.add(match[1]);
    return [...names].sort();
}

test('region.js never refuses for a missing operation or callback', () => {
    assert.doesNotMatch(REGION_JS, /\brequiredOperation\b/u);
    // region.c's callbacks[] holds only inside_gas_cloud and
    // expire_gas_cloud, and create_gas_cloud_selection()'s one caller runs
    // during level creation, so region.js has no refusal class or
    // injected callback table.
    assert.doesNotMatch(REGION_JS, /\bUnsupported\w*Error\b/u);
    assert.doesNotMatch(REGION_JS, /\.callbacks\b|\bcallbacks:/u);
});

test('monster movement does not refuse a region transition', () => {
    // C never sets a region's four transition callbacks, so a monster's move
    // goes straight to m_in_out_region().
    assert.doesNotMatch(MONSTER_ACTIONS_JS, /'a region transition'/u);
    assert.doesNotMatch(MONSTER_ACTIONS_JS, /\b(?:can_)?(?:enter|leave)_f\b/u);
});

test('every operation region.js calls has its C default', () => {
    const defaults = defaultedOperations(REGION_JS);
    assert.deepEqual(defaults, [
        'blockPoint', 'canSee', 'doesBlock', 'message', 'newsym',
        'safeTeleds', 'unblockPoint',
    ]);
    const missing = calledOperations(REGION_JS)
        .filter((name) => !defaults.includes(name));
    assert.deepEqual(missing, []);
});

test('the scan finds a refusal and an undefaulted call', () => {
    const bypass = [
        'const REGION_OPERATIONS = {',
        '    message: (text, state) => ttyPline(text, state),',
        '};',
        "function f(env) { return requiredOperation(env, 'canSee'); }",
        'async function g(env) { await env.safeTeleds(0); }',
    ].join('\n');
    assert.match(bypass, /\brequiredOperation\b/u);
    assert.deepEqual(defaultedOperations(bypass), ['message']);
    assert.deepEqual(calledOperations(bypass), ['safeTeleds']);
});
