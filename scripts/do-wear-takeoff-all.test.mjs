import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ART_SUNSWORD } from '../js/artifacts.js';

// cmd.c binds A to doddoremarm; source do_takeoff clears the primary through
// setuwep before announcing empty hands and completing the occupation.
test('takeoffall admits the production command and unwields Sunsword', async () => {
    assert.ok(ADMITTED_COMMANDS.includes('takeoffall'));
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/do_wear.c/takeoff-all-primary.recipe.session.json', import.meta.url,
    )));
    await runSegment(recipe.segments[0]);
    assert.equal(game.uwep, null);
    let sword = game.invent;
    while (sword && sword.oartifact !== ART_SUNSWORD) sword = sword.nobj;
    assert.ok(sword);
    assert.equal(sword.lamplit, false);
    assert.equal(game.context.takeoff.mask, 0); // Source take_off consumes each selected slot.
    assert.equal(game.context.takeoff.what, 0);
});

import { ECMD_OK, I_SPECIAL, W_ARM, W_ARMC, W_ARMF, W_ARMG, W_ARMH,
    W_ARMS, W_ARMU, W_AMUL, W_RINGL, W_RINGR, W_TOOL, W_WEP,
    W_SWAPWEP, W_QUIVER, GLIB, TT_BEARTRAP, TT_INFLOOR } from '../js/const.js';
import { _doWearInternals, doddoremarm, reset_remarm, select_off, take_off } from '../js/do_wear.js';
import { add_valid_menu_class, is_worn_by_type } from '../js/pickup.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { CLOAK_OF_MAGIC_RESISTANCE, HAWAIIAN_SHIRT, LEATHER_GLOVES,
    LONG_SWORD, LOW_BOOTS, RIN_ADORNMENT, TOOL_CLASS, ARMOR_CLASS,
    WEAPON_CLASS, FOOD_CLASS } from '../js/objects.js';
import { PM_CLERIC } from '../js/monsters.js';

const { do_takeoff } = _doWearInternals;

function primaryRecipe() {
    return JSON.parse(readFileSync(new URL(
        '../recipes/do_wear.c/takeoff-all-primary.recipe.session.json', import.meta.url,
    ))).segments[0];
}
async function startKnight() {
    await runSegment({ ...primaryRecipe(), moves: ' ' }); // Startup only, before any equipment command.
    clearTtyMessageWindow(game);
    _doWearInternals.takeoffContext(game);
}
function clearMessage() {
    clearTtyMessageWindow(game); // Direct checks consume each source message before the next call.
}

test('source takeoff_order pins each selected slot and occupation delay', async () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/do_wear.c', import.meta.url), 'utf8');
    const names = source.match(/const long takeoff_order\[\] = \{([\s\S]*?)\};/)[1]
        .replace(/0L/g, '').split(',').map(s => s.trim()).filter(Boolean);
    const masks = { WORN_BLINDF: W_TOOL, W_WEP, WORN_SHIELD: W_ARMS,
        WORN_GLOVES: W_ARMG, LEFT_RING: W_RINGL, RIGHT_RING: W_RINGR,
        WORN_CLOAK: W_ARMC, WORN_HELMET: W_ARMH, WORN_AMUL: W_AMUL,
        WORN_ARMOR: W_ARM, WORN_SHIRT: W_ARMU, WORN_BOOTS: W_ARMF, W_SWAPWEP, W_QUIVER };
    await startKnight();
    // Each test starts with only this suffix pending; its first source slot must win.
    const order = names.map(name => masks[name]);
    game.ublindf = { otyp: LOW_BOOTS, oclass: TOOL_CLASS };
    game.uleft = game.uright = game.uamul = { otyp: RIN_ADORNMENT };
    game.uarmc = { otyp: CLOAK_OF_MAGIC_RESISTANCE };
    game.uarmu = { otyp: HAWAIIAN_SHIRT };
    game.uarmf = { otyp: LOW_BOOTS };
    for (let i = 0; i < order.length; i++) {
        game.context.takeoff = { mask: order.slice(i).reduce((mask, slot) => mask | slot, 0),
            what: 0, delay: 0, disrobing: 'disrobing' };
        assert.equal(await take_off(game), 1);
        assert.equal(game.context.takeoff.what, order[i]);
        assert.equal(game.go.occupation, take_off);
        assert.equal(game.go.occtime, 0); // set_occupation starts C's callback counter at zero.
    }
    // Suit and shirt overhead use C's object table delays, then subtract the starting turn.
    for (const [slot, expected] of [
        [W_ARM, game.objects[game.uarm.otyp].oc_delay + 2 * game.objects[game.uarmc.otyp].oc_delay],
        [W_ARMU, game.objects[game.uarmu.otyp].oc_delay + 2 * game.objects[game.uarm.otyp].oc_delay
            + 2 * game.objects[game.uarmc.otyp].oc_delay],
    ]) {
        game.context.takeoff = { mask: slot, what: 0, delay: 0, disrobing: 'disrobing' };
        await take_off(game);
        assert.equal(game.context.takeoff.delay, expected);
    }
    game.context.takeoff.delay = 2; // C's busy branch decrements once without removing the item.
    const primary = game.uwep;
    assert.equal(await take_off(game), 1);
    assert.equal(game.context.takeoff.delay, 1);
    assert.equal(game.uwep, primary);
});

