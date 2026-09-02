#!/usr/bin/env node

// Run the checked-in matrix for the map's memory of a monster the hero cannot
// spot, through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// What the matrix pins is mhitm.c pre_mm_attack() (40-73), the two arms that
// call display.c map_invisible() (377-385) when gv.vis is TRUE and one
// combatant fails canspotmon(); the glyph that write puts on the screen, which
// display.c reset_glyphmap():3029-3035 resolves to SYM_INVISIBLE with
// invis_color()'s NO_COLOR; display.c newsym():1032-1033, which re-asserts the
// marker on every later repaint of the square instead of recomputing it from
// the terrain; mon.c mondead():3170-3171, which forgets the marker when the
// monster standing on it dies; and do_name.c x_monnam()'s do_it arm (863-885),
// which is what makes hitmm() and missmm() print "it" rather than the species.
//
// gv.vis is the disjunction at mhitm.c:355-357, so a fight reaches the marker
// only when one combatant is spottable and the other is not. In an unlit room
// or corridor that is the ordinary case: the pet is adjacent to the hero and
// seen, and the monster it is fighting is a square or two further out in the
// dark. Every row below is that shape.
//
// The replay is spaces throughout, for the reason
// scripts/run-pet-melee-attack.mjs gives: `rest_on_space` binds <space> to
// #wait and `!safe_wait` drops the query that would otherwise refuse every
// wait beside a hostile. One key therefore both spends a turn and dismisses a
// --More--.
//
// Seeds came from a C-side scan, not from any recorded session. The scan
// recorded Valkyrie seeds 4310001-4310400 at the datetime below with forty
// spaces each and kept the ones whose message line names a
// monster-versus-monster blow with "it" on either side of the verb, which is
// what x_monnam()'s do_it arm looks like in a recording. Its domain and yield:
//
//   Valkyrie/female/neutral, seeds 4310001-4310400: 400 recorded, 7 with such
//   a fight, 5 that the port replays in full or up to a trimmed key count.
//
// The two the matrix leaves out are seeds 4310003 and 4310187, whose fights
// sit past a step the port stops on for an owner outside this behavior.
//
// The five rows together record 17733 PRNG calls, 150 screens and 150 cursors.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const MARKER_DATETIME = '20261118093000';

// A pet is what supplies the spottable half of gv.vis, so pettype is left at
// its default and the role decides the species: a Valkyrie gets whichever of
// the kitten and the little dog makemon.c pet_type()'s rn2(2) picks.
export const MARKER_RC = [
    'OPTIONS=name:Marker,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=rest_on_space,!safe_wait',
    '',
].join('\n');

function waits(count) {
    return ' '.repeat(count);
}

export function loadInvisibleMonsterMarkerRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Written and forgotten inside one step. The kitten's bite at step
            // 11 lands for d(1,6)=6 and kills the defender, and the absence of
            // passivemm()'s rn2(3) after it is how the recording says so:
            // mhitm.c:1359-1360 returns before that draw when the defender is
            // dead. mondead() then clears the marker before m_detach()'s
            // newsym() repaints the square, so no screen in the segment ever
            // draws an 'I'. Eleven keys stop on that step.
            { seed: 4310041, datetime: MARKER_DATETIME,
                nethackrc: MARKER_RC, moves: waits(11) },
            // The defender survives, so the marker outlives the step that
            // wrote it. The kitten misses at step 12 -- passivemm()'s rn2(3)
            // follows, which a kill would have skipped -- and the 'I' it wrote
            // is redrawn on the next two repaints by newsym()'s marker arm.
            // Fourteen keys stop on the step after that.
            { seed: 4310374, datetime: MARKER_DATETIME,
                nethackrc: MARKER_RC, moves: waits(14) },
            // The aggressor's arm rather than the defender's: "It bites the
            // newt." at step 24 names an attacker the hero cannot spot, and
            // gv.vis is TRUE through the newt alone. The newt dies on the same
            // blow, and its death is at a different square, so mondead()'s
            // clear leaves this marker alone: the 'I' stands for the sixteen
            // remaining steps.
            { seed: 4310059, datetime: MARKER_DATETIME,
                nethackrc: MARKER_RC, moves: waits(40) },
            // Written and forgotten again, with a little dog rather than a
            // kitten, and with dogmove.c dog_invent() picking up and dropping
            // a gold piece either side of the fight. Twenty-one further steps
            // pass without the marker coming back.
            { seed: 4310392, datetime: MARKER_DATETIME,
                nethackrc: MARKER_RC, moves: waits(40) },
            // Two unspottable-defender misses, at steps 36 and 38, each
            // sharing its step with a dog_invent() line and a --More--. The
            // marker stands for five steps, and at step 39 the same kitten
            // kills a newt it can spot: that death is at a different square,
            // so the marker is still there on the last screen.
            { seed: 4310201, datetime: MARKER_DATETIME,
                nethackrc: MARKER_RC, moves: waits(40) },
        ],
    }, 'invisible monster marker recipe');
}

export async function runInvisibleMonsterMarkerMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'invisible monster marker',
            recipe: loadInvisibleMonsterMarkerRecipe(),
        }],
        summaryLabel: 'invisible monster marker',
    });
}

runMatrixCli(import.meta.url, runInvisibleMonsterMarkerMatrix, 'run-invisible-monster-marker');
