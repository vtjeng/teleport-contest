#!/usr/bin/env node

// Independent ordinary shop entry and pick_obj/addtobill recordings. The
// entrance-column teleport avoids the separately blocked interior redraw;
// all shop entry, stock pickup, billing and inventory feedback run live.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEAF, OBJ_INVENT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { FOOD_RATION, POT_OBJECT_DETECTION } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadShopBillingRecipes() {
    return ['potion', 'food', 'deaf'].map(label => ({
        label: `shop pickup ${label}`,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/pickup.c/shop-${label}.session.json`, import.meta.url,
        ), 'utf8')),
    }));
}

export async function verifyShopBillingSegment(segment) {
    let boundary = null;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const food = segment.moves.includes('lkkkkkk. ');
    const expectedType = food ? FOOD_RATION : POT_OBJECT_DETECTION;
    let stock = game.invent;
    while (stock && !(stock.unpaid && stock.otyp === expectedType)) stock = stock.nobj;
    assert.ok(stock, 'recipe must actually acquire the expected unpaid shop stock');
    assert.equal(stock.where, OBJ_INVENT);
    assert.equal(stock.quan, 1);
    const room = game.level.rooms.find(room => room.resident?.isshk);
    const bill = room.resident.mextra.eshk;
    assert.equal(bill.billct, 1);
    assert.equal(bill.bill_p[0].bo_id, stock.o_id);
    assert.equal(bill.bill_p[0].bquan, stock.quan);
    if (segment.moves.includes('#wizintrinsic'))
        assert.ok(game.u.uprops[DEAF].intrinsic);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
}

export async function runShopBillingMatrix() {
    return runFreshMatrix({ entries: loadShopBillingRecipes(),
        summaryLabel: 'SHOP BILLING', verifySegment: verifyShopBillingSegment });
}

runMatrixCli(import.meta.url, runShopBillingMatrix, 'shop billing');
