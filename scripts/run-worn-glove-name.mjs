#!/usr/bin/env node

// Record and replay object names, including inventory worn-glove names and
// user-assigned type names in inventory and discoveries, against the
// patched C reference. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// objnam.c doname_base():1388-1414 is the ARMOR_CLASS arm of the class switch
// that names a worn piece. Every worn piece but one takes " (being worn)"
// there; the exceptions are dragon scales fused to a polymorphed hero's skin,
// a piece a Wear or Take-off is part-way through, artifact gloves that emit
// light, and gloves on a hero with slippery fingers. None of the four can
// arise here, so what these segments pin is the ordinary phrase plus the
// enchantment prefix objnam.c:1421 writes with "%+d ".
//
// Only three roles start in a pair of gloves, and u_init.c gives each pair a
// different enchantment: Healer +1 (u_init.c:78), Knight +0 (:96) and Monk +2
// (:102). All three are here, because the prefix is the one part of the line
// the roles do not share. The Valkyrie segment is the control: same seed, same
// keys, no gloves, and it passed before the arm was ported.
//
// invent.c ddoinv() draws the menu, so 'i' is the whole input. The trailing
// key dismisses it, which is what makes the port paint the screen underneath
// again and lets a wrongly spent turn show up.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { donameFresh, obj_typename } from '../js/objnam.js';
import { LEATHER_GLOVES, MAGIC_HARP, POT_HEALING, WAN_SLEEP } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// cmd.c extcmdlist[] binds 'i' to ddoinv().
const INVENTORY = 'i';
const WAIT = '.';

// A wait, the inventory, and a key to dismiss the menu. The opening wait puts
// the menu over a screen an ordinary turn produced rather than over the
// arrival screen, and the closing one would show a turn ddoinv() wrongly
// spent: cmd.c gives the row ECMD_OK, so reading inventory is free.
const MOVES = `${WAIT}${INVENTORY}${WAIT}`;

// `spe` is the enchantment u_init.c's trobj table gives that role's gloves,
// and null marks the role that starts with none. Every case names its own
// seed and clock, so no two segments share a level or a moon phase.
export const CASES = [
    // The isolating pair. A Knight and a Valkyrie at one seed differ in the
    // starting inventory and nothing else, and before doname_base()'s W_ARMG
    // arm was ported the Knight stopped here while the Valkyrie did not.
    { role: 'Knight', spe: 0, seed: 7710401, datetime: '20310203040506',
      race: 'human', gender: 'male', align: 'lawful', name: 'GloveTest' },
    { role: 'Valkyrie', spe: null, seed: 7710401, datetime: '20310203040506',
      race: 'human', gender: 'female', align: 'neutral', name: 'GloveCtl' },
    // +1, the enchantment that separates the prefix from a bare "+0 ".
    { role: 'Healer', spe: 1, seed: 3140892, datetime: '20280917153045',
      race: 'human', gender: 'female', align: 'neutral', name: 'Mender' },
    // +2, and a robe worn in the cloak slot beside the gloves, so two armor
    // pieces take the phrase in one menu.
    { role: 'Monk', spe: 2, seed: 6021573, datetime: '20290422081200',
      race: 'human', gender: 'male', align: 'lawful', name: 'Cloister' },
    // A gnome, the Healer's other race (role.c:178), on a seed whose glove
    // description shuffles differently. u_init.c makes starting armor known,
    // so the line should read "leather gloves" and not the appearance.
    { role: 'Healer', spe: 1, seed: 5583061, datetime: '20320811192021',
      race: 'gnome', gender: 'male', align: 'neutral', name: 'Tinker' },
    // The Monk's third alignment (role.c:258-259) and the other gender, which
    // change the welcome line the menu paints over.
    { role: 'Monk', spe: 2, seed: 8264117, datetime: '20270105060708',
      race: 'human', gender: 'female', align: 'chaotic', name: 'Ascetic' },
];

// pettype:none keeps a pet from moving under the menu, !acoustics silences
// dosounds(), and !autopickup keeps the opening wait from lifting anything the
// hero happens to be standing on. None of the three touches how a name is
// built; each keeps the compared screens about the menu.
function nethackrc({ name, role, race, gender, align }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        '',
    ].join('\n');
}

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: nethackrc(entry),
        moves: MOVES,
    };
}

export function loadWornGloveNameRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CASES.map(segment),
    }, 'worn glove name recipe');
}

// The recipes carry replay inputs only, so a segment is matched back to its
// case by the rc that configures it; every case names a different hero.
export function caseFor(recipeSegment) {
    const found = CASES.find(
        (entry) => nethackrc(entry) === recipeSegment.nethackrc,
    );
    if (!found)
        throw new Error(`no case configures ${JSON.stringify(recipeSegment)}`);
    return found;
}

// Re-derive each case's claim about the hero from the live game rather than
// from a remembered observation, so a role whose starting kit changed would
// fail here instead of quietly recording a different screen.
export async function verifyWornGloveNameSegment(recipeSegment) {
    const entry = caseFor(recipeSegment);
    await runSegment(recipeSegment);
    const gloves = game.uarmg;

    if (entry.spe === null) {
        if (gloves)
            throw new Error(`${entry.role} was meant to start bare-handed`);
        return;
    }
    if (!gloves || gloves.otyp !== LEATHER_GLOVES)
        throw new Error(`${entry.role} is not wearing leather gloves`);
    if (gloves.spe !== entry.spe) {
        throw new Error(
            `${entry.role}'s gloves are +${gloves.spe}, not +${entry.spe}`,
        );
    }
    // objnam.c:1394 appends the phrase and :1421 writes the prefix with
    // "%+d ". The differential compares the whole menu; this names the two
    // pieces of the line the arm is here for.
    const named = donameFresh(gloves, game);
    if (!named.endsWith(' (being worn)'))
        throw new Error(`${entry.role}'s gloves name as ${named}`);
    if (!named.includes(`${entry.spe < 0 ? '' : '+'}${entry.spe} `))
        throw new Error(`${entry.role}'s gloves lost their enchantment prefix`);
}

// Alias seed 8558163 was chosen before inspection, without a seed scan.
// Recipe input identifies the alias; the verifier independently checks its
// actual object type and discovery-ledger membership after command dispatch.
export function loadCalledTypeRecipes() {
    return ['called-potion-discoveries', 'called-wand-discoveries',
        'called-samurai-harp-discoveries'].map(label => ({ label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/objnam.c/${label}.session.json`, import.meta.url), 'utf8')) }));
}
export async function verifyCalledTypeSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const otyp = segment.moves.includes('potion') ? POT_HEALING
        : segment.moves.includes('wand') ? WAN_SLEEP : MAGIC_HARP;
    const alias = segment.moves.match(/#name\nof([^\n]+)\n/u)?.[1];
    assert.ok(alias, 'the recipe names the independently wished object at f');
    assert.equal(game.objects[otyp].oc_uname, alias);
    assert.ok(game.svd.disco.includes(otyp), 'the aliased type is in real discoveries');
    assert.ok(obj_typename(otyp, game).includes(` called ${alias}`));
    assert.equal(game.nhDisplay.inputQueueLength, 0);
}

export async function runWornGloveNameMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'worn glove name',
            recipe: loadWornGloveNameRecipe(),
        }, ...loadCalledTypeRecipes()],
        summaryLabel: 'OBJECT NAMES',
        verifySegment: segment => segment.moves.includes('#name')
            ? verifyCalledTypeSegment(segment) : verifyWornGloveNameSegment(segment),
    });
}

runMatrixCli(import.meta.url, runWornGloveNameMatrix, 'worn glove name');
