// The #twoweapon command: mondata.h could_twoweap(), wield.c TWOWEAPOK()
// reached through wield.c can_twoweapon(), and wield.c dotwoweapon()'s
// success, refusal and toggle-off paths. Every expected value comes from
// those C sources and is cited at the assertion that uses it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { failClosedCommandRefusals } from '../js/cmd.js';
import {
    A_DEX,
    ECMD_OK,
    ECMD_TIME,
    GLIB,
    OBJ_INVENT,
    W_SWAPWEP,
    W_WEP,
} from '../js/const.js';
import { weapon_status } from '../js/display.js';
import { could_twoweap } from '../js/mondata.js';
import {
    AT_WEAP,
    PM_NEWT,
    PM_SAMURAI,
    monst_globals_init,
} from '../js/monsters.js';
import { UnsupportedObjectOperationError, newObject } from '../js/obj.js';
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
import { init_objects } from '../js/o_init.js';
import { enableRngLog, getRngLog, initRng, rnd } from '../js/rng.js';
import { roles } from '../js/roles.js';
import {
    UnsupportedTwoWeaponError,
    can_twoweapon,
    dotwoweapon,
} from '../js/wield.js';

// roles.js keeps the role records in role.c's order, so these are the indices
// role.c:113 (Caveman), :275 (Priest) and :533 (Wizard) sit at.
const ROLE_CAVEMAN = 2;
const ROLE_PRIEST = 6;
const ROLE_SAMURAI = 9;
const ROLE_WIZARD = 12;

// u_init.c gives the Samurai a katana in the primary slot and a short sword
// in the secondary one, and no shield; that pair is can_twoweapon()'s success
// path, so every refusal test below starts from it and breaks one condition.
function makeState(pmidx = PM_SAMURAI, roleIndex = ROLE_SAMURAI) {
    const state = {
        invent: null,
        uwep: null,
        uswapwep: null,
        uarms: null,
        flags: {},
        urole: roles[roleIndex],
        // Upolyd() compares these two, so an unpolymorphed hero needs both.
        u: {
            twoweap: false,
            acurr: { a: [] },
            umonnum: pmidx,
            umonster: pmidx,
            uprops: {},
        },
    };
    monst_globals_init(state);
    objects_globals_init(state);
    // xname() enters the named type in the discoveries list, which needs the
    // per-class bases and the discovery array init_objects() builds. The
    // constant rn2 keeps its description shuffle from drawing on the game RNG.
    init_objects(state, () => 0);
    state.youmonst = { data: state.mons[pmidx] };
    return state;
}

function object(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        // u_init.c:1218 sets dknown on every starting object, and obj.h
        // carried() reads where, which shk_your() consults for "your ".
        dknown: 1,
        where: OBJ_INVENT,
        ...overrides,
    });
}

function armHero(
    state, primaryTyp = KATANA, secondaryTyp = SHORT_SWORD, secondaryQuan = 1,
) {
    state.uwep = primaryTyp === null
        ? null
        : object(state, primaryTyp, { owornmask: W_WEP });
    state.uswapwep = secondaryTyp === null
        ? null
        : object(state, secondaryTyp,
                 { owornmask: W_SWAPWEP, quan: secondaryQuan });
    return state;
}

// Every refusal arm answers FALSE and prints one line, so the two are checked
// together.
async function refusal(state) {
    assert.equal(await can_twoweapon(state), false);
    return state._pending_message;
}

