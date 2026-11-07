// gstate.js — Global game state reference.
// All game modules import `game` from here.

// C decl.c:417 initializes gi.item_action_in_progress to FALSE for a new game.
function initialGameState() {
    return {
        item_action_in_progress: false,
        // C decl.c:init_svn initializes the saved NHUUID buffer to zero.
        // Native get_nhuuid() is inactive in the reference recorder build.
        svn: { nhuuid: '' },
    };
}

export let game = initialGameState();

export function resetGame() {
    if (liveGameDuringPlanning)
        throw new PlanningLiveGameError('resetGame() reached while planning');
    game = initialGameState();
    return game;
}

// A planning pass (js/unported_monster_actions.js
// preflightSimpleMonsterActions() and preflightElapsedTurnTail()) rehearses a
// turn on a planningState() clone and must not read or write the live game.
// Thousands of functions take their state as a parameter defaulting to
// `game`, or read `game` directly, so a planning call that forgets to pass
// the clone would otherwise reach the live game silently. While js/rng.js
// withPlanningCoreContext() runs a plan, `game` instead names a guard over
// the live game that catches every use, naming the property and the
// function that reached it. Identity tests (`state === game`) do not touch
// the guard and stay false for the clone, as they are for the live game's
// copy outside planning. scripts/planning-live-game-guard.test.mjs checks the
// guard; scripts/planning-leak-check.mjs checks the effects that do not go
// through `game` (the shared terminal, newsym(), the ISAAC streams).
//
// What the guard does with a use depends on the entry point, as a crash does
// (js/jsmain.js, before runSegment()). By default, and so under
// runSegmentStrict() and every local tool, it throws PlanningLiveGameError.
// The judge's runSegment() selects recording instead: the use is recorded
// and goes through to the live game, as it did before the guard existed, so
// a path no test reached costs the scored game nothing, and runSegment()
// reports what was recorded to the local scorers, which fail that game.
//
// js/youprop.js applies the same policy to a property macro given the game
// state in place of the hero, or the reverse: recordLiveGameUse() throws in
// local runs and, under runSegment(), records a `youpropArgument` use beside
// the planning uses, so the same reporter fails the game.
export class PlanningLiveGameError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PlanningLiveGameError';
    }
}

let liveGameDuringPlanning = null;
let recordPlanningUses = false;
// One entry per distinct message, in first-use order: { kind, detail, count }.
// `kind` is 'planningLiveGame' for the guard below and 'youpropArgument' for
// js/youprop.js.
const planningUses = new Map();

// Select recording (true) or throwing (false); returns the previous mode.
// Only js/jsmain.js runSegment() selects recording.
export function setPlanningUseRecording(record) {
    const previous = recordPlanningUses;
    recordPlanningUses = Boolean(record);
    return previous;
}

// The uses recorded since the last reset, as { kind, detail, count }.
export function planningLiveGameUses() {
    return [...planningUses.values()].map((use) => ({ ...use }));
}

export function resetPlanningLiveGameUses() {
    planningUses.clear();
}

// Lines 0-2 of the stack are the message, planningUse() and the trap below;
// line 3 is the function that used `game`, and lines 4-7 its callers, one of
// which is usually the call that did not pass the clone.
function framesOf(stack) {
    const frame = (line) => (line ?? '').trim().replace(/^at /u, '')
        .replace(/file:\/\/\S*\/js\//u, '').replace(/[()]/gu, '');
    const lines = String(stack ?? '').split('\n');
    const user = frame(lines[3]) || 'an unknown function';
    const callers = lines.slice(4, 8).map(frame).filter(Boolean);
    return callers.length ? `${user}, called from ${callers.join(' < ')}` : user;
}

// Unless recording is selected, throw makeError(detail); otherwise record one
// use of `kind`, so that runSegment() reports it, and return so that the
// caller can carry on.
export function recordLiveGameUse(kind, detail, makeError) {
    if (!recordPlanningUses) throw makeError(detail);
    const use = planningUses.get(detail);
    if (use) use.count++;
    else planningUses.set(detail, { kind, detail, count: 1 });
}

function planningUse(operation, property) {
    const name = typeof property === 'symbol' ? property.toString() : String(property);
    const where = framesOf(new Error().stack);
    const detail = `planning pass reached the live game: ${operation} game.${name} in ${where}`;
    recordLiveGameUse('planningLiveGame', detail, (message) => new PlanningLiveGameError(message));
}

// Each trap reports the use, which throws unless recording is selected, and
// then performs it on the live game.
const planningGuardHandler = {
    get: (target, property) => { planningUse('read', property); return Reflect.get(target, property, target); },
    set: (target, property, value) => { planningUse('write', property); return Reflect.set(target, property, value, target); },
    has: (target, property) => { planningUse('test', property); return Reflect.has(target, property); },
    deleteProperty: (target, property) => { planningUse('delete', property); return Reflect.deleteProperty(target, property); },
    defineProperty: (target, property, descriptor) => { planningUse('define', property); return Reflect.defineProperty(target, property, descriptor); },
    ownKeys: (target) => { planningUse('list', '<keys>'); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor: (target, property) => { planningUse('describe', property); return Reflect.getOwnPropertyDescriptor(target, property); },
    getPrototypeOf: (target) => { planningUse('prototype of', '<game>'); return Reflect.getPrototypeOf(target); },
    setPrototypeOf: (target, prototype) => { planningUse('set prototype of', '<game>'); return Reflect.setPrototypeOf(target, prototype); },
    isExtensible: (target) => { planningUse('test extensibility of', '<game>'); return Reflect.isExtensible(target); },
    preventExtensions: (target) => { planningUse('freeze', '<game>'); return Reflect.preventExtensions(target); },
};

// Run `run` with `game` replaced by the guard, restoring the live game on
// every exit. Only js/rng.js withPlanningCoreContext() calls this.
export async function withLiveGameGuarded(run) {
    if (liveGameDuringPlanning) return run();
    liveGameDuringPlanning = game;
    game = new Proxy(liveGameDuringPlanning, planningGuardHandler);
    try {
        return await run();
    } finally {
        game = liveGameDuringPlanning;
        liveGameDuringPlanning = null;
    }
}
