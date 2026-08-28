#!/usr/bin/env node

// Run the checked-in matrix for the `z` command through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The command is zap.c dozap() over zap_ok(), zappable(), shk.c
// check_unpaid(), zapyourself() and learnwand(). The segments below cover the
// three effect arms this port runs: the wand that glows and fades because no
// direction was given, the worn-out wand that has no charge to spend, and the
// wand of sleep aimed at the hero's own square. Between them they cover every
// draw dozap() can spend, both of its prompts, the charge it takes, the turn
// it costs, the wand that crumbles to dust, and both of learnwand()'s arms.
//
// backfire() and weffects() still stop, so a segment that zapped a cursed wand
// into its face or aimed at anything but itself would stop at the refusal.
// Those two arms are pinned by boundary assertions in zap-command.test.mjs
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
// decl.c spkeys[NHKF_GETDIR_SELF], which cmd.c binds to '.'. getdir() answers
// 1 with u.dx, u.dy and u.dz all zero for it, and that is the one combination
// that sends dozap() into zapyourself(). It is the wait key as well, so a
// segment that zaps at itself and then waits types '.' twice over.
export const SELF_KEY = '.';

// The starting wand's inventory letter. u_init.c gives the Healer a wand of
// sleep after her food, and the letter it lands on does move with the seed:
// her apples and oranges carry UNDEF_BLESS, so a seed that blesses part of a
// stack splits it in two and pushes everything below it down a letter. Across
// seeds 8210001-8210060 the wand sits at 'f', 'g' or 'h'. Every seed below was
// picked to put it at 'g'.
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
            // The same keys on a hero who cannot see: zap.c:2654's `!Blind`
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
            // The direction prompt answered with the self key instead, which
            // is dozap()'s zapyourself() arm: "The sleep ray hits you!", then
            // fall_asleep(-rnd(50), TRUE) and the whole sleep running out
            // before the trailing wait is read. The Healer's wand type is
            // already discovered, so learnwand() takes its observe_object()
            // arm and the sleep's rnd(50) is the only draw the command spends.
            segment(8210001, `${ZAP_KEY}${HEALER_WAND}${SELF_KEY}`),
            // The same keys on another seed and another race, so neither the
            // level nor the length of the sleep is what makes the first pass.
            segment(8210011, `${ZAP_KEY}${HEALER_WAND}${SELF_KEY}`,
                { race: 'human' }),
            // A hero who cannot see is still told what hit them: zap.c:2860
            // has no Blind guard, unlike the "glows and fades" line above.
            segment(8210005, `${ZAP_KEY}${HEALER_WAND}${SELF_KEY}`,
                { options: BLIND }),
        ],
    }, 'zap command recipe');
}

// The self-zap of a wand whose type the hero has not discovered, which sends
// learnwand() down its makeknown() arm and spends the rn2(19) that
// exercise(A_WIS, TRUE) draws. No starting loadout carries an undiscovered
// wand -- u_init.c ini_inv_use_obj() discovers everything it hands out -- so
// the wand is wished up in debug mode.
export function loadZapDiscoveryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            segment(8210002,
                `${WIZWISH_KEY}wand of sleep\n`
                + `${ZAP_KEY}${WISHED_WAND}${SELF_KEY}`,
                { ...VALKYRIE, options: DEBUG }),
        ],
    }, 'zap discovery recipe');
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

// The WAN_DEATH arm of zapyourself(): the hero zaps a wand of death at
// their own square. A living, non-demon hero dies unless the wizard-mode
// query saves them. The survive path (answer 'n' to "Die?") is the one
// this recipe covers, because really_done() throws at bones creation for
// games whose board state triggers can_make_bones().
//
// Two segments: 'n' survives and resumes play; 'y' accepts death, entering
// really_done() which throws at the bones-creation boundary. Each uses
// chunkLimit: 1 because wizard-mode debug segments leave saves behind.
export const DEATH_RAY_SURVIVE = 'survive';
export const DEATH_RAY_DIE = 'die';

export function loadZapDeathRayRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Survive path: wish for a wand of death, zap self, answer 'n' to
            // "Die?", confirm the hero is alive by waiting. Two --More--
            // prompts appear (irradiation message and death message) before the
            // Die? query.
            segment(7830003,
                `${WIZWISH_KEY}wand of death\n`
                + `${ZAP_KEY}${WISHED_WAND}${SELF_KEY}`
                + `${SPACE_KEY}${SPACE_KEY}n`,
                { ...VALKYRIE, options: DEBUG }),
            // Accept-death path: answer 'y' to "Die?", which enters
            // really_done(). The segment stops when really_done() throws
            // at the bones boundary.
            segment(7830003,
                `${WIZWISH_KEY}wand of death\n`
                + `${ZAP_KEY}${WISHED_WAND}${SELF_KEY}`
                + `${SPACE_KEY}${SPACE_KEY}y`,
                { ...VALKYRIE, options: DEBUG }),
        ],
    }, 'zap death ray recipe');
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
    const charges = await runFreshMatrix({
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
    if (!charges.passed) return charges;
    const discovery = await runFreshMatrix({
        entries: [{
            label: 'zap command (wand discovery)',
            recipe: loadZapDiscoveryRecipe(),
        }],
        summaryLabel: 'ZAP COMMAND (WAND DISCOVERY)',
        chunkLimit: 1, /* debug mode, as above */
    });
    if (!discovery.passed) return discovery;
    return runFreshMatrix({
        entries: [{
            label: 'zap command (death ray)',
            recipe: loadZapDeathRayRecipe(),
        }],
        summaryLabel: 'ZAP COMMAND (DEATH RAY)',
        chunkLimit: 1, /* debug mode, as above */
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
