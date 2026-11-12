// Source-pinned tests for nhlua.c's error boundary and bounded load_lua().
// The test state never creates or evaluates a Lua VM.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { nhl_error } from '../js/nhlua.js';
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
    assert.deepEqual([...game.unported], ['nhlua.c nhlL_newstate', 'nhlua.c nhl_done']);
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
            'nhlua.c nhlL_newstate', 'nhlua.c nhl_loadlua', 'nhlua.c nhl_done',
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
