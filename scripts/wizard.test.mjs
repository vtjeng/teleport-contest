import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    MM_NOWAIT,
    MAGIC_PORTAL,
    NO_MM_FLAGS,
    PROT_FROM_SHAPE_CHANGERS,
    RLOC_MSG,
    ROOM,
    STRAT_APPEARMSG,
    STRAT_HEAL,
    STRAT_PLAYER,
    STRAT_WAITFORU,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { AT_MAGC, PM_WIZARD_OF_YENDOR } from '../js/monsters.js';
import {
    choose_stairs,
    amulet,
    aggravate,
    clonewiz,
    mon_has_arti,
    on_ground,
    other_mon_has_arti,
    nasty,
    strategy,
    tactics,
    target_on,
    you_have,
    which_arti,
    wizdeadorgone,
} from '../js/wizard.js';
import {
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
    FAKE_AMULET_OF_YENDOR,
} from '../js/objects.js';
import { NASTIES } from '../js/nasties_data.js';

const WIZARD_C = readFileSync(
    new URL('../nethack-c/upstream/src/wizard.c', import.meta.url), 'utf8',
);

function nastyState(hell = false) {
    const maxNasty = Math.max(...NASTIES);
    const mons = Array.from({ length: maxNasty + 1 }, (_, pmidx) => ({
        pmidx,
        mlet: 'X',
        difficulty: 1,
        geno: 0,
        maligntyp: 0,
        pmnames: [null, null, 'test monster'],
        mattk: [],
    }));
    const level = { monlist: null, objlist: null, flags: {} };
    return {
        context: {},
        dungeons: [{ num_dunlevs: 2, entry_lev: 2, flags: { hellish: hell } }],
        branches: [],
        stairs: null,
        level,
        mons,
        mvitals: mons.map(() => ({ mvflags: 0 })),
        u: {
            ux: 10,
            uy: 11,
            uz: { dnum: 0, dlevel: hell ? 2 : 1 },
            ulevel: 3,
            uhave: {},
            uevent: { invoked: false },
            ualign: { type: 0 },
        },
    };
}

function nastyRandom(values) {
    let index = 0;
    const draws = [];
    return {
        draws,
        rn2(bound) {
            draws.push(`rn2(${bound})`);
            return values[index++] ?? 0;
        },
        rnd(bound) {
            draws.push(`rnd(${bound})`);
            return values[index++] ?? 1;
        },
        d: () => 1,
        rn1: () => 1,
        rne: () => 1,
        rnz: () => 1,
    };
}

const M3_WANTSBELL = 0x0002;
const M3_WANTSARTI = 0x0010;
const M3_WIZARD = 31;

test('clonewiz uses the source Wizard call shape and clears clone attitudes', async () => {
    const state = nastyState();
    state.u.uprops = {
        [PROT_FROM_SHAPE_CHANGERS]: { intrinsic: true, extrinsic: false },
    };
    state.u.uhave.amulet = true;
    const monster = {
        mx: 12,
        my: 13,
        msleeping: true,
        mtame: 5,
        mpeaceful: true,
    };
    const calls = [];
    const env = {
        makemon: async (...args) => {
            calls.push(['makemon', ...args]);
            return monster;
        },
        random: { rn2: () => assert.fail('protected clone uses no RNG') },
        redraw: (...args) => calls.push(['redraw', ...args]),
    };
    const clone = await clonewiz(state, env);

    assert.equal(clone, monster);
    assert.equal(calls[0][0], 'makemon');
    assert.equal(calls[0][1], state.mons[PM_WIZARD_OF_YENDOR]);
    assert.deepEqual(calls[0].slice(2, 5), [state.u.ux, state.u.uy, MM_NOWAIT]);
    assert.equal(calls[0][5].state, state);
    assert.equal(calls[0][5]._cloneWizard, true);
    assert.deepEqual(
        [monster.msleeping, monster.mtame, monster.mpeaceful],
        [false, 0, false],
    );
    assert.equal(calls[1][0], 'redraw');
    assert.deepEqual(calls[1].slice(1, 4), [12, 13, state]);
    assert.equal(calls[1][4], env);

    const cStart = WIZARD_C.indexOf('\nclonewiz(void)');
    const cEnd = WIZARD_C.indexOf('\n/* also used by newcham() */', cStart);
    const cClone = WIZARD_C.slice(cStart, cEnd);
    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.match(cClone, /makemon\(&mons\[PM_WIZARD_OF_YENDOR\], u\.ux, u\.uy, MM_NOWAIT\)/u);
    assert.ok(cClone.indexOf('msleeping = mtmp2->mtame = mtmp2->mpeaceful = 0')
        < cClone.indexOf('if (!u.uhave.amulet && rn2(2))'));
    assert.ok(cClone.indexOf('if (!Protection_from_shape_changers)')
        < cClone.indexOf('newsym(mtmp2->mx, mtmp2->my)'));
});

