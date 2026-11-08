import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLNO, ROWNO } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { mbhitm } from '../js/muse.js';
import { mksobj } from '../js/obj.js';
import { WAN_TELEPORTATION } from '../js/objects.js';
import { goodpos } from '../js/teleport.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

async function hero() {
    await runSegment({
        seed: 8420310,
        datetime: '20261024100000',
        nethackrc: 'OPTIONS=name:WandContext,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '',
    });
    const wand = mksobj(WAN_TELEPORTATION, false, false, { state: game });
    game.gz = { ...(game.gz ?? {}), zap_oseen: false };
    return { wand };
}

test('monster teleport wand uses the caller RNG, message and missile redraw owners', async () => {
    const { wand } = await hero();
    game.u.uhave.amulet = true;
    const terrain = game.level.at(game.u.ux, game.u.uy).typ;
    let destination;
    for (let x = 1; x < COLNO && !destination; x++) {
        for (let y = 0; y < ROWNO; y++) {
            if ((x === game.u.ux && y === game.u.uy)
                || game.level.at(x, y).typ !== terrain
                || game.level.monsters[x][y]
                || game.level.traps.some(t => t.tx === x && t.ty === y)
                || !goodpos(x, y, game.youmonst, 0, { state: game })) continue;
            destination = { x, y };
            break;
        }
    }
    assert.ok(destination);
    const calls = [], redraws = [], messages = [];
    await mbhitm(game.youmonst, wand, game, {
        random: {
            rn2(bound) {
                calls.push(['rn2', bound]);
                return bound === 3 ? 1 : bound === ROWNO ? destination.y : 0;
            },
            rnd(bound) {
                calls.push(['rnd', bound]);
                return bound === COLNO - 1 ? destination.x : 1;
            },
            d: () => 1,
        },
        message: async line => messages.push(line),
        newsym: (x, y) => redraws.push([x, y]),
        displayRandom: () => 0,
    });
    assert.deepEqual(calls.slice(0, 3), [['rn2', 3], ['rnd', COLNO - 1], ['rn2', ROWNO]]);
    assert.deepEqual([game.u.ux, game.u.uy], [destination.x, destination.y]);
    assert.ok(redraws.length > 0);
    assert.ok(messages.some(line => line.startsWith('You materialize')));
});

for (const name of ['controlled', 'monochrome', 'uncontrolled', 'before-control', 'command-control', 'monster-chain']) {
    test('hero teleport ' + name + ' matches independent public C recording', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/muse.c/hero-teleport-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
