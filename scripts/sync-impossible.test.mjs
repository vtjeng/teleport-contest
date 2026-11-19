// C's pline.c impossible() prints at once, wherever it is called. Port code
// that cannot wait for the print, such as objnam.c doname() reaching shk.c
// unpaid_cost(), reports through js/source_steps.js sync_impossible(), which
// queues the report on the notice queue (js/startup_a11y.js
// queueImpossibleNotice()); the next message, menu, text window, prompt or
// turn boundary prints it (scripts/queued-notice-drain.test.mjs checks the
// window-port entry points). Before that queue existed, a report was dropped
// unless its caller collected it. These checks fail if a report can be lost
// again:
// - only js/startup_a11y.js changes the queue, so nothing else can clear a
//   report before it prints;
// - sync_impossible() is called only from synchronous functions; an async
//   function awaits impossible() and prints at C's point;
// - in replays of recordings whose reports come from synchronous code, no
//   report is still queued when the game reads a key, the point by which C
//   has always printed it.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { parse } from 'acorn';

import { normalizeSession } from '../frozen/session_loader.mjs';
import { GameDisplay } from '../js/game_display.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict } from '../js/jsmain.js';

const JS_DIR = new URL('../js/', import.meta.url);
const jsFiles = () => readdirSync(JS_DIR).filter((name) => name.endsWith('.js')).sort();
const source = (name) => readFileSync(new URL(name, JS_DIR), 'utf8');

// Each node of `ast` with the chain of its ancestors, outermost first.
function* walk(node, ancestors = []) {
    if (Array.isArray(node)) {
        for (const child of node) yield* walk(child, ancestors);
        return;
    }
    if (!node || typeof node.type !== 'string') return;
    yield [node, ancestors];
    const inner = [...ancestors, node];
    for (const [key, value] of Object.entries(node)) {
        if (key !== 'loc' && value && typeof value === 'object')
            yield* walk(value, inner);
    }
}

const parseModule = (text) => parse(text, {
    ecmaVersion: 'latest', sourceType: 'module', locations: true,
});

test('only js/startup_a11y.js changes the notice queue that holds reports', () => {
    const found = [];
    for (const name of jsFiles()) {
        if (name === 'startup_a11y.js') continue;
        for (const [node, ancestors] of walk(parseModule(source(name)))) {
            if (node.type !== 'MemberExpression'
                || node.property.name !== '_glyphUpdateNotices') continue;
            const parent = ancestors.at(-1);
            const grand = ancestors.at(-2);
            // `x._glyphUpdateNotices?.length`, the read the drains make.
            const lengthRead = parent?.type === 'MemberExpression'
                && parent.object === node && parent.property.name === 'length'
                && !(grand?.type === 'AssignmentExpression' && grand.left === parent);
            if (!lengthRead) found.push(`js/${name}:${node.loc.start.line}`);
        }
    }
    assert.deepEqual(found, []);
});

test('sync_impossible() is called only from synchronous functions', () => {
    const found = [];
    for (const name of jsFiles()) {
        for (const [node, ancestors] of walk(parseModule(source(name)))) {
            if (node.type !== 'CallExpression'
                || node.callee.name !== 'sync_impossible') continue;
            const fn = ancestors.findLast((a) => /Function/u.test(a.type));
            if (fn?.async || fn?.generator)
                found.push(`js/${name}:${node.loc.start.line}`);
        }
    }
    assert.deepEqual(found, []);
});

// Recordings whose impossible() reports come from synchronous port code:
// shk.c unpaid_cost() and same_price() through doname() and mergable(), and
// timeout.c start_timer() through the melting-ice wish.
const RECORDINGS = [
    'mkobj.c/unpaid-ship-object-keeper-away-drop',
    'shk.c/same-price-carried-out-throw-pickup',
    'shk.c/unpaid-cost-carried-out-drop',
    'shk.c/unpaid-cost-carried-out-inventory',
    'shk.c/unpaid-cost-carried-out-look-here',
    'timeout.c/melting-ice-wish-duplicate-timer',
];

for (const name of RECORDINGS) {
    test(`${name}: every report prints before the next key read`, async () => {
        const path = new URL(`../recordings/${name}.session.json`, import.meta.url);
        const session = normalizeSession(JSON.parse(readFileSync(path, 'utf8')));
        const readKey = GameDisplay.prototype.readKey;
        const pendingAtKey = [];
        let reports = 0;
        GameDisplay.prototype.readKey = function (...args) {
            const pending = (game._glyphUpdateNotices ?? [])
                .filter((notice) => notice.impossible);
            if (pending.length && !game._emittingGlyphUpdateNotices)
                pendingAtKey.push(pending.map((notice) => notice.message));
            if (/^Program in disorder!/u.test(this.grid?.[0]
                ?.map((cell) => cell.ch).join('') ?? ''))
                reports++;
            return readKey.apply(this, args);
        };
        try {
            for (const segment of session.segments) {
                const { seed, datetime, nethackrc, moves } = segment;
                await runSegmentStrict({ seed, datetime, nethackrc, moves });
            }
        } finally {
            GameDisplay.prototype.readKey = readKey;
        }
        assert.deepEqual(pendingAtKey, []);
        // The recording prints at least one report, so the check above saw
        // reports pass through the queue.
        assert.ok(reports > 0, 'no report reached the screen');
    });
}
