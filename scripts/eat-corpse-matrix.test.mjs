import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NEUTRAL } from '../js/const.js';
import { poisonous, vegan } from '../js/mondata.js';
import {
    PM_CAVE_DWELLER,
    PM_GOBLIN,
    PM_JACKAL,
    PM_KOBOLD,
    PM_LICHEN,
    PM_MONK,
    PM_ORC,
    monst_globals_init,
} from '../js/monsters.js';
import { nonrotting_corpse, vegetarian } from '../js/eat.js';
import { CORPSE_CASES, loadEatCorpseRecipe } from './run-eat-corpse.mjs';

const EAT_C = readFileSync(
    new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8',
).split('\n');
// split('\n') is zero-based and C line numbers are one-based.
const eatLine = (number) => EAT_C[number - 1].trim();

const CATALOG = { mons: monst_globals_init({}) };
const SPECIES = {
    lichen: PM_LICHEN,
    jackal: PM_JACKAL,
    goblin: PM_GOBLIN,
    kobold: PM_KOBOLD,
};
const speciesOf = (label) => CATALOG.mons[SPECIES[label]];

test('the corpse matrix carries replay inputs only', () => {
    const recipe = loadEatCorpseRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // The seed list is the tripwire for a silent re-recording. Each seed was
    // found by scanning upward from 7331000 for a start whose named monster
    // stands beside the hero and leaves a corpse, so a changed seed means a
    // changed case.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [7331093, 7331026, 7331342, 7331694, 7333262, 7334400,
            7331404, 7331780],
    );
    // Every case picks a corpse up and then answers the #eat prompt with the
    // letter the pickup gave it, so a meal that ate something else would have
    // to change the recorded moves to stay matched.
    for (const { moves, invlet } of CORPSE_CASES) {
        assert.match(moves, new RegExp(`,[ s]*e${invlet}`, 'u'));
    }
});

test('the corpse matrix separates both diet tests eatcorpse() makes', () => {
    // eat.c:1870 and :1877 ask vegan() and vegetarian() about the corpse, and
    // :1985 asks whether the hero's own form is herbivorous or carnivorous.
    // The first two decide the conducts and violated_vegetarian(); the third
    // decides `palatable`. A matrix that moved only one of them would pass
    // with the other wrong.
    assert.match(eatLine(1870), /^if \(!vegan\(&mons\[mnum\]\)\)$/u);
    assert.match(eatLine(1877), /^if \(!vegetarian\(&mons\[mnum\]\)\) \{$/u);

    const diets = CORPSE_CASES.map(({ corpsenm }) => [
        vegan(speciesOf(corpsenm)),
        vegetarian(speciesOf(corpsenm)),
    ]);
    assert.ok(diets.some(([isVegan]) => isVegan), 'no vegan corpse');
    assert.ok(diets.some(([isVegan]) => !isVegan), 'no meat corpse');
    // The lichen is the only species here for which the two answers agree,
    // which is what makes it the case that skips violated_vegetarian().
    assert.ok(diets.every(([isVegan, isVeggie]) => isVegan === isVeggie));

    // Exactly one case is the Monk, whose role monster is the reason
    // violated_vegetarian() prints and adjalign(-1) runs.
    const monks = CORPSE_CASES.filter(
        ({ character }) => character.startsWith('role:Monk,'),
    );
    assert.equal(monks.length, 1);
    assert.equal(CATALOG.mons[PM_MONK].pmnames[NEUTRAL], 'monk');
    assert.ok(!vegetarian(speciesOf(monks[0].corpsenm)),
        'the Monk case eats a vegetarian corpse, so it never feels guilty');
});

test('the corpse matrix covers both sides of the rot and poison arms', () => {
    // eat.c:1884 gates the rn2(20) rot draw, :1928 is the poison arm, and
    // :1949 gates the rn2(7) that would reach rottenfood(). All three read
    // the same nonrotting_corpse() or species flag, so one case on each side
    // of each is what separates them.
    assert.match(eatLine(1884), /^if \(!nonrotting_corpse\(mnum\)\) \{$/u);
    assert.match(eatLine(1928),
        /^\} else if \(poisonous\(&mons\[mnum\]\) && rn2\(5\)\) \{$/u);
    assert.match(eatLine(1949),
        /^if \(!tp && !nonrotting_corpse\(mnum\).*rn2\(7\)\)\) \{$/u);

    const rots = CORPSE_CASES.map(
        ({ corpsenm }) => !nonrotting_corpse(SPECIES[corpsenm], CATALOG),
    );
    assert.ok(rots.includes(true), 'no corpse that rots');
    assert.ok(rots.includes(false), 'no corpse that never rots');

    const poisons = CORPSE_CASES.filter(
        ({ corpsenm }) => poisonous(speciesOf(corpsenm)),
    );
    assert.equal(poisons.length, 1, 'exactly one poisonous corpse');
    // Only a hero who resists poison takes the arm that prints "You seem
    // unaffected by the poison." instead of calling poison_strdmg(), which is
    // unported, so the poisonous case has to be the Barbarian's.
    assert.match(poisons[0].character, /^role:Barbarian,/u);

    // Two cases wait between the kill and the meal. eat.c:1887 divides the
    // elapsed turns by 10 + rn2(20), so 34 turns leave `rotted` at 1 or more
    // whatever that draw is, which is what makes :1989's extra draw reachable.
    const waited = CORPSE_CASES.filter(({ moves }) => moves.includes('ss'));
    assert.equal(waited.length, 2);
    assert.ok(waited.every(({ moves }) => /,s{34}e/u.test(moves)));
    assert.match(eatLine(1989),
        /^&& \(rotted < 1 \|\| !rn2\(\(int\) rotted \+ 1\)\)\);$/u);
});

test('the corpse matrix reaches both sides of CANNIBAL_ALLOWED', () => {
    // eat.c:51 is the macro and :770 is maybe_cannibal()'s use of it. An
    // orcish hero eating a goblin makes your_race() true, so that hero's
    // CANNIBAL_ALLOWED() is the only reason the penalty does not run.
    assert.match(eatLine(51),
        /^#define CANNIBAL_ALLOWED\(\) \(Role_if\(PM_CAVE_DWELLER\)/u);
    assert.match(eatLine(770), /^if \(!CANNIBAL_ALLOWED\(\)$/u);

    const orcs = CORPSE_CASES.filter(
        ({ character }) => character.includes('race:orc'),
    );
    assert.equal(orcs.length, 1);
    // mondata.h your_race() reads gu.urace.selfmask, which for an orc is the
    // M2_ORC bit monst.c also gives the goblin.
    assert.ok(speciesOf(orcs[0].corpsenm).mflags2
        & CATALOG.mons[PM_ORC].mflags2 & 0x80);
    // Every other case is a race and role the macro refuses, so each of them
    // would have paid the penalty had it eaten its own kind.
    for (const { character } of CORPSE_CASES) {
        if (character.includes('race:orc')) continue;
        assert.ok(!character.startsWith('role:Caveman,'), character);
        assert.equal(CATALOG.mons[PM_CAVE_DWELLER].pmnames[NEUTRAL],
            'cave dweller');
    }
});
