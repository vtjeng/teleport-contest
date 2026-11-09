import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';

// js/tty_message.js emitQueuedNotices() prints the glyph and monster notices
// the port queues where C prints them at once. Every window-port entry point
// that puts something other than a message on the screen must call it first,
// or a menu, text window or prompt appears ahead of lines C showed before it.
// ttyPlineCore() is the message entry point; these are the others.
const ENTRY_POINTS = [
    ['js/tty_menu.js', 'displayTtyMenuTextWindow'],
    ['js/tty_menu.js', 'displayTtyTextWindow'],
    ['js/tty_menu.js', 'selectTtyMenu'],
    ['js/getline.js', 'tty_getlin'],
    ['js/topl.js', 'tty_yn_function'],
    ['js/tty_message.js', 'ttyPlineCore'],
];

function firstStatement(file, name) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    for (const node of ast.body) {
        const fn = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
        if (fn?.type === 'FunctionDeclaration' && fn.id.name === name) {
            const body = fn.body.body;
            // ttyPlineCore() may first return for an empty message, as
            // vpline() does before anything reaches the screen.
            const first = body[0]?.type === 'IfStatement'
                && body[0].consequent.type === 'ReturnStatement' ? body[1] : body[0];
            return source.slice(first.start, first.end);
        }
    }
    throw new Error(`${file} has no function ${name}`);
}

for (const [file, name] of ENTRY_POINTS) {
    test(`${name}() prints queued notices before drawing`, () => {
        assert.equal(firstStatement(file, name), 'await emitQueuedNotices(state);');
    });
}
