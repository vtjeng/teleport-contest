#!/usr/bin/env node
// Independent C-first natural arrival/direct loading cover the whole Sam-loca program.
// A new Sam-goal direct load checks the separately accepted program boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { get_level_extends } from '../js/mkmaze.js';
import { SAM_LOCA_LEVEL_OBJECTS } from '../js/sam_loca_level_data.js';
import { COLNO, ROWNO, DOOR, SDOOR, D_CLOSED, D_LOCKED, W_NONDIGGABLE } from '../js/const.js';
import { GEM_CLASS, ARMOR_CLASS, WEAPON_CLASS, TOOL_CLASS } from '../js/objects.js';
import { PM_NINJA, PM_SAMURAI, PM_STALKER, PM_WOLF } from '../js/monsters.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { verifySamGoalLevel } from './run-sam-goal-level-load.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}
export async function verifySamLocaSegment(segment) {
    if (segment.moves.includes('Sam-goal.lua')) return verifySamGoalLevel(segment);
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.is_maze_lev, true); // Lua8.
    assert.equal(game.level.flags.hardfloor, true);
    assert.equal(game.level.nroom, 0); // Selection lighting creates no room record.
    let locked = 0, closed = 0, protectedCell = false;
    for (let x = 1; x < COLNO; ++x) for (let y = 0; y < ROWNO; ++y) {
        const cell = game.level.at(x, y);
        if (cell.typ === DOOR || cell.typ === SDOOR) {
            if (cell.doormask === D_LOCKED) ++locked;
            if (cell.doormask === D_CLOSED) ++closed;
        }
        protectedCell ||= Boolean(cell.wall_info & W_NONDIGGABLE);
    }
    assert.equal(locked, 16); // Lua35–50 includes two source secret doors.
    assert.equal(closed, 8); // Lua51–58.
    assert.ok(protectedCell); // Lua63 preserves protected walls across flips.
    const stairs = linkedItems(game.stairs, 'next');
    assert.equal(stairs.filter(s => !s.up).length, 1); // Lua61.
    assert.equal(stairs.filter(s => s.up).length, 1);
    // Lua60 supplies the arrival up stair; direct level1 loading gets its branch stair from fixup_special.
    const objects = linkedItems(game.level.objlist, 'nobj');
    // lspo_map centers the 76x20 fragment at (3,1) after odd-parity adjustment.
    // The fixed down stair identifies flip axes; flip_level clamps the padded bounds.
    const bounds = get_level_extends(game);
    const down = stairs.find(s => !s.up);
    const origin = { x: 3, y: 1 }; // sp_lev.c lspo_map default center for this fragment.
    const flipX = down.sx !== origin.x + 25;
    const flipY = down.sy !== origin.y + 14;
    const position = (x, y) => [flipX ? Math.min(COLNO - 1, bounds.xmax)
        + Math.max(1, bounds.xmin) - (origin.x + x) : origin.x + x,
        flipY ? Math.min(ROWNO - 1, bounds.ymax)
        + Math.max(0, bounds.ymin) - (origin.y + y) : origin.y + y];
    assert.deepEqual([down.sx, down.sy], position(25, 14)); // Lua61's fixed coordinate.
    const classes = { '*': GEM_CLASS, '[': ARMOR_CLASS, ')': WEAPON_CLASS, '(': TOOL_CLASS };
    for (const [type, x, y] of SAM_LOCA_LEVEL_OBJECTS) {
        const [ax, ay] = position(x, y);
        const object = objects.find(o => o.ox === ax && o.oy === ay && o.oclass === classes[type]);
        assert.ok(object); // Lua65–99: every fixed class placement survives generation and flipping.
        assert.ok(game.level.at(ax, ay).lit); // Lua33.
    }
    // mklev.c mktrap_victim can add corpse/gear piles at shallow direct loads;
    // the Lua's 32 descriptors are pinned individually rather than as a floor total.
    assert.equal(game.level.traps.length, 6); // Lua101–106 random traps.
    const monsters = linkedItems(game.level.monlist, 'nmon');
    assert.equal(monsters.length, 33); // Lua108–141 includes one canine class draw.
    for (const [type, count] of [[PM_NINJA, 8], [PM_SAMURAI, 6], [PM_STALKER, 9]])
        assert.equal(monsters.filter(m => m.mnum === type).length, count); // Fixed source species.
    assert.ok(monsters.filter(m => m.mnum === PM_WOLF).length >= 9); // Class d can select another wolf.
    assert.ok(monsters.filter(m => m.mnum === PM_NINJA || m.mnum === PM_SAMURAI)
        .every(m => !m.mpeaceful)); // Table descriptors force hostile guards.
    assert.ok(monsters.filter(m => m.mnum === PM_STALKER).every(m => m.minvis)); // Canonical stalker creation.
}
export function runSamLocaMatrix() {
    const entries = ['locate-male-arrival', 'locate-female-des', 'goal-outside-program'].map(label => {
        const path = new URL(`../recipes/Sam-loca.lua/${label}.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
    return runFreshMatrix({ entries, chunkLimit: 1, summaryLabel: 'SAM-LOCA LEVEL GENERATION',
        verifySegment: verifySamLocaSegment });
}
runMatrixCli(import.meta.url, runSamLocaMatrix, 'Sam-loca level generation');
