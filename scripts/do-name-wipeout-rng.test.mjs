import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cDoName = readFileSync('nethack-c/upstream/src/do_name.c', 'utf8');
const cEngrave = readFileSync('nethack-c/upstream/src/engrave.c', 'utf8');
const jsDoName = readFileSync('js/do_name.js', 'utf8');
const jsEngrave = readFileSync('js/engrave.js', 'utf8');

test('do_oname keeps the display-RNG count separate from wipeout_text core draws', () => {
    assert.match(cDoName, /wipeout_text\(bufp, rnd_on_display_rng\(2\), \(unsigned\) 0\);/u);
    assert.match(jsDoName, /wipeout_text\(target, rnd_on_display_rng\(2\), 0\)/u);
    assert.doesNotMatch(jsDoName, /wipeout_text\(target, rnd_on_display_rng\(2\), 0,\s*\{\s*random:/u);
});

test('zero-seed wipeout_text uses the process rn2 source in C and JavaScript', () => {
    const cStart = cEngrave.indexOf('void\nwipeout_text(');
    const cEnd = cEngrave.indexOf('\n}', cStart) + 2;
    const jsStart = jsEngrave.indexOf('export function wipeout_text(');
    const jsEnd = jsEngrave.indexOf('\n}', jsStart) + 2;
    assert.ok(cStart >= 0 && cEnd > cStart && jsStart >= 0 && jsEnd > jsStart);
    const cBody = cEngrave.slice(cStart, cEnd);
    const jsBody = jsEngrave.slice(jsStart, jsEnd);
    assert.match(cBody, /if \(!seed\)[\s\S]*?nxt = rn2\(\(int\) lth\);[\s\S]*?use_rubout = rn2\(4\);[\s\S]*?j = rn2\(\(int\) ln\);/u);
    assert.match(jsBody, /const \{ random \} = engravingEnv\(env\);[\s\S]*?if \(!currentSeed\)[\s\S]*?next = random\.rn2\(length\);[\s\S]*?useRubout = random\.rn2\(4\);[\s\S]*?replacementIndex = random\.rn2\(replacements\.length\);/u);
    assert.match(jsEngrave, /function engravingEnv\(env = \{\}\)[\s\S]*?random: env\.random \?\? \{ rn2, rnd \}/u);
});
