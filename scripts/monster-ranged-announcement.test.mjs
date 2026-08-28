import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GENESIS_KEY,
    LAMP_NAME,
    loadMonsterRangedAnnouncementRecipe,
    verifyMonsterRangedAnnouncementSegment,
} from './run-monster-ranged-announcement.mjs';

test('monster-ranged-announcement matrix contains replay inputs only', () => {
    const recipe = loadMonsterRangedAnnouncementRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /OPTIONS=playmode:debug/u);
    assert.match(segment.nethackrc, /rest_on_space,!safe_wait/u);
    assert.equal(
        segment.moves,
        ` #wizwish\nspeed boots\nWe${GENESIS_KEY}goblin\n`
            + `lllllll#wizwish\nmagic lamp named ${LAMP_NAME}\n#rub\nf`,
    );
});

test('the matrix stops at the throw announcement message boundary',
    async () => {
        const [segment] = loadMonsterRangedAnnouncementRecipe().segments;
        await verifyMonsterRangedAnnouncementSegment(segment);
    });
