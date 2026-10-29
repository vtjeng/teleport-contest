import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { newMonster, place_monster, m_at } from '../js/monst.js';
import { PM_KITTEN, PM_RED_MOLD, PM_RED_DRAGON, PM_BLUE_DRAGON, PM_ENERGY_VORTEX, PM_YELLOW_MOLD, NON_PM } from '../js/monsters.js';
import { mattackm } from '../js/mhitm.js';
import { accessible } from '../js/monmove.js';
import { cansee } from '../js/vision.js';

// C mhitm.c:passivemm uses pline_mon for stun and these elemental responses.
// This expectation is source-derived; no new C execution is claimed here.
// Enter through mattackm with native species and a supported initialized game.
for (const spec of [
 {label:'fire resistance',attacker:PM_RED_DRAGON,defender:PM_RED_MOLD,name:'red dragon',text:'is mildly warmed.',hp:100,rounds:3,dice:2},
 {label:'electric damage',attacker:PM_KITTEN,defender:PM_ENERGY_VORTEX,name:'kitten',text:'is jolted with electricity!',hp:99,rounds:1,dice:7},
 {label:'electric resistance',attacker:PM_BLUE_DRAGON,defender:PM_ENERGY_VORTEX,name:'blue dragon',text:'is mildly tingled.',hp:100,rounds:3,dice:7},
 {label:'stun',attacker:PM_KITTEN,defender:PM_YELLOW_MOLD,name:'kitten',text:'staggers...',hp:100,rounds:1,dice:2},
]) for (const enabled of [true, false]) {
    test(`native ${spec.label} passive location, accessiblemsg=${enabled}`, async () => {
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
        const attacker = placeNative(spec.attacker, x, 901);
        const defender = placeNative(spec.defender, x + 1, 902);
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
        const expectedDraws = [];
        for (let i = 0; i < spec.rounds; i++) {
            expectedDraws.push(['rnd', (spec.rounds === 1 ? 20 : 21) + i],
                ['d', spec.rounds === 1 ? 1 : (i ? 1 : 3), spec.rounds === 1 ? 6 : (i ? 4 : 8)],
                ['rn2', 3], ['rn2', 6], ['d', spec.dice, 4], ['rn2', 3]);
        }
        assert.deepEqual(draws, expectedDraws);
        assert.equal(attacker.mhp, spec.hp);
        const feedback = lines.filter(line => line.includes(spec.text));
        assert.equal(feedback.length, spec.rounds);
        assert.deepEqual(feedback, Array(spec.rounds).fill(
            `${enabled ? '(5west): ' : ''}The ${spec.name} ${spec.text}`));
        if (spec.label === 'stun') assert.equal(attacker.mstun, 1);

    });
}
