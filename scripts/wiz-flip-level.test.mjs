import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GameMap } from '../js/game.js';
import { ECMD_OK, MELT_ICE_AWAY, ROOM } from '../js/const.js';
import * as commands from '../js/wizcmds.js';

function flipFixture() {
    const level = new GameMap();
    // C get_level_extends yields x=9..21,y=4..11 for these two floor cells;
    // both mirrors therefore map <10,5> to <20,10>.
    level.at(10, 5).typ = ROOM;
    level.at(20, 10).typ = ROOM;
    level.doors = [{ x: 0, y: 0 }]; // Flip_coord's absent-coordinate sentinel.
    level.doorindex = 1;
    return { level, u: { ux: 10, uy: 5, ux0: 10, uy0: 5 },
        stairs: null, lregions: [], exclusion_zones: null,
        gm: { migrating_mons: null }, head_engr: null,
        iflags: { travelcc: { x: 20, y: 10 } },
        context: { digging: { pos: { x: 0, y: 0 } } },
        gt: { timer_base: { func_index: MELT_ICE_AWAY,
            arg: (10 << 16) | 5, next: null } } };
}

test('wizcmds.c whole flip command preserves query, cancellation and zero time', async () => {
    const calls = [];
    const result = await commands.wiz_flip_level({ wizard: true }, {
        query: async (...args) => { calls.push(args); return 0; },
        message: async text => calls.push(text),
        redraw: () => assert.fail('cancellation must not redraw'),
    });
    assert.equal(result, ECMD_OK); // C always returns ECMD_OK, without a turn.
    assert.deepEqual(calls, [
        ['Flip 0=randomly, 1=vertically, 2=horizontally, 3=both:', '0123', 0, true],
        'Never mind.',
    ]);
    assert.equal(await commands.wiz_flip_level({ wizard: false }, {
        query: () => assert.fail('nonwizard source path has no query'),
    }), ECMD_OK);
});

test('sp_lev.c live flip publishes hero, timer and guarded coordinate state', async () => {
    const { flip_level } = await import('../js/sp_lev.js');
    const state = flipFixture();
    await flip_level(3, true, state); // Source bits 1|2 mirror both axes.
    assert.deepEqual([state.u.ux, state.u.uy, state.u.ux0, state.u.uy0],
        [20, 10, 20, 10]);
    assert.deepEqual(state.iflags.travelcc, { x: 10, y: 5 });
    assert.deepEqual(state.context.digging.pos, { x: 0, y: 0 });
    assert.deepEqual(state.level.doors[0], { x: 0, y: 0 });
    assert.equal(state.gt.timer_base.arg, (20 << 16) | 10);
});

test('sp_lev.c random flip draws each enabled axis in source order and forwards extras', async () => {
    const { flip_level_rnd } = await import('../js/sp_lev.js');
    const state = flipFixture();
    const values = [1, 0]; // C chooses vertical only; horizontal draw rejects it.
    const calls = [];
    await flip_level_rnd(3, true, state, { random: { rn2: n => {
        calls.push(n); return values.shift();
    } } });
    assert.deepEqual(calls, [2, 2]); // One rn2(2) per enabled mask bit.
    assert.deepEqual([state.u.ux, state.u.uy], [10, 10]);
    assert.deepEqual(state.iflags.travelcc, { x: 20, y: 5 });
});

test('wizfliplevel production dispatcher reaches its canonical owner', () => {
    const c = readFileSync('nethack-c/upstream/src/wizcmds.c', 'utf8');
    assert.match(c, /flip_level_rnd\(3, TRUE\);/u);
    assert.match(c, /flip_level\(\(int\) c, TRUE\);/u);
    const cmd = readFileSync('js/cmd.js', 'utf8');
    assert.match(cmd, /case 'wiz_flip_level':\s*return await wiz_flip_level\(state\);/u);
});

test('sp_lev.c flips object indexes, context, metadata and source combined pit bits', async () => {
    const { flip_level } = await import('../js/sp_lev.js');
    const { PIT } = await import('../js/const.js');
    const state = flipFixture();
    state.u.uz = { dnum: 0, dlevel: 1 }; // Same level for migrating shrine data.
    const floor = { ox: 10, oy: 5, nobj: null };
    state.level.objlist = floor;
    state.level.objects[10][5] = floor;
    state.level.buriedobjlist = { ox: 10, oy: 5, nobj: null };
    const priest = { mx: 10, my: 5, ispriest: true,
        mgoal: { x: 70, y: 0 }, // Outside the area, so Flip_coord leaves it alone.
        mextra: { epri: { shrpos: { x: 10, y: 5 } } }, nmon: null };
    state.level.monlist = priest;
    state.level.monsters[10][5] = priest;
    state.gm.migrating_mons = { ispriest: true,
        mextra: { epri: { shrlevel: { ...state.u.uz },
            shrpos: { x: 10, y: 5 } } }, nmon: null };
    state.stairs = { sx: 10, sy: 5, next: null };
    state.head_engr = { engr_x: 10, engr_y: 5, nxt_engr: null };
    state.level.traps = [{ tx: 10, ty: 5, ttyp: PIT, conjoined: 1 << 1 }];
    await flip_level(3, true, state);
    assert.deepEqual([floor.ox, floor.oy], [20, 10]);
    assert.equal(state.level.objects[20][10], floor);
    assert.equal(state.level.monsters[20][10], priest);
    assert.deepEqual([priest.mx, priest.my], [20, 10]);
    assert.deepEqual(priest.mgoal, { x: 70, y: 0 });
    assert.deepEqual(priest.mextra.epri.shrpos, { x: 20, y: 10 });
    assert.deepEqual(state.gm.migrating_mons.mextra.epri.shrpos, { x: 20, y: 10 });
    assert.deepEqual([state.stairs.sx, state.stairs.sy], [20, 10]);
    assert.deepEqual([state.head_engr.engr_x, state.head_engr.engr_y], [20, 10]);
    // Source calls flip_encoded_dir_bits(flp,...) in BOTH trap axis arms.
    // With flp=3 the combined transform therefore happens twice, retaining bit1.
    assert.equal(state.level.traps[0].conjoined, 1 << 1);
    assert.deepEqual([state.level.traps[0].tx, state.level.traps[0].ty], [20, 10]);
});

test('wizcmds.c waits for docrt before its ECMD_OK return', async () => {
    const state = flipFixture();
    state.wizard = true;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let redrawing = false, completed = false;
    const command = commands.wiz_flip_level(state, {
        query: async () => '2'.charCodeAt(0), // yn_function's C key byte contract.
        redraw: async () => { redrawing = true; await held; },
    }).then(value => { completed = true; return value; });
    // Both source calls are awaited; allow their microtasks to reach docrt.
    while (!redrawing) await Promise.resolve();
    assert.equal(completed, false);
    release();
    assert.equal(await command, ECMD_OK);
});
