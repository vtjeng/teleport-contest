#!/usr/bin/env node

// Run the checked-in matrix for a tunneling monster that digs the wall it
// steps onto, through fresh C recordings. Every segment contains replay inputs
// only; runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// Two pieces of monmove.c meet here. m_digweapon_check() (1106-1133) spends
// the whole move having the monster wield a digging tool, which m_move() calls
// at :1988 once it has chosen a destination. postmov()'s `can_tunnel &&
// may_dig()` arm (1643-1645) then hands the square the monster now stands on
// to dig.c mdig_tunnel(), which rewrites the terrain and rolls rnd(12) for the
// rock pile.
//
// Every segment creates one hostile dwarf beside the hero with the wizard-mode
// `^G` command and then walks away from it. The walk is what makes the dig
// happen at all: mon.c mon_allowflags() (2075-2078) drops ALLOW_DIG from a
// hostile monster that needs a pick while dist2() to the hero is 8 or less, so
// a dwarf standing next to the hero prefers its weapon and never tunnels. A
// dwarf moves at speed 6 against the hero's 12, so six steps put the hero out
// of that radius for good, and the remaining searches are the turns in which
// the dwarf wields its tool and digs its way back.
//
// The dwarf's own pack is what selects the arms: makemon.c m_initweap()
// (380-399) gives a dwarf a pick-axe, a dwarvish mattock or neither, so the
// seeds below are the ones whose dwarf carries a digging tool.
//
// Seeds were found by replaying the port alone over 7700001-7700200 with these
// keys and keeping the games where a square that started as wall or stone
// ended as something else, with the hero unharmed and no fail-closed stop.
// Twenty of those two hundred seeds qualified; the five segments below are the
// ones that separate the arms. Not copied from any recorded session.
//
// Two arms have no segment. A cursed digging tool adds weapon.c:906-914's
// second pline, which js/unported_monster_actions.js refuses; `npm run quality
// -- defer` records seed 7700009, whose dwarf carries a cursed mattock, as the
// case that waits on it. mdig_tunnel()'s tree arm needs a tree, and dungeon
// level one grows none.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20240517131415';

// cmd.c binds '^G' to wiz_genesis, which prompts for the species and creates
// it beside the hero. The dwarf is the ordinary tunneler that needs a pick.
const CREATE_DWARF = '\x07dwarf\n';
// Six steps west, then sixteen searches. The steps clear mon_allowflags()'s
// dist2() <= 8 suppression; the searches are the turns the dwarf digs in.
const WALK_AWAY = 'h'.repeat(6);
const WAIT = 's'.repeat(16);

function nethackrc(extra) {
    return [
        'OPTIONS=name:Digger,role:Valkyrie,race:human,gender:female,'
        + 'align:lawful,playmode:debug',
        'OPTIONS=!legacy,!tutorial,!splash_screen,!autopickup,pettype:none,'
        + 'time,showexp',
        ...(extra ? [extra] : []),
        '',
    ].join('\n');
}

function digging({ seed, extra = null }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(extra),
        moves: `${CREATE_DWARF}${WALK_AWAY}${WAIT}`,
    };
}

export function loadMonsterDigRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Nine squares dug with a pick-axe: both of mdig_tunnel()'s
            // reachable terrain arms in one game, with stone becoming corridor
            // and leaving rocks behind, and room walls becoming doorways.
            digging({ seed: 7700164 }),
            // The same pick-axe wield, and the game where mdig_tunnel()'s
            // `flags.verbose && !rn2(5)` lands on 0, so `You hear crashing
            // rock.` is printed.
            digging({ seed: 7700127 }),
            // A dwarvish mattock instead of a pick-axe, which is the other
            // half of weapon.c selectToolWeapon()'s NEED_PICK_AXE arm and the
            // one that reads which_armor(W_ARMS).
            digging({ seed: 7700041 }),
            // The smallest case: one room wall becomes a doorless doorway and
            // nothing else on the map changes.
            digging({ seed: 7700066 }),
            // !verbose. mdig_tunnel() tests it before rn2(5), so this segment
            // is the one where the wall is dug without that draw. The wield
            // line is not verbose-gated and is still printed.
            digging({ seed: 7700164, extra: 'OPTIONS=!verbose' }),
        ],
    }, 'monster dig recipe');
}

export async function runMonsterDigMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster dig',
            recipe: loadMonsterDigRecipe(),
        }],
        // Every segment is a playmode:debug game, and record-session.mjs
        // clears the install directory only before a chunk's first segment, so
        // a second debug segment in one chunk would restore the first game.
        chunkLimit: 1,
        summaryLabel: 'MONSTER DIG',
    });
}

runMatrixCli(import.meta.url, runMonsterDigMatrix, 'monster dig');
