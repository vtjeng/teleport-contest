import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, MON_FLOOR, ROWNO } from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    m_at,
    newMonster,
    place_monster,
    remove_monster,
} from '../js/monst.js';

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

test('place_monster fails closed for invalid, dead, and occupied placement', () => {
    const state = levelState();
    assert.throws(
        () => place_monster(newMonster({ mhp: 1 }), 0, 5, state),
        /off-map/u,
    );
    assert.throws(
        () => place_monster(newMonster(), 10, 5, state),
        /dead monster/u,
    );

    place_monster(newMonster({ mhp: 1 }), 10, 5, state);
    assert.throws(
        () => place_monster(newMonster({ mhp: 1 }), 10, 5, state),
        /occupied/u,
    );
});

test('place_monster retains the source vault-guard parking exception', () => {
    const state = levelState();
    const guard = newMonster({ isgd: true });

    place_monster(guard, 0, 0, state);
    assert.equal(m_at(0, 0, state), guard);
});
