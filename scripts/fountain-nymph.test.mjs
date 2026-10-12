// fountain.c:dowaternymph() (93-116). Pin both blind branches to the C
// You_hear behavior while exercising the existing runtime callers' helper.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BLINDED, DEAF, G_GONE, MM_NOMSG } from '../js/const.js';
import { dowaternymph } from '../js/fountain.js';
import { game } from '../js/gstate.js';
import { PM_WATER_NYMPH } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';

async function startedGame() {
    await runSegment({
        seed: 7316,
        datetime: '20310418123000',
        nethackrc: [
            'OPTIONS=name:NymphPort,role:Wizard,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none',
            '',
        ].join('\n'),
        moves: '',
    });
    game.flags.acoustics = true;
    game.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    return game;
}

test('blind water-nymph creation wakes the monster and uses You_hear', async () => {
    await startedGame();
    const nymph = {
        mx: game.u.ux,
        my: game.u.uy,
        msleeping: 1,
    };
    const events = [];

    await dowaternymph(game, {
        async message(line) { events.push(line); },
        async makeMonster(type, x, y, flags) {
            assert.equal(type, game.mons[PM_WATER_NYMPH]);
            assert.deepEqual([x, y], [game.u.ux, game.u.uy]);
            assert.equal(flags, MM_NOMSG);
            events.push('created');
            return nymph;
        },
    });

    assert.deepEqual(events, ['created', 'You hear a seductive voice.']);
    assert.equal(nymph.msleeping, 0);
});

test('blind extinct nymph reports a loud pop through You_hear, respecting deafness', async () => {
    await startedGame();
    game.mvitals[PM_WATER_NYMPH].mvflags |= G_GONE;
    const events = [];
    await dowaternymph(game, { message: async (line) => events.push(line) });
    assert.deepEqual(events, ['You hear a loud pop.']);

    game.u.uprops[DEAF] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    events.length = 0;
    await dowaternymph(game, { message: async (line) => events.push(line) });
    assert.deepEqual(events, []);
});

test('sighted extinct nymph keeps the bubble message and skips sound effects', async () => {
    await startedGame();
    game.mvitals[PM_WATER_NYMPH].mvflags |= G_GONE;
    game.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const events = [];
    await dowaternymph(game, {
        message: async (line) => events.push(line),
        makeMonster: async () => assert.fail('extinct nymph must not be created'),
    });
    assert.deepEqual(events, [
        'A large bubble rises to the surface and pops.',
    ]);
});

test('the complete C helper source and JavaScript keep both blind branches', async () => {
    const [c, js] = await Promise.all([
        readFile(new URL('../nethack-c/upstream/src/fountain.c', import.meta.url), 'utf8'),
        readFile(new URL('../js/fountain.js', import.meta.url), 'utf8'),
    ]);
    const cStart = c.indexOf('\ndowaternymph(void)');
    const cEnd = c.indexOf('\n/* Gushing forth', cStart);
    const jsStart = js.indexOf('export async function dowaternymph(');
    const jsEnd = js.indexOf('\n// ── gush ──', jsStart);
    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    const cBody = c.slice(cStart, cEnd);
    const jsBody = js.slice(jsStart, jsEnd);
    assert.match(cBody, /You_hear\("a seductive voice\."\)/u);
    assert.match(cBody, /You_hear\("a loud pop\."\)/u);
    assert.match(jsBody, /youHear\('a seductive voice\.', state\)/u);
    assert.match(jsBody, /youHear\('a loud pop\.', state\)/u);
    assert.doesNotMatch(jsBody, /UnsupportedFountainError/u);
});
