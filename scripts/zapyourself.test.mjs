import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';

import {
    bhito,
    cancel_monst,
    stone_to_flesh_obj,
    zapyourself,
} from '../js/zap.js';
import {
    GEM_CLASS,
    ROCK,
    MEATBALL,
    SPE_DIG,
    SPE_DRAIN_LIFE,
    SPE_STONE_TO_FLESH,
    STATUE,
    WAN_DIGGING,
    WAN_NOTHING,
    WAN_MAKE_INVISIBLE,
    WAN_OPENING,
    WAN_SLOW_MONSTER,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    SPBOOK_CLASS,
    SPE_DETECT_UNSEEN,
} from '../js/objects.js';
import {
    ANIMATE_NORMAL, ANIMATE_SHATTER, ANIMATE_SPELL, FAST, FROMFORM,
    CORPSTAT_HISTORIC, INVIS, OBJ_DELETED, OBJ_INVENT, W_WEP,
    W_BALL, W_CHAIN,
} from '../js/const.js';
import { PM_NEWT } from '../js/monsters.js';
import { animate_statue } from '../js/trap.js';
import { game } from '../js/gstate.js';
import { mksobj } from '../js/obj.js';
import { monsterObject } from '../js/monster_object.js';
import {
    d, rn1, rn2, rnd, rne, rnl, rnz, initRng, enableRngLog, getRngLog,
} from '../js/rng.js';
import { runSegment } from '../js/jsmain.js';
import { NethackGame } from '../js/jsmain.js';
import { GameDisplay } from '../js/game_display.js';
import { do_mkroom } from '../js/mkroom.js';
import { fill_special_room } from '../js/mklev.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { mksobj_at, set_corpsenm } from '../js/obj.js';
import { FIGURINE, MINERAL } from '../js/objects.js';
import { PM_FLESH_GOLEM } from '../js/monsters.js';
import { costly_spot, get_cost, inside_shop } from '../js/shk.js';
import { teleds } from '../js/teleport.js';
import { m_at } from '../js/monst.js';
import {
    OBJ_FLOOR, SHOPBASE, TELEDS_TELEPORT, TOPLINE_NEED_MORE,
} from '../js/const.js';
import { dead_species, is_golem } from '../js/mondata.js';
import { vegetarian } from '../js/eat.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/zap.c', 'utf8');
const C_TRAP_SOURCE = readFileSync('nethack-c/upstream/src/trap.c', 'utf8');
const JS_SOURCE = readFileSync('js/zap.js', 'utf8');
const JS_TRAP_SOURCE = readFileSync('js/trap.js', 'utf8');
const C_START = C_SOURCE.indexOf('zapyourself(struct obj *obj');
const C_END = C_SOURCE.indexOf('\n}\n\n/* called when poly', C_START) + 2;
const C_FUNCTION = C_SOURCE.slice(C_START, C_END);
const JS_START = JS_SOURCE.indexOf('export async function zapyourself(');
const JS_END = JS_SOURCE.indexOf('\n}\n\n// C ref: zap.c exclam', JS_START) + 2;
const JS_FUNCTION = JS_SOURCE.slice(JS_START, JS_END);
const C_PROBE_START = C_SOURCE.indexOf('probe_monster(struct monst *mtmp)');
const C_PROBE_END = C_SOURCE.indexOf('\n}\n', C_PROBE_START) + 2;
const C_PROBE = C_SOURCE.slice(C_PROBE_START, C_PROBE_END);
const JS_PROBE_START = JS_SOURCE.indexOf('export async function probe_monster(');
const JS_PROBE_END = JS_SOURCE.indexOf('\n}\n', JS_PROBE_START) + 2;
const JS_PROBE = JS_SOURCE.slice(JS_PROBE_START, JS_PROBE_END);

