#!/usr/bin/env node
// Report-only leads. Reuses the C inventory and generated command catalog;
// no gameplay, queue, score, or source-completion records are changed.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';
import { listCFiles, parseCFunctions, PROJECT_ROOT } from './c-functions.mjs';
import { parseCaller } from './mismatch-queue.mjs';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { extcmdlist, WIZMODECMD, CMD_NOT_AVAILABLE, INTERNALCMD } from '../js/extcmdlist_data.js';

export const DEFAULT_FILES = ['wield.c', 'lock.c', 'music.c', 'sit.c', 'steed.c', 'spell.c', 'read.c', 'detect.c',
    'artifact.c', 'mhitu.c', 'monmove.c', 'dogmove.c', 'pickup.c', 'eat.c', 'potion.c', 'attrib.c', 'polyself.c', 'zap.c', 'invent.c'];
const MESSAGE = /^(?:pline(?:_1|_The|_mon)?|You|Your|You_feel|You_hear|You_cant|You_see|There|verbalize)$/u;
const PILOT_EXCLUDED_FILES = new Set(['do.c', 'timeout.c', 'apply.c']);
const FORMAT = /%(?:\d+\$)?[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlLjzt]*[a-zA-Z%]/gu;
export const hash = value => createHash('sha256').update(value).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const normalize = s => s.replace(/\s+/gu, ' ').trim().toLowerCase();

// Preserve preprocessor uncertainty rather than interpreting arbitrary macros.
// Literal #if 0 is a proved inactive region; #else/elif remains unknown.
export function cGuards(source) {
    const stack = [], guards = new Map();
    for (const [i, text] of source.split('\n').entries()) {
        const directive = /^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)/u.exec(text);
        if (directive) {
            const [, kind, value] = directive;
            if (['if', 'ifdef', 'ifndef'].includes(kind)) stack.push(`${kind} ${value.trim()}`);
            else if (kind === 'endif') stack.pop();
            else if (stack.length) stack[stack.length - 1] = `${kind} ${value.trim()} (alternative)`;
        }
        guards.set(i + 1, [...stack]);
    }
    return guards;
}

