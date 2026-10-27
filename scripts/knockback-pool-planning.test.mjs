import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { M_ATTK_HIT, POOL, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { mklev } from '../js/mklev.js';
import { PM_FIRE_GIANT } from '../js/monsters.js';
import { teleds } from '../js/teleport.js';
import { mhitm_knockback } from '../js/uhitm.js';
import { planningState } from '../js/unported_monster_actions.js';

const C_DOTHROW = readFileSync('nethack-c/upstream/src/dothrow.c', 'utf8');

async function knockbackSetup(pool) {
    await runSegment({
        seed: 41415253,
        datetime: '20421210121212',
        nethackrc: 'OPTIONS=name:PoolKnock,role:Wizard,race:human,'
            + 'gender:female,align:neutral,playmode:debug,pettype:none,'
            + '!legacy,!tutorial,!splash_screen,!autopickup,!safe_wait\n',
        moves: '',
    });
    await mklev({
        specialLevelLoader: async (des) => {
            des.level_init({ style: 'solidfill', fg: ' ' });
            await des.room({
                type: 'ordinary', lit: 1, x: 3, y: 2,
                xalign: 'center', yalign: 'top', w: 11, h: 9,
                contents: () => {
                    des.stair('up', 5, 5);
                },
            });
        },
    });
    // The room is finalized before gameplay. Give the destination the same
    // valid pool terrain as the C special-level witness, or dry room floor.
    assert.equal(game.level.at(44, 5).typ, ROOM);
    game.level.at(44, 5).typ = pool ? POOL : ROOM;
    await teleds(43, 6, 0, game, { redraw: () => {} });
    // Runtime monster creation may dismiss the startup message first.
    for (let i = 0; i < 16; i++) game.nhDisplay.pushKey(32);
    const giant = await makemon_runtime(
        game.mons[PM_FIRE_GIANT], 42, 7, 0, { state: game },
    );
    assert.ok(giant);
    const planned = planningState(game);
    let plannedGiant = planned.level.monlist;
    while (plannedGiant && plannedGiant.m_id !== giant.m_id)
        plannedGiant = plannedGiant.nmon;
    assert.ok(plannedGiant);
    return { planned, plannedGiant };
}

for (const pool of [true, false]) {
    test(`${pool ? 'target' : 'control'}: planned giant knockback ${pool ? 'into pool' : 'onto dry floor'}`,
        async () => {
            // C dothrow.c:hurtle_step calls drown() after moving the hero
            // into a pool. A C recorder special-level witness reached that
            // exact branch after a giant's knockback; the dry-floor control
            // uses the same room, monster and forced knockback draws.
            assert.match(C_DOTHROW,
                /if \(is_pool\(x, y\) && !u\.uinwater\)[\s\S]*?\(void\) drown\(\);\s*return FALSE;/u);
            const { planned, plannedGiant } = await knockbackSetup(pool);
            const rolls = [1, 0, 0, 0, 1];
            const bounds = [];
            let handedOff = false;
            const marker = new Error('live drowning handoff');
            let caught = null;
            try {
                await mhitm_knockback(
                    plannedGiant, planned.youmonst,
                    plannedGiant.data.mattk[0],
                    { value: M_ATTK_HIT }, false, planned,
                    {
                        state: planned, planning: true,
                        message: async () => {},
                        requestPlanningInput() {
                            handedOff = true;
                            throw marker;
                        },
                    },
                    { rn2(bound) {
                        bounds.push(bound);
                        assert.ok(rolls.length);
                        return rolls.shift();
                    } },
                );
            } catch (error) {
                caught = error;
            }
            assert.deepEqual([game.u.ux, game.u.uy], [43, 6],
                'a planning pass cannot move the live hero');
            assert.deepEqual([planned.u.ux, planned.u.uy], [44, 5]);
            if (pool) {
                assert.equal(caught, marker);
                assert.equal(handedOff, true,
                    'C drowning can kill, save or relocate the hero; replay it live');
                assert.deepEqual(bounds, [3, 6, 2, 2]);
            } else {
                assert.equal(caught, null);
                assert.equal(handedOff, false);
                assert.deepEqual(bounds, [3, 6, 2, 2, 4]);
            }
        });
}
