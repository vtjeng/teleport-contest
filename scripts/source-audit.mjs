#!/usr/bin/env node
// Corpus-wide source audit. Reuses the inventory and lexical/AST extraction;
// classifications are reviewed source evidence, never automatic defect claims.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT, parseCFunctions } from './c-functions.mjs';
import { cTokens, cUnits, cGuards, jsUnits, resolveCall, diagnosticSourceHash, hash } from './structural-signals.mjs';
import { extcmdlist, CMD_NOT_AVAILABLE, INTERNALCMD, WIZMODECMD } from '../js/extcmdlist_data.js';

export const EXCLUDED_FILES = ['do.c', 'timeout.c', 'apply.c'];
export const EXCLUDED_SYMBOLS = ['newsym'];
export const PRINT_APIS = {
    pline: 0, pline1: 0, pline_1: 0, pline_The: 0, pline_mon: 1, pline_dir: 1, pline_xy: 2,
    custompline: 1, urgent_pline: 0, Norep: 0, You: 0, You1: 0, Your: 0, Your1: 0,
    You_feel: 0, You_cant: 0, You_hear: 0, You_hear1: 0, You_see: 0, There: 0,
    verbalize: 0, verbalize1: 0, putstr: 2, putmixed: 2, tty_putstr: 2, putmesg: 0,
    raw_printf: 0, printf: 0, fprintf: 1, panic: 0, impossible: 0,
    debugpline0: 0, debugpline1: 0, debugpline2: 0, debugpline3: 0, debugpline4: 0,
    raw_print: 0, raw_print_bold: 0, Fprintf: 1, vpline: 0, vraw_printf: 0,
    dump_forward_putstr: 2, message_menu: 2, genl_message_menu: 2,
    livelog_printf: 1, config_error_add: 0,
};
const DIAGNOSTIC = /^(?:debugpline\d|panic|impossible|printf|fprintf|Fprintf|raw_printf|vraw_printf|raw_print|raw_print_bold|livelog_printf|config_error_add)$/u;
export const NON_GAMEPLAY_FILES = ['alloc.c', 'date.c', 'decl.c', 'dlb.c', 'files.c', 'hacklib.c',
    'nhlan.c', 'options.c', 'optionsdata.c', 'restore.c', 'save.c', 'sys.c', 'version.c', 'windows.c',
    'symbols.c', 'drawing.c', 'pline.c', 'dumplog.c', 'panic.c', 'rect.c', 'isaac64.c'];
const RNG = /^(?:rn2|rnd|rn1|rnl|d|rne|rnz|random|rn2_on_display_rng)$/u;
const FORMAT = /%(?:\d+\$)?[-+ #0']*(?:\d+|\*(?:\d+\$)?)?(?:\.(?:\d+|\*(?:\d+\$)?))?[hlLjzt]*[a-zA-Z%]/gu;
const VERDICTS = ['needs-investigation', 'confirmed-missing-behavior', 'alternate-implementation', 'unreachable', 'already-fixed'];
const contextLines = new Map();
const loadedToolHash = hash(readFileSync(fileURLToPath(import.meta.url)));
const normalize = value => value.replace(/\s+/gu, ' ').trim().toLowerCase();
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function filesUnder(path, suffix) {
    if (!existsSync(path)) return [];
    return readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
        if (entry.name === '.git') return [];
        const file = join(path, entry.name);
        return entry.isDirectory() ? filesUnder(file, suffix) : file.endsWith(suffix) ? [file] : [];
    });
}

