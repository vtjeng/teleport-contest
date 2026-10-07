#!/usr/bin/env node

// Record and replay the `d` command against the patched C reference.
//
// do.c drop() branches on what the chosen object is attached to, and every
// branch it reaches for a hero standing on reachable ordinary floor has a
// case here. Which branch a keystroke selects is fixed by u_init.c's starting
// inventory, so a letter selects a branch the way a key selects a command:
//
// - ESCAPE_CASE cancels at the getobj() prompt. invent.c:1950 answers a
//   quitchars byte with Never_mind and a null object, so drop() returns
//   ECMD_FAIL at do.c:716-717 and no turn elapses. cmd.c dodrop() still calls
//   reset_occupations(), because ECMD_FAIL is 0x04 and therefore true.
// - CARRIED_CASE drops an object in no equipment slot: do.c:777-778 alone.
// - WIELDED_CASE, SWAPWEP_CASE and QUIVER_CASE each reach one of the three
//   slot clears at do.c:722-734 before that.
// - GOLD_CASE selects the '$' slot, which getobj() sends through its own arm
//   at invent.c:2007-2027 before drop() sees the object.
// - WORN_CASE reaches canletgo()'s first arm (do.c:667-671), which refuses a
//   worn piece with Norep and no turn.
// - LOADSTONE_CASE reaches canletgo()'s third arm (do.c:685-699), which
//   refuses a cursed loadstone with "For some reason, you cannot ..." and
//   sets its bknown.
// - MEATRING_CASE drops the one object type that satisfies do.c:753's second
//   disjunct without the first: a meat ring is FOOD_CLASS, not RING_CLASS.
//   Away from a sink the sink arm must still fall through.
// - MERGE_CASE drops two identical wished scrolls on one square, so the
//   second reaches invent.c stackobj() -> merged() -> obj_extract_self() and
//   leaves one floor node of quantity two.
//
// The last two need a wish, so each is recorded in its own debug game:
// record-session keeps one staged install per recipe, and two sequential
// debug games in one install collide.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BURN, DUST, ENGRAVE, OBJ_FLOOR, OBJ_INVENT, SHRINK_GLOB } from '../js/const.js';
import { engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import { GLOB_OF_GRAY_OOZE, GLOB_OF_BROWN_PUDDING } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { runDifferential, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed Tuesday morning with no calendar event, so nothing competes with
// the drop's own message for the top line.
const DATETIME = '20330809101112';
const ESC = '\x1b';
const WIZWISH_KEY = '\x17';
// Space dismisses the startup line; the trailing rest makes the turn the drop
// did or did not spend visible on the next screen.
const START = ' ';
const REST = '.';
const LIGHT_WISH = `${WIZWISH_KEY}scroll of light\n`;
// mkobj.c curses every loadstone it makes, so no "cursed" prefix is needed.
const LOADSTONE_WISH = `${WIZWISH_KEY}loadstone\n`;

// One seed per role. Neither is searched for: the starting inventory these
// cases select from comes from u_init.c and is the same on every seed.
const VALKYRIE_SEED = 4410001;
const TOURIST_SEED = 4410002;

function nethackrc(name, role, gender, align, {
    debug = false, verbose = true,
} = {}) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:${gender},`
            + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup'
            + (debug ? ',playmode:debug' : '')
            + (verbose ? '' : ',!verbose'),
        '',
    ].join('\n');
}

const VALKYRIE_RC = nethackrc('DropValk', 'Valkyrie', 'female', 'lawful');
const TOURIST_RC = nethackrc('DropTour', 'Tourist', 'male', 'neutral');
const MERGE_RC = nethackrc(
    'DropMerge', 'Valkyrie', 'female', 'lawful', { debug: true },
);
const LOADSTONE_RC = nethackrc(
    'DropStone', 'Valkyrie', 'female', 'lawful', { debug: true },
);
const MEATRING_RC = nethackrc(
    'DropMeat', 'Valkyrie', 'female', 'lawful', { debug: true },
);
// do.c:774's other side, `flags.verbose` off, is exported for the port-level
// test rather than recorded: an answered yn_function() prompt that is followed
// by no message keeps its row on the C terminal and loses it here, which the
// deferred entry drop-prompt-row-lost-without-a-following-message carries.
export const QUIET_RC = nethackrc(
    'DropQuiet', 'Valkyrie', 'female', 'lawful', { verbose: false },
);

// u_init.c:160-166 gives the Valkyrie a wielded spear, a dagger in the
// secondary slot, a worn small shield and a loose food ration, in that letter
// order; :150-159 gives the Tourist a quivered stack of darts, and u_init()
// gives every role a gold slot.
export const DROP_CASES = [
    {
        label: 'escape at the drop prompt',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: `d${ESC}`,
        // Nothing leaves the pack and no turn is spent.
        floor: null,
    },
    {
        label: 'a carried object',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'dd',
        floor: 'd',
    },
    {
        label: 'the wielded weapon',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'da',
        floor: 'a',
        slot: 'uwep',
    },
    {
        label: 'the secondary weapon',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'db',
        floor: 'b',
        slot: 'uswapwep',
    },
    {
        label: 'worn armor',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'dc',
        // canletgo() refuses, so the shield stays worn and on the letter.
        floor: null,
    },
    {
        label: 'the gold slot',
        seed: TOURIST_SEED,
        nethackrc: TOURIST_RC,
        keys: 'd$',
        floor: '$',
    },
    {
        label: 'the quivered stack',
        seed: TOURIST_SEED,
        nethackrc: TOURIST_RC,
        keys: 'da',
        floor: 'a',
        slot: 'uquiver',
    },
];

export const LOADSTONE_CASE = {
    label: 'a cursed loadstone',
    seed: VALKYRIE_SEED,
    nethackrc: LOADSTONE_RC,
    setup: LOADSTONE_WISH,
    keys: 'de',
    floor: null,
};

export const MEATRING_CASE = {
    label: 'a meat ring away from a sink',
    seed: VALKYRIE_SEED,
    nethackrc: MEATRING_RC,
    setup: `${WIZWISH_KEY}meat ring\n`,
    keys: 'de',
    floor: 'e',
};

export const MERGE_CASE = {
    label: 'a second scroll merging into the floor pile',
    seed: VALKYRIE_SEED,
    nethackrc: MERGE_RC,
    // Each wish takes the lowest free letter, so the first scroll is 'e' and
    // the second is 'f' while 'e' lies on the floor.
    setup: `${LIGHT_WISH}de${LIGHT_WISH}`,
    keys: 'df',
    pileBefore: 1,
    mergedQuantity: 2,
};

// Unsearched seeds 135271–135273 select independent dust, blade-carved and
// fire-wand substrates. C-first recordings established the dagger letter and
// the fire wand's two More prompts before these inputs were compared with JS.
export const ENGRAVING_DROP_CASES = [
    { name: 'drop-engraving-dust-ration', type: DUST, text: 'camp' },
    { name: 'drop-engraving-carved-ration', type: ENGRAVE, text: 'mark' },
    { name: 'drop-engraving-burned-ration', type: BURN, text: 'base' },
];

export function loadEngravingDropRecipe(name) {
    return validateCleanRecipe(JSON.parse(readFileSync(
        new URL(`../recipes/do.c/${name}.recipe.session.json`, import.meta.url),
        'utf8',
    )), 'engraving drop recipe');
}

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: entry.nethackrc,
        moves: START + (entry.setup ?? '') + entry.keys + REST,
    };
}

export function loadDropCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: DROP_CASES.map(segmentFor),
    }, 'drop command recipe');
}

export function loadDropLoadstoneRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segmentFor(LOADSTONE_CASE)],
    }, 'drop loadstone recipe');
}

export function loadDropMeatRingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segmentFor(MEATRING_CASE)],
    }, 'drop meat ring recipe');
}

export function loadDropMergeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segmentFor(MERGE_CASE)],
    }, 'drop merge recipe');
}

function caseForSegment(segment) {
    const moves = segment.moves;
    const found = [...DROP_CASES, LOADSTONE_CASE, MEATRING_CASE, MERGE_CASE]
        .find((entry) => segmentFor(entry).moves === moves
            && segmentFor(entry).nethackrc === segment.nethackrc);
    if (!found) throw new Error(`no drop case for moves ${JSON.stringify(moves)}`);
    return found;
}

function inventoryLetters(state) {
    const letters = [];
    for (let obj = state.invent; obj; obj = obj.nobj) letters.push(obj.invlet);
    return letters;
}

function floorPile(state) {
    const pile = [];
    for (let obj = state.level.objects[state.u.ux]?.[state.u.uy] ?? null;
        obj;
        obj = obj.nexthere) {
        pile.push(obj);
    }
    return pile;
}

// do.c:dropx -> flooreffects globby branch: the original free glob is
// consumed by a same-type floor neighbor, even when it outweighs that neighbor.
export const GLOB_DROP_CASES = [
    { name: 'drop-glob-without-neighbor', type: GLOB_OF_GRAY_OOZE,
        command: 'de', merged: false, adjacent: false },
    { name: 'drop-glob-on-floor-glob', type: GLOB_OF_GRAY_OOZE,
        command: 'df', merged: true, adjacent: false },
    { name: 'drop-glob-beside-floor-glob', type: GLOB_OF_BROWN_PUDDING,
        command: 'df', merged: true, adjacent: true },
    { name: 'drop-glob-on-different-glob', type: GLOB_OF_BROWN_PUDDING,
        neighborType: GLOB_OF_GRAY_OOZE,
        command: 'df', merged: false, adjacent: false },
];

export function loadGlobDropRecipe(name) {
    assert.ok(GLOB_DROP_CASES.some(entry => entry.name === name));
    const recipe = JSON.parse(readFileSync(new URL(
        `../recipes/do.c/${name}.session.json`, import.meta.url), 'utf8'));
    validateCleanRecipe(recipe, name);
    return recipe;
}

function floorGlobs(type) {
    const globs = [];
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === type) globs.push(obj);
    return globs;
}

export async function verifyGlobDropSegment(segment, entry) {
    const command = segment.moves.lastIndexOf(entry.command);
    assert.ok(command >= 0);
    await runSegment({ ...segment, moves: segment.moves.slice(0, command) });
    const beforeFloor = floorGlobs(entry.type);
    assert.equal(beforeFloor.length, entry.merged ? 1 : 0);
    let incoming = game.invent;
    while (incoming && incoming.otyp !== entry.type) incoming = incoming.nobj;
    assert.ok(incoming, 'the intended glob exists before the final drop');
    assert.equal(incoming.where, OBJ_INVENT);
    const other = entry.neighborType ? floorGlobs(entry.neighborType)[0] : null;
    if (entry.neighborType) assert.ok(other, 'the incompatible floor glob exists');
    const otherId = other?.o_id;
    const otherWeight = other?.owt;
    const incomingId = incoming.o_id;
    const floorId = beforeFloor[0]?.o_id;
    const floorWeight = beforeFloor[0]?.owt ?? 0;
    const incomingWeight = incoming.owt;
    const priorMoves = game.moves;
    const floorPosition = beforeFloor[0]
        ? [beforeFloor[0].ox, beforeFloor[0].oy] : [game.u.ux, game.u.uy];
    if (entry.merged) {
        assert.equal(Math.abs(floorPosition[0] - game.u.ux)
            + Math.abs(floorPosition[1] - game.u.uy), entry.adjacent ? 1 : 0);
        assert.ok(incomingWeight > floorWeight,
            'obj_meld preserves the smaller floor glob before the weight test');
    }
    let boundary;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const [survivor, extra] = floorGlobs(entry.type);
    assert.ok(survivor);
    assert.equal(extra, undefined, 'no deleted incoming object is placed again');
    assert.equal(survivor.o_id, entry.merged ? floorId : incomingId);
    assert.equal(survivor.where, OBJ_FLOOR);
    assert.deepEqual([survivor.ox, survivor.oy], floorPosition);
    assert.equal(survivor.owt, floorWeight + incomingWeight);
    assert.equal(survivor.quan, 1); // C globs merge by weight, never quantity.
    assert.equal(survivor.timed, 1); // The floor survivor owns one shrink timer.
    const timers = [];
    for (let timer = game.gt.timer_base; timer; timer = timer.next) {
        if (timer.func_index === SHRINK_GLOB && timer.arg === survivor)
            timers.push(timer);
        if (entry.merged) assert.notEqual(timer.arg?.o_id, incomingId);
    }
    assert.equal(timers.length, 1);
    if (entry.neighborType) {
        const [retained, extraOther] = floorGlobs(entry.neighborType);
        assert.equal(extraOther, undefined);
        assert.equal(retained.o_id, otherId);
        assert.equal(retained.owt, otherWeight);
        assert.equal(retained.timed, 1); // Different types keep separate timers.
    }
    assert.equal(game.moves, priorMoves + 1); // Ordinary drop consumes one turn.
    for (let obj = game.invent; obj; obj = obj.nobj)
        assert.notEqual(obj.o_id, incomingId);
    console.log(`${entry.name}: correct floor survivor, combined weight and shrink timer`);
}

export async function verifyDropCommandSegment(segment) {
    const glob = GLOB_DROP_CASES.find(entry => {
        const input = loadGlobDropRecipe(entry.name).segments[0];
        return input.seed === segment.seed && input.moves === segment.moves;
    });
    if (glob) return verifyGlobDropSegment(segment, glob);
    const engraved = ENGRAVING_DROP_CASES.find(entry =>
        loadEngravingDropRecipe(entry.name).segments[0].seed === segment.seed);
    if (engraved) {
        // Stop before the final command to capture the source engraving data.
        const command = segment.moves.lastIndexOf('dd');
        assert.ok(command >= 0, 'the starting ration d is explicitly dropped');
        await runSegment({ ...segment, moves: segment.moves.slice(0, command) });
        const engraving = engr_at(game.u.ux, game.u.uy, game);
        assert.ok(engraving, 'production engraving completed before the drop');
        assert.equal(engraving.engr_type, engraved.type);
        assert.equal(engraving.engr_txt[0], engraved.text);
        const before = structuredClone(engraving);
        const priorMoves = game.moves;
        let boundary = null;
        await runSegment(segment, { onBoundary: error => { boundary = error; } });
        assert.equal(boundary, null);
        const after = engr_at(game.u.ux, game.u.uy, game);
        assert.deepEqual(after, before, 'ordinary placement preserves every engraving field');
        const dropped = floorPile(game).find(obj => obj.invlet === 'd');
        assert.ok(dropped, 'the starting ration left inventory for the floor');
        assert.equal(dropped.where, OBJ_FLOOR);
        assert.ok(!inventoryLetters(game).includes('d'));
        // do.c:drop returns ECMD_TIME; the live command spends one turn.
        assert.equal(game.moves, priorMoves + 1);
        return;
    }
    const entry = caseForSegment(segment);
    // The pack and pile as the drop finds them, so a letter that stayed is
    // distinguishable from one that never existed.
    await runSegment({ ...segment, moves: START + (entry.setup ?? '') });
    const before = inventoryLetters(game);
    const pileBefore = floorPile(game).length;
    if (pileBefore !== (entry.pileBefore ?? 0)) {
        throw new Error(
            `${entry.label}: the drop starts on a pile of ${pileBefore}`,
        );
    }
    if (entry.floor && !before.includes(entry.floor))
        throw new Error(`${entry.label}: the pack has no '${entry.floor}'`);
    if (entry.slot && !game[entry.slot])
        throw new Error(`${entry.label}: ${entry.slot} is empty before the drop`);

    let boundary = null;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    if (boundary) throw boundary;

    const after = inventoryLetters(game);
    const pile = floorPile(game);
    if (entry.mergedQuantity !== undefined) {
        if (pile.length !== 1 || pile[0].quan !== entry.mergedQuantity) {
            throw new Error(
                `${entry.label}: floor holds ${pile.length} node(s), `
                + `quantity ${pile.map((obj) => obj.quan).join('/')}`,
            );
        }
        return;
    }
    if (entry.floor === null) {
        if (pile.length !== pileBefore)
            throw new Error(`${entry.label}: a refused drop left the object`);
        if (after.join('') !== before.join(''))
            throw new Error(`${entry.label}: a refused drop changed the pack`);
        return;
    }
    if (pile.length !== pileBefore + 1)
        throw new Error(`${entry.label}: floor holds ${pile.length} node(s)`);
    if (pile[0].where !== OBJ_FLOOR
        || pile[0].ox !== game.u.ux || pile[0].oy !== game.u.uy) {
        throw new Error(`${entry.label}: dropped object is not on this square`);
    }
    if (after.includes(entry.floor))
        throw new Error(`${entry.label}: '${entry.floor}' is still carried`);
    if (entry.slot && game[entry.slot])
        throw new Error(`${entry.label}: ${entry.slot} still holds the object`);
    if (entry.slot && pile[0].owornmask)
        throw new Error(`${entry.label}: the dropped object is still worn`);
}

export async function runDropCommandMatrix() {
    const engravingEntries = ENGRAVING_DROP_CASES.map(entry => ({
        label: entry.name, recipe: loadEngravingDropRecipe(entry.name),
    }));
    const result = await runFreshMatrix({
        entries: process.env.DROP_GLOB_ONLY
            ? GLOB_DROP_CASES.map(entry => ({ label: entry.name,
                recipe: loadGlobDropRecipe(entry.name) }))
            : process.env.DROP_ENGRAVING_ONLY ? engravingEntries : [
            { label: 'drop command', recipe: loadDropCommandRecipe() },
            { label: 'drop loadstone', recipe: loadDropLoadstoneRecipe() },
            { label: 'drop meat ring', recipe: loadDropMeatRingRecipe() },
            { label: 'drop merge', recipe: loadDropMergeRecipe() },
            ...engravingEntries,
            ...GLOB_DROP_CASES.map(entry => ({ label: entry.name,
                recipe: loadGlobDropRecipe(entry.name) })),
        ],
        summaryLabel: 'DROP COMMAND',
        verifySegment: verifyDropCommandSegment,
        runDifferentialFn: async recipe => {
            const entry = ENGRAVING_DROP_CASES.find(candidate =>
                loadEngravingDropRecipe(candidate.name).segments[0].seed
                    === recipe.segments[0].seed);
            const globEntry = GLOB_DROP_CASES.find(candidate => {
                const input = loadGlobDropRecipe(candidate.name).segments[0];
                return input.seed === recipe.segments[0].seed
                    && input.moves === recipe.segments[0].moves;
            });
            let recording;
            const differential = await runDifferential(recipe, process.env, {
                transformRecording: raw => {
                    recording = raw;
                    return raw;
                },
            });
            if (globEntry && differential.passed) {
                mkdirSync('recordings/do.c', { recursive: true });
                writeFileSync(`recordings/do.c/${globEntry.name}.session.json`,
                    JSON.stringify(recording, null, 2) + '\n');
            }
            if (entry) {
                mkdirSync('.cache/drop-engraving-fresh', { recursive: true });
                writeFileSync(`.cache/drop-engraving-fresh/${entry.name}.json`,
                    JSON.stringify(differential, null, 2) + '\n');
                if (differential.passed) {
                    mkdirSync('recordings/do.c', { recursive: true });
                    writeFileSync(`recordings/do.c/${entry.name}.session.json`,
                        JSON.stringify(recording, null, 2) + '\n');
                }
            }
            return differential;
        },
    });
    return result;
}

runMatrixCli(import.meta.url, runDropCommandMatrix, 'drop command');
