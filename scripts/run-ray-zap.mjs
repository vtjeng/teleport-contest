#!/usr/bin/env node

// Record and replay an aimed ray wand against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// One shape of segment throughout: a wizard-mode Wizard wishes for a ray wand
// and zaps it once, without moving first. The wish is what puts a known ray
// wand in the pack; nothing else about the game is arranged, so the room the
// hero starts in is whatever the seed built.
//
// What the five segments separate, all of them inside zap.c dobuzz():
//
// - The first case aims west, into the wall one square away. The bolt
//   bounces off it and comes straight back onto the hero, so the turn's
//   three messages arrive in one breath: "The bolt of fire bounces!", "The
//   bolt of fire hits you!" from pline_dir() at :4964, and "Your cloak
//   smoulders!" from burnarmor() through zhitu()'s ZT_FIRE arm. The third
//   does not fit on the top line, so the segment ends at the --More-- that
//   message raises.
// - The second aims east, at the wall seven squares away. rn1(7, 7) cannot
//   reach that wall and come back, so the bolt runs out of range on the
//   return leg, tmp_at(DISP_END) erases the whole beam, and the turn
//   completes: learnwand(), more_experienced() and the move loop all run
//   after the ray, which the WALL_CASE stops short of.
// - The third and fourth repeat the second with the other two ray wands a
//   wish can name without reaching an unported zhitu() arm. They separate
//   flash_types[]' rows and zapcolors[]' entries: "bolt of cold" in
//   CLR_WHITE and "magic missile" in HI_ZAP, against the fire bolt's
//   CLR_ORANGE. Those three colours are what a wrong zapcolors[] index would
//   confuse.
// - The fifth aims south-east. Only a diagonal bolt reaches
//   bounce_dir()'s body at zap.c:4671-4700: a bolt travelling along a row or a
//   column takes the `!*ddx || !*ddy` short circuit at :4668 and reverses
//   without drawing at all. This segment draws twice there, once against the
//   75-in-1 wall chance and once against the 10-in-1 chance dobuzz():5003
//   picks for a square off the map or made of stone.
// - The sixth aims down. dobuzz():4824-4825 forces the range to 1 for a bolt
//   with no horizontal delta, so the hero's own square is the only one the
//   loop visits and the bolt hits with no bounce message ahead of it. Two
//   messages fit on the top line where the first case's three did not, which
//   is what carries this segment past zhitu():4434 and into destroy_items(),
//   maybe_destroy_item() and potionbreathe(). The first case stops one
//   message earlier and reaches none of them.
//
// Two things every segment relies on and the verifier below checks: the wished
// wand's objects[] row carries oc_dir RAY, which is what sends dozap() into
// weffects()'s ray arm, and no monster stands anywhere along the aimed line,
// which would send dobuzz() into the `if (mon)` arm this port refuses.
//
// pettype:none is what keeps the starting pet off those lines. The hero never
// steps, so the only turn any segment spends is the zap itself.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZAP_POS, isok } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { objectType } from '../js/obj.js';
import { RAY } from '../js/objects.js';
import { runFreshMatrix } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20260817120000';

// wizcmds.c wiz_wish(), bound to Ctrl-W in wizard mode.
const WISH = '\u0017'; // cmd.c C('w')
const ZAP = 'z';
// The wand's inventory letter. A wizard-mode Wizard starts with one wand of
// their own at `c`, so a single wish lands at `n`, the first letter after the
// spellbooks and the food; verifyRaySegment() checks it rather than trusting
// it.
const WAND_LETTER = 'n';
const WEST = 'h';
const EAST = 'l';
const SOUTHEAST = 'n';
// cmd.c getdir() reads '>' as down, which leaves u.dx and u.dy at zero.
const DOWN = '>';

// One seed for every segment. It was chosen by recording the start until the
// hero appeared in an ordinary lit room with a wall one square west, a wall
// seven squares east and no monster on either line: the west wall is what
// makes a bounced bolt come back within rn1(7, 7), and the east wall is what
// makes one that cannot. The matrix asserts what the seed produces rather
// than trusting the number.
const SEED = 20260817;

