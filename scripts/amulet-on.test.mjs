// Tests for do_wear.c Amulet_on() (963-1087). Each test initializes
// game state through runSegment with a debug-mode wish, then calls Amulet_on
// directly with a synthetic amulet object.
//
// Expected values come from reading the C source (do_wear.c, mondata.c)
// and the constants they reference.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FLYING,
    SLEEPY,
    STRANGLED,
    TIMEOUT,
    W_AMUL,
} from '../js/const.js';
import {
    UnsupportedAccessoryOnError,
    _doWearInternals,
} from '../js/do_wear.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { can_be_strangled } from '../js/mondata.js';
import {
    PM_ACID_BLOB,
    PM_CLAY_GOLEM,
    PM_HUMAN,
} from '../js/monsters.js';
import {
    AMULET_CLASS,
    AMULET_OF_CHANGE,
    AMULET_OF_ESP,
    AMULET_OF_FLYING,
    AMULET_OF_GUARDING,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_MAGICAL_BREATHING,
    AMULET_OF_REFLECTION,
    AMULET_OF_RESTFUL_SLEEP,
    AMULET_OF_STRANGULATION,
    AMULET_OF_UNCHANGING,
    AMULET_OF_YENDOR,
    AMULET_VERSUS_POISON,
    FAKE_AMULET_OF_YENDOR,
} from '../js/objects.js';
import { find_ac } from '../js/u_init_inventory_attrs.js';

const { Amulet_on } = _doWearInternals;

const { loadWearRecipe } = await import('./run-wear-armor.mjs');
const recipe = loadWearRecipe();

// The same segment the Ring_on tests use: a character whose ring and amulet
// slots start empty.
const BASE_SEGMENT = recipe.segments.find(s => s.moves === '.TWc.');

// Initialize game state with a debug-mode wish. The wish gives the hero
// an item and takes a turn ('.') so the turn counter advances.
function debugSegment(wishItem) {
    return {
        ...BASE_SEGMENT,
        seed: 7720141,
        nethackrc: BASE_SEGMENT.nethackrc.replace(
            'showexp', 'showexp,playmode:debug',
        ),
        // Ctrl-W wishes, then '.' waits one turn to consume any pending
        // messages from the wish itself.
        moves: `.\x17${wishItem}\n.`,
    };
}

// Run a debug segment and clear any pending message so the subsequent
// Amulet_on call starts from a clean display state.
// extraKeys: number of space keys to push into the display queue for
// Amulet_on arms that print multiple messages (on_msg + ttyPline).
async function initGame(wishItem, extraKeys = 0) {
    const seg = debugSegment(wishItem);
    await runSegment({ ...seg, moves: seg.moves });
    game._pending_message = '';
    game.nhDisplay.toplin = 0; // TOPLINE_EMPTY
    // Push extra space keys for arms that print messages needing dismissal.
    for (let i = 0; i < extraKeys; i++)
        game.nhDisplay.pushKey(0x20); // space
}

// A synthetic amulet suitable for Amulet_on. The function reads otyp,
// owornmask, oclass, dknown; setworn() inside sets owornmask to W_AMUL.
function syntheticAmulet(otyp) {
    return {
        oclass: AMULET_CLASS, otyp,
        owornmask: 0, dknown: true, known: false, spe: 0, quan: 1, where: 0,
    };
}

// Validator for assert.rejects(): pins both the error class and the branch
// name it carries, matching the pattern in wear-armor.test.mjs.
function refusal(cls, branch) {
    return (error) => {
        assert.ok(error instanceof cls,
            `expected ${cls.name}, got ${error?.constructor?.name}: `
            + `${error?.message}`);
        assert.ok(error.message.includes(branch),
            `expected message naming ${JSON.stringify(branch)}, got `
            + `${JSON.stringify(error?.message)}`);
        return true;
    };
}

// ---- no-op types ----

