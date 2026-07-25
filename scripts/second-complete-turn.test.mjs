import assert from 'node:assert/strict';
import test from 'node:test';

import {
    moveloop_core,
    UnsupportedTurnBoundaryError,
} from '../js/allmain.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LITTLE_DOG } from '../js/monsters.js';
import { getRngLog } from '../js/rng.js';
import {
    loadSecondCompleteTurnRecipe,
    SECOND_COMPLETE_TURN_FIXTURE,
} from './run-second-complete-turn.mjs';

const DATETIME = '20260725120000';

function liveMonsters() {
    const monsters = [];
    for (let monster = game.level.monlist;
        monster;
        monster = monster.nmon) {
        monsters.push(monster);
    }
    return monsters;
}

function retrySnapshot() {
    return {
        commandDispatchCount: game._commandDispatchCount,
        context: {
            mon_moving: game.context.mon_moving,
            move: game.context.move,
        },
        hero: {
            hunger: game.u.uhunger,
            movement: game.u.umovement,
            x: game.u.ux,
            y: game.u.uy,
        },
        heroSeq: game.hero_seq,
        monsters: liveMonsters().map((monster) => ({
            id: monster.m_id,
            movement: monster.movement,
            mx: monster.mx,
            my: monster.my,
            mux: monster.mux,
            muy: monster.muy,
        })),
        moves: game.moves,
        queueLength: game.nhDisplay.inputQueueLength,
        rngContext: {
            a: game.coreCtx.a,
            b: game.coreCtx.b,
            c: game.coreCtx.c,
            m: [...game.coreCtx.m],
            n: game.coreCtx.n,
            r: [...game.coreCtx.r],
        },
        rngLog: [...getRngLog()],
    };
}

test('second-turn fresh recipe contains only simple replay inputs', () => {
    const recipe = loadSecondCompleteTurnRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 11);
    assert.deepEqual(
        new Set(recipe.segments.map(({ moves }) => moves)),
        new Set([' ..', ' .h', ' h.', ' hh', ' .j', ' l.', ' nn']),
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

test('two clear walks reach the prompt after the second command', async () => {
    const replay = await runSegment({
        seed: 2026072001,
        datetime: DATETIME,
        nethackrc: 'OPTIONS=name:TwoClearWalks,role:Ranger,race:elf,'
            + 'gender:male,align:chaotic,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: ' hh',
    });

    assert.equal(game.moves, 3);
    // moves * 8 plus the completed hero action is allmain.c's sequence value.
    assert.equal(game.hero_seq, 25);
    assert.equal(game.u.uhunger, 898);
    assert.equal(game._commandDispatchCount, 3);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.equal(replay.getScreens().length, 4);
    assert.equal(replay.getCursors().length, 4);
});

test('a starting dog takes its ordinary second-turn action', async () => {
    await runSegment({
        seed: 2026072201,
        datetime: DATETIME,
        nethackrc: 'OPTIONS=name:DogSecondTurn,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:dog',
        moves: ' .j',
    });

    const dog = liveMonsters().find(
        (monster) => monster.data.pmidx === PM_LITTLE_DOG,
    );
    assert.ok(dog);
    assert.deepEqual([dog.mx, dog.my], [42, 14]);
    // The speed-18 dog spends 12, then receives its next speed-18 ration.
    assert.equal(dog.movement, 24);
    assert.equal(game.moves, 3);
    assert.equal(game.hero_seq, 25);
    assert.equal(game.u.uhunger, 898);
});

test('an excluded selected trap remains retryable at the live boundary',
    async () => {
        const input = {
            seed: 840003,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:TrapBoundary,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen',
            moves: ' ..',
        };
        const replay = await runSegment(input);
        assert.equal(replay.getScreens().length, 3);
        const beforeRetry = retrySnapshot();

        await assert.rejects(
            moveloop_core(),
            (error) => error instanceof UnsupportedTurnBoundaryError
                && error.reason === 'trap activation',
        );

        assert.deepEqual(retrySnapshot(), beforeRetry);
    });