const SOURCE_CASES = [
    'WAN_STRIKING', 'SPE_FORCE_BOLT', 'WAN_LIGHTNING', 'SPE_FIREBALL',
    'WAN_FIRE', 'FIRE_HORN', 'WAN_COLD', 'SPE_CONE_OF_COLD', 'FROST_HORN',
    'WAN_MAGIC_MISSILE', 'SPE_MAGIC_MISSILE', 'WAN_POLYMORPH',
    'SPE_POLYMORPH', 'WAN_CANCELLATION', 'SPE_CANCELLATION',
    'SPE_DRAIN_LIFE', 'WAN_MAKE_INVISIBLE', 'WAN_SPEED_MONSTER',
    'WAN_SLEEP', 'SPE_SLEEP', 'WAN_SLOW_MONSTER', 'SPE_SLOW_MONSTER',
    'WAN_TELEPORTATION', 'SPE_TELEPORT_AWAY', 'WAN_DEATH',
    'SPE_FINGER_OF_DEATH', 'WAN_UNDEAD_TURNING', 'SPE_TURN_UNDEAD',
    'SPE_HEALING', 'SPE_EXTRA_HEALING', 'WAN_LIGHT', 'EXPENSIVE_CAMERA',
    'WAN_OPENING', 'SPE_KNOCK', 'WAN_LOCKING', 'SPE_WIZARD_LOCK',
    'WAN_DIGGING', 'SPE_DIG', 'SPE_DETECT_UNSEEN', 'WAN_NOTHING',
    'WAN_PROBING', 'SPE_STONE_TO_FLESH',
];

test('zapyourself keeps the complete C switch inventory and source order', () => {
    assert.match(C_FUNCTION, /zapyourself\(struct obj \*obj, boolean ordinary\)/u);
    assert.ok(C_FUNCTION.length > 7000, 'the selected C function is whole');
    for (const name of SOURCE_CASES) {
        assert.match(C_FUNCTION, new RegExp(`case ${name}:`, 'u'), name);
        assert.match(JS_FUNCTION, new RegExp(`case ${name}:`, 'u'), name);
    }
    assert.ok(
        JS_FUNCTION.indexOf('if (learn_it) learnwand(obj, state);')
            > JS_FUNCTION.indexOf('switch (obj.otyp)'),
        'discovery follows the selected effect arm',
    );
});

