// version.js — Build version info

import { do_runtime_info, runtime_info_init } from './mdlib.js';
import { nhl_init } from './nhlua.js';
export const VERSION = '0.1.0';
export const BUILD_DATE = '2026-04-18';
export const COMMIT = 'contest-skeleton';
export const COMMIT_NUMBER = '0';
export const TELEPORT_BUILD_DATE = '2026-04-18';

export const VI_NUMBER = 1;
export const VI_NAME = 2;
export const VI_BRANCH = 4;
export const NETHACK_VERSION = '5.0.0';

const RECORDER_VERSION_ID =
    'MacOS NetHack Version 5.0.0 - last build May  2 2026 12:00:00.';
const LUA_VERSION = '5.4.8';
const LUA_COPYRIGHT = 'Lua 5.4.8  Copyright (C) 1994-2025 Lua.org, PUC-Rio';

const LONG_MAX = (1n << 63n) - 1n;
const LONG_MIN = -(1n << 63n);

// C ref: the recorder's glibc atoi(). version.c stores each result in int
// before FEATURE_NOTICE_VER casts it to unsigned long, so conversion has two
// widths: signed-long saturation followed by signed-32-bit narrowing.
function atoi(str) {
    const match = /^[\t\n\v\f\r ]*([+-]?[0-9]+)/u.exec(String(str));
    if (!match) return 0;
    let wide = BigInt(match[1]);
    if (wide > LONG_MAX) wide = LONG_MAX;
    else if (wide < LONG_MIN) wide = LONG_MIN;
    return Number(BigInt.asIntN(32, wide));
}

// C ref: hack.h FEATURE_NOTICE_VER(). The recorder ABI uses a 64-bit
// unsigned long. Cast each int before shifting, as the macro does; shifting a
// negative patch after a signed JavaScript bitwise conversion would produce a
// different value.
function feature_notice_ver(major, minor, patch) {
    const packed = (BigInt.asUintN(64, BigInt(major)) << 24n)
        | (BigInt.asUintN(64, BigInt(minor)) << 16n)
        | (BigInt.asUintN(64, BigInt(patch)) << 8n);
    return BigInt.asUintN(64, packed);
}

// C ref: version.c get_feature_notice_ver(). Only the characters before the
// second dot are validated. Empty major and minor components reach atoi(),
// and the complete suffix after the second dot is patch's atoi() input.
export function get_feature_notice_ver(str) {
    if (str == null) return 0n;
    const value = String(str);
    let firstDot = -1;
    let secondDot = -1;
    for (let index = 0; index < value.length; ++index) {
        const character = value[index];
        if (character === '.') {
            if (firstDot < 0) {
                firstDot = index;
            } else {
                secondDot = index;
                break;
            }
        } else if (character < '0' || character > '9') {
            return 0n;
        }
    }
    if (secondDot < 0) return 0n;
    return feature_notice_ver(
        atoi(value.slice(0, firstDot)),
        atoi(value.slice(firstDot + 1, secondDot)),
        atoi(value.slice(secondDot + 1)),
    );
}

// C ref: version.c get_current_feature_ver() and patchlevel.h. Keeping this
// in the same unsigned-long representation makes feature_alert_opts()'s
// future-version comparison exact even when a parsed component wrapped.
export function get_current_feature_ver() {
    return get_feature_notice_ver(NETHACK_VERSION);
}

// C ref: version.c status_version().  The canonical recorder is a release
// build without compiled git-branch metadata, so a branch-only request falls
// back to the numeric version exactly as the source does.
export function status_version(flags = {}, indent = false) {
    const requested = Math.trunc(Number(flags.versinfo ?? VI_NUMBER));
    const vflags = requested >= 1 && requested <= 7
        ? requested : VI_NUMBER;
    const parts = [];
    if (vflags & VI_NAME) parts.push('nethack');
    if ((vflags & VI_NUMBER) || parts.length === 0) {
        parts.push(NETHACK_VERSION);
    }
    const value = parts.join(' ');
    return indent ? ` ${value}` : value;
}

// C ref: version.c getversionstring(). The recorder is a release build, so
// no git hash, branch, prefix, or runtime port suffix follows version_id.
export function getversionstring() {
    return RECORDER_VERSION_ID;
}

function get_lua_version(state, random) {
    state.context ??= {};
    if (!state.context.versionLuaInitialized) {
        nhl_init(random);
        state.context.versionLuaInitialized = true;
    }
    return LUA_VERSION;
}

// C ref: version.c insert_rtoption(). It initializes Lua for every first
// colon-bearing line, even when that line only substitutes the regex token.
function insert_rtoption(line, state, random) {
    const luaVersion = get_lua_version(state, random);
    return line
        .replace(':PATMATCH:', 'posixregex')
        .replace(':LUAVERSION:', luaVersion)
        .replace(':LUACOPYRIGHT:', LUA_COPYRIGHT);
}

// C ref: version.c doextversion(). The injected renderer and RNG preserve
// version.js as a leaf of const.js's initialization DAG.
export async function doextversion(
    state,
    { displayTextWindow, random },
) {
    const lines = [{ text: getversionstring() }];
    const runtimeLines = runtime_info_init();
    const runtimeContext = { index: 0 };
    let prolog = true;

    for (;;) {
        let line = do_runtime_info(runtimeLines, runtimeContext);
        if (line === null) break;
        line = line.replace(/[\r\n]+$/u, '').replaceAll('\t', '        ');
        if (line && line[0] !== ' ') {
            lines.push({ text: '' });
            prolog = false;
        }
        if (prolog || !line) continue;
        if (line.includes(':')) line = insert_rtoption(line, state, random);
        lines.push({ text: line });
    }

    await displayTextWindow(state, lines);
    return 0; // C: ECMD_OK.
}
