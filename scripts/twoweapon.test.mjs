// The #twoweapon command: mondata.h could_twoweap(), wield.c TWOWEAPOK()
// reached through wield.c can_twoweapon(), and wield.c dotwoweapon()'s
// success path. Every expected value comes from those C sources and is cited
// at the assertion that uses it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_DEX,
    ECMD_OK,
    ECMD_TIME,
    GLIB,
    W_SWAPWEP,
    W_WEP,
} from '../js/const.js';
import { could_twoweap } from '../js/mondata.js';
import {
    AT_WEAP,
    PM_NEWT,
    PM_SAMURAI,
    monst_globals_init,
} from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import {
    ARROW,
    BOW,
    DART,
    KATANA,
    OIL_LAMP,
    PICK_AXE,
    SHORT_SWORD,
    TWO_HANDED_SWORD,
    objects_globals_init,
} from '../js/objects.js';
import { enableRngLog, getRngLog, initRng, rnd } from '../js/rng.js';
import {
    UnsupportedTwoWeaponError,
    can_twoweapon,
    dotwoweapon,
} from '../js/wield.js';

// u_init.c gives the Samurai a katana in the primary slot and a short sword
// in the secondary one, and no shield; that pair is can_twoweapon()'s success
// path, so every refusal test below starts from it and breaks one condition.
function makeState(pmidx = PM_SAMURAI) {
    const state = {
        invent: null,
        uwep: null,
        uswapwep: null,
        uarms: null,
        flags: {},
        u: { twoweap: false, acurr: { a: [] }, uprops: {} },
    };
    monst_globals_init(state);
    objects_globals_init(state);
    state.youmonst = { data: state.mons[pmidx] };
    return state;
}

function object(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        ...overrides,
    });
}

function armHero(state, primaryTyp = KATANA, secondaryTyp = SHORT_SWORD) {
    state.uwep = primaryTyp === null
        ? null
        : object(state, primaryTyp, { owornmask: W_WEP });
    state.uswapwep = secondaryTyp === null
        ? null
        : object(state, secondaryTyp, { owornmask: W_SWAPWEP });
    return state;
}

function refusal(state) {
    let caught = null;
    assert.throws(() => can_twoweapon(state), (error) => {
        caught = error;
        return error instanceof UnsupportedTwoWeaponError;
    });
    return caught.message;
}

// mondata.h:129-132 sums three equality tests over mattk[0..2] and asks for a
// sum greater than one.
function formWithWeaponAttacksAt(...slots) {
    return {
        mattk: Array.from({ length: 6 }, (_, index) => ({
            aatyp: slots.includes(index) ? AT_WEAP : 0,
        })),
    };
}

test('could_twoweap counts weapon attacks in the first three slots only', () => {
    // One weapon attack is not two: mondata.h compares the sum with 1.
    assert.equal(could_twoweap(formWithWeaponAttacksAt(0)), false);
    // Any two of the three counted slots satisfy it.
    assert.equal(could_twoweap(formWithWeaponAttacksAt(0, 1)), true);
    assert.equal(could_twoweap(formWithWeaponAttacksAt(1, 2)), true);
    assert.equal(could_twoweap(formWithWeaponAttacksAt(0, 1, 2)), true);
    // mattk[3] is outside the macro, so a pair straddling the boundary and a
    // pair wholly beyond it both answer false.
    assert.equal(could_twoweap(formWithWeaponAttacksAt(2, 3)), false);
    assert.equal(could_twoweap(formWithWeaponAttacksAt(3, 4, 5)), false);
    // No weapon attack at all.
    assert.equal(could_twoweap(formWithWeaponAttacksAt()), false);
});

test('could_twoweap reads the hero form the Samurai starts in', () => {
    const state = makeState();
    // u_init.c:142 makes the hero the role monster, not PM_HUMAN. monst.c's
    // samurai carries AT_WEAP in mattk[0] and mattk[1]; a newt has none.
    assert.equal(could_twoweap(state.mons[PM_SAMURAI]), true);
    assert.equal(could_twoweap(state.mons[PM_NEWT]), false);
});

test('can_twoweapon accepts the Samurai katana and short sword', () => {
    const state = armHero(makeState());
    // wield.c:803, the only arm that returns TRUE.
    assert.equal(can_twoweapon(state), true);
});

test('can_twoweapon refuses a form that cannot hold two weapons', () => {
    // wield.c:765. A newt has no AT_WEAP slot at all.
    const state = armHero(makeState(PM_NEWT));
    assert.match(refusal(state), /wrong-form/u);
});

test('can_twoweapon refuses an empty hand', () => {
    // wield.c:773. Either slot alone is enough to refuse.
    assert.match(refusal(armHero(makeState(), KATANA, null)), /empty-hand/u);
    assert.match(refusal(armHero(makeState(), null, SHORT_SWORD)),
        /empty-hand/u);
    assert.match(refusal(armHero(makeState(), null, null)), /empty-hand/u);
});

