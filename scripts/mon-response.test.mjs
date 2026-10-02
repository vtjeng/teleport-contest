import assert from 'node:assert/strict';
import test from 'node:test';

import {
    INVIS,
    MS_SHRIEK,
    REFLECTING,
    STRAT_APPEARMSG,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { getRngLog, enableRngLog } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    m_respond,
    peacefuls_respond,
    qst_guardians_respond,
    wake_nearto_core,
} from '../js/mon.js';
import { domonnoise } from '../js/sounds.js';
import {
    G_UNIQ,
    PM_GNOME,
    PM_JACKAL,
    PM_MEDUSA,
    PM_SHRIEKER,
    PM_WATCHMAN,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { runSegment } from '../js/jsmain.js';

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Response,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7700381,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    return game;
}

function monster(species, overrides = {}) {
    return newMonster({
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 8,
        mhpmax: 8,
        mcanmove: true,
        mcansee: true,
        data: game.mons[species],
        ...overrides,
    });
}

function prepend(mon) {
    mon.nmon = game.level.monlist;
    game.level.monlist = mon;
    return mon;
}

test('m_respond_shrieker prints, then interrupts, in C order', async () => {
    await hero();
    const shrieker = monster(PM_SHRIEKER);
    prepend(shrieker);
    // This mobile sleeper is in the same false tower region as the hero on
    // the ordinary dungeon level; aggravate wakes it without another draw.
    const sleeper = prepend(monster(PM_GNOME, {
        msleeping: true,
        mstrategy: STRAT_WAITFORU | STRAT_APPEARMSG,
    }));
    const events = [];
    const random = { rn2: (bound) => {
        assert.equal(bound, 10); // mon.c:4101's one-in-ten summon check.
        return 1;
    } };

    await m_respond(shrieker, {
        state: game,
        random,
        message: async (text) => events.push(`message:${text}`),
        stopOccupation: async () => events.push('stop'),
    });

    assert.deepEqual(events, ['message:The shrieker shrieks.', 'stop']);
    assert.equal(sleeper.msleeping, false);
    assert.equal(sleeper.mstrategy, 0);
    assert.ok(!game.unported.has('wizard.c aggravate'));
});

test('domonnoise passes its rn2 owner to the shriek aggravation branch', async () => {
    await hero();
    // Keep only these two fixtures in fmon: the mobile shrieker selects C's
    // sounds.c:domonnoise MS_SHRIEK branch, and the sleeping gnome is the one
    // immobile monster that makes wizard.c:aggravate consume rn2(5).
    game.level.monlist = null;
    const shrieker = prepend(monster(PM_SHRIEKER));
    const sleeper = prepend(monster(PM_GNOME, {
        mcanmove: false,
        mfrozen: 4, // A positive timer exposes C's zero-roll thaw branch.
        msleeping: true,
        mstrategy: STRAT_WAITFORU | STRAT_APPEARMSG,
    }));
    // Drain the start-game welcome topline so domonnoise can print without
    // requesting an unrelated continuation key from the test input queue.
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    enableRngLog();

    assert.equal(shrieker.data.msound, MS_SHRIEK);
    await domonnoise(shrieker, game);

    // C sounds.c:domonnoise calls aggravate before emitting the shriek line.
    // The existing core RNG wrapper records exactly one source rn2(5) draw.
    const draws = getRngLog();
    assert.equal(draws.length, 1);
    const match = /^rn2\(5\)=(\d+)$/u.exec(draws[0]);
    assert.ok(match, 'the shrieker caller uses the core rn2(5) owner');
    const roll = Number(match[1]);
    assert.ok(roll >= 0 && roll < 5);
    assert.equal(sleeper.msleeping, false);
    assert.equal(sleeper.mstrategy & (STRAT_WAITFORU | STRAT_APPEARMSG), 0);
    assert.equal(sleeper.mcanmove, roll === 0);
    assert.equal(sleeper.mfrozen, roll === 0 ? 0 : 4);
    assert.equal(game._ttyToplines, 'The shrieker shrieks.');
});

