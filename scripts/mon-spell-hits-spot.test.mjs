import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DUST, HEADSTONE, ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { make_engr_at } from '../js/engrave.js';
import {
    AD_ACID, AD_ELEC, AD_MAGM,
} from '../js/monsters.js';
import { mon_spell_hits_spot } from '../js/zap.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

function makeState() {
    const level = new GameMap();
    // C's helper receives the hero's occupied room square in these focused
    // cases; ordinary room terrain keeps the floor-effect tail inert.
    level.at(4, 5).typ = ROOM;
    return {
        level,
        u: { ux: 4, uy: 5, uprops: {}, uz: {} },
        youmonst: {},
        viz_array: [],
        moves: 1,
        context: {},
    };
}

function randomSource(draws) {
    return {
        d: (count, sides) => {
            draws.push(`d(${count},${sides})`);
            return sides;
        },
        rn2: bound => {
            draws.push(`rn2(${bound})`);
            return 0;
        },
        rnd: bound => {
            draws.push(`rnd(${bound})`);
            return 0;
        },
    };
}

test('mon_spell_hits_spot erodes a dust engraving before the floor effect',
    async () => {
        // zap.c:5510-5514 uses strlen(text)+d(6,6), then calls
        // wipe_engr_at(..., TRUE); this one-byte dust engraving distinguishes
        // the source's initial d(6,6) from wipeout_text's later rn2 calls.
        const state = makeState();
        const text = 'A';
        make_engr_at(4, 5, text, text, 0, DUST, {
            state,
            random: { rnd: bound => bound - 1 },
        });
        const draws = [];

        await mon_spell_hits_spot(null, AD_MAGM, 4, 5, {
            state,
            random: randomSource(draws),
            message: async () => {},
            norepMessage: async () => {},
            newsym: () => {},
        });

        assert.equal(draws[0], 'd(6,6)');
        assert.equal(draws.filter(draw => draw === 'd(6,6)').length, 1);
        assert.ok(draws.length > 1, 'wipeout_text consumes its own draws');
    });

test('mon_spell_hits_spot skips engraving work for an unengraved electric hit',
    async () => {
        // zap.c:5517-5527 accepts AD_ELEC for zap_over_floor, but only
        // AD_MAGM and AD_ACID enter the engraving branch.
        const state = makeState();
        const draws = [];

        await mon_spell_hits_spot(null, AD_ELEC, 4, 5, {
            state,
            random: randomSource(draws),
            message: async () => {},
            norepMessage: async () => {},
            newsym: () => {},
        });

        assert.deepEqual(draws, []);
        assert.equal(state.head_engr ?? null, null);
    });

test('mon_spell_hits_spot includes acid in the engraving branch', async () => {
    // zap.c:5510 includes AD_ACID as well as AD_MAGM; a headstone engraving
    // makes wipe_engr_at return without changing its protected text.
    const state = makeState();
    make_engr_at(4, 5, 'protected', 'protected', 0, HEADSTONE, { state });
    const draws = [];
    await mon_spell_hits_spot(null, AD_ACID, 4, 5, {
        state,
        random: randomSource(draws),
        message: async () => {},
        norepMessage: async () => {},
        newsym: () => {},
    });
    assert.deepEqual(draws, ['d(6,6)']);
    assert.equal(state.head_engr.engr_txt[0], 'protected');
});

test('mon_spell_hits_spot matches its selected and existing caller recordings',
    async () => {
        // The selected angel case covers AD_MAGM engraving erosion. Existing
        // independent recordings cover castmu's Antimagic and positive-damage
        // routes, mcast_fire_pillar, and mcast_lightning through production.
        const paths = [
            '../challenges/cases/v54/v54-angel-adjacent-magic-missiles-action3.session.json',
            '../recordings/mcastu.c/admagm-angel-tourist-independent.session.json',
            '../recordings/mcastu.c/admagm-angel-wizard-antimagic-variation.session.json',
            '../recordings/mcastu.c/grand-master-fire-pillar-independent.session.json',
            '../recordings/mcastu.c/grand-master-lightning-independent.session.json',
        ];
        for (const path of paths) {
            const recording = JSON.parse(readFileSync(
                new URL(path, import.meta.url), 'utf8',
            ));
            const output = await runJsSession(recording, process.cwd());
            const result = compareSessionOutputs(recording, output);
            assert.equal(result.passed, true, `${path}: ${JSON.stringify(result)}`);
        }
    });
