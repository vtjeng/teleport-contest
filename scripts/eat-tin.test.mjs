import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CQ_CANNED,
    ECMD_TIME,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    HUNGER,
    HOMEMADE_TIN,
    NON_PM,
    OBJ_INVENT,
    OBJ_FLOOR,
    ROTTEN_TIN,
    RANDOM_TIN,
    SLIMED,
    SICK,
    STONED,
    TIMEOUT,
    VOMITING,
} from '../js/const.js';
import {
    Popeye,
    TIN_VARIETIES,
    set_tin_variety,
    tin_details,
    tinopen_ok,
    use_tin_opener,
} from '../js/eat.js';
import {
    PM_HUMAN,
    PM_ACID_BLOB,
    PM_CHAMELEON,
    PM_GENETIC_ENGINEER,
    PM_KOBOLD,
    PM_LIZARD,
    PM_GREEN_SLIME,
    monst_globals_init,
} from '../js/monsters.js';
import { GameMap } from '../js/game.js';
import { init_objects } from '../js/o_init.js';
import { cmdq_add_key } from '../js/cmd.js';
import { newObject } from '../js/obj.js';
import { objects_globals_init, AXE, DAGGER, TIN, TIN_OPENER } from '../js/objects.js';
import { find_delayed_killer } from '../js/end.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { loadCorpsePrefxRecipe, verifyCorpsePrefxSegment } from './run-corpse-prefx.mjs';

const EAT_C = readFileSync(
    new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8',
);
const OBJ_H = readFileSync(
    new URL('../nethack-c/upstream/include/obj.h', import.meta.url), 'utf8',
);

function initializedState() {
    const state = {};
    monst_globals_init(state);
    return state;
}

function tinOpenerState(otyp) {
    const state = {
        context: { ident: 2, current_fruit: 1 },
        flags: {
            implicit_uncursed: true,
            initalign: 0,
            invlet_constant: true,
        },
        iflags: { override_ID: false, pricequotes: false },
        program_state: { gameover: false, in_moveloop: false },
        u: { umonnum: PM_HUMAN, uprops: [] },
        disp: {},
    };
    objects_globals_init(state);
    init_objects(state, () => 0);
    monst_globals_init(state);
    state.youmonst = { data: state.mons[PM_HUMAN] };

    const openerType = state.objects[otyp];
    const opener = newObject({
        corpsenm: NON_PM,
        oclass: openerType.oc_class,
        otyp,
        quan: 1,
        invlet: 'a',
        where: OBJ_INVENT,
        dknown: true,
    });
    const tinType = state.objects[TIN];
    const tin = newObject({
        corpsenm: NON_PM,
        oclass: tinType.oc_class,
        otyp: TIN,
        quan: 1,
        invlet: 'b',
        where: OBJ_INVENT,
    });
    opener.nobj = tin;
    state.invent = opener;
    state.uwep = opener;
    cmdq_add_key(CQ_CANNED, 'b'.charCodeAt(0), state);
    return { state, opener };
}

test('tinopen_ok is the source getobj filter for tins', () => {
    assert.match(EAT_C, /tinopen_ok\(struct obj \*obj\)[\s\S]*?obj->otyp == TIN/u);
    assert.equal(tinopen_ok(null), GETOBJ_EXCLUDE);
    assert.equal(tinopen_ok({ otyp: TIN }), GETOBJ_SUGGEST);
    assert.equal(tinopen_ok({ otyp: TIN + 1 }), GETOBJ_EXCLUDE);
});

test('tin variety metadata matches every selectable C tintxts row', () => {
    const table = EAT_C.match(
        /\}\s+tintxts\[\]\s*=\s*\{([\s\S]*?)\n\s*\};/u,
    );
    assert.ok(table, 'eat.c defines the source tintxts table');
    const sourceRows = [...table[1].matchAll(
        /\{\s*"([^"]*)"\s*,\s*(-?\d+)\s*,\s*([01])\s*,\s*([01])\s*\}/gu,
    )].map(([, name, nutrition, fodder, greasy]) => ({
        name,
        nutrition: Number(nutrition),
        healthFood: fodder === '1',
        greasy: greasy === '1',
    }));

    // C's last empty row is a sentinel; only the preceding TTSZ - 1 rows are selectable.
    assert.equal(sourceRows.at(-1).name, '');
    assert.deepEqual(TIN_VARIETIES, sourceRows.slice(0, -1));
});

