import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFUSION, OBJ_INVENT, W_ARM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    ARMOR_CLASS, LEATHER_ARMOR, SCR_ENCHANT_ARMOR, SCROLL_CLASS,
} from '../js/objects.js';
import { seffect_enchant_armor, seffects } from '../js/read.js';
import { newObject } from '../js/obj.js';

async function freshWorld(seed) {
    await runSegment({
        seed,
        datetime: '20310928111713',
        nethackrc: [
            'OPTIONS=name:Enchant,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '. ',
    });

    for (const slot of ['uarm', 'uarmc', 'uarmu', 'uarmh', 'uarmg', 'uarmf', 'uarms'])
        game[slot] = null;
    game.invent = null;
    game.gk = {};
    game.flags.beginner = false;
    game._pending_message = '';
}

function armor(extra = {}) {
    return newObject({
        otyp: LEATHER_ARMOR,
        oclass: ARMOR_CLASS,
        where: OBJ_INVENT,
        quan: 1,
        known: false,
        blessed: false,
        cursed: false,
        spe: 0,
        ...extra,
    });
}

function scroll(extra = {}) {
    return newObject({
        otyp: SCR_ENCHANT_ARMOR,
        oclass: SCROLL_CLASS,
        where: OBJ_INVENT,
        quan: 1,
        dknown: false,
        blessed: false,
        cursed: false,
        ...extra,
    });
}

test('read.c seffects dispatches normal enchant armor in source RNG order',
    async () => {
        await freshWorld(9083701);
        const bodyArmor = armor();
        const enchantScroll = scroll();
        game.invent = enchantScroll;
        enchantScroll.nobj = bodyArmor;
        bodyArmor.where = OBJ_INVENT;
        game.uarm = bodyArmor;
        game.uarm.owornmask = W_ARM;

        const calls = [];
        const random = {
            rn2(bound) { calls.push(['rn2', bound]); return 0; },
            rnd(bound) { calls.push(['rnd', bound]); return 1; },
        };
        const consumed = await seffects(enchantScroll, game, { random });

        // seffects() first exercises Wisdom (rn2(19)); nonmagical armor then
        // gives s=3 and seffect_enchant_armor() calls rnd(3).
        assert.deepEqual(calls, [['rn2', 19], ['rnd', 3]]);
        assert.equal(bodyArmor.spe, 1);
        assert.equal(consumed, 0);
        assert.equal(game.gk.known, false);
    });

test('confused cursed enchant armor removes erosion proof without enchanting',
    async () => {
        await freshWorld(9083702);
        const bodyArmor = armor({ oerodeproof: true, oeroded: 1 });
        const enchantScroll = scroll({ cursed: true });
        game.invent = enchantScroll;
        enchantScroll.nobj = bodyArmor;
        game.uarm = bodyArmor;
        bodyArmor.owornmask = W_ARM;
        game.u.uprops[CONFUSION] = { intrinsic: 1, extrinsic: 0 };

        const calls = [];
        await seffect_enchant_armor(enchantScroll, game, {
            random: {
                rn2(bound) { calls.push(bound); return 0; },
                rnd() { assert.fail('confused branch has no enchantment roll'); },
            },
        });

        assert.deepEqual(calls, []);
        assert.equal(bodyArmor.oerodeproof, false);
        assert.equal(bodyArmor.oeroded, 1);
        assert.equal(bodyArmor.spe, 0);
        assert.equal(bodyArmor.rknown, true);
    });

test('no-armor enchant scroll follows strange_feeling consumed-pointer contract',
    async () => {
        await freshWorld(9083703);
        const enchantScroll = scroll();
        game.invent = enchantScroll;

        const consumed = await seffects(enchantScroll, game, {
            random: {
                rn2() { return 0; },
                rnd() { assert.fail('no-armor branch has no enchantment roll'); },
            },
        });

        assert.equal(consumed, 1);
        assert.equal(game.invent, null);
        assert.match(game._pending_message, /skin glows then fades/u);
    });
