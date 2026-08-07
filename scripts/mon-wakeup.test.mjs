// Direct tests for mon.c wakeup() and setmangry(), which uhitm.c missum()
// reaches on every melee attempt that does not land. A live game only ever
// shows the hostile path through them; the arms below are the ones it does
// not.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DUST, STRAT_WAITFORU, STRAT_WAITMASK } from '../js/const.js';
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

const REFUSING = {
    unsupported: (reason) => { throw new Error(reason); },
    message: async () => {},
};

function refuses(fn, reason) {
    return assert.rejects(fn, (error) => {
        assert.equal(error.message, reason);
        return true;
    });
}

// mon.c:4288-4290. A hostile target gets the wait-strategy clear and nothing
// else; C returns at 4290 before the peaceful arm.
test('setmangry clears a hostile wait strategy and returns', async () => {
    await hero();
    const hostile = target({ mstrategy: STRAT_WAITMASK | 0x40 });
    setmangry(hostile, true, { ...REFUSING, state: game });
    assert.equal(hostile.mstrategy, 0x40);
    assert.equal(Boolean(hostile.mpeaceful), false);
});

// mon.c:4294-4295 returns for a pet before the alignment penalty, so only a
// peaceful non-pet reaches the arm that stops.
test('setmangry stops for a peaceful non-pet and passes a pet through',
    async () => {
        await hero();
        const pet = target({ mpeaceful: 1, mtame: 1, mstrategy: STRAT_WAITFORU });
        setmangry(pet, true, { ...REFUSING, state: game });
        assert.equal(pet.mstrategy, 0);
        assert.equal(pet.mpeaceful, 1);

        assert.throws(
            () => setmangry(target({ mpeaceful: 1 }), true,
                { ...REFUSING, state: game }),
            (error) => {
                assert.equal(error.message, 'angering a peaceful monster');
                return true;
            },
        );
    });

// The owner seam both functions share. setmangry() is the anger path, not the
// waking path, so a caller that forgot to supply the operation has to be told
// which function wanted it rather than be sent looking at wakeup().
test('a missing owner names the function that asked for it', async () => {
    await hero();
    engraveElbereth();
    assert.throws(
        // No `unsupported` in the env, so the Elbereth arm cannot report.
        () => setmangry(target(), true, { state: game }),
        (error) => {
            assert.ok(error instanceof TypeError);
            assert.equal(
                error.message,
                'setmangry()/wakeup() requires unsupported',
            );
            return true;
        },
    );
});

// mon.c:4267-4270. All three terms matter: the attack has to be the cause, the
// square has to carry exactly "Elbereth", and the target has to be one that
// respects it or a peaceful one.
test('setmangry stops on an Elbereth square only when every term holds',
    async () => {
        await hero();
        engraveElbereth();
        const env = { ...REFUSING, state: game };

        assert.throws(
            () => setmangry(target(), true, env),
            (error) => {
                assert.equal(
                    error.message, 'attacking from an Elbereth square',
                );
                return true;
            },
        );
        // Not caused by an attack: mon.c passes FALSE from every other caller.
        setmangry(target(), false, env);

        // engrave.c sengr_at() is called with strict set, so a longer
        // engraving that merely contains the word does not count. A peaceful
        // target is what makes that visible: it satisfies the second
        // disjunct on its own, so only the strict comparison stands between
        // this call and the Elbereth arm, and what it reaches instead is the
        // peaceful arm further down.
        engraveElbereth('Elbereth burns');
        setmangry(target(), true, env);
        assert.throws(
            () => setmangry(target({ mpeaceful: 1 }), true, env),
            (error) => {
                assert.equal(error.message, 'angering a peaceful monster');
                return true;
            },
        );

        // A target that ignores Elbereth and is not peaceful escapes it. A
        // human is @, which monmove.c onscary() exempts.
        engraveElbereth();
        setmangry(target({ data: game.mons[PM_HUMAN] }), true, env);
        // The same unscared target while peaceful takes the arm through the
        // second disjunct instead, and then stops again further down.
        assert.throws(
            () => setmangry(
                target({ data: game.mons[PM_HUMAN], mpeaceful: 1 }), true, env,
            ),
            (error) => {
                assert.equal(
                    error.message, 'attacking from an Elbereth square',
                );
                return true;
            },
        );
        game.head_engr = null;
    });

// mon.c:4350-4362. via_attack is what turns waking into angering; without it
// the target keeps its wait strategy.
test('wakeup angers only when the attack caused it', async () => {
    await hero();
    const angered = target({ mstrategy: STRAT_WAITFORU });
    await wakeup(angered, true, { ...REFUSING, state: game });
    assert.equal(angered.mstrategy, 0);
    assert.equal(angered.msleeping, 0);

    const woken = target({ mstrategy: STRAT_WAITFORU, msleeping: 1 });
    await wakeup(woken, false, { ...REFUSING, state: game });
    assert.equal(woken.mstrategy, STRAT_WAITFORU);
    assert.equal(woken.msleeping, 0);
});

test('wakeup stops on the three arms it cannot report', async () => {
    await hero();
    // mon.c:4339-4343, a mimic or disguised Wizard needs seemimic().
    await refuses(
        () => wakeup(target({ m_ap_type: 3 }), true,
            { ...REFUSING, state: game }),
        'waking a mimicking monster',
    );
    // mon.c:4353-4354, a target that was asleep growls as it wakes.
    await refuses(
        () => wakeup(target({ msleeping: 1 }), true,
            { ...REFUSING, state: game }),
        'growl from a woken monster',
    );
    // mon.c:4356-4361. setmangry() returns early for a pet, so a tame priest
    // is the only shape that reaches the temple and shop arms.
    await refuses(
        () => wakeup(target({ mpeaceful: 1, mtame: 1, ispriest: 1 }), true,
            { ...REFUSING, state: game }),
        'angering a peaceful priest or shopkeeper',
    );
    await refuses(
        () => wakeup(target({ mpeaceful: 1, mtame: 1, isshk: 1 }), true,
            { ...REFUSING, state: game }),
        'angering a peaceful priest or shopkeeper',
    );
    // A tame target that is neither passes through.
    await wakeup(target({ mpeaceful: 1, mtame: 1 }), true,
        { ...REFUSING, state: game });
});

// mon.c:4355. wakeup() passes TRUE, not its own via_attack, so a target woken
// by an attack on an Elbereth square reaches setmangry()'s hypocrisy arm.
test('wakeup angers through setmangry with the attack flag set', async () => {
    await hero();
    engraveElbereth();
    await refuses(
        () => wakeup(target(), true, { ...REFUSING, state: game }),
        'attacking from an Elbereth square',
    );
    game.head_engr = null;
});

// mon.c:4344-4348, the force-fight reveal. Nothing in this port sets
// context.forcefight, so this is the only place the arm runs.
test('wakeup reveals a hidden target only under a force-fight', async () => {
    await hero();
    const hidden = target({ mundetected: 1 });
    await wakeup(hidden, false, { ...REFUSING, state: game });
    assert.equal(hidden.mundetected, 1);

    game.context.forcefight = 1;
    await wakeup(hidden, false, { ...REFUSING, state: game });
    assert.equal(hidden.mundetected, 0);

    // svc.context.mon_moving suppresses it again.
    const other = target({ mundetected: 1 });
    game.context.mon_moving = 1;
    await wakeup(other, false, { ...REFUSING, state: game });
    assert.equal(other.mundetected, 1);
    game.context.mon_moving = 0;
    game.context.forcefight = 0;
});
