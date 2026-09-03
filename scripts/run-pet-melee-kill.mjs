#!/usr/bin/env node

// Run the checked-in matrix for a hero whose melee blow kills the hero's own
// pet, through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// What the matrix pins is the four arms mon.c xkilled() (3476-3740) guards on
// mtmp->mtame, which scripts/run-hostile-melee-kill.mjs never reaches because
// every monster it kills is hostile:
//
//   3502-3511  the kill message, You("%s %s!", ..., x_monnam(mtmp, ...,
//              "poor", ...)). `namedpet` at 3504 is has_mgivenname(mtmp)
//              && !Hallucination, and it selects both the article and
//              SUPPRESS_SADDLE, so an unnamed pet is "the poor kitten".
//   3524-3526  EDOG(mtmp)->killed_by_u, which no screen shows. The rows here
//              cannot check it; scripts/mon-kill.test.mjs does.
//   3563-3564  the sad feeling, which needs iflags.sad_feeling and so a pet
//              that dies out of sight. No row reaches it.
//   3703-3722  adjalign(-15) and the You_hear() pair, "the rumble of distant
//              thunder...", the arm a hero who is not hallucinating takes.
//              pline.c You_hear() (435-451) prints nothing without
//              flags.acoustics, which the third row turns off.
//
// The draws are the ones an ordinary kill makes, rn2(6) at 3587 and
// corpse_chance()'s rn2(tmp) at 3248, plus uhitm.c's own; the tame arms add
// none, because C's Soundeffect() is compiled out of the tty build and
// livelog_printf() only writes a file. A row whose count moved would mean the
// port had spent a call C does not.
//
// The pet also reaches uhitm.c before mon.c does: hmon_hitmon() calls dog.c
// abuse_dog() (rn2(9) at 1381) and sounds.c yelp() (rn2(35) at 437) for a
// tame target, which is why the cat and dog rows differ in their first line
// ("yowls", "hisses", "yelps").
//
// Two arms have no row here and are deferred in QUALITY.json instead. A
// hallucinating hero cannot be recorded on this path: switching hallucination
// on with #wizintrinsic diverges one hallucinated glyph on the very next
// redraw, before any kill, so the case measures a display gap rather than
// xkilled(). And a pet cannot be named, because do_name.c docallcmd()'s "a
// monster" option is unported. The recorded session
// sessions/seed0383-wizard-hallucinate.session.json covers the hallucinating
// message end to end, and scripts/mon-kill.test.mjs pins the named one.
//
// The seeds came from a port-side scan, not from any recorded session. It
// replayed each seed with no keys, read the starting pet's square (a starting
// pet is always adjacent, so all 100 located one), then force-fought that
// direction and kept the seeds whose pet died on the first blow. Its domain
// and yield, both at the datetime below and with the Valkyrie rc below:
//
//   pettype:cat, seeds 4410000-4410099: 100 adjacent, 37 killed.
//   pettype:dog, seeds 4410000-4410099: 100 adjacent, 37 killed.
//
// Force-fight is what makes the blow land: uhitm.c attack_checks():185-192
// returns FALSE for svc.context.forcefight before it can ask "Really attack
// <pet>?", so no confirmation prompt stands between the key and the kill.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const PET_KILL_DATETIME = '20270411104500';

function nethackrc({ pettype, extra = '' }) {
    return [
        'OPTIONS=name:Rue,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype},!autopickup${extra}`,
        '',
    ].join('\n');
}

// Each row ends with a space so that the recording covers the screen after the
// kill message's --More--, which is where the You_hear() line lands.
export function loadPetMeleeKillRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base row: an unnamed kitten, so namedpet is false and
            // x_monnam() answers ARTICLE_THE with suppress 0.
            // "You kill the poor kitten!", then distant thunder.
            { seed: 4410002, datetime: PET_KILL_DATETIME,
                nethackrc: nethackrc({ pettype: 'cat' }), moves: 'Fn ' },
            // The same arms with a different yelp verb, because sounds.c
            // yelp() picks on msound and this kitten's roll lands elsewhere:
            // "The kitten hisses!" rather than "yowls".
            { seed: 4410011, datetime: PET_KILL_DATETIME,
                nethackrc: nethackrc({ pettype: 'cat' }), moves: 'Fl ' },
            // The base row again with acoustics off, so You_hear() returns at
            // pline.c:441 and prints nothing: the kill message stands alone
            // with no --More-- and no thunder. Everything else must match the
            // first row call for call, since C consults flags.acoustics
            // nowhere else on this path.
            { seed: 4410002, datetime: PET_KILL_DATETIME,
                nethackrc: nethackrc({
                    pettype: 'cat', extra: ',!acoustics',
                }),
                moves: 'Fn ' },
            // A little dog instead: a different species name in the message
            // and a different corpse_chance() divisor.
            { seed: 4410025, datetime: PET_KILL_DATETIME,
                nethackrc: nethackrc({ pettype: 'dog' }), moves: 'Fj ' },
        ],
    }, 'pet melee kill recipe');
}

export async function runPetMeleeKillMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pet melee kill',
            recipe: loadPetMeleeKillRecipe(),
        }],
        summaryLabel: 'PET MELEE KILL',
    });
}

runMatrixCli(import.meta.url, runPetMeleeKillMatrix, 'pet melee kill');
