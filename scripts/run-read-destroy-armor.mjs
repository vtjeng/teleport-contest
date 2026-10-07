#!/usr/bin/env node

// Record and replay read.c's one-worn-flammable-armor destroy-arm branch.
// Valkyrie's starting shield is removed first, so the wished leather armor is
// the only worn armor when the scroll effect selects its victim.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { MAX_ERODE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { LEATHER_ARMOR, LEATHER_CLOAK } from '../js/objects.js';
import { runDifferential, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const WIZWISH = '\x17'; // cmd.c's C('w') binding for wiz_wish().
const WAIT = '.';
const TAKEOFF = 'T';
const WEAR = 'W';
const READ = 'r';
const ARMOR_SLOT = 'e'; // Valkyrie's wished armor follows four starting items.
const SCROLL_SLOT = 'f'; // The wished scroll follows the wished armor.
const MORE = ' ';

function wish(objectName) {
    return `${WIZWISH}${objectName}\n`;
}

export function loadReadDestroyArmorRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Fresh seed/date and a fixed character keep this case independent
            // of the development witness while preserving its C preconditions.
            seed: 9048171,
            datetime: '20310203040506',
            nethackrc: [
                'OPTIONS=name:ReadBurn,role:Valkyrie,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=playmode:debug,pettype:none,!autopickup,!acoustics',
                '',
            ].join('\n'),
            // Take off the starting shield, wish and wear one leather suit,
            // then wish and read the unknown-label destroy armor scroll. The
            // space dismisses the pending first smoulder line so the second
            // source-ordered hit can print before the independent wait.
            moves: `${WAIT}${TAKEOFF}${wish('leather armor')}`
                + `${WEAR}${ARMOR_SLOT}${wish('scroll of destroy armor')}`
                + `${READ}${SCROLL_SLOT}${MORE}${WAIT}`,
        }],
    }, 'read destroy-armor recipe');
}

// Cloak and suit variations select the Cloak_off and Armor_off owners.
// Fixed C-first inputs ensure destruction on the first selected armor hit.
export const WORN_DESTRUCTION_CASES = [
    { name: 'erode-destroy-worn-cloak', slot: 'uarmc', type: LEATHER_CLOAK },
    { name: 'erode-destroy-worn-suit', slot: 'uarm', type: LEATHER_ARMOR },
];

export function loadWornDestructionRecipe(name) {
    assert.ok(WORN_DESTRUCTION_CASES.some(entry => entry.name === name));
    return validateCleanRecipe(JSON.parse(readFileSync(
        new URL(`../recipes/trap.c/${name}.recipe.session.json`, import.meta.url),
        'utf8',
    )), name);
}

async function verifyWornDestruction(segment) {
    const entry = WORN_DESTRUCTION_CASES.find(candidate =>
        loadWornDestructionRecipe(candidate.name).segments[0].seed === segment.seed);
    if (!entry) return;
    // `rf .` reads inventory letter f, acknowledges the pending scroll line,
    // then waits after removal. The worn item is letter e in u_init's order.
    const readStart = segment.moves.lastIndexOf('rf .');
    assert.ok(readStart >= 0, `${entry.name}: missing read boundary`);
    await runSegment({ ...segment, moves: segment.moves.slice(0, readStart) });
    assert.equal(game[entry.slot]?.otyp, entry.type);
    assert.equal(game[entry.slot]?.oeroded, MAX_ERODE);
    await runSegment(segment);
    assert.equal(game[entry.slot], null);
    for (let obj = game.invent; obj; obj = obj.nobj)
        assert.notEqual(obj.otyp, entry.type, 'destroyed armor remains carried');
    assert.ok(!game.unported.has('steal.c remove_worn_item'));
}

export async function runReadDestroyArmorMatrix() {
    const result = await runFreshMatrix({
        entries: [
            {
                label: 'one worn flammable armor destroy-armor read',
                recipe: loadReadDestroyArmorRecipe(),
            },
            ...WORN_DESTRUCTION_CASES.map(entry => ({
                label: entry.name, recipe: loadWornDestructionRecipe(entry.name),
            })),
        ],
        summaryLabel: 'READ DESTROY ARMOR',
        chunkLimit: 1,
        verifySegment: verifyWornDestruction,
        runDifferentialFn: async recipe => {
            const entry = WORN_DESTRUCTION_CASES.find(candidate =>
                loadWornDestructionRecipe(candidate.name).segments[0].seed
                    === recipe.segments[0].seed);
            let recording;
            const differential = await runDifferential(recipe, process.env, {
                transformRecording: raw => { recording = raw; return raw; },
            });
            if (entry) {
                mkdirSync('.cache/erode-worn-fresh', { recursive: true });
                writeFileSync(`.cache/erode-worn-fresh/${entry.name}.json`,
                    JSON.stringify(differential, null, 2) + '\n');
                if (differential.passed) {
                    mkdirSync('recordings/trap.c', { recursive: true });
                    writeFileSync(`recordings/trap.c/${entry.name}.session.json`,
                        JSON.stringify(recording, null, 2) + '\n');
                }
            }
            return differential;
        },
    });
    if (result.passed) assert.equal(result.totals.segments,
        1 + WORN_DESTRUCTION_CASES.length);
    return result;
}

runMatrixCli(import.meta.url, runReadDestroyArmorMatrix, 'read destroy armor');
