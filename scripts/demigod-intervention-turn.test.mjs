import assert from 'node:assert/strict';
import test from 'node:test';

import { finishElapsedTurn, moveloop_core } from '../js/allmain.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { d, getRngLog, rn1, rn2, rnd, rne, rnz } from '../js/rng.js';
import { msghistory_snapshot, free_msghistory_snapshot } from '../js/topl.js';
import { intervene } from '../js/wizard.js';

async function nearIntervention(demigod) {
    await runSegment({
        seed: 16026,
        datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:InterveneAudit,role:Wizard,race:human,'
            + 'gender:female,align:neutral,pettype:none,!legacy,!tutorial,'
            + '!splash_screen\n',
        moves: '',
    });
    // C wizard.c:wizdeadorgone() establishes udemigod and a 50..299 turn
    // countdown. Two is an ordinary reachable countdown value near expiry.
    game.u.uevent.udemigod = demigod;
    game.u.udg_cnt = 2;
    return game.moves;
}

test('target: ordinary demigod upkeep advances the intervention countdown', async () => {
    const before = await nearIntervention(true);
    await finishElapsedTurn(game, { rn1, rn2, rnd });
    assert.equal(game.moves, before + 1);
    // C allmain.c:361-367 decrements even before intervention is due.
    assert.equal(game.u.udg_cnt, 1);
});

test('control: a hero who is not a demigod leaves that countdown inert', async () => {
    const before = await nearIntervention(false);
    await finishElapsedTurn(game, { rn1, rn2, rnd });
    assert.equal(game.moves, before + 1);
    assert.equal(game.u.udg_cnt, 2);
});

test('due demigod intervention emits the selected C message and renews its timer', async () => {
    await nearIntervention(true);
    game.u.udg_cnt = 1;
    for (let i = 0; i < 8; i++) game.nhDisplay.pushKey(32);
    const draws = [];
    await finishElapsedTurn(game, {
        rnd,
        rn2(bound) {
            if (bound === 6) {
                draws.push('rn2(6)');
                return 1; // wizard.c:intervene()'s nervousness arm
            }
            return rn2(bound);
        },
        rn1(range, base) {
            if (range === 200 && base === 50) {
                draws.push('rn1(200,50)');
                return 123;
            }
            return rn1(range, base);
        },
    });
    const messages = (msghistory_snapshot(false, game) ?? []).join('\n');
    free_msghistory_snapshot(false, game);
    assert.deepEqual(draws, ['rn2(6)', 'rn1(200,50)']);
    assert.equal(game.u.udg_cnt, 123);
    assert.ok(messages.includes('You feel vaguely nervous.'));
});

test('control: invulnerability defers an already due intervention', async () => {
    await nearIntervention(true);
    game.u.udg_cnt = 1;
    game.u.uinvulnerable = true;
    await finishElapsedTurn(game, { rn1, rn2, rnd });
    assert.equal(game.u.udg_cnt, 1);
});

for (const arm of [0, 1, 2, 3, 4, 5]) {
    test(`wizard.c intervention arm ${arm} preserves selection and effect order`, async () => {
        await nearIntervention(true);
        const effects = [];
        await intervene(game, {
            random: {
                rn2(bound) {
                    effects.push(`rn2(${bound})`);
                    assert.equal(bound, 6);
                    return arm;
                },
            },
            message: async line => effects.push(line),
            rndcurse: async () => effects.push('rndcurse'),
            nasty: async () => effects.push('nasty'),
            resurrect: async () => effects.push('resurrect'),
        });
        const expected = [
            'You feel vaguely nervous.',
            'You feel vaguely nervous.',
            'You notice a black glow surrounding you.',
            null,
            'nasty',
            'resurrect',
        ][arm];
        assert.deepEqual(effects, [
            'rn2(6)',
            ...(expected ? [expected] : []),
            ...(arm === 2 ? ['rndcurse'] : []),
        ]);
    });
}

test('Astral intervention selects only the four middle arms', async () => {
    await nearIntervention(true);
    const oldLevel = game.u.uz;
    const oldAstral = game.astral_level;
    game.astral_level = { dnum: 17, dlevel: 1 };
    game.u.uz = { dnum: 17, dlevel: 1 };
    const effects = [];
    try {
        await intervene(game, {
            random: {
                rnd(bound) {
                    effects.push(`rnd(${bound})`);
                    assert.equal(bound, 4);
                    return 1;
                },
            },
            message: async line => effects.push(line),
        });
        assert.deepEqual(effects, ['rnd(4)', 'You feel vaguely nervous.']);
    } finally {
        game.u.uz = oldLevel;
        game.astral_level = oldAstral;
    }
});

for (const arm of [4, 5]) {
    test(`live intervention arm ${arm} uses real monster creation`, async () => {
        await nearIntervention(true);
        for (let i = 0; i < 50; i++) game.nhDisplay.pushKey(32);
        const monstersBefore = [...iterateMonsters(game.level.monlist)].length;
        let selected = false;
        await intervene(game, {
            random: {
                d, rn1, rnd, rne, rnz,
                rn2(bound) {
                    if (!selected && bound === 6) {
                        selected = true;
                        return arm;
                    }
                    return rn2(bound);
                },
            },
        });
        assert.equal(selected, true);
        if (arm === 5) {
            assert.equal(game.context.no_of_wizards, 1);
            assert.ok([...iterateMonsters(game.level.monlist)].some(mon => mon.iswiz));
        } else {
            assert.ok([...iterateMonsters(game.level.monlist)].length > monstersBefore);
        }
    });
}

function* iterateMonsters(head) {
    for (let monster = head; monster; monster = monster.nmon)
        yield monster;
}

for (const count of [2, 1]) {
    test(`planned and live elapsed upkeep apply countdown ${count} once`, async () => {
        const before = await nearIntervention(true);
        game.u.udg_cnt = count;
        game.u.umovement = 12;
        game.context.move = 1;
        game.context.seer_turn = 100000;
        game.context.next_attrib_check = 100000;
        game.nhDisplay.pushKey('.'.charCodeAt(0));
        for (let i = 0; i < 20; i++) game.nhDisplay.pushKey(32);
        const rngBefore = getRngLog().length;
        await moveloop_core();
        const calls = getRngLog().slice(rngBefore);
        assert.equal(game.moves, before + 1);
        if (count === 2) {
            assert.equal(game.u.udg_cnt, 1);
            assert.equal(calls.filter(call => call.startsWith('rn2(6)')).length, 0);
        } else {
            assert.equal(game.u.udg_cnt, 190);
            assert.deepEqual(calls.filter(call => call.startsWith('rn2(6)')),
                ['rn2(6)=2']);
            assert.equal(calls.at(-1), 'rn2(200)=140');
        }
    });
}
