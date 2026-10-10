import assert from 'node:assert/strict';
import test from 'node:test';

import { ECMD_OK, LS_MONSTER, LS_OBJECT } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { wiz_light_sources } from '../js/light.js';

test('light.c wiz_light_sources formats the linked mobile-source list', async () => {
    const display = new GameDisplay(null);
    display.pushKey(' '.charCodeAt(0));
    const youmonst = { mx: 0 };
    const sources = [
        { x: 1, y: 2, range: 6, type: LS_OBJECT, id: { o_id: 42 }, flags: 1 },
        { x: 2, y: 3, range: 5, type: LS_OBJECT, id: { a_obj: null }, flags: 5 },
        { x: 3, y: 4, range: 4, type: LS_MONSTER, id: { mx: 8 }, flags: 4 },
        { x: 4, y: 5, range: 3, type: LS_MONSTER, id: youmonst, flags: 3 },
        { x: 5, y: 6, range: 2, type: LS_MONSTER, id: { mx: 0 }, flags: 2 },
        { x: 6, y: 7, range: 1, type: 99, id: {}, flags: 0 },
    ];
    const lightBase = sources.reduceRight((next, source) => ({ ...source, next }), null);
    const state = {
        nhDisplay: display,
        iflags: { cbreak: true },
        u: { ux: 12, uy: 3 },
        youmonst,
        gl: { light_base: lightBase },
    };
    let visibleRows;
    state._preNhgetchHook = () => {
        visibleRows = display.grid.slice(0, 10)
            .map((row) => row.map((cell) => cell.ch).join('').trim());
    };

    assert.equal(await wiz_light_sources(state), ECMD_OK);
    assert.deepEqual(visibleRows, [
        'Mobile light sources: hero @ (12, 3)',
        '',
        'location range flags  type    id',
        '-------- ----- ------ ----  -------',
        '1, 2    6   0x0001  obj  <ptr>',
        '2, 3    5   0x0005  obj  <null>',
        '3, 4    4   0x0004  mon  <ptr>',
        '4, 5    3   0x0003  you  <ptr>',
        '5, 6    2   0x0002  <m>  <ptr>',
        '6, 7    1   0x0000  ???  <ptr>',
    ]);
});
