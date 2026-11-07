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
export function pushRngLogEntry(entry) {
    if (!_rngLogEnabled) return;
    if (dropAfterTermination(entry)) return;
    _rngLog.push(entry);
}

function coreDraw(context, x) {
    const val = isaac64_next_uint64(context);
    return Number(val % BigInt(x));
}

function logResult(name, args, result) {
    if (!_rngLogEnabled) return;
    const entry = `${name}(${args})=${result}`;
    if (dropAfterTermination(entry)) return;
    _rngLog.push(entry);
}

// ── Segment termination ──
//
// C's end.c nh_terminate() exits the process, so nothing runs after it. The
// port's nh_terminate() (js/end.js) instead suspends the chain that called it
// on a promise that never settles, and the entry points (NethackGame.start()
// and moveloop_core()) race their bodies against this segment's termination
// notice. The state lives here, not on `game`, because start() replaces
// program_state partway through, unit tests often pass a state other than
// `game`, and the RNG log writers above and nhgetch() (js/input.js) read it
// directly. NethackGame.start() resets it on entry; tests reset it through
// scripts/expect-terminated.mjs.
//
// A promise some caller discarded is not part of the suspended chain and can
// keep running after the segment terminated. The judge scores only the RNG
// log and the input-boundary captures, so those are guarded: an RNG log
// append after termination is dropped, and nhgetch() suspends, and each is
// recorded as a violation that runSegmentStrict() fails on and runSegment()
// reports.
let _termination = newTerminationState();

function newTerminationState() {
    let settle;
    const notice = new Promise((resolve) => { settle = resolve; });
    return {
        terminated: false,
        settled: false,
        notice,
        settle,
        // One resolver per pending race, removed when its body settles, so a
        // long game does not accumulate reactions on the notice.
        waiters: new Set(),
        violations: [],
    };
}

function dropAfterTermination(entry) {
    if (!_termination.terminated) return false;
    recordTerminationViolation('rng', entry);
    return true;
}

// Start a new segment's termination state: not terminated, a fresh pending
// notice, and no violations.
export function resetTermination() {
    _termination = newTerminationState();
}

// nh_terminate() marks the segment before its final capture, so that a stray
// chain that runs while the capture is awaited cannot add to the RNG log
// after the captured slice.
export function markTerminated() {
    _termination.terminated = true;
}

export function isTerminated() {
    return _termination.terminated;
}

// The promise nh_terminate() settles once the segment has terminated.
export function terminationNotice() {
    return _termination.notice;
}

export function settleTerminationNotice() {
    const state = _termination;
    if (state.settled) return;
    state.settled = true;
    state.settle();
    const waiters = [...state.waiters];
    state.waiters.clear();
    for (const wake of waiters) wake();
}

export function recordTerminationViolation(kind, detail) {
    _termination.violations.push({ kind, detail: String(detail) });
}

export function terminationViolations() {
    return _termination.violations.map((violation) => ({ ...violation }));
}

// A promise that never settles. Each call creates its own, so a suspended
// chain is unreachable once its segment is discarded and can be collected;
// a shared promise would keep every suspended segment's state alive.
export function neverSettles() {
    return new Promise(() => {});
}

// One macrotask. Game code yields only to microtasks in Node, so a body that
// a discarded chain left running has, after this, either finished or
// suspended at nhgetch()'s guard.
export function oneMacrotask() {
    return new Promise((resolve) => { setTimeout(resolve, 0); });
}