// C lexical tokens only: no preprocessor semantics or branch feasibility claim.
// Keeping offsets lets the shared inventory supply function ownership.
export function cTokens(source) {
    const tokens = [];
    let previous = 0, currentLine = 1;
    const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_][\w]*|[^\s]/gu;
    for (const match of source.matchAll(re)) {
        const text = match[0];
        currentLine += source.slice(previous, match.index).match(/\n/gu)?.length ?? 0;
        const tokenLine = currentLine;
        currentLine += text.match(/\n/gu)?.length ?? 0;
        previous = match.index + text.length;
        if (text.startsWith('/*') || text.startsWith('//')) continue;
        tokens.push({ text, offset: match.index, line: tokenLine });
    }
    return tokens;
}
function closeAt(tokens, start, open, close) {
    let depth = 0;
    for (let i = start; i < tokens.length; i++) {
        if (tokens[i].text === open) depth++;
        if (tokens[i].text === close && --depth === 0) return i;
    }
    return -1;
}
function decodeCString(s) {
    return s.slice(1, -1).replace(/\\(?:n|r|t)/gu, ' ').replace(/\\(["'\\])/gu, '$1');
}
export function cUnits(source, path) {
    const all = cTokens(source);
    const guards = cGuards(source);
    return parseCFunctions(source).map(fn => {
        const start = all.findIndex(t => t.line === fn.line && t.text === fn.name);
        let open = start;
        while (open >= 0 && open < all.length && all[open].text !== '{') open++;
        const end = closeAt(all, open, '{', '}');
        if (end < 0) return null;
        const body = all.slice(open + 1, end);
        const calls = [], messages = [];
        for (let i = 0; i < body.length - 1; i++) {
            const token = body[i];
            if (!/^[A-Za-z_]\w*$/u.test(token.text) || body[i + 1].text !== '(') continue;
            const conditions = guards.get(token.line) ?? [];
            calls.push({ name: token.text, line: token.line, conditions });
            if (!MESSAGE.test(token.text)) continue;
            let j = i + 2, literal = '';
            if (token.text === 'pline_mon') {
                while (j < body.length && body[j].text !== ',') j++;
                j++;
            }
            while (body[j]?.text.startsWith('"')) literal += decodeCString(body[j++].text);
            if (!literal) continue; // variable/centralized formats are deliberately unknown
            const pieces = literal.split(FORMAT).map(normalize).filter(p => p.length >= 14);
            if (pieces.length) messages.push({ line: token.line, api: token.text, literal, pieces, conditions });
        }
        return { ...fn, path, calls, messages, startOffset: all[open].offset, endOffset: all[end].offset + 1,
            bodyEndLine: all[end].line, bodyHash: hash(source.slice(all[open].offset, all[end].offset + 1)) };
    }).filter(Boolean);
}

function walk(node, visit, parent = null) {
    if (!node || typeof node.type !== 'string') return;
    if (visit(node, parent) === false) return;
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walk(child, visit, node));
        else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value, visit, node);
    }
}
export function jsUnits(source, path) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true, range: true });
    const parents = new WeakMap();
    walk(ast, (node, parent) => { if (parent) parents.set(node, parent); });
    const bindingNames = pattern => {
        if (!pattern) return [];
        if (pattern.type === 'Identifier') return [pattern.name];
        if (pattern.type === 'AssignmentPattern') return bindingNames(pattern.left);
        if (pattern.type === 'RestElement') return bindingNames(pattern.argument);
        if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(p => bindingNames(p.value ?? p.argument));
        if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(bindingNames);
        return [];
    };
    const imports = new Map(), exports = new Map(), units = [], strings = [];
    for (const node of ast.body) {
        if (node.type === 'ImportDeclaration') for (const spec of node.specifiers) {
            imports.set(spec.local.name, { module: resolve(dirname(path), node.source.value),
                name: spec.imported?.name ?? '*', namespace: spec.type === 'ImportNamespaceSpecifier' });
        }
        if (node.type === 'ExportNamedDeclaration') {
            if (node.declaration?.id) exports.set(node.declaration.id.name, { name: node.declaration.id.name });
            for (const spec of node.specifiers) exports.set(spec.exported.name, {
                name: spec.local.name, module: node.source && resolve(dirname(path), node.source.value) });
        }
    }
    const stringPattern = node => {
        if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
        if (node.type === 'TemplateLiteral') return node.quasis.map(q => q.value.cooked ?? q.value.raw).join('\0');
        if (node.type === 'BinaryExpression' && node.operator === '+') {
            const left = stringPattern(node.left), right = stringPattern(node.right);
            return left !== null && right !== null ? left + right : null;
        }
        return null;
    };
    walk(ast, node => {
        if (node.type === 'BinaryExpression' || node.type === 'TemplateLiteral') {
            const pattern = stringPattern(node);
            if (pattern !== null) strings.push(...pattern.split('\0').map(normalize));
        }
        if (node.type === 'Literal' && typeof node.value === 'string') strings.push(normalize(node.value));
        if (node.type === 'TemplateElement') strings.push(normalize(node.value.cooked ?? node.value.raw));
        const fn = node.type === 'FunctionDeclaration' ? node
            : node.type === 'VariableDeclarator' && ['FunctionExpression', 'ArrowFunctionExpression'].includes(node.init?.type) ? node.init : null;
        if (!fn || node.id?.type !== 'Identifier') return;
        let scope = parents.get(node);
        while (scope && !['Program', 'BlockStatement'].includes(scope.type)) scope = parents.get(scope);
        const shadowed = new Set();
        for (let ancestor = fn; ancestor; ancestor = parents.get(ancestor)) {
            if (/Function/u.test(ancestor.type)) {
                ancestor.params.flatMap(bindingNames).forEach(name => shadowed.add(name));
                walk(ancestor.body, child => {
                    if (/Function/u.test(child.type)) return false;
                    if (child.type === 'VariableDeclarator' && !/Function/u.test(child.init?.type ?? ''))
                        bindingNames(child.id).forEach(name => shadowed.add(name));
                });
            }
        }
        const unit = { name: node.id.name, path, line: node.loc.start.line, async: fn.async,
            visibilityRange: scope?.range ?? ast.range, moduleScope: scope?.type === 'Program', shadowed,
            startOffset: fn.range[0], endOffset: fn.range[1], bodyEndLine: fn.loc.end.line,
            bodyHash: hash(source.slice(...fn.range)), calls: [], returns: [], imports: new Map() };
        walk(fn.body, (child, parent) => {
            if (/Function/u.test(child.type)) return false; // separate scopes, never charge nested callbacks to parent
            if (child.type === 'VariableDeclarator' && child.init?.type === 'AwaitExpression'
                && child.init.argument.type === 'ImportExpression' && typeof child.init.argument.source.value === 'string') {
                const target = resolve(dirname(path), child.init.argument.source.value);
                if (child.id.type === 'ObjectPattern') for (const prop of child.id.properties) {
                    if (prop.type === 'Property' && prop.value.type === 'Identifier')
                        unit.imports.set(prop.value.name, { module: target, name: prop.key.name });
                }
                else if (child.id.type === 'Identifier') unit.imports.set(child.id.name, { module: target, name: '*', namespace: true });
            }
            if (child.type === 'ReturnStatement') unit.returns.push(Boolean(child.argument));
            if (child.type === 'CallExpression') {
                const callee = child.callee;
                const name = callee.type === 'Identifier' ? callee.name
                    : callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier'
                        ? `${callee.object.name}.${callee.property.name}` : null;
                if (name) unit.calls.push({ name, line: child.loc.start.line, offset: child.range[0],
                    bare: parent?.type === 'ExpressionStatement',
                    stub: name === 'note_unported' ? child.arguments[0]?.value : null });
            }
        });
        units.push(unit);
    });
    return { path, imports, exports, units, strings };
}

