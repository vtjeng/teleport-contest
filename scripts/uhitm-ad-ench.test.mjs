import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_STR,
    OBJ_INVENT,
    W_RING,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import { RIN_GAIN_STRENGTH } from '../js/objects.js';
import {
    AD_ENCH,
    AT_BITE,
    AT_NONE,
    AT_WEAP,
    PM_DISENCHANTER,
} from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { mhitm_ad_ench, mhitm_adtyping, passive, passive_obj } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const ZAP_C = readFileSync(
    new URL('../nethack-c/upstream/src/zap.c', import.meta.url), 'utf8',
);
const MHITM_JS = readFileSync(new URL('../js/mhitm.js', import.meta.url), 'utf8');
const MHITU_JS = readFileSync(new URL('../js/mhitu.js', import.meta.url), 'utf8');
const ZAP_JS = readFileSync(new URL('../js/zap.js', import.meta.url), 'utf8');
// A fixed afternoon keeps the ordinary startup stable; no tested branch reads it.
const DATETIME = '20300814091500';
const RC = [
    'OPTIONS=name:DisenchantTest,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none',
    '',
].join('\n');

async function startGame() {
    // This fixed seed/date produce a fresh ordinary Wizard state for fixtures;
    // none of the tested source branches read the seed or calendar.
    // The chosen seed is fixture setup only; an empty move list avoids unrelated turn actions.
    await runSegment({ seed: 817403, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function scripted(values) {
    const bounds = [];
    const queue = [...values];
    return {
        bounds,
        d(count, sides) {
            bounds.push(`d(${count},${sides})`);
            assert.ok(queue.length, 'passive dice use only source-listed draws');
            return queue.shift();
        },
        rn2(bound) {
            bounds.push(`rn2(${bound})`);
            assert.ok(queue.length, 'AD_ENCH uses only source-listed draws');
            return queue.shift();
        },
        remaining: () => queue.length,
    };
}

test('mhitm_ad_ench source preserves three directions and dispatcher order', async () => {
    // C uhitm.c:3602-3649 has two no-op directions and only a monster-to-hero
    // body; the dispatcher must await it at the AD_ENCH arm.
    const start = UHITM_C.indexOf('mhitm_ad_ench(\n');
    const end = UHITM_C.indexOf('\n}\n', start);
    const source = UHITM_C.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.match(source, /if \(magr == &gy\.youmonst\)[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?mhitm_mgc_atk_negated\(magr, mdef, FALSE\)[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?some_armor\(mdef\)[\s\S]*?rn2\(5\)[\s\S]*?drain_item\(obj, FALSE\)/u);
    assert.match(UHITM_C, /case AD_ENCH:\s*mhitm_ad_ench\(magr, mattk, mdef, mhm\);\s*break;/u);

    const state = { youmonst: {} };
    const attacker = { data: {} };
    const defender = { data: {} };
    const forbidden = () => assert.fail('C no-op direction must not call helpers');

    assert.equal(await mhitm_ad_ench(state.youmonst, {}, defender, {}, state, {
        random: { rn2: forbidden }, message: forbidden,
    }), undefined);
    assert.equal(await mhitm_ad_ench(attacker, {}, defender, {}, state, {
        random: { rn2: forbidden }, message: forbidden,
    }), undefined);
});

test('AD_ENCH passive and floor-drain callers preserve their C guards', () => {
    // C's monster-pair, polymorph-passive and floor-zap calls each pass their
    // source-selected object and by-you flag to the one zap.c drain_item owner.
    assert.match(MHITM_C, /if \(mhitb && !mdef->mcan && mwep\)\s*\{\s*\(void\) drain_item\(mwep, FALSE\);/u);
    assert.match(MHITM_JS, /if \(mhitb && !mdef\.mcan && mwep\)\s*drain_item\(mwep, false, state, env\);/u);
    assert.match(MHITU_C, /drain_item\(mon_currwep, TRUE\);/u);
    assert.match(MHITU_JS, /if \(env\.mon_currwep\)\s*drain_item\(env\.mon_currwep, true, state, env\);/u);
    assert.match(ZAP_C, /case SPE_DRAIN_LIFE:[\s\S]*?drain_item\(obj, TRUE\);/u);
    assert.match(ZAP_JS, /case SPE_DRAIN_LIFE:\s*drain_item\(obj, true, state, \{ \.\.\.rawEnv, random \}\);/u);
});

test('mhitm_adtyping reaches monster-to-hero drainage in C call order', async () => {
    const state = await startGame();
    // Select a free adjacent square so hitmsg names a real visible source attacker.
    const x = state.u.ux + 1; // Adjacent squares satisfy the C hitmsg visibility path.
    const y = state.u.uy;
    const monster = newMonster({
        data: state.mons[PM_DISENCHANTER],
        m_id: 95001, // Distinguishes this source-test monster from the level population.
        mx: x,
        my: y,
        mcan: false,
        mcansee: true,
        mcanmove: true,
        mhp: 10, // A live monster is required by place_monster's C-shaped guard.
        mhpmax: 10,
        minvent: null,
    });
    place_monster(monster, x, y, state);

    // The Wizard begins with worn armor; clear only worn masks to exercise C's
    // rn2(5) fallback and select the positive right ring.
    for (let obj = state.invent; obj; obj = obj.nobj) obj.owornmask = 0;
    state.uarmc = state.uarm = state.uarmu = null;
    state.uarmh = state.uarmg = state.uarmf = state.uarms = null;
    const ring = mksobj(RIN_GAIN_STRENGTH, false, false, { state });
    ring.where = OBJ_INVENT;
    ring.owornmask = W_RING;
    ring.spe = 2; // A positive value reaches zap.c's single decrement.
    state.uright = ring;
    state.u.abon[A_STR] = 2;
    state.disp.botl = false;

    // rn2(10)=9 passes magic negation, rn2(5)=1 selects uright, and
    // rn2(100)=99 avoids the ordinary object-resistance roll.
    const random = scripted([9, 1, 99]);
    const events = [];
    const env = {
        random,
        message: async (line) => { events.push(`message:${line}`); },
        statusRefresh: () => { events.push('status'); state.disp.botl = false; },
    };
    // AD_ENCH reads only the attack type here; zero dice make the synthetic
    // damage fields inert rather than adding an unrelated random operation.
    const attackRecord = { aatyp: AT_BITE, adtyp: AD_ENCH, damn: 0, damd: 0 };

    await mhitm_adtyping(
        monster,
        attackRecord,
        state.youmonst,
        // Zero damage keeps this dispatcher fixture focused on the AD_ENCH arm.
        // These zeroed hit fields keep this test from entering damage follow-ups.
        { damage: 0, specialdmg: 0, done: false, hitflags: 0 },
        state,
        { ...env, unsupported: (reason) => assert.fail(reason) },
    );

    assert.deepEqual(random.bounds, ['rn2(10)', 'rn2(5)', 'rn2(100)']);
    assert.equal(random.remaining(), 0);
    assert.equal(ring.spe, 1);
    assert.equal(state.u.abon[A_STR], 1);
    assert.equal(events[0].startsWith('message:'), true);
    assert.ok(events[0].endsWith('bites!'));
    assert.equal(events[1], 'status');
    assert.equal(events[2].startsWith('message:'), true);
    assert.ok(events[2].endsWith('less effective.'));
});

test('passive awaits passive_obj messages and preserves its trailing guard draw',
    async () => {
        const state = await startGame();
        const ring = mksobj(RIN_GAIN_STRENGTH, false, false, { state });
        ring.where = OBJ_INVENT;
        ring.owornmask = W_RING;
        ring.known = true;
        ring.spe = 1; // One positive unit is the source's drain boundary.
        state.uleft = ring;
        state.u.abon[A_STR] = 2;
        state.disp.botl = false;
        const monster = {
            data: {
                // AT_NONE with zero dice makes the passive's pre-switch draw absent.
                mattk: [{ aatyp: AT_NONE, adtyp: AD_ENCH, damn: 0, damd: 0 }],
            },
            mcan: false,
        };
        const random = scripted([99, 0]); // Resist draw succeeds; rn2(3) tail is false.
        const events = [];

        await passive(monster, ring, true, true, AT_WEAP, false, state, {
            random,
            statusRefresh: () => events.push('status'),
            hooks: { updateInventory: () => events.push('inventory') },
            message: async (line) => { events.push(`message:${line}`); },
        });

        assert.deepEqual(random.bounds, ['rn2(100)', 'rn2(3)']);
        assert.equal(random.remaining(), 0);
        assert.equal(ring.spe, 0);
        assert.equal(events[0], 'status');
        assert.equal(events[1], 'inventory');
        assert.ok(events[2].startsWith('message:'));
        assert.ok(events[2].endsWith('less effective.'));
        assert.equal(events[3], 'inventory');
    });

test('passive_obj ignores cancelled disenchanters but still updates carried inventory',
    async () => {
        const state = await startGame();
        const ring = mksobj(RIN_GAIN_STRENGTH, false, false, { state });
        ring.where = OBJ_INVENT;
        ring.owornmask = W_RING;
        ring.spe = 1; // Cancellation must skip drain_item and its rn2(100).
        const monster = { mcan: true };
        const random = scripted([]);
        let inventories = 0;

        await passive_obj(monster, ring, { adtyp: AD_ENCH }, state, {
            random,
            hooks: { updateInventory: () => { inventories++; } },
            message: () => assert.fail('cancelled passive emits no drain message'),
        });

        assert.equal(ring.spe, 1);
        assert.equal(inventories, 1);
        assert.deepEqual(random.bounds, []);
        assert.equal(random.remaining(), 0);
    });