// Await whichever settles first: `body` (a promise) or this segment's
// termination notice. Resolves { terminated: false, value } with the body's
// value, rejects with its error, or, when the notice wins, resolves
// { terminated: true } after one macrotask. A body that rejects after the
// notice won is recorded as a violation.
export async function raceTermination(body) {
    const state = _termination;
    const outcome = await new Promise((resolve, reject) => {
        let decided = false;
        const wake = () => {
            if (decided) return;
            decided = true;
            resolve({ terminated: true });
        };
        if (state.settled) wake();
        else state.waiters.add(wake);
        Promise.resolve(body).then((value) => {
            state.waiters.delete(wake);
            if (decided) return;
            decided = true;
            resolve({ terminated: false, value });
        }, (error) => {
            state.waiters.delete(wake);
            if (decided) {
                recordTerminationViolation('rejection',
                    error instanceof Error ? `${error.name}: ${error.message}` : error);
                return;
            }
            decided = true;
            reject(error);
        });
    });
    if (outcome.terminated) await oneMacrotask();
    return outcome;
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

export function cloneIsaacContext(context) {
    if (!context
        || !Array.isArray(context.m)
        || !Array.isArray(context.r)) {
        throw new TypeError(
            'RNG planning requires an initialized ISAAC context',
        );
    }
    return {
        ...context,
        m: [...context.m],
        r: [...context.r],
    };
}

// A planning clone (js/unported_monster_actions.js
// preflightSimpleMonsterActions()) dry-runs a turn before the live pass runs
// it. It injects a random source over its own copy of the core ISAAC context,
// but a callee that reaches the module-level wrappers below instead -- a
// default `{ rn2 }` argument, or an env rebuilt without `random` -- would
// otherwise advance the live stream and log a call C never makes. While a
// planning context is installed, the wrappers draw from it, unlogged, so
// such a draw lands in the clone's sequence where the clone's own draws are.
let _planningCtx = null;

export async function withPlanningCoreContext(context, run) {
    const previous = _planningCtx;
    _planningCtx = context;
    try {
        return await run();
    } finally {
        _planningCtx = previous;
    }
}

// True while a planning clone's core context is installed. done() and
// nh_terminate() (js/end.js) refuse to end the live game from a rehearsal.
export function planningContextInstalled() {
    return _planningCtx !== null;
}

function liveCtx() {
    return _planningCtx ?? game.coreCtx;
}

function liveLog() {
    return _planningCtx ? undefined : logResult;
}

// C ref: rn2(x) — random number 0..x-1
export function rn2(x) {
    return rn2From(liveCtx(), x, liveLog());
}

// C ref: rn2_on_display_rng(x) — a separate stream for cosmetic choices.
// Display calls are absent from the recorder's ordinary core RNG log.
export function rn2_on_display_rng(x, state = game) {
    if (x <= 0) return 0;
    const val = isaac64_next_uint64(state.displayCtx);
    return Number(val % BigInt(x));
}

// C ref: rnd(x) — random number 1..x
export function rnd(x) {
    return rndFrom(liveCtx(), x, liveLog());
}

// C ref: rnd_on_display_rng(x)
export function rnd_on_display_rng(x) {
    return rn2_on_display_rng(x) + 1;
}

// C ref: rn1(x, y) — random number y..y+x-1
export function rn1(x, y) {
    return rn1From(liveCtx(), x, y, liveLog());
}

// C ref: rnl(x) — luck-biased random number in 0..x-1.
export function rnl(x) {
    return rnlFrom(liveCtx(), game, x, liveLog());
}

// C ref: d(n, x) — roll n dice of x sides
export function d(n, x) {
    return dFrom(liveCtx(), n, x, liveLog());
}

// C ref: rne(x) — exponentially distributed
// Internal rn2 calls are logged (matching C's PRNG log format).
export function rne(x) {
    return rneFrom(liveCtx(), game, x, liveLog());
}

// C ref: rnz(i) — fuzzy random around i
// Internal rn2/rne calls are logged (matching C's PRNG log format).
export function rnz(i) {
    return rnzFrom(liveCtx(), game, i, liveLog());
}

export const c_d = d;
export const lua_d = d;

// C ref: rnd.c. C has one core generator, and any function can call any of
// its wrappers, so the port passes this one complete set wherever a function
// takes an injected `random` and the caller has none of its own. While a
// planning clone is installed, each wrapper draws from the clone's stream.
// scripts/random-source.test.mjs rejects any other hand-built set in js/.
export const coreRandom = Object.freeze({ d, rn1, rn2, rnd, rne, rnl, rnz });

// The same live set for a hero other than `game`'s, such as a planning
// clone's: rnl() reads that hero's Luck and rne() and rnz() its level.
export function coreRandomFor(state) {
    if (state === game) return coreRandom;
    return Object.freeze({
        d, rn1, rn2, rnd,
        rne: (x) => rneFrom(liveCtx(), state, x, liveLog()),
        rnl: (x) => rnlFrom(liveCtx(), state, x, liveLog()),
        rnz: (i) => rnzFrom(liveCtx(), state, i, liveLog()),
    });
}
