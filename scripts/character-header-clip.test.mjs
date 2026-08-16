import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeUtf8ByteString } from '../js/hacklib.js';
import {
    HEADER_CASES,
    loadCharacterHeaderClipRecipe,
    verifyCharacterHeaderClipSegment,
} from './run-character-header-clip.mjs';

// role.c plsel_startmenu():2828 cuts svp.plname with "%.20s", and options.c
// nmcpy() lets it arrive at PL_NSIZ - 1 bytes long. Asserting those two
// numbers as properties of the four names, rather than restating the expected
// screens, means a matrix that drifted off the boundary fails here.
const HEADER_FIELD_BYTES = 20;
const PL_NSIZ = 32;

function nameBytes(plname) {
    return encodeUtf8ByteString(plname);
}

// The kept prefix ends inside a character when the first dropped byte is a
// UTF-8 continuation byte, 0x80 through 0xBF.
function splitsACharacter(plname) {
    const bytes = nameBytes(plname);
    return bytes.length > HEADER_FIELD_BYTES
        && bytes[HEADER_FIELD_BYTES] >= 0x80
        && bytes[HEADER_FIELD_BYTES] < 0xC0;
}

test('the header matrix straddles the twenty-byte cut', () => {
    const recipe = loadCharacterHeaderClipRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, HEADER_CASES.length);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));

    // The name is the only thing that differs between segments, so nothing
    // else about the recorded screens can explain a difference.
    assert.equal(new Set(recipe.segments.map(({ moves }) => moves)).size, 1);
    assert.equal(
        new Set(recipe.segments.map(({ seed, datetime }) => (
            `${seed} ${datetime}`
        ))).size,
        1,
    );
    for (const [index, segment] of recipe.segments.entries()) {
        assert.equal(
            segment.nethackrc.includes(`name:${HEADER_CASES[index].plname}`),
            true,
        );
        // nmcpy() would cut the name itself before the header ever saw it.
        assert.ok(
            nameBytes(HEADER_CASES[index].plname).length < PL_NSIZ,
            `case ${index} outgrew nmcpy()`,
        );
    }

    const measured = HEADER_CASES.map(({ plname }) => ({
        bytes: nameBytes(plname).length,
        units: plname.length,
        split: splitsACharacter(plname),
    }));
    // One name where the two counts agree, so the case pins the limit rather
    // than the unit, and it has to be longer than the limit to be cut at all.
    assert.ok(measured.some(({ bytes, units }) => (
        bytes === units && bytes > HEADER_FIELD_BYTES
    )), 'no case counts alike in bytes and code units');
    // One name at exactly the limit, which separates a cut at 20 bytes from
    // one at 19, and which must cost fewer code units to be worth recording.
    assert.ok(measured.some(({ bytes, units }) => (
        bytes === HEADER_FIELD_BYTES && units < HEADER_FIELD_BYTES
    )), 'no case sits exactly on the limit');
    // Both sides of the cut: one name the cut divides between characters and
    // one it divides inside a character. A cut counting code units would keep
    // either name whole.
    for (const split of [false, true]) {
        assert.ok(measured.some((entry) => (
            entry.bytes > HEADER_FIELD_BYTES
            && entry.units <= HEADER_FIELD_BYTES
            && entry.split === split
        )), `no over-limit case with split === ${split}`);
    }
});

test('every header case draws its cut field in the running game',
    async () => {
        for (const segment of loadCharacterHeaderClipRecipe().segments)
            await verifyCharacterHeaderClipSegment(segment);
    });
