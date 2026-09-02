import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { glyph_is_invisible } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { sobj_at } from '../js/obj.js';
import { BOULDER } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';

// hack.c moverock_core():455-483, recorded fresh against the C reference. The
// seed was found by mapping dungeon level one over a range of seeds with the
// patched C program and keeping the first whose boulder stands in an unlit
// corridor with clear corridor behind it and a monster already on the square
// past it; nothing here was copied from a recorded session. Direct setup is
// out of reach: the two wizard commands that could place a boulder to order,
// zap.c makewish() and wizard level teleport, are both unported, so a recipe
// built on either records in C and stops on the first key in the port.
//
// `node scripts/diff-fresh.mjs recipes/moverock-monster-behind-boulder.session.json`
// is the differential this test stands in for between recordings: it reports
// strict parity over 2753 random-number calls, 47 screens and 47 cursors.
const RECIPE_PATH = 'recipes/moverock-monster-behind-boulder.session.json';

function loadRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'monster behind the boulder recipe',
    );
}

test('a fresh push into an unseen monster is refused and remembered',
    async () => {
        const recipe = loadRecipe();
        assert.equal(recipe.segments.length, 1);
        // The walk-in is plain movement; the last key before the trailing
        // return is the push, and the return dismisses the --More-- between
        // the branch's two lines.
        assert.match(recipe.segments[0].moves, /l\n$/u);

        let boundary;
        await runSegment(recipe.segments[0], {
            onBoundary: (error) => { boundary = error; },
        });
        assert.equal(boundary, undefined,
                     'the port replays every key of the recipe');

        // u.dx and u.dy still hold the refused push, so the boulder and the
        // monster are one and two squares along it.
        const sx = game.u.ux + game.u.dx;
        const sy = game.u.uy + game.u.dy;
        const rx = sx + game.u.dx;
        const ry = sy + game.u.dy;
        assert.ok(sobj_at(BOULDER, sx, sy, game),
                  'the boulder stayed on the square the hero pushed at');
        assert.ok(m_at(rx, ry, game),
                  'a monster stands where the boulder would have landed');
        // 469 map_invisible(), the one state change the branch makes.
        assert.ok(glyph_is_invisible(
            game.level.at(rx, ry).remembered_glyph?.glyph,
        ), 'the unseen monster left a remembered I behind the boulder');
        // 476-480 with deliver_part1 TRUE. The You_hear() line before it is
        // off the top line by now, behind the --More-- the return dismissed.
        assert.equal(game._ttyToplines,
                     "Perhaps that's why you cannot move it.");
    });
