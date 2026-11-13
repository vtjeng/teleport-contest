import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, MON_FLOOR, ROWNO } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import {
    m_at,
    newMonster,
    place_monster,
    place_monster_async,
    relocate_monster,
    remove_monster,
} from '../js/monst.js';
import { NON_PM, PM_NEWT } from '../js/monsters.js';

function levelState() {
    return { level: new GameMap() };
}

test('GameMap starts with an empty source-sized monster coordinate index', () => {
    const state = levelState();
    assert.equal(state.level.monsters.length, COLNO);
    assert.equal(state.level.monsters[0].length, ROWNO);
    // This arbitrary interior square checks the initial null entry.
    assert.equal(m_at(10, 5, state), null);
});

test('GameMap coordinate grids do not alias rows or location cells', () => {
    const state = levelState();
    assert.notEqual(state.level.locations[0], state.level.locations[1]);
    assert.notEqual(state.level.locations[0][0], state.level.locations[0][1]);
    assert.notEqual(state.level.objects[0], state.level.objects[1]);
    assert.notEqual(state.level.monsters[0], state.level.monsters[1]);
});

test('newMonster creates independent zeromonst-shaped mutable state', () => {
    const first = newMonster();
    const second = newMonster();

    assert.equal(first.nmon, null);
    assert.equal(first.data, null);
    assert.equal(first.mhp, 0);
    assert.equal(first.mcanmove, false);
    assert.equal(first.minvent, null);
    assert.equal(first.mextra, null);
    assert.equal(first.mstate, MON_FLOOR);
    assert.equal(first.mtrack.length, 4);
    first.mtrack[0].x = 7;
    first.mgoal.x = 9;
    assert.equal(second.mtrack[0].x, 0);
    assert.equal(second.mgoal.x, 0);
});

test('place_monster owns the coordinate index and remove_monster clears it', () => {
    const state = levelState();
    const monster = newMonster({ mhp: 3, mstate: 99 });

    assert.equal(place_monster(monster, 10, 5, state), monster);
    assert.equal(m_at(10, 5, state), monster);
    assert.deepEqual([monster.mx, monster.my, monster.mstate], [10, 5, 0]);
    assert.equal(remove_monster(10, 5, state), monster);
    assert.equal(m_at(10, 5, state), null);
    // Like the source macro, removal does not change the monster itself.
    assert.deepEqual([monster.mx, monster.my, monster.mstate], [10, 5, 0]);
});

test('place_monster reports bad placements as steed.c does and goes on', async () => {
    // A real game supplies minimal_monnam()'s species names and
    // describe_level()'s "Dlvl:1 " (botl.c's %-2d leaves the space before
    // the question mark).
    await runSegment({
        seed: 6102231,
        datetime: '20300610120000',
        nethackrc: 'OPTIONS=name:Placer,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '',
    });
    const lines = [];
    const capture = async (text) => { lines.push(text); };
    const env = { message: capture, urgentMessage: capture };
    const newt = (fields = {}) => newMonster({
        data: game.mons[PM_NEWT], mhp: 1, cham: NON_PM, ...fields,
    });
    // <40,10> and <41,10> are two arbitrary squares inside the 80x21 map,
    // away from column 0 and row 0; neither needs to be a room square.
    const first = newt();
    await place_monster_async(first, 40, 10, game, env);
    assert.deepEqual(lines, []);

    // steed.c:921-927: an occupied square is reported, then overwritten.
    const second = newt();
    await place_monster_async(second, 40, 10, game, env);
    assert.equal(lines[0], 'placing newt <0,0> over newt <40,10> at <40,10>,'
        + ' mstates:0 0 on Dlvl:1 ?');
    assert.equal(lines[1], 'Program in disorder!  (Saving and reloading may fix this problem.)');
    assert.equal(m_at(40, 10, game), second);
    assert.deepEqual([first.mx, first.my], [40, 10]);

    // steed.c:906-912: off the map (column 90 is past COLNO 80), the
    // monster goes to <0,0>.
    lines.length = 0;
    const third = newt();
    await place_monster_async(third, 90, 5, game, env);
    assert.equal(lines[0], 'trying to place newt <0,0> at <90,5> mstate:0 on Dlvl:1 ');
    assert.deepEqual([third.mx, third.my], [0, 0]);

    // steed.c:913-920: a dead monster (mhp 0) is not placed.
    lines.length = 0;
    const dead = newt({ mhp: 0 });
    await place_monster_async(dead, 41, 10, game, env);
    assert.equal(lines[0], 'placing defunct monster onto map, mstate:0, on Dlvl:1 ?');
    assert.equal(m_at(41, 10, game), null);

    // The synchronous form records the unprinted report and still places.
    const fourth = newt();
    assert.equal(place_monster(fourth, 40, 10, game), fourth);
    assert.equal(m_at(40, 10, game), fourth);
    assert.ok(game.unported.has('pline.c impossible'));
});

test('place_monster retains the source vault-guard parking exception', () => {
    const state = levelState();
    const guard = newMonster({ isgd: true });

    place_monster(guard, 0, 0, state);
    assert.equal(m_at(0, 0, state), guard);
});

test('same-square relocation leaves the monster index and track untouched', () => {
    const state = levelState();
    const track = Array.from({ length: 4 }, (_, index) => ({
        // Distinct nonzero coordinates make any track clearing visible.
        x: index + 1,
        y: index + 5,
    }));
    const monster = newMonster({ mhp: 3, mtrack: track });
    place_monster(monster, 10, 5, state);

    assert.equal(relocate_monster(monster, 10, 5, state), monster);
    assert.equal(m_at(10, 5, state), monster);
    assert.equal(monster.mtrack, track);
    assert.deepEqual(monster.mtrack, [
        { x: 1, y: 5 },
        { x: 2, y: 6 },
        { x: 3, y: 7 },
        { x: 4, y: 8 },
    ]);
});
