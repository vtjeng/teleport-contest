import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ECMD_CANCEL,
    ECMD_TIME,
    GETOBJ_EXCLUDE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
} from '../js/const.js';
import { jelly_ok } from '../js/apply.js';
import { EGG, LUMP_OF_ROYAL_JELLY } from '../js/objects.js';

const APPLY_C = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const APPLY_JS = readFileSync(
    new URL('../js/apply.js', import.meta.url), 'utf8',
);

function cFunction(source, signature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `missing C definition ${signature}`);
    const next = source.indexOf('\nstaticfn ', start + signature.length);
    return source.slice(start, next < 0 ? undefined : next);
}

test('jelly_ok follows apply.c GETOBJ target eligibility', () => {
    const cSelector = cFunction(APPLY_C, 'jelly_ok(struct obj *obj)\n{');
    assert.match(cSelector,
        /if \(obj && obj->otyp == EGG\)\s*return GETOBJ_SUGGEST;\s*return GETOBJ_EXCLUDE;/u);

    assert.equal(jelly_ok({ otyp: EGG }), GETOBJ_SUGGEST);
    assert.equal(jelly_ok(null), GETOBJ_EXCLUDE);
    assert.equal(jelly_ok({ otyp: LUMP_OF_ROYAL_JELLY }), GETOBJ_EXCLUDE);
    assert.equal(GETOBJ_PROMPT, 0x02);
});

test('royal jelly helper preserves C split, prompt, egg effects, and cleanup order', () => {
    const cHelper = cFunction(
        APPLY_C, 'use_royal_jelly(struct obj **optr)\n{',
    );
    const jsStart = APPLY_JS.indexOf('// C ref: apply.c jelly_ok()');
    const jsEnd = APPLY_JS.indexOf('\nconst DOAPPLY_UNPORTED_NAMED_ARMS', jsStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    const jsHelper = APPLY_JS.slice(jsStart, jsEnd);

    assert.match(cHelper,
        /if \(splitit\)\s*obj = splitobj\(obj, 1L\);[\s\S]*?freeinv\(obj\);[\s\S]*?getobj\("rub the royal jelly on", jelly_ok, GETOBJ_PROMPT\)/u);
    assert.match(jsHelper,
        /if \(splitit\) obj = splitobj\(obj, 1, env\);\s*await freeinv\(obj, env\);[\s\S]*?getobj\(\s*'rub the royal jelly on', jelly_ok, GETOBJ_PROMPT, state,/u);

    assert.ok(cHelper.indexOf('if (eobj->corpsenm == PM_KILLER_BEE)')
        < cHelper.indexOf('if (obj->cursed)'));
    assert.ok(jsHelper.indexOf('if (eobj.corpsenm === PM_KILLER_BEE)')
        < jsHelper.indexOf('if (obj.cursed)'));
    assert.match(cHelper,
        /kill_egg\(eobj\);[\s\S]*?setnotworn\(obj\);[\s\S]*?obfree\(obj, \(struct obj \*\) 0\);\s*\*optr = 0;\s*return ECMD_TIME;/u);
    assert.match(jsHelper,
        /note_unported\('timeout\.c kill_egg'\);[\s\S]*?await setnotworn\(obj, env\);\s*obfree\(obj, null, env\);\s*objp\.obj = null;\s*return ECMD_TIME;/u);
    assert.match(jsHelper, /attach_egg_hatch_timeout\(eobj, 0, env\)/u);
});

test('doapply and dorub wire their apply.c royal-jelly caller arms', () => {
    const cDoapply = cFunction(APPLY_C, 'doapply(void)\n{');
    const cDorub = cFunction(APPLY_C, 'dorub(void)\n{');
    assert.match(cDoapply,
        /case LUMP_OF_ROYAL_JELLY:\s*res = use_royal_jelly\(&obj\);\s*break;/u);
    assert.match(cDorub,
        /obj->otyp == LUMP_OF_ROYAL_JELLY\)\s*\{?\s*return use_royal_jelly\(&obj\);/u);

    const doapplyStart = APPLY_JS.indexOf('export async function doapply(');
    const doapplyEnd = APPLY_JS.indexOf('\n}\n', doapplyStart);
    const dorubStart = APPLY_JS.indexOf('export async function dorub(');
    const dorubEnd = APPLY_JS.indexOf('\n}\n', dorubStart);
    assert.ok(doapplyStart >= 0 && doapplyEnd > doapplyStart);
    assert.ok(dorubStart >= 0 && dorubEnd > dorubStart);
    const jsDoapply = APPLY_JS.slice(doapplyStart, doapplyEnd);
    const jsDorub = APPLY_JS.slice(dorubStart, dorubEnd);
    assert.match(jsDoapply,
        /case LUMP_OF_ROYAL_JELLY:\s*\{\s*const result = await use_royal_jelly\(objp, state, env\);\s*obj = objp\.obj;\s*return result;/u);
    assert.match(jsDorub,
        /if \(obj\.otyp === LUMP_OF_ROYAL_JELLY\)\s*return use_royal_jelly\(\{ obj \}, state, env\);/u);
    assert.equal(ECMD_CANCEL, 0x02);
    assert.equal(ECMD_TIME, 0x01);
});
