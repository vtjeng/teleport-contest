import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'acorn';

// dungeon.c In_W_tower() prints impossible("No boundary for Wizard's
// Tower?") on a tower level that has no dndest boundary, which #wizloaddes
// of another level file onto a tower level leaves. The port's impossible()
// is async, so js/dungeon.js has two entry points: In_W_tower_async(), which
// prints it, and In_W_tower(), which passes it to env.impossible or records
// it as a gap.
//
// This check fails on three patterns:
// - an In_W_tower() call without an env argument inside an async function,
//   unless that function is in ASYNC_EXCEPTIONS;
// - such a call in a synchronous function not listed in SYNC_CALLERS;
// - an In_W_tower_async() call that is not awaited.
//
// Each synchronous caller below would reach too far up its callers if made
// async:
// - dungeon.js Can_rise_up(): trap and level-change predicates call it.
// - mon.js mm_2way_aggression(): mm_aggression(), from every monster's
//   target search.
// - teleport.js rloc(): every monster relocation.
// - wizard.js has_aggravatables() and aggravate(): monster spell and
//   wake-up paths that are synchronous here.
const SYNC_CALLERS = new Set([
    'js/dungeon.js Can_rise_up',
    'js/mon.js mm_2way_aggression',
    'js/teleport.js rloc',
    'js/wizard.js has_aggravatables',
    'js/wizard.js aggravate',
]);
// Async functions still calling the synchronous form. js/mklev.js belongs to
// the level-generation work, which takes this two-line change separately:
// sp_lev.c lspo_reset_level() and lspo_finalize_level() print the
// impossible() in C (recipes/dungeon.c/in-w-tower-no-boundary-blocked).
const ASYNC_EXCEPTIONS = new Set([
    'js/mklev.js lspo_reset_level',
    'js/mklev.js lspo_finalize_level',
]);

function isAwaited(parent, node) {
    if (!parent) return false;
    if (parent.type === 'AwaitExpression') return true;
    if (parent.type === 'ReturnStatement') return true;
    return parent.type === 'ArrowFunctionExpression' && parent.body === node;
}

export function inWTowerViolations(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const found = [];
    const ancestors = [];
    const enclosing = () => {
        for (let i = ancestors.length - 1; i >= 0; i--) {
            const node = ancestors[i];
            if (!/Function/u.test(node.type)) continue;
            const parent = ancestors[i - 1];
            const name = node.id?.name
                ?? (parent?.type === 'VariableDeclarator'
                    ? parent.id.name : null)
                ?? '(anonymous)';
            return { name, async: node.async };
        }
        return { name: '(module)', async: false };
    };
    const walk = (node) => {
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        if (!node || typeof node.type !== 'string') return;
        const parent = ancestors.at(-1);
        ancestors.push(node);
        if (node.type === 'CallExpression'
            && node.callee.type === 'Identifier') {
            const fn = enclosing();
            const where = `${file}:${node.loc.start.line} ${fn.name}()`;
            const key = `${file} ${fn.name}`;
            if (node.callee.name === 'In_W_tower'
                && node.arguments.length < 5) {
                if (fn.async && !ASYNC_EXCEPTIONS.has(key))
                    found.push(`${where} calls In_W_tower() in an async`
                        + ' function; use await In_W_tower_async()');
                else if (!fn.async && !SYNC_CALLERS.has(key))
                    found.push(`${where} calls In_W_tower() from an unlisted`
                        + ' synchronous function');
            }
            if (node.callee.name === 'In_W_tower_async'
                && !isAwaited(parent, node))
                found.push(`${where} does not await In_W_tower_async()`);
        }
        for (const [k, value] of Object.entries(node)) {
            if (k !== 'loc' && value && typeof value === 'object')
                walk(value);
        }
        ancestors.pop();
    };
    walk(ast);
    return found;
}

test('In_W_tower() callers that can wait print its impossible()', () => {
    const files = readdirSync(new URL('../js/', import.meta.url))
        .filter((name) => name.endsWith('.js'))
        .map((name) => `js/${name}`);
    const found = files.flatMap((file) => inWTowerViolations(
        file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    ));
    assert.deepEqual(found, []);
    // Every listed exception is still a caller, so the lists shrink as
    // callers are ported: count the listed functions that call In_W_tower().
    const callers = new Set();
    for (const file of files) {
        const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
        for (const name of [...SYNC_CALLERS, ...ASYNC_EXCEPTIONS]) {
            const [listedFile, fn] = name.split(' ');
            if (listedFile !== file) continue;
            const start = source.search(new RegExp(`function ${fn}\\(`, 'u'));
            const next = source.indexOf('\nexport ', start + 1);
            const body = source.slice(start, next < 0 ? undefined : next);
            if (start >= 0 && /\bIn_W_tower\(/u.test(body)) callers.add(name);
        }
    }
    assert.deepEqual([...callers].sort(),
        [...SYNC_CALLERS, ...ASYNC_EXCEPTIONS].sort());
});

test('the In_W_tower() check reports each bypass', () => {
    const cases = [
        // An async caller that would drop the impossible().
        ['async function f(s) { return In_W_tower(1, 2, s.u.uz, s); }',
            'in an async function'],
        // A new synchronous caller outside the list.
        ['function f(s) { return In_W_tower(1, 2, s.u.uz, s); }',
            'unlisted synchronous'],
        // A listed name in another file is not the listed function.
        ['function rloc(s) { return In_W_tower(1, 2, s.u.uz, s); }',
            'unlisted synchronous'],
        // The async entry point called without await.
        ['async function f(s) { const t = In_W_tower_async(1, 2, s.u.uz, s); }',
            'does not await'],
    ];
    for (const [source, expected] of cases) {
        const found = inWTowerViolations('js/x.js', source);
        assert.ok(found.some((line) => line.includes(expected)),
            `${source}: ${JSON.stringify(found)}`);
    }
    const allowed = [
        ['js/x.js',
            'async function f(s) { return await In_W_tower_async(1, 2, s.u.uz, s); }'],
        ['js/x.js',
            'async function f(s) { return In_W_tower(1, 2, s.u.uz, s, { impossible() {} }); }'],
        ['js/teleport.js', 'function rloc(s) { return In_W_tower(1, 2, s.u.uz, s); }'],
    ];
    for (const [file, source] of allowed)
        assert.deepEqual(inWTowerViolations(file, source), [], source);
});
