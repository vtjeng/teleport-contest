import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DB_FLOOR,
    DB_LAVA,
    DB_MOAT,
    DRAWBRIDGE_UP,
    ROOM,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_FOG_CLOUD } from '../js/monsters.js';
import {
    UnsupportedRegionCallbackError,
    UnsupportedRegionOperationError,
    add_region,
    create_gas_cloud,
    create_gas_cloud_selection,
    create_region,
    in_out_region,
    inside_gas_cloud,
    m_in_out_region,
    run_regions,
    valid_cloud_pos,
} from '../js/region.js';

function regionState(overrides = {}) {
    return {
        context: { mon_moving: true },
        gg: {},
        iflags: {},
        in_mklev: false,
        level: new GameMap(),
        u: {
            ux: 2,
            uy: 2,
            uinwater: false,
            uswallow: false,
            uprops: {},
            xray_range: 0,
        },
        ...overrides,
    };
}

function pointRegion(x, y, overrides = {}) {
    return Object.assign(
        create_region([{ lx: x, ly: y, hx: x, hy: y }]),
        overrides,
    );
}

function linkMonsters(monsters) {
    for (let index = 0; index < monsters.length; ++index)
        monsters[index].nmon = monsters[index + 1] ?? null;
    return monsters[0] ?? null;
}

test('create_gas_cloud preserves BFS shuffle draws, overlap, and activation order', async () => {
    const state = regionState();
    for (const [x, y] of [
        [10, 9], [9, 10], [10, 10], [11, 10], [10, 11],
    ]) {
        state.level.at(x, y).typ = ROOM;
    }

    const existing = pointRegion(10, 10, {
        inside_f: 'inside_gas_cloud',
        visible: true,
    });
    state.level.regions.push(existing);
    const fog = newMonster({
        m_id: 41,
        mnum: PM_FOG_CLOUD,
        mhp: 8,
        mhpmax: 8,
    });
    place_monster(fog, 10, 10, state);
    state.level.monlist = fog;

    const scripted = [
        [4, 0],
        [3, 0],
        [2, 0],
        [1, 0],
        [3, 0],
    ];
    const draws = [];
    const events = [];
    const messages = [];
    const cloud = await create_gas_cloud(10, 10, 3, 0, {
        state,
        random: {
            rn2(bound) {
                const expected = scripted.shift();
                assert.ok(expected, `unexpected rn2(${bound})`);
                assert.equal(bound, expected[0]);
                draws.push(bound);
                return expected[1];
            },
        },
        blockPoint(x, y) {
            events.push(['block', x, y]);
        },
        canSee(x, y) {
            events.push(['cansee', x, y]);
            return true;
        },
        newsym(x, y) {
            events.push(['newsym', x, y]);
        },
        async message(text) {
            messages.push(text);
        },
    });

    assert.deepEqual(draws, [4, 3, 2, 1, 3]);
    assert.equal(scripted.length, 0);
    assert.deepEqual(cloud.rects, [
        { lx: 10, ly: 10, hx: 10, hy: 10 },
        { lx: 10, ly: 11, hx: 10, hy: 11 },
        { lx: 9, ly: 10, hx: 9, hy: 10 },
    ]);
    assert.equal(cloud.ttl, 4);
    assert.deepEqual(cloud.monsters, [fog.m_id]);
    assert.equal(cloud.heros_fault, false);
    assert.deepEqual(state.level.regions, [existing, cloud]);
    assert.deepEqual(events, [
        ['block', 9, 10],
        ['cansee', 9, 10],
        ['newsym', 9, 10],
        ['cansee', 9, 11],
        ['newsym', 9, 11],
        ['block', 10, 10],
        ['cansee', 10, 10],
        ['newsym', 10, 10],
        ['block', 10, 11],
        ['cansee', 10, 11],
        ['newsym', 10, 11],
    ]);
    assert.deepEqual(messages, []);
});

test('valid_cloud_pos reads the terrain beneath a raised drawbridge', () => {
    const state = regionState();
    const bridge = state.level.at(10, 10);
    bridge.typ = DRAWBRIDGE_UP;
    bridge.flags = DB_FLOOR;
    assert.equal(valid_cloud_pos(10, 10, state), false);

    bridge.flags = DB_MOAT;
    assert.equal(valid_cloud_pos(10, 10, state), true);
    state.u.uz = { dnum: 1, dlevel: 2 };
    state.juiblex_level = { dnum: 1, dlevel: 2 };
    assert.equal(valid_cloud_pos(10, 10, state), false);

    bridge.flags = DB_LAVA;
    assert.equal(valid_cloud_pos(10, 10, state), true);
});