test('Amulet_on no-op types complete without throwing', async () => {
    // Six types whose switch arm is a plain break. The extrinsic from
    // setworn() is the whole effect. AMULET_OF_YENDOR is the seventh
    // break arm.
    const noOpTypes = [
        AMULET_OF_ESP,            // do_wear.c:972
        AMULET_OF_LIFE_SAVING,    // do_wear.c:973
        AMULET_VERSUS_POISON,     // do_wear.c:974
        AMULET_OF_REFLECTION,     // do_wear.c:975
        FAKE_AMULET_OF_YENDOR,    // do_wear.c:976
        AMULET_OF_YENDOR,         // do_wear.c:1082
    ];

    for (const otyp of noOpTypes) {
        await initGame('amulet of ESP');
        game.uamul = null;
        const amul = syntheticAmulet(otyp);
        await Amulet_on(amul, game);
        assert.equal(game.uamul, amul,
            `amulet otyp ${otyp} is in the amul slot after Amulet_on`);
        assert.equal(amul.owornmask & W_AMUL, W_AMUL,
            `amulet otyp ${otyp} has W_AMUL set`);
    }
});

// ---- GUARDING ----

test('Amulet_on GUARDING discovers the type and recalculates AC', async () => {
    // do_wear.c:1077-1080. Calls makeknown (= discover_object with all
    // flags TRUE) then find_ac(). find_ac reads uamul->otyp == GUARDING
    // and adds the amulet's AC bonus (objects.c a_ac = 2).
    await initGame('amulet of guarding');
    game.uamul = null;

    find_ac(game);
    const acBefore = game.u.uac;

    const amul = syntheticAmulet(AMULET_OF_GUARDING);
    await Amulet_on(amul, game);

    assert.ok(game.u.uac < acBefore,
        `AC drops from ${acBefore} to ${game.u.uac} for amulet of guarding`);
});

// ---- STRANGULATION ----

test('Amulet_on STRANGULATION sets Strangled to 6', async () => {
    // do_wear.c:1036-1045. When can_be_strangled(youmonst) and !Strangled,
    // sets Strangled = 6L, discovers the type, prints a constriction message.
    // Two messages (on_msg + "It constricts your throat!") need one key to
    // dismiss the first before the second is displayed.
    await initGame('amulet of strangulation', 1);
    game.uamul = null;
    // Ensure the hero is not already strangled.
    game.u.uprops[STRANGLED].intrinsic = 0;

    const amul = syntheticAmulet(AMULET_OF_STRANGULATION);
    await Amulet_on(amul, game);

    // C: Strangled = 6L (do_wear.c:1040).
    assert.equal(game.u.uprops[STRANGLED].intrinsic, 6,
        'Strangled set to 6 for a strangulable hero');
    assert.equal(game.uamul, amul, 'amulet is worn');
});

test('Amulet_on STRANGULATION skips when already strangled', async () => {
    // do_wear.c:1038 guard: !Strangled. When already strangled, the arm
    // body is skipped; the existing countdown is not reset.
    await initGame('amulet of strangulation');
    game.uamul = null;
    // Pre-set Strangled to 3 (an existing countdown).
    game.u.uprops[STRANGLED].intrinsic = 3;

    const amul = syntheticAmulet(AMULET_OF_STRANGULATION);
    await Amulet_on(amul, game);

    assert.equal(game.u.uprops[STRANGLED].intrinsic, 3,
        'Strangled stays at 3 when already strangled');
});

// ---- RESTFUL_SLEEP ----

test('Amulet_on RESTFUL_SLEEP sets HSleepy from rnd(98)+2', async () => {
    // do_wear.c:1047-1054. newnap = rnd(98) + 2, range [3, 100].
    // When oldnap is 0, the timer is unconditionally set.
    await initGame('amulet of restful sleep');
    game.uamul = null;
    game.u.uprops[SLEEPY].intrinsic = 0;

    const amul = syntheticAmulet(AMULET_OF_RESTFUL_SLEEP);
    await Amulet_on(amul, game);

    const nap = game.u.uprops[SLEEPY].intrinsic & TIMEOUT;
    // rnd(98) returns [1, 98], + 2 => [3, 100].
    assert.ok(nap >= 3 && nap <= 100,
        `HSleepy timer ${nap} is in range [3, 100]`);
});

test('Amulet_on RESTFUL_SLEEP does not lengthen a shorter existing nap',
    async () => {
    // do_wear.c:1050: newnap < oldnap || oldnap == 0. The timer is replaced
    // only when the new nap is shorter or there is none. An existing nap of 2
    // (below the minimum newnap of 3) is never replaced because newnap >= 3 > 2
    // means newnap < oldnap is false and oldnap == 0 is false.
    await initGame('amulet of restful sleep');
    game.uamul = null;
    // Set an existing nap shorter than any possible newnap (rnd(98)+2 >= 3).
    game.u.uprops[SLEEPY].intrinsic = 2;

    const amul = syntheticAmulet(AMULET_OF_RESTFUL_SLEEP);
    await Amulet_on(amul, game);

    assert.equal(game.u.uprops[SLEEPY].intrinsic & TIMEOUT, 2,
        'existing 2-turn nap is not lengthened');
});

