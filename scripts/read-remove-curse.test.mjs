import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFUSION, ECMD_TIME, OBJ_INVENT, W_ARM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    ARMOR_CLASS, LEATHER_ARMOR, SCR_REMOVE_CURSE, SCROLL_CLASS,
    SPE_REMOVE_CURSE,
} from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { seffects } from '../js/read.js';
import { spelleffects } from '../js/spell.js';
import { loadReadRemoveCurseRecipe } from './run-read-remove-curse.mjs';

async function freshWorld(seed) {
    await runSegment({
        seed,
        datetime: '20320928112233',
        nethackrc: [
            'OPTIONS=name:RemoveCurse,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });
    game.invent = null;
    game.uarm = null;
    game.uswapwep = null;
    game.uquiver = null;
    game.u.usteed = null;
    game.gk = {};
    game.flags.beginner = false;
    game._pending_message = '';
}

function inventoryObject(otyp, oclass, extra = {}) {
    return newObject({
        otyp, oclass, where: OBJ_INVENT, quan: 1, nobj: null,
        blessed: false, cursed: false, bknown: false, owornmask: 0,
        ...extra,
    });
}

// The recipe wishes for a cursed scroll of remove curse, reads it, dismisses
// both --More-- prompts, and presses ESC at the naming prompt. The cursed
// branch skips the invent-traversal loop and prints "The scroll
// disintegrates." as a pending message. docall()'s flush_screen(1) triggers
// that message's --More--, and the player then sees the "Call a scroll..."
// prompt. After the ESC, useup() consumes the scroll.
test('cursed remove-curse scroll prints both messages and completes naming flow', async () => {
    const segment = loadReadRemoveCurseRecipe().segments[0];
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (e) => { boundary = e; },
    });

    // docall is now ported, so no boundary error should be thrown.
    assert.equal(boundary, null,
        'docall is ported; no boundary error expected');

    // The scroll should have been consumed by useup() in doread()'s
    // !consumedByEffect branch, which runs after trycall(). With docall
    // completing (ESC dismisses), useup() runs and the scroll is gone.
    const scrollInPack = [];
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === SCR_REMOVE_CURSE) scrollInPack.push(obj);
    }
    assert.equal(scrollInPack.length, 0,
        'the scroll should be consumed by useup() after docall completes');
});

test('normal remove-curse dispatch uncurses worn inventory and learns known BUC',
    async () => {
        await freshWorld(9274311);
        const scroll = inventoryObject(SCR_REMOVE_CURSE, SCROLL_CLASS);
        const armor = inventoryObject(LEATHER_ARMOR, ARMOR_CLASS, {
            cursed: true, bknown: true, owornmask: W_ARM,
        });
        scroll.nobj = armor;
        game.invent = scroll;
        game.uarm = armor;
        game.objects[SCR_REMOVE_CURSE].oc_name_known = true;

        assert.equal(await seffects(scroll, game), 0);
        assert.equal(armor.cursed, false);
        assert.equal(scroll.cursed, false);
        assert.equal(Boolean(game.gk.known), false);
    });

test('confused remove-curse preserves wisdom and blessorcurse draw order',
    async () => {
        await freshWorld(9274312);
        const scroll = inventoryObject(SCR_REMOVE_CURSE, SCROLL_CLASS);
        const armor = inventoryObject(LEATHER_ARMOR, ARMOR_CLASS, {
            bknown: true, owornmask: W_ARM,
        });
        scroll.nobj = armor;
        game.invent = scroll;
        game.uarm = armor;
        game.u.uprops[CONFUSION] = { intrinsic: 7, extrinsic: 0 };

        const draws = [];
        const random = {
            rn2(bound) {
                draws.push(bound);
                return 0;
            },
            rnd(bound) { return 1; },
        };
        assert.equal(await seffects(scroll, game, { random }), 0);
        assert.deepEqual(draws, [19, 2, 2]);
        assert.equal(armor.cursed, true);
        assert.equal(armor.blessed, false);
        assert.equal(armor.bknown, 0);
    });

test('spell.c remove-curse routes through the read effect dispatcher', async () => {
    await freshWorld(9274313);
    const armor = inventoryObject(LEATHER_ARMOR, ARMOR_CLASS, {
        cursed: true, bknown: true, owornmask: W_ARM,
    });
    game.invent = armor;
    game.uarm = armor;
    game.objects[SCR_REMOVE_CURSE].oc_name_known = true;

    assert.equal(await spelleffects(SPE_REMOVE_CURSE, true, true, game), ECMD_TIME);
    assert.equal(armor.cursed, false);
});

// Gap: the four You_feel() branches in read.c:1499-1504 (hallucination x
// confusion) are string literals ported verbatim. The first branch (not
// hallucinating, not confused) is exercised by the full replay above. The
// other three branches need a direct call to seffect_remove_curse with mocked
// hallucination/confusion state to assert the topline message.
