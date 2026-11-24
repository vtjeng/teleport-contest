// dungeon.c builds_up() calls impossible() for a level of dungeon -1, and C
// reaches it from every level_difficulty() call made while the hero is
// there. impossible() waits for keys, so the port can print it where C does
// only on a path that can wait. Each function on that path is written once as
// a `*_steps` generator (js/source_steps.js): a caller that can wait drives
// it with finish_steps(..., impossible_printer(state)) or `yield*`; the
// synchronous form under the C name queues the report instead
// (sync_impossible()), which prints it at the next message, not at C's
// point.
//
// This check keeps the late print from spreading or coming back:
// - every call of a synchronous form is listed below with the reason it
//   cannot wait yet, so a new one, or a converted path going back to a
//   synchronous call, fails; a listed call that is gone fails too, so the
//   list only shrinks;
// - every call of a step generator is driven (`yield*` or finish_steps()),
//   since a generator that is called and dropped runs none of its body.
//
// .cache/lead/wt-levdiff-notes/DESIGN.md (not in the repository) has the
// call graph this list came from.
//
// light.c del_light_source() uses the same pattern for its two impossible()
// reports, so its synchronous form and step generator are listed here too.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// Synchronous forms: each runs its *_steps twin with sync_impossible, which
// queues the report for the next message.
const SYNC_FORMS = new Set([
    'builds_up',
    'level_difficulty',
    'adj_lev',
    'newmonhp',
    'rndmonst_adj',
    'rndmonst',
    'mkclass',
    'mkclass_aligned',
    'courtmon',
    'morguemon',
    'squadmon',
    'antholemon',
    'del_light_source',
    'abon',
    'dprince',
    'dlord',
    'llord',
    'lminion',
    'ndemon',
    'print_mapseen',
    'dosdoor',
    'dodoor',
    'makecorridors',
]);

// Step generators: each must be driven by its caller.
const STEP_FORMS = new Set([
    'builds_up_steps',
    'level_difficulty_steps',
    'adj_lev_steps',
    'newmonhp_steps',
    'rndmonst_adj_steps',
    'rndmonst_steps',
    'mkclass_steps',
    'mkclass_aligned_steps',
    'courtmon_steps',
    'morguemon_steps',
    'squadmon_steps',
    'antholemon_steps',
    'mk_zoo_thronemon_steps',
    'mkswamp_steps',
    'fill_ordinary_room_steps',
    'choose_stairs_steps',
    'abon_steps',
    'dprince_steps',
    'dlord_steps',
    'llord_steps',
    'lminion_steps',
    'ndemon_steps',
    'print_mapseen_steps',
    'traverse_mapseenchn_steps',
    'dosdoor_steps',
    'dodoor_steps',
    'join_steps',
    'makecorridors_steps',
    'fill_zoo_steps',
    'm_initinv_steps',
    'makemon_steps',
    'finishMonsterInventoryAndStrategySteps',
    'updateDunlevReachedSteps',
    'del_light_source_steps',
]);

// "<file> | <enclosing function> | <callee>": [count, reason]. Each reason
// says why the call cannot wait, or why it never reports. A level of dungeon
// -1 is reached in debug play by a wished magic portal (see
// recordings/mkroom.c/mkundead-cursed-bell-dungeon-minus-one), and
// dungeon -1 has no themed rooms. #wizmap on the levels of
// recordings/weapon.c/abon-polymorphed-hero-dungeon-minus-one and
// recordings/mon.c/newcham-newmonhp-dungeon-minus-one, in the port's
// replay, whose screens match C's up to the arrival, shows about ten rooms
// with no door, corridor, object or trap: the rooms are not filled
// (FILL_NONE) and makecorridors() joins none of them. That is an
// observation of two levels, not a proof for every jingle.
const NO_FILL = 'level creation for a FILL_NORMAL room (mklev.c '
    + 'fill_ordinary_room()), a maze or a level program; the dungeon -1 '
    + 'levels seen have no filled room, so it does not run there';
const LEVEL_PROGRAM = 'a level program\'s des.monster() body, which is '
    + 'synchronous; on a dungeon -1 level only #wizloadlua (wizcmds.c '
    + 'wiz_load_lua()) runs a level program. Converting it means making '
    + 'sp_lev.c create_monster() a step generator';
