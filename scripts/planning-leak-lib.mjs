// Planning-leak detector for a scoring workspace (a temporary copy of js/).
//
// Before each monster turn and elapsed-turn tail, the port rehearses the turn
// on a planningState() clone inside preflightSimpleMonsterActions() and
// preflightElapsedTurnTail() (js/unported_monster_actions.js), then plays it
// live. A planning leak is a live effect of that rehearsal. js/gstate.js
// already makes every use of `game` throw while the rehearsal runs, so this
// detector watches the live effects that need no `game` reference, because
// the clone shares the objects they act on or the module holds them:
// - a write to the live terminal (the clone shares state.nhDisplay);
// - a glyph-buffer write (display.js show_glyph_cell());
// - a newsym() reached by the planners outside the planning context (inside
//   it newsym() returns at once);
// - a draw from the live game's core or display ISAAC context;
// - a write to the live message and top-line state, on the shared display
//   object or on the live game object.
//
// instrumentPlanningLeakWorkspace(root) edits only the workspace and keeps
// every line number; the edits only report to globalThis hooks. Then
// startPlanningLeakWatch(root), called in the replay process before the
// game runs, installs the hooks and returns a function that reports what
// they collected.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LINE_MARKER = '__PLANNING_LEAK__';
export const PLANNERS = ['preflightSimpleMonsterActions', 'preflightElapsedTurnTail'];

function replaceOnce(file, from, to) {
    const src = fs.readFileSync(file, 'utf8');
    const n = src.split(from).length - 1;
    if (n !== 1)
        throw new Error(`${path.basename(file)} shape changed: ${n} copies of ${JSON.stringify(from)}`);
    if (to.includes('\n') !== from.includes('\n')) throw new Error('line count would change');
    fs.writeFileSync(file, src.replace(from, () => to));
}

export function instrumentPlanningLeakWorkspace(root) {
    const js = (f) => path.join(root, 'js', f);
    const um = js('unported_monster_actions.js');
    const src = fs.readFileSync(um, 'utf8');
    for (const name of PLANNERS) {
        if (!src.includes(`export async function ${name}(`))
            throw new Error(`planner ${name} is no longer an exported async function`);
    }
    // Rebind each planner (an exported function declaration is a live
    // binding) to a wrapper that raises the planning depth while it runs.
    fs.writeFileSync(um, `${src.replace(/\n*$/u, '')}\n;{ const __leakWrap = (f) => async function __leakPlanningEntry(...a) { globalThis.__leakPlannerDepth = (globalThis.__leakPlannerDepth ?? 0) + 1; globalThis.__leakEnterPlanner?.(); try { return await f.apply(this, a); } finally { globalThis.__leakPlannerDepth -= 1; } }; ${PLANNERS.map((n) => `${n} = __leakWrap(${n});`).join(' ')} }\n`);
    replaceOnce(js('gstate.js'), 'export let game = initialGameState();', 'export let game = initialGameState(); globalThis.__leakLiveGame = () => liveGameDuringPlanning ?? game;');
    replaceOnce(js('rng.js'), '    const val = isaac64_next_uint64(context);', '    globalThis.__leakRng?.(context); const val = isaac64_next_uint64(context);');
    replaceOnce(js('rng.js'), '    const val = isaac64_next_uint64(state.displayCtx);', '    globalThis.__leakRng?.(state.displayCtx); const val = isaac64_next_uint64(state.displayCtx);');
    replaceOnce(js('display.js'), '    if (planningContextInstalled()) return;\n    // C display.c:926-928', '    if (planningContextInstalled()) return; globalThis.__leakNewsym?.(x, y);\n    // C display.c:926-928');
    replaceOnce(js('display.js'), '    // and the live pass paints the square when it plays the turn.\n    if (planningContextInstalled()) return;\n', '    // and the live pass paints the square when it plays the turn.\n    if (planningContextInstalled()) return; globalThis.__leakGlyph?.(x, y);\n');
    replaceOnce(js('jsmain.js'), '        this._screens = [];', '        this._screens = []; globalThis.__leakScreens = this._screens; globalThis.__leakSegment = (globalThis.__leakSegment ?? -1) + 1;');
}

// Frames inside these files are display or message plumbing; the leak site is
// the first frame outside them (the game code that reached the live effect).
const PLUMBING = new Set(['terminal.js', 'game_display.js', 'display.js', 'tty_message.js', 'topl.js', 'wintty.js', 'windows.js', 'rng.js', 'rnd.js', 'planning-leak-lib.mjs', 'planning-leak-replay.mjs']);
const TERMINAL_WRITES = ['setCell', 'putstr', 'clearRow', 'clearScreen', 'setCursor', 'cursSet', 'moveCursor', 'putChar', 'putString', 'putCharAtCursor', 'clearToEol', 'scrollUp'];
const CURSOR_ONLY = new Set(['setCursor', 'cursSet', 'moveCursor']);
const DISPLAY_FIELDS = ['topMessage', 'toplines', 'toplin', 'messageWinFlags', 'dismiss_more', 'inmore', 'inread', 'morc'];
const GAME_FIELDS = ['_pending_message', '_ttyToplines', '_ttyMessageStopped', '_ttyPreviousMessage', '_ttyBaseCursorRow', '_ttyHistorySnapshot', '_ttyMixedFirstCell', 'msg_xy'];
const MAX_SITES = 500;

