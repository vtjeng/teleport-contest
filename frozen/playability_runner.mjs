#!/usr/bin/env node
// playability_runner.mjs — Browser-play playability check.
//
// Drives the contestant's interactive entry point (moveloop_core) one
// keystroke at a time — the exact path the browser play page uses —
// and decides whether interactive play is fast enough to be usable.
//
// Why this complements ps_test_runner.mjs:
//   ps_test_runner.mjs   — correctness AND scoring speed.  Calls
//                         runSegment once per session with the whole
//                         move string; emits a `speed` linear fit.
//   playability_runner   — per-keystroke speed of *interactive* play.
//                         Catches architectures that pass correctness
//                         (and even pass `speed`) but rebuild the
//                         world on every keypress, making the
//                         browser unplayable past a few dozen keys.
//
// Methodology:
//   1. For each session, dynamic-import the contestant's NethackGame,
//      moveloop_core, GameDisplay, and `game`.
//   2. new NethackGame(...), _pendingDisplay = display, await start().
//   3. For each character in segment.moves:
//        display.pushKey(code)
//        timed: await moveloop_core()
//   4. Aggregate cumulative_ms (start + per-key sum) across all sessions
//      and divide by total moves consumed.
//   5. Playable iff cumulative_ms / total_moves < 1.0 ms.
//
// The linear-fit / per-session timing breakdown deliberately lives in
// ps_test_runner.mjs (against the scoring path), not here — the per-
// keystroke timings cluster too tightly to fit cleanly, and the value
// the leaderboard wants from this runner is a single boolean.
//
// Output:
//   stderr — per-session ms/move line + summary
//   stdout — __PLAYABILITY_JSON__\n{...} machine-readable bundle.
//
// Usage:
//   node playability_runner.mjs                    # all sessions/
//   node playability_runner.mjs <file-or-dir>...   # explicit targets

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

// A move is fewer than 1 ms aggregate — the threshold is generous; it's
// roughly "the median modern laptop hits 1000 keystrokes per second."
// Anything slower than that and the browser starts feeling laggy when
// holding a movement key.
const PLAYABLE_THRESHOLD_MS_PER_MOVE = 1.0;

function findSessions(targets) {
    if (!targets.length) targets = [join(PROJECT_ROOT, 'sessions')];
    const files = [];
    for (const t of targets) {
        if (!existsSync(t)) {
            console.error(`Skipping missing path: ${t}`);
            continue;
        }
        const st = statSync(t);
        if (st.isFile() && t.endsWith('.session.json')) {
            files.push(t);
        } else if (st.isDirectory()) {
            for (const e of readdirSync(t)) {
                if (e.endsWith('.session.json')) files.push(join(t, e));
            }
        }
    }
    files.sort();
    return files;
}

// Sentinel error thrown by display.onEmptyQueue so the contestant's
// moveloop_core unwinds cleanly when we run out of recorded keys.
class QueueEmpty extends Error { }

