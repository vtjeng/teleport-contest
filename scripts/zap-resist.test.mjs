import assert from 'node:assert/strict';
import test from 'node:test';

import { accessible } from '../js/monmove.js';
import { set_malign } from '../js/makemon.js';
import { newedog } from '../js/dog.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, m_at, place_monster } from '../js/monst.js';
import { PM_KITTEN, NON_PM } from '../js/monsters.js';
import { d, rn1, rnd, rne, rnz } from '../js/rng.js';
import { WAND_CLASS } from '../js/objects.js';
import { NOTELL } from '../js/const.js';
import { resist } from '../js/zap.js';

const DATETIME = '20420530143000';
const NETHACKRC = [
    'OPTIONS=name:ResistTest,role:Healer,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=!acoustics',
    '',
].join('\n');

async function startGame() {
    await runSegment({
        seed: 90525078,
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        moves: '',
    });
}

function spawnTameKitten() {
    const data = game.mons[PM_KITTEN];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        const kitten = newMonster({
            cham: NON_PM,
            data,
            mnum: PM_KITTEN,
            m_id: 9001,
            m_lev: data.mlevel,
            mhp: 1,
            mhpmax: 1,
            mcanmove: true,
            mtame: 10,
            mpeaceful: true,
        });
        newedog(kitten);
        set_malign(kitten, game);
        place_monster(kitten, x, y, game);
        kitten.nmon = game.level.monlist;
        game.level.monlist = kitten;
        return kitten;
    }
    throw new Error('no free square beside the hero for the test kitten');
}

test('resist() calls killed() after lethal damage to a tame kitten', async () => {
    await startGame();
    const kitten = spawnTameKitten();
    game.flags.acoustics = true;

    const lines = [];
    const bounds = [];
    const random = {
        d, rn1, rn2: (bound) => { bounds.push(bound); return 1; },
        rnd, rne, rnz,
    };
    const env = {
        random,
        message: async (line) => lines.push(line),
        unsupported: (reason) => { throw new Error(reason); },
    };

    // zap.c:6141 uses alevel 12 and the kitten's actual m_lev 2; lines 6148-54
    // subtract the damage and route the hero-owned death through killed().
    const resisted = await resist(
        kitten, WAND_CLASS, 2, NOTELL, game, random, env,
    );

    assert.equal(resisted, 0, 'the kitten has no MR against rn2(110)=1');
    assert.deepEqual(bounds, [110, 6, 3, 2],
        'resist then killed() keep C\'s MR, drop, corpse and pet-luck draws');
    assert.equal(kitten.mhp, 0, 'damage leaves the monster dead');
    assert.equal(game.level.monsters[kitten.mx][kitten.my], null,
        'killed() removes the dead pet from the level grid');
    assert.equal(kitten.mextra.edog.killed_by_u, true,
        'xkilled() records that the hero killed the pet');
    assert.deepEqual(lines, [
        'You kill the poor kitten!',
        'You hear the rumble of distant thunder...',
    ]);
});
