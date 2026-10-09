import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OBJ_DELETED, STRANGLED, W_AMUL } from '../js/const.js';
import { _doWearInternals } from '../js/do_wear.js';
import { game } from '../js/gstate.js';
import { addinv } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import { AMULET_OF_REFLECTION, AMULET_OF_STRANGULATION } from '../js/objects.js';
import { fix_worst_trouble, TROUBLE_STRANGLED } from '../js/pray.js';
import { getRngLog } from '../js/rng.js';

const cSource = readFileSync('nethack-c/upstream/src/pray.c', 'utf8');
const jsSource = readFileSync('js/pray.js', 'utf8');
async function hero() {
    // An independent Valkyrie supplies ordinary worn-slot and inventory state.
    await runSegment({ seed: 15820017, datetime: '20370817202931', moves: '',
        nethackrc: 'OPTIONS=name:Breathing,role:Valkyrie,race:human,gender:female,align:lawful,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!acoustics\n' });
    // Spaces acknowledge message windows; they are not game commands here.
    for (let i = 0; i < 40; ++i) game.nhDisplay.pushKey(32);
    return game;
}
async function wear(type, state) {
    const amulet = mksobj(type, false, false, { state });
    addinv(amulet, { state });
    await _doWearInternals.Amulet_on(amulet, state);
    assert.equal(state.uamul, amulet);
    assert.equal(amulet.owornmask & W_AMUL, W_AMUL);
    return amulet;
}

test('prayer preserves the source strangulation consumption order', () => {
    const arm = cSource.split('case TROUBLE_STRANGLED:')[1].split('case TROUBLE_LAVA:')[0];
    assert.match(arm, /Your\("amulet vanishes!"\);\s*useup\(uamul\);/u);
    assert.match(arm, /You\("can breathe again\."\);\s*Strangled = 0;\s*disp\.botl = TRUE;/u);
    const jsArm = jsSource.split('case TROUBLE_STRANGLED:')[1].split('case TROUBLE_LAVA:')[0];
    assert.match(jsArm, /await ttyPline\('Your amulet vanishes!', state\);[\s\S]*?await useup\(state\.uamul,/u);
    assert.doesNotMatch(jsArm, /note_unported/u);
});

test('prayer consumes the cursed worn amulet through canonical inventory and worn owners', async () => {
    const state = await hero();
    const amulet = await wear(AMULET_OF_STRANGULATION, state);
    // Curse does not change pray.c's consumption guard or useup operation.
    amulet.cursed = true;
    assert.ok(state.u.uprops[STRANGLED].intrinsic);
    const rngBefore = getRngLog().length;
    await fix_worst_trouble(TROUBLE_STRANGLED, state);
    assert.equal(state.uamul, null);
    assert.equal(amulet.where, OBJ_DELETED);
    assert.equal(amulet.owornmask, 0);
    for (let obj = state.invent; obj; obj = obj.nobj) assert.notEqual(obj, amulet);
    assert.equal(state.u.uprops[STRANGLED].intrinsic, 0);
    assert.equal(state.u.uprops[STRANGLED].extrinsic & W_AMUL, 0);
    assert.equal(state.disp.botl, true);
    assert.equal(getRngLog().length, rngBefore, 'pray.c:388–396 has no RNG call');
});

test('the no-matching-amulet arm preserves a different worn amulet', async () => {
    const state = await hero();
    const amulet = await wear(AMULET_OF_REFLECTION, state);
    // A non-amulet source of strangulation can coexist with another amulet.
    state.u.uprops[STRANGLED].intrinsic = 5;
    await fix_worst_trouble(TROUBLE_STRANGLED, state);
    assert.equal(state.uamul, amulet);
    assert.equal(amulet.owornmask & W_AMUL, W_AMUL);
    assert.equal(state.u.uprops[STRANGLED].intrinsic, 0);
});
