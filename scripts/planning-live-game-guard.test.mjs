// js/gstate.js withLiveGameGuarded(): while a planning pass runs, `game`
// throws on every use, so a planning call that forgets to pass its clone
// fails at the line that reached the live game instead of silently reading or
// writing it. The last test checks that every planning clone is run inside
// withPlanningCoreContext(), which installs the guard, so a new planner
// cannot bypass it either.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

import { u_at } from '../js/const.js';
import { bot, cls, docrt, flush_screen, newsym, show_glyph_cell, timebot } from '../js/display.js';
import {
    game,
    PlanningLiveGameError,
    planningLiveGameUses,
    resetGame,
    resetPlanningLiveGameUses,
    setPlanningUseRecording,
} from '../js/gstate.js';
import {
    cloneIsaacContext,
    initRng,
    planningContextInstalled,
    rnl,
    withPlanningCoreContext,
} from '../js/rng.js';
import { PROJECT_ROOT } from './scoring-workspace.mjs';

function planningFixture() {
    resetGame();
    // Any seed: the tests compare the planning draws with a copy of the same
    // context, not with fixed values.
    initRng(20261107);
    // Live and planned heroes stand on different squares and have different
    // Luck, so a test can tell which state a call read.
    game.u = { ux: 10, uy: 5, uluck: 0, moreluck: 0 };
    const planned = { ...game, u: { ux: 11, uy: 6, uluck: 10, moreluck: 3 } };
    return { live: game, planned, context: cloneIsaacContext(game.coreCtx) };
}

test('outside a planning pass, game names the live state', () => {
    const { live } = planningFixture();
    assert.equal(game, live);
    assert.equal(u_at(10, 5), true);
});

test('a state = game default reached while planning throws, naming the function', async () => {
    const { live, planned, context } = planningFixture();
    await assert.rejects(
        withPlanningCoreContext(context, planned, () => u_at(10, 5)),
        (error) => error instanceof PlanningLiveGameError
            && /read game\.u in u_at const\.js:\d+:\d+, called from /u.test(error.message),
    );
    // The guard is removed on the way out, even after a throw.
    assert.equal(game, live);
    assert.equal(planningContextInstalled(), false);
});

test('every kind of use of game throws while planning', async () => {
    const { planned, context } = planningFixture();
    const uses = [
        ['read', () => game.moves],
        ['write', () => { game.moves = 7; }],
        ['test', () => 'moves' in game],
        ['delete', () => { delete game.moves; }],
        ['list', () => Object.keys(game)],
        // planningState() itself spreads its source; a spread of `game`
        // while planning lists its keys.
        ['list', () => ({ ...game })],
        ['prototype of', () => Object.getPrototypeOf(game)],
    ];
    for (const [operation, use] of uses) {
        await assert.rejects(
            withPlanningCoreContext(context, planned, async () => use()),
            (error) => error instanceof PlanningLiveGameError
                && error.message.includes(`${operation} game.`),
            operation,
        );
    }
    assert.equal(game.moves, undefined, 'the refused write did not land');
});

test('with recording selected, as runSegment() does, a planned use is recorded and reaches the live game', async () => {
    const { live, planned, context } = planningFixture();
    live.moves = 5;
    resetPlanningLiveGameUses();
    const previous = setPlanningUseRecording(true);
    let result;
    try {
        result = await withPlanningCoreContext(context, planned, async () => {
            // u_at() reads `state.u` at two places in its line; calling it
            // twice gives two entries, each with a count of two.
            const reads = [0, 1].map(() => u_at(10, 5));
            game.moves = 6;
            return reads;
        });
    } finally {
        assert.equal(setPlanningUseRecording(previous), true);
    }
    // The reads saw the live hero at (10, 5) and the write landed on the live
    // game, as both did before the guard existed.
    assert.deepEqual(result, [true, true]);
    assert.equal(live.moves, 6);
    const uses = planningLiveGameUses();
    assert.deepEqual(uses.map(({ kind, count }) => [kind, count]),
        [['planningLiveGame', 2], ['planningLiveGame', 2], ['planningLiveGame', 1]]);
    for (const use of uses.slice(0, 2))
        assert.match(use.detail, /^planning pass reached the live game: read game\.u in u_at const\.js:\d+:\d+, called from /u);
    assert.match(uses[2].detail, /^planning pass reached the live game: write game\.moves in /u);
    resetPlanningLiveGameUses();
    assert.deepEqual(planningLiveGameUses(), []);
    // Recording is off again, so the next planned use throws.
    await assert.rejects(withPlanningCoreContext(context, planned, async () => game.moves),
        PlanningLiveGameError);
});

test('an identity test against game is false for the clone, and passing the clone works', async () => {
    const { planned, context } = planningFixture();
    const result = await withPlanningCoreContext(context, planned, async () => ({
        isLive: planned === game,
        atPlanned: u_at(11, 6, planned),
    }));
    assert.deepEqual(result, { isLive: false, atPlanned: true });
});

