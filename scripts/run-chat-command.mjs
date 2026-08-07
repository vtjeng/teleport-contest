#!/usr/bin/env node

// Record and replay the #chat command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// sounds.c dochat() branches on the direction the player answers the prompt
// with and on what stands in that direction, so one start can drive most of
// the function. Seed 4410002 puts a Valkyrie in a room whose north wall holds
// a secret door, with a wand of digging one square east and open floor on
// every other side, which reaches six arms without a single setup move.
// verifyTarget() re-derives each case's claim about the target square from the
// live map before the differential records anything, so a seed whose level
// changed would fail here rather than quietly retarget.
//
// Four groups:
//
// - TARGET_CASES vary only the answer to "Talk to whom? (in what direction)".
// - CONDUCT_CASES repeat the wall answer under the two roleplay conducts that
//   gate the wall reply: OPTIONS=deaf clears sounds.c:1342's `!Deaf`, and
//   OPTIONS=blind reaches :1347, where an unmapped wall answers nothing.
// - STATUE_CASES need their own start, because only the level generator can
//   put a statue on the floor.
// - CANCEL_CASES answer the prompt with Escape, which is cmd.c getdir()'s
//   quitchars arm and the only route to sounds.c:1294's ECMD_CANCEL.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLINDED, IS_WALL, SDOOR, STONE } from '../js/const.js';
import { vobj_at } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { STATUE } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20310203040506';
const WAIT = '.';
// cmd.c extcmdlist[] binds '#' to doextcmd(); "chat" names the M-c row at
// cmd.c:1691.
const CHAT = '#chat\n';
// decl.c quitchars, the set cmd.c getdir():4060 cancels on without printing.
const ESCAPE = '\x1B';

// One start for every case that varies only the direction. cmd.c getdir()
// reads that key after the level is already built, so the neighborhood a seed
// generates is what selects the arm, the way a role selects an arm in
// scripts/run-twoweapon-command.mjs.
const NEIGHBORHOOD_SEED = 4410002;

// mklev.c fill_ordinary_room():1003-1006 drops a statue on a random free
// square of a fillable room on `!rn2(20)`, with no depth guard, so D:1 statues
// are ordinary. Scanning Valkyrie starts from 4420000 for one whose statue
// landed on a square adjacent to the hero found 19 in the first 1500, of which
// this is the second; the first, 4420053, was dropped because its trailing
// waits reach an unported monmove.c distfleeck() branch that has nothing to do
// with #chat. That scan is the only search this file needed, and direct setup
// could not replace it because no ported command puts an object on the floor.
const STATUE_SEED = 4420076;

// The terrain type one step away in <dx,dy>, read from the live map.
function targetTyp(dx, dy) {
    return game.level.at(game.u.ux + dx, game.u.uy + dy)?.typ;
}

// sounds.c:1352. A secret door prints the same line as a wall, which is what
// keeps it secret.
const WALL_REPLY = "It's like talking to a wall.";
// sounds.c:1292, the getdir() question.
const PROMPT = 'Talk to whom? (in what direction)';
// Marks an arm that returns without printing. topl.c show_topl() left the
// question and the echoed answer on the top line, and gt.toplines still holds
// them, so "nothing printed" reads as that unchanged line rather than as an
// empty one. answered() below spells out what it should still say.
const SILENCE = null;

// The top line an arm that prints nothing leaves behind: getline.c's
// `Sprintf(prompt, "%s ", query)` followed by the key tty_yn_function() echoed.
function answered(dir) {
    return `${PROMPT} ${dir === ESCAPE ? '<esc>' : dir}`;
}

