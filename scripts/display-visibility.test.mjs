import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    COULD_SEE,
    DETECT_MONSTERS,
    IN_SIGHT,
    INFRAVISION,
    POOL,
    SEE_INVIS,
    TELEPAT,
    WARN_OF_MON,
} from '../js/const.js';
import { canseemon, canspotmon, mon_visible, see_with_infrared,
    sensemon, sensemonWithoutDetection, tp_sensemon, warningMatches,
} from '../js/display.js';
import { M1_MINDLESS, M3_INFRAVISIBLE } from '../js/monsters.js';

function stateForVisibility() {
    // The small interior coordinates keep these tests inside isok()'s C map
    // bounds and make every sight bit an explicit source-condition fixture.
    const size = 6;
    return {
        u: {
            ux: 2,
            uy: 2,
            uprops: [],
            unblind_telepat_range: 5,
            uswallow: false,
            uinwater: false,
        },
        context: { warntype: {} },
        viz_array: Array.from({ length: size }, () => new Uint8Array(size)),
        level: {
            worms: [],
            at: () => ({ typ: POOL }),
        },
    };
}

function monsterAt(x = 3, y = 2) {
    return {
        data: { mflags1: 0, mflags2: 0, mflags3: 0 },
        mx: x,
        my: y,
        minvis: false,
        mundetected: false,
    };
}

test('display.c visibility helpers preserve invisibility and infrared rules', () => {
    const state = stateForVisibility();
    const monster = monsterAt();
    state.viz_array[monster.my][monster.mx] = IN_SIGHT | COULD_SEE;

    assert.equal(mon_visible(monster, state), true);
    assert.equal(canseemon(monster, state), true);
    assert.equal(canspotmon(monster, state), true);

    // display.h _mon_visible() permits invisibility only with See_invisible;
    // the C macro does not let that property reveal an undetected hider.
    monster.minvis = true;
    assert.equal(mon_visible(monster, state), false);
    state.u.uprops[SEE_INVIS] = { intrinsic: 1 };
    assert.equal(mon_visible(monster, state), true);
    monster.mundetected = true;
    assert.equal(mon_visible(monster, state), false);
    assert.equal(canseemon(monster, state), false);

    // display.h _see_with_infrared() needs a lit COULD_SEE square, an
    // infravisible monster, Infravision and an unblinded hero.
    monster.mundetected = false;
    monster.data.mflags3 = M3_INFRAVISIBLE;
    state.u.uprops[INFRAVISION] = { intrinsic: 1 };
    assert.equal(see_with_infrared(monster, state), true);
    state.u.uprops[BLINDED] = { intrinsic: 1 };
    assert.equal(see_with_infrared(monster, state), false);
});

test('display.c telepathy and sensemon retain range and source gates', () => {
    const state = stateForVisibility();
    const monster = monsterAt(4, 2);

    // display.h _tp_sensemon() uses mdistu -> distu -> dist2 against
    // unblind_telepat_range.
    state.u.uprops[TELEPAT] = { extrinsic: 1 };
    assert.equal(tp_sensemon(monster, state), true);
    state.u.unblind_telepat_range = 3;
    assert.equal(tp_sensemon(monster, state), false);

    // mindless() blocks both telepathy arms even when blind and telepathic.
    monster.data.mflags1 = M1_MINDLESS;
    state.u.uprops[BLINDED] = { intrinsic: 1 };
    state.u.uprops[TELEPAT] = { intrinsic: 1 };
    assert.equal(tp_sensemon(monster, state), false);
    monster.data.mflags1 = 0;
    assert.equal(tp_sensemon(monster, state), true);

    // _sensemon() checks swallowed/underwater before detection and telepathy;
    // underwater uses mdistu -> dist2 <= 2 plus is_pool.
    state.u.uswallow = true;
    state.u.ustuck = null;
    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 1 };
    assert.equal(sensemon(monster, state), false);
    state.u.ustuck = monster;
    assert.equal(sensemon(monster, state), true);
    state.u.uswallow = false;
    state.u.uinwater = true;
    assert.equal(sensemon(monster, state), false);
    monster.mx = 3;
    assert.equal(sensemon(monster, state), true);
    state.level.at = () => ({ typ: 1 });
    assert.equal(sensemon(monster, state), false);

    // newsym() uses the same expression without Detect_monsters when it
    // chooses PHYSICALLY_SEEN versus DETECTED sight flags.
    state.u.uinwater = false;
    assert.equal(sensemon(monster, state), true);
    assert.equal(sensemonWithoutDetection(monster, state), true);
    state.u.uprops[TELEPAT] = {};
    assert.equal(sensemon(monster, state), true);
    assert.equal(sensemonWithoutDetection(monster, state), false);
});

test('display.c MATCH_WARN_OF_MON and worm_known feed the canonical callers', () => {
    const state = stateForVisibility();
    const monster = monsterAt(3, 2);
    monster.data.mflags2 = 0x20;
    state.u.uprops[WARN_OF_MON] = { intrinsic: 1 };
    state.context.warntype.obj = 0x20;

    // hack.h MATCH_WARN_OF_MON() requires the warning property and a matching
    // species flag; this uses the arbitrary C flag bit 0x20 as the fixture.
    assert.equal(warningMatches(monster, state), true);
    assert.equal(sensemon(monster, state), true);
    assert.equal(canspotmon(monster, state), true);

    // display.h _canseemon() delegates long-worm visibility to worm_known();
    // a visible segment is enough even when the head square is not in sight.
    const worm = monsterAt(4, 4);
    worm.wormno = 1;
    state.level.worms[1] = { segments: [{ x: 3, y: 2 }] };
    state.viz_array[2][3] = IN_SIGHT;
    assert.equal(canseemon(worm, state), true);
});