const OBJECT_CREATION = 'mksobj() and mkobj() are synchronous (89 and 35 '
    + 'calls in js/, with 54 mksobj_at() and 13 mkobj_at()); C reaches it '
    + 'on a dungeon -1 level through a wished statue, box or gold, and the '
    + 'port prints the report at the next message. Converting it means '
    + 'step generators for object creation';
const ALLOWED = {
    'makemon.js | rndmonst | rndmonst_adj': [1,
        'the synchronous form of rndmonst_steps(); no game code calls it'],
    'makemon.js | mkclass | mkclass_aligned': [1,
        'the synchronous form of mkclass_steps(); its game callers are '
            + 'listed below'],
    'makemon.js | qt_montype | mkclass': [1,
        'runs only in the quest dungeon, where builds_up() finds the branch'],
    'makemon.js | rndmonnum_adj | rndmonst_adj': [1,
        `a statue, figurine or corpse species from mksobj(); ${OBJECT_CREATION}`],
    'mklev.js | dispatch_themeroom | level_difficulty': [1,
        'themed rooms come only from mklev.c makerooms() for a dungeon with '
            + 'a themerms file; dungeon -1 has none'],
    'mklev.js | makerooms | level_difficulty': [1,
        'called only when the dungeon has Lua themed rooms; dungeon -1 has none'],
    'extralev.js | roguecorr | dodoor': [4,
        'extralev.c roguecorr() runs only on the Rogue level, in the main '
            + 'dungeon, where builds_up() finds the branch'],
    'mklev.js | dodoor | dosdoor': [1,
        'the synchronous form, for roguecorr() above; mklev.c join() drives '
            + 'dodoor_steps()'],
    'mklev.js | create_corridor | makecorridors': [1,
        'a level program\'s des.corridor() with a random source (sp_lev.c '
            + 'create_corridor()), which is synchronous; on a dungeon -1 level '
            + 'only #wizloadlua runs a level program'],
    'mklev.js | createSpecialLevelApi | mkclass': [1, LEVEL_PROGRAM],
    'mklev.js | mausoleum | mkclass': [1,
        'the themerms.lua "Mausoleum" room, made only by mklev.c makerooms() '
            + 'for a dungeon with a themerms file; dungeon -1 has none'],
    'quest_levels.js | oracle | mkclass': [1,
        `oracle.lua's centaurs; ${LEVEL_PROGRAM}`],
    'themeroom_fill.js | createMonsterBody | mkclass': [1, LEVEL_PROGRAM],
    'shknam.js | mkshobj_at | mkclass': [1,
        'a shop is stocked only for a room with one door (mkroom.c '
            + 'mkshop()); a dungeon -1 level has no door'],
    'mktrap.js | mktrap_steps | level_difficulty': [1, NO_FILL],
    'mktrap.js | mktrap_victim | level_difficulty': [1, NO_FILL],
    'mktrap.js | traptype_rnd | level_difficulty': [1, NO_FILL],
    'room_features.js | mkgrave | level_difficulty': [1, NO_FILL],
    'monster_object.js | initializeStatue | level_difficulty': [1, OBJECT_CREATION],
    'obj.js | mkbox_cnts | level_difficulty': [1, OBJECT_CREATION],
    'obj.js | mkgold | level_difficulty': [1,
        `only mkgold(0, ...) reads it; ${OBJECT_CREATION}`],
    // light.c del_light_source()'s impossible() reports. Each of these
    // deletes a source that its owner's creation made, so no recording
    // reaches the report on these paths.
    'obj.js | dealloc_obj | del_light_source': [1,
        'dealloc_obj() is synchronous, with 21 calls, and obfree() above '
            + 'it has 62'],
    'timeout.js | objectLightDeletion | del_light_source': [1,
        'end_burn() and the timer cleanup run their light deletion '
            + 'synchronously'],
    'mon.js | m_detach | del_light_source': [1,
        'm_detach() is synchronous for mongone(), which has 30 calls'],
    'themeroom_fill.js | createMonsterBody | del_light_source': [1,
        `a level program's or themed room's shapechanger; ${LEVEL_PROGRAM}`],
};

