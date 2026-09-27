import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { find_offensive } from '../js/muse.js';
import { newMonster } from '../js/monst.js';
import { mksobj } from '../js/obj.js';
import { PM_GNOME } from '../js/monsters.js';
import { SCR_EARTH } from '../js/objects.js';

const DATETIME = '20310415120000';
const RC = [
    'OPTIONS=name:EarthScroll,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function setUpEarthReader() {
    await runSegment({
        seed: 7812049,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    const scroll = mksobj(SCR_EARTH, false, false, { state: game });
    const monster = newMonster({
        data: game.mons[PM_GNOME],
        m_id: 7812,
        mx: game.u.ux + 1,
        my: game.u.uy,
        mux: game.u.ux,
        muy: game.u.uy,
        mcansee: true,
        minvent: scroll,
    });
    return { monster, scroll };
}

test('find_offensive uses the source short-circuit before the earth draw',
    async () => {
        const { monster, scroll } = await setUpEarthReader();
        const draws = [];
        const env = {
            state: game,
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return 0;
                },
            },
            unsupported(reason) { throw new Error(reason); },
        };

        assert.equal(find_offensive(monster, env), true);
        assert.equal(game.m_offense.has_offense, 17, 'muse.c MUSE_SCR_EARTH');
        assert.equal(game.m_offense.offensive, scroll);
        assert.deepEqual(draws, [10]);

        monster.mconf = true;
        draws.length = 0;
        assert.equal(find_offensive(monster, env), true);
        assert.deepEqual(draws, [],
            'mconf short-circuits !rn2(10) in muse.c find_offensive');
    });

test('find_offensive declines a solid earth reader after the failed draw',
    async () => {
        const { monster } = await setUpEarthReader();
        const draws = [];
        const env = {
            state: game,
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return 9;
                },
            },
            unsupported(reason) { throw new Error(reason); },
        };

        assert.equal(find_offensive(monster, env), false);
        assert.equal(game.m_offense, null);
        assert.deepEqual(draws, [10]);
    });
