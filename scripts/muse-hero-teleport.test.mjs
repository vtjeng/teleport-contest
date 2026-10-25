import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLNO, ROWNO, TELEPORT_CONTROL } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mbhitm } from '../js/muse.js';
import { mksobj } from '../js/obj.js';
import { WAN_TELEPORTATION } from '../js/objects.js';
import { goodpos } from '../js/teleport.js';
import { planningState } from '../js/unported_monster_actions.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

async function plannedHero() {
    await runSegment({
        seed: 8420310,
        datetime: '20261024100000',
        nethackrc: 'OPTIONS=name:WandContext,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '',
    });
    const wand = mksobj(WAN_TELEPORTATION, false, false, { state: game });
    const planned = planningState(game);
    planned.gz = { ...(planned.gz ?? {}), zap_oseen: false };
    return { planned, wand };
}

test('monster teleport wand preserves clone RNG, message and missile redraw owners', async () => {
    const { planned, wand } = await plannedHero();
    planned.u.uhave.amulet = true;
    const livePosition = [game.u.ux, game.u.uy];
    const liveCore = structuredClone(game.coreCtx);
    const liveScreen = game.nhDisplay.serialize();
    const terrain = planned.level.at(planned.u.ux, planned.u.uy).typ;
    let destination;
    for (let x = 1; x < COLNO && !destination; x++) {
        for (let y = 0; y < ROWNO; y++) {
            if ((x === planned.u.ux && y === planned.u.uy)
                || planned.level.at(x, y).typ !== terrain
                || planned.level.monsters[x][y]
                || planned.level.traps.some(t => t.tx === x && t.ty === y)
                || !goodpos(x, y, planned.youmonst, 0, { state: planned })) continue;
            destination = { x, y };
            break;
        }
    }
    assert.ok(destination);
    const calls = [], redraws = [], messages = [];
    const boundary = new Error('arrival replay');
    const operations = [];
    await assert.rejects(() => mbhitm(planned.youmonst, wand, planned, {
        planning: true,
        requestPlanningInput(operation) {
            operations.push(operation);
            throw boundary;
        },
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
    }), error => error === boundary);
    assert.deepEqual(operations, ['hack.c spoteffects']);
    assert.deepEqual(calls.slice(0, 3), [['rn2', 3], ['rnd', COLNO - 1], ['rn2', ROWNO]]);
    assert.deepEqual([planned.u.ux, planned.u.uy], [destination.x, destination.y]);
    assert.ok(redraws.length > 0);
    assert.ok(messages.some(line => line.startsWith('You materialize')));
    assert.deepEqual([game.u.ux, game.u.uy], livePosition);
    assert.deepEqual(game.coreCtx, liveCore);
    assert.equal(game.nhDisplay.serialize(), liveScreen);
});

test('controlled monster teleport hands player input back to the live turn', async () => {
    const { planned, wand } = await plannedHero();
    planned.u.uprops[TELEPORT_CONTROL].intrinsic = 1;
    const liveCore = structuredClone(game.coreCtx);
    const liveScreen = game.nhDisplay.serialize();
    const position = [planned.u.ux, planned.u.uy];
    const boundary = new Error('planned teleport input');
    const operations = [];
    await assert.rejects(mbhitm(planned.youmonst, wand, planned, {
        planning: true,
        message: async () => {},
        newsym: () => assert.fail('no relocation before destination input'),
        requestPlanningInput(operation) {
            operations.push(operation);
            throw boundary;
        },
    }), error => error === boundary);
    assert.deepEqual(operations, ['getpos']);
    assert.deepEqual([planned.u.ux, planned.u.uy], position);
    assert.deepEqual(game.coreCtx, liveCore);
    assert.equal(game.nhDisplay.serialize(), liveScreen);
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
