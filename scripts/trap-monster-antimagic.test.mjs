import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTI_MAGIC,
    W_ARMF,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    AD_MAGM,
    AT_MAGC,
    AT_NONE,
    M1_WALLWALK,
    PM_KOBOLD,
} from '../js/monsters.js';
import { IRON_SHOES } from '../js/objects.js';
import {
    trigger_monster_antimagic,
} from '../js/trap_monster_antimagic.js';

async function initializedMonster(seed, name) {
    await runSegment({
        // The seed supplies a complete D:1 state; trap randomness is injected.
        seed,
        // Noon avoids a daylight-saving fold in the recorder timezone.
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        // Dismiss startup at the first command prompt.
        moves: ' ',
    });
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.data = game.mons[PM_KOBOLD];
    monster.mcan = false;
    monster.mhp = 20;
    monster.mhpmax = 20;
    monster.minvent = null;
    monster.mspec_used = 0;
    monster.mtrapseen = 0;
    return monster;
}

function antiMagicTrap(monster) {
    return {
        tseen: false,
        ttyp: ANTI_MAGIC,
        tx: monster.mx,
        ty: monster.my,
    };
}

test('positive iron shoes absorb anti-magic before effect randomness',
    async () => {
        const monster = await initializedMonster(982421, 'IronShoes');
        const boots = {
            nobj: null,
            otyp: IRON_SHOES,
            owornmask: W_ARMF,
            spe: 2,
        };
        monster.minvent = boots;
        const trap = antiMagicTrap(monster);

        const killed = await trigger_monster_antimagic(monster, trap, {
            killMonster: () => assert.fail('iron shoes prevent damage'),
            monsterName: () => 'The test monster',
            random: {
                d: () => assert.fail('iron shoes prevent energy loss'),
                rn2: () => assert.fail('an unknown trap has no avoid draw'),
                rnd: () => assert.fail('iron shoes prevent damage'),
            },
            state: game,
            trapFlags: 0,
        });

        assert.equal(killed, false);
        assert.equal(boots.spe, 1);
        assert.equal(monster.mhp, 20);
        assert.equal(trap.tseen, false);
    });

test('a nonresistant caster loses special-attack readiness', async () => {
    const monster = await initializedMonster(982422, 'MagicDrain');
    monster.data = {
        ...monster.data,
        mattk: [{ aatyp: AT_MAGC, adtyp: 0 }],
    };
    const trap = antiMagicTrap(monster);
    const draws = [];

    const killed = await trigger_monster_antimagic(monster, trap, {
        killMonster: () => assert.fail('a nonresistant caster takes no HP'),
        monsterName: () => 'The test caster',
        random: {
            d: (count, sides) => {
                draws.push(['d', count, sides]);
                return 7; // A midrange 2d6 result exposes additive readiness.
            },
            rn2: () => assert.fail('an unknown trap has no avoid draw'),
            rnd: () => assert.fail('a nonresistant caster takes no HP'),
        },
        state: game,
        trapFlags: 0,
    });

    assert.equal(killed, false);
    assert.equal(monster.mspec_used, 7);
    assert.deepEqual(draws, [['d', 2, 6]]);
    assert.equal(trap.tseen, true);
    assert.match(
        game._pending_message,
        /The test caster seems lethargic\.$/u,
    );
});

test('wall-passing resistance quarters anti-magic damage', async () => {
    const monster = await initializedMonster(982423, 'WallResistance');
    monster.data = {
        ...monster.data,
        // AD_MAGM makes resists_magm() true without an inventory artifact.
        mattk: [{ aatyp: AT_NONE, adtyp: AD_MAGM }],
        mflags1: monster.data.mflags1 | M1_WALLWALK,
    };
    monster.mhp = 5;
    const trap = antiMagicTrap(monster);
    const bounds = [];

    const killed = await trigger_monster_antimagic(monster, trap, {
        killMonster: () => assert.fail('quartered damage is nonlethal'),
        monsterName: () => 'The test monster',
        random: {
            rn2: () => assert.fail('an unknown trap has no avoid draw'),
            rnd: (bound) => {
                bounds.push(bound);
                return 4; // (4 + 3) / 4 truncates to one source damage.
            },
        },
        state: game,
        trapFlags: 0,
    });

    assert.equal(killed, false);
    assert.equal(monster.mhp, 4);
    assert.deepEqual(bounds, [4]);
    assert.equal(trap.tseen, true);
});

test('an unseen resistant monster supplies no anti-magic death cause',
    async () => {
        const monster = await initializedMonster(982424, 'UnseenResistance');
        monster.data = {
            ...monster.data,
            mattk: [{ aatyp: AT_NONE, adtyp: AD_MAGM }],
        };
        monster.minvis = true;
        monster.mhp = 1;
        const trap = antiMagicTrap(monster);
        const deaths = [];

        const killed = await trigger_monster_antimagic(monster, trap, {
            killMonster: (target, name, env) => {
                deaths.push([target, name, env.deathCause]);
            },
            monsterName: () => 'The unseen target',
            random: {
                rn2: () => assert.fail('an unknown trap has no avoid draw'),
                rnd: (bound) => {
                    assert.equal(bound, 4);
                    return 1; // Exactly lethal for the one-hit-point target.
                },
            },
            state: game,
            trapFlags: 0,
        });

        assert.equal(killed, true);
        assert.equal(monster.mhp, 0);
        assert.deepEqual(deaths, [[monster, 'The unseen target', null]]);
        assert.equal(trap.tseen, false);
    });

test('visible lethal anti-magic damage redraws after monster death',
    async () => {
        const monster = await initializedMonster(982426, 'VisibleDeath');
        monster.data = {
            ...monster.data,
            mattk: [{ aatyp: AT_NONE, adtyp: AD_MAGM }],
        };
        monster.mhp = 1;
        const trap = antiMagicTrap(monster);
        const events = [];

        const killed = await trigger_monster_antimagic(monster, trap, {
            killMonster: (target, _name, env) => {
                events.push(['kill', env.deathCause]);
                target.mhp = 0;
            },
            monsterName: () => 'The visible target',
            random: {
                rn2: () => assert.fail('an unknown trap has no avoid draw'),
                rnd: (bound) => {
                    assert.equal(bound, 4);
                    return 1;
                },
            },
            redraw: (x, y) => {
                events.push(['redraw', x, y]);
            },
            state: game,
            trapFlags: 0,
        });

        assert.equal(killed, true);
        assert.deepEqual(events, [
            ['kill', 'compression from an anti-magic field'],
            ['redraw', trap.tx, trap.ty],
        ]);
    });

test('known anti-magic avoidance precedes trap learning and damage',
    async () => {
        const monster = await initializedMonster(982425, 'AvoidAntimagic');
        monster.mtrapseen = 1 << (ANTI_MAGIC - 1);
        const trap = antiMagicTrap(monster);

        const killed = await trigger_monster_antimagic(monster, trap, {
            killMonster: () => assert.fail('an avoided trap cannot kill'),
            monsterName: () => 'The test monster',
            random: {
                d: () => assert.fail('an avoided trap cannot drain magic'),
                rn2: (bound) => {
                    assert.equal(bound, 4);
                    return 1; // Nonzero means the known trap is avoided.
                },
                rnd: () => assert.fail('an avoided trap cannot deal damage'),
            },
            state: game,
            trapFlags: 0,
        });

        assert.equal(killed, false);
        assert.equal(monster.mhp, 20);
        assert.equal(trap.tseen, false);
    });
