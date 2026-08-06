import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadStartupStaircaseDecorRecipe,
    verifyStartupStaircaseDecorSegment,
} from './run-startup-staircase-decor.mjs';

test('startup staircase recipe crosses calendar and autopickup partitions',
    () => {
        const { segments, version } = loadStartupStaircaseDecorRecipe();
        // Version 5 stores replay inputs and contains no recorded C answers.
        assert.equal(version, 5);
        // The matrix crosses quiet/maximal calendars, autopickup, and the
        // source's terse describe_decor() wording.
        assert.equal(segments.length, 3);
        assert.ok(segments.every(
            (segment) => !Object.hasOwn(segment, 'steps'),
        ));
        assert.deepEqual(
            segments.map((segment) => ({
                datetime: segment.datetime,
                autopickup: !segment.nethackrc.includes('!autopickup'),
                inputCount: segment.moves.length,
                wording: segment.nethackrc.includes('!verbose')
                    ? 'terse' : 'verbose',
            })),
            [
                // One key dismisses welcome on the ordinary calendar date.
                {
                    datetime: '20340117112233',
                    autopickup: false,
                    inputCount: 1,
                    wording: 'verbose',
                },
                // Three keys dismiss welcome, full moon, and Friday messages.
                {
                    datetime: '20300913120000',
                    autopickup: true,
                    inputCount: 3,
                    wording: 'verbose',
                },
                // The third route is the ordinary-calendar terse complement.
                {
                    datetime: '20340117112233',
                    autopickup: false,
                    inputCount: 1,
                    wording: 'terse',
                },
            ],
        );
    });

test('all three startup routes stop at the first command with decor remembered',
    async () => {
        for (const segment of loadStartupStaircaseDecorRecipe().segments)
            await verifyStartupStaircaseDecorSegment(segment);
    });