async function stoppedRefusal(state) {
    let caught = null;
    await assert.rejects(() => can_twoweapon(state), (error) => {
        caught = error;
        return error instanceof UnsupportedTwoWeaponError;
    });
    // A stopped arm must print nothing, because js/cmd.js retries the whole
    // command from this boundary.
    assert.equal(state._pending_message, undefined);
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

test('can_twoweapon accepts the Samurai katana and short sword', async () => {
    const state = armHero(makeState());
    // wield.c:802, the only arm that returns TRUE, and it prints nothing.
    assert.equal(await can_twoweapon(state), true);
    assert.equal(state._pending_message, undefined);
});

test('can_twoweapon names the role that cannot hold two weapons', async () => {
    // wield.c:765-771. A newt has no AT_WEAP slot at all, so the role's own
    // name is pluralized into the refusal. role.c:533 names the Wizard in the
    // male form only.
    assert.equal(await refusal(armHero(makeState(PM_NEWT, ROLE_WIZARD))),
        "Wizards aren't able to use two weapons at once.");

    // flags.female picks urole.name.f where role.c gives one: role.c:275 and
    // :113. Both plurals exercise makeplural()'s "-ess" and "-man" rules.
    const priestess = armHero(makeState(PM_NEWT, ROLE_PRIEST));
    priestess.flags.female = true;
    assert.equal(await refusal(priestess),
        "Priestesses aren't able to use two weapons at once.");

    const cavewoman = armHero(makeState(PM_NEWT, ROLE_CAVEMAN));
    cavewoman.flags.female = true;
    assert.equal(await refusal(cavewoman),
        "Cavewomen aren't able to use two weapons at once.");

    // wield.c:770 conjoins flags.female with urole.name.f, so the two roles
    // that own a female name still print the male one for a male hero. These
    // are the only two states in which that conjunct decides the noun.
    assert.equal(await refusal(armHero(makeState(PM_NEWT, ROLE_PRIEST))),
        "Priests aren't able to use two weapons at once.");
    assert.equal(await refusal(armHero(makeState(PM_NEWT, ROLE_CAVEMAN))),
        "Cavemen aren't able to use two weapons at once.");

    // A female role with no name.f keeps the male form.
    const wizard = armHero(makeState(PM_NEWT, ROLE_WIZARD));
    wizard.flags.female = true;
    assert.equal(await refusal(wizard),
        "Wizards aren't able to use two weapons at once.");
});

test('can_twoweapon blames the form when the hero is polymorphed', async () => {
    // wield.c:766-767. Upolyd() is umonnum != umonster, and it replaces the
    // role name with the form the hero is stuck in.
    const state = armHero(makeState(PM_NEWT, ROLE_WIZARD));
    state.u.umonster = PM_SAMURAI;
    assert.equal(await refusal(state),
        "You can't use two weapons in your current form.");
});

test('can_twoweapon reports which hand is empty', async () => {
    // wield.c:772-779. Both hands empty pluralizes body_part(HAND) and
    // vtense() agrees the verb with it; one hand empty names the side, and
    // the secondary weapon is the left-hand one.
    assert.equal(await refusal(armHero(makeState(), null, null)),
        'Your hands are empty.');
    assert.equal(await refusal(armHero(makeState(), KATANA, null)),
        'Your left hand is empty.');
    assert.equal(await refusal(armHero(makeState(), null, SHORT_SWORD)),
        'Your right hand is empty.');
});

test('can_twoweapon refuses launchers, ammunition and missiles', async () => {
    // wield.c:780-785 through TWOWEAPOK() at :75-78. A bow is is_launcher(),
    // an arrow is is_ammo() and a dart is is_missile(); each disqualifies the
    // slot it occupies on its own. The uwep test runs first, so a bad primary
    // is named "primary" and everything else "secondary".
    //
    // This is the one arm the #twoweapon differential matrix cannot reach:
    // scripts/run-twoweapon-command.mjs REFUSAL_CASES records why no role's
    // u_init.c loadout selects it, so these constructed states are its only
    // cover.
    assert.equal(await refusal(armHero(makeState(), BOW, SHORT_SWORD)),
        "Your bow isn't a suitable primary weapon.");
    assert.equal(await refusal(armHero(makeState(), KATANA, ARROW)),
        "Your arrow isn't a suitable secondary weapon.");
    assert.equal(await refusal(armHero(makeState(), DART, SHORT_SWORD)),
        "Your dart isn't a suitable primary weapon.");

    // is_plural() and plur() both read quan, so a stack changes the verb, the
    // article and the noun together.
    assert.equal(await refusal(armHero(makeState(), KATANA, DART, 3)),
        "Your darts aren't suitable secondary weapons.");
});

test('can_twoweapon accepts a weapon-tool and refuses a plain tool', async () => {
    // TWOWEAPOK()'s non-WEAPON_CLASS arm is is_weptool(): a pick-axe has a
    // nonzero oc_skill and passes, an oil lamp has none and fails.
    assert.equal(await can_twoweapon(armHero(makeState(), KATANA, PICK_AXE)),
        true);
    // objects.c gives the oil lamp the description "lamp" and no starting
    // discovery, so xname() names what the hero sees rather than the type.
    assert.equal(await refusal(armHero(makeState(), KATANA, OIL_LAMP)),
        "Your lamp isn't a suitable secondary weapon.");
});

test('can_twoweapon refuses a two-handed weapon in either slot', async () => {
    // wield.c:786-788. objects.c gives the two-handed sword oc_bimanual, and
    // the uwep test runs first, so it is named when both slots hold one.
    assert.equal(
        await refusal(armHero(makeState(), TWO_HANDED_SWORD, SHORT_SWORD)),
        "Your two-handed sword isn't one-handed.",
    );
    assert.equal(
        await refusal(armHero(makeState(), KATANA, TWO_HANDED_SWORD)),
        "Your two-handed sword isn't one-handed.",
    );
});

test('can_twoweapon refuses a worn shield', async () => {
    // wield.c:789-790. The Samurai starts without one; any uarms refuses.
    const state = armHero(makeState());
    state.uarms = object(state, SHORT_SWORD);
    assert.equal(await refusal(state),
        "You can't use two weapons while wearing a shield.");
});

test('can_twoweapon stops on an artifact in the secondary slot', async () => {
    // wield.c:791-793, which tests uswapwep only. Yobjnam2() needs yname()'s
    // artifact branch, which is unported, so the arm stops with no output.
    const state = armHero(makeState());
    state.uswapwep.oartifact = 1;
    assert.match(await stoppedRefusal(state), /artifact/u);
});

test('can_twoweapon stops on slippery fingers and a cursed secondary', async () => {
    // wield.c:797-801. Glib (youprop.h:112) and uswapwep->cursed refuse
    // separately; each drops the secondary weapon through drop_uswapwep(),
    // which do.c's dropx() does not admit yet.
    const cursed = armHero(makeState());
    cursed.uswapwep.cursed = 1;
    assert.match(await stoppedRefusal(cursed), /slippery-or-cursed/u);

    const glib = armHero(makeState());
    glib.u.uprops[GLIB] = { intrinsic: 1 };
    assert.match(await stoppedRefusal(glib), /slippery-or-cursed/u);
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
    // Seed 2 draws 14, which is above acurr()'s floor of 3.
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
    // botl.c:516-519 describes a katana by its skill class while two-weapon
    // combat is off, so the field has a value the command has to replace.
    assert.equal(weapon_status(state), 'Sword');
    await dotwoweapon(state);
    // wield.c set_twoweap() at :834-841 sets disp.botl on a real change.
    assert.equal(state.disp.botl, true);
    // botl.c:492-499. u.twoweap takes the field over from the skill class,
    // and only a lance held on a steed turns it into "Dual+joust". This is
    // the field the redraw above exists to repaint.
    assert.equal(weapon_status(state), 'Dual-weps');
});

test('a stopped can_twoweapon() arm ends the command, not the run', () => {
    // js/allmain.js tests this list to turn the two stopped arms into a
    // retryable command boundary rather than a failed segment. Neither arm is
    // reachable from a recorded input, so nothing else can pin the entry.
    assert.ok(failClosedCommandRefusals().includes(UnsupportedTwoWeaponError));
});

// invent.c update_inventory() repaints the persistent-inventory window.
// js/invent.js supplies no window, so with OPTIONS=perm_invent set inside the
// move loop it stops instead; that stop is the only observable either
// update_inventory() call in dotwoweapon() has.
function permInventHero(state) {
    state.iflags = { perm_invent: true };
    state.program_state = { in_moveloop: true };
    return state;
}

test('dotwoweapon refreshes the inventory after switching on', async () => {
    initRng(2);
    enableRngLog();
    const state = permInventHero(armHero(makeState()));
    state.u.acurr.a[A_DEX] = 14;
    await assert.rejects(() => dotwoweapon(state),
        UnsupportedObjectOperationError);
    // wield.c:858-860 prints, sets the flag, then refreshes, so both earlier
    // statements have run by the time the refresh stops.
    assert.equal(state._pending_message, 'You begin two-weapon combat.');
    assert.equal(state.u.twoweap, true);
    // wield.c:861 draws only after the refresh returns.
    assert.deepEqual(getRngLog(), []);
});

test('dotwoweapon refreshes the inventory after switching off', async () => {
    const state = permInventHero(armHero(makeState()));
    state.u.twoweap = true;
    await assert.rejects(() => dotwoweapon(state),
        UnsupportedObjectOperationError);
    // wield.c:849-851, in that order, before the arm returns ECMD_OK.
    assert.equal(state._pending_message, 'You switch to your primary weapon.');
    assert.equal(state.u.twoweap, false);
});

test('dotwoweapon switches two-weapon combat back off for free', async () => {
    // wield.c:847-853. The toggle-off arm returns ECMD_OK before the gate, so
    // it neither consults can_twoweapon() nor draws rnd(20).
    initRng(2);
    enableRngLog();
    const state = armHero(makeState());
    state.u.twoweap = true;
    assert.equal(await dotwoweapon(state), ECMD_OK);
    assert.equal(state.u.twoweap, false);
    assert.equal(state._pending_message,
        'You switch to your primary weapon.');
    assert.deepEqual(getRngLog(), []);
});

test('dotwoweapon toggles off even from a state it would refuse to enter', async () => {
    // wield.c:848 tests u.twoweap before can_twoweapon(), so a hero whose
    // secondary slot has emptied still switches back without a refusal.
    const state = armHero(makeState(), KATANA, null);
    state.u.twoweap = true;
    assert.equal(await dotwoweapon(state), ECMD_OK);
    assert.equal(state.u.twoweap, false);
    assert.equal(state._pending_message,
        'You switch to your primary weapon.');
});

test('a refused switch spends no move and draws nothing', async () => {
    // wield.c:863. can_twoweapon() answering FALSE falls past the rnd(20) to
    // ECMD_OK, so the whole command is free.
    initRng(2);
    enableRngLog();
    const state = armHero(makeState(), TWO_HANDED_SWORD, SHORT_SWORD);
    state.u.acurr.a[A_DEX] = 14;
    assert.equal(await dotwoweapon(state), ECMD_OK);
    assert.equal(state.u.twoweap, false);
    assert.deepEqual(getRngLog(), []);
});
