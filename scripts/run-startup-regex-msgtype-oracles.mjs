#!/usr/bin/env node

// Compare the port against fresh recorder-ABI libc calls and the exact
// pline.c vpline() modest-overflow byte rewrite. These direct C oracles cover
// source behavior that valid startup rows can compile but cannot all make the
// running game emit on demand, especially diagnostics and a 256-byte pline.

import assert from 'node:assert/strict';
import {
    mkdtempSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import {
    regex_compile,
    regex_error_desc,
    regex_init,
    regex_match,
} from '../js/posixregex.js';
import { ttyPline } from '../js/tty_message.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = resolve(SCRIPT_PATH, '..');
const FIXTURE_DIR = join(SCRIPT_DIR, 'fixtures');
const DIRECT_RESOURCE_PATTERN = '^' + '()'.repeat(121) + '(|)(a|aa)*b$';
const REFERENCE_RESOURCE_PATTERN = String.raw`^((a)|(a)|(a)|(a))*\2\3\4\5`
    + '()'.repeat(113) + 'b$';

function run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${command} exited ${result.status}: ${result.stderr.trim()}`,
        );
    }
    return result.stdout;
}

function runBuffer(command, args) {
    const result = spawnSync(command, args);
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${command} exited ${result.status}: ${result.stderr.toString().trim()}`,
        );
    }
    return result.stdout;
}

function compile(source, output) {
    run('clang', [
        '-std=c11', '-Wall', '-Wextra', '-Werror',
        join(FIXTURE_DIR, source), '-o', output,
    ]);
}

const REGEX_CASES = Object.freeze([
    [String.raw`(a)\1`, ['aa', 'a1']],
    [String.raw`(a)\10`, ['aa0', 'a10']],
    [String.raw`^(a)\1|(b)\2$`, ['aa', 'bb', 'ab']],
    [String.raw`^(a)?\1|a$`, ['a', 'aa', 'b']],
    [String.raw`^(X)?\1Hello`, ['XXHello', 'Hello']],
    [String.raw`^\bfoo\b$`, ['foo', 'foo_']],
    [String.raw`\Boo\B`, ['xooz', 'foo']],
    [String.raw`\<foo\>`, [' foo ', '_foo']],
    [String.raw`^\w+$`, ['abc_123', 'abc-']],
    [String.raw`^\W+$`, [' -', '_']],
    [String.raw`^\s+$`, ['\t\n\v\f\r ', 'a']],
    [String.raw`^\S+$`, ['abc_123', 'a b']],
    ['^[]-a]$', [']', 'b']],
    [String.raw`(a|(b))b?\2`, ['abb', 'ab']],
    [String.raw`((a)?\2x.x|a)`, ['xax', 'xxx']],
    [String.raw`((a)?\2|a)`, ['a', 'b']],
    ['^a{,}$', ['', 'aaa', 'b']],
    ['^a{,2}$', ['aa', 'aaa']],
    ['^a{2}{3}$', ['aaaaaa', 'aaaaa']],
    ['^[a-]$', ['-', 'b']],
    [String.raw`\`a`, ['a', 'ba']],
    [String.raw`a\'`, ['a', 'ab']],
    ['$.', ['\n', 'a']],
    ['a$.', ['a\n', 'a']],
    ['.+^', ['\n', 'a']],
    ['^end$', ['end', 'end\n']],
    [String.raw`(a)|(b)\2`, ['a', 'bb', 'b']],
    [String.raw`(|())\2`, ['', 'x']],
    [String.raw`^((a)|b)*\2`, ['aab', 'abb']],
    [String.raw`^((a)|b)*\2$`, ['aba', 'abb']],
    ['^[^[:digit:]]$', ['a', '7']],
    ['^)$', [')', '']],
    [String.raw`^(()*)\2$`, ['', 'a']],
    [String.raw`^(()){2}\2$`, ['', 'a']],
    [String.raw`^(()){2,}\2$`, ['', 'a']],
    [String.raw`^((a|c)|b)*\2$`, ['abcc', 'abca']],
    [String.raw`^(a){0,2}\1$`, ['aa', 'aaa', 'aaaa']],
    [String.raw`^(a){1,3}\1$`, ['aa', 'aaa', 'aaaa']],
    [String.raw`^(a+)+\1$`, ['aa', 'aaa', 'aaaa']],
    [String.raw`(l){0,2}\1`, ['Hello', 'Hlllo']],
    [String.raw`^(a){2,3}\1$`, ['aa', 'aaa', 'aaaa', 'aaaaa']],
    [String.raw`^([[:digit:]])\1$`, ['44', '45']],
    [String.raw`\`(a)\1\'`, ['aa', 'baa', 'aab']],
    [String.raw`(()^b)\1`, ['\nbb']],
    ['()^b', ['\nb']],
    ['a*^b', ['a\nb']],
    ['.+^b', ['\nb']],
    [String.raw`^((ab|c)|x)*\2$`, [
        'abab', 'abxab', 'abcc', 'cc', 'xabxabab', 'ababc', 'xc', 'abxc',
    ]],
    [DIRECT_RESOURCE_PATTERN, ['a'.repeat(255)]],
    [REFERENCE_RESOURCE_PATTERN, ['a'.repeat(255)]],
]);

