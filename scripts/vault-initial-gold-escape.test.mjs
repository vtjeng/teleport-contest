import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {money_cnt} from '../js/invent.js';
import {runSegment} from '../js/jsmain.js';
import {findgd, vault_occupied} from '../js/vault.js';

// C vault.c gd_move(): leaving with gold before fcend grows past one
// relocates the peaceful guard, restores its doorway, and sets it hostile.
for (const kind of ['hearing', 'deaf']) {
    test(`initial vault gold escape: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/guard-initial-gold-escape-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, segment.moves.lastIndexOf('kk'))}, options);
        assert.equal(boundary, undefined);
        const guard = findgd(game);
        assert.ok(guard);
        assert.equal(guard.mpeaceful, 1);
        assert.equal(guard.mextra.egd.fcend, 1);
        assert.ok(vault_occupied(game.u.urooms, game));
        assert.ok(money_cnt(game.invent) > 0);
        const {fx, fy, ftyp, flags} = guard.mextra.egd.fakecorr[0];
        const gold = money_cnt(game.invent);
        const replay = await runSegment(segment, options);
        assert.equal(boundary, undefined);
        const hostile = findgd(game);
        assert.ok(hostile);
        assert.equal(hostile.mpeaceful, 0);
        assert.equal(hostile.mextra.egd.fcend, 1, 'the initial-corridor branch was exercised');
        assert.equal(vault_occupied(game.u.urooms, game), 0);
        assert.notDeepEqual([hostile.mx, hostile.my], [fx, fy]);
        assert.equal(game.level.at(fx, fy).typ, ftyp);
        assert.equal(game.level.at(fx, fy).flags, flags);
        assert.equal(money_cnt(game.invent), gold, 'escape keeps the carried gold');
        const screens = replay.getScreens().join('\n');
        if (kind === 'hearing') assert.match(screens, /You hear the shrill sound of a guard's whistle\./u);
        else assert.doesNotMatch(screens, /You hear.*(?:whistle|shouting)/u);
    });
}
