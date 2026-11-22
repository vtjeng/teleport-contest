// C's flags (struct flag, flag.h) is a zero-initialized global (decl.c):
// every member reads as 0, FALSE or NULL until options.c allopt_array_init()
// and initoptions_init(), role selection or a command writes it. Unlike
// iflags it is saved: save.c savegamestate() writes the whole struct and
// restore.c restgamestate() reads it back over the options the new process
// parsed, keeping only that process's debug and explore requests. The port
// once built state.flags from the options parser's partial literal, so a
// member read before it was first written was `undefined`: `moonphase ===
// NEW_MOON` was false, role_init.js told an absent female and a string
// initgend apart with typeof and defaulted pantheon to -1, and `?? true`,
// `?? MOD_ENCUMBER` and `?? VI_NUMBER` stood in for initoptions_init().
//
// js/gstate.js now creates the object at process start from js/flag.js
// zero_flag(), generated from flag.h, and js/options.js defaultResult()
// starts the parsed options from the same struct. These tests keep it that
// way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { friday_13th, phase_of_the_moon } from '../js/calendar.js';
import {
    AUTOUNLOCK_APPLY_KEY,
    DISCLOSE_PROMPT_DEFAULT_NO,
    MENU_FULL,
    MOD_ENCUMBER,
    PARANOID_PRAY,
    PARANOID_SWIM,
    PARANOID_TRAP,
    ROLE_NONE,
    RUN_LEAP,
    VANQ_MLVL_MNDX,
} from '../js/const.js';
import { FLAG_STRUCTS, zero_flag } from '../js/flag.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegmentStrict } from '../js/jsmain.js';
import { GEM_CLASS } from '../js/objects.js';
import { allopt } from '../js/optlist_data.js';
import { parseNethackrc } from '../js/options.js';
import { jsFiles, resolvePath, scanFiles, scanSource } from './state-field-uses.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');

// Names the port reads from a `flags` object that flag.h does not declare,
// with the number of uses the scan finds. js/symbols.js fallbackOperations()
// reads them from an options object that has no symbolOperations list, which
// only tests pass; parseNethackrc() always builds that list, and nothing in
// js/ writes either name. Lower a count when uses go away.
const PORT_ONLY_MEMBERS = {
    decgraphics: 1,
    ibmgraphics: 1,
};

function flagsUses() {
    return scanFiles(jsFiles(JS_DIR), 'flags').map((use) => ({
        ...use, ...resolvePath(use.path, FLAG_STRUCTS, 'flag'),
    }));
}

const memberNames = () => FLAG_STRUCTS.flag.map(([name]) => name);

test('the process starts with every flag member at zero', () => {
    const state = resetGame();
    assert.deepEqual(state.flags, zero_flag());
    assert.deepEqual(Object.keys(state.flags), memberNames());
    // Each call builds new arrays, so two processes never share one.
    assert.notEqual(resetGame().flags.inv_order, state.flags.inv_order);
});

