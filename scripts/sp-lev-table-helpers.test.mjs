// Source-pinned tests for sp_lev.c's Lua-table readers and their nhlua.c
// accessors. Each expected value is read from the C function named in the
// test; the RNG-consuming gender arm of find_montype() runs on a scripted
// draw.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BOOL_RANDOM,
    FEMALE,
    INVALID_TYPE,
    MALE,
    MOAT,
    NEUTRAL,
    NON_PM,
    ROOM,
} from '../js/const.js';
import {
    ARMORSHOP, COURT, OROOM, THEMEROOM,
} from '../js/const.js';
import { def_char_to_monclass, def_char_to_objclass } from '../js/drawing.js';
import {
    check_mapchr,
    find_montype,
    find_objtype,
    get_coord,
    get_table_buc,
    get_table_int_or_random,
    get_table_intarray_entry,
    get_table_mapchr_opt,
    get_table_monclass,
    get_table_montype,
    get_table_objclass,
    get_table_objtype,
    get_table_roomtype_opt,
    get_table_xy_or_coord,
    lspo_level_flags,
    lspo_message,
    nhl_get_xy_params,
} from '../js/mklev.js';
import {
    PM_GNOME,
    PM_GNOME_LEADER,
    PM_WOOD_NYMPH,
    S_DRAGON,
} from '../js/monsters.js';
import { monst_globals_init } from '../js/monsters.js';
import {
    get_table_boolean,
    get_table_boolean_opt,
    get_table_int,
    get_table_int_opt,
    get_table_option,
    get_table_str,
    get_table_str_opt,
    lcheck_param_table,
    lua_tointeger,
} from '../js/nhlua.js';
import {
    BOULDER,
    LUCKSTONE,
    NUM_OBJECTS,
    OBJ_DESCR,
    RIN_TELEPORTATION,
    SCROLL_CLASS,
    SCR_TELEPORTATION,
    SPBOOK_CLASS,
    STRANGE_OBJECT,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';

// A state whose object names are readable: o_init.c init_objects() numbers
// oc_name_idx/oc_descr_idx before its shuffle, and only the numbering is
// needed here.
function objectState() {
    const state = {};
    objects_globals_init(state);
    for (let i = 0; i < NUM_OBJECTS; ++i) {
        state.objects[i].oc_name_idx = i;
        state.objects[i].oc_descr_idx = i;
    }
    return state;
}

function monsterState() {
    const state = {};
    monst_globals_init(state);
    return state;
}

// A random source whose rn2() returns scripted values and records its bounds.
function scriptedRn2(values) {
    const bounds = [];
    return {
        bounds,
        random: {
            rn2(bound) {
                bounds.push(bound);
                if (!values.length) assert.fail(`unexpected rn2(${bound})`);
                return values.shift();
            },
        },
    };
}

test('nhlua.c lcheck_param_table answers the first table or an empty one', () => {
    // C: argc < 1 creates an empty table; extra arguments are discarded.
    assert.deepEqual(lcheck_param_table([]), {});
    const table = { a: 1 };
    assert.equal(lcheck_param_table([table, 'extra']), table);
    assert.throws(() => lcheck_param_table(['str']), /table expected, got string/u);
});

test('nhlua.c get_table_boolean accepts booleans, 0/1, and the option quirk', () => {
    assert.equal(get_table_boolean({ v: true }, 'v'), 1);
    assert.equal(get_table_boolean({ v: false }, 'v'), 0);
    assert.equal(get_table_boolean({ v: 1 }, 'v'), 1);
    assert.equal(get_table_boolean({ v: 0 }, 'v'), 0);
    // C: an integer outside 0..1 becomes -1, which is an error.
    assert.throws(() => get_table_boolean({ v: 2 }, 'v'), /Expected a boolean/u);
    // C: a string answers its index in {"true","false","yes","no"}, so
    // "true" reads as 0 and "no" as 3 (the boolstr2i[] mapping is disabled).
    assert.equal(get_table_boolean({ v: 'true' }, 'v'), 0);
    assert.equal(get_table_boolean({ v: 'no' }, 'v'), 3);
    assert.throws(() => get_table_boolean({ v: 'maybe' }, 'v'), /invalid option/u);
    assert.throws(() => get_table_boolean({}, 'v'), /Expected a boolean/u);
    // get_table_boolean_opt: nil takes the default, anything else is read.
    assert.equal(get_table_boolean_opt({}, 'v', BOOL_RANDOM), BOOL_RANDOM);
    assert.equal(get_table_boolean_opt({ v: true }, 'v', BOOL_RANDOM), 1);
});

test('nhlua.c integer, string, and option readers', () => {
    assert.equal(get_table_int_opt({}, 'n', -1), -1);
    assert.equal(get_table_int_opt({ n: 7 }, 'n', -1), 7);
    assert.throws(() => get_table_int_opt({ n: 'x' }, 'n', -1), /integer/u);

    assert.equal(get_table_str_opt({}, 's', null), null);
    assert.equal(get_table_str_opt({}, 's', 'dflt'), 'dflt');
    assert.equal(get_table_str_opt({ s: 'a' }, 's', null), 'a');
    // C: a function field is called for its string.
    assert.equal(get_table_str_opt({ s: () => 'b' }, 's', null), 'b');
    assert.throws(() => get_table_str_opt({ s: 3 }, 's', null), /no string/u);

    assert.equal(get_table_str({ s: 'a' }, 's'), 'a');
    // C: luaL_checkstring converts a number.
    assert.equal(get_table_str({ s: 3 }, 's'), '3');
    assert.throws(() => get_table_str({}, 's'), /string expected, got nil/u);

    const engrtypes = ['dust', 'engrave', 'burn', 'mark', 'blood'];
    assert.equal(get_table_option({}, 'type', 'engrave', engrtypes), 1);
    assert.equal(get_table_option({ type: 'burn' }, 'type', 'engrave', engrtypes), 2);
    assert.throws(
        () => get_table_option({ type: 'xyz' }, 'type', 'engrave', engrtypes),
        /invalid option 'xyz'/u,
    );
});

test('nhlua.c check_mapchr and get_table_mapchr_opt read one map character', () => {
    assert.equal(check_mapchr('.'), ROOM);
    assert.equal(check_mapchr('ab'), INVALID_TYPE);
    assert.equal(check_mapchr(''), INVALID_TYPE);
    assert.equal(get_table_mapchr_opt({ fg: '}' }, 'fg', ROOM), MOAT);
    // C: an absent or empty field takes the default.
    assert.equal(get_table_mapchr_opt({}, 'fg', ROOM), ROOM);
    assert.equal(get_table_mapchr_opt({ fg: '' }, 'fg', ROOM), ROOM);
    assert.throws(
        () => get_table_mapchr_opt({ fg: 'ab' }, 'fg', ROOM),
        /Erroneous map char/u,
    );
});

test('sp_lev.c get_table_intarray_entry and get_coord read coordinate tables', () => {
    assert.equal(get_table_intarray_entry([3, 4], 2), 4);
    // C: lua_tointeger() of a float without an integer value is 0.
    assert.equal(get_table_intarray_entry([3.5], 1), 0);
    // C: the message names entry #1 whatever the entry asked for.
    assert.throws(
        () => get_table_intarray_entry([3, 'x'], 2),
        /Array entry #1 is string, expected number/u,
    );

    const c = { x: -1, y: -1 };
    // C: nil leaves the outputs untouched and answers FALSE.
    assert.equal(get_coord(undefined, c), false);
    assert.deepEqual(c, { x: -1, y: -1 });
    assert.equal(get_coord({ x: 7, y: 8 }, c), true);
    assert.deepEqual(c, { x: 7, y: 8 });
    assert.equal(get_coord([5, 6], c), true);
    assert.deepEqual(c, { x: 5, y: 6 });
    assert.throws(() => get_coord({ x: 1 }, c), /Not a coordinate/u);
    assert.throws(() => get_coord([1], c), /Not a coordinate/u);
    assert.throws(() => get_coord('abc', c), /non-table coord specified/u);
});

test('sp_lev.c get_table_xy_or_coord prefers x/y and falls back to coord', () => {
    assert.deepEqual(get_table_xy_or_coord({ x: 3, y: 4 }), { x: 3, y: 4 });
    assert.deepEqual(get_table_xy_or_coord({ coord: [5, 6] }), { x: 5, y: 6 });
    assert.deepEqual(get_table_xy_or_coord({ coord: { x: 7, y: 8 } }), { x: 7, y: 8 });
    assert.deepEqual(get_table_xy_or_coord({}), { x: -1, y: -1 });
    // C: only both axes at -1 consult coord.
    assert.deepEqual(get_table_xy_or_coord({ x: 2, coord: [5, 6] }), { x: 2, y: -1 });
});

test('sp_lev.c get_table_int_or_random reads an integer or "random"', () => {
    assert.equal(get_table_int_or_random({}, 'spe', -127), -127);
    assert.equal(get_table_int_or_random({ spe: 'random' }, 'spe', -127), -127);
    assert.equal(get_table_int_or_random({ spe: 'RANDOM' }, 'spe', -127), -127);
    assert.equal(get_table_int_or_random({ spe: 5 }, 'spe', -127), 5);
    assert.throws(
        () => get_table_int_or_random({ spe: 'foo' }, 'spe', -127),
        /Expected integer or "random" for "spe", got "foo"/u,
    );
    assert.throws(
        () => get_table_int_or_random({ spe: true }, 'spe', -127),
        /got <Null>/u,
    );
});

test('sp_lev.c get_table_buc maps the seven curse states', () => {
    // C: bucs2i[] = { 0, 1, 2, 3, 4, 5, 6, 0 } over
    // { random, blessed, uncursed, cursed, not-cursed, not-uncursed, not-blessed }.
    const expected = {
        random: 0, blessed: 1, uncursed: 2, cursed: 3,
        'not-cursed': 4, 'not-uncursed': 5, 'not-blessed': 6,
    };
    for (const [name, value] of Object.entries(expected))
        assert.equal(get_table_buc({ buc: name }), value, name);
    assert.equal(get_table_buc({}), 0);
    assert.throws(() => get_table_buc({ buc: 'holy' }), /invalid option/u);
});

test('sp_lev.c get_table_objclass and get_table_monclass read a class character', () => {
    assert.equal(get_table_objclass({ class: '%' }), def_char_to_objclass('%'));
    // The port's loaders pass the class index directly.
    assert.equal(get_table_objclass({ class: WEAPON_CLASS }), WEAPON_CLASS);
    assert.equal(get_table_objclass({}), -1);
    assert.equal(get_table_objclass({ class: 'ab' }), -1);

    assert.equal(get_table_monclass({ class: 'D' }), def_char_to_monclass('D'));
    assert.equal(get_table_monclass({ class: 'D' }), S_DRAGON);
    assert.equal(get_table_monclass({ class: S_DRAGON }), S_DRAGON);
    assert.equal(get_table_monclass({}), -1);
});

test('sp_lev.c find_objtype matches names, class prefixes, and descriptions', () => {
    const state = objectState();
    assert.equal(find_objtype('boulder', -1, state), BOULDER);
    // C: strcmpi, so case does not matter.
    assert.equal(find_objtype('Boulder', -1, state), BOULDER);
    // "ring of " sets the class and strips the prefix; without a class the
    // ring is the first "teleportation" in objects[] because rings precede
    // scrolls there.
    assert.equal(find_objtype('ring of teleportation', -1, state), RIN_TELEPORTATION);
    assert.equal(find_objtype('teleportation', -1, state), RIN_TELEPORTATION);
    assert.equal(find_objtype('teleportation', SCROLL_CLASS, state), SCR_TELEPORTATION);
    assert.equal(find_objtype('scroll of teleportation', WEAPON_CLASS, state), SCR_TELEPORTATION);
    // A description matches after every name fails, scanning objects[] from
    // the top: "gray" names the gray spellbook before any gray stone.
    const grayBook = find_objtype('gray', -1, state);
    assert.equal(state.objects[grayBook].oc_class, SPBOOK_CLASS);
    assert.equal(OBJ_DESCR(state.objects[grayBook], state), 'gray');
    assert.ok(grayBook < LUCKSTONE);
    assert.equal(OBJ_DESCR(state.objects[LUCKSTONE], state), 'gray');
    assert.equal(find_objtype('', -1, state), STRANGE_OBJECT);
    assert.equal(find_objtype(null, -1, state), STRANGE_OBJECT);
    assert.throws(() => find_objtype('xyzzy', -1, state), /Unknown object id/u);
});

test('sp_lev.c get_table_objtype resolves id within the class field', () => {
    const state = objectState();
    assert.equal(get_table_objtype({ id: 'boulder' }, state), BOULDER);
    assert.equal(get_table_objtype({ id: BOULDER }, state), BOULDER);
    assert.equal(get_table_objtype({}, state), STRANGE_OBJECT);
    assert.equal(
        get_table_objtype({ id: 'teleportation', class: '?' }, state),
        SCR_TELEPORTATION,
    );
});

test('sp_lev.c find_montype keeps a one-gender species and flips the rest', () => {
    const state = monsterState();
    const nymph = scriptedRn2([]);
    // C: is_female() wins with no draw.
    assert.deepEqual(
        find_montype('wood nymph', { state, random: nymph.random }),
        { montype: PM_WOOD_NYMPH, mgender: FEMALE },
    );
    assert.deepEqual(nymph.bounds, []);
    // "gnome lord" is the male pmname, so name_to_monplus() reports MALE and
    // no draw happens.
    const lord = scriptedRn2([]);
    assert.deepEqual(
        find_montype('gnome lord', { state, random: lord.random }),
        { montype: PM_GNOME_LEADER, mgender: MALE },
    );
    // A neutral name draws rn2(2): 1 is FEMALE.
    const gnome = scriptedRn2([1]);
    assert.deepEqual(
        find_montype('gnome', { state, random: gnome.random }),
        { montype: PM_GNOME, mgender: FEMALE },
    );
    assert.deepEqual(gnome.bounds, [2]);
    // The index form with parsedGender stands for the parsed name.
    const lordIndex = scriptedRn2([]);
    assert.deepEqual(
        find_montype(PM_GNOME_LEADER, { state, random: lordIndex.random }, MALE),
        { montype: PM_GNOME_LEADER, mgender: MALE },
    );
    const gnomeIndex = scriptedRn2([0]);
    assert.deepEqual(
        find_montype(PM_GNOME, { state, random: gnomeIndex.random }),
        { montype: PM_GNOME, mgender: MALE },
    );
    // An unknown name answers NON_PM and NEUTRAL.
    assert.deepEqual(
        find_montype('xyzzy', { state, random: scriptedRn2([]).random }),
        { montype: NON_PM, mgender: NEUTRAL },
    );
});

test('sp_lev.c get_table_montype errors on an unknown id and passes an absent one', () => {
    const state = monsterState();
    const env = { state, random: scriptedRn2([]).random };
    assert.throws(() => get_table_montype({ id: 'xyzzy' }, env), /Unknown monster id/u);
    assert.deepEqual(get_table_montype({}, env), { montype: NON_PM, mgender: NEUTRAL });
    assert.deepEqual(
        get_table_montype({ id: 'wood nymph' }, env),
        { montype: PM_WOOD_NYMPH, mgender: FEMALE },
    );
});

test('sp_lev.c get_table_roomtype_opt finds room_types[] case-insensitively', () => {
    assert.equal(get_table_roomtype_opt({ type: 'throne' }, 'type', OROOM), COURT);
    assert.equal(get_table_roomtype_opt({ type: 'Armor Shop' }, 'type', OROOM), ARMORSHOP);
    assert.equal(get_table_roomtype_opt({ type: 'themed' }, 'type', OROOM), THEMEROOM);
    assert.equal(get_table_roomtype_opt({}, 'type', OROOM), OROOM);
    // C: an unknown name is reported through impossible() and keeps defval.
    const reported = [];
    const env = { hooks: { impossible: (message) => reported.push(message) } };
    assert.equal(get_table_roomtype_opt({ type: 'court' }, 'type', OROOM, env), OROOM);
    assert.deepEqual(reported, ["Unknown room type 'court'"]);
});

test('sp_lev.c lspo_level_flags sets each flag by its case-insensitive name', () => {
    const flags = {};
    const coder = { allow_flips: 3 };
    const frame = { icedpools: false };
    const env = { state: { level: { flags } }, coder, frame };
    lspo_level_flags([
        'NoTeleport', 'hardfloor', 'nommap', 'shortsighted', 'arboreal',
        'mazelevel', 'shroud', 'graveyard', 'icedpools', 'corrmaze',
        'premapped', 'solidify', 'sokoban', 'inaccessibles', 'noflipx',
        'cold', 'nomongen', 'nodeathdrops', 'noautosearch', 'fumaroles',
        'stormy',
    ], env);
    assert.deepEqual(flags, {
        noteleport: true, hardfloor: true, nommap: true, shortsighted: true,
        arboreal: true, is_maze_lev: true, hero_memory: true, graveyard: true,
        corrmaze: true, sokoban_rules: true, temperature: -1,
        rndmongen: false, deathdrops: false, noautosearch: true,
        fumaroles: true, stormy: true,
    });
    assert.deepEqual(coder, {
        allow_flips: 1, premapped: true, solidify: true,
        check_inaccessibles: true,
    });
    assert.equal(frame.icedpools, true);
    // C: noflipy clears bit 1, noflip clears both; hot and temperate set
    // temperature 1 and 0.
    lspo_level_flags(['noflipy', 'hot'], env);
    assert.equal(coder.allow_flips, 0);
    assert.equal(flags.temperature, 1);
    lspo_level_flags(['temperate'], env);
    assert.equal(flags.temperature, 0);
    assert.throws(() => lspo_level_flags(['bogus'], env), /Unknown level flag bogus/u);
    assert.throws(() => lspo_level_flags([], env), /expected string params/u);
});

test('sp_lev.c lspo_message joins lines into gl.lev_message', () => {
    const state = {};
    lspo_message(['first'], { state });
    assert.equal(state.gl.lev_message, 'first');
    lspo_message(['second'], { state });
    assert.equal(state.gl.lev_message, 'first\nsecond');
    // C: luaL_checkstring converts a number.
    lspo_message([3], { state });
    assert.equal(state.gl.lev_message, 'first\nsecond\n3');
    assert.throws(() => lspo_message([], { state }), /Wrong parameters/u);
});

test('nhlua.c get_table_int, lua_tointeger, and nhl_get_xy_params read integers', () => {
    // get_table_int() is luaL_checkinteger() on a required field.
    assert.equal(get_table_int({ srcroom: 2 }, 'srcroom'), 2);
    assert.throws(() => get_table_int({}, 'srcroom'), /integer/u);
    // lua_tointeger() answers 0 for anything without an integer value.
    assert.equal(lua_tointeger(7), 7);
    assert.equal(lua_tointeger(7.5), 0);
    assert.equal(lua_tointeger(undefined), 0);

    // nhl_get_xy_params(): two integers, or one coordinate table, set both
    // outputs and answer TRUE; anything else answers FALSE and leaves them.
    const c = { x: -1, y: -1 };
    assert.equal(nhl_get_xy_params([4, 7], c), true);
    assert.deepEqual(c, { x: 4, y: 7 });
    assert.equal(nhl_get_xy_params([[5, 6]], c), true);
    assert.deepEqual(c, { x: 5, y: 6 });
    assert.equal(nhl_get_xy_params([{ x: 8, y: 9 }], c), true);
    assert.deepEqual(c, { x: 8, y: 9 });
    assert.equal(nhl_get_xy_params([], c), false);
    assert.deepEqual(c, { x: 8, y: 9 });
    // A lone string is neither form: stair("up") leaves x and y at -1.
    assert.equal(nhl_get_xy_params(['up'], c), false);
    assert.deepEqual(c, { x: 8, y: 9 });
});
