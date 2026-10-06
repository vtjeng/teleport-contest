import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITU_JS = readFileSync(new URL('../js/mhitu.js', import.meta.url), 'utf8');

// C refs: mhitu.c:doseduce() and its discarded-result mayberem() helper.
test('doseduce keeps the C outcome order and names its void armor-removal gap', () => {
    const source = MHITU_C.match(
        /int\s+doseduce\(struct monst \*mon\)\s*\{[\s\S]*?\n\}\n\n\/\* 'mon' tries to remove/u,
    )?.[0];
    assert.ok(source, 'mhitu.c contains the complete doseduce body');
    assert.match(source,
        /if \(mon->mcan \|\| mon->mspec_used\)[\s\S]*?return 0;[\s\S]*?if \(unresponsive\(\)\)[\s\S]*?return 0;[\s\S]*?stop_donning\([\s\S]*?for \(ring = gi\.invent; ring; ring = nring\)[\s\S]*?naked = \(!uarmc && !uarmf && !uarmg && !uarms && !uarmh && !uarmu\);[\s\S]*?mayberem\(mon, Who, uarmc,[\s\S]*?if \(uarm \|\| uarmc\)[\s\S]*?return 1;[\s\S]*?urgent_pline\([\s\S]*?rn2\(35\)[\s\S]*?switch \(rn2\(5\)\)[\s\S]*?if \(mon->mtame\)[\s\S]*?rn2\(20\)[\s\S]*?if \(!rn2\(25\)\)[\s\S]*?rloc\(mon, RLOC_MSG\)[\s\S]*?return 1;/u);

    const mayberem = MHITU_C.match(
        /staticfn void\s+mayberem\(struct monst \*mon,[\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(mayberem, 'mhitu.c defines the complete mayberem helper');
    assert.match(mayberem, /if \(!obj \|\| !obj->owornmask\)\s*return;/u);

    assert.match(MHITU_JS,
        /export async function doseduce\([\s\S]*?if \(mon\.mcan \|\| mon\.mspec_used\)[\s\S]*?return 0;[\s\S]*?if \(unresponsive\(state\)\)[\s\S]*?return 0;[\s\S]*?await stop_donning\(null, state\)[\s\S]*?for \(let ring = state\.invent; ring;\)[\s\S]*?const naked = !state\.uarmc[\s\S]*?mayberem\(\); \/\/ cloak[\s\S]*?if \(state\.uarm \|\| state\.uarmc\)[\s\S]*?Time stands still[\s\S]*?random\.rn2\(35\)[\s\S]*?random\.rn2\(20\)[\s\S]*?random\.rn2\(25\)[\s\S]*?await rloc\(mon, RLOC_MSG[\s\S]*?return 1;/u);
    assert.match(MHITU_JS,
        /const mayberem = \(\) => note_unported\('mhitu\.c mayberem'\)/u);
});
