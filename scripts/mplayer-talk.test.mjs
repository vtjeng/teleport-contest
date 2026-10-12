import assert from 'node:assert/strict';
import test from 'node:test';

import { mplayer_talk } from '../js/mplayer.js';

test('mplayer_talk chooses the same-class line with one rn2(3) draw', async () => {
    const playerSpecies = {};
    const monster = { data: playerSpecies, mpeaceful: false };
    const state = { mons: [playerSpecies], urole: { mnum: 0 } };
    const calls = [];

    await mplayer_talk(monster, state, {
        random: { rn2(size) { calls.push(['rn2', size]); return 2; } },
        message(line) { calls.push(['message', line]); },
    });

    assert.deepEqual(calls, [
        ['rn2', 3],
        ['message', '"Talk? -- Mine should be the honor, not yours!"'],
    ]);
});

test('mplayer_talk chooses the other-class line and peaceful mplayers stay silent', async () => {
    const playerSpecies = {};
    const otherSpecies = {};
    const state = { mons: [playerSpecies], urole: { mnum: 0 } };
    const calls = [];

    await mplayer_talk({ data: otherSpecies, mpeaceful: false }, state, {
        random: { rn2(size) { calls.push(['rn2', size]); return 1; } },
        message(line) { calls.push(['message', line]); },
    });
    await mplayer_talk({ data: playerSpecies, mpeaceful: true }, state, {
        random: { rn2() { throw new Error('peaceful mplayer consumed RNG'); } },
        message() { throw new Error('peaceful mplayer spoke'); },
    });

    assert.deepEqual(calls, [
        ['rn2', 3],
        ['message', '"Talk? -- Fight, scum!"'],
    ]);
});
