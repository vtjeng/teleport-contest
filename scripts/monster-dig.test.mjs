import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, DOOR, D_NODOOR, IS_STWALL, ROWNO } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { DWARVISH_MATTOCK, PICK_AXE, ROCK } from '../js/objects.js';
import { loadMonsterDigRecipe } from './run-monster-dig.mjs';

// The keys every segment is allowed to spend: the wizard-mode `^G` command and
// the species it types, then movement west and the search command. Nothing
// here changes terrain by itself, so a wall that stops being a wall was dug.
const SEGMENT_KEYS = new Set([...'\x07dwarf\nhs']);

function wallSquares() {
    const walls = new Set();
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if (IS_STWALL(game.level.at(x, y)?.typ)) walls.add(`${x},${y}`);
        }
    }
    return walls;
}

function diggingToolWielded() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        const weapon = monster.mw;
        if (weapon?.otyp === PICK_AXE || weapon?.otyp === DWARVISH_MATTOCK) {
            return weapon;
        }
    }
    return null;
}

test('monster-dig matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterDigRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 5);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Every segment needs wizard mode for the `^G` that creates the dwarf.
        assert.match(segment.nethackrc, /playmode:debug/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its keys on genesis, walking and searching',
        );
    }
    // mdig_tunnel()'s `flags.verbose && !rn2(5)` short circuit gets exactly one
    // segment; the rest leave verbose on so the draw is made.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('OPTIONS=!verbose\n'),
        ).length,
        1,
    );
});

test('every matrix segment wields a digging tool and digs a wall away',
    async () => {
        const { segments } = loadMonsterDigRecipe();
        for (const [index, segment] of segments.entries()) {
            // The same seed and rc with no keys generates the same level, so
            // this is the map before the dwarf exists.
            await runSegment({ ...segment, moves: '' });
            const before = wallSquares();

            const replay = await runSegment(segment);
            // The port emits one screen per consumed key plus the opening
            // prompt, so a segment that stops early emits fewer. Before this
            // behavior landed, every one of these stopped on the turn the
            // dwarf selected the wall square.
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );

            const dug = [...before].filter(
                (key) => !wallSquares().has(key),
            );
            assert.ok(
                dug.length > 0,
                `segment ${index} leaves a square that started as wall or `
                + 'stone dug open',
            );
            // m_digweapon_check() spends a whole move on this, so a segment
            // that dug without it would mean the dwarf tunneled bare-handed.
            const tool = diggingToolWielded();
            assert.ok(tool, `segment ${index} has a dwarf wielding its tool`);
            // A cursed tool would add weapon.c:906-914's second pline, which
            // the port refuses; these seeds were chosen for uncursed tools.
            assert.equal(tool.cursed, false, `segment ${index} tool is uncursed`);
        }
    });

// dig.c mdig_tunnel() (1465-1487) splits on the terrain it found. The two arms
// dungeon level one can reach are the wall arm, which leaves a doorless
// doorway, and the stone arm, which leaves a corridor and, for a rnd(12) roll
// under 5, a rock or a boulder on it. Both must appear across the matrix, or a
// port that implemented only one would still pass every segment above.
test('the matrix covers both of mdig_tunnel\'s reachable terrain arms',
    async () => {
        const { segments } = loadMonsterDigRecipe();
        let doorways = 0;
        let rockPiles = 0;
        for (const segment of segments) {
            await runSegment({ ...segment, moves: '' });
            const before = wallSquares();

            await runSegment(segment);
            for (const key of before) {
                const [x, y] = key.split(',').map(Number);
                const location = game.level.at(x, y);
                if (IS_STWALL(location.typ)) continue;
                if (location.typ === DOOR
                    && (location.flags || location.doormask || 0) === D_NODOOR) {
                    doorways++;
                }
                for (let obj = game.level.objects?.[x]?.[y];
                    obj;
                    obj = obj.nexthere) {
                    if (obj.otyp === ROCK) rockPiles++;
                }
            }
        }
        assert.ok(doorways > 0, 'a room wall became a doorless doorway');
        assert.ok(rockPiles > 0, 'digging stone left a rock pile behind');
    });
