#!/usr/bin/env node

// Run the checked-in matrix for a counted occupation that the hero's last
// returning hit point interrupts, through fresh C recordings. Every segment
// contains replay inputs only; runFreshMatrix() records new reference output in
// an isolated temporary workspace.
//
// What the matrix pins is allmain.c interrupt_multi() (975-983), entered from
// regen_hp():678. The function is `if (gm.multi > 0 && !svc.context.travel &&
// !svc.context.run) { nomul(0); if (flags.verbose && msg) Norep("%s", msg); }`,
// and three of the segments below decide one of its terms each:
//
//   Both inner statements run. The count is spent and "You are in full
//     health." reaches a top line no key bounds, because a counted occupation
//     reads none.
//   gm.multi > 0 is false. The same seed with a count short enough to run out
//     first tops the hero up on a turn that owes no repeat, and C says nothing.
//   flags.verbose is false. The same forty repeats with the option off end
//     silently, which is the arm nomul(0) reaches alone.
//
// nomul(0) writes gm.multi and leaves go.occupation installed, so
// moveloop_core():485 runs the occupation once more on the following turn and
// clears it when cmd.c timed_occupation() finds no repeat left. The recorded
// turn totals are what show that extra turn: an interruption that also
// uninstalled the activity would land one turn earlier.
//
// The two exemptions have no segment and need none. A run and a travel are the
// states cmd.c rhack() cannot combine with a counted occupation: :3728 installs
// one only for a row carrying occupation text, and neither svc.context.run nor
// svc.context.travel is set on that path.
// scripts/count-prefix.test.mjs 'a counted occupation leaves the state
// interrupt_multi() acts on' pins that directly.
//
// interrupt_multi()'s other caller, regen_pw():617, has no segment here and can
// have none. Nothing in js/ lowers u.uen -- u_init.c and the starting-spell
// initializer write it equal to u.uenmax, and exper.c pluslvl() raises the pair
// together -- so js/regen.js regen_pw() returns at its first line on every turn
// a recording can reach. scripts/regen.test.mjs pins that half instead.
//
// Every segment writes its line onto a clear top row, which is deliberate
// rather than incidental. cmd.c parse() clears the physical row after reading
// the count's committing byte, and nothing else prints during the count: the
// bear trap's WOUNDED_LEGS countdown is twelve to eighteen turns and every
// top-up below lands before it. A pending line would make pline.c vpline()
// share the row or call more(), and more() reads a key the segment still owes
// to its own input.
//
// The hero has to arrive below full health with no monster in reach, since
// moveloop_core():505 calls stop_occupation() for a monster next to the hero
// and would end the count before the top-up. trap.c trapeffect_bear_trap()'s
// losehp(Maybe_Half_Phys(d(2, 4))) is the port's one monster-free source of
// damage that also leaves the hero standing where it hit them.
//
// Seeds came from a port-side scan, not from any recorded session. It replayed
// each seed with no keys, kept the ones whose level put a BEAR_TRAP at the end
// of a straight line of at most eight plain room squares from the hero with no
// object, monster or second trap in between, walked that line and spent a count
// of forty. Its domain and yield, at datetime 20260910083000 with
// pettype:none: Valkyrie/female/neutral, Samurai/male/lawful,
// Barbarian/female/chaotic and Priest/male/neutral over seeds 1-1200 gave 48
// reachable bear traps, of which 7 let the count survive to the top-up. The
// other 41 ended earlier, nearly all at moveloop_core()'s monster_nearby()
// test, because a level-1 hero heals on `(u.ulevel + ACURR(A_CON)) > rn2(100)`
// -- about one point every six turns -- and a stationary hero is easy to find.
// Six of the seven were recorded against C and matched. The seventh, seed 945
// as a Barbarian, is left out: a monster steps onto a trap partway through its
// count and the port stops on that unported path, one screen short of C.
//
// The scan also settles the message context. Across all 96 of its replays no
// line ever preceded "You are in full health." on the top row. The bear trap's
// own WOUNDED_LEGS countdown is the only other writer a stationary hero has,
// and where it did expire first -- 50 of the 96 -- a monster had already
// reached the hero and stop_occupation() had ended the count.
//
// The Knight is the exception and is deliberate. Seed 405 is the walk-in
// scripts/run-hero-bear-trap.mjs already records, and it is the one hero here
// that the trap leaves Burdened. js/allmain.js advanceElapsedTurn() dry-runs
// the whole once-per-turn block on a cloned state for a burdened hero and
// returns early for an unburdened one, so that segment is the only one whose
// regen_hp() runs twice per turn and whose interrupt_multi() has to stay silent
// on the first pass.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// The datetime the port-side scan above ran at. Seed 405 keeps the walk-in's
// own clock, since that is the game the bear-trap matrix recorded.
const SCAN_DATETIME = '20260910083000';
const KNIGHT_DATETIME = '20310203040506';

