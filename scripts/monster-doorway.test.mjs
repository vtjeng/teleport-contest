import assert from 'node:assert/strict';
import test from 'node:test';

import { DOOR, D_ISOPEN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadMonsterDoorwayRecipe } from './run-monster-doorway.mjs';

// Every segment spends its whole turn budget on the search command, so the
// hero never moves and every recorded difference belongs to a monster.
const SEGMENT_KEYS = new Set(['s']);

function doorwayOccupants() {
    const occupants = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        const location = game.level.at(monster.mx, monster.my);
        if (location?.typ !== DOOR) continue;
        occupants.push({
            mask: location.flags || location.doormask || 0,
            tame: Boolean(monster.mtame),
        });
    }
    return occupants;
}

test('monster-doorway matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterDoorwayRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 6);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its turns on the search command',
        );
    }
    // The three starting pets differ in speed and in size, and the pony is the
    // only one that carries anything, so each gets a segment.
    assert.deepEqual(
        recipe.segments
            .map(({ nethackrc }) => nethackrc.match(/pettype:(\w+)/u)[1])
            .filter((pettype, index, all) => all.indexOf(pettype) === index)
            .sort(),
        ['cat', 'dog', 'horse'],
    );
});

test('every matrix segment replays to its last key', async () => {
    // The port emits one screen per consumed key plus the opening prompt, so a
    // segment that stops early emits fewer. Before this behavior landed, every
    // one of these segments stopped on the turn a monster reached an open
    // doorway; the runner records the screen each stopped after.
    const { segments } = loadMonsterDoorwayRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('the visible-arrival segment ends with a monster on an open doorway',
    async () => {
        // Segment 3 is the case the matrix exists for: an untamed monster
        // stands on a D_ISOPEN doorway the hero can see. Pinning the square
        // here keeps the screen-count test above from being the only thing
        // that would notice the port declining to admit the destination.
        const segment = loadMonsterDoorwayRecipe().segments[3];
        await runSegment(segment);

        const untamed = doorwayOccupants().filter(({ tame }) => !tame);
        assert.equal(untamed.length, 1);
        assert.equal(untamed[0].mask, D_ISOPEN);
    });