export function decodeCString(text) {
    return text.slice(1, -1).replace(/\\(?:\r?\n|x[\da-fA-F]+|[0-7]{1,3}|.)/gu, escape => {
        const value = escape.slice(1);
        if (/^\r?\n$/u.test(value)) return '';
        if (/^x/u.test(value)) return String.fromCodePoint(parseInt(value.slice(1), 16) % 0x110000);
        if (/^[0-7]/u.test(value)) return String.fromCodePoint(parseInt(value, 8));
        return ({ n: '\n', r: '\r', t: '\t', a: '\x07', b: '\b', f: '\f', v: '\v' })[value] ?? value;
    });
}
export function longestFixed(text) {
    // %% is a literal percent, not a substitution boundary.
    const pieces = text.replace(/%%/gu, '\u0001').split(FORMAT).map(s => s.replace(/\u0001/gu, '%').trim());
    return pieces.sort((a, b) => b.length - a.length)[0];
}
function callArguments(tokens, open) {
    const args = [[]]; let depth = 0;
    for (let i = open + 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.text === ')' && depth === 0) return { args, end: i };
        if (['(', '[', '{'].includes(t.text)) depth++;
        if ([')', ']', '}'].includes(t.text)) depth--;
        if (t.text === ',' && depth === 0) args.push([]);
        else args.at(-1).push(t);
    }
    return null;
}
function context(source, at, end = at) {
    if (!contextLines.has(source)) contextLines.set(source, source.split('\n'));
    const lines = contextLines.get(source);
    return { startLine: Math.max(1, at - 3), endLine: Math.min(lines.length, end + 2),
        text: lines.slice(Math.max(0, at - 4), Math.min(lines.length, end + 2)).join('\n') };
}

export function extractMessages(source, path, units = [], apis = PRINT_APIS) {
    const tokens = cTokens(source), guards = cGuards(source), messages = [], calls = [];
    for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i], formatIndex = apis[t.text];
        if (formatIndex === undefined || tokens[i + 1].text !== '(') continue;
        const owner = units.find(u => t.offset > u.startOffset && t.offset < u.endOffset);
        if (EXCLUDED_SYMBOLS.includes(owner?.name)) continue;
        const parsed = callArguments(tokens, i + 1);
        if (!parsed) { calls.push({ api: t.text, line: t.line, status: 'unclosed-call' }); continue; }
        // Prototypes/definitions have no string args and are not print sites.
        if (!owner && [';', '{'].includes(tokens[parsed.end + 1]?.text)
            && !parsed.args.some(a => a.some(s => s.text.startsWith('"')))) continue;
        const literals = [];
        for (const arg of parsed.args.slice(formatIndex)) {
            for (let j = 0; j < arg.length; j++) {
                if (!arg[j].text.startsWith('"')) continue;
                let literal = '', last = j;
                while (arg[last]?.text.startsWith('"')) literal += decodeCString(arg[last++].text);
                literals.push({ literal, line: arg[j].line, endLine: arg[last - 1].line });
                j = last - 1;
            }
        }
        const call = { api: t.text, line: t.line, owner: owner?.name ?? null,
            status: literals.length ? 'literal-arguments' : 'variable-or-centralized-format',
            formatIsLiteral: parsed.args[formatIndex]?.[0]?.text.startsWith('"') ?? false };
        calls.push(call);
        for (const literal of literals) {
            if (literal.literal.length < 14) continue;
            messages.push({ ...literal, api: t.text, callLine: t.line, path, function: owner?.name ?? '<file-scope>',
                fragment: longestFixed(literal.literal), conditions: guards.get(t.line) ?? [],
                context: context(source, t.line, tokens[parsed.end].line) });
        }
    }
    return { messages, calls };
}

export function messageMatch(message, jsRaw, jsStrings) {
    const fixed = message.fragment;
    if (!fixed.length) return { status: 'no-fixed-fragment', raw: false, decoded: false };
    const raw = jsRaw.includes(fixed), decoded = (Array.isArray(jsStrings) ? jsStrings.join('\n') : jsStrings).includes(normalize(fixed));
    return { status: decoded ? 'decoded-literal-hit' : raw ? 'raw-only-hit' : 'absent', raw, decoded };
}

