// Focused tests for weapon.c enhance_weapon_skill() and the skill-menu helpers
// it calls: add_skills_to_menu(), could_advance(), peaked_skill(), and
// skill_advance().
//
// The recorded evidence is the ten-segment matrix in
// scripts/run-enhance-command.mjs, which compares complete screens, cursors
// and random-number calls against fresh C recordings for every listing shape
// a role can produce. The first group of tests below replays that matrix
// through the port, so the menus it recorded stay pinned without a C recorder.
//
// The rest pin exact line formats and direct state transitions that the menu
// screen comparison does not expose as individual assertions.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ECMD_OK,
    P_ATTACK_SPELL,
    P_BASIC,
    P_EXPERT,
    P_ISRESTRICTED,
    P_LONG_SWORD,
    P_MASTER,
    P_NUM_SKILLS,
    P_POLEARMS,
    P_QUARTERSTAFF,
    P_SKILLED,
    P_SKILL_LIMIT,
    P_UNSKILLED,
    TIP_ENHANCE,
} from '../js/const.js';
import { failClosedCommandRefusals } from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { P_RESTRICTED, skillSlot } from '../js/startup_skills.js';
import {
    UnsupportedWeaponSkillError,
    add_skills_to_menu,
    could_advance,
    enhance_weapon_skill,
    peaked_skill,
    show_skills,
    skill_advance,
} from '../js/weapon.js';
import {
    CASES,
    loadEnhanceCommandRecipe,
    verifyEnhanceCommandSegment,
} from './run-enhance-command.mjs';

test('the #enhance matrix keeps replay inputs only', () => {
    const recipe = loadEnhanceCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    assert.equal(recipe.segments.length, CASES.length);
});

for (const entry of CASES) {
    test(`${entry.label} replays through the port`, async () => {
        const segment = loadEnhanceCommandRecipe().segments.find(
            (candidate) => candidate.seed === entry.seed,
        );
        await verifyEnhanceCommandSegment(segment);
    });
}

// Replay one matrix start's leading wait and hand back the live state. Every
// test below acts on a hero who has taken a single turn, which is what the
// recorded segments do before typing the command.
async function heroAfterOneTurn(label) {
    const entry = CASES.find((candidate) => candidate.label === label);
    const segment = loadEnhanceCommandRecipe().segments.find(
        (candidate) => candidate.seed === entry.seed,
    );
    await runSegment({ ...segment, moves: '.' });
    return game;
}

function menuText(state) {
    return add_skills_to_menu(state).map((line) => (
        line.heading ? `H ${line.text}` : `  ${line.text}`
    ));
}

// weapon.c add_skills_to_menu() writes each skill as `" %s %-*s [%s]"` with an
// empty prefix, so a line is two spaces, the name padded to the widest
// unrestricted name, a space, and the bracketed level.
//
// Monk's widest is "enchantment spells", 18 characters. Its levels come from
// u_init.c: skill_init():1764-1765 sets P_HEALING_SPELL to P_BASIC for a Monk
// or a Healer, :1784-1785 sets P_BARE_HANDED_COMBAT to P_BASIC because
// Skill_Mon[]:387 caps P_MARTIAL_ARTS above P_EXPERT, and :1779-1780 leaves
// every other Skill_Mon[] entry at P_UNSKILLED. skills.h martial_bonus() is
// what names skill 35 "martial arts" rather than "bare handed combat".
//
// Skill_Mon[]:376-388 lists eleven skills plus P_MARTIAL_ARTS, and every skill
// it does not list stays P_ISRESTRICTED, which is why P_DAGGER -- the first
// entry of skill_ranges[1] -- is missing while its heading is not.
test('add_skills_to_menu writes weapon.c line format for a Monk', async () => {
    const state = await heroAfterOneTurn('monk-one-page');
    assert.deepEqual(menuText(state), [
        'H Fighting Skills',
        '    martial arts       [Basic]',
        'H Weapon Skills',
        '    quarterstaff       [Unskilled]',
        '    spear              [Unskilled]',
        '    crossbow           [Unskilled]',
        '    shuriken           [Unskilled]',
        'H Spellcasting Skills',
        '    attack spells      [Unskilled]',
        '    healing spells     [Basic]',
        '    divination spells  [Unskilled]',
        '    enchantment spells [Unskilled]',
        '    clerical spells    [Unskilled]',
        '    escape spells      [Unskilled]',
        '    matter spells      [Unskilled]',
    ]);
});

