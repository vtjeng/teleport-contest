import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    UnsupportedHeroCommandBoundaryError,
} from '../js/cmd.js';
import { DUST } from '../js/const.js';
import { engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    ENGRAVE_SETUP,
    ENGRAVE_KEY,
    ENGRAVE_WAIT,
    ENTER_KEY,
    FINGERTIP_KEY,
    loadEngraveFingertipDustRecipe,
} from './run-engrave-fingertip-dust.mjs';

test('bare fingertips write a rate-10 dust engraving in one action',
    async () => {
        assert.ok(ADMITTED_COMMANDS.includes('engrave'));
        const recipe = loadEngraveFingertipDustRecipe();
        const baseline = {
            ...recipe.segments[0],
            moves: ENGRAVE_SETUP,
        };
        await runSegment(baseline);
        const baselineMoves = game.moves;
        const baselineLiteracy = game.u.uconduct.literate;

        const replay = await runSegment(recipe.segments[0]);
        const engraving = engr_at(game.u.ux, game.u.uy, game);

        // The complete recipe spends the opening wait, one engraving action,
        // and the final wait. The baseline spends only the opening wait.
        assert.equal(game.moves, baselineMoves + 2);
        assert.equal(game.u.uconduct.literate, baselineLiteracy + 1);
        assert.equal(engraving?.engr_type, DUST);
        assert.equal(engraving?.engr_txt?.[0], 'Elbereth');
        assert.equal(engraving?.eread, true);
        assert.equal(engraving?.erevealed, true);
        assert.equal(game.context.engraving.text, '');
        assert.equal(game.context.engraving.nextc, null);
        assert.equal(game.context.engraving.stylus, null);
        assert.equal(game.go.occupation, null);
        // The fresh C run at seed 42043 records eight source-ordered rn2(25)
        // corruption calls and then make_engr_at()'s rn2(19) Wisdom draw.
        // The six entries after this suffix belong to the ordinary turn tail.
        assert.deepEqual(replay.getRngLog().slice(-15, -6), [
            'rn2(25)=10',
            'rn2(25)=12',
            'rn2(25)=17',
            'rn2(25)=11',
            'rn2(25)=24',
            'rn2(25)=11',
            'rn2(25)=7',
            'rn2(25)=23',
            'rn2(19)=10',
        ]);
    });

test('a one-x signature preserves illiterate conduct', async () => {
    const segment = loadEngraveFingertipDustRecipe().segments[0];
    for (const [text, expectedLiteracy] of [
        // engrave.c exempts either case only when x is the sole nonspace.
        ['x', 0],
        ['X', 0],
        // Two letters are the nearest non-exempt control.
        ['xx', 1],
    ]) {
        await runSegment({
            ...segment,
            moves: `${ENGRAVE_SETUP}${ENGRAVE_KEY}${FINGERTIP_KEY}`
                + ` ${text}${ENTER_KEY}${ENGRAVE_WAIT}`,
        });
        assert.equal(game.u.uconduct.literate, expectedLiteracy, text);
    }
});

test('a refused engraving line restores status redraw ownership', async () => {
    const segment = loadEngraveFingertipDustRecipe().segments[0];
    let boundary;
    await runSegment({
        ...segment,
        // Ctrl-P is getline.c's first unsupported editing key. It throws
        // while windows.c getlin() owns gb.bot_disabled.
        moves: `${ENGRAVE_SETUP}${ENGRAVE_KEY}${FINGERTIP_KEY} \u0010`,
    }, { onBoundary: (error) => { boundary = error; } });

    assert.equal(
        boundary instanceof UnsupportedHeroCommandBoundaryError,
        true,
    );
    // cmdq stores command keys as character codes; 69 is uppercase E.
    assert.equal(
        game.context.pendingCommand?.key,
        ENGRAVE_KEY.charCodeAt(0),
    );
    assert.equal(game.gb.bot_disabled, false);
});
