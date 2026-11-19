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
    // A later update_topl() write of the same text clears the mark, as C's
    // copy then holds update_topl()'s newline.
    setToplinesViaUpdateTopl(line, state);
    assert.equal(state._ttyToplines, line);
    assert.equal(state._ttyUnsplitToplines, null);
    // Neither writer leaves a copy of the line on the display.
    assert.equal(Object.hasOwn(state.nhDisplay, 'toplines'), false);
});

// C keeps gt.toplines in one place, and the port keeps it in
// state._ttyToplines. GameDisplay once held a second copy, `toplines`, that
// game code had stopped reading and only tests read; a test that read it
// checked the copy, not the line the game uses. No code in js/ or scripts/
// may name a `toplines` property again, as a member, an object or pattern
// key, or a class field. A local snapshot of the line uses another name,
// such as ttyToplines. Comments that name C's gt.toplines are not code and
// are not scanned.
const REPO_DIR = resolve(JS_DIR, '..');
const SCANNED_DIRS = ['js', 'scripts'];

function staticKey(node, computed) {
    if (!computed) return propertyName(node);
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
        return node.quasis[0].value.cooked;
    return null;
}

// The lines of `source` that name a `toplines` property.
export function toplinesProperties(source) {
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const findings = [];
    function visit(node) {
        if (!node || typeof node.type !== 'string') return;
        let key = null;
        if (node.type === 'MemberExpression')
            key = staticKey(node.property, node.computed);
        else if (node.type === 'Property' || node.type === 'PropertyDefinition'
            || node.type === 'MethodDefinition')
            key = staticKey(node.key, node.computed);
        if (key === 'toplines') findings.push(node.loc.start.line);
        for (const name of Object.keys(node)) {
            if (name === 'loc') continue;
            const child = node[name];
            if (Array.isArray(child)) for (const item of child) visit(item);
            else if (child && typeof child.type === 'string') visit(child);
        }
    }
    visit(ast);
    return findings;
}

// Every .js and .mjs file under `dir`, relative to the repository.
function sourceFiles(dir) {
    const files = [];
    for (const entry of readdirSync(join(REPO_DIR, dir), { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...sourceFiles(path));
        else if (/\.m?js$/u.test(entry.name)) files.push(path);
    }
    return files.sort();
}

test('no code names a toplines property', () => {
    const findings = [];
    let scanned = 0;
    for (const dir of SCANNED_DIRS) {
        for (const file of sourceFiles(dir)) {
            // A file that does not parse fails the test rather than going
            // unscanned.
            const source = readFileSync(join(REPO_DIR, file), 'utf8');
            for (const line of toplinesProperties(source))
                findings.push(`${file}:${line}`);
            ++scanned;
        }
    }
    assert.deepEqual(findings, []);
    // This file and js/topl.js are among those scanned, so an empty walk
    // cannot pass.
    assert.ok(scanned > 2, `scanned ${scanned} files`);
});

test('GameDisplay has no toplines property', () => {
    assert.equal('toplines' in new GameDisplay(), false);
});

test('the toplines scan finds each way to name the property', () => {
    // Each numbered line names a toplines property.
    const source = [
        'const line = state.nhDisplay.toplines;', // 1: read
        'display.toplines = line;', // 2: write
        "assert.equal(display?.['toplines'], line);", // 3: optional, computed
        'const a = display[`toplines`];', // 4: template key
        'const snapshot = { toplines: line };', // 5: object literal key
        'const { toplines: copy } = display;', // 6: destructuring key
        "class Display { toplines = ''; }", // 7: class field
        'class Copy { get toplines() { return 1; } }', // 8: accessor
        '// gt.toplines in a comment', // 9: not code
        "const text = 'gt.toplines';", // 10: a string, not a property
        'const toplines = state._ttyToplines;', // 11: a local variable
        'const b = display[toplines];', // 12: a variable key
    ].join('\n');
    assert.deepEqual(toplinesProperties(source), [1, 2, 3, 4, 5, 6, 7, 8]);
});
