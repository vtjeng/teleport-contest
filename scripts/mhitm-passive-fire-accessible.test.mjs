import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { newMonster, place_monster, m_at } from '../js/monst.js';
import { PM_KITTEN, PM_RED_MOLD, NON_PM } from '../js/monsters.js';
import { mattackm } from '../js/mhitm.js';
import { accessible } from '../js/monmove.js';
import { cansee } from '../js/vision.js';

// C mhitm.c:passivemm AD_FIRE uses pline_mon for the nonresistant attacker.
// This expectation is source-derived; no new C execution is claimed here.
// Enter through mattackm with native species and a supported initialized game.
for (const enabled of [true, false]) {
    test(`native fire passive location, accessiblemsg=${enabled}`, async () => {
        await runSegment({
            seed: 7710048,
            datetime: '20261028120000',
            nethackrc: 'OPTIONS=name:Fire,role:Valkyrie,race:human,gender:female,'
                + 'align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,'
                + `${enabled ? '' : '!'}accessiblemsg\n`,
            moves: '',
        });
        assert.equal(Boolean(game.a11y.accessiblemsg), enabled);
        assert.deepEqual([game.u.ux, game.u.uy], [62, 2]);
        const x = 57, y = 2;
        for (const xx of [x, x + 1]) {
            assert.ok(accessible(xx, y, game));
            assert.ok(cansee(xx, y, game));
            assert.equal(m_at(xx, y, game), null);
        }
        function placeNative(pm, xx, id) {
            const data = game.mons[pm];
            const mon = newMonster({
                data, mnum: pm, cham: NON_PM, m_id: id, m_lev: data.mlevel,
                mcanmove: 1, mcansee: 1, mhp: 100, mhpmax: 100,
            });
            place_monster(mon, xx, y, game);
            mon.nmon = game.level.monlist;
            game.level.monlist = mon;
            return mon;
        }
        const attacker = placeNative(PM_KITTEN, x, 901);
        const defender = placeNative(PM_RED_MOLD, x + 1, 902);
        game.gb.bhitpos = { x: defender.mx, y: defender.my };
        game.gn.notonhead = false;
        const lines = [], draws = [];
        const random = {};
        for (const key of ['rn2', 'rnd', 'd', 'rn1', 'rnl', 'rne', 'rnz']) {
            random[key] = (...args) => {
                draws.push([key, ...args]);
                return 1;
            };
        }
        await mattackm(attacker, defender, {
            state: game, random,
            message: async line => lines.push(line),
            markInvisible: () => assert.fail('both monsters are visible'),
            redraw: () => {},
            unsupported: reason => assert.fail(reason),
        });
        assert.deepEqual(draws, [
            ['rnd', 20], ['d', 1, 6], ['rn2', 3], ['rn2', 6],
            ['d', 2, 4], ['rn2', 3],
        ]);
        assert.equal(attacker.mhp, 99);
        assert.deepEqual(lines, [
            'The kitten bites the red mold.',
            `${enabled ? '(5west): ' : ''}The kitten is suddenly very hot!`,
        ]);
    });
}
