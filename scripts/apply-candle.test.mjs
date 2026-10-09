// apply.c:use_candle() consumes a key byte from y_n before deciding whether
// to light the separate candle stack or attach it to the candelabrum.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('use_candle compares the numeric no answer before delegating to use_lamp', () => {
    const c = source('../nethack-c/upstream/src/apply.c');
    const js = source('../js/apply.js');
    // apply.c:1415-1419 compares the C char 'n', then returns before splitobj,
    // attachment, consumption, or a candelabrum light update.
    assert.match(c, /if \(y_n\(safe_qbuf\([\s\S]*?== 'n'\) \{\s*use_lamp\(obj\);\s*return;/u);
    const start = js.indexOf('export async function use_candle(');
    const body = js.slice(start, js.indexOf('\n}\n', start));
    assert.match(body, /if \(await y_n\(attachQuery, state\) === 'n'\.charCodeAt\(0\)\) \{\s*await use_lamp\(obj, state, env\);\s*return;/u);
    const noBranch = body.indexOf("=== 'n'.charCodeAt(0)");
    assert.ok(noBranch < body.indexOf('splitobj('));
    assert.ok(noBranch < body.indexOf('await useupall('));
    // hack.h:1329 supplies default n. getline.js maps quitchars to defByte
    // and returns its numeric readchar value, so a string comparison fails.
    assert.match(source('../nethack-c/upstream/include/hack.h'),
        /#define y_n\(query\) yn_function\(query, ynchars, 'n', TRUE\)/u);
    assert.match(source('../js/cmd.js'),
        /export async function y_n\(query, state = game\) \{\s*return yn_function\(query, ynchars, 'n', true, state\);/u);
    assert.match(source('../js/getline.js'),
        /const defByte = def \? def\.charCodeAt\(0\) : 0;/u);
});

// These recipes exercise the real tty query via production doapply, including
// quitchars/default translation and the positive answer outside the fix.
const { CANDLE_ATTACHMENT_CASES, loadCandleAttachmentRecipe,
    verifyCandleAttachmentSegment } = await import('./run-candle-attachment.mjs');
for (const name of CANDLE_ATTACHMENT_CASES) {
    test(`production candle attachment: ${name}`, async () => {
        await verifyCandleAttachmentSegment(loadCandleAttachmentRecipe(name).segments[0]);
    });
}
