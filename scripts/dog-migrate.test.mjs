import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MIGR_EXACT_XY,
    MIGR_RANDOM,
    MON_MIGRATING,
} from '../js/const.js';
import { ledger_no } from '../js/dungeon.js';
import { keepdogs, migrate_to_level } from '../js/dog.js';
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

// dog.c keepdogs(), which shares mon_leave() and relmon() with
// migrate_to_level() above. do.c goto_level() is its only caller.

function heroAdjacentMonster(state, pmidx = PM_KITTEN, overrides = {}) {
    const monster = newMonster({
        data: state.mons[pmidx],
        mhp: 4,
        mhpmax: 4,
        // newMonster() leaves mcanmove FALSE, which monst.h helpless() reads;
        // a monster that cannot move never follows.
        mcanmove: true,
        ...overrides,
    });
    state.level.monlist = monster;
    place_monster(monster, HERO_X + 1, HERO_Y, state);
    return monster;
}

test('keepdogs takes an adjacent pet off the level onto gm.mydogs', () => {
    const state = migrationState();
    state.gm.mydogs = null;
    const pet = heroAdjacentMonster(state, PM_KITTEN, { mtame: 10 });

    keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, pet);
    assert.equal(state.level.monlist, null);
    assert.equal(state.level.monsters[HERO_X + 1][HERO_Y], null);
    assert.deepEqual([pet.mx, pet.my], [0, 0]);
    assert.equal(pet.wormno, 0);
    assert.equal(pet.mlstmv, MIGRATION_TURN);
});

test('keepdogs leaves an ordinary monster on the level', () => {
    const state = migrationState();
    state.gm.mydogs = null;
    // A sewer rat carries no M2_STALK, is not tame, and stands two squares
    // away, so neither the follow arm nor keep_mon_accessible() takes it.
    const { monster } = onMapMonster(state, PM_SEWER_RAT);

    keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, null);
    assert.equal(state.level.monlist, monster);
    assert.deepEqual([monster.mx, monster.my], [MONSTER_X, MONSTER_Y]);
});

test('keepdogs migrates a shopkeeper who is away from her shop', () => {
    const state = migrationState();
    state.gm.mydogs = null;
    // dog.c keep_mon_accessible():772-778. The shop is on another level, so
    // the shopkeeper goes on the migrating list instead of into this level's
    // save file. mon_leave()'s set_residency() is unported, so this stops.
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.isshk = true;
    monster.mextra = { eshk: { shoplevel: { ...UPWARD_DESTINATION } } };

    assert.throws(
        () => keepdogs(false, { newsym: () => {}, state }),
        /shopkeeper migration is future work/u,
    );
});

test('keepdogs leaves a shopkeeper standing in her own shop', () => {
    const state = migrationState();
    state.gm.mydogs = null;
    // The other side of keep_mon_accessible()'s on_level() test: a resident
    // shopkeeper is saved with her level rather than migrated.
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.isshk = true;
    monster.mextra = { eshk: { shoplevel: { ...CURRENT_LEVEL } } };

    keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.level.monlist, monster);
});

test('keepdogs refuses the branches it cannot reproduce', () => {
    // Each of these leaves the follower behind in C with a message, or needs a
    // subsystem that is not ported. dog.c:815-834.
    const cases = [
        [{ mtame: 10, mtrapped: true }, /trapped follower/u],
        [{ mtame: 10, meating: 3 }, /still eating/u],
        // A leashed monster that is not tame and stands beside the hero is
        // not a follower, so it falls through to dog.c:878.
        // A kitten carries no M2_STALK and is not tame here, so it is not a
        // follower and falls through to dog.c:878.
        [{ mtame: 0, mleashed: true }, /leashed monster/u],
    ];
    for (const [overrides, message] of cases) {
        const state = migrationState();
        state.gm.mydogs = null;
        heroAdjacentMonster(state, PM_KITTEN, overrides);
        assert.throws(
            () => keepdogs(false, { newsym: () => {}, state }),
            message,
            `${JSON.stringify(overrides)} stops`,
        );
    }
});

test('keepdogs refuses the ascension arm', () => {
    // dog.c:797-805, which end.c drives. Nothing in this port ascends.
    const state = migrationState();
    assert.throws(
        () => keepdogs(true, { state }),
        /escape or ascension/u,
    );
});

test('migration clears the trapped and undetected flags', () => {
    // mon.c mon_leaving_level():3365 and 3384. A monster that carried either
    // flag off the map would arrive still stuck or still hidden.
    const state = migrationState();
    const { monster } = onMapMonster(state);
    monster.mtrapped = true;
    monster.mundetected = true;

    migrate_to_level(monster, 1, MIGR_RANDOM, null,
        { newsym: () => {}, state });

    assert.equal(monster.mtrapped, false);
    assert.equal(monster.mundetected, false);
});

test('keepdogs reads both halves of helpless()', () => {
    // monst.h:251, `msleeping || !mcanmove`. A monster failing either half
    // stays behind, so both must be read.
    for (const [overrides, follows] of [
        [{ msleeping: true, mcanmove: true }, false],
        [{ msleeping: false, mcanmove: false }, false],
        [{ msleeping: false, mcanmove: true }, true],
    ]) {
        const state = migrationState();
        state.gm.mydogs = null;
        heroAdjacentMonster(state, PM_KITTEN, { mtame: 10, ...overrides });
        keepdogs(false, { newsym: () => {}, state });
        assert.equal(Boolean(state.gm.mydogs), follows,
            `${JSON.stringify(overrides)} decides whether the pet follows`);
    }
});

test('keepdogs still takes a follower down to its last hit point', () => {
    // dog.c:794, DEADMONSTER() is `mhp < 1`. A pet on one hit point is alive.
    const state = migrationState();
    state.gm.mydogs = null;
    const pet = heroAdjacentMonster(state, PM_KITTEN, { mtame: 10, mhp: 1 });

    keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, pet);
});

test('keepdogs migrates a distant Wizard instead of following him', () => {
    // dog.c:811-812 and keep_mon_accessible():770-771. Without the Amulet the
    // hero does not drag the Wizard along, but he stays reachable so that his
    // next harassment finds the same instance.
    const state = migrationState();
    state.gm.mydogs = null;
    state.u.uhave = { amulet: false };
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.iswiz = true;
    // helpless() would keep him out of the follow arm whatever the amulet
    // term answered, which is the state that hides dog.c:812's conjunction.
    monster.mcanmove = true;

    keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, null);
    assert.equal(state.gm.migrating_mons, monster);
    assert.equal(monster.mstate & MON_MIGRATING, MON_MIGRATING);
});

test('keepdogs migrates a vault guard who is away from his vault', () => {
    // keep_mon_accessible():772-778, the isgd disjunct. Each of the three
    // mextra owners is a separate reason to stay reachable.
    const state = migrationState();
    state.gm.mydogs = null;
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.isgd = true;
    monster.mextra = { egd: { gdlevel: { ...UPWARD_DESTINATION } } };

    keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.migrating_mons, monster);
});
