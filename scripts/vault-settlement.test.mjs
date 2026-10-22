import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {money_cnt} from '../js/invent.js';
import {runSegment} from '../js/jsmain.js';
import {GOLD_PIECE} from '../js/objects.js';
import {findgd} from '../js/vault.js';

function floorGold() {
    let total = 0;
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === GOLD_PIECE) total += obj.quan;
    return total;
}

for (const kind of ['inside', 'silentInside', 'hostileOutside', 'peacefulOutside']) {
    test(`end-of-game guard settlement: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/guard-settlement-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, segment.moves.lastIndexOf('#quit'))}, options);
        assert.equal(boundary, undefined);
        const guard = findgd(game);
        assert.ok(guard);
        assert.equal(Boolean(game.u.uinvault), !kind.endsWith('Outside'));
        if (kind.endsWith('Outside')) assert.equal(Boolean(guard.mpeaceful), kind === 'peacefulOutside');
        const carried = money_cnt(game.invent);
        assert.ok(carried > 0);
        const floor = floorGold();
        const replay = await runSegment(segment, options);
        assert.equal(boundary, undefined);
        assert.equal(findgd(game), null);
        const keepsGold = kind === 'peacefulOutside';
        assert.equal(money_cnt(game.invent), keepsGold ? carried : 0);
        assert.equal(floorGold(), floor + (keepsGold ? 0 : carried));
        const screens = replay.getScreens().join('\n');
        if (kind === 'inside') assert.match(screens, /goes into the Magic Memory Vault\./u);
        if (kind === 'hostileOutside') assert.match(screens, /The guard remits your gold to the vault\./u);
        if (kind === 'silentInside') assert.doesNotMatch(screens, /Magic Memory Vault|remits your gold/u);
    });
}
