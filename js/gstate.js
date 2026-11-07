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
// the live game that throws on every use, naming the property and the
// function that reached it. Identity tests (`state === game`) do not touch
// the guard and stay false for the clone, as they are for the live game's
// copy outside planning. scripts/planning-live-game-guard.test.mjs checks the
// guard; scripts/planning-leak-check.mjs checks the effects that do not go
// through `game` (the shared terminal, newsym(), the ISAAC streams).
export class PlanningLiveGameError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PlanningLiveGameError';
    }
}

let liveGameDuringPlanning = null;

// Lines 0-2 of the stack are the message, refuse() and the trap below; line 3
// is the function that used `game`, and lines 4-7 its callers, one of which
// is usually the call that did not pass the clone.
function framesOf(stack) {
    const frame = (line) => (line ?? '').trim().replace(/^at /u, '')
        .replace(/file:\/\/\S*\/js\//u, '').replace(/[()]/gu, '');
    const lines = String(stack ?? '').split('\n');
    const user = frame(lines[3]) || 'an unknown function';
    const callers = lines.slice(4, 8).map(frame).filter(Boolean);
    return callers.length ? `${user}, called from ${callers.join(' < ')}` : user;
}

function refuse(operation, property) {
    const name = typeof property === 'symbol' ? property.toString() : String(property);
    const where = framesOf(new Error().stack);
    throw new PlanningLiveGameError(
        `planning pass reached the live game: ${operation} game.${name} in ${where}`,
    );
}

const planningGuardHandler = {
    get: (_target, property) => refuse('read', property),
    set: (_target, property) => refuse('write', property),
    has: (_target, property) => refuse('test', property),
    deleteProperty: (_target, property) => refuse('delete', property),
    defineProperty: (_target, property) => refuse('define', property),
    ownKeys: () => refuse('list', '<keys>'),
    getOwnPropertyDescriptor: (_target, property) => refuse('describe', property),
    getPrototypeOf: () => refuse('prototype of', '<game>'),
    setPrototypeOf: () => refuse('set prototype of', '<game>'),
    isExtensible: () => refuse('test extensibility of', '<game>'),
    preventExtensions: () => refuse('freeze', '<game>'),
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
