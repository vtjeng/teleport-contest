#!/usr/bin/env node

// Independent source payment cases. Bounded scan 8510300–8510349 found
// three generated D:5 shops in 11 replays; selected 8510304. The healer's two
// startup acknowledgements matter: an earlier unacknowledged scan never
// left D:1 and supplies no shop evidence. Every case must acquire stock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { money_cnt } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { ELVEN_CLOAK, JUMPING_BOOTS } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadShopPaymentRecipes() {
    return ['boots-menu', 'cloak-menu', 'boots-traditional', 'boots-cancel',
        'boots-extended', 'boots-counted']
        .map(label => ({ label: `pay ${label}`, recipe: JSON.parse(readFileSync(
            new URL(`../recipes/shk.c/pay-${label}.session.json`, import.meta.url), 'utf8')) }));
}

export async function verifyShopPaymentSegment(segment) {
    let boundary = null;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const type = segment.moves.includes('kkkkk.') ? JUMPING_BOOTS : ELVEN_CLOAK;
    let stock = game.invent;
    while (stock && stock.otyp !== type) stock = stock.nobj;
    assert.ok(stock, 'payment case must actually acquire the intended shop stock');
    const cancelled = segment.moves.includes('p\u001b');
    const keeper = game.level.rooms.find(room => room.resident?.isshk).resident;
    const bill = keeper.mextra.eshk;
    assert.equal(Boolean(stock.unpaid), cancelled);
    assert.equal(bill.billct, cancelled ? 1 : 0);
    if (cancelled) assert.equal(bill.bill_p[0].bo_id, stock.o_id);
    else assert.ok(money_cnt(game.invent) < game.u.umoney0,
        'a completed payment must transfer actual starting gold');
    assert.equal(game.nhDisplay.inputQueueLength, 0);
}

export async function runShopPaymentMatrix() {
    return runFreshMatrix({ entries: loadShopPaymentRecipes(),
        summaryLabel: 'SHOP PAYMENT', verifySegment: verifyShopPaymentSegment });
}

runMatrixCli(import.meta.url, runShopPaymentMatrix, 'shop payment');
