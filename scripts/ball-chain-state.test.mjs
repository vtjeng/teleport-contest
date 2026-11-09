// C keeps the punishment ball and chain in the globals uball and uchain, and
// youprop.h defines Punished as (uball != 0). js/worn.js setworn() stores them
// on the game state as state.uball and state.uchain, and js/youprop.js
// Punished(state) reads state.uball. The hero record has no uball or uchain
// field and no punishment property, so a read of u.uball, u.uchain or
// u.uprops.punished is always empty. vault.c clear_fcorr()'s ball test once
// read them and never fired. This test fails when game code reads them again.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// `u.uball`, `u?.uchain`, `state.u.uball` and `uprops.punished` all match; a
// field of some other object, such as `menu.uball`, does not.
const STRAY_READ = /\bu\??\.u(?:ball|chain)\b|\buprops\??\.punished\b/gu;

// Matches of STRAY_READ in source, as `file:line: text`.
export function strayBallReads(source, file = '<source>') {
    const findings = [];
    for (const match of source.matchAll(STRAY_READ)) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push(`${file}:${line}: ${match[0]}`);
    }
    return findings;
}

test('game code reads the ball and chain from the game state', () => {
    const findings = readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .flatMap((name) => strayBallReads(
            readFileSync(join(JS_DIR, name), 'utf8'), `js/${name}`));
    assert.deepEqual(findings, []);
});

test('the scan finds each form of a stray read and spares the real fields',
    () => {
        assert.deepEqual(
            strayBallReads([
                'if (u.uball) x();',
                'const c = state.u.uchain;',
                'state.u?.uball.bypass = false;',
                'if (state.u.uprops?.punished?.intrinsic) y();',
                'if (state.uball && state.uchain) z();',
                'const ball = menu.uball;',
            ].join('\n')),
            [
                '<source>:1: u.uball',
                '<source>:2: u.uchain',
                '<source>:3: u?.uball',
                '<source>:4: uprops?.punished',
            ],
        );
    });
