#!/usr/bin/env node

// Record and replay the reroll menu invent.c reroll_menu() (2552-2616) draws,
// which is the port's only caller of iflags.override_ID.
//
//     ++gd.distantname;     /* avoid adding items to discoveries */
//     ++iflags.override_ID; /* identify them */
//     for (otmp = gi.invent; otmp; otmp = otmp->nobj) {
//         ...
//         add_menu(win, &tmpglyphinfo, &any, 0, 0,
//                  ATR_NONE, NO_COLOR, doname(otmp), MENU_ITEMFLAGS_NONE);
//     }
//     --iflags.override_ID;
//     --gd.distantname;
//
// The menu is the first screen a `reroll` game draws, so every segment needs
// one key to leave it. The starting kits differ enough between roles to cover
// the naming branches override_ID reaches: a weapon-tool that must take
// doname_base()'s WEAPON_CLASS arm rather than its charge suffix
// (objnam.c:1382, Archeologist's pick-axe), charged tools and wands that must
// take the suffix (Archeologist's tinning kit, Healer's wand of sleep,
// Tourist's expensive camera, Wizard's magic marker), an empty container
// (Archeologist's and Rogue's sack), gem stones (Caveman's flint), holy water
// and a Cleric's suppressed "uncursed" (Priest), Japanese item names
// (Samurai), and undiscovered types that only `nn = 1` at objnam.c:634 can
// name in full (Monk's scroll, Tourist's food, Wizard's wand, rings, potions,
// scrolls and second spellbook).
//
// allmain.c:820 loops on the menu, so the last segment answers it twice before
// accepting, which reruns u_init_inventory_attrs() against fresh RNG.
//
// The recipe contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RECIPE_PATH = join(
    dirname(SCRIPT_PATH),
    'fixtures',
    'reroll-menu-naming.session.json',
);

export function loadRerollMenuNamingRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        RECIPE_PATH,
    );
}

export async function runRerollMenuNamingMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'reroll menu naming',
            recipe: loadRerollMenuNamingRecipe(),
        }],
        summaryLabel: 'REROLL MENU NAMING',
    });
}

runMatrixCli(import.meta.url, runRerollMenuNamingMatrix, 'reroll menu naming');
