#!/usr/bin/env node

// Run the checked-in matrix for commands that consume no game time through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

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

export function loadNoTimeCommandsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Five bytes with no binding, each answered by rhack()'s
                // bad-command path, separated by waits so a wrongly elapsed
                // turn would show in the next screen.
                moves: "..% ..'~]..",
            },
            {
                seed: 8810004,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Ranger',
                    options: 'pettype:dog,!acoustics',
                }),
                // The same path with a pet on the level and a walk between the
                // unbound bytes: the pet must not move on a no-time command.
                moves: '.M.}l ~..{',
            },
            {
                seed: 8810011,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics,number_pad:1',
                }),
                // With number_pad on, `2` is a movement command rather than a
                // count digit, so the unbound set follows the option.
                moves: '.%.2%~.',
            },
            // The look command, `:`, whose look_here() branches also take no
            // game time for a sighted hero.
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // The hero starts on the upstairs, so this looks at a terrain
                // feature: dfeature_at() through stairs_description().
                moves: '..:..',
            },
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // One step west reaches a bare floor square, where look_here()
                // has no feature to name and answers "You see no objects
                // here."; the step back looks at the staircase again.
                moves: 'h:l:',
            },
            {
                seed: 990003,
                datetime: '20300102030405',
                nethackrc: nethackrc({
                    name: 'DoorFind',
                    role: 'Healer',
                    gender: 'male',
                    options: 'pettype:none,!acoustics',
                }),
                // A doorless doorway, the other dfeature_at() branch this
                // port reaches, looked at twice so the repeated message
                // is covered too.
                moves: 'h::',
            },
            {
                seed: 51001,
                datetime: '20320405060708',
                nethackrc: nethackrc({
                    name: 'BObj',
                    role: 'Healer',
                    options: '!autopickup,pettype:none,!acoustics',
                }),
                // A square holding exactly one object, which look_here()
                // describes after the engraving read.
                moves: 'l:',
            },
            // The inventory display, which also consumes no game time. Role
            // decides the starting pack, so each of these formats a different
            // set of doname() suffixes.
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Worn armor and a wielded long sword, dismissed with Escape.
                moves: 'i\u001b.',
            },
            {
                seed: 8820002,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'InvRanger',
                    role: 'Ranger',
                    gender: 'male',
                    options: 'pettype:none,!acoustics',
                }),
                // A Ranger carries quivered arrows and an alternate weapon,
                // which are the other two owornmask phrases.
                moves: 'i\u001b.',
            },
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Two menus in a row, then a look, so a redrawn menu and the
                // restored map are both compared.
                moves: 'i\u001bi\u001b:',
            },
            {
                seed: 8830001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'InvRogue',
                    role: 'Rogue',
                    align: 'chaotic',
                    options: 'pettype:none,!acoustics',
                }),
                // A Rogue's empty sack exercises the "empty" prefix, and the
                // Space dismissal is the other way out of a one-page menu.
                moves: 'i .',
            },
            {
                seed: 8840001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'InvTourist',
                    role: 'Tourist',
                    options: 'pettype:none,!acoustics',
                }),
                // This Tourist carries a tin, which names its contents
                // through eat.c tin_details().
                moves: 'i\u001b.',
            },
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // A Valkyrie carries no spellbook, so `+` reaches
                // dovspell()'s empty answer and consumes no time.
                moves: '.+.',
            },
            // The known-spell list `+` opens for the four roles whose starting
            // inventory contains a spellbook. Every one of these turns off
            // menu_headings: with the default ATR_INVERSE, dospellmenu()'s
            // column heading begins with four highlighted spaces, and the
            // judge's Terminal.serialize() drops every attribute before a
            // row's first non-space cell while record-session.mjs keeps a
            // space run shorter than five. No implementation can reconcile
            // those two encodings, so the option keeps the matrix on the
            // behavior rather than the encoding.
            {
                seed: 8860001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SpellHeal',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics,menu_headings:none',
                }),
                // A Healer starts with three spellbooks, so dospellmenu()
                // keeps PICK_ONE and appends the [sort spells] entry. Two of
                // the three rows exercise percent_success()'s isqrt() branch.
                moves: '.+\u001b.',
            },
            {
                seed: 8860011,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SpMonk',
                    role: 'Monk',
                    gender: 'male',
                    options: 'pettype:none,!acoustics,menu_headings:none',
                }),
                // A Monk starts with exactly one spellbook, so spellid(1) is
                // NO_SPELL and the menu becomes PICK_NONE with no sort entry.
                // The second '+' is a selector-free key that a display-only
                // menu answers with a bell.
                moves: '.++\u001b.',
            },
            {
                seed: 8860021,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SpPriest',
                    role: 'Priest',
                    gender: 'male',
                    align: 'chaotic',
                    options: 'pettype:none,!acoustics,menu_headings:none',
                }),
                // A Priest's two random spellbooks are drawn from the level
                // one to three range, so the list covers spells outside the
                // healing school and the spelheal bonus.
                moves: '.+\u001b.',
            },
            {
                seed: 8860031,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SpWiz',
                    role: 'Wizard',
                    gender: 'male',
                    align: 'chaotic',
                    options: 'pettype:none,!acoustics,menu_headings:none',
                }),
                // A Wizard wields a quarterstaff and wears a cloak that is
                // not a robe, the other two percent_success() equipment
                // branches a starting hero reaches. Space is the other way
                // out of a one-page menu.
                moves: '+ .',
            },
            // The discoveries list, `\`, which also consumes no game time.
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // A Valkyrie's 51 lines fill three pages, so walking through
                // them answers two mid-list --More-- prompts before the
                // closing one. The trailing wait shows that none of it spent
                // game time.
                moves: '.\\  \u001b.',
            },
            {
                seed: 8850001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'DiscoHealer',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                // A Healer's 15 lines fit one page, and its pack spans armor,
                // spellbooks, potions, and a wand, so the class walk writes
                // several headings. Space is one of the two ways out of the
                // closing --More--.
                moves: '\\ .',
            },
            {
                seed: 8850002,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'DiscoWizard',
                    role: 'Wizard',
                    gender: 'male',
                    align: 'chaotic',
                    options: 'pettype:none,!acoustics',
                }),
                // A Wizard's 35 lines fill two pages: Space advances to the
                // second and Escape, the other dismissal, ends it. The second
                // `\` then checks that the first one's repair restored the
                // map underneath.
                moves: '\\ \u001b\\\u001b.',
            },
            {
                seed: 8850003,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    // A longer name pushes the welcome line onto a second
                    // terminal row, whose more() would swallow the first key.
                    name: 'Samu',
                    role: 'Samurai',
                    gender: 'male',
                    align: 'lawful',
                    options: 'pettype:none,!acoustics',
                }),
                // A Samurai treats the Japanese-named types as discovered,
                // which is the branch where interesting_to_discover() answers
                // TRUE without a description and disco_typename() appends the
                // English name in brackets. Escape at the first of its four
                // pages abandons the rest, the cancelled-window path.
                moves: '\\\u001b.',
            },
            // The attributes window, `^X`, the last of the four no-time
            // display commands. Each of these varies what
            // background_enlightenment(), basics_enlightenment(),
            // characteristics_enlightenment(), and status_enlightenment()
            // find to report.
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'AttrValk',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Two elapsed turns before the window, so
                // background_enlightenment() writes "entered the dungeon 2
                // turns ago" rather than "just started your adventure", and
                // the 04:05 clock makes it nighttime. Escape leaves the first
                // of the two pages; the trailing wait shows no turn passed.
                moves: '.\u0018\u001b.',
            },
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'AttrValk',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Space reaches the second page, which holds the rest of the
                // characteristics, the whole Status section, and the elapsed
                // playing time. Escape then abandons the window.
                moves: '\u0018 \u001b',
            },
            {
                seed: 8840001,
                datetime: '20260401090000',
                nethackrc: nethackrc({
                    name: 'AttrTour',
                    role: 'Tourist',
                    options: 'pettype:none,!acoustics',
                }),
                // A Tourist starts with gold, so the wallet line counts
                // zorkmids instead of reporting an empty wallet, and the
                // role's absent feminine title makes the role line say
                // "female human Tourist". The second Space commits the last
                // page with nothing selected, the other way out of the menu.
                moves: '.\u0018  .',
            },
            {
                seed: 772002,
                datetime: '20251103120000',
                nethackrc: nethackrc({
                    name: 'AttrHeal',
                    role: 'Healer',
                    race: 'gnome',
                    gender: 'male',
                    options: 'pettype:none,!acoustics',
                }),
                // A gnome's racial limits differ from a human's, so
                // one_characteristic() appends "(current; limit:...)" to
                // three of the six lines, and a Healer's larger energy pool
                // takes basics_enlightenment()'s "all N" branch.
                moves: '\u0018 \u001b',
            },
            {
                seed: 773003,
                datetime: '20250901000030',
                nethackrc: nethackrc({
                    name: 'AttrRog',
                    role: 'Rogue',
                    race: 'orc',
                    gender: 'male',
                    align: 'chaotic',
                    options: 'pettype:none,!acoustics',
                }),
                // Half a minute past midnight reaches the midnight line
                // ahead of the nighttime one, and a chaotic hero names the
                // lawful and neutral deities in the opposed-pantheon list.
                moves: '\u0018 \u001b',
            },
            {
                seed: 771001,
                datetime: '20250613235930',
                nethackrc: nethackrc({
                    name: 'AttrArch',
                    role: 'Archeologist',
                    race: 'dwarf',
                    align: 'lawful',
                    options: 'pettype:none,!acoustics',
                }),
                // Friday the 13th under a full moon writes both environment
                // lines. The two leading Spaces answer the start-up
                // --More-- prompts those two events add.
                moves: '  \u0018 \u001b',
            },
            {
                seed: 8860011,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'AttrMonk',
                    role: 'Monk',
                    gender: 'male',
                    align: 'lawful',
                    options: 'pettype:none,!acoustics',
                }),
                // A Monk wields nothing and wears gloves, so weapon_insight()
                // reports empty_handed() and then names the martial-arts
                // skill rather than a weapon's.
                moves: '  \u0018 \u001b',
            },
            {
                seed: 781011,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'AttrNude',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics,nudist',
                }),
                // The nudist conduct starts the hero with no armor, which is
                // the only way a fresh character reaches
                // status_enlightenment()'s closing 'nudity' report.
                moves: '  \u0018 \u001b',
            },
        ],
    }, 'no-time commands recipe');
}

export async function runNoTimeCommandsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'no-time commands',
            recipe: loadNoTimeCommandsRecipe(),
        }],
        summaryLabel: 'NO-TIME COMMANDS',
    });
}

runMatrixCli(import.meta.url, runNoTimeCommandsMatrix, 'no-time commands');
