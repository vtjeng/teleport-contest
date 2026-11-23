#!/usr/bin/env node

// Lists every use under js/ of a field of one game-state struct, such as
// state.context (C's svc.context), and classifies each read by whether a
// field that has never been written reads the same as C's zero.
//
// C zero-initializes its global structs, so a field nobody has written reads
// as 0, FALSE or NULL. A JavaScript object built field by field has no such
// field yet, and `undefined` behaves like 0 only in some reads: it is falsy
// and `undefined | 0` is 0, but `undefined === 0` is false, `undefined < 1`
// is false, `undefined + 1` is NaN and `obj[undefined]` reads the key
// "undefined". The classes below say which reads are which.
//
// The scan follows the holder (`state.context`, `game.context`,
// `g.context`, `env.state.context`, optional-chained forms), local aliases
// (`const context = state.context ?? {}`, `const { context } = state`,
// `const digging = state.context.digging`, destructured fields), default
// parameters initialized from the holder, and functions in the same file
// whose every return is a holder path (`function victual(state) { ...
// return state.context.victual; }`). It does not follow a struct passed as
// an argument into a function in another file; those uses are classed
// `flow-argument` for a reader to follow. A holder name that other structs
// share, such as `flags`, counts only on the bases HOLDER_BASES lists.
//
// Classes of a use, by the expression that consumes the field's value:
//   write                    plain assignment
//   write-object             assignment of an object literal
//   write-holder             assignment to the holder itself
//   assign-default-zero      `??=` with 0, false, '' or null
//   assign-default           `??=` with anything else
//   safe-truth               truthiness test (`if`, `!`, `?:`, `&&`, Boolean())
//   safe-or                  left of `||`
//   safe-default-zero        left of `??` with 0, false, '' or null
//   safe-bitwise             operand of a bitwise operator or `|=` and the like
//   safe-compare-literal     `===` and the like against a non-zero literal
//   different-zero-compare   `===` and the like against 0, false or ''
//   different-null-compare   `===` and the like against null or undefined
//   different-default        left of `??` with a non-zero default
//   different-relational     operand of `<`, `<=`, `>`, `>=`
//   different-arithmetic     operand of `+ - * / % **` or unary `-`/`+`
//   different-update         `++` or `--`, or a compound arithmetic assignment
//   different-index          used as a computed property key
//   different-format         template literal or string concatenation
//   different-convert        argument of Number(), String() or Math.*()
//   different-switch         switch discriminant
//   different-presence       delete, typeof, `in` or Object.hasOwn()
//   deref                    a further property, index or method is read from
//                            it (a nested struct, array or pointer)
//   compare-expression       `===` and the like against a non-literal: differs
//                            when the other side can be zero
//   flow-*                   the value is passed, returned, stored or spread
//   unused                   expression statement
//
// Usage: node scripts/state-field-uses.mjs [holder] [--list]
//   holder defaults to `context`; --list prints every use, one a line.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
export const JS_DIR = join(PROJECT_ROOT, 'js');

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);
// The expressions destructuring may take a holder from: `const { context }
// = state`.
const STATE_NAMES = /^(?:state|game|g|env\.state|liveState|normalized\.state)$/u;

// Holders whose name other structs share, with the expressions the holder is
// read from. js/ names C's struct flag `flags` on the game state, on the
// options parser's result (`result` in js/options.js, `opts` and `options`
// where it is passed on) and on a save snapshot, while the level's
// svl.level.flags, a location's rm.flags, a light source's flags and others
// are different structs.
const HOLDER_BASES = {
    flags: /^(?:state|game|g|env\.state|liveState|normalized\.state|result|opts|options|snapshot)$/u,
    // C's gx and gy groups, which share their names with gg.gx and gg.gy,
    // dogmove.c's goal coordinates (`goal.gx` in js/dogmove.js).
    gx: /^(?:state|game|g|env\.state|liveState)$/u,
    gy: /^(?:state|game|g|env\.state|liveState)$/u,
};