// The same format against a role whose widest unrestricted name is one
// character shorter, so the bracket column moves with `longest` rather than
// sitting at a fixed offset. Samurai's widest is "two weapon combat", 17.
// u_init.c Skill_S[]:468-488 restricts P_ENCHANTMENT_SPELL, and martial_bonus()
// renames skill 35, so neither 18-character name is reachable here.
test('add_skills_to_menu narrows the column for a Samurai', async () => {
    const state = await heroAfterOneTurn('samurai-narrow-column');
    assert.deepEqual(menuText(state).slice(0, 4), [
        'H Fighting Skills',
        '    martial arts      [Basic]',
        '    two weapon combat [Unskilled]',
        '    riding            [Unskilled]',
    ]);
});

// weapon.c:1294-1296. iflags.menu_tab_sep replaces the padded column with a
// tab-separated one, and options.c optfn_boolean() lets a configuration file
// set it in an ordinary game.
test('add_skills_to_menu refuses menu_tab_sep columns', async () => {
    const state = await heroAfterOneTurn('monk-one-page');
    state.iflags.menu_tab_sep = true;
    assert.throws(
        () => add_skills_to_menu(state),
        UnsupportedWeaponSkillError,
    );
});

// A synthetic skill table, so each of could_advance()'s and peaked_skill()'s
// three guards can be moved one at a time. Every slot but the one under test
// stays restricted, the state skill_init() starts from.
function skillState({ skill, max_skill, advance, skills_advanced = 0 }) {
    return {
        u: {
            skills_advanced,
            weapon_slots: 0,
            weapon_skills: Array.from({ length: P_NUM_SKILLS }, () => ({
                skill: P_ISRESTRICTED,
                max_skill: P_ISRESTRICTED,
                advance: 0,
            })).map((slot, index) => (
                index === P_QUARTERSTAFF
                    ? { skill, max_skill, advance }
                    : slot
            )),
        },
    };
}

// weapon.c could_advance():1171-1182. practice_needed_to_advance(P_UNSKILLED)
// is 1 * 1 * 20 = 20, so 19 is one short and 20 is exactly enough. The
// weapon-slot term can_advance() adds is absent here: every state below leaves
// u.weapon_slots at 0 and could_advance() still answers TRUE on the practice.
test('could_advance needs the practice but not the slots', () => {
    assert.equal(could_advance(P_QUARTERSTAFF, skillState({
        skill: P_UNSKILLED, max_skill: P_BASIC, advance: 20,
    })), true);
    assert.equal(could_advance(P_QUARTERSTAFF, skillState({
        skill: P_UNSKILLED, max_skill: P_BASIC, advance: 19,
    })), false);
    // Restricted: P_SKILL is P_ISRESTRICTED however much practice it carries.
    assert.equal(could_advance(P_QUARTERSTAFF, skillState({
        skill: P_ISRESTRICTED, max_skill: P_BASIC, advance: 20,
    })), false);
    // At the ceiling, which is peaked_skill()'s case rather than this one.
    assert.equal(could_advance(P_QUARTERSTAFF, skillState({
        skill: P_BASIC, max_skill: P_BASIC, advance: 80,
    })), false);
    // u.skills_advanced at P_SKILL_LIMIT, the 60th advancement.
    assert.equal(could_advance(P_QUARTERSTAFF, skillState({
        skill: P_UNSKILLED, max_skill: P_BASIC, advance: 20,
        skills_advanced: P_SKILL_LIMIT,
    })), false);
    assert.equal(could_advance(P_QUARTERSTAFF, skillState({
        skill: P_UNSKILLED, max_skill: P_BASIC, advance: 20,
        skills_advanced: P_SKILL_LIMIT - 1,
    })), true);
});

