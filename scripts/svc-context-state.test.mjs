// C's svc.context struct (context.h) is this port's state.context: the save
// snapshot writes it whole (js/save.js serializeGameState()) and jsmain.js
// creates it at startup. Several sites once read or wrote a separate
// state.svc.context instead. Nothing saved or initialized that object, so a
// novel's remaining passages, Death's novel remark and the Mines and
// Sokoban prize ids were lost on a restore or never seen at all. This test
// fails when code under js/ names a `svc` property again; the C name may
// still appear in comments.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTEXT_STRUCTS, zero_context_info } from '../js/context.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict } from '../js/jsmain.js';
import { parseSnapshot, serializeSnapshot } from '../js/snapshot.js';
import {
    jsFiles,
    resolvePath,
    scanFiles,
    scanSource,
} from './state-field-uses.mjs';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Remove comments and string and template contents so that prose such as
// "svc.context" in a C reference does not count.
export function codeOnly(source) {
    let out = '';
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];
        if (ch === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i++;
            out += '\n';
            continue;
        }
        if (ch === '/' && next === '*') {
            i += 2;
            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
                if (source[i] === '\n') out += '\n';
                i++;
            }
            i++;
            continue;
        }
        if (ch === '\'' || ch === '"' || ch === '`') {
            out += ch;
            for (i++; i < source.length && source[i] !== ch; i++) {
                if (source[i] === '\\') i++;
            }
            out += ch;
            continue;
        }
        out += ch;
    }
    return out;
}

// A property or binding named svc: `x.svc`, `x?.svc`, `{ svc }`, `{ svc: y }`.
const SVC_PROPERTY = /(?:\??\.\s*svc\b|[{,]\s*svc\s*[:,}])/u;

export function svcSites(files) {
    const sites = [];
    for (const [name, source] of files) {
        codeOnly(source).split('\n').forEach((line, index) => {
            if (SVC_PROPERTY.test(line)) sites.push(`${name}:${index + 1}`);
        });
    }
    return sites;
}

test('the svc pattern catches each way a site can name svc', () => {
    // One line per form the pattern must reject, and three it must accept:
    // a C reference in a line comment, one in a block comment, and a string.
    const sample = [
        'state.svc ??= {};',
        'const x = state.svc?.context?.novel;',
        'state = { ...state, svc: { context: {} } };',
        'const { svc } = state;',
        '// svc.context.novel is state.context.novel',
        '/* C: svc.context.achieveo */',
        "const label = 'svc.context';",
        'const text = `${count} svc.context fields`;',
    ].join('\n');
    assert.deepEqual(svcSites([['sample.js', sample]]),
        ['sample.js:1', 'sample.js:2', 'sample.js:3', 'sample.js:4']);
});

test('no code under js/ keeps svc.context apart from state.context', () => {
    const files = readdirSync(JS_DIR, { recursive: true })
        .filter((name) => name.endsWith('.js'))
        .map((name) => [name, readFileSync(join(JS_DIR, name), 'utf8')]);
    assert.deepEqual(svcSites(files), []);
});

// C zeroes the whole svc.context struct before a game starts, so a field no
// code has written reads as 0, FALSE or NULL: hack.c lookaround()'s
// `svc.context.run == 0` holds from the first turn, and spell.c's
// `svc.context.forcefight++` around wakeup() makes it 1. The port once
// created state.context with four fields and let the rest appear when first
// written. An absent field read as `undefined`, which is not `=== 0`, not
// `< 1` and NaN after `++`, so lookaround() cancelled the count of a counted
// first command, and forcefight would have read as NaN, which is false.
//
// js/jsmain.js now creates the object from js/context.js
// zero_context_info(), generated from include/context.h, so every field
// exists with C's zero value. The tests below keep it that way: nothing may
// replace the object or one of its structs with a partial one, test whether
// a field exists, give a scalar field a non-zero default for when it is
// absent, or use a field context.h does not declare.

// Fields the port keeps on state.context that context.h does not declare,
// with the number of uses the scan finds. pendingCommand (js/cmd.js
// rhack()) holds a parsed command so that a keystroke refused partway can
// be retried; it is created on demand and deleted when the command ends, and
// jsmain.js deletes it after a restore. Lower a count when uses go away.
const PORT_ONLY_FIELDS = { pendingCommand: 7 };

