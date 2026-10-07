// Independent C/JS witnesses for rumors.c:doconsult through #chat. The
// 100-gold and 50-gold variations exercise split and exact-stack payments.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { money_cnt } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ORACLE } from '../js/monsters.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export async function runOracleConsultationMatrix() {
    const balances = new WeakMap();
    const entries = [
        ['oracle-minor-gold-split-b133', 50],
        ['oracle-minor-exact-gold-b133', 0],
    ].map(([name, balance]) => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/rumors.c/${name}.session.json`, import.meta.url)));
        balances.set(recipe.segments[0], balance);
        return { label: name, recipe };
    });
    return runFreshMatrix({
        entries, summaryLabel: 'Oracle consultation',
        // Each debug C recipe leaves a save; isolate subsequent recordings.
        chunkLimit: 1,
        async verifySegment(segment) {
            await runSegment(segment);
            let oracle = game.level.monlist;
            while (oracle && oracle.data.pmidx !== PM_ORACLE)
                oracle = oracle.nmon;
            assert.ok(oracle, 'the actual Oracle, rather than a doppelganger');
            assert.equal(money_cnt(game.invent), balances.get(segment));
            assert.equal(money_cnt(oracle.minvent), 50); // C minor cost.
            assert.equal(game.u.uevent.minor_oracle, true);
            assert.equal(game.u.uevent.major_oracle, 0);
            assert.equal(game.u.uexp, 5); // First minor: 50 / 10.
        },
    });
}

runMatrixCli(import.meta.url, runOracleConsultationMatrix, 'oracle-consultation');
