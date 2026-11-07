// js/unported_monster_actions.js planningState() gives the monster-turn dry
// run its own copy of the hero and of the level's rooms and subrooms. C's
// struct you holds its d_level, room-string, attribute and history arrays by
// value, so a planned move_update() or level change must not reach the live
// `u`. A planned knockback once wrote the live u.urooms[] and u.uentered[],
// and the live pass then found the morgue already entered and never printed
// "You have an uncanny feeling...". A planned entry into a subroom such as
// Delphi likewise reset the live subroom's rtype. These tests fail when the
// plan shares that state with the live game again.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import {
    PLANNING_HERO_POINTERS,
    copyPlanningHeroData,
    planningState,
} from '../js/unported_monster_actions.js';

// Shared arrays and Object-prototype records between two hero objects.
function sharedRecords(live, planned) {
    return Object.entries(live)
        .filter(([field, value]) => value && typeof value === 'object'
            && (Array.isArray(value)
                || Object.getPrototypeOf(value) === Object.prototype)
            && !PLANNING_HERO_POINTERS.has(field)
            && planned[field] === value)
        .map(([field]) => field);
}

test('a planned hero shares no array or record with the live hero', async () => {
    // An arbitrary started game: seed, date and character only need to reach
    // the first command prompt with every u field initialized.
    await runSegment({ seed: 6120511, datetime: '20261209101500',
        nethackrc: 'OPTIONS=name:PlanCopy,role:Priest,race:elf,gender:female,'
            + 'align:chaotic,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',
        moves: '' });
    const planned = planningState(game);
    assert.deepEqual(sharedRecords(game.u, planned.u), []);
    // The room strings that move_update() rewrites are among the copies.
    for (const field of ['urooms', 'urooms0', 'uentered', 'uz'])
        assert.notEqual(planned.u[field], game.u[field], field);
    assert.deepEqual(planned.u.urooms, game.u.urooms);
});

test('copyPlanningHeroData copies data but keeps level pointers', () => {
    // A stand-in steed and room string: the steed must stay the same object
    // for planningState()'s monster remap, and the array must be a new one
    // with the same contents.
    const steed = { mnum: 1 };
    const hero = { usteed: steed, urooms: [3, 0, 0, 0, 0], ulevel: 7 };
    const copy = copyPlanningHeroData(hero);
    assert.equal(copy.usteed, steed);
    assert.notEqual(copy.urooms, hero.urooms);
    assert.deepEqual(copy.urooms, hero.urooms);
    assert.equal(copy.ulevel, 7);
});

test('a planned level copies each subroom', async () => {
    // A started game whose first room is given one stand-in subroom. Its
    // rtype 7 and roomnoidx 41 are arbitrary: the test checks that the plan
    // holds its own copy and that writing that copy leaves the live one.
    await runSegment({ seed: 6120511, datetime: '20261209101500',
        nethackrc: 'OPTIONS=name:PlanCopy,role:Priest,race:elf,gender:female,'
            + 'align:chaotic,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',
        moves: '' });
    const parent = game.level.rooms[0];
    const subroom = { rtype: 7, roomnoidx: 41, sbrooms: [], nsubrooms: 0 };
    parent.sbrooms = [subroom];
    parent.nsubrooms = 1;
    const planned = planningState(game);
    const plannedSubroom = planned.level.rooms[0].sbrooms[0];
    assert.notEqual(planned.level.rooms[0], parent);
    assert.notEqual(plannedSubroom, subroom);
    plannedSubroom.rtype = 0;
    assert.equal(subroom.rtype, 7);
});
