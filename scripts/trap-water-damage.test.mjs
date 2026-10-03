import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    EF_NONE,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
    RUST_TRAP,
    Trap_Effect_Finished,
    W_ARMH,
} from '../js/const.js';
import {
    CHEST,
    OILSKIN_SACK,
    OIL_LAMP,
    POT_FRUIT_JUICE,
    POT_WATER,
    POTION_CLASS,
    SACK,
    SCR_BLANK_PAPER,
    SCROLL_CLASS,
    TALLOW_CANDLE,
    TOOL_CLASS,
} from '../js/objects.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import {
    water_damage_chain,
    water_damage,
    water_damage_monster_equipment,
    fire_damage,
} from '../js/trap_water_damage.js';
import { trapeffect_selector } from '../js/trap_effects.js';
import { init_objects } from '../js/o_init.js';
import { begin_burn } from '../js/timeout.js';

// These valid coordinates route the carried object through the source
// get_obj_location() case used by fire_damage() -> catch_lit().
const HERO_X = 2;
const HERO_Y = 3;
const FUELED_LAMP_AGE = 100;
const SINGULAR_LAMP_QUANTITY = 1;
const STARTUP_INPUT = {
    seed: 12, // Use the same initialized human game shape as the rust-trap source tests.
    datetime: '20260503045501', // Keep this fixture's startup deterministic.
    nethackrc: 'OPTIONS=symset:DECgraphics\n',
    moves: 'Dodeco\rn[l"m/hmy', // Complete character creation before the trap callback.
};

function wornObject(overrides = {}) {
    return {
        greased: false,
        lamplit: false,
        ocarry: {},
        owornmask: W_ARMH,
        where: OBJ_MINVENT,
        ...overrides,
    };
}

test('a missing rust-trap target needs no water-damage operations',
    async () => {
        const result = await water_damage_monster_equipment(null, null);
        assert.equal(result, ER_NOTHING);
    });

test('fire_damage returns false when catch_lit handles a carried lamp',
    async () => {
        const state = {
            gm: {},
            u: { uprops: [], ux: HERO_X, uy: HERO_Y },
        };
        // Seed the source object catalog deterministically for Yname2().
        init_objects(state, () => 0);
        const lamp = {
            age: FUELED_LAMP_AGE,
            cursed: false,
            lamplit: false,
            otyp: OIL_LAMP,
            oclass: TOOL_CLASS,
            quan: SINGULAR_LAMP_QUANTITY,
            spe: 1,
            where: OBJ_INVENT,
        };
        const events = [];

        const destroyed = await fire_damage(lamp, false, HERO_X, HERO_Y, {
            beginBurn: (obj, alreadyLit) => {
                events.push(['burn', obj, alreadyLit]);
                obj.lamplit = true;
            },
            message: (line) => events.push(['message', line]),
            random: {
                rn2: () => assert.fail(
                    'catch_lit returning true skips fire destruction',
                ),
            },
            state,
        });

        assert.equal(destroyed, false);
        assert.equal(lamp.lamplit, true);
        assert.deepEqual(events.map((event) => event[0]), ['message', 'burn']);
    });

test('non-equipment is rejected before an illuminated item can mutate',
    async () => {
        const obj = wornObject({ lamplit: true, owornmask: 0 });
        await assert.rejects(
            water_damage_monster_equipment(obj, null, {
                splashLight: () => assert.fail('preflight must run first'),
            }),
            /requires worn armor or a wielded weapon/u,
        );
    });

test('an extinguished light reports damage and skips later branches',
    async () => {
        const obj = wornObject({ lamplit: true });
        const events = [];
        const env = {
            erodeObject: () => assert.fail('splashing short-circuits erosion'),
            random: {
                rn2: () => assert.fail('splashing precedes grease'),
            },
            splashLight: (target, nestedEnv) => {
                assert.equal(target, obj);
                assert.equal(nestedEnv, env);
                events.push('splash');
                return true;
            },
        };

        const result = await water_damage_monster_equipment(
            obj,
            'helmet',
            env,
        );

        assert.equal(result, ER_DAMAGED);
        assert.deepEqual(events, ['splash']);
    });

