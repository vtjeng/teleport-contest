import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, CORR, ROOM, ROWNO } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import { S_corr, S_darkroom, S_litcorr } from '../js/symbols.js';
import { loadCorridorMemoryRecipe } from './run-corridor-memory.mjs';

// The three options display.c newsym()'s out-of-sight arm reads:
// flags.lit_corridor decides what back_to_glyph() remembered in the first
// place, and flags.dark_room with iflags.use_color is the outer condition's
// second half.
const GATE_OPTIONS = ['lit_corridor', 'dark_room', 'color'];

// The rc line each segment's own options are written on; nethackrc() puts it
// last and ends the text with a newline, so it is the second-to-last element.
function optionsLine(nethackrc) {
    const lines = nethackrc.split('\n');
    return lines[lines.length - 2];
}

// What an option is set to for a segment. An rc that names neither `opt` nor
// `!opt` leaves the option at the compiled-in default, which allopt_init[]
// carries; two of these three default to on and one to off, so absence cannot
// stand for either state on its own.
function optionState(nethackrc, name) {
    const line = optionsLine(nethackrc);
    if (line.includes(`!${name}`)) return false;
    if (line.includes(name)) return true;
    return allopt.find((option) => option.name === name).initval;
}

function segmentsWhere(recipe, name, value) {
    return recipe.segments.filter(
        (segment) => optionState(segment.nethackrc, name) === value,
    );
}

const walkOf = (segment) => `${segment.seed}:${segment.moves}`;

// The control half: the segments that repeat a lit-corridor walk with
// 'lit_corridor' off. The dark-room walks also leave the option off -- it
// defaults that way -- so "off" alone does not name this group.
function controlSegments(recipe) {
    const lit = new Set(
        segmentsWhere(recipe, 'lit_corridor', true).map(walkOf),
    );
    return segmentsWhere(recipe, 'lit_corridor', false)
        .filter((segment) => lit.has(walkOf(segment)));
}

// Every remembered cmap on the level, counted, plus the terrain under it.
// newsym() writes map memory whether or not the square is in sight, so this
// reads the whole grid rather than the drawn screen.
function rememberedTerrain() {
    const cmaps = new Map();
    let corridorSquares = 0;
    let unlitRoomSquares = 0;
    for (let x = 1; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) {
            const location = game.level.at(x, y);
            const cmap = location?.remembered_glyph?.cmap;
            if (cmap === undefined) continue;
            cmaps.set(cmap, (cmaps.get(cmap) ?? 0) + 1);
            if (location.typ === CORR) corridorSquares += 1;
            if (location.typ === ROOM && !location.lit) unlitRoomSquares += 1;
        }
    }
    return { cmaps, corridorSquares, unlitRoomSquares };
}

test('the corridor-memory recipe contains only replay inputs', () => {
    const recipe = loadCorridorMemoryRecipe();
    assert.equal(recipe.version, 5);
    // Six lit-corridor walks, the same six as controls, and six dark-room
    // walks.
    assert.equal(recipe.segments.length, 18);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // A leading space dismisses the welcome message; the rest is one
        // orthogonal step per key, because a diagonal step through a doorway
        // is illegal and would end the walk early.
        assert.match(segment.moves, /^ [hjkl]+$/u);
        assert.ok(Number.isInteger(segment.seed));
    }
});

test('each option newsym reads is covered in both states', () => {
    // The arm's whole input is flags.lit_corridor, through back_to_glyph(),
    // plus `flags.dark_room && iflags.use_color`. A matrix that never moved
    // one of the three would pin only one side of the condition.
    const recipe = loadCorridorMemoryRecipe();
    for (const option of GATE_OPTIONS) {
        assert.ok(
            segmentsWhere(recipe, option, false).length > 0,
            `no segment has ${option} off`,
        );
        assert.ok(
            segmentsWhere(recipe, option, true).length > 0,
            `no segment has ${option} on`,
        );
    }
    // The lit-corridor walks and their controls are the same six walks, so
    // the option is the only thing that differs between the two halves.
    const lit = segmentsWhere(recipe, 'lit_corridor', true);
    assert.equal(lit.length, 6);
    assert.deepEqual(controlSegments(recipe).map(walkOf), lit.map(walkOf));
});

test('the lit-corridor walks promote and then demote corridor memory',
    async () => {
        // These six are the matrix's reason to exist. With 'lit_corridor' on,
        // back_to_glyph() (display.c:2302) answers S_litcorr for every
        // corridor square in sight whatever its own lighting, so S_corr can
        // only reach map memory through the correction at display.c:1086-1089.
        // Both cmaps have to be present when the walk ends: S_litcorr for the
        // squares still beside the hero, S_corr for the ones behind her.
        const walks = segmentsWhere(
            loadCorridorMemoryRecipe(), 'lit_corridor', true,
        );
        // An empty group would let every assertion below pass vacuously.
        assert.equal(walks.length, 6);
        for (const segment of walks) {
            await runSegment(segment);
            const { cmaps, corridorSquares } = rememberedTerrain();
            assert.ok(
                cmaps.get(S_litcorr) > 0,
                `seed ${segment.seed} remembers no lit corridor`,
            );
            assert.ok(
                cmaps.get(S_corr) > 0,
                `seed ${segment.seed} demoted no corridor square`,
            );
            // Every remembered corridor square carries one of the two cmaps
            // and nothing else, which is what makes the two counts a
            // partition of the walk rather than a sample of it.
            assert.equal(
                cmaps.get(S_litcorr) + cmaps.get(S_corr), corridorSquares,
            );
        }
    });

test('the control walks never promote a corridor square', async () => {
    // The same six walks with 'lit_corridor' off. back_to_glyph() then
    // answers S_litcorr only for `ptr->waslit`, which no corridor on these
    // levels has, so nothing is promoted and the correction must find no
    // work. S_corr alone would not say so -- it is also what a wrongly
    // demoted square holds -- so the absence of S_litcorr is what makes
    // these six a control.
    const controls = controlSegments(loadCorridorMemoryRecipe());
    // An empty group would let every assertion below pass vacuously.
    assert.equal(controls.length, 6);
    for (const segment of controls) {
        await runSegment(segment);
        const { cmaps, corridorSquares } = rememberedTerrain();
        assert.equal(
            cmaps.get(S_litcorr), undefined,
            `seed ${segment.seed} promoted a corridor square`,
        );
        assert.ok(corridorSquares > 0);
        assert.equal(cmaps.get(S_corr), corridorSquares);
    }
});

test('the dark-room walks cross an unlit room square and darken it',
    async () => {
        // display.c:1090-1092 over squares of a room mklev() left unlit. Each
        // seed was picked for one beside the hero's start on dungeon level 1,
        // and the walk steps onto it and two squares away. The unlit-square
        // count is the premise that choice rests on, checked rather than
        // assumed, because a seed whose rooms are all lit would exercise
        // nothing and still pass its differential.
        const recipe = loadCorridorMemoryRecipe();
        const darkRoom = recipe.segments.filter(
            (segment) => !optionState(segment.nethackrc, 'dark_room')
                || !optionState(segment.nethackrc, 'color'),
        );
        assert.equal(darkRoom.length, 6);
        for (const segment of darkRoom) {
            await runSegment(segment);
            const { cmaps, unlitRoomSquares } = rememberedTerrain();
            assert.ok(
                unlitRoomSquares > 0,
                `seed ${segment.seed} remembers no unlit room square`,
            );
            assert.ok(
                cmaps.get(S_darkroom) > 0,
                `seed ${segment.seed} darkened no room square`,
            );
        }
    });
