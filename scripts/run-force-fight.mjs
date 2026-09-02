#!/usr/bin/env node

// Record and replay the `F` force-fight prefix against the patched C
// reference.
//
// cmd.c do_fight() sets svc.context.forcefight and commits a walk before the
// direction key has even been read, and rhack() then sends the pair through
// domove(). hack.c domove_fight_empty() answers the square: the turn is spent,
// and one line names what the hero swung at. Which line that is depends on the
// terrain, so a seed plus a short walk selects an arm here the way a letter
// selects an object for `d`:
//
// - WALL_CASE swings east into the room's own vertical wall. accessible() is
//   false there, so `solid` is true, and back_to_glyph() answers wall_angle(),
//   whose eleven cmap indices all explain themselves as "wall".
// - STONE_CASE walks out into a corridor first and swings at the rock beside
//   it. STONE is the other half of C's `levl[x][y].seenv || IS_STWALL(typ)`
//   test and the only terrain that reaches defsyms[S_stone].
// - FOUNTAIN_CASE swings at a fountain. A fountain is ACCESSIBLE(), so it is
//   IS_FURNITURE() alone that makes `solid` true -- the half of that
//   disjunction no wall can exercise.
// - CLOSED_DOOR_CASE swings at a closed door. monmove.c accessible() answers
//   false for one only through its `!closed_door(x, y)` conjunct, and the case
//   also pins the admission seam: an ordinary step at that door would reach
//   test_move()'s autoopen route, and a force-fight never touches the door.
// - ROOM_CASE, CORRIDOR_FLOOR_CASE and DOORWAY_CASE swing at thin air, which
//   is C's else at 2318-2319 and the only arm that drops the "harmlessly ".
//   engrave.h spot_shows_engravings() names CORR, ICE and ROOM, so the first
//   two also stand for the squares where unmap_object() can meet an engraving;
//   neither target carries one. The corridor square is unlit, which is where
//   unmap_object()'s dark-room adjustment turns on its `typ == ROOM` conjunct
//   alone. DOORWAY_CASE is CLOSED_DOOR_CASE's pair: the same DOOR terrain,
//   accessible this time because closed_door() is false for a doorway with no
//   door in it.
// - The two axe cases repeat the wall and the thin-air squares with a
//   battle-axe in the hero's hand instead of a long sword. hack.c:2269-2276
//   sends a force-fight to dig.c use_pick_axe2() first when dig_typ() finds
//   something to dig, and dig.c:177-180 gives an axe nothing but a closed door
//   or a tree, so both squares fall through to the arms above and the swing is
//   the whole of what C does.
// - OFF_EDGE_CASE and OFF_EDGE_DIAGONAL_CASE walk to the bottom row of the map
//   and swing past it. That square belongs to no arm above, because
//   move_out_of_bounds() (2584-2612) claims a force-fight aimed off the map
//   before domove_core() reaches the terrain at all and hands it straight to
//   domove_fight_empty(), whose 2252-2256 names "an unknown obstacle" without
//   reading a square. The pair differs only in whether the step is orthogonal
//   or diagonal: C tests the destination with isok() alone, so a corner-facing
//   swing takes the same arm, and neither the doorway-diagonal rule nor
//   anything else in test_move() sits above it.
// - DOUBLE_CASE presses `FF`. do_fight() cancels on the second press, and
//   rhack()'s PREFIXCMD arm turns the ECMD_CANCEL into reset_cmd_vars().
// - INVENTORY_CASE presses `Fi`. extcmdlist[]'s "inventory" row carries no
//   CMD_gGF_PREFIX, so rhack():3711 reports the prefix instead of running the
//   command.
// - UPSTAIRS_CASE presses `F<`, the one command that adds " other than up or
//   down" to that line.
// - BOTH_PREFIXES_CASE presses `Fml` and MENU_FIRST_CASE presses `mFl`. A
//   prefix may follow a prefix, and was_m_prefix latches on do_reqmenu()
//   whichever order they arrive in, so both orders end in the same swing.
//
// - MISS_MONSTER_CASE and KILL_MONSTER_CASE swing at a hostile monster, which
//   uhitm.c do_attack() claims before any of the arms above can see the
//   square. Both select the arm that attack_checks()'s force-fight one returns
//   above, so the line the matrix reads is a melee line rather than a terrain
//   one. The first leaves its target alive, which is missum(); the second
//   takes hmon() through the kill. Neither names a terrain.
//
// Every case ends with `.` so that the turn the force-fight spends, and the
// turn the three prefix refusals do not, both show up in the status line's T:
// field as well as in the length of the random-number log.
//
// Seeds were found by generating D:1 with the port and reading the terrain
// around the hero's start, around the end of a short straight walk, for the two
// monster cases the four squares beside the start, and for the two off-edge
// cases the hero's row after a walk that reaches the bottom of the map; no
// recorded session was read.

