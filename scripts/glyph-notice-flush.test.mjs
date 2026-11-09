import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow, ttyPline } from '../js/tty_message.js';
import { flush_screen, newsym } from '../js/display.js';
import { emitGlyphUpdateNotices } from '../js/startup_a11y.js';
import { FOUNTAIN, ROOM } from '../js/const.js';

// display.c show_glyph() prints a mention_map notice through pline_xy() at
// once, and vpline() flushes the map as it stands then. A later
// flush_screen() shows the map as it stands later. The port queues the
// notice and prints it afterwards from the frame it saved, so it must repeat
// that later flush, or the screen keeps the notice-time map.
test('a flush after a queued notice is repeated once the notice prints', async () => {
    // Any start works; the hero's own room supplies a floor square.
    await runSegment({ seed: 4410773, datetime: '20280304120000',
        nethackrc: 'OPTIONS=name:Probe,role:Samurai,race:human,gender:male,align:lawful,pettype:none,!legacy,!tutorial,!splash_screen,!tips,mention_map\n', moves: '' });
    clearTtyMessageWindow(game);
    const { ux, uy } = game.u;
    // Two squares east of the hero is floor in this start room.
    const x = ux + 2;
    const y = uy;
    assert.equal(game.level.at(x, y).typ, ROOM);
    // Find the hero's screen cell; the square is two columns east of it.
    let heroCol = -1;
    let heroRow = -1;
    for (let row = 1; row < 22 && heroRow < 0; ++row)
        for (let col = 0; col < 80; ++col)
            if (game.nhDisplay.getChar(col, row) === '@') {
                heroCol = col;
                heroRow = row;
                break;
            }
    const cell = () => game.nhDisplay.getChar(heroCol + 2, heroRow);
    assert.equal(cell(), '.');

    // A fountain appears there: furniture, so show_glyph() announces it.
    game.level.at(x, y).typ = FOUNTAIN;
    newsym(x, y);
    assert.deepEqual(game._glyphUpdateNotices.map((n) => n.message),
        ['(2east): fountain.']);
    // It is floor again before C's next flush, which shows the floor.
    game.level.at(x, y).typ = ROOM;
    newsym(x, y);
    await flush_screen(0);

    await emitGlyphUpdateNotices(game, { pline: ttyPline });
    assert.equal(game.nhDisplay.serialize().split('\n')[0], '(2east): fountain.');
    assert.equal(cell(), '.');
});
