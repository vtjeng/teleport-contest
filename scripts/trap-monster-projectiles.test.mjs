import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARROW_TRAP,
    OBJ_DELETED,
    OBJ_FLOOR,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ARROW } from '../js/objects.js';
import {
    trigger_monster_arrow_trap,
} from '../js/trap_monster_projectiles.js';

function nonStrikingProjectileRandom() {
    return {
        // Object initialization keeps every optional one-in-N branch off.
        rn2: (bound) => Math.min(1, bound - 1),
        // Multigen uses the minimum source stack before the trap forces quan 1.
        rn1: (_range, base) => base,
        // One initializes the object id and makes the armor check miss.
        rnd: () => 1,
        // Arrow construction does not reach these draws, but the complete
        // object-generation contract requires them.
        rne: () => 1,
        rnz: (value) => value,
    };
}

test('an arrow-trap miss leaves its initialized projectile on the floor',
    async () => {
        await runSegment({
            // This seed only supplies a fully initialized ordinary D:1 state;
            // the focused trap branch uses the scripted random source below.
            seed: 982401,
            // Noon in the recorder timezone avoids a daylight-saving fold.
            datetime: '20260724120000',
            nethackrc: 'OPTIONS=name:ProjectileOwner,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen',
            // The leading space dismisses startup at the first prompt.
            moves: ' ',
        });

        const monster = game.level.monlist;
        assert.ok(monster);
        monster.mhp = 100; // Keeps the fixture outside every death branch.
        monster.mtrapseen = 0;
        const trap = {
            once: false,
            tseen: false,
            ttyp: ARROW_TRAP,
            tx: monster.mx,
            ty: monster.my,
        };
        game.level.traps.push(trap);

        const killed = await trigger_monster_arrow_trap(
            monster,
            trap,
            {
                killMonster: () => {
                    assert.fail('the scripted armor check must miss');
                },
                missileDamage: () => {
                    assert.fail('a missed missile has no damage roll');
                },
                monsterArmorClass: () => 10,
                monsterName: () => 'the test monster',
                random: nonStrikingProjectileRandom(),
                state: game,
                trapFlags: 0,
            },
        );

        assert.equal(killed, false);
        assert.equal(trap.once, true);
        assert.equal(
            monster.mtrapseen & (1 << (ARROW_TRAP - 1)),
            1 << (ARROW_TRAP - 1),
        );
        const projectile = game.level.objects[monster.mx][monster.my];
        assert.ok(projectile);
        assert.equal(projectile.otyp, ARROW);
        assert.equal(projectile.quan, 1);
        assert.equal(projectile.where, OBJ_FLOOR);
    });

test('an arrow-trap hit deallocates its projectile after damage', async () => {
    await runSegment({
        // As above, this seed initializes state before the scripted trap call.
        seed: 982402,
        // Noon in the recorder timezone avoids a daylight-saving fold.
        datetime: '20260724120000',
        nethackrc: 'OPTIONS=name:ProjectileHit,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen',
        // The leading space dismisses startup at the first prompt.
        moves: ' ',
    });

    const monster = game.level.monlist;
    assert.ok(monster);
    monster.mhp = 100; // Leaves the target alive after the two-point hit.
    monster.mtrapseen = 0;
    const trap = {
        once: false,
        tseen: false,
        ttyp: ARROW_TRAP,
        tx: monster.mx,
        ty: monster.my,
    };
    game.level.traps.push(trap);
    let projectile;
    const random = nonStrikingProjectileRandom();
    random.rnd = (bound) => bound === 20
        ? 20 // The largest attack roll makes the missile strike.
        : 1; // Object ids use the smallest positive result.

    const killed = await trigger_monster_arrow_trap(
        monster,
        trap,
        {
            killMonster: () => {
                assert.fail('the fixed two-point hit is nonlethal');
            },
            missileDamage: (missile) => {
                projectile = missile;
                return 2; // A fixed positive value exercises hit disposal.
            },
            monsterArmorClass: () => 10,
            monsterName: () => 'the test monster',
            random,
            state: game,
            trapFlags: 0,
        },
    );

    assert.equal(killed, false);
    assert.equal(monster.mhp, 98);
    assert.ok(projectile);
    assert.equal(projectile.where, OBJ_DELETED);
    assert.equal(game.level.objects[monster.mx][monster.my], null);
});
