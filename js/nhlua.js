// nhlua.js -- Lua-state initialization side effects used by live callers.
// C ref: nhlua.c nhl_init() and dat/nhlib.lua's global alignment shuffle,
// and nhlua.c's Lua table accessors. version.js imports this module during
// startup, so it imports nothing itself; check_mapchr() and
// get_table_mapchr_opt(), which need sp_lev.c's splev_chr2typ(), live in
// mklev.js beside it.

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
