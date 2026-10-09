// wizcmds.c:wiz_show_nhuuid and its bounded saved-n/command seams.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ADMITTED_COMMANDS, rhack } from '../js/cmd.js';
import { ECMD_OK } from '../js/const.js';
import { AUTOCOMPLETE, IFBURIED, WIZMODECMD, extcmdlist } from '../js/extcmdlist_data.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosave0 } from '../js/save.js';
import { InMemoryStorage } from '../js/storage.js';
import { wiz_show_nhuuid } from '../js/wizcmds.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const commandSource = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');

test('UUID command matches its whole source body and wizard-only row', () => {
    assert.match(source, /wiz_show_nhuuid\(void\)\s*\{\s*pline\("The NHUUID for this game is \{ %s \}\.", svn\.nhuuid\);\s*return ECMD_OK;\s*\}/u);
    const row = extcmdlist.find(row => row.ef_txt === 'wizshownhuuid');
    // cmd.c's exact source flags permit autocomplete, require wizard mode,
    // and omit IFBURIED. This command returns ECMD_OK without a turn.
    assert.equal(row.flags, AUTOCOMPLETE | WIZMODECMD);
    assert.equal(row.flags & IFBURIED, 0);
    assert.match(commandSource, /"wizshownhuuid", "show NHUUID for this game",\s*wiz_show_nhuuid, AUTOCOMPLETE \| WIZMODECMD/u);
    assert.ok(ADMITTED_COMMANDS.includes('wizshownhuuid'));
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(js, /case 'wiz_show_nhuuid':\s*return await wiz_show_nhuuid\(state\);/u);
    assert.match(js, /if \(command === 'wizshownhuuid'\)\s*\{[\s\S]*?await wiz_show_nhuuid\(state\);\s*resetCommandVars\(state, state\.multi < 0\);\s*return;/u);
    assert.match(js, /command !== 'wizshownhuuid'/u);
});

test('UUID display reads the stored value and reset owns a fresh empty field', async () => {
    // decl.c:init_svn initializes all 37 NHUUID bytes to zero. The valid
    // nonempty UUID demonstrates formatting reads the field, not a literal.
    for (const uuid of ['', '12345678-1234-1234-1234-123456789abc']) {
        const state = resetGame();
        assert.equal(state.svn.nhuuid, '');
        state.svn.nhuuid = uuid;
        state.flags = {};
        state.iflags = {};
        state.nhDisplay = new GameDisplay(null);
        assert.equal(await wiz_show_nhuuid(state), ECMD_OK);
        assert.equal(state.nhDisplay.topMessage, `The NHUUID for this game is { ${uuid} }.`);
        assert.equal(state.svn.nhuuid, uuid);
        assert.equal(Object.hasOwn(state, 'moves'), false);
        const previous = state.svn;
        assert.equal(resetGame().svn.nhuuid, '');
        assert.notEqual(game.svn, previous);
    }
});

test('production save/restore transports a nonempty UUID before moves', async () => {
    const recipe = JSON.parse(readFileSync(new URL('../recipes/wizcmds.c/wizard-game-uuid-restore-independent.session.json', import.meta.url)));
    const storage = new InMemoryStorage();
    // Initialize a real live game without issuing save yet. This witnesses
    // the same ordinary save owner as the recorded two-segment variation.
    await runSegment({ ...recipe.segments[0], moves: ' .', storage });
    const uuid = 'abcdefab-cdef-abcd-efab-cdefabcdefab'; // 36-byte valid UUID.
    game.svn.nhuuid = uuid;
    assert.equal(dosave0(game), 1); // save.c returns success after writing.
    const snapshot = JSON.parse(storage.getItem('vfs:nhsave'));
    assert.equal(snapshot.nhuuid, uuid);
    assert.ok(Object.keys(snapshot).indexOf('nhuuid') < Object.keys(snapshot).indexOf('moves'));
    let boundary;
    await runSegment({ ...recipe.segments[1], storage }, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.svn.nhuuid, uuid);
    const restore = readFileSync(new URL('../js/restore.js', import.meta.url), 'utf8');
    assert.match(restore, /state\.svn\.nhuuid = snapshot\.nhuuid;\s*state\.moves = snapshot\.moves;/u);
});


test('bound UUID command retains nonwizard and buried admission boundaries', async () => {
    const recipe = JSON.parse(readFileSync(new URL('../recipes/wizcmds.c/wizard-game-uuid-bound-independent.session.json', import.meta.url)));
    for (const buried of [false, true]) {
        await runSegment({ ...recipe.segments[0], moves: ' .' });
        game.wizard = buried;
        game.u.uburied = buried;
        const moves = game.moves;
        await rhack('V'.charCodeAt(0), game);
        assert.equal(game.moves, moves); // Source rejects both entries before invoking the handler.
        assert.equal(game.svn.nhuuid, '');
        assert.equal(game.nhDisplay.topMessage, buried
            ? "You can't do that while you are buried!"
            : "Unavailable command 'wizshownhuuid'.");
    }
});
