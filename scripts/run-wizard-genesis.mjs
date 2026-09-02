#!/usr/bin/env node

// Run the checked-in matrix for the ^G monster-creation prompt through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// Each segment reaches one branch of wizcmds.c wiz_genesis(), read.c
// create_particular(), read.c create_particular_parse(), read.c
// create_particular_creation(), or the cmd.c can_do_extcmd() call rhack() makes
// for the key a command is bound to. Two dispatch routes lead to the same
// handler, so the matrix carries both: C('g') through rhack(), and the typed
// name through doextcmd().
//
// No segment closes with a wait. Every accepted request leaves a hostile
// monster beside the hero, and the turn that follows runs its first move, which
// is a different subsystem entirely; the screen that answers the request is the
// last one each segment needs. Segments that end at a live prompt or on a
// created monster cost one game lock apiece. The matrix records one segment at
// a time for the same reason the #wizwish matrix does.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20270318143000';

export const GENESIS_KEY = '\x07'; /* C('g'), the "wizgenesis" row's key */
export const EXTCMD_KEY = '#';
export const ESCAPE_KEY = '\x1b';
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

// Every segment opens with a wait, so the prompt paints over a screen an
// ordinary turn produced rather than over the arrival screen.
function segment(seed, moves, {
    role = 'Wizard',
    race = 'human',
    gender = 'female',
    align = 'neutral',
    options = DEBUG_OPTIONS,
} = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'Gnss', role, race, gender, align, options,
        }),
        moves: `${WAIT}${moves}`,
    };
}

export function loadWizardGenesisRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the two dispatch routes to one handler ---
            // C('g') through rhack(): cmd.c:1961's "wizgenesis" row carries
            // WIZMODECMD, so can_do_extcmd() admits it only in debug mode. The
            // typed text stops short of a complete name, so every keystroke is
            // echo and nothing is submitted.
            segment(7710001, `${GENESIS_KEY}gas`),
            // The same handler through doextcmd(), where extcmds_match() rather
            // than can_do_extcmd() is what admits a WIZMODECMD row.
            segment(7710002, `${EXTCMD_KEY}wizgenesis${NEWLINE}gas spore`
                + `${NEWLINE}`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),

            // --- can_do_extcmd()'s WIZMODECMD refusal ---
            // The arm rhack() reaches and doextcmd() cannot: an ordinary game
            // pressing C('g') prints "Unavailable command 'wizgenesis'." and
            // spends no turn.
            segment(7710003, `${GENESIS_KEY}`, {
                role: 'Valkyrie',
                gender: 'female',
                align: 'lawful',
                options: ORDINARY_OPTIONS,
            }),
            // The other refusal, for contrast: extcmds_match() has already
            // dropped every WIZMODECMD row for an ordinary hero, so the typed
            // name is an unknown command rather than an unavailable one.
            segment(7710004, `${EXTCMD_KEY}wizgenesis${NEWLINE}`,
                { role: 'Archeologist', gender: 'male',
                    options: ORDINARY_OPTIONS }),

            // --- the line getlin() reads for create_particular() ---
            // Escape over an empty line, the one answer read.c:3380 turns into
            // a FALSE return: the prompt closes, nothing is created and the
            // command still spends no turn.
            segment(7710005, `${GENESIS_KEY}${ESCAPE_KEY}`,
                { role: 'Priest', gender: 'female' }),
            // Interior space runs, which the echo prints one for one and
            // mungspaces() then collapses out of the buffer before
            // create_particular_parse() ever sees it.
            segment(7710006, `${GENESIS_KEY}  gas   spore${NEWLINE}`,
                { role: 'Rogue', align: 'chaotic' }),

            // --- the monster create_particular_creation() makes ---
            // The spine: a species named by its exact mons[] name, created on
            // the hero's own square, so makemon() places it with enexto() and
            // MM_NOEXCLAM prints "appears next to you." rather than "suddenly
            // appears next to you!". This is the case seed5002 records.
            segment(7710007, `${GENESIS_KEY}gas spore${NEWLINE}`),
            // A second species with an inventory and a weapon, which the gas
            // spore has neither of: m_initweap() and m_initinv() both run
            // between newmonhp() and the appearance message.
            segment(7710008, `${GENESIS_KEY}gnome lord${NEWLINE}`,
                { role: 'Samurai', align: 'lawful' }),
            // The same species under its female name. mondata.c
            // name_to_monplus() answers FEMALE through the gender pointer
            // read.c:3211 passes it, create_particular_creation():3288 turns
            // that into MM_FEMALE, and makemon.c:1265 then skips the rn2(2)
            // that would otherwise choose the gender -- so the two segments
            // differ in the name on the top line and in the length of the
            // random-number log.
            segment(7710009, `${GENESIS_KEY}gnome lady${NEWLINE}`,
                { role: 'Samurai', align: 'lawful' }),
            // A species whose name matches through name_to_monplus()'s
            // canonical loop with nothing following it, on a hero far enough
            // from the Wizard's starting kit to move the placement draws.
            segment(7710010, `${GENESIS_KEY}newt${NEWLINE}`,
                { role: 'Barbarian', gender: 'female', align: 'chaotic' }),
        ],
    }, 'wizard genesis recipe');
}

export async function runWizardGenesisMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard genesis',
            recipe: loadWizardGenesisRecipe(),
        }],
        summaryLabel: 'WIZARD GENESIS',
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runWizardGenesisMatrix, 'wizard genesis');
