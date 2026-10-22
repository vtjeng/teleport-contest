import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

function recording(name) {
    return JSON.parse(readFileSync(new URL(
        '../recordings/shk.c/' + name + '.session.json', import.meta.url)));
}

for (const phase of ['departure', 'arrival', 'same-level']) {
    test('shopkeeper settlement matches live C through ' + phase, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const input = recording(phase === 'same-level'
                ? 'shopkeeper-same-level-settlement' : 'shopkeeper-return-migration');
            if (phase === 'departure') {
                const segment = input.segments[0];
                const end = segment.moves.lastIndexOf('#wizlevelport');
                assert.ok(end > 0);
                segment.moves = segment.moves.slice(0, end);
                segment.steps = segment.steps.slice(0, end + 1);
            }
            const result = compareSessionOutputs(input, await runJsSession(input, root));
            assert.equal(result.passed, true, formatReport(result));
            const {game} = await import(root + '/js/gstate.js');
            const {ROOMOFFSET} = await import(root + '/js/const.js');
            let keeper = phase === 'departure' ? game.gm.migrating_mons : game.level.monlist;
            while (keeper && !keeper.mextra?.eshk?.shknam?.includes('Izchak'))
                keeper = keeper.nmon;
            assert.ok(keeper, 'Izchak is on the expected monster list');
            const shop = keeper.mextra.eshk;
            assert.equal(Boolean(keeper.mpeaceful), true);
            assert.equal(shop.robbed, 0);
            assert.equal(Boolean(shop.following), false);
            if (phase === 'departure') {
                assert.deepEqual([keeper.mx, keeper.my], [0, 0]);
                assert.equal(shop.dismiss_kops, true);
                assert.deepEqual([keeper.mux, keeper.muy],
                    [shop.shoplevel.dnum, shop.shoplevel.dlevel]);
            } else {
                assert.equal(game.level.rooms[shop.shoproom - ROOMOFFSET].resident, keeper);
                assert.equal(Boolean(shop.dismiss_kops), false);
            }
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
