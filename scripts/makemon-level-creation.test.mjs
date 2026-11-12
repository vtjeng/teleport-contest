// C has one makemon(), which tests in_mklev to decide whether to run its
// runtime tail (groups, inventory, newsym(), the appearance message and the
// occupation check) after set_malign(). The port splits it: makemon() in
// js/makemon_create.js is the level-creation form, whose body stops after
// set_malign() outside level creation and then throws for want of a runtime
// continuation, and makemon_runtime() is the form for everything else.
// makemon_by_context() picks between them the way C's test does.
//
// A function that C can run outside level creation must therefore not call
// makemon() directly. Level programs reach many level builders that way:
// #wizloadlua (wizcmds.c wiz_load_lua() -> nhlua.c load_lua()) runs a
// level's des.* calls on the current level without setting in_mklev. This
// check lists every reference to makemon() outside js/makemon_create.js,
// with the C call chain that keeps it inside level creation, so a new
// reference fails until someone checks C and either lists it here or uses
// makemon_by_context(). A listed reference that is gone fails too, so the
// list only shrinks.

import assert from 'node:assert/strict';
import test from 'node:test';

import { parse } from 'acorn';

import { readJsSources } from './discarded-promises.mjs';

// The level-creation form's defining module; its own references are the
// split itself (makemon_runtime() and makemon_revival() drive makemon()).
const DEFINING_FILE = 'js/makemon_create.js';

// "<file> | <enclosing function>": [count, C call chain].
const ALLOWED = {
    'js/bones.js | savebones': [2,
        'bones.c savebones() sets in_mklev to TRUE around both makemon() '
        + 'calls (the grave-arise monster and the ghost), and the port does '
        + 'the same.'],
    'js/extralev.js | makerogueghost': [1,
        'mklev.c makelevel() is extralev.c makerogueghost()\'s only caller, '
        + 'on the Rogue level.'],
    // fillRoom is fill_ordinary_room()'s body for one room.
    'js/mklev.js | fillRoom': [1,
        'mklev.c makelevel() is fill_ordinary_room()\'s only caller.'],
    'js/mkmaze.js | stolen_booty': [2,
        'mkmaze.c fixup_special() -> stolen_booty(); fixup_special() runs from '
        + 'sp_lev.c load_special() during level creation, and #wizloaddes '
        + 'calls lspo_reset_level(), which sets in_mklev, first. No level '
        + 'program calls des.finalize_level().'],
    'js/mkmaze.js | populate_maze': [2,
        'mkmaze.c makemaz() -> populate_maze(), inside mklev.c makelevel().'],
    'js/mkroom.js | mkswamp': [2,
        'mkroom.c mkroom(SWAMP) -> mkswamp(), inside mklev.c makelevel().'],
};

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

// The nearest named function around a node, or <module>.
function enclosingName(ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const node = ancestors[i];
        if (!FUNCTION_TYPES.has(node.type)) continue;
        if (node.id) return node.id.name;
        const parent = ancestors[i - 1];
        if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
            return parent.id.name;
        if ((parent?.type === 'MethodDefinition' || parent?.type === 'Property')
            && parent.key.type === 'Identifier')
            return parent.key.name;
    }
    return '<module>';
}

