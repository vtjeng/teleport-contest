// The #levelchange command and the experience-level gain behind it:
// wizcmds.c wiz_level_change(), exper.c pluslvl(), attrib.c's innate tables,
// role_abil(), adjabil() and setuhpmax(), botl.c xlev_to_rank(), weapon.c
// add_weapon_skill(), and insight.c record_achievement() and achieve_rank().
//
// scripts/run-level-change.mjs holds the strict differential evidence: 23
// segments recorded against the C reference, one per branch. The assertions
// here pin values read off the C source, so a wrong constant fails before a
// recording is needed, and they reach the branches the recorded screens
// cannot show -- the refusals that stay fail-closed, the intrinsic bits a
// gain writes, and the state (u.uexp, u.uachieved[], u.weapon_slots) that
// never reaches a screen.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    adjabil,
    innateTablesHaveSilentLevelOneEntries,
    role_abil,
    setuhpmax,
} from '../js/attrib.js';
import {
    ACH_RNK1,
    ACH_RNK8,
    COLD_RES,
    FAST,
    FIRE_RES,
    FROMEXPER,
    FROMOUTSIDE,
    FROM_RACE,
    INFRAVISION,
    LAST_PROP,
    MAXULEV,
    N_ACH,
    POISON_RES,
    SEARCHING,
    SEE_INVIS,
    SHOCK_RES,
    SLEEP_RES,
    STEALTH,
    TELEPORT_CONTROL,
    WARNING,
} from '../js/const.js';
import { xlev_to_rank } from '../js/display.js';
import { newuexp, pluslvl } from '../js/exper.js';
import { game } from '../js/gstate.js';
import { achieve_rank, record_achievement } from '../js/insight.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_ARCHEOLOGIST,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_CLERIC,
    PM_DWARF,
    PM_ELF,
    PM_GNOME,
    PM_HEALER,
    PM_HUMAN,
    PM_KNIGHT,
    PM_MONK,
    PM_ORC,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WIZARD,
} from '../js/monsters.js';
import { add_weapon_skill } from '../js/weapon.js';
import { scanLevelArgument } from '../js/wizcmds.js';
import { loadLevelChangeRecipe } from './run-level-change.mjs';

function advancement(infix, inrnd, lofix, lornd, hifix, hirnd) {
    return { infix, inrnd, lofix, lornd, hifix, hirnd };
}

function zeroProperties() {
    return Array.from(
        { length: LAST_PROP + 1 },
        () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
    );
}

// role.c roles[] "Archeologist" (nethack-c/upstream/src/role.c:31-72) and
// races[] "human" (583-602): the two advancement rows and xlev this file pins
// newhp() and newpw() against. Archeologist takes enermod()'s default arm, so
// its energy gain is the rn1() result unmodified.
const ARCHEOLOGIST = {
    mnum: PM_ARCHEOLOGIST,
    filecode: 'Arc',
    xlev: 14,
    hpadv: advancement(11, 0, 0, 8, 1, 0),
    enadv: advancement(1, 0, 0, 1, 0, 1),
};
const HUMAN = {
    mnum: PM_HUMAN,
    hpadv: advancement(2, 0, 0, 2, 1, 0),
    enadv: advancement(1, 0, 2, 0, 2, 0),
};

// A hero one step past u_init_misc(): experience level 1, no skill practised,
// and the six characteristics an Archeologist can start with. A_CON is 10 and
// A_WIS is 10, both chosen so newhp()'s conplus is 0 and newpw()'s
// ACURR(A_WIS)/2 is a whole 5, which keeps the pinned arithmetic below short.
function heroState({ role = ARCHEOLOGIST, race = HUMAN, female = false } = {}) {
    return {
        moves: 1,
        flags: { initalign: 1, female },
        disp: {},
        urole: role,
        urace: race,
        u: {
            ulevel: 1,
            ulevelmax: 1,
            ulevelpeak: 1,
            uexp: 0,
            uhp: 13,
            uhpmax: 13,
            uhppeak: 13,
            uen: 3,
            uenmax: 3,
            uenpeak: 3,
            uhpinc: new Array(MAXULEV).fill(0),
            ueninc: new Array(MAXULEV).fill(0),
            uachieved: new Array(N_ACH).fill(0),
            uprops: zeroProperties(),
            umonnum: role.mnum,
            umonster: role.mnum,
            weapon_slots: 0,
            skills_advanced: 0,
            acurr: { a: [10, 10, 10, 10, 10, 10] },
            amax: { a: [10, 10, 10, 10, 10, 10] },
            atemp: [0, 0, 0, 0, 0, 0],
            atime: [0, 0, 0, 0, 0, 0],
            aexe: [0, 0, 0, 0, 0, 0],
        },
    };
}

function initializingState(options) {
    const state = heroState(options);
    // u_init.c:995-1000 runs adjabil(0, 1) while u.ulevel is still 0.
    state.u.ulevel = 0;
    return state;
}

