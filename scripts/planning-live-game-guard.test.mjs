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
import { newsym, show_glyph_cell } from '../js/display.js';
import { game, PlanningLiveGameError, resetGame } from '../js/gstate.js';
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

test('newsym() and show_glyph_cell() drop a planned paint without reaching the live game', async () => {
    // Both take no state and paint the live game's square. Inside a plan
    // they must return before reading `game`, which would throw here.
    const { planned, context } = planningFixture();
    // Any square and any glyph record: the call must return at once.
    const glyph = { ch: '^', dec: false };
    await withPlanningCoreContext(context, planned, async () => {
        newsym(10, 5);
        show_glyph_cell(10, 5, glyph);
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
