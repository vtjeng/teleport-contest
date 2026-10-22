import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {g_at} from '../js/obj.js';
import {GOLD_PIECE} from '../js/objects.js';

function floorGold() {
    let total = 0;
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === GOLD_PIECE) total += obj.quan;
    return total;
}

// C vault.c wallify_vault moves boundary gold into the vault through move_gold.
// Two piles landing together also exercise stackobj's survivor/quantity contract.
for (const kind of ['single', 'multiple']) {
    test(`vault restores wall gold: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/guard-wall-gold-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, segment.moves.lastIndexOf('zn.'))}, options);
        assert.equal(boundary, undefined);
        assert.equal(g_at(74, 14, game)?.quan, 100);
        if (kind === 'multiple') assert.equal(g_at(74, 16, game)?.quan, 200);
        const before = floorGold();
        const replay = await runSegment(segment, options);
        assert.equal(boundary, undefined);
        assert.equal(g_at(74, 14, game), null);
        assert.equal(g_at(74, 16, game), null);
        assert.equal(floorGold(), before, 'relocation and stacking conserve gold');
        assert.ok(g_at(75, kind === 'single' ? 16 : 15, game));
        const screens = replay.getScreens().join('\n');
        assert.match(screens, /A mysterious force moves the gold into the vault\./u);
        assert.match(screens, /The damaged vault's walls are magically restored!/u);
        if (kind === 'multiple') assert.match(screens, /You hear a distant chant\./u);
    });
}
