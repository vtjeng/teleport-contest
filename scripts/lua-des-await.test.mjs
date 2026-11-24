// A level program's des.* calls must run one after another, as in C. Lua
// calls each sp_lev.c lspo_*() function and waits for it to return,
// including any pline() --More-- it waits at, before the next statement
// runs. In the port, a des.* call can return a Promise: outside level
// creation (#wizloadlua: wizcmds.c wiz_load_lua() -> nhlua.c load_lua(),
// which leaves in_mklev unset) des.monster() reaches makemon()'s runtime
// tail, which can print the appearance message, and des.object(),
// des.trap(), des.altar(), des.map(), des.room() and des.region() pass on a
// Promise from what they create or from their contents callback. A loader
// that does not wait runs its next statements before that tail, so their
// random numbers and level changes move before the --More-- where C makes
// them (dat/tut-1.lua under #wizloadlua was such a case). This check scans
// js/ for the three forms that loss took:
//
// 1. a des.<field>() call that is not awaited, apart from the fields that
//    are not C des.* functions and never return a Promise (SYNC_FIELDS);
// 2. in a module that calls des.*, a call to one of the module's own async
//    functions (a helper such as tut-1's tut_key_help()) that is neither
//    awaited nor returned to a caller that awaits it;
// 3. in such a module, an async function handed to a synchronous iterator
//    (selection.iterate(), forEach(), map(), ...), which drops its Promise;
//    sel:iterate() goes through js/nhlsel.js l_selection_iterate(), which
//    waits for each call.
//
// It also lists the direct lspo_*() calls outside des.* whose result is
// neither awaited nor returned (LSPO_UNAWAITED), with the reason each one
// stays synchronous, so a new one fails until someone checks it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { parse } from 'acorn';

import { readJsSources } from './discarded-promises.mjs';

// des.* fields that are not sp_lev.c lspo_*() functions: nhlib.lua
// shuffle(), nhlua.c nhl_parse_config() (nh.parse_config()) and nhlua.c
// nhl_get_cmd_key() (nh.eckey()); none can return a Promise.
const SYNC_FIELDS = new Set(['shuffle', 'parse_config', 'eckey']);

// Synchronous iterators that discard their callback's result.
const SYNC_ITERATORS = new Set([
    'iterate', 'forEach', 'map', 'filter', 'some', 'every', 'find',
    'findIndex', 'reduce', 'flatMap',
]);

// "<file> | <enclosing function>": [count, reason]. Every listed call runs
// only inside level creation, where in_mklev makes des.monster() and the
// object and trap creators synchronous.
const LSPO_UNAWAITED = {
    // Each branch's result goes to `maybeCreation`, which the caller passes
    // on as a Promise when it is one.
    'js/mklev.js | <anonymous>': [2,
        'themerms.lua "Mausoleum" contents: mklev.c makerooms() -> '
        + 'themerooms_generate() runs inside makelevel(); the result is '
        + 'chained when it is a Promise.'],
    'js/mklev.js | water_surrounded_vault_contents': [3,
        'themerms.lua "Water-surrounded vault" contents: mklev.c makerooms() '
        + '-> themerooms_generate() runs inside makelevel(), so '
        + 'lspo_object() returns synchronously for the four chests; the '
        + 'vampire lord\'s lspo_monster() result is chained when it is a '
        + 'Promise.'],
    'js/mklev.js | finish': [1,
        'themerms.lua "Water-surrounded vault": lspo_exclusion() is always '
        + 'synchronous; it runs once the vault\'s monster is made.'],
    'js/mklev.js | dispatch_map_action': [1,
        'lspo_map() is synchronous: it places a map fragment and returns '
        + 'its origin.'],
    'js/themeroom_fill.js | <anonymous>': [1,
        'themerms.lua "Garden" contents: the result is chained when it is a '
        + 'Promise.'],
    'js/themeroom_fill.js | fillGhostOfAnAdventurer': [1,
        'themerms.lua "Ghost of an Adventurer" contents: the result is '
        + 'chained when it is a Promise.'],
};

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function isNode(value) {
    return value && typeof value.type === 'string';
}

// Visit every node below `node` with its ancestors (outermost first).
function walk(node, visit, ancestors = []) {
    visit(node, ancestors);
    ancestors.push(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, visit, ancestors);
        } else if (isNode(value)) {
            walk(value, visit, ancestors);
        }
    }
    ancestors.pop();
}

// The nearest named function around a node, or <module>; an unnamed
// callback is <anonymous>.
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
        return '<anonymous>';
    }
    return '<module>';
}

// The called name: `f` for f() and x.f(), unwrapping x?.f().
function calleeName(call) {
    const callee = call.callee;
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed
        && callee.property.type === 'Identifier')
        return callee.property.name;
    return null;
}

function isDesCall(call) {
    const callee = call.callee;
    return callee.type === 'MemberExpression' && !callee.computed
        && callee.object.type === 'Identifier' && callee.object.name === 'des'
        && callee.property.type === 'Identifier';
}

// The node that receives the call's value, past an optional-chain wrapper,
// and the child of it that holds the call.
function valueParent(call, ancestors) {
    let child = call;
    let i = ancestors.length - 1;
    while (ancestors[i]?.type === 'ChainExpression') child = ancestors[i--];
    return { parent: ancestors[i], child };
}

