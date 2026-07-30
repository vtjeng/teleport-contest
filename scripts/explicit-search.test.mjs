import assert from 'node:assert/strict';
import test from 'node:test';

import { SDOOR, isok } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { t_at } from '../js/trap.js';
import { loadExplicitSearchRecipe } from './run-explicit-search.mjs';

// cmd.c cmdlist[] binds `s` to dosearch(); extcmdlist[] names the same
// handler `search`, which the '#' prompt reaches.
const SEARCH_KEY = 's';
const SEARCH_BY_NAME = '#search\n';

function searchPresses(moves) {
    if (moves.startsWith(SEARCH_BY_NAME)) return 1;
    return [...moves].filter((key) => key === SEARCH_KEY).length;
}

function adjacentSecretDoors() {
    const { ux, uy } = game.u;
    let count = 0;
    for (let x = ux - 1; x < ux + 2; ++x)
        for (let y = uy - 1; y < uy + 2; ++y)
            if (isok(x, y) && game.level.at(x, y).typ === SDOOR) ++count;
    return count;
}

function adjacentUnseenTraps() {
    const { ux, uy } = game.u;
    let count = 0;
    for (let x = ux - 1; x < ux + 2; ++x)
        for (let y = uy - 1; y < uy + 2; ++y) {
            if (!isok(x, y)) continue;
            const trap = t_at(x, y, game);
            if (trap && !trap.tseen) ++count;
        }
    return count;
}

test('explicit-search matrix contains only source-selected inputs', () => {
    const recipe = loadExplicitSearchRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 13);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            searchPresses(segment.moves) > 0,
            'every segment issues the search command',
        );
    }
    // The command has two entry points and both have to stay covered: the
    // single bound key, and the extended-command prompt.
    assert.equal(
        recipe.segments.filter(
            ({ moves }) => moves.startsWith(SEARCH_BY_NAME),
        ).length,
        1,
    );
    // do.c cmd_safety_prevention() has two branches, one per cmdassist
    // setting, and only the `!cmdassist` one counts ga.already_found_flag.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('!cmdassist'),
        ).length,
        2,
    );
});

test('every matrix segment runs to its last keystroke', async () => {
    const { segments } = loadExplicitSearchRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            // The `#search` segment paints one screen per key of the typed
            // name too, so count keys rather than commands.
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('the matrix covers a found secret door and a found trap', async () => {
    const { segments } = loadExplicitSearchRecipe();
    let doorsFound = 0;
    let trapsFound = 0;
    for (const segment of segments) {
        // One segment walks before it searches. Replaying only that walk is
        // the state the searches start from; every other segment starts at
        // the first command prompt.
        const walk = [...segment.moves].findIndex(
            (key) => key === SEARCH_KEY || key === '#',
        );
        await runSegment({ ...segment, moves: segment.moves.slice(0, walk) });
        const secretBefore = adjacentSecretDoors();
        const hiddenBefore = adjacentUnseenTraps();

        await runSegment(segment);
        if (secretBefore > adjacentSecretDoors()) ++doorsFound;
        if (hiddenBefore > adjacentUnseenTraps()) ++trapsFound;
    }
    // Three secret-door segments and three trap segments, each of which must
    // still reach its discovery for the matrix to prove the arm. The
    // safe-wait segment starts beside a fourth secret door and must not find
    // it, because no search there is allowed to run.
    assert.equal(doorsFound, 3);
    assert.equal(trapsFound, 3);
});

test('a prevented search leaves the turn and the counter as C does', async () => {
    const { segments } = loadExplicitSearchRecipe();
    for (const segment of segments) {
        if (!segment.nethackrc.includes('!cmdassist')) continue;
        await runSegment(segment);
        // cmd_safety_prevention() increments the flag once per refusal and
        // returns before dosearch0(), so no turn passes.
        assert.equal(game.already_found_flag, searchPresses(segment.moves));
        assert.equal(game.moves, 1);
    }
});