test('rnl() reached while planning reads the planned hero\'s Luck', async () => {
    const { live, planned, context } = planningFixture();
    const draw = (state, ctx) => withPlanningCoreContext(ctx, state, async () =>
        Array.from({ length: 20 }, () => rnl(20)));
    // Two passes over copies of one stream: the planned hero (Luck 13) and a
    // planning state carrying the live hero (Luck 0). rnl.c draws its extra
    // rn2(37 + |Luck|) only when Luck is nonzero, so the sequences differ
    // unless rnl() ignored the installed state; the same state twice agrees.
    const plannedDraws = await draw(planned, cloneIsaacContext(context));
    assert.deepEqual(await draw(planned, cloneIsaacContext(context)), plannedDraws);
    assert.notDeepEqual(await draw({ ...planned, u: live.u }, cloneIsaacContext(context)), plannedDraws);
});

test('the stateless display entry points drop a planned paint without reaching the live game', async () => {
    // Each takes no state and paints the live game's display. Inside a plan
    // they must return before reading `game`, which would throw here.
    const { planned, context } = planningFixture();
    // Any square and any glyph record: the call must return at once.
    const glyph = { ch: '^', dec: false };
    await withPlanningCoreContext(context, planned, async () => {
        newsym(10, 5);
        show_glyph_cell(10, 5, glyph);
        await flush_screen(1);
        await docrt();
        await cls();
        await bot();
        await timebot();
    });
});

// Every planningState() call must sit in a function that also calls
// withPlanningCoreContext(), and nothing else may install the guard. A planner
// that ran its clone outside the context would run unguarded.
test('every planning clone runs inside withPlanningCoreContext()', () => {
    const acorn = createRequire(join(PROJECT_ROOT, 'package.json'))('acorn');
    const findings = [];
    let planners = 0;
    for (const name of readdirSync(join(PROJECT_ROOT, 'js')).filter((f) => f.endsWith('.js'))) {
        const source = readFileSync(join(PROJECT_ROOT, 'js', name), 'utf8');
        const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
        const visit = (node, fn) => {
            if (!node || typeof node.type !== 'string') return;
            const isFunction = /Function/u.test(node.type);
            const scope = isFunction ? { node, calls: new Set(), clones: [] } : fn;
            if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
                const callee = node.callee.name;
                if (callee === 'planningState') scope?.clones.push(node.loc.start.line) ?? findings.push(`${name}:${node.loc.start.line} planningState() at module level`);
                if (callee === 'withLiveGameGuarded' && !(name === 'rng.js'))
                    findings.push(`${name}:${node.loc.start.line} withLiveGameGuarded() outside js/rng.js`);
                scope?.calls.add(callee);
            }
            for (const key of Object.keys(node)) {
                if (key === 'loc') continue;
                const child = node[key];
                if (Array.isArray(child)) child.forEach((c) => visit(c, scope));
                else if (child && typeof child.type === 'string') visit(child, scope);
            }
            if (isFunction && scope.clones.length) {
                planners++;
                if (!scope.calls.has('withPlanningCoreContext'))
                    findings.push(`${name}:${scope.clones.join(',')} planningState() in a function that never calls withPlanningCoreContext()`);
            }
        };
        visit(ast, null);
    }
    assert.deepEqual(findings, []);
    assert.ok(planners >= 2, 'both planners were found');
});

// js/storage.js, which the scorer replaces with its own copy and so cannot
// take the dry run's state, finds the virtual file system through
// game.mockStorage. The record file it reads is external storage, as C's file
// system is, so a dry run may read it: topten.c get_rnd_toptenentry(), reached
// from mon.c select_newcham_form() through tt_doppel() when a doppelganger
// picks a form during the monsters' turn, stopped the judge's playability run
// on seed0361-archeologist-tour before this was allowed.
test('a dry run may read the virtual file system through js/storage.js', async () => {
    const { planned, context } = planningFixture();
    // Any path and contents: the test checks only that the read reaches the
    // live game's storage without being reported.
    const files = new Map([['vfs:/record', 'stored record line']]);
    game.mockStorage = { getItem: (key) => files.get(key) ?? null };
    const { vfsReadFile } = await import('../js/storage.js');
    resetPlanningLiveGameUses();
    const read = await withPlanningCoreContext(context, planned, () => vfsReadFile('/record'));
    assert.equal(read, 'stored record line');
    assert.deepEqual(planningLiveGameUses(), []);
});

// The judge's entry points must not stop on live-game access during a dry run:
// runSegment() and the browser play path that frozen/playability_runner.mjs
// drives through NethackGame and moveloop_core() directly. js/gstate.js
// therefore records by default. This file runs with throwing selected
// (scripts/strict-live-game-uses.mjs), so the default is checked in a fresh
// process that loads js/gstate.js without that preload.
test('without a selection, live-game access during a dry run is recorded, not thrown', async () => {
    const { spawnSync } = await import('node:child_process');
    const gstate = new URL('../js/gstate.js', import.meta.url).href;
    const script = `
        const g = await import(${JSON.stringify(gstate)});
        // Any kind and detail: the check is only that the call returns.
        g.recordLiveGameUse('planningLiveGame', 'probe', (detail) => new Error(detail));
        process.stdout.write(JSON.stringify(g.planningLiveGameUses()));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), [{ kind: 'planningLiveGame', detail: 'probe', count: 1 }]);
});
