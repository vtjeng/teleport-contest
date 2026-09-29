// trap.c trapeffect_fire_trap() calls display.c shieldeff() before announcing
// that a visible fire-resistant monster is uninjured.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FIRE_RES, FIRE_TRAP, IN_SIGHT, NON_PM, Trap_Effect_Finished,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { PM_FIRE_ELEMENTAL } from '../js/monsters.js';
import { monster_resists_element } from '../js/mondata.js';
import { trapeffect_selector } from '../js/trap_effects.js';

test('a visible fire-resistant monster gets the shield animation before text',
    async () => {
        await runSegment({
            seed: 20260928110101,
            datetime: '20260928110100',
            nethackrc: 'OPTIONS=name:FireTrapShield,role:Valkyrie,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
                + 'OPTIONS=pettype:none,!acoustics,playmode:debug\n',
            moves: '',
        });

        let x;
        let y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const candidateX = game.u.ux + dx;
            const candidateY = game.u.uy + dy;
            if (accessible(candidateX, candidateY, game)
                && !m_at(candidateX, candidateY, game)) {
                x = candidateX;
                y = candidateY;
                break;
            }
        }
        assert.notEqual(x, undefined, 'there is a reachable adjacent square');
        const species = game.mons[PM_FIRE_ELEMENTAL];
        const oldSparkle = game.flags.sparkle;
        const monster = newMonster({
            cham: NON_PM,
            m_lev: species.mlevel,
            m_id: 98001,
            mhp: 30,
            mhpmax: 30,
            mcanmove: 1,
            mcansee: true,
            data: species,
            mnum: PM_FIRE_ELEMENTAL,
            mx: x,
            my: y,
        });
        place_monster(monster, x, y, game);
        monster.nmon = game.level.monlist;
        game.level.monlist = monster;
        game.viz_array[y][x] |= IN_SIGHT;
        game.flags.sparkle = true;
        assert.equal(monster_resists_element(monster, FIRE_RES, game), true,
            'monst.c marks fire elementals as fire resistant');

        const trap = {
            tx: x, ty: y, ttyp: FIRE_TRAP, tseen: false,
            madeby_u: false, once: false,
        };
        game.level.traps = [trap];
        const timeline = [];
        const messages = [];
        game._animationFrameHook = () => timeline.push('frame');
        const env = {
            state: game,
            random: {
                d: (count, sides) => {
                    timeline.push(`d(${count},${sides})`);
                    return count;
                },
                rn1: (_count, base) => base,
                rn2: (bound) => (bound === 5 ? 1 : 0),
                rnd: () => 1,
                rne: () => 1,
                rnl: () => 1,
            },
            message: async (text) => {
                messages.push(text);
                timeline.push('message');
            },
            redraw: () => {},
            unsupported: (reason) => { throw new Error(reason); },
        };
        try {
            assert.equal(
                await trapeffect_selector(monster, trap, 0, env),
                Trap_Effect_Finished,
            );
            assert.equal(timeline[0], 'd(2,4)',
                'trapeffect_fire_trap rolls orig_dmg before its first message');
            assert.equal(timeline[1], 'message');
            assert.deepEqual(timeline.slice(2, 23), Array(21).fill('frame'),
                'display.c shieldeff() emits all 21 frames');
            assert.equal(timeline[23], 'message',
                'the resistance message follows the animation');
            assert.match(messages.at(-1), /is uninjured\.$/u);
            assert.ok(!game.unported.has('display.c shieldeff'));
        } finally {
            game._animationFrameHook = null;
            game.flags.sparkle = oldSparkle;
        }
    });
