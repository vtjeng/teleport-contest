import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import { decodeUtf8ByteString } from '../js/hacklib.js';
import {
    STARTUP_DISCLOSE_CASES,
    STARTUP_DISCLOSE_NONASCII_SEGMENT,
    loadStartupDiscloseRecipe,
    STARTUP_DISCLOSE_SEGMENT,
    verifyStartupDiscloseSegment,
} from './run-startup-disclose.mjs';

function endDisclose(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

test('startup disclose recognizes its all and none forms', () => {
    for (const [statement, expected] of [
        ['disclose', 'yyyyyy'],
        ['!disclose', '------'],
        ['disclose:all', 'yyyyyy'],
        ['disclose:none', '------'],
    ]) {
        const parsed = endDisclose(statement);
        assert.equal(parsed.flags.end_disclose.join(''), expected, statement);
        assert.equal(parsed.flags.disclose, undefined, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }

    const negatedValue = endDisclose('!disclose:yi');
    assert.equal(negatedValue.flags.end_disclose.join(''), 'nnnnnn');
    assert.deepEqual(negatedValue.configErrorFrame.output, [
        '\nOPTIONS=!disclose:yi',
        ' * Line 1: The disclose option may not both have a value and be'
        + ' negated.',
    ]);
});

test('startup disclose applies settings, aliases, and source modifier rules',
    () => {
        const settings = endDisclose('disclose:yi na ?v #g +c -o');
        assert.equal(settings.flags.end_disclose.join(''), 'yn?#+-');
        assert.deepEqual(settings.configErrorFrame.output, []);

        const aliases = endDisclose('disclose:Yk #D');
        assert.equal(aliases.flags.end_disclose.join(''), 'nnynn+');

        // '?' and '#' retain their special sort-menu meanings only for the
        // vanquished and genocides positions; elsewhere C converts them.
        const converted = endDisclose('disclose:?i #a');
        assert.equal(converted.flags.end_disclose.join(''), 'y+nnnn');

        // optfn_disclose() keeps `num` at zero, so its fixed-array loop guard
        // does not stop the seventh byte.  The trailing '+i' rewrites the
        // first position after the six category letters have already run.
        const fullWalk = endDisclose('disclose:niagvco+i');
        assert.equal(fullWalk.flags.end_disclose.join(''), '++++++');

        // strcmpi() accepts only the complete special word.  This begins
        // with the same three bytes but instead reaches the ordinary scan,
        // writes 'a', and then rejects the following invalid byte.
        const allPrefix = endDisclose('disclose:allx');
        assert.equal(allPrefix.flags.end_disclose.join(''), 'n+nnnn');
        assert.deepEqual(allPrefix.configErrorFrame.output, [
            '\nOPTIONS=disclose:allx',
            " * Line 1: Unknown disclose parameter 'l'.",
        ]);
    });

test('startup disclose reports an invalid byte after preserving earlier writes',
    () => {
        const parsed = endDisclose('disclose:ni?ax');
        assert.equal(parsed.flags.end_disclose.join(''), 'nynnnn');
        assert.equal(parsed.flags.disclose, undefined);
        assert.deepEqual(parsed.configErrorFrame.output, [
            '\nOPTIONS=disclose:ni?ax',
            " * Line 1: Unknown disclose parameter 'x'.",
        ]);
    });

test('startup disclose rejects the first byte of a non-ASCII parameter', () => {
    const parsed = endDisclose('disclose:é');
    const invalid = decodeUtf8ByteString([0xC3]);
    assert.equal(parsed.flags.end_disclose.join(''), 'nnnnnn');
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\nOPTIONS=disclose:é',
        ` * Line 1: Unknown disclose parameter '${invalid}'.`,
    ]);
});

test('the startup disclose recipe reaches the seventh optionsfull page',
    async () => {
        const recipe = loadStartupDiscloseRecipe();
        assert.equal(recipe.version, 5);
        assert.deepEqual(
            recipe.segments,
            STARTUP_DISCLOSE_CASES.map(({ segment }) => segment),
        );
        assert.equal(Object.hasOwn(STARTUP_DISCLOSE_SEGMENT, 'steps'), false);
        assert.equal(STARTUP_DISCLOSE_SEGMENT.moves, ' mO      ');
        assert.equal(STARTUP_DISCLOSE_NONASCII_SEGMENT.moves, '\n ');
        for (const segment of recipe.segments)
            await verifyStartupDiscloseSegment(segment);
    });
