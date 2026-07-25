import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FIRE_TRAP,
    MAGIC_TRAP,
    OBJ_MINVENT,
    W_ARMG,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_NEWT,
    PM_PAPER_GOLEM,
} from '../js/monsters.js';
import {
    ARMOR_CLASS,
    LEATHER_GLOVES,
} from '../js/objects.js';
import {
    burn_monster_armor,
    trigger_monster_fire,
    trigger_monster_magic,
} from '../js/trap_monster_fire.js';

async function initializedMonster(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.data = game.mons[PM_NEWT];
    monster.mhp = 20;
    monster.mhpmax = 20;
    monster.minvent = null;
    monster.mtrapseen = 0;
    return monster;
}

function trapAtMonster(monster, type) {
    return {
        tseen: false,
        ttyp: type,
        tx: monster.mx,
        ty: monster.my,
    };
}

test('an ordinary magic-trap activation ends after its fire-burst draw',
    async () => {
        const monster = await initializedMonster(982441, 'QuietMagicTrap');
        const trap = trapAtMonster(monster, MAGIC_TRAP);
        const draws = [];

        const killed = await trigger_monster_magic(monster, trap, {
            killMonster: () => assert.fail('ordinary magic does not kill'),
            random: {
                rn2: (bound) => {
                    draws.push(bound);
                    assert.equal(bound, 21);
                    return 1;
                },
            },
            state: game,
            trapFlags: 0,
        });

        assert.equal(killed, false);
        assert.deepEqual(draws, [21]);
        assert.equal(
            monster.mtrapseen & (1 << (MAGIC_TRAP - 1)),
            1 << (MAGIC_TRAP - 1),
        );
    });

test('no-equipment burnarmor repeats until the torso case', async () => {
    const monster = await initializedMonster(982442, 'NoArmor');
    const script = [
        [5, 0],
        [5, 4],
        [5, 1],
    ];

    const hitTorso = await burn_monster_armor(monster, {
        random: {
            rn2: (bound) => {
                const [expectedBound, result] = script.shift();
                assert.equal(bound, expectedBound);
                return result;
            },
        },
        state: game,
    });

    assert.equal(hitTorso, true);
    assert.equal(script.length, 0);
});

test('burnarmor delegates worn-item erosion to the shared trap owner',
    async () => {
        const monster = await initializedMonster(982445, 'SharedBurnErosion');
        const gloves = {
            blessed: false,
            greased: false,
            nobj: null,
            ocarry: monster,
            oclass: ARMOR_CLASS,
            oeroded: 0,
            oeroded2: 0,
            oerodeproof: false,
            otyp: LEATHER_GLOVES,
            owornmask: W_ARMG,
            quan: 1,
            rknown: false,
            where: OBJ_MINVENT,
        };
        monster.minvent = gloves;

        const result = await burn_monster_armor(monster, {
            random: {
                rnl: () => assert.fail('ordinary gloves need no luck draw'),
                rn2: (bound) => {
                    assert.equal(bound, 5);
                    return 3; // Case 3 aims directly at worn gloves.
                },
            },
            state: game,
        });

        assert.equal(result, false);
        assert.equal(gloves.oeroded, 1);
    });

test('paper golem death still runs the later fire owners', async () => {
    const monster = await initializedMonster(982443, 'PaperFire');
    monster.data = game.mons[PM_PAPER_GOLEM];
    monster.mhp = 1;
    monster.mhpmax = 12;
    monster.minvis = true;
    monster.mx = 1;
    monster.my = 1;
    const trap = trapAtMonster(monster, FIRE_TRAP);
    const events = [];
    const rn2Script = [
        [5, 1], // burnarmor hits the empty torso slot
        [5, 4], // 8 damage selects one inventory stack; none exist
    ];

    const killed = await trigger_monster_fire(monster, trap, {
        killMonster: (target, _name, env) => {
            events.push(['kill', env.noCorpse]);
            target.mhp = 0;
        },
        random: {
            d: (count, sides) => {
                events.push(['damage', count, sides]);
                return 8;
            },
            rn2: (bound) => {
                const [expectedBound, result] = rn2Script.shift();
                assert.equal(bound, expectedBound);
                events.push(['rn2', bound, result]);
                return result;
            },
        },
        state: game,
    });

    assert.equal(killed, true);
    assert.deepEqual(events, [
        ['damage', 2, 4],
        ['kill', true],
        ['rn2', 5, 1],
        ['rn2', 5, 4],
    ]);
    assert.equal(rn2Script.length, 0);
});

test('surviving fire reduces current HP before maximum HP', async () => {
    const monster = await initializedMonster(982444, 'SurvivingFire');
    monster.minvis = true;
    monster.mx = 1;
    monster.my = 1;
    const trap = trapAtMonster(monster, FIRE_TRAP);
    const script = [
        [4, 2], // reduce maximum HP after three points of current damage
        [5, 1], // burnarmor reaches the empty torso slot
        [5, 4], // damage below five selects no inventory stack
    ];

    const killed = await trigger_monster_fire(monster, trap, {
        killMonster: () => assert.fail('this fire is nonlethal'),
        random: {
            d: (count, sides) => {
                assert.deepEqual([count, sides], [2, 4]);
                return 3;
            },
            rn2: (bound) => {
                const [expectedBound, result] = script.shift();
                assert.equal(bound, expectedBound);
                return result;
            },
        },
        state: game,
    });

    assert.equal(killed, false);
    assert.equal(monster.mhp, 17);
    assert.equal(monster.mhpmax, 18);
    assert.equal(script.length, 0);
});
