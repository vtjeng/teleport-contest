#!/usr/bin/env node
// C-first independent seeds1422801-1422822 were fixed before recording;
// source-specific geometry/pager corrections and blocked originals stay in
// the C142 evidence. The prayer seed scan1422910-1422950 kept1422916 after
// 7 replays (4 stopped on unrelated turn boundaries), reaching live case6.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { HEAVY_IRON_BALL, IRON_CHAIN } from '../js/objects.js';
import { OBJ_BURIED, TT_BURIEDBALL, TT_NONE } from '../js/const.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const PUNISHMENT_CASES = [
    'dig.c/punishment-unearth-pit', 'dig.c/punishment-unearth-spiked-pit',
    'dig.c/punishment-level-teleport', 'dig.c/punishment-same-level-teleport',
    'dig.c/punishment-movement-tether', 'dig.c/punishment-downstairs',
    'dig.c/punishment-dig-levitating',
    'read.c/punish-anger-six', 'read.c/punish-cursed-weight',
    'read.c/punish-unsolid-air-elemental-scroll',
    // Existing independent recipes refresh the other direct unearth callers.
    'apply.c/b103-do-break-wand-liquid-flow-valkyrie-two-mores-cfirst',
    'zap.c/a83-melting-ice-timer-flying-slow-digestion-callback-cfirst',
];

export function runBuriedBallPunishmentMatrix() {
    return runFreshMatrix({
        entries: PUNISHMENT_CASES.map(name => ({ label: name,
            recipe: JSON.parse(readFileSync(new URL(`../recipes/${name}.session.json`, import.meta.url))) })),
        summaryLabel: 'BURIED BALL PUNISHMENT', chunkLimit: 1,
        verifySegment: async input => {
            const bury = input.moves.indexOf('#wizbury\n');
            let originalId;
            if (bury >= 0) {
                await runSegment({ ...input, moves: input.moves.slice(0, bury + '#wizbury\n'.length) });
                assert.equal(game.u.utraptype, TT_BURIEDBALL);
                assert.ok(game.u.utrap > 0);
                let obj = game.level.buriedobjlist;
                while (obj && obj.otyp !== HEAVY_IRON_BALL) obj = obj.nobj;
                assert.ok(obj); assert.equal(obj.where, OBJ_BURIED);
                originalId = obj.o_id;
            }
            await runSegment(input);
            if (originalId !== undefined) {
                assert.equal(game.uball?.o_id, originalId, 'restoration reuses the buried ball identity');
                assert.equal(game.uchain?.otyp, IRON_CHAIN);
                assert.equal(game.u.utrap, 0);
                assert.equal(game.u.utraptype, TT_NONE);
            } else if (input.moves.includes('#pray')) {
                assert.equal(game.uball?.otyp, HEAVY_IRON_BALL);
                assert.equal(game.uchain?.otyp, IRON_CHAIN);
            } else if (input.moves.includes('\x17cursed scroll of punishment')) {
                // objects.h starts the ball at480; read.c's cursed levy adds320.
                assert.equal(game.uball?.owt, 800);
            } else if (input.moves.includes('air elemental')) {
                assert.equal(game.uball, undefined);
                assert.equal(game.uchain, undefined);
                let ball = game.level.objlist;
                while (ball && ball.otyp !== HEAVY_IRON_BALL) ball = ball.nobj;
                assert.ok(ball, 'the unsolid arm drops the new ball without a chain');
            }
        },
    });
}
runMatrixCli(import.meta.url, runBuriedBallPunishmentMatrix, 'buried ball punishment');
