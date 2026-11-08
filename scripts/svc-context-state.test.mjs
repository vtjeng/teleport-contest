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
