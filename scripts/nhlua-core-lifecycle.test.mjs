// Source-pinned tests for nhlua.c's error boundary and bounded load_lua().
// The test state never creates or evaluates a Lua VM.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { LuaError, nhl_call_field, nhl_error } from '../js/nhlua.js';
import { wrapTtyTopline } from '../js/topl.js';
import { initUnported } from '../js/unported.js';

function freshGame() {
    resetGame();
    initUnported();
}

test('nhlua.c nhl_error preserves message, line, and short source', () => {
    freshGame();
    assert.throws(
        () => nhl_error({ currentline: 37, short_src: 'nhcore.lua' }, 'bad'),
        (error) => error instanceof Error
            && error.message === 'bad (line 37 nhcore.lua)',
    );
    assert.throws(
        () => nhl_error({ debug: { currentline: 4, short_src: '@x.lua' } }, 'oops'),
        /oops \(line 4 @x\.lua\)/u,
    );
});

// The Lua stack of bigrm-11.lua when line 16's des.terrain() fails inside
// sel:iterate(replace_wall_boulder) on line 22: nhl_error() names line 16
// of the calling Lua function (lua_getstack(L, 1)), and traceback_handler()'s
// luaL_traceback(L, L, msg, 0) lists the handler, then each frame from the
// innermost, as Lua 5.4 names them; the C recording
// recordings/nhlsel.c/wizloadlua-iterate-lua-error.session.json shows the
// first 255 bytes of this text.
test('nhl_error names the calling Lua line and keeps the traceback', () => {
    freshGame();
    const lua = {
        chunk: '[string "(bigrm-11.lua)"]',
        frames: [
            { desc: '?' },
            { lua: true, desc: 'main chunk', currentline: 22 },
            { desc: "method 'iterate'" },
            {
                lua: true,
                desc: "function 'replace_wall_boulder'",
                lines: { terrain: 16, object: 17 },
                currentline: 0,
            },
        ],
    };
    assert.throws(
        () => nhl_call_field(lua, 'terrain',
            () => nhl_error(lua, 'terrain coord not ok')),
        (error) => error instanceof LuaError
            && error.message === 'terrain coord not ok '
                + '(line 16 [string "(bigrm-11.lua)"])'
            && error.traceback === [
                'stack traceback:',
                '\t[C]: in ?',
                "\t[C]: in field 'terrain'",
                '\t[string "(bigrm-11.lua)"]:16: in function '
                    + "'replace_wall_boulder'",
                "\t[C]: in method 'iterate'",
                '\t[string "(bigrm-11.lua)"]:22: in main chunk',
                '\t[C]: in ?',
            ].join('\n'),
    );
    // The field's frame is gone once the error has left it.
    assert.equal(lua.frames.length, 4);
});

// topl.c update_topl() splits at spaces counting every byte, and
// topl_putsym() starts a row at each newline, whether update_topl() put it
// there or the text held it; a tab takes one column.
test('a top line breaks at the newlines its text holds', () => {
    assert.deepEqual(wrapTtyTopline('stack traceback:\n\t[C]: in ?', 80),
        ['stack traceback:', '\t[C]: in ?']);
    assert.deepEqual(wrapTtyTopline(`${'a'.repeat(79)}\nb`, 80),
        ['a'.repeat(79), 'b']);
});

