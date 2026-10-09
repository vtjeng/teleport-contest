import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COLNO, IN_SIGHT, ROOM, ROWNO } from '../js/const.js';
import { cmap_to_glyph, newsym } from '../js/display.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { initialize_symbols_from_options, S_room } from '../js/symbols.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';

// display.c:704-708 and 926-928 suppress newsym before any location access.
// Each flag runs separately so omission of any predicate term is observable.
const phases = ['in_mklev', 'saving', 'restoring', 'done_hup'];
const x = 7, y = 4; // An interior non-hero room square takes ordinary map work.

function visibleRoomState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 1, uy: 1, uprops: [] }; // The target is not the hero square.
    state.flags = {};
    state.program_state = {};
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
    state.viz_array[y][x] = IN_SIGHT;
    const location = state.level.at(x, y);
    location.typ = ROOM;
    location.lit = true;
    // The prior level's sight bit is deliberately valid while the new cell
    // is still unexplored, reproducing the source generation precondition.
    initRng(1793701); // Fixed only to expose any accidental RNG consumption.
    enableRngLog();
    return { state, location };
}

function setPhase(state, phase) {
    if (phase === 'in_mklev') state.in_mklev = true;
    else state.program_state[phase] = true;
}

test('newsym suppression is pinned before C coordinate and map work', () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/display.c', import.meta.url), 'utf8');
    assert.match(source, /#define _suppress_map_output\(\)\s*\\\s*\(gi\.in_mklev \|\| program_state\.saving \|\| program_state\.restoring\s*\\\s*\|\| program_state\.done_hup\)/u);
    const body = source.slice(source.indexOf('\nnewsym(coordxy x, coordxy y)'));
    assert.match(body, /if \(_suppress_map_output\(\)\)\s*return;[\s\S]*?if \(!isok\(x, y\)\)/u);
});

for (const phase of phases) {
    test(`newsym leaves memory, glyph buffer and RNG untouched while ${phase}`, () => {
        const { state, location } = visibleRoomState();
        const before = structuredClone(location);
        const draws = [...getRngLog()];
        setPhase(state, phase);
        let lookups = 0;
        const at = state.level.at.bind(state.level);
        state.level.at = (...args) => { ++lookups; return at(...args); };
        newsym(x, y);
        assert.equal(lookups, 0, 'C returns before accessing levl, even with stale sight');
        assert.deepEqual(location, before);
        assert.deepEqual(getRngLog(), draws);
    });

    test(`newsym returns before invalid-coordinate access while ${phase}`, () => {
        const { state } = visibleRoomState();
        setPhase(state, phase);
        state.level.at = () => { throw new Error('location must not be read'); };
        // C checks suppression before isok; column zero is an invalid map
        // coordinate and must not reach the location accessor in this phase.
        assert.doesNotThrow(() => newsym(0, y));
    });
}

test('newsym still records and draws visible terrain after suppression ends', () => {
    const { state, location } = visibleRoomState();
    state.in_mklev = false;
    for (const phase of phases.slice(1)) state.program_state[phase] = false;
    newsym(x, y);
    assert.equal(location.waslit, true);
    assert.deepEqual(location.remembered_glyph, { glyph: cmap_to_glyph(S_room, state) });
    assert.equal(location.disp_ch, '.'); // defsyms S_room, ordinary lit floor.
    assert.deepEqual(getRngLog(), []); // Ordinary terrain redraw is not random.
});
