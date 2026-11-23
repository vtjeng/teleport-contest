// Compares the visibility predicates each C function tests with those the
// same-named function under js/ tests, in order. minion.c demon_talk() tested
// canspotmon() where the port tested canseemon(); a recording finds such a
// swap only when the hero senses a monster without seeing it at that line.
//
// Usage: node scripts/visibility-predicate.mjs [--list]
// Prints the tally, and with --list every function whose sequences differ,
// every C function with no same-named JS function, and every C site outside
// a function body. scripts/visibility-predicate.test.mjs holds the reviewed
// differences.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const C_DIR = join(ROOT, 'nethack-c', 'upstream', 'src');
const JS_DIR = join(ROOT, 'js');

// display.h canspotmon(), canseemon(), sensemon() and mon_visible(), vision.h
// cansee() and couldsee(), and flags.verbose (C has no Verbose() macro).
const TOKEN = /\b(canspotmon|canseemon|sensemon|cansee|couldsee|mon_visible)\s*\(|\bflags\??\.(verbose)\b/gu;

// Names the port gives an injected predicate. A use counts as the predicate;
// a definition (`canSee: ...`, `canSee = ...`, `canSee ?? ...`) does not.
const JS_ALIASES = [
    [/\b(?:canSpotMonster|canSpotMon|canSpot|spotMonster|spotsMonster)\b(?!\s*[:=?])/gu, 'canspotmon('],
    [/\b(?:canSeeMonster|canSeeMon|seeMonster|seesMonster)\b(?!\s*[:=?])/gu, 'canseemon('],
    [/\b(?:canSee|canSeeLocation|canSeeAt)\b(?!\s*[:=?])/gu, 'cansee('],
    [/\bcouldSee\b(?!\s*[:=?])/gu, 'couldsee('],
];

// A JS function stands for C function `name` when it is called `name` or
// `name` with one of these suffixes.
const JS_SUFFIXES = ['', '_steps', '_core', '_runtime', '_impl'];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (text) => text.replace(/[^\n]/gu, ' '))
        .replace(/\/\/[^\n]*/gu, '');
}

// Function definitions as NetHack writes them: the name at the start of a
// line, the parameter list, and the opening brace on a line of its own.
function cFunctions(source) {
    const functions = [];
    const header = /^([A-Za-z_]\w*)\s*\([^;{}]*?\)\s*\n?\{/gmu;
    let match;
    while ((match = header.exec(source))) {
        let end = header.lastIndex;
        for (let depth = 1; end < source.length && depth; end++) {
            if (source[end] === '{') depth++;
            else if (source[end] === '}') depth--;
        }
        functions.push({ name: match[1], start: match.index, end });
        header.lastIndex = end;
    }
    return functions;
}

// Top-level function declarations; each body runs to the next declaration,
// so nested helpers and arrow functions count toward the enclosing one.
function jsFunctions(source) {
    const header = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gmu;
    const starts = [...source.matchAll(header)].map((m) => [m[1], m.index]);
    return starts.map(([name, start], index) => ({
        name,
        body: source.slice(start, starts[index + 1]?.[1] ?? source.length),
    }));
}

// The predicates `text` tests, in order, separated by spaces.
export const sequence = (text) => [...text.matchAll(TOKEN)]
    .map((match) => match[1] ?? match[2]).join(' ');

// JS source with comments removed and each use of an injected alias
// rewritten to the predicate it stands for.
export function normalizeJs(source) {
    let text = stripComments(source);
    for (const [alias, name] of JS_ALIASES) text = text.replace(alias, name);
    return text;
}

export function analyse() {
    const jsBodies = new Map();
    for (const file of readdirSync(JS_DIR).filter((n) => n.endsWith('.js')).sort()) {
        const source = normalizeJs(readFileSync(join(JS_DIR, file), 'utf8'));
        for (const { name, body } of jsFunctions(source)) {
            if (!jsBodies.has(name)) jsBodies.set(name, []);
            jsBodies.get(name).push(body);
        }
    }
    const result = {
        sites: 0, functions: 0, same: 0,
        differing: new Map(), unported: [], outside: [],
    };
    for (const file of readdirSync(C_DIR).filter((n) => n.endsWith('.c')).sort()) {
        const source = stripComments(readFileSync(join(C_DIR, file), 'utf8'));
        const functions = cFunctions(source);
        for (const match of source.matchAll(TOKEN)) {
            if (!functions.some((fn) => match.index >= fn.start && match.index < fn.end)) {
                const line = source.slice(0, match.index).split('\n').length;
                result.outside.push(`${file}:${line}`);
            }
        }
        for (const fn of functions) {
            const c = sequence(source.slice(fn.start, fn.end));
            if (!c) continue;
            result.functions++;
            result.sites += c.split(' ').length;
            const key = `${file} ${fn.name}`;
            const bodies = JS_SUFFIXES.flatMap(
                (suffix) => jsBodies.get(fn.name + suffix) ?? []);
            if (!bodies.length) {
                result.unported.push(key);
                continue;
            }
            const js = sequence(bodies.join('\n'));
            if (c === js) result.same++;
            else result.differing.set(key, { c, js });
        }
    }
    return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const result = analyse();
    if (process.argv.includes('--list')) {
        for (const [key, { c, js }] of result.differing)
            console.log(`DIFF ${key}\n  C:  ${c}\n  JS: ${js}`);
        for (const key of result.unported) console.log(`UNPORTED ${key}`);
        for (const site of result.outside) console.log(`OUTSIDE ${site}`);
    }
    console.log(JSON.stringify({
        sites: result.sites,
        functions: result.functions,
        same: result.same,
        differing: result.differing.size,
        unported: result.unported.length,
        outside: result.outside.length,
    }));
}
