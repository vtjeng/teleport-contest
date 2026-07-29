import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_WIS,
    NO_SPELL,
    NUM_ATTRS,
    P_ATTACK_SPELL,
    P_BASIC,
    P_CLERIC_SPELL,
    P_DIVINATION_SPELL,
    P_ENCHANTMENT_SPELL,
    P_ESCAPE_SPELL,
    P_EXPERT,
    P_HEALING_SPELL,
    P_ISRESTRICTED,
    P_MATTER_SPELL,
    P_NUM_SKILLS,
    P_SKILLED,
    P_UNSKILLED,
    PICK_NONE,
    PICK_ONE,
} from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import {
    GAUNTLETS_OF_POWER,
    HELMET,
    IRON_SHOES,
    LARGE_SHIELD,
    MAXSPELL,
    PLATE_MAIL,
    ROBE,
    SMALL_SHIELD,
    SPE_CURE_SICKNESS,
    SPE_EXTRA_HEALING,
    SPE_HEALING,
    SPE_STONE_TO_FLESH,
} from '../js/objects.js';
import { roles } from '../js/roles.js';
import {
    age_spells,
    dovspell,
    percent_success,
    spellet,
    spellretention,
    spelltypemnemonic,
    UnsupportedSpellDisplayError,
} from '../js/spell.js';
import { SPELL_KNOWLEDGE_KEEN } from '../js/startup_skills.js';

test('age_spells decrements contiguous nonzero spell knowledge once', () => {
    const state = {
        svs: {
            spl_book: [
                { sp_id: 400, sp_know: 20_000 },
                { sp_id: 401, sp_know: 1 },
                { sp_id: 402, sp_know: 0 },
                { sp_id: NO_SPELL, sp_know: 99 },
                { sp_id: 403, sp_know: 99 },
            ],
        },
    };
    age_spells(state);
    assert.deepEqual(
        state.svs.spl_book.map(({ sp_know }) => sp_know),
        [19_999, 0, 0, 99, 99],
    );
});

test('age_spells accepts an empty initialized spellbook', () => {
    const state = { svs: { spl_book: [] } };
    assert.doesNotThrow(() => age_spells(state));
});

function roleByFilecode(filecode) {
    const role = roles.find((candidate) => candidate.filecode === filecode);
    assert.ok(role, `missing test role ${filecode}`);
    return role;
}

// A hero carrying nothing, so percent_success() takes none of its equipment
// branches. `wisdom` feeds ACURR(gu.urole.spelstat) for the roles whose
// spelstat is A_WIS, and `healingSkill` is P_SKILL(P_HEALING_SPELL).
function spellState({
    filecode = 'Hea',
    wisdom = 15,
    ulevel = 1,
    healingSkill = P_BASIC,
    spells = [],
    worn = {},
} = {}) {
    const attributes = new Array(NUM_ATTRS).fill(0);
    attributes[A_WIS] = wisdom;
    const state = {
        urole: roleByFilecode(filecode),
        u: {
            ulevel,
            acurr: { a: attributes },
            weapon_skills: Array.from(
                { length: P_NUM_SKILLS },
                () => ({ skill: P_ISRESTRICTED, max_skill: P_ISRESTRICTED, advance: 0 }),
            ),
        },
        svs: {
            spl_book: Array.from(
                { length: MAXSPELL + 1 },
                () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
            ),
        },
        iflags: {},
        flags: {},
    };
    state.u.weapon_skills[P_HEALING_SPELL].skill = healingSkill;
    // percent_success() reads the worn slots straight off the state, so a
    // bare { otyp } is all is_metallic() and the ROBE tests need.
    for (const [slot, otyp] of Object.entries(worn)) {
        state[slot] = { otyp, quan: 1, spe: 0 };
    }
    // Fixed zero choices initialize the object catalog and its descriptions
    // without consuming randomness.
    init_objects(state, () => 0);
    spells.forEach(({ otyp, know = SPELL_KNOWLEDGE_KEEN }, index) => {
        state.svs.spl_book[index] = {
            sp_id: otyp,
            sp_lev: state.objects[otyp].oc_level,
            sp_know: know,
        };
    });
    return state;
}

