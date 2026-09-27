import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CLAIRVOYANT,
    FROMOUTSIDE,
    INTRINSIC,
    PROTECTION,
} from '../js/const.js';
import { COIN_CLASS, GOLD_PIECE } from '../js/objects.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { inhistemple, priest_talk } from '../js/priest.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/priest.c', import.meta.url),
    'utf8',
);
const RECIPE = JSON.parse(readFileSync(
    new URL('../recipes/priest.c/generated-temple-movement.session.json',
        import.meta.url),
));

function priestTalkSource() {
    const start = C_SOURCE.indexOf('void\npriest_talk(struct monst *priest)');
    const end = C_SOURCE.indexOf('\nstruct monst *\nmk_roamer', start);
    assert.ok(start >= 0 && end > start, 'priest.c priest_talk source range');
    return C_SOURCE.slice(start, end);
}

function donationEnvironment(gold, offer, rolls, lines, speech) {
    return {
        message: async (line) => lines.push(line),
        verbalize: async (line) => speech.push(line),
        setVoice: () => {},
        random: {
            rn1: (range, base) => {
                rolls.push([range, base]);
                return base;
            },
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        },
        bribe: async () => {
            gold.quan -= offer;
            return offer;
        },
    };
}

test('priest donation reward tiers preserve C order, thresholds, and RNG',
    async () => {
        const source = priestTalkSource();
        assert.match(C_SOURCE, /#define ALGN_SINNED \(-4\)/u);
        const firstReward = source.match(
            /else if \(offer < suggested \* quan \* 2\)([\s\S]*?)else if \(offer < suggested \* quan \* 3\)/u,
        );
        assert.ok(firstReward, 'C separates clairvoyance from protection');
        assert.ok(firstReward[1].indexOf('ALGN_SINNED')
            < firstReward[1].indexOf('incr_itimeout'));
        assert.ok(firstReward[1].includes('Thou art indeed a pious individual.'));
        assert.ok(firstReward[1].includes('I bestow upon thee a blessing.'));
        assert.match(firstReward[1], /500 \* offer \/ suggested/u);
        const protectionTier = source.slice(firstReward.index
            + firstReward[0].length);
        assert.ok(protectionTier.indexOf('HProtection |= FROMOUTSIDE')
            < protectionTier.indexOf('for (; offer >= (2 * suggested);'));

        await runSegment(RECIPE.segments[0]);
        const priest = [...(function* monsters() {
            for (let monster = game.level.monlist; monster;
                monster = monster.nmon) {
                if (monster.ispriest) yield monster;
            }
        })()][0];
        assert.ok(priest, 'the recorded generated temple supplies a priest');
        assert.equal(inhistemple(priest, game), true);

        const gold = { otyp: GOLD_PIECE, oclass: COIN_CLASS, quan: 10000 };
        // priest.c reads gi.invent, which maps to state.invent. Keep the
        // legacy-looking u.invent slot empty so this catches reading the
        // wrong state location instead of using the live game's inventory.
        const state = {
            ...game,
            invent: gold,
            u: {
                ...game.u,
                invent: null,
                ualign: { ...game.u.ualign },
                uconduct: { ...(game.u.uconduct ?? {}) },
                uprops: [...game.u.uprops],
            },
        };
        state.u.ualign.type = priest.mextra.epri.shralign;
        state.u.ualign.record = -4;
        state.u.ulevelpeak = 1;
        state.u.uconduct.gnostic = 1;
        state.u.uprops[CLAIRVOYANT] = { intrinsic: 0 };
        state.u.uprops[PROTECTION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
        state.u.ublessed = 0;

        const firstRolls = [];
        const firstLines = [];
        const firstSpeech = [];
        await priest_talk(
            priest,
            state,
            donationEnvironment(gold, 6500, firstRolls, firstLines, firstSpeech),
        );
        assert.deepEqual(firstSpeech, [
            'Thou art indeed a pious individual.',
            'I bestow upon thee a blessing.',
        ]);
        assert.deepEqual(firstRolls, [[101, 150], [21666, 21666]]);
        assert.equal(state.u.ualign.record, -3);
        assert.equal(state.u.uprops[CLAIRVOYANT].intrinsic, 21666);
        assert.equal(state.u.uprops[PROTECTION].intrinsic, 0);

        gold.quan = 10000;
        state.u.ualign.record = -4;
        state.u.ublessed = 20;
        const secondRolls = [];
        const secondLines = [];
        const secondSpeech = [];
        await priest_talk(
            priest,
            state,
            donationEnvironment(gold, 8000, secondRolls, secondLines, secondSpeech),
        );
        assert.deepEqual(secondSpeech, ['Thou hast been rewarded for thy devotion.']);
        assert.deepEqual(secondRolls, [[101, 150]]);
        assert.equal(state.u.ublessed, 20);
        assert.equal(state.u.uprops[PROTECTION].intrinsic & INTRINSIC, FROMOUTSIDE);
    });
