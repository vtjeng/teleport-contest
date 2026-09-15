#!/usr/bin/env node

// Fresh differential matrix for rumors.c outrumor() through eat.c fpostfx().
// The two roles use independently chosen seeds, dates and names while keeping
// the Fortune Cookie action at a one-turn meal.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function nethackrc({ name, role, align }) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:male,align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen,!autopickup,!acoustics,pettype:none',
        '',
    ].join('\n');
}

function segment({ seed, datetime, name, role, align, cookieLetter }) {
    return {
        seed,
        datetime,
        nethackrc: nethackrc({ name, role, align }),
        // The two spaces dismiss the meal's first More and the cookie's
        // combined fortune notice; the final rumor is left visible.
        moves: `.e${cookieLetter}  `,
    };
}

export function loadOutrumorRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            segment({
                seed: 7818001,
                datetime: '20320101090000',
                name: 'RumorScout',
                role: 'Tourist',
                align: 'neutral',
                cookieLetter: 'e',
            }),
            segment({
                seed: 7818002,
                datetime: '20320102090000',
                name: 'RumorMonk',
                role: 'Monk',
                align: 'neutral',
                cookieLetter: 'h',
            }),
        ],
    }, 'outrumor Fortune Cookie recipe');
}

export async function runOutrumorMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'outrumor Fortune Cookie',
            recipe: loadOutrumorRecipe(),
        }],
        summaryLabel: 'OUTRUMOR FORTUNE COOKIE',
        chunkLimit: 2,
    });
}

runMatrixCli(import.meta.url, runOutrumorMatrix, 'outrumor');
