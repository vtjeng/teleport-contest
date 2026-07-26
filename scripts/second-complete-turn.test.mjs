import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
    moveloop_core,
    UnsupportedTurnBoundaryError,
} from '../js/allmain.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog } from '../js/rng.js';
import { Terminal } from '../js/terminal.js';
import {
    loadSecondCompleteTurnFixture,
    loadSecondCompleteTurnRecipe,
    SECOND_COMPLETE_TURN_FIXTURE,
} from './run-second-complete-turn.mjs';

const DATETIME = '20260725120000';
// Canonical America/New_York recordings for both fixture dates are in DST.
// Supplying the recorded bit keeps this test independent of the host timezone.
const RECORDER_IS_DST = true;
const RNG_CALL = /^(?:\d+\s+)?(?:rn2|rnd|rn1|rne|rnl|rnz|d)\(/u;

function linkedObjects(head, link) {
    const objects = [];
    for (let object = head; object; object = object[link]) {
        const copy = {
            ...object,
            cobj: linkedObjects(object.cobj, 'nobj'),
            v: object.v?.o_id
                ? { objectId: object.v.o_id }
                : (object.v?.m_id ? { monsterId: object.v.m_id } : null),
        };
        delete copy[link];
        objects.push(structuredClone(copy));
    }
    return objects;
}

function liveMonsters() {
    const monsters = [];
    for (let monster = game.level.monlist;
        monster;
        monster = monster.nmon) {
        const copy = {
            ...monster,
            data: monster.data?.pmidx ?? null,
            minvent: linkedObjects(monster.minvent, 'nobj'),
        };
        delete copy.nmon;
        monsters.push(structuredClone(copy));
    }
    return monsters;
}

function rngContext() {
    return {
        a: game.coreCtx.a,
        b: game.coreCtx.b,
        c: game.coreCtx.c,
        m: [...game.coreCtx.m],
        n: game.coreCtx.n,
        r: [...game.coreCtx.r],
    };
}

function normalizedRngLog() {
    return getRngLog()
        .map((entry) => String(entry)
            .replace(/^\d+\s+/u, '')
            .replace(/\s*@\s.*$/u, '')
            .trim())
        .filter((entry) => RNG_CALL.test(entry));
}

function schedulerSnapshot() {
    return {
        purgeMonsters: game.iflags?.purge_monsters ?? null,
        somebodyCanMove: game.somebody_can_move ?? null,
        visionFullRecalc: game.vision_full_recalc ?? null,
    };
}

function completeTurnSnapshot(replay) {
    return {
        context: structuredClone(game.context),
        display: {
            cursor: [
                game.nhDisplay.cursorCol,
                game.nhDisplay.cursorRow,
                game.nhDisplay.cursorVisible,
            ],
            grid: structuredClone(game.nhDisplay.grid),
            messages: [...game.nhDisplay.messages],
            pending: game._pending_message,
            topMessage: game.nhDisplay.topMessage,
            toplin: game.nhDisplay.toplin,
            toplines: game.nhDisplay.toplines,
            ttyToplines: game._ttyToplines,
        },
        gg: structuredClone(game.gg),
        hero: structuredClone(game.u),
        input: {
            queue: [...(game.nhDisplay.terminal._inputQueue ?? [])],
            waitEpoch: game.nhDisplay.waitEpoch,
            waiting: game.nhDisplay.isWaitingForInput,
        },
        monsters: liveMonsters(),
        output: {
            animations: structuredClone(
                replay.getAnimationFramesByStep(),
            ),
            cursors: structuredClone(replay.getCursors()),
            rngSlices: structuredClone(replay.getRngSlices()),
            screens: [...replay.getScreens()],
        },
        rng: {
            context: rngContext(),
            log: [...getRngLog()],
        },
        scheduler: schedulerSnapshot(),
        track: structuredClone(game.track),
        turn: {
            cmdKey: game.cmdKey,
            commandDispatchCount: game._commandDispatchCount,
            domoveAttempting: game.domoveAttempting,
            heroSeq: game.hero_seq ?? null,
            multi: game.multi,
            moves: game.moves,
        },
        world: {
            buriedObjects: linkedObjects(
                game.level.buriedobjlist,
                'nobj',
            ),
            flags: structuredClone(game.level.flags),
            heroInventory: linkedObjects(game.invent, 'nobj'),
            locations: structuredClone(game.level.locations),
            monsterGrid: game.level.monsters.map(
                (column) => column.map(
                    (monster) => monster?.m_id ?? 0,
                ),
            ),
            objectGrid: game.level.objects.map(
                (column) => column.map(
                    (object) => object?.o_id ?? 0,
                ),
            ),
            objects: linkedObjects(game.level.objlist, 'nobj'),
            regions: structuredClone(game.level.regions),
            traps: structuredClone(game.level.traps),
            vision: game.viz_array.map((row) => [...row]),
        },
    };
}

function heroTrackOracle() {
    const track = game.track;
    const newestFirst = [];
    let index = track.utpnt;
    for (let remaining = track.utcnt; remaining > 0; --remaining) {
        index = index === 0 ? track.utrack.length - 1 : index - 1;
        newestFirst.push({ ...track.utrack[index] });
    }
    return {
        count: track.utcnt,
        nextIndex: track.utpnt,
        newestFirst,
    };
}

function digest(value) {
    const json = JSON.stringify(value, (_key, item) => (
        typeof item === 'bigint' ? `${item}n` : item
    ));
    return createHash('sha256').update(json).digest('hex');
}

function semanticMonster(monster) {
    return {
        id: monster.m_id,
        movement: monster.movement,
        mx: monster.mx,
        my: monster.my,
        pmidx: monster.data,
    };
}

function integrationOracle(replay) {
    const monsters = liveMonsters();
    const pet = monsters.find((monster) => monster.mtame);
    const rng = normalizedRngLog();
    return {
        hero: {
            hunger: game.u.uhunger,
            movement: game.u.umovement,
            x: game.u.ux,
            y: game.u.uy,
        },
        heroTrack: heroTrackOracle(),
        monsterCount: monsters.length,
        pet: pet ? semanticMonster(pet) : null,
        scheduler: schedulerSnapshot(),
        stateDigest: digest(completeTurnSnapshot(replay)),
        turn: {
            commandDispatchCount: game._commandDispatchCount,
            heroSeq: game.hero_seq ?? null,
            moves: game.moves,
        },
        output: {
            cursors: structuredClone(replay.getCursors()),
            messages: [...game.nhDisplay.messages],
            rngCount: rng.length,
            rngDigest: digest(rng),
            screenCount: replay.getScreens().length,
            screenDigest: digest(replay.getScreens()),
        },
    };
}

async function withSerializedGrids(action) {
    const previous = Terminal.prototype.serialize;
    Terminal.prototype.serialize = function serializeGridForTest() {
        return JSON.stringify(this.grid);
    };
    try {
        return await action();
    } finally {
        if (previous) Terminal.prototype.serialize = previous;
        else delete Terminal.prototype.serialize;
    }
}

test('second-turn fresh recipe contains only simple replay inputs', () => {
    const fixture = loadSecondCompleteTurnFixture();
    const recipe = loadSecondCompleteTurnRecipe();
    assert.equal(fixture.version, 2);
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 13);
    assert.equal(fixture.expectations.length, recipe.segments.length);
    assert.deepEqual(
        new Set(recipe.segments.map(({ moves }) => moves)),
        new Set([
            ' ..',
            ' .h',
            ' h.',
            ' hh',
            ' .j',
            ' .l',
            ' l.',
            ' nn',
            ' k.',
        ]),
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // The leading space dismisses startup; the remaining two characters
        // are exactly the two time-consuming commands under test.
        assert.match(segment.moves, /^ [hjklyubn.]{2}$/u);
    }
    assert.match(
        SECOND_COMPLETE_TURN_FIXTURE,
        /second-complete-turn\.session\.json$/u,
    );
});

