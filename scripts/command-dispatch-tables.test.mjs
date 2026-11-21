// Every command name that js/cmd.js can be handed resolves to the table row or
// function that dispatches it, so the dispatcher needs no refusal for a name
// it cannot place. Three tables feed it: the handler names act_on_act() and
// domouseaction() queue (C queues the function pointer itself), the rows that
// carry occupation text for a counted command (cmd.c rhack():3726-3729), and
// the names the key-binding model stores (cmd.c bind_key() refuses any other).
// A fourth test holds the function table rhack() and doextcmd() call through
// to every extcmdlist[] row, and a fifth holds rhack() to that table: it fails
// when rhack() names a command to call a function of its own for it, which
// is how a key and the row's typed `#name` once came to run different code.
// Each test below fails when a table gains a name the dispatcher lacks, and
// the last fails when one of the removed refusals returns.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { commandEntryForHandler, DISPATCHED_COMMANDS } from '../js/cmd.js';
import {
    createCommandBindingModel,
    resetCommandBindingModel,
    updateRestOnSpaceModel,
} from '../js/command_bindings.js';
import { extcmdlist, INTERNALCMD } from '../js/extcmdlist_data.js';
import { parseNethackrc } from '../js/options.js';

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

const CMD_SOURCE = stripComments(readFileSync(
    new URL('../js/cmd.js', import.meta.url), 'utf8',
));

