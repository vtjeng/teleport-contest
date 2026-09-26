import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_SUGGEST,
    W_RINGL,
} from '../js/const.js';
import { grease_ok } from '../js/apply.js';
import { COIN_CLASS, RING_CLASS } from '../js/objects.js';

const applyC = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const greaseOkC = applyC.slice(
    applyC.indexOf('grease_ok(struct obj *obj)'),
    applyC.indexOf('/* getobj callback for object to rub on a known touchstone */'),
);

test('grease_ok preserves the source callback classifications', () => {
    assert.match(greaseOkC, /if \(!obj\)\s*return GETOBJ_SUGGEST;/u);
    assert.match(greaseOkC, /obj->oclass == COIN_CLASS\)\s*return GETOBJ_EXCLUDE;/u);
    assert.match(greaseOkC, /inaccessible_equipment\(obj, \(const char \*\) 0, FALSE\)/u);
    assert.match(greaseOkC, /return GETOBJ_EXCLUDE_INACCESS;/u);
    assert.match(greaseOkC, /return GETOBJ_SUGGEST;/u);

    assert.equal(grease_ok(null), GETOBJ_SUGGEST);
    assert.equal(grease_ok({ oclass: COIN_CLASS }), GETOBJ_EXCLUDE);

    const gloves = { owornmask: 1 };
    const ring = {
        oclass: RING_CLASS,
        owornmask: W_RINGL,
        cursed: 0,
        bknown: 0,
    };
    assert.equal(
        grease_ok(ring, { uarmg: gloves, uleft: ring }),
        GETOBJ_EXCLUDE_INACCESS,
    );
    assert.equal(grease_ok({ oclass: RING_CLASS }), GETOBJ_SUGGEST);
});
