import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { DUST } from '../js/const.js';
import { engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    ENGRAVE_SETUP,
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
        // Eight rn2(25) corruption calls and make_engr_at()'s rn2(19)
        // Wisdom exercise occur before the ordinary elapsed-turn draws.
        assert.ok(replay.getRngLog().some(
            (entry) => entry.includes('rn2(19)'),
        ));
    });
