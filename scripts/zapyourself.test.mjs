import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
    SPE_STONE_TO_FLESH,
    STATUE,
    WAN_DIGGING,
    WAN_NOTHING,
    WAN_MAKE_INVISIBLE,
    WAN_OPENING,
    WAN_SLOW_MONSTER,
    SPBOOK_CLASS,
    SPE_DETECT_UNSEEN,
} from '../js/objects.js';
import {
    ANIMATE_NORMAL, ANIMATE_SHATTER, ANIMATE_SPELL, FAST, FROMFORM,
    CORPSTAT_HISTORIC, INVIS, OBJ_DELETED, OBJ_INVENT,
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
    const youmonst = {};
    const state = {
        u: { umonnum: 4, umonster: 4, mh: 10, uprops: {} },
        youmonst,
    };
    assert.equal(
        await cancel_monst(youmonst, { oclass: GEM_CLASS }, true, true, true, state),
        true,
    );
    assert.equal(state.u.umonnum, 4);
    assert.equal(state.u.umonster, 4);
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
    const youmonst = {};
    const state = {
        u: { umonnum: 4, umonster: 4, mh: 10, uprops: {} },
        youmonst,
    };
    assert.equal(
        await cancel_monst(youmonst, { oclass: GEM_CLASS }, true, true, true, state),
        true,
    );
    assert.equal(state.u.umonnum, 4);
    assert.equal(state.u.umonster, 4);
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
    game.uball = {};
    assert.equal(game.u.uball, undefined);
    game.unported = new Set();
    await zapyourself(wand, true, game);
    // read.c unpunish is a declared void-call gap. Reaching it and learning
    // the wand still depend on the same canonical Punished value as C.
    assert.ok(game.unported.has('read.c unpunish'));
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
    assert.match(JS_SOURCE, /if \(wand\.otyp === SPE_STONE_TO_FLESH\)\s*\n\s*return await stone_to_flesh_obj/u);
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
