import assert from 'node:assert/strict';
import test from 'node:test';

import {
    anger_quest_guardians,
    m_into_limbo,
    mon_to_stone,
    monstone,
    vamp_stone,
} from '../js/mon.js';
import {
    MON_LIMBO,
    MON_DETACH,
    MON_MIGRATING,
    NON_PM,
    STRAT_WAITMASK,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_JACKAL,
    PM_CLAY_GOLEM,
    PM_STONE_GOLEM,
    PM_VAMPIRE,
} from '../js/monsters.js';
import { d, rn1, rn2, rnd, rne } from '../js/rng.js';
import { STATUE } from '../js/objects.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { planningState } from '../js/unported_monster_actions.js';

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function hero(seed = 7710044) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
}

function fixture(pmidx, overrides = {}) {
    return newMonster({
        cham: NON_PM,
        m_lev: game.mons[pmidx].mlevel,
        m_id: 9000 + pmidx,
        mhp: 1,
        mhpmax: 1,
        mcanmove: 1,
        data: game.mons[pmidx],
        ...overrides,
    });
}

function placeFixture(monster) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        monster.mx = x;
        monster.my = y;
        place_monster(monster, x, y, game);
        monster.nmon = game.level.monlist;
        game.level.monlist = monster;
        return monster;
    }
    throw new Error('no free fixture square');
}

function env() {
    return {
        state: game,
        random: { d, rn1, rn2, rnd, rne },
        message: async () => {},
        unsupported: (reason) => { throw new Error(reason); },
    };
}

test('anger_quest_guardians selects only the role guardian species', async () => {
    await hero();
    const guardian = fixture(game.urole.guardnum, {
        mstrategy: STRAT_WAITMASK,
    });
    const other = fixture(PM_CLAY_GOLEM, { mstrategy: STRAT_WAITMASK });

    await anger_quest_guardians(guardian, game, env());
    await anger_quest_guardians(other, game, env());

    assert.equal(guardian.mstrategy & STRAT_WAITMASK, 0);
    assert.equal(other.mstrategy & STRAT_WAITMASK, STRAT_WAITMASK);
});

test('mon_to_stone changes a golem into a stone golem', async () => {
    await hero();
    const golem = fixture(PM_CLAY_GOLEM);
    await mon_to_stone(golem, game, env());
    assert.equal(golem.data, game.mons[PM_STONE_GOLEM]);
});

test('monstone leaves a statue and detaches the dead monster', async () => {
    await hero();
    const golem = placeFixture(fixture(PM_CLAY_GOLEM));
    const { mx, my } = golem;
    await monstone(golem, game, env());

    const statue = game.level.objects[mx][my];
    assert.equal(statue?.otyp, STATUE, 'STATUE remains on the square');
    assert.equal(golem.mhp, 0);
    assert.ok(golem.mstate & MON_DETACH, 'monstone marks the monster detached');
});

test('planned vamp_stone uses the clone redraw seam', async () => {
    await hero(7710045);
    const shifted = placeFixture(fixture(PM_JACKAL, {
        cham: PM_VAMPIRE,
        mhp: 8,
        mhpmax: 8,
    }));
    const planned = planningState(game);
    const plannedShifted = planned.level.monsters[shifted.mx][shifted.my];
    const redraws = [];
    await vamp_stone(plannedShifted, planned, {
        state: planned,
        planning: true,
        message: async () => {},
        redraw: (x, y) => redraws.push([x, y]),
    });
    assert.deepEqual(redraws, [[shifted.mx, shifted.my]]);
    assert.equal(shifted.data, game.mons[PM_JACKAL]);
    assert.equal(shifted.cham, PM_VAMPIRE);
    assert.equal(plannedShifted.data, game.mons[PM_VAMPIRE]);
});

test('m_into_limbo records limbo migration destination and source map state',
    async () => {
        await hero();
        const monster = placeFixture(fixture(PM_CLAY_GOLEM));
        monster.mtrack = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
        await m_into_limbo(monster, game, env());

        assert.equal(m_at(monster.mx, monster.my, game), null);
        assert.ok(monster.mstate & MON_LIMBO);
        assert.ok(monster.mstate & MON_MIGRATING);
        assert.equal(monster.mx, 0);
        assert.equal(monster.my, 0);
        assert.equal(game.gm.migrating_mons, monster);
    });

test('m_into_limbo waits for swallowed unstuck before migration', async () => {
    await hero();
    const monster = placeFixture(fixture(PM_CLAY_GOLEM));
    monster.mtrack = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    game.u.ustuck = monster;
    game.u.uswallow = 1;
    const order = [];
    const release = env();
    release.docrt = async () => order.push('docrt');
    release.redraw = () => order.push('redraw');
    release.visionRecalc = (control) => {
        order.push(`vision${control}`);
        if (control === 0) game.vision_full_recalc = 0;
    };

    await m_into_limbo(monster, game, release);

    assert.deepEqual(order.slice(0, 3), [
        'vision2', 'docrt', 'vision0',
    ]);
    assert.equal(monster.mx, 0);
    assert.equal(monster.my, 0);
    assert.equal(game.u.ustuck, null);
});
