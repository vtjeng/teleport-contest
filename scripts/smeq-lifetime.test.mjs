// C decl.c:682 zero-fills gs.smeq[MAXNROFROOMS + 1] once per process.
// sp_lev.c create_room() and extralev.c write one room's entry, mklev.c join()
// merges two, and nothing resets the array: clear_level_structures(),
// makecorridors() and savelev()/getlev() leave it alone. js/gstate.js
// initialGameState() is the port's one allocation; these checks pin its size
// to js/const.js and keep any other file from replacing the array.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MAXNROFROOMS } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

test('a new game starts with MAXNROFROOMS + 1 zeroed smeq entries', () => {
    resetGame();
    assert.equal(game.smeq.length, MAXNROFROOMS + 1);
    assert.ok(game.smeq.every((value) => value === 0));
});

test('only js/gstate.js allocates or replaces smeq', () => {
    // `smeq =` or `smeq ??=` or a `smeq:` key: anything but an indexed
    // write such as `smeq[i] = i`.
    const whole = /\bsmeq\s*(?:\?\?)?=(?!=)|\bsmeq\s*:/u;
    const sites = readdirSync(JS_DIR).filter((name) => name.endsWith('.js'))
        .flatMap((name) => readFileSync(join(JS_DIR, name), 'utf8')
            .split('\n')
            .map((line, index) => ({ name, line: index + 1, text: line }))
            .filter(({ text }) => whole.test(text.replace(/\/\/.*$/u, ''))))
        .map(({ name, line, text }) => `${name}:${line}: ${text.trim()}`);
    assert.deepEqual(sites.filter((site) => !site.startsWith('gstate.js:')),
        []);
    assert.equal(sites.length, 1);
});
