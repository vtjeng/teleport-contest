// C's iflags (struct instance_flags, flag.h) is a zero-initialized global
// (decl.c:86): every member reads as 0, FALSE or NULL until options.c
// initoptions_init(), the window port or a command writes it, and none of it
// is saved, so a restored game starts from zero too. The port once built
// state.iflags from the options parser's partial literal, so a member read
// before it was first written was `undefined`, which is not `=== 0` and is
// NaN after `++`. mon.js minliquid() told an absent sad_feeling from FALSE
// with Object.hasOwn(), and the `?? 256`, `?? -1` and `?? 's'` defaults
// stood in for assignments C makes elsewhere or never.
//
// js/gstate.js now creates the object at process start from js/flag.js
// zero_instance_flags(), generated from flag.h, and js/options.js
// defaultResult() starts the parsed options from the same struct. These
// tests keep it that way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ALIGN_BOTTOM, ALIGN_TOP, GPCOORDS_NONE } from '../js/const.js';
import { INSTANCE_FLAGS_STRUCTS, zero_instance_flags } from '../js/flag.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegmentStrict } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { NO_COLOR } from '../js/terminal.js';
import { jsFiles, resolvePath, scanFiles } from './state-field-uses.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');

// Members the port keeps on state.iflags that flag.h does not declare, with
// the number of uses the scan finds. C keeps the status highlight rules and
// the enabled status conditions in botl.c, and the menu command aliases in
// gm.mapped_menu_cmds and gm.mapped_menu_op (options.c add_menu_cmd_alias()).
// Lower a count when uses go away.
const PORT_ONLY_MEMBERS = {
    mapped_menu_cmds: 7,
    mapped_menu_op: 6,
    status_conditions: 18,
    status_hilites: 16,
};

function iflagsUses() {
    return scanFiles(jsFiles(JS_DIR), 'iflags').map((use) => ({
        ...use, ...resolvePath(use.path, INSTANCE_FLAGS_STRUCTS, 'instance_flags'),
    }));
}

const memberNames = () => INSTANCE_FLAGS_STRUCTS.instance_flags.map(([name]) => name);

test('the process starts with every instance_flags member at zero', () => {
    const state = resetGame();
    assert.deepEqual(state.iflags, zero_instance_flags());
    assert.deepEqual(Object.keys(state.iflags), memberNames());
    // Each call builds new embedded structs, so two processes never share one.
    assert.notEqual(resetGame().iflags.travelcc, state.iflags.travelcc);
});

test('the parsed options start from the zeroed struct and initoptions_init()', () => {
    // An empty configuration file leaves the startup values alone.
    const { iflags } = parseNethackrc('');
    for (const name of memberNames())
        assert.ok(Object.hasOwn(iflags, name), name);
    // options.c initoptions_init(), in source order. ATR_INVERSE is 7.
    assert.equal(iflags.msg_history, 20);
    assert.equal(iflags.prevmsg_window, 's');
    assert.deepEqual(iflags.menu_headings, { color: NO_COLOR, attr: 7 });
    assert.equal(iflags.getpos_coords, GPCOORDS_NONE);
    assert.equal(iflags.wc_align_message, ALIGN_TOP);
    assert.equal(iflags.wc_align_status, ALIGN_BOTTOM);
    assert.equal(iflags.wc2_statuslines, 2);
    assert.equal(iflags.wc2_petattr, 7);
    assert.equal(iflags.wc2_windowborders, 2);
    assert.equal(iflags.menuinvertmode, 1);
    // Members no startup code writes keep their zero.
    assert.equal(iflags.window_inited, false);
    assert.equal(iflags.colorcount, 0);
    assert.equal(iflags.in_lava_effects, 0);
    assert.deepEqual(iflags.travelcc, { x: 0, y: 0 });
});

