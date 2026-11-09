// js/corpstat.js mkcorpstat() returns a promise when it is asked for random
// placement at <0,0>, because teleport.c rloco() is asynchronous here; every
// other call shape returns the object itself. A caller that can pass <0,0>
// must therefore await the result, or it would treat the promise as the
// object. mon.c make_corpse() is that caller (a dead vault guard parked at
// <0,0> by vault.c parkguard()). This test fails when a new call site does
// not await mkcorpstat() and is not one of the reviewed callers below, all of
// which pass a square on the map.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Reviewed call sites that do not await, by file, with the number of such
// calls in that file. Each one passes map coordinates that cannot be <0,0>:
const UNAWAITED = new Map([
    // mk_named_object(), whose C callers name a map square.
    ['corpstat.js', 1],
    // mklev.c fixup_special()'s statue, the iron-bars corpse and the random
    // room statue; each square comes from the level being built.
    ['mklev.js', 3],
    // mklev.c mktrap_victim(), at the trap's square.
    ['mktrap.js', 1],
    // mon.c monstone(), at a petrified monster's square on the map; a parked
    // vault guard is already dead and is never stoned.
    ['mon.js', 1],
    // trap.c mk_trap_statue(), at the statue trap's square.
    ['trap.js', 1],
]);

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/(^|[^:\\])\/\/.*$/gmu, '$1');
}

test('every mkcorpstat() call that can pass <0,0> awaits it', () => {
    const found = new Map();
    for (const name of readdirSync(JS_DIR).filter((n) => n.endsWith('.js'))) {
        const source = stripComments(readFileSync(join(JS_DIR, name), 'utf8'));
        for (const match of source.matchAll(/\bmkcorpstat\(/gu)) {
            const before = source.slice(Math.max(0, match.index - 40), match.index);
            if (/function\s+$/u.test(before)) continue;
            if (/await\s+$/u.test(before)) continue;
            found.set(name, (found.get(name) ?? 0) + 1);
        }
    }
    assert.deepEqual(
        Object.fromEntries([...found].sort()),
        Object.fromEntries([...UNAWAITED].sort()),
        'an unawaited mkcorpstat() call was added or removed; await it, or '
            + 'review it and update UNAWAITED',
    );
});
