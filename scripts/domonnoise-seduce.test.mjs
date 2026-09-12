import assert from 'node:assert/strict';
import test from 'node:test';

import { ECMD_TIME, MS_SEDUCE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dotalk } from '../js/sounds.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { getRngLog } from '../js/rng.js';
import {
    loadDomonnoiseSeduceRecipe,
} from './run-domonnoise-seduce.mjs';

function findNymph() {
    for (let monster = game.level.monlist; monster;
        monster = monster.nmon) {
        if (monster.data?.msound === MS_SEDUCE
            && monster.data?.mlet === 14) return monster;
    }
    throw new Error('test setup has no water nymph');
}

function directionTo(monster) {
    const dx = monster.mx - game.u.ux;
    const dy = monster.my - game.u.uy;
    return {
        '-1,-1': 'y', '0,-1': 'k', '1,-1': 'u',
        '-1,0': 'h', '1,0': 'l',
        '-1,1': 'b', '0,1': 'j', '1,1': 'n',
    }[`${dx},${dy}`];
}

async function startNymph(seed = 7710002) {
    const segment = loadDomonnoiseSeduceRecipe().segments[0];
    await runSegment({
        ...segment,
        seed,
        moves: segment.moves.slice(0, segment.moves.indexOf('#chat')),
    });
    const nymph = findNymph();
    const direction = directionTo(nymph);
    assert.ok(direction, 'the nymph must be adjacent to the hero');
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    return { nymph, direction };
}

test('MS_SEDUCE same-gender response spends time without drawing', async () => {
    const { direction } = await startNymph();
    const before = getRngLog().length;
    game.nhDisplay.pushKey(direction.charCodeAt(0));
    assert.equal(await dotalk(game), ECMD_TIME);
    assert.equal(game._ttyToplines, 'The water nymph cajoles you.');
    assert.deepEqual(getRngLog().slice(before), []);
});

test('MS_SEDUCE opposite-gender response draws rn2(3)', async () => {
    const { nymph, direction } = await startNymph();
    // The setup creates a female nymph; make the genders differ while keeping
    // the source branch's position, species and random stream unchanged.
    nymph.female = false;
    const before = getRngLog().length;
    game.nhDisplay.pushKey(direction.charCodeAt(0));
    assert.equal(await dotalk(game), ECMD_TIME);
    assert.deepEqual(getRngLog().slice(before), ['rn2(3)=1']);
    assert.equal(game._ttyToplines, 'The water nymph comes on to you.');
    assert.equal(game.gp.pline_flags, 0);
});

test('MS_SEDUCE verbal response uses the common voice tail', async () => {
    const { nymph, direction } = await startNymph(7710039);
    nymph.female = false;
    const before = getRngLog().length;
    game.nhDisplay.pushKey(direction.charCodeAt(0));
    assert.equal(await dotalk(game), ECMD_TIME);
    assert.deepEqual(getRngLog().slice(before), ['rn2(3)=2']);
    assert.equal(game._ttyToplines, '"Hello, sailor."');
    assert.equal(game.gv.voice.serialno, nymph.m_id);
    assert.equal(game.gv.voice.tone, 0);
    assert.equal(game.gv.voice.volume, 80);
    assert.equal(game.gp.pline_flags, 0);
});