test('reset_remarm clears saved selection and verb, retaining the unused delay', async () => {
    await startKnight();
    game.context.takeoff = { mask: W_WEP, what: W_WEP, disrobing: 'disarming', delay: 7 };
    reset_remarm(game);
    assert.deepEqual(game.context.takeoff, { mask: 0, what: 0, disrobing: '', delay: 7, cancelled_don: false });
    // do_wear.c:3015–3017 writes only what, mask and the first verb byte.
});

test('doddoremarm resumes a pending occupation without charging another command turn', async () => {
    await startKnight();
    game.context.takeoff = { mask: W_WEP, what: W_WEP, disrobing: 'disarming', delay: 1 };
    const before = game.moves;
    assert.equal(await doddoremarm(game), ECMD_OK);
    assert.equal(game.moves, before);
    assert.equal(game.context.takeoff.delay, 1); // Resume installs, rather than executes, take_off.
    assert.equal(game.go.occupation, take_off);
});

test('select_off admits cursed quiver and inactive secondary but not a welded primary', async () => {
    await startKnight();
    const bottle = { otyp: LONG_SWORD, oclass: WEAPON_CLASS, cursed: true, bknown: false, owornmask: W_QUIVER };
    game.uquiver = bottle;
    assert.equal(await select_off(bottle, game), 0);
    assert.ok(game.context.takeoff.mask & W_QUIVER);
    assert.equal(bottle.bknown, false); // do_wear.c:2787 skips the curse check for quiver.
    bottle.owornmask = W_SWAPWEP;
    game.uswapwep = bottle;
    game.u.twoweap = false;
    assert.equal(await select_off(bottle, game), 0);
    assert.ok(game.context.takeoff.mask & W_SWAPWEP);
    game.uwep.cursed = true;
    game.uwep.bknown = false;
    game.context.takeoff.mask = 0;
    await select_off(game.uwep, game);
    assert.equal(game.context.takeoff.mask, 0);
    assert.equal(game.uwep.bknown, 1);
    clearMessage();
    game.context.takeoff.what = W_WEP;
    const held = game.uwep;
    assert.equal(await do_takeoff(game), null);
    assert.equal(game.uwep, held);
    assert.equal(game.context.takeoff.mask & I_SPECIAL, 0); // The cancellation guard is cleared after refusal.
});

test('slippery gloves use the source dummy knowledge target when also cursed', async () => {
    await startKnight();
    game.uwep.cursed = false;
    game.uleft = { otyp: RIN_ADORNMENT, owornmask: W_RINGL };
    game.uarmg = { otyp: LEATHER_GLOVES, oclass: ARMOR_CLASS, cursed: true, bknown: false };
    game.u.uprops[GLIB].intrinsic = 1; // Source Glib selects cg.zeroobj instead of the cursed glove.
    await select_off(game.uleft, game);
    assert.equal(game.uarmg.bknown, false);
    assert.equal(game.context.takeoff.mask, 0);
});

test('trapped boots leave the selection unchanged at both source trap types', async () => {
    await startKnight();
    game.uarmf = { otyp: LOW_BOOTS, oclass: ARMOR_CLASS, cursed: false, owornmask: W_ARMF };
    for (const type of [TT_BEARTRAP, TT_INFLOOR]) {
        game.u.utrap = 1;
        game.u.utraptype = type;
        await select_off(game.uarmf, game);
        assert.equal(game.context.takeoff.mask, 0);
        clearMessage();
    }
});

test('is_worn_by_type short-circuits unworn objects and retains Priest knowledge effects', async () => {
    await startKnight();
    game.urole.mnum = PM_CLERIC; // pickup.c:542 tests canonical Role_if(PM_CLERIC).
    add_valid_menu_class(0, game);
    add_valid_menu_class(WEAPON_CLASS, game);
    const obj = { otyp: LONG_SWORD, oclass: WEAPON_CLASS, owornmask: 0, bknown: false };
    assert.equal(is_worn_by_type(obj, game), false);
    assert.equal(obj.bknown, false); // is_worn FALSE prevents calling the impure allow_category.
    obj.owornmask = W_WEP;
    assert.equal(is_worn_by_type(obj, game), true);
    assert.equal(obj.bknown, 1);
    obj.oclass = FOOD_CLASS;
    assert.equal(is_worn_by_type(obj, game), false); // The active weapon class filter rejects food.
});