function intrinsicsOf(state) {
    const held = new Map();
    state.u.uprops.forEach((property, index) => {
        if (property.intrinsic) held.set(index, property.intrinsic);
    });
    return held;
}

// botl.c xlev_to_rank()'s own comment lists the bands: 1..2 => 0, 3..5 => 1,
// 6..9 => 2, 10..13 => 3, ... 26..29 => 7, 30 => 8. Every level in 1..30 is
// checked against that table rather than against the formula.
test('xlev_to_rank converts every experience level to botl.c rank', () => {
    const bands = [
        [1, 2, 0], [3, 5, 1], [6, 9, 2], [10, 13, 3], [14, 17, 4],
        [18, 21, 5], [22, 25, 6], [26, 29, 7], [30, 30, 8],
    ];
    for (const [low, high, rank] of bands) {
        for (let level = low; level <= high; ++level)
            assert.equal(xlev_to_rank(level), rank, `level ${level}`);
    }
    // The final ternary caps anything past MAXULEV at 8; no ported caller
    // reaches it, but C answers 8 there.
    assert.equal(xlev_to_rank(31), 8);
});

// wizcmds.c calls sscanf(buf, "%d%c", &newlevel, &dummy) and acts only on a
// return of exactly 1. mungspaces() has already collapsed the buffer.
test('scanLevelArgument reproduces sscanf("%d%c")', () => {
    // One field: the whole buffer is the integer.
    assert.deepEqual(scanLevelArgument('20'), { count: 1, value: 20 });
    assert.deepEqual(scanLevelArgument('-4'), { count: 1, value: -4 });
    assert.deepEqual(scanLevelArgument('+7'), { count: 1, value: 7 });
    // Two fields: %c takes the byte %d stopped at.
    assert.deepEqual(scanLevelArgument('12x'), { count: 2, value: 12 });
    assert.deepEqual(scanLevelArgument('2 0'), { count: 2, value: 2 });
    // No field: %d needs at least one digit.
    assert.deepEqual(scanLevelArgument('abc'), { count: 0, value: 0 });
    assert.deepEqual(scanLevelArgument('-'), { count: 0, value: 0 });
    // %d skips leading whitespace itself, which is what makes a buffer
    // mungspaces() left with a leading space still convert one field.
    assert.deepEqual(scanLevelArgument(' 7'), { count: 1, value: 7 });
});

// attrib.c:23-105, entry for entry. A wrong property index or level here would
// grant the wrong intrinsic at the wrong time, and the sessions only reach the
// level-1 entries, so the higher ones need this table to be checked directly.
test('role_abil returns attrib.c innate tables', () => {
    const expected = new Map([
        [PM_ARCHEOLOGIST, [[1, SEARCHING, '', ''],
            [5, STEALTH, 'stealthy', ''], [10, FAST, 'quick', 'slow']]],
        [PM_BARBARIAN, [[1, POISON_RES, '', ''], [7, FAST, 'quick', 'slow'],
            [15, STEALTH, 'stealthy', '']]],
        [PM_CAVE_DWELLER, [[7, FAST, 'quick', 'slow'],
            [15, WARNING, 'sensitive', '']]],
        [PM_HEALER, [[1, POISON_RES, '', ''], [15, WARNING, 'sensitive', '']]],
        [PM_KNIGHT, [[7, FAST, 'quick', 'slow']]],
        [PM_MONK, [[1, FAST, '', ''], [1, SLEEP_RES, '', ''],
            [1, SEE_INVIS, '', ''], [3, POISON_RES, 'healthy', ''],
            [5, STEALTH, 'stealthy', ''], [7, WARNING, 'sensitive', ''],
            [9, SEARCHING, 'perceptive', 'unaware'],
            [11, FIRE_RES, 'cool', 'warmer'], [13, COLD_RES, 'warm', 'cooler'],
            [15, SHOCK_RES, 'insulated', 'conductive'],
            [17, TELEPORT_CONTROL, 'controlled', 'uncontrolled']]],
        [PM_CLERIC, [[15, WARNING, 'sensitive', ''],
            [20, FIRE_RES, 'cool', 'warmer']]],
        [PM_RANGER, [[1, SEARCHING, '', ''], [7, STEALTH, 'stealthy', ''],
            [15, SEE_INVIS, '', '']]],
        [PM_ROGUE, [[1, STEALTH, '', ''], [10, SEARCHING, 'perceptive', '']]],
        [PM_SAMURAI, [[1, FAST, '', ''], [15, STEALTH, 'stealthy', '']]],
        [PM_TOURIST, [[10, SEARCHING, 'perceptive', ''],
            [20, POISON_RES, 'hardy', '']]],
        [PM_VALKYRIE, [[1, COLD_RES, '', ''], [3, STEALTH, 'stealthy', ''],
            [7, FAST, 'quick', 'slow']]],
        [PM_WIZARD, [[15, WARNING, 'sensitive', ''],
            [17, TELEPORT_CONTROL, 'controlled', 'uncontrolled']]],
    ]);
    for (const [mnum, rows] of expected) {
        assert.deepEqual(
            role_abil(mnum).map(
                ({ ulevel, ability, gainstr, losestr }) =>
                    [ulevel, ability, gainstr, losestr],
            ),
            rows,
            `role ${mnum}`,
        );
    }
    // role_abil()'s C loop falls off the end of roleabils[] for a monster
    // number that is not a role.
    assert.equal(role_abil(PM_HUMAN), null);
});

