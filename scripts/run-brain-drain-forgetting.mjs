#!/usr/bin/env node

// Independent incoming AD_DRIN cases for uhitm.c:mhitm_ad_drin. Fixed seeds
// were chosen before recording, without a seed scan. The Knight variation
// reaches the dunce-cap bypass; the second Wizard advances a real skill.
import assert from 'node:assert/strict';
import { decodeScreen } from '../frozen/screen-decode.mjs';
import { A_INT, NO_SPELL, P_BASIC, P_POLEARMS, P_QUARTERSTAFF } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { DUNCE_CAP } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    {
        name: 'brain-drain-spell-forgetting-wizard',
        seed: 128070411, datetime: '20560102030405',
        role: 'Wizard', gender: 'male', align: 'neutral',
        // Eight More keys complete levelchange's nine experience messages.
        // m. is the source forced-rest command when a hostile is adjacent.
        moves: ' #levelchange\n10\n        \u0007hostile mind flayer\nm.m.   m. ',
    },
    {
        name: 'brain-drain-advanced-quarterstaff-wizard',
        seed: 128070413, datetime: '20560203040506',
        role: 'Wizard', gender: 'female', align: 'neutral',
        // #enhance's debug y allows advancement without practice. Menu i is
        // quarterstaff; Space dismisses feedback, Escape closes the rebuilt menu.
        moves: ' #levelchange\n10\n        #enhance\nyi \u001b\u0007hostile mind flayer\nm.m.  m.   ',
    },
    {
        name: 'brain-drain-dunce-cap-knight',
        seed: 128070412, datetime: '20560102030405',
        role: 'Knight', gender: 'male', align: 'lawful',
        // The Knight's level-seven speed feedback needs one extra More key.
        // r advances polearms; Td removes starting helmet d, Wi wears wished
        // dunce cap i. The last rest needs ten More keys for five tentacles.
        moves: ' #levelchange\n10\n         #enhance\nyr \u001b\u0017dunce cap\nTd    Wi     \u0007hostile master mind flayer\nm.m.m.          ',
    },
];

export function loadBrainDrainForgettingRecipes() {
    return CASES.map(spec => ({
        name: spec.name,
        recipe: validateCleanRecipe({ version: 5, segments: [{
            seed: spec.seed,
            datetime: spec.datetime,
            comment: spec.name + ': independent C-first incoming brain-drain route; source uhitm.c:3168-3303.',
            nethackrc: `OPTIONS=name:BrainForget,role:${spec.role},race:human,gender:${spec.gender},align:${spec.align}\n`
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!autopickup,!acoustics,!debug_mongen\n',
            moves: spec.moves,
        }] }, spec.name),
    }));
}

export async function verifyBrainDrainForgettingSegment(segment) {
    const spec = CASES.find(candidate => candidate.seed === segment.seed);
    assert.ok(spec, 'the verifier has an independently selected recipe');
    const replay = await runSegment(segment);
    const topLines = replay.getScreens().map(screen => decodeScreen(screen)[0]
        .map(cell => cell.ch).join('').trimEnd());
    if (spec.role === 'Knight') {
        assert.equal(game.uarmh?.otyp, DUNCE_CAP);
        assert.ok(topLines.some(line => line.includes('Your cap constricts briefly, then relaxes again.')));
        // The cap skips eat_brains and refuses Int loss, leaving its base value.
        assert.equal(game.u.acurr.a[A_INT], game.u.amax.a[A_INT]);
        assert.equal(game.u.weapon_skills[P_POLEARMS].skill, P_BASIC);
    } else {
        assert.ok(topLines.some(line => line.includes('Your brain is eaten!')));
        const spells = game.svs.spl_book.filter(spell => spell.sp_id !== NO_SPELL);
        assert.ok(spells.some(spell => spell.sp_know === 0), 'incoming attack actually forgets a spell');
        if (spec.name.includes('advanced-quarterstaff')) {
            assert.ok(topLines.some(line => line.includes('You forget some of your training in quarterstaff.')));
            assert.equal(game.u.skills_advanced, 0); // The one real debug advance was drained.
            assert.equal(game.u.weapon_skills[P_QUARTERSTAFF].skill, P_BASIC);
        }
    }
}

export async function runBrainDrainForgettingMatrix() {
    return runFreshMatrix({
        entries: loadBrainDrainForgettingRecipes().map(({ name, recipe }) => ({ label: name, recipe })),
        verifySegment: verifyBrainDrainForgettingSegment,
        summaryLabel: 'INCOMING BRAIN DRAIN FORGETTING',
        chunkLimit: 1, // Every independent debug game owns its recorder installation.
    });
}

runMatrixCli(import.meta.url, runBrainDrainForgettingMatrix, 'incoming brain drain forgetting');