export function resolveCall(module, name, modules, seen = new Set(), localImports = new Map(), caller = null, offset = caller?.startOffset) {
    const key = `${module}:${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const data = modules.get(module);
    if (!data) return null;
    const [base, member] = name.split('.');
    if (caller?.shadowed?.has(base) && !localImports.has(base)) return null;
    const visible = data.units.filter(u => u.name === name && (u.moduleScope
        || Number.isInteger(offset) && u.visibilityRange[0] <= offset && offset < u.visibilityRange[1]));
    const narrowest = Math.min(...visible.map(u => u.visibilityRange[1] - u.visibilityRange[0]));
    const local = visible.filter(u => u.visibilityRange[1] - u.visibilityRange[0] === narrowest);
    if (local.length === 1) return local[0];
    if (local.length > 1) return null;
    const imported = localImports.get(base) ?? data.imports.get(base);
    if (imported && (!member || imported.namespace))
        return resolveCall(imported.module, member ?? imported.name, modules, seen);
    const exported = data.exports.get(name);
    if (exported?.module) return resolveCall(exported.module, exported.name, modules, seen);
    if (exported && exported.name !== name) return resolveCall(module, exported.name, modules, seen);
    return null;
}

export function reachableJs(unit, modules, maxDepth = 3) {
    const names = new Set(), seen = new Set(), queue = [[unit, 0]];
    while (queue.length) {
        const [current, depth] = queue.shift();
        const key = `${current.path}:${current.name}:${current.startOffset}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const call of current.calls) {
            const target = resolveCall(current.path, call.name, modules, new Set(), current.imports, current, call.offset);
            if (!target) continue; // unresolved property/alias is not evidence of a matching edge
            names.add(target.name);
            if (depth < maxDepth) queue.push([target, depth + 1]);
        }
    }
    return names;
}

export function commandPaths(units, commands) {
    const byName = new Map(units.map(unit => [unit.name, unit]));
    const paths = new Map(), queue = [];
    for (const command of commands) {
        if (!byName.has(command.ef_funct)) continue;
        queue.push([command.ef_funct, [`#${command.ef_txt}`, command.ef_funct]]);
    }
    while (queue.length) {
        const [name, path] = queue.shift();
        if (paths.has(name)) continue;
        paths.set(name, path);
        for (const call of byName.get(name)?.calls ?? []) if (byName.has(call.name))
            queue.push([call.name, [...path, call.name]]);
    }
    return paths;
}

export function cacheKey(signal, sourceHash) { return hash(JSON.stringify([sourceHash, signal.id])); }
export function cachedReview(signal, sourceHash, cache) {
    return cache.entries?.[cacheKey(signal, sourceHash)] ?? null;
}

function filesUnder(directory, extension) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(path, extension) : path.endsWith(extension) ? [path] : [];
    });
}

