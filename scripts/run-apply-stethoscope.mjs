#!/usr/bin/env node

// Run the checked-in matrix for `a`, the apply command, through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The command is apply.c doapply() as far as its STETHOSCOPE arm, which
// reaches apply.c apply_ok() through invent.c getobj(), apply.c
// use_stethoscope() through the switch, and insight.c ustatusline() through
// the self direction. The matrix splits into two halves. The first drives
// use_stethoscope(): the free first listen, the second listen in the same
// move that costs a turn, both cancels, both self keys, and the Deaf guard.
// The second drives apply_ok(): one role per answer it can give, chosen so
// that a term returning the wrong answer changes the advertised letter set.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c cmdlist[] binds 'a' to doapply(); extcmdlist[] names the same handler
// 'apply', which the '#' prompt reaches. cmd.c's NHKF_GETDIR_SELF and
// NHKF_GETDIR_SELF2 are '.' and 's', and both zero u.dx, u.dy and u.dz, which
// is what sends use_stethoscope() to ustatusline(). decl.c quitchars[] is
// " \r\n\033", of which Escape and space are the two a recording can send.
export const APPLY_KEY = 'a';
export const APPLY_BY_NAME = '#apply\n';
export const STETHOSCOPE_SLOT = 'c';
export const SELF = '.';
export const SELF2 = 's';
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';
export const WAIT = '.';

// One listen: the command key, the Healer's stethoscope slot, and the self
// direction. Spelling it once keeps the repeated-listen segments readable,
// because the free-action rule counts listens rather than keys.
const LISTEN = `${APPLY_KEY}${STETHOSCOPE_SLOT}${SELF}`;

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// `time` puts the turn counter on the status line, which is the field a
// wrongly free or wrongly charged listen moves; `showexp` is a second field
// that must not move with it.
const PLAIN = 'pettype:none,!acoustics,!autopickup,time,showexp';
// The same case with a pet on the level, so a turn that should not elapse
// cannot move the dog either.
const PET = 'pettype:dog,!acoustics,!autopickup,time,showexp';
// permanent deafness, which youprop.h:125 folds into Deaf alongside the
// intrinsic and the extrinsic, so use_stethoscope()'s second guard fires.
const DEAF = 'pettype:none,!acoustics,!autopickup,time,showexp,deaf';
const DECORATED =
    'pettype:none,!acoustics,!autopickup,time,showscore,symset:DECgraphics,'
    + 'msg_window:reversed';

// Seed 4711002's D:1 leaves the hero's surroundings quiet for the eleven keys
// the longest segment sends; seed 4711001, its neighbour, reaches an unported
// monster-hiding branch on the turn after the listen and would end every
// segment there for a reason this matrix does not measure.
const QUIET_SEED = 4711002;

// Every segment opens and closes with a wait, so a command that wrongly spent
// or wrongly saved a turn shows up in the screen after it.
function segment(moves, character = {}, options = PLAIN, seed = QUIET_SEED) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'Stetho',
            role: 'Healer',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

