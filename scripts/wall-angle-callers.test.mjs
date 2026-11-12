// display.c wall_angle() prints impossible() for a wall whose wall_info mode
// its type does not know ("wall_angle: unknown vwall mode 4"), and for a T
// wall or crosswall whose seen vector its mode cannot draw. A level program
// that #wizloadlua runs leaves such walls: it puts walls on the current level
// without set_wall_state(), so a square that held a closed door keeps
// D_CLOSED, mode 4. C reaches wall_angle() through back_to_glyph() whenever a
// seen wall is drawn from the map. impossible() waits for keys, so, as for
// resists_blnd() (scripts/resists-blnd-callers.test.mjs), each function on
// the paths below is written once as a `*_steps` generator
// (js/source_steps.js), and a caller that can wait drives it with
// finish_steps(..., impossible_printer(state)) or `yield*`:
// - detect.c do_mapping() and do_vicinity_map(), and zap.c zap_map(),
//   through show_map_spot() -> magic_map_background() -> back_to_glyph();
// - detect.c reveal_terrain() (#terrain) through reveal_terrain_getglyph();
// - getpos.c getpos()'s feature-symbol scan (travel's _< and _>);
// - display.c flash_glyph_at(), hack.c test_move()'s mention_walls
//   message and domove_fight_empty(), and detect.c findone() and
//   furniture_detect().
// The synchronous form under the C name runs its twin with no printer and
// records the print as a gap.
//
// This check keeps the gap from spreading or coming back:
// - every call of a synchronous form in js/ is listed below with the reason
//   it is still synchronous or cannot reach the print, so a new one, or a
//   converted caller going back to the synchronous form, fails; a listed
//   call that is gone fails too;
// - every call of a step generator is driven by `yield*` or by
//   finish_steps() with an onImpossible; only the synchronous form of the
//   same function may drive it without one.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { parse } from 'acorn';

import {
    CROSSWALL, HWALL, SVALL, TDWALL, TLCORNER, VWALL,
} from '../js/const.js';
import { wall_angle_steps } from '../js/display.js';
import { ImpossibleCall } from '../js/source_steps.js';
import { S_stone } from '../js/symbols.js';

// Synchronous forms: each runs its *_steps twin with gap_impossible().
const SYNC_FORMS = new Set([
    'wall_angle',
    'back_to_glyph',
    'magic_map_background',
    'show_map_spot',
    'reveal_terrain_getglyph',
]);

// Step generators: each must be driven by its caller.
const STEP_FORMS = new Set([
    'wall_angle_steps',
    'back_to_glyph_steps',
    'magic_map_background_steps',
    'show_map_spot_steps',
    'reveal_terrain_getglyph_steps',
    'findTerrainFeature_steps',
]);

// "<file> | <outermost named function> | <synchronous form>": [count, reason].
const ALLOWED = {
    'display.js | map_background | back_to_glyph': [1,
        'map_background() is synchronous, and so are its callers: '
        + 'map_location(), the region and lighting redraws in display.js, '
        + 'do.js, sit.js and mklev.js; a known gap'],
    'display.js | newsym | back_to_glyph': [1,
        'newsym() is synchronous, and vision_recalc() calls it for every '
        + 'square that comes into view, which is how most moves after such '
        + 'a #wizloadlua reach wall_angle() in C; the port also computes '
        + 'the background of squares out of sight, where C\'s newsym() '
        + 'never calls back_to_glyph(), so it cannot print here as it is; '
        + 'a known gap'],
    'detect.js | mappedSearchLayer | back_to_glyph': [1,
        'automatic search maps only a door or corridor it converted, or a '
        + 'trap square'],
    'getpos.js | gloc_filter_floodfill_matcharea | back_to_glyph': [1,
        'the getpos area filter (getloc_filter=area) floods through a '
        + 'synchronous selection callback; a known gap'],
    'getpos.js | gloc_filter_floodfill | back_to_glyph': [1,
        'the getpos area filter (getloc_filter=area) floods through a '
        + 'synchronous selection callback; a known gap'],
    'sp_lev.js | flip_visuals | back_to_glyph': [1,
        'flip_level() is synchronous; #wizfliplevel after such a '
        + '#wizloadlua reaches it; a known gap'],
};

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function isNode(value) {
    return value && typeof value.type === 'string';
}

function walk(node, visit, ancestors = []) {
    visit(node, ancestors);
    ancestors.push(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, visit, ancestors);
        } else if (isNode(value)) {
            walk(value, visit, ancestors);
        }
    }
    ancestors.pop();
}

// The outermost named function around a node, or <module>.
function enclosingName(ancestors) {
    for (let i = 0; i < ancestors.length; i++) {
        const node = ancestors[i];
        if (!FUNCTION_TYPES.has(node.type)) continue;
        const parent = ancestors[i - 1];
        const own = node.id?.name
            ?? (parent?.type === 'VariableDeclarator' ? parent.id?.name : null);
        if (own) return own;
    }
    return '<module>';
}

function calleeName(callee) {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed)
        return callee.property.name;
    return null;
}