test('every innate entry gained at level 1 is silent', () => {
    assert.equal(innateTablesHaveSilentLevelOneEntries(), true);
});

// adjabil(0, 1) is what u_init_misc() runs. Both masks carry FROMOUTSIDE
// because abil->ulevel is 1, and every level-1 gainstr is empty, so the call
// needs no message owner.
test('adjabil(0, 1) grants the level-1 role and race intrinsics', async () => {
    const monk = initializingState({
        role: { ...ARCHEOLOGIST, mnum: PM_MONK, filecode: 'Mon' },
    });
    await adjabil(0, 1, monk);
    assert.deepEqual([...intrinsicsOf(monk)].sort((a, b) => a[0] - b[0]), [
        [SLEEP_RES, FROMEXPER | FROMOUTSIDE],
        [SEE_INVIS, FROMEXPER | FROMOUTSIDE],
        [FAST, FROMEXPER | FROMOUTSIDE],
    ].sort((a, b) => a[0] - b[0]));

    // orc_abil[] holds two level-1 entries, so the crossover to FROMRACE has
    // more than one to apply, and poison resistance arrives from the race
    // rather than from rog_abil[].
    const orcRogue = initializingState({
        role: { ...ARCHEOLOGIST, mnum: PM_ROGUE, filecode: 'Rog' },
        race: { ...HUMAN, mnum: PM_ORC },
    });
    await adjabil(0, 1, orcRogue);
    assert.deepEqual([...intrinsicsOf(orcRogue)].sort((a, b) => a[0] - b[0]), [
        [POISON_RES, FROM_RACE | FROMOUTSIDE],
        [INFRAVISION, FROM_RACE | FROMOUTSIDE],
        [STEALTH, FROMEXPER | FROMOUTSIDE],
    ].sort((a, b) => a[0] - b[0]));

    // elf_abil[]'s second entry is at level 4, above the level being reached.
    const elfWizard = initializingState({
        role: { ...ARCHEOLOGIST, mnum: PM_WIZARD, filecode: 'Wiz' },
        race: { ...HUMAN, mnum: PM_ELF },
    });
    await adjabil(0, 1, elfWizard);
    assert.deepEqual(
        [...intrinsicsOf(elfWizard)],
        [[INFRAVISION, FROM_RACE | FROMOUTSIDE]],
    );

    // adjabil()'s own race switch folds PM_DWARF and PM_GNOME into its
    // `default: rabil = 0` arm, so neither gains dwa_abil[]'s or gno_abil[]'s
    // infravision here even though those tables exist in C.
    for (const raceMnum of [PM_DWARF, PM_GNOME, PM_HUMAN]) {
        const knight = initializingState({
            role: { ...ARCHEOLOGIST, mnum: PM_KNIGHT, filecode: 'Kni' },
            race: { ...HUMAN, mnum: raceMnum },
        });
        await adjabil(0, 1, knight);
        assert.deepEqual([...intrinsicsOf(knight)], [], `race ${raceMnum}`);
    }

    // attrib.c:1063 gates the weapon-slot tail on `oldlevel > 0`, so the
    // initializing call adds none.
    const archeologist = initializingState();
    await adjabil(0, 1, archeologist);
    assert.equal(archeologist.u.weapon_slots, 0);
});

test('adjabil below an innate threshold changes nothing but skill slots',
    async () => {
    // arc_abil[] grants searching at experience level 1 and stealth at 5, so
    // a hero already past the first and short of the second gains neither.
    const archeologist = heroState();
    await adjabil(1, 2, archeologist);
    assert.deepEqual([...intrinsicsOf(archeologist)], []);
    // attrib.c:1063-1070 calls add_weapon_skill(newlevel - oldlevel).
    assert.equal(archeologist.u.weapon_slots, 1);

    // A role whose table holds nothing at all below level 15.
    const wizard = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_WIZARD, filecode: 'Wiz' },
    });
    await adjabil(1, 2, wizard);
    assert.deepEqual([...intrinsicsOf(wizard)], []);
    assert.equal(wizard.u.weapon_slots, 1);
});

