import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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

test('use_bell preserves C branch order and its deferred common effects', () => {
    const cUseBell = cFunction(APPLY_C, 'use_bell(struct obj **optr)\n{');
    const jsUseBell = APPLY_JS.slice(
        APPLY_JS.indexOf('export async function use_bell('),
        APPLY_JS.indexOf('\nconst DOAPPLY_UNPORTED_NAMED_ARMS',
            APPLY_JS.indexOf('export async function use_bell(')),
    );
    assert.match(cUseBell,
        /consume_obj_charge\(obj, TRUE\);[\s\S]*if \(u\.uswallow\)[\s\S]*else if \(obj->cursed\)[\s\S]*else if \(invoking\)[\s\S]*else if \(obj->blessed\)[\s\S]*else \{ \/\* uncursed \*\/[\s\S]*findit\(\)/u);
    assert.match(jsUseBell,
        /consume_obj_charge\(obj, true,[\s\S]*if \(state\.u\.uswallow\)[\s\S]*else if \(obj\.cursed\)[\s\S]*else if \(invoking\)[\s\S]*else if \(obj\.blessed\)[\s\S]*else if \(await findit\(/u);

    // C defers both makeknown() and wake_nearby() until after the branch. The
    // promise owner must finish find/open feedback before those shared effects.
    assert.ok(cUseBell.indexOf('if (learno)')
        < cUseBell.indexOf('if (wakem)'));
    assert.ok(jsUseBell.indexOf('if (learno)')
        < jsUseBell.indexOf('if (wakem)'));
    assert.match(cUseBell, /useup\(obj\);\s*\*optr = 0;/u);
    assert.match(jsUseBell, /useup\(obj,[\s\S]*?objp\.obj = null;/u);
});

test('doapply wires both bell arms before its surviving-artifact tail', () => {
    const cDoapply = cFunction(APPLY_C, 'doapply(void)\n{');
    const jsStart = APPLY_JS.indexOf('export async function doapply(');
    const jsDoapply = APPLY_JS.slice(jsStart);
    assert.match(cDoapply,
        /case BELL:\s*case BELL_OF_OPENING:\s*use_bell\(&obj\);\s*break;/u);
    assert.match(jsDoapply,
        /case BELL:\s*case BELL_OF_OPENING:\s*\{\s*await use_bell\(objp, state, env\);\s*obj = objp\.obj;\s*let result = ECMD_TIME;[\s\S]*if \(obj\?\.oartifact\) result \|= arti_speak\(obj, state\)/u);
});

test('the Bell records its discarded shop check without replacing other callers', () => {
    const cConsume = cFunction(
        readFileSync(new URL('../nethack-c/upstream/src/invent.c', import.meta.url),
            'utf8'),
        'consume_obj_charge(\n',
    );
    const jsConsume = readFileSync(
        new URL('../js/invent.js', import.meta.url), 'utf8',
    );
    const jsBell = APPLY_JS.slice(
        APPLY_JS.indexOf('export async function use_bell('),
        APPLY_JS.indexOf('\nconst DOAPPLY_UNPORTED_NAMED_ARMS',
            APPLY_JS.indexOf('export async function use_bell(')),
    );
    assert.match(cConsume,
        /if \(maybe_unpaid\)\s*check_unpaid\(obj\);\s*obj->spe -= 1;\s*if \(obj->known\)\s*update_inventory\(\);/u);
    assert.match(jsConsume,
        /const checkUnpaid = normalized\.checkUnpaid \?\? check_unpaid;\s*checkUnpaid\(obj, normalized\.state\);\s*\}\s*obj\.spe -= 1;\s*if \(obj\.known\) update_inventory/u);
    assert.match(jsBell,
        /checkUnpaid\(item, chargeState\)[\s\S]*note_unported\('shk\.c check_unpaid'\)/u);
});
