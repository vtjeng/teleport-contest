// decl.c c_common_strings holds "vision quickly clears.", and every C site
// prints it through Your1(vision_clears). The port keeps that one string in
// js/const.js; this test fails if a JavaScript file spells it out again.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { vision_clears } from '../js/const.js';

test('vision_clears matches decl.c c_common_strings', () => {
    const decl = readFileSync(
        new URL('../nethack-c/upstream/src/decl.c', import.meta.url), 'utf8');
    assert.match(decl, /"vision quickly clears\.",/u);
    assert.equal(vision_clears, 'vision quickly clears.');
});

test('no JavaScript file spells out the vision-clears message', () => {
    const dir = new URL('../js/', import.meta.url);
    const offenders = readdirSync(dir)
        .filter((name) => name.endsWith('.js') && name !== 'const.js')
        .filter((name) => /vision (?:quickly )?clears\./u.test(
            readFileSync(new URL(name, dir), 'utf8')));
    assert.deepEqual(offenders, []);
});