// The eight direction keys are the vi-style bindings cmd.c commands_init()
// installs while number_pad is off; '<' and '>' are the two z-axis answers and
// '.' is NHKF_GETDIR_SELF.
//
// `arm` names the sounds.c line that opens the branch the case reaches, and
// `reaches` restates that line's condition against the live map rather than
// against a remembered observation.
export const TARGET_CASES = [
    // sounds.c:1342-1352. The room's northwest corner is a wall glyph, so
    // IS_WALL() holds and a sighted, hearing hero gets the wall reply.
    { dir: 'y', arm: 'sounds.c:1342 IS_WALL',
      says: WALL_REPLY,
      reaches: () => IS_WALL(targetTyp(-1, -1)) },
    // sounds.c:1342-1343, the `|| levl[tx][ty].typ == SDOOR` disjunct. A
    // secret door answers exactly as a wall does, which is what keeps it
    // hidden; only this case separates the two halves of that test.
    { dir: 'k', arm: 'sounds.c:1343 SDOOR',
      says: WALL_REPLY,
      reaches: () => targetTyp(0, -1) === SDOOR },
    // sounds.c:1334 with a non-statue pile head. vobj_at() answers the wand
    // of digging, `otmp->otyp == STATUE` is false, and floor is neither a
    // wall nor a secret door, so control falls to :1374's ECMD_OK and
    // nothing is printed.
    { dir: 'l', arm: 'sounds.c:1334 vobj_at',
      says: SILENCE,
      reaches: () => {
          const head = vobj_at(game.u.ux + 1, game.u.uy);
          return Boolean(head) && head.otyp !== STATUE;
      } },
    // sounds.c:1374. Bare floor: no monster, no object, no wall.
    { dir: 'h', arm: 'sounds.c:1374 mundetected',
      says: SILENCE,
      reaches: () => !m_at(game.u.ux - 1, game.u.uy)
          && !vobj_at(game.u.ux - 1, game.u.uy)
          && !IS_WALL(targetTyp(-1, 0)) },
    // sounds.c:1310-1323. getdir() writes <0,0,0> for the self key without
    // consulting movecmd(), so u.dz is zero and the self arm runs.
    { dir: '.', arm: 'sounds.c:1310 u.dx',
      says: 'Talking to yourself is a bad habit for a dungeoneer.',
      reaches: () => true },
    // sounds.c:1305-1308 with u.dz < 0.
    { dir: '<', arm: 'sounds.c:1305 u.dz up',
      says: "They won't hear you up there.", reaches: () => true },
    // sounds.c:1305-1308 with u.dz > 0. u.usteed is null, so :1297 cannot
    // intercept the downward answer.
    { dir: '>', arm: 'sounds.c:1305 u.dz down',
      says: "They won't hear you down there.",
      reaches: () => !game.u.usteed },
];

// Both conducts are config-file booleans (optlist.h:210 blind, :267 deaf), so
// they need no keystroke and change nothing about which square 'y' names.
export const CONDUCT_CASES = [
    // youprop.h:125 folds u.uroleplay.deaf into Deaf, so sounds.c:1342's
    // `!Deaf` fails, the wall arm is skipped entirely and control falls to
    // :1374 having printed nothing.
    { dir: 'y', conduct: 'deaf', arm: 'sounds.c:1342 !Deaf',
      says: SILENCE,
      reaches: () => Boolean(game.u.uroleplay?.deaf) },
    // sounds.c:1347. u_init.c:1027 turns OPTIONS=blind into HBlinded, and a
    // hero blind from turn one has mapped nothing, so lastseentyp is STONE
    // and the wall arm prints nothing even though it ran.
    { dir: 'y', conduct: 'blind', arm: 'sounds.c:1347 lastseentyp',
      says: SILENCE,
      reaches: () => Boolean(game.u.uprops[BLINDED].intrinsic)
          && !IS_WALL(game.level.lastseentyp?.[game.u.ux - 1]?.[game.u.uy - 1]
              ?? STONE) },
];

// The statue arm is the one branch of dochat() that needs its own start.
export const STATUE_CASES = [
    // sounds.c:1334-1340. vobj_at() answers the statue, so the sighted hero
    // is told it does not notice her and the wall test below never runs.
    { seed: STATUE_SEED, dir: 'u', arm: 'sounds.c:1334 STATUE',
      says: 'The statue seems not to notice you.',
      reaches: () => vobj_at(game.u.ux + 1, game.u.uy - 1)?.otyp === STATUE },
    // sounds.c:1336 `if (!Blind)`. The same statue, unseen: the arm still
    // returns ECMD_OK, and prints nothing on the way.
    { seed: STATUE_SEED, dir: 'u', conduct: 'blind',
      arm: 'sounds.c:1336 !Blind', says: SILENCE,
      reaches: () => vobj_at(game.u.ux + 1, game.u.uy - 1)?.otyp === STATUE
          && Boolean(game.u.uprops[BLINDED].intrinsic) },
];

