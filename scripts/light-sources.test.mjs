import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ECMD_OK, LS_MONSTER, LS_OBJECT } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { del_light_source, wiz_light_sources } from '../js/light.js';

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

test('del_light_source compares an unrelinked source with the owner\'s current id', () => {
    const light = readFileSync('nethack-c/upstream/src/light.c', 'utf8');
    assert.match(light, /if \(curr->id\.a_obj\s*== \(\(curr->flags & LSF_NEEDS_FIXUP\) \? tmp_id\.a_obj : id->a_obj\)\)/u);
    // restore.c getlev(): restore_cham() runs in the monster loop, and the
    // relink comes after it, so a bones shapeshifter's revert meets the
    // unrelinked source. getbones() keeps that order.
    const restore = readFileSync('nethack-c/upstream/src/restore.c', 'utf8');
    assert.ok(restore.indexOf('restore_cham(mtmp);') < restore.indexOf('relink_light_sources(ghostly);'));
    const bones = readFileSync('js/bones.js', 'utf8');
    const getbones = bones.slice(bones.indexOf('export async function getbones('));
    assert.ok(getbones.indexOf('await ghostly_getlev_monsters(state);')
        < getbones.indexOf('relink_light_sources(idMap, state);'));

    // LSF_NEEDS_FIXUP is 0x2 (light.c). Saved id 7 is the dead hero's m_id.
    const unlinked = () => ({ x: 1, y: 1, range: 1, type: LS_MONSTER, id: 7, flags: 0x2, next: null });
    const state = { gl: { light_base: unlinked() } };
    // Monster renumbered to 12 by the bones restore: C finds nothing.
    del_light_source(LS_MONSTER, { m_id: 12 }, state);
    assert.equal(state.gl.light_base?.id, 7);
    // The same saved id: found and deleted.
    del_light_source(LS_MONSTER, { m_id: 7 }, state);
    assert.equal(state.gl.light_base, null);
    // A relinked source (no fixup flag) is matched by its owner, not its id.
    const owner = { m_id: 7 };
    state.gl.light_base = { ...unlinked(), id: owner, flags: 0 };
    del_light_source(LS_MONSTER, { m_id: 7 }, state);
    assert.equal(state.gl.light_base?.id, owner);
    del_light_source(LS_MONSTER, owner, state);
    assert.equal(state.gl.light_base, null);
});
