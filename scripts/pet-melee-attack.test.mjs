import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_FOX } from '../js/monsters.js';
import { CORPSE } from '../js/objects.js';
import {
    loadPetMeleeAttackRecipe,
    PET_MELEE_DATETIME,
    PET_MELEE_RC,
} from './run-pet-melee-attack.mjs';

test('the pet melee matrix carries replay inputs only', () => {
    const recipe = loadPetMeleeAttackRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 6);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.equal(segment.datetime, PET_MELEE_DATETIME);
        assert.equal(segment.nethackrc, PET_MELEE_RC);
        // One key, repeated: `rest_on_space` makes <space> the wait command
        // and it doubles as the --More-- dismissal, so nothing else is
        // pressed and no row can be reading a different command's behavior.
        assert.match(segment.moves, /^ +$/u);
    }
    // The seed list is the tripwire for a silent re-recording.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [7710013, 7710017, 7710019, 7710022, 7710023, 7710020],
    );
    assert.deepEqual(
        recipe.segments.map(({ moves }) => moves.length),
        [40, 40, 40, 40, 20, 27],
    );
    // The two options that make a one-key replay possible.
    assert.match(PET_MELEE_RC, /rest_on_space,!safe_wait/u);
});

// One row per segment, in recipe order. Every draw run below was read off the
// fresh C recording `node scripts/run-pet-melee-attack.mjs` makes, which
// passed with 6 segments, 23115 PRNG calls, 213 screens and 213 cursors.
//
// `runs` maps a step index to the contiguous runs of draws that step must
// contain, each in order. Only the monster-versus-monster calls are listed:
// the step also holds monmove.c and allmain.c draws that belong to other
// owners, and pinning those here would make this file fail for their reasons.
// A step whose combat calls are interrupted by another owner's -- the corpse
// row's mkobj.c next_ident() and rndmonst_adj() -- lists two runs rather than
// widening one to cover the gap.
const ROWS = [
    {
        // A grid bug dies to the first blow that lands, so hitmm(),
        // mdamagem() and the kill all sit in step 16 with no --More-- in
        // between. corpse_chance()'s divisor is 3 -- G_FREQ 1 raises it and
        // MZ_TINY raises it again -- and rn2(3)=1 declines the corpse.
        runs: {
            16: ['rnd(20)=4', 'd(1,6)=4', 'rn2(3)=1', 'rn2(6)=3',
                'rn2(3)=1', 'rnd(1)=1'],
        },
        // makemon.c grow_up() banks rnd(victim->m_lev + 1) whether or not the
        // killer gains a level, and a grid bug is a level-zero victim.
        petGrowth: 1,
        pile: [],
    },
    {
        // A kitten against a jackal. Step 18's landed blow opens dogmove.c
        // :1158's return attack on rn2(4)=3, and the jackal misses in its
        // turn, which is missmm() with the roles swapped.
        runs: {
            16: ['rnd(20)=20', 'rn2(3)=2'],
            18: ['rnd(20)=4', 'd(1,6)=2', 'rn2(3)=1', 'rn2(6)=1', 'rn2(3)=1',
                'rn2(4)=3', 'rnd(20)=6', 'rn2(3)=0'],
            24: ['rnd(20)=2', 'd(1,6)=5', 'rn2(3)=2', 'rn2(6)=2',
                'rn2(2)=1', 'rnd(1)=1'],
        },
        petGrowth: 1,
        pile: [],
    },
    {
        // A kobold zombie: mondata.h nonliving() picks monkilled()'s
        // "destroyed" verb, and its line blocks at a --More--, so
        // corpse_chance() and grow_up() land on the following key.
        runs: {
            28: ['rnd(20)=2', 'd(1,6)=6', 'rn2(3)=2', 'rn2(6)=4'],
            29: ['rn2(3)=2', 'rnd(1)=1'],
        },
        petGrowth: 1,
        pile: [],
    },
    {
        // The shortest fight here: one miss and one fatal blow.
        runs: {
            20: ['rnd(20)=11', 'rn2(3)=0'],
            21: ['rnd(20)=7', 'd(1,6)=6', 'rn2(3)=2', 'rn2(6)=2',
                'rn2(3)=2', 'rnd(1)=1'],
        },
        petGrowth: 1,
        pile: [],
    },
    {
        // The corpse row. Step 10 is a landed blow and a return attack that
        // lands too, and step 20's kill draws rn2(3)=0, so mondied() reaches
        // make_corpse() and mkobj.c start_corpse_timeout() spends five more
        // calls before grow_up().
        runs: {
            10: ['rnd(20)=1', 'd(1,6)=1', 'rn2(3)=2', 'rn2(6)=4', 'rn2(3)=1',
                'rn2(4)=1', 'rnd(20)=1', 'd(1,3)=1', 'rn2(3)=2', 'rn2(6)=3',
                'rn2(3)=1'],
            20: [
                ['rnd(20)=7', 'd(1,6)=6', 'rn2(3)=1', 'rn2(6)=5',
                    'rn2(3)=0'],
                ['rn2(1000)=981', 'rn2(4)=3', 'rne(4)=1', 'rn2(2)=0',
                    'rnz(10)=5', 'rnd(1)=1'],
            ],
        },
        petGrowth: 1,
        // PM_FOX is 13 in js/monsters.js; make_corpse() leaves one on the
        // square the fox died on.
        pile: [[CORPSE, PM_FOX, 1]],
    },
    {
        // A landed return attack again, and a kill on the following key.
        runs: {
            // The hostile's own attack on the hero sits between the pet's
            // miss and the blow it lands, so this step lists two runs.
            2: [['rnd(20)=15', 'rn2(3)=1'], ['rnd(20)=3']],
            3: ['d(1,6)=2', 'rn2(3)=1', 'rn2(6)=1', 'rn2(3)=1', 'rn2(4)=3',
                'rnd(20)=4', 'd(1,3)=2', 'rn2(3)=2', 'rn2(6)=5', 'rn2(3)=1'],
            4: ['rnd(20)=6', 'd(1,6)=1', 'rn2(3)=2', 'rn2(6)=3',
                'rn2(3)=1', 'rnd(1)=1'],
        },
        petGrowth: 1,
        pile: [],
    },
];