test('the parsed options start from the zeroed struct and initoptions_init()', () => {
    // An empty configuration file leaves the startup values alone.
    const { flags } = parseNethackrc('');
    assert.deepEqual(Object.keys(flags), memberNames());
    // allopt_array_init()'s do_init arms (options.c:1073, 3867, 3966).
    assert.equal(flags.autounlock, AUTOUNLOCK_APPLY_KEY);
    assert.equal(flags.discosort, 'o');
    assert.equal(flags.vanq_sortmode, VANQ_MLVL_MNDX);
    // initoptions_init(), in source order (options.c:7170-7258).
    assert.equal(flags.end_own, false);
    assert.equal(flags.end_top, 3);
    assert.equal(flags.end_around, 2);
    assert.equal(flags.paranoia_bits, PARANOID_PRAY | PARANOID_SWIM | PARANOID_TRAP);
    // VI_NUMBER, since the recorder has no git branch.
    assert.equal(flags.versinfo, 1);
    // PILE_LIMIT_DFLT.
    assert.equal(flags.pile_limit, 5);
    assert.equal(flags.runmode, RUN_LEAP);
    for (const name of ['initrole', 'initrace', 'initgend', 'initalign'])
        assert.equal(flags[name], ROLE_NONE, name);
    // def_inv_order[]: $ " ) [ % ? + ! = / ( * ` 0 _ as class numbers.
    assert.deepEqual(flags.inv_order,
        [12, 5, 2, 3, 7, 9, 10, 8, 4, 11, 6, 13, 14, 15, 16]);
    assert.deepEqual(flags.pickup_types, []);
    assert.equal(flags.pickup_burden, MOD_ENCUMBER);
    assert.equal(flags.sortloot, 'l');
    assert.deepEqual(flags.end_disclose,
        Array(6).fill(DISCLOSE_PROMPT_DEFAULT_NO));
    assert.equal(flags.menu_style, MENU_FULL);
    // Every boolean option with storage in flags takes optlist.h's initval.
    let booleans = 0;
    for (const option of allopt) {
        if (option.opttyp !== 'BoolOpt' || !option.addr?.startsWith('flags.')) continue;
        assert.equal(flags[option.addr.slice('flags.'.length)], option.initval, option.name);
        booleans++;
    }
    // A scan that found no boolean option would pass while checking nothing.
    assert.ok(booleans > 30, `${booleans} boolean options`);
    // Members no startup code writes keep their zero: allmain.c
    // moveloop_preamble() sets the moon phase and Friday the 13th, newgame()
    // the pantheon and u_init.c the beginner flag; showscore and nap belong
    // to options this build compiles out (SCORE_ON_BOTL, TIMED_DELAY).
    for (const name of ['moonphase', 'friday13', 'pantheon', 'beginner',
        'randomall', 'made_fruit', 'showscore', 'nap', 'reserved1'])
        assert.equal(flags[name], zero_flag()[name], name);
});

test('the scan keeps struct flag apart from the other structs named flags', () => {
    // svl.level.flags, a location's flags and a light source's flags are
    // other structs; the scan follows the game state and the options result.
    const sample = [
        'export function f(state, result, loc, ls) {',
        '    if (state.flags.verbose) loc.flags = 1;',
        '    result.flags.pile_limit = 5;',
        '    if (state.level.flags.nfountains > 0) ls.flags |= 2;',
        '}',
    ].join('\n');
    assert.deepEqual(scanSource('sample.js', sample, 'flags')
        .map(({ path, cls }) => `${path} ${cls}`),
    ['verbose safe-truth', 'pile_limit write']);
});

test('only js/jsmain.js and js/restore.js replace state.flags', () => {
    const uses = flagsUses();
    // role.c rigid_role_checks()'s ROLE_RANDOM test is a read the scan must
    // find through role_init.js's local alias; a scan that stopped finding
    // it would pass while checking nothing.
    assert.ok(uses.some(({ site, path, cls }) => site.startsWith('role_init.js:')
        && path === 'initrole' && cls === 'compare-expression'));
    const replacements = uses.filter(({ cls, detail }) => cls === 'write-holder'
        && detail.startsWith('= '));
    // jsmain.js installs the parsed options, which options.js built from the
    // zeroed struct; restore.c:571 reads the saved struct over them.
    assert.deepEqual(replacements.map(({ site, detail }) =>
        `${site.split(':')[0]} ${detail}`),
    ['jsmain.js = { ...opts.flags }', 'restore.js = snapshot.flags']);
});

test('every flags member js/ names is declared in flag.h', () => {
    const counts = {};
    for (const { field, ctype } of flagsUses())
        if (ctype === null) counts[field] = (counts[field] ?? 0) + 1;
    assert.deepEqual(counts, PORT_ONLY_MEMBERS);
});

test('no code tests whether a flag member exists', () => {
    // delete, typeof, `in`, Object.hasOwn() and a comparison with undefined
    // tell an absent member from a zero one, which C cannot do.
    const sites = flagsUses()
        .filter(({ cls, ctype }) => ctype !== null
            && (cls === 'different-presence' || cls === 'different-null-compare'))
        .map(({ site, path, detail }) => `${site} ${path} ${detail}`);
    assert.deepEqual(sites, []);
});