test('only js/gstate.js and js/jsmain.js create state.iflags', () => {
    const uses = iflagsUses();
    // trap.c lava_effects()'s in_lava_effects++ is a counter the scan must
    // class as an update; a scan that stopped finding it would pass while
    // checking nothing.
    assert.ok(uses.some(({ site, path, cls }) => site.startsWith('trap.js:')
        && path === 'in_lava_effects' && cls === 'different-update'));
    const replacements = uses.filter(({ cls, detail }) => cls === 'write-holder'
        && detail.startsWith('= '));
    // jsmain.js installs the parsed options, which options.js built from the
    // zeroed struct.
    assert.deepEqual(replacements.map(({ site, detail }) =>
        `${site.split(':')[0]} ${detail}`), ['jsmain.js = { ...opts.iflags }']);
});

test('every iflags member js/ names is declared in flag.h', () => {
    // flag.h's old names (use_color for wc_color and the rest) are macros
    // for declared members, so the port uses the declared ones.
    const counts = {};
    for (const { field, ctype } of iflagsUses())
        if (ctype === null) counts[field] = (counts[field] ?? 0) + 1;
    assert.deepEqual(counts, PORT_ONLY_MEMBERS);
});

test('no code tests whether an instance_flags member exists', () => {
    // delete, typeof, `in`, Object.hasOwn() and a comparison with undefined
    // tell an absent member from a zero one, which C cannot do.
    const sites = iflagsUses()
        .filter(({ cls, ctype }) => ctype !== null
            && (cls === 'different-presence' || cls === 'different-null-compare'))
        .map(({ site, path, detail }) => `${site} ${path} ${detail}`);
    assert.deepEqual(sites, []);
});

test('no scalar iflags member has a non-zero default for when it is absent', () => {
    // A default on an integer, boolean or char only runs for a member that
    // is absent, which C does not have. `?? 's'` for prevmsg_window and
    // `?? 7` for wc2_petattr stood in for initoptions_init(), and
    // `colorcount ?? 256` for termcap.c init_hilite(). A default on a
    // pointer, such as wc_tile_file's 'default' for NULL, is C's own.
    const scalar = (ctype) => ctype && !ctype.startsWith('struct ')
        && !ctype.includes('*') && !ctype.includes('[')
        && !INSTANCE_FLAGS_STRUCTS[ctype] && ctype !== 'genericptr_t';
    const sites = iflagsUses()
        .filter(({ cls, ctype, beyond }) => !beyond && scalar(ctype)
            && (cls === 'different-default' || cls === 'assign-default'))
        .map(({ site, path, detail }) => `${site} ${path} ?? ${detail}`);
    assert.deepEqual(sites, []);
    // An embedded struct exists from startup too.
    const structs = iflagsUses()
        .filter(({ cls, ctype }) => (ctype === 'coord' || ctype === 'color_attr'
            || ctype === 'struct debug_flags')
            && (cls === 'different-default' || cls === 'assign-default'))
        .map(({ site, path }) => `${site} ${path}`);
    assert.deepEqual(structs, []);
});

test('a game restored in a later segment keeps every iflags member', async () => {
    // This recipe saves in its first segment and restores in its second.
    // iflags is not saved, so the second segment starts from zero and the
    // options; none of the members may be missing, undefined or NaN after
    // restore.c dorecover() and the restored game's first command.
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
    // tty_init_nhwindows() makes echo non-enumerable (js/wintty.js).
    const names = Object.getOwnPropertyNames(game.iflags);
    for (const name of memberNames())
        assert.ok(names.includes(name), name);
    assert.deepEqual(names.filter((name) => !memberNames().includes(name)).sort(),
        Object.keys(PORT_ONLY_MEMBERS).sort());
    const bad = names.filter((name) => game.iflags[name] === undefined
        || Number.isNaN(game.iflags[name]));
    assert.deepEqual(bad, []);
    // restore.js sets the zero terrain_typ a restored process keeps, and
    // term_startup() the recorder terminal's 256 colours.
    assert.equal(game.iflags.colorcount, 256);
});