test('aggravate follows tower, dead-monster, sleep, and thaw order', () => {
    // C wizard.c:aggravate (494-511) compares the hero and each monster's
    // Wizard's Tower membership, skips DEADMONSTER (mhp < 1), clears only
    // STRAT_WAITFORU|STRAT_APPEARMSG, then draws rn2(5) only for immobile
    // same-region monsters. Bounds 5..15 include the hero at (10,10) and the
    // two test monsters at (9,9)/(12,9), but exclude the target at x=20.
    // Scripted results 2 and 0 exercise both non-thaw and thaw outcomes while
    // keeping the expected two-call source order explicit.
    const towerLevel = { dnum: 0, dlevel: 10 };
    const dead = {
        mhp: 0,
        mx: 8,
        my: 8,
        mstrategy: STRAT_WAITFORU | STRAT_APPEARMSG,
        msleeping: 1,
        mcanmove: false,
        mfrozen: 4,
    };
    const outside = {
        mhp: 8,
        mx: 20,
        my: 9,
        mstrategy: STRAT_WAITFORU | STRAT_APPEARMSG,
        msleeping: 1,
        mcanmove: false,
        mfrozen: 3,
    };
    const immobileStaysFrozen = {
        mhp: 8,
        mx: 9,
        my: 9,
        mstrategy: STRAT_WAITFORU | STRAT_APPEARMSG | STRAT_HEAL,
        msleeping: 1,
        mcanmove: false,
        mfrozen: 3,
    };
    const mobileWakesWithoutDraw = {
        mhp: 8,
        mx: 11,
        my: 9,
        mstrategy: STRAT_WAITFORU | STRAT_APPEARMSG,
        msleeping: 1,
        mcanmove: true,
        mfrozen: 0,
    };
    const immobileThaws = {
        mhp: 8,
        mx: 12,
        my: 9,
        mstrategy: STRAT_WAITFORU | STRAT_APPEARMSG,
        msleeping: 1,
        mcanmove: false,
        mfrozen: 2,
    };
    dead.nmon = outside;
    outside.nmon = immobileStaysFrozen;
    immobileStaysFrozen.nmon = mobileWakesWithoutDraw;
    mobileWakesWithoutDraw.nmon = immobileThaws;
    const state = {
        u: { ux: 10, uy: 10, uz: towerLevel },
        wiz1_level: towerLevel,
        wiz2_level: { dnum: 0, dlevel: 11 },
        wiz3_level: { dnum: 0, dlevel: 12 },
        dndest: { nlx: 5, nly: 5, nhx: 15, nhy: 15 },
        level: { monlist: dead },
    };
    const draws = [];
    const scripted = [2, 0];
    const random = {
        rn2(bound) {
            draws.push(bound);
            return scripted[draws.length - 1];
        },
    };

    assert.equal(aggravate(state, random), undefined);
    assert.deepEqual(draws, [5, 5]);
    assert.equal(dead.mstrategy, STRAT_WAITFORU | STRAT_APPEARMSG);
    assert.equal(dead.msleeping, 1);
    assert.equal(outside.mstrategy, STRAT_WAITFORU | STRAT_APPEARMSG);
    assert.equal(outside.msleeping, 1);
    assert.equal(immobileStaysFrozen.mstrategy, STRAT_HEAL);
    assert.equal(immobileStaysFrozen.msleeping, false);
    assert.equal(immobileStaysFrozen.mfrozen, 3);
    assert.equal(immobileStaysFrozen.mcanmove, false);
    assert.equal(mobileWakesWithoutDraw.mstrategy, 0);
    assert.equal(mobileWakesWithoutDraw.msleeping, false);
    assert.equal(immobileThaws.mstrategy, 0);
    assert.equal(immobileThaws.msleeping, false);
    assert.equal(immobileThaws.mfrozen, 0);
    assert.equal(immobileThaws.mcanmove, true);
});

function stateForWizard() {
    return {
        context: {},
        dungeons: [{ num_dunlevs: 2, entry_lev: 2 }],
        branches: [],
        stairs: null,
        level: { monlist: null, objlist: null },
        u: {
            ux: 10,
            uy: 11,
            uz: { dnum: 0, dlevel: 1 },
            uhave: {},
            uevent: { invoked: false },
        },
    };
}