test('no flag member has a default for when it is absent', () => {
    // A default only runs for a member that is absent, which C does not
    // have. `?? true` for invlet_constant, `?? MOD_ENCUMBER` for
    // pickup_burden and `?? VI_NUMBER` for versinfo stood in for
    // initoptions_init(), and `?? []` for inv_order for its def_inv_order[].
    // struct flag has no pointer member, so no default is C's own NULL test.
    const sites = flagsUses()
        .filter(({ cls, ctype }) => ctype !== null
            && (cls === 'different-default' || cls === 'assign-default'
                || cls === 'assign-default-zero' || cls === 'safe-default-zero'))
        .map(({ site, path, detail }) => `${site} ${path} ?? ${detail}`);
    assert.deepEqual(sites, []);
});

// Segment one of this recipe saves and segment two restores, both in debug
// mode. The returned store holds segment one's save file.
async function saveAndRestore(beforeRestore) {
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
    const [first, second] = recipe.segments;
    await runSegmentStrict({ ...first, storage });
    const restoreSegment = beforeRestore(store, second);
    await runSegmentStrict({ ...restoreSegment, storage });
}

test('a restored game takes flags from the save file, not the new options', async () => {
    // restore.c:570-571 reads the whole saved struct over the one the new
    // process's options built, so an option the second configuration sets
    // differently is lost, and a member the save holds is kept whatever
    // the new options say. Only newgameflags.debug and .explore feed back
    // (restore.c:587-595), and allmain.c moveloop_preamble() then recomputes
    // the moon phase and Friday the 13th from the new process's clock.
    let savedMoonphase;
    await saveAndRestore((store, second) => {
        const saves = [...store.keys()].filter((key) => {
            try {
                return Boolean(JSON.parse(store.get(key))?.flags?.inv_order);
            } catch {
                return false;
            }
        });
        assert.equal(saves.length, 1);
        const snapshot = JSON.parse(store.get(saves[0]));
        assert.deepEqual(Object.keys(snapshot.flags), memberNames());
        // Members the first segment's options left at their startup value,
        // changed in the save to values no option of either segment gives.
        snapshot.flags.time = true;
        snapshot.flags.pickup_types = [GEM_CLASS];
        snapshot.flags.pile_limit = 9;
        // Any phase other than FULL_MOON (4) and NEW_MOON (0), which print a
        // message, and other than the one the second segment's clock gives.
        const phase = phase_of_the_moon({ ...game, fixedDatetime: second.datetime });
        savedMoonphase = [1, 2, 3, 5, 6, 7].find((value) => value !== phase);
        snapshot.flags.moonphase = savedMoonphase;
        store.set(saves[0], JSON.stringify(snapshot));
        // The second segment's own options would turn acoustics on and keep
        // the startup pile limit; the save's values win.
        return {
            ...second,
            nethackrc: second.nethackrc.replace(',!acoustics', ''),
        };
    });
    assert.deepEqual(Object.keys(game.flags), memberNames());
    const bad = memberNames().filter((name) => game.flags[name] === undefined
        || Number.isNaN(game.flags[name]));
    assert.deepEqual(bad, []);
    assert.equal(game.flags.time, true);
    assert.deepEqual(game.flags.pickup_types, [GEM_CLASS]);
    assert.equal(game.flags.pile_limit, 9);
    assert.equal(game.flags.acoustics, false);
    // The new process asked for debug mode, so wizard mode stays on.
    assert.equal(game.flags.debug, true);
    assert.equal(game.flags.explore, false);
    assert.equal(game.wizard, true);
    // moveloop_preamble() replaced the saved phase.
    assert.equal(game.flags.moonphase, phase_of_the_moon(game));
    assert.notEqual(game.flags.moonphase, savedMoonphase);
    assert.equal(game.flags.friday13, friday_13th(game));
    // role_init() kept the saved pantheon; a new game's -1 is gone.
    assert.ok(game.flags.pantheon >= 0);
});
