import assert from 'node:assert/strict';
import test from 'node:test';

import { FM_FMON, FM_MIGRATE, FM_MYDOGS, FM_YOU } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { find_mid } from '../js/light.js';

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