test('probe_monster reports a long-worm segment before skipping its inventory', () => {
    // zap.c:626-631 always calls mstatusline before checking gn.notonhead.
    // The long-worm branch now follows that source order and no longer refuses
    // the caller before the selected insight.c status function can run.
    assert.match(C_PROBE, /mstatusline\(mtmp\);\s*if \(gn\.notonhead\)\s*return;/u);
    assert.match(
        JS_PROBE,
        /await mstatusline\(monster, state\);\s*if \(state\.gn\?\.notonhead\) return;/u,
    );
    assert.doesNotMatch(JS_PROBE, /note_unported\(['"]insight\.c mstatusline long-worm segment count/u);
});

test('zapyourself no-op source arms complete without consuming RNG', async () => {
    // zap.c:2993-3000. These source arms intentionally leave damage and
    // discovery unchanged; calling the whole port with a minimal state pins
    // that no-effect contract without involving command prompts.
    for (const otyp of [
        WAN_DIGGING, SPE_DIG, SPE_DETECT_UNSEEN, WAN_NOTHING,
    ]) {
        assert.equal(await zapyourself({ otyp }, false, {}), 0, otyp);
    }
});

test('zapyourself routes source physical exercise through encumber_msg', () => {
    // zap.c:2723 and :2737 call exercise() after self-directed physical damage.
    // The async port must supply attrib.c:exercise()'s trailing operation,
    // which C invokes once moves have begun for Strength and Constitution.
    assert.match(C_FUNCTION, /exercise\(A_STR, FALSE\);/u);
    assert.match(C_FUNCTION, /exercise\(A_CON, FALSE\);/u);
    assert.match(
        JS_FUNCTION,
        /await exercise\(A_STR, false, state, random, \{\s*encumberMessage: encumber_msg,/u,
    );
    assert.match(
        JS_FUNCTION,
        /await exercise\(A_CON, false, state, random, \{\s*encumberMessage: encumber_msg,/u,
    );
});

test('self-directed drain life executes the canonical level loss', async () => {
    // zap.c:2817-2823 calls losexp and adds no direct hit-point damage.
    // An initialized hero pins the production call, message and XP tail.
    const recipe = JSON.parse(readFileSync(
        'recipes/exper.c/levelchange-loss-variation-b25.session.json', 'utf8',
    )).segments[0];
    await runSegment({ ...recipe, moves: '.' });
    game.u.ulevel = 2;
    game.u.uexp = 20;
    const before = getRngLog().length;
    assert.equal(await zapyourself({ otyp: SPE_DRAIN_LIFE }, true, game), 0);
    assert.equal(game.u.ulevel, 1);
    assert.equal(game.u.uexp, 19);
    assert.match(game.nhDisplay.topMessage, /Goodbye level 2\./u);
    assert.equal(getRngLog().length, before);
});

test('source arm inventory stays explicit when a constant is renamed', () => {
    // Keep the list above tied to the object table: a missing import should be
    // caught here instead of silently turning one C case into undefined JS.
    for (const name of SOURCE_CASES)
        assert.match(JS_FUNCTION, new RegExp(`case ${name}:`, 'u'));
    assert.match(JS_FUNCTION, /await polyself\(POLY_NOFLAGS, state\)/u);
    assert.doesNotMatch(JS_FUNCTION, /note_unported\(['"]polyself\.c polyself/u);
});

test('self-zap source guards use blocked invisibility and pre-call trap state', () => {
    // zap.c:2840-2848 and :2902-2928.  The BInvis field is a blocker, and
    // C's short-circuit reads u.utrap before open/closeholdingtrap mutates it.
    assert.match(JS_SOURCE, /!property\.blocked/u);
    assert.match(JS_SOURCE, /property\.blocked && state\.uarmc/u);
    assert.match(JS_SOURCE, /const wasTrapped = Boolean\(state\.u\.utrap\)/gu);
    assert.match(JS_SOURCE, /if \(!wasTrapped \|\| !holding\.result\)/u);
    assert.match(JS_SOURCE, /if \(wasTrapped \|\| !closing\.result\)/u);
    assert.match(JS_SOURCE, /if \(isContainer\(item\) \|\| item\.otyp === STATUE\)/u);
});

test('self cancellation compares the current form before rehumanizing', async () => {
    // zap.c:3150-3212.  A normal human has equal umonnum/umonster even when
    // its catalog index is in the ordinary monster range; the C Upolyd macro
    // therefore leaves it unchanged.  This distinguishes the source macro
    // from a numeric LOW_PM test.
    const youmonst = { data: { ac: 8 } };
    const state = {
        u: { umonnum: 4, umonster: 4, mh: 10, uprops: {}, uac: 10 },
        disp: { botl: false },
        youmonst,
    };
    assert.equal(
        await cancel_monst(youmonst, { oclass: GEM_CLASS }, true, true, true, state),
        true,
    );
    assert.equal(state.u.umonnum, 4);
    assert.equal(state.u.umonster, 4);
    assert.equal(state.u.uac, 8);
    assert.equal(state.disp.botl, true);
});

test('extrinsic invisibility suppresses self-zap discovery and feedback', async () => {
    // youprop.h Invis includes EInvis. zapyourself still adds the timeout,
    // but its !Invis guard prevents the message, redraw and discovery.
    const property = { intrinsic: 0, extrinsic: 1, blocked: 0 };
    const state = { u: { uprops: { [INVIS]: property } } };
    initRng(901217);
    enableRngLog();
    assert.equal(await zapyourself({ otyp: WAN_MAKE_INVISIBLE }, true, state), 0);
    assert.ok(property.intrinsic >= 31 && property.intrinsic <= 45);
    assert.equal(property.extrinsic, 1);
    assert.equal(state._pending_message, undefined);
    assert.equal(getRngLog().length, 1);
    assert.match(getRngLog()[0], /^rn2\(15\)=\d+$/u);
    assert.equal(property.intrinsic, Number(getRngLog()[0].split('=')[1]) + 31);
});

test('self slowing excludes speed supplied only by the monster form', async () => {
    // zap.c tests HFast & (TIMEOUT | INTRINSIC); FROMFORM is outside that
    // mask. Calling u_slow_down would clear it and print an extra message.
    const fast = { intrinsic: FROMFORM, extrinsic: 0 };
    const state = { u: { uprops: { [FAST]: fast } } };
    assert.equal(await zapyourself({
        otyp: WAN_SLOW_MONSTER, oclass: SPBOOK_CLASS,
    }, true, state), 0);
    assert.equal(fast.intrinsic, FROMFORM);
    assert.equal(state._pending_message, undefined);
});

test('self opening reads the canonical punishment ball', async () => {
    await runSegment({
        seed: 901218,
        datetime: '20320405060708',
        nethackrc: 'OPTIONS=name:Opening,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
        moves: '.',
    }, {});
    const wand = mksobj(WAN_OPENING, false, false, { state: game });
    const ball = mksobj(HEAVY_IRON_BALL, false, false, { state: game });
    const chain = mksobj(IRON_CHAIN, false, false, { state: game });
    ball.owornmask = W_BALL;
    chain.owornmask = W_CHAIN;
    game.uball = ball;
    game.uchain = chain;
    assert.equal(game.u.uball, undefined);
    game.unported = new Set();
    await zapyourself(wand, true, game);
    assert.equal(game.uball, null);
    assert.equal(game.uchain, null);
    assert.equal(ball.owornmask, 0);
    assert.equal(chain.owornmask, 0);
    assert.equal(chain.where, OBJ_DELETED);
    assert.equal(game.unported.has('read.c unpunish'), false);
    assert.equal(game.objects[WAN_OPENING].oc_name_known, 1);
});

test('stone-to-flesh figurines use the admitted runtime creation shape', () => {
    // zap.c:2030-2042 calls makemon() directly for a figurine with exactly
    // NO_MINVENT|MM_NOMSG. The marker is a source-caller fact, not a test
    // fallback, so the async runtime owner can validate that shape.
    assert.match(JS_SOURCE, /_stoneFleshFigurine: true/u);
    const makemonSource = readFileSync('js/makemon_create.js', 'utf8');
    assert.match(makemonSource, /figurineAnimationCall/u);
    assert.match(makemonSource, /normalized\._stoneFleshFigurine/u);
});

test('stone-to-flesh keeps the source callback and statue dependency order', () => {
    const stoneStart = C_SOURCE.indexOf('stone_to_flesh_obj(struct obj *obj)');
    const stoneEnd = C_SOURCE.indexOf('\n}\n\n/*', stoneStart) + 2;
    const cStone = C_SOURCE.slice(stoneStart, stoneEnd);
    const jsStoneStart = JS_SOURCE.indexOf(
        'export async function stone_to_flesh_obj(',
    );
    const jsStoneEnd = JS_SOURCE.indexOf(
        '\n}\n\n// C ref: zap.c bhito()', jsStoneStart,
    ) + 2;
    const jsStone = JS_SOURCE.slice(jsStoneStart, jsStoneEnd);
    assert.ok(cStone.length > 3000, 'selected C callback is whole');
    assert.match(cStone, /animate_statue\([\s\S]*ANIMATE_SPELL/u);
    assert.match(jsStone, /animate_statue\([\s\S]*ANIMATE_SPELL/u);
    assert.match(jsStone, /obj_resists\([\s\S]*switch \(type\.oc_class\)/u);
    assert.match(jsStone, /poly_obj\([\s\S]*MEATBALL/u);
    assert.match(
        JS_SOURCE,
        /case SPE_STONE_TO_FLESH:\s*res = await stone_to_flesh_obj\(obj, state, random, rawEnv\);\s*break;/u,
        'bhito stores the stone-to-flesh callback result before its common tail',
    );
    assert.equal(typeof animate_statue, 'function');

    const cAnimateStart = C_TRAP_SOURCE.indexOf('\nanimate_statue(');
    const cAnimateEnd = C_TRAP_SOURCE.indexOf(
        '\n}\n\n/*\n * You\'ve either stepped',
        cAnimateStart,
    ) + 2;
    const jsAnimateStart = JS_TRAP_SOURCE.indexOf(
        'export async function animate_statue(',
    );
    const jsAnimateEnd = JS_TRAP_SOURCE.indexOf(
        '\n}\n\n// -----------------------------------------------------------------------',
        jsAnimateStart,
    ) + 2;
    assert.ok(cAnimateStart >= 0 && cAnimateEnd > cAnimateStart);
    assert.ok(cAnimateEnd - cAnimateStart > 5000);
    assert.ok(jsAnimateStart >= 0 && jsAnimateEnd > jsAnimateStart);
    assert.match(JS_TRAP_SOURCE.slice(jsAnimateStart, jsAnimateEnd), /montraits|makemon_runtime/u);
});

test('stone-to-flesh ignores non-mineral objects without touching state', async () => {
    const state = { objects: [{ oc_material: 0, oc_class: GEM_CLASS }] };
    const object = { otyp: 0 };
    assert.equal(await stone_to_flesh_obj(object, state, {
        rn2: () => assert.fail('non-mineral object consumed RNG'),
        rnd: () => assert.fail('non-mineral object consumed RNG'),
    }), 0);
});

test('bhito uses the Stone to Flesh return on an inventory object', async () => {
    // zap.c bhito() admits this spell before the floor-only polymorph guard;
    // a real inventory object therefore follows the same callback used by
    // zapyourself's inventory walk.
    await runSegment({
        seed: 8210069,
        datetime: '20310204050607',
        nethackrc: 'OPTIONS=name:StoneCallback,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\nOPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug\n',
        moves: '.',
    }, {});
    const object = mksobj(ROCK, true, false, { state: game });
    object.where = OBJ_INVENT;
    object.nobj = game.invent;
    game.invent = object;
    const random = { d, rn1, rn2, rnd, rne, rnl, rnz };
    const affected = await bhito(
        object,
        { otyp: SPE_STONE_TO_FLESH },
        game,
        random,
        { state: game, random, norepMessage: async () => {} },
    );
    assert.equal(affected, 1);
    assert.equal(game.invent.otyp, MEATBALL);
});

test('Stone to Flesh animates a statue through the canonical runtime owner', async () => {
    await runSegment({
        seed: 8210071,
        datetime: '20310204050607',
        nethackrc: 'OPTIONS=name:StatueCallback,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\nOPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug\n',
        moves: '.',
    }, {});
    const statue = mksobj(STATUE, true, false, {
        state: game,
        hooks: { monsterObject },
    });
    const messages = [];
    const random = { d, rn1, rn2, rnd, rne, rnl, rnz };
    const monster = await animate_statue(
        statue,
        game.u.ux,
        game.u.uy,
        ANIMATE_SPELL,
        {
            state: game,
            random,
            message: async (line) => messages.push(line),
        },
    );
    assert.ok(monster);
    assert.equal(statue.where, OBJ_DELETED);
    assert.match(messages.join(' '), /comes to life|moves|turns into flesh/u);
});

test('stone-to-flesh charges a successful floor figurine before deletion', async () => {
    const projectionDir = mkdtempSync(join(tmpdir(), 'stone-flesh-floor-figurine-billing-'));
    process.stderr.write(`figurine billing projection directory: ${projectionDir}\n`);
    const fixedInput = {
        seed: 2026101801,
        datetime: '20261018120000',
        nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:lawful\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n',
        moves: '',
    };
    const safe = value => JSON.parse(JSON.stringify(value, (_key, item) =>
        typeof item === 'bigint' ? `${item}n` : item));
    const monsterRows = state => {
        const result = [];
        const visited = new Set();
        for (let monster = state.level.monlist; monster && !visited.has(monster);
            monster = monster.nmon) {
            visited.add(monster);
            result.push({ id: monster.m_id, species: monster.data?.pmidx,
                x: monster.mx, y: monster.my, hp: monster.mhp,
                peaceful: monster.mpeaceful, tame: monster.mtame });
        }
        return result;
    };
    const floorRows = (state, x, y) => {
        const result = [];
        const visited = new Set();
        for (let object = state.level.objects[x]?.[y]; object && !visited.has(object);
            object = object.nexthere) {
            visited.add(object);
            result.push({ id: object.o_id, type: object.otyp, where: object.where,
                quantity: object.quan });
        }
        return result;
    };
    const inventoryRows = state => {
        const result = [];
        const visited = new Set();
        for (let object = state.invent; object && !visited.has(object);
            object = object.nobj) {
            visited.add(object);
            result.push({ id: object.o_id, type: object.otyp, where: object.where,
                quantity: object.quan });
        }
        return result;
    };
    const billRows = eshk => (Array.isArray(eshk.bill_p)
        ? eshk.bill_p.slice(0, eshk.billct) : []).map(bill => ({
        objectId: bill?.bo_id ?? null,
        quantity: bill?.bquan ?? null,
        price: bill?.price ?? null,
        useup: bill?.useup ?? null,
    }));
    const stateMarker = state => {
        assert.ok(state.unported instanceof Set,
            'the source-owned unported marker collection is a Set');
        return [...state.unported];
    };
    const actorErrorBoundary = (display, moreCount) => ({
        screen: display.serialize(), topline: display.toplines,
        queueLength: display.inputQueueLength, epoch: display.waitEpoch,
        pending: display.terminal?._inputResolver != null, moreCount,
    });

    const display = new GameDisplay(null);
    const oldOnEmptyQueue = display.onEmptyQueue;
    let moreCount = 0;
    display.onEmptyQueue = () => {
        const screen = display.serialize();
        if (display.toplin === TOPLINE_NEED_MORE && screen.includes('--More--')) {
            if (++moreCount > 16)
                throw new Error(`More limit exceeded: ${JSON.stringify(
                    actorErrorBoundary(display, moreCount),
                )}`);
            return ' '.charCodeAt(0);
        }
        throw new Error(`unrecognized empty-queue input boundary: ${JSON.stringify(
            actorErrorBoundary(display, moreCount),
        )}`);
    };

    let primaryError = null;
    let gameInstance;
    let figurine;
    let spellObject;
    let callbackValue;
    let before;
    let after;
    let expectedPrice;
    let newMonsters;
    let markerAdded;
    try {
        gameInstance = new NethackGame(fixedInput);
        gameInstance._pendingDisplay = display;
        const started = await gameInstance.start();
        if (!started) throw new Error('NethackGame.start returned false');
        const state = game;
        const random = { d, rn1, rn2, rnd, rne, rnl, rnz };
        do_mkroom(SHOPBASE, state, random);
        const shop = state.level.rooms.slice(0, state.level.nroom)
            .find(room => room && room.rtype >= SHOPBASE && room.needfill != null);
        if (!shop) throw new Error('canonical do_mkroom produced no shop');
        const objectEnv = objectGenerationEnv({ state, random });
        await fill_special_room(shop, objectEnv);
        const keeper = shop.resident;
        if (!keeper?.isshk || !keeper.mextra?.eshk || !keeper.mpeaceful)
            throw new Error('canonical shop fill produced no peaceful resident');
        const eshk = keeper.mextra.eshk;
        if (eshk.credit !== 0 || eshk.debit !== 0 || eshk.robbed !== 0
            || eshk.billct !== 0)
            throw new Error('natural source keeper does not start with zero billing state');

        const keeperRoom = eshk.shoproom;
        const candidates = [];
        for (let x = shop.lx; x <= shop.hx; ++x) {
            for (let y = shop.ly; y <= shop.hy; ++y) {
                if (inside_shop(x, y, state) !== keeperRoom
                    || !costly_spot(x, y, state)
                    || (x === keeper.mx && y === keeper.my)
                    || (x === state.u.ux && y === state.u.uy)) continue;
                candidates.push({ x, y });
            }
        }
        const target = candidates[0];
        const heroSpot = candidates.find(({ x, y }) => x !== target?.x || y !== target?.y);
        if (!target || !heroSpot)
            throw new Error('fixed canonical costly target/hero squares unavailable');
        if (target.x !== 3 || target.y !== 7
            || heroSpot.x !== 3 || heroSpot.y !== 8)
            throw new Error('fixed input no longer selects the reviewed target/hero coordinates');
        await teleds(heroSpot.x, heroSpot.y, TELEDS_TELEPORT, state, { random });
        if (state.u.ux !== heroSpot.x || state.u.uy !== heroSpot.y
            || inside_shop(state.u.ux, state.u.uy, state) !== keeperRoom
            || !costly_spot(state.u.ux, state.u.uy, state))
            throw new Error('canonical teleds did not reach the fixed other shop square');
        if (m_at(target.x, target.y, state))
            throw new Error('first canonical target square already has a monster');

        figurine = mksobj_at(FIGURINE, target.x, target.y, true, false, objectEnv);
        set_corpsenm(figurine, PM_NEWT, objectEnv);
        const species = state.mons[PM_NEWT];
        const vital = state.svm?.mvitals?.[PM_NEWT];
        if (!figurine || figurine.where !== OBJ_FLOOR
            || state.objects[FIGURINE]?.oc_material !== MINERAL
            || figurine.oartifact || figurine.no_charge || figurine.unpaid
            || !species || dead_species(PM_NEWT, true, { state })
            || vegetarian(species) || is_golem(species)
            || species === state.mons[PM_FLESH_GOLEM]
            || !vital || !Number.isInteger(vital.mvflags))
            throw new Error('natural FIGURINE/PM_NEWT target failed source predicates');
        if (state.unported.has('shk.c stolen_value'))
            throw new Error('source billing marker already present before callback');
        spellObject = mksobj(SPE_STONE_TO_FLESH, true, false, objectEnv);
        expectedPrice = get_cost(figurine, keeper, state);
        if (!(expectedPrice > 0)) throw new Error('actual keeper price is not positive');

        const actorsBefore = monsterRows(state);
        const floorBefore = floorRows(state, target.x, target.y);
        if (!floorBefore.some(row => row.id === figurine.o_id))
            throw new Error('original FIGURINE absent from canonical floor chain');
        before = safe({ input: fixedInput, hero: { x: state.u.ux, y: state.u.uy,
            level: state.u.uz, moves: state.moves }, keeper: { id: keeper.m_id,
            peaceful: keeper.mpeaceful, shoproom: eshk.shoproom, credit: eshk.credit,
            debit: eshk.debit, robbed: eshk.robbed, billct: eshk.billct,
            bills: billRows(eshk) }, target, actualPrice: expectedPrice,
            figurine: { id: figurine.o_id, where: figurine.where,
                no_charge: figurine.no_charge, unpaid: figurine.unpaid,
                quantity: figurine.quan, type: figurine.otyp,
                corpsenm: figurine.corpsenm, material: state.objects[FIGURINE].oc_material,
                artifact: figurine.oartifact, timed: figurine.timed },
            species: { id: species.pmidx, name: species.mname, geno: species.geno,
                vegetarian: vegetarian(species), golem: is_golem(species), vital },
            marker: stateMarker(state), actors: actorsBefore, floor: floorBefore,
            inventory: inventoryRows(state), rng: gameInstance.getRngLog().slice(),
            screen: display.serialize(), topline: display.toplines,
            input: actorErrorBoundary(display, moreCount) });
        const beforePath = join(projectionDir, 'before.json');
        writeFileSync(beforePath, JSON.stringify(before, null, 2) + '\n', { flag: 'wx' });

        await (async () => {
            callbackValue = await bhito(figurine, spellObject, state, random);
        })();
    } catch (error) {
        primaryError = error;
    } finally {
        display.onEmptyQueue = oldOnEmptyQueue;
    }
    if (primaryError) throw primaryError;
    assert.equal(display.onEmptyQueue, oldOnEmptyQueue,
        'the original input handler is restored before post-action observers');

    const state = game;
    const keeper = state.level.rooms.find(room => room?.resident?.m_id
        === before.keeper.id).resident;
    const eshk = keeper.mextra.eshk;
    const target = before.target;
    const actorsAfter = monsterRows(state);
    newMonsters = actorsAfter.filter(monster =>
        !before.actors.some(old => old.id === monster.id));
    const floorAfter = floorRows(state, target.x, target.y);
    markerAdded = !before.marker.includes('shk.c stolen_value')
        && state.unported.has('shk.c stolen_value');
    after = safe({ callbackValue, hero: { x: state.u.ux, y: state.u.uy,
        level: state.u.uz, moves: state.moves }, keeper: { id: keeper.m_id,
        peaceful: keeper.mpeaceful, shoproom: eshk.shoproom, credit: eshk.credit,
        debit: eshk.debit, robbed: eshk.robbed, billct: eshk.billct,
        bills: billRows(eshk) }, figurine: { originalId: before.figurine.id,
        where: figurine.where, nobj: figurine.nobj?.o_id ?? null,
        nexthere: figurine.nexthere?.o_id ?? null,
        stillOnFloor: floorAfter.some(row => row.id === before.figurine.id) },
        newMonsters, actors: actorsAfter, floor: floorAfter,
        inventory: inventoryRows(state), marker: stateMarker(state), markerAdded,
        messages: display.messages, topline: display.toplines,
        screen: display.serialize(), rng: gameInstance.getRngLog().slice(),
        input: actorErrorBoundary(display, moreCount) });
    const outputName = markerAdded ? 'original-red.json' : 'candidate-green.json';
    const outputPath = join(projectionDir, outputName);
    writeFileSync(outputPath, JSON.stringify({ before, after }, null, 2) + '\n', { flag: 'wx' });

    assert.equal(callbackValue, 1);
    assert.equal(newMonsters.length, 1,
        'the actual callback creates exactly one new actor');
    assert.equal(newMonsters[0].species, PM_NEWT);
    assert.deepEqual([newMonsters[0].x, newMonsters[0].y], [target.x, target.y]);
    assert.equal(figurine.where, OBJ_DELETED,
        'successful source path unlinks and deletes the original floor FIGURINE');
    assert.equal(after.figurine.stillOnFloor, false);
    assert.equal(eshk.credit, before.keeper.credit);
    assert.equal(eshk.debit - before.keeper.debit, expectedPrice,
        'successful floor FIGURINE animation charges its actual source price');
    assert.equal(eshk.robbed, before.keeper.robbed);
    assert.equal(eshk.billct, before.keeper.billct);
    assert.equal(markerAdded, false,
        'the implemented path no longer records the missing stolen_value gap');
    const text = `${display.toplines}\n${JSON.stringify(display.messages)}\n${display.serialize()}`;
    assert.match(text, /owe .* for it/u,
        'the ordinary peaceful-keeper debt message is retained');
});

test('statue animation removes a wielded statue before deleting it', async () => {
    // This independent fixed seed reaches trap.c:animate_statue with a weapon
    // slot set, exercising the remove_worn_item call before delobj.
    await runSegment({
        seed: 8210072,
        datetime: '20310204050607',
        nethackrc: 'OPTIONS=name:WieldedStatue,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\nOPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug\n',
        moves: '.',
    }, {});
    const statue = mksobj(STATUE, true, false, {
        state: game,
        hooks: { monsterObject },
    });
    statue.corpsenm = PM_NEWT;
    statue.where = OBJ_INVENT;
    statue.nobj = game.invent;
    game.invent = statue;
    statue.owornmask = W_WEP;
    game.uwep = statue;

    const monster = await animate_statue(
        statue,
        game.u.ux,
        game.u.uy,
        ANIMATE_SPELL,
        { state: game, message: async () => {} },
    );

    assert.ok(monster);
    assert.equal(game.uwep, null);
    assert.equal(statue.owornmask, 0);
    assert.equal(statue.where, OBJ_DELETED);
});

for (const cause of [ANIMATE_NORMAL, ANIMATE_SHATTER]) {
    test(`statue animation cause ${cause} admits the ordinary creation flags`, async () => {
        await runSegment({
            seed: 901219 + cause,
            datetime: '20320405060708',
            nethackrc: 'OPTIONS=name:StatueTrap,role:Archeologist,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
            moves: '.',
        }, {});
        const statue = mksobj(STATUE, false, false, {
            state: game, hooks: { monsterObject },
        });
        statue.corpsenm = PM_NEWT;
        statue.spe |= CORPSTAT_HISTORIC;
        game.context.mon_moving = cause === ANIMATE_SHATTER;
        const alignment = game.u.ualign.record;
        const messages = [];
        const monster = await animate_statue(
            statue, game.u.ux, game.u.uy, cause,
            { state: game, message: async line => messages.push(line) },
        );
        assert.ok(monster);
        assert.equal(monster.data.pmidx, PM_NEWT);
        assert.equal(monster.mpeaceful, 0);
        assert.equal(monster.mtame, 0);
        assert.equal(statue.where, OBJ_DELETED);
        const feeling = game.context.mon_moving ? 'regret' : 'guilty';
        assert.ok(messages.includes(
            `You feel ${feeling} that the historic statue is now gone.`,
        ));
        assert.equal(game.u.ualign.record,
            alignment - (game.context.mon_moving ? 0 : 1));
    });
}
