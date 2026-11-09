// Guards deleted because no game can reach them must not return. Each test
// below names the C source that shows why the guarded state never occurs,
// and pins what remains of the guard, so that a refusal or reason added back
// at the same site fails here rather than waiting for a game to reach it.
// Lower a pin when a remaining refusal is ported; raising one needs a reason
// written beside it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = new URL('../js/', import.meta.url);

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function jsCode(file) {
    return stripComments(readFileSync(new URL(file, JS_DIR), 'utf8'));
}

function skipString(code, start) {
    const quote = code[start];
    for (let i = start + 1; i < code.length; i++) {
        if (code[i] === '\\') { i++; continue; }
        if (code[i] === quote) return i;
    }
    throw new Error(`unterminated string at offset ${start}`);
}

// The body of the function declared as `name` in comment-free `code`, from
// its opening brace to its closing brace. Strings are skipped whole when
// matching braces.
export function functionBody(code, name) {
    const declaration = new RegExp(`function\\s+${name}\\s*\\(`, 'u').exec(code);
    assert.ok(declaration, `no function ${name}`);
    let i = declaration.index + declaration[0].length;
    for (let parens = 1; parens > 0; i++) {
        if (code[i] === '(') parens++;
        else if (code[i] === ')') parens--;
    }
    const open = code.indexOf('{', i);
    let depth = 0;
    for (let j = open; j < code.length; j++) {
        const ch = code[j];
        if (ch === '\'' || ch === '"' || ch === '`') {
            j = skipString(code, j);
            continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return code.slice(open, j + 1);
    }
    throw new Error(`unterminated function ${name}`);
}

// The string literals a function body returns, in order.
export function returnedStrings(body) {
    return [...body.matchAll(/return\s+(?:'([^']*)'|`([^`]*)`)/gu)]
        .map((match) => match[1] ?? match[2]);
}

function count(code, pattern) {
    return [...code.matchAll(pattern)].length;
}

// js/obj.js once refused a missing monster catalog entry, a null artifact
// (mkobj.c:890 and :1099: "mk_artifact() with otmp and A_NONE will never
// return NULL"), an unset current fruit (options.c initoptions_finish() sets
// it on every startup) and a cursed object outside free-object generation.
// What is left is requiredHook()'s refusal in obj.js and invent.js, whose hook
// names scripts/lifecycle-hook-defaults.test.mjs pins.
const OBJECT_OPERATION_REFUSAL_SITES = 2;

test('object operations refuse only through requiredHook()', () => {
    let sites = 0;
    for (const file of ['obj.js', 'invent.js']) {
        const code = jsCode(file);
        sites += count(code, /new UnsupportedObjectOperationError\(/gu);
        assert.match(functionBody(code, 'requiredHook'),
            /new UnsupportedObjectOperationError\(/u, file);
    }
    assertExceptionCount(sites, OBJECT_OPERATION_REFUSAL_SITES, {
        what: 'UnsupportedObjectOperationError throw sites in obj.js and invent.js',
        pin: 'OBJECT_OPERATION_REFUSAL_SITES in scripts/unreachable-guards.test.mjs',
    });
    const code = jsCode('obj.js');
    // mkobj.c mksobj_init() calls its corpse, egg and tin initializer only
    // from those three case labels, so the switch needs no default.
    assert.doesNotMatch(functionBody(code, 'initializeMonsterFood'), /default\s*:/u);
});

// run_timers()'s admission (timeout.c run_timers() 2216-2240) may refuse a
// due prefix only for the reasons below. C starts only TIMER_OBJECT timers
// and the TIMER_LEVEL MELT_ICE_AWAY timer, every timeout_funcs[] row is
// ported, a corpse never holds objects, and only start_glob_timeout() starts
// SHRINK_GLOB, on a glob; so no reason may test the timer kind, a missing
// function, a corpse's contents or a non-glob.
const DUE_TIMER_REASONS = {
    'timeout.js unportedDueTimerReason': ['the due object to hold only its own timer'],
    'dig.js unportedRotCorpseReason': [],
    'obj.js unportedShrinkGlobReason': ['shrink_glob for an unpaid glob'],
};

test('run_timers() refuses a due prefix only for the pinned reasons', () => {
    const found = {};
    for (const key of Object.keys(DUE_TIMER_REASONS)) {
        const [file, name] = key.split(' ');
        found[key] = returnedStrings(functionBody(jsCode(file), name));
    }
    assert.deepEqual(found, DUE_TIMER_REASONS);
    const admission = functionBody(jsCode('timeout.js'), 'unportedDueTimerReason');
    assert.doesNotMatch(admission, /timer\.kind\s*!==|!\s*entry\.f\b/u);
});

test('returnedStrings reads quoted and template returns', () => {
    const body = "{ if (a) return 'one'; if (b) return `two ${c}`; return null; }";
    assert.deepEqual(returnedStrings(body), ['one', 'two ${c}']);
});
