#!/usr/bin/env node

// Run the checked-in matrix for the `z` command through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The command is zap.c dozap() over zap_ok(), zappable() and shk.c
// check_unpaid(). Three of dozap()'s five effect arms stop in this port --
// backfire(), zapyourself() and weffects() -- so every segment below reaches
// one of the two that do not: the wand that glows and fades because no
// direction was given, and the worn-out wand that has no charge to spend.
// Between them they cover both of dozap()'s draws, both of its prompts, the
// charge it spends, the turn it costs, and the wand that crumbles to dust.
//
// A segment that took a direction instead would stop at the refusal, so the
// two aimed arms are pinned by boundary assertions in zap-command.test.mjs
// rather than by a recording.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20310203040506';

// cmd.c cmdlist[] binds 'z' to dozap(); extcmdlist[] names the same handler
// 'zap', which the '#' prompt reaches. C('w') is the "wizwish" row's key.
export const ZAP_KEY = 'z';
export const ZAP_BY_NAME = '#zap\n';
export const WIZWISH_KEY = '\x17';
// decl.c quitchars[] is " \r\n\033". getdir() answers 0 for either of the two
// a recording can send, which is what takes dozap() into its "glows and
// fades" arm; the same two cancel getobj() one prompt earlier.
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';
export const WAIT = '.';

// The starting wand's inventory letter, per role. u_init.c gives the Healer a
// wand of sleep after six other slots and the Wizard a random wand after two,
// and neither role's loadout varies with the seed.
export const HEALER_WAND = 'g';
// The letter a wizard-mode wish lands on for a human Valkyrie, whose u_init.c
// row fills a through d and leaves no gold slot.
export const WISHED_WAND = 'e';

export const PLAIN = 'pettype:none,!acoustics,!autopickup';
// OPTIONS:blind is what youprop.h:94 calls PermaBlind: u_init.c raises
// HBlinded's FROMOUTSIDE bit, so `Blind` holds for the whole game and dozap()
// suppresses the line it would otherwise print for a cancelled direction.
export const BLIND = 'pettype:none,!acoustics,!autopickup,blind';
const DEBUG = 'pettype:none,!acoustics,!autopickup,playmode:debug';
// A visible turn counter and experience field, so a turn dozap() wrongly spent
// or wrongly saved moves a compared cell even when the message line agrees.
const CLOCK = 'pettype:none,!acoustics,!autopickup,time,showexp';

