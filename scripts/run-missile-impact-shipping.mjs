#!/usr/bin/env node

// Source group: mthrowu.c ohitmon/drop_throw and dokick.c object shipping.
// Seed 8450001 was selected before constructing the cases. Seven genesis
// targets and a three-column wizard teleport create a missile interception.
// Early goblin/lichen and brown-mold probes encountered unrelated melee or
// passive-object boundaries. A bounded goblin/shrieker exploration over
// seeds 8450001-8450020 yielded no completed interception; changing the
// archer to a mountain centaur on the original seed produced this case.
// The shipping setup teleports to that seed's down stair. Pre-drop wait
// counts 0-5 were inspected; four waits first selected migration, without a
// floor pile. !verbose and the dropped object class are cheap variations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIGR_STAIRS_UP, OBJ_MIGRATING } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_SHRIEKER } from '../js/monsters.js';
import { APPLE, SPE_HEALING } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = [
    ['mthrowu.c', 'intercepted-bolt-visible'],
    ['mthrowu.c', 'intercepted-bolt-quiet'],
    ['dokick.c', 'drop-apples-downstairs'],
    ['dokick.c', 'drop-book-downstairs'],
];

export function loadMissileImpactShippingRecipes() {
    return cases.map(([source, label]) => ({ label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/${source}/${label}.session.json`, import.meta.url,
        ), 'utf8')),
    }));
}

export async function verifyMissileImpactShippingSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, undefined);
    if (segment.moves.includes('mountain centaur')) {
        const damaged = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.data === game.mons[PM_SHRIEKER]
                && monster.mhp < monster.mhpmax) damaged.push(monster);
        }
        assert.ok(damaged.length > 0, 'the bolt reached ohitmon on a shrieker');
        assert.equal(game.gt.thrownobj, null, 'drop_throw completed settlement');
    } else {
        const object = game.gm.migrating_objs;
        assert.ok(object, 'ship_object took the migration branch');
        assert.equal(object.where, OBJ_MIGRATING);
        assert.equal(object.otyp, segment.moves.endsWith('dj') ? APPLE : SPE_HEALING);
        assert.deepEqual([object.ox, object.oy, object.owornmask],
            [0, 2, MIGR_STAIRS_UP]);
        assert.match(game._ttyToplines, /falls? down the stairs\./u);
    }
}

export function runMissileImpactShippingMatrix() {
    return runFreshMatrix({ entries: loadMissileImpactShippingRecipes(),
        verifySegment: verifyMissileImpactShippingSegment,
        summaryLabel: 'MISSILE IMPACT AND SHIPPING', chunkLimit: 1 });
}

runMatrixCli(import.meta.url, runMissileImpactShippingMatrix, 'missile impact and shipping');