function containsRun(slice, run, label) {
    for (let start = 0; start + run.length <= slice.length; ++start) {
        let ok = true;
        for (let i = 0; i < run.length; ++i) {
            if (slice[start + i] !== run[i]) { ok = false; break; }
        }
        if (ok) return;
    }
    assert.fail(`${label}: ${run.join(' ')} is not a run of ${slice.join(' ')}`);
}

// Every corpse on the level, as `otyp,corpsenm,quan` strings so the set can
// be compared without depending on where each one lies.
function corpses() {
    const found = [];
    for (let x = 1; x < game.level.objects.length; ++x) {
        for (let y = 0; y < (game.level.objects[x]?.length ?? 0); ++y) {
            for (let obj = game.level.objects[x][y]; obj; obj = obj.nexthere)
                if (obj.otyp === CORPSE)
                    found.push(`${obj.otyp},${obj.corpsenm},${obj.quan}`);
        }
    }
    return found.sort();
}

function pet() {
    for (let mon = game.level.monlist; mon; mon = mon.nmon)
        if (mon.mtame) return mon;
    return null;
}

test('every pet fight spends its calls in source order', async () => {
    const recipe = loadPetMeleeAttackRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        const label = `segment ${index} (seed ${segment.seed})`;
        // The pet's starting maximum, before any kill raises it, and the
        // corpses mklev.c left on the floor, which some of these levels have.
        await runSegment({ ...segment, moves: '' });
        const before = pet().mhpmax;
        const generated = corpses();

        const replay = await runSegment(segment);
        // The port emits one screen per consumed key plus the opening prompt.
        // A segment that stopped early would emit fewer, and stopping early
        // is what an unported arm inside mattackm() would cause.
        assert.equal(replay.getScreens().length, segment.moves.length + 1,
                     `${label} replays every key`);

        const slices = replay.getRngSlices();
        for (const [step, expected] of Object.entries(ROWS[index].runs)) {
            const runs = Array.isArray(expected[0]) ? expected : [expected];
            for (const run of runs) {
                containsRun(slices[Number(step)] ?? [], run,
                            `${label} step ${step}`);
            }
        }

        const survivor = pet();
        assert.ok(survivor, `${label} kept its pet`);
        assert.equal(survivor.mhpmax - before, ROWS[index].petGrowth,
                     `${label} grow_up banked its point`);

        assert.deepEqual(corpses(), ROWS[index].pile.map(
            (row) => row.join(','),
        ).concat(generated).sort(), `${label} corpses`);
    }
});
