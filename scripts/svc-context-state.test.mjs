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

// C zeroes the whole svc.context struct before a game starts, so a test such
// as hack.c lookaround()'s `svc.context.run == 0` holds from the first turn.
// This port creates state.context in js/jsmain.js with only the fields listed
// there, and an absent field is not `=== 0`: until a command wrote
// context.run, lookaround() treated every counted command as a run and
// cancelled its count beside a square that stops one. A field compared with 0
// or false must therefore be one the startup literal creates.

// The fields `g.context = { ... }` creates in js/jsmain.js.
export function startupContextFields(jsmainSource) {
    const literal = /\bg\.context = \{([^}]*)\};/u.exec(codeOnly(jsmainSource));
    assert.ok(literal, 'js/jsmain.js creates g.context with an object literal');
    return literal[1].split(',').map((entry) => entry.split(':')[0].trim())
        .filter(Boolean);
}

// `x.context.field === 0`, `!== false`, `== 0` and the optional-chained
// forms. A comparison with any other value reads the same for 0 and absent.
const ZERO_COMPARISON
    = /\.context\??\.(\w+)\s*[!=]==?\s*(?:0|false)\b(?!\s*[.\w])/gu;

export function zeroComparedContextFields(files) {
    const sites = [];
    for (const [name, source] of files) {
        codeOnly(source).split('\n').forEach((line, index) => {
            for (const match of line.matchAll(ZERO_COMPARISON))
                sites.push({ site: `${name}:${index + 1}`, field: match[1] });
        });
    }
    return sites;
}

test('the zero-comparison pattern catches each strict and loose form', () => {
    // Lines 1-4 compare a field with 0 or false; line 5 compares with 1,
    // line 6 with 0.5 and line 7 sits in a comment, and none of those counts.
    const sample = [
        'if (state.context.run === 0) return;',
        'if (state.context?.mv !== false) go();',
        'if (g.context.travel == 0) stop();',
        'const idle = state.context.nopick != false;',
        'if (state.context.run === 1) rush();',
        'if (state.context.scale === 0.5) halve();',
        '// state.context.run === 0',
    ].join('\n');
    assert.deepEqual(
        zeroComparedContextFields([['sample.js', sample]])
            .map(({ site, field }) => `${site} ${field}`),
        ['sample.js:1 run', 'sample.js:2 mv', 'sample.js:3 travel',
            'sample.js:4 nopick'],
    );
});

test('a context field compared with 0 or false exists from startup', () => {
    const created = startupContextFields(
        readFileSync(join(JS_DIR, 'jsmain.js'), 'utf8'));
    // hack.c lookaround() is the site this rule was written for; a scan that
    // stopped finding it would pass while checking nothing.
    assert.ok(created.includes('run'), 'startup creates context.run');
    const files = readdirSync(JS_DIR, { recursive: true })
        .filter((name) => name.endsWith('.js'))
        .map((name) => [name, readFileSync(join(JS_DIR, name), 'utf8')]);
    const sites = zeroComparedContextFields(files);
    assert.ok(sites.some(({ site, field }) =>
        site.startsWith('hack.js:') && field === 'run'),
    'the scan finds lookaround()\'s context.run === 0');
    assert.deepEqual(
        sites.filter(({ field }) => !created.includes(field)), []);
});
