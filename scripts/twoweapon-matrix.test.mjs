import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    INVENTORY_CASES,
    REFUSAL_CASES,
    SKILL_CASES,
    TIME_COST_CASES,
    loadTwoWeaponCommandRecipe,
    loadTwoWeaponInventoryRecipe,
    loadTwoWeaponNamingRecipe,
    loadTwoWeaponRefusalRecipe,
    loadTwoWeaponSkillRecipe,
    loadTwoWeaponStatusRecipe,
    loadTwoWeaponSwitchRecipe,
    verifyTwoWeaponCommandSegment,
} from './run-twoweapon-command.mjs';

function roleOf(segment) {
    return /role:([A-Za-z]+),race:([a-z]+),gender:([a-z]+)/u
        .exec(segment.nethackrc).slice(1).join('/');
}

test('the #twoweapon matrix covers both sides of the time-cost draw', () => {
    const recipe = loadTwoWeaponCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // wield.c:861 is `rnd(20) > ACURR(A_DEX)`, so the draw has to land above,
    // on, and below Dexterity for the recorded segments to separate `>` from
    // `>=` and from `<`. Asserting the property rather than the seeds means a
    // re-recorded case that lost the equal draw fails here.
    const relations = TIME_COST_CASES.map(
        ({ draw, dexterity }) => Math.sign(draw - dexterity),
    );
    assert.ok(relations.includes(1), 'no case draws above Dexterity');
    assert.ok(relations.includes(0), 'no case draws exactly Dexterity');
    assert.ok(relations.includes(-1), 'no case draws below Dexterity');
    // The seed list is the separate tripwire for a silent re-recording.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [7710001, 7710002, 7710003, 7710004],
    );
    // Every segment issues the command through the extended-command prompt
    // and waits afterwards, so a wrongly spent move shifts a compared screen.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves === '.#twoweapon\n..',
    ));
});

test('the switch-off matrix issues the command twice', () => {
    const recipe = loadTwoWeaponSwitchRecipe();
    assert.equal(recipe.version, 5);
    // wield.c:848 only reaches the toggle-off arm once u.twoweap is TRUE, so
    // every segment has to succeed first and switch back afterwards.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves === '.#twoweapon\n#twoweapon\n..',
    ));
    // The three starts whose u_init.c loadout can_twoweapon() accepts: a
    // plain weapon pair, a weapon-tool secondary, and a stacked secondary.
    assert.deepEqual(recipe.segments.map(roleOf), [
        'Samurai/human/male',
        'Archeologist/human/male',
        'Rogue/human/male',
    ]);
});

test('the refusal matrix reaches one can_twoweapon() arm per role', () => {
    const recipe = loadTwoWeaponRefusalRecipe();
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        ({ moves }) => moves === '.#twoweapon\n..',
    ));
    // wield.c:765 three times -- twice through the male role name at :771 and
    // once through the female one at :770 -- then :772, :786 and :789.
    assert.deepEqual(recipe.segments.map(roleOf), [
        'Wizard/human/male',
        'Caveman/human/male',
        'Caveman/human/female',
        'Tourist/human/male',
        'Barbarian/human/male',
        'Valkyrie/human/female',
    ]);
});

test('every refusal case cites the wield.c line that opens its arm', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/src/wield.c', import.meta.url), 'utf8',
    ).split('\n');
    for (const { who, arm } of REFUSAL_CASES) {
        const match = /^wield\.c:(\d+) (\S+)/u.exec(arm);
        assert.ok(match, `${who}'s arm label is not "wield.c:<line> <cond>"`);
        // split('\n') is zero-based and C line numbers are one-based.
        const line = source[Number(match[1]) - 1].trim();
        // can_twoweapon() is one if/else-if chain, so every arm it can refuse
        // from opens on a line of one of these two shapes. A label that
        // slipped by a line lands on a blank line, a bare `else`, or a
        // continuation of the previous arm's pline, and fails here.
        assert.match(line, /^(if|\} else if) \(/u,
            `${who} cites wield.c:${match[1]}, which opens no arm`);
        // The first C identifier the label quotes has to be in that condition,
        // so a label cannot drift onto some other arm's head either.
        const [identifier] = /[A-Za-z_][A-Za-z0-9_]*/u.exec(match[2]);
        assert.ok(line.includes(identifier),
            `wield.c:${match[1]} does not test ${identifier}`);
    }
});

