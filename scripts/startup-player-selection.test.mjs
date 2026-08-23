import assert from 'node:assert/strict';
import test from 'node:test';

import { VIA_DIALOG, VIA_PROMPTS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import {
    loadStartupPlayerSelectionRecipe,
    STARTUP_PLAYER_SELECTION_CASES,
    verifyStartupPlayerSelectionSegment,
} from './run-startup-player-selection.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function playerSelection(parsed) {
    return parsed.iflags.wc_player_selection;
}

test('player_selection starts in its zeroed dialog iflags field', () => {
    const parsed = parseNethackrc('');
    assert.equal(playerSelection(parsed), VIA_DIALOG);
    assert.equal(parsed.flags.player_selection, undefined);
});

test('player_selection accepts six-byte case-insensitive value prefixes',
    () => {
        for (const [value, expected] of [
            ['dialog', VIA_DIALOG],
            ['DIALOGUE', VIA_DIALOG],
            ['prompt', VIA_PROMPTS],
            ['PrOmPtS', VIA_PROMPTS],
            ['prompting', VIA_PROMPTS],
            ['prompter', VIA_PROMPTS],
        ]) {
            const parsed = parse(`player_selection:${value}`);
            assert.equal(playerSelection(parsed), expected, value);
            assert.equal(parsed.flags.player_selection, undefined, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('short and unknown values report and preserve prior state', () => {
    for (const value of ['dialo', 'promp', 'zqxj', '']) {
        const suffix = value === '' ? ':' : `:${value}`;
        const line = `OPTIONS=player_selection${suffix},`
            + 'player_selection:prompt';
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(playerSelection(parsed), VIA_PROMPTS, value);
        assert.equal(parsed.flags.player_selection, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' player_selection.',
            value === ''
                ? " * Line 1: Missing parameter for 'player_selection:'."
                : ` * Line 1: Unknown player_selection parameter '${value}'.`,
        ], value);
    }

    const bare = parseNethackrc(
        'OPTIONS=player_selection\nOPTIONS=player_selection:prompt\n',
    );
    assert.equal(playerSelection(bare), VIA_PROMPTS);
    assert.deepEqual(bare.configErrorFrame.output, [
        '\nOPTIONS=player_selection',
        " * Line 1: Missing parameter for 'player_selection'.",
        '\nOPTIONS=player_selection:prompt',
        ' * Line 2: compound option specified multiple times:'
            + ' player_selection.',
    ]);
});

test('parseoptions rejects player_selection negation before its handler',
    () => {
        const row = allopt.find(({ name }) => name === 'player_selection');
        assert.equal(row?.negateok, false);
        for (const negated of [
            '!player_selection',
            '!player_selection:',
            '!player_selection:prompt',
            '!player_s:dialog',
        ]) {
            const line = `OPTIONS=${negated},player_selection:prompt`;
            const parsed = parseNethackrc(`${line}\n`);
            assert.equal(playerSelection(parsed), VIA_PROMPTS, negated);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ' * Line 1: compound option specified multiple times:'
                    + ' player_selection.',
                ' * Line 1: The player_selection option may not both have a'
                    + ' value and be negated.',
            ], negated);
        }
    });

test('player_selection applies comma order right to left and later lines last',
    () => {
        const line = 'OPTIONS=player_selection:dialog,'
            + 'player_selection:prompt';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=player_selection:prompt',
        ].join('\n'));
        assert.equal(playerSelection(parsed), VIA_PROMPTS);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times:'
                + ' player_selection.',
            '\nOPTIONS=player_selection:prompt',
            ' * Line 2: compound option specified multiple times:'
                + ' player_selection.',
        ]);

        const sameLine = parse(line.slice('OPTIONS='.length));
        assert.equal(playerSelection(sameLine), VIA_DIALOG);
    });

test('the fresh player_selection matrix contains replay inputs only', () => {
    const recipe = loadStartupPlayerSelectionRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_PLAYER_SELECTION_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured player_selection reaches installed startup iflags', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupPlayerSelectionRecipe().segments)
            await verifyStartupPlayerSelectionSegment(segment);
    })
));

test('TTY hides the player_selection game-view option', () => (
    withSerializedGrids(async () => {
        const row = allopt.find(({ name }) => name === 'player_selection');
        assert.equal(row?.setwhere, 3);
        assert.equal(row?.negateok, false);
        assert.equal(row?.valok, true);

        await verifyStartupPlayerSelectionSegment(
            loadStartupPlayerSelectionRecipe().segments[1],
        );
        assert.equal(game.iflags.wc_player_selection, VIA_PROMPTS);
        const items = dosetMenuItems(game, {
            headingStyle: {},
            countBindKeys: () => 0,
        }, true);
        assert.equal(
            items.some(({ text }) => (
                text.trim().startsWith('player_selection ')
            )),
            false,
        );
    })
));