// Distinct hero names keep each segment's recorder lock and save file separate,
// so a segment stopped at a prompt cannot restore into another.
function nethackrc({ name, role, gender, align, options = '' }) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet: a pet on the trap square or on the square the hero leaves
        // reaches hack.c domove_swap_with_pet(), and a pet beside the hero is
        // not what monster_nearby() answers for, but a displaced one can be.
        `OPTIONS=pettype:none,!acoustics${options}`,
        '',
    ].join('\n');
}

// The space after the walk dismisses look_here()'s window over the object pile
// mklev.c mktrap_victim() leaves on the trap, so the count keys start from a
// clear top line.
function countAfterBearTrap({
    seed, name, role, gender, align, options, walk, count,
    datetime = SCAN_DATETIME,
}) {
    return {
        seed,
        datetime,
        nethackrc: nethackrc({ name, role, gender, align, options }),
        moves: `${walk} ${count}`,
    };
}

export function loadFullHealthInterruptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Both inner statements, on a burdened hero. The trap's
            // WT_WOUNDEDLEG_REDUCT costs this Knight a carrying-capacity
            // threshold, so the walk-in needs two spaces: the trap line and
            // encumber_msg()'s "Your movements are slowed slightly because of
            // your load." make a --More-- between them.
            {
                seed: 405,
                datetime: KNIGHT_DATETIME,
                nethackrc: nethackrc({
                    name: 'Mending', role: 'Knight', gender: 'male',
                    align: 'lawful',
                }),
                moves: 'hh  40s',
            },
            // gm.multi > 0 is false. Three repeats run out before the top-up
            // turn, so the same hero reaches full health owing nothing and C
            // says nothing about it.
            {
                seed: 405,
                datetime: KNIGHT_DATETIME,
                nethackrc: nethackrc({
                    name: 'Brief', role: 'Knight', gender: 'male',
                    align: 'lawful',
                }),
                moves: 'hh  3s',
            },
            // flags.verbose is false. nomul(0) still ends the count -- forty
            // repeats cannot run out in nine turns -- and Norep() is skipped,
            // so this segment ends on the screen the count prompt drew.
            {
                seed: 405,
                datetime: KNIGHT_DATETIME,
                nethackrc: nethackrc({
                    name: 'Terse', role: 'Knight', gender: 'male',
                    align: 'lawful', options: ',!verbose',
                }),
                moves: 'hh  40s',
            },
            // Unburdened heroes, whose planning round returns before
            // regen_hp() and leaves the live pass as the only caller.
            // cmd.c:1846-1847's searching row spends the count through
            // detect.c dosearch().
            countAfterBearTrap({
                seed: 627, name: 'Kenshin', role: 'Samurai', gender: 'male',
                align: 'lawful', walk: 'n', count: '40s',
            }),
            // A second map and a second walk length for the same row.
            countAfterBearTrap({
                seed: 806, name: 'Musashi', role: 'Samurai', gender: 'male',
                align: 'lawful', walk: 'lll', count: '40s',
            }),
            // The longest count the scan found, at eleven searches, so this
            // one survives the most monster movement before the top-up ends
            // it.
            countAfterBearTrap({
                seed: 409, name: 'Patient', role: 'Barbarian',
                gender: 'female', align: 'chaotic', walk: 'uuu',
                count: '40s',
            }),
            // The other extcmdlist row that carries occupation text,
            // cmd.c:1930-1931's waiting row through cmd.c donull(). A search
            // draws where a wait does not, so the two rows reach the top-up
            // through different random-number streams.
            countAfterBearTrap({
                seed: 915, name: 'Waiting', role: 'Valkyrie',
                gender: 'female', align: 'neutral', walk: 'll', count: '40.',
            }),
            countAfterBearTrap({
                seed: 1092, name: 'Still', role: 'Priest', gender: 'male',
                align: 'neutral', walk: 'j', count: '40.',
            }),
        ],
    }, 'full health interrupt recipe');
}

export async function runFullHealthInterruptMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'full health interrupt',
            recipe: loadFullHealthInterruptRecipe(),
        }],
        summaryLabel: 'FULL HEALTH INTERRUPT',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runFullHealthInterruptMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `full health interrupt: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
