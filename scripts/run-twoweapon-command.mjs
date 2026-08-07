#!/usr/bin/env node

// Record and replay the #twoweapon command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// wield.c dotwoweapon() ends `(rnd(20) > ACURR(A_DEX)) ? ECMD_TIME : ECMD_OK`,
// so one draw decides whether turning two-weapon combat on costs the hero a
// move. The four seeds below were chosen by recording Samurai starts until
// each side of that comparison appeared, including the equal case that
// separates `>` from `>=`.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { A_DEX } from '../js/const.js';
import { effective_attribute } from '../js/attrib.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { KATANA, SHORT_SWORD } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20310203040506';
const WAIT = '.';
// cmd.c extcmdlist[] binds '#' to doextcmd(); "twoweapon" names row 0x58.
const TWOWEAPON = '#twoweapon\n';

// Recorded C results for each seed: the rnd(20) the C log attributes to
// dotwoweapon(wield.c:861), and the Dexterity its status line shows. `costs`
// restates wield.c:861 rather than an observation, so a seed whose draw
// changed would fail the verifier rather than silently agree with it.
const CASES = [
    // Draw above Dexterity: the command costs a move. The C step logs the
    // whole following turn (18 calls) instead of the draw alone.
    { seed: 7710001, draw: 20, dexterity: 13 },
    // Draw equal to Dexterity: `>` is false, so the command is free. This is
    // the only case that distinguishes wield.c:861 from `>=`.
    { seed: 7710002, draw: 15, dexterity: 15 },
    // Draw below Dexterity: the ordinary free switch.
    { seed: 7710003, draw: 11, dexterity: 14 },
    // A second costing case, at a different Dexterity from the first.
    { seed: 7710004, draw: 20, dexterity: 16 },
];

// One short name for every segment. u_init.c's welcome line names the hero,
// the role, the race, the gender and the alignment, and a longer name wraps it
// past 80 columns into a --More-- that would swallow the leading wait.
function nethackrc() {
    return [
        'OPTIONS=name:Twoweap,role:Samurai,race:human,gender:male,'
        + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
}

// Each segment waits, issues the command, then waits twice more, so a move
// wrongly spent or wrongly saved moves every later turn into a screen the
// differential compares.
function segment({ seed }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        moves: `${WAIT}${TWOWEAPON}${WAIT}${WAIT}`,
    };
}

export function loadTwoWeaponCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CASES.map(segment),
    });
}

function caseForSeed(seed) {
    const found = CASES.find((entry) => entry.seed === seed);
    if (!found) throw new Error(`no recorded case for seed ${seed}`);
    return found;
}

export async function verifyTwoWeaponCommandSegment(recipeSegment) {
    const { draw, dexterity } = caseForSeed(recipeSegment.seed);
    // wield.c:861. Restated here so the expectation is the C comparison, not
    // a remembered outcome.
    const costsAMove = draw > dexterity;

    // Stop one keystroke before the Enter that submits the command. The
    // Samurai's u_init.c:142-148 loadout is can_twoweapon()'s success path,
    // and every condition it turns on is checked here rather than assumed.
    await runSegment({ ...recipeSegment, moves: `${WAIT}#twoweapon` });
    if (game.u.twoweap)
        throw new Error('two-weapon combat was already on before the command');
    if (game.uwep?.otyp !== KATANA || game.uswapwep?.otyp !== SHORT_SWORD)
        throw new Error('setup did not leave a katana and a short sword');
    if (game.uarms)
        throw new Error('setup wore a shield, which can_twoweapon() refuses');
    if (effective_attribute(game, A_DEX) !== dexterity)
        throw new Error(`setup Dexterity is not ${dexterity}`);
    const movesBefore = game.moves;

    // Submit it. The trailing waits are omitted so that game.moves reports
    // this command's own time cost and nothing else's.
    await runSegment({ ...recipeSegment, moves: `${WAIT}${TWOWEAPON}` });
    if (!game.u.twoweap)
        throw new Error('the command did not turn two-weapon combat on');
    const elapsed = game.moves > movesBefore;
    if (elapsed !== costsAMove) {
        throw new Error(
            `rnd(20)=${draw} against Dx:${dexterity} should `
            + `${costsAMove ? 'spend' : 'save'} the move`,
        );
    }
    // flags.weaponstatus is off by default, so set_twoweap() marks no status
    // line dirty and the recorded status line carries no weapon field.
    if (game.flags.weaponstatus)
        throw new Error('the case turned the weapon status field on');
}

export async function runTwoWeaponCommandMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'twoweapon command',
            recipe: loadTwoWeaponCommandRecipe(),
        }],
        summaryLabel: 'TWOWEAPON COMMAND',
        verifySegment: verifyTwoWeaponCommandSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runTwoWeaponCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`twoweapon command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
