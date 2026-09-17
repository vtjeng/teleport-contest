import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BURNING,
    KILLED_BY_AN,
    NON_PM,
    STONING,
    STARVING,
} from '../js/const.js';
import {
    artifact_score,
    done,
    fixup_death,
    get_valuables,
    sort_valuables,
} from '../js/end.js';
import { game } from '../js/gstate.js';
import { newObject } from '../js/obj.js';
import { AMULET_OF_LIFE_SAVING, BELL_OF_OPENING, LARGE_BOX }
    from '../js/objects.js';
import { observe_quantum_cat } from '../js/pickup.js';
import { runSegment } from '../js/jsmain.js';

const END_C = readFileSync(
    new URL('../nethack-c/upstream/src/end.c', import.meta.url), 'utf8',
);
const END_JS = readFileSync(
    new URL('../js/end.js', import.meta.url), 'utf8',
);
const PICKUP_JS = readFileSync(
    new URL('../js/pickup.js', import.meta.url), 'utf8',
);

const RC = [
    'OPTIONS=name:A20,role:Tourist,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

async function freshGame() {
    await runSegment({
        seed: 4820613,
        datetime: '20260311073000',
        nethackrc: RC,
        moves: '',
    });
    return game;
}

function quietFinalization(state) {
    state.iflags.window_inited = false;
    state.flags.bones = false;
    state.invent = null;
    state.moves = Math.max(state.moves, 2);
    state.killer = { name: 'a test cause', format: KILLED_BY_AN };
}

test('fixup_death removes and substitutes source multi reasons', () => {
    const state = {
        multi: 4,
        multi_reason: 'getting stoned',
        multireasonbuf: 'getting stoned',
    };
    fixup_death(STONING, state);
    assert.equal(state.multi_reason, null);
    assert.equal(state.multi, 0);
    assert.equal(state.multireasonbuf, '');

    state.multi_reason = 'fainted from lack of food';
    state.multireasonbuf = 'fainted from lack of food';
    fixup_death(STARVING, state);
    assert.equal(state.multi_reason, 'fainted');
    assert.equal(state.multireasonbuf, '');
});

test('get_valuables recurses through containers and combines glass gems', async () => {
    const state = await freshGame();
    const amulet = newObject({ otyp: AMULET_OF_LIFE_SAVING, quan: 2 });
    const gem = newObject({ otyp: 461, quan: 3 });
    const nestedGem = newObject({ otyp: 462, quan: 4 });
    const box = newObject({ cobj: nestedGem });
    amulet.nobj = gem;
    gem.nobj = box;
    const values = get_valuables(amulet, state);
    assert.equal(
        values.amulets[AMULET_OF_LIFE_SAVING - 201].count, 2,
    );
    assert.equal(values.gems[22].count, 7);
    assert.equal(values.gems[22].typ, 461);
    assert.equal(amulet.nobj, gem);
});

test('sort_valuables is stable and orders nonzero counts descending', () => {
    const a = { count: 2, typ: 'a' };
    const b = { count: 5, typ: 'b' };
    const c = { count: 5, typ: 'c' };
    const d = { count: 0, typ: 'd' };
    assert.deepEqual(sort_valuables([a, b, c, d]), [b, c, a, d]);
});

test('artifact_score counts the source artifact points', async () => {
    const state = await freshGame();
    state.u.urexp = 100;
    const bell = newObject({ otyp: BELL_OF_OPENING, quan: 1 });
    const before = state.u.urexp;
    const value = state.objects[BELL_OF_OPENING].oc_cost;
    artifact_score(bell, true, state);
    assert.equal(state.u.urexp, before + Math.trunc(value * 5 / 2));
});

test('observe_quantum_cat keeps the live coin flip on the box', async () => {
    const state = await freshGame();
    const box = newObject({ otyp: LARGE_BOX, spe: 1, ox: state.u.ux, oy: state.u.uy });
    const draws = [];
    await observe_quantum_cat(box, false, false, {
        state,
        random: { rn2: (limit) => { draws.push(limit); return 0; } },
    });
    assert.equal(box.spe, 1);
    assert.deepEqual(draws, [2]);
    draws.length = 0;
    await observe_quantum_cat(box, false, false, {
        state,
        random: { rn2: (limit) => { draws.push(limit); return 1; } },
    });
    assert.equal(box.spe, 0);
    assert.deepEqual(draws, [2]);
});

test('really_done maps burning to the no-corpse grave arise and returns',
     async () => {
    const state = await freshGame();
    quietFinalization(state);
    await done(BURNING, state);
    assert.equal(state.u.ugrave_arise, NON_PM - 2);
    assert.equal(state.program_state.gameover, true);
    assert.equal(state.program_state.in_really_done, false);
});

test('source finalizer keeps the stopprint tail after top-ten output', () => {
    assert.match(
        END_C,
        /if \(done_stopprint\) \{\s*raw_print\(""\);\s*raw_print\(""\);/u,
    );
    assert.match(
        END_C,
        /else if \(how == BURNING \|\| how == DISSOLVED\)[\s\S]*?NON_PM - 2/u,
    );
    assert.match(END_JS, /state\.mons\?\.\[state\.u\.ugrave_arise\]/u);
    assert.match(END_JS, /A_ORIGINAL[\s\S]*?A_CURRENT/u);
    assert.match(END_JS, /if \(pets\.length\) \{[\s\S]*?pets\.length \? '' : 'You '/u);
    assert.match(END_JS, /disclosureStopprint\(state\)\) break;/u);
    assert.match(END_JS, /LAST_AMULET - FIRST_AMULET \+ 1/u);
    assert.match(
        PICKUP_JS,
        /const itsalive = !random\.rn2\(2\);[\s\S]*?get_obj_location\(box/u,
    );
});