function covetousMonster(mflags3 = M3_WIZARD) {
    return {
        data: { mflags3, pmidx: 999 },
        mhp: 10,
        mhpmax: 10,
        m_id: 2,
        mx: 4,
        my: 4,
        mgoal: { x: 0, y: 0 },
        mstrategy: 0,
        minvent: null,
        iswiz: false,
        isshk: false,
        ispriest: false,
        mflee: false,
    };
}

test('wizard artifact selectors preserve C object masks and list order', () => {
    assert.equal(which_arti(M3_WANTSBELL), BELL_OF_OPENING);
    assert.equal(which_arti(M3_WANTSARTI), 0);

    const state = stateForWizard();
    const quest = { oartifact: 21, nobj: null };
    state.level.objlist = quest;
    assert.equal(on_ground(0, state), quest);
    assert.equal(mon_has_arti({ minvent: quest }, 0, state), true);
    assert.equal(mon_has_arti({ minvent: null }, AMULET_OF_YENDOR, state), false);
});

test('wizdeadorgone decrements every removal and starts the countdown once', () => {
    const start = WIZARD_C.indexOf('\nwizdeadorgone(void)');
    const end = WIZARD_C.indexOf('\nstatic const char *const random_insult[]', start);
    const source = WIZARD_C.slice(start, end);
    assert.match(source,
        /svc\.context\.no_of_wizards--;\s*if \(!u\.uevent\.udemigod\)\s*\{\s*u\.uevent\.udemigod = TRUE;\s*u\.udg_cnt = rn1\(250, 50\);/u);

    const state = {
        context: { no_of_wizards: 2 },
        u: { uevent: { udemigod: false }, udg_cnt: 0 },
    };
    const draws = [];
    const random = {
        rn1(range, base) {
            draws.push([range, base]);
            return base + 73;
        },
    };

    wizdeadorgone(state, random);
    assert.equal(state.context.no_of_wizards, 1);
    assert.equal(state.u.uevent.udemigod, true);
    assert.equal(state.u.udg_cnt, 123);
    assert.deepEqual(draws, [[250, 50]]);

    wizdeadorgone(state, random);
    assert.equal(state.context.no_of_wizards, 0);
    assert.equal(state.u.udg_cnt, 123);
    assert.deepEqual(draws, [[250, 50]], 'the countdown roll is once only');
});

test('other_mon_has_arti scans the linked monster list without the subject', () => {
    const state = stateForWizard();
    const subject = covetousMonster(M3_WANTSBELL);
    const carrier = covetousMonster(M3_WANTSBELL);
    const bell = { otyp: BELL_OF_OPENING, nobj: null };
    carrier.minvent = bell;
    subject.nmon = carrier;
    state.level.monlist = subject;

    assert.equal(other_mon_has_arti(subject, BELL_OF_OPENING, state), carrier);
    carrier.minvent = null;
    assert.equal(other_mon_has_arti(subject, BELL_OF_OPENING, state), null);
});

test('you_have maps each source possession flag', () => {
    const state = stateForWizard();
    state.u.uhave.bell = true;
    assert.equal(you_have(M3_WANTSBELL, state), true);
    assert.equal(you_have(M3_WANTSARTI, state), false);
    state.u.uhave.questart = true;
    assert.equal(you_have(M3_WANTSARTI, state), true);
});

test('target_on prefers hero possession and writes the source goal', () => {
    const state = stateForWizard();
    state.u.uhave.bell = true;
    const monster = covetousMonster(M3_WANTSBELL);
    assert.equal(
        target_on(M3_WANTSBELL, monster, state),
        STRAT_PLAYER | M3_WANTSBELL,
    );
    assert.deepEqual(monster.mgoal, { x: 10, y: 11 });
});

test('strategy chooses healing before artifact targets at the source ratio', () => {
    const state = stateForWizard();
    const monster = covetousMonster(M3_WANTSARTI);
    monster.mhp = 2;
    monster.mhpmax = 10;
    assert.equal(strategy(monster, state), STRAT_HEAL);
});

test('strategy default ratio keeps the source panic fallback', () => {
    const state = stateForWizard();
    const monster = covetousMonster();
    monster.mhp = 20;
    monster.mhpmax = 10;
    assert.equal(strategy(monster, state), STRAT_HEAL);
});

test('tactics keeps cached tower coordinates for post-relocation healing',
    async () => {
        const state = stateForWizard();
        state.u.uz = { dnum: 9, dlevel: 2 };
        state.dungeons = Array.from({ length: 10 }, () => ({
            num_dunlevs: 3,
            entry_lev: 1,
        }));
        state.wiz1_level = { dnum: 9, dlevel: 2 };
        state.dndest = { nlx: 30, nly: 4, nhx: 40, nhy: 12 };
        const monster = covetousMonster();
        monster.iswiz = true;
        monster.mx = 35;
        monster.my = 8;
        monster.mhp = 2;
        monster.mhpmax = 10;
        const calls = [];
        const result = await tactics(monster, {
            state,
            random: {
                rn2(bound) {
                    calls.push(`rn2(${bound})`);
                    return 0;
                },
                rnd(bound) {
                    calls.push(`rnd(${bound})`);
                    return 1;
                },
            },
            noteleportLevel: () => false,
            rloc: (subject) => {
                subject.mx = 10;
                subject.my = 11;
            },
            healmon: () => calls.push('heal'),
        });
        assert.equal(result, 1);
        assert.deepEqual(calls, ['rn2(3)', 'rnd(8)', 'heal']);
    });

test('choose_stairs prefers a regular stair in the requested direction', () => {
    const state = stateForWizard();
    state.stairs = {
        sx: 3,
        sy: 4,
        up: false,
        isladder: false,
        tolev: { dnum: 0, dlevel: 2 },
        next: null,
    };
    assert.deepEqual(choose_stairs(false, state), { x: 3, y: 4 });
});

test('tactics keeps STRAT_NONE harassment order and relocation flags', async () => {
    const state = stateForWizard();
    const monster = covetousMonster(M3_WANTSBELL);
    const calls = [];
    const result = await tactics(monster, {
        state,
        random: {
            rn2(bound) {
                assert.equal(bound, 5);
                return 0;
            },
            rnd() {
                throw new Error('STRAT_NONE must not call rnd');
            },
        },
        noteleportLevel: () => false,
        mnexto(subject, flags) {
            calls.push([subject, flags]);
        },
    });
    assert.equal(result, 0);
    assert.deepEqual(calls, [[monster, RLOC_MSG]]);
});

// C ref: wizard.c nasty() (591-727).  A late-game harassment call skips the
// Hell msummon arm when rn2(10) is nonzero, creates the selected nasty at the
// hero square, clears its peaceful/tame state, and returns the census delta.
test('nasty creates a selected hostile monster in source order', async () => {
    const state = nastyState(false);
    const random = nastyRandom([1, 1, 0, 1]);
    const created = {
        data: state.mons[NASTIES[0]],
        msleeping: true,
        mpeaceful: true,
        mtame: 7,
        mspec_used: 0,
    };
    let census = 0;
    const calls = [];
    const malign = [];
    const result = await nasty(null, {
        state,
        random,
        monsterCensus: () => census,
        makemon: async (species, x, y, flags, env) => {
            calls.push({
                species, x, y, flags, state: env.state, nasty: env._nasty,
            });
            ++census;
            return created;
        },
        setMalign: (monster, owner) => malign.push([monster, owner]),
    });

    assert.equal(result, 1);
    assert.deepEqual(random.draws, [
        'rn2(10)', 'rnd(1)', 'rn2(44)', 'rnd(4)',
    ]);
    assert.deepEqual(calls, [{
        species: state.mons[NASTIES[0]],
        x: state.u.ux,
        y: state.u.uy,
        flags: NO_MM_FLAGS,
        state,
        nasty: true,
    }]);
    assert.deepEqual(malign, [[created, state]]);
    assert.equal(created.msleeping, false);
    assert.equal(created.mpeaceful, false);
    assert.equal(created.mtame, 0);
    assert.equal(created.mspec_used, 1);
});

// C ref: wizard.c nasty() (628-633).  The Hell branch consumes the
// return-valued msummon result and reports the census delta, rather than
// falling through to ordinary nasty selection.
test('nasty delegates Hell summoning and preserves its census result', async () => {
    const state = nastyState(true);
    const random = nastyRandom([0]);
    let census = 0;
    let calledWith = 'unset';
    const result = await nasty(null, {
        state,
        random,
        monsterCensus: () => census,
        msummon: async (summoner, env) => {
            calledWith = { summoner, state: env.state, random: env.random };
            census = 3;
            return 3;
        },
    });

    assert.equal(result, 3);
    assert.deepEqual(random.draws, ['rn2(10)']);
    assert.equal(calledWith.summoner, null);
    assert.equal(calledWith.state, state);
    assert.equal(calledWith.random, random);
});

// C ref: wizard.c nasty() (666-687).  A genocided or otherwise unavailable
// direct choice falls through to makemon(NULL), then still applies the
// spellcaster cap and the source mspec_used delay to the substitute.
test('nasty substitutes a random creation after selected creation fails', async () => {
    const state = nastyState(false);
    const random = nastyRandom([1, 1, 0, 1]);
    const substitute = {
        data: state.mons[NASTIES[1]],
        mspec_used: 0,
    };
    let census = 0;
    const calls = [];
    const result = await nasty(null, {
        state,
        random,
        monsterCensus: () => census,
        makemon: async (species) => {
            calls.push(species);
            if (calls.length === 1) return null;
            ++census;
            return substitute;
        },
    });

    assert.equal(result, 1);
    assert.deepEqual(random.draws, [
        'rn2(10)', 'rnd(1)', 'rn2(44)', 'rnd(4)',
    ]);
    assert.deepEqual(calls, [state.mons[NASTIES[0]], null]);
    assert.equal(substitute.mspec_used, 1);
});

test('nasty substitute cap reads the supplied planning dungeon', async () => {
    for (const endgame of [false, true]) {
        const state = nastyState(false);
        state.level = new GameMap();
        for (let x = 0; x < 80; ++x) {
            for (let y = 0; y < 21; ++y)
                state.level.at(x, y).typ = ROOM;
        }
        state.astral_level = { dnum: endgame ? 0 : 1 };
        let substituteReturned = false;
        let capBound = null;
        const random = {
            draws: [],
            rn2(bound) {
                if (substituteReturned && capBound === null) capBound = bound;
                this.draws.push(`rn2(${bound})`);
                return 0;
            },
            rnd(bound) {
                this.draws.push(`rnd(${bound})`);
                return 1;
            },
            d: () => 1,
            rn1: () => 1,
            rne: () => 1,
            rnz: () => 1,
        };
        const summoner = {
            data: {
                mlet: 'X',
                difficulty: 1,
                maligntyp: 1,
            },
            mux: 5,
            muy: 5,
        };
        const substitute = {
            data: {
                ...state.mons[NASTIES[1]],
                difficulty: 1,
                mattk: [{ aatyp: AT_MAGC }],
            },
            mspec_used: 0,
        };
        let census = 0;
        let calls = 0;
        const result = await nasty(summoner, {
            state,
            random,
            monsterCensus: () => census,
            makemon: async (species) => {
                ++calls;
                if (species) return null;
                census = 1;
                substituteReturned = true;
                return substitute;
            },
            setMalign: () => {},
        });

        assert.equal(result, 1, endgame ? 'endgame' : 'ordinary');
        assert.equal(calls, 2);
        assert.equal(capBound, endgame ? 3 : 7);
    }
});

test('amulet checks a worn real Amulet before waking the first Wizard', async () => {
    const state = {
        u: {
            ux: 10, // C hero coordinate used by distu()/m_next2u().
            uy: 10, // Keeps the sleeping Wizard within m_next2u() range.
        },
        uamul: { otyp: AMULET_OF_YENDOR }, // C uamul points at the real Amulet.
        context: { no_of_wizards: 1 }, // Enables the Wizard scan after portal hints.
        level: {
            traps: [{ ttyp: MAGIC_PORTAL, tx: 30, ty: 10 }], // Far portal emits no hint.
            monlist: {
                mhp: 10,
                iswiz: true,
                msleeping: true,
                mx: 11, // Adjacent Wizard suppresses the creepy-feeling message.
                my: 10,
                nmon: null,
            },
        },
    };
    const draws = [];
    const random = {
        rn2(bound) {
            draws.push(bound);
            return bound === 15 ? 1 : 0; // Skip the hint, then wake the Wizard.
        },
    };
    const messages = [];

    await amulet(state, { random, message: async (value) => messages.push(value) });

    assert.deepEqual(draws, [15, 40], 'C rolls portal hints before the Wizard wake chance');
    assert.equal(state.level.monlist.msleeping, false, 'zero rn2(40) wakes the Wizard');
    assert.deepEqual(messages, [], 'm_next2u suppresses the distant-notice message nearby');
});

test('amulet does not roll for a fake or unworn, unwielded Amulet', async () => {
    const state = {
        u: { ux: 10, uy: 10 },
        uamul: null,
        uwep: null,
        context: {},
        level: { traps: [], monlist: null },
    };
    const draws = [];
    const random = { rn2: (bound) => (draws.push(bound), 0) };

    await amulet(state, { random });
    state.uamul = { otyp: FAKE_AMULET_OF_YENDOR };
    await amulet(state, { random });

    assert.deepEqual(draws, [], 'C enters the hint roll only for the real worn or wielded Amulet');
});