// attrib.c:1046-1053. Above experience level 1 the mask goes in alone, without
// FROMOUTSIDE, and the entry's gainstr reaches You_feel("%s!").
test('adjabil grants an innate ability above level 1 and prints its gainstr',
    async () => {
    // arc_abil[] { 5, &HStealth, "stealthy", "" }.
    const archeologist = heroState();
    const messages = [];
    const message = (text) => { messages.push(text); };
    await adjabil(4, 5, archeologist, { message });
    assert.deepEqual([...intrinsicsOf(archeologist)], [[STEALTH, FROMEXPER]]);
    assert.deepEqual(messages, ['You feel stealthy!']);
    // The tail still runs after the gain.
    assert.equal(archeologist.u.weapon_slots, 1);

    // elf_abil[] { 4, &HSleep_resistance, "awake", "" } is the only entry
    // above level 1 that C reaches through the FROMRACE half of the traversal,
    // so it is the only one whose mask is FROM_RACE.
    const elfPriest = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_CLERIC, filecode: 'Pri' },
        race: { ...HUMAN, mnum: PM_ELF },
    });
    const elfMessages = [];
    await adjabil(3, 4, elfPriest, {
        message: (text) => { elfMessages.push(text); },
    });
    assert.deepEqual([...intrinsicsOf(elfPriest)], [[SLEEP_RES, FROM_RACE]]);
    assert.deepEqual(elfMessages, ['You feel awake!']);

    // A raise that crosses two entries at once cannot happen through
    // pluslvl(), which steps one level at a time, but adjabil() itself takes
    // both in table order. mon_abil[] holds { 3, POISON_RES, "healthy" } and
    // { 5, STEALTH, "stealthy" }.
    const monk = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_MONK, filecode: 'Mon' },
    });
    const monkMessages = [];
    await adjabil(2, 5, monk, {
        message: (text) => { monkMessages.push(text); },
    });
    assert.deepEqual(
        monkMessages,
        ['You feel healthy!', 'You feel stealthy!'],
    );
});

// attrib.c:1051 gates You_feel() on a non-empty gainstr, so an entry with an
// empty one changes the intrinsic silently. ran_abil[] { 15, &HSee_invisible,
// "", "" } is the only such entry above level 1.
test('adjabil grants a see-invisible entry with no gainstr silently',
    async () => {
    const ranger = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_RANGER, filecode: 'Ran' },
    });
    // The state is not the module-global game, so display.c see_monsters()
    // refuses it. That refusal is the probe: reaching it proves postadjabil()
    // dispatched on SEE_INVIS, and a message owner that fails the test proves
    // nothing printed on the way.
    await assert.rejects(
        () => adjabil(14, 15, ranger, {
            message: () => assert.fail('an empty gainstr must print nothing'),
        }),
        TypeError,
    );
    assert.deepEqual([...intrinsicsOf(ranger)], [[SEE_INVIS, FROMEXPER]]);
});

// attrib.c postadjabil() redraws for &HWarning and &HSee_invisible alone.
test('adjabil calls postadjabil only for warning and see invisible',
    async () => {
    // Every other property reaches postadjabil() and returns from it, so
    // see_monsters() never refuses this fabricated state.
    const valkyrie = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_VALKYRIE, filecode: 'Val' },
    });
    await adjabil(2, 3, valkyrie, { message: () => {} });
    assert.deepEqual([...intrinsicsOf(valkyrie)], [[STEALTH, FROMEXPER]]);

    // wiz_abil[] { 15, &HWarning, "sensitive", "" } does reach see_monsters().
    const wizard = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_WIZARD, filecode: 'Wiz' },
    });
    const messages = [];
    await assert.rejects(
        () => adjabil(14, 15, wizard, {
            message: (text) => { messages.push(text); },
        }),
        TypeError,
    );
    // The message runs first: C prints inside the gain arm and dispatches to
    // postadjabil() only after it.
    assert.deepEqual(messages, ['You feel sensitive!']);
    assert.deepEqual([...intrinsicsOf(wizard)], [[WARNING, FROMEXPER]]);
});

test('adjabil needs a message owner only for an entry that prints',
    async () => {
    // No owner and nothing to print: rog_abil[] holds nothing between 1 and 9.
    const quiet = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_ROGUE, filecode: 'Rog' },
    });
    await adjabil(1, 9, quiet);
    assert.deepEqual([...intrinsicsOf(quiet)], []);

    // rog_abil[] { 10, &HSearching, "perceptive", "" } does print.
    const rogue = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_ROGUE, filecode: 'Rog' },
    });
    await assert.rejects(() => adjabil(9, 10, rogue), TypeError);
});

test('adjabil refuses the transitions this slice leaves unported',
    async () => {
    // A loss: exper.c losexp() is the only caller that produces one.
    const valkyrie = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_VALKYRIE, filecode: 'Val' },
    });
    await assert.rejects(
        () => adjabil(3, 2, valkyrie),
        /removing property/,
    );

    // A lowered level with no table entry between the two: the loop finds
    // nothing to remove, and weapon.c lose_weapon_skill() still has to run.
    const knight = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_KNIGHT, filecode: 'Kni' },
    });
    await assert.rejects(
        () => adjabil(3, 2, knight),
        /lose_weapon_skill/,
    );
    // adjabil(n, n) reaches the same tail: C's `else` covers an unchanged
    // level as well as a lowered one, and lose_weapon_skill(0) is its no-op.
    // val_abil[]'s stealth entry sits exactly at 3, so the loss test has to
    // read `newlevel < abil->ulevel` strictly to leave it alone.
    await assert.rejects(
        () => adjabil(3, 3, heroState({
            role: { ...ARCHEOLOGIST, mnum: PM_VALKYRIE, filecode: 'Val' },
        })),
        /lose_weapon_skill/,
    );
});

