// do.c dropz() calls display.c newsym() and pickup.c encumber_msg() itself
// (do.c:840, :842). js/do.js once refused a drop whose caller had not
// injected both as hooks, so a caller that forgot them (the bullwhip that
// slips, the aklys that fails to return) stopped the game where C drew the
// object on the floor. dropz() now calls both directly. This check fails
// when do.js reads either hook again, or when a drop call supplies one: such
// a copy would be ignored, and it invites the refusal back.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));
const DROP_HOOKS = ['newsym', 'encumberMessage'];
// An env built elsewhere (for example by dropCommandEnv() for a function that
// also calls hold_another_object(), which does take encumberMessage) is not a
// drop call; an env built inside a drop call's arguments is.
const DROP_CALL = /(?<![\w.$])(?:dropx|dropy|dropz)\s*\(/gu;

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

// The text between the parenthesis that opens at `open` and its match.
function argumentText(code, open) {
    let depth = 0;
    for (let i = open; i < code.length; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')' && --depth === 0) return code.slice(open + 1, i);
    }
    throw new Error(`unterminated call at offset ${open}`);
}

// Each drop call in `source` whose arguments supply a drop hook, as
// 1-based line numbers. Definitions (`function dropx(`) are not calls.
export function dropHookSupplies(source) {
    const code = stripComments(source);
    const lines = [];
    for (const match of code.matchAll(DROP_CALL)) {
        if (/function\s+$/u.test(code.slice(Math.max(0, match.index - 20), match.index)))
            continue;
        const open = match.index + match[0].length - 1;
        const args = argumentText(code, open);
        const supplies = DROP_HOOKS.some((name) =>
            new RegExp(`(?<![\\w.$])${name}\\s*:|(?<![\\w.$])${name}(?=\\s*[,}])`, 'u')
                .test(args));
        if (supplies) lines.push(code.slice(0, match.index).split('\n').length);
    }
    return lines;
}

// Whether `source` (js/do.js) reads a drop hook or refuses without one.
export function dropHookReads(source) {
    const code = stripComments(source);
    return [
        /requiredDropHook/u,
        /hooks\??\.(?:newsym|encumberMessage)\b/u,
        /hooks\??\.?\[\s*['"](?:newsym|encumberMessage)['"]/u,
    ].filter((pattern) => pattern.test(code)).map(String);
}

test('do.js dropz() neither reads nor requires a newsym or encumber_msg hook', () => {
    const source = readFileSync(join(JS_DIR, 'do.js'), 'utf8');
    assert.deepEqual(dropHookReads(source), []);
    // The calls C makes at do.c:840 and :842 stay in the floor tail.
    const tail = stripComments(source.slice(
        source.indexOf('async function dropzAdmitted('),
        source.indexOf('export async function dropz('),
    ));
    assert.match(tail, /await stackobjRuntime\(obj, normalized\);[\s\S]*newsym\(normalized\.state\.u\.ux, normalized\.state\.u\.uy\);\s*await encumber_msg\(normalized\.state\);\s*\}/u);
});

test('no drop call supplies a newsym or encumberMessage hook', () => {
    const findings = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
        const source = readFileSync(join(JS_DIR, file), 'utf8');
        for (const line of dropHookSupplies(source))
            findings.push(`${file}:${line}`);
    }
    assert.deepEqual(findings, []);
});

test('the scans find supplied and required drop hooks', () => {
    const callers = [
        'await dropx(obj, { state, hooks: { newsym, encumberMessage: f } });', // 1
        'await dropy(obj, {',
        '    ...env,',
        '    hooks: { ...env.hooks, encumberMessage: encumber_msg },', // 2 (call line)
        '});',
        'dropz(obj, true, dropCommandEnv(state, { hooks: { newsym: g } }));', // 6
        'await dropx(obj, { state });',
        '// dropx(obj, { hooks: { newsym } });',
        'export async function dropx(obj, env = {}, prepared = null) {}',
        'hold_another_object(obj, m, n, null, { hooks: { encumberMessage: f } });',
    ].join('\n');
    assert.deepEqual(dropHookSupplies(callers), [1, 2, 6]);
    assert.deepEqual(dropHookReads("requiredDropHook(normalized, 'newsym')").length, 1);
    assert.deepEqual(dropHookReads('normalized.hooks.encumberMessage(state)').length, 1);
    assert.deepEqual(dropHookReads('newsym(x, y); await encumber_msg(state);'), []);
});
