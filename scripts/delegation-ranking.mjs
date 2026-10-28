// Lexical ranking evidence, never a call-equivalence or reachability proof.
import { parse } from 'espree';
export const DELEGATION_HINT_VERSION = 'default-import-delegation-v1';
const id = node => node?.type === 'Identifier' ? node.name : null;
const rootName = node => id(node) ?? (node?.type === 'MemberExpression' ? rootName(node.object) : null);
function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (/Function/u.test(node.type ?? '')) return;
    visit(node);
    for (const [key, value] of Object.entries(node)) {
        if (['loc', 'range'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(child => walk(child, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
}
export function delegationModule(source) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true });
    const functions = new Map(), imports = new Map();
    for (const statement of ast.body) {
        const node = statement.declaration ?? statement;
        if (node.type === 'FunctionDeclaration') functions.set(node.id.name, node);
        if (node.type === 'ImportDeclaration' && /^\.\.?\//u.test(node.source.value))
            for (const spec of node.specifiers)
                if (spec.type === 'ImportSpecifier') imports.set(spec.local.name,
                    { module: node.source.value, imported: spec.imported.name });
    }
    return callerName => {
        const caller = functions.get(callerName);
        if (!caller) return [];
        const writes = new Set(), names = new Map();
        if (caller.body.body.some(node => node.type === 'FunctionDeclaration')) return [];
        walk(caller.body, node => {
            if (node.type === 'VariableDeclarator') {
                const declared = id(node.id) ? [id(node.id)] : node.id.type === 'ObjectPattern'
                    ? node.id.properties.map(p => id(p.value)).filter(Boolean) : [];
                for (const name of declared) names.set(name, (names.get(name) ?? 0) + 1);
            }
            if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression'
                || (node.type === 'UnaryExpression' && node.operator === 'delete'))
                writes.add(rootName(node.left ?? node.argument));
        });
        const params = new Set(caller.params.map(p => id(p.left ?? p)).filter(Boolean));
        const unique = name => names.get(name) === 1 && !writes.has(name) && !params.has(name);
        // Only top-level const declarations are followed; no dataflow solver.
        const environments = new Map(), aliases = new Map();
        function factoryProperties(call) {
            if (call?.type !== 'CallExpression' || !id(call.callee)) return null;
            const factoryName = id(call.callee), factory = functions.get(factoryName);
            if (!factory || params.has(factoryName) || names.has(factoryName)
                || writes.has(factoryName) || factory.body.body.length !== 1) return null;
            const returned = factory.body.body[0];
            if (returned.type !== 'ReturnStatement' || returned.argument?.type !== 'ObjectExpression') return null;
            const properties = returned.argument.properties, result = new Map();
            const factoryParams = new Set(factory.params.map(p => id(p.left ?? p)).filter(Boolean));
            for (let index = 0; index < properties.length; index++) {
                const prop = properties[index], key = id(prop.key);
                if (prop.type !== 'Property' || prop.computed || prop.kind !== 'init' || !key
                    || properties.slice(index + 1).some(p => p.type === 'SpreadElement')
                    || properties.filter(p => id(p.key) === key).length !== 1) continue;
                let fallback = prop.value;
                while (fallback?.type === 'LogicalExpression' && fallback.operator === '??') fallback = fallback.right;
                const local = id(fallback), imported = imports.get(local);
                if (!imported || factoryParams.has(local)) continue;
                result.set(key, { factory: factoryName, property: key, importLocal: local,
                    ...imported, definitionLine: prop.loc.start.line });
            }
            return result;
        }
        for (const statement of caller.body.body) {
            if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
            for (const decl of statement.declarations) {
                if (id(decl.id) && unique(id(decl.id))) {
                    const props = factoryProperties(decl.init);
                    if (props) environments.set(id(decl.id), { props, line: statement.loc.end.line });
                } else if (decl.id.type === 'ObjectPattern') {
                    const env = environments.get(id(decl.init));
                    const props = env?.props ?? factoryProperties(decl.init);
                    for (const prop of decl.id.properties) {
                        const key = id(prop.key), alias = id(prop.value);
                        if (prop.type === 'Property' && !prop.computed && alias && unique(alias) && props?.has(key))
                            aliases.set(alias, { ...props.get(key), alias, bindingLine: statement.loc.end.line });
                    }
                }
            }
        }
        const result = [];
        walk(caller.body, node => {
            if (node.type !== 'CallExpression') return;
            let trace = aliases.get(id(node.callee));
            if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
                const env = environments.get(id(node.callee.object));
                if (env?.props.has(id(node.callee.property)))
                    trace = { ...env.props.get(id(node.callee.property)),
                        alias: `${id(node.callee.object)}.${id(node.callee.property)}`, bindingLine: env.line };
            }
            if (trace && node.loc.start.line >= trace.bindingLine) result.push({ ...trace, callLine: node.loc.start.line });
        });
        return result;
    };
}
export function defaultImportDelegations(source, callerName) {
    return delegationModule(source)(callerName);
}
export function delegationRankingHint(kind, target, traces) {
    if (kind !== 'edge-c-only') return null;
    const matches = traces.filter(trace => trace.imported === target);
    return matches.length ? { version: DELEGATION_HINT_VERSION, delta: -10,
        reason: 'Paired JS owner calls a const-bound property/alias whose factory defaults to the matching named import.',
        limitation: 'Lexical hint only: overrides, mutation through other calls, arguments, branch reachability and RNG order remain unproved; retain the candidate.',
        traces: matches } : null;
}