test('spellet numbers the casting letters a..z then A..Z', () => {
    // spell.c spellet(): 'a' + spell below 26, 'A' + spell - 26 above it.
    assert.deepEqual(
        [0, 25, 26, 51].map(spellet),
        ['a', 'z', 'A', 'Z'],
    );
});

test('spelltypemnemonic names each spell school', () => {
    assert.deepEqual(
        [
            P_ATTACK_SPELL, P_HEALING_SPELL, P_DIVINATION_SPELL,
            P_ENCHANTMENT_SPELL, P_CLERIC_SPELL, P_ESCAPE_SPELL,
            P_MATTER_SPELL,
        ].map(spelltypemnemonic),
        [
            'attack', 'healing', 'divination', 'enchantment', 'clerical',
            'escape', 'matter',
        ],
    );
    // C answers impossible() plus an empty string for anything else; no
    // spellbook a hero can learn from carries such an oc_skill.
    assert.throws(() => spelltypemnemonic(P_UNSKILLED), RangeError);
});

test('percent_success follows spell.c for an unequipped Healer', () => {
    // Healer: spelbase 3, spelheal -3, spelstat A_WIS, spelspec cure
    // sickness. With Wis 15 and no equipment, splcaster is 3 and
    // chance starts at 11 * 15 / 2 == 82.
    const state = spellState({
        spells: [
            { otyp: SPE_HEALING },
            { otyp: SPE_EXTRA_HEALING },
            { otyp: SPE_STONE_TO_FLESH },
        ],
    });

    // healing is on spelheal's list, so splcaster becomes 3 + -3 == 0.
    // Level 1 at Basic: difficulty = 0 - (6 + 0 + 1) == -7, learning is
    // 15 * 7 / 1 == 105 which caps at 20, so chance is 102; 102 * 20 / 15
    // is 136, capped at 100.
    assert.equal(percent_success(0, state), 100);
    // extra healing is on the same list. Level 3: difficulty = 8 - 7 == 1,
    // so chance is 82 - isqrt(2900) == 82 - 53 == 29, then 29 * 20 / 15
    // truncates to 38.
    assert.equal(percent_success(1, state), 38);
    // stone to flesh is a healing-school spell but not on spelheal's list,
    // so splcaster stays 3: chance 29 becomes 29 * 17 / 15 == 32, minus 3.
    assert.equal(percent_success(2, state), 29);
});

test('percent_success clamps a hopeless spell at zero', () => {
    // The same level 3 spell at Unskilled: difficulty = 8 - (0 + 0 + 1)
    // == 7, so chance is 82 - isqrt(8300) == 82 - 91, clamped to 0. The
    // trailing "- splcaster" then leaves -3, which clamps to 0 as well.
    const state = spellState({
        healingSkill: P_UNSKILLED,
        spells: [{ otyp: SPE_STONE_TO_FLESH }],
    });
    assert.equal(percent_success(0, state), 0);
});

test('spellretention widens its range as skill drops', () => {
    // KEEN is 20000, so one turn of aging leaves 19999 and a raw percent of
    // (19999 - 1) / 200 + 1 == 100, rounded up to the top of each range.
    const aged = 19_999;
    const retention = (skill) => spellretention(0, spellState({
        healingSkill: skill,
        spells: [{ otyp: SPE_HEALING, know: aged }],
    }));
    assert.equal(retention(P_EXPERT), '99%-100%');
    assert.equal(retention(P_SKILLED), '96%-100%');
    assert.equal(retention(P_BASIC), '91%-100%');
    assert.equal(retention(P_UNSKILLED), '76%-100%');
    // A restricted discipline is treated as Unskilled rather than narrower.
    assert.equal(retention(P_ISRESTRICTED), '76%-100%');
});

test('spellretention reports the full and expired ends of the scale', () => {
    const at = (know) => spellretention(0, spellState({
        spells: [{ otyp: SPE_HEALING, know }],
    }));
    assert.equal(at(SPELL_KNOWLEDGE_KEEN), '100%');
    assert.equal(at(0), '(gone)');
    // 5000 turns left is a raw percent of (5000 - 1) / 200 + 1 == 25, which
    // Basic's 10% intervals round up to 30.
    assert.equal(at(5_000), '21%-30%');
});

