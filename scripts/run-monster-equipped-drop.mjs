#!/usr/bin/env node

// Run the checked-in matrix for a monster that dies still wearing something,
// through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// What the matrix pins is steal.c mdrop_obj() (812-846) taking an object whose
// owornmask is still set. mon.c m_detach():2779 hands every dying monster's
// pack to relobj(mtmp, 1, FALSE), which calls mdrop_obj() once per object with
// verbosely FALSE, so nothing announces the drop and the pile the square ends
// up holding is the whole observable. The equipped object reaches
// worn.c extract_from_minvent() (1377-1416) with do_extrinsics FALSE, which
// clears owornmask, clears the bit from mon->misc_worn_check and calls
// mon.c check_gear_next_turn(); mdrop_obj()'s own trailing
// update_mon_extrinsics() at 844-845 is skipped because DEADMONSTER() holds.
//
// The equipped object is an orcish helm every time, and that is not a narrowing
// of the matrix but what D:1 offers. makemon.c m_initweap():410-412 gives every
// orc a 1-in-2 orcish helm, and makemon():1445 puts it on through m_dowear();
// no other monster generated on the first level starts out wearing anything.
// A port-side scan of 12,000 seeds at the datetime below, replayed with no keys
// and inspecting the eight squares around the hero, found that every hostile
// standing next to her with a non-zero owornmask was a goblin in a helm:
//
//   Valkyrie/female/neutral, seeds 3141500-3147499: 542 adjacent, 23 equipped.
//   Samurai/male/lawful,     seeds 4770000-4772999: 270 adjacent, 12 equipped.
//   Rogue/male/chaotic,      seeds 8880000-8882999: 283 adjacent,  9 equipped.
//
// What the rows below vary instead is the shape of the release: whether the
// pack holds an unequipped object beside the worn one, so that relobj()'s loop
// runs both the old path and the new one; whether the square already held
// objects, so that invent.c stackobj() lands the helm on a pile rather than on
// bare floor; whether the corpse joins it; and whether the kill comes on the
// first blow or the second. Every segment ends by reading the square back,
// through pickup.c look_here() when the hero steps onto it and through
// dolook() on the ':' that follows.
//
// Three arms of mdrop_obj() are deliberately absent, because no input reaches
// them. The saddle no_charge exemption at 826-832 needs a tame saddled steed
// dying inside a shop the hero also stands in. The W_WEP tail of
// extract_from_minvent() (1414-1415) needs a monster that has wielded its
// weapon, which this port refuses one step earlier, at 'monster wield action'
// in js/unported_monster_actions.js. Its end_burn() arm (1399-1400) needs a
// monster wearing lit gold dragon scales or scale mail, which mdrop_obj()
// refuses one call earlier still, when distant_name() names a lamplit worn
// object. All three are covered by scripts/steal.test.mjs alone and none has a
// recorded case.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const DROP_DATETIME = '20260811143000';

function nethackrc({ role, gender, align }) {
    return [
        `OPTIONS=name:Armor,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet: a pet beside a hostile reaches dogmove.c's own attack, which
        // is refused, so the matrix would stop for an unrelated reason.
        // !autopickup keeps the step onto the pile on look_here() rather than
        // on pickup.c pickup(), which prices and lifts what is there.
        'OPTIONS=pettype:none,!acoustics,!autopickup,time',
        '',
    ].join('\n');
}

const VALKYRIE = nethackrc({
    role: 'Valkyrie', gender: 'female', align: 'neutral',
});
const SAMURAI = nethackrc({ role: 'Samurai', gender: 'male', align: 'lawful' });
const ROGUE = nethackrc({ role: 'Rogue', gender: 'male', align: 'chaotic' });

export function loadEquippedDropRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base row, and the smallest observable the slice has: the
            // goblin's pack holds the helm and nothing else, the square is
            // bare, and the kill declines the corpse. One object leaves
            // minvent equipped and the square ends up holding it alone.
            { seed: 3146311, datetime: DROP_DATETIME,
                nethackrc: VALKYRIE, moves: 'nn:' },
            // The helm under a corpse. make_corpse() runs after relobj(), so
            // the corpse is the pile head and the helm sits below it; a port
            // that placed the two in the other order fails here and nowhere
            // else in this matrix.
            { seed: 3141874, datetime: DROP_DATETIME,
                nethackrc: VALKYRIE, moves: 'll:' },
            // A pack holding both kinds at once: an orcish dagger the goblin
            // never wielded and the helm it wore. relobj()'s loop therefore
            // runs the already-ported unequipped drop and the new equipped one
            // on the same turn, and the pile order records which went first.
            { seed: 3142918, datetime: DROP_DATETIME,
                nethackrc: VALKYRIE, moves: 'hh:' },
            // The square already holds an object before the kill, so
            // stackobj() walks a pile that is not empty instead of placing
            // onto bare floor.
            { seed: 4770760, datetime: DROP_DATETIME,
                nethackrc: SAMURAI, moves: 'uu:' },
            // The same two-object pack under a different role and weapon: a
            // Samurai swings a katana rather than a long sword, so the whole
            // hit sequence in front of the drop differs.
            { seed: 4772000, datetime: DROP_DATETIME,
                nethackrc: SAMURAI, moves: 'yy:' },
            // A third role and alignment. A Rogue's short sword and chaotic
            // alignment change exper.c experience() and attrib.c adjalign()
            // around the same drop.
            { seed: 8880650, datetime: DROP_DATETIME,
                nethackrc: ROGUE, moves: 'jj:' },
            // A kill that is not the first blow: this goblin survives one hit
            // and attacks back before the second kills it, so the release
            // happens a turn later than every row above. The third press then
            // steps onto the square.
            { seed: 8880472, datetime: DROP_DATETIME,
                nethackrc: ROGUE, moves: 'bbb:' },
        ],
    }, 'monster equipped drop recipe');
}

export async function runEquippedDropMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster equipped drop',
            recipe: loadEquippedDropRecipe(),
        }],
        summaryLabel: 'MONSTER EQUIPPED DROP',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runEquippedDropMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster equipped drop: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