test('tin_details keeps source placement for known and hidden tin varieties', () => {
    assert.match(EAT_C, /void\s+tin_details\(struct obj \*obj, int mnum, char \*buf\)/u);
    const state = initializedState();
    const rotten = { corpsenm: PM_KOBOLD, spe: -(ROTTEN_TIN + 1), cknown: true };
    const homemade = { corpsenm: PM_KOBOLD, spe: -(HOMEMADE_TIN + 1), cknown: true };
    const spinach = { corpsenm: NON_PM, spe: 1, cknown: true };
    const hidden = { corpsenm: PM_KOBOLD, spe: -(ROTTEN_TIN + 1), cknown: false };

    assert.equal(tin_details(rotten, PM_KOBOLD, 'tin', { state }),
        'rotten tin of kobold meat');
    assert.equal(tin_details(homemade, PM_KOBOLD, 'tin', { state }),
        'homemade tin of kobold meat');
    assert.equal(tin_details(spinach, NON_PM, 'tin', { state }),
        'tin of spinach');
    assert.equal(tin_details(hidden, PM_KOBOLD, 'tin', { state }),
        'tin of kobold meat');
    assert.equal(tin_details({ corpsenm: PM_KOBOLD, spe: 0 }, NON_PM,
        'tin', { state, random: { rn2: () => 0 } }), 'empty tin');
});


test('set_tin_variety uses C’s final random arm for an unrecognized force', () => {
    assert.match(EAT_C, /else\s*\{[^}]*rn2\(TTSZ - 1\)/u);
    const tin = { corpsenm: PM_LIZARD, spe: 0 };
    const calls = [];
    set_tin_variety(tin, RANDOM_TIN + 100, {
        state: initializedState(),
        random: { rn2(bound) { calls.push(bound); return 0; } },
    });
    assert.deepEqual(calls, [15]);
    // C remaps rotten to homemade for species whose corpses do not rot.
    assert.equal(tin.spe, -(HOMEMADE_TIN + 1));
});

test('start_tin names carried openers with eat.c yobjnam wording', async () => {
    assert.match(EAT_C,
        /pline\("Using %s you try to open the tin\."\s*,\s*yobjnam\(uwep,\s*\(char \*\) 0\)\)/u);

    async function useOpener(otyp) {
        const { state, opener } = tinOpenerState(otyp);
        const messages = [];
        const randomBounds = [];
        const result = await use_tin_opener(opener, state, {
            message: async (text) => { messages.push(text); },
            random: {
                rn2(bound) {
                    randomBounds.push(bound);
                    return 1;
                },
            },
        });
        assert.equal(result, ECMD_TIME);
        assert.equal(state.go.occtxt, 'opening the tin');
        return { state, messages, randomBounds };
    }

    const tinOpener = await useOpener(TIN_OPENER);
    assert.deepEqual(tinOpener.messages,
        ['Using your tin opener you try to open the tin.']);
    assert.deepEqual(tinOpener.randomBounds, [2]);
    assert.equal(tinOpener.state.go.occupation.cSourceFunction, 'eat.c:opentin',
        'the existing callback carries C opentin pointer identity for Popeye');

    // The same source arm covers ordinary opener weapons without adding an
    // RNG call; yobjnam supplies their carried-item possessive as well.
    const dagger = await useOpener(DAGGER);
    assert.deepEqual(dagger.messages,
        ['Using your dagger you try to open the tin.']);
    assert.deepEqual(dagger.randomBounds, []);

    const axe = await useOpener(AXE);
    assert.deepEqual(axe.messages,
        ['Using your axe you try to open the tin.']);
    assert.deepEqual(axe.randomBounds, []);
});