// Entries and calls in ALLOWED, pinned both ways (scripts/exception-count.mjs).
// 35 entries holding 39 calls on branch levdiff (11 November 2026); 39 and 43
// once light.c del_light_source() joined (15 November 2026); 38 and 42
// since mkroom.c mkundead() drives the steps (22 November 2026,
// recordings/mkroom.c/mkundead-cursed-bell-dungeon-minus-one.session.json).
// 33 and 35 on branch sync-discards (23 November 2026): 17 entries holding
// 19 calls went, since every `async` caller drives the steps (dowaterdemon(),
// disarm_box(), untrap(), b_trapped(), m_respond_shrieker(), really_done(),
// pick_familiar_pm(), muse_newcham_mon(), mon_arrive()) and mkroom.c
// fill_zoo() and its species pickers are step generators that
// fill_special_room() waits for; 12 came in, the synchronous callers of
// mkclass() and mkclass_aligned(), which this check did not follow before.
// 32 and 34 since mkroom.c mkswamp() is a step generator that makelevel()
// waits for (same branch). 31 and 33 since mklev.c fill_ordinary_room() is
// a step generator that makelevel() waits for (branch small-leftovers-2,
// 24 November 2026). 25 and 28 on the same branch: 9 entries holding 11
// calls went, since every caller of wizard.c choose_stairs(), weapon.c
// abon(), the minion.c selectors, dungeon.c print_mapseen() and
// mklev.c makeniche()'s and join()'s dosdoor() waits, and mon.c newcham()
// prints newmonhp()'s report through its caller's onImpossible; 3 entries
// holding 6 calls came in, the synchronous callers of dosdoor(), dodoor()
// and makecorridors(), which this check did not follow before.
const ALLOWED_PINS = { entries: 25, calls: 28 };

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

// The outermost named function around a node, or <module>: a helper
// closure's call belongs to the function that runs it.
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

// The synchronous-form calls in `source`, as { key: count }, and the step
// generator calls that nothing drives, as "file:line callee".
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
            const driven = parent?.type === 'CallExpression'
                && calleeName(parent.callee) === 'finish_steps'
                && parent.arguments[0] === node;
            if (!delegated && !driven)
                undriven.push(`${file}:${node.loc.start.line} ${name}`);
        }
    });
    return { syncCalls, undriven };
}

function scanJs() {
    const syncCalls = {};
    const undriven = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
        const found = scanSource(file, readFileSync(join(JS_DIR, file), 'utf8'));
        Object.assign(syncCalls, found.syncCalls);
        undriven.push(...found.undriven);
    }
    return { syncCalls, undriven };
}

test('every synchronous level_difficulty()/builds_up()/del_light_source() path is listed', () => {
    const { syncCalls } = scanJs();
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
    assert.deepEqual(problems, []);
});

test('the list holds the pinned number of entries and calls', () => {
    const entries = Object.values(ALLOWED);
    assertExceptionCount(entries.length, ALLOWED_PINS.entries, {
        what: 'listed synchronous sites',
        pin: 'ALLOWED_PINS.entries in scripts/level-difficulty-steps.test.mjs',
    });
    assertExceptionCount(
        entries.reduce((sum, [count]) => sum + count, 0),
        ALLOWED_PINS.calls,
        {
            what: 'listed synchronous calls',
            pin: 'ALLOWED_PINS.calls in scripts/level-difficulty-steps.test.mjs',
        },
    );
    for (const [key, [, reason]] of Object.entries(ALLOWED))
        assert.ok(reason?.trim(), `no reason: ${key}`);
});

test('every step generator call is driven', () => {
    assert.deepEqual(scanJs().undriven, []);
});

test('the scan finds synchronous calls and undriven generators', () => {
    const source = [
        'export async function caller(state) {',
        '    const a = level_difficulty(state);', // synchronous form
        '    const b = await finish_steps(level_difficulty_steps(state), p);',
        '    level_difficulty_steps(state);', // dropped generator
        '    return a + b;',
        '}',
        'function* body(state) {',
        '    const helper = () => rndmonst({ state });', // closure: body's
        '    return (yield* adj_lev_steps(state)) + helper();',
        '}',
    ].join('\n');
    assert.deepEqual(scanSource('x.js', source), {
        syncCalls: {
            'x.js | caller | level_difficulty': 1,
            'x.js | body | rndmonst': 1,
        },
        undriven: ['x.js:4 level_difficulty_steps'],
    });
});
