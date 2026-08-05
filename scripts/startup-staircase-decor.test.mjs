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
        // The pair crosses quiet/maximal calendars with off/on autopickup.
        assert.equal(segments.length, 2);
        assert.ok(segments.every(
            (segment) => !Object.hasOwn(segment, 'steps'),
        ));
        assert.deepEqual(
            segments.map((segment) => ({
                datetime: segment.datetime,
                autopickup: !segment.nethackrc.includes('!autopickup'),
                inputCount: segment.moves.length,
            })),
            [
                // One key dismisses welcome on the ordinary calendar date.
                {
                    datetime: '20340117112233',
                    autopickup: false,
                    inputCount: 1,
                },
                // Three keys dismiss welcome, full moon, and Friday messages.
                {
                    datetime: '20300913120000',
                    autopickup: true,
                    inputCount: 3,
                },
            ],
        );
    });

test('both startup routes stop at the first command with decor remembered',
    async () => {
        for (const segment of loadStartupStaircaseDecorRecipe().segments)
            await verifyStartupStaircaseDecorSegment(segment);
    });