async function timeOneSession(sessionPath, modules) {
    const { NethackGame, moveloop_core, game, GameDisplay } = modules;
    const sess = JSON.parse(readFileSync(sessionPath, 'utf8'));
    const segment = sess.segments?.[0];
    if (!segment) return null;
    const { seed, datetime, nethackrc, moves } = segment;

    const display = new GameDisplay(null);
    display.onEmptyQueue = () => { throw new QueueEmpty(); };

    // DON'T pre-wipe the shared `game` object.  Several ports' resetGame()
    // snapshot the initial `game` shape on first call and restore from that
    // snapshot on every subsequent reset — wiping before start() corrupts
    // the snapshot and leaves later code reading undefined fields
    // (e.g. iflags.menu_headings.attr).  start() handles initialization
    // itself; we just provide the display and let the port take it from
    // there.

    const nhGame = new NethackGame({ seed, datetime, nethackrc });
    nhGame._pendingDisplay = display;
    // Match the contest index.html bootstrap exactly: every fork's
    // browser entry sets `game.nhDisplay = display` BEFORE calling
    // `await nhGame.start()`.  Ports that read input via
    // `game?.nhDisplay` inside moveloop_core (rather than from
    // `this._pendingDisplay`) need this — without it, each per-key
    // call is a silent no-op and the runner reports a fast (but
    // fake) ms/move.
    game.nhDisplay = display;

    const t_start = performance.now();
    await nhGame.start();

    let consumed = 0;
    for (let i = 0; i < moves.length; i++) {
        display.pushKey(moves.charCodeAt(i));
        try {
            await moveloop_core();
        } catch (e) {
            if (e instanceof QueueEmpty) {
                // moveloop_core consumed the key we just pushed (for a
                // multi-character prompt like a name or yn dialog) and
                // then tried to read more.  Count this key and move on
                // to the next — the browser-play path does exactly the
                // same: each keypress drives moveloop_core forward by
                // whatever amount it can, and the next keypress
                // continues the operation.
                consumed++;
                continue;
            }
            throw e;
        }
        consumed++;
        if (game.program_state?.gameover) break;
    }

    const cumulative_ms = performance.now() - t_start;
    return {
        session: sessionPath,
        moves_consumed: consumed,
        cumulative_ms,
    };
}

async function loadContestantModules() {
    const url = (p) => new URL(p, import.meta.url).href;
    return {
        ...(await import(url('../js/jsmain.js'))),
        ...(await import(url('../js/allmain.js'))),
        ...(await import(url('../js/gstate.js'))),
        ...(await import(url('../js/game_display.js'))),
    };
}

async function main() {
    const sessions = findSessions(process.argv.slice(2));
    if (!sessions.length) {
        console.error('No sessions found. Usage: playability_runner.mjs [path...]');
        process.exit(2);
    }

    const modules = await loadContestantModules();

    const perSession = [];
    let total_moves = 0;
    let total_cumulative = 0;
    let failures = 0;

    for (const sp of sessions) {
        let result;
        try {
            result = await timeOneSession(sp, modules);
        } catch (e) {
            console.error(`  FAIL: ${sp.split('/').pop()} — ${e.message}`);
            failures++;
            continue;
        }
        if (!result) continue;
        perSession.push(result);
        total_moves += result.moves_consumed;
        total_cumulative += result.cumulative_ms;
        const ratio = result.cumulative_ms / Math.max(1, result.moves_consumed);
        process.stderr.write(
            `  ${result.session.split('/').pop()}: `
            + `${result.moves_consumed} moves in ${result.cumulative_ms.toFixed(0)} ms `
            + `(${ratio.toFixed(2)} ms/move)\n`
        );
    }

    const overall_ms_per_move = total_cumulative / Math.max(1, total_moves);
    const playable = overall_ms_per_move < PLAYABLE_THRESHOLD_MS_PER_MOVE;

    process.stderr.write(
        `\nPlayability: ${playable ? 'PLAYABLE' : 'NOT PLAYABLE'} `
        + `(${overall_ms_per_move.toFixed(2)} ms/move overall, threshold < ${PLAYABLE_THRESHOLD_MS_PER_MOVE} ms/move)\n`
    );

    process.stdout.write('__PLAYABILITY_JSON__\n');
    process.stdout.write(JSON.stringify({
        sessions: perSession.length,
        failures,
        total_moves,
        total_cumulative_ms: Math.round(total_cumulative),
        overall_ms_per_move: +overall_ms_per_move.toFixed(3),
        playable,
        threshold_ms_per_move: PLAYABLE_THRESHOLD_MS_PER_MOVE,
        per_session: perSession.map(r => ({
            name: r.session.split('/').pop(),
            moves: r.moves_consumed,
            cumulative_ms: Math.round(r.cumulative_ms),
        })),
    }, null, 2) + '\n');
}

main().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(2);
});
