import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bc_order, set_bc } from '../js/ball.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { place_object, remove_object } from '../js/obj.js';
import { HEAVY_IRON_BALL, IRON_CHAIN, BALL_CLASS, CHAIN_CLASS } from '../js/objects.js';
import { BC_BALL, BC_CHAIN, OBJ_FREE, OBJ_INVENT } from '../js/const.js';
import { GLYPH_CMAP_A_OFF, GLYPH_UNEXPLORED_OFF } from '../js/glyph_offsets.js';
import { S_room, S_corr } from '../js/symbols.js';

const c = readFileSync('nethack-c/upstream/src/ball.c', 'utf8');
const js = readFileSync('js/ball.js', 'utf8');
// display.h's cmap glyph arithmetic gives distinct room/corridor memory.
const ROOM_MEMORY = GLYPH_CMAP_A_OFF + S_room;
const CORRIDOR_MEMORY = GLYPH_CMAP_A_OFF + S_corr;
// Source BCPOS constants: distinct, chain first, ball first.
const DIFFER = 0, CHAIN = 1, BALL = 2;
function fixture(order = CHAIN, separate = false) {
    // Interior coordinates allow canonical floor indexing without edge gates.
    const state = { u: { ux: 10, uy: 8, uswallow: 0 },
        level: new GameMap(), context: {}, flags: {}, go: {}, invent: null };
    const object = (otyp, oclass) => ({ otyp, oclass, where: OBJ_FREE,
        quan: 1, nobj: null, nexthere: null, oartifact: 0 });
    state.uball = object(HEAVY_IRON_BALL, BALL_CLASS);
    state.uchain = object(IRON_CHAIN, CHAIN_CLASS);
    const ballx = separate ? 11 : 10;
    const placeBall = () => place_object(state.uball, ballx, 8, { state });
    const placeChain = () => place_object(state.uchain, 10, 8, { state });
    if (order === CHAIN) { placeBall(); placeChain(); }
    else { placeChain(); placeBall(); }
    state.level.at(10, 8).remembered_glyph = { glyph: ROOM_MEMORY };
    state.level.at(ballx, 8).remembered_glyph = { glyph: ROOM_MEMORY };
    // Caches must read levl memory rather than this different transient glyph.
    state.level.at(10, 8).disp_glyph = { glyph: CORRIDOR_MEMORY };
    return state;
}

function redrawRecorder(state) {
    const calls = [];
    return { calls, redraw(x, y) {
        const pile = state.level.objects[x][y];
        calls.push([x, y, pile]);
        // newsym's underlying-map write, observable before object replacement.
        if (!pile) state.level.at(x, y).remembered_glyph = { glyph: CORRIDOR_MEMORY };
    } };
}

test('bc_order pins source early guards and same-pile traversal', () => {
    assert.match(c, /carried\(uball\)\s*\|\| u\.uswallow/u);
    for (const order of [CHAIN, BALL]) assert.equal(bc_order(fixture(order)), order);
    assert.equal(bc_order(fixture(CHAIN, true)), DIFFER);
    const state = fixture(); state.u.uswallow = 1;
    assert.equal(bc_order(state), DIFFER);
    state.u.uswallow = 0;
    remove_object(state.uball, { state }); state.uball.where = OBJ_INVENT;
    assert.equal(bc_order(state), DIFFER);
});

test('bc_order retains the source invalid-pile diagnostic as a discarded gap', () => {
    const state = fixture(); state.level.objects[10][8] = null;
    game.unported = new Set();
    assert.equal(bc_order(state), DIFFER);
    assert.ok(game.unported.has('pline.c impossible'));
});