export const RAY_CASES = [
    { label: 'ray bounces onto the hero', wand: 'wand of fire', dir: WEST },
    { label: 'ray runs out of range', wand: 'wand of fire', dir: EAST },
    { label: 'cold ray runs out of range', wand: 'wand of cold', dir: EAST },
    {
        label: 'missile ray runs out of range',
        wand: 'wand of magic missile',
        dir: EAST,
    },
    {
        label: 'diagonal ray bounces twice',
        wand: 'wand of fire',
        dir: SOUTHEAST,
    },
    {
        label: 'downward ray destroys the potions',
        wand: 'wand of fire',
        dir: DOWN,
    },
];

export function movesFor({ wand, dir }) {
    return `${WISH}${wand}\n${ZAP}${WAND_LETTER}${dir}`;
}

// The keys up to and including the wish, which is what verifyRaySegment()
// replays: the wand has to be in the pack before its objects[] row can be
// read, and the zap must not have happened yet.
export function movesThroughWish({ wand }) {
    return `${WISH}${wand}\n`;
}

// playmode:debug is what makes Ctrl-W available. pettype:none keeps the
// starting pet off the bolt's line; the three startup options skip the windows
// that would otherwise swallow the leading keys; DECgraphics is the symbol set
// the beam's S_hbeam and S_lslant are drawn in.
function nethackrc(name) {
    return [
        `OPTIONS=name:${name},role:Wizard,race:human,gender:female,`
        + 'align:neutral,playmode:debug',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        'OPTIONS=symset:DECgraphics',
        '',
    ].join('\n');
}

function segment(entry, index) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(`Ray${index}`),
        moves: movesFor(entry),
        // The recorder leaves a save behind for a wizard-mode game it
        // terminates at a live prompt, and clears the install directory only
        // before a chunk's first segment, so each of these has to be its own
        // chunk or the next one restores the last one's game.
        rayCase: entry,
    };
}

export function loadRayZapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: RAY_CASES.map(segment),
    });
}

// C ref: zap.c dobuzz():4864. Walk the aimed line the way the loop does and
// report the first monster on it, so a re-recording that moved one into the
// bolt's path fails here rather than passing a differential against a case
// that reaches the unported monster arm.
function monsterOnLine(dx, dy, state) {
    // A downward bolt has no line: dobuzz():4824-4825 forces its range to 1
    // and the loop's first square is the hero's own, where m_at() answers
    // nothing because the hero is not on the monster chain.
    if (!dx && !dy) return null;
    let x = state.u.ux;
    let y = state.u.uy;
    // rn1(7, 7) is at most 13, and a bolt cannot travel further than that
    // before its range runs out.
    for (let step = 0; step < 13; ++step) {
        x += dx;
        y += dy;
        if (!isok(x, y) || !ZAP_POS(state.level.at(x, y).typ)) return null;
        if (m_at(x, y, state)) return { x, y };
    }
    return null;
}

const DIRECTION_DELTA = {
    [WEST]: { dx: -1, dy: 0 },
    [EAST]: { dx: 1, dy: 0 },
    [SOUTHEAST]: { dx: 1, dy: 1 },
    [DOWN]: { dx: 0, dy: 0 },
};

export async function verifyRaySegment(recipeSegment) {
    const entry = recipeSegment.rayCase;
    if (!entry) throw new Error('ray segment carries no case description');
    await runSegment({
        ...recipeSegment, moves: movesThroughWish(entry),
    });
    let wand = null;
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.invlet === WAND_LETTER) wand = obj;
    }
    if (!wand) throw new Error(`no object at inventory letter ${WAND_LETTER}`);
    if (objectType(wand, game).oc_dir !== RAY)
        throw new Error(`the wished wand at ${WAND_LETTER} is not a ray wand`);
    const { dx, dy } = DIRECTION_DELTA[entry.dir];
    const blocker = monsterOnLine(dx, dy, game);
    if (blocker) {
        throw new Error(
            `a monster stands at ${blocker.x},${blocker.y} on the bolt's line`,
        );
    }
}

export async function runRayZapMatrix() {
    return runFreshMatrix({
        entries: [{ label: 'ray zaps', recipe: loadRayZapRecipe() }],
        summaryLabel: 'RAY ZAP',
        verifySegment: verifyRaySegment,
        // Every segment here is a wizard-mode game the recorder terminates at
        // a live prompt, which leaves a save behind. One segment per chunk is
        // what makes record-session.mjs clear the install directory before
        // each of them.
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runRayZapMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`ray zap: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
