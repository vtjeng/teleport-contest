import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COLNO, COULD_SEE, CORR, IN_SIGHT, ROOM, ROWNO, STONE,
} from '../js/const.js';
import { mkcavearea, mkcavepos, rm_waslit } from '../js/dig.js';

const HERO_X = 20;
const HERO_Y = 10;

function caveState() {
    const cells = Array.from({ length: COLNO }, () =>
        Array.from({ length: ROWNO }, () => ({
            typ: STONE,
            flags: 0x7f,
            doormask: 0x7f,
            seenv: 0x7f,
            lit: false,
            waslit: false,
            horizontal: true,
        })));
    const vizArray = Array.from({ length: ROWNO }, () =>
        Array(COLNO).fill(0));
    return {
        u: { ux: HERO_X, uy: HERO_Y },
        level: {
            at: (x, y) => cells[x]?.[y],
            monsters: Array.from({ length: COLNO }, () =>
                Array(ROWNO).fill(null)),
        },
        viz_array: vizArray,
        cells,
    };
}

test('rm_waslit matches the source center and five-by-three neighborhood', () => {
    const source = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    assert.match(source, /if \(levl\[u\.ux\]\[u\.uy\]\.typ == ROOM && levl\[u\.ux\]\[u\.uy\]\.waslit\)/u);
    assert.match(source, /for \(x = u\.ux - 2; x < u\.ux \+ 3; x\+\+\)[\s\S]*for \(y = u\.uy - 1; y < u\.uy \+ 2; y\+\+\)/u);

    const state = caveState();
    assert.equal(rm_waslit(state), false);
    state.cells[HERO_X][HERO_Y].typ = ROOM;
    state.cells[HERO_X][HERO_Y].waslit = true;
    assert.equal(rm_waslit(state), true);
    state.cells[HERO_X][HERO_Y].waslit = false;
    state.cells[HERO_X - 2][HERO_Y + 1].waslit = true;
    assert.equal(rm_waslit(state), true);
    state.cells[HERO_X - 2][HERO_Y + 1].waslit = false;
    state.cells[HERO_X - 3][HERO_Y].waslit = true;
    assert.equal(rm_waslit(state), false);
});

test('mkcavepos updates terrain and visibility in source order', async () => {
    const state = caveState();
    const events = [];
    const x = HERO_X - 1;
    const y = HERO_Y;
    await mkcavepos(x, y, 1, true, false, state, {
        unblockPoint: (cx, cy) => events.push(['unblock', cx, cy]),
        feelNewsym: (cx, cy) => events.push(['feel', cx, cy]),
    });

    assert.deepEqual(events, [
        ['unblock', x, y],
        ['feel', x, y],
    ]);
    assert.deepEqual({
        typ: state.level.at(x, y).typ,
        flags: state.level.at(x, y).flags,
        doormask: state.level.at(x, y).doormask,
        seenv: state.level.at(x, y).seenv,
        lit: state.level.at(x, y).lit,
        waslit: state.level.at(x, y).waslit,
        horizontal: state.level.at(x, y).horizontal,
        viz: state.viz_array[y][x],
    }, {
        typ: ROOM,
        flags: 0,
        doormask: 0,
        seenv: 0,
        lit: true,
        waslit: true,
        horizontal: false,
        viz: IN_SIGHT | COULD_SEE,
    });

    const farX = HERO_X - 2;
    const farY = HERO_Y;
    await mkcavepos(farX, farY, 2, false, false, state, {
        unblockPoint() {},
        feelNewsym() {},
    });
    assert.equal(state.level.at(farX, farY).lit, true);
    assert.equal(state.level.at(farX, farY).waslit, false);
    assert.equal(state.viz_array[farY][farX], IN_SIGHT | COULD_SEE);
});

test('mkcavearea waits before growing two rings and delays after each flush', async () => {
    const source = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    assert.match(source, /display_nhwindow\(WIN_MESSAGE, TRUE\);[\s\S]*for \(dist = 1; dist <= 2; dist\+\+\)/u);
    assert.match(source, /flush_screen\(1\);[\s\S]*nh_delay_output\(\);/u);

    const state = caveState();
    const events = [];
    await mkcavearea(false, state, {
        message: async (text) => events.push(['message', text]),
        displayMessageWindow: async () => events.push(['wait']),
        unblockPoint: (x, y) => events.push(['unblock', x, y]),
        feelNewsym: (x, y) => events.push(['feel', x, y]),
        flushScreen: async mode => events.push(['flush', mode]),
        delayOutput: async () => events.push(['delay']),
    });

    assert.deepEqual(events.slice(0, 2), [
        ['message', 'A mysterious force extends the cave around you!'],
        ['wait'],
    ]);
    assert.deepEqual(events.filter(([kind]) => kind === 'flush'), [
        ['flush', 1], ['flush', 1],
    ]);
    assert.deepEqual(events.filter(([kind]) => kind === 'delay'), [
        ['delay'], ['delay'],
    ]);
    assert.equal(events.filter(([kind]) => kind === 'feel').length, 14);
    assert.equal(state.level.at(HERO_X - 1, HERO_Y - 1).typ, ROOM);
    assert.equal(state.level.at(HERO_X + 2, HERO_Y + 1).typ, ROOM);
    assert.equal(state.level.at(HERO_X - 3, HERO_Y).typ, STONE);
    assert.equal(state.vision_full_recalc, 1);
    assert.equal(state.level.at(HERO_X, HERO_Y).typ, STONE);

    const corridorState = caveState();
    corridorState.level.at(HERO_X, HERO_Y).typ = CORR;
    const corridorEvents = [];
    await mkcavearea(false, corridorState, {
        message: async text => corridorEvents.push(text),
        displayMessageWindow: async () => {},
        unblockPoint() {},
        feelNewsym() {},
        flushScreen: async () => {},
        delayOutput: async () => {},
    });
    assert.equal(corridorEvents[0], 'A mysterious force creates a cave around you!');
    assert.equal(corridorState.level.at(HERO_X, HERO_Y).typ, ROOM);
});

test('mkcavearea rockit arm reports a collapse and turns open room to stone', async () => {
    const state = caveState();
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            state.level.at(x, y).typ = ROOM;
            state.level.at(x, y).lit = true;
            state.level.at(x, y).waslit = true;
        }
    }
    const events = [];
    await mkcavearea(true, state, {
        message: async text => events.push(['message', text]),
        displayMessageWindow: async () => events.push(['wait']),
        unblockPoint() {},
        feelNewsym() {},
        flushScreen: async () => {},
        delayOutput: async () => {},
    });

    assert.deepEqual(events, [
        ['message', 'Crash!  The ceiling collapses around you!'],
        ['wait'],
    ]);
    const near = state.level.at(HERO_X - 1, HERO_Y);
    const far = state.level.at(HERO_X - 2, HERO_Y);
    assert.equal(near.typ, STONE);
    assert.equal(near.lit, false);
    assert.equal(near.waslit, false);
    assert.equal(far.typ, STONE);
    assert.equal(far.lit, false);
    assert.equal(state.vision_full_recalc, 1);
    assert.equal(state.level.at(HERO_X, HERO_Y).typ, ROOM);
});
