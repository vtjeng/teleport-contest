import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GameMap } from '../js/game.js';
import { COLNO, ROWNO, ROOM, HWALL, W_NONDIGGABLE, W_NONPASSWALL } from '../js/const.js';
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

test('bound_digging distinguishes the interior, boundary, and outer stone', () => {
    const level = new GameMap();
    level.at(10, 5).typ = ROOM;
    level.at(20, 10).typ = ROOM;
    level.at(8, 7).wall_info = 1; // existing wall orientation survives.
    maze.bound_digging({ level });
    assert.equal(level.at(11, 7).wall_info, 0, 'interior stone stays phaseable');
    assert.equal(level.at(9, 7).wall_info, W_NONDIGGABLE, 'boundary stays phaseable');
    assert.equal(level.at(8, 7).wall_info, 1 | W_NONDIGGABLE | W_NONPASSWALL);
    assert.equal(level.at(15, 3).wall_info, W_NONDIGGABLE | W_NONPASSWALL);
    assert.equal(level.at(15, 12).wall_info, W_NONDIGGABLE | W_NONPASSWALL);
    assert.equal(level.at(22, 7).wall_info, W_NONDIGGABLE | W_NONPASSWALL);
    assert.equal(level.at(10, 5).wall_info, 0, 'nonstone terrain is unchanged');
});

test('bound_digging leaves Earth terrain and existing wall flags untouched', () => {
    const level = new GameMap();
    level.at(10, 5).typ = ROOM;
    level.at(20, 10).typ = ROOM;
    level.at(8, 7).wall_info = 1;
    const state = {level, u: {uz: {dnum: 7, dlevel: 1}},
        earth_level: {dnum: 7, dlevel: 1}};
    maze.bound_digging(state);
    assert.equal(level.at(8, 7).wall_info, 1);
    assert.equal(level.at(9, 7).wall_info, 0);
    assert.equal(level.at(22, 7).wall_info, 0);
    state.u.uz.dlevel = 2;
    maze.bound_digging(state);
    assert.equal(level.at(22, 7).wall_info, W_NONDIGGABLE | W_NONPASSWALL);
});