function contextUses() {
    return scanFiles(jsFiles(JS_DIR), 'context').map((use) => ({
        ...use, ...resolvePath(use.path, CONTEXT_STRUCTS, 'context_info'),
    }));
}

// Every [name, value] path of a zeroed struct, nested structs included.
function leafPaths(value, prefix = '') {
    return Object.entries(value).flatMap(([key, item]) => (
        item && typeof item === 'object' && !Array.isArray(item)
            ? leafPaths(item, `${prefix}${key}.`)
            : [`${prefix}${key}`]));
}

test('the scan follows aliases and classes each read form', () => {
    // Each line exercises one form the scan must see and class.
    const sample = [
        /* 1 */ 'function f(state) {',
        /* 2 */ '    const context = state.context;',
        /* 3 */ '    if (context.run === 0) return;',
        /* 4 */ '    const { digging } = state.context;',
        /* 5 */ '    if (digging.effort > 100) stop();',
        /* 6 */ '    state.context.forcefight++;',
        /* 7 */ '    const n = state.context.ident - 1;',
        /* 8 */ '    if (!state.context?.travel) go();',
        /* 9 */ '    const w = g.context.warnlevel ?? 1;',
        /* 10 */ '    delete state.context.mv;',
        /* 11 */ '    state.context.digging = { effort: 0 };',
        /* 12 */ '    return meal(state).usedtime + 1;',
        /* 13 */ '}',
        /* 14 */ 'function meal(state) { return state.context.victual; }',
    ].join('\n');
    const uses = scanSource('sample.js', sample)
        .filter(({ cls }) => !cls.startsWith('flow-'))
        .map(({ site, path, cls }) => `${site} ${path} ${cls}`);
    assert.deepEqual(uses, [
        'sample.js:3 run different-zero-compare',
        'sample.js:5 digging.effort different-relational',
        'sample.js:6 forcefight different-update',
        'sample.js:7 ident different-arithmetic',
        'sample.js:8 travel safe-truth',
        'sample.js:9 warnlevel different-default',
        'sample.js:10 mv different-presence',
        'sample.js:11 digging write-object',
        'sample.js:12 victual.usedtime different-arithmetic',
    ]);
});

test('js/jsmain.js creates state.context from zero_context_info()', () => {
    const uses = contextUses();
    // hack.c lookaround()'s run test is the read this rule began with; a
    // scan that stopped finding it would pass while checking nothing.
    assert.ok(uses.some(({ site, path, cls }) => site.startsWith('hack.js:')
        && path === 'run' && cls === 'different-zero-compare'));
    const replacements = uses.filter(({ cls, detail }) => cls === 'write-holder'
        && detail.startsWith('= '));
    assert.deepEqual(
        replacements.map(({ site, detail }) => `${site.split(':')[0]} ${detail}`),
        // restore.js restgamestate() installs the saved struct, which the
        // same factory created before it was saved.
        ['jsmain.js = zero_context_info()', 'restore.js = snapshot.context'],
    );
});

test('the zeroed context has every field context.h declares', () => {
    const zeroed = zero_context_info();
    assert.equal(Object.keys(zeroed).length, CONTEXT_STRUCTS.context_info.length);
    // C types the zero value of each struct member: run is unsigned, travel
    // a boolean, victual.piece a pointer, digging.level an embedded d_level,
    // and novel.pasg an xint8[30].
    assert.equal(zeroed.run, 0);
    assert.equal(zeroed.travel, false);
    assert.equal(zeroed.victual.piece, null);
    assert.deepEqual(zeroed.digging.level, { dnum: 0, dlevel: 0 });
    assert.deepEqual(zeroed.novel.pasg, Array(30).fill(0));
    // Each call builds new structs, so two games never share one.
    assert.notEqual(zero_context_info().digging, zeroed.digging);
});

