import assert from 'node:assert/strict';
import test from 'node:test';

import { DART_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { DART } from '../js/objects.js';
import {
    loadMonsterDartTrapRecipe,
} from './run-monster-dart-trap.mjs';

// Every segment spends its whole turn budget on the search command, so the
// hero never moves and every recorded difference belongs to a monster.
const SEGMENT_KEYS = new Set(['s']);

// trap.c:1308 sets this bit the first time the trap shoots, and nothing in the
// port clears it, so it is the state that says a dart trap actually fired.
function firedDartTraps() {
    return game.level.traps.filter(
        (trap) => trap.ttyp === DART_TRAP && trap.once,
    );
}

// t_missile() creates exactly one dart per firing and thitm() places it on
// the victim's square, so a level-wide census counts the misses. Both roots
// are needed because a monster may pick the dart up again afterwards, which
// moves it off the floor list and into a pack.
function dartsOnLevel() {
    let count = 0;
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === DART) count += obj.quan;
    for (let mon = game.level.monlist; mon; mon = mon.nmon)
        for (let obj = mon.minvent; obj; obj = obj.nobj)
            if (obj.otyp === DART) count += obj.quan;
    return count;
}

test('monster-dart-trap matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterDartTrapRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its turns on the search command',
        );
    }
    // Four segments keep the hero alone, so the victim is always a wild
    // monster the hero happens to watch; the other five put a pet in the same
    // scan, which reaches postmov() through dog_move() instead of m_move().
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('OPTIONS=pettype:none\n'),
        ).length,
        4,
    );
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('OPTIONS=pettype:dog\n'),
        ).length,
        3,
    );
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('OPTIONS=pettype:cat\n'),
        ).length,
        2,
    );
});

test('every matrix segment fires a dart trap and replays to its last key',
    async () => {
        // Before this behavior landed, every one of these segments stopped on
        // the turn a monster stepped onto the trap: the port emits one screen
        // per consumed key plus the opening prompt, so a segment that stops
        // early emits fewer.
        const { segments } = loadMonsterDartTrapRecipe();
        for (const [index, segment] of segments.entries()) {
            await runSegment({ ...segment, moves: '' });
            assert.equal(
                firedDartTraps().length,
                0,
                `segment ${index} starts with no dart trap fired`,
            );
            const before = dartsOnLevel();
            assert.ok(
                game.level.traps.some((trap) => trap.ttyp === DART_TRAP),
                `segment ${index} generates a dart trap`,
            );

            const replay = await runSegment(segment);
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );
            assert.ok(
                firedDartTraps().length > 0,
                `segment ${index} fires a dart trap`,
            );
            // Every firing in this matrix misses, so each adds one dart to
            // the level. A segment that reached thitm()'s strike arm would
            // have stopped above instead, because that arm is refused.
            assert.ok(
                dartsOnLevel() > before,
                `segment ${index} leaves a missed dart on the level`,
            );
        }
    });
