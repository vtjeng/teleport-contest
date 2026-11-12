// worn.c m_dowear_type() (965-967): when a monster being created puts on
// artifact-light armour, C lights it and runs vision_recalc(1) at once, and
// that recalculation prints notice_all_mons()'s monster notices before
// m_dowear() returns. During level creation vision_recalc() returns at once
// (vision.c 532-534), so nothing prints there.
//
// No recipe covers this. The one runtime creation found that dresses a
// monster in light-giving armour is animate_statue() on a statue holding gold
// dragon scale mail, with the mon_notices option on, and its next message
// would print the queued notice first anyway. So this test builds the state:
// a human in a dark room two squares from the hero, holding gold dragon scale
// mail, with mon_notices on.

import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_MINVENT, ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { light_globals_init } from '../js/light.js';
import { PM_HUMAN } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { GOLD_DRAGON_SCALE_MAIL } from '../js/objects.js';
import { init_vision_globals, vision_recalc, vision_reset } from '../js/vision.js';
import { m_dowear } from '../js/worn.js';

// A Valkyrie start, then an unlit room from <2,2> to <20,15>: the hero at
// <5,7> sees only adjacent squares, so the human at <7,7> stays unseen until
// the armour's light, radius one, reaches its square.
async function darkRoomWithArmouredHuman() {
    await runSegment({
        seed: 6120443,
        datetime: '20261112093000',
        nethackrc: 'OPTIONS=name:Lamplight,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,pettype:none,!legacy,!tutorial,'
            + '!splash_screen,!tips\n',
        moves: '',
    });
    game.level = new GameMap();
    for (let x = 2; x <= 20; ++x)
        for (let y = 2; y <= 15; ++y) game.level.at(x, y).typ = ROOM;
    game.u.ux = 5;
    game.u.uy = 7;
    light_globals_init(game);
    init_vision_globals();
    vision_reset(game);
    vision_recalc(0);
    const human = newMonster({
        data: game.mons[PM_HUMAN], mnum: PM_HUMAN, m_id: 7020,
        mx: 7, my: 7, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true,
    });
    place_monster(human, 7, 7, game);
    game.level.monlist = human;
    human.minvent = newObject({
        otyp: GOLD_DRAGON_SCALE_MAIL,
        oclass: game.objects[GOLD_DRAGON_SCALE_MAIL].oc_class,
        quan: 1, where: OBJ_MINVENT, ocarry: human,
    });
    game.a11y.mon_notices = true;
    game.a11y.mon_notices_blocked = 0;
    human.mspotted = false;
    game._glyphUpdateNotices = [];
    return human;
}

test('a monster lit by armour it puts on at creation is noticed at once',
    async () => {
        const human = await darkRoomWithArmouredHuman();
        const printed = [];
        const original = game._ttyToplines;
        let toplines = original ?? '';
        Object.defineProperty(game, '_ttyToplines', {
            configurable: true,
            enumerable: true,
            get: () => toplines,
            set: (value) => {
                toplines = value;
                if (value) printed.push(value);
            },
        });
        // The startup greeting still holds the top line, so the notice
        // stops at --More-- first; a space answers it.
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        try {
            const worn = m_dowear(human, true, { state: game });
            // The notice has to print, so the call waits for it.
            assert.equal(typeof worn?.then, 'function');
            assert.equal(await worn, human);
        } finally {
            Object.defineProperty(game, '_ttyToplines', {
                configurable: true, enumerable: true, writable: true,
                value: toplines,
            });
        }
        assert.equal(human.minvent.lamplit, true);
        assert.equal(human.mspotted, true);
        // Printed by the time m_dowear() returns, not left for a later line.
        assert.deepEqual(game._glyphUpdateNotices, []);
        assert.ok(printed.some((line) => line.includes('You see a human.')),
            JSON.stringify(printed));
    });

test('the same creation during level creation stays synchronous',
    async () => {
        const human = await darkRoomWithArmouredHuman();
        game.in_mklev = true;
        try {
            const worn = m_dowear(human, true, { state: game });
            assert.equal(worn, human);
        } finally {
            game.in_mklev = false;
        }
        assert.equal(human.minvent.lamplit, true);
        assert.equal(human.mspotted, false);
        assert.deepEqual(game._glyphUpdateNotices, []);
    });
