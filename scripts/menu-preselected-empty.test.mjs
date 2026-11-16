// A PICK_ONE menu with a preselected row has three outcomes in C, which
// select_menu() reports as a count: -1 for ESC, 0 when the player toggled the
// preselected row off (with its selector, or with '-' then Return), and 1 or
// more for a commit with a row still selected. js/tty_menu.js returns the
// spec's cancelValue for ESC, its preselected value for a commit that leaves
// the preselected row selected, and its emptyValue for C's n == 0.
//
// Each C caller decides n == 0 for itself: role.c's menus and query_color()
// treat it as the preselected choice, restore.c's restore_menu() as quit.
// Before this check, a spec without emptyValue reported n == 0 as cancelValue,
// so query_color(), query_attr(), set_vanq_order(), tipcontainer_gettarget()
// and the role and confirmation menus read a cleared preselection as ESC.
// Every object literal in js/ that names `preselected` must therefore also
// name `emptyValue`, in itself or in the spec object that spreads it, so each
// caller states its C n == 0 arm.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parse } from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function propertyName(property) {
    if (property.type !== 'Property' || property.computed) return null;
    return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function hasProperty(object, name) {
    return object.properties.some((property) => propertyName(property) === name);
}

// Visit every node with its parent chain.
function walk(node, parents, visit) {
    visit(node, parents);
    for (const value of Object.values(node)) {
        const children = Array.isArray(value) ? value : [value];
        for (const child of children) {
            if (child && typeof child.type === 'string')
                walk(child, [...parents, node], visit);
        }
    }
}

// The spec objects a `preselected` literal contributes to: itself, then each
// object that spreads it through a conditional or logical expression, as
// pickup.js dotip() does with `...(state.invent ? { preselected } : {})`.
function enclosingSpecs(object, parents) {
    const specs = [object];
    for (let i = parents.length - 1; i >= 0; --i) {
        const parent = parents[i];
        if (parent.type === 'ObjectExpression') specs.push(parent);
        else if (!['SpreadElement', 'ConditionalExpression',
            'LogicalExpression'].includes(parent.type)) break;
    }
    return specs;
}

function scan() {
    const missing = [];
    const assignments = [];
    let specs = 0;
    for (const name of readdirSync(join(ROOT, 'js')).sort()) {
        // tty_menu.js reads the fields; it builds no caller spec.
        if (!name.endsWith('.js') || name === 'tty_menu.js') continue;
        const source = readFileSync(join(ROOT, 'js', name), 'utf8');
        const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
        walk(ast, [], (node, parents) => {
            if (node.type === 'ObjectExpression' && hasProperty(node, 'preselected')) {
                ++specs;
                const chain = enclosingSpecs(node, parents);
                if (!chain.some((spec) => hasProperty(spec, 'emptyValue')
                    || hasProperty(spec, 'returnSelections')))
                    missing.push(`${name}:${node.loc.start.line}`);
            }
            if (node.type === 'AssignmentExpression'
                && node.left.type === 'MemberExpression'
                && !node.left.computed && node.left.property.name === 'preselected')
                assignments.push(`${name}:${node.loc.start.line}`);
        });
    }
    return { missing, assignments, specs };
}

test('every preselected PICK_ONE spec states what C does with n == 0', () => {
    const { missing, assignments, specs } = scan();
    assert.deepEqual(missing, [], 'add emptyValue: the C caller\'s n == 0 result');
    // An assignment would add `preselected` where this scan cannot see the
    // spec that receives it.
    assert.deepEqual(assignments, []);
    // The scan must find the ten specs that name `preselected` today
    // (coloratt.js 1, cmd.js 1, insight.js 1, options.js 1, pickup.js 3,
    // player_selection_tty.js 2, restore.js 1); fewer means it went blind.
    assert.equal(specs, 10);
});

// A spec that marks a row `selected: true` but names neither `preselected`
// nor `returnSelections` loses C's n == 1: js/tty_menu.js answers a Return
// that keeps the marked row with the spec's emptyValue or cancelValue, the
// same value as ESC. options.c handler_perminv_mode() acts on n >= 0, so it
// stayed silent where C reports the mode. Each PICK_ONE spec whose items can
// carry a marked row must therefore name `preselected` (whose emptyValue the
// test above checks) or `returnSelections`, which hands back C's selection
// list in menu order.
//
// The scan follows a spec passed as an object literal to a menu call, and
// its `items` back through the enclosing function: a literal row with
// `selected`, a call to a same-file function that builds one (cmd.js
// yn_func_menu_opt(), options.js menuObjsymItems()), and identifiers pushed
// onto, assigned to or destructured into the array. spell.js passes its
// items positionally; its two menus ask for returnSelections (spell.js
// spellsortmenu(), dospellmenu()). player_selection_tty.js marks rows in
// `lines` text, which the preselected check above covers.
const MENU_CALL = /^(select_menu|selectTtyMenu|optionMenuSelect|queryMenu|selectMenu|menu)$/;