const isNode = (value) => value && typeof value.type === 'string';

function link(node, parent, key, all) {
    node.parent = parent;
    node.parentKey = key;
    all.push(node);
    for (const k of Object.keys(node)) {
        if (k === 'parent' || k === 'parentKey' || k === 'loc') continue;
        const value = node[k];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) link(child, node, k, all);
        } else if (isNode(value)) {
            link(value, node, k, all);
        }
    }
}

// `x ?? {}`, `x || {}`, `(x ??= {})` read as x.
function stripDefault(node) {
    if (node.type === 'ChainExpression') return stripDefault(node.expression);
    if (node.type === 'LogicalExpression'
        && (node.operator === '??' || node.operator === '||'))
        return stripDefault(node.left);
    if (node.type === 'AssignmentExpression'
        && (node.operator === '??=' || node.operator === '||='))
        return stripDefault(node.left);
    return node;
}

function enclosingScopes(node) {
    const scopes = [];
    for (let p = node.parent; p; p = p.parent)
        if (FUNCTION_TYPES.has(p.type) || p.type === 'Program') scopes.push(p);
    return scopes;
}

function patternNames(pattern, into) {
    if (!pattern) return into;
    if (pattern.type === 'Identifier') into.add(pattern.name);
    else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, into);
    else if (pattern.type === 'RestElement') patternNames(pattern.argument, into);
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => patternNames(e, into));
    else if (pattern.type === 'ObjectPattern') {
        for (const property of pattern.properties)
            patternNames(property.type === 'RestElement' ? property.argument : property.value, into);
    }
    return into;
}

const isZeroLiteral = (node) => node.type === 'Literal'
    && (node.value === 0 || node.value === false || node.value === '');
const isNullLiteral = (node) => (node.type === 'Literal' && node.value === null)
    || (node.type === 'Identifier' && node.name === 'undefined');

