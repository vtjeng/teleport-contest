// Direct tests for the two upkeep helpers uhitm.c do_attack() reaches before
// it swings: hack.c overexertion() and engrave.c u_wipe_engr(). Both are
// silent in an ordinary fight, which is exactly why the fresh matrix behind
// scripts/hostile-melee-miss.test.mjs cannot pin their guards.

import assert from 'node:assert/strict';
import test from 'node:test';

import { BURN, DUST, HVY_ENCUMBER, PIT } from '../js/const.js';
import { WEAPON_CLASS } from '../js/objects.js';
import { u_wipe_engr } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import {
    near_capacity,
    overexertion,
    UnsupportedHeroMoveBoundaryError,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog } from '../js/rng.js';

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Upkeep,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7700376, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    return game;
}

// Load the hero until near_capacity() reports exactly `wanted`.
// capacity_from_excess() answers `min(trunc(excess * 2 / cap) + 1,
// OVERLOADED)`, so an excess of one whole capacity scores HVY_ENCUMBER.
function loadTo(wanted) {
    const cap = weight_cap(game);
    let carried = 0;
    for (let obj = game.invent; obj; obj = obj.nobj)
        carried += Math.trunc(obj.owt ?? 0);
    game.invent = {
        otyp: 0,
        oclass: WEAPON_CLASS,
        quan: 1,
        owt: (cap * wanted) - carried,
        nobj: game.invent,
    };
    return cap;
}

// hack.c:3055-3057. Fainting from combat exhaustion needs overexert_hp(),
// which prints, exercises Constitution and calls fall_asleep(); none of that
// is ported. The guard has two terms and both matter.
test('overexertion stops only for a heavily loaded hero off the third turn',
    async () => {
        await hero();
        // The starting load is nowhere near the threshold, so the ordinary
        // attack spends nutrition and returns.
        assert.ok(near_capacity(game) < HVY_ENCUMBER);
        assert.equal(await overexertion(game), false);

        loadTo(2);
        assert.equal(near_capacity(game), HVY_ENCUMBER);
        game.moves = 4; /* 4 % 3 !== 0 */
        await assert.rejects(
            overexertion(game),
            (error) => (
                error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'overexertion hit points'
            ),
        );

        // Every third turn skips it however loaded the hero is.
        game.moves = 6;
        assert.equal(await overexertion(game), false);
    });

// engrave.c:266. A square with nothing engraved on it costs nothing, and a
// hero who cannot reach the floor leaves even an engraved one alone.
test('u_wipe_engr rubs out only what the hero can reach', async () => {
    await hero();
    const before = getRngLog().length;
    u_wipe_engr(3, { state: game });
    assert.equal(getRngLog().length, before);

    // An ENGRAVE-type engraving is the kind whose erosion is decided by a
    // draw, which is what makes the reach test observable.
    const engraving = {
        engr_x: game.u.ux,
        engr_y: game.u.uy,
        engr_txt: ['Elbereth'],
        engr_type: DUST,
        engr_time: 0,
        nxt_engr: null,
    };
    game.head_engr = engraving;
    u_wipe_engr(3, { state: game });
    // DUST and ENGR_BLOOD skip wipe_engr_at()'s erosion roll and hand `count`
    // straight to wipeout_text(), which blurs three of the eight characters.
    assert.notEqual(engraving.engr_txt[0], 'Elbereth');
    assert.equal(engraving.engr_txt[0].length, 8);

    // A seen pit under the hero puts the floor out of reach, which is the one
    // thing can_reach_floor(TRUE) answers differently from can_reach_floor().
    game.head_engr = {
        ...engraving, engr_txt: ['Elbereth'], engr_type: DUST,
    };
    const traps = game.level.traps;
    game.level.traps = [
        { tx: game.u.ux, ty: game.u.uy, ttyp: PIT, tseen: 1 },
    ];
    game.u.utrap = 0;
    u_wipe_engr(3, { state: game });
    assert.equal(game.head_engr.engr_txt[0], 'Elbereth');
    game.level.traps = traps;
    game.head_engr = null;
});

// engrave.c:266 passes magical = FALSE, which is what keeps a burned
// engraving intact and its rn2(2) unspent.
test('u_wipe_engr leaves a burned engraving alone', async () => {
    await hero();
    const engraving = {
        engr_x: game.u.ux,
        engr_y: game.u.uy,
        engr_txt: ['Elbereth'],
        engr_type: BURN,
        engr_time: 0,
        nxt_engr: null,
    };
    game.head_engr = engraving;
    const before = getRngLog().length;
    u_wipe_engr(3, { state: game });
    assert.equal(getRngLog().length, before);
    assert.equal(engraving.engr_txt[0], 'Elbereth');
    game.head_engr = null;
});
