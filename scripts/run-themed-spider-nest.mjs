#!/usr/bin/env node

// Run the checked-in matrix for the giant spider a themed Spider nest puts on
// each of its webs, through fresh C recordings. Every segment contains replay
// inputs only; runFreshMatrix() records new reference output in an isolated
// temporary workspace.
//
// The consumer is mklev.c mktrap():2104-2105, `if (kind == WEB &&
// !(mktrapflags & MKTRAP_NOSPIDERONWEB)) makemon(&mons[PM_GIANT_SPIDER], ...)`,
// reached from themerms.lua's "Spider nest" through sp_lev.c create_trap().
// themerms.lua:89 sets `spooders = nh.level_difficulty() > 8` and then asks for
// a spider on 80% of its webs, so the arm needs dungeon level 9 or deeper.
//
// Wizard mode reaches those levels without a descent: OPTIONS=playmode:debug,
// then Ctrl-V and the destination. Seeds were chosen by generating levels and
// counting the webs each one placed, not by copying any recorded session.

import { WEB } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GIANT_SPIDER } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310417113000';
const LEVELPORT_KEY = '\x16';

// seed -> destination -> [webs, spiders] the destination level generates.
const NESTS = new Map([
    // The gate control. This seed builds the same nest on both levels, so the
    // eleven webs stay bare one level above the threshold and six of them
    // carry a spider one level below it.
    ['86:8', [11, 0]],
    ['86:9', [11, 6]],
    // A smaller nest where the 80% roll came up for every web.
    ['275:9', [4, 4]],
    ['302:12', [6, 6]],
    ['315:15', [14, 11]],
]);

function teleport(key) {
    const [seed, destination] = key.split(':').map(Number);
    return {
        seed,
        datetime: DATETIME,
        nethackrc: [
            'OPTIONS=name:Arrival,role:Wizard,race:human,gender:male,'
            + 'align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!acoustics,playmode:debug',
            '',
        ].join('\n'),
        // The opening wait paints an ordinary D:1 frame; the closing one proves
        // the arrival level accepted another command.
        moves: `.${LEVELPORT_KEY}${destination}\n.`,
    };
}

export function loadThemedSpiderNestRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [...NESTS.keys()].map(teleport),
    }, 'themed spider nest recipe');
}

function nestKey(segment) {
    const destination = new RegExp(`${LEVELPORT_KEY}(\\d+)\\n`, 'u')
        .exec(segment.moves)?.[1];
    return `${segment.seed}:${destination}`;
}

// runFreshMatrix() calls this before the differential, so it replays the
// segment itself; the differential's own JavaScript run happens in a separate
// scoring workspace and leaves nothing behind to read.
export async function verifyThemedSpiderNest(segment) {
    const [webs, spiders] = NESTS.get(nestKey(segment));
    await runSegment(segment);
    const placed = (game.level.traps ?? [])
        .filter((trap) => trap.ttyp === WEB);
    if (placed.length !== webs) {
        throw new Error(
            `${nestKey(segment)} generated ${placed.length} webs, `
            + `expected ${webs}`,
        );
    }
    // mktrap() creates the spider on the web's own square, so each one has to
    // be standing where a web is rather than merely somewhere on the level.
    let onWebs = 0;
    for (let mon = game.level.monlist; mon; mon = mon.nmon) {
        if (mon.data !== game.mons[PM_GIANT_SPIDER]) continue;
        if (placed.some((trap) => trap.tx === mon.mx && trap.ty === mon.my))
            ++onWebs;
    }
    if (onWebs !== spiders) {
        throw new Error(
            `${nestKey(segment)} put ${onWebs} spiders on its webs, `
            + `expected ${spiders}`,
        );
    }
}

export async function runThemedSpiderNestMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'themed spider nest',
            recipe: loadThemedSpiderNestRecipe(),
        }],
        summaryLabel: 'THEMED SPIDER NEST',
        verifySegment: verifyThemedSpiderNest,
        // Level generation consumes one recorder lock per segment, and the
        // installed recorder rejects an eleventh; one at a time keeps each
        // arrival independent of the segment before it.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runThemedSpiderNestMatrix, 'themed spider nest');
