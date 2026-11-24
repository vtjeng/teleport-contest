// C's ga ... gz groups (decl.h struct instance_globals_a ... _z) start from
// the g_init_a ... g_init_z initializers in decl.c, which
// decl_globals_init() copies in once per process: mostly zero, but -1 for
// gp.polearm_range_min, WIN_ERR for gc.cached_pickinv_win and NON_PM for
// gc.corpsenm_digested. No group is saved, so a restored game starts from
// the same values. The port once built each group member by member, so a
// member read before it was first written was `undefined`: not `=== 0`, not
// `< 0`, NaN after `++`. zap.c do_osshock() tests `gp.poly_zapped < 0`, and
// the port took the missing member for "not yet set" and drew rn2() where C,
// reading 0, does not.
//
// js/gstate.js now creates the groups at process start from js/decl.js
// initial_instance_globals(), generated from decl.h and decl.c, and
// js/options.js defaultResult() starts the groups it parses into from the
// same values. These tests keep it that way for the integer, boolean and
// enumeration members the port holds in a group, and for the 33 scalars it
// reads directly off the game state (state.multi for gm.multi), which
// initial_state_held_globals() starts. The pointer, array, struct and char
// members stay with the functions that own them, and so do five state
// members another object owns (OWNED_ELSEWHERE).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { COLNO, ROWNO, SELL_NORMAL, WIN_ERR } from '../js/const.js';
import {
    INSTANCE_GLOBALS,
    initial_instance_globals,
    initial_state_held_globals,
} from '../js/decl.js';
import { game, initialGb, resetGame } from '../js/gstate.js';
import { runSegmentStrict } from '../js/jsmain.js';
import { NON_PM } from '../js/monsters.js';
import { STRANGE_OBJECT } from '../js/objects.js';
import { parseNethackrc } from '../js/options.js';
import { soundlib_nosound } from '../js/sounds.js';
import {
    CONSTANTS,
    GROUP_LETTERS,
    HELD_ON_STATE,
    OWNED_ELSEWHERE,
    collectGroups,
    evaluateInitializer,
    parseInitializers,
    parseMembers,
    readSources,
    render,
} from './generate-instance-globals.mjs';
import { jsFiles, scanFiles } from './state-field-uses.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');
const GROUPS = GROUP_LETTERS.map((letter) => `g${letter}`);

// Every use js/ makes of a group, with the member's row from
// INSTANCE_GLOBALS (or undefined for a name decl.h does not declare).
// js/decl.js itself is the generated table, not a use.
let cachedUses = null;
function groupUses() {
    if (cachedUses) return cachedUses;
    const files = jsFiles(JS_DIR).filter(([name]) => name !== 'decl.js');
    cachedUses = GROUPS.flatMap((group) => scanFiles(files, group).map((use) => {
        const member = use.path.split('.')[0];
        const row = INSTANCE_GLOBALS[group].find(([name]) => name === member);
        return {
            ...use, group, member, held: row?.[3], declared: Boolean(row),
            beyond: use.path.includes('.'),
        };
    }));
    return cachedUses;
}

const generatedNames = (group) => INSTANCE_GLOBALS[group]
    .filter(([, , , held]) => held === 'group').map(([name]) => name);

test('js/decl.js is what decl.h and decl.c generate', () => {
    assert.equal(readFileSync(join(JS_DIR, 'decl.js'), 'utf8'),
        render(collectGroups(...readSources())));
});

test('each member is paired with its initializer by position', () => {
    const groups = collectGroups(...readSources());
    const row = (group, name) => groups[group].find((member) => member.name === name);
    // decl.c:619-620, :254-262 (crash_urlmax after two NULLs), :277, :283:
    // the non-zero starts, each of which a shifted pairing would lose.
    assert.equal(row('gp', 'polearm_range_min').value, -1);
    assert.equal(row('gp', 'polearm_range_max').value, -1);
    assert.equal(row('gc', 'crash_urlmax').value, -1);
    assert.equal(row('gc', 'cached_pickinv_win').initializer, 'WIN_ERR');
    assert.equal(row('gc', 'corpsenm_digested').initializer, 'NON_PM');
    // decl.c:209-211 and decl.h:191-193: bl_hilite_moves exists only under
    // STATUS_HILITES, which this build defines, and both files drop it
    // together otherwise.
    assert.equal(row('gb', 'bl_hilite_moves').initializer, '0L');
    // decl.c:187-191: altpalette exists only under CHANGE_COLOR, which this
    // build does not define, so A_first_hint follows animal_list_count.
    assert.equal(row('ga', 'altpalette'), undefined);
    assert.equal(row('ga', 'A_first_hint').initializer, '0');
    // A pointer, an array, a struct and a char stay with their owners.
    assert.equal(row('ga', 'afternmv').held, 'owner');
    assert.equal(row('gp', 'prevmsg').held, 'owner');
    assert.equal(row('gb', 'bhitpos').held, 'owner');
    assert.equal(row('gs', 'sell_response').held, 'owner');
    // gh.hero_seq (decl.c:394, `1L << 3`) and gl.lastinvnr (51) are held on
    // the state and start there; gt.toptenwin is js/topten.js's list.
    assert.equal(row('gh', 'hero_seq').held, 'state');
    assert.equal(row('gh', 'hero_seq').value, 8);
    assert.equal(row('gl', 'lastinvnr').value, 51);
    assert.equal(row('gt', 'toptenwin').held, 'frame');
    for (const group of GROUPS)
        assert.equal(groups[group].at(-1).name, 'havestate', group);
});