// weapon.c peaked_skill():1184-1195. It tests the ceiling and the practice and
// nothing else: u.skills_advanced does not appear, so a hero who has spent
// every advancement still sees the "#" flag on a maxed skill.
// practice_needed_to_advance(P_BASIC) is 2 * 2 * 20 = 80.
test('peaked_skill needs the ceiling and the practice past it', () => {
    assert.equal(peaked_skill(P_QUARTERSTAFF, skillState({
        skill: P_BASIC, max_skill: P_BASIC, advance: 80,
    })), true);
    // Practice one short of the step it can never take.
    assert.equal(peaked_skill(P_QUARTERSTAFF, skillState({
        skill: P_BASIC, max_skill: P_BASIC, advance: 79,
    })), false);
    // Below the ceiling: could_advance()'s case, not this one.
    assert.equal(peaked_skill(P_QUARTERSTAFF, skillState({
        skill: P_UNSKILLED, max_skill: P_BASIC, advance: 80,
    })), false);
    // Past the ceiling, which skill_advance() cannot produce but `>=` accepts.
    // The practice term reads the current level rather than the maximum, so
    // this one needs practice_needed_to_advance(P_SKILLED) = 3 * 3 * 20 = 180.
    assert.equal(peaked_skill(P_QUARTERSTAFF, skillState({
        skill: P_SKILLED, max_skill: P_BASIC, advance: 180,
    })), true);
    assert.equal(peaked_skill(P_QUARTERSTAFF, skillState({
        skill: P_SKILLED, max_skill: P_BASIC, advance: 179,
    })), false);
    assert.equal(peaked_skill(P_QUARTERSTAFF, skillState({
        skill: P_ISRESTRICTED, max_skill: P_ISRESTRICTED, advance: 80,
    })), false);
    // u.skills_advanced is not one of its guards.
    assert.equal(peaked_skill(P_QUARTERSTAFF, skillState({
        skill: P_BASIC, max_skill: P_BASIC, advance: 80,
        skills_advanced: P_SKILL_LIMIT,
    })), true);
});

// weapon.c skill_advance():1197-1213. This state starts with one available
// slot and exactly the 20 practice points required to advance quarterstaff
// from Unskilled to Basic; the injected message captures C's source order.
test('skill_advance consumes slots, records the skill and reports the level',
    async () => {
        const state = await heroAfterOneTurn('monk-one-page');
        const skill = skillSlot(P_QUARTERSTAFF, state);
        skill.advance = 20;
        state.u.weapon_slots = 1;
        const messages = [];
        await skill_advance(
            P_QUARTERSTAFF,
            state,
            { message: async (text) => messages.push(text) },
        );
        assert.equal(skill.skill, P_BASIC);
        assert.equal(state.u.weapon_slots, 0);
        assert.equal(state.u.skills_advanced, 1);
        assert.equal(state.u.skill_record[0], P_QUARTERSTAFF);
        assert.deepEqual(messages, ['You are now most skilled in quarterstaff.']);
    });

test('skill_advance refreshes spellbook IDs for a spell skill', async () => {
    const state = await heroAfterOneTurn('monk-one-page');
    const skill = skillSlot(P_ATTACK_SPELL, state);
    skill.skill = P_UNSKILLED;
    skill.max_skill = P_BASIC;
    state.u.weapon_slots = 1;
    let refreshed = 0;
    await skill_advance(P_ATTACK_SPELL, state, {
        message: async () => {},
        spellbookIds: () => { refreshed++; },
    });
    assert.equal(skill.skill, P_BASIC);
    assert.equal(refreshed, 1);
});

// weapon.c show_skills():1306-1326. DUMPLOG is disabled in the recorder
// build, so this direct owner test pins its message, standard PICK_NONE menu,
// and empty end_menu() prompt without pretending that a gameplay command
// reaches the disclosure-only helper.
test('show_skills writes the disclosure heading and dismissible menu',
    async () => {
        const state = await heroAfterOneTurn('monk-one-page');
        const messages = [];
        const shown = [];
        await show_skills(state, {
            message: async (text) => messages.push(text),
            menu: async (items, how, prompt) => shown.push({
                items, how, prompt,
            }),
        });
        assert.deepEqual(messages, ['Skills:']);
        assert.equal(shown.length, 1);
        assert.equal(shown[0].how, 0);
        assert.equal(shown[0].prompt, '');
        assert.deepEqual(
            shown[0].items.map((item) => item.heading
                ? { text: item.text, heading: true }
                : { text: item.text }),
            add_skills_to_menu(state),
        );
    });