test('every queued handler name resolves to an extcmdlist row', () => {
    const args = [...CMD_SOURCE.matchAll(/(?<!function )queueHandler\((.+?), state\)/gu)]
        .map((match) => match[1].trim());
    // 54 calls at the time of writing; a scan that finds none has broken.
    assert.ok(args.length > 40, `found only ${args.length} queueHandler calls`);
    const names = new Set();
    for (const arg of args) {
        // domouseaction() picks doloot or dopickup in a ternary.
        const literals = arg.match(/^(?:[^?]+\? )?'(\w+)'(?: : '(\w+)')?$/u);
        if (literals) {
            names.add(literals[1]);
            if (literals[2]) names.add(literals[2]);
            continue;
        }
        // The one computed form: the walk function of a direction xytodir()
        // gave for a nonzero offset (cmd.c act_on_act() and domouseaction()).
        assert.match(arg, /^MOVE_FUNCS\[[^\]]+\]\[MV_WALK\]$/u, arg);
    }
    assert.ok(names.has('doloot') && names.has('dopickup'));
    const block = CMD_SOURCE.match(/const MOVE_FUNCS = Object\.freeze\(\[([\s\S]*?)\]\.map/u);
    assert.ok(block, 'MOVE_FUNCS table not found');
    const walks = [...block[1].matchAll(/\[\s*'(\w+)'/gu)].map((m) => m[1]);
    // N_DIRS_Z: eight compass directions plus down and up.
    assert.equal(walks.length, 10);
    for (const walk of walks) names.add(walk);
    const missing = [...names].filter((name) => !commandEntryForHandler(name));
    assert.deepEqual(missing, []);
});

test('only dosearch and donull carry occupation text', () => {
    // cmd.c extcmdlist[]: 's' at 1846-1847 and '.' at 1930-1931.
    assert.deepEqual(
        extcmdlist.filter((row) => row.f_text).map((row) => row.ef_funct).sort(),
        ['donull', 'dosearch'],
    );
    assert.match(CMD_SOURCE,
        /TIMED_OCCUPATION_FUNCTIONS = Object\.freeze\(\{ dosearch, donull \}\)/u);
});

test('every name the binding model stores is an extcmdlist row', () => {
    const rows = new Set(extcmdlist.map((row) => row.ef_txt));
    const stored = [];
    const collect = (model) => {
        for (const binding of model.bindings) stored.push(binding.command);
    };
    for (const numberPad of ['0', '1', '2', '3', '4', '-1']) {
        const model = createCommandBindingModel(
            parseNethackrc(`OPTIONS=number_pad:${numberPad}\n`),
        );
        collect(model);
        // Toggling the number pad restores the saved direction keys;
        // rest_on_space rebinds Space to wait and back.
        for (const [enabled, mode] of [[true, 0], [true, 1], [false, 1], [true, 2], [false, 0]]) {
            resetCommandBindingModel(model, enabled, mode);
            collect(model);
        }
        updateRestOnSpaceModel(model, true);
        collect(model);
        updateRestOnSpaceModel(model, false);
        collect(model);
    }
    // Bind each row bind_key() accepts, in upper case and with a parameter,
    // as parsebindings() reads them; it refuses INTERNALCMD rows and
    // unknown names.
    for (const row of extcmdlist) {
        if (row.flags & INTERNALCMD) continue;
        collect(createCommandBindingModel(parseNethackrc(
            `BINDINGS=Z:${row.ef_txt.toUpperCase()}(x)\nBINDINGS=X:nosuchcommand\n`,
        )));
    }
    assert.ok(stored.length > 1000);
    const missing = [...new Set(stored)].filter((name) => !rows.has(name));
    assert.deepEqual(missing, []);
});

test('every extcmdlist row but one has a function to call', () => {
    // callExtcmdFunction() calls through EXTCMD_FUNCTIONS with no refusal.
    // One row never reaches it: rhack() runs doextcmd() for '#' itself,
    // because the prompt names the row that the rest of rhack() then works
    // on. Any other row without a function would fail here.
    const dispatched = new Set(DISPATCHED_COMMANDS);
    assert.deepEqual(
        extcmdlist.filter((row) => !dispatched.has(row.ef_txt))
            .map((row) => row.ef_funct),
        ['doextcmd'],
    );
    assert.match(CMD_SOURCE,
        /tlist\?\.ef_funct === 'doextcmd'\s*&& \(!prefixSeen \|\| wasMPrefix\)\) \{/u);
});

// The text of one top-level function of js/cmd.js, comments already removed.
function functionText(declaration) {
    const start = CMD_SOURCE.indexOf(declaration);
    assert.notEqual(start, -1, `${declaration} is declared in js/cmd.js`);
    const end = CMD_SOURCE.indexOf('\n}\n', start);
    assert.notEqual(end, -1, `${declaration} has a closing brace`);
    return CMD_SOURCE.slice(start, end);
}

const matches = (text, pattern) => [...text.matchAll(pattern)].map((m) => m[1]);

test('a key and a typed name call the same function for every row', () => {
    // cmd.c rhack() calls `(*func)()` with func = tlist->ef_funct (3727,
    // 3752) and doextcmd() calls the same pointer of the row the player
    // named (510): one extcmdlist[] row, one function, whichever way the
    // command arrives. The port keeps that pointer in EXTCMD_FUNCTIONS, and
    // callExtcmdFunction() is the only reader.
    assert.equal(matches(CMD_SOURCE, /(EXTCMD_FUNCTIONS\.get)\(/gu).length, 1);
    assert.match(functionText('async function callExtcmdFunction('),
        /EXTCMD_FUNCTIONS\.get\(entry\.ef_funct\)\(key, state\)/u);

    const rhack = functionText('export async function rhack(');
    const doextcmd = functionText('async function doextcmd(');
    // rhack() calls through the table twice: for a PREFIXCMD row in the
    // prefix loop and for every other row below it. doextcmd() calls once.
    assert.equal(matches(rhack, /(callExtcmdFunction)\(/gu).length, 2);
    assert.equal(matches(doextcmd, /(callExtcmdFunction)\(/gu).length, 1);

    // rhack() never compares the command's name with a literal. At
    // 8c2a781e3 it did so in 73 `if (command === '...')` arms, each calling
    // a function chosen there instead of the row's; none may return. The
    // count fails in both directions, so it cannot be raised quietly.
    assert.deepEqual(matches(rhack, /\bcommand\s*[!=]==\s*'([^']*)'/gu), []);
    assert.deepEqual(matches(rhack, /\bef_txt\s*[!=]==\s*'([^']*)'/gu), []);
    assert.doesNotMatch(rhack, /\bswitch\s*\(/u);
    // Nor does it pick a function for a queued row by the row's function
    // name (eight such arms at 8c2a781e3).
    assert.doesNotMatch(rhack, /queuedExtcmdEntry\?*\.ef_funct/u);
    // The two function tests C's rhack() itself makes: `func == do_reqmenu`
    // (3771) and `func == doextcmd` (3729, 3738). Its third and fourth,
    // `func != do_repeat` and `func != dokick`, are in recordRepeatCommand()
    // and rhackResultTail().
    assert.deepEqual(
        matches(rhack, /\bef_funct\s*[!=]==\s*'([^']*)'/gu),
        ['do_reqmenu', 'doextcmd'],
    );
    // doextcmd()'s own two: the loop that reopens the prompt after
    // doextlist() (517) and '#' naming itself.
    assert.deepEqual(
        matches(doextcmd, /\bef_funct\s*[!=]==\s*'([^']*)'/gu),
        ['doextlist', 'doextcmd'],
    );
    // No ported handler is called by name from rhack(): every `await f(`
    // there is one of the functions that are rhack()'s own in C.
    const called = new Set(matches(rhack, /\bawait (\w+)\(/gu));
    assert.deepEqual([...called].sort(), [
        'callExtcmdFunction', 'end_of_input', 'executeMovement',
        'failClosedCommand', 'parseCommand', 'prefixRefusedCommand',
        'rhackCanDoExtcmd', 'ttyCustomPline',
    ]);
});

test('the dispatcher no longer refuses a name it cannot place', () => {
    for (const pattern of [
        /for the extended command .* is not ported/u,
        /command queue handler/u,
        /commandMenuResult|hereCmdMenu|thereCmdMenu/u,
        /timedOccupationFunction|has no ported occupation/u,
        /names no extcmdlist\[\] row/u,
    ]) assert.doesNotMatch(CMD_SOURCE, pattern);
});
