// Pin hacklib.c's string and character helpers. The game does not call most of
// these yet, so these expectations are the only proof the ports are correct.
// Every expected value below is derived by reading hacklib.c, not by running the
// JavaScript and recording what it produced.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LARGEST_INT } from '../js/const.js';
import {
    chrcasecpy,
    digit,
    eos,
    highc,
    ing_suffix,
    lcase,
    letter,
    lowc,
    mungspaces,
    onlyspace,
    ordin,
    s_suffix,
    sgn,
    sitoa,
    str_end_is,
    str_lines_maxlen,
    str_start_is,
    strcasecpy,
    strip_newline,
    stripchars,
    stripdigits,
    strsubst,
    tabexpand,
    trimspaces,
    ucase,
    upstart,
    upwords,
    visctrl,
} from '../js/hacklib.js';
import { Strlen_ } from '../js/strutil.js';

const HACKLIB_SOURCE = readFileSync('nethack-c/upstream/src/hacklib.c', 'utf8');
const STRUTIL_SOURCE = readFileSync('nethack-c/upstream/src/strutil.c', 'utf8');
const GLOBAL_SOURCE = readFileSync('nethack-c/upstream/include/global.h', 'utf8');
const OBJNAM_SOURCE = readFileSync('nethack-c/upstream/src/objnam.c', 'utf8');
const FRUIT_SOURCE = readFileSync('js/fruit.js', 'utf8');

test('eos returns the C byte offset at the first NUL terminator', () => {
    assert.match(
        HACKLIB_SOURCE,
        /eos\(char \*s\)[\s\S]*?while \(\*s\)\s*s\+\+;[\s\S]*?return s;/u,
    );
    assert.equal(eos(''), 0);
    assert.equal(eos('room'), 4);
    // C advances one char pointer byte at a time; this UTF-8 character uses
    // two bytes even though JS exposes one Unicode code point.
    assert.equal(eos('é'), 2);
    assert.equal(eos('a\0tail'), 1);
    assert.equal(eos('é\0tail'), 2);
});

