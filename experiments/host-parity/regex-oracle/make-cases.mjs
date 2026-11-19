#!/usr/bin/env node
// make-cases.mjs -- write cases.jsonl, the patterns and texts that
// regex-oracle.c answers for on the macOS runner.
//
// NetHack hands MENUCOLOR, MSGTYPE and AUTOPICKUP_EXCEPTION patterns to the
// C library's regcomp(REG_EXTENDED | REG_NOSUB) (sys/share/posixregex.c).
// The judge's recorder ran on macOS, whose Libc uses TRE; js/regcomp.js and
// js/regexec.js port it. This file lists what the oracle is asked:
//
// - every pattern of one to three characters over ALPHABET, which holds each
//   character the TRE parser treats specially in an extended regex;
// - 4,000 longer patterns drawn with a fixed seed from the same alphabet;
// - curated patterns: the host-parity sample's, every bracket class,
//   collating and equivalence name, every escaped printable byte, bounds at
//   and past RE_DUP_MAX, assertions, high bytes and long patterns;
// - "isolated" patterns whose compilation may take long or exhaust memory,
//   which run-oracle.mjs runs one per process under a time limit.
//
// Every pattern is matched against each of TEXTS. Strings hold one byte per
// character (U+0000 to U+00FF); run-oracle.mjs writes them as latin1.
// Nothing here is random at run time, so the file is the same on every
// host.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const ALPHABET = [
    'a', 'b', '1', '2', '(', ')', '|', '*', '+', '?', '{', '}', ',', '[', ']',
    '^', '$', '\\', '.', '-', ':', '=', '<',
];

// "é" is the UTF-8 bytes C3 A9, as NetHack passes a UTF-8 config line.
export const TEXTS = [
    '', 'a', 'b', 'aa', 'ab', 'ba', 'aab', 'abc', 'aaa', 'aaaa', '1', '2',
    'a1', '11', '12', '(', ')', '()', '|', '*', '+', '?', '{', '}', '{1}',
    'a{1}', ',', '{,1}', 'a{,1}', 'a{', '[', ']', '[]', '^', '$', '\\', '\\a',
    '.', '-', ':', '=', '<', '>', 'w', 'W', '_', ' ', 'a b', 'x a', '_a', 'a_',
    '\t', '\x7f', '\xc3\xa9', '\xff', '\x80', 'A', 'Z', 'z', '0', '9', 'a-b',
    '^a', 'a$', 'e', 'ee', 'd', 's', 'x', 'spear', 'a +1 spear', 'dagger',
    'b - an uncursed +0 dagger (weapon in hand)', 'Hello', 'Heello', 'Hellllo',
];

// Mulberry32, so the sample of longer patterns is fixed.
function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function exhaustive(maxLength) {
    const out = [];
    let level = [''];
    for (let n = 1; n <= maxLength; n++) {
        const next = [];
        for (const prefix of level) for (const c of ALPHABET) next.push(prefix + c);
        out.push(...next);
        level = next;
    }
    return out;
}

