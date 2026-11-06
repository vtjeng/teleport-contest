// Every statement-level call in js/ that discards a promise is either awaited
// or listed, with a reason, in scripts/discarded-promise-allowlist.json.
// scripts/discarded-promises.mjs says why: a discarded promise is the one way
// code keeps running after js/end.js nh_terminate() ends a game.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { readJsSources, scanDiscardedPromises } from './discarded-promises.mjs';

const ALLOWLIST = JSON.parse(readFileSync(
    new URL('./discarded-promise-allowlist.json', import.meta.url), 'utf8'));

test('every discarded promise in js/ is on the allowlist with a reason', () => {
    const current = scanDiscardedPromises(readJsSources());
    const problems = [];
    for (const [key, count] of Object.entries(current)) {
        const entry = ALLOWLIST.entries[key];
        if (!entry) problems.push(`new: ${key} (${count}); await it or list it with a reason`);
        else if (entry.count !== count)
            problems.push(`changed: ${key} (${entry.count} -> ${count}); await it or update its count`);
    }
    for (const key of Object.keys(ALLOWLIST.entries))
        if (!Object.hasOwn(current, key)) problems.push(`stale: ${key}; remove its entry`);
    for (const [key, entry] of Object.entries(ALLOWLIST.entries))
        if (typeof entry.reason !== 'string' || !entry.reason.trim())
            problems.push(`no reason: ${key}`);
    assert.deepEqual(problems, []);
});

test('the scan finds discarded calls to async and promise-returning functions only', () => {
    // A stand-in js/ tree. Each line names the case it exercises; the
    // expected listing below holds exactly the discarded promises.
    const sources = {
        'js/a.js': [
            "import { later } from './b.js';",
            "import * as b from './b.js';",
            'export async function slow() {}',
            // Synchronous, but returns a promise on one path.
            'export function sometimes(x) { if (x) return slow(); return 1; }',
            'function plain() { return 2; }',
            'export async function caller() {',
            '    slow();', // discarded async call
            '    await slow();', // awaited: not listed
            '    sometimes(1);', // discarded promise-returning call
            '    plain();', // synchronous: not listed
            '    later();', // discarded call through a static import
            '    b.later();', // discarded call through a namespace import
            '    void slow();', // an explicit void still discards it
            '    const kept = slow();', // kept in a binding: not listed
            '    await kept;',
            "    const { later: dyn } = await import('./b.js');",
            '    dyn();', // discarded call through a dynamic import
            '    const run = () => { slow(); };', // nested arrow, named by its binding
            '    run();',
            '}',
        ].join('\n'),
        'js/b.js': [
            "import { slow } from './a.js';",
            // Forwards a promise through an expression-bodied arrow.
            'export const later = () => slow();',
        ].join('\n'),
    };
    assert.deepEqual(scanDiscardedPromises(sources), {
        'js/a.js | caller | b.later': 1,
        'js/a.js | caller | dyn': 1,
        'js/a.js | caller | later': 1,
        'js/a.js | caller | slow': 2,
        'js/a.js | caller | sometimes': 1,
        'js/a.js | run | slow': 1,
    });
});