function nethackrc({ role, race, gender, options }) {
    return [
        `OPTIONS=name:ZapCmd,role:${role},race:${race},gender:${gender},`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Every segment opens with a wait, so the screen the prompt paints over is one
// an ordinary turn produced rather than the arrival screen, and closes with a
// wait, so a refusal that wrongly spent or wrongly saved a turn shows up in
// the screen after it.
function segment(seed, moves, {
    role = 'Healer',
    race = 'gnome',
    gender = 'male',
    options = PLAIN,
} = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ role, race, gender, options }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

const VALKYRIE = { role: 'Valkyrie', race: 'human', gender: 'female' };
const WIZARD = { role: 'Wizard', race: 'human', gender: 'male' };

export function loadZapCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The core case: both prompts, then getdir() answered with Escape,
            // which takes dozap() into `pline("%s glows and fades.")` with the
            // charge already spent and ECMD_TIME still returned.
            segment(7830001, `${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`),
            // The same keys on another seed and another race, so a level
            // layout or a racial loadout cannot be what makes the first pass.
            segment(7830011, `${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
                { race: 'human' }),
            // getobj() cancelled instead, once for each quitchar a recording
            // can send. dozap() answers ECMD_CANCEL, so no charge is spent and
            // no turn passes.
            segment(7830001, `${ZAP_KEY}${ESCAPE_KEY}`),
            segment(7830001, `${ZAP_KEY}${SPACE_KEY}`),
            // The same command reached by name at the '#' prompt, which is
            // doextcmd()'s dispatch rather than rhack()'s.
            segment(7830001,
                `${ZAP_BY_NAME}${HEALER_WAND}${ESCAPE_KEY}`),
            // A role whose pack holds no wand at all: zap_ok() suggests
            // nothing, so getobj() answers "You don't have anything to zap."
            // without prompting and dozap() never reaches zappable().
            segment(7830002, ZAP_KEY, VALKYRIE),
            // The Wizard's wand sits at a different letter from the Healer's,
            // so a prompt built from a fixed letter rather than from invent
            // would show here. The prompt is cancelled rather than answered:
            // u_init.c rolls the Wizard's wand type from the seed, and a
            // NODIR one would send dozap() into weffects() instead.
            segment(7830031, `${ZAP_KEY}${ESCAPE_KEY}`, WIZARD),
            // The same keys on a hero who cannot see: zap.c:2663's `!Blind`
            // holds back the "glows and fades" line, so the zap spends its
            // charge and its turn and says nothing at all.
            segment(7830001, `${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
                { options: BLIND }),
            // Two zaps in one game with a visible clock. The second one has to
            // find the charge the first spent already gone, and each has to
            // move the turn counter by exactly one.
            segment(7830021,
                `${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}${WAIT}`
                + `${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
                { options: CLOCK }),
        ],
    }, 'zap command recipe');
}

// The charge arms, which need a wand no starting loadout carries. Each segment
// wishes one up in debug mode and then zaps it.
//
// objnam.c readobjnam_parse_charges() reads "(0:-1)" as mismatched
// parentheses and discards it, so the depleted wand is spelled as an
// enchantment instead: "-1 wand of sleep" sets d.spesgn to -1 at objnam.c:3990
// and objnam.c:5266 curses what it makes.
export function loadZapChargeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // spe < 0, so zappable() answers 0 without drawing: "Nothing
            // happens." and then dozap()'s tail crumbles the wand to dust
            // through useupall().
            segment(7830003,
                `${WIZWISH_KEY}-1 wand of sleep\n${ZAP_KEY}${WISHED_WAND}`,
                { ...VALKYRIE, options: DEBUG }),
            // spe == 0, so zappable() draws rn2(WAND_WREST_CHANCE) and, on
            // this seed, loses: "Nothing happens." with the wand kept and the
            // draw spent.
            segment(7830003,
                `${WIZWISH_KEY}+0 wand of sleep\n${ZAP_KEY}${WISHED_WAND}`,
                { ...VALKYRIE, options: DEBUG }),
            // The same wand on the seed where that draw comes up 0: the wrest
            // line, a --More-- over it, then the direction prompt cancelled,
            // "glows and fades", and the wand crumbling because the wrested
            // charge took spe to -1. Found by scanning 7840000 upward under
            // the port for the first seed whose draw lands there; 7840124 is
            // the first, and its two successors are 7840270 and 7840352.
            segment(7840124,
                `${WIZWISH_KEY}+0 wand of sleep\n`
                + `${ZAP_KEY}${WISHED_WAND}${SPACE_KEY}${ESCAPE_KEY}`,
                { ...VALKYRIE, options: DEBUG }),
            // A cursed wand with charges, so dozap() spends
            // rn2(WAND_BACKFIRE_CHANCE) after zappable() has taken its charge.
            // The draw misses on this seed, so the command carries on into the
            // "glows and fades" arm with one more call in the log than the
            // uncursed wand above spends.
            segment(7830003,
                `${WIZWISH_KEY}cursed wand of sleep\n`
                + `${ZAP_KEY}${WISHED_WAND}${ESCAPE_KEY}`,
                { ...VALKYRIE, options: DEBUG }),
            // A second wand in the pack, so getobj() advertises two suggested
            // letters and they are not adjacent.
            segment(7830001,
                `${WIZWISH_KEY}wand of digging\n`
                + `${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
                { options: DEBUG }),
        ],
    }, 'zap charge recipe');
}

export async function runZapCommandMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'zap command',
            recipe: loadZapCommandRecipe(),
        }],
        summaryLabel: 'ZAP COMMAND',
        chunkLimit: 4,
    });
    if (!ordinary.passed) return ordinary;
    return runFreshMatrix({
        entries: [{
            label: 'zap command (charge arms)',
            recipe: loadZapChargeRecipe(),
        }],
        summaryLabel: 'ZAP COMMAND (CHARGE ARMS)',
        // One segment per recording. record-session.mjs clears the install
        // directory only before a chunk's first segment, and a debug-mode game
        // the recorder terminates leaves a save behind, so a second debug
        // segment in the same chunk restores the first instead of starting
        // fresh. The #wizwish matrix records one at a time for that reason.
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runZapCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`zap command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
