// nhlua.js -- Lua-state initialization side effects used by live callers.
// C ref: nhlua.c nhl_init() and dat/nhlib.lua's global alignment shuffle,
// and nhlua.c's Lua table accessors. version.js imports this module during
// startup, so it imports nothing itself; check_mapchr() and
// get_table_mapchr_opt(), which need sp_lev.c's splev_chr2typ(), live in
// mklev.js beside it.

import { game } from './gstate.js';
import { note_unported } from './unported.js';
import { NUM_TIME_FUNCS } from './const.js';

// C ref: nhlua.c nhcore_call_names[]. The JS port has no Lua VM; a supplied
// `state.gl.luacore` is therefore only the text-backed boundary object used
// by source-pinned tests and future callers. It may contain an `nhcore`
// object, but this module never creates or evaluates Lua code.
const NHCORE_CALL_NAMES = Object.freeze([
    'start_new_game',
    'restore_old_game',
    'moveloop_turn',
    'game_exit',
    'getpos_tip',
    'enter_tutorial',
    'leave_tutorial',
]);

function nhcoreState(state) {
    return state?.gl ?? null;
}

function isLuaTable(value) {
    return value !== null && typeof value === 'object';
}

// C ref: nhlua.c l_nhcore_done(). Lua close and the private pattern state
// remain explicit gaps because their return values are not used by the C
// caller and the JS port deliberately has no Lua VM or filesystem-backed
// pattern matcher.
export function l_nhcore_done(state = game) {
    const gl = nhcoreState(state);
    if (gl?.luacore) {
        note_unported('nhlua.c nhl_done');
        // C clears gl.luacore after nhl_done(), even when Lua teardown is not
        // available at this boundary.
        gl.luacore = null;
    }
    note_unported('nhlua.c end_luapat');
}

// C ref: nhlua.c l_nhcore_call(). A text-backed core can expose the same
// table shape for guard and availability tests. Calling the Lua function is
// still an unported nhl_pcall_handle() operation, so do not execute a JS
// function as a fabricated Lua VM substitute.
export function l_nhcore_call(callidx, state = game) {
    const gl = nhcoreState(state);
    if (callidx < 0 || callidx >= NHCORE_CALL_NAMES.length
        || !gl?.luacore)
        return;

    // l_nhcore_init() marks every entry available after loading nhcore.lua.
    // A boundary object with luacore is the JS equivalent of that loaded
    // state; keep the C static availability array beside the represented gl
    // state so a missing callback stays unavailable until the next init.
    const available = gl.nhcore_call_available
        ??= Array(NHCORE_CALL_NAMES.length).fill(true);
    if (!available[callidx]) return;

    const nhcore = gl.luacore.nhcore;
    if (!isLuaTable(nhcore)) {
        // C closes the persistent state and clears gl.luacore when the
        // global nhcore is not a table.
        note_unported('nhlua.c nhl_done');
        gl.luacore = null;
        return;
    }

    const callback = nhcore[NHCORE_CALL_NAMES[callidx]];
    if (typeof callback === 'function') {
        note_unported('nhlua.c nhl_pcall_handle');
    } else {
        // C disables only this callback when the field is not a function.
        available[callidx] = false;
    }
}

// C ref: nhlua.c nhl_error(). Lua's debug API supplies currentline and
// short_src; a JS boundary may provide those fields directly or under
// `debug`. lua_error() does not return, so the corresponding JS operation is
// a thrown Error whose message is the exact C-formatted payload.
export function nhl_error(luaState, msg) {
    const debug = luaState?.debug ?? luaState ?? {};
    const line = Number.isFinite(debug.currentline) ? debug.currentline : 0;
    const source = debug.short_src == null ? '' : String(debug.short_src);
    throw new Error(`${String(msg)} (line ${line} ${source})`);
}

// Every nhl_init() loads nhlib.lua. Its three-entry table uses Fisher-Yates
// order, so initialization consumes rn2(3) and then rn2(2).
export function nhl_init(random) {
    const alignments = ['law', 'neutral', 'chaos'];
    for (let length = alignments.length; length > 1; --length) {
        const selected = random(length);
        [alignments[length - 1], alignments[selected]] = [
            alignments[selected], alignments[length - 1],
        ];
    }
    return alignments;
}

// C ref: nhlua.c nhl_get_timertype(). Lua callback arguments are represented
// by an array in the JS port, so this keeps Lua's one-based and negative stack
// indices at the boundary rather than changing the caller's argument shape.
const TIMER_NAMES = Object.freeze([
    'rot-organic', 'rot-corpse', 'revive-mon', 'zombify-mon',
    'burn-obj', 'hatch-egg', 'fig-transform', 'shrink-glob',
    'melt-ice',
]);

function luaStackValue(args, index) {
    if (!Array.isArray(args) || !Number.isInteger(index) || index === 0)
        return undefined;
    const position = index > 0 ? index - 1 : args.length + index;
    return args[position];
}

export function nhl_get_timertype(args, index) {
    const ret = luaL_checkoption(
        luaStackValue(args, index), null, TIMER_NAMES,
    );
    if (ret < 0 || ret >= NUM_TIME_FUNCS)
        nhl_error(null, 'Unknown timer type');
    return ret;
}

// The C helpers call lua_rawset() on the table at stack index -3. In the
// text-backed JS boundary that table is passed directly; assigning null or
// undefined models Lua's rawset(nil), which removes the field.
function rawSetTableEntry(table, name, value) {
    if (!isLuaTable(table))
        throw new Error(`table expected, got ${luaL_typename(table)}`);
    if (value == null) delete table[name];
    else table[name] = value;
}