// C trap.c routes this default hero branch through splash_lit()->snuff_lit()
// before inventory refresh; this checks that the production selector reaches
// the same helper, rather than only testing snuff_candle() in isolation.
test('rust-trap selector snuffs a lit hero-inventory candle', async () => {
    await runSegment(STARTUP_INPUT);
    const state = game;
    const candle = mksobj(TALLOW_CANDLE, false, false, { state });
    candle.age = 100; // C's age > 75 candle arm creates a burn timer to stop.
    candle.where = OBJ_INVENT; // The trap walks this source-owned inventory list.
    candle.nobj = state.invent;
    state.invent = candle;
    begin_burn(candle, false, { state });

    const messages = [];
    const draws = [];
    // C trap.c needs a live unseen rust trap at the hero's tile: false `tseen`
    // reaches its reveal; false `once` lets the trap retain normal behavior;
    // zero note and player-made flag are the neutral freshly placed defaults.
    const trap = {
        ttyp: RUST_TRAP, // Selects the water/rust source function.
        tseen: false,
        once: false,
        tx: state.u.ux, // Put the trap directly under the hero for the selector.
        ty: state.u.uy,
        tnote: 0,
        madeby_u: false,
    };
    const result = await trapeffect_selector(state.youmonst, trap, 0, {
        message: async (line) => messages.push(line),
        random: {
            rn2(bound) {
                draws.push(bound);
                assert.equal(bound, 5); // The hero trap selects among five arms.
                return 4; // C's default arm splashes other carried light sources.
            },
        },
        redraw: () => {},
        state,
        unsupported: (reason) => { throw new Error(reason); },
    });

    assert.equal(result, Trap_Effect_Finished);
    assert.deepEqual(draws, [5]);
    const splash = messages.indexOf('A gush of water hits you!');
    const snuffed = messages.indexOf(
        "Your candle's flame is extinguished.",
    ); // Shk_Your plus one carried tallow candle matches apply.c's pline.
    assert.ok(splash >= 0 && snuffed > splash);
    assert.equal(candle.lamplit, false);
});

test('water can wash off grease without reaching erosion', async () => {
    const obj = wornObject({ greased: true });
    const draws = [];
    const env = {
        erodeObject: () => assert.fail('grease blocks erosion'),
        random: {
            rn2: (bound) => {
                draws.push(bound);
                return 0;
            },
        },
        splashLight: () => false,
    };

    const result = await water_damage_monster_equipment(
        obj,
        'helmet',
        env,
    );

    assert.equal(result, ER_GREASED);
    assert.equal(obj.greased, false);
    assert.deepEqual(draws, [2]);
});

test('ordinary equipment delegates forced rust with no erosion flags',
    async () => {
        const obj = wornObject();
        const calls = [];
        const env = {
            erodeObject: (...args) => {
                calls.push(args);
                return ER_NOTHING;
            },
            random: {
                rn2: () => assert.fail('ungreased equipment needs no draw'),
            },
            splashLight: () => false,
        };

        const result = await water_damage_monster_equipment(
            obj,
            'helmet',
            env,
        );

        assert.equal(result, ER_NOTHING);
        assert.deepEqual(calls, [
            [obj, 'helmet', ERODE_RUST, EF_NONE, env],
        ]);
    });

test('water_damage follows trap.c source branches for potion dilution',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/trap.c', import.meta.url),
            'utf8',
        );
        assert.match(
            source,
            /else if \(obj->oclass == POTION_CLASS\)[\s\S]*?obj->odiluted\)/u,
        );
        const state = { u: { uprops: [] }, gm: {} };
        const obj = {
            oclass: POTION_CLASS,
            otyp: POT_FRUIT_JUICE,
            odiluted: 0,
            blessed: true,
            cursed: false,
            dknown: 1,
            where: OBJ_INVENT,
        };
        const messages = [];
        let refreshes = 0;
        const result = await water_damage(obj, 'fruit juice', true, {
            state,
            message: (line) => messages.push(line),
            updateInventory: () => { ++refreshes; },
            random: { rn2: () => assert.fail('forced water damage skips luck') },
            erodeObject: () => assert.fail('potions do not reach erosion'),
        });
        assert.equal(result, ER_DAMAGED);
        assert.equal(obj.odiluted, 1);
        assert.deepEqual(messages, ['Your fruit juice dilutes.']);
        assert.equal(refreshes, 1);
    });

test('a previously diluted potion becomes uncursed water', async () => {
    const state = { u: { uprops: [] }, gm: {} };
    const obj = {
        oclass: POTION_CLASS,
        otyp: POT_FRUIT_JUICE,
        odiluted: 1,
        blessed: true,
        cursed: true,
        dknown: 1,
        where: OBJ_INVENT,
    };
    const messages = [];
    const result = await water_damage(obj, 'fruit juice', true, {
        state,
        message: (line) => messages.push(line),
        updateInventory: () => {},
        random: { rn2: () => assert.fail('forced water damage skips luck') },
    });
    assert.equal(result, ER_DAMAGED);
    assert.equal(obj.otyp, POT_WATER);
    assert.equal(obj.odiluted, 0);
    assert.equal(obj.blessed, false);
    assert.equal(obj.cursed, false);
    assert.equal(obj.dknown, 0);
    assert.deepEqual(messages, ['Your fruit juice dilutes further.']);
});

