#!/usr/bin/env node

// Record and replay the #enhance command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// weapon.c enhance_weapon_skill() reads no map and draws no random number, so
// the level a seed generates decides nothing here. What the listing looks like
// comes from the hero's role, through the def_skill[] table u_init.c
// skill_init() copies into u.weapon_skills[]: the role decides which skills
// are restricted, which the menu therefore omits, and how wide the name column
// has to be. The cases below vary the role for that reason and vary the seed
// only so that no two of them share a level.
//
// The three shapes the role produces, and what each is here for:
//
// - A listing short enough for one page ends with tty_end_menu()'s "(end)"
//   footer and, because maxrow stays under the terminal height, opens as a
//   corner window rather than covering the map.
// - A longer listing pages, so the footer counts pages and the window is
//   full screen. One case turns to the second page before dismissing.
// - Whether skill_ranges[]'s first entry is restricted decides nothing about
//   the heading: add_skills_to_menu() writes it at :1254-1255, above the
//   P_RESTRICTED() test at :1257-1258. Monk reaches that ordering under
//   "Weapon Skills", whose P_DAGGER it restricts, and Healer and Tourist
//   reach it under "Spellcasting Skills", whose P_ATTACK_SPELL they restrict.
//
// Two arms no case here can reach, both refused by js/weapon.js: the whole
// advancement half, which needs a hero who has practised a skill far enough
// to advance it, and every wizard-only branch, which needs OPTIONS=playmode.
// scripts/enhance-command.test.mjs pins both refusals instead.