test('the parsers read nested initializers, literals and conditionals', () => {
    const source = [
        'static const struct instance_globals_q g_init_q = {',
        '    { {COLNO, ROWNO, 0, 0}, FALSE }, /* a struct, with commas */',
        '#ifdef CHANGE_COLOR',
        '    { 0U, 0U }, /* dropped: CHANGE_COLOR is not defined */',
        '#endif',
        "    ',', /* a comma in a character literal */",
        '    (COLNO - 1) & ~1, /* an expression */',
        '    TRUE, /* havestate*/',
        '};',
    ].join('\n');
    assert.deepEqual(parseInitializers(source, 'q'), [
        '{ {COLNO, ROWNO, 0, 0}, FALSE }', "','", '(COLNO - 1) & ~1', 'TRUE',
    ]);
    const header = [
        'struct instance_globals_q {',
        '    int (*afternmv)(void);',
        '    struct obj *first, *second;',
        '    coordxy xmin, ymin; /* two on a line */',
        '    char name[BUFSZ];',
        '    const char *text;',
        '    unsigned long mask;',
        '    boolean havestate;',
        '};',
    ].join('\n');
    assert.deepEqual(parseMembers(header, 'q').map(({ name, ctype, kind }) =>
        `${name}:${ctype}:${kind}`), [
        'afternmv:function:pointer', 'first:struct obj:pointer',
        'second:struct obj:pointer', 'xmin:coordxy:value', 'ymin:coordxy:value',
        'name:char:array', 'text:char:pointer', 'mask:unsigned long:value',
        'havestate:boolean:value',
    ]);
    // (80 - 1) & ~1 is 78, and 1L << 3 is 8.
    assert.equal(evaluateInitializer('(COLNO - 1) & ~1', 'test'), 78);
    assert.equal(evaluateInitializer('1L << 3', 'test'), 8);
    assert.equal(evaluateInitializer('0UL', 'test'), 0);
    assert.throws(() => evaluateInitializer('SOME_NEW_NAME', 'test'), /no value for/u);
});

test('the generator\'s constants are the port\'s', () => {
    assert.deepEqual({
        COLNO: CONSTANTS.COLNO, ROWNO: CONSTANTS.ROWNO, NON_PM: CONSTANTS.NON_PM,
        STRANGE_OBJECT: CONSTANTS.STRANGE_OBJECT, WIN_ERR: CONSTANTS.WIN_ERR,
        SELL_NORMAL: CONSTANTS.SELL_NORMAL,
        soundlib_nosound: CONSTANTS.soundlib_nosound,
    }, {
        COLNO, ROWNO, NON_PM, STRANGE_OBJECT, WIN_ERR, SELL_NORMAL, soundlib_nosound,
    });
});

test('the process starts every group from decl.c\'s values', () => {
    const state = resetGame();
    const initial = initial_instance_globals();
    assert.deepEqual(Object.keys(initial), GROUPS);
    for (const group of GROUPS) {
        assert.deepEqual(Object.keys(initial[group]), generatedNames(group), group);
        for (const name of generatedNames(group))
            assert.equal(state[group][name], initial[group][name], `${group}.${name}`);
    }
    assert.equal(state.gp.polearm_range_min, -1);
    assert.equal(state.gp.poly_zapped, 0);
    assert.equal(state.gc.cached_pickinv_win, WIN_ERR);
    assert.equal(state.gc.corpsenm_digested, NON_PM);
    assert.equal(state.gd.did_dig_msg, false);
    // The members held on the state start from the same initializers.
    for (const [name, value] of Object.entries(initial_state_held_globals()))
        assert.equal(state[name], value, name);
    assert.equal(state.multi, 0);
    assert.equal(state.hero_seq, 8); // 1L << 3
    assert.equal(state.lastinvnr, 51);
    assert.equal(state.x_maze_max, 78); // (COLNO - 1) & ~1
    assert.equal(state.y_maze_max, 20); // (ROWNO - 1) & ~1
    // Each call builds new groups, so two processes never share one.
    assert.notEqual(resetGame().gp, state.gp);
    // A test state built by hand takes its gb from initialGb().
    assert.deepEqual(initialGb(), { ...initial.gb, bhitpos: { x: 0, y: 0 } });
});

