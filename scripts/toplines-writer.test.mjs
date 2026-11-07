// js/topl.js keeps C's gt.toplines in state._ttyToplines, without the
// newlines update_topl() inserts, and marks a line C wrote without
// update_topl() in state._ttyUnsplitToplines (see writeToplines()). A writer
// that set the text and forgot the mark drew a recalled line split at a word
// where C wraps it at the terminal edge, so every write goes through
// setToplinesViaUpdateTopl() or setToplinesDirectly(), and each caller names
// the C path it ports. redotoplin() alone sets state._ttyUnsplitRedo. This
// test fails when other code in js/ assigns, deletes or initializes one of
// these fields.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as acorn from 'acorn';

import { GameDisplay } from '../js/game_display.js';
import { setToplinesDirectly, setToplinesViaUpdateTopl } from '../js/topl.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Each guarded field and the one function in js/topl.js allowed to write it.
const OWNERS = Object.freeze({
    _ttyToplines: 'writeToplines',
    _ttyUnsplitToplines: 'writeToplines',
    _ttyUnsplitRedo: 'redotoplin',
});

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function propertyName(node) {
    if (!node) return null;
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    return null;
}

// The guarded field a member expression names, if any.
function guardedMember(node) {
    if (node?.type !== 'MemberExpression') return null;
    const name = node.computed ? propertyName(node.property)
        : node.property.name;
    return Object.hasOwn(OWNERS, name) ? name : null;
}

// Guarded fields written through a pattern: `({ _ttyToplines: x } = y)`
// writes x, not the field, but `[state._ttyToplines] = y` writes the field.
function patternTargets(node, found) {
    if (!node) return;
    if (node.type === 'MemberExpression') {
        const name = guardedMember(node);
        if (name) found.push({ name, node });
    } else if (node.type === 'ObjectPattern') {
        for (const prop of node.properties)
            patternTargets(prop.type === 'RestElement' ? prop.argument : prop.value, found);
    } else if (node.type === 'ArrayPattern') {
        for (const element of node.elements) patternTargets(element, found);
    } else if (node.type === 'AssignmentPattern') {
        patternTargets(node.left, found);
    } else if (node.type === 'RestElement') {
        patternTargets(node.argument, found);
    }
}

// Writes of the guarded fields in `source`, as { line, name } entries for
// those outside the field's owner. `isTopl` says whether `source` is
// js/topl.js, the only file that holds the owners.
export function strayWrites(source, isTopl = false) {
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const findings = [];
    function visit(node, owner, inPattern = false) {
        if (!node || typeof node.type !== 'string') return;
        let current = owner;
        if (FUNCTION_TYPES.has(node.type)) current = node.id?.name ?? null;
        const writes = [];
        if (node.type === 'AssignmentExpression') patternTargets(node.left, writes);
        else if (node.type === 'UpdateExpression') patternTargets(node.argument, writes);
        else if (node.type === 'UnaryExpression' && node.operator === 'delete')
            patternTargets(node.argument, writes);
        else if (node.type === 'Property' && !inPattern
            && Object.hasOwn(OWNERS, propertyName(node.key) ?? '')
            && !node.computed) {
            // An object literal that creates the field, as Object.assign()
            // or a state copy would.
            writes.push({ name: propertyName(node.key), node });
        }
        for (const { name, node: at } of writes) {
            if (!(isTopl && current === OWNERS[name]))
                findings.push({ line: at.loc.start.line, name });
        }
        // An ObjectPattern's Property nodes are destructuring keys, not
        // writes; patternTargets() has already followed their values.
        const pattern = node.type === 'ObjectPattern';
        for (const key of Object.keys(node)) {
            if (key === 'loc') continue;
            const child = node[key];
            if (Array.isArray(child)) for (const item of child) visit(item, current, pattern);
            else if (child && typeof child.type === 'string') visit(child, current, false);
        }
    }
    visit(ast, null);
    return findings;
}

function scanRepository() {
    const findings = [];
    for (const file of readdirSync(JS_DIR).filter((name) => name.endsWith('.js')).sort()) {
        const source = readFileSync(join(JS_DIR, file), 'utf8');
        for (const { line, name } of strayWrites(source, file === 'topl.js'))
            findings.push(`js/${file}:${line} ${name}`);
    }
    return findings;
}

test('only the top-line writers assign the top-line fields', () => {
    assert.deepEqual(scanRepository(), []);
});

test('the owners the scan allows are declared in js/topl.js', () => {
    // A renamed owner would otherwise reject its own writes, and a deleted one
    // would leave no allowed writer.
    const source = readFileSync(join(JS_DIR, 'topl.js'), 'utf8');
    for (const owner of new Set(Object.values(OWNERS)))
        assert.match(source, new RegExp(`function ${owner}\\(`, 'u'), owner);
});

test('the scan finds each way to write a guarded field', () => {
    // Each numbered line writes a guarded field outside its owner.
    const source = [
        "state._ttyToplines = 'x';", // 1: plain assignment
        "state._ttyUnsplitToplines ??= 'x';", // 2: logical assignment
        "state['_ttyToplines'] += 'x';", // 3: computed string key
        'delete state._ttyUnsplitRedo;', // 4: delete
        "[state._ttyToplines] = ['x'];", // 5: destructuring target
        "Object.assign(state, { _ttyToplines: '' });", // 6: object literal
        'const { _ttyToplines: copy } = state;', // 7: a read, not a write
        "if (state._ttyToplines === 'x') use(copy);", // 8: a comparison
        "function writeToplines(state) { state._ttyToplines = ''; }", // 9
        "function redotoplin(state) { state._ttyUnsplitRedo = null; }", // 10
    ].join('\n');
    assert.deepEqual(strayWrites(source).map(({ line }) => line),
        [1, 2, 3, 4, 5, 6, 9, 10]);
    // In js/topl.js the owners' own writes, lines 9 and 10, are allowed;
    // writeToplines() may not write _ttyUnsplitRedo.
    assert.deepEqual(strayWrites(source, true).map(({ line }) => line),
        [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(strayWrites(
        "function writeToplines(state) { state._ttyUnsplitRedo = ''; }", true),
    [{ line: 1, name: '_ttyUnsplitRedo' }]);
});

test('each writer sets the unsplit mark from the path its caller names', () => {
    const state = { nhDisplay: new GameDisplay() };
    // A line of 85 columns, wider than the terminal, so the path matters.
    const line = `${'x'.repeat(40)} ${'y'.repeat(44)}`;
    setToplinesDirectly(line, state);
    assert.equal(state._ttyToplines, line);
    assert.equal(state._ttyUnsplitToplines, line);
    assert.equal(state.nhDisplay.toplines, line);
    // A later update_topl() write of the same text clears the mark, as C's
    // copy then holds update_topl()'s newline.
    setToplinesViaUpdateTopl(line, state);
    assert.equal(state._ttyToplines, line);
    assert.equal(state._ttyUnsplitToplines, null);
    assert.equal(state.nhDisplay.toplines, line);
});