import { game } from '../js/gstate.js';
import { is_axe, is_pick } from '../js/obj.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed Monday morning with no calendar event, so nothing competes with
// domove_fight_empty()'s own line for the top row.
const DATETIME = '20310203040506';
// The turn `F` did not spend. A prefix refusal that wrongly took one, or a
// force-fight that wrongly did not, shifts every later random-number call and
// moves the status line's T: field.
const REST = '.';

// rm.h terrain types, repeated here rather than imported so that a case
// declares the terrain it means in the source's own vocabulary.
const STONE = 0;
const VWALL = 1;
const DOOR = 23;
const CORR = 24;
const ROOM = 25;
const FOUNTAIN = 28;
// rm.h door states. A doorway with no door and a shut one are the two sides of
// closed_door(), which is the only reason accessible() ever answers false for
// DOOR terrain.
const D_NODOOR = 0;
const D_CLOSED = 4;

// One seed per level shape. Each was chosen for the terrain beside the hero,
// and for nothing else; where one level offers a second terrain the matrix
// needs, a case reuses it rather than adding another seed.
const WALL_SEED = 8800004;
const FOUNTAIN_SEED = 8800000;
const CLOSED_DOOR_SEED = 8800127;
const CORRIDOR_SEED = 8800032;
// A level whose start is close enough to the bottom row to reach it in three
// keys: `hjj` ends on the corridor square <15,20>, and ROWNO is 21, so one more
// step south leaves the map.
const MAP_EDGE_SEED = 8800070;
// The two levels with a hostile monster next to the hero's start. The fox
// survives the swing and the newt does not, which is the only difference the
// two cases are chosen for.
const FOX_SEED = 8800009;
const NEWT_SEED = 8800038;
// The one level in this matrix played by a Barbarian, whose start wields a
// battle-axe. Its room offers both terrains the axe cases need: a vertical
// wall to the east and ordinary floor on the other three sides.
const AXE_SEED = 8800006;

// u_init.c ini_inv() wields the first weapon of the role's trobj[] list, so
// the role decides what is in the hero's hand and therefore whether
// dig_typ() has anything to say.
const VALKYRIE = 'Valkyrie';
// u_init.c:666-670 gives a Barbarian either Barbarian_0, whose two-handed
// sword is wielded and whose axe becomes the secondary weapon, or
// Barbarian_1, whose battle-axe is wielded, on `rn2(100) >= 50`. AXE_SEED
// takes the second branch, and nothing else in the port can put an is_axe()
// or is_pick() object in the hero's hand: wield.c dowield() and
// doswapweapon() are unported, and so is the wield_tool() inside dig.c
// use_pick_axe().
const BARBARIAN = 'Barbarian';

function nethackrc(role) {
    return [
        `OPTIONS=name:Forcer,role:${role},race:human,gender:female,`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet, so no monster shares the hero's turns and no monster can
        // wander onto the square being swung at.
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        // Puts the turn counter on the status line, where a spent or unspent
        // turn is visible in the recorded screen itself.
        'OPTIONS=time',
        '',
    ].join('\n');
}

