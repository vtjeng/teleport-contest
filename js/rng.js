// rng.js — PRNG wrappers around ISAAC64.
// C ref: rnd.c — independent core and display RNG contexts.

import { isaac64_init, isaac64_next_uint64 } from './isaac64.js';
import { game } from './gstate.js';

let _rngLog = [];
let _rngLogEnabled = false;

export function initRng(seed) {
    game.currentSeed = seed;
    // Convert seed to 8 little-endian bytes
    let s = BigInt(seed) & 0xFFFFFFFFFFFFFFFFn;
    const bytes = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
        bytes[i] = Number(s & 0xFFn);
        s >>= 8n;
    }
    // options.c:initoptions_init() seeds both contexts independently. The
    // deterministic recorder supplies the same fixed seed to each call.
    game.coreCtx = isaac64_init(bytes);
    game.displayCtx = isaac64_init(bytes);
    _rngLog = [];
}

export function enableRngLog() { _rngLogEnabled = true; _rngLog = []; }
export function getRngLog() { return _rngLog; }
export function pushRngLogEntry(entry) { if (_rngLogEnabled) _rngLog.push(entry); }

function coreDraw(context, x) {
    const val = isaac64_next_uint64(context);
    return Number(val % BigInt(x));
}

function logResult(name, args, result) {
    if (_rngLogEnabled) _rngLog.push(`${name}(${args})=${result}`);
}

function rn2From(context, x, log) {
    if (x <= 0) return 0;
    const val = coreDraw(context, x);
    log?.('rn2', x, val);
    return val;
}

function rndFrom(context, x, log) {
    if (x <= 0) return 0;
    const val = coreDraw(context, x) + 1;
    log?.('rnd', x, val);
    return val;
}

function rn1From(context, x, y, log) {
    return rn2From(context, x, log) + y;
}

function rnlFrom(context, state, x, log) {
    if (x <= 0) return 0;

    // you.h: Luck is the sum of u.uluck and u.moreluck.
    let adjustment = (state.u?.uluck ?? 0) + (state.u?.moreluck ?? 0);
    if (x <= 15) {
        // C rounds Luck/3 away from zero for small ranges.
        adjustment = Math.trunc((Math.abs(adjustment) + 1) / 3)
            * Math.sign(adjustment);
    }

    let result = coreDraw(context, x);
    if (adjustment
        && rn2From(context, 37 + Math.abs(adjustment), log)) {
        result -= adjustment;
        if (result < 0) result = 0;
        else if (result >= x) result = x - 1;
    }
    log?.('rnl', x, result);
    return result;
}

function dFrom(context, n, x, log) {
    let result = n;
    for (let i = 0; i < n; i++) result += coreDraw(context, x);
    log?.('d', `${n},${x}`, result);
    return result;
}

function rneFrom(context, state, x, log) {
    const ulevel = state.u?.ulevel ?? 1;
    const utmp = ulevel < 15 ? 5 : Math.trunc(ulevel / 3);
    let tmp = 1;
    while (tmp < utmp && !rn2From(context, x, log)) tmp++;
    log?.('rne', x, tmp);
    return tmp;
}

function rnzFrom(context, state, i, log) {
    let x = i;
    let tmp = 1000;
    tmp += rn2From(context, 1000, log);
    tmp *= rneFrom(context, state, 4, log);
    if (rn2From(context, 2, log)) {
        x *= tmp;
        x = Math.trunc(x / 1000);
    }
    else { x *= 1000; x = Math.trunc(x / tmp); }
    log?.('rnz', i, x);
    return x;
}

// Build the same rnd.c wrapper family over a caller-owned core context. The
// simple-turn planner uses this with a cloned ISAAC context; live wrappers
// below use the global context and add recorder logging.
export function createCoreRandom(context, state = game) {
    return {
        d: (n, x) => dFrom(context, n, x),
        rn1: (x, y) => rn1From(context, x, y),
        rn2: (x) => rn2From(context, x),
        rnd: (x) => rndFrom(context, x),
        rne: (x) => rneFrom(context, state, x),
        rnl: (x) => rnlFrom(context, state, x),
        rnz: (i) => rnzFrom(context, state, i),
    };
}

// C ref: rn2(x) — random number 0..x-1
export function rn2(x) {
    return rn2From(game.coreCtx, x, logResult);
}

// C ref: rn2_on_display_rng(x) — a separate stream for cosmetic choices.
// Display calls are absent from the recorder's ordinary core RNG log.
export function rn2_on_display_rng(x) {
    if (x <= 0) return 0;
    const val = isaac64_next_uint64(game.displayCtx);
    return Number(val % BigInt(x));
}

// C ref: rnd(x) — random number 1..x
export function rnd(x) {
    return rndFrom(game.coreCtx, x, logResult);
}

// C ref: rnd_on_display_rng(x)
export function rnd_on_display_rng(x) {
    return rn2_on_display_rng(x) + 1;
}

// C ref: rn1(x, y) — random number y..y+x-1
export function rn1(x, y) {
    return rn1From(game.coreCtx, x, y, logResult);
}

// C ref: rnl(x) — luck-biased random number in 0..x-1.
export function rnl(x) {
    return rnlFrom(game.coreCtx, game, x, logResult);
}

// C ref: d(n, x) — roll n dice of x sides
export function d(n, x) {
    return dFrom(game.coreCtx, n, x, logResult);
}

// C ref: rne(x) — exponentially distributed
// Internal rn2 calls are logged (matching C's PRNG log format).
export function rne(x) {
    return rneFrom(game.coreCtx, game, x, logResult);
}

// C ref: rnz(i) — fuzzy random around i
// Internal rn2/rne calls are logged (matching C's PRNG log format).
export function rnz(i) {
    return rnzFrom(game.coreCtx, game, i, logResult);
}

export const c_d = d;
export const lua_d = d;
