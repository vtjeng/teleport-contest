import assert from 'node:assert/strict';
import test from 'node:test';

import { GLYPH_INVISIBLE, glyph_is_invisible } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { NO_COLOR } from '../js/terminal.js';
import {
    loadInvisibleMonsterMarkerRecipe,
    MARKER_DATETIME,
    MARKER_RC,
} from './run-invisible-monster-marker.mjs';

test('the invisible-monster-marker matrix carries replay inputs only', () => {
    const recipe = loadInvisibleMonsterMarkerRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 5);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.equal(segment.datetime, MARKER_DATETIME);
        assert.equal(segment.nethackrc, MARKER_RC);
        // One key, repeated: `rest_on_space` makes <space> the wait command
        // and it doubles as the --More-- dismissal, so nothing else is
        // pressed and no row can be reading a different command's behavior.
        assert.match(segment.moves, /^ +$/u);
    }
    // The seed list is the tripwire for a silent re-recording.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [4310041, 4310374, 4310059, 4310392, 4310201],
    );
    assert.deepEqual(
        recipe.segments.map(({ moves }) => moves.length),
        [11, 14, 40, 40, 40],
    );
    // The two options that make a one-key replay possible.
    assert.match(MARKER_RC, /rest_on_space,!safe_wait/u);
});

// Every square whose map memory holds GLYPH_INVISIBLE, as "x,y" strings. C
// stores the marker in levl[x][y].glyph, so this is the whole of what the
// hero remembers about an unspotted monster.
function markedSquares() {
    const found = [];
    for (let x = 0; x < game.level.locations.length; ++x) {
        for (let y = 0; y < (game.level.locations[x]?.length ?? 0); ++y) {
            const location = game.level.at(x, y);
            if (glyph_is_invisible(location?.remembered_glyph?.glyph))
                found.push(`${x},${y}`);
        }
    }
    return found.sort();
}

// One row per segment, in recipe order, read off the fresh C recording
// `node scripts/run-invisible-monster-marker.mjs` makes, which passed with
// 5 segments, 17733 PRNG calls, 150 screens and 150 cursors.
//
// `fight` is the step whose message line names the blow that writes the
// marker, `fightLine` is that line, and `lastLine` is the top line the segment
// ends on. `marked` is the set of squares the hero still remembers a monster
// on when the keys run out; the two rows whose defender dies to the blow that
// marked it end with none, because mon.c mondead():3170-3171 forgets the
// square as the monster leaves it.
const ROWS = [
    {
        fight: 11,
        fightLine: 'The kitten bites it.',
        lastLine: 'The kitten bites it.',
        marked: [],
    },
    {
        fight: 12,
        fightLine: 'The kitten misses it.',
        lastLine: 'The kitten misses it.',
        marked: ['65,13'],
    },
    {
        fight: 24,
        fightLine: 'It bites the newt.  The newt is killed!',
        lastLine: 'It bites the newt.  The newt is killed!',
        marked: ['27,11'],
    },
    {
        fight: 19,
        fightLine: 'The little dog bites it.',
        lastLine: 'The little dog picks up a gold piece.',
        marked: [],
    },
    {
        fight: 36,
        fightLine: 'The kitten misses it.  The kitten drops a looking glass.',
        lastLine: 'The kitten bites the newt.  The newt is killed!',
        marked: ['60,4'],
    },
];

test('every marked fight writes, keeps or forgets its square', async () => {
    const recipe = loadInvisibleMonsterMarkerRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        const row = ROWS[index];
        const label = `segment ${index} (seed ${segment.seed})`;

        const replay = await runSegment(segment);
        // The port emits one screen per consumed key plus the opening prompt.
        // A segment that stopped early would emit fewer, and stopping early is
        // what an unported arm inside pre_mm_attack() would cause.
        assert.equal(replay.getScreens().length, segment.moves.length + 1,
                     `${label} replays every key`);

        // pline.c writes gt.toplines whether or not the row was repainted.
        assert.equal(game._ttyToplines ?? '', row.lastLine,
                     `${label} last line`);
        assert.deepEqual(markedSquares(), row.marked, `${label} marked`);
        // x_monnam()'s do_it arm names the unspottable combatant "it", on the
        // step that writes the marker. js/terminal.js serializes to the empty
        // string outside the scoring workspace, so the line is read from
        // gt.toplines after a replay truncated to that step rather than from
        // the screen the port drew.
        await runSegment({
            ...segment, moves: segment.moves.slice(0, row.fight),
        });
        assert.equal(game._ttyToplines ?? '', row.fightLine,
                     `${label} step ${row.fight}`);
    }
});

test('a remembered marker resolves to a plain I', async () => {
    // display.c reset_glyphmap():3029-3035 over defsym.h:336's byte and
    // invis_color()'s NO_COLOR. The screen the recording compares against is
    // what really pins this; the assertion here names the cell so a change to
    // the symbol or the colour reads as one failure rather than as a screen
    // diff.
    const recipe = loadInvisibleMonsterMarkerRecipe();
    // The second row is the one whose marker is still standing at the end.
    const segment = recipe.segments[1];
    await runSegment(segment);
    const marked = markedSquares();
    assert.deepEqual(marked, ['65,13']);
    const [x, y] = marked[0].split(',').map(Number);
    const location = game.level.at(x, y);
    assert.equal(location.remembered_glyph.glyph, GLYPH_INVISIBLE);
    assert.equal(location.disp_ch, 'I');
    assert.equal(location.disp_color, NO_COLOR);
    assert.equal(location.disp_attr, 0);
});
