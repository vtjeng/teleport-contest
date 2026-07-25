import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    DART_TRAP,
    FIRE_TRAP,
    HOLE,
    HURTLING,
    MAGIC_TRAP,
    MON_MIGRATING,
    PIT,
    ROCKTRAP,
    RUST_TRAP,
    SLP_GAS_TRAP,
    SQKY_BOARD,
    STATUE_TRAP,
    TELEP_TRAP,
    WEB,
} from '../js/const.js';
import { resolve_monster_trap } from '../js/trap_monster.js';

function subject(overrides = {}) {
    return {
        data: {},
        mhp: 5,
        mstate: 0,
        mtrapped: false,
        mtrapseen: 0,
        mx: 4,
        my: 5,
        ...overrides,
    };
}

function trapState() {
    return {
        level: {
            at: () => ({ lit: false }),
            monlist: null,
        },
        u: { ux: 10, uy: 10 },
    };
}

test('monster trap selector dispatches source families and normalizes results',
    async () => {
        const cases = [
            [RUST_TRAP, 'triggerRustTrap', 'finished'],
            [SQKY_BOARD, 'triggerSqueakyBoard', 'finished'],
            [SLP_GAS_TRAP, 'triggerSleepingGas', 'finished'],
            [ARROW_TRAP, 'triggerArrowTrap', 'killed'],
            [DART_TRAP, 'triggerDartTrap', 'killed'],
            [ROCKTRAP, 'triggerRockTrap', 'killed'],
            [BEAR_TRAP, 'triggerBearTrap', 'caught'],
            [PIT, 'triggerPitTrap', 'caught'],
            [WEB, 'triggerWebTrap', 'caught'],
            [ANTI_MAGIC, 'triggerAntiMagicTrap', 'killed'],
            [MAGIC_TRAP, 'triggerMagicTrap', 'killed'],
            [FIRE_TRAP, 'triggerFireTrap', 'killed'],
            [TELEP_TRAP, 'triggerTeleportTrap', 'moved'],
            [HOLE, 'triggerHoleTrap', 'moved'],
        ];

        for (const [ttyp, operation, expected] of cases) {
            const monster = subject();
            const trap = { ttyp, tx: monster.mx, ty: monster.my };
            const calls = [];
            const result = await resolve_monster_trap(monster, {
                [operation]: async (target, selectedTrap) => {
                    calls.push([target, selectedTrap]);
                    if (expected === 'killed') return true;
                    if (expected === 'caught') target.mtrapped = true;
                    if (expected === 'moved') {
                        if (ttyp === TELEP_TRAP) return true;
                        target.mstate |= MON_MIGRATING;
                    }
                    return false;
                },
                state: trapState(),
                trapAt: () => trap,
            });

            assert.equal(result, expected, operation);
            assert.deepEqual(calls, [[monster, trap]], operation);
        }
    });

test('hurtling skips floor traps before resolving a handler', async () => {
    const monster = subject();
    const trap = {
        ttyp: ARROW_TRAP,
        tx: monster.mx,
        ty: monster.my,
    };

    const result = await resolve_monster_trap(monster, {
        state: trapState(),
        trapAt: () => trap,
        triggerArrowTrap: () => assert.fail(
            'hurtling passes above a floor-triggered arrow trap',
        ),
    }, HURTLING);

    assert.equal(result, 'finished');
});

test('trapped and trapless monsters preserve their distinct source paths',
    async () => {
        const trapped = subject({ mtrapped: true });
        const caught = await resolve_monster_trap(trapped, {
            resolveTrappedMonster: (monster) => {
                assert.equal(monster, trapped);
                return true;
            },
            state: trapState(),
            trapAt: () => assert.fail(
                'already-trapped handling precedes trap lookup',
            ),
        });
        assert.equal(caught, 'caught');

        const trapless = subject({ mtrapped: true });
        const finished = await resolve_monster_trap(trapless, {
            resolveTrappedMonster: (monster) => {
                monster.mtrapped = false;
                return false;
            },
            state: trapState(),
            trapAt: () => null,
        });
        assert.equal(finished, 'finished');
        assert.equal(trapless.mtrapped, false);

        const stale = subject({ mtrapped: false });
        assert.equal(await resolve_monster_trap(stale, {
            state: trapState(),
            trapAt: () => null,
        }), 'finished');
        assert.equal(stale.mtrapped, false);
    });

test('statue traps teach monsters without invoking an effect handler',
    async () => {
        const monster = subject();
        const trap = {
            ttyp: STATUE_TRAP,
            tx: monster.mx,
            ty: monster.my,
        };
        const result = await resolve_monster_trap(monster, {
            random: {
                rn2: () => assert.fail(
                    'an unknown statue trap has no avoidance draw',
                ),
            },
            state: trapState(),
            trapAt: () => trap,
        });

        assert.equal(result, 'finished');
        assert.equal(
            monster.mtrapseen & (1 << (STATUE_TRAP - 1)),
            1 << (STATUE_TRAP - 1),
        );
    });
