import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { key2extcmddesc } from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { HELP_TEXT_FILES } from '../js/help_data.js';
import { runSegment } from '../js/jsmain.js';
import { parseHelpTextFile } from './generate-help-data.mjs';

const cPager = readFileSync('nethack-c/upstream/src/pager.c', 'utf8');
const cCmd = readFileSync('nethack-c/upstream/src/cmd.c', 'utf8');
const jsPager = readFileSync('js/pager.js', 'utf8');
async function hero(extra = '') {
    // Independent Wizard startup supplies canonical bindings and movement state.
    await runSegment({ seed: 15533011, datetime: '20541107213243', moves: '',
        nethackrc: `OPTIONS=name:Lex,role:Wizard,race:human,gender:male,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!acoustics${extra}\n` });
    return game;
}

test('movement queries retain C probes and continue into the bound command description', async () => {
    assert.match(cCmd, /if \(movecmd\(k = key, MV_WALK\)\)/u);
    assert.match(cCmd, /cmdbind_get\(key\)/u);
    const state = await hero();
    // cmd.c's h binding is movewest, not the temporary local string "move".
    assert.equal(key2extcmddesc('h'.charCodeAt(0), state),
        'move west (screen left) (#movewest)');
    assert.equal(state.u.dx, -1, 'movecmd preserves the source west probe');
    assert.equal(state.u.dy, 0);
    assert.equal(state.u.dz, 0);
});

test('number-pad movement uses bindings while count and prefix overrides retain source order', async () => {
    const state = await hero(',number_pad:1');
    // cmd.c:2584–2587 overrides only 5 and 0; 1 retains its movement binding.
    assert.equal(key2extcmddesc('1'.charCodeAt(0), state),
        'move southwest (screen lower left) (#movesouthwest)');
    assert.equal(key2extcmddesc('5'.charCodeAt(0), state), 'rush prefix');
    assert.equal(key2extcmddesc('0'.charCodeAt(0), state), "synonym for 'i'");
    // cmd.c:2585–2588 uses pcHack_compat XOR the meta bit for 5, and
    // accepts M-0 only in compatibility mode. These bytes are source M().
    assert.equal(key2extcmddesc(0xb5, state), 'run prefix');
    assert.equal(key2extcmddesc(0xb0, state), null);
    state.commandBindings.pcHack = true;
    assert.equal(key2extcmddesc(0x35, state), 'run prefix');
    assert.equal(key2extcmddesc(0xb5, state), 'rush prefix');
    assert.equal(key2extcmddesc(0xb0, state), "synonym for 'i'");
});

test('keyhelp skips only first-byte comments and trims only leading blanks', () => {
    // pager.c:2436–2440 does not tabexpand or trim trailing blanks.
    assert.match(cPager, /if \(\*buf == '#'\)/u);
    assert.deepEqual(parseHelpTextFile('#skip\n \tA\tB  \n \t#keep\n\n', 'keyhelp'),
        ['A\tB  \n', '#keep\n', '\n']);
    const source = readFileSync('nethack-c/upstream/dat/keyhelp', 'utf8');
    assert.deepEqual(HELP_TEXT_FILES.keyhelp,
        source.match(/[^\n]*\n|[^\n]+$/gu).filter(line => !line.startsWith('#'))
            .map(line => line.replace(/^[ \t]*/u, '')));
});

test('whole dowhatdoes retains alternate-meta, keyhelp, multiline and unknown branches', () => {
    assert.match(cPager, /q = \(char\) \(\(uchar\) q \| 0200\)/u);
    assert.match(cPager, /pline\("%8\.8s%s", reslt, p \+ 1\)/u);
    const arm = jsPager.slice(jsPager.indexOf('export async function dowhatdoes('),
        jsPager.indexOf('async function hmenu_dowhatdoes('));
    assert.match(arm, /state\.iflags\.altmeta/u);
    assert.match(arm, /await whatdoes_help\(state\)/u);
    assert.match(arm, /slice\(0, 8\)/u);
    assert.match(arm, /No such command/u);
    assert.doesNotMatch(arm, /UnsupportedHelpError/u);
});