// C ref: nhlua.c nhl_add_table_entry_int(). The C helper is void, so this
// mutates the represented table without returning it for chaining.
export function nhl_add_table_entry_int(table, name, value) {
    rawSetTableEntry(table, name, value);
}

// C ref: nhlua.c nhl_add_table_entry_char(). A JS caller may already hold a
// one-character string for a C char; numeric values retain C's %c behavior.
export function nhl_add_table_entry_char(table, name, value) {
    const character = typeof value === 'string'
        ? value.slice(0, 1)
        : String.fromCharCode(value);
    rawSetTableEntry(table, name, character);
}

// C ref: nhlua.c nhl_add_table_entry_str().
export function nhl_add_table_entry_str(table, name, value) {
    rawSetTableEntry(table, name, value);
}

// C ref: nhlua.c nhl_add_table_entry_bool().
export function nhl_add_table_entry_bool(table, name, value) {
    rawSetTableEntry(table, name, Boolean(value));
}

// C ref: nhlua.c nhl_add_table_entry_region(). The nested table is built by
// the integer helper in the same source order before it is assigned.
export function nhl_add_table_entry_region(table, name, x1, y1, x2, y2) {
    const region = {};
    nhl_add_table_entry_int(region, 'x1', x1);
    nhl_add_table_entry_int(region, 'y1', y1);
    nhl_add_table_entry_int(region, 'x2', x2);
    nhl_add_table_entry_int(region, 'y2', y2);
    rawSetTableEntry(table, name, region);
}

// C ref: nhlua.c's table accessors. A des.* call receives its Lua table as a
// JavaScript object, so each reader takes that object where the C reads the
// table at the top of the Lua stack. A Lua error (nhl_error, luaL_check*)
// is a thrown Error.


// C ref: luaL_typename().
export function luaL_typename(value) {
    if (value == null) return 'nil';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'function') return 'function';
    return 'table';
}

// C ref: luaL_checkinteger(). Lua integers are the only numbers the des.*
// tables carry, so a non-integer number is an error too.
export function luaL_checkinteger(value) {
    if (!Number.isInteger(value))
        throw new Error(`number has no integer representation: ${String(value)}`);
    return value;
}

// C ref: lua_tointeger(). An integer as itself; anything without an integer
// representation reads as 0, where luaL_checkinteger() would error.
export function lua_tointeger(value) {
    return Number.isInteger(value) ? value : 0;
}

// C ref: luaL_checkstring(). A string, or a number converted to one.
export function luaL_checkstring(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    throw new Error(`string expected, got ${luaL_typename(value)}`);
}

// C ref: luaL_checkoption(). The index of `value` in `opts`, or of `defval`
// when `value` is nil; any other string is an error.
export function luaL_checkoption(value, defval, opts) {
    const name = value == null ? defval : value;
    if (typeof name !== 'string')
        throw new Error(`string expected, got ${luaL_typename(value)}`);
    const index = opts.indexOf(name);
    if (index < 0) throw new Error(`invalid option '${name}'`);
    return index;
}

// C ref: nhlua.c lcheck_param_table(). The first argument, which must be a
// table; a call with no arguments gets an empty one, and extra arguments are
// dropped.
export function lcheck_param_table(args) {
    if (args.length < 1) return {};
    const table = args[0];
    if (table == null || typeof table !== 'object')
        throw new Error(`table expected, got ${luaL_typename(table)}`);
    return table;
}

// C ref: nhlua.c get_table_boolean(). A Lua boolean or a 0/1 number, or one
// of "true", "false", "yes", "no", whose value is the option's index (the
// source's boolstr2i[] mapping is commented out, so "true" reads as 0).
export function get_table_boolean(table, name) {
    const value = table[name];
    let ret = -1;
    if (typeof value === 'string') {
        ret = luaL_checkoption(value, null, ['true', 'false', 'yes', 'no']);
    } else if (typeof value === 'boolean') {
        ret = value ? 1 : 0;
    } else if (typeof value === 'number') {
        ret = luaL_checkinteger(value);
        if (ret < 0 || ret > 1) ret = -1;
    }
    if (ret === -1) throw new Error('Expected a boolean');
    return ret;
}

// C ref: nhlua.c get_table_boolean_opt().
export function get_table_boolean_opt(table, name, defval) {
    if (table[name] == null) return defval;
    return get_table_boolean(table, name);
}

// C ref: nhlua.c get_table_int(). A required integer field.
export function get_table_int(table, name) {
    return luaL_checkinteger(table[name]);
}

// C ref: nhlua.c get_table_int_opt().
export function get_table_int_opt(table, name, defval) {
    if (table[name] == null) return defval;
    return luaL_checkinteger(table[name]);
}

// C ref: nhlua.c get_table_str_opt(). A string field, the result of calling
// a function field, or `defval`; null when both are absent.
export function get_table_str_opt(table, name, defval) {
    let value = table[name];
    if (typeof value === 'function') value = value();
    if (value != null && typeof value !== 'string')
        throw new Error('get_table_str_opt: no string');
    return value ?? defval ?? null;
}

// C ref: nhlua.c get_table_str(). A required string field.
export function get_table_str(table, name) {
    return luaL_checkstring(table[name]);
}

// C ref: nhlua.c get_table_option(). The index of the field's value in
// `opts`, defaulting to `defval` when the field is absent.
export function get_table_option(table, name, defval, opts) {
    return luaL_checkoption(table[name], defval, opts);
}
