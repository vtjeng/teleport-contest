import assert from 'node:assert/strict';
import test from 'node:test';

import { acurr } from '../js/attrib.js';
import { A_DEX, OBJ_FLOOR, OBJ_INVENT, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { PM_OGRE, NON_PM } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { addinv } from '../js/invent.js';
import { mksobj } from '../js/obj.js';
import { ORCISH_DAGGER } from '../js/objects.js';
import { mpickobj } from '../js/steal.js';
import { runDirectMonsterAction } from '../js/unported_monster_actions.js';
import { recalc_block_point, vision_recalc } from '../js/vision.js';

// C mthrowu.c:u_catch_thrown_obj hands a successful catch to invent.c,
// then m_throw ends the missile's flight without damaging the hero.
for (const catchRoll of [0, 1]) {
    test(`${catchRoll ? 'control: miss' : 'target: catch'} of an ordinary monster dagger`, async () => {
        await runSegment({ seed: 7710044, datetime: '20261028120000',
            nethackrc: 'OPTIONS=name:CatchProbe,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
            moves: '' });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        const x = game.u.ux, y = game.u.uy;
        for (let a = x; a <= x + 5; a++) for (let b = y - 1; b <= y + 1; b++) {
            game.level.at(a, b).typ = ROOM;
            game.level.objects[a][b] = null;
            recalc_block_point(a, b, game);
        }
        vision_recalc(0, { state: game });
        const mon = newMonster({ data: game.mons[PM_OGRE], m_id: 6001,
            mx: x + 4, my: y, mux: x, muy: y,
            m_lev: game.mons[PM_OGRE].mlevel, cham: NON_PM,
            mhp: 20, mhpmax: 20, mcanmove: 1, mcansee: 1 });
        place_monster(mon, mon.mx, mon.my, game);
        game.level.monlist = mon;
        const dagger = mksobj(ORCISH_DAGGER, false, false, { state: game });
        mpickobj(mon, dagger, { state: game });
        assert.equal(mon.minvent, dagger);
        assert.equal(mon.mw, null);

        const catchBound = 100 - acurr(game, A_DEX);
        const draws = [];
        const random = {
            rn2: n => { draws.push(['rn2', n]); return n === catchBound ? catchRoll : n - 1; },
            rnd: n => { draws.push(['rnd', n]); return 1; },
            rn1: (_n, base) => base, rne: () => 1, rnl: n => n - 1,
            d: (n, k) => { draws.push(['d', n, k]); return n; },
        };
        for (let i = 0; i < 30; i++) game.nhDisplay.terminal.pushKey(32);
        const hpBefore = game.u.uhp;
        game.context.mon_moving = true;
        const status = await runDirectMonsterAction(mon, { state: game, random,
            message: async () => {}, redraw: () => {}, redrawSquare: () => {},
            unsupported: reason => assert.fail(reason) });
        assert.equal(status, 0);
        assert.ok(draws.some(([kind, n]) => kind === 'rn2' && n === catchBound));
        if (catchRoll === 0) {
            assert.equal(game.u.uhp, hpBefore);
            assert.equal(dagger.where, OBJ_INVENT);
        } else {
            assert.equal(game.u.uhp, hpBefore - 1);
            assert.equal(dagger.where, OBJ_FLOOR);
        }
    });
}

// invent.c merged() 856-942: a caught missile that merges into a stack the
// hero has identified, but which the thrower's copy is not, prints the
// comparison discovery. hold_another_object() reaches it through addinv().
test('a caught monster dagger merging with an identified stack reports the comparison', async () => {
    await runSegment({ seed: 7710044, datetime: '20261028120000',
        nethackrc: 'OPTIONS=name:CatchProbe,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
        moves: '' });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    const x = game.u.ux, y = game.u.uy;
    for (let a = x; a <= x + 5; a++) for (let b = y - 1; b <= y + 1; b++) {
        game.level.at(a, b).typ = ROOM;
        game.level.objects[a][b] = null;
        recalc_block_point(a, b, game);
    }
    vision_recalc(0, { state: game });
    // Both daggers are uncursed +0 orcish daggers; only the hero's copy has
    // its enchantment and curse status known, which merged() compares.
    const held = mksobj(ORCISH_DAGGER, false, false, { state: game });
    held.known = 1;
    held.bknown = 1;
    held.dknown = 1;
    addinv(held, { state: game });
    const mon = newMonster({ data: game.mons[PM_OGRE], m_id: 6002,
        mx: x + 4, my: y, mux: x, muy: y,
        m_lev: game.mons[PM_OGRE].mlevel, cham: NON_PM,
        mhp: 20, mhpmax: 20, mcanmove: 1, mcansee: 1 });
    place_monster(mon, mon.mx, mon.my, game);
    game.level.monlist = mon;
    const dagger = mksobj(ORCISH_DAGGER, false, false, { state: game });
    dagger.dknown = 1;
    mpickobj(mon, dagger, { state: game });

    const catchBound = 100 - acurr(game, A_DEX);
    const random = {
        // 0 for the catch roll; every other draw takes its largest value.
        rn2: n => (n === catchBound ? 0 : n - 1),
        rnd: () => 1,
        rn1: (_n, base) => base, rne: () => 1, rnl: n => n - 1,
        d: (n) => n,
    };
    const terminal = game.nhDisplay.terminal;
    for (let i = 0; i < 30; i++) terminal.pushKey(32);
    // The catch reaches tty pline directly, so read each top line the game
    // shows when it waits for a key.
    const topLines = [];
    const readKey = terminal.readKey.bind(terminal);
    terminal.readKey = (options) => {
        topLines.push(terminal.grid[0].map((cell) => cell.ch).join(''));
        return readKey(options);
    };
    game.context.mon_moving = true;
    const status = await runDirectMonsterAction(mon, { state: game, random,
        message: async () => {}, redraw: () => {}, redrawSquare: () => {},
        unsupported: reason => assert.fail(reason) });
    terminal.readKey = readKey;
    assert.equal(status, 0);
    assert.ok(topLines.some((line) => line.includes(
        'You learn more about your items by comparing them.')),
    JSON.stringify(topLines));
    assert.equal(held.quan, 2);
    assert.equal(held.where, OBJ_INVENT);
});
