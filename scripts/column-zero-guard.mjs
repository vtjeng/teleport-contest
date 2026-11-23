// Compares, for each C function that draws a map square, the tests it makes
// of that square's column against zero or isok() with those the same-named
// function under js/ makes. display.c newsym() reports a column-0 square
// through impossible() (928-936), so a guard the port adds hides a report C
// prints, and a guard it drops prints one C does not.
//
// A drawing call is a call of one of DRAW_CALLS whose first argument is a
// column. Its guard tests are the places the function compares an expression
// with the same last member name (`mx` for `mtmp->mx` and `mon.mx`) with 0 or
// 1, tests it for truth, or passes it to isok(). Only the counts are compared.
//
// Usage: node scripts/column-zero-guard.mjs [--list]
// Prints the tally, and with --list every function whose guard counts
// differ. scripts/column-zero-guard.test.mjs holds the reviewed differences.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const C_DIR = join(ROOT, 'nethack-c', 'upstream', 'src');
const JS_DIR = join(ROOT, 'js');

// display.c functions whose first two arguments are a map square.
const DRAW_CALLS = [
    'newsym', 'newsym_force', 'map_background', 'map_location',
    'map_invisible', 'unmap_invisible', 'unmap_object', 'show_glyph',
    'feel_location', 'feel_newsym', 'display_monster',
];
// The spellings the port gives the same calls.
const JS_DRAW_SUFFIXES = ['', '_steps', '_async', '_cell', '_memory_only'];

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
        functions.push({ name: match[1], body: source.slice(match.index, end) });
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

const drawCall = new RegExp(
    `\\b(?:${DRAW_CALLS.join('|')})(?:${JS_DRAW_SUFFIXES.join('|')})\\s*\\(\\s*`
    + '([A-Za-z_$][\\w$.>?\\-\\[\\]]*)\\s*,', 'gu');

// The last member name of a column expression: `mx` for `mtmp->mx`.
const member = (expression) => expression.match(/([A-Za-z_$][\w$]*)\]?$/u)?.[1];

// The last member names of the columns `body` draws at.
export function columns(body) {
    const members = new Set();
    for (const match of body.matchAll(drawCall)) {
        const name = member(match[1]);
        if (name) members.add(name);
    }
    return members;
}

// The number of guard tests `body` makes of the columns called `members`.
export function guardTests(body, members) {
    let tests = 0;
    for (const name of members) {
        const column = `[\\w$.>?\\-\\[\\]]*\\b${name}\\b`;
        const patterns = [
            // x > 0, x != 0, x == 0, x >= 1, x < 1 and JS's !== and ===.
            `${column}\\s*(?:[<>]=?|[!=]==?)\\s*[01]\\b`,
            // isok(x, y)
            `\\bisok\\s*\\(\\s*${column}\\s*,`,
            // if (x), if (!x), ... && x), || !x ||
            `(?:\\(|&&|\\|\\|)\\s*!?${column}\\s*(?=\\)|&&|\\|\\|)`,
        ];
        for (const pattern of patterns)
            tests += [...body.matchAll(new RegExp(pattern, 'gu'))].length;
    }
    return tests;
}

export function analyse() {
    const jsBodies = new Map();
    for (const file of readdirSync(JS_DIR).filter((n) => n.endsWith('.js')).sort()) {
        const source = stripComments(readFileSync(join(JS_DIR, file), 'utf8'));
        for (const { name, body } of jsFunctions(source)) {
            if (!jsBodies.has(name)) jsBodies.set(name, []);
            jsBodies.get(name).push(body);
        }
    }
    const result = {
        cDraws: 0, functions: 0, same: 0, differing: new Map(), unported: [],
    };
    for (const file of readdirSync(C_DIR).filter((n) => n.endsWith('.c')).sort()) {
        const source = stripComments(readFileSync(join(C_DIR, file), 'utf8'));
        for (const fn of cFunctions(source)) {
            // The port often draws through an injected alias, so the JS
            // function is tested for the C function's column names as well
            // as its own.
            const cColumns = columns(fn.body);
            const draws = [...fn.body.matchAll(drawCall)].length;
            if (!draws) continue;
            result.functions++;
            result.cDraws += draws;
            const key = `${file} ${fn.name}`;
            const bodies = JS_SUFFIXES.flatMap(
                (suffix) => jsBodies.get(fn.name + suffix) ?? []);
            if (!bodies.length) {
                result.unported.push(key);
                continue;
            }
            const js = bodies.join('\n');
            const members = new Set([...cColumns, ...columns(js)]);
            const counts = {
                c: guardTests(fn.body, members), js: guardTests(js, members),
            };
            if (counts.c === counts.js) result.same++;
            else result.differing.set(key, counts);
        }
    }
    return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const result = analyse();
    if (process.argv.includes('--list')) {
        for (const [key, { c, js }] of result.differing) {
            console.log(`DIFF ${key}: C ${c} tests, JS ${js} tests`);
        }
        for (const key of result.unported) console.log(`UNPORTED ${key}`);
    }
    console.log(JSON.stringify({
        cDraws: result.cDraws,
        functions: result.functions,
        same: result.same,
        differing: result.differing.size,
        unported: result.unported.length,
    }));
}
