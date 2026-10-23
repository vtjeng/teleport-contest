import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MIGR_EXACT_XY,
    MAX_NUM_WORMS,
    MIGR_RANDOM,
    HOLE,
    PIT,
    COLNO,
    ROWNO,
    MON_MIGRATING,
    MON_LIMBO,
    MON_STILL_ARRIVING,
    MIGR_APPROX_XY,
    NO_MM_FLAGS,
    M_AP_FURNITURE,
    M_AP_NOTHING,
    M_AP_OBJECT,
    M_AP_TYPE,
    MM_ADJACENTOK,
    MM_NOMSG,
    NO_MINVENT,
    ROOM,
    ROOMOFFSET,
    ZAP_POS,
} from '../js/const.js';
import { ledger_no } from '../js/dungeon.js';
import {
    keep_mon_accessible,
    keepdogs,
    tamedog,
    losedogs,
    migrate_to_level,
    mon_arrive,
    mon_catchup_elapsed_time,
} from '../js/dog.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { NethackGame, runSegment } from '../js/jsmain.js';
import { GameDisplay } from '../js/game_display.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { maketrap } from '../js/trap.js';
import { mksobj_at, newObject, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    PM_SMALL_MIMIC,
    PM_LICHEN,
    PM_LONG_WORM,
    PM_LITTLE_DOG,
    PM_KITTEN,
    PM_SEWER_RAT,
    PM_SHOPKEEPER,
    PM_WIZARD_OF_YENDOR,
    PM_YELLOW_LIGHT,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    AMULET_OF_YENDOR,
    BOULDER,
    COIN_CLASS,
    LEASH,
    ROCK_CLASS,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import {
    block_point,
    does_block,
    is_lightblocker_mappear,
} from '../js/vision.js';
import { goodpos } from '../js/teleport.js';
import { isok } from '../js/cmd_isok.js';
import { TOPLINE_NEED_MORE } from '../js/tty_message.js';

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

test('ordinary migration clears charges and transfers the live monster', async () => {
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

    await migrate_to_level(
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
    assert.equal(containedItem.no_charge, 0); // shk.c picked_container clears it.
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

for (const tower of ['wiz1_level', 'wiz2_level', 'wiz3_level']) {
    for (const inside of [false, true]) {
        test(`migration uses canonical ${tower} boundary with inside=${inside}`, async () => {
            const state = migrationState();
            state[tower] = { ...CURRENT_LEVEL };
            state.dndest = inside
                ? { nlx: MONSTER_X, nly: MONSTER_Y, nhx: MONSTER_X + 2, nhy: MONSTER_Y + 2 }
                : { nlx: MONSTER_X + 1, nly: MONSTER_Y, nhx: MONSTER_X + 2, nhy: MONSTER_Y + 2 };
            const { monster } = onMapMonster(state);
            await migrate_to_level(monster, 1, MIGR_RANDOM, null,
                { state, newsym: () => {} });
            assert.equal(monster.mtrack[0].y, inside ? 3 : 1,
                'tower-origin flag combines with upward migration');
            assert.deepEqual(monster.mtrack[1], { x: MONSTER_X, y: MONSTER_Y });
            assert.equal(state.gm.migrating_mons, monster);
        });
    }
}

test('migration retains an injected tower operation with original coordinates', async () => {
    const state = migrationState();
    state.wiz1_level = { ...CURRENT_LEVEL };
    const { monster } = onMapMonster(state);
    const calls = [];
    await migrate_to_level(monster, 1, MIGR_RANDOM, null, {
        state, newsym: () => {},
        inWizardTower: (x, y, level, owner) => {
            calls.push([x, y, level]);
            assert.equal(owner, state);
            return true;
        },
    });
    assert.deepEqual(calls, [[MONSTER_X, MONSTER_Y, CURRENT_LEVEL]]);
    assert.equal(monster.mtrack[0].y, 3);
});

test('migration uses canonical mon_leaving_level boulder landing effects', async () => {
    const state = migrationState();
    state.flags = { acoustics: true };
    const { monster } = onMapMonster(state);
    const { mx, my } = monster;
    const calls = [];
    const messages = [];
    state.context.ident = 1;
    maketrap(mx, my, PIT, { state });
    const boulder = newObject({
        otyp: BOULDER,
        oclass: ROCK_CLASS,
        quan: 1,
    });
    place_object(boulder, mx, my, {
        state,
        hooks: { blockPoint: () => {} },
    });

    await migrate_to_level(monster, 1, MIGR_RANDOM, null, {
        state,
        newsym: () => {},
        random: {
            rn2: (bound) => {
                calls.push(bound);
                return 13;
            },
        },
        message: async (line) => messages.push(line),
    });

    assert.deepEqual(calls, [100]);
    assert.deepEqual(messages, ['You hear a boulder settle.']);
    assert.equal(state.level.objects[mx][my], null);
    assert.equal(state.level.traps.some((trap) => trap.tx === mx
        && trap.ty === my && trap.ttyp === HOLE), false);
    assert.equal(monster.mtrapped, 0);
    assert.equal(monster.mx, 0);
});

test('exact upward migration stores coordinates and the upward flag', async () => {
    const state = migrationState();
    const { monster } = onMapMonster(state);
    const exactDestination = { x: 4, y: 5 };

    await migrate_to_level(
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

test('migration releases a leashed monster before moving it', async () => {
    const state = migrationState();
    const { follower, monster } = onMapMonster(state);
    monster.mleashed = true;
    monster.mtame = 1;
    const leash = { otyp: LEASH, leashmon: monster.m_id, nobj: null };
    state.invent = leash;
    const messages = [];

    await migrate_to_level(
        monster,
        ledger_no(CROSS_DUNGEON_DESTINATION, state),
        MIGR_RANDOM,
        null,
        { message: async (line) => messages.push(line), state },
    );

    assert.deepEqual(messages, ['Your leash falls slack.']);
    assert.equal(leash.leashmon, 0);
    assert.equal(monster.mleashed, 0);
    assert.equal(monster.mtame, 0);
    assert.equal(state.level.monlist, follower);
    assert.equal(state.gm.migrating_mons, monster);
    assert.equal(monster.mstate & MON_MIGRATING, MON_MIGRATING);
    assert.deepEqual([monster.mx, monster.my], [0, 0]);
});

test('shopkeeper migration clears its home resident and preserves its destination', async () => {
    const state = migrationState();
    const { monster } = onMapMonster(state, PM_SHOPKEEPER);
    monster.isshk = true;
    monster.mextra = { eshk: {
        shoplevel: { ...CURRENT_LEVEL }, shoproom: ROOMOFFSET,
    } };
    state.level.rooms[0] = { resident: monster };
    const destination = { x: 5, y: 6 };
    await migrate_to_level(monster, ledger_no(UPWARD_DESTINATION, state),
        MIGR_APPROX_XY, destination, { state, newsym: () => {} });
    assert.equal(state.level.rooms[0].resident, null);
    assert.equal(state.gm.migrating_mons, monster);
    assert.equal(monster.mstate & MON_MIGRATING, MON_MIGRATING);
    assert.deepEqual([monster.mx, monster.my], [0, 0]);
    assert.deepEqual(monster.mtrack[1], destination);
});

for (const cooldown of [0, 3]) {
    test(`migration releases its holder and preserves cooldown ${cooldown}`, async () => {
        const state = migrationState();
        const { monster, follower } = onMapMonster(state, PM_LICHEN);
        const carried = { cobj: null, nobj: null, no_charge: true,
            oclass: WEAPON_CLASS };
        monster.minvent = carried;
        monster.mspec_used = cooldown;
        state.u.ustuck = monster;
        const rolls = [];
        await migrate_to_level(monster, 1, MIGR_RANDOM, null, {
            newsym: () => {}, state,
            random: { rnd: bound => { rolls.push(bound); return 2; } },
        });
        assert.equal(state.u.ustuck, null);
        assert.equal(state.u.uswallow, 0);
        assert.equal(state.u.uswldtim, 0);
        assert.deepEqual(rolls, cooldown ? [] : [2]);
        assert.equal(monster.mspec_used, cooldown || 2);
        assert.equal(carried.no_charge, false);
        assert.deepEqual([monster.mx, monster.my], [0, 0]);
        assert.equal(state.level.monlist, follower);
        assert.equal(state.gm.migrating_mons, monster);
        assert.equal(m_at(MONSTER_X, MONSTER_Y, state), null);
    });
}

for (const tailCount of [0, 3, MAX_NUM_WORMS + 1]) {
    test(`worm migration preserves ${tailCount} tail segments subject to the source cap`, async () => {
        const state = migrationState();
        const liveWorms = game.level?.worms;
        const liveBefore = JSON.stringify(liveWorms);
        const { monster, follower } = onMapMonster(state, PM_LONG_WORM);
        monster.wormno = 1;
        const segments = Array.from({ length: tailCount + 1 }, (_, index) => ({
            x: MONSTER_X + tailCount - index, y: MONSTER_Y,
        }));
        state.level.worms = Array(MAX_NUM_WORMS).fill(null);
        state.level.worms[1] = { segments, growtime: 123 };
        for (const { x, y } of segments)
            state.level.monsters[x][y] = monster;

        await migrate_to_level(monster, 1, MIGR_RANDOM, null,
            { state, newsym: () => {} });

        assert.equal(state.gm.migrating_mons, monster);
        assert.equal(state.level.monlist, follower);
        assert.equal(state.level.worms[1], null);
        assert.equal(monster.wormno, Math.min(tailCount, MAX_NUM_WORMS - 1));
        assert.deepEqual([monster.mx, monster.my], [0, 0]);
        assert.deepEqual(monster.mtrack[1], { x: MONSTER_X, y: MONSTER_Y });
        for (const { x, y } of segments)
            assert.equal(m_at(x, y, state), null);
        assert.equal(game.level?.worms, liveWorms);
        assert.equal(JSON.stringify(liveWorms), liveBefore,
            'supplied-state migration must not change live worm slots');
    });
}

test('migration only admits linked canonical off-map limbo state', async () => {
    {
        const state = migrationState();
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 4,
            mhpmax: 4,
            mx: 0,
            my: 0,
            mstate: MON_LIMBO,
            mtrack: [
                { x: MIGR_APPROX_XY, y: 0 },
                { x: 0, y: 0 },
                { x: CURRENT_LEVEL.dnum, y: CURRENT_LEVEL.dlevel },
            ],
        });
        await assert.rejects(
            () => migrate_to_level(monster, ledger_no(CURRENT_LEVEL, state),
                MIGR_APPROX_XY, null, { state }),
            /not on (?:the map|the level chain)/u,
        );
        assert.equal(state.level.monlist, null);
        assert.equal(state.gm.migrating_mons, null);
    }
    {
        const state = migrationState();
        const { monster } = onMapMonster(state);
        monster.mx = 0;
        monster.my = 0;
        await assert.rejects(
            () => migrate_to_level(monster, ledger_no(CURRENT_LEVEL, state),
                MIGR_APPROX_XY, null, { state }),
            /not on the map/u,
        );
        assert.equal(state.gm.migrating_mons, null);
        assert.equal(monster.mlstmv, 0);
    }
    {
        const state = migrationState();
        const { monster } = onMapMonster(state);
        state.level.monsters[monster.mx][monster.my] = null;
        await assert.rejects(
            () => migrate_to_level(monster, ledger_no(CURRENT_LEVEL, state),
                MIGR_RANDOM, null, { state }),
            /not on the map/u,
        );
        assert.equal(state.gm.migrating_mons, null);
        assert.equal(monster.mlstmv, 0);
    }
});

test('dog.c mon_catchup_elapsed_time updates conditions, healing, and last move', () => {
    const state = migrationState();
    const { monster } = onMapMonster(state);
    Object.assign(monster, {
        mblinded: 50,
        mfrozen: 100,
        mfleetim: 3,
        mtrapped: true,
        mconf: true,
        mstun: true,
        meating: 5,
        mspec_used: 40,
        mhp: 2,
        mhpmax: 10,
        mtame: 0,
        mlstmv: 1,
    });
    const calls = [];
    const values = [21, 26, 6];

    mon_catchup_elapsed_time(monster, 50, {
        state,
        redraw: () => {},
        random: {
            rn2(range) {
                calls.push(range);
                return values.shift();
            },
        },
    });

    assert.deepEqual(calls, [51, 51, 51]);
    assert.deepEqual(
        [monster.mblinded, monster.mfrozen, monster.mfleetim],
        [1, 50, 1],
    );
    assert.equal(monster.mtrapped, false);
    assert.equal(monster.mconf, false);
    assert.equal(monster.mstun, false);
    assert.equal(monster.meating, 0);
    assert.equal(monster.mspec_used, 0);
    assert.equal(monster.mhp, 4);
    assert.equal(monster.mlstmv, state.moves);
});

test('dog.c mon_arrive preserves the mounted-steed early return state', async () => {
    const state = migrationState();
    const { monster } = onMapMonster(state);
    await migrate_to_level(
        monster,
        ledger_no(CROSS_DUNGEON_DESTINATION, state),
        MIGR_RANDOM,
        null,
        { state, newsym: () => {} },
    );
    state.gm.migrating_mons = null;
    state.u.usteed = monster;
    monster.my = 6;

    await mon_arrive(monster, 'With_you', { state, redraw: () => {} });

    assert.equal(state.level.monlist, monster);
    assert.deepEqual([monster.mx, monster.my], [0, 6]);
    assert.equal(monster.mstate & MON_MIGRATING, 0);
    assert.notEqual(monster.mstate & MON_STILL_ARRIVING, 0);
    assert.deepEqual(monster.mtrack.slice(0, 3), [
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
    ]);
});

test('failed Wizard arrival records the void limbo gap without throwing', async () => {
    const state = migrationState();
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 4,
        mhpmax: 4,
    });
    game.unported?.delete('dog.c migrate_to_level');

    await assert.doesNotReject(() => mon_arrive(monster, 'Wiz_arrive', {
        state,
        random: { rn1: (_range, low) => low, rn2: () => 1 },
    }));

    assert.equal(state.level.monlist, monster);
    assert.equal(monster.mstate & MON_STILL_ARRIVING, 0);
    assert.equal(game.unported.has('dog.c migrate_to_level'), true);
});

test('dog.c losedogs places exact and random migrants in source order', async () => {
    const state = migrationState();
    for (let x = 1; x < COLNO - 1; ++x)
        for (let y = 0; y < ROWNO; ++y)
            state.level.at(x, y).typ = ROOM;
    const first = onMapMonster(state).monster;
    const second = newMonster({
        data: state.mons[PM_YELLOW_LIGHT],
        mhp: 4,
        mhpmax: 4,
        nmon: state.level.monlist,
    });
    state.level.monlist = second;
    place_monster(second, MONSTER_X + 2, MONSTER_Y, state);
    const destinationLedger = ledger_no(CURRENT_LEVEL, state);
    await migrate_to_level(first, destinationLedger, MIGR_EXACT_XY,
        { x: MONSTER_X, y: MONSTER_Y }, { state, newsym: () => {} });
    await migrate_to_level(second, destinationLedger, MIGR_RANDOM,
        null, { state, newsym: () => {} });
    state.moves += 4;

    await losedogs({
        state,
        random: {
            rn1: (_range, low) => low,
            rn2: () => 1,
            rnd: () => 79,
        },
    });

    assert.equal(state.gm.migrating_mons, null);
    assert.equal(state.level.monlist, second);
    assert.equal(second.nmon, first);
    assert.notEqual(first.mstate & MON_STILL_ARRIVING, MON_STILL_ARRIVING);
    assert.notEqual(second.mstate & MON_STILL_ARRIVING, MON_STILL_ARRIVING);
});

test('ordinary failed arrival returns through limbo migration', async () => {
    const display = new GameDisplay(null);
    const previousOnEmptyQueue = display.onEmptyQueue;
    const prompts = [];
    let gameInstance;
    const safe = (value) => typeof value === 'bigint' ? value.toString() : value;
    const chain = (head) => {
        const result = [];
        for (let current = head; current; current = current.nmon)
            result.push(safe(current.m_id));
        return result;
    };
    display.onEmptyQueue = () => {
        const fullScreen = display.serialize();
        const pendingMessage = game._pending_message ?? '';
        if (fullScreen.includes('--More--') && pendingMessage
            && display.toplin === 1 && prompts.length < 16) {
            prompts.push({ fullScreen, pendingMessage });
            return 32;
        }
        throw new Error(`unexpected empty input boundary: ${JSON.stringify({
            fullScreen,
            topline: display.toplines,
            pendingMessage,
            queueLength: display.inputQueueLength,
            waitEpoch: display.waitEpoch,
        })}`);
    };
    try {
        gameInstance = new NethackGame({
            seed: 83201971,
            datetime: '20261018162030',
            recorderIsDst: true,
            nethackrc: 'OPTIONS=name:ArrivalProbe,role:Ranger,race:elf,gender:male,align:chaotic,pettype:dog,!legacy,!tutorial,!splash_screen,!acoustics,!autopickup\n',
        });
        gameInstance._pendingDisplay = display;
        assert.equal(await gameInstance.start(), true);
        const actorId = game.context.startingpet_mid;
        let actor = null;
        for (let current = game.level.monlist; current; current = current.nmon) {
            if (current.m_id === actorId) actor = current;
        }
        assert.ok(actor);
        assert.equal(actor.data.pmidx, PM_LITTLE_DOG);
        assert.ok(actor.mhp > 0 && actor.mtame > 0);

        await migrate_to_level(actor, ledger_no(game.u.uz, game), MIGR_RANDOM,
            null, { state: game });
        const objects = objectGenerationEnv({ state: game });
        let canonicalBouldersAdded = 0;
        for (let x = 1; x < COLNO; x++) {
            for (let y = 0; y < ROWNO; y++) {
                const location = game.level.at(x, y);
                if (!location || !ZAP_POS(location.typ)
                    || (x === game.u.ux && y === game.u.uy)
                    || m_at(x, y, game)
                    || !goodpos(x, y, actor, NO_MM_FLAGS, { state: game }))
                    continue;
                await mksobj_at(BOULDER, x, y, true, false, objects);
                canonicalBouldersAdded++;
            }
        }
        assert.equal(canonicalBouldersAdded, 350,
            'the reviewed canonical setup adds exactly 350 boulders');
        const remaining = [];
        for (let x = 1; x < COLNO; x++) {
            for (let y = 0; y < ROWNO; y++) {
                if (ZAP_POS(game.level.at(x, y).typ)
                    && goodpos(x, y, actor, NO_MM_FLAGS, { state: game }))
                    remaining.push([x, y]);
            }
        }
        assert.deepEqual(remaining, [], 'canonical setup must leave no legal arrival square');
        assert.equal(game.gm.migrating_mons, actor);
        const otherLevelHead = game.level.monlist;
        const otherLevelIds = chain(otherLevelHead);
        const beforeRng = gameInstance.getRngLog().slice();
        const currentLevel = { ...game.u.uz };
        assert.equal(game.unported?.has('dog.c migrate_to_level'), false,
            'the expected marker must be absent before actual losedogs entry');
        const before = {
            actorId: safe(actor.m_id),
            levelIds: chain(game.level.monlist),
            migratingIds: chain(game.gm.migrating_mons),
            failedIds: chain(game.gm.failed_arrivals),
            actor: {
                mx: actor.mx,
                my: actor.my,
                mstate: actor.mstate,
                mtrack: actor.mtrack.slice(0, 3).map((track) => ({ ...track })),
                mux: actor.mux,
                muy: actor.muy,
            },
        };
        await losedogs({ state: game });
        const after = {
            actorId: safe(actor.m_id),
            levelIds: chain(game.level.monlist),
            migratingIds: chain(game.gm.migrating_mons),
            failedIds: chain(game.gm.failed_arrivals),
            actor: {
                mx: actor.mx,
                my: actor.my,
                mstate: actor.mstate,
                mtrack: actor.mtrack.slice(0, 3).map((track) => ({ ...track })),
                mux: actor.mux,
                muy: actor.muy,
                mlstmv: actor.mlstmv,
                gridOwns: Boolean(actor.mx && actor.my
                    && m_at(actor.mx, actor.my, game) === actor),
            },
            failedListDrained: game.gm.failed_arrivals == null,
            otherLevelHeadPreserved: game.level.monlist === otherLevelHead,
            marker: (game.unported ?? new Set()).has('dog.c migrate_to_level'),
            rngCalls: gameInstance.getRngLog().length - beforeRng.length,
            inputPrompts: prompts.length,
        };

        assert.deepEqual(chain(game.gm.migrating_mons), [safe(actor.m_id)],
            `C failed-arrival migration expected; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
        assert.equal(game.level.monlist, otherLevelHead,
            `the prior level list must remain intact: ${JSON.stringify(after)}`);
        assert.deepEqual(chain(game.level.monlist), otherLevelIds);
        assert.equal(game.gm.failed_arrivals, null);
        assert.equal(actor.mstate & (MON_LIMBO | MON_MIGRATING),
            MON_LIMBO | MON_MIGRATING, JSON.stringify(after));
        assert.equal(actor.mstate & MON_STILL_ARRIVING, 0, JSON.stringify(after));
        assert.deepEqual([actor.mx, actor.my], [0, 0], JSON.stringify(after));
        assert.equal(m_at(actor.mx, actor.my, game), null, JSON.stringify(after));
        assert.deepEqual(actor.mtrack.slice(0, 3), [
            { x: MIGR_APPROX_XY, y: 0 },
            { x: 0, y: 0 },
            { x: currentLevel.dnum, y: currentLevel.dlevel },
        ], JSON.stringify(after));
        assert.deepEqual([actor.mux, actor.muy],
            [currentLevel.dnum, currentLevel.dlevel], JSON.stringify(after));
        assert.equal(actor.mlstmv, game.moves, JSON.stringify(after));
        assert.equal(after.actor.gridOwns, false);
        assert.equal(after.marker, false, JSON.stringify(after));
        assert.equal(after.rngCalls, 457, JSON.stringify(after));
    } finally {
        display.onEmptyQueue = previousOnEmptyQueue;
        assert.equal(display.onEmptyQueue, previousOnEmptyQueue);
    }
});

test('failed dog arrivals migrate off-map through source limbo transfer', async () => {
    const state = migrationState();
    state.gm.mydogs = null;
    const { follower, monster } = onMapMonster(state);
    const destinationLedger = ledger_no(CURRENT_LEVEL, state);
    await migrate_to_level(monster, destinationLedger, MIGR_EXACT_XY,
        { x: MONSTER_X, y: MONSTER_Y }, { state, newsym: () => {} });
    state.moves += 2;

    game.unported?.delete('dog.c migrate_to_level');
    await assert.doesNotReject(() => losedogs({
        state,
        random: {
            rn1: (_range, low) => low,
            rn2: () => 1,
            rnd: () => 1,
        },
    }));

    assert.equal(state.level.monlist, follower);
    assert.equal(state.gm.migrating_mons, monster);
    assert.equal(state.gm.failed_arrivals, null);
    assert.equal(m_at(0, 0, state), null);
    assert.equal(monster.mstate & (MON_LIMBO | MON_MIGRATING),
        MON_LIMBO | MON_MIGRATING);
    assert.equal(monster.mstate & MON_STILL_ARRIVING, 0);
    assert.deepEqual(monster.mtrack.slice(0, 3), [
        { x: MIGR_APPROX_XY, y: 0 },
        { x: 0, y: 0 },
        { x: CURRENT_LEVEL.dnum, y: CURRENT_LEVEL.dlevel },
    ]);
    assert.deepEqual([monster.mux, monster.muy],
        [CURRENT_LEVEL.dnum, CURRENT_LEVEL.dlevel]);
    assert.equal(monster.mlstmv, state.moves);
    assert.equal(game.unported.has('dog.c migrate_to_level'), false);
});

test('a migrating light invalidates vision after leaving the map', async () => {
    const state = migrationState();
    const { monster } = onMapMonster(state, PM_YELLOW_LIGHT);
    const events = [];

    await migrate_to_level(monster, 1, MIGR_RANDOM, null, {
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

// dog.c keepdogs() shares mon_leave() and relmon() with migrate_to_level()
// above. do.c goto_level() uses pets_only=false; end.c really_done() and
// wizcmds.c makemap_remove_mons() use pets_only=true.

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

test('keepdogs takes an adjacent pet off the level onto gm.mydogs', async () => {
    const state = migrationState();
    state.gm.mydogs = null;
    const pet = heroAdjacentMonster(state, PM_KITTEN, { mtame: 10 });

    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, pet);
    assert.equal(state.level.monlist, null);
    assert.equal(state.level.monsters[HERO_X + 1][HERO_Y], null);
    assert.deepEqual([pet.mx, pet.my], [0, 0]);
    assert.equal(pet.wormno, 0);
    assert.equal(pet.mlstmv, MIGRATION_TURN);
});

test('keepdogs leaves an ordinary monster on the level', async () => {
    const state = migrationState();
    state.gm.mydogs = null;
    // A sewer rat carries no M2_STALK, is not tame, and stands two squares
    // away, so neither the follow arm nor keep_mon_accessible() takes it.
    const { monster } = onMapMonster(state, PM_SEWER_RAT);

    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, null);
    assert.equal(state.level.monlist, monster);
    assert.deepEqual([monster.mx, monster.my], [MONSTER_X, MONSTER_Y]);
});

test('keepdogs records the partial migration of an accessible shopkeeper', async () => {
    const state = migrationState();
    state.gm.mydogs = null;
    // dog.c keep_mon_accessible():772-778. The shop is on another level, so
    // C delegates to dog.c:migrate_to_level(), which remains an explicit gap.
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.isshk = true;
    monster.mextra = { eshk: { shoplevel: { ...UPWARD_DESTINATION } } };

    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.level.monlist, monster);
    assert.equal(state.gm.migrating_mons, null);
    assert.equal(game.unported.has('dog.c migrate_to_level'), true);
});

test('keepdogs leaves a shopkeeper standing in her own shop', async () => {
    const state = migrationState();
    state.gm.mydogs = null;
    // The other side of keep_mon_accessible()'s on_level() test: a resident
    // shopkeeper is saved with her level rather than migrated.
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.isshk = true;
    monster.mextra = { eshk: { shoplevel: { ...CURRENT_LEVEL } } };

    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.level.monlist, monster);
});

test('keepdogs tries a trapped follower before deciding whether it stays', async () => {
    const state = migrationState();
    state.gm.mydogs = null;
    const pet = heroAdjacentMonster(state, PM_KITTEN,
        { mtame: 10, mtrapped: true });

    // With no trap under it, trap.c:mintrap() clears C's stale trapped bit.
    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(pet.mtrapped, 0);
    assert.equal(state.gm.mydogs, pet);
    assert.equal(state.level.monlist, null);
});

test('keepdogs leaves a follower behind while it is eating', async () => {
    const state = migrationState();
    state.gm.mydogs = null;
    const pet = heroAdjacentMonster(state, PM_KITTEN,
        { mtame: 10, meating: 3 });

    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, null);
    assert.equal(state.level.monlist, pet);
});

test('keepdogs releases a stray leash from a follower left on the level', async () => {
    // dog.c:878-881 releases a non-following leashed monster and leaves it on
    // the map. The kitten is not a follower because it is not tame.
    const state = migrationState();
    state.gm.mydogs = null;
    const leash = { otyp: LEASH, leashmon: 41, nobj: null };
    state.invent = leash;
    const monster = heroAdjacentMonster(state, PM_KITTEN,
        { mtame: 0, mleashed: true, m_id: 41 });
    const messages = [];
    await keepdogs(false, {
        message: async (line) => messages.push(line),
        newsym: () => {},
        state,
    });
    // This fixture has no hero-monster naming context, so Monnam falls back
    // to the generic neuter possessive on C's suffix branch.
    assert.deepEqual(messages, ['Its leash goes slack.']);
    assert.equal(monster.mleashed, 0);
    assert.equal(leash.leashmon, 0);
    assert.equal(state.level.monlist, monster);
});

test('keepdogs clears pet movement blockers for a pets-only transfer', async () => {
    // dog.c:798-809, reached by end.c and wizcmds.c.
    const state = migrationState();
    state.gm.mydogs = null;
    const pet = heroAdjacentMonster(state, PM_KITTEN, {
        mtame: 10,
        mtrapped: true,
        meating: 3,
        msleeping: true,
        mfrozen: 5,
        mcanmove: false,
    });

    await keepdogs(true, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, pet);
    assert.equal(pet.mtrapped, 0);
    assert.equal(pet.meating, 0);
    assert.equal(pet.msleeping, false);
    assert.equal(pet.mfrozen, 0);
    assert.equal(pet.mcanmove, true);
});

test('migration clears the trapped and undetected flags', async () => {
    // mon.c mon_leaving_level():3365 and 3384. A monster that carried either
    // flag off the map would arrive still stuck or still hidden.
    const state = migrationState();
    const { monster } = onMapMonster(state);
    monster.mtrapped = true;
    monster.mundetected = true;

    await migrate_to_level(monster, 1, MIGR_RANDOM, null,
        { newsym: () => {}, state });

    assert.equal(monster.mtrapped, 0);
    assert.equal(monster.mundetected, 0);
});

test('keepdogs reads both halves of helpless()', async () => {
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
        await keepdogs(false, { newsym: () => {}, state });
        assert.equal(Boolean(state.gm.mydogs), follows,
            `${JSON.stringify(overrides)} decides whether the pet follows`);
    }
});

test('keepdogs still takes a follower down to its last hit point', async () => {
    // dog.c:794, DEADMONSTER() is `mhp < 1`. A pet on one hit point is alive.
    const state = migrationState();
    state.gm.mydogs = null;
    const pet = heroAdjacentMonster(state, PM_KITTEN, { mtame: 10, mhp: 1 });

    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, pet);
});

test('keepdogs keeps a non-Wizard with a spoofed iswiz flag on its level', async () => {
    // The marker is retained for states outside the reviewed canonical
    // Wizard caller domain; a lone iswiz flag does not authorize migration.
    const state = migrationState();
    state.gm.mydogs = null;
    state.u.uhave = { amulet: false };
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.iswiz = true;
    // helpless() would keep him out of the follow arm whatever the amulet
    // term answered, which is the state that hides dog.c:812's conjunction.
    monster.mcanmove = true;

    game.unported?.delete('dog.c migrate_to_level');
    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.mydogs, null);
    assert.equal(state.level.monlist, monster);
    assert.equal(state.gm.migrating_mons, null);
    assert.equal(game.unported.has('dog.c migrate_to_level'), true);
});

test('keepdogs migrates the canonical distant Wizard through the original caller',
    async () => {
        const input = {
            seed: 671903,
            datetime: '20261018120000',
            nethackrc: 'OPTIONS=name:AccessibleWizard,role:Wizard,race:human,gender:male,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n',
            moves: '',
        };
        let display = null;
        let previousEmptyHandler = null;
        const moreReceipts = [];
        try {
            // This is the exact source-owned initializer/input used by the
            // retained e6fee qualification. The only added actor is the one
            // predetermined explicit-coordinate Wizard below.
            display = new GameDisplay(null);
            previousEmptyHandler = display.onEmptyQueue;
            display.onEmptyQueue = () => {
                const snapshot = {
                    topline: display.toplin,
                    serialized: display.serialize(),
                    inputQueueLength: display.inputQueueLength,
                    waitEpoch: display.waitEpoch,
                    pendingMessage: game._pending_message,
                    inputState: game.program_state?.input_state ?? null,
                };
                assert.equal(snapshot.topline, TOPLINE_NEED_MORE,
                    'only a real rendered --More-- may receive input');
                assert.ok(snapshot.serialized.includes('--More--'));
                assert.ok(moreReceipts.length < 16,
                    'acknowledge no more than 16 actual rendered More prompts');
                moreReceipts.push(snapshot);
                return 32;
            };
            const harness = new NethackGame(input);
            harness._pendingDisplay = display;
            assert.equal(await harness.start(), true);
            const state = game;
            assert.equal(state.plname, 'AccessibleWizard');
            assert.equal(state.context.ident > 0, true);
            assert.ok(state.youmonst && state.u.uprops && state.flags);
            assert.ok(state.mons[PM_WIZARD_OF_YENDOR]);

            const hero = { x: state.u.ux, y: state.u.uy, level: { ...state.u.uz } };
            const targetX = hero.x + 4;
            const targetY = hero.y;
            assert.deepEqual(hero, { x: 12, y: 7, level: { dnum: 0, dlevel: 1 } });
            assert.equal(isok(targetX, targetY), true);
            assert.equal(m_at(targetX, targetY, state), null);
            assert.equal(state.u.uhave?.amulet ?? 0, 0);
            assert.equal([state.wiz1_level, state.wiz2_level, state.wiz3_level]
                .some(level => level?.dnum === hero.level.dnum
                    && level?.dlevel === hero.level.dlevel), false);

            const template = state.mons[PM_WIZARD_OF_YENDOR];
            const wizard = await makemon_runtime(template, targetX, targetY,
                MM_NOMSG, { state });
            assert.ok(wizard, 'the canonical constructor must create the target');
            const targetId = wizard.m_id;
            const old = { x: wizard.mx, y: wizard.my };
            const oldTrack = structuredClone(wizard.mtrack.slice(0, 3));
            const oldInventory = [];
            for (let obj = wizard.minvent; obj; obj = obj.nobj) {
                oldInventory.push({ id: obj.o_id, otyp: obj.otyp, quan: obj.quan,
                    where: obj.where, no_charge: obj.no_charge, unpaid: obj.unpaid });
            }
            const ids = head => {
                const result = [];
                for (let mon = head; mon; mon = mon.nmon)
                    result.push(mon.m_id);
                return result;
            };
            const otherActorsBefore = ids(state.level.monlist)
                .filter(id => id !== targetId);
            const originalMarker = state.unported instanceof Set
                && state.unported.has('dog.c migrate_to_level');
            assert.equal(state.unported instanceof Set, true,
                'capture the actual pre-entry gap state');
            assert.equal(originalMarker, false,
                'the target-specific gap marker is absent before keepdogs');
            const rngBefore = harness.getRngLog().slice();
            const ttyBefore = {
                topline: display.toplin,
                serialized: display.serialize(),
                inputQueueLength: display.inputQueueLength,
                waitEpoch: display.waitEpoch,
                pendingMessage: state._pending_message,
                inputState: state.program_state?.input_state ?? null,
                promptCount: moreReceipts.length,
            };
            const targetBefore = {
                id: targetId, x: wizard.mx, y: wizard.my,
                iswiz: wizard.iswiz, isshk: wizard.isshk,
                wormno: wizard.wormno, appearance: wizard.m_ap_type,
                stuck: wizard === state.u.ustuck,
                mstate: wizard.mstate, mflags: wizard.mflags,
                inLevel: ids(state.level.monlist).includes(targetId),
                onMap: m_at(wizard.mx, wizard.my, state) === wizard,
                currentLevel: { ...state.u.uz },
                inventory: oldInventory,
                mtrack: oldTrack,
            };
            assert.deepEqual({
                id: targetBefore.id, x: targetBefore.x, y: targetBefore.y,
                iswiz: targetBefore.iswiz, isshk: targetBefore.isshk,
                wormno: targetBefore.wormno, appearance: targetBefore.appearance,
                stuck: targetBefore.stuck, inLevel: targetBefore.inLevel,
                onMap: targetBefore.onMap,
            }, {
                id: 134, x: 16, y: 7, iswiz: true, isshk: false,
                wormno: 0, appearance: M_AP_NOTHING, stuck: false,
                inLevel: true, onMap: true,
            });
            assert.equal((wizard.mx - hero.x) ** 2 + (wizard.my - hero.y) ** 2 >= 3,
                true);
            assert.equal(oldInventory.some(obj => obj.otyp === AMULET_OF_YENDOR),
                false);

            await keepdogs(false, { state });

            const after = {
                id: wizard.m_id,
                levelIds: ids(state.level.monlist),
                migratingIds: ids(state.gm?.migrating_mons),
                dogIds: ids(state.gm?.mydogs),
                gridActor: m_at(old.x, old.y, state)?.m_id ?? null,
                x: wizard.mx, y: wizard.my,
                mstate: wizard.mstate,
                mtrack: structuredClone(wizard.mtrack.slice(0, 3)),
                mux: wizard.mux, muy: wizard.muy,
                mlstmv: wizard.mlstmv,
                inventory: [],
                rng: harness.getRngLog().slice(),
                tty: {
                    topline: display.toplin,
                    serialized: display.serialize(),
                    inputQueueLength: display.inputQueueLength,
                    waitEpoch: display.waitEpoch,
                    pendingMessage: state._pending_message,
                    inputState: state.program_state?.input_state ?? null,
                    promptCount: moreReceipts.length,
                },
                marker: state.unported.has('dog.c migrate_to_level'),
                otherActorIds: ids(state.level.monlist)
                    .filter(id => id !== targetId),
            };
            for (let obj = wizard.minvent; obj; obj = obj.nobj) {
                after.inventory.push({ id: obj.o_id, otyp: obj.otyp,
                    quan: obj.quan, where: obj.where,
                    no_charge: obj.no_charge, unpaid: obj.unpaid });
            }
            const mismatchContext = JSON.stringify({
                before: targetBefore, after,
                hero, targetPremise: { targetX, targetY },
                originalMarker, ttyBefore, moreReceipts,
            });
            assert.ok(after.migratingIds.includes(targetId),
                `actual source-created Wizard did not migrate: ${mismatchContext}`);
            assert.equal(after.id, targetId, mismatchContext);
            assert.equal(after.levelIds.includes(targetId), false, mismatchContext);
            assert.equal(after.gridActor, null, mismatchContext);
            assert.deepEqual([after.x, after.y], [0, 0], mismatchContext);
            assert.equal(after.mstate & MON_MIGRATING, MON_MIGRATING,
                mismatchContext);
            assert.equal(after.mstate & MON_LIMBO, 0, mismatchContext);
            assert.equal(after.mstate & MON_STILL_ARRIVING, 0,
                mismatchContext);
            assert.deepEqual(after.mtrack, [
                { x: MIGR_EXACT_XY, y: 0 },
                { x: old.x, y: old.y },
                { x: hero.level.dnum, y: hero.level.dlevel },
            ], mismatchContext);
            assert.deepEqual([after.mux, after.muy],
                [hero.level.dnum, hero.level.dlevel], mismatchContext);
            assert.equal(after.mlstmv, state.moves, mismatchContext);
            assert.deepEqual(after.inventory, oldInventory, mismatchContext);
            assert.deepEqual(after.otherActorIds, otherActorsBefore,
                mismatchContext);
            assert.equal(after.marker, originalMarker, mismatchContext);
            assert.deepEqual(after.rng, rngBefore, mismatchContext);
            assert.equal(after.tty.inputQueueLength,
                ttyBefore.inputQueueLength, mismatchContext);
            assert.equal(after.tty.waitEpoch, ttyBefore.waitEpoch,
                mismatchContext);
            assert.equal(after.tty.promptCount, ttyBefore.promptCount,
                mismatchContext);
        } finally {
            if (display) display.onEmptyQueue = previousEmptyHandler;
        }
        assert.equal(display.onEmptyQueue, previousEmptyHandler,
            'restore the exact original More handler after the test');
    });

test('keepdogs retains explicit migration gaps for unsupported Wizard states',
    async () => {
        const cases = [
            ['Wizard Tower level', state => {
                state.wiz1_level = { ...CURRENT_LEVEL };
            }],
            ['unsupported disguise', (_state, monster) => {
                monster.m_ap_type = M_AP_FURNITURE;
            }],
            ['long worm', (_state, monster) => {
                monster.wormno = 1;
            }],
            ['hero-stuck actor', (state, monster) => {
                state.u.ustuck = monster;
            }],
        ];
        for (const [label, configure] of cases) {
            const state = migrationState();
            state.gm.mydogs = null;
            state.u.uhave = { amulet: 0 };
            const monster = newMonster({
                data: state.mons[PM_WIZARD_OF_YENDOR],
                mhp: 12,
                mhpmax: 12,
                mcanmove: true,
            });
            monster.iswiz = true;
            state.level.monlist = monster;
            place_monster(monster, MONSTER_X, MONSTER_Y, state);
            configure(state, monster);
            game.unported?.delete('dog.c migrate_to_level');

            await keepdogs(false, { newsym: () => {}, state });

            assert.equal(state.level.monlist, monster, label);
            assert.equal(m_at(MONSTER_X, MONSTER_Y, state), monster, label);
            assert.equal(state.gm.migrating_mons, null, label);
            assert.equal(game.unported.has('dog.c migrate_to_level'), true,
                label);
        }
    });

test('keepdogs migrates a vault guard who is away from his vault', async () => {
    // keep_mon_accessible():772-778, the isgd disjunct. Each of the three
    // mextra owners is a separate reason to stay reachable.
    const state = migrationState();
    state.gm.mydogs = null;
    const { monster } = onMapMonster(state, PM_SEWER_RAT);
    monster.isgd = true;
    monster.mextra = { egd: { gdlevel: { ...UPWARD_DESTINATION } } };

    game.unported?.delete('dog.c migrate_to_level');
    await keepdogs(false, { newsym: () => {}, state });

    assert.equal(state.gm.migrating_mons, null);
    assert.equal(state.level.monlist, monster);
    assert.equal(game.unported.has('dog.c migrate_to_level'), true);
});

test('keep_mon_accessible matches the pure Wizard and level-home branches', () => {
    const state = { u: { uz: CURRENT_LEVEL } };
    const ordinary = { iswiz: false, isshk: false, ispriest: false, isgd: false };
    assert.equal(keep_mon_accessible({ ...ordinary }, state), false);
    assert.equal(keep_mon_accessible({ ...ordinary, iswiz: true }, state), true);

    for (const [flag, home] of [
        ['isshk', { eshk: { shoplevel: UPWARD_DESTINATION } }],
        ['ispriest', { epri: { shrlevel: UPWARD_DESTINATION } }],
        ['isgd', { egd: { gdlevel: UPWARD_DESTINATION } }],
    ]) {
        const away = { ...ordinary, [flag]: true, mextra: home };
        assert.equal(keep_mon_accessible(away, state), true, `${flag} away`);
        const local = structuredClone(away);
        local.mextra = {
            [flag === 'isshk' ? 'eshk' : flag === 'ispriest' ? 'epri' : 'egd']:
                flag === 'isshk' ? { shoplevel: CURRENT_LEVEL }
                    : flag === 'ispriest' ? { shrlevel: CURRENT_LEVEL }
                        : { gdlevel: CURRENT_LEVEL },
        };
        assert.equal(keep_mon_accessible(local, state), false, `${flag} home`);
    }
});

for (const transfer of ['keepdogs', 'migrate_to_level']) {
    test(`${transfer} reveals its canonical disguised mimic before transferring it`,
    async () => {
        const input = {
            seed: 2026101805,
            datetime: '20551018050000',
            nethackrc: 'OPTIONS=name:MimicKeepdogs05,role:Wizard,race:human,gender:male,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!debug_mongen,!acoustics\n',
            moves: '',
        };
        await runSegment(input);

        const state = game;
        state.gm.mydogs = null;
        const x = state.u.ux + 1;
        const y = state.u.uy;
        const cell = state.level.at(x, y);
        assert.ok(cell, 'fixed east-adjacent cell exists');
        assert.equal(m_at(x, y, state), null);

        const boulder = mksobj_at(BOULDER, x, y, true, false, {
            state,
            hooks: {
                blockPoint: (bx, by, env) => block_point(bx, by, env.state),
            },
        });
        const mimic = await makemon_runtime(
            state.mons[PM_SMALL_MIMIC], x, y,
            NO_MINVENT | MM_ADJACENTOK | MM_NOMSG,
            { state },
        );
        assert.ok(mimic, 'canonical explicit-coordinate constructor succeeds');
        assert.ok([M_AP_OBJECT, M_AP_FURNITURE].includes(M_AP_TYPE(mimic)));
        assert.ok(is_lightblocker_mappear(mimic));
        assert.equal(m_at(x, y, state), mimic);
        assert.equal(does_block(x, y, cell, state), true);

        assert.equal(await tamedog(mimic, null, false, { state }), true);
        const sameId = mimic.m_id;
        assert.ok(mimic.mtame > 0);
        assert.notEqual(mimic.m_ap_type, M_AP_NOTHING);

        if (transfer === 'keepdogs')
            await keepdogs(false, { state });
        else
            await migrate_to_level(mimic, ledger_no(state.u.uz, state) + 1,
                MIGR_RANDOM, null, { state });

        assert.equal(transfer === 'keepdogs' ? state.gm.mydogs
            : state.gm.migrating_mons, mimic, 'the same actor joins its destination list');
        let stillOnLevel = false;
        for (let current = state.level.monlist; current; current = current.nmon)
            stillOnLevel ||= current.m_id === sameId;
        assert.equal(stillOnLevel, false, 'the transferred actor leaves monlist');
        assert.equal(m_at(x, y, state), null, 'the actor leaves its grid square');
        assert.equal(mimic.m_id, sameId);
        assert.equal(mimic.m_ap_type, M_AP_NOTHING);
        assert.equal(mimic.mappearance, 0);
        assert.equal(mimic.mx, 0);
        assert.equal(mimic.my, 0);
        assert.equal(mimic.wormno, 0);
        assert.equal(mimic.mlstmv, state.moves);
        assert.equal(state.level.objects[x][y], boulder,
            'the real floor boulder remains; this is not an unblock witness');
        assert.equal(does_block(x, y, cell, state), true,
            'the floor boulder continues to block the square');
    });
}
