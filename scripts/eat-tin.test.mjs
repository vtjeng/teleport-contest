import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CQ_CANNED,
    ECMD_TIME,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    HOMEMADE_TIN,
    NON_PM,
    OBJ_INVENT,
    ROTTEN_TIN,
    RANDOM_TIN,
} from '../js/const.js';
import {
    set_tin_variety,
    tin_details,
    tinopen_ok,
    use_tin_opener,
} from '../js/eat.js';
import {
    PM_HUMAN,
    PM_KOBOLD,
    PM_LIZARD,
    monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { cmdq_add_key } from '../js/cmd.js';
import { newObject } from '../js/obj.js';
import { objects_globals_init, AXE, DAGGER, TIN, TIN_OPENER } from '../js/objects.js';

const EAT_C = readFileSync(
    new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8',
);

function initializedState() {
    const state = {};
    monst_globals_init(state);
    return state;
}

function tinOpenerState(otyp) {
    const state = {
        context: { ident: 2, current_fruit: 1 },
        flags: {
            implicit_uncursed: true,
            initalign: 0,
            invlet_constant: true,
        },
        iflags: { override_ID: false, pricequotes: false },
        program_state: { gameover: false, in_moveloop: false },
        u: { umonnum: PM_HUMAN, uprops: [] },
        disp: {},
    };
    objects_globals_init(state);
    init_objects(state, () => 0);
    monst_globals_init(state);
    state.youmonst = { data: state.mons[PM_HUMAN] };

    const openerType = state.objects[otyp];
    const opener = newObject({
        corpsenm: NON_PM,
        oclass: openerType.oc_class,
        otyp,
        quan: 1,
        invlet: 'a',
        where: OBJ_INVENT,
        dknown: true,
    });
    const tinType = state.objects[TIN];
    const tin = newObject({
        corpsenm: NON_PM,
        oclass: tinType.oc_class,
        otyp: TIN,
        quan: 1,
        invlet: 'b',
        where: OBJ_INVENT,
    });
    opener.nobj = tin;
    state.invent = opener;
    state.uwep = opener;
    cmdq_add_key(CQ_CANNED, 'b'.charCodeAt(0), state);
    return { state, opener };
}

test('tinopen_ok is the source getobj filter for tins', () => {
    assert.match(EAT_C, /tinopen_ok\(struct obj \*obj\)[\s\S]*?obj->otyp == TIN/u);
    assert.equal(tinopen_ok(null), GETOBJ_EXCLUDE);
    assert.equal(tinopen_ok({ otyp: TIN }), GETOBJ_SUGGEST);
    assert.equal(tinopen_ok({ otyp: TIN + 1 }), GETOBJ_EXCLUDE);
});

test('tin_details keeps source placement for known and hidden tin varieties', () => {
    assert.match(EAT_C, /void\s+tin_details\(struct obj \*obj, int mnum, char \*buf\)/u);
    const state = initializedState();
    const rotten = { corpsenm: PM_KOBOLD, spe: -(ROTTEN_TIN + 1), cknown: true };
    const homemade = { corpsenm: PM_KOBOLD, spe: -(HOMEMADE_TIN + 1), cknown: true };
    const spinach = { corpsenm: NON_PM, spe: 1, cknown: true };
    const hidden = { corpsenm: PM_KOBOLD, spe: -(ROTTEN_TIN + 1), cknown: false };

    assert.equal(tin_details(rotten, PM_KOBOLD, 'tin', { state }),
        'rotten tin of kobold meat');
    assert.equal(tin_details(homemade, PM_KOBOLD, 'tin', { state }),
        'homemade tin of kobold meat');
    assert.equal(tin_details(spinach, NON_PM, 'tin', { state }),
        'tin of spinach');
    assert.equal(tin_details(hidden, PM_KOBOLD, 'tin', { state }),
        'tin of kobold meat');
    assert.equal(tin_details({ corpsenm: PM_KOBOLD, spe: 0 }, NON_PM,
        'tin', { state, random: { rn2: () => 0 } }), 'empty tin');
});


test('set_tin_variety uses C’s final random arm for an unrecognized force', () => {
    assert.match(EAT_C, /else\s*\{[^}]*rn2\(TTSZ - 1\)/u);
    const tin = { corpsenm: PM_LIZARD, spe: 0 };
    const calls = [];
    set_tin_variety(tin, RANDOM_TIN + 100, {
        state: initializedState(),
        random: { rn2(bound) { calls.push(bound); return 0; } },
    });
    assert.deepEqual(calls, [15]);
    // C remaps rotten to homemade for species whose corpses do not rot.
    assert.equal(tin.spe, -(HOMEMADE_TIN + 1));
});

test('start_tin names carried openers with eat.c yobjnam wording', async () => {
    assert.match(EAT_C,
        /pline\("Using %s you try to open the tin\."\s*,\s*yobjnam\(uwep,\s*\(char \*\) 0\)\)/u);

    async function useOpener(otyp) {
        const { state, opener } = tinOpenerState(otyp);
        const messages = [];
        const randomBounds = [];
        const result = await use_tin_opener(opener, state, {
            message: async (text) => { messages.push(text); },
            random: {
                rn2(bound) {
                    randomBounds.push(bound);
                    return 1;
                },
            },
        });
        assert.equal(result, ECMD_TIME);
        assert.equal(state.go.occtxt, 'opening the tin');
        return { messages, randomBounds };
    }

    const tinOpener = await useOpener(TIN_OPENER);
    assert.deepEqual(tinOpener.messages,
        ['Using your tin opener you try to open the tin.']);
    assert.deepEqual(tinOpener.randomBounds, [2]);

    // The same source arm covers ordinary opener weapons without adding an
    // RNG call; yobjnam supplies their carried-item possessive as well.
    const dagger = await useOpener(DAGGER);
    assert.deepEqual(dagger.messages,
        ['Using your dagger you try to open the tin.']);
    assert.deepEqual(dagger.randomBounds, []);

    const axe = await useOpener(AXE);
    assert.deepEqual(axe.messages,
        ['Using your axe you try to open the tin.']);
    assert.deepEqual(axe.randomBounds, []);
});
