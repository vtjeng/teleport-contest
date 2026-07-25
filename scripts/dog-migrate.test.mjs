import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MIGR_EXACT_XY,
    MIGR_RANDOM,
    MON_MIGRATING,
} from '../js/const.js';
import { ledger_no } from '../js/dungeon.js';
import { migrate_to_level } from '../js/dog.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    PM_KITTEN,
    PM_SEWER_RAT,
    PM_YELLOW_LIGHT,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    COIN_CLASS,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';

const CURRENT_LEVEL = Object.freeze({ dnum: 0, dlevel: 2 });
const CROSS_DUNGEON_DESTINATION = Object.freeze({ dnum: 1, dlevel: 2 });
const UPWARD_DESTINATION = Object.freeze({ dnum: 0, dlevel: 1 });
const HERO_X = 10;
const HERO_Y = 10;
const MONSTER_X = 12;
const MONSTER_Y = 9;
const MIGRATION_TURN = 77;

function migrationState() {
    const state = {
        context: {},
        dungeons: [
            // Three main-dungeon levels exercise upward migration.
            {
                depth_start: 1,
                ledger_start: 0,
                num_dunlevs: 3,
            },
            // A distinct depth and ledger range exercise dungeon-number storage.
            {
                depth_start: 10,
                ledger_start: 3,
                num_dunlevs: 2,
            },
        ],
        gm: { migrating_mons: null },
        level: new GameMap(),
        moves: MIGRATION_TURN,
        u: {
            ux: HERO_X,
            uy: HERO_Y,
            uz: { ...CURRENT_LEVEL },
            ustuck: null,
        },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    return state;
}

function onMapMonster(state, pmidx = PM_SEWER_RAT) {
    const follower = newMonster({
        data: state.mons[PM_KITTEN],
        mhp: 4,
        mhpmax: 4,
    });
    const monster = newMonster({
        data: state.mons[pmidx],
        mhp: 4,
        mhpmax: 4,
        nmon: follower,
    });
    state.level.monlist = monster;
    place_monster(monster, MONSTER_X, MONSTER_Y, state);
    return { follower, monster };
}

test('ordinary migration clears charges and transfers the live monster', () => {
    const state = migrationState();
    const { follower, monster } = onMapMonster(state);
    const containedCoin = {
        cobj: null,
        nobj: null,
        no_charge: true,
        oclass: COIN_CLASS,
    };
    const containedItem = {
        cobj: null,
        nobj: containedCoin,
        no_charge: true,
        oclass: WEAPON_CLASS,
    };
    const container = {
        cobj: containedItem,
        nobj: null,
        no_charge: true,
        oclass: WEAPON_CLASS,
    };
    monster.minvent = container;
    const oldMigrating = { marker: 'old', nmon: null };
    state.gm.migrating_mons = oldMigrating;
    state.context.polearm = { hitmon: monster };
    const events = [];

    migrate_to_level(
        monster,
        ledger_no(CROSS_DUNGEON_DESTINATION, state),
        MIGR_RANDOM,
        null,
        {
            newsym: (x, y) => {
                events.push(['newsym', x, y]);
                assert.equal(state.level.monsters[x][y], null);
            },
            state,
        },
    );

    assert.deepEqual(events, [['newsym', MONSTER_X, MONSTER_Y]]);
    assert.equal(container.no_charge, false);
    assert.equal(containedItem.no_charge, false);
    assert.equal(containedCoin.no_charge, true);
    assert.equal(state.level.monlist, follower);
    assert.equal(state.gm.migrating_mons, monster);
    assert.equal(state.context.polearm.hitmon, null);
    assert.equal(monster.nmon, oldMigrating);
    assert.equal(monster.mstate & MON_MIGRATING, MON_MIGRATING);
    assert.deepEqual([monster.mx, monster.my], [0, 0]);
    assert.deepEqual(
        [monster.mux, monster.muy],
        [
            CROSS_DUNGEON_DESTINATION.dnum,
            CROSS_DUNGEON_DESTINATION.dlevel,
        ],
    );
    assert.deepEqual(monster.mtrack.slice(0, 3), [
        { x: MIGR_RANDOM, y: 0 },
        { x: MONSTER_X, y: MONSTER_Y },
        { x: CURRENT_LEVEL.dnum, y: CURRENT_LEVEL.dlevel },
    ]);
    assert.equal(monster.mlstmv, MIGRATION_TURN);
});

test('exact upward migration stores coordinates and the upward flag', () => {
    const state = migrationState();
    const { monster } = onMapMonster(state);
    const exactDestination = { x: 4, y: 5 };

    migrate_to_level(
        monster,
        ledger_no(UPWARD_DESTINATION, state),
        MIGR_EXACT_XY,
        exactDestination,
        { newsym: () => {}, state },
    );

    assert.deepEqual(monster.mtrack.slice(0, 3), [
        { x: MIGR_EXACT_XY, y: 1 },
        exactDestination,
        { x: CURRENT_LEVEL.dnum, y: CURRENT_LEVEL.dlevel },
    ]);
});

test('migration rejects future lifecycle owners before item mutation', () => {
    for (const [property, value, message] of [
        ['mleashed', true, /leashed monster migration/u],
        ['isshk', true, /shopkeeper migration/u],
        ['wormno', 1, /long-worm migration/u],
        ['m_ap_type', 1, /disguised monster migration/u],
    ]) {
        const state = migrationState();
        const { monster } = onMapMonster(state);
        const carried = {
            cobj: null,
            nobj: null,
            no_charge: true,
            oclass: WEAPON_CLASS,
        };
        monster.minvent = carried;
        monster[property] = value;

        assert.throws(
            () => migrate_to_level(
                monster,
                1,
                MIGR_RANDOM,
                null,
                { newsym: () => {}, state },
            ),
            message,
        );
        assert.equal(carried.no_charge, true);
        assert.deepEqual([monster.mx, monster.my], [MONSTER_X, MONSTER_Y]);
        assert.equal(state.level.monlist, monster);
    }
});

test('a migrating light invalidates vision after leaving the map', () => {
    const state = migrationState();
    const { monster } = onMapMonster(state, PM_YELLOW_LIGHT);
    const events = [];

    migrate_to_level(monster, 1, MIGR_RANDOM, null, {
        newsym: () => events.push('newsym'),
        state,
        visionRecalc: (control) => {
            events.push(['vision', control, monster.mx, monster.my]);
        },
    });

    assert.deepEqual(events, [
        'newsym',
        ['vision', 0, 0, 0],
    ]);
});
