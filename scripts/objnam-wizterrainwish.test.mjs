import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DRAWBRIDGE_DOWN, DRAWBRIDGE_UP, W_NONDIGGABLE, W_NONPASSWALL,
} from '../js/const.js';
import {
    dbterrainmesg, set_wallprop_from_str, wizterrainwish,
} from '../js/objnam_readobjnam.js';

test('set_wallprop_from_str ORs source spellings into wall_info', () => {
    const location = { wall_info: 0x40 };
    const state = { u: { ux: 4, uy: 7 }, level: { at: () => location } };

    set_wallprop_from_str('undiggable unphaseable wall', state);

    assert.equal(location.wall_info,
        0x40 | W_NONDIGGABLE | W_NONPASSWALL);
});

test('set_wallprop_from_str keeps the C substring checks case-sensitive', () => {
    const location = { wall_info: 0 };
    const state = { u: { ux: 4, uy: 7 }, level: { at: () => location } };

    set_wallprop_from_str('Undiggable Unphaseable wall', state);

    assert.equal(location.wall_info, 0);
});

test('dbterrainmesg names the square relative to the drawbridge state', async () => {
    const location = { typ: DRAWBRIDGE_UP };
    const messages = [];
    const state = { level: { at: () => location } };
    const env = { message: (text) => messages.push(text) };

    await dbterrainmesg('Ice', 4, 7, state, env);
    location.typ = DRAWBRIDGE_DOWN;
    await dbterrainmesg('Floor', 4, 7, state, env);

    assert.deepEqual(messages, [
        'Ice in front of the drawbridge.',
        'Floor under the drawbridge.',
    ]);
});

test('wizterrainwish returns its unmatched result synchronously', () => {
    const state = {
        u: { ux: 4, uy: 7 },
        level: { at: () => ({ typ: DRAWBRIDGE_DOWN }) },
    };

    const result = wizterrainwish({ bp: 'unrecognized wizard wish' }, { state });

    assert.equal(result, null);
    assert.equal(typeof result?.then, 'undefined');
});

test('wizterrainwish keeps C An() on the successful named-terrain arms', () => {
    const cSource = readFileSync(new URL(
        '../nethack-c/upstream/src/objnam.c', import.meta.url,
    ), 'utf8');
    const jsSource = readFileSync(new URL(
        '../js/objnam_readobjnam.js', import.meta.url,
    ), 'utf8');
    const cStart = cSource.indexOf('wizterrainwish(struct _readobjnam_data *d)');
    const cEnd = cSource.indexOf('\n/*', cStart);
    const cBody = cSource.slice(cStart, cEnd);
    const jsStart = jsSource.indexOf('async function apply_wizterrainwish(');
    const jsEnd = jsSource.indexOf('\nexport async function dbterrainmesg(', jsStart);
    const jsBody = jsSource.slice(jsStart, jsEnd);

    // These three C arms capitalize a generated name with An(); the failure
    // branch intentionally uses lowercase an() and stays separate.
    assert.match(cBody, /An\(tname\)/u);
    assert.match(cBody, /An\(new_water\)/u);
    assert.match(cBody, /An\(align_str\(al\)\)/u);
    assert.match(jsBody, /return An\(text\)/u);
    assert.match(jsBody, /An\(align_str\(alignment\)\)/u);
});