// Every use of makemon() as a value: a call, a reference passed as a hook,
// or a binding destructured from a dynamic import, under its own name or an
// alias. Property names (`env.makemon`, `{ makemon: f }` in an object
// literal) and the import line itself are not uses.
export function scanMakemonReferences(sources) {
    const counts = {};
    for (const [file, text] of Object.entries(sources)) {
        if (file === DEFINING_FILE) continue;
        const ast = parse(text, {
            ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true,
        });
        const names = new Set(['makemon']);
        for (const node of ast.body) {
            if (node.type !== 'ImportDeclaration'
                || node.source.value !== './makemon_create.js') continue;
            for (const spec of node.specifiers)
                if (spec.imported?.name === 'makemon') names.add(spec.local.name);
        }
        const count = (ancestors) => {
            const key = `${file} | ${enclosingName(ancestors)}`;
            counts[key] = (counts[key] ?? 0) + 1;
        };
        const visit = (node, ancestors) => {
            if (node.type === 'ImportDeclaration') return;
            if (node.type === 'Identifier') {
                if (names.has(node.name)) count(ancestors);
                return;
            }
            // `const { makemon: alias } = await import(...)` binds the export.
            if (node.type === 'Property' && !node.shorthand && !node.computed
                && node.key.type === 'Identifier' && node.key.name === 'makemon'
                && ancestors.at(-1)?.type === 'ObjectPattern') {
                count(ancestors);
            }
            ancestors.push(node);
            for (const key of Object.keys(node)) {
                if (key === 'loc' || key === 'start' || key === 'end') continue;
                const name = !node.computed
                    && ((node.type === 'MemberExpression' && key === 'property')
                        || ((node.type === 'Property' || node.type === 'MethodDefinition')
                            && key === 'key'));
                if (name) continue;
                const value = node[key];
                if (Array.isArray(value)) {
                    for (const child of value)
                        if (child && typeof child.type === 'string') visit(child, ancestors);
                } else if (value && typeof value.type === 'string') {
                    visit(value, ancestors);
                }
            }
            ancestors.pop();
        };
        visit(ast, []);
    }
    return counts;
}

test('every makemon() reference outside makemon_create.js is listed with its C chain', () => {
    const current = scanMakemonReferences(readJsSources());
    const problems = [];
    for (const [key, count] of Object.entries(current)) {
        const entry = ALLOWED[key];
        if (!entry) {
            problems.push(`new: ${key} (${count}); use makemon_by_context() `
                + 'or list it with the C chain that keeps it in level creation');
        } else if (entry[0] !== count) {
            problems.push(`changed: ${key} (${entry[0]} -> ${count})`);
        }
    }
    for (const key of Object.keys(ALLOWED))
        if (!Object.hasOwn(current, key)) problems.push(`stale: ${key}; remove it`);
    for (const [key, [, reason]] of Object.entries(ALLOWED))
        if (typeof reason !== 'string' || !reason.trim()) problems.push(`no reason: ${key}`);
    assert.deepEqual(problems, []);
});

test('the scan counts calls, hooks, aliases and dynamic-import bindings, not property names', () => {
    // Stand-in files. Each line names the form it exercises; the expected
    // counts below hold exactly the uses.
    const sources = {
        'js/a.js': [
            "import { makemon } from './makemon_create.js';", // import: not a use
            'export function call() { return makemon(null, 0, 0); }', // call: 1
            'export function hook() { return { makeMonster: makemon }; }', // value: 1
            'export function short() { return { makemon }; }', // shorthand value: 1
            'export function named(env) { return env.makemon; }', // property: 0
            'export function key() { return { makemon: 1 }; }', // key: 0
            'export async function renamed() {',
            "    const { makemon: m } = await import('./makemon_create.js');", // binding: 1
            '    return m;', // a local alias's use is not tracked: 0
            '}',
            'export async function bound() {',
            "    const { makemon } = await import('./makemon_create.js');", // binding: 1
            '    return makemon(null, 0, 0);', // call: 1
            '}',
        ].join('\n'),
        'js/b.js': [
            "import { makemon as mk } from './makemon_create.js';", // import: not a use
            'export function aliased() { return mk(null, 0, 0); }', // alias call: 1
        ].join('\n'),
        [DEFINING_FILE]: 'export function makemon() { return makemon; }', // skipped
    };
    assert.deepEqual(scanMakemonReferences(sources), {
        'js/a.js | call': 1,
        'js/a.js | hook': 1,
        'js/a.js | short': 1,
        'js/a.js | renamed': 1,
        'js/a.js | bound': 2,
        'js/b.js | aliased': 1,
    });
});
