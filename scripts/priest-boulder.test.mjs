import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { ROOM } from '../js/const.js';
import { PM_ALIGNED_CLERIC, NON_PM } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newepri, move_special } from '../js/priest.js';
import { mksobj, place_object } from '../js/obj.js';
import { BOULDER, ROCK } from '../js/objects.js';
import { block_point, cansee, vision_reset, vision_recalc } from '../js/vision.js';
import { rn1, rn2, rnd, d, rne } from '../js/rng.js';

async function setup(withBoulder) {
    await runSegment({ seed: 901733, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:RockProbe,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!autopickup\n',
        moves: '' });
    game.level = new GameMap();
    for (let x = 2; x < 15; x++) for (let y = 2; y < 11; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, lit: true, seenv: 255 });
    game.u.ux = 5;
    game.u.uy = 4;
    game.context.mon_moving = true;
    const priest = newMonster({ data: game.mons[PM_ALIGNED_CLERIC],
        mnum: PM_ALIGNED_CLERIC, m_id: 901733, cham: NON_PM, m_lev: 12,
        mhp: 30, mhpmax: 30, mcansee: true, mcanmove: true,
        mpeaceful: true, ispriest: true, mux: 3, muy: 3 });
    priest.ispriest = true;
    newepri(priest);
    game.level.monlist = priest;
    place_monster(priest, 6, 6, game);
    if (withBoulder) {
        const boulder = mksobj(BOULDER, false, false, { state: game });
        place_object(boulder, 7, 6, { state: game,
            hooks: { blockPoint: (x, y, env) => block_point(x, y, env.state) } });
    }
    vision_reset(game);
    vision_recalc(0);
    return priest;
}

for (const withBoulder of [true, false]) {
    test(`${withBoulder ? 'target' : 'control'}: priest moves toward a boulder square`, async () => {
        // C priest.c:99-107 calls monmove.c:m_break_boulder for ALLOW_ROCK,
        // spending the action in place; an ordinary empty square is entered.
        const priest = await setup(withBoulder);
        const messages = [];
        const result = await move_special(priest, false, 1, false, false,
            6, 6, 10, 6, { state: game,
                random: { rn1, rn2, rnd, d, rne },
                message: async line => messages.push(line),
                redraw: () => {} });
        assert.equal(result, 1);
        assert.deepEqual([priest.mx, priest.my],
            withBoulder ? [6, 6] : [7, 6]);
        assert.equal(game.level.objects[7][6]?.otyp ?? null,
            withBoulder ? ROCK : null);
        assert.equal(Boolean(priest.mspec_used), withBoulder);
        assert.equal(cansee(7, 6, game), true);
        assert.equal(messages.some(line => line.includes('boulder falls apart')),
            withBoulder);
    });
}
