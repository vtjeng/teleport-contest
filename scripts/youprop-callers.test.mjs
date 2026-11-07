// Source-pinned tests for the sites where a private copy of a youprop.h
// macro answered differently from C and no cheap recorded game reaches
// the difference. Each test reads the C caller, confirms which macro it
// uses, and checks that the port's caller calls that youprop.js macro.
// The behaviour of each macro is pinned by scripts/youprop.test.mjs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The body of the C function `name`, from its definition line to the
// closing brace in column 0.
function cBody(source, name) {
    const start = source.search(new RegExp(`^${name}\\(`, 'mu'));
    assert.ok(start >= 0, `C defines ${name}()`);
    return source.slice(start, source.indexOf('\n}\n', start));
}

// The body of the JavaScript function `name`.
function jsBody(source, name) {
    const start = source.search(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'mu'));
    assert.ok(start >= 0, `js defines ${name}()`);
    return source.slice(start, source.indexOf('\n}\n', start));
}

const count = (text, pattern) => (text.match(pattern) ?? []).length;

test('vault.c invault() and gd_move() read Blind, which lenses defeat', () => {
    // Blind is (HBlinded || EBlinded) && !BBlinded (youprop.h:103): the Eyes
    // of the Overworld let a blinded hero see the guard arrive. vault.js
    // used (HBlinded || EBlinded) alone. C reads Blind seven times in
    // invault() and twice in gd_move(), and no other blindness macro.
    const c = read('nethack-c/upstream/src/vault.c');
    const js = read('js/vault.js');
    for (const [name, uses] of [['invault', 7], ['gd_move', 2]]) {
        const cText = cBody(c, name);
        assert.equal(count(cText, /\bBlind\b/gu), uses, `C ${name}() reads Blind`);
        assert.equal(count(cText, /\bBlinded\b|\bBlindfolded\b/gu), 0);
        assert.equal(count(jsBody(js, name), /\bBlind\(state\.u\)/gu), uses,
            `vault.js ${name}() calls youprop.js Blind()`);
    }
    assert.doesNotMatch(js, /function \w*Blind\w*\(/u, 'vault.js keeps no blindness copy');
});

test('priest.c intemple() and priest_talk() read Hallucination, which resistance defeats', () => {
    // Hallucination is HHallucination && !Halluc_resistance (youprop.h:120).
    // priest.js tested HHallucination alone, so a hallucinating hero holding
    // Grayswandir got a random currency for the priest's ale money, and in
    // the Sanctum the intoning priest's name kept "of Moloch". A recorded
    // game would need a temple and its priest within a short recipe.
    const c = read('nethack-c/upstream/src/priest.c');
    const js = read('js/priest.js');
    for (const name of ['intemple', 'priest_talk']) {
        assert.equal(count(cBody(c, name), /\bHallucination\b/gu), 1, `C ${name}() reads Hallucination`);
        assert.equal(count(cBody(c, name), /\bHHallucination\b/gu), 0);
        assert.equal(count(jsBody(js, name), /\bHallucination\(state\.u\)/gu), 1,
            `priest.js ${name}() calls youprop.js Hallucination()`);
    }
    assert.doesNotMatch(js, /function \w*Halluc\w*\(/u, 'priest.js keeps no hallucination copy');
});
