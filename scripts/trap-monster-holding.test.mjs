import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BEAR_TRAP,
    FORCETRAP,
    PIT,
    WEB,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_FLOATING_EYE,
    PM_HUMAN,
    PM_OWLBEAR,
    PM_RUST_MONSTER,
} from '../js/monsters.js';
import { BOULDER } from '../js/objects.js';
import {
    resolve_trapped_monster,
    trigger_monster_bear_trap,
    trigger_monster_pit,
    trigger_monster_web,
} from '../js/trap_monster_holding.js';

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
    monster.mhp = 100; // Keeps ordinary trap damage nonlethal by default.
    monster.mtrapseen = 0;
    monster.mtrapped = false;
    return monster;
}

function ordinaryTrap(monster, ttyp) {
    return {
        madeby_u: false,
        tseen: false,
        ttyp,
        tx: monster.mx,
        ty: monster.my,
    };
}

const monsterName = () => 'the test monster';

test('an airborne monster ignores a bear trap before trap knowledge',
    async () => {
        const monster = await initializedMonster(982411, 'AirborneBear');
        monster.data = game.mons[PM_FLOATING_EYE];
        const trap = ordinaryTrap(monster, BEAR_TRAP);
        const killed = await trigger_monster_bear_trap(
            monster,
            trap,
            {
                killMonster: () => {
                    assert.fail('an airborne monster cannot be killed');
                },
                monsterName,
                random: {
                    d: () => assert.fail('an airborne target takes no damage'),
                    rn2: () => assert.fail(
                        'the floor-trigger check precedes trap avoidance',
                    ),
                },
                state: game,
                trapFlags: 0,
            },
        );

        assert.equal(killed, false);
        assert.equal(monster.mtrapped, false);
        assert.equal(monster.mtrapseen, 0);
        assert.equal(trap.tseen, false);

        // FORCETRAP bypasses both the floor-trigger and known-trap checks,
        // then the bear-trap selector reports the airborne evasion.
        monster.mtrapseen = 1 << (BEAR_TRAP - 1);
        await trigger_monster_bear_trap(monster, trap, {
            killMonster: () => {
                assert.fail('the forced airborne selector remains harmless');
            },
            monsterName,
            random: {
                d: () => assert.fail('an airborne target takes no damage'),
                rn2: () => assert.fail(
                    'FORCETRAP bypasses the known-trap avoidance draw',
                ),
            },
            state: game,
            trapFlags: FORCETRAP,
        });
        assert.equal(monster.mtrapped, false);
    });

test('an unseen owlbear is caught instead of tearing through a web',
    async () => {
        const monster = await initializedMonster(982412, 'UnseenOwlbear');
        monster.data = game.mons[PM_OWLBEAR];
        monster.minvis = true;
        const trap = ordinaryTrap(monster, WEB);
        game.level.traps = [trap];

        const caught = await trigger_monster_web(monster, trap, {
            monsterName,
            random: {
                // Zero makes a new trap trigger without an avoidance branch.
                rn2: () => 0,
            },
            state: game,
            trapFlags: 0,
        });

        assert.equal(caught, true);
        assert.equal(monster.mtrapped, true);
        assert.equal(game.level.traps[0], trap);
        assert.equal(trap.tseen, false);
    });

test('pit self-touch resolves before the pit damage roll', async () => {
    const monster = await initializedMonster(982413, 'PitSelfTouch');
    monster.data = game.mons[PM_HUMAN];
    const trap = ordinaryTrap(monster, PIT);
    game.level.traps = [trap];
    let selfTouches = 0;

    const killed = await trigger_monster_pit(monster, trap, {
        killMonster: () => {
            assert.fail('self-touch owns the death before trap damage');
        },
        monsterName,
        random: {
            // Zero makes a new trap trigger without an avoidance branch.
            rn2: () => 0,
            rnd: () => assert.fail(
                'a self-touch death suppresses the pit damage roll',
            ),
        },
        selfTouch: (target, prefix) => {
            assert.equal(prefix, 'Falling, ');
            ++selfTouches;
            target.mhp = 0;
        },
        state: game,
        trapFlags: 0,
    });

    assert.equal(killed, true);
    assert.equal(selfTouches, 1);
    assert.equal(monster.mtrapped, true);
    assert.equal(
        monster.mtrapseen & (1 << (PIT - 1)),
        1 << (PIT - 1),
    );
});

test('a trapped metallivore eats a bear trap after a failed escape',
    async () => {
        const monster = await initializedMonster(982414, 'EatingBearTrap');
        monster.data = game.mons[PM_RUST_MONSTER];
        monster.mtrapped = true;
        monster.meating = 0;
        const trap = ordinaryTrap(monster, BEAR_TRAP);
        game.level.traps = [trap];

        const caught = await resolve_trapped_monster(monster, {
            fillPit: () => {
                assert.fail('a bear trap cannot reach fill_pit');
            },
            monsterName,
            random: {
                // A nonzero one-in-forty result enters the metallivore arm.
                rn2: (bound) => {
                    assert.equal(bound, 40);
                    return 1;
                },
            },
            state: game,
        });

        assert.equal(caught, false);
        assert.equal(monster.mtrapped, false);
        assert.equal(monster.meating, 5);
        assert.deepEqual(game.level.traps, []);
    });

test('a trapped monster delegates boulder pit filling after pulling free',
    async () => {
        const monster = await initializedMonster(982415, 'BoulderPit');
        monster.data = game.mons[PM_HUMAN];
        monster.mtrapped = true;
        const trap = ordinaryTrap(monster, PIT);
        const boulder = {
            nexthere: null,
            otyp: BOULDER,
            ox: monster.mx,
            oy: monster.my,
        };
        game.level.traps = [trap];
        game.level.objects[monster.mx][monster.my] = boulder;
        const draws = [
            0, // The one-in-forty escape succeeds.
            0, // The one-in-two boulder escape succeeds.
        ];
        let fills = 0;

        const caught = await resolve_trapped_monster(monster, {
            fillPit: (target, targetTrap, targetBoulder) => {
                ++fills;
                assert.equal(target, monster);
                assert.equal(targetTrap, trap);
                assert.equal(targetBoulder, boulder);
                assert.equal(target.mtrapped, false);
            },
            monsterName,
            random: {
                rn2: () => draws.shift(),
            },
            state: game,
        });

        assert.equal(caught, false);
        assert.equal(fills, 1);
        assert.deepEqual(draws, []);
    });
