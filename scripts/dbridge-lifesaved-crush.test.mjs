import assert from 'node:assert/strict';
import test from 'node:test';

import { DB_NORTH, W_AMUL } from '../js/const.js';
import { close_drawbridge, create_drawbridge } from '../js/dbridge.js';
import { game } from '../js/gstate.js';
import { add_to_minv } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GOBLIN } from '../js/monsters.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { mksobj } from '../js/obj.js';
import { AMULET_OF_LIFE_SAVING } from '../js/objects.js';
import { d, rn1, rn2, rne, rnl, rnz } from '../js/rng.js';
import { m_dowear } from '../js/worn.js';

for (const lifesaved of [true, false]) {
    test(`${lifesaved ? 'target' : 'control'}: visible portcullis victim with lifesaving=${lifesaved}`, async () => {
        await runSegment({
            seed: 671904,
            datetime: '20261018120100',
            nethackrc: 'OPTIONS=name:BridgeLife,role:Wizard,race:human,gender:male,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        const x = game.u.ux + 2;
        const y = game.u.uy + 2;
        assert.equal(create_drawbridge(x, y, DB_NORTH, true, game), true);
        const victim = newMonster({ data: game.mons[PM_GOBLIN],
            mnum: PM_GOBLIN, mx: x, my: y - 1, mhp: 10, mhpmax: 10,
            m_id: 9304, mcanmove: true });
        victim.nmon = game.level.monlist;
        game.level.monlist = victim;
        place_monster(victim, x, y - 1, game);
        if (lifesaved) {
            const amulet = mksobj(AMULET_OF_LIFE_SAVING, false, false,
                { state: game });
            add_to_minv(victim, amulet, { state: game });
            m_dowear(victim, true, { state: game });
            assert.equal(amulet.owornmask & W_AMUL, W_AMUL);
        }
        const messages = [];
        await close_drawbridge(x, y, game, {
            message: async line => messages.push(line),
            random: { d, rn1, rn2, rnd: bound => bound, rne, rnl, rnz },
        });
        assert.equal(m_at(x, y - 1, game), null);
        assert.equal(messages.some(line => line.includes('is still crushed.')),
            lifesaved, JSON.stringify(messages));
    });
}
