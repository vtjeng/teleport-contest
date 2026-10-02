import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_STR,
    OBJ_FLOOR,
    OBJ_INVENT,
    W_ARM,
    W_RING,
    COST_DRAIN,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import {
    LEATHER_ARMOR,
    POTION_CLASS,
    RIN_GAIN_STRENGTH,
    POT_WATER,
} from '../js/objects.js';
import { drain_item } from '../js/zap.js';

const ZAP_C = readFileSync(
    new URL('../nethack-c/upstream/src/zap.c', import.meta.url), 'utf8',
);
// A fixed daytime game supplies an initialized hero/artifact/object state.
const DATETIME = '20300814091500';
const RC = [
    'OPTIONS=name:DrainTester,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none',
    '',
].join('\n');

async function startGame() {
    // This independent seed only initializes the fixture; the tests script every drain draw.
    await runSegment({ seed: 831407, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    game.iflags.suppress_price = 7;
    return game;
}

function ordinaryDraws(values) {
    const bounds = [];
    const queue = [...values];
    return {
        bounds,
        rn2(bound) {
            bounds.push(bound);
            assert.ok(queue.length, 'ordinary drain uses its source obj_resists draw');
            return queue.shift();
        },
        remaining: () => queue.length,
    };
}

test('drain_item source orders defenses, resistance, alteration and mutation', () => {
    // zap.c:1382-1455; pin the actual C short-circuit order and bonus cases.
    const start = ZAP_C.indexOf('drain_item(struct obj *obj, boolean by_you)');
    const end = ZAP_C.indexOf('\n}\n', start);
    const source = ZAP_C.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.match(source, /defends\(AD_DRLI, obj\) \|\| defends_when_carried\(AD_DRLI, obj\)\s*\|\| obj_resists\(obj, 10, 90\)/u);
    assert.ok(source.indexOf('costly_alteration(obj, COST_DRAIN)')
        < source.indexOf('obj->spe--'));
    assert.ok(source.indexOf('obj->spe--') < source.indexOf('if (disp.botl)'));
    assert.ok(source.indexOf('if (disp.botl)') < source.indexOf('if (carried(obj))'));
});

test('drain_item updates a worn strength ring and refreshes status before inventory',
    async () => {
        const state = await startGame();
        // This ring exercises zap.c's explicit worn-ring strength case.
        const ring = mksobj(RIN_GAIN_STRENGTH, false, false, { state });
        ring.spe = 2;
        ring.where = OBJ_INVENT;
        ring.owornmask = W_RING;
        state.uleft = ring;
        state.u.abon[A_STR] = 3;
        state.disp.botl = false;
        const draws = ordinaryDraws([99]); // 99 exceeds the ordinary 10% resistance chance.
        const order = [];
        const hooks = {
            updateInventory(receivedState) {
                assert.equal(receivedState, state);
                order.push('inventory');
            },
        };

        assert.equal(drain_item(ring, false, state, {
            random: draws,
            statusRefresh() {
                order.push('status');
                state.disp.botl = false; // C bot() consumes the dirty-status request.
            },
            hooks,
        }), true);

        assert.equal(ring.spe, 1);
        assert.equal(state.u.abon[A_STR], 2);
        assert.deepEqual(draws.bounds, [100]);
        assert.equal(draws.remaining(), 0);
        assert.deepEqual(order, ['status', 'inventory']);
        assert.equal(state.iflags.suppress_price, 7);
    });

test('drain_item leaves unrelated worn armor status clean', async () => {
    const state = await startGame();
    // Ordinary body armor reaches zap.c's default arm, which only breaks.
    const armor = mksobj(LEATHER_ARMOR, false, false, { state });
    armor.spe = 1;
    armor.where = OBJ_INVENT;
    armor.owornmask = W_ARM;
    state.uarm = armor;
    state.disp.botl = false;
    const draws = ordinaryDraws([99]); // 99 selects the non-resisting outcome.
    let statusCalls = 0;

    assert.equal(drain_item(armor, false, state, {
        random: draws,
        statusRefresh: () => { statusCalls++; },
    }), true);
    assert.equal(armor.spe, 0);
    assert.equal(state.disp.botl, false);
    assert.equal(statusCalls, 0);
    assert.deepEqual(draws.bounds, [100]);
});

test('drain_item preserves the by-you shop hook before changing a floor object',
    async () => {
        const state = await startGame();
        // A positive helm is an eligible armor object placed on the floor so
        // costly_alteration must use its injected source owner.
        const armor = mksobj(LEATHER_ARMOR, false, false, { state });
        armor.spe = 2;
        armor.where = OBJ_FLOOR;
        armor.owornmask = W_ARM;
        const draws = ordinaryDraws([99]); // Avoid the ordinary resistance branch.
        const order = [];
        const hooks = {
            costlyAlteration(obj, alterType) {
                assert.equal(obj, armor);
                assert.equal(alterType, COST_DRAIN);
                assert.equal(obj.spe, 2); // C bills before decrementing enchantment.
                order.push('alteration');
            },
        };

        assert.equal(drain_item(armor, true, state, { random: draws, hooks }), true);
        assert.deepEqual(order, ['alteration']);
        assert.equal(armor.spe, 1);
        assert.deepEqual(draws.bounds, [100]);
        assert.equal(draws.remaining(), 0);
    });

test('drain_item skips resistance draws for ineligible objects and resists in order',
    async () => {
        const state = await startGame();
        // A noncharged potion is not a weapon, armor or weptool even with spe.
        const ineligible = mksobj(POT_WATER, false, false, { state });
        ineligible.oclass = POTION_CLASS; // Potions are not charged, weapon, armor or weptool objects.
        ineligible.spe = 3;
        const none = ordinaryDraws([]);
        assert.equal(drain_item(ineligible, false, state, { random: none }), false);
        assert.deepEqual(none.bounds, []);

        // A positive ring with an rn2(100) result below ten resists and stays unchanged.
        const ring = mksobj(RIN_GAIN_STRENGTH, false, false, { state });
        ring.spe = 1;
        const resistance = ordinaryDraws([9]);
        assert.equal(drain_item(ring, false, state, { random: resistance }), false);
        assert.equal(ring.spe, 1);
        assert.deepEqual(resistance.bounds, [100]);
        assert.equal(resistance.remaining(), 0);
    });
