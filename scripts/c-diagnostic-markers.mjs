#!/usr/bin/env node

// Finds C diagnostics that a ported function drops without a trace.
//
// AGENTS.md, "Port whole source units and wire their callers", rule 3: where
// a ported function reaches C's pline.c impossible() or end.c panic(), the
// port makes the call, or, when the JS caller cannot wait for the async
// js/pline.js impossible() or js/end.js panic(), records the gap with
// note_unported('pline.c impossible') or note_unported('end.c panic') at the
// matching branch. A sync caller may instead throw for a panic(), listed in
// scripts/throw-site-list.json with class "panic" and the C line in "c".
//
// C side: each impossible() or panic() call in the preprocessed sources
// (scripts/c-message-coverage.mjs) whose fixed text the port lacks: a call
// is missing when one of its checked fragments appears nowhere in js/ and
// scripts/c-message-exemptions.mjs does not exempt it. A call with no
// checked fragment, such as impossible("%s", buf), cannot be judged by text
// and is not counted.
//
// JS side: the functions named like the C function, or like it with a
// `_steps` suffix, in a js/ file named for the C file (`hack.js`,
// `hack_*.js`), or in any file when none there has the name. Each
// note_unported() call in such a function, nested functions included, whose
// label starts with 'pline.c impossible' or 'end.c panic' is a marker.
//
// A C function's deficit is its missing calls, less those that a listed
// panic throw stands for, less its markers; it is counted only when js/ has
// a function for it. scripts/c-diagnostic-markers.test.mjs pins each
// remaining deficit with its reason.
//
//   node scripts/c-diagnostic-markers.mjs     print each deficit as JSON

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';

import {
    FUNCTION_NODES,
    MIN_FRAGMENT_LENGTH,
    MIN_LITERAL_LENGTH,
    children,
    collectJsStrings,
    extractMessageCalls,
    longestFragment,
    tokenizeMessageSources,
} from './c-message-coverage.mjs';
import { messageExemption } from './c-message-exemptions.mjs';
import { PROJECT_ROOT, requireCompiler } from './recorder-headers.mjs';

const JS_DIR = join(PROJECT_ROOT, 'js');
// The scorer replaces these files with its own copies.
const FROZEN_JS = new Set(['isaac64.js', 'terminal.js', 'storage.js']);
export const MARKER_LABEL = /^(?:pline\.c impossible|end\.c panic)\b/u;

// Each impossible() or panic() call in the C sources with a checked
// fragment, as { file, function, line, callee, fragments, missing }.
// `corpus` is collectJsStrings(); `exempt(entry)` is messageExemption().
export function cDiagnosticSites(sources, corpus, exempt = messageExemption) {
    const sites = [];
    for (const { source, tokens } of sources) {
        for (const call of extractMessageCalls(tokens, source)) {
            if (call.kind !== 'diagnostic') continue;
            const fragments = call.literals
                .filter((l) => l.text.length >= MIN_LITERAL_LENGTH)
                .map((l) => longestFragment(l.text))
                .filter((f) => f.length >= MIN_FRAGMENT_LENGTH);
            if (fragments.length === 0) continue;
            const fn = call.function ?? '(file scope)';
            const missing = fragments.some((fragment) => !corpus.includes(fragment)
                && !exempt({ file: source, function: fn, fragment }));
            sites.push({ file: source, function: fn, line: call.line, callee: call.callee,
                fragments, missing });
        }
    }
    return sites;
}

function functionName(node, parent) {
    if (node.id?.name) return node.id.name;
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
    if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition')
        && parent.key.type === 'Identifier') return parent.key.name;
    return null;
}

function labelOf(arg) {
    if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value;
    if (arg?.type === 'TemplateLiteral') return arg.quasis[0].value.cooked ?? '';
    return null;
}

// Each named function in one JS file, as { file, name, line, markers }:
// `markers` counts the diagnostic note_unported() calls inside it,
// including those in nested functions.
export function jsFunctionMarkers(file, source) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    const found = [];
    const visit = (node, parent, stack) => {
        if (FUNCTION_NODES.has(node.type)) {
            const name = functionName(node, parent);
            const entry = { file, name, line: node.loc.start.line, markers: 0 };
            if (name) found.push(entry);
            stack = [...stack, entry];
        }
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier'
            && node.callee.name === 'note_unported'
            && MARKER_LABEL.test(labelOf(node.arguments[0]) ?? '')) {
            for (const entry of stack) entry.markers++;
        }
        for (const child of children(node)) visit(child, node, stack);
    };
    visit(ast, null, []);
    return found;
}

export function readJsFunctions(jsDir = JS_DIR) {
    return readdirSync(jsDir).filter((name) => name.endsWith('.js') && !FROZEN_JS.has(name))
        .sort().flatMap((file) => jsFunctionMarkers(file, readFileSync(join(jsDir, file), 'utf8')));
}

// The JS functions that port C function `name` of C file `cFile`.
function portsOf(cFile, name, byName) {
    const all = [...(byName.get(name) ?? []), ...(byName.get(`${name}_steps`) ?? [])];
    const stem = cFile.split('/').pop().replace(/\.c$/u, '');
    const own = all.filter((f) => f.file === `${stem}.js` || f.file.startsWith(`${stem}_`));
    return own.length > 0 ? own : all;
}

// The C lines that a listed panic throw stands for, as 'src/x.c:123'.
export function panicThrowLines(list) {
    return new Set(Object.values(list.entries)
        .filter((entry) => entry.class === 'panic' && entry.c).map((entry) => entry.c));
}

// Each ported C function with a deficit, as { key, file, function, missing,
// markers, deficit, js, lines }; `key` is '<C path> <function>'.
export function diagnosticDeficits(sites, jsFunctions, thrownPanics) {
    const byName = new Map();
    for (const f of jsFunctions) {
        if (!byName.has(f.name)) byName.set(f.name, []);
        byName.get(f.name).push(f);
    }
    const groups = new Map();
    for (const site of sites) {
        if (!site.missing) continue;
        if (site.callee === 'panic' && thrownPanics.has(`${site.file}:${site.line}`)) continue;
        const key = `${site.file} ${site.function}`;
        if (!groups.has(key)) groups.set(key, { key, file: site.file, function: site.function, lines: [] });
        groups.get(key).lines.push(site.line);
    }
    const deficits = [];
    for (const group of groups.values()) {
        const ports = portsOf(group.file, group.function, byName);
        if (ports.length === 0) continue;
        const markers = ports.reduce((n, f) => n + f.markers, 0);
        const deficit = group.lines.length - markers;
        if (deficit <= 0) continue;
        deficits.push({ ...group, missing: group.lines.length, markers, deficit,
            js: ports.map((f) => `js/${f.file}:${f.line}`) });
    }
    return deficits;
}

export async function scanDeficits({ compiler, jobs = 2 } = {}) {
    const sources = await tokenizeMessageSources({ compiler, jobs });
    const sites = cDiagnosticSites(sources, collectJsStrings());
    const list = JSON.parse(readFileSync(join(PROJECT_ROOT, 'scripts', 'throw-site-list.json'), 'utf8'));
    return { sites, deficits: diagnosticDeficits(sites, readJsFunctions(), panicThrowLines(list)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const jobsArg = process.argv.find((a) => a.startsWith('--jobs='));
    const { deficits } = await scanDeficits({
        compiler: requireCompiler('the scan needs the C preprocessor'),
        jobs: jobsArg ? Number(jobsArg.slice(7)) : 2,
    });
    process.stdout.write(`${JSON.stringify(deficits, null, 1)}\n`);
}
