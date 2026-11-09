import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'acorn';

// C's vision_recalc() prints display.c show_glyph()'s mention_map lines and
// notice_all_mons()'s monster notices before it returns. The port's
// vision_recalc() is synchronous and queues them, so an async caller must
// recalculate through js/vision.js vision_recalc_async(), which prints them
// at once; otherwise a status change made before the next message reaches the
// screen with them. This check fails when an async function calls
// vision_recalc() directly.
//
// The allowed functions print the queue themselves: vision_recalc_async() is
// the shared definition; tty_message.js vplineVisionRecalc() prints the
// notices under its outer message's pline flags; display.js docrt() brackets
// its two recalculations with program_state.in_docrt and prints after both.
const ALLOWED = new Set([
    'js/vision.js vision_recalc_async',
    'js/tty_message.js vplineVisionRecalc',
    'js/display.js docrt',
]);

function directAsyncCalls(file) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const found = [];
    const walk = (node, enclosing, name) => {
        if (Array.isArray(node)) {
            for (const child of node) walk(child, enclosing, name);
            return;
        }
        if (!node || typeof node.type !== 'string') return;
        let fn = enclosing;
        let fnName = name;
        if (/Function/u.test(node.type)) {
            fn = node;
            fnName = node.id?.name ?? name;
        }
        if (node.type === 'CallExpression'
            && node.callee.type === 'Identifier'
            && node.callee.name === 'vision_recalc'
            && fn?.async
            && !ALLOWED.has(`${file} ${fnName}`)) {
            found.push(`${file}:${node.loc.start.line} ${fnName}()`);
        }
        for (const [key, value] of Object.entries(node)) {
            if (key !== 'loc' && value && typeof value === 'object')
                walk(value, fn, fnName);
        }
    };
    walk(ast, null, '(module)');
    return found;
}

test('no async function calls vision_recalc() directly', () => {
    const files = readdirSync(new URL('../js/', import.meta.url))
        .filter((name) => name.endsWith('.js'))
        .map((name) => `js/${name}`);
    assert.deepEqual(files.flatMap(directAsyncCalls), []);
});
