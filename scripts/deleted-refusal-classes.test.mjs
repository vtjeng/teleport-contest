// Refusal classes deleted once their last throw site was shown unreachable
// must not return. Each class below stood in for a state that no production
// caller creates (a light source type C never uses, an armor slot holding the
// wrong kind of item, a spell or wand with no case); the C behaviour at those
// sites is now ported, or is C's own impossible(). A path that really is
// unported records the gap with note_unported() (AGENTS.md, "Keep each source
// file's port in one place"), so none of these names has a use in js/.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

export const DELETED_REFUSAL_CLASSES = [
    'UnsupportedLightOperationError', // light.c new_light_source() type check
    'UnsupportedApplyError', // apply.c doapply() arms that all have cases
    // do_wear.c impossible() arms for unknown boots, shield and shirt types,
    // canwearobj()'s silly_thing() and cursed() without an object
    'UnsupportedWearError',
    'UnsupportedTakeOffError',
    // pickup.c query_objlist() with INCLUDE_HERO, which no caller passes, and
    // a pickup selection that is not on the floor or in an engulfer
    'UnsupportedPickupError',
    // read.c seffect_*() self-checks: seffects() calls each from its own case
    'UnsupportedReadError',
    // spell.c spelleffects()'s default arm: every learnable spell has a case
    'UnsupportedSpellCastError',
    // zap.c bhit()'s call-type check: every caller passes one of the six
    'UnsupportedBhitError',
    // zap.c weffects()'s impossible() for a directed object that is neither
    // a dig nor a ray
    'UnsupportedZapError',
    // Hooks that callers had to supply through env.unsupported, which no
    // production caller supplied: dokick.c, pray.c and dothrow.c
    'UnsupportedKickError',
    'UnsupportedPrayerError',
    'UnsupportedThrowError',
    // region.c's callback and operation tables, now filled from one source
    'UnsupportedRegionCallbackError',
    'UnsupportedRegionOperationError',
    // trapmove(), the pet-swap trap result and mlevel_tele_trap(), which now
    // print C's impossible() and continue
    'UnsupportedPositionCheckError',
    // mineralize.c, sp_lev.c put_lregion_here() and sp_lev.c object creation:
    // contexts and argument values every caller rules out
    'UnsupportedMineralizeContextError',
    'UnsupportedRegionPlacementError',
    'UnsupportedSpecialObjectError',
    // pager.c help inputs and options.c option-menu states no caller creates
    'UnsupportedHelpError',
    'UnsupportedOptionMenuError',
    // makemon.c makemon(): the species allowlist, the shopkeeper outside
    // shkinit() and the Rogue-level chameleon, which C makes
    'UnsupportedMonsterCreationError',
    // cmd.c yn_function()'s query of QBUFSZ bytes or more, now truncated
    'UnsupportedDirectionBoundaryError',
    // posixregex.c regex_match() on non-ASCII text, now matched bytewise as
    // glibc does in the C locale
    'UnsupportedPosixLocaleMatchError',
    // timeout.c run_timers(): an object holding more than one due timer and
    // an unpaid shrinking glob, both of which C runs as usual
    'UnsupportedHeroTimeoutBoundaryError',
];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

// Each line of `source` that names one of `names` outside a comment.
export function classNameFindings(source, names = DELETED_REFUSAL_CLASSES) {
    const findings = [];
    const lines = stripComments(source).split('\n');
    for (const name of names) {
        const pattern = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, 'u');
        lines.forEach((line, index) => {
            if (pattern.test(line)) findings.push({ name, line: index + 1 });
        });
    }
    return findings.sort((a, b) => a.line - b.line);
}

test('no deleted refusal class returns to js/', () => {
    const findings = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
        const source = readFileSync(join(JS_DIR, file), 'utf8');
        for (const { name, line } of classNameFindings(source))
            findings.push(`${file}:${line} ${name}`);
    }
    assert.deepEqual(findings, []);
});

test('the scan finds definitions, throws, imports and instanceof tests', () => {
    const name = DELETED_REFUSAL_CLASSES[0];
    const source = [
        `export class ${name} extends Error {}`, // 1
        `throw new ${name}('x');`, // 2
        `import { ${name} } from './light.js';`, // 3
        `if (error instanceof ${name}) return;`, // 4
        `// ${name} in a comment`,
        `/* ${name} */`,
        `const other = ${name}Extra;`,
    ].join('\n');
    assert.deepEqual(classNameFindings(source).map(({ line }) => line), [1, 2, 3, 4]);
});
