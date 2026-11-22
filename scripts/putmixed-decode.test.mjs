// Every C putmixed() line runs windows.c decode_mixed() before tty_putstr()
// (wintty.c tty_putmixed() 4169-4196). The port's two entries for it,
// ttyPutmixed() for the message window and ttyPutmixedLine() for a text
// window, are the only code that decodes one, and ttyPutmixed() alone may
// hand the tty a decoded glyph's rendered cell. A caller that formats a glyph
// itself and skips them also skips decode_mixed(), so a backslash in a typed symbol, a monster or object name
// or an engraving reaches the screen where C drops it. These checks fail when
// such a caller appears.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const JS_DIR = new URL('../js/', import.meta.url).pathname;
const source = (name) => readFileSync(join(JS_DIR, name), 'utf8');

// The body of `function name(...) {...}`, from its declaration to the next
// top-level closing brace.
function functionBody(text, name) {
    const start = text.search(new RegExp(`function ${name}\\(`, 'u'));
    assert.ok(start >= 0, `${name}() is declared`);
    const end = text.indexOf('\n}\n', start);
    assert.ok(end > start, `${name}() has a closing brace`);
    return text.slice(start, end + 2);
}

test('only ttyPutmixed() gives update_topl() a decoded first cell', () => {
    // ttyPlineCore(message, state, pflags, mixedFirstCell, viaVpline): the
    // fourth argument is the rendered cell of a glyph that starts the line.
    const text = source('tty_message.js');
    // The lookbehind skips the declaration itself. A call whose arguments
    // hold parentheses would escape the parse, so every occurrence must
    // parse.
    const parsed = [...text.matchAll(/(?<!function )ttyPlineCore\(([^()]*)\)/gu)];
    assert.equal(parsed.length,
        [...text.matchAll(/(?<!function )ttyPlineCore\(/gu)].length,
        'every ttyPlineCore( occurrence has an argument list without parentheses');
    const calls = parsed
        .map((match) => ({
            index: match.index,
            args: match[1].split(',').map((arg) => arg.trim()),
        }))
        .filter(({ args }) => args.length >= 4 && args[3] !== 'null');
    const body = functionBody(text, 'ttyPutmixed');
    const bodyStart = text.indexOf(body);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].index > bodyStart
        && calls[0].index < bodyStart + body.length,
    'the call is inside ttyPutmixed()');
});

test('a text-window line carries no rendered glyph cells', () => {
    // wintty.c process_text_window() prints a stored line's bytes and
    // nothing else, so ttyPutmixedLine() returns the decoded bytes alone:
    // utf8map.c mixed_to_utf8() under a UTF-8 symbol set, otherwise
    // decode_mixed(). A cell drawn over those bytes showed control-byte and
    // UTF-8 symbols that recorder patch 006's capture leaves blank.
    const named = readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .filter((name) => source(name).includes('glyphCells'));
    assert.deepEqual(named, []);

    const body = functionBody(source('tty_menu.js'), 'ttyPutmixedLine');
    assert.match(body, /^function ttyPutmixedLine\(str, state = game\) \{/u);
    assert.match(body, /handling === H_UTF8\s*\? mixed_to_utf8\(str, state\) : decode_mixed\(str, state\)/u);
    assert.doesNotMatch(body, /putCaptured|renderGlyph/u);
    // Every caller passes the encoded text and the state, with no renderer.
    const pager = source('pager.js');
    const calls = [...pager.matchAll(/ttyPutmixedLine\(([^()]*)\)/gu)];
    // look_all(), look_traps() and look_engrs() each build one line form.
    assert.equal(calls.length, 3);
    for (const [, args] of calls)
        assert.equal(args, 'outbuf + description, state');
});

test('both putmixed entries run decode_mixed()', () => {
    assert.match(functionBody(source('tty_message.js'), 'ttyPutmixed'),
        /decode_mixed\(/u);
    assert.match(functionBody(source('tty_menu.js'), 'ttyPutmixedLine'),
        /decode_mixed\(/u);
});
