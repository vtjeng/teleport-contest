import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';

// pline.c vpline() spends a deferred vision recalculation before it flushes
// the map, and the notices that recalculation prints are plines nested in
// the outer one: they read gp.pline_flags, so a prompt's SUPPRESS_HISTORY
// sends them through show_topl() under the prompt. js/tty_message.js
// vplineVisionRecalc() is the one place that recalculates for a vpline() and
// passes the outer flags on. The window-port files must not call
// vision_recalc() themselves, and every vpline() entry must go through it.
const WINDOW_PORT_FILES = ['js/tty_message.js', 'js/getline.js', 'js/topl.js'];
const VPLINE_ENTRIES = [
    ['js/tty_message.js', 'ttyPlineCore'],
    ['js/getline.js', 'hooked_tty_getlin'],
    ['js/topl.js', 'tty_yn_function'],
];

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

for (const file of WINDOW_PORT_FILES) {
    test(`${file} recalculates vision only in vplineVisionRecalc()`, () => {
        for (const [name, fn] of functions(file)) {
            if (name === 'vplineVisionRecalc') continue;
            assert.ok(!calledNames(fn).includes('vision_recalc'),
                `${name}() calls vision_recalc(); use vplineVisionRecalc()`);
        }
        assert.ok(!/import\(['"]\.\/vision\.js['"]\)/u.test(source(file)),
            `${file} imports vision.js dynamically`);
    });
}

for (const [file, name] of VPLINE_ENTRIES) {
    test(`${name}() spends deferred vision through vplineVisionRecalc()`, () => {
        const fn = functions(file).get(name);
        assert.ok(fn, `${file} has no function ${name}`);
        assert.ok(calledNames(fn).includes('vplineVisionRecalc'));
    });
}
