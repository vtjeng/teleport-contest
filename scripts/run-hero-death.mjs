#!/usr/bin/env node

// Record and replay a hero death that runs end.c done() to its
// keep-playing query. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// done()'s query at end.c:1105 opens for `wizard || discover`, and the two
// segments here open it once through each disjunct. They also carry different
// killers in different svk.killer.format values, which is what shows the
// three format defaults at 1061-1067 staying no-ops for a caller that named
// its own killer:
//
// - A debug-mode Tourist wishes for a wand of fire and zaps it straight down.
//   zap.c dobuzz() forces a downward bolt's range to 1, so the hero's own
//   square is the only one the beam visits; zhitu()'s fire arm burns the
//   Hawaiian shirt and hands d(6, 6) to hack.c losehp() against ten hit
//   points. The killer is "bolt of fire zapped by himself" in KILLED_BY_AN.
// - An explore-mode Knight tries twice to mount the saddled pony that only a
//   Knight starts with. steed.c mount_steed() takes its impairment arm both
//   times, and rn1(5, 10) is 10 to 14 against sixteen hit points, so the
//   second slip crosses zero. The killer is "slipped while mounting a saddled
//   pony" in NO_KILLER_PREFIX.
//
// The Knight is in explore mode rather than debug mode because steed.c
// doride() asks "Force the mount to succeed?" through hack.h y_n() whenever
// `wizard` is set, and js/cmd.js yn_function() refuses the addcmdq that y_n()
// passes. A debug-mode #ride therefore never reaches mount_steed() at all.
//
// Both segments end on the key that dismisses the death's --More--, which is
// the key done() spends drawing "Die? [yn] (n)". Nothing answers it: the
// answer arms are savelife() and really_done(), and neither is ported.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { objectType } from '../js/obj.js';
import { RAY } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// wizcmds.c wiz_wish(), bound to Ctrl-W in debug mode.
const WISH = '\u0017'; // cmd.c C('w')
const ZAP = 'z';
// cmd.c getdir() reads '>' as down, which leaves u.dx and u.dy at zero.
const DOWN = '>';
// cmd.c extcmdlist[] binds '#' to doextcmd(); "ride" names the doride() row.
const RIDE = '#ride\n';
// One of decl.c quitchars[], which is what win/tty/getline.c xwaitforspace()
// accepts to dismiss a --More--.
const MORE = ' ';

// The inventory letter the wish lands on. A Tourist starts with thirteen
// stacks plus gold, so the wand arrives at `n`; verifyHeroDeathSegment()
// checks that rather than trusting it.
const WAND_LETTER = 'n';

// The pony's direction from the Knight's starting square, as cmd.c movecmd()
// reads it: north-east.
const PONY_DIRECTION = 'u';
const PONY_DELTA = Object.freeze({ dx: 1, dy: -1 });

export const WIZARD_CASE = Object.freeze({
    label: 'a debug-mode Tourist zaps a wand of fire at himself',
    // No natural seed is needed: the wish puts the wand in the pack and the
    // bolt cannot miss its own square. This seed was taken as given and the
    // assertions below say what it produced.
    seed: 4820613,
    // A fixed clock on an ordinary day: no full moon, no Friday the 13th, and
    // no midnight rollover, so nothing competes for the top line.
    datetime: '20260311073000',
    role: 'Tourist',
    race: 'human',
    gender: 'male',
    align: 'neutral',
    playmode: 'debug',
    pet: false,
    // The bolt raises one --More-- of its own ("The bolt of fire hits you!
    // Your shirt smoulders!" overflows the top line) and losehp() raises the
    // second with urgent_pline("You die...").
    moves: `${WISH}wand of fire\n${ZAP}${WAND_LETTER}${DOWN}${MORE}${MORE}`,
    killer: 'bolt of fire zapped by himself',
    format: KILLED_BY_AN,
});

export const EXPLORE_CASE = Object.freeze({
    label: 'an explore-mode Knight slips off the pony twice',
    // Nothing in C forces mount_steed()'s impairment roll: no wizard command
    // reaches rnd(MAXULEV / 2 + 5) and no starting state selects it, so the
    // seed is the only lever. Seeds 8300000 through 8300014 were replayed
    // under the port with the pony's direction read off the map, and 8300007
    // is the first whose first two attempts both slip. The scan stopped
    // there.
    seed: 8300007,
    datetime: '20260624101500',
    role: 'Knight',
    race: 'human',
    gender: 'male',
    align: 'lawful',
    playmode: 'explore',
    // dog.c makedog() saddles a Knight's PM_PONY, and role.c:209 gives the
    // Knight the one petnum that is PM_PONY, so this case is the one that
    // cannot use pettype:none.
    pet: true,
    // The first key dismisses the welcome line's --More--, which explore mode
    // raises because "You are in non-scoring explore/discovery mode." follows
    // it. The two trailing keys dismiss the second slip's overflow and the
    // death.
    moves: `${MORE}${RIDE}${PONY_DIRECTION}${RIDE}${PONY_DIRECTION}`
        + `${MORE}${MORE}`,
    killer: 'slipped while mounting a saddled pony',
    format: NO_KILLER_PREFIX,
});

