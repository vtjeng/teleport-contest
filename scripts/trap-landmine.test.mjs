import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LANDMINE,
    PIT,
    ROOM,
    Trap_Caught_Mon,
    Trap_Effect_Finished,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { PM_GIANT_ANT, PM_TITANOTHERE } from '../js/monsters.js';
import {
    blow_up_landmine,
    trapeffect_selector,
} from '../js/trap_effects.js';

const DATETIME = '20330405060708';
const RC = [
    'OPTIONS=name:MineProbe,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,time',
    '',
].join('\n');

async function freshHero() {
    await runSegment({
        seed: 9530021,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    game.level.traps = [];
    return game;
}

let nextFixtureId = 1100;
function victimOnLandmine(pmidx, mhp = 30) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        const species = game.mons[pmidx];
        const monster = newMonster({
            cham: -1,
            m_lev: Math.max(1, species.mlevel),
            m_id: ++nextFixtureId,
            mhp,
            mhpmax: mhp,
            mcanmove: true,
            mcansee: true,
            data: species,
            mnum: pmidx,
            mx: x,
            my: y,
        });
        place_monster(monster, x, y, game);
        monster.nmon = game.level.monlist;
        game.level.monlist = monster;
        const trap = {
            tx: x, ty: y, ttyp: LANDMINE, tseen: false,
            madeby_u: false, once: false,
        };
        game.level.traps.push(trap);
        return { monster, trap, x, y };
    }
    throw new Error('no free square beside the hero');
}

function landmineEnv({ damage = [4, 1], trigger = 400 } = {}) {
    const lines = [];
    const redraws = [];
    const damageRolls = [...damage];
    const bounds = [];
    const random = {
        rnd: (bound) => {
            bounds.push(`rnd(${bound})`);
            return damageRolls.length ? damageRolls.shift() : 1;
        },
        rn2: (bound) => {
            bounds.push(`rn2(${bound})`);
            return trigger;
        },
        rn1: (bound, from) => {
            bounds.push(`rn1(${bound},${from})`);
            return from;
        },
        rne: (bound) => {
            bounds.push(`rne(${bound})`);
            return 1;
        },
        rnl: (bound) => {
            bounds.push(`rnl(${bound})`);
            return 1;
        },
        d: (n, bound) => {
            bounds.push(`d(${n},${bound})`);
            return n;
        },
    };
    return {
        state: game,
        random,
        bounds,
        lines,
        redraws,
        message: async (line) => { lines.push(line); },
        redraw: (x, y) => { redraws.push(`${x},${y}`); },
        unsupported: (reason) => { throw new Error(reason); },
        mInAir: () => false,
        heroDeaf: () => false,
        youHear: () => null,
    };
}

test('trapeffect_selector dispatches a heavy monster to a land mine',
    async () => {
        await freshHero();
        const { monster, trap, x, y } = victimOnLandmine(PM_TITANOTHERE);
        const env = landmineEnv();

        assert.equal(
            await trapeffect_selector(monster, trap, 0, env),
            Trap_Caught_Mon,
        );
        assert.deepEqual(env.bounds, ['rnd(16)', 'rn2(2651)', 'rnd(6)']);
        assert.deepEqual(env.lines, [
            'KAABLAMM!!!  The titanothere triggers a land mine!',
            'The titanothere falls into a pit!',
        ]);
        assert.deepEqual(env.redraws, [`${x},${y}`, `${x},${y}`]);
        assert.equal(monster.mhp, 25, 'land mine and recursive pit damage');
        assert.equal(monster.mtrapped, true, 'the resulting pit holds it');
        assert.equal(trap.ttyp, PIT, 'the explosion converts the trap');
        assert.equal(trap.madeby_u, false);
    });

test('a light monster spends the damage roll before the trigger-weight gate',
    async () => {
        await freshHero();
        const { monster, trap } = victimOnLandmine(PM_GIANT_ANT, 12);
        const env = landmineEnv({ trigger: 0 });

        assert.equal(
            await trapeffect_selector(monster, trap, 0, env),
            Trap_Effect_Finished,
        );
        assert.deepEqual(env.bounds, ['rnd(16)', 'rn2(11)']);
        assert.equal(trap.ttyp, LANDMINE);
        assert.equal(monster.mhp, 12);
        assert.deepEqual(env.lines, []);
    });

test('blow_up_landmine converts an ordinary-room trap to a visible pit',
    async () => {
        await freshHero();
        const { trap, x, y } = victimOnLandmine(PM_GIANT_ANT);
        const env = landmineEnv();
        trap.tseen = false;

        await blow_up_landmine(trap, env);

        assert.equal(game.level.at(x, y).typ, ROOM);
        assert.equal(trap.ttyp, PIT);
        assert.equal(trap.madeby_u, false);
        assert.equal(trap.tseen, true);
        assert.deepEqual(env.redraws, [`${x},${y}`]);
    });