test('water_damage blanks a nonblank scroll and leaves blank paper alone',
    async () => {
        const state = { u: { uprops: [] }, gm: {} };
        const obj = {
            oclass: SCROLL_CLASS,
            otyp: 366,
            spe: 3,
            dknown: 1,
            where: OBJ_INVENT,
        };
        const messages = [];
        let refreshes = 0;
        const env = {
            state,
            message: (line) => messages.push(line),
            updateInventory: () => { ++refreshes; },
            random: { rn2: () => assert.fail('forced water damage skips luck') },
        };
        assert.equal(
            await water_damage(obj, 'scroll', true, env),
            ER_DAMAGED,
        );
        assert.equal(obj.otyp, SCR_BLANK_PAPER);
        assert.equal(obj.spe, 0);
        assert.equal(obj.dknown, 0);
        assert.deepEqual(messages, ['Your scroll fades.']);
        assert.equal(refreshes, 1);
        messages.length = 0;
        assert.equal(await water_damage(obj, 'scroll', true, env), ER_NOTHING);
        assert.deepEqual(messages, []);
        assert.equal(refreshes, 1);
    });

test('waterproof containers leak only on the cursed rn2(3) arm', async () => {
    const state = { u: { uprops: [] }, gm: {} };
    const obj = {
        oclass: 6,
        otyp: OILSKIN_SACK,
        cursed: true,
        cobj: { otyp: POT_FRUIT_JUICE },
        where: OBJ_INVENT,
    };
    const messages = [];
    const known = [];
    const chain = [];
    const env = {
        state,
        message: (line) => messages.push(line),
        makeKnown: (otyp) => known.push(otyp),
        waterDamageChain: (...args) => chain.push(args),
        random: { rn2: (bound) => {
            assert.equal(bound, 3);
            return 1;
        } },
    };
    assert.equal(await water_damage(obj, 'oilskin sack', true, env), ER_DAMAGED);
    assert.deepEqual(messages, ['The water cannot get into your oilskin sack.']);
    assert.deepEqual(known, [OILSKIN_SACK]);
    assert.deepEqual(chain, []);
    assert.equal(state.gm.mentioned_water, true);

    obj.otyp = CHEST;
    obj.cursed = false;
    obj.cobj = { otyp: POT_FRUIT_JUICE };
    messages.length = 0;
    assert.equal(await water_damage(obj, 'bag', true, {
        ...env,
        random: { rn2: () => assert.fail('uncursed waterproof bag does not roll') },
    }), ER_DAMAGED);
    assert.deepEqual(messages, ['The water cannot get into your bag.']);
});

test('ordinary containers send their contents through water_damage_chain',
    async () => {
        const state = { u: { uprops: [] }, gm: {} };
        const contents = { otyp: POT_FRUIT_JUICE };
        const obj = {
            oclass: 6,
            otyp: SACK,
            cursed: false,
            cobj: contents,
            where: OBJ_INVENT,
        };
        const messages = [];
        const chain = [];
        const env = {
            state,
            message: (line) => messages.push(line),
            waterDamageChain: (...args) => chain.push(args),
            random: { rn2: () => assert.fail('ordinary containers do not roll') },
        };
        const result = await water_damage(obj, 'sack', true, env);
        assert.equal(result, ER_DAMAGED);
        assert.deepEqual(messages, ['Some water gets into your sack!']);
        assert.equal(chain.length, 1);
        assert.equal(chain[0][0], contents);
        assert.equal(chain[0][1], false);
        assert.equal(chain[0][2], env);
    });

