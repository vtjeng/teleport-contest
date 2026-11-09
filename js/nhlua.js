// nhlua.js -- Lua-state initialization side effects used by live callers.
// C ref: nhlua.c nhl_init() and dat/nhlib.lua's global alignment shuffle,
// and nhlua.c's Lua table accessors. version.js imports this module during
// startup; check_mapchr() and
// get_table_mapchr_opt(), which need sp_lev.c's splev_chr2typ(), live in
// mklev.js beside it.

import { game } from './gstate.js';
import { note_unported } from './unported.js';
import { rn2 } from './rng.js';
import {
    NHCORE_ENTER_TUTORIAL,
    NHCORE_LEAVE_TUTORIAL,
    NUM_TIME_FUNCS,
} from './const.js';

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

// version.js loads this module during startup, before the inventory modules
// it would otherwise import have initialized; the gamestate code loads them
// when the tutorial is first entered.
async function gamestateModules() {
    const [invent, obj, objectGeneration, ttyMessage, uInit, worn]
        = await Promise.all([
            import('./invent.js'),
            import('./obj.js'),
            import('./object_generation.js'),
            import('./tty_message.js'),
            import('./u_init.js'),
            import('./worn.js'),
        ]);
    return {
        ...invent,
        extract_nobj: obj.extract_nobj,
        ...objectGeneration,
        ttyPline: ttyMessage.ttyPline,
        init_uhunger: uInit.init_uhunger,
        ...worn,
    };
}

// The C restore memcpy()s each saved block over the live one. Copy in place
// so modules holding the live array keep seeing the restored values.
function copyInto(target, source) {
    if (!Array.isArray(target) || !Array.isArray(source)) return;
    target.length = 0;
    for (const entry of structuredClone(source)) target.push(entry);
}

// C ref: nhlua.c free_tutorial(). A normal exit has already emptied
// gmst_invent; the saved hero, discoveries and counts are released.
function free_tutorial(state) {
    state.gmst_invent = null;
    state.gmst_ubak = null;
    state.gmst_disco = null;
    state.gmst_mvitals = null;
}

function tutorialInventoryHooks({ objectGenerationHooks }) {
    return objectGenerationHooks({
        // A tutorial transition has no active doff operation. The old
        // level's monster visibility state is discarded by goto_level().
        cancelDoff() {},
        monsterUnseesProperty() {},
    });
}

function zeroSpellbook(spellbook) {
    return spellbook.map((spell) => Object.fromEntries(
        Object.keys(spell ?? {}).map((field) => [field, 0]),
    ));
}

// C ref: nhlua.c nhl_gamestate(TRUE), reached from nhlib.lua
// tutorial_leave(). The saved hero, inventory, discoveries, generation
// counts and spellbook replace the tutorial's; the level change in progress
// keeps the current u.uz and u.uz0.
async function restore_gamestate(state, modules) {
    const {
        addinv_nomerge, extract_nobj, init_uhunger, INVLET_BASIC, setworn,
        ttyPline, update_inventory, useupall,
    } = modules;
    const hooks = tutorialInventoryHooks(modules);
    const cur_uz = { ...state.u.uz };
    const cur_uz0 = { ...state.u.uz0 };

    state.moves = state.gmst_moves;
    await ttyPline(`Resetting time to move #${state.moves}.`, state);
    state.gmst_moves = 0;

    state.lastinvnr = INVLET_BASIC - 1;
    while (state.invent)
        await useupall(state.invent, { state, hooks });
    let otmp;
    while ((otmp = state.gmst_invent) != null) {
        const wornmask = otmp.owornmask;
        otmp.owornmask = 0;
        state.gmst_invent = extract_nobj(otmp, state.gmst_invent);
        await addinv_nomerge(otmp, { state, hooks });
        if (wornmask) await setworn(otmp, wornmask, { state, hooks });
    }
    // memcpy(&u, gmst_ubak, sizeof u)
    for (const key of Object.keys(state.u)) delete state.u[key];
    Object.assign(state.u, structuredClone(state.gmst_ubak));
    copyInto(state.svd?.disco, state.gmst_disco);
    copyInto(state.svm?.mvitals ?? state.mvitals, state.gmst_mvitals);
    // Clear user-given object type names.
    for (const type of state.objects ?? []) {
        if (type?.oc_uname) type.oc_uname = null;
    }
    state.u.uz = cur_uz;
    state.u.uz0 = cur_uz0;
    await init_uhunger(state);
    free_tutorial(state);
    state.gmst_stored = false;
    copyInto(state.svs?.spl_book, state.gmst_spl_book);
    update_inventory({ state, hooks });
}

