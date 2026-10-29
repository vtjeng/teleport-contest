import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE, DB_NORTH, FROMOUTSIDE, HALLUC, IN_SIGHT, MOAT,
} from '../js/const.js';
import { close_drawbridge, create_drawbridge } from '../js/dbridge.js';
import { canseemon } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GNOME } from '../js/monsters.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { d, rn1, rn2, rne, rnl, rnz } from '../js/rng.js';

// C dbridge.c:do_entity() (744-755): a visible monster that jumps from the
// closing portcullis into the moat gets the ordinary fall line, or under
// Hallucination a drink-and-disappear line. The real drawbridge transition
// owns both movement and death here; this is not a direct do_entity call.
async function closingPortcullis({ hallucinating }) {
    await runSegment({
        seed: 671903,
        datetime: '20261018120000',
        nethackrc: 'OPTIONS=name:BridgeHallu,role:Wizard,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
        moves: '',
    });
    const x = 66, y = 13;
    game.level.at(x, y).typ = MOAT;
    assert.equal(create_drawbridge(x, y, DB_NORTH, true, game), true);
    game.u.ux = x - 2;
    game.u.uy = y;
    game.viz_array[y][x] = IN_SIGHT | COULD_SEE;
    game.viz_array[y - 1][x] = IN_SIGHT | COULD_SEE;
    game.u.uprops[HALLUC].intrinsic = hallucinating ? FROMOUTSIDE : 0;

    const monster = newMonster({
        data: game.mons[PM_GNOME], mx: x, my: y - 1,
        mhp: 10, mhpmax: 10, mcanmove: 1, mfrozen: 0, m_id: 9302,
    });
    monster.nmon = game.level.monlist;
    game.level.monlist = monster;
    place_monster(monster, x, y - 1, game);
    assert.equal(canseemon(monster, game), true);

    const messages = [], draws = [];
    await close_drawbridge(x, y, game, {
        message: async (line) => messages.push(line),
        random: {
            d, rn1, rn2, rne, rnl, rnz,
            rnd(bound) { draws.push(bound); return 1; },
        },
    });
    assert.deepEqual(draws, [8, 10], 'miss and jump are the only local rolls');
    assert.equal(m_at(x, y - 1, game), null);
    assert.equal(m_at(x, y, game), null);
    return messages;
}

test('visible portcullis victim has C ordinary and hallucinated moat lines',
    async () => {
        const ordinary = await closingPortcullis({ hallucinating: false });
        assert.equal(ordinary[1], 'The gnome falls into the moat.');

        const hallucinated = await closingPortcullis({ hallucinating: true });
        assert.match(hallucinated[1],
            /^The .+ drinks the moat and disappears\.$/u);
    });
