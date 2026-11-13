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
//   furniture_detect();
// - display.c newsym(), through _map_location() for a square the hero can
//   see: vision.c vision_recalc() (every async caller, through
//   vision_recalc_async() or vision_recalc_steps(), and pline.c vpline()'s
//   deferred recalculation), display.c docrt() and see_monsters(), and
//   monmove.c postmov()'s redraw of the square a monster left;
// - display.c feel_location(), from hack.c test_move() for a blind hero.
// The synchronous form under the C name runs its twin with no printer and
// records the print as a gap.
//
// vision_recalc() and see_monsters() draw through newsym_steps() only when
// the redraw a caller injects is newsym itself, so a closure that only
// forwards to newsym() would hide the report; the last check refuses one.
//
// This check keeps the gap from spreading or coming back:
// - every call of a synchronous form in js/ is listed below with the reason
//   it is still synchronous or cannot reach the print, so a new one, or a
//   converted caller going back to the synchronous form, fails; a listed
//   call that is gone fails too;
// - every call of a step generator is driven by `yield*` or by
//   finish_steps() with an onImpossible; only the synchronous form of the
//   same function may drive it without one;
// - newsym() has hundreds of synchronous callers, so its calls are counted
//   per file rather than per function, under one reason;
// - vision_recalc() given an env.onImpossible prints, and is not counted.

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
    'map_background',
    'map_location',
    'feel_location',
    'newsym',
    'vision_recalc',
]);

// Counted per file, under PER_FILE_REASONS.
const PER_FILE_FORMS = new Set(['newsym']);

// Step generators: each must be driven by its caller.
const STEP_FORMS = new Set([
    'wall_angle_steps',
    'back_to_glyph_steps',
    'magic_map_background_steps',
    'show_map_spot_steps',
    'reveal_terrain_getglyph_steps',
    'findTerrainFeature_steps',
    'map_background_steps',
    'map_location_steps',
    'feel_location_steps',
    'newsym_steps',
    'vision_recalc_steps',
]);

