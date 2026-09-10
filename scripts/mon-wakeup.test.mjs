// Direct tests for mon.c wakeup() and setmangry(), which uhitm.c missum()
// reaches on every melee attempt that does not land. A live game only ever
// shows the hostile path through them; the arms below are the ones it does
// not.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE,
    DUST,
    IN_SIGHT,
    M_AP_NOTHING,
    M_AP_OBJECT,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { setmangry, wakeup } from '../js/mon.js';
import { newMonster } from '../js/monst.js';
import { PM_HUMAN, PM_LICHEN } from '../js/monsters.js';

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Wake,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7700376, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    return game;
}

function target(overrides = {}) {
    return newMonster({
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 3,
        mhpmax: 3,
        mcanmove: 1,
        // monmove.c onscary()'s Elbereth arm needs a target that can see the
        // engraving, which newMonster() leaves clear.
        mcansee: 1,
        data: game.mons[PM_LICHEN],
        ...overrides,
    });
}

function engraveElbereth(text = 'Elbereth') {
    game.head_engr = {
        engr_x: game.u.ux,
        engr_y: game.u.uy,
        engr_txt: [text],
        engr_type: DUST,
        engr_time: 0,
        nxt_engr: null,
    };
}

function reactionEnv() {
    const messages = [];
    const draws = [];
    return {
        state: game,
        messages,
        draws,
        message: async (text) => { messages.push(text); },
        canSeeMonster: () => true,
        random: {
            rn2(bound) {
                draws.push(`rn2(${bound})`);
                return 0;
            },
            rnd(bound) {
                draws.push(`rnd(${bound})`);
                return 1;
            },
        },
    };
}

// mon.c:4288-4290. A hostile target gets the wait-strategy clear and nothing
// else; C returns at 4290 before the peaceful arm.
test('setmangry clears a hostile wait strategy and returns', async () => {
    await hero();
    const hostile = target({ mstrategy: STRAT_WAITMASK | 0x40 });
    await setmangry(hostile, true, reactionEnv());
    assert.equal(hostile.mstrategy, 0x40);
    assert.equal(Boolean(hostile.mpeaceful), false);
});

// mon.c:4294-4317 returns for a pet before the alignment penalty, while a
// peaceful non-pet becomes hostile and adjusts alignment.
test('setmangry preserves pets and angers peaceful non-pets',
    async () => {
        await hero();
        const pet = target({ mpeaceful: 1, mtame: 1, mstrategy: STRAT_WAITFORU });
        await setmangry(pet, true, reactionEnv());
        assert.equal(pet.mstrategy, 0);
        assert.equal(pet.mpeaceful, 1);

        const peaceful = target({ mpeaceful: 1 });
        const before = game.u.ualign.record;
        await setmangry(peaceful, true, reactionEnv());
        assert.equal(peaceful.mpeaceful, 0);
        assert.equal(game.u.ualign.record, before - 1);
    });

// mon.c:4267-4270. All three terms matter: the attack has to be the cause, the
// square has to carry exactly "Elbereth", and the target has to be one that
// respects it or a peaceful one.
test('setmangry applies the Elbereth hypocrisy branch in source order',
    async () => {
        await hero();
        engraveElbereth();
        const env = reactionEnv();
        const peaceful = target({ mpeaceful: 1 });
        const before = game.u.ualign.record;
        await setmangry(peaceful, true, env);
        assert.deepEqual(env.messages.slice(0, 2), [
            'You feel like a hypocrite.',
            'The engraving beneath you fades.',
        ]);
        assert.deepEqual(env.draws, ['rnd(5)']);
        assert.equal(game.u.ualign.record, before - 2);
        assert.equal(game.head_engr, null);

        // engrave.c sengr_at() uses a strict comparison. A longer engraving
        // does not trigger the hypocrisy arm, but the peaceful target still
        // becomes hostile through setmangry()'s later branch.
        engraveElbereth('Elbereth burns');
        const ordinary = target({ mpeaceful: 1 });
        const secondEnv = reactionEnv();
        await setmangry(ordinary, true, secondEnv);
        assert.equal(ordinary.mpeaceful, 0);
        assert.equal(secondEnv.messages.includes('You feel like a hypocrite.'), false);
        game.head_engr = null;
    });

