import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FORCETRAP,
    HURTLING,
    SLP_GAS_TRAP,
    SQKY_BOARD,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_FLOATING_EYE,
    PM_HUMAN,
    PM_KOBOLD_ZOMBIE,
} from '../js/monsters.js';
import {
    trigger_monster_sleeping_gas,
    trigger_monster_squeaky_board,
} from '../js/trap_monster_sleep.js';

async function initializedMonster(seed, name) {
    await runSegment({
        // Each seed supplies a complete ordinary D:1 state; trap randomness
        // is injected separately so the focused branch is deterministic.
        seed,
        // Noon in the recorder timezone avoids a daylight-saving fold.
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        // The space dismisses startup at the first command prompt.
        moves: ' ',
    });
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.mtrapseen = 0;
    monster.mcanmove = true;
    monster.msleeping = false;
    return monster;
}

function trapAt(monster, ttyp) {
    return {
        madeby_u: false,
        tnote: 0,
        tseen: false,
        ttyp,
        tx: monster.mx,
        ty: monster.my,
    };
}

const monsterName = () => 'the test monster';

test('an airborne monster skips sleeping gas before trap avoidance',
    async () => {
        const monster = await initializedMonster(982421, 'AirborneSleep');
        monster.data = game.mons[PM_FLOATING_EYE];
        const trap = trapAt(monster, SLP_GAS_TRAP);

        const slept = await trigger_monster_sleeping_gas(
            monster,
            trap,
            {
                monsterName,
                random: {
                    rn2: () => assert.fail(
                        'the floor-trigger check precedes avoidance',
                    ),
                    rnd: () => assert.fail(
                        'an airborne target gets no sleep duration',
                    ),
                },
                resistsSleep: () => assert.fail(
                    'an airborne target gets no resistance check',
                ),
                sleepMonster: () => assert.fail(
                    'an airborne target cannot be put to sleep',
                ),
                state: game,
                trapFlags: 0,
            },
        );

        assert.equal(slept, false);
        assert.equal(monster.mtrapseen, 0);
        assert.equal(trap.tseen, false);
    });

test('a hurtling grounded monster also skips a floor trap before avoidance',
    async () => {
        const monster = await initializedMonster(982425, 'HurtlingSleep');
        monster.data = game.mons[PM_HUMAN];
        const trap = trapAt(monster, SLP_GAS_TRAP);

        await trigger_monster_sleeping_gas(monster, trap, {
            monsterName,
            random: {
                rn2: () => assert.fail(
                    'hurtling skips the known-trap avoidance draw',
                ),
                rnd: () => assert.fail(
                    'hurtling skips the sleep duration draw',
                ),
            },
            resistsSleep: () => assert.fail(
                'hurtling skips the resistance check',
            ),
            sleepMonster: () => assert.fail(
                'hurtling skips the sleep owner',
            ),
            state: game,
            trapFlags: HURTLING,
        });

        assert.equal(monster.mtrapseen, 0);
    });

test('sleeping gas passes its duration and source how value to sleep_monst',
    async () => {
        const monster = await initializedMonster(982422, 'GasDuration');
        monster.data = game.mons[PM_HUMAN];
        const trap = trapAt(monster, SLP_GAS_TRAP);
        game.level.traps = [trap];
        let sleepCalls = 0;

        const slept = await trigger_monster_sleeping_gas(
            monster,
            trap,
            {
                monsterName,
                random: {
                    // Zero makes the unseen trap trigger.
                    rn2: () => 0,
                    // Seventeen is an interior 1..25 duration.
                    rnd: (bound) => {
                        assert.equal(bound, 25);
                        return 17;
                    },
                },
                resistsSleep: () => false,
                sleepMonster: (target, duration, how) => {
                    ++sleepCalls;
                    assert.equal(target, monster);
                    assert.equal(duration, 17);
                    assert.equal(how, -1);
                    target.mcanmove = false;
                    target.mfrozen = duration;
                    return true;
                },
                state: game,
                trapFlags: 0,
            },
        );

        assert.equal(slept, true);
        assert.equal(sleepCalls, 1);
        assert.equal(monster.mfrozen, 17);
        assert.equal(
            monster.mtrapseen & (1 << (SLP_GAS_TRAP - 1)),
            1 << (SLP_GAS_TRAP - 1),
        );
    });

test('sleep_monst rejection occurs after the sleeping-gas duration draw',
    async () => {
        const monster = await initializedMonster(982426, 'DefendedSleep');
        monster.data = game.mons[PM_HUMAN];
        const trap = trapAt(monster, SLP_GAS_TRAP);
        const calls = [];

        const slept = await trigger_monster_sleeping_gas(
            monster,
            trap,
            {
                monsterName,
                random: {
                    rn2: () => 0,
                    rnd: (bound) => {
                        assert.equal(bound, 25);
                        calls.push('duration');
                        return 9;
                    },
                },
                // The outer trap check is intrinsic-only.
                resistsSleep: () => false,
                sleepMonster: (_target, duration, how) => {
                    calls.push('sleep-owner');
                    assert.equal(duration, 9);
                    assert.equal(how, -1);
                    return false;
                },
                state: game,
                trapFlags: 0,
            },
        );

        assert.equal(slept, false);
        assert.deepEqual(calls, ['duration', 'sleep-owner']);
        assert.equal(trap.tseen, false);
    });

test('forced squeaky-board activation teaches an airborne monster only',
    async () => {
        const monster = await initializedMonster(982423, 'ForcedSqueak');
        monster.data = game.mons[PM_FLOATING_EYE];
        monster.mtrapseen = 1 << (SQKY_BOARD - 1);
        const trap = trapAt(monster, SQKY_BOARD);

        const result = await trigger_monster_squeaky_board(
            monster,
            trap,
            {
                monsterName,
                random: {
                    rn2: () => assert.fail(
                        'FORCETRAP bypasses known-trap avoidance',
                    ),
                },
                state: game,
                trapFlags: FORCETRAP,
                wakeNear: () => assert.fail(
                    'm_in_air returns before waking nearby monsters',
                ),
            },
        );

        assert.equal(result, false);
        assert.equal(trap.tseen, false);
    });

test('a deaf hero still gets squeaky-board wake_nearto state changes',
    async () => {
        const monster = await initializedMonster(982424, 'DeafSqueak');
        monster.data = game.mons[PM_KOBOLD_ZOMBIE];
        game.u.uroleplay.deaf = true;
        const trap = trapAt(monster, SQKY_BOARD);
        game.level.traps = [trap];
        let wakeArgs;

        await trigger_monster_squeaky_board(monster, trap, {
            monsterName,
            random: {
                // Zero makes the new floor trap trigger.
                rn2: () => 0,
            },
            state: game,
            trapFlags: 0,
            wakeNear: (...args) => {
                wakeArgs = args;
            },
        });

        assert.deepEqual(wakeArgs.slice(0, 3), [
            monster.mx,
            monster.my,
            40,
        ]);
        assert.equal(trap.tseen, false);
    });
