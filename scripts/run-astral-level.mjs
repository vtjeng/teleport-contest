import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CONFLICT, STRAT_APPEARMSG, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { is_mplayer } from '../js/mondata.js';
import { PM_ANGEL } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyAstralSegment(segment) {
    let boundary;
    const output = await runSegment(segment, {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.uz.dnum, game.astral_level.dnum);
    assert.equal(game.u.uz.dlevel, game.astral_level.dlevel);

    const monsters = linkedItems(game.level.monlist, 'nmon');
    const mplayers = monsters.filter((monster) => is_mplayer(monster.data));
    // mplayer.c create_mplayers() requests three through six endgame players.
    assert.ok(mplayers.length >= 3 && mplayers.length <= 6);
    assert.ok(mplayers.every((monster) => monster.m_lev >= 15
        && monster.m_lev <= 30 && monster.mhp === monster.mhpmax));

    const conflict = game.u.uprops[CONFLICT];
    const conflictActive = Boolean(
        (conflict?.intrinsic & TIMEOUT) || conflict?.extrinsic,
    );
    const transcript = output.getScreens().join('\n');
    if (conflictActive) {
        // This message is emitted only by gain_guardian_angel's Conflict arm,
        // which calls lose_guardian_angel to create hostile replacements.
        assert.match(transcript, /A voice booms:/u);
        assert.match(transcript,
            /Thy desire for conflict shall be fulfilled!/u);
    } else {
        const guardian = monsters.find((monster) => monster.mnum === PM_ANGEL
            && monster.isminion && !(monster.mstrategy & STRAT_APPEARMSG));
        assert.ok(guardian);
        // gain_guardian_angel clears this flag after mk_roamer returns.
        assert.equal(guardian.mpeaceful, true);
        assert.match(transcript, /Thou hast been worthy of me!/u);
    }
}

export function runAstralLevelMatrix() {
    const entries = [
        'special-true-endgame-cfirst',
        'special-true-conflict-endgame-cfirst',
    ].map((label) => {
        const recipePath = new URL(
            `../recipes/mplayer.c/${label}.session.json`, import.meta.url,
        );
        return { label, recipe: validateCleanRecipe(
            JSON.parse(readFileSync(recipePath, 'utf8')), recipePath.pathname,
        ) };
    });
    return runFreshMatrix({
        entries,
        chunkLimit: 1,
        summaryLabel: 'ASTRAL ENDGAME MPLAYER CREATION',
        verifySegment: verifyAstralSegment,
    });
}

runMatrixCli(import.meta.url, runAstralLevelMatrix,
    'Astral special-level and endgame mplayer creation');
