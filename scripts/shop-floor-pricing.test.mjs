import assert from 'node:assert/strict';
import test from 'node:test';

import {
    domove,
    requireSimpleHeroDestination,
} from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { newObject, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    assertPricedObjectNameable,
    doname_with_price,
    xnameFresh,
} from '../js/objnam.js';
import {
    CORPSE,
    DUNCE_CAP,
    EGG,
    FIRST_GLASS_GEM,
    FOOD_RATION,
    GOLD_PIECE,
    DART,
    LONG_SWORD,
    POT_HEALING,
    SACK,
    TIN,
    WAX_CANDLE,
} from '../js/objects.js';
import {
    HALLUC,
    HALLUC_RES,
    BURN_OBJECT,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    NON_PM,
    ROOM,
    ROOMOFFSET,
    SHARED,
    SHOPBASE,
    TIMER_OBJECT,
} from '../js/const.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { PM_FIRE_ANT, PM_NEWT, PM_TOURIST } from '../js/monsters.js';
import { getRngLog } from '../js/rng.js';
import { create_region } from '../js/region.js';
import { check_special_room } from '../js/rooms.js';
import { corpsenm_price_adj, get_cost_of_shop_item } from '../js/shk.js';
import { ART_EXCALIBUR, init_artifacts } from '../js/artifacts.js';
import { start_timer } from '../js/timeout.js';

const DIRECTIONS = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
];