function sampled(count, seed) {
    const rand = prng(seed);
    const out = new Set();
    while (out.size < count) {
        const length = 4 + Math.floor(rand() * 5);
        let s = '';
        for (let i = 0; i < length; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
        out.add(s);
    }
    return [...out];
}

// regex/FreeBSD/cname.h, in table order, and wctype_l()'s property names
// (locale/FreeBSD/wctype.c) plus names it does not know.
const CNAMES = ['ACK', 'BEL', 'BS', 'CAN', 'CR', 'DC1', 'DC2', 'DC3', 'DC4', 'DEL',
    'DLE', 'EM', 'ENQ', 'EOT', 'ESC', 'ETB', 'ETX', 'FF', 'FS', 'GS', 'HT', 'IS1',
    'IS2', 'IS3', 'IS4', 'LF', 'NAK', 'NUL', 'RS', 'SI', 'SO', 'SOH', 'STX', 'SUB',
    'SYN', 'US', 'VT', 'alert', 'ampersand', 'apostrophe', 'asterisk', 'backslash',
    'backspace', 'carriage-return', 'circumflex', 'circumflex-accent', 'colon',
    'comma', 'commercial-at', 'dollar-sign', 'eight', 'equals-sign',
    'exclamation-mark', 'five', 'form-feed', 'four', 'full-stop', 'grave-accent',
    'greater-than-sign', 'hyphen', 'hyphen-minus', 'left-brace',
    'left-curly-bracket', 'left-parenthesis', 'left-square-bracket',
    'less-than-sign', 'low-line', 'newline', 'nine', 'number-sign', 'one',
    'percent-sign', 'period', 'plus-sign', 'question-mark', 'quotation-mark',
    'reverse-solidus', 'right-brace', 'right-curly-bracket', 'right-parenthesis',
    'right-square-bracket', 'semicolon', 'seven', 'six', 'slash', 'solidus',
    'space', 'tab', 'three', 'tilde', 'two', 'underscore', 'vertical-line',
    'vertical-tab', 'zero',
    // Not in the table: prefixes, case variants and unknown names.
    'hyph', 'Space', 'SPACE', 'spac', 'spaces', 'a', 'aa', 'ab', '', 'zzz', '0',
    '\xc3\xa9', '\xe9', 'NULL', 'A', '~'];
const CLASSES = ['alnum', 'alpha', 'blank', 'cntrl', 'digit', 'graph', 'lower',
    'print', 'punct', 'space', 'upper', 'xdigit', 'ideogram', 'special',
    'phonogram', 'rune', 'word', 'ascii', 'foo', '', '<', '>', 'ALPHA', 'alpha ',
    'alph', 'x'.repeat(70)];

function curated() {
    const out = [];
    for (const name of CNAMES) out.push(`[[.${name}.]]`, `[[=${name}=]]`, `x[[.${name}.]]y`);
    for (const name of CLASSES) out.push(`[[:${name}:]]`, `[^[:${name}:]]`, `^[[:${name}:]]+$`);
    // Every escaped byte from 0x20 to 0x7e, and some above.
    for (let c = 0x20; c < 0x7f; c++) out.push(`\\${String.fromCharCode(c)}`, `a\\${String.fromCharCode(c)}`);
    out.push('\\\xc3\xa9', '\\\xff', '\\\x80');
    // Bounds around RE_DUP_MAX (255) and INT_MAX, and malformed ones.
    for (const b of ['{0}', '{1}', '{2}', '{255}', '{256}', '{0,255}', '{0,256}', '{1,}',
        '{0,}', '{,}', '{,1}', '{,255}', '{2,1}', '{1,1}', '{1', '{1,', '{1,2',
        '{x}', '{1x}', '{1,x}', '{ 1}', '{1 }', '{01}', '{2147483647}',
        '{2147483648}', '{99999999999}', '{1}?', '{1}*', '{1}+', '{1}{1}',
        '{1}|', '{', '{}', '{-1}', '{1,2}{3}', '{0,0}', '{1}{', '{1}}', '{1}a']) {
        out.push(`a${b}`, `(ab)${b}`, `[ab]${b}`, `^${b}`, `${b}`, `.${b}`);
    }
    // Anchors and assertions, alone, repeated, grouped and in alternation.
    out.push('^', '$', '^$', '$^', 'a^', '$a', '^a$', '(^a)', '(a$)', '(^)*', '(^)+a',
        '($)*', '(^|x*)a', '(^|x)a', '(x|^)a', '(^|$)a', '(a|^)*b', '(^)a', 'a(^)',
        '(^|b)*a', 'x*^a', '^*', '$*', '^+', '^?', '^{1}', '(^){2}', '[[:<:]]',
        '[[:>:]]', '[[:<:]]a', 'a[[:>:]]', '[[:<:]]*', '([[:<:]])*a',
        '[[:<:]]a[[:>:]]', 'b[[:<:]]', '[^[:<:]]', '[[:<:]][[:>:]]', '[[:<:]]|a',
        '[a[:<:]]', '[[:<:]', '[[:<:]]]', '(a|[[:<:]])b', '[[:>:]]a',
        '([[:<:]]|x)a', '(x*|[[:<:]])a');
    // Brackets: ranges, ends, negation, high bytes and odd forms.
    out.push('[a-]', '[-a]', '[]a]', '[^]a]', '[]-a]', '[a-a]', '[b-a]', '[a-z]',
        '[z-a]', '[a--]', '[--a]', '[!--]', '[a-c-e]', '[a-c-]', '[[.a.]-c]',
        '[a-[.c.]]', '[[=a=]-c]', '[a-[=c=]]', '[[:alpha:]-z]', '[a-[:alpha:]]',
        '[\\d]', '[\\]]', '[\\]', '[[]', '[[a]', '[a[]', '[a[b]', '[[.]', '[[.].]]',
        '[[.-.]]', '[[.^.]]', '[[=]', '[[=a]', '[[:a]', '[[:]]', '[[::]]', '[[==]]',
        '[[..]]', '[[.a.]]', '[[.ab.]]', '[[=a=]]', '[[=ab=]]', '[^a]', '[^]',
        '[^^]', '[a^]', '[\xc3\xa9]', '[^\xc3\xa9]', '[\x80-\xff]', '[a-\xc3\xa9]',
        '[\xc3\xa9-a]', '[\xc3\xa0-\xc3\xbf]', '[\xff-\x80]', '[[.\xc3\xa9.]]',
        '[[=\xc3\xa9=]]', '[[.\xe9.]]', '[[=\xe9=]]', '[[:alpha:][:digit:]]',
        '[a-z0-9_]', '[[:alpha:]_-]', '[ -~]', '[^ -~]', '[\t]', '[a-b-c]');
    // Alternation, grouping and empty pieces.
    out.push('', '|', '||', 'a|', '|a', 'a||b', '(|)', '(|a)', '(a|)', '()', '(())',
        '()*', '()+', '()?', '(){2}', '(a)()', 'a()b', '(', ')', 'a)', '(a', '((a)',
        '(a))', '(a)|b)', '(?i)a', '(?:a)', '(*a)', '(+a)', '(a|*b)', '(a||b)',
        'a|*b', 'a|+b', 'a|?b', 'a|{1}b', 'a|{b', '(a){,1}', '(a)*', '(a)+', '(a)?',
        '(a*)*', '(a*)+', '(a+)*', '(a?)*', '((a))', '((a)*)*', '(a|b)*c',
        '(a|b)+c', '(a|ab)(c|bcd)(d*)');
    // Repetition stacking.
    out.push('a**', 'a*+', 'a*?', 'a+*', 'a++', 'a+?', 'a?*', 'a?+', 'a??', 'a*{1}',
        'a{1}*', 'a*{', '(a)**', '[a]**', '.**', 'a{1}{2}', '\\a*', 'a\\**', '**',
        '*a', '+a', '?a', '{1}a', 'a|*', '(*)', '(+)', '(?)', '^*a', '$+');
    // The sample's patterns and patterns players type.
    out.push('\\w+ spear', '\\bdagger\\b', '\\<dagger\\>', '[[:<:]]dagger', 'sp\\ear',
        '\\+1', '\\s\\+0', '\\S+ dagger', '\\W\\(', 'dagger\\B', '(spear|)',
        '(|dagger)', 'spea{,1}r', 'x**', '^a - ', 'shield)$', '(.)\\1', '(o)\\1d',
        '[]a]x', '[^]]', '[[.space.]]dagger', '[[:alpha:]]+ spear', 'spe(ar)?',
        '()spear', 'a|*b', 'dagger{1,2}', 'x{0}spear', '\\d', '[[:word:]]',
        '\xc3\xa9|spear', '[\xc3\xa0-\xc3\xbf]', 'b*+', '^*spear', 'spear|',
        '|spear', 'blessed', 'uncursed', 'spear', '+1', '+0 dagger', '*dagger',
        '?spear', '\\(being worn\\)', '(being worn)', '(weapon|alternate)',
        'spear.*hand', '[0-9]+ ', 'food ration$', '^an ', 'a{,2}', 'spe{,2}ar',
        'x{,0}spear', 'spear{,}', '{,1}', 'a{,}', 'dag{1,}er', 'dagger\\b', '\\.',
        '.', ' +', '^He((l)|x){1,2}\\2o', '^He(l|x)\\1o', 'l(.*){0,2}\\1{1,}',
        '(o)+\\1k', '((u)p )+o\\2', '( +a?){2,}\\1*', '\\[caf.\\]', '\\[caf..\\]',
        '\\1', '(a)\\2', '((((((((((a))))))))))', '((((((((((a))))))))))\\10',
        '\\', 'a\\', '\\\\', 'a\\\\', '\\n', '\\t', '\\x41', '\\x{41}', '\\Qa*\\E');
    // Long patterns, up to NetHack's BUFSZ - 1 bytes.
    out.push('a'.repeat(255), 'a?'.repeat(127), '(a|aa)*' + 'a?'.repeat(123) + 'b$',
        '('.repeat(100) + 'a' + ')'.repeat(100), '[a]'.repeat(85), 'a*'.repeat(127),
        '(a*)*'.repeat(51));
    return out;
}

// Patterns whose compilation may take long or exhaust memory: nested
// bounds multiply copies of the iterated expression (tre_expand_ast()).
export const ISOLATED = [
    'a{255}', 'a{0,255}', '(a{0,255}){2}', '(a{0,255}){0,16}', '(a{0,255}){0,64}',
    '(a{0,255}){0,255}', '(a{255}){255}', '(a{16}){16}', '(a{64}){64}',
    '((a{255}){255}){255}', '((a{16}){16}){16}', '(a|b){0,255}', '([ab]{0,255}){0,255}',
    '(((a{0,8}){0,8}){0,8}){0,8}', '(.*){255}', '(a*){255}', '(a?){255}',
];

export function allCases() {
    const seen = new Set();
    const cases = [];
    const add = (pattern, isolated) => {
        if (seen.has(pattern)) return;
        seen.add(pattern);
        cases.push(isolated ? { pattern, isolated: true } : { pattern });
    };
    for (const p of exhaustive(3)) add(p, false);
    for (const p of sampled(4000, 0x5eed)) add(p, false);
    for (const p of curated()) add(p, false);
    for (const p of ISOLATED) add(p, true);
    return cases;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const cases = allCases();
    const lines = [JSON.stringify({ texts: TEXTS }),
        ...cases.map((c, i) => JSON.stringify({ id: i, ...c }))];
    writeFileSync(join(HERE, 'cases.jsonl'), `${lines.join('\n')}\n`);
    console.log(`${cases.length} patterns, ${TEXTS.length} texts`);
}
