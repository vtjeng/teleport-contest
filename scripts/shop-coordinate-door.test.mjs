// C refs: sp_lev.c sel_set_door() and shknam.c stock_room().
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { newgame_pre_mklev } from '../js/allmain.js';
import { D_CLOSED, D_ISOPEN, D_NODOOR, FILL_NORMAL, MAXNROFROOMS,
    OROOM, SHOPBASE, TEST_MOVE } from '../js/const.js';
import { back_to_glyph, map_glyphinfo } from '../js/display.js';
import { finish_fruit_option } from '../js/fruit.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { test_move } from '../js/hack.js';
import { add_doors_to_room, build_room, lspo_door, topologize } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { init_rect } from '../js/rect.js';
import { enableRngLog, getRngLog, initRng, rnd } from '../js/rng.js';
import { str2align, str2gend, str2race, str2role } from '../js/roles.js';
import { stock_room } from '../js/shknam.js';
import { timeout_globals_init } from '../js/timeout.js';

async function makeShop(overwrite, flagsOnly = false) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    initRng(39261011);
    game.fixedDatetime = '20431009123456';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'DoorAudit';
    game.flags = { initrole: str2role('Tourist'), initrace: str2race('human'),
        initgend: str2gend('female'), initalign: str2align('neutral'),
        female: true, bones: false };
    game.iflags = {};
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    finish_fruit_option({}, game);
    await newgame_pre_mklev(game);
    game.level = new GameMap();
    game.smeq = Array(MAXNROFROOMS + 1).fill(0);
    game.in_mklev = true;
    init_rect();
    const draws = [0, 3, 2, 3, 1];
    const scripted = () => draws.shift();
    const parent = build_room({ x: -1, y: -1, w: 11, h: 9,
        rtype: OROOM, chance: 100, rlit: 1, needfill: FILL_NORMAL,
        joined: true }, null, scripted, scripted);
    const child = build_room({ x: 4, y: 3, w: 3, h: 3,
        rtype: SHOPBASE, chance: 100, rlit: 1, needfill: FILL_NORMAL,
        joined: false }, parent, () => 0, rnd);
    parent.irregular = true;
    const frame = { splevMap: Array.from({ length: 80 }, () => Array(21).fill(0)) };
    const env = { state: game, coder: { croom: child }, frame,
        random: await import('../js/rng.js') };
    lspo_door([{ state: 'closed', wall: 'east', pos: 1 }], env);
    const x = child.hx + 1, y = child.ly + 1;
    const loc = game.level.at(x, y);
    assert.deepEqual([loc.flags, loc.doormask], [D_CLOSED, D_CLOSED]);
    if (overwrite) {
        lspo_door(['nodoor', 3, 1], env);
        assert.deepEqual([loc.flags, loc.doormask], [D_NODOOR, D_NODOOR]);
    }
    if (flagsOnly) loc.doormask = D_NODOOR;
    add_doors_to_room(parent);
    topologize(parent);
    enableRngLog();
    assert.equal(await stock_room(0, child), true);
    const log = getRngLog();
    return { x, y, loc, child, log,
        presentation: map_glyphinfo(back_to_glyph(x, y, game), game),
        canStep: await test_move(x + 1, y, -1, 0, TEST_MOVE, game) };
}

test('coordinate overwrite shares the C door mask, while closed control stays closed', async () => {
    const results = [];
    for (const overwrite of [true, false]) {
        const r = await makeShop(overwrite);
        assert.deepEqual([r.x, r.y], [42, 9]);
        assert.deepEqual([r.child.resident?.mx, r.child.resident?.my], [41, 9]);
        assert.equal(r.loc.doormask, overwrite ? D_ISOPEN : D_CLOSED);
        assert.equal(r.loc.flags, r.loc.doormask);
        assert.equal(r.presentation.ch, overwrite ? '-' : '+');
        assert.equal(r.canStep, overwrite);
        results.push({ log: r.log, presentation: r.presentation });
    }
    assert.deepEqual(results[0].log, results[1].log);
    assert.equal(results[0].log.length, 73);
    assert.equal(createHash('sha256').update(JSON.stringify(results[0].log))
        .digest('hex'), '2be106c8df3cfb90bf0276eccb2fecab34c4550f552ce4c636f5f07533bb7f5b');
    assert.notDeepEqual(results[0].presentation, results[1].presentation);
});

test('ordinary flags-only shop door is not mistaken for an open doorway', async () => {
    const r = await makeShop(false, true);
    assert.equal(r.loc.flags, D_CLOSED);
    assert.equal(r.loc.doormask, D_NODOOR);
    assert.equal(r.child.resident?.mx, 41);
    assert.equal(r.child.resident?.my, 9);
    assert.equal(r.presentation.ch, '+');
    assert.equal(r.canStep, false);
    assert.equal(r.log.length, 73);
    assert.equal(createHash('sha256').update(JSON.stringify(r.log))
        .digest('hex'), '2be106c8df3cfb90bf0276eccb2fecab34c4550f552ce4c636f5f07533bb7f5b');
});
