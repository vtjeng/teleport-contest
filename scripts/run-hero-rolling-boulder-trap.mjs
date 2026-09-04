#!/usr/bin/env node

// Run the fresh matrix for a hero who walks onto a ROLLING_BOULDER_TRAP. Each
// segment contains replay inputs only; runFreshMatrix() records new reference
// output in an isolated temporary workspace.
//
// The behavior is hack.c domove() -> spoteffects() -> trap.c dotrap() ->
// trapeffect_selector() -> trapeffect_rolling_boulder_trap() (2661-2707,
// hero arm) -> launch_obj() (3260-3575). The boulder rolls cell by cell,
// checking hero collision via thitu() (mthrowu.c:106). dmgval() (weapon.c:265)
// computes the damage. The session exercises the simplest launch_obj path:
// boulder present at launch point, ROLL|LAUNCH_KNOWN style, hero collision
// via thitu (miss), boulder stops at destination (wall).
//
// Rolling boulder traps appear only on maze levels (mklev.c mkroll_launch()),
// so reaching one naturally requires teleporting from D:1. The segment uses
// playmode:debug with ^V (level teleport) plus ^W (wish) commands to equip the
// hero for survival, then walks into the trap on a maze level.
//
// Seed 361 produces a rolling boulder trap reachable from the landing spot on
// dungeon level 15. The hero level-teleports to level 20, wishes for
// Grayswandir, silver dragon scale mail, and an amulet of life saving, then
// navigates to the trap and triggers it with a move right. The seed was taken
// from the development session seed0361-archeologist-tour; the recipe was built
// from the same inputs that reach the trap.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20000110090000';

const NETHACKRC = [
    'OPTIONS=name:Magellan,role:Archeologist,race:human,gender:male,'
    + 'align:neutral,playmode:debug,suppress_alert:3.4.3,'
    + 'symset:DECgraphics',
    'OPTIONS=!autopickup',
    '',
].join('\n');

// 208 keys: steps 0-207, where step 206 triggers the rolling boulder trap
// and step 207 is the first move after it. Control characters: \x16 = ^V
// (level teleport), \x17 = ^W (wish), \x1b = ESC, \x14 = ^T (teleport).
// The newlines (\n) are literal enter keys.
const MOVES =
    '  n#levelchange\n20\n                    TcTd'
    + '\x1b\x17blessed +5 Grayswandir\n'
    + '\x17blessed +5 silver dragon scale mail\n'
    + '\x17blessed amulet of life saving\n'
    + 'wiWjPk\x16?\n y  .\x14  hhhhhhhhhhhhhhhjjjjjjjj.y \x16?\n'
    + ' z njjjjjjjjjjjs \x1615\nuulll';

export function loadHeroRollingBoulderTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            { seed: 361, datetime: DATETIME, nethackrc: NETHACKRC,
                moves: MOVES },
        ],
    }, 'hero rolling boulder trap recipe');
}

export async function runHeroRollingBoulderTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'hero rolling boulder trap',
            recipe: loadHeroRollingBoulderTrapRecipe(),
        }],
        summaryLabel: 'HERO ROLLING BOULDER TRAP',
    });
}

runMatrixCli(
    import.meta.url,
    runHeroRollingBoulderTrapMatrix,
    'hero rolling boulder trap',
);