test('a saved context restores with every field', () => {
    // save.js writes state.context through serializeSnapshot() and
    // restore.js reads it back through parseSnapshot(); JSON drops a field
    // holding undefined, so a restored game must not lose any zero field.
    const restored = parseSnapshot(serializeSnapshot(zero_context_info()));
    assert.deepEqual(leafPaths(restored), leafPaths(zero_context_info()));
    assert.deepEqual(restored, zero_context_info());
});

test('a game restored in a later segment keeps every context field', async () => {
    // A field that a game sets to undefined or NaN would leave the save
    // through JSON as absent or null. This recipe saves in its first segment
    // and restores in its second; afterwards every field context.h declares
    // must hold a value, as it does at startup. pendingCommand is port-only.
    const recipe = JSON.parse(readFileSync(join(JS_DIR, '..', 'recipes',
        'restore.c', 'monster-carried-item-drop-after-restore.session.json'), 'utf8'));
    const store = new Map();
    const storage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        get length() { return store.size; },
        key: (index) => [...store.keys()][index] ?? null,
        clear: () => store.clear(),
    };
    assert.equal(recipe.segments.length, 2);
    for (const segment of recipe.segments)
        await runSegmentStrict({ ...segment, storage });
    const context = { ...game.context };
    delete context.pendingCommand;
    // Each [path, value] of a struct's own fields, descending into embedded
    // structs but not through pointers such as victual.piece.
    const fields = (value, struct, prefix = '') => Object.entries(value).flatMap(
        ([key, item]) => {
            const nested = CONTEXT_STRUCTS[struct].find(([name]) => name === key)?.[2];
            return nested ? fields(item, nested, `${prefix}${key}.`)
                : [[`${prefix}${key}`, item]];
        });
    const restored = fields(context, 'context_info');
    assert.deepEqual(restored.map(([path]) => path).sort(),
        leafPaths(zero_context_info()).sort());
    assert.deepEqual(restored.filter(([, item]) => item === undefined
        || Number.isNaN(item)), []);
});

test('every context field js/ names is declared in context.h', () => {
    const counts = {};
    for (const { field, ctype } of contextUses())
        if (ctype === null) counts[field] = (counts[field] ?? 0) + 1;
    assert.deepEqual(counts, PORT_ONLY_FIELDS);
});

test('no struct of state.context is replaced by a partial object', () => {
    // C clears a struct with memset() or copies a whole one in; the port
    // assigns the struct's zero_<struct>() or an object literal holding all
    // of its fields. A literal that copies another struct with a spread,
    // such as `{ ...u.uz }` for a d_level, holds them all too.
    const partial = [];
    for (const use of contextUses()) {
        if (use.cls !== 'write-object' || !use.ctype?.startsWith('struct ')) continue;
        const struct = use.ctype.slice('struct '.length);
        const keys = use.detail.split(',');
        if (keys.includes('...')) continue;
        const fields = CONTEXT_STRUCTS[struct].map(([name]) => name);
        if (keys.sort().join() !== fields.sort().join()) partial.push(`${use.site} ${use.path}`);
    }
    assert.deepEqual(partial, []);
});

test('no code tests whether a context.h field exists', () => {
    // delete, typeof, `in` and Object.hasOwn() tell an absent field from a
    // zero one, which C cannot do.
    const sites = contextUses()
        .filter(({ cls, ctype }) => cls === 'different-presence' && ctype !== null)
        .map(({ site, path, detail }) => `${site} ${path} ${detail}`);
    assert.deepEqual(sites, []);
});

test('no scalar context field has a non-zero default for when it is absent', () => {
    // `state.context.warnlevel ?? 1` once stood in for newgame()'s
    // `svc.context.warnlevel = 1`. A default on an integer or boolean only
    // runs for a field that is absent, which C does not have; a default of
    // 0 or false is the zero value and does no harm. A default on a struct,
    // array or pointer, such as `?? {}`, is not checked here.
    const scalar = (ctype) => ctype && !ctype.startsWith('struct ')
        && !ctype.includes('*') && !ctype.includes('[');
    const sites = contextUses()
        .filter(({ cls, ctype, beyond }) => !beyond && scalar(ctype)
            && (cls === 'different-default' || cls === 'assign-default'))
        .map(({ site, path, detail }) => `${site} ${path} ?? ${detail}`);
    assert.deepEqual(sites, []);
});
