#!/usr/bin/env node

// Record and replay options.c optfn_packorder() and change_inv_order() from
// configuration-file startup through invent.c display_pickinv()'s class walk.
// Every segment opens the real `i` inventory menu, dismisses it, and looks at
// the staircase to capture the restored-map boundary after the menu.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { oc_to_str } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 4927813;
const DATETIME = '20360718094500';
const INVENTORY = 'i';
const CLOSE_AND_LOOK = '\x1b:';
const DUPLICATE_COUNT = 22;

function repeated(value) {
    return Array(DUPLICATE_COUNT).fill(value);
}

// The two reporting cases put at least 22 errors on the raw terminal.  That
// moves config_error_done()'s absolute configuration path below row 24, where
// the differential cannot compare a path runSegment() is not given.
export const PACKORDER_INVENTORY_CASES = Object.freeze([
    Object.freeze({
        label: 'gold omitted and forced first',
        optionLines: ['OPTIONS=packorder:%[)('],
        expectedOrder: '$%[)("?+!=/*`0_',
        expectedHeadings: Object.freeze([
            'Coins', 'Comestibles', 'Armor', 'Weapons', 'Tools',
            'Spellbooks', 'Potions', 'Wands',
        ]),
        reports: false,
    }),
    Object.freeze({
        label: 'explicit gold keeps its requested position',
        optionLines: ['OPTIONS=packorder:[%$)('],
        expectedOrder: '[%$)("?+!=/*`0_',
        expectedHeadings: Object.freeze([
            'Armor', 'Comestibles', 'Coins', 'Weapons', 'Tools',
            'Spellbooks', 'Potions', 'Wands',
        ]),
        reports: false,
    }),
    Object.freeze({
        label: 'repeated statements run right to left and fill prior order',
        optionLines: [
            `OPTIONS=${[
                'packorder:[%', ...repeated('packorder:)?'),
            ].join(',')}`,
        ],
        expectedOrder: '$[%)?"+!=/(*`0_',
        expectedHeadings: Object.freeze([
            'Coins', 'Armor', 'Comestibles', 'Weapons', 'Spellbooks',
            'Potions', 'Wands', 'Tools',
        ]),
        reports: true,
    }),
    Object.freeze({
        label: 'bad classes report while accepted classes remain',
        optionLines: [
            `OPTIONS=packorder:%[${'Z'.repeat(20)}].))))(`,
        ],
        expectedOrder: '$%[)("?+!=/*`0_',
        expectedHeadings: Object.freeze([
            'Coins', 'Comestibles', 'Armor', 'Weapons', 'Tools',
            'Spellbooks', 'Potions', 'Wands',
        ]),
        reports: true,
    }),
]);

function nethackrc(entry) {
    return [
        'OPTIONS=name:Packwright,role:Healer,race:human,gender:female,'
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...entry.optionLines,
        '',
    ].join('\n');
}

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry),
        moves: `${entry.reports ? '\n' : ''}${INVENTORY}${CLOSE_AND_LOOK}`,
    };
}

export function loadPackorderInventoryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: PACKORDER_INVENTORY_CASES.map(segmentFor),
    }, 'packorder inventory recipe');
}

function caseFor(segment) {
    const found = PACKORDER_INVENTORY_CASES.find(
        (entry) => nethackrc(entry) === segment.nethackrc
            && segmentFor(entry).moves === segment.moves,
    );
    if (!found) throw new Error('no packorder case owns the segment');
    return found;
}

function visibleRows() {
    return game.nhDisplay.grid.map(
        (row) => row.map(({ ch }) => ch).join('').trim(),
    );
}

export async function verifyPackorderInventorySegment(segment) {
    const entry = caseFor(segment);
    const throughInventory = segment.moves.indexOf(INVENTORY) + 1;
    let boundary = null;
    await runSegment({
        ...segment,
        moves: segment.moves.slice(0, throughInventory),
    }, { onBoundary: (error) => { boundary = error; } });
    if (boundary) throw boundary;

    const order = oc_to_str(game.flags.inv_order);
    if (order !== entry.expectedOrder) {
        throw new Error(
            `${entry.label} stored ${order}, not ${entry.expectedOrder}`,
        );
    }

    // The inventory menu is still open, so its rendered class headings prove
    // that ddoinv() reached display_pickinv() and consumed flags.inv_order.
    const rows = visibleRows();
    let prior = -1;
    for (const heading of entry.expectedHeadings) {
        const row = rows.indexOf(heading);
        if (row < 0) throw new Error(`${entry.label} omitted ${heading}`);
        if (row <= prior) {
            throw new Error(
                `${entry.label} rendered ${heading} outside packorder`,
            );
        }
        prior = row;
    }
}

export async function runPackorderInventoryMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup packorder to inventory',
            recipe: loadPackorderInventoryRecipe(),
        }],
        summaryLabel: 'PACKORDER INVENTORY',
        verifySegment: verifyPackorderInventorySegment,
    });
}

runMatrixCli(import.meta.url, runPackorderInventoryMatrix, 'packorder inventory');
