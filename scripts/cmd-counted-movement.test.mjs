import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

const BASE_OPTIONS = [
    '!legacy', '!tutorial', '!splash_screen', 'pettype:none',
].join(',');

async function runCounted({ seed, name, role, race, gender, align, count, key }) {
    return runSegment({
        seed,
        datetime: '20260814101500',
        nethackrc: [
            `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},align:${align}`,
            `OPTIONS=${BASE_OPTIONS}`,
            '',
        ].join('\n'),
        moves: ` ${count}${key}`,
    });
}

async function runBare({ seed, name, role, race, gender, align, key, count }) {
    return runSegment({
        seed,
        datetime: '20260814101500',
        nethackrc: [
            `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},align:${align}`,
            `OPTIONS=${BASE_OPTIONS}`,
            '',
        ].join('\n'),
        moves: ` ${key.repeat(count)}`,
    });
}

test('rhack admits a counted walk to the source movement arm', async () => {
    // cmd.c parse():5142-5144 spends one repeat on the initial h and leaves
    // gm.multi at 2. cmd.c rhack():3785 dispatches the MOVEMENTCMD arm to
    // domove(), and the already wired allmain.c moveloop_core():515-531
    // repeats that movement without reading another input byte. The repeated
    // path must therefore match three bare h actions in game state and RNG
    // while dispatching only the first input byte.
    const counted = await runCounted({
        seed: 840021,
        name: 'CountWalkA',
        role: 'Healer',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        count: 3,
        key: 'h',
    });
    const countedState = {
        moves: game.moves,
        heroSeq: game.hero_seq,
        position: [game.u.ux, game.u.uy],
        multi: game.multi,
        dispatches: game._commandDispatchCount,
    };

    const bare = await runBare({
        seed: 840021,
        name: 'CountWalkA',
        role: 'Healer',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        count: 3,
        key: 'h',
    });
    assert.deepEqual(counted.getRngLog(), bare.getRngLog());
    assert.deepEqual(
        [game.moves, game.hero_seq, [game.u.ux, game.u.uy], game.multi],
        [countedState.moves, countedState.heroSeq, countedState.position, countedState.multi],
    );
    assert.equal(countedState.dispatches, 1);
    assert.equal(game._commandDispatchCount, 3);
});

test('rhack admits an independent counted walk direction', async () => {
    // A changed seed, role, race, direction, and count reaches the same source
    // repeat seam through a different map path; this is not a duplicate hero
    // setup or a fixed-session input.
    const counted = await runCounted({
        seed: 840031,
        name: 'CountWalkB',
        role: 'Valkyrie',
        race: 'dwarf',
        gender: 'male',
        align: 'lawful',
        count: 4,
        key: 'l',
    });
    const countedState = {
        moves: game.moves,
        heroSeq: game.hero_seq,
        position: [game.u.ux, game.u.uy],
        multi: game.multi,
        dispatches: game._commandDispatchCount,
    };
    const bare = await runBare({
        seed: 840031,
        name: 'CountWalkB',
        role: 'Valkyrie',
        race: 'dwarf',
        gender: 'male',
        align: 'lawful',
        count: 4,
        key: 'l',
    });
    assert.deepEqual(counted.getRngLog(), bare.getRngLog());
    assert.deepEqual(
        [game.moves, game.hero_seq, [game.u.ux, game.u.uy], game.multi],
        [countedState.moves, countedState.heroSeq, countedState.position, countedState.multi],
    );
    assert.equal(countedState.dispatches, 1);
    assert.equal(game._commandDispatchCount, 4);
});

test('rhack admits a counted control rush through the source binding', async () => {
    // cmd.c reset_commands() binds Ctrl-Y (0x19) to the northwest rush row
    // because the vi direction order puts y at northwest.  parse() spends
    // one repeat on that MOVEMENTCMD byte, and rhack() must dispatch the
    // rushnorthwest handler with run=3 rather than treating Ctrl-Y as count
    // editing or as an unbound control byte.
    const counted = await runCounted({
        seed: 840061,
        name: 'CountRush',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'lawful',
        count: 3,
        key: '\x19',
    });
    assert.equal(game.u.dx, -1);
    assert.equal(game.u.dy, -1);
    assert.equal(game._commandDispatchCount, 1);
    // This independently seeded setup produces the exact source-aligned RNG
    // prefix and final position for the three rush moves.
    assert.equal(counted.getRngLog().length, 4683);
    assert.deepEqual([game.u.ux, game.u.uy], [50, 4]);
    assert.equal(game.hero_seq, 17);
});