export function diagnosticSourceHash(root) {
    const inputs = [
        ...listCFiles(join(root, 'nethack-c/upstream')).map(file => file.path),
        ...filesUnder(join(root, 'nethack-c/upstream/include'), '.h'),
        ...filesUnder(join(root, 'nethack-c/patches'), '.patch'),
        ...filesUnder(join(root, 'js'), '.js'), fileURLToPath(import.meta.url),
        // Review decisions about compiled features must expire when the actual
        // recorder or installed configuration changes, even with unchanged C.
        ...filesUnder(resolve(root, process.env.NETHACK_INSTALL || 'nethack-c/recorder/install/games/lib/nethackdir'), ''),
    ];
    const binary = resolve(root, process.env.NETHACK_BINARY || 'nethack-c/recorder/install/games/lib/nethackdir/nethack');
    if (existsSync(binary) && !inputs.includes(binary)) inputs.push(binary);
    return hash(inputs.sort().map(p => `${relative(root, p)}:${hash(readFileSync(p))}`).join('\n'));
}

// Recording caller annotations locate candidate prefixes. They establish C
// execution, not JS parity. Recheck the prefix with diff-fresh/replay-coverage.
export function recordingPrefixes(root, wantedFiles) {
    const prefixes = new Map();
    for (const file of wantedFiles) {
        for (const path of filesUnder(join(root, 'recordings', file), '.session.json')) {
            const recording = normalizeSession(json(path));
            for (let segment = 0; segment < recording.segments.length; segment++) {
                const data = recording.segments[segment];
                for (let step = 0; step < (data.steps ?? []).length; step++) {
                    for (const entry of data.steps[step].rng ?? []) {
                        const caller = parseCaller(String(entry).split(' @ ').slice(1).join(' @ '));
                        if (!caller || caller.sourceFile !== file) continue;
                        const key = `${file}:${caller.function}`;
                        const hit = { recording: relative(root, path), segment, step, callerLine: caller.line };
                        if (!prefixes.has(key) || step < prefixes.get(key).step) prefixes.set(key, hit);
                    }
                }
            }
        }
    }
    return prefixes;
}