test('Strlen_ is the bounded strutil owner used by makeplural', () => {
    assert.match(
        STRUTIL_SOURCE,
        /Strlen_\([\s\S]*?for \(p = str, len = 0; len < LARGEST_INT; \+\+len\)\s*if \(\*p\+\+ == '\\0'\)\s*break;[\s\S]*?if \(len == LARGEST_INT\)\s*panic\("%s:%d string too long", file, line\);[\s\S]*?return \(unsigned\) len;/u,
    );
    assert.match(GLOBAL_SOURCE, /#define Strlen\(s\) Strlen_\(s,__func__,__LINE__\)/u);
    assert.match(OBJNAM_SOURCE, /len = Strlen\(str\);/u);
    assert.match(FRUIT_SOURCE, /Strlen_\(base, 'makeplural', 2895\)/u);
    assert.match(GLOBAL_SOURCE, /#define LARGEST_INT 32767/u);
    assert.equal(LARGEST_INT, 32767);

    // C returns the byte count, including for UTF-8, up to the first NUL.
    assert.equal(Strlen_('', 'test', 1), 0);
    assert.equal(Strlen_('NetHack', 'test', 1), 7);
    assert.equal(Strlen_('a\0tail', 'test', 1), 1);
    assert.equal(Strlen_('é', 'test', 1), 2);
    assert.equal(Strlen_('水', 'test', 1), 3);
    assert.equal(
        Strlen_('a'.repeat(LARGEST_INT - 1), 'test', 1),
        LARGEST_INT - 1,
    );
    assert.equal(
        Strlen_(`${'a'.repeat(LARGEST_INT - 1)}\0tail`, 'test', 1),
        LARGEST_INT - 1,
    );
    // C calls panic at the fixed bound. Long nonterminated input is outside
    // the valid fixed-buffer game strings, but pin the diagnostic boundary.
    assert.throws(
        () => Strlen_('a'.repeat(LARGEST_INT), 'objnam.c', 123),
        /objnam.c:123 string too long/u,
    );
});

test('digit() accepts only ASCII 0-9', () => {
    for (const c of '0123456789') assert.equal(digit(c), true);
    // '/' and ':' bracket the digit range in ASCII.
    for (const c of ['/', ':', 'a', ' ']) assert.equal(digit(c), false);
});

test('letter() classes @ as a letter but not the punctuation after Z', () => {
    assert.equal(letter('@'), true);   // 0100, start of the first range
    assert.equal(letter('A'), true);
    assert.equal(letter('Z'), true);   // 0132, end of the first range
    assert.equal(letter('a'), true);
    assert.equal(letter('z'), true);
    // 0133-0137 sit between 'Z' and 'a' and are excluded by both ranges.
    for (const c of ['[', '\\', ']', '^', '_']) assert.equal(letter(c), false);
    assert.equal(letter('?'), false);  // 077, just below '@'
});

test('highc() and lowc() only touch letters', () => {
    assert.equal(highc('a'), 'A');
    assert.equal(highc('z'), 'Z');
    assert.equal(highc('A'), 'A');     // already upper, unchanged
    assert.equal(highc('1'), '1');     // clearing 040 would corrupt a digit
    assert.equal(lowc('A'), 'a');
    assert.equal(lowc('Z'), 'z');
    assert.equal(lowc('a'), 'a');
    assert.equal(lowc('!'), '!');      // setting 040 would corrupt punctuation
});

test('lcase() and ucase() convert letters and leave the rest alone', () => {
    assert.equal(lcase('AbC-1'), 'abc-1');
    assert.equal(ucase('AbC-1'), 'ABC-1');
});

test('upstart() capitalizes only the first character', () => {
    assert.equal(upstart('scroll of mail'), 'Scroll of mail');
    assert.equal(upstart(''), '');
});

test('upwords() starts a word only after a space', () => {
    assert.equal(upwords('scroll of mail'), 'Scroll Of Mail');
    // Only ' ' resets the word flag, so a hyphen does not start a new word.
    assert.equal(upwords('two-handed sword'), 'Two-handed Sword');
    // The apostrophe is not a letter(), so it does not consume the word start,
    // but it does clear the flag and 's' stays lowercase.
    assert.equal(upwords("it's"), "It's");
});

test('trimspaces() removes leading and trailing spaces and tabs only', () => {
    assert.equal(trimspaces('  \tfoo bar\t '), 'foo bar');
    assert.equal(trimspaces('   '), '');
    // A newline is not whitespace to this function.
    assert.equal(trimspaces(' foo\n'), 'foo\n');
});

test('strip_newline() truncates at the last newline, taking a CR with it', () => {
    assert.equal(strip_newline('line\n'), 'line');
    assert.equal(strip_newline('line\r\n'), 'line');
    assert.equal(strip_newline('no newline'), 'no newline');
    // strrchr finds the LAST newline, so earlier text and the tail after it go.
    assert.equal(strip_newline('a\nb\nc'), 'a\nb');
});

test('str_end_is() compares only the tail', () => {
    assert.equal(str_end_is('gnome lord', ' lord'), true);
    assert.equal(str_end_is('gnome lord', 'Lord'), false); // case-sensitive
    // A check string longer than the subject fails the length guard.
    assert.equal(str_end_is('elf', 'high elf'), false);
    assert.equal(str_end_is('anything', ''), true);
});

test('str_lines_maxlen() returns the longest newline-separated run', () => {
    assert.equal(str_lines_maxlen('ab\nabcd\nabc'), 4);
    assert.equal(str_lines_maxlen('single'), 6);
    assert.equal(str_lines_maxlen(''), 0);
    // A trailing newline contributes no further line.
    assert.equal(str_lines_maxlen('abc\n'), 3);
});

test('chrcasecpy() forces the new char into the old char\'s case', () => {
    assert.equal(chrcasecpy('a', 'B'), 'b');   // old lower, new upper
    assert.equal(chrcasecpy('A', 'b'), 'B');   // old upper, new lower
    assert.equal(chrcasecpy('a', 'b'), 'b');   // cases already agree
    assert.equal(chrcasecpy('1', 'B'), 'B');   // old is not a letter
});

test('s_suffix() special-cases it/you and words ending in s', () => {
    assert.equal(s_suffix('gnome'), "gnome's");
    assert.equal(s_suffix('Gauss'), "Gauss'");   // trailing s takes bare '
    assert.equal(s_suffix('it'), 'its');
    assert.equal(s_suffix('you'), 'your');
    // The it/you tests are case-blind in C via strcmpi.
    assert.equal(s_suffix('You'), 'Your');
    assert.equal(s_suffix('It'), 'Its');
});

test('ing_suffix() applies each stem rule from hacklib.c', () => {
    // "er" stem: no doubling, no elision.
    assert.equal(ing_suffix('slither'), 'slithering');
    // consonant-vowel-consonant: double the final consonant.
    assert.equal(ing_suffix('tip'), 'tipping');
    // "ie" -> "y".
    assert.equal(ing_suffix('vie'), 'vying');
    // trailing 'e' is dropped.
    assert.equal(ing_suffix('grease'), 'greasing');
    // A trailing preposition is set aside and reattached after "ing".
    assert.equal(ing_suffix('put on'), 'putting on');
    assert.equal(ing_suffix('take off'), 'taking off');
    assert.equal(ing_suffix('fight with'), 'fighting with');
});

test('onlyspace() treats space and tab as the only whitespace', () => {
    assert.equal(onlyspace(' \t '), true);
    assert.equal(onlyspace(''), true);
    assert.equal(onlyspace(' x '), false);
    assert.equal(onlyspace('\n'), false); // newline is not space or tab
});

test('tabexpand() advances each tab to the next multiple of 8', () => {
    assert.equal(tabexpand('\tx'), '        x');       // 0 -> 8
    assert.equal(tabexpand('a\tb'), 'a       b');      // 1 -> 8, 7 spaces
    assert.equal(tabexpand('abcdefg\th'), 'abcdefg h'); // 7 -> 8, 1 space
    assert.equal(tabexpand('abcdefgh\ti'), 'abcdefgh        i'); // 8 -> 16
    assert.equal(tabexpand(''), '');
});

test('visctrl() renders control, meta, and delete bytes', () => {
    assert.equal(visctrl('\x01'), '^A');        // 001 | 0100 = 'A'
    assert.equal(visctrl('\0'), '^@');        // 000 | 0100 = '@'
    assert.equal(visctrl('a'), 'a');              // printable, passed through
    assert.equal(visctrl('\x7f'), '^?');        // 0177 & ~0100 = '?'
    assert.equal(visctrl(''), 'M-^A');      // 0200 set, then 001
    assert.equal(visctrl('á'), 'M-a');       // 0200 set, then 'a'
});

test('stripchars() removes every listed character', () => {
    assert.equal(stripchars(' -', 'two-handed sword'), 'twohandedsword');
    assert.equal(stripchars('', 'unchanged'), 'unchanged');
    assert.equal(stripchars('abc', 'abc'), '');
});

test('stripdigits() removes ASCII digits only', () => {
    assert.equal(stripdigits('a1b22c'), 'abc');
    assert.equal(stripdigits('+3 long sword'), '+ long sword');
});

test('strsubst() replaces only the first occurrence', () => {
    assert.equal(strsubst('a cat and a cat', 'cat', 'dog'), 'a dog and a cat');
    assert.equal(strsubst('no match here', 'xyz', 'abc'), 'no match here');
    // An empty replacement deletes the matched text.
    assert.equal(strsubst('remove me now', 'me ', ''), 'remove now');
});

test('ordin() gives the teens "th" and otherwise keys off the last digit', () => {
    assert.equal(ordin(1), 'st');
    assert.equal(ordin(2), 'nd');
    assert.equal(ordin(3), 'rd');
    assert.equal(ordin(4), 'th');
    assert.equal(ordin(0), 'th');
    // (n % 100) / 10 == 1 forces "th" across the whole teens block.
    assert.equal(ordin(11), 'th');
    assert.equal(ordin(12), 'th');
    assert.equal(ordin(13), 'th');
    // ...but 21/22/23 return to the last-digit rule.
    assert.equal(ordin(21), 'st');
    assert.equal(ordin(22), 'nd');
    assert.equal(ordin(23), 'rd');
    assert.equal(ordin(111), 'th');
    assert.equal(ordin(101), 'st');
});

test('sitoa() signs non-negative numbers explicitly', () => {
    assert.equal(sitoa(5), '+5');
    assert.equal(sitoa(0), '+0');
    assert.equal(sitoa(-5), '-5');
});

test('sgn() returns -1, 0, or 1', () => {
    assert.equal(sgn(-7), -1);
    assert.equal(sgn(0), 0);
    assert.equal(sgn(7), 1);
});

test('strcasecpy overwrites in the destination\'s case', () => {
    // Each case is one of objnam.c vtense()'s four Strcasecpy() calls, whose
    // offsets come from that function's bspot pointer arithmetic.
    // "are" -> "is": src is shorter, so C's terminator drops the final 'e'.
    assert.equal(strcasecpy('are', 0, 'is'), 'is');
    assert.equal(strcasecpy('ARE', 0, 'is'), 'IS');
    // "have" -> "has": the 's' overwrites the lower-case 'v' at bspot - 1.
    assert.equal(strcasecpy('have', 2, 's'), 'has');
    assert.equal(strcasecpy('HAVE', 2, 's'), 'HAS');
    // "push" -> "pushes": dst is exhausted at bspot + 1, so both added
    // characters take the case of the last character written.
    assert.equal(strcasecpy('push', 4, 'es'), 'pushes');
    assert.equal(strcasecpy('PUSH', 4, 'es'), 'PUSHES');
    // "fly" -> "flies": the 'i' overwrites 'y' at bspot, then dst runs out.
    assert.equal(strcasecpy('fly', 2, 'ies'), 'flies');
    assert.equal(strcasecpy('FLY', 2, 'ies'), 'FLIES');
    // Case follows dst character by character: the non-letter '-' leaves 'X'
    // alone, as chrcasecpy() does, and the lower-case 'b' downcases 'Y'.
    assert.equal(strcasecpy('a-b', 1, 'XY'), 'aXy');
});

test('mungspaces() collapses runs and trims one leading and trailing space',
    () => {
    // hacklib.c mungspaces(): a tab counts as a space, a run collapses to
    // one, the leading space is dropped because was_space starts TRUE, and a
    // trailing space is dropped by the final decrement.
    assert.equal(mungspaces('  a   b  '), 'a b');
    assert.equal(mungspaces('a\tb'), 'a b');
    // eat.c hu_stat[] pads every entry to eight columns, which is what
    // insight.c status_enlightenment() runs this over.
    assert.equal(mungspaces('Hungry  '), 'Hungry');
    assert.equal(mungspaces('        '), '');
    // A newline ends the string, taking everything after it with it.
    assert.equal(mungspaces('one\ntwo'), 'one');
    assert.equal(mungspaces(''), '');
    // A lone space leaves p2 back at bp, so nothing is written.
    assert.equal(mungspaces(' '), '');
});

test('str_start_is() answers for the shorter of the two strings', () => {
    // hacklib.c str_start_is() walks both strings together. chkstr running
    // out first is the ordinary prefix answer.
    assert.equal(str_start_is('font_map', 'font', false), true);
    assert.equal(str_start_is('lit_corridor', 'font', false), false);
    // str running out first answers only if chkstr ended in the same place,
    // which makes two equal strings true from that arm.
    assert.equal(str_start_is('font', 'font', false), true);
    assert.equal(str_start_is('fon', 'font', false), false);
    // The empty string is a prefix of everything and only the empty string
    // starts with it.
    assert.equal(str_start_is('font', '', false), true);
    assert.equal(str_start_is('', '', false), true);
    assert.equal(str_start_is('', 'font', false), false);
    // caseblind runs both characters through lowc(), which touches ASCII
    // upper case alone; '_' is 0x5F, one past 'Z', and must survive it.
    assert.equal(str_start_is('FONT_map', 'font', true), true);
    assert.equal(str_start_is('FONT_map', 'font', false), false);
    assert.equal(str_start_is('COND_hp', 'cond_', true), true);
});
