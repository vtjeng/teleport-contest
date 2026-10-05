import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const DO_C = readFileSync(
    new URL('../nethack-c/upstream/src/do.c', import.meta.url), 'utf8',
);
const DO_JS = readFileSync(new URL('../js/do.js', import.meta.url), 'utf8');

test('engulfer digests a Wraith corpse through awaited void-discarded grow_up', () => {
    const c = DO_C.match(
        /staticfn boolean\s+engulfer_digests_food\(struct obj \*obj\)[\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(c, 'do.c contains the complete swallowed-food helper');
    assert.match(c,
        /could_grow = \(obj->corpsenm == PM_WRAITH\)[\s\S]*?else if \(could_grow\)[\s\S]*?\(void\) grow_up\(u\.ustuck, \(struct monst \*\) 0\);/u);
    assert.match(DO_JS,
        /couldGrow = obj\.corpsenm === PM_WRAITH[\s\S]*?else if \(couldGrow\)[\s\S]*?await grow_up\(swallower, null, \{ state \}\);/u);
});
