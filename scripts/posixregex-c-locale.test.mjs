// sys/share/posixregex.c hands MENUCOLOR, MSGTYPE and autopickup-exception
// patterns to glibc's regcomp(REG_EXTENDED | REG_NOSUB) and regexec(). No
// code on the Unix tty path calls setlocale(), so glibc runs in the C
// locale: each UTF-8 byte of a pattern or text is one character. Every
// expected value below is the answer of a regcomp()/regexec() probe built
// against the recorder's glibc (2.39) and run without setlocale(); the
// recipe recipes/posixregex.c/menucolor-utf8-fruit-bytes shows the same
// rule in a game.

import assert from 'node:assert/strict';
import test from 'node:test';

import { utf8Text } from '../js/hacklib.js';

import {
    regex_compile,
    regex_error_desc,
    regex_init,
    regex_match,
} from '../js/posixregex.js';

// [pattern, [text, matches]...]. "é" is the two bytes C3 A9 and "日" the
// three bytes E6 97 A5.
const MATCHES = [
    // A non-ASCII literal matches its own bytes.
    ['é', ['é', true], ['e', false]],
    // '.' and a bracket each take one byte, so "é" needs two of them.
    ['caf.$', ['café', false]],
    ['caf..$', ['café', true]],
    ['^.$', ['é', false]],
    ['^..$', ['é', true]],
    ['^.{3}$', ['日', true]],
    ['^[é]$', ['é', false]],
    ['^[é][é]$', ['é', true]],
    ['^[^a][^a]$', ['é', true]],
    // The C locale's character classes, \w and \b hold ASCII bytes only.
    ['[[:alpha:]]', ['é', false]],
    ['[[:print:]]', ['é', false]],
    ['[[:punct:]]', ['é', false]],
    ['[[:graph:]]', ['é', false]],
    ['[[:cntrl:]]', ['é', false]],
    ['[^[:alpha:]]', ['é', true]],
    [String.raw`\w`, ['é', false]],
    [String.raw`\W`, ['é', true]],
    [String.raw`\bé`, ['é', false], [' é', false]],
    // A range compares byte values: [a-é] is a-\xC3 plus \xA9, and
    // U+00C0-U+00FF is \xC3\x80-\xC3 plus \xBF, holding both bytes of "é"
    // but not 'e'.
    ['[a-é]', ['b', true], ['é', true], ['©', true]],
    ['[À-ÿ]', ['é', true], ['e', false]],
    // A repeat binds to the last byte; a group or backreference to all.
    ['é+', ['é', true], ['éé', true]],
    ['^é{2}$', ['éé', false], ['é©', false]],
    ['^(é){2}$', ['éé', true]],
    [String.raw`^(é)\1$`, ['éé', true]],
    ['日本', ['日本語', true]],
];

// Patterns regcomp() rejects in the C locale, with regerror()'s text.
const ERRORS = [
    // [é-a] is \xC3 then the range \xA9-a, which runs backwards.
    ['[é-a]', 'Invalid range end'],
    // A collating or equivalence element must be one byte.
    ['[[.é.]]', 'Invalid collation character'],
    ['[[=é=]]', 'Invalid collation character'],
];

test('regex_match treats each UTF-8 byte as one character', () => {
    for (const [pattern, ...texts] of MATCHES) {
        const regex = regex_init();
        // Configured patterns and the text they match are UTF-8 bytes.
        assert.equal(regex_compile(utf8Text(pattern), regex), true, pattern);
        for (const [text, expected] of texts) {
            assert.equal(regex_match(utf8Text(text), regex), expected,
                `${pattern} ${text}`);
        }
    }
});

test('regex_compile rejects multibyte range ends and collating elements', () => {
    for (const [pattern, diagnostic] of ERRORS) {
        const regex = regex_init();
        assert.equal(regex_compile(utf8Text(pattern), regex), false, pattern);
        assert.equal(regex_error_desc(regex), diagnostic, pattern);
    }
});