// C ref: nhlua.c nhl_gamestate(), reached through nh.gamestate() from
// dat/nhlib.lua tutorial_enter() and tutorial_leave(). On save, inventory
// moves to gmst_invent in reverse order; each object's owornmask stays set
// as the flag that re-wears it when the state is restored.
export async function nhl_gamestate(reststate, state = game) {
    const modules = await gamestateModules();
    if (reststate !== Boolean(state.gmst_stored)) {
        // C calls impossible() for a save while stored or a restore with
        // nothing stored, then still runs update_inventory().
        note_unported('pline.c impossible');
        modules.update_inventory({
            state, hooks: tutorialInventoryHooks(modules),
        });
        return;
    }
    if (reststate) {
        await restore_gamestate(state, modules);
        return;
    }
    const {
        freeinv, INVLET_BASIC, setnotworn, update_inventory,
    } = modules;
    const hooks = tutorialInventoryHooks(modules);
    state.gmst_moves = state.moves;
    state.gmst_invent = null;
    while (state.invent) {
        const obj = state.invent;
        const wornmask = obj.owornmask;
        setnotworn(obj, { state, hooks });
        freeinv(obj, { state, hooks });
        obj.owornmask = wornmask;
        obj.nobj = state.gmst_invent;
        state.gmst_invent = obj;
    }
    state.lastinvnr = INVLET_BASIC - 1;
    state.gmst_ubak = structuredClone(state.u);
    state.gmst_disco = structuredClone(state.svd?.disco ?? []);
    state.gmst_mvitals = structuredClone(
        state.svm?.mvitals ?? state.mvitals ?? [],
    );
    const spellbook = state.svs?.spl_book ?? [];
    state.gmst_spl_book = structuredClone(spellbook);
    state.svs ??= {};
    state.svs.spl_book = zeroSpellbook(spellbook);
    state.gmst_stored = true;
    update_inventory({ state, hooks });
}

// C ref: dat/nhlib.lua tutorial_enter(). It registers the tutorial's
// cmd_before and end_turn callbacks, then saves state with nh.gamestate().
async function tutorial_enter(state) {
    state.tutorialCallbacks = {
        cmd_before: true,
        end_turn: true,
    };
    await nhl_gamestate(false, state);
}

// C ref: dat/nhlib.lua tutorial_leave(). It removes both callbacks, then
// restores state with nh.gamestate(true).
async function tutorial_leave(state) {
    delete state.tutorialCallbacks;
    await nhl_gamestate(true, state);
}

