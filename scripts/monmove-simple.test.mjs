import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    preflightSimpleMonsterActions,
    UnsupportedSimpleMonsterActionError,
} from '../js/monmove_simple.js';

const DATETIME = '20260725120000';

function rngSnapshot() {
    return {
        a: game.coreCtx.a,
        b: game.coreCtx.b,
        c: game.coreCtx.c,
        n: game.coreCtx.n,
        m: [...game.coreCtx.m],
        r: [...game.coreCtx.r],
    };
}

function monsterSnapshot() {
    const monsters = [];
    for (let monster = game.level.monlist;
        monster;
        monster = monster.nmon) {
        monsters.push({
            id: monster.m_id,
            movement: monster.movement,
            mx: monster.mx,
            my: monster.my,
            mux: monster.mux,
            muy: monster.muy,
            sleeping: monster.msleeping,
            strategy: monster.mstrategy,
            track: monster.mtrack.map((position) => ({ ...position })),
            goal: monster.mgoal ? { ...monster.mgoal } : null,
            petGoal: monster.mextra?.edog?.ogoal
                ? { ...monster.mextra.edog.ogoal } : null,
        });
    }
    return monsters;
}

function preflightSnapshot() {
    return {
        gg: { ...game.gg },
        monsters: monsterSnapshot(),
        rng: rngSnapshot(),
        hero: {
            movement: game.u.umovement,
            x: game.u.ux,
            y: game.u.uy,
        },
    };
}

test('simple preflight plans a starting-dog action without live mutation',
    async () => {
        await runSegment({
            seed: 2026072201,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:Pet2026072201,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:dog',
            moves: ' .',
        });
        const before = preflightSnapshot();

        await preflightSimpleMonsterActions(game);

        assert.deepEqual(preflightSnapshot(), before);
    });

test('simple preflight rejects a selected trap without live mutation',
    async () => {
        await runSegment({
            seed: 840003,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:BoundaryStop,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen',
            moves: ' .',
        });
        const before = preflightSnapshot();

        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'trap activation',
        );

        assert.deepEqual(preflightSnapshot(), before);
    });
