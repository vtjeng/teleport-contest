// Every C livelog_printf() format that takes one of the hero's pronouns
// through uhis(), uhim() or uhe() (you.h:314-316) must reach the port with
// the same helper in the same place. A #chronicle line that hard-codes
// "your", or uses uhim() where C has uhis(), reads the same for a female
// hero ("her") or looks plausible in review, so recordings miss it unless
// one happens to list that line for a male hero.
//
// The check reads each such C call, finds the js/ livelog_printf() call with
// the same literal text, and requires `${uhis(...)}`, `${uhim(...)}` or
// `${uhe(...)}` written inside that call at the position of C's argument.
// A C format with no js/ call at all is an unported path; those are counted,
// and the count fails in either direction.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { uhe, uhim, uhis } from '../js/const.js';

const C_DIR = new URL('../nethack-c/upstream/src/', import.meta.url);
const JS_DIR = new URL('../js/', import.meta.url);
const HERO_PRONOUN = /^(uhis|uhim|uhe)\(\)$/u;

// The text of each call of `name(` in `source`, from the name to its closing
// parenthesis. Quoted strings are skipped, and a template literal's `${}`
// parts are scanned as code, so parentheses inside text do not count.
function callTexts(source, name) {
    const calls = [];
    const pattern = new RegExp(`\\b${name}\\(`, 'gu');
    for (let match; (match = pattern.exec(source));) {
        let depth = 0;
        // Each entry is the brace depth at which a template's `${` closes.
        const templates = [];
        let braces = 0;
        let index = match.index + name.length;
        for (; index < source.length; ++index) {
            const ch = source[index];
            if (ch === '"' || ch === '\'') {
                for (++index; source[index] !== ch; ++index)
                    if (source[index] === '\\') ++index;
            } else if (ch === '`') {
                index = skipTemplateText(source, index + 1, templates, braces);
                if (source[index] === '{') ++braces;
            } else if (ch === '{') {
                ++braces;
            } else if (ch === '}') {
                --braces;
                if (templates.at(-1) === braces) {
                    templates.pop();
                    index = skipTemplateText(source, index + 1, templates, braces);
                    if (source[index] === '{') ++braces;
                }
            } else if (ch === '(') {
                ++depth;
            } else if (ch === ')' && --depth === 0) {
                break;
            }
        }
        calls.push({ text: source.slice(match.index, index + 1), index: match.index });
    }
    return calls;
}

// Advances over template text from `index` to the closing backtick, or to
// the `{` of the next `${`, whose closing depth it records.
function skipTemplateText(source, index, templates, braces) {
    for (; source[index] !== '`'; ++index) {
        if (source[index] === '\\') {
            ++index;
        } else if (source[index] === '$' && source[index + 1] === '{') {
            templates.push(braces);
            return index + 1;
        }
    }
    return index;
}

// The arguments of a C call, split at its top-level commas.
function cArguments(call) {
    const body = call.slice(call.indexOf('(') + 1, -1);
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < body.length; ++index) {
        const ch = body[index];
        if (ch === '"') {
            for (++index; body[index] !== '"'; ++index)
                if (body[index] === '\\') ++index;
        } else if (ch === '(') {
            ++depth;
        } else if (ch === ')') {
            --depth;
        } else if (ch === ',' && depth === 0) {
            parts.push(body.slice(start, index));
            start = index + 1;
        }
    }
    parts.push(body.slice(start));
    return parts.map((part) => part.trim());
}

// Every C livelog_printf() call whose format is a string literal and whose
// arguments include a hero pronoun: its place, the literal text around each
// conversion, and the helper name (or null) for each conversion.
function cPronounFormats() {
    const formats = [];
    for (const file of readdirSync(C_DIR).filter((name) => name.endsWith('.c')).sort()) {
        const source = readFileSync(new URL(file, C_DIR), 'utf8');
        for (const { text, index } of callTexts(source, 'livelog_printf')) {
            const args = cArguments(text);
            const literals = [...(args[1] ?? '').matchAll(/"((?:[^"\\]|\\.)*)"/gu)];
            if (!literals.length || !/^("(?:[^"\\]|\\.)*"\s*)+$/u.test(args[1])) continue;
            const format = literals.map((literal) => literal[1]).join('')
                .replace(/\\"/gu, '"');
            const pieces = format.split(/%[-0-9.]*l?[sdcu]/u);
            const helpers = args.slice(2).map((arg) => HERO_PRONOUN.exec(arg)?.[1] ?? null);
            if (!helpers.some(Boolean)) continue;
            assert.equal(helpers.length, pieces.length - 1, `${file}: ${format}`);
            const line = source.slice(0, index).split('\n').length;
            formats.push({ where: `${file}:${line}`, format, pieces, helpers });
        }
    }
    return formats;
}

