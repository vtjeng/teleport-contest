import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { WAN_NOTHING, WAN_STASIS } from '../js/objects.js';
import { zapnodir } from '../js/zap.js';

const zapC = readFileSync('nethack-c/upstream/src/zap.c', 'utf8');

test('WAN_STASIS extends the level freeze to the longer source duration', async () => {
    const source = zapC.slice(
        zapC.indexOf('case WAN_STASIS:'),
        zapC.indexOf('case WAN_CREATE_MONSTER:'),
    );
    assert.match(source, /svm\.moves \+ \(long\) rn1\(21, 10\)/u);
    assert.match(source, /if \(tmp_until > svl\.level\.flags\.stasis_until\)/u);

    const state = {
        moves: 700,
        level: { flags: { stasis_until: 720 } },
    };
    const calls = [];
    await zapnodir({ otyp: WAN_STASIS }, state, {
        rn1(range, base) {
            calls.push([range, base]);
            return 25;
        },
    });
    assert.deepEqual(calls, [[21, 10]]);
    assert.equal(state.level.flags.stasis_until, 725);

    state.level.flags.stasis_until = 900;
    await zapnodir({ otyp: WAN_STASIS }, state, {
        rn1(range, base) {
            calls.push([range, base]);
            return 10;
        },
    });
    assert.deepEqual(calls, [[21, 10], [21, 10]]);
    assert.equal(state.level.flags.stasis_until, 900);
});

test('unhandled directionless wand types follow zap.c’s no-op default', async () => {
    const switchBody = zapC.slice(
        zapC.indexOf('switch (obj->otyp)', zapC.indexOf('zapnodir(struct obj *obj)')),
        zapC.indexOf('\n    if (known)', zapC.indexOf('zapnodir(struct obj *obj)')),
    );
    assert.match(switchBody, /default:\s*break;/u);

    const state = {};
    const calls = [];
    await zapnodir({ otyp: WAN_NOTHING, dknown: true }, state, {
        rn1() { calls.push('rn1'); return 0; },
        rn2() { calls.push('rn2'); return 0; },
    });
    assert.deepEqual(calls, []);
});