export function scan({ root = PROJECT_ROOT, files = DEFAULT_FILES, cache = {}, queue = null } = {}) {
    const start = performance.now();
    if (files.some(file => PILOT_EXCLUDED_FILES.has(file))) throw new Error('pilot excludes do.c, timeout.c and apply.c to avoid the three denied investigations');
    const c = listCFiles(join(root, 'nethack-c/upstream')).flatMap(file => cUnits(readFileSync(file.path, 'utf8'), file.path));
    const modules = new Map(filesUnder(join(root, 'js'), '.js').map(path => [path, jsUnits(readFileSync(path, 'utf8'), path)]));
    const js = [...modules.values()].flatMap(m => m.units);
    const strings = [...modules.values()].flatMap(m => m.strings).join('\n');
    const sourceHash = diagnosticSourceHash(root);
    const names = new Set(c.map(u => u.name));
    const commands = extcmdlist.filter(row => !(row.flags & (WIZMODECMD | CMD_NOT_AVAILABLE | INTERNALCMD)));
    const paths = commandPaths(c, commands);
    const prefixes = recordingPrefixes(root, files);
    const repairPath = join(root, 'trial-monitor/repairs.json');
    const repairs = existsSync(repairPath) ? json(repairPath).repairs : [];
    const goalsPath = join(root, 'GOALS.json');
    const goals = existsSync(goalsPath) ? json(goalsPath).goals.filter(g => !['complete', 'closed', 'superseded', 'parked'].includes(g.status)) : [];
    const signals = [];
    for (const unit of c.filter(u => files.includes(basename(u.path)))) {
        const matches = js.filter(j => j.name === unit.name);
        const counterpart = matches.find(j => basename(j.path) === basename(unit.path, '.c') + '.js')
            ?? (matches.length === 1 ? matches[0] : null);
        const common = { cFile: basename(unit.path), function: unit.name,
            c: `${relative(root, unit.path)}:${unit.line}`,
            js: counterpart ? `${relative(root, counterpart.path)}:${counterpart.line}` : null,
            commandPath: paths.get(unit.name) ?? null,
            prefix: prefixes.get(`${basename(unit.path)}:${unit.name}`) ?? null,
            repairOverlap: repairs.filter(r => r.evidence?.source?.some(p => p.split(':')[0] === relative(root, counterpart?.path ?? unit.path))).map(r => r.id),
            assignedOverlap: goals.filter(g => g.cFile === basename(unit.path) || JSON.stringify(g.source ?? g.scope ?? {}).includes(unit.name)).map(g => g.id),
            queueOverlap: (queue?.sessions ?? []).filter(s => s.owner?.function === unit.name || s.investigation?.result?.source?.functions?.includes(unit.name)).map(s => s.session) };
        const add = signal => {
            const id = `${common.cFile}:${unit.name}:${signal.kind}:${signal.target ?? signal.line}`;
            const full = { id, ...common, ...signal };
            const review = cachedReview(full, sourceHash, cache);
            signals.push({ ...full, review, score: (common.commandPath ? 30 - common.commandPath.length * 2 : -20)
                + (common.prefix ? 8 : 0) + (signal.kind === 'message' ? 12 : 0)
                - (signal.conditions?.some(condition => /^if 0\b/u.test(condition)) ? 100 : 0)
                - (signal.unresolvedSameName ? 10 : 0)
                - (common.assignedOverlap.length || common.queueOverlap.length ? 50 : 0) - (review ? 100 : 0) });
        };
        for (const message of unit.messages) {
            if (!message.pieces.some(piece => strings.includes(piece)))
                add({ kind: 'message', line: message.line, message: message.literal, api: message.api, conditions: message.conditions });
        }
        if (!counterpart) continue;
        const reachable = reachableJs(counterpart, modules);
        const emitted = new Set();
        for (const call of unit.calls) {
            if (!names.has(call.name) || MESSAGE.test(call.name) || call.name === unit.name || reachable.has(call.name) || emitted.has(call.name)) continue;
            emitted.add(call.name);
            add({ kind: 'edge', target: call.name, line: call.line, conditions: call.conditions,
                unresolvedSameName: counterpart.calls.some(j => j.name === call.name || j.name.endsWith(`.${call.name}`)),
                explicitStub: counterpart.calls.some(j => typeof j.stub === 'string' && j.stub.split(/\s+/u).includes(call.name)) });
        }
        for (const call of counterpart.calls) {
            const callee = resolveCall(counterpart.path, call.name, modules, new Set(), counterpart.imports, counterpart, call.offset);
            if (call.bare && callee?.async)
                add({ kind: 'async', target: call.name, line: call.line });
        }
    }
    return { schema: 1, measuredAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        sourceHash, files, inventory: { c: c.length, js: js.length, commandRoots: commands.length },
        overlapEvidence: { queueSupplied: Boolean(queue), queueStatus: queue?.status ?? 'not-supplied',
            queueBlockers: queue?.blockers?.length ?? null, activeGoals: goals.length, repairRegisterAsOf: existsSync(repairPath) ? json(repairPath).asOf : null,
            liveAssignments: 'Unavailable in this fresh session; tracked records and optional saved queue only.' },
        exclusions: ['buried-zombie behavior (all do.c warnings excluded)', 'unpaid-glob shrink (all timeout.c warnings excluded)', 'figurine planning/global newsym (all apply.c warnings excluded)', 'EXACT_NAME already repaired'],
        limitations: ['Lexical C graph includes inactive macros and infeasible paths.', 'JS function declarations only; callbacks, dynamic dispatch and shadowed names require review.',
            'A matching message or helper edge does not prove equivalent branching.', 'Recording prefixes are C-only until replayed.', 'Repair overlaps are file-level, not proof of duplication.',
            'Queue is supplied evidence only; no fresh aggregate scan is launched.'],
        wallMs: performance.now() - start, signals: signals.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.includes('--help')) console.log('node scripts/structural-signals.mjs [--files a.c,b.c] [--cache reviews.json] [--queue saved-queue.json] [--output report.json]');
    else {
        const options = {};
        for (let i = 0; i < args.length; i += 2) {
            if (!['--files', '--cache', '--queue', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('invalid arguments; use --help');
            options[args[i].slice(2)] = args[i + 1];
        }
        const report = scan({ files: options.files?.split(',') ?? DEFAULT_FILES,
            cache: options.cache ? json(options.cache) : {}, queue: options.queue ? json(options.queue) : null });
        const output = JSON.stringify(report, null, 2) + '\n';
        if (options.output) writeFileSync(options.output, output); else process.stdout.write(output);
    }
}