// Every use of a `holder` field in one file's source.
export function scanSource(file, source, holder = 'context') {
    // A file that never spells the holder has no use of it; skipping the
    // parse keeps a scan of many holders (C's ga ... gz) quick.
    if (!new RegExp(`\\b${holder}\\b`, 'u').test(source)) return [];
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const all = [];
    link(ast, null, null, all);
    const text = (node) => source.slice(node.start, node.end);

    const bases = HOLDER_BASES[holder];
    const roots = new Set(all.filter((node) => node.type === 'MemberExpression'
        && !node.computed && node.property.type === 'Identifier'
        && node.property.name === holder
        && (!bases || bases.test(text(node.object)))));
    const aliases = new Map(); // name -> [{ scope, path, node, destructured }]
    const aliasNodes = new Map();
    const returning = new Map(); // function name -> path
    const params = new Map();
    const paramsOf = (scope) => {
        if (!params.has(scope)) params.set(scope, patternNames({ type: 'ArrayPattern', elements: scope.params ?? [] }, new Set()));
        return params.get(scope);
    };

    function pathOf(node) {
        if (roots.has(node)) return [];
        if (node.type === 'ChainExpression') return pathOf(node.expression);
        if (node.type === 'Identifier') {
            const candidates = aliases.get(node.name);
            if (!candidates) return null;
            for (const scope of enclosingScopes(node)) {
                const alias = candidates.find((a) => a.scope === scope && a.node !== node);
                if (alias) return alias.path;
                if (paramsOf(scope).has(node.name)) return null;
            }
            return null;
        }
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier'
            && returning.has(node.callee.name))
            return returning.get(node.callee.name);
        if (node.type === 'MemberExpression' && !node.computed) {
            const base = pathOf(node.object);
            if (base) return [...base, node.property.name];
        }
        return null;
    }
    function addAlias(target, path, declaration, destructured = false) {
        if (aliasNodes.has(target)) return false;
        const alias = { scope: enclosingScopes(declaration)[0], path, node: target, destructured };
        aliasNodes.set(target, alias);
        if (!aliases.has(target.name)) aliases.set(target.name, []);
        aliases.get(target.name).push(alias);
        return true;
    }
    function returnsOf(fn) {
        const found = [];
        const visit = (node) => {
            if (node !== fn && FUNCTION_TYPES.has(node.type)) return;
            if (node.type === 'ReturnStatement') found.push(node);
            for (const k of Object.keys(node)) {
                if (k === 'parent') continue;
                const value = node[k];
                if (Array.isArray(value)) value.forEach((c) => isNode(c) && visit(c));
                else if (isNode(value)) visit(value);
            }
        };
        visit(fn.body);
        return found;
    }

    // Aliases of aliases need several passes.
    for (let changed = true; changed;) {
        changed = false;
        for (const node of all) {
            if (node.type === 'FunctionDeclaration' && node.id && !returning.has(node.id.name)) {
                const returns = returnsOf(node);
                if (returns.length && returns.every((r) => r.argument)) {
                    const paths = returns.map((r) => pathOf(stripDefault(r.argument)));
                    if (paths.every((p) => p && p.join('.') === paths[0].join('.'))) {
                        returning.set(node.id.name, paths[0]);
                        changed = true;
                    }
                }
            }
            let id = null;
            let init = null;
            if (node.type === 'VariableDeclarator') ({ id, init } = node);
            else if (node.type === 'AssignmentPattern') ({ left: id, right: init } = node);
            if (!init) continue;
            const base = stripDefault(init);
            const path = pathOf(base);
            if (id.type === 'Identifier') {
                if (path && addAlias(id, path, node)) changed = true;
            } else if (id.type === 'ObjectPattern') {
                for (const property of id.properties) {
                    if (property.type !== 'Property' || property.computed) continue;
                    const key = property.key.name ?? String(property.key.value);
                    const target = property.value.type === 'AssignmentPattern'
                        ? property.value.left : property.value;
                    if (target.type !== 'Identifier') continue;
                    if (path && addAlias(target, [...path, key], node, true)) changed = true;
                    else if (!path && key === holder && STATE_NAMES.test(text(base))
                        && addAlias(target, [], node)) changed = true;
                }
            }
        }
    }

    const uses = [];
    for (const node of all) {
        if (node.type !== 'MemberExpression' && node.type !== 'Identifier') continue;
        const alias = aliasNodes.get(node);
        if (alias) {
            // `const { run } = state.context` reads run where it binds it.
            if (alias.destructured)
                uses.push(use(node, alias.path, { cls: 'flow-var', detail: node.name }));
            continue;
        }
        if (node.type === 'Identifier' && node.parentKey === 'property'
            && node.parent.type === 'MemberExpression' && !node.parent.computed) continue;
        if (node.type === 'Identifier' && node.parent.type === 'Property'
            && node.parentKey === 'key' && !node.parent.shorthand) continue;
        const path = pathOf(node);
        if (!path) continue;
        let up = node.parent;
        while (up.type === 'ChainExpression') up = up.parent;
        // Report only the longest holder path in a chain.
        if (up.type === 'MemberExpression' && !up.computed
            && stripDefault(up.object) === node && pathOf(up)) continue;
        uses.push(use(node, path, path.length ? classify(node) : classifyHolder(node)));
    }
    return uses;

    function use(node, path, { cls, detail = '' }) {
        return {
            site: `${file}:${node.loc.start.line}`,
            path: path.join('.'),
            cls,
            detail,
            text: text(node),
        };
    }

    function classifyHolder(node) {
        const up = node.parent;
        const callee = up.type === 'CallExpression' ? text(up.callee) : '';
        if (/^Object\.hasOwn$|\.hasOwnProperty$/u.test(callee))
            return { cls: 'different-presence', detail: `hasOwn ${up.arguments[1]?.value}` };
        if (up.type === 'LogicalExpression' && up.parent.type === 'CallExpression'
            && /^Object\.hasOwn$/u.test(text(up.parent.callee)))
            return { cls: 'different-presence', detail: `hasOwn ${up.parent.arguments[1]?.value}` };
        if (up.type === 'BinaryExpression' && up.operator === 'in')
            return { cls: 'different-presence', detail: `in ${up.left.value}` };
        if (up.type === 'AssignmentExpression' && up.left === node)
            return { cls: 'write-holder', detail: `${up.operator} ${text(up.right).slice(0, 60)}` };
        return { cls: 'flow-holder', detail: up.type };
    }

    function classify(node, depth = 0) {
        let child = node;
        let up = node.parent;
        while (up.type === 'ChainExpression') {
            child = up;
            up = up.parent;
        }
        const other = (n) => text(n).replace(/\s+/gu, ' ').slice(0, 40);
        switch (up.type) {
        case 'AssignmentExpression':
            if (up.left !== child) return { cls: 'flow-assign' };
            if (up.operator === '=') {
                return up.right.type === 'ObjectExpression'
                    ? { cls: 'write-object', detail: up.right.properties.map((p) => p.key?.name ?? '...').join(',') }
                    : { cls: 'write', detail: other(up.right) };
            }
            if (up.operator === '??=')
                return { cls: isZeroLiteral(up.right) || isNullLiteral(up.right) ? 'assign-default-zero' : 'assign-default', detail: other(up.right) };
            if (up.operator === '||=' || up.operator === '&&=') return { cls: 'safe-truth', detail: up.operator };
            if (['|=', '&=', '^=', '<<=', '>>=', '>>>='].includes(up.operator))
                return { cls: 'safe-bitwise', detail: up.operator };
            return { cls: 'different-update', detail: up.operator };
        case 'UpdateExpression':
            return { cls: 'different-update', detail: up.operator };
        case 'UnaryExpression':
            if (up.operator === '!') return { cls: 'safe-truth', detail: '!' };
            if (up.operator === '~') return { cls: 'safe-bitwise', detail: '~' };
            if (up.operator === 'delete' || up.operator === 'typeof')
                return { cls: 'different-presence', detail: up.operator };
            if (up.operator === 'void') return { cls: 'unused' };
            return { cls: 'different-arithmetic', detail: up.operator };
        case 'IfStatement': case 'WhileStatement': case 'DoWhileStatement': case 'ForStatement':
            return up.test === child ? { cls: 'safe-truth' } : { cls: 'flow-other', detail: up.type };
        case 'ConditionalExpression':
            if (up.test === child) return { cls: 'safe-truth', detail: '?:' };
            return depth < 4 ? classify(up, depth + 1) : { cls: 'flow-other', detail: '?:' };
        case 'LogicalExpression':
            if (up.left === child && up.operator === '||')
                return { cls: 'safe-or', detail: other(up.right) };
            if (up.left === child && up.operator === '??') {
                if (isZeroLiteral(up.right) || isNullLiteral(up.right))
                    return { cls: 'safe-default-zero', detail: other(up.right) };
                return { cls: 'different-default', detail: other(up.right) };
            }
            return depth < 4 ? classify(up, depth + 1) : { cls: 'flow-other', detail: up.operator };
        case 'BinaryExpression': {
            const operand = up.left === child ? up.right : up.left;
            const op = up.operator;
            if (['===', '!==', '==', '!='].includes(op)) {
                if (isZeroLiteral(operand)) return { cls: 'different-zero-compare', detail: `${op} ${other(operand)}` };
                if (isNullLiteral(operand)) return { cls: 'different-null-compare', detail: `${op} ${other(operand)}` };
                if (operand.type === 'Literal') return { cls: 'safe-compare-literal', detail: `${op} ${operand.raw}` };
                return { cls: 'compare-expression', detail: `${op} ${other(operand)}` };
            }
            if (['<', '<=', '>', '>='].includes(op)) return { cls: 'different-relational', detail: `${op} ${other(operand)}` };
            if (['&', '|', '^', '<<', '>>', '>>>'].includes(op)) return { cls: 'safe-bitwise', detail: op };
            if (op === 'in' || op === 'instanceof') return { cls: 'flow-other', detail: op };
            if (op === '+' && ((operand.type === 'Literal' && typeof operand.value === 'string')
                || operand.type === 'TemplateLiteral'))
                return { cls: 'different-format', detail: '+ string' };
            return { cls: 'different-arithmetic', detail: `${op} ${other(operand)}` };
        }
        case 'MemberExpression':
            if (up.property === child && up.computed) return { cls: 'different-index' };
            return { cls: 'deref', detail: up.computed ? `[${other(up.property)}]` : up.property.name };
        case 'CallExpression': case 'NewExpression': {
            if (up.callee === child) return { cls: 'deref', detail: '()' };
            const callee = text(up.callee);
            if (callee === 'Boolean') return { cls: 'safe-truth', detail: 'Boolean()' };
            if (/^(?:Number|String|Math\.\w+)$/u.test(callee)) return { cls: 'different-convert', detail: callee };
            if (/^Object\.hasOwn$/u.test(callee)) return { cls: 'different-presence', detail: 'hasOwn' };
            return { cls: 'flow-argument', detail: `${callee}#${up.arguments.indexOf(child)}` };
        }
        case 'TemplateLiteral': return { cls: 'different-format', detail: 'template' };
        case 'SwitchStatement': return { cls: 'different-switch' };
        case 'ExpressionStatement': case 'SequenceExpression': return { cls: 'unused' };
        case 'VariableDeclarator': return { cls: 'flow-var', detail: up.id.name ?? 'pattern' };
        case 'ReturnStatement': case 'ArrowFunctionExpression': return { cls: 'flow-return' };
        case 'Property': return { cls: 'flow-property', detail: up.key?.name };
        case 'ArrayExpression': return { cls: 'flow-array' };
        case 'SpreadElement': return { cls: 'flow-spread' };
        case 'AssignmentPattern': return { cls: 'flow-default' };
        default: return { cls: 'flow-other', detail: up.type };
        }
    }
}

