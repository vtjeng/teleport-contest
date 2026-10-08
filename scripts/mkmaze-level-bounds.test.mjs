import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GameMap } from '../js/game.js';
import { COLNO, ROWNO, ROOM, HWALL } from '../js/const.js';
import * as maze from '../js/mkmaze.js';

test('mkmaze.c get_level_extends clamps horizontal bounds before scanning rows', () => {
    const c = readFileSync('nethack-c/upstream/src/mkmaze.c', 'utf8');
    assert.match(c, /if \(xmin < 0\)\s*xmin = 0;/u);
    assert.match(c, /if \(xmax >= COLNO\)\s*xmax = COLNO - 1;/u);
    const level = new GameMap();
    // Opposite map corners expose both C horizontal clamps and the source's
    // deliberately unclamped vertical output (-1 through ROWNO).
    level.at(1, 0).typ = ROOM;
    level.at(COLNO - 1, ROWNO - 1).typ = ROOM;
    assert.deepEqual(maze.get_level_extends({ level }),
        { xmin: 0, xmax: COLNO - 1, ymin: -1, ymax: ROWNO });
});

test('mkmaze.c bounds keep maze wall edges and expand ordinary room edges', () => {
    const level = new GameMap();
    // Two interior room cells make each source nonwall scan expand one square.
    level.at(10, 5).typ = ROOM;
    level.at(20, 10).typ = ROOM;
    assert.deepEqual(maze.get_level_extends({ level }),
        { xmin: 9, xmax: 21, ymin: 4, ymax: 11 });
    level.flags.is_maze_lev = true;
    level.at(10, 5).typ = HWALL;
    level.at(20, 10).typ = HWALL;
    // Maze wall-only scans subtract/add one, retaining the wall coordinates.
    assert.deepEqual(maze.get_level_extends({ level }),
        { xmin: 10, xmax: 20, ymin: 5, ymax: 10 });
});