test('the parsed options start their groups from the same values', () => {
    // options.c and cfgfiles.c write these groups while the configuration
    // file is read; js/jsmain.js installs the parser's copies on the game.
    const parsed = parseNethackrc('');
    for (const group of ['ga', 'gc', 'gf', 'gm', 'go', 'gp', 'gw']) {
        for (const name of generatedNames(group))
            assert.ok(Object.hasOwn(parsed[group], name), `${group}.${name}`);
    }
    assert.equal(parsed.gc.crash_urlmax, -1);
    assert.equal(parsed.gc.chosen_soundlib, soundlib_nosound);
    assert.equal(parsed.ga.active_soundlib, soundlib_nosound);
});

// The assignments that replace a whole group. js/jsmain.js installs the
// groups the options parser wrote, each built on initial_instance_globals(),
// and restarts gp and gv from it; js/steal.js assigns back the group it has
// just read or created.
const GROUP_REPLACEMENTS = [
    'ga jsmain.js = { ...parsedOptions.ga }',
    'gc jsmain.js = { ...opts.gc }',
    'gf jsmain.js = {',
    'gm jsmain.js = { ...opts.gm }',
    'go jsmain.js = { ...opts.go }',
    'gp jsmain.js = {',
    'gs steal.js = gs',
    'gs steal.js = gs',
    'gv jsmain.js = {',
    'gw jsmain.js = {',
];

test('only js/gstate.js and js/jsmain.js create a group', () => {
    const uses = groupUses();
    // potion.c's gp.potion_unkn++ is a counter the scan must class as an
    // update; a scan that stopped finding it would pass while checking
    // nothing.
    assert.ok(uses.some(({ site, group, path, cls }) => site.startsWith('potion.js:')
        && group === 'gp' && path === 'potion_unkn' && cls === 'different-update'));
    const replacements = uses.filter(({ cls, detail }) => cls === 'write-holder'
        && detail.startsWith('= '))
        .map(({ group, site, detail }) =>
            `${group} ${site.split(':')[0]} ${detail.split('\n')[0]}`);
    assert.deepEqual(replacements, GROUP_REPLACEMENTS);
});

test('a game restored in a later segment keeps every generated member', async () => {
    // This recipe saves in its first segment and restores in its second. No
    // group is saved, so the second segment starts from decl.c's values;
    // none of the members may be missing, undefined or NaN after the options
    // are installed, restore.c dorecover() has run and a command has played.
    const recipe = JSON.parse(readFileSync(join(ROOT, 'recipes', 'restore.c',
        'monster-carried-item-drop-after-restore.session.json'), 'utf8'));
    const store = new Map();
    const storage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        get length() { return store.size; },
        key: (index) => [...store.keys()][index] ?? null,
        clear: () => store.clear(),
    };
    assert.equal(recipe.segments.length, 2);
    for (const segment of recipe.segments)
        await runSegmentStrict({ ...segment, storage });
    const bad = [];
    for (const group of GROUPS) {
        for (const name of generatedNames(group)) {
            const value = game[group]?.[name];
            if (value === undefined || Number.isNaN(value)) bad.push(`${group}.${name}`);
        }
    }
    for (const name of Object.keys(initial_state_held_globals())) {
        const value = game[name];
        if (value === undefined || Number.isNaN(value)) bad.push(name);
    }
    assert.deepEqual(bad, []);
});

test('a member held on the state is never named through its group', () => {
    const uses = groupUses();
    const sources = jsFiles(JS_DIR).map(([, source]) => source).join('\n');
    // 38: the scalar members js/ reads as state.<name>, 5 of which another
    // object owns. Lower a count when one moves into its group.
    assert.equal(HELD_ON_STATE.size, 38);
    assert.equal(OWNED_ELSEWHERE.size, 5);
    assert.deepEqual(Object.keys(initial_state_held_globals()).sort(),
        [...HELD_ON_STATE].filter((name) => !OWNED_ELSEWHERE.has(name))
            .map((name) => name.split('.')[1]).sort());
    for (const qualified of HELD_ON_STATE) {
        const [group, name] = qualified.split('.');
        assert.deepEqual(uses.filter((use) => use.group === group && use.member === name)
            .map(({ site }) => site), [], qualified);
        assert.match(sources, new RegExp(
            `\\b(?:state|game|g|env\\.state)\\??\\.${name}\\b`, 'u',
        ), qualified);
    }
});