export function scanSource(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const syncCalls = {};
    const undriven = [];
    walk(ast, (node, ancestors) => {
        if (node.type !== 'CallExpression') return;
        const name = calleeName(node.callee);
        if (SYNC_FORMS.has(name)) {
            const key = `${file} | ${enclosingName(ancestors)} | ${name}`;
            syncCalls[key] = (syncCalls[key] ?? 0) + 1;
        } else if (STEP_FORMS.has(name)) {
            const parent = ancestors[ancestors.length - 1];
            const delegated = parent?.type === 'YieldExpression' && parent.delegate;
            const finished = parent?.type === 'CallExpression'
                && calleeName(parent.callee) === 'finish_steps'
                && parent.arguments[0] === node;
            const printed = finished && parent.arguments.length > 1;
            const ownSyncForm = finished
                && `${enclosingName(ancestors)}_steps` === name;
            if (!delegated && !printed && !ownSyncForm)
                undriven.push(`${file}:${node.loc.start.line} ${name}`);
        }
    });
    return { syncCalls, undriven };
}

function scanJs() {
    const dir = new URL('../js/', import.meta.url);
    const syncCalls = {};
    const undriven = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
        const found = scanSource(file, readFileSync(new URL(file, dir), 'utf8'));
        Object.assign(syncCalls, found.syncCalls);
        undriven.push(...found.undriven);
    }
    return { syncCalls, undriven };
}

// Function that only checks a found-calls map against ALLOWED.
function problemsFor(syncCalls) {
    const problems = [];
    for (const [key, count] of Object.entries(syncCalls)) {
        const entry = ALLOWED[key];
        if (!entry) {
            problems.push(`new: ${key} (${count}); drive the *_steps form `
                + 'from a caller that can wait, or list it with a reason');
        } else if (entry[0] !== count) {
            problems.push(`changed: ${key} (${entry[0]} -> ${count})`);
        }
    }
    for (const key of Object.keys(ALLOWED))
        if (!Object.hasOwn(syncCalls, key)) problems.push(`stale: ${key}; remove it`);
    return problems;
}

test('every synchronous wall_angle() path is listed', () => {
    assert.deepEqual(problemsFor(scanJs().syncCalls), []);
    for (const [key, [, reason]] of Object.entries(ALLOWED))
        assert.ok(reason?.trim(), `no reason: ${key}`);
});

test('every step generator call is driven', () => {
    assert.deepEqual(scanJs().undriven, []);
});

test('the scan reports each bypass', () => {
    const source = [
        'export async function do_mapping(state) {',
        // A converted caller going back to the synchronous form.
        '    show_map_spot(1, 2, false, state);',
        // A generator that is called and dropped runs none of its body.
        '    reveal_terrain_getglyph_steps(1, 2, false, 0, 0, state);',
        // Driven, but with no printer: the impossible() becomes a gap.
        '    await finish_steps(show_map_spot_steps(1, 2, false, state));',
        '}',
        // The synchronous form may run its own twin without a printer.
        'export function back_to_glyph(x, y, state) {',
        '    return finish_steps(back_to_glyph_steps(x, y, state));',
        '}',
        'function* back_to_glyph_steps(x, y, state) {',
        '    return yield* wall_angle_steps(state.level.at(x, y));',
        '}',
    ].join('\n');
    const found = scanSource('detect.js', source);
    assert.deepEqual(found.syncCalls, { 'detect.js | do_mapping | show_map_spot': 1 });
    assert.deepEqual(found.undriven, [
        'detect.js:3 reveal_terrain_getglyph_steps',
        'detect.js:4 show_map_spot_steps',
    ]);
    assert.ok(problemsFor({ ...found.syncCalls })
        .some((line) => line.startsWith('new: detect.js | do_mapping')));
});

// The reports display.c wall_angle() makes, read from the source: rm.h's
// WM_MASK keeps 3 bits, a vertical or horizontal wall knows modes 0-2, a
// corner 0, WM_C_OUTER (1) and WM_C_INNER (2), a T wall 0-3 and a
// crosswall 0-6, and t_warn() reports a mode-0 T wall seen from nowhere
// (seenv 0). Each draws stone.
test('wall_angle() yields the impossible() C prints for each wall', () => {
    const run = (loc) => {
        const reports = [];
        const steps = wall_angle_steps(loc);
        for (let step = steps.next(); ; step = steps.next()) {
            if (step.done) return { reports, idx: step.value };
            assert.ok(step.value instanceof ImpossibleCall);
            reports.push(step.value.text);
        }
    };
    const cases = [
        // A closed door's D_CLOSED (4) left under a vertical wall.
        [{ typ: VWALL, flags: 4, seenv: SVALL }, 'wall_angle: unknown vwall mode 4'],
        // D_CLOSED | D_BROKEN, 5, under a horizontal wall.
        [{ typ: HWALL, flags: 5, seenv: SVALL }, 'wall_angle: unknown hwall mode 5'],
        [{ typ: TLCORNER, flags: 3, seenv: SVALL }, 'wall_angle: unknown tlcorn mode 3'],
        [{ typ: TDWALL, flags: 4, seenv: SVALL }, 'wall_angle: unknown T wall mode 4'],
        [{ typ: CROSSWALL, flags: 7, seenv: SVALL }, 'wall_angle: unknown crosswall mode'],
        [{ typ: TDWALL, flags: 0, seenv: 0 }, 'wall_angle: tdwall: case 0: seenv = 0x0'],
    ];
    for (const [loc, text] of cases)
        assert.deepEqual(run(loc), { reports: [text], idx: S_stone }, text);
    // A known mode draws without a report: mode 0 of a seen vertical wall.
    assert.deepEqual(run({ typ: VWALL, flags: 0, seenv: SVALL }).reports, []);
});
