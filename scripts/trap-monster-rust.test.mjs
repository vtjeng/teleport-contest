import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ER_DAMAGED,
    ER_NOTHING,
    OBJ_MINVENT,
    RUST_TRAP,
    W_ARM,
    W_ARMC,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_WEP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    AD_RUST,
    M1_FLY,
    PM_GREMLIN,
    PM_IRON_GOLEM,
    PM_KOBOLD,
} from '../js/monsters.js';
import {
    ALCHEMY_SMOCK,
    ARMOR_CLASS,
    BATTLE_AXE,
    LEATHER_GLOVES,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    trigger_monster_rust,
} from '../js/trap_monster_rust.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

async function initializedMonster(seed, name) {
    await runSegment({
        seed,
        datetime: '20260725120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.data = game.mons[PM_KOBOLD];
    monster.mhp = 20;
    monster.mhpmax = 20;
    monster.minvent = null;
    monster.mtrapseen = 0;
    clearTtyMessageWindow(game);
    return monster;
}

function rustTrap(monster) {
    return {
        tseen: false,
        ttyp: RUST_TRAP,
        tx: monster.mx,
        ty: monster.my,
    };
}

function equipment(monster, otyp, owornmask, overrides = {}) {
    return {
        dknown: true,
        lamplit: false,
        nobj: null,
        ocarry: monster,
        oclass: owornmask === W_WEP ? WEAPON_CLASS : ARMOR_CLASS,
        otyp,
        owornmask,
        where: OBJ_MINVENT,
        ...overrides,
    };
}

function scriptedRandom(script) {
    return {
        rn2: (bound) => {
            const [expectedBound, result] = script.shift();
            assert.equal(bound, expectedBound);
            return result;
        },
    };
}

test('an airborne monster skips rust before learning or aiming', async () => {
    const monster = await initializedMonster(982451, 'FlyingRust');
    monster.data = { ...monster.data, mflags1: monster.data.mflags1 | M1_FLY };
    const trap = rustTrap(monster);

    const killed = await trigger_monster_rust(monster, trap, {
        random: {
            rn2: () => assert.fail('flight precedes trap randomness'),
        },
        state: game,
        waterDamage: () => assert.fail('flight prevents water damage'),
    });

    assert.equal(killed, false);
    assert.equal(monster.mtrapseen, 0);
    assert.equal(trap.tseen, false);
});

test('a visible head hit reveals the trap before naming armor', async () => {
    const monster = await initializedMonster(982452, 'VisibleRust');
    const helmet = equipment(monster, ALCHEMY_SMOCK, W_ARMH);
    monster.minvent = helmet;
    const trap = rustTrap(monster);
    const calls = [];

    const killed = await trigger_monster_rust(monster, trap, {
        monsterName: () => 'the test monster',
        random: scriptedRandom([[5, 0]]),
        state: game,
        waterDamage: (target, description) => {
            calls.push([target, description, trap.tseen]);
            return ER_NOTHING;
        },
    });

    assert.equal(killed, false);
    assert.deepEqual(calls, [[helmet, 'hat', true]]);
    assert.match(game._pending_message, /hits the test monster on the head!/u);
});

test('an unseen right-arm hit still damages weapon then gloves',
    async () => {
        const monster = await initializedMonster(982453, 'UnseenRust');
        monster.minvis = true;
        const weapon = equipment(monster, BATTLE_AXE, W_WEP);
        const gloves = equipment(monster, LEATHER_GLOVES, W_ARMG);
        weapon.nobj = gloves;
        monster.minvent = weapon;
        monster.mw = weapon;
        const trap = rustTrap(monster);
        const calls = [];

        await trigger_monster_rust(monster, trap, {
            random: scriptedRandom([[5, 2]]),
            state: game,
            waterDamage: (target, description) => {
                calls.push([target, description]);
                return ER_NOTHING;
            },
        });

        assert.deepEqual(calls, [
            [weapon, null],
            [gloves, 'gloves'],
        ]);
        assert.equal(trap.tseen, false);
    });

test('a damaged left shield stops before weapon and glove checks',
    async () => {
        const monster = await initializedMonster(982454, 'ShieldRust');
        const shield = equipment(monster, ALCHEMY_SMOCK, W_ARMS);
        const weapon = equipment(monster, BATTLE_AXE, W_WEP);
        const gloves = equipment(monster, LEATHER_GLOVES, W_ARMG);
        shield.nobj = weapon;
        weapon.nobj = gloves;
        monster.minvent = shield;
        monster.mw = weapon;
        const calls = [];

        await trigger_monster_rust(monster, rustTrap(monster), {
            random: scriptedRandom([[5, 1]]),
            state: game,
            waterDamage: (target, description) => {
                calls.push([target, description]);
                return ER_DAMAGED;
            },
        });

        assert.deepEqual(calls, [[shield, 'shield']]);
    });

test('an unaffected left shield reaches a bimanual weapon and gloves',
    async () => {
        const monster = await initializedMonster(982455, 'BimanualRust');
        const shield = equipment(monster, ALCHEMY_SMOCK, W_ARMS);
        const weapon = equipment(monster, BATTLE_AXE, W_WEP);
        const gloves = equipment(monster, LEATHER_GLOVES, W_ARMG);
        shield.nobj = weapon;
        weapon.nobj = gloves;
        monster.minvent = shield;
        monster.mw = weapon;
        const calls = [];

        await trigger_monster_rust(monster, rustTrap(monster), {
            random: scriptedRandom([[5, 1]]),
            state: game,
            waterDamage: (target, description) => {
                calls.push([target, description]);
                return ER_NOTHING;
            },
        });

        assert.deepEqual(calls, [
            [shield, 'shield'],
            [weapon, null],
            [gloves, 'gloves'],
        ]);
    });

test('a body hit splashes non-weapons before choosing cloak armor',
    async () => {
        const monster = await initializedMonster(982456, 'BodyRust');
        const weapon = equipment(monster, BATTLE_AXE, W_WEP, {
            lamplit: true,
        });
        const lamp = equipment(monster, BATTLE_AXE, 0, {
            lamplit: true,
            oclass: WEAPON_CLASS,
        });
        const cloak = equipment(monster, ALCHEMY_SMOCK, W_ARMC);
        const suit = equipment(monster, ALCHEMY_SMOCK, W_ARM);
        const shirt = equipment(monster, ALCHEMY_SMOCK, W_ARMU);
        weapon.nobj = lamp;
        lamp.nobj = cloak;
        cloak.nobj = suit;
        suit.nobj = shirt;
        monster.minvent = weapon;
        monster.mw = weapon;
        const events = [];

        await trigger_monster_rust(monster, rustTrap(monster), {
            random: scriptedRandom([[5, 4]]),
            splashLight: (target) => {
                events.push(['splash', target]);
                return true;
            },
            state: game,
            waterDamage: (target, description) => {
                events.push(['water', target, description]);
                return ER_NOTHING;
            },
        });

        assert.deepEqual(events, [
            ['splash', lamp],
            ['water', cloak, 'apron'],
        ]);
    });

test('an iron golem falls before rust death is delegated', async () => {
    const monster = await initializedMonster(982457, 'IronGolemRust');
    monster.data = game.mons[PM_IRON_GOLEM];
    const events = [];
    game.nhDisplay.pushKey(' '.charCodeAt(0));

    const killed = await trigger_monster_rust(
        monster,
        rustTrap(monster),
        {
            killMonster: (target, visibleName, env) => {
                events.push([
                    'kill',
                    visibleName,
                    env.damageType,
                    game._pending_message,
                ]);
                target.mhp = 0;
            },
            monsterName: () => 'the iron golem',
            random: scriptedRandom([[5, 0]]),
            state: game,
            waterDamage: () => ER_NOTHING,
        },
    );

    assert.equal(killed, true);
    assert.deepEqual(events, [[
        'kill',
        null,
        AD_RUST,
        'The iron golem falls to pieces!',
    ]]);
});

test('a life-saved iron golem starts to fall and survives', async () => {
    const monster = await initializedMonster(982459, 'SavedIronGolemRust');
    monster.data = game.mons[PM_IRON_GOLEM];
    game.nhDisplay.pushKey(' '.charCodeAt(0));

    const killed = await trigger_monster_rust(
        monster,
        rustTrap(monster),
        {
            killMonster: () => {},
            monsterLifeSaver: () => ({}),
            monsterName: () => 'the iron golem',
            random: scriptedRandom([[5, 2]]),
            state: game,
            waterDamage: () => ER_NOTHING,
        },
    );

    assert.equal(killed, false);
    assert.equal(
        game._pending_message,
        'The iron golem starts to fall to pieces!',
    );
});

test('a gremlin split draw follows all water effects', async () => {
    const monster = await initializedMonster(982458, 'GremlinRust');
    monster.data = game.mons[PM_GREMLIN];
    const shirt = equipment(monster, ALCHEMY_SMOCK, W_ARMU);
    monster.minvent = shirt;
    const events = [];

    const killed = await trigger_monster_rust(
        monster,
        rustTrap(monster),
        {
            random: scriptedRandom([
                [5, 3],
                [3, 2],
            ]),
            splitMonster: (target, attacker, env) => {
                events.push(['split', target, attacker, env.state]);
            },
            state: game,
            waterDamage: (target, description) => {
                events.push(['water', target, description]);
                return ER_NOTHING;
            },
        },
    );

    assert.equal(killed, false);
    assert.deepEqual(events, [
        ['water', shirt, 'shirt'],
        ['split', monster, null, game],
    ]);
});
