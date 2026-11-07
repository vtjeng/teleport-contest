#!/usr/bin/env node
// Finds hand-written "You feel" text in js/.
//
// C's You_feel() (pline.c:388-400) prints "You dream that you feel ..." while
// the hero is Unaware and "You feel ..." otherwise. js/pline.js youFeel()
// builds that prefix, and every port of a You_feel() call must use it. A
// literal "You feel" elsewhere in js/ is allowed only where C writes the
// text without You_feel() (a pline() of a fixed string, a You("feel ...")
// call, or text handed to another function); ALLOWED_LITERALS lists those
// sites and names the C call that writes each one.
//
// Usage: node scripts/you-feel-literal.mjs
// Prints each unlisted literal as file:line and exits 1 when there is one.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Text that marks a hand-built You_feel() message.
const FEEL_TEXT = /You feel|dream that you feel/u;

// Each entry allows the literals in `file` that contain `text`. `c` names
// the C call that writes the same text without You_feel(), so the port
// prints it unchanged while the hero is Unaware.
export const ALLOWED_LITERALS = [
    { file: 'js/pline.js', text: "'You dream that you feel' : 'You feel'",
        c: 'pline.c You_feel() (388-400), which youFeel() ports' },
    { file: 'js/do.js', text: "You feel like you\\'ve been here before.",
        c: 'do.c familiar_level_msg() fam_msgs[] (1452), printed by pline()' },
    { file: 'js/detect.js', text: 'You feel like a million',
        c: 'detect.c gold_detect() Sprintf(buf) (390) for strange_feeling()' },
    { file: 'js/detect.js', text: 'You feel worried about your future financial situation.',
        c: 'detect.c gold_detect() Strcpy(buf) (392-393) for strange_feeling()' },
    { file: 'js/detect.js', text: 'You feel interested in',
        c: 'detect.c gold_detect() Sprintf(buf) (395) for strange_feeling()' },
    { file: 'js/detect.js', text: 'You feel materially poor.',
        c: 'detect.c gold_detect() Strcpy(buf) (402) for strange_feeling()' },
    { file: 'js/detect.js', text: 'You feel a lack of something.',
        c: 'detect.c object_detect() strange_feeling() text (689)' },
    { file: 'js/detect.js', text: 'You feel threatened.',
        c: 'detect.c monster_detect() strange_feeling() text (820)' },
    { file: 'js/hack.js', text: 'You feel the ice shift beneath you!',
        c: 'hack.c spoteffects() ice warning table (3406), printed by pline()' },
    { file: 'js/engrave.js', text: 'You feel tremors.',
        c: 'engrave.c doengrave_sfx_item_WAN() WAN_DIGGING text (696), printed by pline()' },
    { file: 'js/engrave.js', text: 'You feel the wand heat up.',
        c: 'engrave.c doengrave_sfx_item_WAN() post_engr_text (715)' },
    { file: 'js/eat.js', text: 'You feel hungry.',
        c: 'eat.c newuhs() You("%s.", "feel hungry") (3474-3476)' },
    { file: 'js/eat.js', text: 'You feel weak.',
        c: 'eat.c newuhs() You("%s weak.", "feel") (3493-3495)' },
    { file: 'js/eat.js', text: 'You feel limber!',
        c: 'eat.c fix_petrification() Strcpy(buf) (875) for make_stoned()' },
    { file: 'js/eat.js', text: 'You feel a momentary chill.',
        c: 'eat.c givit() COLD_RES You("feel a momentary chill.") (1014)' },
    { file: 'js/eat.js', text: 'You feel a change coming over you.',
        c: 'eat.c cpostfx() You("%s.", "feel a change coming over you") (1259-1261)' },
    { file: 'js/invent.js', text: 'You feel:',
        c: 'invent.c look_here() Strcpy(fbuf, "You feel") (4154), a menu title' },
    { file: 'js/fountain.js', text: 'You feel transparent.',
        c: 'fountain.c drinkfountain() You("feel transparent.") (339)' },
    { file: 'js/fountain.js', text: 'You feel very self-conscious.',
        c: 'fountain.c drinkfountain() You("feel very self-conscious.") (341)' },
    { file: 'js/pray.js', text: 'You feel more limber.',
        c: 'pray.c fix_worst_trouble() make_stoned() text (383)' },
    { file: 'js/polyself.js', text: 'You feel like a new %s!',
        c: 'polyself.c newman() polyman() format (443)' },
    { file: 'js/regen.js', text: 'You feel full of energy.',
        c: 'allmain.c regen_pw() interrupt_multi() text (617)' },
    { file: 'js/sit.js', text: 'You feel extremely out of place.',
        c: 'sit.c special_throne_effect() schedule_goto() text (297)' },
    { file: 'js/sit.js', text: 'You feel a malignant aura surround the magic-absorbing blade.',
        c: 'sit.c rndcurse() You(mal_aura, ...) (574-577)' },
    { file: 'js/sit.js', text: 'You feel a malignant aura surround you.',
        c: 'sit.c rndcurse() You(mal_aura, "you") (574, 585)' },
    { file: 'js/teleport.js', text: 'You feel slightly dizzy.',
        c: 'teleport.c domagicportal() stunmsg for schedule_goto() (1483)' },
    { file: 'js/teleport.js', text: 'You feel dizzier.',
        c: 'teleport.c domagicportal() stunmsg for schedule_goto() (1484)' },
    { file: 'js/trap.js', text: 'You feel lighter, but your',
        c: 'trap.c float_up() You("feel lighter, but ...") (3960)' },
    { file: 'js/read.js', text: "'You feel lettering'",
        c: 'read.c doread() T-shirt/apron text (438), printed by pline()' },
    { file: 'js/read.js', text: 'You feel the embossed numbers:',
        c: 'read.c doread() You("feel the embossed numbers:") (468)' },
    { file: 'js/read.js', text: 'You feel the embossed words:',
        c: 'read.c doread() You("feel the embossed words:") (520)' },
    { file: 'js/read.js', text: 'You feel the engraved signature:',
        c: 'read.c doread() You("feel the engraved signature:") (531)' },
    { file: 'js/uhitm.js', text: 'You feel feverish.',
        c: 'uhitm.c mhitm_ad_were() urgent_pline("You feel feverish.") (4282)' },
    { file: 'js/zap.js', text: 'You feel a burst of cool air.',
        c: 'zap.c zap_over_floor() sense_txt (5448), printed by You1() (5479)' },
];