// weapon.c enhance_weapon_skill():1340-1405. In speedy wizard mode every
// unrestricted skill is selectable even without practice or slots, and the
// loop rebuilds the menu after each selected skill until dismissal.
test('enhance_weapon_skill advances selected skills in speedy wizard mode',
    async () => {
        const state = await heroAfterOneTurn('samurai-narrow-column');
        state.wizard = true;
        const prompts = [];
        const selected = [P_LONG_SWORD + 1, P_POLEARMS + 1];
        const result = await enhance_weapon_skill(state, {
            ask: async () => 'y'.charCodeAt(0),
            menu: async (items, how, prompt) => {
                prompts.push({ items, how, prompt });
                return selected.shift() ?? null;
            },
            message: async () => {},
        });
        assert.equal(result, ECMD_OK);
        assert.equal(prompts.length, 3);
        assert.equal(prompts[0].how, 1);
        assert.equal(prompts[0].prompt, 'Pick a skill to advance:');
        // Samurai starts long sword at Basic and polearms at Unskilled.
        assert.equal(state.u.weapon_skills[P_LONG_SWORD].skill, P_SKILLED);
        assert.equal(state.u.weapon_skills[P_POLEARMS].skill, P_BASIC);
        assert.deepEqual(state.u.skill_record.slice(0, 2), [
            P_LONG_SWORD, P_POLEARMS,
        ]);
    });

// The starting hero of every matrix case has practised nothing, so all three
// counters are zero.
test('a starting hero leaves all three counters at zero', async () => {
    for (const entry of CASES) {
        const state = await heroAfterOneTurn(entry.label);
        for (let i = 0; i < P_NUM_SKILLS; i++) {
            if (P_RESTRICTED(i, state)) continue;
            assert.equal(could_advance(i, state), false,
                `${entry.label} skill ${i} could advance`);
            assert.equal(peaked_skill(i, state), false,
                `${entry.label} skill ${i} peaked`);
        }
    }
});

test('enhance_weapon_skill shows the listing and answers ECMD_OK', async () => {
    const state = await heroAfterOneTurn('monk-one-page');
    const shown = [];
    const result = await enhance_weapon_skill(state, {
        menu: (items, how, prompt) => { shown.push({ items, how, prompt }); },
    });
    assert.equal(result, ECMD_OK);
    assert.equal(shown.length, 1);
    // weapon.c:1383. to_advance is zero, so the title is the checking one.
    assert.equal(shown[0].prompt, 'Current skills:');
    assert.equal(shown[0].how, 0);
    assert.deepEqual(shown[0].items, add_skills_to_menu(state));
    // :1338 -- the tip is marked seen whether or not anything can advance,
    // and svc.context, zeroed at game start, holds no other tip yet.
    assert.equal(state.context.tips, 1 << TIP_ENHANCE);
});

// js/cmd.js failClosedCommand() converts only the classes this list names; a
// class left out of it escapes as a hard failure and discards the segment's
// matching prefix instead of stopping on it.
test('the weapon-skill refusal ends the segment rather than the run', () => {
    assert.ok(failClosedCommandRefusals().includes(UnsupportedWeaponSkillError));
});

// The column the menu's first drawn character lands in, after a segment that
// stops with the window still open.
async function menuColumn(label) {
    const entry = CASES.find((candidate) => candidate.label === label);
    const segment = loadEnhanceCommandRecipe().segments.find(
        (candidate) => candidate.seed === entry.seed,
    );
    await runSegment({ ...segment, moves: '.#enhance\n' });
    const row = game.nhDisplay.grid[0].map(({ ch }) => ch).join('');
    return row.indexOf('Current skills:');
}

// wintty.c tty_display_nhwindow():1924-1925. js/cmd.js hands the window owner
// `overlay: iflags.menu_overlay !== false`, and only a configuration file that
// turns the option off separates the two branches: a listing short enough to
// leave maxrow under the terminal height opens beside the map with the option
// on and covers it with the option off.
test('an #enhance menu opens beside the map only while overlay is on',
    async () => {
        assert.equal(await menuColumn('monk-one-page'), 41);
        assert.equal(await menuColumn('monk-no-overlay'), 1);
    });

// P_MASTER and P_EXPERT are read by skill_level_name(), which the listing
// calls for every entry. No matrix role starts a skill above P_BASIC, so this
// pins the two names the recorded screens cannot show.
test('the listing names every skill level it can print', async () => {
    const state = await heroAfterOneTurn('monk-one-page');
    skillSlot(P_QUARTERSTAFF, state).skill = P_MASTER;
    skillSlot(P_QUARTERSTAFF, state).max_skill = P_MASTER;
    assert.ok(menuText(state).includes('    quarterstaff       [Master]'));
    skillSlot(P_QUARTERSTAFF, state).skill = P_EXPERT;
    assert.ok(menuText(state).includes('    quarterstaff       [Expert]'));
});
