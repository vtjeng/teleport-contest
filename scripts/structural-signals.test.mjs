import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cUnits, jsUnits, cGuards, commandPaths, reachableJs, resolveCall,
    diagnosticSourceHash, cacheKey, cachedReview } from './structural-signals.mjs';

test('C inventory owns exact balanced bodies, not comments, prototypes or the next definition', () => {
    const source = 'int other(void);\nint\nfirst(void)\n{\n /* absent(); } */\n pline("A missing %s message " "continues here.", x);\n real();\n}\nint\nsecond(void)\n{ tail(); }\n';
    const units = cUnits(source, '/src/example.c');
    assert.deepEqual(units.map(u => u.name), ['first', 'second']);
    assert.deepEqual(units[0].calls.map(c => c.name), ['pline', 'real']);
    assert.equal(units[0].messages[0].literal, 'A missing %s message continues here.');
    assert.equal(units[0].messages[0].line, 6);
    assert.deepEqual(units[0].messages[0].pieces, ['message continues here.']);
});

test('monster messages skip the recipient argument and retain conditional provenance', () => {
    const units = cUnits('int\nf(void)\n{\n#ifdef OPTIONAL\n pline_mon(mon, "Only the visible monster speaks.");\n#endif\n}\n', '/c.c');
    assert.equal(units[0].messages[0].literal, 'Only the visible monster speaks.');
    assert.deepEqual(units[0].messages[0].conditions, ['ifdef OPTIONAL']);
});

test('nested conditional guards do not claim unknown else arms inactive', () => {
    const guards = cGuards('#if 0\nno();\n#ifdef FOO\nno2();\n#endif\n#else\nmaybe();\n#endif\nyes();');
    assert.deepEqual(guards.get(4), ['if 0', 'ifdef FOO']);
    assert.deepEqual(guards.get(7), ['else  (alternative)']);
    assert.deepEqual(guards.get(9), []);
});

test('concatenated formatted JS messages retain fixed runs but comments do not count', () => {
    const data = jsUnits('// "A totally absent message"\nfunction f() { say(`Your ${name} armor is too ` + "stiff to mount."); }', '/js/a.js');
    assert(data.strings.includes('armor is too stiff to mount.'));
    assert(!data.strings.some(s => s.includes('totally absent')));
});

test('import aliases and helper extraction reach the original exported callee', () => {
    const a = jsUnits("import { original as renamed } from './b.js'; function root() { helper(); } function helper() { renamed(); }", '/js/a.js');
    const b = jsUnits('export function original() {}', '/js/b.js');
    const modules = new Map([[a.path, a], [b.path, b]]);
    assert.deepEqual([...reachableJs(a.units[0], modules)], ['helper', 'original']);
    assert.equal(resolveCall('/js/a.js', 'renamed', modules).name, 'original');
});

test('namespace imports, renamed reexports and cycles resolve without inventing a callee', () => {
    const modules = new Map(['/js/a.js', '/js/b.js', '/js/c.js'].map((path, i) => [path, jsUnits([
        "import * as ns from './b.js'; function root() { ns.alias(); }",
        "export { actual as alias } from './c.js'; export { loop } from './b.js';",
        'export async function actual() {}',
    ][i], path)]));
    assert.equal(resolveCall('/js/a.js', 'ns.alias', modules).name, 'actual');
    assert.equal(resolveCall('/js/b.js', 'loop', modules), null);
    assert.equal(resolveCall('/js/a.js', 'other.alias', modules), null);
});

test('dynamic imports remain local to a function and count as helper edges', () => {
    const a = jsUnits("async function root() { const { actual: local } = await import('./b.js'); await local(); }", '/js/a.js');
    const b = jsUnits('export async function actual() {}', '/js/b.js');
    const modules = new Map([[a.path, a], [b.path, b]]);
    assert(reachableJs(a.units[0], modules).has('actual'));
    assert.equal(resolveCall('/js/a.js', 'local', modules), null);
});

test('async candidates distinguish bare calls from awaited/returned calls and callbacks', () => {
    const a = jsUnits('async function f(){ bare(); await waited(); return forwarded(); function nested(){ callback(); } }', '/js/a.js');
    assert.deepEqual(a.units[0].calls.map(c => [c.name, c.bare]), [['bare', true], ['waited', false], ['forwarded', false]]);
});

test('shortest command paths start at supplied real command roots, never arbitrary functions', () => {
    const paths = commandPaths([{ name: 'entry', calls: [{ name: 'mid' }, { name: 'target' }] },
        { name: 'mid', calls: [{ name: 'target' }] }, { name: 'target', calls: [{ name: 'entry' }] },
        { name: 'unreachable', calls: [] }], [{ ef_txt: 'cast', ef_funct: 'entry' }]);
    assert.deepEqual(paths.get('target'), ['#cast', 'entry', 'target']);
    assert.equal(paths.get('unreachable'), undefined);
});

test('negative review cache invalidates independently on C header, patch, JS and installed build changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'structural-hash-'));
    try {
        for (const dir of ['nethack-c/upstream/src', 'nethack-c/upstream/win/tty', 'nethack-c/upstream/include', 'nethack-c/patches', 'js', 'nethack-c/recorder/install/games/lib/nethackdir'])
            mkdirSync(join(root, dir), { recursive: true });
        writeFileSync(join(root, 'nethack-c/upstream/src/a.c'), 'int\nf(void)\n{}');
        writeFileSync(join(root, 'js/a.js'), 'export function f() {}');
        const signal = { id: 'a.c:f:message:3' }, original = diagnosticSourceHash(root);
        const review = { verdict: 'false-positive', reason: 'inactive build branch' };
        const cache = { entries: { [cacheKey(signal, original)]: review } };
        assert.deepEqual(cachedReview(signal, original, cache), review);
        for (const path of ['nethack-c/upstream/include/a.h', 'nethack-c/patches/a.patch', 'js/a.js',
            'nethack-c/recorder/install/games/lib/nethackdir/nethack', 'nethack-c/recorder/install/games/lib/nethackdir/sysconf']) {
            const current = diagnosticSourceHash(root);
            const currentCache = { entries: { [cacheKey(signal, current)]: review } };
            writeFileSync(join(root, path), '// changed build or implementation input');
            assert.equal(cachedReview(signal, diagnosticSourceHash(root), currentCache), null);
        }
    } finally { rmSync(root, { recursive: true, force: true }); }
});