test('setuhpmax owns u.uhpmax, u.uhppeak and the u.uhp ceiling', () => {
    const raised = heroState();
    setuhpmax(20, true, raised);
    assert.equal(raised.u.uhpmax, 20);
    assert.equal(raised.u.uhppeak, 20);
    assert.equal(raised.u.uhp, 13); /* unchanged: below the new maximum */
    assert.equal(raised.disp.botl, true);

    // A maximum below the current hit points drags them down with it, and
    // C sets disp.botl a second time when it does.
    const lowered = heroState();
    setuhpmax(9, true, lowered);
    assert.equal(lowered.u.uhpmax, 9);
    assert.equal(lowered.u.uhp, 9);
    assert.equal(lowered.disp.botl, true);
    // u.uhppeak only ever rises.
    assert.equal(lowered.u.uhppeak, 13);

    // An unchanged maximum leaves disp.botl alone, which is what keeps a
    // no-op call from repainting the status line.
    const unchanged = heroState();
    setuhpmax(13, true, unchanged);
    assert.equal(unchanged.disp.botl, undefined);

    // even_when_polyd is the second operand of C's `!Upolyd || even_when_polyd`
    // test, so a hero who is not polymorphed takes the same arm with it False.
    const notPolymorphed = heroState();
    setuhpmax(17, false, notPolymorphed);
    assert.equal(notPolymorphed.u.uhpmax, 17);
});

test('record_achievement appends once and rejects an out-of-range index', () => {
    const state = heroState();
    record_achievement(ACH_RNK1, state);
    record_achievement(ACH_RNK1 + 1, state);
    // insight.c:2429-2434 stops at the first matching entry and returns.
    record_achievement(ACH_RNK1, state);
    assert.deepEqual(
        state.u.uachieved.slice(0, 3),
        [ACH_RNK1, ACH_RNK1 + 1, 0],
    );
    // The complement of a rank index is a valid stored value, and matches the
    // positive one it duplicates. Both ends of the rank range are accepted.
    const female = heroState({ female: true });
    record_achievement(-ACH_RNK1, female);
    record_achievement(-ACH_RNK8, female);
    record_achievement(ACH_RNK8, female);
    assert.deepEqual(
        female.u.uachieved.slice(0, 3),
        [-ACH_RNK1, -ACH_RNK8, 0],
    );

    // insight.c:2414-2418 accepts every index from 1 to N_ACH-1 and, below 1,
    // only the complement of a rank.
    const lowest = heroState();
    record_achievement(1, lowest);
    record_achievement(N_ACH - 1, lowest);
    assert.deepEqual(lowest.u.uachieved.slice(0, 3), [1, N_ACH - 1, 0]);

    assert.throws(() => record_achievement(0, heroState()), RangeError);
    assert.throws(
        () => record_achievement(-(ACH_RNK1 - 1), heroState()),
        RangeError,
    );
    assert.throws(
        () => record_achievement(-(ACH_RNK8 + 1), heroState()),
        RangeError,
    );
    assert.throws(() => record_achievement(N_ACH, heroState()), RangeError);
});

test('achieve_rank complements the index for a female hero', () => {
    assert.equal(achieve_rank(1, heroState()), ACH_RNK1);
    assert.equal(achieve_rank(8, heroState()), ACH_RNK8);
    assert.equal(achieve_rank(1, heroState({ female: true })), -ACH_RNK1);
});

test('add_weapon_skill adds slots and refuses a new advanceable skill', () => {
    const state = heroState();
    add_weapon_skill(1, state);
    assert.equal(state.u.weapon_slots, 1);

    // P_BARE_HANDED_COMBAT (index 30) at P_UNSKILLED (1) with a maximum of
    // P_BASIC (2) and enough practice: weapon.c practice_needed_to_advance()
    // answers 20 * 1 * 1 = 20 for P_UNSKILLED, and slots_required() halves the
    // requirement for an unarmed skill, so one slot lifts can_advance().
    const advancing = heroState();
    advancing.u.weapon_skills = Array.from(
        { length: 38 },
        () => ({ skill: 0, max_skill: 0, advance: 0 }),
    );
    advancing.u.weapon_skills[30] = { skill: 1, max_skill: 2, advance: 20 };
    assert.throws(() => add_weapon_skill(1, advancing), /give_may_advance_msg/);
});

