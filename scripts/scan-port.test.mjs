import assert from 'node:assert/strict';
import test from 'node:test';

import { DOOR, D_CLOSED } from '../js/const.js';
import { scanSeeds, seedRange } from './scan-port.mjs';

// The same character and clock as the kick matrix, so the door check below
// reads the level that scripts/run-kick-command.mjs found its seeds on.
const DATETIME = '20260214031500';
const NETHACKRC = 'OPTIONS=name:Scan,role:Valkyrie,race:human,gender:female,align:neutral\n'
    + 'OPTIONS=!legacy,!tutorial,!splash_screen\n';

test('seedRange is inclusive and rejects a descending or negative range', () => {
    assert.deepEqual([...seedRange(5, 7)], [5, 6, 7]);
    assert.deepEqual([...seedRange(9, 9)], [9]);
    assert.throws(() => [...seedRange(7, 5)], /not ascending/u);
    assert.throws(() => [...seedRange(-1, 5)], /non-negative/u);
});

test('scanSeeds replays every seed, keeps in order, and records the value', async () => {
    const seen = [];
    const { replayed, kept, stopped } = await scanSeeds({
        seeds: seedRange(6600001, 6600003),
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        // Every seed places the hero somewhere, so returning her column keeps
        // all three and shows the value comes from the replayed state.
        keep: (game, seed) => { seen.push(seed); return game.u.ux; },
    });
    assert.equal(replayed, 3);
    assert.deepEqual(seen, [6600001, 6600002, 6600003]);
    assert.deepEqual(kept.map(({ seed }) => seed), [6600001, 6600002, 6600003]);
    for (const { value } of kept) assert.ok(Number.isInteger(value) && value > 0);
    assert.equal(stopped.size, 0);
});

test('scanSeeds skips false and undefined and stops at the limit', async () => {
    const { replayed, kept } = await scanSeeds({
        seeds: seedRange(6600001, 6600010),
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        // Odd seeds are dropped two ways; even seeds are kept. The limit of 2
        // must end the scan after seed 6600004, before the fifth even seed.
        keep: (game, seed) => {
            if (seed % 2 === 1) return seed % 4 === 1 ? false : undefined;
            return true;
        },
        limit: 2,
    });
    assert.deepEqual(kept.map(({ seed }) => seed), [6600002, 6600004]);
    assert.equal(replayed, 4);
});

test('scanSeeds finds the closed door the kick matrix recorded against', async () => {
    // scripts/run-kick-command.mjs found seed 6600057 by scanning upward from
    // 6600001 for a closed door west of the hero, so the same predicate over
    // the same range must return that seed with dx -1.
    const { kept } = await scanSeeds({
        seeds: seedRange(6600050, 6600060),
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        keep: (game) => {
            const west = game.level.at(game.u.ux - 1, game.u.uy);
            return west?.typ === DOOR && (west.flags & D_CLOSED) ? -1 : false;
        },
    });
    assert.ok(kept.some(({ seed, value }) => seed === 6600057 && value === -1),
        `expected seed 6600057 among ${JSON.stringify(kept)}`);
});

test('a seed a boundary ends is counted by error class, not passed to keep', async () => {
    let keepCalls = 0;
    const { replayed, kept, stopped } = await scanSeeds({
        seeds: seedRange(6600001, 6600002),
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        // ^R is bound to redraw, which cmd.js admitParsedCommand() refuses, so
        // every seed ends at UnsupportedHeroCommandBoundaryError on its first
        // key.
        moves: '\x12',
        keep: () => { keepCalls++; return true; },
    });
    assert.equal(replayed, 2);
    assert.equal(kept.length, 0);
    assert.equal(keepCalls, 0);
    assert.deepEqual([...stopped], [['UnsupportedHeroCommandBoundaryError', 2]]);
});

test('scanSeeds refuses a missing predicate or segment field', async () => {
    await assert.rejects(
        scanSeeds({ seeds: [1], datetime: DATETIME, nethackrc: NETHACKRC }),
        /keep\(game, seed\)/u,
    );
    await assert.rejects(
        scanSeeds({ seeds: [1], nethackrc: NETHACKRC, keep: () => true }),
        /datetime and nethackrc/u,
    );
});