function calleeName(callee) {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed)
        return callee.property.name;
    return null;
}

function contains(node, predicate) {
    let found = false;
    walk(node, [], (child) => { if (predicate(child)) found = true; });
    return found;
}

function scanMarkedSpecs() {
    const missing = [];
    let specs = 0;
    for (const name of readdirSync(join(ROOT, 'js')).sort()) {
        if (!name.endsWith('.js') || name === 'tty_menu.js') continue;
        const source = readFileSync(join(ROOT, 'js', name), 'utf8');
        const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
        const isRow = (node) => node.type === 'ObjectExpression'
            && hasProperty(node, 'selected');
        const builders = new Set();
        for (const statement of ast.body) {
            const declaration = statement.type === 'ExportNamedDeclaration'
                ? statement.declaration : statement;
            if (declaration?.type === 'FunctionDeclaration'
                && contains(declaration, isRow))
                builders.add(declaration.id.name);
        }
        const marks = (node) => contains(node, (child) => isRow(child)
            || (child.type === 'CallExpression'
                && child.callee.type === 'Identifier'
                && builders.has(child.callee.name)));
        const binds = (pattern, id) => (pattern.type === 'Identifier'
            ? pattern.name === id
            : pattern.type === 'ObjectPattern' && pattern.properties.some(
                (property) => binds(property.type === 'RestElement'
                    ? property.argument : property.value, id)));
        const itemsMarked = (expr, scope, seen = new Set()) => {
            if (marks(expr)) return true;
            if (expr.type !== 'Identifier' || seen.has(expr.name)) return false;
            seen.add(expr.name);
            return contains(scope, (node) => {
                if (node.type === 'VariableDeclarator' && node.init
                    && binds(node.id, expr.name)) return marks(node.init);
                if (node.type === 'AssignmentExpression'
                    && node.left.type === 'Identifier'
                    && node.left.name === expr.name) return marks(node.right);
                if (node.type !== 'CallExpression') return false;
                const { callee } = node;
                if (callee.type === 'MemberExpression'
                    && callee.object.type === 'Identifier'
                    && callee.object.name === expr.name)
                    return node.arguments.some(
                        (arg) => itemsMarked(arg, scope, seen));
                return callee.type === 'Identifier' && builders.has(callee.name)
                    && node.arguments.some((arg) => arg.type === 'Identifier'
                        && arg.name === expr.name);
            });
        };
        walk(ast, [], (node, parents) => {
            if (node.type !== 'CallExpression'
                || !MENU_CALL.test(calleeName(node.callee) ?? '')) return;
            const scope = [...parents].reverse()
                .find((parent) => /Function/.test(parent.type)) ?? ast;
            for (const spec of node.arguments) {
                if (spec.type !== 'ObjectExpression') continue;
                const how = spec.properties.find(
                    (property) => propertyName(property) === 'how');
                if (how?.value.type === 'Identifier'
                    && ['PICK_ANY', 'PICK_NONE'].includes(how.value.name))
                    continue;
                const items = spec.properties.find(
                    (property) => propertyName(property) === 'items');
                if (!items || !itemsMarked(items.value, scope)) continue;
                ++specs;
                if (!contains(spec, (child) => child.type === 'ObjectExpression'
                    && (hasProperty(child, 'preselected')
                        || hasProperty(child, 'returnSelections'))))
                    missing.push(`${name}:${spec.loc.start.line}`);
            }
        });
    }
    return { missing, specs };
}

test('every PICK_ONE spec with a marked row keeps C\'s n == 1 apart from ESC', () => {
    const { missing, specs } = scanMarkedSpecs();
    assert.deepEqual(missing, [],
        'add preselected (with emptyValue) or returnSelections');
    // The scan must find the twenty-one specs whose items carry a marked row
    // today (cmd.js 2, coloratt.js 2, insight.js 1, o_init.js 1, options.js
    // 9, pickup.js 3, restore.js 1, symbols.js 1, teleport.js 1); fewer
    // means it went blind.
    assert.equal(specs, 21);
});