// Files whose every literal is generated data, with the source of the text.
export const ALLOWED_FILES = [
    { file: 'js/quest_text_data.js',
        c: 'dat/quest.lua text that questpgr.c com_pager_core() delivers' },
];

// Return the index just past the string or template literal starting at
// `start`. A template's `${...}` holes may hold further literals.
function skipLiteral(source, start) {
    const quote = source[start];
    for (let i = start + 1; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
            let depth = 0;
            for (i += 1; i < source.length; i++) {
                const ch = source[i];
                if (ch === '\'' || ch === '"' || ch === '`') {
                    i = skipLiteral(source, i) - 1;
                } else if (ch === '{') depth++;
                else if (ch === '}' && --depth === 0) break;
            }
            continue;
        }
        if (source[i] === quote) return i + 1;
        if (quote !== '`' && source[i] === '\n')
            throw new Error(`unterminated string at offset ${start}`);
    }
    throw new Error(`unterminated literal at offset ${start}`);
}

// A '/' after one of these characters (or at the start) begins a regular
// expression rather than a division.
const REGEX_PRECEDES = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|',
    '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

function skipRegex(source, start) {
    let inClass = false;
    for (let i = start + 1; i < source.length; i++) {
        const ch = source[i];
        if (ch === '\\') { i++; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) return i + 1;
        else if (ch === '\n') throw new Error(`unterminated regex at offset ${start}`);
    }
    throw new Error(`unterminated regex at offset ${start}`);
}

// Every outermost string or template literal in `source`, comments
// skipped, as { line, text } with the literal's source text.
export function literals(source) {
    const found = [];
    let previous = '';
    for (let i = 0; i < source.length;) {
        const ch = source[i];
        if (ch === '/' && source[i + 1] === '/') {
            const end = source.indexOf('\n', i);
            i = end < 0 ? source.length : end;
            continue;
        }
        if (ch === '/' && source[i + 1] === '*') {
            const end = source.indexOf('*/', i + 2);
            i = end < 0 ? source.length : end + 2;
            continue;
        }
        if (ch === '\'' || ch === '"' || ch === '`') {
            const end = skipLiteral(source, i);
            const line = source.slice(0, i).split('\n').length;
            found.push({ line, text: source.slice(i, end) });
            i = end;
            previous = ')';
            continue;
        }
        if (ch === '/' && REGEX_PRECEDES.has(previous)) {
            i = skipRegex(source, i);
            previous = ')';
            continue;
        }
        if (!/\s/u.test(ch)) previous = /[\w$]/u.test(ch) ? 'a' : ch;
        i++;
    }
    return found;
}

// The literals in `source` that hold "You feel" text, as { file, line, text }.
export function feelLiterals(source, file) {
    return literals(source)
        .filter(({ text }) => FEEL_TEXT.test(text))
        .map(({ line, text }) => ({ file, line, text }));
}

function allowedEntry(finding) {
    return ALLOWED_LITERALS.find((entry) =>
        entry.file === finding.file && finding.text.includes(entry.text));
}

// All "You feel" literals under js/, each marked with its allow-list entry.
export function scanFiles(root = PROJECT_ROOT) {
    const results = [];
    for (const name of readdirSync(join(root, 'js')).sort()) {
        if (!name.endsWith('.js')) continue;
        const file = `js/${name}`;
        if (ALLOWED_FILES.some((entry) => entry.file === file)) continue;
        const source = readFileSync(join(root, file), 'utf8');
        for (const finding of feelLiterals(source, file))
            results.push({ ...finding, allowed: allowedEntry(finding) ?? null });
    }
    return results;
}

// Literals that no allow-list entry covers.
export function unlistedLiterals(root = PROJECT_ROOT) {
    return scanFiles(root).filter((finding) => !finding.allowed);
}

// Allow-list entries that no literal matches any longer.
export function staleEntries(root = PROJECT_ROOT) {
    const used = new Set(scanFiles(root).map((finding) => finding.allowed)
        .filter(Boolean));
    const stale = ALLOWED_LITERALS.filter((entry) => !used.has(entry));
    for (const entry of ALLOWED_FILES) {
        let source = '';
        try { source = readFileSync(join(root, entry.file), 'utf8'); } catch { /* missing */ }
        if (!FEEL_TEXT.test(source)) stale.push(entry);
    }
    return stale;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const unlisted = unlistedLiterals();
    for (const { file, line, text } of unlisted)
        console.log(`${file}:${line}: ${text.split('\n')[0]}`);
    for (const entry of staleEntries())
        console.log(`stale allow-list entry: ${entry.file} ${entry.text ?? ''}`);
    process.exitCode = unlisted.length || staleEntries().length ? 1 : 0;
}