// u_init.c:76-89 gives every Healer the same pack: a=scalpel, b=leather
// gloves, c=stethoscope, d,e=potions, f=wand, g,h,i=spellbooks, j=apples. The
// letters are fixed, so `c` names the stethoscope on every seed.
export function loadApplyStethoscopeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The recorded case: one listen, which costs no turn because it is
            // the first of the move, and ustatusline()'s one-line report.
            segment(LISTEN),
            // Three listens with no move between them. The first is free, the
            // second finds gh.hero_seq unchanged and spends the turn, and the
            // third is free again because spending it advanced gh.hero_seq.
            segment(`${LISTEN}${LISTEN}${LISTEN}`),
            // 's', the second self key. cmd.c getdir() tests it beside '.'
            // before movecmd() ever runs.
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}${SELF2}`),
            // getobj()'s two cancels, which never reach doapply()'s switch.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`),
            segment(`${APPLY_KEY}${SPACE_KEY}`),
            // getdir()'s two cancels, which reach ECMD_CANCEL after the
            // stethoscope has already been chosen.
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}${ESCAPE_KEY}`),
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}${SPACE_KEY}`),
            // The same command reached by name at the '#' prompt.
            segment(`${APPLY_BY_NAME}${STETHOSCOPE_SLOT}${SELF}`),
            // Deaf: use_stethoscope()'s second guard answers before getdir(),
            // so the two keys that would have been the direction and the
            // closing wait are both read as commands instead.
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}`, {}, DEAF),
            // A pet whose position a wrongly spent turn would move, and a
            // second listen to spend one on purpose.
            segment(`${LISTEN}${LISTEN}`, {}, PET),
        ],
    }, 'apply stethoscope recipe');
}

// One pack per apply_ok() term. Each role below advertises a letter set that
// only the named term produces, so a term answering wrongly would change the
// prompt rather than leave it alone. Every segment cancels at the prompt,
// because applying any of these tools reaches an arm of doapply()'s switch
// that is not ported. The packs are read from seed 4711002; u_init.c gives
// several roles a one-in-six or one-in-twenty-five extra, so a different seed
// advertises different letters for the same role.
export function loadApplyPromptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The Healer: TOOL_CLASS, WAND_CLASS and SPBOOK_CLASS three times
            // over, which is `[chijk or ?*]`, beside four undiscovered potion
            // stacks and a gold slot apply_ok() answers GETOBJ_DOWNPLAY for.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`),
            // The one role u_init.c:676-678 gives no random extra, so its pack
            // is exactly the five rows of Cave_man[] on every seed. Nothing in
            // it is appliable, so getobj() answers "You don't have anything to
            // use or apply." without prompting at all. Its flint takes
            // is_graystone()'s other arm: ini_inv_use_obj() discovered the type
            // at startup, so the hero knows the stone is not a touchstone and
            // apply_ok() answers GETOBJ_EXCLUDE_SELECTABLE.
            segment(`${APPLY_KEY}`, { role: 'Caveman' }),
            // is_pole(): the Knight's lance is the only suggestion in a pack
            // of one other weapon, four wearables and two foods.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Knight' }),
            // is_axe(): u_init.c:665-674 gives this Barbarian the axe of
            // Barbarian_0[] and the one-in-six oil lamp, so the prompt pairs
            // the weapon term with a plain TOOL_CLASS suggestion.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Barbarian' }),
            // The Valkyrie's one-in-six lamp likewise, with no weapon term:
            // her spear is P_SPEAR, which is neither a polearm nor a lance.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Valkyrie' }),
            // BULLWHIP, the one otyp apply_ok() names inside its weapon test,
            // and the touchstone u_init.c:661 gives every Archeologist, which
            // is is_graystone()'s GETOBJ_SUGGEST arm. The pick-axe, the tinning
            // kit and the sack are suggested as plain tools.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Archeologist' }),
            // COIN_CLASS: a Tourist starts with gold, which apply_ok()
            // downplays rather than excludes, plus three tools it suggests.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`,
                { role: 'Tourist', gender: 'male' }),
            // Both potion arms in one pack: this Wizard's random potions
            // include oil, which apply_ok() suggests once discovered, beside
            // two discovered potions that are not oil and so fall past the
            // downplay to GETOBJ_EXCLUDE_SELECTABLE.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`,
                { role: 'Wizard', gender: 'male' }),
            // The lock pick and the sack, the pack the next slice will drive.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Rogue' }),
            // The recorded prompt under a different symbol set and message
            // window, with a listen after it so the report is drawn too.
            segment(LISTEN, {}, DECORATED),
        ],
    }, 'apply prompt recipe');
}

export async function runApplyStethoscopeMatrix() {
    const stethoscope = await runFreshMatrix({
        entries: [{
            label: 'apply stethoscope',
            recipe: loadApplyStethoscopeRecipe(),
        }],
        summaryLabel: 'APPLY STETHOSCOPE',
        chunkLimit: 5,
    });
    if (!stethoscope.passed) return stethoscope;
    return runFreshMatrix({
        entries: [{
            label: 'apply prompt',
            recipe: loadApplyPromptRecipe(),
        }],
        summaryLabel: 'APPLY PROMPT',
        chunkLimit: 5,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runApplyStethoscopeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `apply stethoscope: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