// mon.c:4350-4362. via_attack is what turns waking into angering; without it
// the target keeps its wait strategy.
test('wakeup angers only when the attack caused it', async () => {
    await hero();
    const angered = target({ mstrategy: STRAT_WAITFORU });
    await wakeup(angered, true, reactionEnv());
    assert.equal(angered.mstrategy, 0);
    assert.equal(angered.msleeping, 0);

    const woken = target({ mstrategy: STRAT_WAITFORU, msleeping: 1 });
    await wakeup(woken, false, reactionEnv());
    assert.equal(woken.mstrategy, STRAT_WAITFORU);
    assert.equal(woken.msleeping, 0);
});

// mon.c:4339-4343. wakeup() calls seemimic() for a disguised monster
// (m_ap_type other than M_AP_NOTHING or M_AP_MONSTER), stripping the
// disguise so the player sees the real monster.
test('wakeup strips a mimic disguise through seemimic', async () => {
    await hero();
    const mimic = target({
        m_ap_type: M_AP_OBJECT, // disguised as an object
        mappearance: 42,        // arbitrary object type
    });
    await wakeup(mimic, true, reactionEnv());
    // seemimic clears m_ap_type to M_AP_NOTHING and mappearance to 0.
    assert.equal(mimic.m_ap_type, M_AP_NOTHING);
    assert.equal(mimic.mappearance, 0);
});

test('wakeup grows sleeping monsters and preserves the prior peaceful flag', async () => {
    await hero();
    const asleep = target({ msleeping: 1 });
    await wakeup(asleep, true, reactionEnv());
    assert.equal(asleep.msleeping, 0);
    assert.equal(asleep.mstrategy, 0);

    // mon.c:4356-4361 remembers peacefulness before setmangry(); the helper
    // calls are then considered even when the tame priest/shopkeeper remains
    // peaceful. The discarded-result gaps are recorded by note_unported().
    const priest = target({ mpeaceful: 1, mtame: 1, ispriest: 1 });
    await wakeup(priest, true, reactionEnv());
    assert.equal(priest.mpeaceful, 1);
    const shopkeeper = target({ mpeaceful: 1, mtame: 1, isshk: 1 });
    await wakeup(shopkeeper, true, reactionEnv());
    assert.equal(shopkeeper.mpeaceful, 1);
    await wakeup(target({ mpeaceful: 1, mtame: 1 }), true, reactionEnv());
});

// mon.c:4355. wakeup() passes TRUE, not its own via_attack, so a target woken
// by an attack on an Elbereth square reaches setmangry()'s hypocrisy arm.
test('wakeup angers through setmangry with the attack flag set', async () => {
    await hero();
    engraveElbereth();
    const env = reactionEnv();
    await wakeup(target({ mpeaceful: 1 }), true, env);
    assert.equal(env.messages[0], 'You feel like a hypocrite.');
    game.head_engr = null;
});

// mon.c:4344-4348, the force-fight reveal. Nothing in this port sets
// context.forcefight, so this is the only place the arm runs.
test('wakeup reveals a hidden target only under a force-fight', async () => {
    await hero();
    const hidden = target({ mundetected: 1 });
    await wakeup(hidden, false, reactionEnv());
    assert.equal(hidden.mundetected, 1);

    game.context.forcefight = 1;
    await wakeup(hidden, false, reactionEnv());
    assert.equal(hidden.mundetected, 0);

    // svc.context.mon_moving suppresses it again.
    const other = target({ mundetected: 1 });
    game.context.mon_moving = 1;
    await wakeup(other, false, reactionEnv());
    assert.equal(other.mundetected, 1);
    game.context.mon_moving = 0;
    game.context.forcefight = 0;
});
