// Enforces youprop.h's Blind rule: C's Blind is
// ((HBlinded || EBlinded) && !BBlinded), so a JavaScript test written as
// HBlinded() || EBlinded() leaves out the Eyes of the Overworld, which block
// blindness through BBlinded. Game code calls Blind() from js/youprop.js; an
// inline disjunction must be followed by its own BBlinded() term. The scan
// found four sites without one (uhitm.js mhitm_ad_sedu, do.js
// familiar_level_msg, artifact.js Sting_effects and questpgr.js's %x
// conversion), all of which C writes as Blind.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { Blind } from '../js/youprop.js';
import { BLINDED, W_TOOL, TIMEOUT } from '../js/const.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// One inline `HBlinded(x) || EBlinded(x)` disjunction, optionally written
// with `!== 0` comparisons, across line breaks.
const DISJUNCTION = /HBlinded\([^()]*\)(?:\s*!==\s*0)?\s*\|\|\s*EBlinded\([^()]*\)(?:\s*!==\s*0)?/gu;
// How far past the disjunction its BBlinded() term may sit: enough for the
// closing parentheses and one wrapped `&& !BBlinded(...)` line (js/dog.js).
const BBLINDED_WINDOW = 80;

export function blindFindings(source) {
    const findings = [];
    for (const match of source.matchAll(DISJUNCTION)) {
        const end = match.index + match[0].length;
        // The term must belong to the same expression: stop at the end of the
        // statement or at the block it guards.
        const tail = source.slice(end, end + BBLINDED_WINDOW).split(/[;{]/u)[0];
        if (tail.includes('BBlinded(')) continue;
        const line = source.slice(0, match.index).split('\n').length;
        findings.push({ line });
    }
    return findings;
}

function scanRepository() {
    const findings = [];
    for (const name of readdirSync(join(ROOT, 'js')).sort()) {
        // youprop.js defines Blind() itself.
        if (!name.endsWith('.js') || name === 'youprop.js') continue;
        const source = readFileSync(join(ROOT, 'js', name), 'utf8');
        for (const { line } of blindFindings(source))
            findings.push(`js/${name}:${line}`);
    }
    return findings;
}

test('game code writes Blind as Blind(), not as HBlinded || EBlinded', () => {
    // One exception, js/insight.js enlightenment: its disjunction sits inside
    // `blockedBlind && (...)`, where blockedBlind already holds the BBlinded
    // term (insight.c "blind but blocked" line). The count must change only
    // when a site is removed or a new exception is justified here.
    // The file is pinned with its count, not its line, so edits above the
    // site do not break the check.
    const files = scanRepository().map((site) => site.replace(/:\d+$/u, ''));
    assert.deepEqual(files, ['js/insight.js']);
});

test('the scan flags a bare disjunction and accepts one with BBlinded', () => {
    // Line 1 and line 3 are bare; line 2 carries its BBlinded term.
    const source = [
        'const a = Boolean(HBlinded(state.u) || EBlinded(state.u));',
        'const b = (HBlinded(u) || EBlinded(u)) && !BBlinded(u);',
        'const c = HBlinded(state.u) !== 0\n    || EBlinded(state.u) !== 0;',
    ].join('\n');
    assert.deepEqual(blindFindings(source).map(({ line }) => line), [1, 3]);
});

test('Blind() is false while the Eyes of the Overworld block a timed blindness', () => {
    // youprop.h 103: a 50-turn timeout (an arbitrary nonzero TIMEOUT value)
    // with the W_TOOL blocker that Blindf_on() sets for the Eyes.
    const uprops = [];
    uprops[BLINDED] = { intrinsic: 50 & TIMEOUT, extrinsic: 0, blocked: W_TOOL };
    assert.equal(Blind({ uprops }), false);
    uprops[BLINDED].blocked = 0;
    assert.equal(Blind({ uprops }), true);
});