export const FORCE_FIGHT_CASES = [
    {
        label: 'the wall of the room the hero starts in',
        seed: WALL_SEED,
        walk: '',
        command: 'Fl',
        target: [1, 0],
        typ: VWALL,
        message: 'You harmlessly attack the wall.',
        movesAfter: 2,
    },
    {
        label: 'the rock beside a corridor',
        seed: CORRIDOR_SEED,
        walk: 'jj',
        command: 'Fj',
        target: [0, 1],
        typ: STONE,
        message: 'You harmlessly attack the stone.',
        // Two walking turns and the force-fight.
        movesAfter: 4,
    },
    {
        label: 'a fountain',
        seed: FOUNTAIN_SEED,
        walk: '',
        command: 'Fh',
        target: [-1, 0],
        typ: FOUNTAIN,
        message: 'You harmlessly attack the fountain.',
        movesAfter: 2,
    },
    {
        label: 'a closed door',
        seed: CLOSED_DOOR_SEED,
        walk: '',
        command: 'Fl',
        target: [1, 0],
        typ: DOOR,
        doormask: D_CLOSED,
        message: 'You harmlessly attack the closed door.',
        movesAfter: 2,
    },
    {
        label: 'the room floor beside the hero',
        seed: FOUNTAIN_SEED,
        walk: '',
        command: 'Fk',
        target: [0, -1],
        typ: ROOM,
        message: 'You attack thin air.',
        movesAfter: 2,
    },
    {
        label: 'a corridor square beside the hero',
        seed: CORRIDOR_SEED,
        walk: 'jj',
        command: 'Fh',
        target: [-1, 0],
        typ: CORR,
        message: 'You attack thin air.',
        // Two walking turns and the force-fight.
        movesAfter: 4,
    },
    {
        label: 'a doorway with no door in it',
        seed: CORRIDOR_SEED,
        walk: 'jj',
        command: 'Fk',
        target: [0, -1],
        typ: DOOR,
        doormask: D_NODOOR,
        message: 'You attack thin air.',
        movesAfter: 4,
    },
    {
        // hack.c:2269-2276 asks dig.c dig_typ() before any message arm, and
        // dig.c:180 answers DIGTYP_UNDIGGABLE for an axe at anything that is
        // neither a closed door nor a tree. So this swing takes the same solid
        // arm the Valkyrie's wall case does, rather than starting to dig.
        label: 'a wall, swung at with an axe in hand',
        seed: AXE_SEED,
        role: BARBARIAN,
        wielded: 'axe',
        walk: '',
        command: 'Fl',
        target: [1, 0],
        typ: VWALL,
        message: 'You harmlessly attack the wall.',
        movesAfter: 2,
    },
    {
        // The same axe on the thin-air arm, which is where a guard that
        // refused every digging tool cost a line as well as a turn.
        label: 'room floor, swung at with an axe in hand',
        wielded: 'axe',
        seed: AXE_SEED,
        role: BARBARIAN,
        walk: '',
        command: 'Fk',
        target: [0, -1],
        typ: ROOM,
        message: 'You attack thin air.',
        movesAfter: 2,
    },
    {
        label: 'the edge of the map, straight south',
        seed: MAP_EDGE_SEED,
        walk: 'hjj',
        command: 'Fj',
        // No `target`: the square is outside the map, so it has no terrain to
        // name and level.at() has nothing to return for it.
        message: 'You harmlessly attack an unknown obstacle.',
        // Three walking turns and the force-fight.
        movesAfter: 5,
    },
    {
        label: 'the edge of the map, diagonally',
        seed: MAP_EDGE_SEED,
        walk: 'hjj',
        command: 'Fn',
        message: 'You harmlessly attack an unknown obstacle.',
        movesAfter: 5,
    },
    {
        label: 'the prefix pressed twice',
        seed: WALL_SEED,
        walk: '',
        command: 'FF',
        target: [1, 0],
        typ: VWALL,
        message: 'Double fight prefix, canceled.',
        // Still the turn the game started on: a cancelled prefix spends none.
        movesAfter: 1,
    },
    {
        label: 'a command that takes no movement prefix',
        seed: WALL_SEED,
        walk: '',
        command: 'Fi',
        target: [1, 0],
        typ: VWALL,
        message:
            "The 'F' prefix should be followed by a movement command.",
        movesAfter: 1,
    },
    {
        label: 'the staircase command, which the line calls out by name',
        seed: WALL_SEED,
        walk: '',
        command: 'F<',
        target: [1, 0],
        typ: VWALL,
        message: "The 'F' prefix should be followed by a movement command "
            + 'other than up or down.',
        movesAfter: 1,
    },
    {
        label: 'the fight prefix followed by the menu prefix',
        seed: WALL_SEED,
        walk: '',
        command: 'Fml',
        target: [1, 0],
        typ: VWALL,
        message: 'You harmlessly attack the wall.',
        movesAfter: 2,
    },
    {
        label: 'the menu prefix followed by the fight prefix',
        seed: WALL_SEED,
        walk: '',
        command: 'mFl',
        target: [1, 0],
        typ: VWALL,
        message: 'You harmlessly attack the wall.',
        movesAfter: 2,
    },
    {
        label: 'a hostile monster that survives the swing',
        seed: FOX_SEED,
        walk: '',
        command: 'Fh',
        // The line names the species, so it is already the evidence that a
        // monster stood on the square: an empty one would have taken a
        // domove_fight_empty() arm above instead.
        message: 'You miss the fox.',
        movesAfter: 2,
    },
    {
        label: 'a hostile monster the swing kills',
        seed: NEWT_SEED,
        walk: '',
        command: 'Fh',
        message: 'You kill the newt!',
        movesAfter: 2,
    },
];

