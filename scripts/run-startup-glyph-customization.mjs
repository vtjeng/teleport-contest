#!/usr/bin/env node

// Fresh patched-C matrix for options.c optfn_glyph() through glyphs.c's
// generated G_*/S_* expansion, symset ownership, installed glyph-map state,
// object-description shuffling, first map, and the next command boundary.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRIMARYSET, ROGUESET } from '../js/const.js';
import {
    numeric_glyph_customization,
    glyph_find,
} from '../js/glyphs.js';
import { sourceGlyphNumber } from '../js/glyph_ids.js';
import { GLYPH_OBJ_OFF } from '../js/glyph_offsets.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20000110090000';

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

export const STARTUP_GLYPH_CUSTOMIZATION_CASES = Object.freeze([
    Object.freeze({
        label: 'G_male_healer Unicode and RGB',
        seed: 940101,
        rc: startupRc(
            'GlyphG',
            'symset:Enhanced1',
            'glyph:G_male_healer:U+2603/255-0-0',
        ),
        glyph: 'G_male_healer',
        expected: Object.freeze({ displayCh: '☃', rgb: [255, 0, 0] }),
    }),
    Object.freeze({
        label: 'S_human eight-range fanout',
        seed: 940105,
        rc: startupRc(
            'GlyphS',
            'symset:Enhanced1',
            'glyph:S_human:U+2602/blue',
        ),
        expanded: 'S_human',
        expected: Object.freeze({ displayCh: '☂', basicColor: 4 }),
    }),
    Object.freeze({
        label: 'S_altar cmap fanout',
        seed: 940107,
        rc: startupRc(
            'GlyphCmap',
            'symset:Enhanced1',
            'glyph:S_altar:U+2603/red',
        ),
        expanded: 'S_altar',
        expected: Object.freeze({ displayCh: '☃', basicColor: 1 }),
    }),
    Object.freeze({
        label: 'S_weapon generic object fanout',
        seed: 940109,
        rc: startupRc(
            'GlyphObject',
            'symset:Enhanced1',
            'glyph:S_weapon:U+2603/green',
        ),
        expanded: 'S_weapon',
        expected: Object.freeze({ displayCh: '☃', basicColor: 2 }),
    }),
    Object.freeze({
        label: 'later concrete record replaces class record',
        seed: 940111,
        rc: startupRc(
            'GlyphReplace',
            'symset:Enhanced1',
            'glyph:S_human:U+2601/blue',
            'glyph:G_male_healer:U+2603/black',
        ),
        glyph: 'G_male_healer',
        expected: Object.freeze({ displayCh: '☃', basicColor: 0 }),
    }),
    Object.freeze({
        label: 'customsymbols gate leaves color',
        seed: 940113,
        rc: startupRc(
            'GlyphNoSymbol',
            'symset:Enhanced1',
            '!customsymbols',
            'glyph:G_male_healer:U+2603/yellow',
        ),
        glyph: 'G_male_healer',
        expected: Object.freeze({ basicColor: 11 }),
    }),
    Object.freeze({
        label: 'customcolors gate leaves Unicode',
        seed: 940117,
        rc: startupRc(
            'GlyphNoColor',
            'symset:Enhanced1',
            '!customcolors',
            'glyph:G_male_healer:U+2603/1-2-3',
        ),
        glyph: 'G_male_healer',
        expected: Object.freeze({ displayCh: '☃' }),
    }),
    Object.freeze({
        label: 'last selected rogue set owns record',
        seed: 940119,
        rc: startupRc(
            'GlyphRogue',
            'symset:Enhanced1',
            'roguesymset:RogueIBM',
            'glyph:G_male_healer:U+2603/blue',
        ),
        glyph: 'G_male_healer',
        expected: null,
        owner: ROGUESET,
    }),
    Object.freeze({
        label: 'concrete object follows shuffled description',
        seed: 940121,
        rc: startupRc(
            'GlyphShuffle',
            'symset:Enhanced1',
            'glyph:G_long_sword:U+2603/black',
        ),
        shuffledObject: 'G_long_sword',
        expected: Object.freeze({ displayCh: '☃', basicColor: 0 }),
    }),
    Object.freeze({
        label: 'unaffiliated Unicode and color diagnostics',
        seed: 940123,
        rc: startupRc(
            'GlyphUnowned',
            'glyph:G_male_healer:U+2603/1-2-3',
            'glyph:G_male_healer:U+2602/4-5-6',
            // The recorder's temporary rc path in config_error_done() is not
            // a replay input. Fill tty before that summary, as the established
            // startup diagnostic matrices do, while retaining the two glyph
            // diagnostics at the head of the same source error frame.
            ...Array(12).fill('symset:NoSuchSymbols'),
        ),
        glyph: 'G_male_healer',
        expected: null,
        errors: 25,
        moves: '\n.',
    }),
]);

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: entry.rc,
        moves: entry.moves ?? '.',
    };
}

export function loadStartupGlyphCustomizationRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_GLYPH_CUSTOMIZATION_CASES.map(segmentFor),
    }, 'startup glyph customization recipe');
}

function caseFor(segment) {
    return STARTUP_GLYPH_CUSTOMIZATION_CASES.find((entry) => (
        segment.seed === entry.seed
        && segment.nethackrc === entry.rc
        && segment.moves === (entry.moves ?? '.')
    ));
}

function assertCustomization(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `${label} installed ${JSON.stringify(actual)}, not `
                + JSON.stringify(expected),
        );
    }
}

export async function verifyStartupGlyphCustomizationSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no glyph customization case owns segment');
    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.configErrorFrame.num_errors !== (entry.errors ?? 0)) {
        throw new Error(`${entry.label} has the wrong diagnostic count`);
    }
    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.iflags.pending_customizations) {
        throw new Error(`${entry.label} stopped before customization shuffle`);
    }

    if (entry.expanded) {
        const glyphs = glyph_find(entry.expanded);
        for (const glyph of glyphs) {
            assertCustomization(
                numeric_glyph_customization(glyph, game),
                entry.expected,
                `${entry.label} glyph ${glyph}`,
            );
        }
    } else if (entry.shuffledObject) {
        const sourceObject = sourceGlyphNumber(entry.shuffledObject)
            - GLYPH_OBJ_OFF;
        const destinations = game.objects.flatMap((object, index) => (
            object.oc_descr_idx === sourceObject ? [index] : []
        ));
        if (!destinations.length) {
            throw new Error(`${entry.label} found no shuffled destination`);
        }
        for (const destination of destinations) {
            assertCustomization(
                numeric_glyph_customization(GLYPH_OBJ_OFF + destination, game),
                entry.expected,
                `${entry.label} object ${destination}`,
            );
        }
    } else {
        const glyph = sourceGlyphNumber(entry.glyph);
        assertCustomization(
            numeric_glyph_customization(glyph, game),
            entry.expected,
            entry.label,
        );
    }

    if (entry.owner !== undefined) {
        const owned = game.gs.sym_customizations[entry.owner];
        if (!owned.unicode.details.length || !owned.color.details.length) {
            throw new Error(`${entry.label} lost its owned record`);
        }
        if (entry.owner !== PRIMARYSET
            && game.gs.sym_customizations[PRIMARYSET].unicode.details
                .some(({ glyph }) => glyph === sourceGlyphNumber(entry.glyph))) {
            throw new Error(`${entry.label} leaked into the primary owner`);
        }
    }
}

export async function runStartupGlyphCustomizationMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup glyph customization to next command',
            recipe: loadStartupGlyphCustomizationRecipe(),
        }],
        summaryLabel: 'STARTUP GLYPH CUSTOMIZATION',
        verifySegment: verifyStartupGlyphCustomizationSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupGlyphCustomizationMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup glyph customization: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
