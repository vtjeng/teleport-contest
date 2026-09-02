#!/usr/bin/env node

// Run the checked-in matrix for the kick command through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The command is dokick.c dokick(), which cmd.c rhack() reaches from '^D' and
// doextcmd() reaches from '#kick'. Two arms of it are ported: kick_nondoor()'s
// final else at :1251, which calls kick_dumb() (:863-878) on the empty floor
// beside the hero; and kick_door()'s non-trapped success branch (:940-950),
// which shatters (D_NODOOR) or crashes open (D_BROKEN) a closed or locked door.
// Both of kick_dumb()'s arms are here, and so are both of dokick()'s
// no-direction exits.
//
// kick_dumb()'s test at :867 is `martial() || ACURR(A_DEX) >= 16 || rn2(3)`,
// three terms whose short circuits decide whether the rn2(3) is drawn at all.
// A matrix that varied only the message would pass with the draw in the wrong
// place, so the four kicking cases below separate the terms:
//
//   * `martial` and `lowDex` are the same seed, the same direction and the
//     same Dexterity of 11. Only the role differs, and skills.h:81
//     martial_bonus() is true for the Monk alone, so the Valkyrie draws the
//     rn2(3) immediately after her exercise() and the Monk does not.
//   * `highDex` is a Valkyrie who rolled 16, the lowest value the second term
//     accepts, so her kick skips the draw as the Monk's does.
//   * `strain` is the third term landing on 0, which is the only way into
//     :872-874: a second exercise() and the rnd(5) inside set_wounded_legs().
//
// Whole-turn draw counts cannot separate these: the monsters that move after
// the hero differ by role and by seed. scripts/kick-command.test.mjs asserts
// the position of each draw in the turn instead.
//
// Seeds were chosen by generating D:1 with the port and reading the squares
// around the hero, not by copying any recorded session. Scanning upward from
// 6600001, these are the first seeds that offer what each case needs: a
// neighbouring square of plain room floor with no monster and no object on it,
// and, for `highDex` and `strain`, the Dexterity or the draw the case is named
// for. The scan also rejects a seed whose search reaches an unported branch of
// monster movement, which is why `strain` is 6600006 rather than 6600005: on
// 6600005 a monster steps onto a trap on the turn after the kick.

