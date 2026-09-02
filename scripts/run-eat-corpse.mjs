#!/usr/bin/env node

// Record and replay a corpse meal against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// Every case kills one monster that started the game beside the hero, steps
// onto the square it died on, picks the corpse up and eats it. Wishing for a
// corpse would be shorter, but objnam.c readobjnam()'s monster-naming arm is
// unported, so a killed monster is the only corpse a replay can produce.
//
// Which eat.c eatcorpse() arms each case reaches:
//
// - `lichen` is the vegan corpse. vegan() true means no conduct moves and
//   violated_vegetarian() never runs; nonrotting_corpse() true means neither
//   the rn2(20) rot draw at :1887 nor the rn2(7) at :1949 happens; and
//   vegetarian() true fixes the message index at 0 instead of drawing rn2(5).
// - `jackal` is the same three tests the other way, and its rn2(10) at :1988
//   lands nonzero, so the hero finds the corpse palatable and the message is
//   an "is ..." one rather than a "tastes ..." one.
// - `monkJackal` is the Monk, whose violated_vegetarian() arm prints "You feel
//   guilty." and spends attrib.c adjalign(-1), which raises u.ualign.abuse to
//   1 and calls mon.c adj_erinys(1). monst.c gives the monk role monster
//   M1_HERBIVORE without M1_CARNIVORE, so `palatable` is false before the
//   rn2(10), and the corpse tastes terrible.
// - `goblin` is a second non-vegetarian corpse whose rn2(5) picks index 0, the
//   one index a vegetarian corpse would have taken without drawing.
// - `orcGoblin` is an orcish hero eating an orc: your_race() is true, so only
//   CANNIBAL_ALLOWED() keeps maybe_cannibal() from charging the penalty.
// - `kobold` is the poisonous corpse. eat.c:1928's rn2(5) lands nonzero, and
//   the Barbarian's role.c intrinsic poison resistance takes the arm that
//   prints "You seem unaffected by the poison." instead of poison_strdmg().
// - The two `rotted` cases wait 34 turns between the kill and the meal, which
//   is enough that (moves - age) / (10 + rn2(20)) is at least 1 for every
//   draw. That makes `rotted < 1` false in the palatability test at :1989, so
//   the extra rn2(rotted + 1) is reachable: 7331780 draws it, and 7331404 is
//   the contrast where rn2(10) is 0 and short-circuits above it.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { CORPSE } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20000110090000';
// The two intro screens and then 'n' for the tutorial query.
const LAUNCH = '  n';
// One of decl.c quitchars[], which is what getline.c xwaitforspace() accepts
// to dismiss a --More--.
const MORE = ' ';
// Four of them after the meal, so an extra turn the port spends or skips moves
// a compared screen rather than falling off the end of the replay.
const SETTLE = MORE.repeat(4);

// cmd.c binds 'F' to dofight(), which attacks the named square whether or not
// anything is standing there. Walking into the monster instead would step onto
// its square the moment it died and leave the corpse behind, so every case
// swings a fixed number of times and then takes one ordinary step.
function fight(direction, swings) {
    return `F${direction}`.repeat(swings);
}

function nethackrc(character) {
    return [
        `OPTIONS=name:Probe,${character}`,
        'OPTIONS=pettype:none',
        '',
    ].join('\n');
}

