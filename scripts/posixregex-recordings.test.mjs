// C refs: sys/share/posixregex.c regex_compile(), regex_error_desc() and
// regex_match(); options.c test_regex_pattern() and msgtype_type().
//
// The judge's recorder ran on macOS, whose regcomp() and regerror() (Apple
// Libc TRE and FreeBSD's regerror.c) differ from glibc's: in every error
// text, in the patterns each accepts, and in what \1, \w or {,n} mean.
// The port follows macOS (js/regcomp.js), so the committed recordings of
// regex paths that differ between the hosts are macOS recordings, made by
// .github/workflows/macos-recorder.yml (run 44628090866). Each recording
// below must show the text that only the macOS host prints and must replay.
// No recording under recordings/ may show glibc's regerror() text, which a
// recording made on Linux would.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { listRecordings, RECORDINGS_DIR } from './score-recordings.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// [recording under recordings/, what it shows only on macOS]
const CASES = [
    // An unmatched "(" typed as an autopickup exception: REG_EPAREN.
    ['options.c/autopickup-exception-regex-errors', 'parentheses not balanced.'],
    // "<*arrow": "*" with no operand is REG_BADRPT.
    ['options.c/autopickup-exception-regex-errors', 'repetition-operator operand invalid.'],
    // An unmatched "[" typed as a menu colour: REG_EBRACK.
    ['options.c/handler_menu_colors-unmatched-bracket-and-paren-regex-errors-elf-priest',
        'brackets ([ ]) not balanced.'],
    // A trailing "\" typed as a message type: REG_EESCAPE.
    ['options.c/handler_msgtype-trailing-backslash-regex-error-dwarf-valkyrie',
        'trailing backslash (\\).'],
    // MSGTYPE=hide "(o)+\1k": \1 is the digit, so the welcome shows.
    ['posixregex.c/msgtype-fixed-repeat-backref', 'Velkommen Brook, welcome to NetHack!'],
    // MSGTYPE=hide "^He((l)|x){1,2}\2o" and "^He(l|x)\1o" hide nothing.
    ['posixregex.c/trial-repeated-greeting', 'Hello RegexTrial, welcome to NetHack!'],
    ['posixregex.c/trial-simple-greeting-control', 'Hello RegexTrial, welcome to NetHack!'],
    // The same game with no MSGTYPE line, identical on both hosts.
    ['posixregex.c/trial-greeting-unfiltered-control', 'Hello RegexTrial, welcome to NetHack!'],
];

function screens(recording) {
    return recording.segments.flatMap(({ steps }) => steps.map(({ screen }) => screen ?? ''));
}

for (const [name, expected] of CASES) {
    test(`macOS regex recording ${name} shows ${JSON.stringify(expected)}`, async () => {
        const recording = JSON.parse(readFileSync(`${RECORDINGS_DIR}/${name}.session.json`, 'utf8'));
        assert.ok(screens(recording).some((screen) => screen.includes(expected)),
            `${name} must show ${JSON.stringify(expected)}`);
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}

// glibc 2.39 posix/regcomp.c __re_error_msgid: the texts regerror() returns
// on Linux for the codes regcomp() reports, none of which macOS prints.
const GLIBC_REGERROR = [
    'Invalid regular expression',
    'Invalid collation character',
    'Invalid character class name',
    'Trailing backslash',
    'Invalid back reference',
    'Unmatched [, [^, [:, [., or [=',
    'Unmatched ( or \\(',
    'Unmatched \\{',
    'Invalid content of \\{\\}',
    'Invalid range end',
    'Memory exhausted',
    'Invalid preceding regular expression',
    'Premature end of regular expression',
    'Regular expression too big',
    'Unmatched ) or \\)',
];

test('no recording shows glibc regerror() text', () => {
    const offenders = [];
    for (const path of listRecordings()) {
        const text = readFileSync(`${RECORDINGS_DIR}/${path}`, 'utf8');
        if (!GLIBC_REGERROR.some((message) => text.includes(JSON.stringify(message).slice(1, -1))))
            continue;
        for (const screen of screens(JSON.parse(text))) {
            for (const message of GLIBC_REGERROR)
                if (screen.includes(message)) offenders.push(`${path}: ${message}`);
        }
    }
    assert.deepEqual(offenders, []);
});
