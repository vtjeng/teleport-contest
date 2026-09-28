import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GETOBJ_EXCLUDE, GETOBJ_SUGGEST, W_ARM, W_ARMOR, W_WEP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    any_worn_armor_ok, count_worn_armor,
} from '../js/do_wear.js';
import { actualoname, an } from '../js/objnam.js';
import { SCR_DESTROY_ARMOR, SCROLL_CLASS } from '../js/objects.js';

test('do_wear.c armor count and getobj filter match their source predicates', () => {
    const armor = { owornmask: W_ARM };
    const covered = { owornmask: W_ARM << 1 };
    const state = {
        uarm: armor,
        uarmc: covered,
        uarmh: null,
        uarms: { owornmask: W_ARM << 3 },
        uarmg: null,
        uarmf: null,
        uarmu: undefined,
    };

    // do_wear.c:3489-3501 counts exactly the seven worn armor slots.
    assert.equal(count_worn_armor(state), 3);
    // do_wear.c:3480-3486 suggests every W_ARMOR slot, including gear hidden
    // beneath another piece, and excludes non-armor inventory objects.
    assert.equal(any_worn_armor_ok(armor), GETOBJ_SUGGEST);
    assert.equal(any_worn_armor_ok(covered), GETOBJ_SUGGEST);
    assert.equal(any_worn_armor_ok({ owornmask: W_WEP }), GETOBJ_EXCLUDE);
    assert.equal(any_worn_armor_ok(null), GETOBJ_EXCLUDE);
    assert.equal(W_ARMOR & covered.owornmask, covered.owornmask);
});

test('objnam.c actualoname supplies the blessed-choice message name', async () => {
    await runSegment({
        seed: 8854001,
        datetime: '20310908070605',
        nethackrc: [
            'OPTIONS=name:Armor,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });
    const scroll = {
        otyp: SCR_DESTROY_ARMOR,
        oclass: SCROLL_CLASS,
        dknown: 0,
        known: 0,
        quan: 1,
    };

    const name = actualoname(scroll, game);
    assert.equal(name, 'scroll of destroy armor');
    assert.equal(an(name, game), 'a scroll of destroy armor');
    assert.equal(game.iflags.override_ID, false,
        'actualoname clears the temporary C identification override');
});
