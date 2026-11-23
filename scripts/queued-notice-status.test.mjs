import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow, ttyPline } from '../js/tty_message.js';
import { newsym } from '../js/display.js';
import { emitGlyphUpdateNotices } from '../js/startup_a11y.js';
import { tty_status_state } from '../js/wintty.js';
import { FOUNTAIN } from '../js/const.js';

// C prints a display.c show_glyph() notice, a vision.c notice_all_mons()
// line and a pline.c impossible() report at once, and each print's vpline()
// (pline.c 266-274) spends a pending vision recalculation and then calls
// display.c flush_screen(), which runs bot() or timebot() first (2236-2239).
// The port queues those lines from synchronous code, so both steps happen
// when the line is queued (js/startup_a11y.js queueNoticeLine()), and the
// drain prints the line over the status rows that step left. mon.c xkilled()
// shows why: its second newsym() raises a notice and more_experienced()
// follows, so the notice waits at --More-- under the old experience.
// recordings/display.c/queued-notice-status-* are that play; these checks
// keep every queued line on the one path.

function source(file) {
    return readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function functions(file) {
    const ast = parse(source(file), { ecmaVersion: 'latest', sourceType: 'module' });
    const found = new Map();
    for (const node of ast.body) {
        const fn = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
        if (fn?.type === 'FunctionDeclaration') found.set(fn.id.name, fn);
    }
    return found;
}

function calledNames(node, names = []) {
    if (Array.isArray(node)) {
        for (const child of node) calledNames(child, names);
    } else if (node && typeof node.type === 'string') {
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier')
            names.push(node.callee.name);
        for (const value of Object.values(node))
            if (value && typeof value === 'object') calledNames(value, names);
    }
    return names;
}

test('queueNoticeLine() is the only code that adds to the notice queue', () => {
    const adds = /_glyphUpdateNotices\b[^;\n]*\.(?:push|unshift)\(/gu;
    const sites = [];
    for (const name of readdirSync(new URL('../js/', import.meta.url))) {
        if (!name.endsWith('.js')) continue;
        for (const match of source(`js/${name}`).matchAll(adds))
            sites.push(`js/${name}: ${match[0]}`);
    }
    // One push in the whole port: queueNoticeLine()'s own.
    assert.deepEqual(sites,
        ['js/startup_a11y.js: _glyphUpdateNotices ??= []).push(']);
    const file = source('js/startup_a11y.js');
    const fn = functions('js/startup_a11y.js').get('queueNoticeLine');
    assert.ok(fn, 'js/startup_a11y.js has no function queueNoticeLine');
    assert.match(file.slice(fn.start, fn.end), adds);
});

test('a queued line takes vpline()\'s steps in C\'s order', () => {
    const queue = calledNames(
        functions('js/startup_a11y.js').get('queueNoticeLine'));
    // vpline() first, then the frames the flush left, then the queue.
    const order = ['queuedVpline', 'takeNoticeGlyphFrame',
        'takeNoticeStatusFrame'].map((name) => queue.indexOf(name));
    assert.ok(order.every((at) => at >= 0), `calls: ${queue}`);
    assert.deepEqual(order, order.toSorted((a, b) => a - b));

    const vpline = calledNames(
        functions('js/tty_message.js').get('queuedVpline'));
    // pline.c 266-272: vision_recalc(0), then flush_screen().
    assert.ok(vpline.indexOf('vision_recalc') >= 0);
    assert.ok(vpline.indexOf('vision_recalc')
        < vpline.indexOf('queued_flush_screen_status'));

    const flush = calledNames(
        functions('js/display.js').get('queued_flush_screen_status'));
    // display.c 2220-2239: the guards, then bot() or timebot().
    assert.deepEqual(flush, ['suppress_map_output', 'bot_now', 'timebot_now']);
});

test('a drained line does not take the status step again', () => {
    assert.match(source('js/display.js'),
        /if \(game\._queuedNoticeStatusSpent\) \{/u);
    assert.match(source('js/startup_a11y.js'),
        /state\._queuedNoticeStatusSpent = Boolean\(notice\.statusFrame\);/u);
});

function statusText() {
    return tty_status_state(game).screen
        .map((row) => row.map((cell) => cell?.ch ?? ' ').join('').trimEnd())
        .join('\n');
}

test('the status is drawn when the line is queued, and kept for its print', async () => {
    // Any start works; the hero's own room supplies a floor square.
    await runSegment({ seed: 6120385, datetime: '20290611093000',
        nethackrc: 'OPTIONS=name:Probe,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips,mention_map\n', moves: '' });
    clearTtyMessageWindow(game);
    const { ux, uy } = game.u;
    const full = game.u.uhp;
    assert.match(statusText(), new RegExp(`HP:${full}\\(${full}\\)`, 'u'));

    // The hero loses 3 hit points (any amount that changes the text), and
    // then a fountain appears two squares east: furniture, so show_glyph()
    // announces it, and C's flush for that line draws the new hit points.
    game.u.uhp = full - 3;
    game.disp.botl = true;
    game.level.at(ux + 2, uy).typ = FOUNTAIN;
    newsym(ux + 2, uy);
    assert.deepEqual(game._glyphUpdateNotices.map((n) => n.message),
        ['(2east): fountain.']);
    assert.equal(game.disp.botl, false);
    assert.match(statusText(), new RegExp(`HP:${full - 3}\\(${full}\\)`, 'u'));

    // 2 more go before the queue drains. The line prints over the status of
    // its own flush; the change stays marked for the flush after it.
    game.u.uhp = full - 5;
    game.disp.botl = true;
    let during = null;
    await emitGlyphUpdateNotices(game, {
        pline: async (message, state) => {
            await ttyPline(message, state);
            during = game.nhDisplay.serialize().split('\n').slice(-2).join('\n');
        },
    });
    assert.match(during, new RegExp(`HP:${full - 3}\\(${full}\\)`, 'u'));
    assert.equal(game.disp.botl, true);

    // flush_screen(-1) holds every flush until its partner (display.c
    // 2223-2226), so a line queued between the two draws no status.
    game.delay_flushing = true;
    game.level.at(ux + 2, uy + 1).typ = FOUNTAIN;
    newsym(ux + 2, uy + 1);
    assert.equal(game._glyphUpdateNotices.length, 1);
    assert.equal(game.disp.botl, true);
    assert.match(statusText(), new RegExp(`HP:${full - 3}\\(${full}\\)`, 'u'));
    game.delay_flushing = false;
    await emitGlyphUpdateNotices(game, { pline: ttyPline });
});
