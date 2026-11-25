// C refs: cmd.c handler_rebind_keys_add(), cmdbind_add(), bind_key().
//
// handler_rebind_keys_add() builds the command name in `char
// cmdstr[BUFSZ]`, which line 2356 leaves uninitialized. Unbinding
// (Strcat(cmdstr, "nothing"), line 2363) and binding a command without a
// parameter (Strcat(cmdstr, ec->ef_txt), line 2379) append to whatever the
// stack left there. On the judge's macOS build each of those binds prints
// "Key binding failed?!" (line 2402); a Linux recorder binds the key. A
// command with a parameter is written whole by Snprintf() (line 2376) and
// binds on both hosts. The port follows macOS (js/cmd.js
// handler_rebind_keys_add()), and the *-live recordings below were made on
// macOS by .github/workflows/macos-recorder.yml (run 44607258217).
//
// This file fails if the port binds on any Strcat() path again, if it stops
// binding on the parameter path, if one of these recordings, or any
// other recording under recordings/, shows a Strcat() bind succeeding, as a
// Linux recording would, or if a recording below whose bind fails is not
// macOS-only (scripts/recipe-host.mjs) or one whose bind succeeds is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { isMacosOnly } from './recipe-host.mjs';
import { listRecordings, RECORDINGS_DIR } from './score-recordings.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

const FAILED = 'Key binding failed?!';

// [recording under recordings/cmd.c/, path through handler_rebind_keys_add(),
// text the C recording must show at the bind]
const CASES = [
    ['bind-new-key-live', 'key first, Strcat(cmdstr, ec->ef_txt), unbound key', FAILED],
    ['bind-existing-key-live', 'key first, Strcat(cmdstr, ec->ef_txt), bound key', FAILED],
    ['unbind-key-live', 'key first, Strcat(cmdstr, "nothing"), bound key', FAILED],
    ['unbind-unbound-key-live', 'key first, Strcat(cmdstr, "nothing"), unbound key', FAILED],
    ['bind-command-first-live', 'command first, Strcat(cmdstr, ec->ef_txt)', FAILED],
    ['unbind-command-first-live', 'command first, Strcat(cmdstr, "nothing")', FAILED],
    ['bind-after-param-live', 'Strcat() bind after a Snprintf() bind in one menu visit', FAILED],
    ['toggle-bound-param-menu', 'key first, Snprintf()',
        'Bound key \'~\' to "toggle(autopickup)".'],
    ['bind-command-first-param-live', 'command first, Snprintf()',
        'Bound key \'%\' to "toggle(showexp)".'],
    ['bind-toggle-empty-param-reports-and-lists-null', 'key first, Snprintf(), empty parameter',
        'Bound key \'~\' to "toggle()".'],
    ['bind-key-menu-cancel', '"Do what?" menu dismissed', 'Do what?'],
];

function screens(recording) {
    return recording.segments.flatMap(({ steps }) => steps.map(({ screen }) => screen ?? ''));
}

for (const [name, path, expected] of CASES) {
    test(`options-menu rebind, ${path}: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/cmd.c/${name}.session.json`, import.meta.url), 'utf8'));
        assert.ok(screens(recording).some((screen) => screen.includes(expected)),
            `${name} must show ${JSON.stringify(expected)}`);
        // Only a failing bind differs between the hosts. The recording
        // carries its recipe's field (scripts/recipe-host.test.mjs).
        assert.equal(isMacosOnly(recording), expected === FAILED, `${name}: macOS-only`);
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}

// bind_key() succeeds and line 2395 or 2398 prints cmdstr. A name with no
// parenthesis came from a Strcat() arm, which succeeds only on Linux.
const BIND_MESSAGE = /(?:Bound key '.{1,8}?'|Changed key '.{1,8}?' from "[^"]*") to "([^"]*)"\./gu;

test('no recording shows a Strcat() rebind succeeding', () => {
    const offenders = [];
    for (const path of listRecordings()) {
        const text = readFileSync(`${RECORDINGS_DIR}/${path}`, 'utf8');
        if (!text.includes('Bound key') && !text.includes('Changed key')) continue;
        for (const screen of screens(JSON.parse(text))) {
            for (const [, cmdstr] of screen.matchAll(BIND_MESSAGE)) {
                if (!cmdstr.includes('(')) offenders.push(`${path}: ${cmdstr}`);
            }
        }
    }
    assert.deepEqual(offenders, []);
});