test('can_twoweapon refuses launchers, ammunition and missiles', () => {
    // wield.c:780 through TWOWEAPOK() at :75-78. A bow is is_launcher(), an
    // arrow is is_ammo() and a dart is is_missile(); each disqualifies the
    // slot it occupies on its own.
    assert.match(refusal(armHero(makeState(), BOW, SHORT_SWORD)),
        /unsuitable-weapon/u);
    assert.match(refusal(armHero(makeState(), KATANA, ARROW)),
        /unsuitable-weapon/u);
    assert.match(refusal(armHero(makeState(), KATANA, DART)),
        /unsuitable-weapon/u);
    assert.match(refusal(armHero(makeState(), DART, SHORT_SWORD)),
        /unsuitable-weapon/u);
});

test('can_twoweapon accepts a weapon-tool and refuses a plain tool', () => {
    // TWOWEAPOK()'s non-WEAPON_CLASS arm is is_weptool(): a pick-axe has a
    // nonzero oc_skill and passes, an oil lamp has none and fails.
    assert.equal(can_twoweapon(armHero(makeState(), KATANA, PICK_AXE)), true);
    assert.match(refusal(armHero(makeState(), KATANA, OIL_LAMP)),
        /unsuitable-weapon/u);
});

test('can_twoweapon refuses a two-handed weapon in either slot', () => {
    // wield.c:786. objects.c gives the two-handed sword oc_bimanual.
    assert.match(refusal(armHero(makeState(), TWO_HANDED_SWORD, SHORT_SWORD)),
        /two-handed/u);
    assert.match(refusal(armHero(makeState(), KATANA, TWO_HANDED_SWORD)),
        /two-handed/u);
});

test('can_twoweapon refuses a worn shield', () => {
    // wield.c:789. The Samurai starts without one; any uarms refuses.
    const state = armHero(makeState());
    state.uarms = object(state, SHORT_SWORD);
    assert.match(refusal(state), /shield/u);
});

test('can_twoweapon refuses an artifact in the secondary slot', () => {
    // wield.c:791, which tests uswapwep only.
    const state = armHero(makeState());
    state.uswapwep.oartifact = 1;
    assert.match(refusal(state), /artifact/u);
});

test('can_twoweapon refuses slippery fingers and a cursed secondary', () => {
    // wield.c:797. Glib (youprop.h:112) and uswapwep->cursed refuse
    // separately; each drops the secondary weapon, which this slice omits.
    const cursed = armHero(makeState());
    cursed.uswapwep.cursed = 1;
    assert.match(refusal(cursed), /slippery-or-cursed/u);

    const glib = armHero(makeState());
    glib.u.uprops[GLIB] = { intrinsic: 1 };
    assert.match(refusal(glib), /slippery-or-cursed/u);
});

// Drive dotwoweapon() with the core RNG positioned so that the single
// rnd(20) at wield.c:861 is known, then set Dexterity relative to it. The
// draw is read from the stream rather than hard-coded, so the test states the
// comparison rather than an ISAAC64 output.
async function runCommand(seed, dexterityFromDraw) {
    initRng(seed);
    const draw = rnd(20);
    initRng(seed);
    enableRngLog();
    const state = armHero(makeState());
    state.u.acurr.a[A_DEX] = dexterityFromDraw(draw);
    const result = await dotwoweapon(state);
    return { draw, result, state, log: getRngLog() };
}

test('dotwoweapon spends no time when the draw does not beat Dexterity', async () => {
    // wield.c:861 is `rnd(20) > ACURR(A_DEX)`, so an equal draw is ECMD_OK.
    // Seed 2 draws 14, which is above effective_attribute()'s floor of 3.
    const { draw, result, state, log } = await runCommand(2, (d) => d);
    assert.equal(draw, 14);
    assert.equal(result, ECMD_OK);
    // The command draws exactly once. A second draw would desynchronize
    // every later step of a recorded game.
    assert.deepEqual(log, [`rnd(20)=${draw}`]);
    assert.equal(state.u.twoweap, true);
    assert.equal(state._pending_message, 'You begin two-weapon combat.');
    // flags.weaponstatus is off by default, so set_twoweap() sets no botl.
    assert.equal(state.disp?.botl, undefined);
});

test('dotwoweapon spends the move when the draw beats Dexterity', async () => {
    const { draw, result, state, log } = await runCommand(2, (d) => d - 1);
    assert.equal(result, ECMD_TIME);
    assert.deepEqual(log, [`rnd(20)=${draw}`]);
    assert.equal(state.u.twoweap, true);
});

test('dotwoweapon redraws the status line when weaponstatus is on', async () => {
    initRng(2);
    const state = armHero(makeState());
    state.flags.weaponstatus = true;
    state.u.acurr.a[A_DEX] = 14;
    await dotwoweapon(state);
    // wield.c set_twoweap() at :834-841 sets disp.botl on a real change.
    assert.equal(state.disp.botl, true);
});

test('dotwoweapon refuses to switch two-weapon combat back off', async () => {
    // wield.c:847-853 prints "You switch to your primary weapon."; this
    // slice owns the turn-on path only.
    const state = armHero(makeState());
    state.u.twoweap = true;
    await assert.rejects(
        () => dotwoweapon(state),
        UnsupportedTwoWeaponError,
    );
});