test('bounded load_lua repeats the source nhlib shuffle and clears in_lua', async () => {
    const { readFileSync } = await import('node:fs');
    const { load_lua } = await import('../js/nhlua.js');
    assert.equal(typeof load_lua, 'function');
    const source = readFileSync('nethack-c/upstream/src/nhlua.c', 'utf8');
    const init = source.slice(source.indexOf('nhl_init(nhl_sandbox_info'), source.indexOf('RESTORE_WARNING_CONDEXPR', source.indexOf('nhl_init(nhl_sandbox_info')));
    const load = source.slice(source.indexOf('load_lua(const char'), source.indexOf('DISABLE_WARNING_FORMAT_NONLITERAL', source.indexOf('load_lua(const char')));
    assert.match(init, /iflags.in_lua = TRUE;[\s\S]*nhl_loadlua\(L, "nhlib.lua"\)/u);
    assert.match(load, /nhl_init\(sbi\)[\s\S]*nhl_loadlua\(L, name\)[\s\S]*nhl_done\(L\)/u);
    const done = source.slice(source.indexOf('nhl_done(lua_State'), source.indexOf('boolean\nload_lua'));
    assert.match(done, /iflags.in_lua = FALSE;/u);
    const library = readFileSync('nethack-c/upstream/dat/nhlib.lua', 'utf8');
    assert.match(library, /align = \{ "law", "neutral", "chaos" \};\s*shuffle\(align\);/u);
    freshGame();
    game.iflags = { in_lua: false }; // C iflags exists before any command.
    const draws = [];
    const result = await load_lua('nhlib.lua', {}, game, { random(bound) {
        assert.equal(game.iflags.in_lua, true);
        draws.push(bound);
        return 0; // A valid draw in both the three- and two-entry shuffle.
    } });
    assert.equal(result, true); // load_lua()'s ret: nhl_loadlua() succeeded.
    assert.deepEqual(draws, [3, 2, 3, 2]); // Implicit then explicit library load.
    assert.equal(game.iflags.in_lua, false);
    assert.deepEqual([...game.unported], ['nhlua.c nhl_done']);
    // nhlL_newstate() numbers the state's sandbox: the first in this game.
    assert.equal(game.gl.lua_sid, 1);
});

test('bounded load_lua initializes before a file it cannot run', async () => {
    const { load_lua } = await import('../js/nhlua.js');
    assert.equal(typeof load_lua, 'function');
    // "save/one.lua" names a file in save/, which holds whatever save files
    // the game wrote; it stays noted after nhl_init()'s shuffle. (A level
    // program such as minefill.lua now runs; recipes/nhlua.c/
    // wizloadlua-level-program.session.json covers it.)
    for (const name of ['save/one.lua']) {
        freshGame();
        game.iflags = { in_lua: false }; // Source-valid command state.
        const draws = [];
        await load_lua(name, {}, game, {
            random: bound => { draws.push(bound); return 0; },
        });
        assert.deepEqual(draws, [3, 2], name); // C initializes before lookup.
        assert.equal(game.iflags.in_lua, false, name);
        assert.deepEqual([...game.unported], [
            'nhlua.c nhl_loadlua', 'nhlua.c nhl_done',
        ], name);
    }
});

test('lobject.c luaO_chunkid names a string chunk as Lua 5.4 does', async () => {
    const { luaO_chunkid } = await import('../js/nhlua.js');
    // LUA_IDSIZE is 60 (luaconf.h), so a string source keeps at most
    // 60 - strlen("[string \"" "..." "\"]") - 1 = 45 bytes.
    assert.equal(luaO_chunkid('(./license)'), '[string "(./license)"]');
    // 44 bytes: srclen < bufflen, kept whole.
    const kept = `(${'./'.repeat(20)}hh)`;
    assert.equal(kept.length, 44);
    assert.equal(luaO_chunkid(kept), `[string "${kept}"]`);
    // 45 bytes: not less than bufflen, so cut to 45 and marked with "...".
    const cut = `(${'./'.repeat(20)}hhh)`;
    assert.equal(cut.length, 45);
    assert.equal(luaO_chunkid(cut), `[string "${cut}..."]`);
    // Longer: the first 45 bytes, then "...".
    const long = `(${'./'.repeat(30)}options)`;
    assert.equal(luaO_chunkid(long), `[string "${long.slice(0, 45)}..."]`);
    // A newline ends the shown part even in a short source.
    assert.equal(luaO_chunkid('(a\nb)'), '[string "(a..."]');
});