test('add_region requires runtime visual ownership unless explicitly deferred', () => {
    const state = regionState();
    const cloud = pointRegion(10, 10, { visible: true });

    assert.throws(
        () => add_region(cloud, state),
        (error) => error instanceof UnsupportedRegionOperationError
            && error.operation === 'blockPoint',
    );
    assert.deepEqual(state.level.regions, []);

    add_region(cloud, state, { deferVisual: true });
    assert.deepEqual(state.level.regions, [cloud]);
});

test('gas-cloud selections reject harmful upkeep before reading points', () => {
    const state = regionState({ in_mklev: true });
    let reads = 0;
    const selection = {
        bounds() {
            ++reads;
            return { lx: 1, ly: 1, hx: 1, hy: 1 };
        },
        get() {
            ++reads;
            return true;
        },
    };

    assert.throws(
        () => create_gas_cloud_selection(selection, 1, { state }),
        (error) => error instanceof UnsupportedRegionCallbackError,
    );
    assert.equal(reads, 0);
    assert.deepEqual(state.level.regions, []);
});

test('create_gas_cloud preflights runtime activation before drawing or mutation', async () => {
    const state = regionState();
    state.level.at(10, 10).typ = ROOM;
    let draws = 0;

    await assert.rejects(
        create_gas_cloud(10, 10, 1, 0, {
            state,
            random: {
                rn2() {
                    ++draws;
                    return 0;
                },
            },
        }),
        (error) => error instanceof UnsupportedRegionOperationError
            && error.operation === 'blockPoint',
    );
    assert.equal(draws, 0);
    assert.deepEqual(state.level.regions, []);
});

test('fresh fog vapor of size one draws only its rn1-expanded ttl call', async () => {
    const state = regionState();
    state.level.at(10, 10).typ = ROOM;
    const bounds = [];
    const cloud = await create_gas_cloud(10, 10, 1, 0, {
        state,
        random: {
            rn2(bound) {
                bounds.push(bound);
                assert.equal(bound, 3);
                return 2;
            },
        },
        blockPoint() {},
        canSee() { return false; },
        newsym() {
            assert.fail('an unseen fresh vapor must not redraw');
        },
        async message() {
            assert.fail('monster vapor cannot envelop a distant hero');
        },
    });

    assert.deepEqual(bounds, [3]);
    assert.equal(cloud.ttl, 6);
    assert.deepEqual(cloud.rects, [
        { lx: 10, ly: 10, hx: 10, hy: 10 },
    ]);
});

test('BFS fourth-neighbor disruption draws after the complete shuffle', async () => {
    const state = regionState();
    for (const [x, y] of [
        [10, 10], [10, 9], [10, 11], [9, 10], [11, 10],
    ]) {
        state.level.at(x, y).typ = ROOM;
    }
    const scripted = [
        [4, 3], [3, 2], [2, 1], [1, 0],
        [2, 1],
        [3, 0],
    ];
    const bounds = [];
    const cloud = await create_gas_cloud(10, 10, 5, 0, {
        state,
        random: {
            rn2(bound) {
                const [expected, result] = scripted.shift();
                assert.equal(bound, expected);
                bounds.push(bound);
                return result;
            },
        },
        blockPoint() {},
        canSee() { return false; },
        newsym() {},
        async message() {},
    });

    assert.deepEqual(bounds, [4, 3, 2, 1, 2, 3]);
    assert.equal(scripted.length, 0);
    assert.equal(cloud.rects.length, 5);
});

test('fresh size-one vapor captures its fog ID before same-turn upkeep', async () => {
    const state = regionState();
    state.level.at(10, 10).typ = ROOM;
    const fog = newMonster({
        m_id: 73,
        mnum: PM_FOG_CLOUD,
        mhp: 6,
        mhpmax: 6,
    });
    place_monster(fog, 10, 10, state);
    state.level.monlist = fog;
    let draws = 0;

    const cloud = await create_gas_cloud(10, 10, 1, 0, {
        state,
        random: {
            rn2(bound) {
                ++draws;
                assert.equal(bound, 3);
                return 0;
            },
        },
        blockPoint() {},
        canSee() { return false; },
        newsym() {},
        async message() {},
    });
    assert.deepEqual(cloud.monsters, [fog.m_id]);
    assert.equal(cloud.ttl, 4);

    await run_regions({ state });
    assert.equal(draws, 1);
    // run_regions ages 4 -> 3, then the resident fog maintains it to 8.
    assert.equal(cloud.ttl, 8);
    assert.deepEqual(cloud.monsters, [fog.m_id]);
});

