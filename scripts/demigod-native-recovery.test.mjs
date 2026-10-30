import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { intervene } from '../js/wizard.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { mondead } from '../js/mon.js';
import { PM_WIZARD_OF_YENDOR, PM_SEWER_RAT } from '../js/monsters.js';
import { MM_NOMSG } from '../js/const.js';
import { finishElapsedTurn, moveloop_core } from '../js/allmain.js';
import { d, rn1, rn2, rnd, rne, rnl, rnz } from '../js/rng.js';

async function initializedAfterDeath(wizard) {
    await runSegment({seed: 671903, datetime: '20261018120000',
        nethackrc: 'OPTIONS=name:Demigod,role:Wizard,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n', moves: ''});
    const monster = await makemon_runtime(game.mons[wizard ? PM_WIZARD_OF_YENDOR : PM_SEWER_RAT],
        game.u.ux + 4, game.u.uy, MM_NOMSG, {state: game});
    assert.ok(monster);
    await mondead(monster, game, {random: {d, rn2, rnd, rne, rnl, rnz,
        rn1: (n, b) => n === 250 && b === 50 ? 50 : rn1(n, b)}});
    assert.equal(Boolean(game.u.uevent.udemigod), wizard);
    assert.equal(game.context.no_of_wizards ?? 0, 0);
    if (wizard) assert.equal(game.u.udg_cnt, 50);
}

for (const wizard of [true, false]) {
    test(`elapsed timer after production death path, Wizard=${wizard}`, async () => {
        await initializedAfterDeath(wizard);
        const count = game.u.udg_cnt;
        await finishElapsedTurn(game, {d, rn1, rn2, rnd, rne, rnl, rnz});
        assert.equal(game.u.udg_cnt, wizard ? count - 1 : count);
    });
}

test('fifty elapsed turns reach intervention without injecting timer or demigod flags', async () => {
    await initializedAfterDeath(true);
    const selected = [];
    for (let turn = 0; turn < 50; turn++) {
        for (let i = 0; i < 4; i++) game.nhDisplay.pushKey(32);
        await finishElapsedTurn(game, {
            d, rnd, rne, rnl, rnz,
            rn2: n => n === 6 ? (selected.push('intervene'), 1) : rn2(n),
            rn1: (n, b) => n === 200 && b === 50 ? (selected.push('renew'), 123) : rn1(n, b),
        });
        if (turn < 49) assert.equal(game.u.udg_cnt, 49 - turn);
    }
    assert.deepEqual(selected, ['intervene', 'renew']);
    assert.equal(game.u.udg_cnt, 123);
});

for (const elapsed of [0, 49]) {
    test(`planned/live input after ${elapsed} elapsed turns consumes timer once`, async () => {
        await initializedAfterDeath(true);
        const initialMoves = game.moves;
        for (let i = 0; i < 300; i++) game.nhDisplay.pushKey('.'.charCodeAt(0));
        for (let i = 0; i < 150 && game.moves < initialMoves + elapsed; i++)
            await moveloop_core();
        assert.equal(game.moves, initialMoves + elapsed);
        assert.equal(Boolean(game.program_state.gameover), false);
        const before = game.moves;
        const count = game.u.udg_cnt;
        for (let i = 0; i < 4; i++) game.nhDisplay.pushKey('.'.charCodeAt(0));
        for (let i = 0; i < 20; i++) game.nhDisplay.pushKey(32);
        for (let i = 0; i < 3 && game.moves === before; i++) await moveloop_core();
        assert.equal(game.moves, before + 1);
        if (count > 1) assert.equal(game.u.udg_cnt, count - 1);
        else assert.ok(game.u.udg_cnt >= 50 && game.u.udg_cnt < 250);
    });
}

for (const arm of [0, 1, 2, 3, 4, 5]) {
    test(`intervention dispatch arm ${arm} retains source order`, async () => {
        await initializedAfterDeath(true);
        const effects = [];
        await intervene(game, {
            random: {rn2: n => { assert.equal(n, 6); effects.push('select'); return arm; }},
            message: async line => effects.push(line),
            rndcurse: async () => effects.push('curse'),
            nasty: async () => effects.push('summon'),
            resurrect: async () => effects.push('resurrect'),
        });
        const expected = [
            ['You feel vaguely nervous.'], ['You feel vaguely nervous.'],
            ['You notice a black glow surrounding you.', 'curse'], [], ['summon'], ['resurrect'],
        ][arm];
        assert.deepEqual(effects, ['select', ...expected]);
    });
}