test('the inventory matrix names both hands on both sides of the flag', () => {
    const recipe = loadTwoWeaponInventoryRecipe();
    assert.equal(recipe.version, 5);
    // Every segment ends by opening and closing the inventory menu, which is
    // where invent.c ddoinv() formats both wielded slots at once.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves.endsWith('i\u001b'),
    ));
    // objnam.c:1562 and :1614 both read u.twoweap, so an arm on each side of
    // it has to be recorded or the change would look inert.
    const withCommand = recipe.segments.filter(
        ({ moves }) => moves.includes('#twoweapon\n'),
    );
    assert.ok(withCommand.length >= 1, 'no case turns two-weapon combat on');
    assert.ok(withCommand.length < recipe.segments.length,
        'no case leaves two-weapon combat off');
    // :1586 and :1616 read URIGHTY. u_init.c:395 fixes handedness at
    // character creation, so a second seed is the only way to see it false.
    assert.ok(
        INVENTORY_CASES.some(({ lefty }) => lefty),
        'no case is left-handed',
    );
    assert.ok(
        new Set(INVENTORY_CASES.filter(({ lefty }) => lefty)
            .map(({ seed }) => seed))
            .size === 1,
        'the left-handed case shares a seed with the right-handed ones',
    );
    // :1619's plur(obj->quan) needs a secondary slot holding more than one
    // object, which u_init.c gives the Rogue alone.
    assert.deepEqual(recipe.segments.map(roleOf), [
        'Samurai/human/male',
        'Samurai/human/male',
        'Samurai/human/male',
        'Rogue/human/male',
        'Rogue/human/male',
        'Rogue/human/male',
    ]);
    // :1575's `&& !twoweap_primary` is the whole reason a dual-wielded stack
    // reads ":1593 wielded in <hand>" rather than ":1576 (wielded)", and only
    // a stack in the primary slot reaches it. u_init.c starts every stack in
    // the secondary slot, so a case has to move one across.
    assert.ok(
        INVENTORY_CASES.some(
            ({ stack, twoweapon }) => stack === 'primary' && twoweapon,
        ),
        'no case dual-wields a stacked primary',
    );
    // verifyInventory() matches a recipe segment back to its case on the whole
    // segment, so two cases that build the same one would both be verified
    // against whichever is listed first, and the second's claims about the
    // hero would never be checked.
    assert.equal(
        new Set(recipe.segments.map((segment) => JSON.stringify(segment))).size,
        recipe.segments.length,
        'two inventory cases build the same segment',
    );
});

test('the skill matrix opens the attributes window on both hands', () => {
    const recipe = loadTwoWeaponSkillRecipe();
    assert.equal(recipe.version, 5);
    // Every segment turns two-weapon combat on, opens the attributes window,
    // pages to the second page -- where insight.c weapon_insight() writes --
    // dismisses it, and waits, so a wrongly spent move shifts a screen.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves === '.#twoweapon\n\u0018 \u001b.',
    ));
    // The three starts can_twoweapon() accepts. insight.c:1362 and :1395 are
    // the only comparisons any of them reaches, so what separates the cases
    // is the skill names, and with them the width of the stored menu line.
    assert.deepEqual(recipe.segments.map(roleOf), [
        'Samurai/human/male',
        'Archeologist/human/male',
        'Rogue/human/male',
    ]);
    // wintty.c:2729 cuts only the Samurai's, which is what puts a cut and an
    // uncut window side by side in one recorded group.
    assert.deepEqual(SKILL_CASES.map(({ clipped }) => clipped),
        [true, false, false]);
});

test('only the weapon-status matrix turns the status field on', () => {
    // wield.c set_twoweap() marks the status line dirty only under this
    // option, so it is the one group whose screens can show "Dual-weps".
    const status = loadTwoWeaponStatusRecipe();
    assert.equal(status.version, 5);
    assert.ok(status.segments.every(
        ({ nethackrc }) => nethackrc.includes('\nOPTIONS=weaponstatus\n'),
    ));
    // Every other group has to leave it off, or its recorded status lines
    // would move with the hands and stop isolating the command's own effects.
    for (const recipe of [loadTwoWeaponCommandRecipe(),
                          loadTwoWeaponSwitchRecipe(),
                          loadTwoWeaponNamingRecipe(),
                          loadTwoWeaponInventoryRecipe(),
                          loadTwoWeaponRefusalRecipe(),
                          loadTwoWeaponSkillRecipe()]) {
        assert.ok(recipe.segments.every(
            ({ nethackrc }) => !nethackrc.includes('weaponstatus'),
        ));
    }
});

test('every #twoweapon case reaches the arm it was chosen for',
    async () => {
        for (const recipe of [loadTwoWeaponCommandRecipe(),
                              loadTwoWeaponSwitchRecipe(),
                              loadTwoWeaponRefusalRecipe(),
                              loadTwoWeaponStatusRecipe(),
                              loadTwoWeaponInventoryRecipe(),
                              loadTwoWeaponNamingRecipe(),
                              loadTwoWeaponSkillRecipe()]) {
            for (const segment of recipe.segments)
                await verifyTwoWeaponCommandSegment(segment);
        }
    });