// Records the arguments dospellmenu() passes to select_menu() and answers
// with `choice`, which is C's selected[0].item.a_int.
function menuRecorder(choice = null) {
    const calls = [];
    return {
        calls,
        menu: (items, how, prompt) => {
            calls.push({ items, how, prompt });
            return choice;
        },
    };
}

test('dovspell answers a hero who knows no spells without a menu', async () => {
    const state = spellState();
    const messages = [];
    const recorder = menuRecorder();
    assert.equal(
        await dovspell(state, {
            message: (text) => messages.push(text),
            menu: recorder.menu,
        }),
        false,
    );
    assert.deepEqual(messages, ["You don't know any spells right now."]);
    assert.equal(recorder.calls.length, 0);
});

test('dovspell lists known spells in spl_book order', async () => {
    const state = spellState({
        spells: [
            { otyp: SPE_HEALING, know: 19_999 },
            { otyp: SPE_EXTRA_HEALING, know: 19_999 },
            { otyp: SPE_STONE_TO_FLESH, know: 19_999 },
        ],
    });
    const recorder = menuRecorder();
    assert.equal(
        await dovspell(state, { message: () => {}, menu: recorder.menu }),
        false,
    );
    assert.equal(recorder.calls.length, 1);
    const { items, how, prompt } = recorder.calls[0];
    assert.equal(prompt, 'Currently known spells');
    // Three spells leave something to swap with, so C keeps PICK_ONE and
    // appends the sort entry.
    assert.equal(how, PICK_ONE);
    assert.deepEqual(items[0], {
        text: '    Name                 Level Category     Fail Retention',
        heading: true,
    });
    assert.deepEqual(items.slice(1), [
        {
            selector: 'a',
            label: 'healing                1   healing        0%  91%-100%',
            value: 1,
        },
        {
            selector: 'b',
            label: 'extra healing          3   healing       62%  91%-100%',
            value: 2,
        },
        {
            selector: 'c',
            label: 'stone to flesh         3   healing       71%  91%-100%',
            value: 3,
        },
        // SPELLMENU_SORT is MAXSPELL, and every menu value is that index
        // plus one.
        { selector: '+', label: '[sort spells]', value: MAXSPELL + 1 },
    ]);
});

test('dovspell asks for a display-only menu when one spell is known', async () => {
    const state = spellState({ spells: [{ otyp: SPE_HEALING }] });
    const recorder = menuRecorder();
    await dovspell(state, { message: () => {}, menu: recorder.menu });
    const { items, how } = recorder.calls[0];
    // spellid(1) == NO_SPELL leaves nothing to swap with, so C switches to
    // PICK_NONE and adds no sort entry.
    assert.equal(how, PICK_NONE);
    assert.equal(items.length, 2);
});

test('dovspell stops on the reordering and sorting branches', async () => {
    const state = spellState({
        spells: [{ otyp: SPE_HEALING }, { otyp: SPE_EXTRA_HEALING }],
    });
    await assert.rejects(
        dovspell(state, {
            message: () => {},
            menu: menuRecorder(MAXSPELL + 1).menu,
        }),
        (error) => error instanceof UnsupportedSpellDisplayError
            && error.branch === 'spellsortmenu()',
    );
    await assert.rejects(
        dovspell(state, {
            message: () => {},
            // Choosing 'b' returns svs.spl_book index 1 plus one.
            menu: menuRecorder(2).menu,
        }),
        (error) => error instanceof UnsupportedSpellDisplayError
            && error.branch === 'the spell reordering swap',
    );
});

test('dovspell stops before drawing a tab-separated menu', async () => {
    const state = spellState({ spells: [{ otyp: SPE_HEALING }] });
    state.iflags.menu_tab_sep = true;
    const recorder = menuRecorder();
    await assert.rejects(
        dovspell(state, { message: () => {}, menu: recorder.menu }),
        (error) => error instanceof UnsupportedSpellDisplayError
            && error.branch === 'menu_tab_sep columns',
    );
    assert.equal(recorder.calls.length, 0);
});