test('consume_tin runs green-slime cprefx after charge and before cpostfx',
    async () => {
        const source = EAT_C.slice(
            EAT_C.indexOf('consume_tin(const char *mesg)'),
            EAT_C.indexOf('\n}\n', EAT_C.indexOf('consume_tin(const char *mesg)')),
        );
        assert.match(source,
            /tin\s*=\s*svc\.context\.tin\.tin\s*=\s*costly_tin\(COST_OPEN\)[\s\S]*?cprefx\(mnum\);[\s\S]*?if \(svc\.context\.tin\.tin\)[\s\S]*?cpostfx\(mnum\);/u);
        const jsSource = readFileSync(
            new URL('../js/eat.js', import.meta.url), 'utf8',
        );
        const jsStart = jsSource.indexOf('async function consume_tin(');
        const jsEnd = jsSource.indexOf('\n}\n', jsStart);
        const jsBody = jsSource.slice(jsStart, jsEnd);
        assert.ok(jsBody.indexOf('costly_tin(COST_OPEN, state)')
            < jsBody.indexOf('await cprefx(monsterNumber, state, eatEnv)'));
        assert.ok(jsBody.indexOf('await cprefx(monsterNumber, state, eatEnv)')
            < jsBody.indexOf('await cpostfx(monsterNumber, state, eatEnv)'));

        const { state, opener } = tinOpenerState(TIN_OPENER);
        // The blessed homemade tin removes tin-variety randomness. C's
        // cpostfx still runs corpse_intrinsic after cprefx; seed that existing
        // global RNG owner so its source-order draw can be pinned separately.
        initRng(6600);
        enableRngLog();
        state.u.uhunger = 800;
        state.u.uprops[SLIMED] = { intrinsic: 0, extrinsic: 0 };
        const tin = opener.nobj;
        tin.corpsenm = PM_GREEN_SLIME;
        tin.blessed = true;
        // A blessed tin opener opens the blessed food tin immediately; the
        // blessed homemade variety avoids the spoilage draw in tin_variety.
        opener.blessed = true;
        set_tin_variety(tin, HOMEMADE_TIN, { state });
        cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), state);
        const messages = [];
        await use_tin_opener(opener, state, {
            message: async (line) => messages.push(line),
            statusRefresh: async () => {},
        });

        assert.equal(state.u.uprops[SLIMED].intrinsic & TIMEOUT, 10);
        assert.equal(find_delayed_killer(SLIMED, state)?.name, '');
        assert.ok(messages.includes("You don't feel very well."));
        assert.ok(messages.indexOf(
            "You don't feel very well.",
        ) > messages.findIndex((line) => line.includes('You consume')));
        assert.equal(state.context.tin.tin, null);
        assert.deepEqual(getRngLog(), [
            'rn2(1)=0', 'rn2(2)=1', 'rn2(15)=10', 'rn2(3)=1', 'd(3,6)=15',
        ], 'cprefx precedes the C cpostfx corpse-intrinsic draw chain');
    });

function popeyeState({
    corpsenm = NON_PM,
    known = true,
    otyp = TIN,
    spe = 0,
    where = OBJ_INVENT,
} = {}) {
    const { state, opener } = tinOpenerState(TIN_OPENER);
    const tin = opener.nobj;
    Object.assign(tin, { corpsenm, known, otyp, spe, where });
    state.context.tin = { tin };
    state.u.ux = 10;
    state.u.uy = 10;
    state.go.occupation = Object.assign(() => 1, {
        cSourceFunction: 'eat.c:opentin',
    });
    state.level = new GameMap();
    if (where === OBJ_FLOOR) {
        // The only floor candidate is the source tin at the hero's square.
        tin.ox = 10;
        tin.oy = 10;
        state.level.objects[10][10] = tin;
    }
    return { state, tin };
}