// C ref: dat/nhlib.lua tutorial_turn() and its tutorial_events table. The
// only event has no ucoord, so it is tried on every call. When the hero's
// nutrition is below 148, obj.new() (nhlobj.c l_obj_new_readobjnam()) parses
// the name through readobjnam(), o:placeobj() (l_obj_placeobj()) puts the
// food under the hero, and each nh.pline(..., true) (nhlua.c nhl_pline())
// is a pline followed by display_nhwindow(WIN_MESSAGE, TRUE). Returning true
// removes the event.
async function tutorial_turn(state) {
    const events = state.tutorial_events;
    if (!events?.hunger || !(state.u.uhunger < 148)) return;
    const [{ readobjnam }, { objectGenerationEnv }, { place_object },
        { newsym }, ttyMessage, { cmd_from_ecname }] = await Promise.all([
        import('./objnam_readobjnam.js'),
        import('./object_generation.js'),
        import('./obj.js'),
        import('./display.js'),
        import('./tty_message.js'),
        import('./cmd.js'),
    ]);
    const obj = await readobjnam(
        'blessed food ration', null, objectGenerationEnv({ state }),
    );
    // l_obj_placeobj(): cvt_to_abscoord() adds nothing once
    // level_finalize_topology() has zeroed xstart and ystart, and
    // obj_extract_self() leaves a free object where it is.
    if (obj) {
        place_object(obj, state.u.ux, state.u.uy, { state });
        newsym(state.u.ux, state.u.uy);
    }
    await ttyMessage.ttyPline(
        "Looks like you're getting hungry.  You'll starve to death, unless you eat something.",
        state,
    );
    await ttyMessage.displayPendingTtyMessageWindow(state);
    await ttyMessage.ttyPline(
        `Comestibles are eaten with '${cmd_from_ecname('eat', state)}'`,
        state,
    );
    await ttyMessage.displayPendingTtyMessageWindow(state);
    delete events.hunger;
}

// C ref: allmain.c moveloop_core() (558-563), which runs nhcore.lua
// nh_callback_run("end_turn") at the end of every call that reaches the
// command dispatch. tutorial_turn() is the only end_turn callback;
// tutorial_enter() registers it and tutorial_leave() removes it.
export async function run_end_turn_callbacks(state = game) {
    if (state.tutorialCallbacks?.end_turn) await tutorial_turn(state);
}

// C ref: nhlua.c tutorial() (1835-1846), called by do.c goto_level().
// dat/nhcore.lua binds enter_tutorial and leave_tutorial to nhlib.lua
// tutorial_enter() and tutorial_leave(), which this port runs in place of
// the Lua calls. After leaving, neither call is available again.
export async function tutorial(entering, state = game) {
    state.gl ??= {};
    const available = state.gl.nhcore_call_available
        ??= Array(NHCORE_CALL_NAMES.length).fill(true);
    if (entering) {
        if (available[NHCORE_ENTER_TUTORIAL]) await tutorial_enter(state);
        return;
    }
    if (available[NHCORE_LEAVE_TUTORIAL]) await tutorial_leave(state);
    available[NHCORE_ENTER_TUTORIAL] = false;
    available[NHCORE_LEAVE_TUTORIAL] = false;
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

// C ref: nhlua.c load_lua(). This bounded adapter preserves initialization
// and registered nhlib.lua's top-level effects for discarded-return callers.
// VM allocation/sandbox enforcement, arbitrary programs, and teardown remain
// gaps. The alignment arrays are temporary, as in the source Lua state; they
// are not Lua pointers or success values and are never published to the game.
export function load_lua(name, sbi, state = game, env = {}) {
    note_unported('nhlua.c nhlL_newstate');
    state.iflags.in_lua = true;
    nhl_init(env.random ?? rn2); // Implicit nhlib.lua load during nhl_init.
    if (name === 'nhlib.lua') {
        nhl_init(env.random ?? rn2); // Explicit requested library execution.
    } else {
        note_unported('nhlua.c nhl_loadlua');
    }
    note_unported('nhlua.c nhl_done');
    state.iflags.in_lua = false;
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
    // Lua's option matcher compares C strings, so bytes after NUL do not
    // participate in strcmp (or its invalid-option diagnostic).
    const cName = name.split('\0', 1)[0];
    const index = opts.indexOf(cName);
    if (index < 0) throw new Error(`invalid option '${cName}'`);
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
    if (typeof value === 'function') {
        value = value();
        // C applies luaL_optstring after nhl_pcall_handle. Its numeric result
        // is string-coercible; a raw numeric table field is still rejected.
        if (typeof value === 'number') value = luaL_checkstring(value);
    }
    if (value != null && typeof value !== 'string')
        throw new Error('get_table_str_opt: no string');
    // Unlike a Lua VM string, this reader's result is an owned C dupstr().
    // Preserve empty strings (including a leading NUL), defaults and null.
    const text = value ?? defval ?? null;
    return text === null ? null : text.split('\0', 1)[0];
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
