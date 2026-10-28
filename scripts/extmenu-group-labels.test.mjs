import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs } from './diff-fresh.mjs';

// C cmd.c:extcmd_via_menu drops descriptions when a selector groups names.
// The identical setup without extmenu is the nearby non-menu control.
for (const [name, file] of [
    ['grouped labels', 'extmenu-group-witness'],
    ['non-menu control', 'extmenu-group-control'],
]) {
    test(`${name} matches C`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/cmd.c/${file}.session.json`, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('../', import.meta.url).pathname);
        assert.equal(compareSessionOutputs(recording, output).passed, true);
    });
}
