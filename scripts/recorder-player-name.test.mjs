// The recorder passes the session's player name to NetHack as "-u <name>",
// and NetHack reads any argument starting with '-' as an option
// (earlyarg.c early_options()). Names starting with '-' are out of scope
// (Vincent, 2026-11-13); this pins the recorder's refusal of them, which
// scripts/c-message-exemptions.mjs relies on for its command-line entries.
import assert from 'node:assert/strict';
import test from 'node:test';
import { recorderPlayerName } from './record-session.mjs';

test('the recorder passes an ordinary name through', () => {
    // A plain name and one with an interior hyphen (role suffix style) are
    // valid; only a leading '-' reaches early_options().
    assert.equal(recorderPlayerName('OPTIONS=name:Agnes,role:Val\n'), 'Agnes');
    assert.equal(recorderPlayerName('OPTIONS=name:Ag-nes\n'), 'Ag-nes');
    // No name option: C prompts for one, and the recorder passes "".
    assert.equal(recorderPlayerName('OPTIONS=role:Val\n'), '');
});

test('the recorder refuses a name that NetHack would read as an option', () => {
    // -s runs prscore(), --showpaths reveal_paths(); both print instead of
    // starting a game.
    for (const name of ['-s', '--showpaths', '-d/', '--version:copy']) {
        assert.throws(() => recorderPlayerName(`OPTIONS=name:${name}\n`), /starts with '-'/u, name);
    }
});
