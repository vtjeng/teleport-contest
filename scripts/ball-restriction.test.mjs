import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {punish} from '../js/read.js';
import {SCR_PUNISHMENT} from '../js/objects.js';
import {OBJ_FREE, OBJ_FLOOR} from '../js/const.js';
import {clearTtyMessageWindow} from '../js/tty_message.js';
import {done_object_cleanup} from '../js/end.js';
import {placebc, unplacebc, unplacebc_and_covet_placebc, lift_covet_and_placebc} from '../js/ball.js';

async function fixture() {
    await runSegment({seed: 8430170, datetime: '20261024010000', moves: '',
        nethackrc: 'OPTIONS=name:Restriction,role:Healer,race:human,gender:male,align:neutral,playmode:debug,pettype:none,!legacy,!tutorial,!splash_screen,!acoustics,!debug_mongen\n'});
    clearTtyMessageWindow(game);
    await punish({otyp: SCR_PUNISHMENT}, game, {message: async () => {}});
}

test('ball restriction owns extraction and rejects ordinary, nested and wrong-pin placement', async () => {
    await fixture();
    const draws = [];
    const env = {random: {rnd: n => { draws.push(n); return 137; }}};
    const pin = unplacebc_and_covet_placebc(game, env);
    assert.equal(pin, 137);
    assert.deepEqual(draws, [400]);
    assert.equal(game.uball.where, OBJ_FREE);
    assert.equal(game.uchain.where, OBJ_FREE);
    await placebc(game);
    unplacebc(game);
    assert.equal(unplacebc_and_covet_placebc(game, env), 0);
    await lift_covet_and_placebc(pin + 1, game);
    assert.deepEqual(draws, [400]);
    assert.equal(game.bcrestriction, pin);
    assert.equal(game.uchain.where, OBJ_FREE);
    await lift_covet_and_placebc(pin, game);
    assert.equal(game.bcrestriction, 0);
    assert.equal(game.uball.where, OBJ_FLOOR);
    assert.equal(game.uchain.where, OBJ_FLOOR);
    assert.equal(game.level.objects[game.u.ux][game.u.uy], game.uchain);
});

test('end cleanup overrides a held restriction and awaits ball and chain replacement', async () => {
    await fixture();
    unplacebc_and_covet_placebc(game, {random: {rnd: () => 239}});
    await done_object_cleanup(game);
    assert.equal(game.bcrestriction, 0);
    assert.equal(game.uball.where, OBJ_FLOOR);
    assert.equal(game.uchain.where, OBJ_FLOOR);
    assert.equal(game.level.objects[game.u.ux][game.u.uy], game.uchain);
});

test('unrestricted ordinary transit remains valid and a new game resets restriction', async () => {
    await fixture();
    unplacebc(game);
    await lift_covet_and_placebc(81, game);
    assert.equal(game.uchain.where, OBJ_FLOOR);
    unplacebc_and_covet_placebc(game, {random: {rnd: () => 71}});
    await fixture();
    assert.equal(game.bcrestriction, 0);
    assert.equal(game.uchain.where, OBJ_FLOOR);
});
