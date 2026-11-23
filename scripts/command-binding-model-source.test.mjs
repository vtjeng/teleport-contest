// C builds gc.Cmd once: cmd.c reset_commands() in options.c
// initoptions_init(), then each BIND and option as the configuration file is
// read, then the option and key-binding menus in play. Everything that asks
// for a command's key reads that one table. The port's table is
// state.commandBindings, and js/command_bindings.js createCommandBindingModel()
// builds it from the parser's commandOperations.
//
// The tutorial once called createCommandBindingModel() again for each level,
// so tut-2's engraving named the key the configuration file gave `up`, not
// the one the player had since bound (recordings/nhlua.c/
// eckey-tutorial-up-rebound-in-play*). The model also read
// flags.rest_on_space, the current option, on every such rebuild. These
// tests keep one live table.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    commandForKey,
    commandKeyCode,
    createCommandBindingModel,
} from '../js/command_bindings.js';
import { parseNethackrc } from '../js/options.js';

const source = (name) => readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');

test('the binding model never reads flags', () => {
    // `entry.flags` there is an extended command's flag word, not the options.
    assert.doesNotMatch(source('command_bindings.js'), /\bstate\??\.flags\b/u);
    // A state that only says the option is on binds nothing to Space: cmd.c
    // update_rest_on_space() runs when the option is set, which the parser
    // records as an operation.
    const model = createCommandBindingModel({ flags: { rest_on_space: true } });
    assert.equal(commandForKey(model, commandKeyCode(' ')), null);
    const parsed = createCommandBindingModel(parseNethackrc('OPTIONS=rest_on_space\n'));
    assert.equal(commandForKey(parsed, commandKeyCode(' ')), 'wait');
});

test('every caller of createCommandBindingModel() fills the live table', () => {
    // `state.commandBindings ??= createCommandBindingModel(state)` creates
    // the table for a state a test built by hand; a call in any other form
    // would build a second table.
    const live = /state\.commandBindings \?\?= createCommandBindingModel\(state\)/gu;
    const any = /createCommandBindingModel\(/gu;
    const counts = {};
    for (const name of ['cmd.js', 'getpos.js', 'hack.js', 'options.js', 'pager.js',
        'tutorial_level.js']) {
        const text = source(name).replace(/^\s*\/\/.*$/gmu, '');
        counts[name] = [(text.match(any) ?? []).length, (text.match(live) ?? []).length];
    }
    for (const [name, [calls, liveCalls]] of Object.entries(counts)) {
        assert.ok(calls > 0, name);
        assert.equal(calls, liveCalls, name);
    }
});