// exper.c pluslvl(false) is what #levelchange runs. The arithmetic below comes
// from newhp() and newpw() with the Archeologist and human rows pinned above:
//
//   newhp   u.ulevel 1 < xlev 14, so hp = lofix 0 + 0, + rnd(lornd 8)
//           + rnd(lornd 2), + conplus 0 for A_CON 10
//   newpw   enrnd = A_WIS 10 / 2 = 5, + lornd 1 + 0 = 6;
//           enfix = lofix 0 + 2 = 2; en = enermod(rn1(6, 2)), and
//           Archeologist takes enermod()'s default arm
test('pluslvl grants one level, in exper.c message order', async () => {
    const state = heroState();
    const messages = [];
    const draws = [];
    const random = {
        rnd: (n) => {
            draws.push(`rnd(${n})`);
            return n === 8 ? 5 : 2; /* 5 from rnd(8), 2 from rnd(2) */
        },
        rn1: (x, y) => {
            draws.push(`rn1(${x},${y})`);
            return 4; /* rn2(6) == 2, plus enfix 2 */
        },
    };

    await pluslvl(false, state, {
        message: (text) => { messages.push(text); },
        random,
    });

    // pline() order: the opening message runs before any draw, and the
    // welcome runs after u.ulevel has already been incremented.
    assert.deepEqual(messages, [
        'You feel more experienced.',
        'Welcome to experience level 2.',
    ]);
    assert.deepEqual(draws, ['rnd(8)', 'rnd(2)', 'rn1(6,2)']);

    assert.equal(state.u.ulevel, 2);
    assert.equal(state.u.ulevelmax, 2);
    assert.equal(state.u.ulevelpeak, 2);
    assert.equal(state.u.uhp, 20); /* 13 + 7 */
    assert.equal(state.u.uhpmax, 20);
    assert.equal(state.u.uhppeak, 20);
    assert.equal(state.u.uhpinc[1], 7); /* newhp() remembers the increment */
    assert.equal(state.u.uen, 7); /* 3 + 4 */
    assert.equal(state.u.uenmax, 7);
    assert.equal(state.u.uenpeak, 7);
    assert.equal(state.u.ueninc[1], 4);
    // pluslvl(FALSE) assigns rather than accumulates: u.uexp ends equal to the
    // threshold of the level just left, newuexp(1) == 20.
    assert.equal(state.u.uexp, newuexp(1));
    assert.equal(state.u.uexp, 20);
    assert.equal(state.disp.botl, true);
    // xlev_to_rank(1) and xlev_to_rank(2) are both 0, so no rank achievement.
    assert.deepEqual(state.u.uachieved.slice(0, 1), [0]);
    // adjabil(1, 2) reached add_weapon_skill(1).
    assert.equal(state.u.weapon_slots, 1);
});

test('pluslvl records the rank achievement that level 3 earns', async () => {
    const state = heroState();
    const random = { rnd: () => 1, rn1: () => 1 };
    const env = { message: () => {}, random };
    await pluslvl(false, state, env);
    await pluslvl(false, state, env);

    assert.equal(state.u.ulevel, 3);
    // xlev_to_rank(2) is 0 and xlev_to_rank(3) is 1, so achieve_rank(1)
    // records ACH_RNK1 for this male hero.
    assert.deepEqual(state.u.uachieved.slice(0, 2), [ACH_RNK1, 0]);
    // The welcome line reads "Welcome to ...", not "Welcome back to ...",
    // because u.ulevelmax rose with u.ulevel.
    assert.equal(state.u.ulevelmax, 3);
    assert.equal(state.u.uexp, newuexp(2));
});

test('pluslvl reads "Welcome back" only when u.ulevelmax is already higher',
    async () => {
    const state = heroState();
    // A hero who lost levels keeps the higher u.ulevelmax, which is the one
    // state in which C's `(u.ulevelmax < u.ulevel) ? "" : "back "` chooses
    // "back ". No ported path produces it, so this pins the ternary rather
    // than a reachable message. u.ulevelmax is one above u.ulevel, so the two
    // are equal when the comparison runs and a `<=` there would read "".
    state.u.ulevel = 2;
    state.u.ulevelmax = 3;
    const messages = [];
    await pluslvl(false, state, {
        message: (text) => { messages.push(text); },
        random: { rnd: () => 1, rn1: () => 1 },
    });
    assert.equal(messages[1], 'Welcome back to experience level 3.');
    assert.equal(state.u.ulevelmax, 3); /* unchanged: it was already there */
});

test('pluslvl at MAXULEV grants hit points and energy but no level',
    async () => {
    const state = heroState();
    // exper.c pluslvl()'s `if (u.ulevel < MAXULEV)` guard. wiz_level_change()
    // refuses before it can call pluslvl() here, but a potion of gain level
    // reaches it in C, and newhp()/newpw() throttle their gains above 30
    // rather than recording an increment.
    state.u.ulevel = MAXULEV;
    state.u.ulevelmax = MAXULEV;
    state.u.ulevelpeak = MAXULEV;
    const messages = [];
    await pluslvl(false, state, {
        message: (text) => { messages.push(text); },
        // newhp()'s hi branch: hifix 1 + 1, conplus 0, then throttled to
        // 5 - trunc(uhpmax / 300) == 5, so the raw 2 stands. newpw() takes
        // rn1()'s answer and throttles it to 4 - trunc(uenmax / 200) == 4.
        random: { rnd: () => 1, rn1: () => 3 },
    });
    assert.deepEqual(messages, ['You feel more experienced.']);
    assert.equal(state.u.ulevel, MAXULEV);
    assert.equal(state.u.uexp, 0); /* no assignment without a level */
    assert.equal(state.u.uhpmax, 15); /* 13 + hifix 1 + hifix 1 */
    assert.equal(state.u.uenmax, 6); /* 3 + rn1() 3 */
    assert.equal(state.disp.botl, true);
});