const REGEX_ERRORS = Object.freeze([
    [String.raw`\1`, 'Invalid back reference'],
    [String.raw`(a)\2`, 'Invalid back reference'],
    [String.raw`(a\1)`, 'Invalid back reference'],
    [String.raw`\b*`, 'Invalid preceding regular expression'],
    [String.raw`\B+`, 'Invalid preceding regular expression'],
    [String.raw`\<{1}`, 'Invalid preceding regular expression'],
    [String.raw`\>?`, 'Invalid preceding regular expression'],
    ['[]--]', 'Invalid range end'],
    [String.raw`\`*`, 'Invalid preceding regular expression'],
    [String.raw`\'+`, 'Invalid preceding regular expression'],
    [String.raw`(a)|\1`, 'Invalid back reference'],
    [String.raw`(a)\1{a,`, String.raw`Invalid content of \{\}`],
    ['a{a,,', String.raw`Invalid content of \{\}`],
    ['a{a,', String.raw`Invalid content of \{\}`],
    ['a{1a,', String.raw`Invalid content of \{\}`],
    ['a{,', String.raw`Unmatched \{`],
    ['a{1,', String.raw`Unmatched \{`],
    ['a{a', String.raw`Unmatched \{`],
    ['a{1', String.raw`Unmatched \{`],
]);

function checkRegexOracle(executable) {
    let comparisons = 0;
    for (const [pattern, inputs] of REGEX_CASES) {
        const cLines = run(executable, [pattern, ...inputs]).trimEnd()
            .split('\n');
        assert.equal(cLines.shift(), 'ok', pattern);
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        for (let index = 0; index < inputs.length; ++index) {
            assert.equal(
                regex_match(inputs[index], regex),
                cLines[index] === '1',
                JSON.stringify({ pattern, input: inputs[index] }),
            );
            ++comparisons;
        }
    }
    for (const [pattern, diagnostic] of REGEX_ERRORS) {
        assert.equal(
            run(executable, [pattern]).trimEnd(),
            `error\t${diagnostic}`,
            pattern,
        );
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), false, pattern);
        assert.equal(regex_error_desc(regex), diagnostic, pattern);
        ++comparisons;
    }
    return comparisons;
}

async function checkVplineOracle(executable) {
    const cases = [
        'a'.repeat(253) + 'XYZ',
        'a'.repeat(249) + 'REMOVED' + 'b'.repeat(41) + 'XYZ',
        'q'.repeat(508) + 'END',
        'a'.repeat(248) + 'é' + 'removed' + 'XYZ',
        'b'.repeat(253) + 'é',
    ];
    for (const input of cases) {
        resetGame();
        game.nhDisplay = new GameDisplay(null);
        game.iflags = { cbreak: true };
        game.program_state = {};
        game.u = { ux: 0, uy: 0 };
        game.gp = { plinemsg_types: null };
        game._ttyPreviousMessage = '';
        for (let index = 0; index < 8; ++index)
            game.nhDisplay.pushKey(' '.charCodeAt(0));
        await ttyPline(input, game);
        assert.deepEqual(
            encodeUtf8ByteString(game._ttyPreviousMessage),
            Array.from(runBuffer(executable, [input])),
            String(input.length),
        );
    }
    return cases.length;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const directory = mkdtempSync(join(tmpdir(), 'startup-regex-msgtype-'));
    try {
        const regexOracle = join(directory, 'posixregex-oracle');
        const vplineOracle = join(directory, 'vpline-normalize-oracle');
        compile('posixregex-oracle.c', regexOracle);
        compile('vpline-normalize-oracle.c', vplineOracle);
        const regexComparisons = checkRegexOracle(regexOracle);
        const vplineComparisons = await checkVplineOracle(vplineOracle);
        process.stdout.write(
            `STARTUP REGEX/MSGTYPE C ORACLES: ${regexComparisons}`
                + ` regex + ${vplineComparisons} vpline comparisons passed\n`,
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        process.stderr.write(
            `startup regex/msgtype C oracles: ${error.message || error}\n`,
        );
        process.exitCode = 1;
    });
}
