// Compares, for each C function that draws a map square, the tests it makes
// of that square's column against zero or isok() with those the same-named
// function under js/ makes. display.c newsym() reports a column-0 square
// through impossible() (928-936), so a guard the port adds hides a report C
// prints, and a guard it drops prints one C does not.
//
// A drawing call is a call of one of DRAW_CALLS whose first argument is a
// column, or a call of one of STRUCT_DRAW_CALLS, which take an object, a trap
// or an engraving and draw at the square it records. Its guard tests are the places the function compares an expression
// with the same last member name (`mx` for `mtmp->mx` and `mon.mx`) with 0 or
// 1, tests it for truth, or passes it to isok(). Only the counts are compared.
// C that an `#if 0` leaves out is not scanned (skipDeadConditionals()).
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
// display.c functions that take a struct and draw at its square, with the
// member that holds the column: map_trap() (298) reads trap->tx,
// map_engraving() (315) ep->engr_x and map_object() (335) obj->ox.
const STRUCT_DRAW_CALLS = { map_object: 'ox', map_trap: 'tx', map_engraving: 'engr_x' };
// The spellings the port gives the same calls.
const JS_DRAW_SUFFIXES = ['', '_steps', '_async', '_cell', '_memory_only'];

// A JS function stands for C function `name` when it is called `name` or
// `name` with one of these suffixes.
const JS_SUFFIXES = ['', '_steps', '_core', '_runtime', '_impl'];
// C functions the port holds under another C function's name: display.c
// docrt() (1702-1705) only calls docrt_flags(docrtRecalc), and js/display.js
// docrt() is that body with the flag as an option.
const JS_NAMES = { docrt_flags: 'docrt' };

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (text) => text.replace(/[^\n]/gu, ' '))
        .replace(/\/\/[^\n]*/gu, '');
}

// Blanks, line by line, the C the compiler never sees: the body of an
// `#if 0` up to its `#else`, `#elif` or `#endif`, and the `#else` arm of an
// `#if 1`. Nested conditionals inside a blanked arm are tracked so that
// their `#else` and `#endif` do not end it; every other conditional keeps
// both arms, as before. Newlines stay, so line numbers do not move. Run it
// after stripComments(), so that a directive inside a comment is gone and
// one followed by a comment still reads `#if 0`.
export function skipDeadConditionals(source) {
    const lines = source.split('\n');
    // One entry per open conditional: its constant condition ('0', '1' or
    // null) and whether its current arm is blanked.
    const open = [];
    const dead = () => open.some((entry) => entry.dead);
    for (let index = 0; index < lines.length; index++) {
        const wasDead = dead();
        const directive = lines[index].match(
            /^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)$/u);
        if (directive) {
            const [, keyword, rest] = directive;
            if (keyword.startsWith('if')) {
                const constant = keyword === 'if' ? rest.trim() : null;
                open.push({ constant, dead: constant === '0' });
            } else if (keyword === 'endif') {
                open.pop();
            } else if (open.length) {
                // The arm after `#if 0` is live (an #elif's condition is not
                // evaluated); the #else after `#if 1` is not.
                const top = open.at(-1);
                top.dead = keyword === 'else' && top.constant === '1';
                top.constant = null;
            }
        }
        if (wasDead || dead()) lines[index] = '';
    }
    return lines.join('\n');
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
const structDrawCall = new RegExp(
    `\\b(${Object.keys(STRUCT_DRAW_CALLS).join('|')})(?:${JS_DRAW_SUFFIXES.join('|')})\\s*\\(`,
    'gu');

// The number of drawing calls of either kind in `body`.
export function drawCalls(body) {
    return [...body.matchAll(drawCall)].length + [...body.matchAll(structDrawCall)].length;
}

// The last member name of a column expression: `mx` for `mtmp->mx`.
const member = (expression) => expression.match(/([A-Za-z_$][\w$]*)\]?$/u)?.[1];

// The last member names of the columns `body` draws at.
export function columns(body) {
    const members = new Set();
    for (const match of body.matchAll(drawCall)) {
        const name = member(match[1]);
        if (name) members.add(name);
    }
    for (const match of body.matchAll(structDrawCall))
        members.add(STRUCT_DRAW_CALLS[match[1]]);
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
        const source = skipDeadConditionals(
            stripComments(readFileSync(join(C_DIR, file), 'utf8')));
        for (const fn of cFunctions(source)) {
            // The port often draws through an injected alias, so the JS
            // function is tested for the C function's column names as well
            // as its own.
            const cColumns = columns(fn.body);
            // display.c defines the three struct calls; their own bodies
            // are compared through the show_glyph() call each makes.
            const draws = drawCalls(fn.body);
            if (!draws) continue;
            result.functions++;
            result.cDraws += draws;
            const key = `${file} ${fn.name}`;
            const bodies = JS_SUFFIXES.flatMap(
                (suffix) => jsBodies.get((JS_NAMES[fn.name] ?? fn.name) + suffix) ?? []);
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
