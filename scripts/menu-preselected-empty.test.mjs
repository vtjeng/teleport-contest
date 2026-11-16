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