// The keystrokes up to and including the command, which is where the message
// the case names is on the top row.
function keysThroughFight(entry) {
    return entry.walk + entry.command;
}

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        // Only the two axe cases name a role. Every other case wants a hero
        // whose hand holds nothing dig_typ() answers for, which is what the
        // Valkyrie's long sword is here for.
        nethackrc: nethackrc(entry.role ?? VALKYRIE),
        moves: keysThroughFight(entry) + REST,
    };
}

export function loadForceFightRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: FORCE_FIGHT_CASES.map(segmentFor),
    }, 'force fight recipe');
}

function caseForSegment(segment) {
    const found = FORCE_FIGHT_CASES.find(
        (entry) => segmentFor(entry).moves === segment.moves
            && entry.seed === segment.seed,
    );
    if (!found) {
        throw new Error(
            `no force-fight case for moves ${JSON.stringify(segment.moves)}`,
        );
    }
    return found;
}

// The square the case names, read off the level the replay above left behind.
function verifyTargetTerrain(entry) {
    const { u, level } = game;
    const [dx, dy] = entry.target;
    const location = level.at(u.ux + dx, u.uy + dy);
    const typ = location?.typ;
    if (typ !== entry.typ) {
        throw new Error(
            `${entry.label}: the target square is terrain ${typ}, not `
            + `${entry.typ}`,
        );
    }
    // Only the two DOOR cases name one, because DOOR is the one terrain whose
    // door state decides which message arm answers. rm.h:213-218 aliases
    // doormask onto the field js/game.js calls `flags`, which is where a
    // generated level's door state lands.
    if (entry.doormask !== undefined && location.flags !== entry.doormask) {
        throw new Error(
            `${entry.label}: the target door state is ${location.flags}, `
            + `not ${entry.doormask}`,
        );
    }
}

// A case whose label names the wielded tool has to check it, or the row proves
// nothing about dig_typ(): the Barbarian's battle-axe is granted on
// `rn2(100) < 50` (u_init.c:666-670), so a seed that stops granting it would
// silently turn these into ordinary long-sword swings that pass anyway.
function verifyWieldedTool(entry, state) {
    if (entry.wielded === undefined) return;
    const held = state.uwep;
    const ok = entry.wielded === 'axe' ? is_axe(held, state)
        : entry.wielded === 'pick' ? is_pick(held, state)
            : null;
    if (ok === null) {
        throw new Error(`${entry.label}: unknown wielded kind ${entry.wielded}`);
    }
    if (!ok) {
        throw new Error(
            `${entry.label}: the hero wields ${held?.otyp ?? 'nothing'}, `
            + `which is not a ${entry.wielded}`,
        );
    }
}

export async function verifyForceFightSegment(segment) {
    const entry = caseForSegment(segment);
    let boundary = null;
    await runSegment(
        { ...segment, moves: keysThroughFight(entry) },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;

    // Four cases claim no terrain. The two monster cases leave it out because
    // uhitm.c do_attack() answers their square whatever it is made of, so
    // naming its type would pin something the case does not depend on; the two
    // off-edge cases leave it out because their square is outside the map.
    if (entry.typ !== undefined) verifyTargetTerrain(entry);
    verifyWieldedTool(entry, game);
    // gt.toplines, which pline.c writes whether or not the row was repainted.
    const toplines = game._ttyToplines ?? '';
    if (toplines !== entry.message) {
        throw new Error(
            `${entry.label}: top line is ${JSON.stringify(toplines)}, not `
            + `${JSON.stringify(entry.message)}`,
        );
    }
    // gm.moves. It starts at 1 and each elapsed turn adds one, so this is
    // where a force-fight that spent no turn, or a refusal that spent one,
    // shows up without waiting for the trailing rest.
    if (game.moves !== entry.movesAfter) {
        throw new Error(
            `${entry.label}: the game is on turn ${game.moves}, not `
            + `${entry.movesAfter}`,
        );
    }
}

export async function runForceFightMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'force fight', recipe: loadForceFightRecipe() },
        ],
        summaryLabel: 'FORCE FIGHT',
        verifySegment: verifyForceFightSegment,
    });
}

runMatrixCli(import.meta.url, runForceFightMatrix, 'force fight');