test('Popeye matches eat.c pointer, access, known-food and threat tests', () => {
    assert.match(EAT_C,
        /boolean\s+Popeye\(int threat\)[\s\S]*?go\.occupation != opentin[\s\S]*?carried\(otin\)[\s\S]*?obj_here\(otin, u\.ux, u\.uy\)[\s\S]*?can_reach_floor\(TRUE\)[\s\S]*?if \(!otin->known\)[\s\S]*?switch \(threat\)[\s\S]*?case HUNGER:[\s\S]*?case STONED:[\s\S]*?case SLIMED:[\s\S]*?case SICK:[\s\S]*?case VOMITING:/u);
    assert.ok(OBJ_H.includes(
        '#define polyfood(obj) ' + '\\' + '\n'
            + '    (ofood(obj) && (obj)->corpsenm >= LOW_PM',
    ));
    assert.ok(OBJ_H.includes('pm_to_cham((obj)->corpsenm) != NON_PM'));
    assert.ok(OBJ_H.includes('dmgtype(&mons[(obj)->corpsenm], AD_POLY)'));

    const unrelatedOccupation = popeyeState({ known: false });
    unrelatedOccupation.state.go.occupation = () => 1;
    assert.equal(Popeye(VOMITING, unrelatedOccupation.state), false,
        'C compares the current occupation function before reading its tin');

    const unknown = popeyeState({ known: false });
    assert.equal(Popeye(SICK, unknown.state), true,
        'C treats an unknown accessible tin as helpful before switching threats');

    const carried = popeyeState({ known: true, corpsenm: PM_KOBOLD });
    assert.equal(Popeye(HUNGER, carried.state), true,
        'a known tin with any corpse species is helpful for hunger');
    const spinach = popeyeState({ known: true, spe: 1 });
    assert.equal(Popeye(HUNGER, spinach.state), true,
        'C accepts the spinach sentinel even when corpsenm is NON_PM');
    const empty = popeyeState({ known: true });
    assert.equal(Popeye(HUNGER, empty.state), false,
        'an empty known tin without the spinach sentinel is not helpful');

    for (const corpsenm of [PM_LIZARD, PM_ACID_BLOB]) {
        const food = popeyeState({ known: true, corpsenm });
        assert.equal(Popeye(STONED, food.state), true,
            'lizard flesh and acidic species stop the source petrification threat');
    }
    const kobold = popeyeState({ known: true, corpsenm: PM_KOBOLD });
    assert.equal(Popeye(STONED, kobold.state), false,
        'ordinary kobold flesh does not stop petrification');

    for (const corpsenm of [PM_CHAMELEON, PM_GENETIC_ENGINEER]) {
        const food = popeyeState({ known: true, corpsenm });
        assert.equal(Popeye(SLIMED, food.state), true,
            'C polyfood accepts a shapeshifter or an AD_POLY species');
    }
    const plainFood = popeyeState({ known: true, corpsenm: PM_KOBOLD });
    assert.equal(Popeye(SLIMED, plainFood.state), false,
        'ordinary food is not the source polyfood predicate');
    const wrongObject = popeyeState({
        known: true, corpsenm: PM_CHAMELEON, otyp: TIN_OPENER,
    });
    assert.equal(Popeye(SLIMED, wrongObject.state), false,
        'polyfood first requires C ofood: corpse, egg or tin');
    assert.equal(Popeye(VOMITING, spinach.state), false,
        'C has no known-tin cure for Vomiting');

    const floorTin = popeyeState({ known: false, where: OBJ_FLOOR });
    assert.equal(Popeye(VOMITING, floorTin.state), true,
        'a reachable same-square floor tin passes obj_here and can_reach_floor');
    floorTin.tin.ox = 11;
    floorTin.tin.oy = 10;
    floorTin.state.level.objects[10][10] = null;
    floorTin.state.level.objects[11][10] = floorTin.tin;
    assert.equal(Popeye(VOMITING, floorTin.state), false,
        'a floor tin outside the hero square is inaccessible');
});

test('independent C-first tins reach golem conversion and early life-saved consumption', async () => {
    for (const name of ['golem-tin', 'fatal-tin-lifesaved'])
        await verifyCorpsePrefxSegment(loadCorpsePrefxRecipe(name).segments[0]);
});
