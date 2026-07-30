import assert from 'node:assert/strict';
import test from 'node:test';

import { SQKY_BOARD } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadMonsterSqueakyBoardRecipe,
} from './run-monster-squeaky-board.mjs';

// Every segment spends its whole turn budget on the search command, so the
// hero never moves and every recorded difference belongs to a monster.
const SEGMENT_KEYS = new Set(['s']);

// mondata.c mon_learns_traps() sets this bit on the victim after mintrap()'s
// early returns, and mons_see_trap() sets it on every onlooker. It is
// therefore the state that says a board actually fired, whether or not the
// hero was told about it.
const KNOWS_BOARD = 1 << (SQKY_BOARD - 1);

function monstersKnowingBoard() {
    let count = 0;
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if ((monster.mtrapseen ?? 0) & KNOWS_BOARD) ++count;
    }
    return count;
}

test('monster-squeaky-board matrix contains only source-selected inputs',
    () => {
        const recipe = loadMonsterSqueakyBoardRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 10);
        for (const segment of recipe.segments) {
            assert.equal(Object.hasOwn(segment, 'steps'), false);
            assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
            assert.ok(
                [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
                'every segment spends its turns on the search command',
            );
        }
        // The two gates that silence trap.c:1467's You_hear() line get their
        // own segments: Deaf, which the arm reads through youprop.h:125, and
        // !acoustics, which pline.c You_hear() reads for itself. Deaf gets a
        // second segment because it also selects the in-sight cringe arm.
        assert.equal(
            recipe.segments.filter(
                ({ nethackrc }) => nethackrc.includes('OPTIONS=deaf\n'),
            ).length,
            2,
        );
        assert.equal(
            recipe.segments.filter(
                ({ nethackrc }) => nethackrc.includes('OPTIONS=!acoustics\n'),
            ).length,
            1,
        );
        // Three segments give the hero a pet, and the last of them is the only
        // one in which the pet steps on the board itself.
        assert.equal(
            recipe.segments.filter(
                ({ nethackrc }) => nethackrc.includes('OPTIONS=pettype:dog\n'),
            ).length,
            3,
        );
    });

test('every matrix segment fires a squeaky board and replays to its last key',
    async () => {
        // Before this behavior landed, every one of these segments stopped on
        // the turn a monster stepped onto the board: the port emits one screen
        // per consumed key plus the opening prompt, so a segment that stops
        // early emits fewer.
        const { segments } = loadMonsterSqueakyBoardRecipe();
        for (const [index, segment] of segments.entries()) {
            await runSegment({ ...segment, moves: '' });
            assert.equal(
                monstersKnowingBoard(),
                0,
                `segment ${index} starts with no monster knowing the board`,
            );
            assert.ok(
                game.level.traps.some((trap) => trap.ttyp === SQKY_BOARD),
                `segment ${index} generates a squeaky board`,
            );

            const replay = await runSegment(segment);
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );
            assert.ok(
                monstersKnowingBoard() > 0,
                `segment ${index} fires the board under some monster`,
            );
        }
    });
