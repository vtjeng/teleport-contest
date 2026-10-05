import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_INVENT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import { DAGGER } from '../js/objects.js';
import { AD_RUST, AD_SLIM, AT_NONE, AT_WEAP } from '../js/monsters.js';
import { passive, passive_obj } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);

async function startGame() {
    // This fixed seed and date provide the ordinary initialized inventory state;
    // the passive-object source branches below do not read either value.
    await runSegment({
        seed: 771223,
        datetime: '20311014091500',
        nethackrc: [
            'OPTIONS=name:PassiveObjectTest,role:Wizard,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none',
            '',
        ].join('\n'),
        moves: '',
    });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function scripted(values) {
    const queue = [...values];
    const calls = [];
    return {
        calls,
        rn2(bound) {
            calls.push(bound);
            assert.ok(queue.length, 'only C-listed passive draws may run');
            return queue.shift();
        },
        remaining: () => queue.length,
    };
}

function sourceFunction(name) {
    const start = UHITM_C.indexOf(`\n${name}(\n`);
    const end = UHITM_C.indexOf('\n}\n', start);
    assert.ok(start >= 0 && end > start, `${name} C body is present`);
    return UHITM_C.slice(start, end);
}

test('passive_obj source preserves each switch arm and final carried refresh', () => {
    const source = sourceFunction('passive_obj');
    assert.match(source, /if \(!obj\)[\s\S]*?u\.twoweap[\s\S]*?if \(!mattk\)[\s\S]*?NATTK/u);
    assert.match(source, /case AD_FIRE:[\s\S]*?rn2\(6\)[\s\S]*?\(void\) erode_obj\(obj, NULL, ERODE_BURN, EF_NONE\)/u);
    assert.match(source, /case AD_ACID:[\s\S]*?rn2\(6\)[\s\S]*?ERODE_CORRODE, EF_GREASE/u);
    assert.match(source, /case AD_RUST:[\s\S]*?if \(!mon->mcan\)[\s\S]*?ERODE_RUST, EF_GREASE/u);
    assert.match(source, /case AD_CORR:[\s\S]*?if \(!mon->mcan\)[\s\S]*?ERODE_CORRODE, EF_GREASE/u);
    assert.match(source, /case AD_ENCH:[\s\S]*?drain_item\(obj, TRUE\)[\s\S]*?obj->known \|\| obj->oclass == ARMOR_CLASS/u);
    assert.match(source, /default:\s*break;[\s\S]*?if \(carried\(obj\)\)\s*update_inventory\(\)/u);

    const caller = sourceFunction('passive');
    assert.match(caller, /case AD_RUST:[\s\S]*?passive_obj\(mon, weapon, &\(ptr->mattk\[i\]\)\)/u);
    assert.match(caller, /case AD_CORR:[\s\S]*?passive_obj\(mon, weapon, &\(ptr->mattk\[i\]\)\)/u);
    assert.match(caller, /if \(malive && !mon->mcan && rn2\(3\)\)/u);
});

test('passive_obj leaves unsupported damage types as C no-ops and refreshes carried items',
    async () => {
        const state = await startGame();
        const object = mksobj(DAGGER, false, false, { state });
        object.where = OBJ_INVENT;
        const random = scripted([]);
        let inventoryRefreshes = 0;

        // AD_SLIM has no case body in passive_obj; C reaches update_inventory
        // because the selected dagger is carried.
        await passive_obj({ data: {} }, object, { adtyp: AD_SLIM }, state, {
            random,
            hooks: {
                updateInventory: () => { inventoryRefreshes++; },
            },
        });

        assert.deepEqual(random.calls, []);
        assert.equal(random.remaining(), 0);
        assert.equal(inventoryRefreshes, 1);
    });

test('passive wires the rust-object arm before its source trailing roll', async () => {
    const state = await startGame();
    const weapon = mksobj(DAGGER, false, false, { state });
    weapon.where = OBJ_INVENT;
    const random = scripted([1]); // rn2(3)=1 selects C's empty rust follow-up.
    const events = [];
    const monster = {
        data: {
            mattk: [{ aatyp: AT_NONE, adtyp: AD_RUST, damn: 0, damd: 0 }],
        },
        mcan: false,
    };

    await passive(monster, weapon, true, true, AT_WEAP, false, state, {
        random,
        message: async (line) => { events.push(`message:${line}`); },
        hooks: {
            updateInventory: () => { events.push('inventory'); },
        },
    });

    assert.equal(weapon.oeroded, 1);
    assert.deepEqual(random.calls, [3]);
    assert.equal(random.remaining(), 0);
    assert.ok(events.some((event) => event.includes('rusts!')));
    assert.ok(events.includes('inventory'));
});
