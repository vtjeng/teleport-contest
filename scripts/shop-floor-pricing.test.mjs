import assert from 'node:assert/strict';
import test from 'node:test';

import {
    domove,
    requireSimpleHeroDestination,
    UnsupportedHeroMoveBoundaryError,
} from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { newObject, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    assertPricedObjectNameable,
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
    POT_HEALING,
    SACK,
    TIN,
} from '../js/objects.js';
import {
    HALLUC,
    HALLUC_RES,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    NON_PM,
    ROOM,
    ROOMOFFSET,
    SHARED,
    SHOPBASE,
} from '../js/const.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { PM_TOURIST } from '../js/monsters.js';
import { getRngLog } from '../js/rng.js';
import { create_region } from '../js/region.js';
import { check_special_room } from '../js/rooms.js';
import { get_cost_of_shop_item } from '../js/shk.js';

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

test('ordinary movement refuses entry onto a shop edge atomically',
    async () => {
        const { keeper, start, state, target } = await generatedShopPile();
        state.level.objects[target.x][target.y] = null;
        Object.assign(state.level.at(start.x, start.y), {
            roomno: 0,
            edge: false,
        });
        state.level.at(target.x, target.y).edge = true;
        for (const rooms of [
            state.u.urooms,
            state.u.ushops,
            state.u.ushops0,
            state.u.ushops_entered,
            state.u.ushops_left,
        ]) rooms.fill(0);
        state.u.uachieved[0] = 99;
        const before = movementSnapshot(state, target, keeper);

        await assert.rejects(
            () => domove(state),
            /outside the shop interior/u,
        );

        assertMovementSnapshot(state, target, before, keeper);
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

test('a visible-region pile menu refuses before movement', async () => {
    const { keeper, start, state, target } = await generatedShopPile();
    const region = create_region([{
        lx: Math.min(start.x, target.x),
        ly: Math.min(start.y, target.y),
        hx: Math.max(start.x, target.x),
        hy: Math.max(start.y, target.y),
    }]);
    region.visible = true;
    region.hero_inside = true;
    state.level.regions.push(region);
    const before = movementSnapshot(state, target, keeper);

    await assert.rejects(
        () => domove(state),
        /visible region over object-pile menu/u,
    );

    assertMovementSnapshot(state, target, before, keeper);
});

test('plain xname does not apply doname-only shop suffix guards', async () => {
    const { state, upper } = await generatedShopPile();
    upper.unpaid = true;
    assert.doesNotThrow(() => xnameFresh(upper, state));
    assert.equal(upper.dknown, true);
});

test('priced preflight refuses every excluded branch before naming',
    async () => {
        const cases = [
            ['coin', /coin pricing/u, ({ state, upper }) => {
                changeObjectType(upper, GOLD_PIECE, state);
            }],
            ['punishment object', /punishment-object/u,
                ({ state, upper }) => { state.uball = upper; }],
            ['contained object', /non-floor/u,
                ({ upper }) => { upper.where = OBJ_CONTAINED; }],
            ['other current shop', /other or shared/u,
                ({ state }) => { state.u.ushops[0] = ROOMOFFSET + 1; }],
            ['missing current shop', /other or shared/u,
                ({ state }) => { state.u.ushops[0] = 0; }],
            ['shared square', /other or shared/u,
                ({ state, target }) => {
                    state.level.at(target.x, target.y).roomno = SHARED;
                }],
            ['shop boundary', /shop boundary/u,
                ({ state, target }) => {
                    state.level.at(target.x, target.y).edge = true;
                }],
            ['keeper freespot', /freespot/u,
                ({ keeper, target }) => {
                    keeper.mextra.eshk.shk = { x: target.x, y: target.y };
                }],
            ['no charge', /unpaid or no-charge/u,
                ({ upper }) => { upper.no_charge = true; }],
            ['unpaid', /unpaid or no-charge/u,
                ({ upper }) => { upper.unpaid = true; }],
            ['absent keeper', /absent or displaced/u,
                ({ state }) => { state.level.rooms[0].resident = null; }],
            ['displaced keeper', /absent or displaced/u,
                ({ keeper }) => { keeper.mx = keeper.my = 0; }],
            ['angry keeper', /angry/u,
                ({ keeper }) => { keeper.mpeaceful = false; }],
            ['surcharged keeper', /surcharge/u,
                ({ keeper }) => { keeper.mextra.eshk.surcharge = true; }],
            ['container', /container pricing/u, ({ state, upper }) => {
                changeObjectType(upper, SACK, state);
            }],
            ['ordinary object contents', /container pricing/u,
                ({ upper }) => { upper.cobj = newObject({ quan: 1 }); }],
            ['glob', /globby/u, ({ upper }) => { upper.globby = true; }],
            ['artifact', /artifact pricing/u,
                ({ upper }) => { upper.oartifact = 1; }],
            ['corpse adjustment', /corpse, tin, or egg/u,
                ({ state, upper }) => changeObjectType(upper, CORPSE, state)],
            ['tin adjustment', /corpse, tin, or egg/u,
                ({ state, upper }) => changeObjectType(upper, TIN, state)],
            ['egg adjustment', /corpse, tin, or egg/u,
                ({ state, upper }) => changeObjectType(upper, EGG, state)],
            ['unidentified glass gem', /glass-gem/u,
                ({ state, upper }) => {
                    changeObjectType(upper, FIRST_GLASS_GEM, state);
                    upper.dknown = false;
                    state.objects[FIRST_GLASS_GEM].oc_name_known = 0;
                }],
            ['Dunce cap', /Dunce cap/u,
                ({ state }) => { state.uarmh = { otyp: DUNCE_CAP }; }],
            ['young Tourist', /tourist pricing/u, ({ state }) => {
                state.urole = { ...state.urole, mnum: PM_TOURIST };
                state.u.ulevel = 14;
            }],
            ['visible undershirt', /tourist pricing/u,
                ({ state }) => { state.uarmu = {}; }],
            ['suppressed price', /suppressed or restoring/u,
                ({ state }) => { state.iflags.suppress_price = true; }],
            ['restore price', /suppressed or restoring/u,
                ({ state }) => { state.program_state.restoring = true; }],
            ['zero quantity', /invalid pricing quantity/u,
                ({ upper }) => { upper.quan = 0; }],
            ['hallucinated currency', /hallucinated currency/u,
                ({ state }) => {
                    state.u.uprops[HALLUC].intrinsic = 1;
                    state.u.uprops[HALLUC_RES].intrinsic = 0;
                    state.u.uprops[HALLUC_RES].extrinsic = 0;
                }],
            ['unsupported base name', /user-assigned type name/u,
                ({ state, upper }) => {
                    state.objects[upper.otyp].oc_uname = 'needle';
                }],
        ];

        for (const [name, expected, prepare] of cases) {
            const fixture = await generatedShopPile();
            prepare(fixture);
            const namingOwner = name === 'hallucinated currency'
                || name === 'unsupported base name';
            assert.throws(
                () => namingOwner
                    ? assertPricedObjectNameable(
                        fixture.upper,
                        fixture.state,
                    )
                    : get_cost_of_shop_item(
                        fixture.upper,
                        fixture.state,
                        { observed: true },
                    ),
                expected,
                name,
            );
            assert.equal(fixture.upper.dknown, false, name);
        }
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

test('an excluded second pile member refuses before any durable mutation',
    async () => {
        const { keeper, lower, start, state, target, upper }
            = await generatedShopPile({ excludedSecond: true });
        const before = movementSnapshot(state, target, keeper);

        await assert.rejects(
            () => domove(state),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && /unpaid or no-charge floor object/u.test(error.message),
        );
        assertMovementSnapshot(state, target, before, keeper);
        assert.equal(upper.dknown, false);
        assert.equal(lower.dknown, false);
        assert.deepEqual([state.u.ux, state.u.uy], [start.x, start.y]);
    });

test('movement translates an object-name exclusion at its public boundary',
    async () => {
        const { keeper, state, target, upper } = await generatedShopPile();
        state.objects[upper.otyp].oc_uname = 'needle';
        const before = movementSnapshot(state, target, keeper);

        await assert.rejects(
            () => domove(state),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && /user-assigned type name/u.test(error.message),
        );
        assertMovementSnapshot(state, target, before, keeper);
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