// "<file> | <outermost named function> | <synchronous form>": [count, reason],
// or, for a form in PER_FILE_FORMS, "<file> | * | <form>": count, under
// PER_FILE_REASON below.
const ALLOWED = {
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
    'display.js | docrt | vision_recalc': [1,
        'docrt()\'s vision_recalc(2): with nothing in sight, newsym() '
        + 'draws each square from memory and never reaches back_to_glyph()'],
    'display.js | unmap_object | map_background': [1,
        'a square whose remembered object or invisible marker is erased; '
        + 'a wall there needs a #wizloadlua under a remembered object; a '
        + 'known gap'],
    'do.js | flooreffects | map_background': [1,
        'a boulder filling a pool or lava square, never a wall'],
    'mklev.js | premap_detect | map_background': [1,
        'Sokoban premapping at level creation, whose walls set_wall_state() '
        + 'has already given known modes'],
    'sit.js | special_throne_effect | map_background': [1,
        'the throne square and the map a throne reveals; a wall laid with '
        + 'an unknown mode there is a known gap'],
    'sit.js | throne_sit_effect | map_background': [1,
        'the throne square and the map a throne reveals; a wall laid with '
        + 'an unknown mode there is a known gap'],
    'dungeon.js | u_on_newpos | map_location': [1,
        'the hero\'s own square, a wall only for a hero who passes walls; '
        + 'a known gap'],
    'uhitm.js | start_engulf | map_location': [1,
        'the hero\'s own square as an engulfer takes it; a known gap'],
    'vault.js | clear_fcorr | map_location': [1,
        'the guard\'s fake corridor squares, which are corridor or the '
        + 'wall they replaced; a known gap'],
    'display.js | feel_newsym | feel_location': [1,
        'feel_newsym() is synchronous and has many callers; a blind hero '
        + 'feeling such a wall through it is a known gap'],
    'detect.js | defaultFeelSearchLocation | feel_location': [1,
        'a blind hero searching beside such a wall; a known gap'],
    'dokick.js | kick_dumb | feel_location': [1,
        'a blind hero kicking such a wall; a known gap'],
    'dokick.js | kick_ouch | feel_location': [1,
        'a blind hero kicking such a wall; a known gap'],
    'dokick.js | kick_door | feel_location': [1,
        'a door square: back_to_glyph()\'s door arm never reaches '
        + 'wall_angle()'],
    'hack.js | cannot_push_msg | feel_location': [1,
        'a blind hero failing to push a boulder; the boulder square, a '
        + 'wall only after a #wizloadlua; a known gap'],
    'hack.js | dopush | feel_location': [2,
        'a blind hero pushing a boulder into the square beyond; a known gap'],
    'hack.js | moverock_core | feel_location': [4,
        'a blind hero pushing a boulder; a known gap'],
    'hack.js | test_move | feel_location': [2,
        'a closed door or a doorway entered diagonally: back_to_glyph()\'s '
        + 'door arm never reaches wall_angle()'],
    'lock.js | pick_lock | feel_location': [1,
        'a blind hero applying a lock pick to a square without a door; a '
        + 'known gap'],
    'lock.js | doclose | feel_location': [1,
        'a blind hero closing a square without a door; a known gap'],
    'apply.js | * | newsym': 5,
    'artifacts.js | * | newsym': 1,
    'ball.js | * | newsym': 10,
    'bones.js | * | newsym': 1,
    'bury.js | * | newsym': 1,
    'dbridge.js | * | newsym': 6,
    'detect.js | * | newsym': 11,
    'dig.js | * | newsym': 7,
    'display.js | * | newsym': 10,
    'do.js | * | newsym': 4,
    'do_wear.js | * | newsym': 1,
    'dog.js | * | newsym': 3,
    'dokick.js | * | newsym': 11,
    'dothrow.js | * | newsym': 4,
    'eat.js | * | newsym': 4,
    'fountain.js | * | newsym': 8,
    'getpos.js | * | newsym': 1,
    'hack.js | * | newsym': 11,
    'lock.js | * | newsym': 2,
    'makemon.js | * | newsym': 1,
    'makemon_create.js | * | newsym': 2,
    'minion.js | * | newsym': 1,
    'mkmaze.js | * | newsym': 2,
    'mon.js | * | newsym': 9,
    'monmove.js | * | newsym': 4,
    'muse.js | * | newsym': 7,
    'music.js | * | newsym': 3,
    'nhlua.js | * | newsym': 1,
    'obj.js | * | newsym': 2,
    'pickup.js | * | newsym': 1,
    'polyself.js | * | newsym': 7,
    'potion.js | * | newsym': 3,
    'pray.js | * | newsym': 4,
    'priest.js | * | newsym': 1,
    'read.js | * | newsym': 1,
    'region.js | * | newsym': 1,
    'shk.js | * | newsym': 4,
    'shknam.js | * | newsym': 2,
    'sit.js | * | newsym': 3,
    'steed.js | * | newsym': 2,
    'teleport.js | * | newsym': 4,
    'trap.js | * | newsym': 5,
    'trap_effects.js | * | newsym': 6,
    'uhitm.js | * | newsym': 2,
    'vault.js | * | newsym': 15,
    'worm.js | * | newsym': 6,
    'worn.js | * | newsym': 1,
    'zap.js | * | newsym': 16,
};

// The reason for every newsym() entry above. C prints wall_angle()'s
// impossible() from newsym() for a square in sight that is a seen wall with a
// mode wall_angle() cannot draw, which only a #wizloadlua or #wizloaddes
// level program leaves. These callers redraw a square their own code changed
// and draw synchronously, so such a report there is a known gap; an async
// caller that meets one awaits newsym_async() instead, as monmove.js
// postmov() does.
const PER_FILE_REASON = 'newsym() of a square the caller changed; '
    + 'a known gap for a seen wall laid with an unknown mode';

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

// True for vision_recalc(control, { ..., onImpossible }), which prints.
function passesPrinter(node) {
    return node.arguments.some((arg) => arg.type === 'ObjectExpression'
        && arg.properties.some((property) => property.type === 'Property'
            && !property.computed && property.key.name === 'onImpossible'));
}