// ---- FLYING ----

test('Amulet_on FLYING grants flight when the hero has no other source',
    async () => {
    // do_wear.c:1056-1076. setworn sets extrinsic flying; float_vs_flight
    // resolves conflicts. When the hero was not already flying, the arm
    // discovers the type, prints a message, and sets botl. Two messages
    // (on_msg + "You are now in flight.") need one key for dismissal.
    await initGame('amulet of flying', 1);
    game.uamul = null;
    // Clear all flying sources so the amulet is the sole source.
    game.u.uprops[FLYING].intrinsic = 0;
    game.u.uprops[FLYING].extrinsic = 0;
    game.u.uprops[FLYING].blocked = 0;

    const amul = syntheticAmulet(AMULET_OF_FLYING);
    await Amulet_on(amul, game);

    // setworn inside Amulet_on sets extrinsic flying via the W_AMUL bit.
    assert.equal(game.u.uprops[FLYING].extrinsic & W_AMUL, W_AMUL,
        'extrinsic flying carries the W_AMUL bit from the amulet');
    assert.equal(game.uamul, amul, 'amulet is worn');
});

// ---- fail-closed arms ----

test('Amulet_on throws for MAGICAL_BREATHING', async () => {
    await initGame('amulet of magical breathing');
    game.uamul = null;

    const amul = syntheticAmulet(AMULET_OF_MAGICAL_BREATHING);
    await assert.rejects(
        () => Amulet_on(amul, game),
        refusal(UnsupportedAccessoryOnError, 'AMULET_OF_MAGICAL_BREATHING'),
    );
});

test('Amulet_on throws for UNCHANGING', async () => {
    await initGame('amulet of unchanging');
    game.uamul = null;

    const amul = syntheticAmulet(AMULET_OF_UNCHANGING);
    await assert.rejects(
        () => Amulet_on(amul, game),
        refusal(UnsupportedAccessoryOnError, 'AMULET_OF_UNCHANGING'),
    );
});

test('Amulet_on throws for CHANGE', async () => {
    await initGame('amulet of change');
    game.uamul = null;

    const amul = syntheticAmulet(AMULET_OF_CHANGE);
    await assert.rejects(
        () => Amulet_on(amul, game),
        refusal(UnsupportedAccessoryOnError, 'AMULET_OF_CHANGE'),
    );
});

// ---- can_be_strangled ----

test('can_be_strangled: human hero is strangulable', async () => {
    // mondata.c:591-619. A human hero has a head, is not mindless, and is not
    // breathless by default. The function returns true.
    await initGame('amulet of ESP');
    assert.equal(can_be_strangled(game.youmonst, game), true,
        'a human hero can be strangled');
});

test('can_be_strangled: headless species is immune', async () => {
    // Acid blob (PM_ACID_BLOB) has M1_NOHEAD. Headless creatures return false
    // at the first guard (mondata.c:603).
    await initGame('amulet of ESP');
    const mon = { data: game.mons[PM_ACID_BLOB] };
    assert.equal(can_be_strangled(mon, game), false,
        'a headless acid blob cannot be strangled');
});

test('can_be_strangled: mindless breathless golem is immune', async () => {
    // Clay golem (PM_CLAY_GOLEM) has M1_MINDLESS | M1_BREATHLESS and a head.
    // Both nobrainer and nonbreathing are true, so !nobrainer || !nonbreathing
    // evaluates to false || false = false.
    await initGame('amulet of ESP');
    const mon = { data: game.mons[PM_CLAY_GOLEM] };
    assert.equal(can_be_strangled(mon, game), false,
        'a mindless breathless clay golem cannot be strangled');
});

test('can_be_strangled: ordinary human monster is strangulable', async () => {
    // Human (PM_HUMAN) has a head, is not mindless, is not breathless. The
    // function returns true.
    await initGame('amulet of ESP');
    const mon = { data: game.mons[PM_HUMAN] };
    assert.equal(can_be_strangled(mon, game), true,
        'a human monster can be strangled');
});