export const HERO_DEATH_CASES = Object.freeze([WIZARD_CASE, EXPLORE_CASE]);

function nethackrc(entry) {
    return [
        `OPTIONS=name:Doomed,role:${entry.role},race:${entry.race},`
        + `gender:${entry.gender},align:${entry.align},`
        + `playmode:${entry.playmode}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // !acoustics silences dosounds(). pettype:none keeps a pet off the
        // bolt's square in the case that has no use for one.
        entry.pet ? 'OPTIONS=!acoustics' : 'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
}

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: nethackrc(entry),
        moves: entry.moves,
    };
}

export function loadHeroDeathRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: HERO_DEATH_CASES.map(segment),
    }, 'hero death recipe');
}

function caseFor(recipeSegment) {
    const found = HERO_DEATH_CASES.find(
        (entry) => entry.seed === recipeSegment.seed
            && entry.moves === recipeSegment.moves,
    );
    if (!found) throw new Error('no case describes this segment');
    return found;
}

// The screens show that a prompt appeared. They cannot show which state
// done() wrote on the way there, and every write between end.c:1035 and 1112
// is invisible on a status line the death had already forced to HP:0. These
// four are what separate "done() ran" from "something drew a prompt": the
// mortality counter moved exactly once, the hit points were forced to zero,
// and the killer the caller named survived the three format defaults intact.
export async function verifyHeroDeathSegment(recipeSegment) {
    const entry = caseFor(recipeSegment);
    await runSegment(recipeSegment);
    if (game.u.umortality !== 1) {
        throw new Error(
            `done() left u.umortality at ${game.u.umortality}, not 1`,
        );
    }
    if (game.u.uhp !== 0) {
        throw new Error(`done() left u.uhp at ${game.u.uhp}, not 0`);
    }
    if (game.killer.name !== entry.killer) {
        throw new Error(
            `done() renamed the killer "${game.killer.name}", `
            + `not "${entry.killer}"`,
        );
    }
    if (game.killer.format !== entry.format) {
        throw new Error(
            `done() left killer.format ${game.killer.format}, `
            + `not ${entry.format}`,
        );
    }
}

// The two setups each segment relies on, checked against the replayed game
// rather than assumed: a re-recording that moved either one would otherwise
// pass a differential against a case that never reaches done().
export async function verifyHeroDeathSetup(recipeSegment) {
    const entry = caseFor(recipeSegment);
    if (entry === WIZARD_CASE) {
        await runSegment({ ...recipeSegment, moves: `${WISH}wand of fire\n` });
        let wand = null;
        for (let obj = game.invent; obj; obj = obj.nobj) {
            if (obj.invlet === WAND_LETTER) wand = obj;
        }
        if (!wand) throw new Error(`no object at letter ${WAND_LETTER}`);
        if (objectType(wand, game).oc_dir !== RAY) {
            throw new Error(`the wand at ${WAND_LETTER} is not a ray wand`);
        }
        return;
    }
    await runSegment({ ...recipeSegment, moves: MORE });
    const pony = m_at(game.u.ux + PONY_DELTA.dx, game.u.uy + PONY_DELTA.dy,
                      game);
    if (!pony || !pony.mtame) {
        throw new Error(
            `no tame monster stands ${PONY_DIRECTION} of the Knight`,
        );
    }
}

export async function runHeroDeathMatrix() {
    return runFreshMatrix({
        entries: [{ label: 'hero death', recipe: loadHeroDeathRecipe() }],
        summaryLabel: 'HERO DEATH',
        verifySegment: async (recipeSegment) => {
            await verifyHeroDeathSetup(recipeSegment);
            await verifyHeroDeathSegment(recipeSegment);
        },
        // Both segments are games the recorder terminates at a live prompt,
        // which leaves a save behind, and record-session.mjs clears the
        // install directory only before a chunk's first segment. One segment
        // per chunk is what stops the second restoring the first.
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runHeroDeathMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`hero death: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