export const CANCEL_CASES = [
    { dir: ESCAPE, arm: 'sounds.c:1294 ECMD_CANCEL', says: SILENCE,
      reaches: () => true },
];

// A short hero name: u_init.c's welcome line names the hero, the role, the
// race, the gender and the alignment, and a longer name wraps it past 80
// columns into a --More-- that would swallow the leading wait.
//
// pettype:none keeps a pet off the squares the direction keys name, and
// !acoustics silences dosounds() so nothing competes for the top line.
function nethackrc(conduct = null) {
    return [
        'OPTIONS=name:Chatter,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        ...(conduct ? [`OPTIONS=${conduct}`] : []),
        '',
    ].join('\n');
}

// Wait, chat, then wait twice more, so a move wrongly spent by a command C
// returns ECMD_OK from moves every later turn into a compared screen. The
// verifier replays the same segment with `trailing` at 0 to read the move
// counter the command itself left behind.
function segment({ seed = NEIGHBORHOOD_SEED, dir, conduct = null,
    trailing = 2 }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(conduct),
        moves: `${WAIT}${CHAT}${dir}${WAIT.repeat(trailing)}`,
    };
}

export function loadChatTargetRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: TARGET_CASES.map((entry) => segment(entry)),
    });
}

export function loadChatConductRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CONDUCT_CASES.map((entry) => segment(entry)),
    });
}

export function loadChatStatueRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STATUE_CASES.map((entry) => segment(entry)),
    });
}

export function loadChatCancelRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CANCEL_CASES.map((entry) => segment(entry)),
    });
}

// The recipes carry replay inputs only, so a segment is matched back to its
// case by the seed, the keys it types and the rc that configures it. Every
// case differs from every other in at least one of the three.
export function caseFor(recipeSegment) {
    const all = [
        ...TARGET_CASES, ...CONDUCT_CASES, ...STATUE_CASES, ...CANCEL_CASES,
    ];
    const found = all.find((entry) => {
        const built = segment(entry);
        return built.seed === recipeSegment.seed
            && built.moves === recipeSegment.moves
            && built.nethackrc === recipeSegment.nethackrc;
    });
    if (!found)
        throw new Error(`no case types ${JSON.stringify(recipeSegment.moves)}`);
    return found;
}

// Every arm these four groups reach ends `return ECMD_OK` or `return
// ECMD_CANCEL`, so #chat is free in all of them.
export async function verifyChatCommandSegment(recipeSegment) {
    const entry = caseFor(recipeSegment);

    // Stop at the Enter that submits the command, so the direction prompt is
    // still waiting and the map is the one the case describes.
    await runSegment({ ...recipeSegment, moves: `${WAIT}#chat` });
    if (!entry.reaches())
        throw new Error(`the start does not reach ${entry.arm}`);
    const movesBefore = game.moves;

    await runSegment(segment({ ...entry, trailing: 0 }));
    if (game.moves !== movesBefore)
        throw new Error(`${entry.arm} spent a move`);
    // gt.toplines, which pline.c writes whether or not the row was repainted.
    // The differential compares the whole screen; this names the one line the
    // arm is here for, so the test suite pins it without a C recording.
    const said = game._ttyToplines ?? '';
    const expected = entry.says ?? answered(entry.dir);
    if (said !== expected) {
        throw new Error(
            `${entry.arm} said ${JSON.stringify(said)}, not `
            + `${JSON.stringify(expected)}`,
        );
    }
}

export async function runChatCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'chat targets', recipe: loadChatTargetRecipe() },
            { label: 'chat conducts', recipe: loadChatConductRecipe() },
            { label: 'chat statue', recipe: loadChatStatueRecipe() },
            { label: 'chat cancel', recipe: loadChatCancelRecipe() },
        ],
        summaryLabel: 'CHAT COMMAND',
        verifySegment: verifyChatCommandSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runChatCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`chat command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
