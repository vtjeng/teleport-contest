// Every command name that js/cmd.js can be handed resolves to the table row or
// function that dispatches it, so the dispatcher needs no refusal for a name
// it cannot place. Three tables feed it: the handler names act_on_act() and
// domouseaction() queue (C queues the function pointer itself), the rows that
// carry occupation text for a counted command (cmd.c rhack():3726-3729), and
// the names the key-binding model stores (cmd.c bind_key() refuses any other).
// A fourth test holds the function table rhack() and doextcmd() call through
// to every extcmdlist[] row. Each test below fails when a table gains a name
// the dispatcher lacks, and the last fails when one of the removed refusals
// returns.

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

test('every extcmdlist row but three has a function to call', () => {
    // callExtcmdFunction() calls through EXTCMD_FUNCTIONS with no refusal.
    // Three rows never reach it: rhack() runs doextcmd() for '#' itself, and
    // its MOUSECMD arm runs doclicklook() and domouseaction(), which only a
    // queued command reaches (INTERNALCMD rows have no key and are hidden
    // from the '#' prompt). Any other row without a function would fail here.
    const dispatched = new Set(DISPATCHED_COMMANDS);
    assert.deepEqual(
        extcmdlist.filter((row) => !dispatched.has(row.ef_txt))
            .map((row) => row.ef_funct),
        ['doextcmd', 'doclicklook', 'domouseaction'],
    );
    assert.match(CMD_SOURCE, /if \(command === '#'\) \{/u);
    assert.match(CMD_SOURCE,
        /queuedClickHandler === 'doclicklook'\s*\|\| queuedClickHandler === 'domouseaction'\)/u);
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
