import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DEAF,
    HALLUC,
    HALLUC_RES,
    PLNMSG_enum,
    STRANGLED,
} from '../js/const.js';
import * as M from '../js/monsters.js';
import { TIN_WHISTLE, objects_globals_init } from '../js/objects.js';
import { init_objects } from '../js/o_init.js';
import {
    magic_whistled,
    use_magic_whistle,
    use_whistle,
} from '../js/apply.js';

function whistleState({ deaf = false, underwater = false, stasis = 0 } = {}) {
    const youmonst = {
        data: {
            pmidx: M.PM_HUMAN,
            msound: 11, // monflag.h MS_GRUNT
            mflags1: 0,
            msize: 2,
            mlet: M.S_HUMAN,
        },
        mx: 10,
        my: 10,
    };
    const properties = Object.fromEntries(
        [DEAF, HALLUC, HALLUC_RES, STRANGLED].map(index => [index, {
            intrinsic: 0,
            extrinsic: 0,
            blocked: 0,
        }]),
    );
    properties[DEAF].intrinsic = Number(deaf);
    const state = {
        youmonst,
        u: { uprops: properties, uinwater: Number(underwater), uroleplay: {} },
        level: { monlist: null, flags: { stasis_until: stasis } },
        iflags: { last_msg: 0 },
        moves: 10,
    };
    objects_globals_init(state);
    init_objects(state, () => 0);
    return state;
}

function tinWhistle(state, overrides = {}) {
    return {
        otyp: TIN_WHISTLE,
        oclass: state.objects[TIN_WHISTLE].oc_class,
        quan: 1,
        dknown: 1,
        ...overrides,
    };
}

test('PLNMSG_enum is the final sequential pline message sentinel in flag.h', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/include/flag.h', import.meta.url),
        'utf8',
    );
    const start = source.indexOf('enum plnmsg_types {');
    const end = source.indexOf('};', start);
    const names = [...source.slice(start, end).matchAll(/\bPLNMSG_[A-Za-z0-9_]+\b/g)]
        .map((match) => match[0]);
    assert.equal(names.at(-1), 'PLNMSG_enum');
    assert.equal(names[names.length - 2], 'PLNMSG_MON_TAKES_OFF_ITEM');
    assert.equal(PLNMSG_enum, 12);
});

test('use_whistle follows can-blow, normal-message, and wake order', async () => {
    const state = whistleState();
    const events = [];
    await use_whistle(tinWhistle(state), state, {
        message: async line => events.push(['message', line]),
        wakeNearby: async petcall => events.push(['wake', petcall]),
    });
    assert.deepEqual(events, [
        ['message', 'You produce a high whistling sound.'],
        ['wake', true],
    ]);

    const incapable = whistleState();
    incapable.youmonst.data.msound = 0; // monflag.h MS_SILENT
    incapable.youmonst.data.mflags1 = M.M1_BREATHLESS;
    const failed = [];
    await use_whistle(tinWhistle(incapable), incapable, {
        message: async line => failed.push(line),
        wakeNearby: async () => assert.fail('incapable hero cannot wake pets'),
    });
    assert.deepEqual(failed, ['You are incapable of using the whistle.']);
});

test('ordinary whistles do not wake underwater and deaf whistles still do', async () => {
    const underwater = whistleState({ underwater: true });
    const waterEvents = [];
    await use_whistle(tinWhistle(underwater), underwater, {
        message: async line => waterEvents.push(['message', line]),
        wakeNearby: async () => assert.fail('bubbles do not wake pets'),
    });
    assert.equal(waterEvents.length, 1);
    assert.match(waterEvents[0][1], /^You blow bubbles through /);

    const deaf = whistleState({ deaf: true });
    const deafEvents = [];
    await use_whistle(tinWhistle(deaf), deaf, {
        message: async line => deafEvents.push(['message', line]),
        wakeNearby: async petcall => deafEvents.push(['wake', petcall]),
    });
    assert.equal(deafEvents.length, 2);
    assert.equal(deafEvents[0][0], 'message');
    assert.match(deafEvents[0][1], /^You feel rushing air tickle your /);
    assert.deepEqual(deafEvents[1], ['wake', true]);
});

test('use_magic_whistle preserves cursed vibration draws before relocation', async () => {
    const state = whistleState();
    const events = [];
    const draws = [0, 1];
    await use_magic_whistle({ cursed: true }, state, {
        random: { rn2: bound => {
            assert.equal(bound, 2);
            return draws.shift();
        } },
        message: async line => events.push(['message', line]),
        wakeNearby: async petcall => events.push(['wake', petcall]),
        teleToRndPet: async () => assert.fail('second draw suppresses relocation'),
    });
    assert.deepEqual(events, [
        ['message', 'You produce a high-pitched humming noise.'],
        ['wake', true],
    ]);
    assert.deepEqual(draws, []);
});

test('magic_whistled returns before pet traversal during stasis', async () => {
    const state = whistleState({ stasis: 11 });
    const object = tinWhistle(state);
    const knownBefore = state.objects[TIN_WHISTLE].oc_name_known;
    await magic_whistled(object, state, {
        message: async () => assert.fail('stasis suppresses whistle output'),
    });
    assert.equal(state.objects[TIN_WHISTLE].oc_name_known, knownBefore);
});
