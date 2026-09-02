// Replay the port alone over a range of seeds and keep the ones whose state
// satisfies a predicate. This is how a matrix script finds a seed whose
// generated level, monsters, or inventory reach a branch (see the "Seeds were
// found by ..." comments in scripts/run-*.mjs). It never records C: a no-key
// replay costs about 13 ms per seed against about 0.65 s for a fresh
// differential, so scan here and record only the seeds you keep.
//
// Usage, from a scratch script run at the repository root:
//
//   import { scanSeeds, seedRange } from './scripts/scan-port.mjs';
//   const { replayed, kept, stopped } = await scanSeeds({
//       seeds: seedRange(6600001, 6600600),
//       datetime: '20260214031500',
//       nethackrc: 'OPTIONS=name:Scan,role:Valkyrie,race:human,gender:female,align:neutral\n'
//           + 'OPTIONS=!legacy,!tutorial,!splash_screen\n',
//       keep: (game) => {
//           const loc = game.level.at(game.u.ux - 1, game.u.uy);
//           return loc.typ === DOOR && (loc.flags & D_CLOSED) ? loc.flags : false;
//       },
//   });
//
// `kept` lists each kept seed with the value `keep` returned, in seed order;
// `stopped` counts the seeds a fail-closed boundary ended before the keys ran
// out, by error class, so a scan that cannot reach its setup says so. State
// the range and the yield in the matrix script's comment.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

export function* seedRange(first, last) {
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)
        || first < 0 || last < first) {
        throw new Error(`seed range ${first}-${last} is not ascending and non-negative`);
    }
    for (let seed = first; seed <= last; ++seed) yield seed;
}

export async function scanSeeds({
    seeds,
    datetime,
    nethackrc,
    moves = '',
    keep,
    limit = Infinity,
}) {
    if (typeof keep !== 'function') throw new Error('scanSeeds needs a keep(game, seed) function');
    if (typeof datetime !== 'string' || typeof nethackrc !== 'string') {
        throw new Error('scanSeeds needs a datetime and nethackrc, as a recipe segment does');
    }
    const kept = [];
    const stopped = new Map();
    let replayed = 0;
    for (const seed of seeds) {
        let boundary = null;
        await runSegment(
            { seed, datetime, nethackrc, moves },
            { onBoundary: (error) => { boundary = error; } },
        );
        replayed++;
        if (boundary) {
            const name = boundary.name || boundary.constructor.name;
            stopped.set(name, (stopped.get(name) ?? 0) + 1);
            continue;
        }
        const value = keep(game, seed);
        if (value === false || value === undefined) continue;
        kept.push({ seed, value });
        if (kept.length >= limit) break;
    }
    return { replayed, kept, stopped };
}
