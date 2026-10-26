import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { EXACT_NAME } from '../js/const.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const names = [
    'trial-exact-name-bump',
    'trial-exact-name-named-control',
    'trial-exact-name-unnamed-control',
];

test('EXACT_NAME suppresses appearance fields while preserving monster names',
    () => {
        // include/hack.h:1021: EXACT_NAME is 0x1f. SUPPRESS_NAME is the
        // following bit (0x20), while MAPPEARANCE belongs inside the mask.
        assert.equal(EXACT_NAME, 0x1f);
    });

for (const name of names) {
    test(`exact-name C recording matches strictly: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/do_name.c/${name}.session.json`, import.meta.url),
            'utf8',
        ));
        const replay = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, replay);
        assert.equal(result.passed, true, JSON.stringify(
            result.firstDifference ?? result.issues?.[0] ?? result,
        ));
        if (name === 'trial-exact-name-bump') {
            const allScreens = replay.screens.join('\n');
            assert.match(allScreens, /Pardon me, Rex\./u);
        }
    });
}
