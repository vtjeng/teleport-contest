#!/usr/bin/env node

// Run the checked-in matrix for the wish prompt through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// Each segment reaches one branch of wizcmds.c wiz_wish(), zap.c makewish(),
// objnam.c readobjnam(), or the cmd.c can_do_extcmd() call rhack() makes for
// the key a command is bound to. Two dispatch routes lead to the same handler,
// so the matrix carries both: C('w') through rhack(), and the typed name
// through doextcmd().
//
// The first eight segments end while getlin() is still reading, which costs
// one game lock apiece; the fifteen after them submit a wish and close with a
// wait. The matrix records one segment at a time for the same reason the
// #levelchange matrix does.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20291105071500';

export const WIZWISH_KEY = '\x17'; /* C('w'), the "wizwish" row's key */
export const EXTCMD_KEY = '#';
export const ESCAPE_KEY = '\x1b';
export const ERASE_KEY = '\x7f'; /* the erase character gettty() seeds */
export const KILL_KEY = '\x15'; /* the kill character gettty() seeds */
const NEWLINE = '\n';
export const WAIT_KEY = '.';
const WAIT = WAIT_KEY;

const DEBUG_OPTIONS = 'pettype:none,!acoustics,playmode:debug';
const ORDINARY_OPTIONS = 'pettype:none,!acoustics';

function nethackrc({ name, role, race, gender, align, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Every segment opens with a wait, so the screen the prompt paints over is one
// an ordinary turn produced rather than the arrival screen. Only a segment
// whose command completes can close with one; see the file header.
function segment(seed, moves, {
    role = 'Wizard',
    race = 'human',
    gender = 'male',
    align = 'neutral',
    options = DEBUG_OPTIONS,
} = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'Wshr', role, race, gender, align, options,
        }),
        moves: `${WAIT}${moves}`,
    };
}

