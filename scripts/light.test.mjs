import assert from 'node:assert/strict';
import test from 'node:test';

import { FM_FMON, FM_MIGRATE, FM_MYDOGS, FM_YOU } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { find_mid, whereis_mon } from '../js/light.js';

test('find_mid searches requested lists in C order and ignores dead local monsters', () => {
    // light.c:376-397 checks the hero, local monsters, migrating monsters,
    // then mydogs. Only the local fmon list filters DEADMONSTER.
    const hero = { m_id: 1 };
    const dead = { m_id: 7, mhp: 0 };
    const live = { m_id: 8, mhp: 1 };
    dead.nmon = live;
    const migrating = { m_id: 7 };
    const dog = { m_id: 9 };
    const state = {
        youmonst: hero,
        level: new GameMap(),
        gm: { migrating_mons: migrating, mydogs: dog },
    };
    state.level.monlist = dead;

    assert.equal(find_mid(1, FM_YOU, state), hero);
    assert.equal(find_mid(8, FM_FMON, state), live);
    assert.equal(find_mid(7, FM_FMON | FM_MIGRATE, state), migrating);
    assert.equal(find_mid(9, FM_MYDOGS, state), dog);
    assert.equal(find_mid(99, FM_FMON | FM_MIGRATE | FM_MYDOGS, state), null);
});

test('whereis_mon names the requested list holding the monster, dead or not', () => {
    // light.c:397-417 checks the hero, fmon, migrating monsters, then mydogs,
    // comparing pointers; unlike find_mid() it keeps a DEADMONSTER on fmon.
    const hero = {};
    const dead = { m_id: 7, mhp: 0 };
    const migrating = { m_id: 8 };
    const dog = { m_id: 9 };
    const stray = { m_id: 10 };
    const state = {
        youmonst: hero,
        level: new GameMap(),
        gm: { migrating_mons: migrating, mydogs: dog },
    };
    state.level.monlist = dead;
    const everywhere = FM_YOU | FM_FMON | FM_MIGRATE | FM_MYDOGS;

    assert.equal(whereis_mon(hero, everywhere, state), FM_YOU);
    assert.equal(whereis_mon(dead, everywhere, state), FM_FMON);
    assert.equal(whereis_mon(migrating, everywhere, state), FM_MIGRATE);
    assert.equal(whereis_mon(dog, everywhere, state), FM_MYDOGS);
    // A list the flags leave out is not searched, so the result is 0.
    assert.equal(whereis_mon(dog, FM_FMON | FM_MIGRATE, state), 0);
    assert.equal(whereis_mon(stray, everywhere, state), 0);
});