function awaited(call, ancestors) {
    return valueParent(call, ancestors).parent?.type === 'AwaitExpression';
}

// Awaited, or handed back to the caller: a `return` operand or the body of
// an expression-bodied arrow.
function awaitedOrReturned(call, ancestors) {
    const { parent, child } = valueParent(call, ancestors);
    if (parent?.type === 'AwaitExpression' || parent?.type === 'ReturnStatement')
        return true;
    return parent?.type === 'ArrowFunctionExpression' && parent.body === child;
}

function asyncNames(ast) {
    const names = new Set();
    walk(ast, (node, ancestors) => {
        if (!FUNCTION_TYPES.has(node.type) || !node.async) return;
        if (node.id) names.add(node.id.name);
        const parent = ancestors.at(-1);
        if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
            names.add(parent.id.name);
        if ((parent?.type === 'MethodDefinition' || parent?.type === 'Property')
            && !parent.computed && parent.key.type === 'Identifier')
            names.add(parent.key.name);
    });
    return names;
}

// Findings in one module: { line, rule, text } for rules 1-3, and the
// "<file> | <function>" keys of unawaited direct lspo_*() calls.
export function scanModule(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
        allowHashBang: true,
    });
    const lines = source.split('\n');
    const findings = [];
    const lspo = {};
    let callsDes = false;
    walk(ast, (node) => {
        if (node.type === 'CallExpression' && isDesCall(node)) callsDes = true;
    });
    const names = callsDes ? asyncNames(ast) : new Set();
    const report = (node, rule) => {
        findings.push({
            line: node.loc.start.line, rule,
            text: `${file}:${node.loc.start.line}: ${lines[node.loc.start.line - 1].trim()}`,
        });
    };
    walk(ast, (node, ancestors) => {
        if (node.type !== 'CallExpression') return;
        const name = calleeName(node);
        if (isDesCall(node)) {
            if (!SYNC_FIELDS.has(name) && !awaited(node, ancestors)) report(node, 1);
            return;
        }
        if (callsDes && name && names.has(name)
            && !awaitedOrReturned(node, ancestors))
            report(node, 2);
        if (callsDes && name && SYNC_ITERATORS.has(name)
            && node.callee.type === 'MemberExpression') {
            for (const arg of node.arguments) {
                if ((FUNCTION_TYPES.has(arg.type) && arg.async)
                    || (arg.type === 'Identifier' && names.has(arg.name))) {
                    report(node, 3);
                    break;
                }
            }
        }
        if (name && /^lspo_/u.test(name) && node.callee.type === 'Identifier'
            && !awaitedOrReturned(node, ancestors)) {
            const key = `${file} | ${enclosingName(ancestors)}`;
            lspo[key] = (lspo[key] ?? 0) + 1;
        }
    });
    return { findings, lspo };
}

test('every des.* call and level-program helper in js/ is awaited', () => {
    const findings = [];
    const lspo = {};
    for (const [file, source] of Object.entries(readJsSources())) {
        const result = scanModule(file, source);
        findings.push(...result.findings.map((f) => `rule ${f.rule}: ${f.text}`));
        for (const [key, count] of Object.entries(result.lspo))
            lspo[key] = (lspo[key] ?? 0) + count;
    }
    assert.deepEqual(findings, []);
    const problems = [];
    for (const [key, count] of Object.entries(lspo)) {
        const entry = LSPO_UNAWAITED[key];
        if (!entry) {
            problems.push(`new: ${key} (${count}); await the lspo_*() call `
                + 'or list it with the reason it stays synchronous');
        } else if (entry[0] !== count) {
            problems.push(`changed: ${key} (${entry[0]} -> ${count})`);
        }
    }
    for (const key of Object.keys(LSPO_UNAWAITED))
        if (!(key in lspo)) problems.push(`gone: ${key}; remove it from the list`);
    assert.deepEqual(problems, []);
});

test('the scan finds each unawaited form and accepts awaited ones', () => {
    const source = [
        'export async function level(des) {', // 1
        '    await des.monster("lichen");', // 2
        '    des.object("rock");', // 3: rule 1
        '    des.shuffle(list);', // 4: not a creation
        '    const r = des.trap();', // 5: rule 1
        '    await help(1, 2);', // 6
        '    help(3, 4);', // 7: rule 2
        '    sel.iterate(spot);', // 8: rule 3
        '    sel.iterate((x, y) => points.push([x, y]));', // 9: a collector
        '    await des.map({ contents: async () => help(5, 6) });', // 10
        '    keys.help(7, 8);', // 11: rule 2, a method of the same name
        '    lspo_monster([], null, env);', // 12: listed
        '    sel.forEach(async (p) => { await des.gold(p); });', // 13: rule 3
        '    await des.eckey?.("up");', // 14
        '    des.engraving?.({});', // 15: rule 1 through an optional call
        '}',
        'async function help(x, y) { await des.engraving({ coord: [x, y] }); }',
        'async function spot(x, y) { return lspo_gold([x, y], env); }',
    ].join('\n');
    const { findings, lspo } = scanModule('js/x.js', source);
    assert.deepEqual(findings.map((f) => [f.line, f.rule]), [
        [3, 1], [5, 1], [7, 2], [8, 3], [11, 2], [13, 3], [15, 1],
    ]);
    assert.deepEqual(lspo, { 'js/x.js | level': 1 });
});