test('run_regions ages then runs harmless hero and monster callbacks in ID order', async () => {
    const state = regionState();
    const fog1 = newMonster({
        m_id: 1, mnum: PM_FOG_CLOUD, mhp: 5,
    });
    const ordinary = newMonster({ m_id: 2, mnum: 0, mhp: 5 });
    const dead = newMonster({ m_id: 3, mnum: PM_FOG_CLOUD, mhp: 0 });
    const fog4 = newMonster({
        m_id: 4, mnum: PM_FOG_CLOUD, mhp: 5,
    });
    const fog5 = newMonster({
        m_id: 5, mnum: PM_FOG_CLOUD, mhp: 5,
    });
    const fog6 = newMonster({
        m_id: 6, mnum: PM_FOG_CLOUD, mhp: 5,
    });
    const fog7 = newMonster({
        m_id: 7, mnum: PM_FOG_CLOUD, mhp: 5,
    });
    state.level.monlist = linkMonsters([
        fog1, ordinary, dead, fog4, fog5, fog6, fog7,
    ]);

    const cloud = pointRegion(2, 2, {
        arg: 0,
        hero_inside: true,
        inside_f: 'inside_gas_cloud',
        monsters: [1, 999, 2, 3, 4, 5, 6, 7],
        ttl: -1,
        visible: true,
    });
    state.level.regions = [cloud];

    await run_regions({ state });

    // The stale ID tail-fills with #7, then the dead #3 tail-fills with #6.
    // Five live fog clouds advance -1 -> 4 -> 9 -> 14 -> 19 -> 24.
    assert.equal(cloud.ttl, 24);
    assert.deepEqual(cloud.monsters, [1, 7, 2, 6, 4, 5]);
    assert.deepEqual(state.gg, {
        gas_cloud_diss_within: false,
        gas_cloud_diss_seen: 0,
    });
});

test('inside_gas_cloud treats the null callback subject as the hero monster', () => {
    const state = regionState({
        youmonst: newMonster({ mnum: PM_FOG_CLOUD, mhp: 5 }),
    });
    const cloud = pointRegion(2, 2, { arg: 0, ttl: -1 });

    assert.equal(inside_gas_cloud(cloud, null, { state }), false);
    assert.equal(cloud.ttl, 4);
});

test('run_regions expires backward before aging and inside callbacks', async () => {
    const state = regionState();
    const events = [];
    const expire = (region) => {
        events.push(`expire-${region.label}`);
        return true;
    };
    const inside = (region, subject) => {
        events.push(`inside-${region.label}-${subject ? subject.m_id : 'hero'}`);
        return false;
    };
    const first = pointRegion(1, 1, {
        expire_f: expire,
        label: 'A',
        ttl: 0,
    });
    const second = pointRegion(1, 1, {
        expire_f: expire,
        label: 'B',
        ttl: 0,
    });
    const survivor = pointRegion(2, 2, {
        hero_inside: true,
        inside_f: inside,
        label: 'C',
        ttl: 1,
    });
    state.level.regions = [first, second, survivor];

    await run_regions({
        state,
        async message(text) {
            events.push(`message-${text}`);
        },
    });

    assert.deepEqual(events, [
        'expire-B',
        'expire-A',
        'inside-C-hero',
    ]);
    assert.deepEqual(state.level.regions, [survivor]);
    assert.equal(survivor.ttl, 0);
});

test('run_regions performs harmless gas dissipation, redraw, then aggregate message', async () => {
    const state = regionState();
    state.u.ux = 10;
    state.u.uy = 10;
    state.u.uinwater = true;
    state.level.at(10, 10).typ = ROOM;
    const cloud = pointRegion(10, 10, {
        arg: 0,
        expire_f: 'expire_gas_cloud',
        hero_inside: true,
        inside_f: 'inside_gas_cloud',
        ttl: 0,
        visible: true,
    });
    state.level.regions = [cloud];
    const events = [];

    await run_regions({
        state,
        doesBlock(x, y) {
            events.push(['does-block', x, y]);
            return false;
        },
        unblockPoint(x, y) {
            events.push(['unblock', x, y]);
        },
        canSee(x, y) {
            events.push(['cansee', x, y]);
            return true;
        },
        newsym(x, y) {
            events.push(['newsym', x, y]);
        },
        async message(text) {
            events.push(['message', text]);
        },
    });

    assert.deepEqual(events, [
        ['does-block', 10, 10],
        ['unblock', 10, 10],
        ['does-block', 10, 10],
        ['unblock', 10, 10],
        ['cansee', 10, 10],
        ['newsym', 10, 10],
        ['message', 'The gas cloud around you dissipates.'],
    ]);
    assert.deepEqual(state.level.regions, []);
    assert.equal(cloud.ttl, -2);
    assert.equal(state.u.uinwater, true);
    assert.equal(state.gg.gas_cloud_diss_within, false);
    assert.equal(state.gg.gas_cloud_diss_seen, 0);
});