test('set_bc captures under a shared pile and restores either source stack', () => {
    for (const order of [CHAIN, BALL]) {
        const state = fixture(order); const { calls, redraw } = redrawRecorder(state);
        const ball = state.uball, chain = state.uchain;
        set_bc(0, state, { redraw });
        assert.equal(state.u.bc_order, order);
        assert.equal(state.u.bc_felt, BC_BALL | BC_CHAIN);
        assert.equal(state.u.bglyph, CORRIDOR_MEMORY);
        assert.equal(state.u.cglyph, CORRIDOR_MEMORY);
        assert.deepEqual(calls.map(([x, y, pile]) => [x, y, pile]),
            [[10, 8, null], [10, 8, order === CHAIN ? chain : ball]]);
        assert.equal(state.level.objects[10][8], order === CHAIN ? chain : ball);
        assert.equal(state.level.objects[10][8].nexthere, order === CHAIN ? ball : chain);
        assert.equal(state.level.objlist, order === CHAIN ? chain : ball);
    }
});

test('set_bc separate floor positions captures chain before ball', () => {
    const state = fixture(CHAIN, true); const { calls, redraw } = redrawRecorder(state);
    set_bc(0, state, { redraw });
    assert.equal(state.u.bc_order, DIFFER);
    assert.deepEqual(calls.map(([x, y, pile]) => [x, y, pile]),
        [[10, 8, null], [10, 8, state.uchain], [11, 8, null], [11, 8, state.uball]]);
    assert.equal(state.u.bglyph, CORRIDOR_MEMORY);
    assert.equal(state.u.cglyph, CORRIDOR_MEMORY);
});

test('set_bc carried ball remains carried and preserves its unrelated cached glyph', () => {
    const state = fixture(); remove_object(state.uball, { state });
    state.uball.where = OBJ_INVENT; state.invent = state.uball;
    state.u.bglyph = ROOM_MEMORY;
    const { calls, redraw } = redrawRecorder(state); set_bc(0, state, { redraw });
    assert.equal(state.u.bc_order, DIFFER);
    assert.equal(state.u.bc_felt, BC_CHAIN);
    assert.equal(state.u.bglyph, ROOM_MEMORY);
    assert.equal(state.u.cglyph, CORRIDOR_MEMORY);
    assert.equal(state.uball.where, OBJ_INVENT);
    assert.deepEqual(calls.map(([x, y]) => [x, y]), [[10, 8], [10, 8]]);
});

test('already blind or swallowed setup reads hero memory without extraction/redraw', () => {
    for (const swallowed of [false, true]) {
        const state = fixture(CHAIN, true); state.u.uswallow = Number(swallowed);
        set_bc(Number(!swallowed), state, { redraw: () => assert.fail('C returns before newsym') });
        assert.equal(state.u.bglyph, ROOM_MEMORY);
        assert.equal(state.u.cglyph, ROOM_MEMORY);
        assert.equal(state.level.objects[10][8], state.uchain);
        assert.equal(state.level.objects[11][8], state.uball);
    }
    const state = fixture(); state.level.at(10, 8).remembered_glyph = undefined;
    set_bc(1, state);
    assert.equal(state.u.bglyph, GLYPH_UNEXPLORED_OFF);
    assert.equal(state.u.cglyph, GLYPH_UNEXPLORED_OFF);
});

test('set_bc on a foreign state preserves live floor and display state', () => {
    const state = fixture(); const before = game.level;
    const { redraw } = redrawRecorder(state); set_bc(0, state, { planning: true, redraw });
    assert.equal(game.level, before);
    assert.equal(state.u.bglyph, CORRIDOR_MEMORY);
});

test('selected functions and supporting consumers use remembered glyphs in source order', () => {
    assert.match(c, /remove_object\(uchain\);[\s\S]*?newsym\(uchain->ox, uchain->oy\);\s*u\.cglyph = levl/u);
    assert.match(js, /remove_object\(chain, env\);[\s\S]*?redraw\(chain\.ox, chain\.oy, state\);\s*state\.u\.cglyph = memoryGlyph/u);
    assert.doesNotMatch(js, /\bbcOrder\b|\bglyph_at\(|\.at\([^\n]*\)\.glyph/u);
});