import { P_ATTACK_SPELL, P_DAGGER, P_NUM_SKILLS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { P_RESTRICTED } from '../js/startup_skills.js';
import { P_NAME, add_skills_to_menu } from '../js/weapon.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20310203040506';
const WAIT = '.';
// cmd.c extcmdlist[] binds '#' to doextcmd(); "enhance" names the M-e row at
// cmd.c:1716. The port admits the command from the typed name only, so the
// keystroke that opens the menu is the Return that submits it.
const ENHANCE = '#enhance\n';
// wintty.c process_menu_window():1604 cancels the menu on Escape.
const ESCAPE = '\x1B';
// wintty.c process_menu_window():1622, the MENU_NEXT_PAGE accelerator. Its
// case is shared with ' ', which turns the page too but also finishes the
// menu once there is no page left to turn to.
const NEXT_PAGE = '>';

// tty_end_menu() caps a page at the smaller of 52 accelerators and every
// terminal row but the footer's, which on a 24-row tty is 23.
const PAGE_SIZE = 23;
// menuLines() puts end_menu()'s prompt and its blank separator ahead of the
// listing, and tty_end_menu() counts pages over all of them.
const PROMPT_LINES = 2;

// The heading add_skills_to_menu() opens each skill_ranges[] block with, in
// weapon.c:1219-1221 order. Every role reaches all three, because C writes a
// heading whether or not the block below it holds an unrestricted skill.
const HEADINGS = ['Fighting Skills', 'Weapon Skills', 'Spellcasting Skills'];

// The listing add_skills_to_menu() would build for the hero the port is
// holding, which is what the recorded menu screen shows.
function listing() {
    return add_skills_to_menu(game);
}

// weapon.c:1238-1243. The name column is as wide as the longest unrestricted
// skill name, so it varies with the role rather than being fixed.
function longestSkillName() {
    let longest = 0;
    for (let i = 0; i < P_NUM_SKILLS; i++) {
        if (P_RESTRICTED(i, game)) continue;
        longest = Math.max(longest, P_NAME(i, game).length);
    }
    return longest;
}

// `arm` names the weapon.c or wintty.c line the case is here for, and
// `reaches` restates that line's condition against the live hero rather than
// against a remembered observation. `pages` is what tty_end_menu() will split
// the listing into, which decides both the footer and whether the window
// covers the map.
export const CASES = [
    // One page: 15 skills plus three headings and the two prompt lines is 20,
    // under tty_end_menu()'s 23, so the footer reads "(end)" and the window
    // fits beside the map. Monk also restricts P_DAGGER, which is
    // skill_ranges[1].first, so "Weapon Skills" opens above a skill C skipped.
    { label: 'monk-one-page', seed: 5510001, role: 'Monk',
      arm: 'weapon.c:1254 heading above a restricted skill_ranges[].first',
      dismiss: ESCAPE, pages: 1, longest: 18,
      reaches: () => P_RESTRICTED(P_DAGGER, game) },
    // wintty.c:1621-1629. Space shares MENU_NEXT_PAGE's case and finishes the
    // menu only once there is no page left to turn to, which for a one-page
    // listing is immediately.
    { label: 'monk-space-dismissal', seed: 5510002, role: 'Monk',
      arm: 'wintty.c:1628 space finishes the last page',
      dismiss: ' ', pages: 1, longest: 18,
      reaches: () => P_RESTRICTED(P_DAGGER, game) },
    // windows.c add_menu_heading():1819-1820 takes iflags.menu_headings, and
    // allmain.c adjust_menu_promptstyle() hands the same style to
    // end_menu()'s prompt. Every other case leaves it at its ATR_INVERSE
    // default, so only this one separates the style from the default.
    { label: 'monk-bold-headings', seed: 5510003, role: 'Monk',
      arm: 'windows.c:1819 iflags.menu_headings',
      dismiss: ESCAPE, pages: 1, longest: 18,
      options: ['menu_headings:bold'],
      reaches: () => P_RESTRICTED(P_DAGGER, game) },
    // wintty.c tty_display_nhwindow():1924-1925 zeroes offx when
    // iflags.menu_overlay is off, so the same one-page listing covers the map
    // instead of opening beside it. Every other case leaves it at its default.
    { label: 'monk-no-overlay', seed: 5510011, role: 'Monk',
      arm: 'wintty.c:1925 !iflags.menu_overlay',
      dismiss: ESCAPE, pages: 1, longest: 18,
      options: ['!menu_overlay'],
      reaches: () => P_RESTRICTED(P_DAGGER, game) },
    // Healer restricts P_ATTACK_SPELL, which is skill_ranges[2].first, and
    // leaves exactly one spell skill unrestricted, so "Spellcasting Skills"
    // opens above a skipped skill and closes after a single entry.
    { label: 'healer-restricted-first-spell', seed: 5510004, role: 'Healer',
      arm: 'weapon.c:1254 heading above a restricted skill_ranges[].first',
      dismiss: ESCAPE, pages: 1, longest: 18,
      reaches: () => P_RESTRICTED(P_ATTACK_SPELL, game) },
    // Tourist has the longest listing of any role: 32 skills, three headings
    // and the prompt pair come to 37 lines, so the menu pages and covers the
    // map. Escape leaves it on the first page.
    { label: 'tourist-two-pages', seed: 5510010, role: 'Tourist',
      arm: 'wintty.c tty_end_menu() page split',
      dismiss: ESCAPE, pages: 2, longest: 18,
      reaches: () => P_RESTRICTED(P_ATTACK_SPELL, game) },
    // The same listing, turned to its second page first. Only this case draws
    // the tail of the listing and the "(2 of 2)" footer.
    { label: 'tourist-second-page', seed: 5510006, role: 'Tourist',
      arm: 'wintty.c:1622 MENU_NEXT_PAGE',
      dismiss: `${NEXT_PAGE}${ESCAPE}`, pages: 2, longest: 18,
      reaches: () => P_RESTRICTED(P_ATTACK_SPELL, game) },
    // A second two-page role, with an unrestricted skill_ranges[].first in
    // all three blocks, so no heading here stands above a skipped skill.
    { label: 'valkyrie-two-pages', seed: 5510007, role: 'Valkyrie',
      gender: 'female',
      arm: 'weapon.c:1257 unrestricted skill_ranges[].first',
      dismiss: ESCAPE, pages: 2, longest: 18,
      reaches: () => !P_RESTRICTED(P_DAGGER, game)
          && !P_RESTRICTED(P_ATTACK_SPELL, game) },
    // The Wizard role, not debug mode. It leaves all seven spell skills
    // unrestricted, the widest "Spellcasting Skills" block any role has.
    { label: 'wizard-role-spell-skills', seed: 5510008, role: 'Wizard',
      arm: 'weapon.c:1249 skill_ranges[2] pass',
      dismiss: ESCAPE, pages: 2, longest: 18,
      reaches: () => !P_RESTRICTED(P_ATTACK_SPELL, game) },
    // Every case above pads the name column to 18. Samurai reaches neither
    // 18-character name: skills.h martial_bonus() renames P_BARE_HANDED_COMBAT
    // to "martial arts" for it, and it restricts P_ENCHANTMENT_SPELL, so its
    // widest name is "two weapon combat" and the whole listing shifts left.
    { label: 'samurai-narrow-column', seed: 5510009, role: 'Samurai',
      align: 'lawful',
      arm: 'weapon.c:1238-1243 longest',
      dismiss: ESCAPE, pages: 2, longest: 17,
      reaches: () => longestSkillName() === 17 },
];

// pettype:none keeps a pet off the map, so no pet move competes for the top
// line while the menu is open or while the trailing waits run.
function nethackrc(entry) {
    return [
        `OPTIONS=name:Probe,role:${entry.role},race:human,`
        + `gender:${entry.gender ?? 'male'},align:${entry.align ?? 'neutral'}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none',
        ...(entry.options ?? []).map((option) => `OPTIONS=${option}`),
        '',
    ].join('\n');
}

// Wait, enhance, dismiss the menu, then wait twice more. enhance_weapon_skill()
// returns ECMD_OK, so a move wrongly spent by the command moves every later
// turn into a compared screen; the trailing waits are what make that visible.
// The verifier replays the same segment with `trailing` at 0 to read the move
// counter the command itself left behind.
function segment(entry, trailing = 2) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc(entry),
        moves: `${WAIT}${ENHANCE}${entry.dismiss}${WAIT.repeat(trailing)}`,
    };
}

export function loadEnhanceCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CASES.map((entry) => segment(entry)),
    });
}

// The recipe carries replay inputs only, so a segment is matched back to its
// case by the seed it starts from, which no two cases share.
export function caseFor(recipeSegment) {
    const found = CASES.find((entry) => entry.seed === recipeSegment.seed);
    if (!found)
        throw new Error(`no case starts from seed ${recipeSegment.seed}`);
    return found;
}

export async function verifyEnhanceCommandSegment(recipeSegment) {
    const entry = caseFor(recipeSegment);

    // Stop at the Enter that submits the command, so the hero is the one the
    // case describes and enhance_weapon_skill() has not run yet.
    await runSegment({ ...recipeSegment, moves: `${WAIT}#enhance` });
    if (!entry.reaches())
        throw new Error(`${entry.label} does not reach ${entry.arm}`);

    const lines = listing();
    const headings = lines.filter((line) => line.heading).map((l) => l.text);
    if (headings.join('|') !== HEADINGS.join('|')) {
        throw new Error(
            `${entry.label} wrote headings ${JSON.stringify(headings)}`,
        );
    }
    const pages = Math.ceil((PROMPT_LINES + lines.length) / PAGE_SIZE);
    if (pages !== entry.pages)
        throw new Error(`${entry.label} fills ${pages} pages, not ${entry.pages}`);
    const longest = longestSkillName();
    if (longest !== entry.longest) {
        throw new Error(
            `${entry.label} pads names to ${longest}, not ${entry.longest}`,
        );
    }
    const movesBefore = game.moves;

    // enhance_weapon_skill() ends `return ECMD_OK`, so rhack() resets the
    // command variables and the hero's move counter must not have advanced.
    await runSegment(segment(entry, 0));
    if (game.moves !== movesBefore)
        throw new Error(`${entry.label} spent a move`);
}

export async function runEnhanceCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'enhance skills menu', recipe: loadEnhanceCommandRecipe() },
        ],
        summaryLabel: 'ENHANCE COMMAND',
        verifySegment: verifyEnhanceCommandSegment,
    });
}

runMatrixCli(import.meta.url, runEnhanceCommandMatrix, 'enhance command');