// Each case names the monster that monst.c placed beside the hero at this
// seed, the direction from the hero to it, and the inventory letter the
// pickup gave its corpse. All three are properties of the seed, so a
// re-recording that lost the monster fails the differential rather than
// quietly eating something else.
export const CORPSE_CASES = Object.freeze([
    {
        label: 'lichen',
        seed: 7331093,
        character: 'role:Valkyrie,race:human,gender:female,align:neutral',
        // The lichen dies to two ordinary steps, because it holds the hero
        // still rather than moving away; a third step lands on the corpse.
        moves: `${LAUNCH}jjj,ee${SETTLE}`,
        corpsenm: 'lichen',
        invlet: 'e',
    },
    {
        label: 'jackal',
        seed: 7331026,
        character: 'role:Valkyrie,race:human,gender:female,align:neutral',
        moves: `${LAUNCH}${fight('h', 5)}h,ee${SETTLE}`,
        corpsenm: 'jackal',
        invlet: 'e',
    },
    {
        label: 'monkJackal',
        seed: 7331342,
        character: 'role:Monk,race:human,gender:female,align:neutral',
        moves: `${LAUNCH}${fight('l', 5)}l,ek${MORE}${SETTLE}`,
        corpsenm: 'jackal',
        invlet: 'k',
    },
    {
        label: 'goblin',
        seed: 7331694,
        character: 'role:Barbarian,race:human,gender:male,align:neutral',
        moves: `${LAUNCH}${fight('l', 5)}l,ee${SETTLE}`,
        corpsenm: 'goblin',
        invlet: 'e',
    },
    {
        label: 'orcGoblin',
        seed: 7333262,
        character: 'role:Rogue,race:orc,gender:male,align:chaotic',
        // The goblin corpse outweighs what this Rogue can carry freely, so
        // the pickup raises a --More-- of its own before the meal starts.
        moves: `${LAUNCH}${fight('h', 5)}h,${MORE}ei${MORE}${SETTLE}`,
        corpsenm: 'goblin',
        invlet: 'i',
    },
    {
        label: 'kobold',
        seed: 7334400,
        character: 'role:Barbarian,race:human,gender:male,align:neutral',
        moves: `${LAUNCH}${fight('h', 6)}h,ee${MORE}${MORE}${SETTLE}`,
        corpsenm: 'kobold',
        invlet: 'e',
    },
    {
        label: 'rottedShortCircuit',
        seed: 7331404,
        character: 'role:Valkyrie,race:human,gender:female,align:neutral',
        moves: `${LAUNCH}${fight('l', 6)}l,${'s'.repeat(34)}ef${SETTLE}`,
        corpsenm: 'jackal',
        invlet: 'f',
    },
    {
        label: 'rotted',
        seed: 7331780,
        character: 'role:Valkyrie,race:human,gender:female,align:neutral',
        moves: `${LAUNCH}${fight('l', 6)}l,${'s'.repeat(34)}ef${SETTLE}`,
        corpsenm: 'jackal',
        invlet: 'f',
    },
]);

export function loadEatCorpseRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CORPSE_CASES.map(({ seed, character, moves }) => ({
            seed,
            datetime: DATETIME,
            nethackrc: nethackrc(character),
            moves,
        })),
    }, 'eat corpse recipe');
}

// The screens show that the meal ran and what it printed. They cannot show
// that the corpse itself was what the hero ate rather than some other food
// that happened to share a letter, so check the two pieces of state that
// separate those: the corpse has to have left inventory, and the food conduct
// has to have counted exactly one meal.
export async function verifyEatCorpseSegment(recipeSegment) {
    const spec = CORPSE_CASES.find(({ seed }) => seed === recipeSegment.seed);
    if (!spec) throw new Error(`no case owns seed ${recipeSegment.seed}`);
    await runSegment(recipeSegment);
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === CORPSE) {
            throw new Error(
                `${spec.label}: a corpse is still in inventory as `
                + `${obj.invlet}`,
            );
        }
    }
    if (game.u.uconduct.food !== 1) {
        throw new Error(
            `${spec.label}: u.uconduct.food is ${game.u.uconduct.food}, `
            + 'so the meal did not run exactly once',
        );
    }
}

export async function runEatCorpseMatrix() {
    return runFreshMatrix({
        entries: [{ label: 'eat corpse', recipe: loadEatCorpseRecipe() }],
        summaryLabel: 'EAT CORPSE',
        verifySegment: verifyEatCorpseSegment,
    });
}

runMatrixCli(import.meta.url, runEatCorpseMatrix, 'eat corpse');
