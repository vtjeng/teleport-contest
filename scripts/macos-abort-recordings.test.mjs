// C refs: restore.c restore_menu() (1599), pager.c do_screen_description()
// (1613), win/tty/getline.c hooked_tty_getlin() (50-55) and wintty.c
// tty_clear_nhwindow() (1040-1041).
//
// The games below end in SIGABRT on macOS, the judge's host, where a Linux
// recorder carries on or faults elsewhere: macOS's checked strcpy() and
// strcat() abort on the overflows in restore_menu() and
// do_screen_description(), and the saved-games menu search reads
// wins[WIN_MESSAGE] while WIN_MESSAGE is still WIN_ERR, which on macOS is
// ttyDisplay and on Linux NULL. The port follows macOS (js/restore.js,
// js/pager.js, js/getline.js), so these recordings were made on macOS by
// .github/workflows/macos-recorder.yml (run 44990016952, recorded twice
// with identical output); a Linux recorder cannot record these recipes.
//
// This file fails if one of them stops replaying, if a segment the table
// names does not end in SIGABRT at its last key or another segment does,
// if the menu-search recording does not echo where macOS does, or if a
// recipe that ends a segment on a signal is missing from the table.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { decodeScreen } from '../frozen/screen-decode.mjs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { RECORDINGS_DIR } from './score-recordings.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

const RECIPES_DIR = new URL('../recipes/', import.meta.url);

// [recording under recordings/, indexes of the segments that end in
// SIGABRT on macOS]. Each later segment shows the next start.
const CASES = [
    // The pick in the saved-games menu aborts; the menu comes back.
    ['restore.c/restore_menu-long-name-pick-aborts', [1]],
    // The travel prompt's cursor reaches a 226-character engraving.
    ['pager.c/do_screen_description-engraving-text-226-aborts', [0]],
    // Return, then Escape over text, at the saved-games menu search.
    ['getline.c/menu-search-before-message-window', [1, 2]],
];

// end.c panic() from debug-mode #panic: NH_abort() raises SIGABRT on every
// host, so these record alike on Linux and macOS.
const HOST_INDEPENDENT = [
    'unixunix.c/panic-save-question-across-segments',
    'unixunix.c/panic-save-question-space-takes-default',
];

function readRecording(name) {
    return JSON.parse(readFileSync(`${RECORDINGS_DIR}/${name}.session.json`, 'utf8'));
}

for (const [name, aborting] of CASES) {
    test(`macOS abort recording ${name}`, async () => {
        const recording = readRecording(name);
        recording.segments.forEach((segment, i) => {
            if (aborting.includes(i)) {
                assert.equal(segment.terminalSignal, 'SIGABRT', `segment ${i}`);
                assert.deepEqual(
                    { key: segment.terminalExit?.key, signal: segment.terminalExit?.signal },
                    { key: segment.moves.at(-1), signal: 'SIGABRT' },
                    `segment ${i} must end in SIGABRT at its last key`);
                // No step for the key that aborted: one per earlier key and
                // one for the start.
                assert.equal(segment.steps.length, segment.moves.length, `segment ${i}`);
            } else {
                assert.equal(segment.terminalSignal, undefined, `segment ${i}`);
            }
        });
        const recipe = JSON.parse(readFileSync(new URL(`${name}.session.json`, RECIPES_DIR), 'utf8'));
        assert.match(recipe.comment, /record this recipe on macOS/iu);
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}

test('the menu search echoes where the saved-games menu left the cursor', () => {
    // Segment 1 is ">:dw\bArc\r"; step 3 follows "d". The menu's last line
    // is "(end)" at column 17 of row 9, so ttyDisplay's cursor is at column
    // 23, where topl_putsym() writes; the prompt itself went to row 0
    // through raw_print(), which leaves the recorded cursor at [0,1].
    const step = readRecording('getline.c/menu-search-before-message-window')
        .segments[1].steps[3];
    assert.equal(step.key, 'd');
    const rows = decodeScreen(step.screen)
        .map((row) => row.map((cell) => cell.ch).join('').trimEnd());
    assert.equal(rows[0], 'Search for:');
    assert.equal(rows[9], `${' '.repeat(23)}d`);
    assert.deepEqual(step.cursor.slice(0, 2), [0, 1]);
});

test('every recipe that ends a segment on a signal is in a table above', () => {
    const named = [];
    for (const dir of readdirSync(RECIPES_DIR, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        for (const file of readdirSync(new URL(`${dir.name}/`, RECIPES_DIR))) {
            if (!file.endsWith('.session.json')) continue;
            // Searched as text: not every committed recipe is strict JSON.
            const text = readFileSync(join(RECIPES_DIR.pathname, dir.name, file), 'utf8');
            if (/"terminalSignal"\s*:/u.test(text))
                named.push(`${dir.name}/${file.replace(/\.session\.json$/u, '')}`);
        }
    }
    assert.deepEqual(named.sort(),
        [...CASES.map(([name]) => name), ...HOST_INDEPENDENT].sort());
});