test('percent_success applies spell.c\'s worn-equipment adjustments', () => {
    // Every case below casts extra healing, which an unequipped Healer casts
    // at 38%: splcaster is 3 + spelheal(-3) == 0, and chance is
    // 82 - isqrt(2900) == 29, so 29 * 20 / 15 == 38. Extra healing is used
    // rather than healing because healing's 100 clamps and hides the
    // adjustment. Expected values step spell.c's arithmetic by hand.
    const cast = (worn) => percent_success(0, spellState({
        worn, spells: [{ otyp: SPE_EXTRA_HEALING }],
    }));

    assert.equal(cast({}), 38);
    // A metallic suit adds the Healer's spelarmr, 10: splcaster 3 + 10 - 3
    // == 10, and 29 * (20 - 10) / 15 == 19, minus 10.
    assert.equal(cast({ uarm: PLATE_MAIL }), 9);
    // A robe over that suit halves spelarmr: splcaster 3 + 5 - 3 == 5, and
    // 29 * 15 / 15 == 29, minus 5. The Healer's spelarmr is even, so this
    // case does not exercise C's integer division; the Knight below does.
    assert.equal(cast({ uarm: PLATE_MAIL, uarmc: ROBE }), 24);
    // A robe with no metallic suit takes the else-if arm and subtracts
    // spelarmr instead: splcaster 3 - 10 - 3 == -10, so 29 * 30 / 15 == 58,
    // plus 10.
    assert.equal(cast({ uarmc: ROBE }), 68);
    // The three metal-piece penalties, each with the suit absent so only one
    // term moves: helmet 4, gloves 6, boots 2.
    assert.equal(cast({ uarmh: HELMET }), 26);
    assert.equal(cast({ uarmg: GAUNTLETS_OF_POWER }), 21);
    assert.equal(cast({ uarmf: IRON_SHOES }), 32);
    // spelshld is 2 for a Healer. A small shield is not heavier than
    // SMALL_SHIELD, so the quartering clamp below does not fire.
    assert.equal(cast({ uarms: SMALL_SHIELD }), 32);

    // Anything heavier than a small shield quarters the chance first, and
    // only halves it for the role's own special spell. LARGE_SHIELD weighs
    // 100 against SMALL_SHIELD's 30. Not the Healer's spelspec, so: splcaster
    // 3 + 2 - 3 == 2, chance 29 / 4 == 7, then 7 * 18 / 15 == 8, minus 2.
    assert.equal(cast({ uarms: LARGE_SHIELD }), 6);
});

test('percent_success halves rather than quarters the role\'s own spell', () => {
    // SPE_CURE_SICKNESS is the Healer's spelspec, so it takes spelsbon -4 and,
    // being on spelheal's list, another -3: splcaster 3 + 2 - 4 - 3 == -2.
    // It is level 3 like extra healing, so chance is 29 again; the heavy
    // shield halves it to 14, and 14 * 22 / 15 == 20, plus 2.
    assert.equal(
        percent_success(0, spellState({
            worn: { uarms: LARGE_SHIELD },
            spells: [{ otyp: SPE_CURE_SICKNESS }],
        })),
        22,
    );
});

test('percent_success truncates an odd spelarmr under a robe', () => {
    // A Knight has spelarmr 9, so C's `gu.urole.spelarmr / 2` truncates to 4
    // where an exact halving would give 4.5. paladin_bonus needs
    // P_CLERIC_SPELL, and extra healing is a healing-school spell, so the
    // metal-armor arms still apply. splcaster 8 + 4 + spelheal(-2) == 10, and
    // chance 29 * (20 - 10) / 15 == 19, minus 10.
    assert.equal(
        percent_success(0, spellState({
            filecode: 'Kni',
            worn: { uarm: PLATE_MAIL, uarmc: ROBE },
            spells: [{ otyp: SPE_EXTRA_HEALING }],
        })),
        9,
    );
});