// Members js/ keeps in a group that decl.h does not declare there, with the
// number of uses the scan finds. C keeps most of them as file statics:
// botl.c's status highlight tables (status_hilite_*, now_or_before_idx),
// glyphs.c's glyphid_cache and glyph_customizations, dog.c's
// failed_arrivals, nhlua.c's nhcore_call_available, mon.c's last_hider and
// symbols.c's UTF-8 symbol tables. Lower a count when uses go away.
const PORT_ONLY_MEMBERS = {
    // decl.h declares ga.altpalette only under CHANGE_COLOR, which this
    // build does not define (js/coloratt.js alternative_palette()).
    'ga.altpalette': 3,
    'gb.incapacitated_conditions': 30,
    'gb.now_or_before_idx': 5,
    'gb.status_hilite_chg': 1,
    'gb.status_hilite_chg_banks': 3,
    'gb.status_hilite_compare_value': 4,
    'gb.status_hilite_enabled': 6,
    'gb.status_hilite_percent': 2,
    'gb.status_hilite_rule': 10,
    'gb.status_hilite_str': 8,
    'gb.status_hilite_text': 4,
    'gb.status_hilite_times': 21,
    'gb.status_hilite_type': 4,
    'gb.status_hilite_value': 3,
    'gg.glyph_customizations': 15,
    'gg.glyphid_cache': 15,
    'gg.glyphmap_use_color': 2,
    'gl.nhcore_call_available': 5,
    'gm.failed_arrivals': 4,
    'go.ov_primary_utf8_syms': 2,
    'go.ov_rogue_utf8_syms': 2,
    'gp.primary_utf8_syms': 3,
    'gr.rogue_utf8_syms': 2,
    'gs.showutf8': 3,
    'gs.unreadableSavefile': 3,
    'gv.last_hider': 3,
};

test('every group member js/ names is declared in decl.h', () => {
    const counts = {};
    for (const { group, member, declared } of groupUses())
        if (member && !declared) counts[`${group}.${member}`] = (counts[`${group}.${member}`] ?? 0) + 1;
    assert.deepEqual(counts, PORT_ONLY_MEMBERS);
});

// Reads that tell an absent generated member from one at its start value,
// or give an absent one a default. The member exists from process start, so
// such a read is dead in a game and hides a state a test built without
// js/decl.js initial_instance_globals(). The list is empty; build the test's
// state from that function instead of adding an entry.
const ABSENT_MEMBER_READS = [];

test('no code relies on a generated member being absent', () => {
    // delete, typeof, `in`, Object.hasOwn() and a comparison with undefined
    // or null tell an absent member from a present one, which C cannot do;
    // `??` and `??=` with a non-zero default give it another start value.
    const sites = groupUses()
        .filter(({ held, beyond, cls }) => held === 'group' && !beyond
            && ['different-presence', 'different-null-compare', 'different-default',
                'assign-default'].includes(cls))
        .map(({ group, site, path, cls, detail }) =>
            `${site.split(':')[0]} ${group}.${path} ${cls} ${detail}`);
    assert.deepEqual(sites.sort(), [...ABSENT_MEMBER_READS].sort());
});

test('no code tests whether a member held on the state exists', () => {
    // typeof, a comparison with undefined or null, and Number.isInteger()
    // used as a presence test tell an absent member from one at decl.c's
    // value. invent.js assigninvlet() falls back to INVLET_BASIC - 1, which
    // is gl.lastinvnr's start value, 51, for a state a test built by hand.
    const names = Object.keys(initial_state_held_globals()).join('|');
    const holder = String.raw`\b(?:state|game|g|env\.state)\??\.(?:${names})\b`;
    const presence = new RegExp(
        `typeof ${holder}|${holder} *(?:===?|!==?) *(?:undefined|null)\\b`
        + `|Number\\.is(?:Safe)?Integer\\(${holder}\\)`, 'u',
    );
    const sites = [];
    for (const [name, source] of jsFiles(JS_DIR)) {
        source.split('\n').forEach((line) => {
            const code = line.replace(/\/\/.*$/u, '');
            if (presence.test(code)) sites.push(`${name} ${code.trim()}`);
        });
    }
    assert.deepEqual(sites, [
        // moveloop_core() refuses a state whose hero_seq a test left unset.
        'allmain.js if (!Number.isSafeInteger(state.hero_seq) || state.hero_seq < 0) {',
        'invent.js const previous = Number.isInteger(state.lastinvnr)',
    ]);
});
