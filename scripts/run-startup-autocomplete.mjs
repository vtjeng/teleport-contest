#!/usr/bin/env node

// Record and replay cfgfiles.c cnf_line_AUTOCOMPLETE() and cmd.c
// parseautocomplete() from startup through the #optionsfull count and the
// typed extended-command completion hook.

import {
    count_autocompletions,
    extcmds_match,
} from '../js/cmd_autocomplete.js';
import {
    AUTOCOMPLETE,
    AUTOCOMP_ADJ,
    ECM_NOFLAGS,
    extcmdlist,
} from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 8451209;
const DATETIME = '20360417084200';
const OPEN_AND_DISMISS_FULL_OPTIONS = ' mO       \x1b';

export const STARTUP_AUTOCOMPLETE_CASES = Object.freeze([
    Object.freeze({
        label: 'ordinary command enabled',
        optionLines: Object.freeze(['AUTOCOMPLETE=apply']),
        count: 1,
        prefix: 'ap',
        prompt: '# apply',
        flags: Object.freeze({ apply: AUTOCOMPLETE | AUTOCOMP_ADJ }),
        waits: 0,
    }),
    Object.freeze({
        label: 'compiled command disabled',
        optionLines: Object.freeze(['AUTOCOMPLETE=!terrain']),
        count: 1,
        prefix: 'ter',
        prompt: '# ter',
        flags: Object.freeze({ terrain: AUTOCOMP_ADJ }),
        waits: 0,
    }),
    Object.freeze({
        label: 'mixed separators repeat and revert',
        optionLines: Object.freeze([
            'AUTOCOMPLETE=apply,,!terrain:terrain',
            'AUTOCOMPLETE=!apply,terrain',
            'AUTOCOMPLETE=!apply,terrain',
        ]),
        count: 0,
        prefix: 'ap',
        prompt: '# ap',
        flags: Object.freeze({ apply: 0, terrain: AUTOCOMPLETE }),
        waits: 0,
    }),
    Object.freeze({
        label: 'minimum statement prefix and empty elements',
        optionLines: Object.freeze(['AUTOC= , :']),
        count: 0,
        prefix: 'wai',
        prompt: '# wai',
        flags: Object.freeze({ wait: 0 }),
        waits: 0,
    }),
    Object.freeze({
        label: 'wizard and internal rows change but stay filtered',
        optionLines: Object.freeze([
            'AUTOCOMPLETE=!levelchange,clicklook',
        ]),
        count: 2,
        prefix: 'lev',
        prompt: '# lev',
        flags: Object.freeze({
            levelchange: AUTOCOMP_ADJ,
            clicklook: AUTOCOMPLETE | AUTOCOMP_ADJ,
        }),
        waits: 0,
    }),
    Object.freeze({
        label: 'case-sensitive invalid name',
        optionLines: Object.freeze(['AUTOCOMPLETE=Apply']),
        count: 0,
        prefix: 'ap',
        prompt: '# ap',
        flags: Object.freeze({ apply: 0 }),
        waits: 1,
        error: "Bad autocomplete: invalid extended command 'Apply'.",
    }),
    Object.freeze({
        label: 'invalid empty negation precedes valid earlier element',
        optionLines: Object.freeze(['AUTOCOMPLETE=apply,!']),
        count: 1,
        prefix: 'ap',
        prompt: '# apply',
        flags: Object.freeze({ apply: AUTOCOMPLETE | AUTOCOMP_ADJ }),
        waits: 1,
        error: "Bad autocomplete: invalid extended command ''.",
    }),
    Object.freeze({
        label: 'two invalid elements wait in recursive source order',
        optionLines: Object.freeze(['AUTOCOMPLETE=Apply,app']),
        count: 0,
        prefix: 'ap',
        prompt: '# ap',
        flags: Object.freeze({ apply: 0 }),
        waits: 2,
        errors: Object.freeze([
            "Bad autocomplete: invalid extended command 'app'.",
            "Bad autocomplete: invalid extended command 'Apply'.",
        ]),
    }),
]);

