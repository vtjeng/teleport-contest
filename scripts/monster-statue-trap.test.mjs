// Source-pinned trap.c coverage for trapeffect_statue_trap()'s monster arm.
// C leaves statue traps untouched when a monster reaches them and returns
// Trap_Effect_Finished; the hero arm remains behind its existing refusal.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    STATUE_TRAP,
    Trap_Effect_Finished,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { trapeffect_selector } from '../js/trap_effects.js';
import { loadMonsterStatueTrapRecipe } from './run-monster-statue-trap.mjs';

test('a monster finishes on a statue trap without activation work', async () => {
    const hero = { kind: 'hero' };
    const monster = { kind: 'monster' };
    const trap = {
        // trap.c:2279-2292 dispatches this exact trap type to the no-op arm.
        ttyp: STATUE_TRAP,
        tseen: false,
    };
    const state = { youmonst: hero };
    let unsupportedCalls = 0;

    const result = await trapeffect_selector(monster, trap, 0, {
        state,
        unsupported: () => { unsupportedCalls += 1; },
    });

    assert.equal(result, Trap_Effect_Finished,
                 'trap.c:2291 finishes the monster arm');
    assert.equal(unsupportedCalls, 0,
                 'the monster arm does not activate or refuse the trap');
    assert.equal(trap.tseen, false,
                 'the no-op arm leaves the trap state unchanged');
});

test('the selector keeps the hero statue-trap refusal', async () => {
    const hero = { kind: 'hero' };
    const trap = { ttyp: STATUE_TRAP, tseen: false };

    await assert.rejects(
        trapeffect_selector(hero, trap, 0, {
            state: { youmonst: hero },
            unsupported: (reason) => { throw new Error(reason); },
        }),
        /trap activation/u,
        'activate_statue_trap() remains outside this span',
    );
});

test('monster movement reaches the no-op through postmov', async () => {
    const [segment] = loadMonsterStatueTrapRecipe().segments;
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });

    assert.equal(boundary, null,
                 'the recorded monster route reaches its final search');
    assert.equal(replay.getScreens().length, segment.moves.length + 1,
                 'the route emits one opening screen and one per search');
    const statueTrapBit = 1 << (19 - 1);
    assert.ok(
        [...iterateMonsters()].some((monster) =>
            (monster.mtrapseen & statueTrapBit) !== 0),
        'monmove.c postmov() mintrap() records the statue-trap entry',
    );
    assert.ok(
        game.level.traps.some((trap) => trap.ttyp === STATUE_TRAP),
        'the no-op leaves the statue trap on the level',
    );
});

function* iterateMonsters() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        yield monster;
}