test('pluslvl refuses the incremental growth newexplevel() asks for',
    async () => {
    await assert.rejects(
        () => pluslvl(true, heroState(), { message: () => {} }),
        /newexplevel/,
    );
});

test('pluslvl prints the intrinsic it grants last, through the same owner',
    async () => {
    const state = heroState({
        role: { ...ARCHEOLOGIST, mnum: PM_VALKYRIE, filecode: 'Val' },
    });
    state.u.ulevel = 2;
    state.u.ulevelmax = 2;
    const messages = [];
    await pluslvl(false, state, {
        message: (text) => { messages.push(text); },
        random: { rnd: () => 1, rn1: () => 1 },
    });
    // val_abil[] { 3, &HStealth, "stealthy", "" }. exper.c calls adjabil()
    // after the welcome line, so the gain message is third in the chain and
    // shares the command's --More-- sequence with the two before it.
    assert.deepEqual(messages, [
        'You feel more experienced.',
        'Welcome to experience level 3.',
        'You feel stealthy!',
    ]);
    assert.equal(state.u.ulevel, 3);
    assert.deepEqual([...intrinsicsOf(state)], [[STEALTH, FROMEXPER]]);
});

// The matrix above is the strict evidence for these paths; runSegment() here
// reaches the same code from the '#' prompt so that wiz_level_change()'s own
// branches are exercised by the unit suite too.
function segmentFor(answer) {
    const found = loadLevelChangeRecipe().segments.find(
        (segment) => segment.moves.includes(`#levelchange\n${answer}`),
    );
    assert.ok(found, `the matrix answers the prompt with ${answer}`);
    return found;
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

test('#levelchange prompts, parses, and refuses at the prompt', async () => {
    const healer = segmentFor('abc');

    // getlin() paints the query before it reads anything.
    await runSegment({ ...healer, moves: '.#levelchange\n' });
    assert.equal(
        topLine(),
        'To what experience level do you want to be set?',
    );
    assert.equal(game.u.ulevel, 1);

    // sscanf() converts no field, so ret is 0.
    await runSegment({ ...healer, moves: '.#levelchange\nabc\n' });
    assert.equal(topLine(), 'Never mind.');
    assert.equal(game.u.ulevel, 1);

    // sscanf() converts two, which C rejects just as firmly.
    await runSegment({ ...healer, moves: '.#levelchange\n12x\n' });
    assert.equal(topLine(), 'Never mind.');
    assert.equal(game.u.ulevel, 1);

    // An empty line and an Escape both skip sscanf() altogether.
    await runSegment({ ...healer, moves: '.#levelchange\n\n' });
    assert.equal(topLine(), 'Never mind.');
    await runSegment({ ...healer, moves: '.#levelchange\n\x1b' });
    assert.equal(topLine(), 'Never mind.');

    // newlevel == u.ulevel.
    await runSegment({ ...healer, moves: '.#levelchange\n1\n' });
    assert.equal(topLine(), 'You are already that experienced.');
    assert.equal(game.u.ulevel, 1);

    // newlevel < u.ulevel with u.ulevel == 1: the arm that lowers nothing.
    await runSegment({ ...healer, moves: '.#levelchange\n0\n' });
    assert.equal(
        topLine(),
        'You are already as inexperienced as you can get.',
    );
    assert.equal(game.u.ulevel, 1);
});

test('#levelchange raises the hero and stops the More chain where C does',
    async () => {
    const wizard = segmentFor('14');

    // One gain: the welcome line lands beside the opening message and nothing
    // follows it, so no --More-- is pending.
    await runSegment({ ...wizard, moves: '.#levelchange\n2\n' });
    assert.equal(
        topLine(),
        'You feel more experienced.  Welcome to experience level 2.',
    );
    assert.equal(game.u.ulevel, 2);
    assert.equal(game.u.ulevelmax, 2);

    // Two gains: the second pluslvl()'s "You feel more experienced." no longer
    // fits beside the first pair, so update_topl() calls more() before it
    // prints. u.ulevel is still 2 there, because that message runs ahead of
    // the draws and the increment.
    await runSegment({ ...wizard, moves: '.#levelchange\n3\n' });
    assert.equal(
        topLine(),
        'You feel more experienced.  Welcome to experience level 2.--More--',
    );
    assert.equal(game.u.ulevel, 2);

    // Dismissing it draws the second pair, and one keystroke past the end of
    // the chain answers as an unknown command.
    await runSegment({ ...wizard, moves: '.#levelchange\n3\n  ' });
    assert.equal(topLine(), "Unknown command ' '.");
    assert.equal(game.u.ulevel, 3);
    // wiz_level_change()'s closing statement.
    assert.equal(game.u.ulevelmax, 3);
});

// The focused adjabil() tests above hand postadjabil() a fabricated state, so
// display.c see_monsters() refuses them. These two drive the module-global
// game instead, the only state see_monsters() accepts, with a pet on the level
// for it to redraw. Both raises stop at experience level 15 and spend the same
// fifteenth keystroke, so the only difference between their last screens is
// the one attrib.c's tables make.
test('#levelchange announces the intrinsic a level grants', async () => {
    const wizard = loadLevelChangeRecipe().segments.find(
        (segment) => segment.moves.includes('#levelchange\n18\n'),
    );
    assert.ok(wizard);

    // wiz_abil[] { 15, &HWarning, "sensitive", "" }, printed by exper.c after
    // the welcome line and therefore on the far side of its --More--.
    await runSegment({ ...wizard, moves: `.#levelchange\n15\n${' '.repeat(14)}` });
    assert.equal(game.u.ulevel, 15);
    assert.equal(game.u.uprops[WARNING].intrinsic, FROMEXPER);
    assert.equal(topLine(), 'You feel sensitive!');
});

test('#levelchange grants see invisible without announcing it', async () => {
    const ranger = loadLevelChangeRecipe().segments.find(
        (segment) => segment.moves.includes('#levelchange\n16\n'),
    );
    assert.ok(ranger);
    assert.ok(ranger.nethackrc.includes('pettype:dog'));

    // ran_abil[] { 15, &HSee_invisible, "", "" } has an empty gainstr, so the
    // welcome line is the whole of the last screen.
    await runSegment({ ...ranger, moves: `.#levelchange\n15\n${' '.repeat(14)}` });
    assert.equal(game.u.ulevel, 15);
    assert.equal(game.u.uprops[SEE_INVIS].intrinsic, FROMEXPER);
    assert.equal(topLine(), 'Welcome to experience level 15.');
    // postadjabil() reached see_monsters() with the pet on the level and the
    // map unchanged: newsym() answers the same glyph it already showed, and
    // display.h _mon_warning() needs m_lev / 4 >= svc.context.warnlevel, which
    // allmain.c:774 sets to 1, so no D:1 monster below level 4 raises one.
    // 'adjabil grants a see-invisible entry with no gainstr silently' above is
    // what discriminates the dispatch; this pins that it costs no screen.
    const monsters = [];
    for (let mon = game.level.monlist; mon; mon = mon.nmon) monsters.push(mon);
    assert.ok(
        monsters.some((mon) => mon.mtame),
        'see_monsters() walked a list holding the starting little dog',
    );
});

test('the level-change matrix covers each traced branch', () => {
    const moves = loadLevelChangeRecipe().segments.map(
        (segment) => segment.moves,
    );
    // One segment per wiz_level_change() answer that ends the command without
    // raising anything, so a regression in the parse cannot hide behind the
    // raising cases.
    for (const answer of ['1', '0', '-4', '', 'abc', '12x']) {
        assert.ok(
            moves.some((keys) => keys.includes(`#levelchange\n${answer}\n`)),
            `the matrix answers the prompt with ${JSON.stringify(answer)}`,
        );
    }
    // The Escape answer leaves the buffer holding "\033" instead of a line.
    assert.ok(moves.some((keys) => keys.includes('#levelchange\n\x1b')));
    // The raise that crosses newhp()'s and newpw()'s xlev switch.
    assert.ok(moves.some((keys) => keys.includes('#levelchange\n14\n')));
    // The raise that C clamps back to MAXULEV, whose hero then meets
    // wiz_level_change()'s `u.ulevel >= MAXULEV` arm.
    const clamped = moves.find((keys) => keys.includes('#levelchange\n31\n'));
    assert.ok(clamped);
    assert.ok(clamped.includes('#levelchange\n40\n'));

    // One raise per shape of innate gain the tables hold, keyed by the role
    // and the target that reaches it.
    const roles = loadLevelChangeRecipe().segments.map(
        (segment) => `${/role:(\w+)/u.exec(segment.nethackrc)[1]}`
            + `/${/race:(\w+)/u.exec(segment.nethackrc)[1]}`
            + `:${segment.moves}`,
    );
    for (const [expected, why] of [
        ['Archeologist/human:.#levelchange\n6\n', 'a lone gain, no redraw'],
        ['Wizard/human:.#levelchange\n18\n', 'two gains, one of them a redraw'],
        ['Ranger/human:.#levelchange\n16\n', 'a gain with an empty gainstr'],
        ['Priest/elf:.#levelchange\n5\n', 'a gain with the FROMRACE mask'],
        ['Monk/human:.#levelchange\n12\n', 'five gains in one command'],
    ]) {
        assert.ok(roles.some((key) => key.startsWith(expected)), why);
    }
});