// True for a function whose whole body calls newsym() with its own
// parameters in order, such as `(x, y) => newsym(x, y, state)`.
function forwardsToNewsym(node) {
    if (!FUNCTION_TYPES.has(node.type)) return false;
    let call = node.body;
    if (call.type === 'BlockStatement') {
        if (call.body.length !== 1) return false;
        const [statement] = call.body;
        call = statement.type === 'ExpressionStatement' ? statement.expression
            : statement.type === 'ReturnStatement' ? statement.argument : null;
    }
    if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier'
        || call.callee.name !== 'newsym') return false;
    return node.params.length >= 2
        && node.params.slice(0, 2).every((param, i) =>
            param.type === 'Identifier'
            && call.arguments[i]?.type === 'Identifier'
            && call.arguments[i].name === param.name);
}

export function scanSource(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const syncCalls = {};
    const undriven = [];
    const forwarders = [];
    walk(ast, (node, ancestors) => {
        if (forwardsToNewsym(node))
            forwarders.push(`${file}:${node.loc.start.line}`);
        if (node.type !== 'CallExpression') return;
        const name = calleeName(node.callee);
        if (SYNC_FORMS.has(name)) {
            if (name === 'vision_recalc' && passesPrinter(node)) return;
            const where = PER_FILE_FORMS.has(name)
                ? '*' : enclosingName(ancestors);
            const key = `${file} | ${where} | ${name}`;
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
    return { syncCalls, undriven, forwarders };
}

function scanJs() {
    const dir = new URL('../js/', import.meta.url);
    const syncCalls = {};
    const undriven = [];
    const forwarders = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
        const found = scanSource(file, readFileSync(new URL(file, dir), 'utf8'));
        Object.assign(syncCalls, found.syncCalls);
        undriven.push(...found.undriven);
        forwarders.push(...found.forwarders);
    }
    return { syncCalls, undriven, forwarders };
}

// Function that only checks a found-calls map against ALLOWED.
function problemsFor(syncCalls) {
    const problems = [];
    for (const [key, count] of Object.entries(syncCalls)) {
        const entry = ALLOWED[key];
        const expected = Array.isArray(entry) ? entry[0] : entry;
        if (entry === undefined) {
            problems.push(`new: ${key} (${count}); drive the *_steps form `
                + 'from a caller that can wait, or list it with a reason');
        } else if (expected !== count) {
            problems.push(`changed: ${key} (${expected} -> ${count})`);
        }
    }
    for (const key of Object.keys(ALLOWED))
        if (!Object.hasOwn(syncCalls, key)) problems.push(`stale: ${key}; remove it`);
    return problems;
}

test('every synchronous wall_angle() path is listed', () => {
    assert.deepEqual(problemsFor(scanJs().syncCalls), []);
    for (const [key, entry] of Object.entries(ALLOWED)) {
        const perFile = key.split(' | ')[1] === '*';
        assert.equal(Array.isArray(entry), !perFile, `wrong shape: ${key}`);
        const reason = perFile ? PER_FILE_REASON : entry[1];
        assert.ok(reason?.trim(), `no reason: ${key}`);
    }
});

test('every step generator call is driven', () => {
    assert.deepEqual(scanJs().undriven, []);
});

// vision_recalc(), see_monsters(), newsym_async() and postmov() print
// through newsym_steps() only when the injected redraw is newsym itself.
test('no closure stands in for newsym()', () => {
    assert.deepEqual(scanJs().forwarders, [],
        'pass newsym itself: a closure that only forwards to it draws '
        + 'synchronously, and wall_angle()\'s impossible() becomes a gap');
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

test('the scan counts newsym() per file and finds stand-ins', () => {
    const source = [
        'export async function domove(state) {',
        '    newsym(1, 2);',
        // An injected newsym is counted with the direct calls.
        '    env.newsym(1, 2);',
        // A recalculation given a printer prints.
        '    await vision_recalc(0, { state, onImpossible: printer });',
        // One that is not draws synchronously.
        '    vision_recalc(0, { state });',
        '    see_monsters(state, { redraw: (x, y) => newsym(x, y, state) });',
        // Forwarding to an injected operation is not a stand-in.
        '    const op = (x, y) => hooks.newsym(x, y, state);',
        '}',
        'function teleds(state) {',
        '    newsym(3, 4);',
        '}',
    ].join('\n');
    const found = scanSource('hack.js', source);
    // Five: the two direct calls, the call inside each closure and teleds().
    assert.deepEqual(found.syncCalls, {
        'hack.js | * | newsym': 5,
        'hack.js | domove | vision_recalc': 1,
    });
    assert.deepEqual(found.forwarders, ['hack.js:6']);
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
