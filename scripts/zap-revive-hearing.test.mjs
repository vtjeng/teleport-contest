import assert from 'node:assert/strict';
import test from 'node:test';

import { HALLUC, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_HEALER, PM_NEWT } from '../js/monsters.js';
import { m_at } from '../js/monst.js';
import { mksobj, mksobj_at, set_corpsenm } from '../js/obj.js';
import { CORPSE, WAN_UNDEAD_TURNING } from '../js/objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from '../js/rng.js';
import { cansee } from '../js/vision.js';
import { bhito } from '../js/zap.js';

// zap.c:2372-2379: an offscreen living corpse revived by a Healer's
// undead-turning wand reports its sound through You_hear.
test('offscreen corpse revival respects acoustics', async () => {
    for (const acoustics of [true, false]) for (const hallucinating of [false, true]) {
        await runSegment({
            seed: 93171022,
            datetime: '20781112121000',
            nethackrc: 'OPTIONS=name:ReviveSound,role:Healer,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        assert.equal(game.urole.mnum, PM_HEALER);
        game.flags.acoustics = acoustics;
        game.u.uprops[HALLUC].intrinsic = hallucinating ? 1 : 0;
        let target = null;
        for (let x = 2; x < 78 && !target; x++) {
            for (let y = 2; y < 19; y++) {
                if (game.level.at(x, y).typ === ROOM
                    && !m_at(x, y, game)
                    && Math.abs(x - game.u.ux) + Math.abs(y - game.u.uy) > 10) {
                    target = { x, y };
                    break;
                }
            }
        }
        assert.ok(target, 'fixture needs an empty distant room tile');
        const { x, y } = target;
        game.viz_array[y][x] = 0;
        assert.equal(cansee(x, y, game), false);

        const corpse = mksobj_at(CORPSE, x, y, false, false, { state: game });
        set_corpsenm(corpse, PM_NEWT, { state: game });
        const wand = mksobj(WAN_UNDEAD_TURNING, false, false, { state: game });
        const messages = [];
        await bhito(corpse, wand, game, { d, rn1, rn2, rnd, rne, rnz }, {
            message: async (line) => messages.push(line),
        });
        assert.equal(m_at(x, y, game)?.data, game.mons[PM_NEWT],
            'the production revival path creates a newt');
        const expected = hallucinating
            ? 'You hear a defibrillator.' : 'You hear a newt corpse reviving.';
        assert.equal(messages.includes(expected), acoustics, JSON.stringify(messages));
    }
});