function frameOf(line) {
    // "at async fn (file:///.../js/lock.js:1352:13)" or "at file:///...:1:2"
    const t = line.trim().replace(/^at /u, '').replace(/^async /u, '');
    const m = t.match(/^(.*?) \((.*):(\d+):\d+\)$/u) || t.match(/^()(.*):(\d+):\d+$/u);
    if (!m) return null;
    const file = path.basename(m[2]);
    const fn = (m[1] || '<anon>').replace(/^Object\./u, '');
    return { file, line: Number(m[3]), fn, text: `${file}:${m[3]} ${fn}` };
}

export async function startPlanningLeakWatch(root) {
    const imp = (f) => import(pathToFileURL(path.join(root, 'js', f)).href);
    const { Terminal } = await imp('terminal.js');
    const { GameDisplay } = await imp('game_display.js');
    const sites = new Map();
    let events = 0;
    let overflow = 0;
    const planning = () => (globalThis.__leakPlannerDepth ?? 0) > 0;
    const live = () => globalThis.__leakLiveGame?.();
    const position = () => ({ segment: globalThis.__leakSegment ?? 0, screen: globalThis.__leakScreens?.length ?? 0 });

    function record(kind, detail = {}) {
        events++;
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = 40;
        const raw = new Error('leak').stack.split('\n').slice(1);
        Error.stackTraceLimit = limit;
        const frames = raw.map(frameOf).filter((f) => f && !/^node:|^internal/u.test(f.file));
        const i = frames.findIndex((f) => !PLUMBING.has(f.file));
        const site = i >= 0 ? frames[i] : null;
        const entry = i > 0 ? frames[i - 1] : null;
        const key = `${site?.text ?? '?'} -> ${entry ? `${entry.file} ${entry.fn}` : '?'} [${kind}]`;
        let row = sites.get(key);
        if (!row) {
            if (sites.size >= MAX_SITES) { overflow++; return; }
            row = { key, kind, site: site?.text ?? null, entry: entry?.text ?? null, count: 0, changed: 0, first: position(), detail, stack: frames.slice(0, 18).map((f) => f.text) };
            sites.set(key, row);
        }
        row.count++;
        if (detail.changed) row.changed++;
    }

    // Terminal writes. Only the outermost patched call records.
    let inTerminal = 0;
    const cursorKey = (t) => `${t.cursorCol},${t.cursorRow},${t.cursorVisible}`;
    const gridKey = (t) => t.grid.map((row) => row.map((c) => `${c.ch}\u0001${c.color}\u0001${c.attr}`).join('\u0002')).join('\n');
    for (const name of TERMINAL_WRITES) {
        const orig = Terminal.prototype[name];
        if (typeof orig !== 'function') throw new Error(`Terminal.${name} missing`);
        Terminal.prototype[name] = function planningLeakTerminal(...args) {
            if (inTerminal || !planning()) return orig.apply(this, args);
            const cursorOnly = CURSOR_ONLY.has(name);
            const before = cursorOnly ? cursorKey(this) : gridKey(this);
            inTerminal++;
            let out;
            try { out = orig.apply(this, args); } finally { inTerminal--; }
            const after = cursorOnly ? cursorKey(this) : gridKey(this);
            record(cursorOnly ? 'cursor' : 'terminal', { changed: before !== after, op: name });
            return out;
        };
    }
    // Message state on the display object, which every planning clone shares
    // with the live game (planningState() copies state.nhDisplay by reference).
    const store = Symbol('planningLeakDisplayFields');
    for (const field of DISPLAY_FIELDS) {
        Object.defineProperty(GameDisplay.prototype, field, {
            configurable: true,
            enumerable: false,
            get() { return this[store]?.[field]; },
            set(v) {
                if (!this[store]) Object.defineProperty(this, store, { value: {}, enumerable: false });
                const old = this[store][field];
                this[store][field] = v;
                if (planning() && !Object.is(old, v)) record('displayMessageState', { changed: true, field });
            },
        });
    }
    // Message state on the live game object. Watch only fields that already
    // exist at a planning entry (adding a property could change `in` tests).
    const watched = new WeakMap();
    globalThis.__leakEnterPlanner = () => {
        const g = live();
        if (!g || typeof g !== 'object') return;
        if (!watched.has(g)) watched.set(g, new Set());
        const done = watched.get(g);
        for (const field of GAME_FIELDS) {
            if (done.has(field)) continue;
            const d = Object.getOwnPropertyDescriptor(g, field);
            if (!d || !('value' in d) || !d.writable) continue;
            done.add(field);
            let value = d.value;
            Object.defineProperty(g, field, {
                configurable: true,
                enumerable: d.enumerable,
                get() { return value; },
                set(v) {
                    const old = value;
                    value = v;
                    if (planning() && live() === g && !Object.is(old, v)) record('gameMessageState', { changed: true, field });
                },
            });
        }
    };
    globalThis.__leakRng = (ctx) => {
        if (!planning()) return;
        const g = live();
        if (ctx === g?.coreCtx) record('coreRng', { changed: true });
        else if (ctx === g?.displayCtx) record('displayRng', { changed: true });
    };
    globalThis.__leakGlyph = () => {
        if (planning()) record('glyphBuffer', { changed: false });
    };
    globalThis.__leakNewsym = () => {
        if (planning()) record('newsym', { changed: false });
    };
    // Report what was collected since the last report, and start afresh.
    return () => {
        const report = { leakEvents: events, leakOverflow: overflow, leaks: [...sites.values()].sort((a, b) => b.count - a.count) };
        sites.clear();
        events = 0;
        overflow = 0;
        globalThis.__leakSegment = -1;
        return report;
    };
}