import { A_DEX, D_BROKEN, D_NODOOR, DOOR, WOUNDED_LEGS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed Friday afternoon, away from the calendar dates that add a startup
// message of their own.
const DATETIME = '20240517131415';

// cmd.c:2765 binds 'k' to kick as well, but commands_init() gives the row its
// C('d') key first; '^D' is what a default binding types.
export const KICK = '\x04';
// cmd.c doextcmd()'s prompt takes the command name and a newline. The "kick"
// row carries no AUTOCOMPLETE flag, so the whole name has to be typed.
export const KICK_EXT = '#kick\n';
// decl.c quitchars[] holds ESC, which getdir() answers with 0.
export const ESCAPE = '\x1b';
// cmd.c binds '.' to NHKF_GETDIR_SELF at the direction prompt, which writes
// <0,0,0> and sends dokick() out through its second cancel at :1320.
export const SELF = '.';
// A search after every kick. It spends a turn of its own, so the turn counter
// on the screen after it separates a kick that spent one from a kick that did
// not. donull() would print its own safety-prevention line over the kick's.
export const SEARCH = 's';

// `time` puts the turn counter on the status line, which is what separates
// dokick()'s ECMD_TIME from its ECMD_CANCEL. `showexp` is a second status
// field that must not move with it.
const PLAIN = 'pettype:none,!acoustics,!autopickup,time,showexp';

function nethackrc({ name, role, race, gender, align }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${PLAIN}`,
        '',
    ].join('\n');
}

const MONK = {
    name: 'Kicker', role: 'Monk', race: 'human', gender: 'male',
    align: 'lawful',
};
export const VALKYRIE_CHARACTER = Object.freeze({
    name: 'Kicker', role: 'Valkyrie', race: 'human', gender: 'female',
    align: 'lawful',
});

// One replay segment on the matrix's fixed clock and rc. The recipe builds
// every case with it, and scripts/kick-command.test.mjs builds the refusal
// cases the matrix cannot hold, because C prints where the port stops.
export function kickSegment({ seed, character, moves }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(character),
        moves,
    };
}

// Each case names the direction that seed leaves as plain floor and the
// wounded-leg state the kick has to end in, so a re-recording that moved the
// hero into a different room fails the differential instead of quietly
// kicking a wall.
export const KICK_CASES = Object.freeze([
    {
        label: 'martial',
        seed: 6600001,
        character: MONK,
        moves: `${KICK}h${SEARCH}`,
        strained: false,
    },
    {
        label: 'lowDex',
        seed: 6600001,
        character: VALKYRIE_CHARACTER,
        moves: `${KICK}h${SEARCH}`,
        strained: false,
    },
    {
        label: 'highDex',
        seed: 6600007,
        character: VALKYRIE_CHARACTER,
        moves: `${KICK}h${SEARCH}`,
        strained: false,
    },
    {
        label: 'strain',
        seed: 6600006,
        character: VALKYRIE_CHARACTER,
        moves: `${KICK}h${SEARCH}`,
        strained: true,
    },
    {
        label: 'extendedPrompt',
        seed: 6600001,
        character: MONK,
        moves: `${KICK_EXT}h${SEARCH}`,
        strained: false,
    },
    {
        label: 'cancelSelf',
        seed: 6600001,
        character: MONK,
        moves: `${KICK}${SELF}${SEARCH}`,
        strained: false,
    },
    {
        label: 'cancelEscape',
        seed: 6600001,
        character: MONK,
        moves: `${KICK}${ESCAPE}${SEARCH}`,
        strained: false,
    },
    // kick_door() success branch: crash-open and shatter. These seeds were
    // found by scanning from 6600001 for a starting position with an adjacent
    // closed door, high Strength (ACURR > 18), and the PRNG position that
    // sends the first kick into the intended arm. Each case kicks the door
    // once and follows with a search to confirm the turn count on the status
    // line.
    {
        // Seed 6600057: closed door west, STR 19. The first kick enters the
        // success branch and the crash-open else arm runs (rn2(5) != 0 or
        // the second/third term of the shatter condition fails).
        label: 'crashOpen',
        seed: 6600057,
        character: VALKYRIE_CHARACTER,
        moves: `${KICK}h${SEARCH}`,
        strained: false,
        // The door to the west becomes D_BROKEN.
        doorResult: { dx: -1, dy: 0, mask: D_BROKEN },
    },
    {
        // Seed 6600170: closed door east, STR 20. The first kick enters the
        // success branch, ACURR(A_STR) > 18 passes, and rn2(5) returns 0,
        // so the door shatters.
        label: 'shatter',
        seed: 6600170,
        character: VALKYRIE_CHARACTER,
        moves: `${KICK}l${SEARCH}`,
        strained: false,
        // The door to the east becomes D_NODOOR (shattered).
        doorResult: { dx: 1, dy: 0, mask: D_NODOOR },
    },
]);

export function loadKickCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: KICK_CASES.map(kickSegment),
    }, 'kick command recipe');
}

// The case a recipe segment came from. `martial` and `lowDex` share a seed
// and the same keys on purpose and differ only in the role, which reaches the
// segment as its nethackrc, so the role belongs in the key: without it the
// search answers both segments with the first case and the second is never
// checked against its own expectations.
export function kickCaseFor(recipeSegment) {
    const spec = KICK_CASES.find((entry) => {
        const segment = kickSegment(entry);
        return segment.seed === recipeSegment.seed
            && segment.moves === recipeSegment.moves
            && segment.nethackrc === recipeSegment.nethackrc;
    });
    if (!spec) {
        throw new Error(
            `no case owns seed ${recipeSegment.seed} typing `
            + JSON.stringify(recipeSegment.moves),
        );
    }
    return spec;
}

// The screens show the message each kick printed and the turn it spent. What
// they cannot show is which of kick_dumb()'s two arms produced it: a hero who
// took the strain arm carries do.c set_wounded_legs()'s timeout and its
// Dexterity penalty afterwards, and one who took the other arm carries
// neither. The status line does show a changed Dx, so this checks the timeout,
// which nothing on the screen reports.
export async function verifyKickSegment(recipeSegment) {
    const spec = kickCaseFor(recipeSegment);
    await runSegment(recipeSegment);
    // set_wounded_legs() writes 5 + rnd(5) and timeout.c counts it down one
    // per turn, so the exact value depends on how many turns follow the kick;
    // whether it is running at all is what separates the two arms.
    const timeout = game.u.uprops[WOUNDED_LEGS]?.intrinsic ?? 0;
    if (spec.strained !== (timeout > 0)) {
        throw new Error(
            `${spec.label}: wounded-legs timeout is ${timeout}, which does `
            + 'not match the kick_dumb() arm this case names',
        );
    }
    // set_wounded_legs() spends one point of temporary Dexterity with the
    // timeout, and only with it.
    const dexPenalty = game.u.atemp[A_DEX];
    if (spec.strained !== (dexPenalty < 0)) {
        throw new Error(
            `${spec.label}: atemp[A_DEX] is ${dexPenalty}, which does not `
            + 'match the arm this case names',
        );
    }
    // kick_door() success cases set the doormask to D_NODOOR (shatter) or
    // D_BROKEN (crash-open). The door must be the expected type and its
    // flags must match.
    if (spec.doorResult) {
        const x = game.u.ux + spec.doorResult.dx;
        const y = game.u.uy + spec.doorResult.dy;
        const loc = game.level.at(x, y);
        if (loc.typ !== DOOR) {
            throw new Error(
                `${spec.label}: expected a door at (${x}, ${y}) but found `
                + `typ ${loc.typ}`,
            );
        }
        if (loc.flags !== spec.doorResult.mask) {
            throw new Error(
                `${spec.label}: door flags are ${loc.flags}, expected `
                + `${spec.doorResult.mask}`,
            );
        }
    }
}

export async function runKickCommandMatrix() {
    return runFreshMatrix({
        entries: [{ label: 'kick command', recipe: loadKickCommandRecipe() }],
        summaryLabel: 'KICK COMMAND',
        verifySegment: verifyKickSegment,
    });
}

runMatrixCli(import.meta.url, runKickCommandMatrix, 'kick command');
