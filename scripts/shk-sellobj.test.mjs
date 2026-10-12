import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SELL_DONTSELL, SELL_NORMAL } from '../js/const.js';
import { donate_gold, shk_globals_init } from '../js/shk.js';

const C_SHK = readFileSync('nethack-c/upstream/src/shk.c', 'utf8');
const C_DOTHROW = readFileSync('nethack-c/upstream/src/dothrow.c', 'utf8');
const C_DECL = readFileSync('nethack-c/upstream/src/decl.c', 'utf8');
const JS_SHK = readFileSync('js/shk.js', 'utf8');
const JS_DOTHROW = readFileSync('js/dothrow.js', 'utf8');

test('shop startup installs the C automatic sale defaults before the first sale', () => {
    // decl.c initializes the response to 'a' and the mode to SELL_NORMAL,
    // so an owned projectile can sell before any drop or container command.
    assert.match(C_DECL,
        /'a',\s*\/\* sell_response \*\/\s*SELL_NORMAL,\s*\/\* sell_how \*\//u);
    const state = {};
    shk_globals_init(state);
    assert.equal(state.gs.sell_response, 'a');
    assert.equal(state.gs.sell_how, SELL_NORMAL);

    // A previous game's rejected sale must not carry into the next startup.
    state.gs.sell_response = 'n';
    state.gs.sell_how = SELL_DONTSELL;
    shk_globals_init(state);
    assert.equal(state.gs.sell_response, 'a');
    assert.equal(state.gs.sell_how, SELL_NORMAL);
});

test('donate_gold reduces the loan and debt before reporting partial payment', async () => {
    // C ref: shk.c donate_gold() (3877-3910). A 5 zorkmid drop pays part of a
    // 10 zorkmid debt and reduces the larger 15 zorkmid carried loan by 5.
    const keeper = { mextra: { eshk: { debit: 10, loan: 15, credit: 0 } } };
    const state = { u: { uprops: {}, uroleplay: {} } };
    const messages = [];

    await donate_gold(5, keeper, true, state, {
        message: async (text) => messages.push(text),
    });

    assert.deepEqual(keeper.mextra.eshk, { debit: 5, loan: 10, credit: 0 });
    assert.deepEqual(messages, ['Your debt is partially paid off.']);
});

test('sellobj and check_shop_obj retain every active C dispatch branch', () => {
    // These assertions pin the source functions and the six check_shop_obj()
    // calls while the admitted v47 replay checks the live sale prompt path.
    const sellobj = C_SHK.slice(C_SHK.indexOf('\nsellobj('));
    assert.match(sellobj, /contained_cost\(obj, shkp, cltmp, TRUE, FALSE\)/u);
    assert.match(sellobj, /special_stock\(obj, shkp, FALSE\)/u);
    assert.match(sellobj, /donate_gold\(gltmp, shkp, TRUE\)/u);
    assert.match(sellobj, /case 'a':[\s\S]*?case 'y':/u);
    assert.match(JS_SHK, /export async function sellobj\(/u);
    assert.match(JS_SHK, /function dropped_container\(/u);
    assert.match(JS_SHK, /async function special_stock\(/u);
    assert.match(JS_SHK, /export async function donate_gold\(/u);

    const helperStart = C_DOTHROW.indexOf('\ncheck_shop_obj(');
    const helperEnd = C_DOTHROW.indexOf('\n/* Will ', helperStart);
    const helper = C_DOTHROW.slice(helperStart, helperEnd);
    assert.match(helper, /stolen_value\(obj, u\.ux, u\.uy/u);
    assert.match(helper, /subfrombill\(obj, shkp\);[\s\S]*?donate_gold\(gtg, shkp, TRUE\)/u);
    const activeCalls = C_DOTHROW.match(/check_shop_obj\(obj,/gu) ?? [];
    assert.equal(activeCalls.length, 6);
    assert.match(JS_DOTHROW, /async function check_shop_obj\(/u);
    assert.doesNotMatch(JS_DOTHROW, /note_unported\('dothrow\.c check_shop_obj'\)/u);
});