// Every js/ livelog_printf() call, with adjacent string pieces joined so
// that a message split over lines with `+` reads as one text.
function jsLivelogCalls() {
    const calls = [];
    for (const file of readdirSync(JS_DIR).filter((name) => name.endsWith('.js')).sort()) {
        const source = readFileSync(new URL(file, JS_DIR), 'utf8');
        for (const { text, index } of callTexts(source, 'livelog_printf')) {
            const line = source.slice(0, index).split('\n').length;
            calls.push({
                where: `js/${file}:${line}`,
                text: text.replace(/['`]\s*\+\s*['`]/gu, ''),
            });
        }
    }
    return calls;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    .replace(/['"]/gu, '\\\\?$&');

// `strict` requires the helper call at each pronoun conversion; otherwise
// up to 160 characters of any text may stand at every conversion, which
// also finds a call that wrote the pronoun into its text.
function formatPattern({ pieces, helpers }, strict) {
    let pattern = escapeRegExp(pieces[0]);
    helpers.forEach((helper, position) => {
        pattern += strict && helper
            ? `\\$\\{${helper}\\([^(){}]*\\)\\}`
            : '[\\s\\S]{0,160}?';
        pattern += escapeRegExp(pieces[position + 1]);
    });
    return new RegExp(pattern, 'u');
}

// C formats with a hero pronoun whose text no js/ livelog_printf() call
// holds: the path that logs them is not ported. Lower the count when one is
// ported; a new one needs its reason here.
const UNPORTED_FORMATS = 0;

test('livelog_printf formats take the hero pronoun C takes', () => {
    const formats = cPronounFormats();
    // The scan found the C calls: 12 pass uhis() or uhim() in
    // nethack-c/upstream/src at the pinned revision. A count of zero would
    // mean the source or the scan is missing, not that all is well.
    assert.equal(formats.length, 12);

    const calls = jsLivelogCalls();
    const unported = [];
    const wrong = [];
    for (const format of formats) {
        const loose = formatPattern(format, false);
        const strict = formatPattern(format, true);
        const candidates = calls.filter((call) => loose.test(call.text));
        if (!candidates.length) {
            unported.push(`${format.where} "${format.format}"`);
            continue;
        }
        for (const call of candidates) {
            if (!strict.test(call.text)) {
                wrong.push(`${call.where} does not pass ${format.helpers.filter(Boolean).join(', ')}`
                    + ` as ${format.where} "${format.format}" does`);
            }
        }
    }
    assert.deepEqual(wrong, []);
    assert.equal(unported.length, UNPORTED_FORMATS, unported.join('\n'));
});

test('a hard-coded pronoun in a livelog text is rejected', () => {
    // The two shapes this check exists for, against pickup.c:2659's format:
    // "your" written into the text, and the wrong helper.
    const format = {
        pieces: ['just blew up ', ' bag of holding'], helpers: ['uhis'],
    };
    const strict = formatPattern(format, true);
    assert.equal(strict.test('livelog_printf(LL_ACHIEVE, `just blew up ${uhis(state)} bag of holding`, state)'), true);
    assert.equal(strict.test('livelog_printf(LL_ACHIEVE, \'just blew up your bag of holding\', state)'), false);
    assert.equal(strict.test('livelog_printf(LL_ACHIEVE, `just blew up ${uhim(state)} bag of holding`, state)'), false);
    assert.equal(strict.test('livelog_printf(LL_ACHIEVE, `just blew up ${his} bag of holding`, state)'), false);
});

test('uhe, uhim and uhis read flags.female as you.h does', () => {
    // you.h:314-316 index genders[] with flags.female alone.
    const youH = readFileSync(
        new URL('../nethack-c/upstream/include/you.h', import.meta.url), 'utf8',
    );
    for (const [name, field] of [['uhe', 'he'], ['uhim', 'him'], ['uhis', 'his']]) {
        assert.ok(youH.includes(
            `#define ${name}()${' '.repeat(9 - name.length)}(genders[flags.female ? 1 : 0].${field})`,
        ), name);
    }
    // role.c genders[]: { "male", "he", "him", "his", ... } and
    // { "female", "she", "her", "her", ... }.
    const roleC = readFileSync(
        new URL('../nethack-c/upstream/src/role.c', import.meta.url), 'utf8',
    );
    assert.match(roleC, /\{ "male", "he", "him", "his", "Mal", ROLE_MALE \}/u);
    assert.match(roleC, /\{ "female", "she", "her", "her", "Fem", ROLE_FEMALE \}/u);

    const male = { flags: { female: false }, u: {} };
    // u.mfemale is the polymorphed form's gender (Ugender()); the macros do
    // not read it, so a male hero in a female form is still "his".
    const maleInFemaleForm = { flags: { female: false }, u: { umonnum: 1, mfemale: 1 } };
    const female = { flags: { female: true }, u: {} };
    assert.deepEqual([uhe(male), uhim(male), uhis(male)], ['he', 'him', 'his']);
    assert.deepEqual(
        [uhe(maleInFemaleForm), uhim(maleInFemaleForm), uhis(maleInFemaleForm)],
        ['he', 'him', 'his'],
    );
    assert.deepEqual([uhe(female), uhim(female), uhis(female)], ['she', 'her', 'her']);
});