export function jsFiles(dir = JS_DIR) {
    return readdirSync(dir, { recursive: true })
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => [name, readFileSync(join(dir, name), 'utf8')]);
}

export function scanFiles(files, holder = 'context') {
    return files.flatMap(([name, source]) => scanSource(name, source, holder));
}

// Resolve a use's path against a generated struct table such as
// js/context.js CONTEXT_STRUCTS. Returns the C field the path names
// (`digging.pos.x`), its C type, and whether the path continues past a
// pointer or array (`victual.piece.otyp` names victual.piece).
export function resolvePath(path, structs, root) {
    const parts = path ? path.split('.') : [];
    let struct = root;
    const field = [];
    for (let i = 0; i < parts.length; i++) {
        const entry = structs[struct].find(([name]) => name === parts[i]);
        if (!entry) return { field: [...field, parts[i]].join('.'), ctype: null, beyond: false };
        field.push(parts[i]);
        if (entry[2]) {
            struct = entry[2];
            continue;
        }
        return { field: field.join('.'), ctype: entry[1], beyond: i < parts.length - 1 };
    }
    return { field: field.join('.'), ctype: `struct ${struct}`, beyond: false };
}

function main() {
    const args = process.argv.slice(2);
    const list = args.includes('--list');
    const holder = args.find((arg) => !arg.startsWith('--')) ?? 'context';
    const uses = scanFiles(jsFiles(), holder);
    if (list) {
        for (const u of uses)
            console.log(`${u.site}\t${u.path}\t${u.cls}\t${u.detail}\t${u.text.replace(/\s+/gu, ' ').slice(0, 60)}`);
        return;
    }
    const counts = {};
    for (const u of uses) counts[u.cls] = (counts[u.cls] ?? 0) + 1;
    console.log(`${uses.length} uses of ${holder} fields`);
    for (const [cls, count] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
        console.log(`${String(count).padStart(6)} ${cls}`);
}

if (process.argv[1] === SCRIPT_PATH) main();