test('qst_guardians_respond angers visible role guardians', async () => {
    await hero();
    const guardian = prepend(monster(game.urole.guardnum, {
        mpeaceful: true,
    }));
    const lines = [];
    await qst_guardians_respond({
        state: game,
        message: async (text) => lines.push(text),
    });
    assert.equal(guardian.mpeaceful, false);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /angry too/);
});

test('peacefuls_respond warns a watch guard and angers the watch', async () => {
    await hero();
    const guard = prepend(monster(PM_WATCHMAN, { mpeaceful: true }));
    const attacked = monster(PM_GNOME, { mpeaceful: false });
    const lines = [];
    await peacefuls_respond(attacked, {
        state: game,
        random: { rn2: () => { throw new Error('watch branch draws none'); } },
        message: async (text) => lines.push(text),
    });
    assert.equal(guard.mpeaceful, false);
    assert.deepEqual(lines, [
        '"Halt!  You\'re under arrest!"',
        'The guard gets angry!',
    ]);
    assert.ok(!game.unported.has('mon.c angry_guards'));
});

test('m_respond awaits a reflected Medusa gaze before continuing', async () => {
    await hero();
    // NewMonster's source test fixture exposes the named proper-name gender
    // bit explicitly; C's PMFEMALE Medusa is referred to as "her" by mhis().
    const medusa = prepend(monster(PM_MEDUSA, { female: true }));
    // A source-valid invisible hero can reflect an on-screen Medusa gaze
    // without the Medusa perceiving the hero, selecting C's no-notice branch.
    game.u.uprops[INVIS].intrinsic = 1;
    game.u.uprops[REFLECTING].intrinsic = 1;
    const lines = [];
    const draws = [];
    await m_respond(medusa, {
        state: game,
        random: { rn2: (bound) => { draws.push(bound); return 1; } },
        message: async (line) => lines.push(line),
    });

    assert.deepEqual(lines, [
        "Medusa doesn't seem to notice that her gaze was reflected.",
    ]);
    assert.deepEqual(draws, []);
    assert.ok(!game.unported.has('mhitu.c gazemu'));
});

test('wake_nearto_core clears sleep and wait strategy, including pet whistle state', async () => {
    await hero();
    const ordinary = prepend(monster(PM_JACKAL, {
        msleeping: true,
        mstrategy: STRAT_WAITFORU,
    }));
    const pet = prepend(monster(PM_JACKAL, {
        mx: game.u.ux + 1,
        my: game.u.uy + 1,
        msleeping: true,
        mtame: 10,
        mstrategy: STRAT_WAITFORU,
        mextra: { edog: { whistletime: 0 } },
        mtrack: [{ x: 4, y: 4 }, { x: 5, y: 5 }],
    }));
    const disturbed = [];
    await wake_nearto_core(game.u.ux, game.u.uy, 9, true, {
        state: game,
        canSeeMonster: () => false,
        message: async () => {},
        disturbBuriedZombies: (x, y) => disturbed.push([x, y]),
    });
    assert.equal(ordinary.msleeping, false);
    assert.equal(ordinary.mstrategy & STRAT_WAITMASK, 0);
    assert.equal(pet.mextra.edog.whistletime, game.moves);
    assert.deepEqual(pet.mtrack, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    assert.deepEqual(disturbed, [[game.u.ux, game.u.uy]]);

    const unique = prepend(monster(PM_JACKAL, {
        data: { ...game.mons[PM_JACKAL], geno: G_UNIQ },
        msleeping: true,
        mstrategy: STRAT_WAITFORU,
    }));
    await wake_nearto_core(game.u.ux, game.u.uy, 0, false, {
        state: game,
        canSeeMonster: () => false,
        message: async () => {},
        disturbBuriedZombies: () => {},
    });
    assert.equal(unique.msleeping, false);
    assert.equal(unique.mstrategy & STRAT_WAITMASK, STRAT_WAITFORU);
});
