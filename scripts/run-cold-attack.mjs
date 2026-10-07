// Re-record independent uhitm.c:mhitm_ad_cold witnesses and check complete
// C/JS parity. Consecutive setup seeds were chosen before JS comparison;
// source-observed completed cold calls determined the recipe prefixes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MSLOW } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_FLESH_GOLEM, PM_IRON_GOLEM } from '../js/monsters.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    ['cold-hero-flesh-golem-frost-b132', PM_FLESH_GOLEM, true],
    ['cold-hero-iron-golem-frost-b132', PM_IRON_GOLEM, false],
    ['cold-monster-hero-wizard-b132'],
    ['cold-monster-hero-tourist-b132'],
    ['cold-monster-pair-ice-devil-flesh-golem-b132', PM_FLESH_GOLEM, true],
    ['cold-monster-pair-flesh-golem-no-sparkle-b132', PM_FLESH_GOLEM, true],
];

export async function runColdAttackMatrix() {
    const expectations = new WeakMap();
    const entries = CASES.map(([name, species, slowed]) => {
        const recipe = JSON.parse(readFileSync(
            new URL(`../recipes/uhitm.c/${name}.session.json`, import.meta.url), 'utf8'));
        if (species !== undefined)
            expectations.set(recipe.segments[0], { species, slowed });
        return { label: name, recipe };
    });
    return runFreshMatrix({
        entries, summaryLabel: 'Cold attacks',
        // Debug recipes retain a save file; isolate each fresh C segment.
        chunkLimit: 1,
        async verifySegment(segment) {
            await runSegment(segment);
            const expected = expectations.get(segment);
            if (!expected) return;
            let target = game.level.monlist;
            while (target && target.data.pmidx !== expected.species)
                target = target.nmon;
            assert.ok(target, 'cold attack defender remains on the level');
            // mon.c:golemeffects slows flesh golems for AD_COLD and leaves
            // iron golem speed unchanged. Inspect the production state value.
            assert.equal(target.mspeed === MSLOW, expected.slowed);
        },
    });
}

runMatrixCli(import.meta.url, runColdAttackMatrix, 'cold-attack');