test('all checked-in second-turn cases reach their exact prompt state',
    async () => {
        const { expectations, recipe } = loadSecondCompleteTurnFixture();
        await withSerializedGrids(async () => {
            for (let index = 0; index < recipe.segments.length; ++index) {
                const replay = await runSegment({
                    ...recipe.segments[index],
                    recorderIsDst: RECORDER_IS_DST,
                });
                // Each literal oracle belongs to this replay-input recipe
                // after its strict fresh C differential passed. Explicit
                // fields explain the turn case; the digests pin the complete
                // state, PRNG stream, and every 24x80 cell and attribute.
                assert.deepEqual(
                    integrationOracle(replay),
                    expectations[index].oracle,
                    expectations[index].name,
                );
            }
        });
    });

test('an excluded selected trap remains completely retryable',
    async () => {
        const input = {
            // This source-derived seed selects an initial monster move onto a
            // trap during the second elapsed phase.
            seed: 840003,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:TrapBoundary,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen',
            moves: ' ..',
            recorderIsDst: RECORDER_IS_DST,
        };
        await withSerializedGrids(async () => {
            const replay = await runSegment(input);
            assert.equal(replay.getScreens().length, 3);
            const beforeRetry = completeTurnSnapshot(replay);

            for (let attempt = 0; attempt < 2; ++attempt) {
                await assert.rejects(
                    moveloop_core(),
                    (error) => error instanceof UnsupportedTurnBoundaryError
                        && error.reason === 'trap activation',
                );
                assert.deepEqual(
                    completeTurnSnapshot(replay),
                    beforeRetry,
                    `retry ${attempt + 1} changed state or retained output`,
                );
            }
        });
    });