export function loadWizardWishRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the two dispatch routes to one handler ---
            // C('w') through rhack(): cmd.c:2000's "wizwish" row carries
            // WIZMODECMD, so can_do_extcmd() admits it only in debug mode.
            // The typed text stops short of any name readobjnam() resolves,
            // so every keystroke is echo and nothing is submitted.
            segment(4471001, `${WIZWISH_KEY}mud boo`),
            // The same handler through doextcmd(), where extcmds_match()
            // rather than can_do_extcmd() is what admits a WIZMODECMD row.
            segment(4471002, `${EXTCMD_KEY}wizwish${NEWLINE}blessed sc`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),

            // --- can_do_extcmd()'s WIZMODECMD refusal ---
            // The arm rhack() reaches and doextcmd() cannot: an ordinary game
            // pressing C('w') prints "Unavailable command 'wizwish'." and
            // spends no turn, so the pet moves only on the closing wait.
            segment(4471003, `${WIZWISH_KEY}${WAIT}`, {
                role: 'Valkyrie',
                gender: 'female',
                align: 'lawful',
                options: 'pettype:dog,!acoustics',
            }),
            // The other refusal, for contrast: extcmds_match() has already
            // dropped every WIZMODECMD row for an ordinary hero, so the typed
            // name is an unknown command rather than an unavailable one.
            segment(4471004, `${EXTCMD_KEY}wizwish${NEWLINE}${WAIT}`,
                { role: 'Archeologist', options: ORDINARY_OPTIONS }),

            // --- the line getlin() reads for makewish() ---
            // Erasing back over the typed text, which walks the cursor back
            // and blanks the cells behind it.
            segment(4471005, `${WIZWISH_KEY}lamp${ERASE_KEY}${ERASE_KEY}n`,
                { role: 'Priest', gender: 'female' }),
            // Escape over a non-empty line. getline.c:88 clears the buffer and
            // repaints the prompt instead of returning, so this stays inside
            // the slice; an Escape over an empty line returns and grants a
            // random wish, which is a deferred case.
            segment(4471006, `${WIZWISH_KEY}scroll${ESCAPE_KEY}ri`,
                { role: 'Rogue', align: 'chaotic' }),
            // The kill character, which erases the whole line in place.
            segment(4471007, `${WIZWISH_KEY}two ru${KILL_KEY}gem`,
                { role: 'Samurai', align: 'lawful' }),
            // Interior space runs, which the echo prints one for one and
            // mungspaces() then collapses out of the buffer.
            segment(4471008, `${WIZWISH_KEY}  blessed   +2  cry`,
                { role: 'Barbarian', gender: 'female', align: 'chaotic' }),

            // --- the wish the Return submits ---
            // An exact objects[] name, which rnd_otyp_by_namedesc() resolves
            // to one entry and hold_another_object() then holds: the spine of
            // this behavior, and the case seed0108 records.
            segment(4471009, `${WIZWISH_KEY}magic lamp${NEWLINE}${WAIT}`),
            // A per-game shuffled description rather than a name. o_init.c
            // assigns it, so a port reading objects.c's static table passes
            // the case above and fails this one.
            segment(4471010, `${WIZWISH_KEY}mud boots${NEWLINE}${WAIT}`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),
            // wishymatch()'s " of " inversion (objnam.c:3256-3272), which
            // nothing else in the chain reaches.
            segment(4471011, `${WIZWISH_KEY}boots of speed${NEWLINE}${WAIT}`,
                { role: 'Rogue', align: 'chaotic' }),
            // An alternate spelling from spellings[], which returns before
            // readobjnam_postparse3() and so spends no lookup draw at all.
            segment(4471012, `${WIZWISH_KEY}lantern${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // Declining: readobjnam() answers its caller's sentinel at 4918
            // and makewish() returns without spending rn1(100, 50).
            segment(4471013, `${WIZWISH_KEY}nothing${NEWLINE}${WAIT}`,
                { role: 'Samurai', align: 'lawful' }),
            // Just outside the slice's stated limit: objects.h:929,931 give
            // both lamps the description "lamp", but readobjnam_postparse2()'s
            // o_ranges[] row catches the bare word first and calls
            // rnd_class() over the pair instead of matching a description.
            segment(4471014, `${WIZWISH_KEY}lamp${NEWLINE}${WAIT}`,
                { role: 'Archeologist' }),

            // --- the qualifiers readobjnam()'s typfnd: tail applies ---
            // Six of the seven below wish as a Priest, because
            // objnam.c xname_flags():629-630 sets bknown for
            // Role_if(PM_CLERIC), which puts the object's blessed or cursed
            // state into the line prinv() prints. No other hero can see a
            // BUC change at all.
            //
            // A blessed enchanted dragon suit: objnam.c:5248-5250 rewrites
            // SCALE_MAIL to the named dragon's row, 5264 blesses it, and 5395
            // re-weighs it -- DRGN_ARMR (objects.h:497-499) weighs 40 against
            // the scale mail row's 250.
            segment(4471015,
                `${WIZWISH_KEY}blessed +5 silver dragon scale mail`
                + `${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // 5258-5259's curse() (mkobj.c:1783), the one BUC arm that is not
            // a pair of direct field assignments.
            segment(4471016, `${WIZWISH_KEY}cursed long sword${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // 5260-5262's "uncursed", which has to undo a curse the object
            // already carries. The amulet is what makes that visible:
            // mkobj.c:1063-1066 curses an amulet of strangulation nine times
            // in ten, where blessorcurse() leaves most types alone.
            segment(4471017,
                `${WIZWISH_KEY}uncursed amulet of strangulation`
                + `${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // 5266-5267: a negative enchantment with no BUC word curses the
            // object, which is the only way a screen can show that 5119-5120
            // read the sign.
            segment(4471018, `${WIZWISH_KEY}-2 long sword${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // The same wish with the opposite sign, which reaches no BUC arm
            // at all and leaves the object uncursed.
            segment(4471019, `${WIZWISH_KEY}+2 long sword${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // readobjnam_postparse1():4489-4500 sets d.iscursed for "unholy
            // water" rather than choosing a type of its own, so the tail is
            // what tells the two waters apart. Cursed water cannot merge with
            // the blessed stack a Priest starts with.
            segment(4471020, `${WIZWISH_KEY}unholy water${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // The far end of 5248's dragon range, on a hero who sees no BUC:
            // the rewritten type is visible in the name on its own.
            segment(4471021,
                `${WIZWISH_KEY}yellow dragon scale mail${NEWLINE}${WAIT}`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),
            // The "potion of" phrasing of both waters. objnam.c:4489-4501
            // reaches POT_WATER by a route of its own -- adjective parsing has
            // stopped at "potion", so the arm reads what is left and returns 2
            // straight to typfnd: -- where the bare forms above arrive through
            // the ordinary lookup. Both routes must set the same BUC, and only
            // a recording shows that the two agree.
            segment(4471022,
                `${WIZWISH_KEY}potion of holy water${NEWLINE}${WAIT}`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),
            // 4471023 is skipped: its closing wait reaches
            // distfleeck() (monmove.c:538), an unported monster-movement path,
            // so the segment would stop for a reason unrelated to the wish.
            segment(4471024,
                `${WIZWISH_KEY}potion of unholy water${NEWLINE}${WAIT}`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),

            // --- the names readobjnam_postparse3()'s tail resolves ---
            // An artifact by name, which no objects[] lookup can reach:
            // artifact.c artifact_name() matches it at objnam.c:4876 and the
            // typfnd: tail turns the elven dagger into it.  Sting carries no
            // SPFX_RESTR, so touch_artifact() lets any hero hold it without a
            // draw, which leaves the wish's own rn2(nartifact_exist()) as the
            // only new call in the segment.
            segment(4471025, `${WIZWISH_KEY}Sting${NEWLINE}${WAIT}`,
                { role: 'Valkyrie', gender: 'female', align: 'neutral' }),
            // The same route with two differences the C source makes visible:
            // artifact_name()'s fuzzymatch() ignores the space the player left
            // out, and the name it answers is artilist[]'s own, so the object
            // is named "Frost Brand" rather than "frostbrand".  Frost Brand is
            // SPFX_RESTR with alignment A_NONE, which is the operand that
            // spares it from artifact.c:926's alignment test.
            segment(4471026, `${WIZWISH_KEY}frostbrand${NEWLINE}${WAIT}`,
                { role: 'Archeologist' }),
            // A restricted artifact the hero is out of step with: Vorpal Blade
            // is A_NEUTRAL, so a lawful hero makes artifact.c:925-928 true and
            // touch_artifact() spends the rn2(4) at 945 before deciding not to
            // blast her.  The qualifiers ride along, on a Priest who can see
            // the blessing.
            segment(4471027,
                `${WIZWISH_KEY}blessed +3 Vorpal Blade${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female', align: 'lawful' }),
            // objnam.c:4775-4781's ARMOR_CLASS retry, the one arm of
            // readobjnam_postparse3() that returns to readobjnam()'s retry:
            // label.  The class-name loop has already eaten " armor", leaving
            // "plate", which matches nothing until " mail" is appended.
            segment(4471028, `${WIZWISH_KEY}plate armor${NEWLINE}${WAIT}`,
                { role: 'Rogue', align: 'chaotic' }),
            // objnam.c:4761-4771's Japanese_items[] table, which is the only
            // way to reach a short sword by that name.
            segment(4471029, `${WIZWISH_KEY}wakizashi${NEWLINE}${WAIT}`,
                { role: 'Samurai', align: 'lawful' }),
            // A " named " wish on an ordinary object: objnam.c:5347-5349 finds
            // no artifact of that name, so oname() only labels it and the
            // inventory line carries " named Fido".
            segment(4471030,
                `${WIZWISH_KEY}long sword named Fido${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // The other half of objnam.c:5353: the name does match an
            // artifact, and the type the player asked for is that artifact's
            // own, so d.name is replaced by artilist[]'s pointer and oname()
            // converts the object.
            segment(4471031,
                `${WIZWISH_KEY}elven dagger named Sting${NEWLINE}${WAIT}`),
            // And the case that separates the two: the same name on the wrong
            // base type.  artifact_name() answers Sting, objtyp is
            // ELVEN_DAGGER rather than LONG_SWORD, so 5353 leaves d.name
            // alone, oname() finds no artifact to make, and neither
            // objnam.c:5362's quan/wisharti nor zap.c:6382's artifact_origin()
            // runs -- which the missing rn2(nartifact_exist()) shows.
            segment(4471032,
                `${WIZWISH_KEY}long sword named Sting${NEWLINE}${WAIT}`),
        ],
    }, 'wizard wish recipe');
}

export async function runWizardWishMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard wish',
            recipe: loadWizardWishRecipe(),
        }],
        summaryLabel: 'WIZARD WISH',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runWizardWishMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`wizard wish: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
