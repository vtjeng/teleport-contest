// C ref: cfgfiles.c config_erradd() (1543-1563).  Outside a configuration
// read, config_error_add() prints with pline() and wait_synch().  In
// js/options.js configErrorAdd() reaches that arm only through a view that
// carries `liveConfigErrors`, which the caller then prints with
// plineConfigErrors(); handed the game state itself, it finds no
// configuration frame and throws.  test_regex_pattern() and optfn_fruit()'s
// live arm did that (source review 5a); this check fails when a call of that
// shape is added.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SOURCE = readFileSync(new URL('../js/options.js', import.meta.url), 'utf8');

// Each top-level function of js/options.js with the text of its body.
function topLevelFunctions(source) {
    const lines = source.split('\n');
    const starts = [];
    lines.forEach((line, index) => {
        const match = /^(?:export )?(?:async )?function (\w+)/u.exec(line);
        if (match) starts.push([index, match[1]]);
    });
    starts.push([lines.length, null]);
    return starts.slice(0, -1).map(([start, name], i) => [
        name, lines.slice(start, starts[i + 1][0]).join('\n'),
    ]);
}

const CALL_WITH_STATE = /configErrorAdd\(\s*state\b/gu;
const HAS_CALL_WITH_STATE = /configErrorAdd\(\s*state\b/u;

test('live option handlers never hand the game state to configErrorAdd()', () => {
    // handler_* functions run only from the 'O' menu (C's do_handler
    // requests), and test_regex_pattern()'s two callers are handlers.
    const offenders = topLevelFunctions(SOURCE)
        .filter(([name]) => name.startsWith('handler_')
            || name === 'test_regex_pattern')
        .filter(([, body]) => HAS_CALL_WITH_STATE.test(body))
        .map(([name]) => name);
    assert.deepEqual(offenders, []);
});

test('configErrorAdd(state, ...) stays in the four startup-shared setters', () => {
    // These do_set arms serve the configuration read, where `state` is the
    // parser result.  In play each is reached only through a menu handler
    // that never reports an error: handler_msg_window(), handler_number_pad()
    // and handler_petattr() store a menu pick directly, and palette is not on
    // the tty 'O' menu.  Change the list, with a reason, when a call is
    // added or removed.
    const callers = topLevelFunctions(SOURCE)
        .filter(([, body]) => (body.match(CALL_WITH_STATE) ?? []).length > 0)
        .map(([name]) => name)
        .sort();
    assert.deepEqual(callers, [
        'optfn_msg_window', 'optfn_number_pad', 'optfn_palette', 'optfn_petattr',
    ]);
});