test('run_regions rejects harmful gas atomically before ttl and counters change', async () => {
    const state = regionState({
        gg: {
            gas_cloud_diss_seen: 17,
            gas_cloud_diss_within: true,
        },
    });
    const cloud = pointRegion(2, 2, {
        arg: 1,
        hero_inside: true,
        inside_f: 'inside_gas_cloud',
        ttl: 2,
        visible: true,
    });
    state.level.regions = [cloud];

    await assert.rejects(
        run_regions({ state }),
        (error) => error instanceof UnsupportedRegionCallbackError
            && error.callback === 'inside_gas_cloud',
    );
    assert.equal(cloud.ttl, 2);
    assert.deepEqual(state.gg, {
        gas_cloud_diss_seen: 17,
        gas_cloud_diss_within: true,
    });
});

test('in_out_region checks all permissions, then leaves, then enters', async () => {
    const state = regionState();
    const events = [];
    const callbacks = {};
    for (const name of [
        'can_leave_l1', 'can_leave_l2', 'can_enter_e1', 'can_enter_e2',
        'leave_l1', 'leave_l2', 'enter_e1', 'enter_e2',
    ]) {
        callbacks[name] = () => {
            events.push(name);
            return true;
        };
    }
    const l1 = pointRegion(1, 1, {
        can_leave_f: 'can_leave_l1',
        hero_inside: true,
        leave_f: 'leave_l1',
        leave_msg: 'left one',
    });
    const l2 = pointRegion(1, 1, {
        can_leave_f: 'can_leave_l2',
        hero_inside: true,
        leave_f: 'leave_l2',
        leave_msg: 'left two',
    });
    const e1 = pointRegion(5, 5, {
        can_enter_f: 'can_enter_e1',
        enter_f: 'enter_e1',
        enter_msg: 'entered one',
    });
    const e2 = pointRegion(5, 5, {
        can_enter_f: 'can_enter_e2',
        enter_f: 'enter_e2',
        enter_msg: 'entered two',
    });
    state.level.regions = [l1, l2, e1, e2];

    assert.equal(await in_out_region(5, 5, {
        state,
        callbacks,
        async message(text) {
            events.push(`message-${text}`);
        },
    }), true);

    assert.deepEqual(events, [
        'can_leave_l1',
        'can_leave_l2',
        'can_enter_e1',
        'can_enter_e2',
        'message-left one',
        'leave_l1',
        'message-left two',
        'leave_l2',
        'message-entered one',
        'enter_e1',
        'message-entered two',
        'enter_e2',
    ]);
    assert.deepEqual(
        [l1.hero_inside, l2.hero_inside, e1.hero_inside, e2.hero_inside],
        [false, false, true, true],
    );
});

test('m_in_out_region preserves cached-ID leave-before-enter order', async () => {
    const state = regionState();
    const monster = newMonster({ m_id: 19, mhp: 3 });
    const events = [];
    const leaving = pointRegion(1, 1, {
        can_leave_f: 'can_leave',
        leave_f: 'leave',
        monsters: [19, 20],
    });
    const entering = pointRegion(5, 5, {
        can_enter_f: 'can_enter',
        enter_f: 'enter',
        monsters: [21],
    });
    state.level.regions = [leaving, entering];

    assert.equal(await m_in_out_region(monster, 5, 5, {
        state,
        callbacks: {
            can_leave() {
                events.push('can_leave');
                return true;
            },
            can_enter() {
                events.push('can_enter');
                return true;
            },
            leave() {
                events.push('leave');
            },
            enter() {
                events.push('enter');
            },
        },
    }), true);

    assert.deepEqual(events, ['can_leave', 'can_enter', 'leave', 'enter']);
    assert.deepEqual(leaving.monsters, [20]);
    assert.deepEqual(entering.monsters, [21, 19]);
});

test('transition callback preflight keeps memberships atomic', async () => {
    const state = regionState();
    const leaving = pointRegion(1, 1, {
        hero_inside: true,
        leave_f: 'not_implemented',
        leave_msg: 'must not print',
    });
    state.level.regions = [leaving];
    let messages = 0;

    await assert.rejects(
        in_out_region(5, 5, {
            state,
            async message() {
                ++messages;
            },
        }),
        (error) => error instanceof UnsupportedRegionCallbackError
            && error.callback === 'not_implemented',
    );
    assert.equal(leaving.hero_inside, true);
    assert.equal(messages, 0);
});