function cKey(unit, root) { return `${relative(join(root, 'nethack-c/upstream'), unit.path)}:${unit.name}`; }
function jsKey(unit, root) { return `${relative(root, unit.path)}:${unit.name}`; }
export function sameFunction(a, b) {
    return Boolean(a && b && a.path === b.path && a.name === b.name && a.startOffset === b.startOffset);
}
export function alignedHits(target, closure, counterpart) {
    const expected = counterpart(target);
    return closure.found.filter(hit => sameFunction(hit.target, expected));
}
export function validateMappings(mappings, excluded) {
    for (const [from, to] of [...Object.entries(mappings.functions ?? {}), ...Object.entries(mappings.renames ?? {})]) {
        if ([from, to].some(value => typeof value !== 'string' || excluded.has(value.split(':').at(-1))
            || EXCLUDED_FILES.includes(basename(value.split(':')[0]).replace(/\.js$/u, '.c'))))
            throw new Error('mapping uses an excluded endpoint');
    }
}
// Cheap revalidation for a pipeline consuming a previously reviewed backlog.
// Uses raw bytes (some legacy platform files are not UTF-8), exactly as scan.
export function auditIdentity({ root = PROJECT_ROOT, mappings = {} } = {}) {
    const cRoot = join(root, 'nethack-c/upstream');
    return hash(JSON.stringify([diagnosticSourceHash(root), mappings, hash(readFileSync(fileURLToPath(import.meta.url))),
        filesUnder(cRoot, '.c').filter(path => !EXCLUDED_FILES.includes(basename(path)))
            .map(path => [relative(cRoot, path), hash(readFileSync(path))])]));
}
export function resolveC(owner, name, byName) {
    const possible = byName.get(name) ?? [];
    const local = possible.filter(u => u.path === owner.path);
    return local.length === 1 ? local[0] : possible.length === 1 ? possible[0] : null;
}
function bfs(roots, graph) {
    const paths = new Map(), queue = roots.map(root => [root, [root]]);
    for (let i = 0; i < queue.length; i++) {
        const [key, path] = queue[i];
        if (paths.has(key)) continue;
        paths.set(key, path);
        for (const next of graph.get(key) ?? []) if (!paths.has(next)) queue.push([next, [...path, next]]);
    }
    return paths;
}
function jsClosure(unit, modules, excluded, depth = 3) {
    const found = new Map(), unresolved = [], queue = [[unit, 0]], seen = new Set();
    for (let i = 0; i < queue.length; i++) {
        const [owner, distance] = queue[i], key = `${owner.path}:${owner.name}:${owner.startOffset}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const call of owner.calls) {
            if (excluded.has(call.name.split('.').at(-1))) continue;
            const target = resolveCall(owner.path, call.name, modules, new Set(), owner.imports, owner, call.offset);
            if (!target) { if (distance === 0) unresolved.push(call); continue; }
            if (excluded.has(target.name)) continue;
            const tk = `${target.path}:${target.name}:${target.startOffset}`;
            if (!found.has(tk)) found.set(tk, { target, distance: distance + 1, call, owner });
            if (distance < depth) queue.push([target, distance + 1]);
        }
    }
    return { found: [...found.values()], unresolved };
}

export function mergeBacklog(items, sourceHash, previous = { entries: [] }) {
    const old = new Map(previous.entries.map(e => [e.id, e]));
    const entries = items.map(item => {
        const prior = old.get(item.id), evidenceKey = hash(JSON.stringify([sourceHash, item.id, item.sites, item.details]));
        old.delete(item.id);
        const reviews = prior?.reviews ?? [];
        const current = reviews.filter(r => r.evidenceKey === evidenceKey).at(-1);
        return { ...item, evidenceKey, observed: true, classification: current?.classification ?? 'needs-investigation',
            replayStatus: current?.replay?.status ?? 'unverified', reviews,
            reviewState: current ? 'current' : reviews.length ? 'stale-source-or-tool-change' : 'unreviewed' };
    });
    for (const item of old.values()) entries.push({ ...item, observed: false, reviewState: 'not-observed-now',
        classification: 'needs-investigation', replayStatus: 'unverified' });
    return { version: 1, sourceHash, entries };
}
export function applyDecisions(backlog, decisions) {
    const next = structuredClone(backlog), byId = new Map(next.entries.map(e => [e.id, e]));
    for (const decision of decisions) {
        const item = byId.get(decision.id);
        if (!item?.observed || item.evidenceKey !== decision.evidenceKey) throw new Error('stale or absent audit decision');
        if (!VERDICTS.includes(decision.classification) || !decision.rationale || !decision.sourceRefs?.length)
            throw new Error('classification requires rationale and source references');
        if (decision.classification === 'confirmed-missing-behavior'
            && (!decision.sourceRefs.some(s => s.startsWith('nethack-c/')) || !decision.sourceRefs.some(s => s.startsWith('js/'))))
            throw new Error('source-confirmed omission needs C and JS references');
        if (decision.replay && (decision.replay.status !== 'reviewer-reported'
            || !decision.replay.recipe || !decision.replay.result || !decision.replay.control))
            throw new Error('source audit cannot verify replay receipts: use reviewer-reported with recipe, result and control links');
        item.reviews.push({ ...decision, reviewedAt: decision.reviewedAt ?? new Date().toISOString() });
        item.classification = decision.classification; item.reviewState = 'current';
        item.replayStatus = decision.replay?.status ?? 'unverified';
    }
    return next;
}

export function audit({ root = PROJECT_ROOT, previous, mappings = {}, queue = null } = {}) {
    contextLines.clear();
    const start = performance.now(), cRoot = join(root, 'nethack-c/upstream');
    const initialSourceHash = diagnosticSourceHash(root);
    const allC = filesUnder(cRoot, '.c'), cSources = new Map(), cBytes = new Map(), units = [], messages = [], printCalls = [];
    const excludedNames = new Set(EXCLUDED_SYMBOLS), excludedFiles = [];
    for (const path of allC) {
        const text = readFileSync(path, 'utf8');
        if (EXCLUDED_FILES.includes(basename(path))) {
            excludedFiles.push(relative(cRoot, path));
            parseCFunctions(text).forEach(u => excludedNames.add(u.name));
            continue; // names only, for excluding cross-file paths too; no behavioral inspection
        }
        cSources.set(path, text);
        cBytes.set(path, hash(readFileSync(path)));
        const owned = cUnits(text, path);
        units.push(...owned.filter(u => !EXCLUDED_SYMBOLS.includes(u.name)));
        const extracted = extractMessages(text, path, owned);
        messages.push(...extracted.messages); printCalls.push(...extracted.calls.map(c => ({ ...c, file: relative(cRoot, path) })));
    }
    validateMappings(mappings, excludedNames);
    const jsSources = new Map(filesUnder(join(root, 'js'), '.js').map(path => [path, readFileSync(path, 'utf8')]));
    const modules = new Map([...jsSources].map(([path, text]) => [path, jsUnits(text, path)]));
    const js = [...modules.values()].flatMap(m => m.units), jsRaw = [...jsSources.values()].join('\n');
    const jsStrings = [...modules.values()].flatMap(m => m.strings).join('\n');
    const sourceHash = hash(JSON.stringify([initialSourceHash, mappings, loadedToolHash,
        [...cBytes].map(([path, digest]) => [relative(cRoot, path), digest])]));
    // All platform/outdated files count in literal coverage. The executable
    // graph uses the repository inventory's src + tty target, not alternate OS
    // definitions with the same global names.
    const graphUnits = units.filter(u => /^(?:src|win\/tty)\//u.test(relative(cRoot, u.path)));
    const byName = new Map();
    graphUnits.forEach(u => byName.set(u.name, [...(byName.get(u.name) ?? []), u]));
    const graph = new Map(), incoming = new Map();
    for (const unit of graphUnits) {
        const edges = new Set();
        for (const call of unit.calls) {
            if (excludedNames.has(call.name)) continue;
            const target = resolveC(unit, call.name, byName);
            if (target) edges.add(cKey(target, root));
        }
        graph.set(cKey(unit, root), edges);
        for (const key of edges) incoming.set(key, (incoming.get(key) ?? 0) + 1);
    }
    const regularCommands = extcmdlist.filter(e => !(e.flags & (CMD_NOT_AVAILABLE | INTERNALCMD | WIZMODECMD)));
    const rootNames = new Set(regularCommands.map(e => e.ef_funct));
    const commands = bfs(graphUnits.filter(u => rootNames.has(u.name)).map(u => cKey(u, root)), graph);
    const turn = bfs(graphUnits.filter(u => ['moveloop', 'moveloop_core'].includes(u.name)).map(u => cKey(u, root)), graph);
    const canon = name => mappings.renames?.[name] ?? name;
    const counterparts = new Map();
    const counterpart = unit => {
        const key = cKey(unit, root);
        if (counterparts.has(key)) return counterparts.get(key);
        const requested = mappings.functions?.[cKey(unit, root)];
        if (requested) {
            const matches = js.filter(j => j.moduleScope && !excludedNames.has(j.name) && jsKey(j, root) === requested);
            if (matches.length !== 1) throw new Error(`mapping does not select one eligible module function: ${requested}`);
            counterparts.set(key, matches[0]); return matches[0];
        }
        const same = js.filter(j => j.moduleScope && canon(j.name) === unit.name && !excludedNames.has(j.name));
        const result = same.find(j => basename(j.path, '.js') === basename(unit.path, '.c')) ?? (same.length === 1 ? same[0] : null);
        counterparts.set(key, result);
        return result;
    };
    const matchedMessages = messages.map(m => ({ ...m, path: relative(cRoot, m.path),
        fileCategory: !m.path.startsWith(join(cRoot, 'src') + '/') || NON_GAMEPLAY_FILES.includes(basename(m.path)) ? 'non-gameplay' : 'gameplay',
        apiCategory: DIAGNOSTIC.test(m.api) ? 'diagnostic' : 'message', ...messageMatch(m, jsRaw, jsStrings) }));
    const absentByOwner = new Map();
    for (const m of matchedMessages.filter(m => ['absent', 'raw-only-hit'].includes(m.status) && m.apiCategory === 'message')) {
        const key = `${m.path}:${m.function}`;
        absentByOwner.set(key, (absentByOwner.get(key) ?? 0) + 1);
    }
    const repairs = existsSync(join(root, 'trial-monitor/repairs.json')) ? readJson(join(root, 'trial-monitor/repairs.json')).repairs : [];
    const goals = existsSync(join(root, 'GOALS.json')) ? readJson(join(root, 'GOALS.json')).goals.filter(g => !['complete', 'closed', 'superseded', 'parked'].includes(g.status)) : [];
    const items = new Map(), edgeStats = {}, alignments = [], unmatched = [];
    const bump = key => { edgeStats[key] = (edgeStats[key] ?? 0) + 1; };
    const add = (owner, kind, target, site, details, confidence = 'lexical') => {
        const ownerKey = typeof owner === 'string' ? owner : cKey(owner, root);
        const id = `${kind}:${ownerKey}:${target}`, jsOwner = typeof owner === 'string' ? null : counterpart(owner);
        const sourceText = typeof owner === 'string' ? '' : cSources.get(owner.path).slice(owner.startOffset, owner.endOffset);
        const effects = typeof owner === 'string' ? {} : { rng: owner.calls.filter(c => RNG.test(c.name)).length,
            message: owner.calls.filter(c => Object.hasOwn(PRINT_APIS, c.name)).length,
            stateWriteHeuristic: /(?:\bu\.|\bsv[a-z]\.|->)\w+\s*(?:[+\-*/|&]?=|\+\+|--)/u.test(sourceText) };
        const commandPath = commands.get(ownerKey) ?? null, turnPath = turn.get(ownerKey) ?? null;
        const diagnostic = kind === 'message' ? DIAGNOSTIC.test(details.api) || details.fileCategory === 'non-gameplay'
            : /^(?:panic|paniclog|impossible|debugpline)/u.test(target);
        const rank = (commandPath ? Math.max(0, 40 - commandPath.length * 3) : 0)
            + (turnPath ? Math.max(0, 25 - turnPath.length * 2) : 0) + Math.min(incoming.get(ownerKey) ?? 0, 10)
            + Math.min(effects.rng ?? 0, 5) * 2 + Math.min(effects.message ?? 0, 5)
            + (effects.stateWriteHeuristic ? 4 : 0) + Math.min(absentByOwner.get(ownerKey) ?? 0, 5) * 8
            + (confidence === 'explicit-stub' ? 40 : kind === 'message' ? 15 : 0)
            - (diagnostic ? 70 : 0) - (confidence === 'adapter-or-extracted-helper' ? 30 : 0)
            - (site.conditions?.some(g => /^if 0\b/u.test(g)) ? 100 : 0);
        const old = items.get(id);
        if (old) { old.sites.push(site); return; }
        items.set(id, { id, kind, owner: ownerKey, target, confidence, rank, sites: [site], details,
            signals: { commandPath, turnPath, callers: incoming.get(ownerKey) ?? 0, effects,
                missingMessageOverlap: absentByOwner.get(ownerKey) ?? 0 },
            repairOverlap: repairs.filter(r => r.evidence?.source?.some(p => p.split(':')[0] === (jsOwner ? relative(root, jsOwner.path) : ''))).map(r => r.id),
            assignedOverlap: goals.filter(g => JSON.stringify(g.scope ?? g.source ?? {}).includes(ownerKey.split(':').at(-1))).map(g => g.id),
            queueOverlap: (queue?.sessions ?? []).filter(s => s.owner?.function === ownerKey.split(':').at(-1)
                || s.investigation?.result?.source?.functions?.includes(ownerKey.split(':').at(-1))).map(s => s.session) });
    };
    for (const m of matchedMessages.filter(m => ['absent', 'raw-only-hit'].includes(m.status))) {
        const owner = units.find(u => cKey(u, root) === `${m.path}:${m.function}`) ?? `${m.path}:${m.function}`;
        add(owner, 'message', hash(m.literal).slice(0, 16), { file: `nethack-c/upstream/${m.path}`, line: m.callLine,
            conditions: m.conditions, context: m.context }, { literal: m.literal, fragment: m.fragment, match: m.status,
            fileCategory: m.fileCategory, api: m.api }, m.status === 'raw-only-hit' ? 'raw-source-only' : 'literal-absent');
    }
    const closureCache = new Map(), unresolvedCalls = [];
    for (const owner of graphUnits) {
        if (excludedNames.has(owner.name)) continue;
        const targetJs = counterpart(owner);
        if (!targetJs) { unmatched.push({ c: cKey(owner, root), reason: 'no-unambiguous-JS-function' }); continue; }
        const closureKey = `${jsKey(targetJs, root)}:${targetJs.startOffset}`;
        if (!closureCache.has(closureKey)) closureCache.set(closureKey, jsClosure(targetJs, modules, excludedNames));
        const closure = closureCache.get(closureKey), closureByName = new Map();
        for (const h of closure.found) closureByName.set(canon(h.target.name), [...(closureByName.get(canon(h.target.name)) ?? []), h]);
        alignments.push({ c: cKey(owner, root), js: jsKey(targetJs, root) });
        const cTargets = new Map();
        for (const call of owner.calls) {
            if (excludedNames.has(call.name) || call.name === owner.name) continue;
            const resolved = resolveC(owner, call.name, byName);
            if (!resolved) { if (byName.has(call.name)) bump('ambiguous-C-target'); continue; }
            cTargets.set(call.name, resolved);
            const hits = alignedHits(resolved, closure, counterpart);
            const explicit = targetJs.calls.filter(c => typeof c.stub === 'string' && c.stub.split(/\s+/u).includes(call.name));
            const stubbed = hits.filter(h => h.target.calls.some(c => typeof c.stub === 'string'));
            const site = { file: relative(root, owner.path), line: call.line, conditions: call.conditions,
                context: context(cSources.get(owner.path), call.line),
                branchContext: context(cSources.get(owner.path), Math.max(owner.line, call.line - 16), call.line) };
            if (explicit.length || stubbed.length) {
                bump('C-to-JS-stub'); add(owner, 'edge-stub', call.name, site, { js: jsKey(targetJs, root),
                    stubSites: [...explicit.map(c => ({ file: relative(root, targetJs.path), line: c.line, text: c.stub,
                        context: context(jsSources.get(targetJs.path), Math.max(targetJs.line, c.line - 12), c.line) })),
                        ...stubbed.map(h => ({ file: relative(root, h.target.path), line: h.target.line, function: h.target.name }))],
                    stubScope: explicit.length ? 'caller-explicitly-omits-target' : 'callee-contains-a-stub-not-necessarily-on-this-path' },
                explicit.length && !hits.length ? 'explicit-stub' : 'callee-contains-stub');
            } else if (hits.length) bump(hits.some(h => h.distance === 1) ? 'matched-direct-or-rename' : 'matched-via-helper');
            else if (Object.hasOwn(PRINT_APIS, call.name) && !DIAGNOSTIC.test(call.name) && closureByName.has('pline')) {
                bump('message-wrapper-adapter'); // prefix/format equivalence still needs literal/source review
            }
            else {
                bump('C-only');
                const mapping = mappings.edges?.find(e => e.owner === cKey(owner, root) && e.target === call.name);
                const unresolved = closure.unresolved.filter(c => c.name.split('.').at(-1) === call.name);
                add(owner, 'edge-c-only', call.name, site, { js: jsKey(targetJs, root),
                    jsContext: context(jsSources.get(targetJs.path), targetJs.line, Math.min(targetJs.bodyEndLine, targetJs.line + 12)),
                    unresolvedCalls: unresolved, declaredAlternative: mapping ?? null }, mapping ? 'declared-alternative-needs-review' : unresolved.length ? 'unresolved-dynamic-call' : 'missing-resolved-edge');
            }
        }
        for (const hit of closure.found.filter(h => h.distance === 1)) {
            const name = canon(hit.target.name);
            if ([...cTargets.values()].some(c => sameFunction(counterpart(c), hit.target))
                || sameFunction(targetJs, hit.target)
                || !byName.has(name) && owner.calls.some(call => call.name === name)) continue;
            if (name === 'pline' && owner.calls.some(call => Object.hasOwn(PRINT_APIS, call.name) && !DIAGNOSTIC.test(call.name))) {
                bump('JS-message-wrapper-adapter'); continue;
            }
            const candidates = byName.get(name) ?? [];
            if (!candidates.length) {
                bump('JS-adapter-or-helper');
                add(owner, 'edge-js-helper', name, { file: relative(root, hit.owner.path), line: hit.call.line,
                    context: context(jsSources.get(hit.owner.path), hit.call.line) }, { jsTarget: jsKey(hit.target, root),
                    category: 'JS helper with no same-name C function; may inline C macros or adapted operations.' }, 'adapter-or-extracted-helper');
                continue;
            }
            bump('JS-only');
            add(owner, 'edge-js-only', name, { file: relative(root, hit.owner.path), line: hit.call.line,
                context: context(jsSources.get(hit.owner.path), hit.call.line) }, { c: cKey(owner, root),
                cContext: context(cSources.get(owner.path), owner.line, Math.min(owner.bodyEndLine, owner.line + 12)),
                jsTarget: jsKey(hit.target, root), cTargets: candidates.map(u => cKey(u, root)),
                warning: 'May be helper extraction, macro expansion or adapter; source review required.' });
        }
        edgeStats['unresolved-JS-direct-calls'] = (edgeStats['unresolved-JS-direct-calls'] ?? 0) + closure.unresolved.length;
        unresolvedCalls.push(...closure.unresolved.map(call => ({ owner: cKey(owner, root), js: closureKey, name: call.name, line: call.line,
            category: /^(?:Math|Object|Array|String|Number|JSON|Promise)\./u.test(call.name) ? 'builtin' : 'dynamic-or-unresolved' })));
    }
    const sorted = [...items.values()].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
    const count = (list, key) => list.reduce((s, item) => ({ ...s, [item[key]]: (s[item[key]] ?? 0) + 1 }), {});
    const wrapperCandidates = units.filter(u => !excludedNames.has(u.name)).flatMap(u => u.calls
        .filter(c => /pline|putstr|printf|verbal|message|^You|^Your|^There|raw_print/u.test(c.name)
            && !Object.hasOwn(PRINT_APIS, c.name) && !excludedNames.has(c.name))
        .map(c => ({ name: c.name, file: relative(cRoot, u.path), line: c.line })));
    const changed = { source: initialSourceHash !== diagnosticSourceHash(root),
        tool: loadedToolHash !== hash(readFileSync(fileURLToPath(import.meta.url))),
        files: [...cBytes].filter(([path, digest]) => digest !== hash(readFileSync(path))).map(([path]) => relative(cRoot, path)) };
    if (changed.source || changed.tool || changed.files.length)
        throw new Error(`source/tool/build changed during audit; refusing inconsistent provenance: ${JSON.stringify(changed)}`);
    const report = { version: 1, measuredAt: new Date().toISOString(), sourceHash,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        exclusions: { files: excludedFiles, symbols: EXCLUDED_SYMBOLS, crossFileTargets: [...excludedNames].sort(),
            reason: 'Conservative fixed whole-file/symbol exclusions; cross-file targets are excluded too. EXACT_NAME is not investigated.' },
        scope: { allCFiles: allC.length, eligibleCFiles: cSources.size, graphScope: 'src/ + win/tty/ (existing inventory target)', directories: count([...cSources.keys()].map(p => ({ directory: relative(cRoot, p).split('/')[0] })), 'directory'),
            printApis: PRINT_APIS, nonGameplayFiles: NON_GAMEPLAY_FILES, wrappers: 'Explicit registry checked against extern.h, hack.h, winprocs.h and lint.h; unresolved name candidates retained. Buffer formatting is not a print site.',
            literalRule: 'Every decoded literal argument of a recognized print call with length >=14; concatenate adjacent C literals, search its single longest fixed fragment globally.',
            comparisonLimits: 'Article exact wrapper/file list and implementation were not supplied; totals are not asserted equal to its historical denominator.' },
        totals: { cFunctions: units.length, jsFunctions: js.length, printCalls: printCalls.length, printCallKinds: count(printCalls, 'status'),
            graphFunctions: graphUnits.length,
            qualifyingLiteralOccurrences: matchedMessages.length, uniqueLiterals: new Set(matchedMessages.map(m => m.literal)).size,
            literalStartsOnPrintLine: matchedMessages.filter(m => m.line === m.callLine).length,
            literalStartsOnContinuationLine: matchedMessages.filter(m => m.line !== m.callLine).length,
            multilineLiterals: matchedMessages.filter(m => m.endLine > m.line).length,
            messageStatus: count(matchedMessages, 'status'), absentByFileCategory: count(matchedMessages.filter(m => m.status === 'absent'), 'fileCategory'),
            absentByApiCategory: count(matchedMessages.filter(m => m.status === 'absent'), 'apiCategory'),
            rawOnlyByFileCategory: count(matchedMessages.filter(m => m.status === 'raw-only-hit'), 'fileCategory'),
            rawSourceAbsent: matchedMessages.filter(m => m.fragment.length && !m.raw).length,
            messageApis: { total: matchedMessages.filter(m => m.apiCategory === 'message').length,
                absent: matchedMessages.filter(m => m.apiCategory === 'message' && m.status === 'absent').length,
                rawSourceAbsent: matchedMessages.filter(m => m.apiCategory === 'message' && m.fragment.length && !m.raw).length,
                rawOnly: matchedMessages.filter(m => m.apiCategory === 'message' && m.status === 'raw-only-hit').length,
                absentGameplayFiles: matchedMessages.filter(m => m.apiCategory === 'message' && m.status === 'absent' && m.fileCategory === 'gameplay').length },
            alignedFunctions: alignments.length, unmatchedFunctions: unmatched.length, edgeStats, auditItems: sorted.length, itemKinds: count(sorted, 'kind') },
        queue: { supplied: Boolean(queue), status: queue?.status ?? 'not-supplied', blockers: queue?.blockers?.length ?? null,
            liveAssignments: 'unavailable; no ownership clearance' },
        messages: matchedMessages, printCalls, wrapperCandidates, wrapperCandidateCounts: count(wrapperCandidates, 'name'),
        alignments, unresolvedCalls, unmatchedFunctions: unmatched, wallMs: performance.now() - start };
    return { report, backlog: mergeBacklog(sorted, sourceHash, previous) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [command, ...args] = process.argv.slice(2), opts = {};
    for (let i = 0; i < args.length; i += 2) {
        if (!['--out', '--previous', '--mappings', '--queue', '--backlog', '--decisions'].includes(args[i]) || !args[i + 1]) throw new Error('invalid arguments');
        opts[args[i].slice(2)] = args[i + 1];
    }
    if (command === 'scan') {
        if (!opts.out || existsSync(opts.out)) throw new Error('choose a new output directory');
        const result = audit({ previous: opts.previous ? readJson(opts.previous) : undefined,
            mappings: opts.mappings ? readJson(opts.mappings) : {}, queue: opts.queue ? readJson(opts.queue) : null });
        mkdirSync(opts.out, { recursive: true }); save(join(opts.out, 'report.json'), result.report); save(join(opts.out, 'backlog.json'), result.backlog);
        console.log(JSON.stringify({ output: opts.out, wallMs: result.report.wallMs, totals: result.report.totals }));
    } else if (command === 'classify') {
        if (!opts.out || !opts.backlog || !opts.decisions) throw new Error('classify needs --backlog --decisions --out');
        save(opts.out, applyDecisions(readJson(opts.backlog), readJson(opts.decisions)));
    } else console.log('source-audit.mjs scan --out NEW_DIR [--previous backlog.json] [--mappings map.json] [--queue saved.json]\nsource-audit.mjs classify --backlog backlog.json --decisions decisions.json --out NEW_FILE');
}
