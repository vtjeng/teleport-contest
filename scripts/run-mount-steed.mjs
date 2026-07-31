#!/usr/bin/env node

// Run the checked-in matrix for steed.c mount_steed() through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// Each segment answers #ride's direction prompt with a real direction, so
// doride() calls mount_steed(m_at(u.ux + u.dx, u.uy + u.dy), FALSE). Between
// them the segments cover the two random-number calls the slip path makes --
// rnd(MAXULEV / 2 + 5) for the impairment roll and rn1(5, 10) for the damage --
// and three guards that return before the roll and therefore spend nothing.
//
// Nothing here can reach the success path at steed.c:358: mount_steed() sets
// u.usteed there, which belongs to the next slice, so a segment whose roll
// passes would run past what the port implements. Two slips in a row are
// impossible for the same reason from the other side -- rn1(5, 10) is 10 to 14
// and a level 1 Knight has 16 hit points, so a second slip always reaches
// losehp()'s death branch.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c extcmdlist[] binds '#' to doextcmd(); "ride" is the name of the row
// bound to doride(). The recorder's terminal has ICRNL set, so the '\n' that
// terminates the command name is what a recorded carriage return becomes.
export const RIDE_COMMAND = '#ride\n';
const WAIT = '.';

// A Knight is the only role whose starting pet wears a saddle: dog.c
// makedog():263-268 saddles a PM_PONY starting pet, and role.c:209 gives the
// Knight the one petnum that is PM_PONY. Every other role's #ride therefore
// stops at mount_steed()'s "%s is not saddled." guard instead.
function nethackrc({ role, gender, align, options }) {
    return [
        `OPTIONS=name:Rider,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Every segment opens with a wait, so the ride is attempted against a level
// the hero has already spent a turn on rather than against the arrival screen.
function segment(seed, options, moves, character = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            role: 'Knight',
            gender: 'male',
            align: 'lawful',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}`,
    };
}

const PLAIN = '!acoustics';
// optlist.h:654-655 defaults iflags.showdamage Off, which is what makes
// hack.c showdamage() print nothing in every other segment here.
const SHOWDAMAGE = '!acoustics,showdamage';
// flags.time puts the turn counter on the status line, which is how a segment
// shows that a failed mount returns ECMD_OK and costs the hero no time.
const WITH_TIME = '!acoustics,time';

export function loadMountSteedRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the slip, orthogonally and diagonally ---
            // rnd(20) fails, "You slip while trying to get on the saddled
            // pony." prints, and losehp(rn1(5, 10)) takes the hit points the
            // status line then shows. The trailing wait spends the turn the
            // ride did not, so the screen after the loss is recorded twice:
            // once with the message and once with the map redrawn under it.
            segment(7720000, PLAIN, `${RIDE_COMMAND}j${WAIT}`),
            // The same slip reached diagonally, which is the one route through
            // mount_steed()'s test_move(TEST_MOVE) call that exercises the two
            // diagonal doorway rules and cant_squeeze_thru().
            segment(7720008, PLAIN, `${RIDE_COMMAND}y${WAIT}`),
            // A female Knight on a different level, so neither the message nor
            // the damage is read off one layout.
            segment(7720208, PLAIN, `${RIDE_COMMAND}l${WAIT}`,
                { gender: 'female' }),

            // --- the same slip with the two options that reveal its numbers
            // ---
            // showdamage adds hack.c showdamage()'s "[HP -n, m left]" to the
            // same top line, which pins the damage exactly rather than through
            // the status line's rounded HP field.
            segment(7720000, SHOWDAMAGE, `${RIDE_COMMAND}j${WAIT}`),
            // With flags.time the status line carries T:, so the turn counter
            // before and after the failed mount is on the recorded screens.
            segment(7720003, WITH_TIME, `${RIDE_COMMAND}h${WAIT}`),

            // --- three guards that return before the roll ---
            // steed.c:249-255, `!mtmp`. Nothing stands north of this hero, so
            // "I see nobody there." prints and the command draws no random
            // number at all. This is what shows the roll sits behind the
            // guards rather than in front of them.
            segment(7720000, PLAIN, `${RIDE_COMMAND}k${WAIT}`),
            // steed.c:285-289, `!which_armor(mtmp, W_SADDLE)`, with a monster
            // that has a given name -- do_name.c mon_nam() drops the article
            // for one -- and with one that has none.
            {
                ...segment(7720100, PLAIN, `${RIDE_COMMAND}h${WAIT}`),
                nethackrc: nethackrc({
                    role: 'Samurai',
                    gender: 'male',
                    align: 'lawful',
                    options: PLAIN,
                }),
            },
            {
                ...segment(7720100, PLAIN, `${RIDE_COMMAND}h${WAIT}`),
                nethackrc: nethackrc({
                    role: 'Valkyrie',
                    gender: 'female',
                    align: 'neutral',
                    options: PLAIN,
                }),
            },
            // The same guard reached with a hostile monster, which proves the
            // saddle test really does precede the `!mtmp->mtame` test at
            // steed.c:299. No trailing wait: the newt would attack.
            segment(7720042, PLAIN, `${RIDE_COMMAND}k`),
        ],
    }, 'mount steed recipe');
}

export async function runMountSteedMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'mount steed',
            recipe: loadMountSteedRecipe(),
        }],
        summaryLabel: 'MOUNT STEED',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMountSteedMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`mount steed: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