function nethackrc(entry) {
    return [
        'OPTIONS=name:Completer,role:Ranger,race:human,gender:female,'
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:bold',
        ...entry.optionLines,
        '',
    ].join('\n');
}

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry),
        moves: '\n'.repeat(entry.waits)
            + OPEN_AND_DISMISS_FULL_OPTIONS
            + `#${entry.prefix}\x1b\x1b.`,
    };
}

export function loadStartupAutocompleteRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_AUTOCOMPLETE_CASES.map(segmentFor),
    }, 'startup autocomplete recipe');
}

function caseFor(segment) {
    return STARTUP_AUTOCOMPLETE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function commandIndex(name) {
    return extcmdlist.findIndex((entry) => entry.ef_txt === name);
}

function autocompleteCountValue(items) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith('autocompletions '),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

function firstRawLine(replay) {
    const first = replay.getScreens()[0];
    if (!first) return null;
    return JSON.parse(first)[0].map(({ ch }) => ch).join('').trimEnd();
}

function replayHasPrompt(replay, prompt) {
    return replay.getScreens().some((screen) => {
        if (!screen) return false;
        return JSON.parse(screen)[0]
            .map(({ ch }) => ch).join('').trimEnd() === prompt;
    });
}

export async function verifyStartupAutocompleteSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup autocomplete case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.unportedConfigStatements.includes('autocomplete')) {
        throw new Error(`${entry.label} left AUTOCOMPLETE unported`);
    }
    if (parsed.configErrorFrame.num_errors !== 0) {
        throw new Error(`${entry.label} produced a configuration error`);
    }
    const waits = parsed.startupEvents.filter(({ wait }) => wait);
    if (waits.length !== entry.waits) {
        throw new Error(`${entry.label} queued ${waits.length} raw waits`);
    }
    const expectedErrors = entry.errors ?? (entry.error ? [entry.error] : []);
    if (JSON.stringify(waits.map(({ text }) => text))
        !== JSON.stringify(expectedErrors)) {
        throw new Error(`${entry.label} queued the wrong raw errors`);
    }

    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (count_autocompletions(game) !== entry.count) {
        throw new Error(
            `${entry.label} counted ${count_autocompletions(game)}, not `
                + `${entry.count}`,
        );
    }
    for (const [name, expectedBits] of Object.entries(entry.flags)) {
        const index = commandIndex(name);
        const actualBits = game.extcmdFlags[index]
            & (AUTOCOMPLETE | AUTOCOMP_ADJ);
        if (actualBits !== expectedBits) {
            throw new Error(
                `${entry.label} stored ${name} bits ${actualBits}, not `
                    + `${expectedBits}`,
            );
        }
    }

    const menuValue = autocompleteCountValue(dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false));
    if (menuValue !== `(${entry.count} currently set)`) {
        throw new Error(`${entry.label} reported ${menuValue}`);
    }
    if (expectedErrors.length && replay.getScreens()[0]
        && firstRawLine(replay) !== expectedErrors[0]) {
        throw new Error(`${entry.label} raw-printed the wrong first line`);
    }
    if (replay.getScreens()[0] && !replayHasPrompt(replay, entry.prompt)) {
        throw new Error(`${entry.label} never painted ${entry.prompt}`);
    }

    // These two rows changed above, but extcmds_match() applies its availability
    // filters after reading the per-game flags.
    if (entry.label === 'wizard and internal rows change but stay filtered') {
        if (extcmds_match('lev', ECM_NOFLAGS, game).length !== 0
            || extcmds_match('cli', ECM_NOFLAGS, game).length !== 0) {
            throw new Error(`${entry.label} exposed a filtered command`);
        }
    }
}

export async function runStartupAutocompleteMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup autocomplete to options and command completion',
            recipe: loadStartupAutocompleteRecipe(),
        }],
        summaryLabel: 'STARTUP AUTOCOMPLETE',
        verifySegment: verifyStartupAutocompleteSegment,
    });
}

runMatrixCli(import.meta.url, runStartupAutocompleteMatrix, 'startup autocomplete');