test('water_damage_chain saves next links and restores acid context and bhitpos',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/trap.c', import.meta.url),
            'utf8',
        );
        assert.match(
            source,
            /save_bhitpos = gb\.bhitpos;[\s\S]*?otmp = here \? obj->nexthere : obj->nobj;[\s\S]*?water_damage\(obj, \(char \*\) 0, FALSE\);/u,
        );

        const container = { where: OBJ_FLOOR, ox: 12, oy: 8 };
        const second = { where: OBJ_CONTAINED, ocontainer: container };
        const first = {
            where: OBJ_CONTAINED,
            ocontainer: container,
            nobj: second,
        };
        const acidContext = {
            dkn_boom: 3,
            unk_boom: 2,
            ctx_valid: false,
        };
        const state = {
            ga: { acid_ctx: acidContext },
            gb: { bhitpos: { x: 4, y: 6 } },
        };
        const visited = [];
        await water_damage_chain(first, false, {
            state,
            waterDamage: (obj) => {
                visited.push(obj);
                assert.equal(state.ga.acid_ctx.ctx_valid, true);
                assert.equal(state.ga.acid_ctx.dkn_boom, 0);
                assert.equal(state.ga.acid_ctx.unk_boom, 0);
                assert.deepEqual(state.gb.bhitpos, { x: 12, y: 8 });
                if (obj === first) obj.nobj = null;
                return ER_DAMAGED;
            },
        });

        assert.deepEqual(visited, [first, second]);
        assert.deepEqual(state.gb.bhitpos, { x: 4, y: 6 });
        assert.deepEqual(acidContext, {
            dkn_boom: 0,
            unk_boom: 0,
            ctx_valid: false,
        });

        const floorOther = { where: OBJ_FLOOR, ox: 8, oy: 10 };
        const floorNext = { where: OBJ_FLOOR, ox: 8, oy: 10 };
        const floorFirst = {
            where: OBJ_FLOOR,
            ox: 8,
            oy: 10,
            nobj: floorOther,
            nexthere: floorNext,
        };
        const floorVisited = [];
        await water_damage_chain(floorFirst, true, {
            state,
            waterDamage: (obj) => {
                floorVisited.push(obj);
                assert.deepEqual(state.gb.bhitpos, { x: 8, y: 10 });
            },
        });
        assert.deepEqual(floorVisited, [floorFirst, floorNext]);
        assert.deepEqual(state.gb.bhitpos, { x: 4, y: 6 });
    });

test('water_damage recurses through real contained items by default', async () => {
    const state = {
        ga: { acid_ctx: { dkn_boom: 0, unk_boom: 0, ctx_valid: false } },
        gb: { bhitpos: { x: 4, y: 6 } },
        u: { uprops: [], uluck: 0 },
    };
    const contents = {
        oclass: POTION_CLASS,
        otyp: POT_FRUIT_JUICE,
        odiluted: 0,
        blessed: false,
        cursed: false,
        dknown: 1,
        where: OBJ_CONTAINED,
    };
    const container = {
        oclass: 6,
        otyp: SACK,
        where: OBJ_FLOOR,
        ox: 12,
        oy: 8,
        cobj: contents,
    };
    contents.ocontainer = container;

    await water_damage(container, 'sack', false, {
        state,
        message: () => {},
        random: { rn2: () => 19 },
        waterDamage: (obj, description, force, env) =>
            water_damage(obj, 'fruit juice', force, env),
    });

    assert.equal(contents.odiluted, 1);
    assert.deepEqual(state.gb.bhitpos, { x: 4, y: 6 });
    assert.deepEqual(state.ga.acid_ctx, {
        dkn_boom: 0,
        unk_boom: 0,
        ctx_valid: false,
    });
});

test('drown uses canonical leash counting and preserves the disrobe gap',
    async () => {
        const cTrap = await readFile(
            new URL('../nethack-c/upstream/src/trap.c', import.meta.url),
            'utf8',
        );
        const jsTrap = await readFile(
            new URL('../js/trap.js', import.meta.url),
            'utf8',
        );
        assert.match(
            cTrap,
            /if \(invc > 0\) \{\s*i = rn2\(invc\);[\s\S]*?if \(!otmp\)\s*return FALSE;/u,
        );
        assert.match(
            jsTrap,
            /if \(invc > 0\) \{\s*let index = rn2\(invc\);\s*let obj = state\.invent;[\s\S]*?if \(!selected\) return false;/u,
        );
        const cDisrobe = cTrap.slice(
            cTrap.indexOf('\nemergency_disrobe(boolean *lostsome)'),
            cTrap.indexOf('\nrnd_nextto_goodpos(',
                cTrap.indexOf('\nemergency_disrobe(boolean *lostsome)'),
            ),
        );
        const jsDisrobe = jsTrap.slice(
            jsTrap.indexOf('async function emergency_disrobe('),
            jsTrap.indexOf('\nexport async function drown(',
                jsTrap.indexOf('async function emergency_disrobe('),
            ),
        );
        assert.match(cDisrobe, /dropx\(otmp\);\s*invc--;/u);
        assert.match(jsDisrobe,
            /lostsome\.value = true;[\s\S]*?note_unported\('do\.c dropx'\);\s*--invc;/u);
        assert.doesNotMatch(jsDisrobe, /await dropx\(/u);
        assert.match(jsTrap, /import \{ number_leashed \} from '\.\/apply\.js';/u);
        assert.match(jsTrap, /const leashed = number_leashed\(state\);/u);
        assert.doesNotMatch(jsTrap, /function numberLeashed\(/u);
    });
