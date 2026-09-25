import assert from 'node:assert/strict';
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
