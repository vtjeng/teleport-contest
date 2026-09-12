// Focused trap.c coverage for the monster arms of trapeffect_magic_trap() and
// trapeffect_anti_magic(). The ordinary nonzero roll finishes immediately;
// zero delegates to trapeffect_fire_trap(), including thitm() and burnarmor().

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTI_MAGIC,
    FIRE_TRAP,
    MAGIC_TRAP,
    Trap_Effect_Finished,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import {
    AD_MAGM,
    AD_PHYS,
    AT_MAGC,
    NON_PM,
    PM_JACKAL,
} from '../js/monsters.js';
import { mintrap, trapeffect_selector } from '../js/trap_effects.js';
import { canSeeMonster } from '../js/startup_a11y.js';

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:TrapMage,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7710044, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.level.traps = [];
    return game;
}

let nextFixtureId = 900;
function victimOnMagicTrap() {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        const species = game.mons[PM_JACKAL];
        const monster = newMonster({
            cham: NON_PM,
            m_lev: Math.max(1, species.mlevel),
            m_id: ++nextFixtureId,
            mhp: 20,
            mhpmax: 20,
            mcanmove: 1,
            mcansee: true,
            data: species,
            mnum: PM_JACKAL,
            mx: x,
            my: y,
        });
        place_monster(monster, x, y, game);
        monster.nmon = game.level.monlist;
        game.level.monlist = monster;
        const trap = {
            tx: x, ty: y, ttyp: MAGIC_TRAP, tseen: false,
            madeby_u: false, once: false,
        };
        game.level.traps.push(trap);
        return { monster, trap, x, y };
    }
    throw new Error('no free square beside the hero');
}

function trapEnv(rolls = [], damage = 4) {
    const bounds = [];
    const lines = [];
    const redraws = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : 1;
    };
    return {
        bounds,
        lines,
        redraws,
        state: game,
        random: {
            d: (n, sides) => {
                bounds.push(`d(${n},${sides})`);
                return damage;
            },
            rn1: (n, from) => take(`rn1(${n},${from})`) + from,
            rn2: (bound) => take(`rn2(${bound})`),
            rnd: (bound) => take(`rnd(${bound})`),
            rne: (bound) => take(`rne(${bound})`),
            rnl: (bound) => take(`rnl(${bound})`),
            rnz: (bound) => take(`rnz(${bound})`),
        },
        message: async (line) => { lines.push(line); },
        redraw: (x, y) => { redraws.push(`${x},${y}`); },
        unsupported: (reason) => { throw new Error(reason); },
        mInAir: () => false,
        heroDeaf: () => false,
        youHear: () => null,
    };
}

test('a nonzero monster magic-trap roll finishes without fire work',
    async () => {
        await hero();
        const { monster, trap } = victimOnMagicTrap();
        const env = trapEnv([1]);

        assert.equal(await mintrap(monster, 0, env), Trap_Effect_Finished);
        assert.deepEqual(env.bounds, ['rn2(21)']);
        assert.deepEqual(env.lines, []);
        assert.equal(monster.mhp, 20);
        assert.equal(trap.tseen, false);
    });

test('a zero monster magic-trap roll returns the fire-trap result',
    async () => {
        await hero();
        const { monster, trap, x, y } = victimOnMagicTrap();
        assert.equal(canSeeMonster(monster, game), true);
        // trap.c:2315's rn2(21) selects fire. The following draws are the
        // fire damage, thitm()'s mhpmax adjustment, burnarmor()'s empty torso
        // selection, and destroy_items()'s limit remainder check.
        const env = trapEnv([0, 2, 1, 4], 4);

        assert.equal(await mintrap(monster, 0, env), Trap_Effect_Finished);
        assert.deepEqual(env.bounds, [
            'rn2(21)', 'd(2,4)', 'rn2(5)', 'rn2(5)', 'rn2(5)',
        ]);
        assert.deepEqual(env.lines, [
            'A tower of flame erupts from the floor under the jackal!',
        ]);
        assert.equal(monster.mhp, 16, 'thitm() applies d(2,4) damage');
        assert.equal(monster.mhpmax, 18, 'fire trap adjusts mhpmax');
        assert.equal(trap.tseen, true);
        assert.deepEqual(env.redraws, [`${x},${y}`]);
    });

test('the trap selector reaches the monster fire-trap arm directly', async () => {
    await hero();
    const { monster, trap } = victimOnMagicTrap();
    trap.ttyp = FIRE_TRAP;
    const env = trapEnv([2, 1, 4], 4);

    assert.equal(
        await trapeffect_selector(monster, trap, 0, env),
        Trap_Effect_Finished,
    );
    assert.equal(monster.mhp, 16);
    assert.deepEqual(env.lines, [
        'A tower of flame erupts from the floor under the jackal!',
    ]);
});

test('a non-caster crosses an anti-magic trap without a draw', async () => {
    await hero();
    const { monster, trap } = victimOnMagicTrap();
    // trap.c ANTI_MAGIC; the jackal has no magical attack.
    trap.ttyp = ANTI_MAGIC;
    const env = trapEnv([0]);

    assert.equal(await mintrap(monster, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.bounds, [], 'the non-caster arm spends no RNG');
    assert.equal(monster.mhp, 20);
    assert.equal(monster.mspec_used ?? 0, 0);
    assert.equal(trap.tseen, false);
});

test('an uncancelled magical attacker becomes lethargic', async () => {
    await hero();
    const { monster, trap } = victimOnMagicTrap();
    trap.ttyp = ANTI_MAGIC; // trap.c ANTI_MAGIC.
    monster.mspec_used = 3;
    monster.data = {
        ...monster.data,
        mattk: [{ aatyp: AT_MAGC, adtyp: AD_PHYS }],
    };
    const env = trapEnv([], 4);

    assert.equal(await mintrap(monster, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.bounds, ['d(2,6)']);
    assert.equal(monster.mspec_used, 7);
    assert.equal(trap.tseen, true);
    assert.deepEqual(env.lines, ['The jackal seems lethargic.']);
});

test('a magic-resistant monster takes anti-magic damage', async () => {
    await hero();
    const { monster, trap } = victimOnMagicTrap();
    trap.ttyp = ANTI_MAGIC; // trap.c ANTI_MAGIC.
    monster.data = {
        ...monster.data,
        mattk: [{ aatyp: AT_MAGC, adtyp: AD_MAGM }],
    };
    const env = trapEnv([3]);

    assert.equal(await mintrap(monster, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.bounds, ['rnd(4)']);
    assert.equal(monster.mhp, 17);
    assert.equal(trap.tseen, true);
    assert.deepEqual(env.lines, []);
});