async function generatedShopPile({ excludedSecond = false } = {}) {
    await runSegment({
        // This independent seed supplies a complete running-game state; the
        // shop and stock below are synthetic so the test can force a two-item
        // square, which stock_room() never creates naturally.
        seed: 7701213,
        datetime: '20340203112233',
        nethackrc: 'OPTIONS=name:PricePile,role:Valkyrie,race:human,'
            + 'gender:female,align:lawful,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    const state = game;
    const start = { x: state.u.ux, y: state.u.uy };
    const direction = DIRECTIONS.find(({ dx, dy }) => {
        const x = start.x + dx;
        const y = start.y + dy;
        return state.level.at(x, y)
            && !m_at(x, y, state)
            && !state.level.objects[x]?.[y];
    });
    assert.ok(direction, 'startup has an empty orthogonal destination');
    const target = {
        x: start.x + direction.dx,
        y: start.y + direction.dy,
    };

    const roomno = ROOMOFFSET;
    const room = state.level.rooms[0];
    room.rtype = SHOPBASE;
    const startLocation = state.level.at(start.x, start.y);
    const targetLocation = state.level.at(target.x, target.y);
    Object.assign(startLocation, { typ: ROOM, roomno, edge: false });
    Object.assign(targetLocation, { typ: ROOM, roomno, edge: false });
    state.level.flags.has_shop = true;
    state.u.urooms.fill(0);
    state.u.urooms[0] = roomno;
    state.u.ushops.fill(0);
    state.u.ushops[0] = roomno;
    state.u.ushops0.fill(0);
    state.u.ushops_entered.fill(0);
    state.u.ushops_left.fill(0);

    const keeper = {
        isshk: true,
        mpeaceful: true,
        mx: start.x,
        my: start.y,
        mextra: {
            eshk: {
                shoproom: roomno,
                shoplevel: { ...state.u.uz },
                shk: { x: start.x, y: start.y },
                surcharge: false,
            },
        },
    };
    room.resident = keeper;

    const env = objectGenerationEnv({ state });
    const makeFloorObject = (otyp, o_id, overrides = {}) => {
        const type = state.objects[otyp];
        const object = newObject({
            otyp,
            oclass: type.oc_class,
            owt: type.oc_weight,
            quan: 1,
            o_id,
            corpsenm: NON_PM,
            dknown: false,
            ...overrides,
        });
        place_object(object, target.x, target.y, env);
        return object;
    };
    const lower = makeFloorObject(FOOD_RATION, 402, {
        no_charge: excludedSecond,
    });
    const upper = makeFloorObject(DART, 403);
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
    state.flags.pickup = false;
    state.flags.pile_limit = 5;
    state.context.run = 0;
    state.context.nopick = 0;
    state.context.move = 1;
    state.multi = 0;
    state.u.dx = direction.dx;
    state.u.dy = direction.dy;
    return { keeper, lower, start, state, target, upper };
}

function floorChain(state, x, y) {
    const result = [];
    for (let object = state.level.objects[x][y]; object;
        object = object.nexthere) {
        result.push({
            objectId: object.o_id,
            objectType: object.otyp,
            where: object.where,
            ox: object.ox,
            oy: object.oy,
            dknown: object.dknown,
            nobjId: object.nobj?.o_id ?? null,
            nexthereId: object.nexthere?.o_id ?? null,
        });
    }
    return result;
}

function priceQuoteSnapshot(state, target) {
    const types = new Set(floorChain(state, target.x, target.y)
        .map(({ objectType }) => objectType));
    return [...types].sort((left, right) => left - right).map((otyp) => {
        const type = state.objects[otyp];
        return [
            otyp,
            type.oc_buy_minseen,
            type.oc_buy_maxseen,
            type.oc_sell_minseen,
            type.oc_sell_maxseen,
        ];
    });
}

function movementSnapshot(state, target, keeper = null) {
    return {
        position: [state.u.ux, state.u.uy],
        rooms: structuredClone({
            urooms: state.u.urooms,
            ushops: state.u.ushops,
            ushops0: state.u.ushops0,
            ushops_entered: state.u.ushops_entered,
            ushops_left: state.u.ushops_left,
        }),
        floor: floorChain(state, target.x, target.y),
        objectListHeadId: state.level.objlist?.o_id ?? null,
        priceQuotes: priceQuoteSnapshot(state, target),
        shop: keeper ? structuredClone(keeper.mextra.eshk) : null,
        uachieved: structuredClone(state.u.uachieved),
        toplines: state._ttyToplines,
        grid: structuredClone(state.nhDisplay.grid),
        cursor: [
            state.nhDisplay.cursorCol,
            state.nhDisplay.cursorRow,
            state.nhDisplay.cursorVisible,
        ],
        rng: [...getRngLog()],
    };
}

function assertMovementSnapshot(state, target, before, keeper = null) {
    assert.deepEqual([state.u.ux, state.u.uy], before.position);
    assert.deepEqual({
        urooms: state.u.urooms,
        ushops: state.u.ushops,
        ushops0: state.u.ushops0,
        ushops_entered: state.u.ushops_entered,
        ushops_left: state.u.ushops_left,
    }, before.rooms);
    assert.deepEqual(floorChain(state, target.x, target.y), before.floor);
    assert.equal(state.level.objlist?.o_id ?? null, before.objectListHeadId);
    assert.deepEqual(priceQuoteSnapshot(state, target), before.priceQuotes);
    if (keeper) assert.deepEqual(keeper.mextra.eshk, before.shop);
    assert.deepEqual(state.u.uachieved, before.uachieved);
    assert.equal(state._ttyToplines, before.toplines);
    assert.deepEqual(state.nhDisplay.grid, before.grid);
    assert.deepEqual([
        state.nhDisplay.cursorCol,
        state.nhDisplay.cursorRow,
        state.nhDisplay.cursorVisible,
    ], before.cursor);
    assert.deepEqual(getRngLog(), before.rng);
}

function changeObjectType(object, otyp, state) {
    object.otyp = otyp;
    object.oclass = state.objects[otyp].oc_class;
}

test('movement snapshots own floor, object-list, and keeper values', async () => {
    const { keeper, lower, state, target, upper } = await generatedShopPile();
    const before = movementSnapshot(state, target, keeper);

    const originalNext = upper.nobj;
    upper.nobj = null;
    assert.throws(
        () => assertMovementSnapshot(state, target, before, keeper),
        { name: 'AssertionError' },
    );
    upper.nobj = originalNext;

    const originalHead = state.level.objlist;
    state.level.objlist = lower;
    assert.throws(
        () => assertMovementSnapshot(state, target, before, keeper),
        { name: 'AssertionError' },
    );
    state.level.objlist = originalHead;

    ++keeper.mextra.eshk.visitct;
    assert.throws(
        () => assertMovementSnapshot(state, target, before, keeper),
        { name: 'AssertionError' },
    );
});

test('same-shop strict-interior movement has no departure effect', async () => {
    const { start, state, target } = await generatedShopPile();
    state.u.ux0 = start.x;
    state.u.uy0 = start.y;
    state.u.ux = target.x;
    state.u.uy = target.y;
    await check_special_room(false, state);
    assert.deepEqual(state.u.ushops.slice(0, 2), [ROOMOFFSET, 0]);
    assert.deepEqual(state.u.ushops_left.slice(0, 1), [0]);
});

test('settled shop departure moves without shop bookkeeping', async () => {
    const { state, target } = await generatedShopPile();
    // A zero room number is NO_ROOM. It turns the prepared adjacent ROOM into
    // the first square outside the synthetic shop without adding terrain work.
    state.level.at(target.x, target.y).roomno = 0;
    state.level.objects[target.x][target.y] = null;

    await domove(state);

    assert.deepEqual([state.u.ux, state.u.uy], [target.x, target.y]);
    assert.deepEqual(state.u.ushops.slice(0, 1), [0]);
    assert.deepEqual(state.u.ushops_left.slice(0, 2), [ROOMOFFSET, 0]);
});

test('bill and debit shop debt each refuse departure before movement',
    async () => {
        for (const debt of ['billct', 'debit']) {
            const { keeper, state, target } = await generatedShopPile();
            keeper.mextra.eshk[debt] = 1;
            state.level.at(target.x, target.y).roomno = 0;
            state.level.objects[target.x][target.y] = null;
            const before = movementSnapshot(state, target, keeper);

            await assert.rejects(
                () => domove(state),
                /leaving a shop with debt/u,
                debt,
            );

            assertMovementSnapshot(state, target, before, keeper);
        }
    });

test('ordinary movement refuses a debtor reaching the shop edge atomically',
    async () => {
        const { keeper, state, target } = await generatedShopPile();
        state.level.objects[target.x][target.y] = null;
        state.level.at(target.x, target.y).edge = true;
        keeper.mextra.eshk.debit = 1;
        const before = movementSnapshot(state, target, keeper);

        await assert.rejects(
            () => domove(state),
            /reaching a shop boundary with debt/u,
        );

        assertMovementSnapshot(state, target, before, keeper);
    });

test('a visible region is described before the priced pile menu', async () => {
    const { lower, start, state, target, upper } = await generatedShopPile();
    const region = create_region([{
        lx: Math.min(start.x, target.x),
        ly: Math.min(start.y, target.y),
        hx: Math.max(start.x, target.x),
        hy: Math.max(start.y, target.y),
    }]);
    region.visible = true;
    region.hero_inside = true;
    state.level.regions.push(region);
    const inputScreens = [];
    const readKey = state.nhDisplay.readKey.bind(state.nhDisplay);
    state.nhDisplay.readKey = (options) => {
        inputScreens.push(state.nhDisplay.grid
            .map((row) => row.map(({ ch }) => ch).join(''))
            .join('\n'));
        return readKey(options);
    };
    // Acknowledge the region line before the menu's own input boundary.
    state.nhDisplay.pushKey(' '.charCodeAt(0));
    state.nhDisplay.pushKey(' '.charCodeAt(0));
    try {
        await domove(state);
    } finally {
        state.nhDisplay.readKey = readKey;
    }

    assert.deepEqual([state.u.ux, state.u.uy], [target.x, target.y]);
    assert.equal(state.level.objects[target.x][target.y], upper);
    assert.equal(upper.nexthere, lower);
    assert.equal(upper.where, OBJ_FLOOR);
    assert.equal(lower.where, OBJ_FLOOR);
    assert.equal(region.hero_inside, true);
    assert.match(inputScreens[0], /There is a vapor cloud here\./u);
    const menuIndex = inputScreens.findIndex(screen =>
        screen.includes('Things that are here:'));
    assert.ok(menuIndex > 0, 'the region message precedes the pile menu');
    assert.match(inputScreens[menuIndex], /darts? \(for sale,/u);
    assert.match(inputScreens[menuIndex], /food ration \(for sale,/u);
});

test('plain xname does not apply doname-only shop suffix guards', async () => {
    const { state, upper } = await generatedShopPile();
    upper.unpaid = true;
    assert.doesNotThrow(() => xnameFresh(upper, state));
    assert.equal(upper.dknown, true);
});

test('corpsenm_price_adj uses source monster intrinsics and corpse nutrition',
    async () => {
        const { state } = await generatedShopPile();
        // C monst.c gives the fire ant mlevel 3, cnutrit 10 and MR_FIRE; its
        // corpse therefore has base value 4 + 1, multiplied by 1 + FIRE_RES 2.
        const fireAntCorpse = {
            otyp: CORPSE,
            corpsenm: PM_FIRE_ANT,
        };
        assert.equal(corpsenm_price_adj(fireAntCorpse, state), 15);

        // shk.c returns zero for a non-food object and for a food object whose
        // corpsenm is NON_PM; these pin the two short-circuit conditions.
        assert.equal(corpsenm_price_adj({ otyp: DART, corpsenm: PM_FIRE_ANT }, state), 0);
        assert.equal(corpsenm_price_adj({ otyp: CORPSE, corpsenm: NON_PM }, state), 0);
    });

test('shop pricing follows source ownership and object-value branches',
    async () => {
        const cases = [
            ['coin', 'noPrice', ({ state, upper }) => {
                changeObjectType(upper, GOLD_PIECE, state);
            }],
            ['punishment object', 'noPrice',
                ({ state, upper }) => { state.uball = upper; }],
            ['contained object', 'priced', ({ upper }) => {
                upper.where = OBJ_CONTAINED;
                upper.ocontainer = newObject({
                    where: OBJ_FLOOR,
                    ox: upper.ox,
                    oy: upper.oy,
                });
            }],
            ['other current shop', 'noPrice',
                ({ state }) => { state.u.ushops[0] = ROOMOFFSET + 1; }],
            ['missing current shop', 'noPrice',
                ({ state }) => { state.u.ushops[0] = 0; }],
            ['shared square', 'noPrice', ({ state, target }) => {
                state.level.at(target.x, target.y).roomno = SHARED;
            }],
            ['shop boundary', 'noPrice', ({ state, target }) => {
                state.level.at(target.x, target.y).edge = true;
            }],
            ['keeper freespot', 'noCharge', ({ keeper, target }) => {
                keeper.mextra.eshk.shk = { x: target.x, y: target.y };
            }],
            ['no charge', 'noCharge', ({ upper }) => {
                upper.no_charge = true;
            }],
            ['unpaid floor item', 'priced', ({ upper }) => {
                upper.unpaid = true;
            }],
            ['absent keeper', 'noPrice', ({ state }) => {
                state.level.rooms[0].resident = null;
            }],
            ['displaced keeper', 'noPrice', ({ keeper }) => {
                keeper.mx = keeper.my = 0;
            }],
            ['angry keeper', 'priced', ({ keeper }) => {
                keeper.mpeaceful = false;
            }],
            ['surcharged keeper', 'priced', ({ keeper }) => {
                keeper.mextra.eshk.surcharge = true;
            }],
            ['container', 'priced', ({ state, upper }) => {
                changeObjectType(upper, SACK, state);
            }],
            ['ordinary object contents', 'priced', ({ state, upper }) => {
                upper.cobj = newObject({
                    otyp: DART,
                    oclass: state.objects[DART].oc_class,
                    quan: 1,
                    dknown: true,
                });
            }],
            ['free container contents', 'contents', ({ state, upper }) => {
                changeObjectType(upper, SACK, state);
                upper.no_charge = true;
                upper.cobj = newObject({
                    otyp: DART,
                    oclass: state.objects[DART].oc_class,
                    quan: 1,
                    dknown: true,
                });
            }],
            ['glob', 'priced', ({ upper }) => { upper.globby = true; }],
            ['artifact', 'priced', ({ state, upper }) => {
                changeObjectType(upper, LONG_SWORD, state);
                upper.oartifact = ART_EXCALIBUR;
            }],
            ['corpse adjustment', 'priced', ({ state, upper }) => {
                changeObjectType(upper, CORPSE, state);
                upper.corpsenm = PM_NEWT;
            }],
            ['tin adjustment', 'priced', ({ state, upper }) => {
                changeObjectType(upper, TIN, state);
                upper.corpsenm = PM_NEWT;
            }],
            ['egg adjustment', 'priced', ({ state, upper }) => {
                changeObjectType(upper, EGG, state);
                upper.corpsenm = PM_NEWT;
            }],
            ['unidentified glass gem', 'priced', ({ state, upper }) => {
                changeObjectType(upper, FIRST_GLASS_GEM, state);
                upper.dknown = false;
                state.objects[FIRST_GLASS_GEM].oc_name_known = 0;
            }],
            ['Dunce cap', 'priced', ({ state }) => {
                state.uarmh = { otyp: DUNCE_CAP };
            }],
            ['young Tourist', 'priced', ({ state }) => {
                state.urole = { ...state.urole, mnum: PM_TOURIST };
                state.u.ulevel = 14;
            }],
            ['visible undershirt', 'priced', ({ state }) => {
                state.uarmu = {};
            }],
            ['suppressed display flag', 'priced', ({ state }) => {
                state.iflags.suppress_price = true;
            }],
            ['restore state', 'priced', ({ state }) => {
                state.program_state.restoring = true;
            }],
            // C still calculates a unit quote before multiplying by zero;
            // this arithmetic boundary pins both values without naming it as
            // a valid in-game object state.
            ['zero quantity', 'zeroPrice', ({ upper }) => {
                upper.quan = 0;
            }],
            ['lit candle', 'priced', ({ state, upper }) => {
                changeObjectType(upper, WAX_CANDLE, state);
                upper.lamplit = true;
                // age 1 is below the C full-burn threshold of 20 * oc_cost.
                upper.age = 1;
            }],
        ];

        const noPriceCases = new Set([
            'coin', 'punishment object', 'other current shop',
            'missing current shop', 'shared square', 'shop boundary',
            'absent keeper', 'displaced keeper',
        ]);
        for (const [name, kind, prepare] of cases) {
            const fixture = await generatedShopPile();
            prepare(fixture);
            const quote = get_cost_of_shop_item(
                fixture.upper,
                fixture.state,
                { observed: true },
            );
            if (noPriceCases.has(name)) {
                assert.deepEqual(
                    [quote.applicable, quote.cost, quote.noCharge],
                    [false, 0, false],
                    name,
                );
            } else if (kind === 'noCharge') {
                assert.deepEqual(
                    [quote.applicable, quote.cost, quote.noCharge],
                    [true, 0, true],
                    name,
                );
            } else if (kind === 'contents') {
                assert.equal(quote.applicable, true, name);
                assert.equal(quote.noCharge, true, name);
                assert.ok(quote.contentsCost > 0, name);
                assert.equal(quote.cost, quote.contentsCost, name);
            } else if (kind === 'zeroPrice') {
                assert.deepEqual(
                    [quote.applicable, quote.cost, quote.noCharge,
                        quote.objectCost],
                    [true, 0, false, 0],
                    name,
                );
                assert.ok(quote.pricingUnitCost > 0, name);
            } else {
                assert.equal(quote.applicable, true, name);
                assert.equal(quote.noCharge, false, name);
                assert.ok(quote.cost > 0, name);
            }
            assert.equal(fixture.upper.dknown, false, name);
        }
    });

test('contained floor merchandise keeps its live shop price', async () => {
    const { state, upper } = await generatedShopPile();
    const contained = newObject({
        otyp: DART,
        oclass: state.objects[DART].oc_class,
        quan: 1,
        dknown: true,
        where: OBJ_CONTAINED,
        ocontainer: upper,
    });
    upper.cobj = contained;

    const name = doname_with_price(contained, state, {
        currencyName: () => 'zorkmids',
    });
    assert.match(name, /dart \(for sale, \d+ zorkmids\)/u);
});

test('priced preflight projects observation and accepts hallucination resistance',
    async () => {
        for (const resistanceSource of ['intrinsic', 'extrinsic']) {
            const { state, upper } = await generatedShopPile();
            state.u.uprops[HALLUC].intrinsic = 1;
            state.u.uprops[HALLUC_RES][resistanceSource] = 1;
            assert.doesNotThrow(
                () => assertPricedObjectNameable(upper, state),
                resistanceSource,
            );
        }

        const { state, upper } = await generatedShopPile();
        // An id divisible by four would surcharge an unobserved known dart.
        // doname_base() observes it before pricing, so admission projects the
        // dknown write and computes the Charisma-8 price of 3, not 4.
        upper.o_id = 404;
        assert.equal(
            assertPricedObjectNameable(upper, state).pricingUnitCost,
            3,
        );
        assert.equal(
            get_cost_of_shop_item(upper, state, { observed: false })
                .pricingUnitCost,
            4,
        );
    });

test('positive shop prices take precedence over remembered-price display',
    async () => {
        const { state, target } = await generatedShopPile();
        state.iflags.pricequotes = true;
        // A potion type starts unidentified. with_price produces the live
        // for-sale suffix and does not enter append_price_quote().
        const potion = state.level.objects[target.x][target.y].nexthere;
        changeObjectType(potion, POT_HEALING, state);
        state.objects[potion.otyp].oc_name_known = 0;
        const inputScreens = [];
        const readKey = state.nhDisplay.readKey.bind(state.nhDisplay);
        state.nhDisplay.readKey = (options) => {
            inputScreens.push(state.nhDisplay.grid
                .map((row) => row.map(({ ch }) => ch).join(''))
                .join('\n'));
            return readKey(options);
        };
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        try {
            await domove(state);
        } finally {
            state.nhDisplay.readKey = readKey;
        }
        assert.deepEqual([state.u.ux, state.u.uy], [target.x, target.y]);
        assert.equal(potion.dknown, true);
        assert.equal(
            state.objects[potion.otyp].oc_buy_minseen
                <= state.objects[potion.otyp].oc_buy_maxseen,
            true,
        );
        const menu = inputScreens.join('\n');
        assert.match(menu, /potion \(for sale, \d+ zorkmids?\)/u);
        assert.doesNotMatch(menu, /potion \{buy /u);
    });

test('movement displays the non-shop remembered-price fallback',
    async () => {
        const { state, target, upper } = await generatedShopPile();
        state.level.flags.has_shop = false;
        state.iflags.pricequotes = true;
        state.objects[upper.otyp].oc_name_known = 0;
        state.objects[upper.otyp].oc_buy_minseen = 10;
        state.objects[upper.otyp].oc_buy_maxseen = 20;
        assert.doesNotThrow(
            () => requireSimpleHeroDestination(target.x, target.y, state),
        );
        assert.equal(upper.dknown, false);
    });

test('doname_with_price prices an artifact without exposing its name',
    async () => {
        const { state, upper } = await generatedShopPile();
        // runSegment builds the game but does not initialize its artifact
        // catalog; C's normal new-game route does, so establish that catalog
        // before assigning the source artifact ID below.
        init_artifacts(state);
        // This fixture represents an already-created Excalibur, so C's
        // artiexist slot must carry the same exists bit as artifact creation.
        state.artiexist[ART_EXCALIBUR].exists = 1;
        changeObjectType(upper, LONG_SWORD, state);
        upper.oartifact = ART_EXCALIBUR;
        // Match xname()'s observation in the pure price probe; the formatter
        // then performs that source-ordered write before using the same price.
        const quote = get_cost_of_shop_item(
            upper, state, { observed: true },
        );
        const name = doname_with_price(upper, state, {
            currencyName: (amount) => amount === 1 ? 'zorkmid' : 'zorkmids',
        });
        assert.ok(quote.cost > 0);
        // C prices the artifact bonus but xname() keeps the unidentified
        // instance's ordinary object name.
        assert.match(name, new RegExp(
            `a long sword \\(for sale, ${quote.cost} zorkmids?\\)$`, 'u',
        ));
    });

test('movement displays and records every eligible generated-shop pile price',
    async () => {
        const { lower, start, state, target, upper } = await generatedShopPile();
        upper.quan = 3;
        upper.owt *= upper.quan;
        const inputScreens = [];
        const readKey = state.nhDisplay.readKey.bind(state.nhDisplay);
        state.nhDisplay.readKey = (options) => {
            inputScreens.push(state.nhDisplay.grid
                .map((row) => row.map(({ ch }) => ch).join(''))
                .join('\n'));
            return readKey(options);
        };
        // dmore() consumes one Space after all priced rows have been written.
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        try {
            await domove(state);
        } finally {
            state.nhDisplay.readKey = readKey;
        }

        assert.deepEqual([state.u.ux, state.u.uy], [target.x, target.y]);
        assert.equal(state.level.objects[target.x][target.y], upper);
        assert.equal(upper.nexthere, lower);
        assert.equal(upper.where, OBJ_FLOOR);
        assert.equal(lower.where, OBJ_FLOOR);
        assert.equal(upper.dknown, true);
        assert.equal(lower.dknown, true);
        for (const object of [upper, lower]) {
            const type = state.objects[object.otyp];
            assert.equal(type.oc_buy_minseen, type.oc_buy_maxseen);
            assert.ok(type.oc_buy_minseen > 0);
        }
        assert.equal(state.objects[upper.otyp].oc_buy_minseen, 3);
        const menu = inputScreens.join('\n');
        const upperRow = '3 darts (for sale, 9 zorkmids)';
        const lowerRow = 'a food ration (for sale, 60 zorkmids)';
        assert.ok(menu.includes(upperRow));
        assert.ok(menu.includes(lowerRow));
        assert.ok(menu.indexOf(upperRow) < menu.indexOf(lowerRow));
        assert.notDeepEqual([state.u.ux, state.u.uy], [start.x, start.y]);
    });

test('a no-charge second pile member follows the live price result',
    async () => {
        const { lower, start, state, target, upper }
            = await generatedShopPile({ excludedSecond: true });
        // The C no-charge arm still names the pile and waits for its normal
        // menu choice; it is not an object-specific pricing refusal.
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        await domove(state);

        assert.deepEqual([state.u.ux, state.u.uy], [target.x, target.y]);
        assert.notDeepEqual([state.u.ux, state.u.uy], [start.x, start.y]);
        assert.equal(upper.dknown, true);
        assert.equal(lower.dknown, true);
    });

test('movement prices a lit candle through the shared name formatter',
    async () => {
        const { state, target, upper } = await generatedShopPile();
        changeObjectType(upper, WAX_CANDLE, state);
        // A tallow candle burns for 200 turns; age 149 plus a 50-turn timer
        // means 199 remain in C's formula, so the visible row says used.
        upper.age = 149;
        upper.lamplit = true;
        start_timer(50, TIMER_OBJECT, BURN_OBJECT, upper, state);
        const screens = [];
        const readKey = state.nhDisplay.readKey.bind(state.nhDisplay);
        state.nhDisplay.readKey = (options) => {
            screens.push(state.nhDisplay.grid
                .map((row) => row.map(({ ch }) => ch).join(''))
                .join('\n'));
            return readKey(options);
        };
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        try {
            await domove(state);
        } finally {
            state.nhDisplay.readKey = readKey;
        }
        assert.deepEqual([state.u.ux, state.u.uy], [target.x, target.y]);
        assert.equal(upper.dknown, true);
        assert.match(screens.join('\n'),
            /partly used candle \(lit\) \(for sale, \d+ zorkmids?\)/u);
    });

test('the costly pile-limit count moves without naming or recording prices',
    async () => {
        const { lower, state, target, upper } = await generatedShopPile({
            // The exclusion proves this path does not run price preflight.
            excludedSecond: true,
        });
        // Equality at two selects invent.c look_here()'s count-only arm.
        state.flags.pile_limit = 2;
        const quotes = [upper, lower].map((object) => {
            const type = state.objects[object.otyp];
            return [type.oc_buy_minseen, type.oc_buy_maxseen];
        });

        await domove(state);

        assert.deepEqual([state.u.ux, state.u.uy], [target.x, target.y]);
        assert.match(state._ttyToplines, /There are two objects here\./u);
        assert.deepEqual([upper, lower].map((object) => {
            const type = state.objects[object.otyp];
            return [type.oc_buy_minseen, type.oc_buy_maxseen];
        }), quotes);
    });
