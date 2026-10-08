import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ACID_RES,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_SUGGEST,
    A_INT,
    A_STR,
    M_ATTK_HIT,
    M_ATTK_MISS,
    CONFLICT,
    FAINTED,
    FROMFORM,
    FROMOUTSIDE,
    HEALTHY_TIN,
    HALLUC,
    HUNGER,
    HUNGRY,
    LEVITATION,
    MOD_ENCUMBER,
    NOT_HUNGRY,
    OBJ_FLOOR,
    OBJ_INVENT,
    PROTECTION,
    RANDOM_TIN,
    REGENERATION,
    SATIATED,
    SLOW_DIGESTION,
    SPINACH_TIN,
    STONE_RES,
    UNENCUMBERED,
    WEAK,
    W_ARTI,
    W_ARMOR,
    W_RINGL,
    W_RINGR,
    W_TOOL,
    W_WEP,
} from '../js/const.js';
import {
    eatfood, eating_dangerous_corpse, Finish_digestion, gethungry, is_fainted, offer_ok,
    eat_brains, eating_conducts, set_tin_variety, temp_resist, tin_ok,
} from '../js/eat.js';
import {
    AMULET_CLASS,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_YENDOR,
    CORPSE,
    FAKE_AMULET_OF_YENDOR,
    FOOD_CLASS,
    FOOD_RATION,
    MEAT_RING,
    RIN_ADORNMENT,
    RIN_PROTECTION,
    RIN_SEARCHING,
    RIN_SLOW_DIGESTION,
    objects_globals_init,
} from '../js/objects.js';
import { tinnable } from '../js/apply.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';

const EAT_C = readFileSync(
    new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8',
);
const EAT_JS = readFileSync(new URL('../js/eat.js', import.meta.url), 'utf8');
const APPLY_C = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
import {
    M1_CARNIVORE,
    M1_HERBIVORE,
    M1_METALLIVORE,
    NON_PM,
    PM_ACID_BLOB,
    PM_COCKATRICE,
    PM_ELF,
    PM_DEATH,
    PM_GHOST,
    PM_HEALER,
    PM_HUMAN,
    PM_KOBOLD,
    PM_LICHEN,
    PM_LIZARD,
    PM_MEDUSA,
    PM_NEWT,
    PM_MONK,
    PM_SHADE,
    PM_PONY,
    PM_RUST_MONSTER,
    PM_VALKYRIE,
    PM_WRAITH,
    PM_WIZARD,
    monst_globals_init,
} from '../js/monsters.js';

function state() {
    const result = {};
    monst_globals_init(result);
    return result;
}

test('eat_brains preserves source order and the three-valued result', async () => {
    assert.match(EAT_C,
        /eat_brains\([\s\S]*?int result = M_ATTK_HIT, xtra_dmg = rnd\(10\);[\s\S]*?if \(noncorporeal\(pd\)\)[\s\S]*?return M_ATTK_MISS;[\s\S]*?if \(magr == &gy\.youmonst\)[\s\S]*?eating_conducts\(pd\);[\s\S]*?morehungry\(-rnd\(30\)\);[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?exercise\(A_WIS, FALSE\);[\s\S]*?else \{ \/\* mhitm \*\/[\s\S]*?if \(give_nutrit && magr->mtame && !magr->isminion\)/u);
    const jsStart = EAT_JS.indexOf('export async function eat_brains(');
    const jsEnd = EAT_JS.indexOf('\n}', jsStart) + 2;
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    const jsBody = EAT_JS.slice(jsStart, jsEnd);
    assert.match(jsBody, /let extraDamage = random\.rnd\(10\)/u);
    assert.match(jsBody, /if \(magr === state\.youmonst\)[\s\S]*?eating_conducts\(pd, state, effectEnv\)/u);
    assert.match(jsBody, /else if \(mdef === state\.youmonst\)[\s\S]*?giveNutrit = true/u);

    // This independently chosen seed creates the deterministic game state
    // used by the direct H→M and noncorporeal source-branch checks.
    await runSegment({
        seed: 7711140, datetime: '20300102030405',
        nethackrc: 'OPTIONS=name:BrainOrder,role:Healer,race:human,gender:male,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
    });
    const target = {
        data: game.mons[PM_NEWT],
        m_id: 991101, // Unique fixture identity; the C result uses target data.
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 20, // Keep the target alive through this source call.
        mhpmax: 20,
        minvent: null,
        mextra: {},
        mtame: false,
        female: false,
    };
    const calls = [];
    const messages = [];
    const random = {
        rnd: (bound) => { calls.push(`rnd(${bound})`); return 1; }, // C accepts this d10 and adds one damage.
        rn2: (bound) => { calls.push(`rn2(${bound})`); return 0; }, // Select C's first nutrition and Int outcomes.
        rn1: (bound, base) => {
            calls.push(`rn1(${bound},${base})`);
            return base;
        },
    };
    const damage = { value: 5 }; // C's caller-owned damage slot receives the d10 result.
    assert.equal(
        await eat_brains(game.youmonst, target, false, damage, game, {
            random,
            message: async (line) => { messages.push(line); },
        }),
        M_ATTK_HIT,
    );
    assert.equal(damage.value, 6); // 5 + C's selected extra damage of 1.
    assert.deepEqual(calls.slice(0, 3), ['rnd(10)', 'rnd(30)', 'rn2(19)']);
    assert.match(messages[0], /^You eat .* newt.* brain!$/u);

    const shade = {
        ...target,
        data: game.mons[PM_SHADE],
        m_id: 991102, // Separate identity for the noncorporeal target.
    };
    calls.length = 0;
    messages.length = 0;
    const unchangedDamage = { value: 7 }; // This C branch returns before mutating damage.
    assert.equal(
        await eat_brains(game.youmonst, shade, true, unchangedDamage, game, {
            random,
            message: async (line) => { messages.push(line); },
        }),
        M_ATTK_MISS,
    );
    assert.equal(unchangedDamage.value, 7);
    assert.deepEqual(calls, ['rnd(10)']);
    assert.match(messages[0], /brain is unharmed\./u);
});

test('brain conduct and cannibal output use the supplied planning environment', async () => {
    // A second independent seed keeps the planning fixture separate from the
    // preceding direct source behavior check.
    await runSegment({
        seed: 7711141, datetime: '20300102030405',
        nethackrc: 'OPTIONS=name:BrainEnv,role:Healer,race:human,gender:male,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
    });
    const clone = planningState(game);
    const before = {
        hunger: game.u.uhunger,
        intelligence: game.u.acurr.a[A_INT],
        toplines: game._ttyToplines,
        queue: game.nhDisplay.inputQueueLength,
    };
    const monster = {
        data: clone.mons[PM_HUMAN],
        m_id: 991103, // Unique fixture identity for this planning-only target.
        mx: clone.u.ux + 1,
        my: clone.u.uy,
        mhp: 20, // Survive the source brain-damage amount.
        mhpmax: 20,
        minvent: null,
        mextra: {},
        mtame: false,
        female: false,
    };
    const messages = [];
    const draws = [];
    const random = {
        rnd: (bound) => { draws.push(`rnd(${bound})`); return 1; },
        rn2: (bound) => { draws.push(`rn2(${bound})`); return 0; },
        rn1: (bound, base) => {
            draws.push(`rn1(${bound},${base})`);
            return base + 1; // C's own-race branch applies one deterministic luck penalty.
        },
    };
    const damage = { value: 3 };
    await eat_brains(clone.youmonst, monster, false, damage, clone, {
        planning: true,
        random,
        message: async (line) => { messages.push(line); },
    });
    assert.ok(messages.some((line) => line.includes('You cannibal!')));
    assert.ok(draws.includes('rn1(4,2)'),
        'maybe_cannibal receives the supplied cloned random source');
    assert.equal(game.u.uhunger, before.hunger);
    assert.equal(game.u.acurr.a[A_INT], before.intelligence);
    assert.equal(game._ttyToplines, before.toplines);
    assert.equal(game.nhDisplay.inputQueueLength, before.queue);

    const monk = planningState(game);
    monk.urole.mnum = PM_MONK;
    monk.u.uconduct = { food: 0, unvegan: 0, unvegetarian: 0 };
    const guilt = [];
    await eating_conducts(monk.mons[PM_NEWT], monk, {
        planning: true,
        message: async (line) => { guilt.push(line); },
    });
    assert.deepEqual(guilt, ['You feel guilty.']);
    assert.equal(monk.u.uconduct.food, 1);
    assert.equal(monk.u.uconduct.unvegan, 1);
    assert.equal(monk.u.uconduct.unvegetarian, 1);
    assert.equal(game._ttyToplines, before.toplines);
});

test('Finish_digestion runs pending corpse effects and clears C state', async () => {
    const start = EAT_C.indexOf('Finish_digestion(void)');
    const end = EAT_C.indexOf('/*eat.c*/', start);
    const cFunction = EAT_C.slice(start, end);
    assert.match(cFunction,
        /if \(gc\.corpsenm_digested != NON_PM\)[\s\S]*?cpostfx\(gc\.corpsenm_digested\);[\s\S]*?gc\.corpsenm_digested = NON_PM;[\s\S]*?return 0;/u);

    const current = state();
    current.gc = { corpsenm_digested: PM_DEATH };
    assert.equal(await Finish_digestion(current), 0);
    assert.equal(current.gc.corpsenm_digested, NON_PM);

    current.gc.corpsenm_digested = NON_PM;
    assert.equal(await Finish_digestion(current), 0);
    assert.equal(current.gc.corpsenm_digested, NON_PM);
});

test('is_fainted follows eat.c hunger-status equality', () => {
    const jsStart = EAT_JS.indexOf('export function is_fainted(');
    const jsEnd = EAT_JS.indexOf('\n}', jsStart) + 2;
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    assert.match(EAT_C,
        /is_fainted\(void\)[\s\S]*?return \(boolean\) \(u\.uhs == FAINTED\);/u);
    assert.match(EAT_JS.slice(jsStart, jsEnd), /state\.u\?\.uhs === FAINTED/u);
    assert.equal(is_fainted({ u: { uhs: FAINTED } }), true);
    for (const uhs of [undefined, 0, FAINTED - 1, FAINTED + 1])
        assert.equal(is_fainted({ u: { uhs } }), false, String(uhs));
    assert.equal(is_fainted({}), false);
});

test('offer_ok follows eat.c corpse and amulet alignment', () => {
    // eat.c:3539-3567. The callback suggests corpses off Astral and amulets
    // on Astral, downplaying the opposite class so getobj() still exposes it
    // through the alternate inventory choices.
    assert.match(EAT_C, /offer_ok\(struct obj \*obj\)/u);
    assert.match(EAT_C, /Is_astralevel\(&u\.uz\) \^/u);
    const subject = state();
    subject.u = { uz: { dnum: 0, dlevel: 2 } };
    const savedAstralLevel = game.astral_level;
    game.astral_level = { dnum: 0, dlevel: 1 };
    const corpse = { oclass: FOOD_CLASS, otyp: CORPSE };
    const amulet = { oclass: AMULET_CLASS, otyp: AMULET_OF_YENDOR };
    try {
        assert.equal(offer_ok(null, subject), GETOBJ_EXCLUDE);
        assert.equal(offer_ok(corpse, subject), GETOBJ_SUGGEST);
        assert.equal(offer_ok(amulet, subject), GETOBJ_DOWNPLAY);
        subject.u.uz.dlevel = 1;
        assert.equal(offer_ok(corpse, subject), GETOBJ_DOWNPLAY);
        assert.equal(offer_ok(amulet, subject), GETOBJ_SUGGEST);
        assert.equal(
            offer_ok({ oclass: FOOD_CLASS, otyp: FOOD_RATION }, subject),
            GETOBJ_EXCLUDE_SELECTABLE,
        );
    } finally {
        game.astral_level = savedAstralLevel;
    }
});

test('tin_ok follows eat.c and apply.c corpse checks', () => {
    // eat.c:3569-3575 and apply.c:2167-2173. Tinning accepts only an
    // uneaten corpse whose species supplies nutrition.
    assert.match(EAT_C, /tin_ok\(struct obj \*obj\)/u);
    assert.match(APPLY_C, /tinnable\(struct obj \*corpse\)/u);
    const subject = state();
    const corpse = { oclass: FOOD_CLASS, otyp: CORPSE, corpsenm: 18 };
    assert.equal(tin_ok(null, subject), GETOBJ_EXCLUDE);
    assert.equal(tin_ok(corpse, subject), GETOBJ_SUGGEST);
    corpse.oeaten = 1;
    assert.equal(tin_ok(corpse, subject), GETOBJ_EXCLUDE_SELECTABLE);
    corpse.oeaten = 0;
    subject.mons[18].cnutrit = 0;
    assert.equal(tin_ok(corpse, subject), GETOBJ_EXCLUDE_SELECTABLE);
});

test('tinnable follows apply.c nutrition and eaten checks', () => {
    // apply.c:2167-2173. The pure helper checks oeaten before the species'
    // cnutrit field, so each condition is pinned independently.
    assert.match(APPLY_C, /boolean\s+tinnable\(struct obj \*corpse\)/u);
    const subject = state();
    const corpse = { corpsenm: 18, oeaten: 0 };
    assert.equal(tinnable(corpse, subject), true);
    corpse.oeaten = 1;
    assert.equal(tinnable(corpse, subject), false);
    corpse.oeaten = 0;
    subject.mons[18].cnutrit = 0;
    assert.equal(tinnable(corpse, subject), false);
});

test('temp_resist follows eat.c timeout-only resistance rules', () => {
    // Seven turns is a nonzero timeout; FROMFORM, worn armor, and any
    // nonzero blocker separately select C453–470's zero-result branches.
    const subject = state();
    subject.u = { uprops: [] };
    subject.u.uprops[ACID_RES] = { intrinsic: 7,
        extrinsic: 0, blocked: 0 };
    assert.equal(temp_resist(ACID_RES, subject), 7);
    subject.u.uprops[ACID_RES].intrinsic |= FROMFORM;
    assert.equal(temp_resist(ACID_RES, subject), 0);
    subject.u.uprops[ACID_RES] = { intrinsic: 7,
        extrinsic: W_ARMOR, blocked: 0 };
    assert.equal(temp_resist(ACID_RES, subject), 0);
    subject.u.uprops[ACID_RES].extrinsic = 0;
    subject.u.uprops[ACID_RES].blocked = 1;
    assert.equal(temp_resist(ACID_RES, subject), 0);
});

test('eating_dangerous_corpse follows the active meal, species and floor identity', () => {
    // eat.c:475-494; mondata.h:88 acidic, :202-203 touch/flesh_petrifies.
    const subject = state();
    const food = { otyp: CORPSE, corpsenm: PM_ACID_BLOB, where: OBJ_INVENT };
    subject.context = { victual: { piece: food } };
    subject.go = { occupation: eatfood };
    subject.u = { ux: 3, uy: 4 };
    subject.level = { objects: [] };
    assert.equal(eating_dangerous_corpse(ACID_RES, subject), true);
    assert.equal(eating_dangerous_corpse(STONE_RES, subject), false);
    assert.equal(eating_dangerous_corpse(FROMFORM, subject), false);
    for (const species of [PM_COCKATRICE, PM_MEDUSA]) {
        food.corpsenm = species;
        assert.equal(eating_dangerous_corpse(STONE_RES, subject), true);
        assert.equal(eating_dangerous_corpse(ACID_RES, subject), false);
    }
    food.corpsenm = PM_LICHEN;
    assert.equal(eating_dangerous_corpse(STONE_RES, subject), false);
    food.corpsenm = NON_PM;
    assert.equal(eating_dangerous_corpse(STONE_RES, subject), false);
    food.corpsenm = PM_ACID_BLOB;
    food.where = OBJ_FLOOR;
    assert.equal(eating_dangerous_corpse(ACID_RES, subject), false);
    subject.level.objects[3] = [];
    subject.level.objects[3][4] = { ...food, nexthere: food };
    assert.equal(eating_dangerous_corpse(ACID_RES, subject), true);
    subject.level.objects[3][4].nexthere = null;
    assert.equal(eating_dangerous_corpse(ACID_RES, subject), false);
    food.where = OBJ_INVENT;
    food.otyp = MEAT_RING;
    assert.equal(eating_dangerous_corpse(ACID_RES, subject), false);
    food.otyp = CORPSE;
    subject.context.victual.piece = null;
    assert.equal(eating_dangerous_corpse(ACID_RES, subject), false);
    subject.context.victual.piece = food;
    subject.go.occupation = () => {};
    assert.equal(eating_dangerous_corpse(ACID_RES, subject), false);
});

function hungerState() {
    const result = state();
    objects_globals_init(result);
    result.iflags = { debug_hunger: false };
    result.multi = 0;
    result.u = {
        atemp: [0, 0, 0, 0, 0, 0],
        uhunger: 900,
        uhs: NOT_HUNGRY,
        uhave: { amulet: false },
        uinvulnerable: false,
        uprops: [],
    };
    result.urole = { mnum: PM_HEALER, name: { m: 'Healer' } };
    result.urace = { mnum: PM_HUMAN };
    result.youmonst = { data: result.mons[PM_HUMAN] };
    return result;
}

function property(stateValue, index) {
    return stateValue.u.uprops[index] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };
}

async function hungerTick(
    stateValue,
    accessoryTime,
    capacity = UNENCUMBERED,
) {
    const bounds = [];
    const loss = await gethungry(stateValue, {
        random: {
            rn2: (bound) => {
                bounds.push(bound);
                return accessoryTime;
            },
        },
        nearCapacity: () => capacity,
    });
    assert.deepEqual(bounds, [20]);
    return loss;
}

test('gethungry applies ordinary alert-hero nutrition loss', async () => {
    const current = hungerState();
    assert.ok(current.youmonst.data.mflags1 & M1_CARNIVORE);

    assert.equal(await hungerTick(current, 2), 1);
    assert.equal(current.u.uhunger, 899);
    assert.equal(current.u.uhs, NOT_HUNGRY);
});

test('gethungry derives ordinary nutrition loss from the source diet flags',
    async () => {
    for (const [name, monster, flag, expected] of [
        ['no diet', PM_GHOST, 0, 0],
        ['carnivore', PM_HUMAN, M1_CARNIVORE, 1],
        ['herbivore', PM_PONY, M1_HERBIVORE, 1],
        ['metallivore', PM_RUST_MONSTER, M1_METALLIVORE, 1],
    ]) {
        const current = hungerState();
        current.youmonst.data = current.mons[monster];
        if (flag) assert.ok(current.youmonst.data.mflags1 & flag, name);
        else {
            assert.equal(
                current.youmonst.data.mflags1
                    & (M1_CARNIVORE | M1_HERBIVORE | M1_METALLIVORE),
                0,
                name,
            );
        }
        assert.equal(await hungerTick(current, 2), expected, name);
    }
});

test('gethungry skips invulnerable and debug-hunger turns without drawing',
    async () => {
    for (const setup of [
        (current) => { current.u.uinvulnerable = true; },
        (current) => { current.iflags.debug_hunger = true; },
    ]) {
        const current = hungerState();
        setup(current);
        assert.equal(await gethungry(current, {
            random: { rn2: () => assert.fail('skipped turn drew') },
        }), 0);
        assert.equal(current.u.uhunger, 900);
    }
});

test('gethungry preserves odd-turn regeneration and encumbrance masks',
    async () => {
    const excluded = hungerState();
    property(excluded, REGENERATION).intrinsic = FROMFORM;
    property(excluded, REGENERATION).extrinsic = W_ARTI | W_WEP;
    assert.equal(await hungerTick(excluded, 1), 1);

    const active = hungerState();
    property(active, REGENERATION).intrinsic = FROMFORM | FROMOUTSIDE;
    assert.equal(await hungerTick(active, 1), 2);

    const worn = hungerState();
    property(worn, REGENERATION).intrinsic = FROMFORM;
    property(worn, REGENERATION).extrinsic = W_ARTI | W_RINGL;
    assert.equal(await hungerTick(worn, 1, MOD_ENCUMBER), 3);
    assert.equal(worn.u.uhunger, 897);
});

test('gethungry applies even-turn property and accessory costs', async () => {
    const properties = hungerState();
    property(properties, HUNGER).intrinsic = FROMOUTSIDE;
    property(properties, CONFLICT).extrinsic = W_ARTI | W_RINGL;
    assert.equal(await hungerTick(properties, 2), 3);

    const intrinsicConflict = hungerState();
    property(intrinsicConflict, CONFLICT).intrinsic = FROMOUTSIDE;
    property(intrinsicConflict, CONFLICT).extrinsic = W_ARTI;
    assert.equal(await hungerTick(intrinsicConflict, 2), 2);

    // eat.c:3202-3203 masks W_ARTI out of the extrinsic instead of reading
    // youprop.h:218's Conflict macro, so an artifact is the one conflict
    // source that costs nothing: the loss is the ordinary point alone. The two
    // rows above leave the masked and unmasked reads agreeing -- W_RINGL makes
    // both true, and so does the intrinsic -- so this is the row that
    // separates them.
    const artifactConflict = hungerState();
    property(artifactConflict, CONFLICT).extrinsic = W_ARTI;
    assert.equal(await hungerTick(artifactConflict, 2), 1);

    const slowArmor = hungerState();
    property(slowArmor, SLOW_DIGESTION).extrinsic = W_WEP;
    assert.equal(await hungerTick(slowArmor, 0), 1);
    const slowRing = hungerState();
    property(slowRing, SLOW_DIGESTION).extrinsic = W_RINGR;
    slowRing.uright = { otyp: RIN_SLOW_DIGESTION, spe: 0 };
    assert.equal(await hungerTick(slowRing, 0), 0);

    const amulet = hungerState();
    amulet.uamul = { otyp: AMULET_OF_LIFE_SAVING };
    assert.equal(await hungerTick(amulet, 8), 2);
    const fakeAmulet = hungerState();
    fakeAmulet.uamul = { otyp: FAKE_AMULET_OF_YENDOR };
    assert.equal(await hungerTick(fakeAmulet, 8), 1);

    const possessed = hungerState();
    possessed.u.uhave.amulet = true;
    assert.equal(await hungerTick(possessed, 16), 2);
});

test('gethungry follows ring charge and duplicate-protection rules',
    async () => {
    const chargedZero = hungerState();
    chargedZero.uleft = { otyp: RIN_ADORNMENT, spe: 0 };
    assert.equal(await hungerTick(chargedZero, 4), 1);

    const charged = hungerState();
    charged.uleft = { otyp: RIN_ADORNMENT, spe: 1 };
    assert.equal(await hungerTick(charged, 4), 2);

    const uncharged = hungerState();
    uncharged.uleft = { otyp: RIN_SEARCHING, spe: 0 };
    assert.equal(await hungerTick(uncharged, 4), 2);

    const meat = hungerState();
    meat.uleft = { otyp: MEAT_RING, spe: 1 };
    assert.equal(await hungerTick(meat, 4), 1);

    const duplicateProtection = hungerState();
    duplicateProtection.uleft = { otyp: RIN_PROTECTION, spe: 0 };
    duplicateProtection.uright = { otyp: RIN_PROTECTION, spe: 0 };
    property(duplicateProtection, PROTECTION).extrinsic = W_RINGL | W_RINGR;
    assert.equal(await hungerTick(duplicateProtection, 4), 2);
    assert.equal(await hungerTick(duplicateProtection, 12), 1);

    for (const [name, ring, expected, configure] of [
        ['charged zero', { otyp: RIN_ADORNMENT, spe: 0 }, 1],
        ['charged nonzero', { otyp: RIN_ADORNMENT, spe: 1 }, 2],
        ['uncharged type', { otyp: RIN_SEARCHING, spe: 0 }, 2],
        ['meat ring', { otyp: MEAT_RING, spe: 1 }, 1],
        ['single protection', { otyp: RIN_PROTECTION, spe: 0 }, 2,
            (current) => {
                property(current, PROTECTION).extrinsic = W_RINGR;
            }],
    ]) {
        const current = hungerState();
        current.uright = ring;
        configure?.(current);
        assert.equal(await hungerTick(current, 12), expected, name);
    }
});

// eat.c gethungry():3174 spends ordinary nutrition when `!Unaware ||
// !rn2(10)`: an insensible hero burns food at a tenth of the waking rate. What
// picks that arm has to be youprop.h Unaware exactly -- a negative gm.multi
// alone is not it, and reading it as such would slow pray.c dopray()'s three
// turns, which C runs at the ordinary rate.
test('gethungry burns nutrition slowly for an Unaware hero and not for a merely immobile one',
    async () => {
    // Each row is a hero counting a negative gm.multi down, differing only in
    // what trap.c unconscious() reads. eat.c is_fainted(), Unaware's other
    // half, cannot be exercised here: a hero already at FAINTED stops at the
    // status guard below before any draw, which the last block pins.
    const unawareHeroes = [
        ['asleep', (s) => { s.u.usleep = 1; }],
        // The three prefixes trap.c:6783-6785 tests, spelled as C spells them.
        ['waking', (s) => { s.nomovemsg = 'You awake from your slumber.'; }],
        ['reviving', (s) => { s.nomovemsg = 'You regain consciousness.'; }],
        ['coming round', (s) => { s.nomovemsg = 'You are conscious again.'; }],
    ];
    for (const [name, configure] of unawareHeroes) {
        const unaware = hungerState();
        unaware.multi = -1;
        configure(unaware);
        const draws = [];
        // rn2(10) = 2, one of the nine values that skip the decrement. The
        // rn2(20) = 2 that follows is even and lands on no accessory case, so
        // this turn costs the hero nothing at all.
        assert.equal(await gethungry(unaware, {
            random: { rn2: (bound) => { draws.push(bound); return 2; } },
            nearCapacity: () => UNENCUMBERED,
        }), 0, name);
        // The slow-rate draw comes first: C evaluates `!Unaware || !rn2(10)`
        // before the accessorytime assignment two statements below.
        assert.deepEqual(draws, [10, 20], name);
        assert.equal(unaware.u.uhunger, 900, name);
    }

    // The tenth turn, where rn2(10) comes up 0 and the sleeping hero pays the
    // ordinary point after all. rn2(20) = 0 is even and reaches the
    // Slow_digestion accessory case, which this hero does not have.
    for (const [name, configure] of unawareHeroes) {
        const unaware = hungerState();
        unaware.multi = -1;
        configure(unaware);
        const draws = [];
        assert.equal(await gethungry(unaware, {
            random: { rn2: (bound) => { draws.push(bound); return 0; } },
            nearCapacity: () => UNENCUMBERED,
        }), 1, name);
        assert.deepEqual(draws, [10, 20], name);
        assert.equal(unaware.u.uhunger, 899, name);
    }

    // C's `&&` chain puts the draw ahead of the three diet flags and
    // Slow_digestion, so a sleeping hero who could not have eaten anyway still
    // spends it. PM_GHOST carries none of the three flags.
    const dietless = hungerState();
    dietless.multi = -1;
    dietless.u.usleep = 1;
    dietless.youmonst.data = dietless.mons[PM_GHOST];
    const dietlessDraws = [];
    assert.equal(await gethungry(dietless, {
        random: { rn2: (bound) => { dietlessDraws.push(bound); return 0; } },
        nearCapacity: () => UNENCUMBERED,
    }), 0);
    assert.deepEqual(dietlessDraws, [10, 20]);
    assert.equal(dietless.u.uhunger, 900);

    // The prayer's own state: immobile for three turns with a message waiting
    // that says nothing about waking up. C answers Unaware FALSE here, so the
    // turn costs the ordinary point and draws only the rn2(20) accessory roll.
    const praying = hungerState();
    praying.multi = -3;
    praying.nomovemsg = 'You finish your prayer.';
    const prayingDraws = [];
    // rn2(20) = 2 is even and lands on no accessory case, so the only cost is
    // the ordinary decrement the refusal used to suppress.
    assert.equal(await gethungry(praying, {
        random: { rn2: (bound) => { prayingDraws.push(bound); return 2; } },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.deepEqual(prayingDraws, [20]);
    assert.equal(praying.u.uhunger, 899);

    // A hero with no message scheduled at all: C's `gn.nomovemsg &&` guard
    // makes trap.c unconscious() answer FALSE, so this is not Unaware either.
    const silent = hungerState();
    silent.multi = -1;
    assert.equal(await gethungry(silent, {
        random: { rn2: () => 2 },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.equal(silent.u.uhunger, 899);

    // A hero free to act this turn is awake even while a waking message is
    // still queued behind them, so the slow-rate draw is not spent. Which of
    // the two tests rejects the state is not decided here: trap.c
    // unconscious() returns FALSE for a non-negative gm.multi before eat.c's
    // own `gm.multi < 0` term is consulted, so either one alone answers this
    // case. eat.c's term is load-bearing only for is_fainted(), the half the
    // block below shows is unreachable.
    const freed = hungerState();
    freed.multi = 0;
    freed.nomovemsg = 'You awake from your slumber.';
    const freedDraws = [];
    assert.equal(await gethungry(freed, {
        random: { rn2: (bound) => { freedDraws.push(bound); return 2; } },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.deepEqual(freedDraws, [20]);
    assert.equal(freed.u.uhunger, 899);

    // FAINTED is a valid hysteresis status. Negative multi takes the
    // Unaware metabolic draw before the accessory-time draw.
    for (const multi of [0, -1]) {
        const fainted = hungerState();
        fainted.multi = multi;
        fainted.u.uhs = FAINTED;
        fainted.u.uhunger = -5; // Rounded quotient -1 gives the d21 faint gate.
        const draws = [];
        await gethungry(fainted, {
            random: { rn2: (bound) => { draws.push(bound); return 19; } },
            nearCapacity: () => UNENCUMBERED,
            statusRefresh: async () => {},
        });
        assert.deepEqual(draws, multi < 0 ? [10, 20, 21] : [20, 21]);
        assert.equal(fainted.u.uhs, FAINTED);
    }

});

test('gethungry validates ring data and hunger callbacks before RNG',
    async () => {
    const missingRing = hungerState();
    missingRing.uleft = { otyp: RIN_ADORNMENT, spe: 1 };
    missingRing.objects[RIN_ADORNMENT] = undefined;
    const missingRingDraws = [];
    await assert.rejects(
        gethungry(missingRing, {
            random: {
                rn2: (bound) => { missingRingDraws.push(bound); return 4; },
            },
            nearCapacity: () => UNENCUMBERED,
        }),
        /requires object data for ring/u,
    );
    assert.deepEqual(missingRingDraws, []);
    assert.equal(missingRing.u.uhunger, 900);
});

test('gethungry owns the first increasing hunger transition in source order',
    async () => {
        const threshold = hungerState();
        threshold.u.uhunger = 151;
        const events = [];

        assert.equal(await gethungry(threshold, {
            random: {
                rn2(bound) {
                    events.push(`rn2(${bound})`);
                    return 2;
                },
            },
            nearCapacity: () => UNENCUMBERED,
            async message(text) {
                events.push(`message:${text}`);
            },
            endRunning() {
                events.push('end_running');
            },
            async statusRefresh() {
                events.push('bot');
            },
        }), 1);
        assert.equal(threshold.u.uhunger, 150);
        assert.equal(threshold.u.uhs, HUNGRY);
        assert.equal(threshold.disp.botl, true);
        assert.deepEqual(events, [
            'rn2(20)',
            'message:You are beginning to feel hungry.',
            'end_running',
            'bot',
        ]);

        // newuhs()'s HUNGRY arm prints and ends a run as well as writing the
        // status line, so the preflight rejects a caller missing any of the
        // three, and does so before the rn2(20) draw.
        for (const missing of ['message', 'endRunning', 'statusRefresh']) {
            const incomplete = hungerState();
            incomplete.u.uhunger = 151;
            const env = {
                random: {
                    rn2: () => assert.fail('the preflight draws nothing'),
                },
                nearCapacity: () => UNENCUMBERED,
                message: () => {},
                endRunning: () => {},
                statusRefresh: () => {},
            };
            delete env[missing];
            await assert.rejects(
                gethungry(incomplete, env),
                new RegExp(`requires ${missing}`, 'u'),
            );
            assert.equal(incomplete.u.uhunger, 151);
        }
    });

test('gethungry drops out of SATIATED with no message and no run to end',
    async () => {
        const satiated = hungerState();
        // newuhs() reads SATIATED above 1000 nutrition, so 1001 is the lowest
        // value one point of ordinary loss takes out of it. doeat() is what
        // puts a hero here: three of the Knight's apples pass 1000.
        satiated.u.uhunger = 1001;
        satiated.u.uhs = SATIATED;
        const events = [];

        assert.equal(await gethungry(satiated, {
            random: {
                rn2(bound) {
                    events.push(`rn2(${bound})`);
                    return 2;
                },
            },
            nearCapacity: () => UNENCUMBERED,
            async message(text) {
                events.push(`message:${text}`);
            },
            endRunning() {
                events.push('end_running');
            },
            async statusRefresh() {
                events.push('bot');
            },
        }), 1);
        assert.equal(satiated.u.uhunger, 1000);
        assert.equal(satiated.u.uhs, NOT_HUNGRY);
        assert.equal(satiated.disp.botl, true);
        // newuhs()'s switch has a case for HUNGRY and one for WEAK and no
        // other, so bot() is this transition's whole output: no pline() and no
        // end_running().
        assert.deepEqual(events, ['rn2(20)', 'bot']);
        // SATIATED and NOT_HUNGRY are both below WEAK, so neither of
        // newuhs()'s two ATEMP arms fires.
        assert.equal(satiated.u.atemp[A_STR], 0);

        // bot() is the whole output, so a caller that cannot supply it is
        // rejected before the rn2(20) draw rather than part way through.
        const noStatusRefresh = hungerState();
        noStatusRefresh.u.uhunger = 1001;
        noStatusRefresh.u.uhs = SATIATED;
        await assert.rejects(
            gethungry(noStatusRefresh, {
                random: {
                    rn2: () => assert.fail('the preflight draws nothing'),
                },
                nearCapacity: () => UNENCUMBERED,
            }),
            /requires statusRefresh/u,
        );
        assert.equal(noStatusRefresh.u.uhunger, 1001);
    });

test('gethungry awaits transition output before later state and status work',
    async () => {
        const threshold = hungerState();
        threshold.u.uhunger = 151;
        const events = [];
        let releaseMessage;
        let releaseStatus;
        const messageGate = new Promise((resolve) => {
            releaseMessage = resolve;
        });
        const statusGate = new Promise((resolve) => {
            releaseStatus = resolve;
        });

        const transition = gethungry(threshold, {
            random: { rn2: () => 2 },
            nearCapacity: () => UNENCUMBERED,
            message() {
                events.push('message');
                return messageGate;
            },
            endRunning() {
                events.push('end_running');
            },
            statusRefresh() {
                events.push('bot');
                return statusGate;
            },
        });
        await Promise.resolve();
        assert.deepEqual(events, ['message']);
        assert.equal(threshold.u.uhs, NOT_HUNGRY);

        releaseMessage();
        await Promise.resolve();
        await Promise.resolve();
        assert.deepEqual(events, ['message', 'end_running', 'bot']);
        assert.equal(threshold.u.uhs, HUNGRY);

        releaseStatus();
        assert.equal(await transition, 1);
    });

test('gethungry owns HUNGRY to WEAK state and output in source order',
    async () => {
        const threshold = hungerState();
        threshold.u.uhunger = 51;
        threshold.u.uhs = HUNGRY;
        const events = [];

        assert.equal(await gethungry(threshold, {
            random: { rn2: () => 2 },
            nearCapacity: () => UNENCUMBERED,
            message(text) {
                events.push(`message:${text}:str${threshold.u.atemp[A_STR]}`);
            },
            endRunning() {
                events.push('end_running');
            },
            statusRefresh() {
                events.push(`bot:${threshold.u.uhs}`);
            },
        }), 1);

        assert.equal(threshold.u.uhunger, 50);
        assert.equal(threshold.u.uhs, WEAK);
        assert.equal(threshold.u.atemp[A_STR], -1);
        assert.equal(threshold.disp.botl, true);
        assert.deepEqual(events, [
            'message:You are beginning to feel weak.:str-1',
            'end_running',
            `bot:${WEAK}`,
        ]);
    });

test('weakness messages preserve hallucination, role, and race branches',
    async () => {
        for (const [name, configure, expected] of [
            [
                'hallucinating',
                (stateValue) => {
                    property(stateValue, HALLUC).intrinsic = FROMOUTSIDE;
                },
                'The munchies are interfering with your motor capabilities.',
            ],
            [
                // youprop.h:116 spells Hallucination's positive term
                // u.uprops[HALLUC].intrinsic, and there is no EHallucination,
                // so an extrinsic-only value is not hallucination and the
                // plain wording stands. W_TOOL stands for a worn source;
                // nothing in C writes this slot, so no recorded case can tell
                // the two reads apart.
                'hallucination as an extrinsic only',
                (stateValue) => {
                    property(stateValue, HALLUC).extrinsic = W_TOOL;
                },
                'You are beginning to feel weak.',
            ],
            [
                'Wizard',
                (stateValue) => {
                    stateValue.urole = {
                        mnum: PM_WIZARD,
                        name: { m: 'Wizard' },
                    };
                },
                'Wizard needs food, badly!',
            ],
            [
                'Valkyrie',
                (stateValue) => {
                    stateValue.urole = {
                        mnum: PM_VALKYRIE,
                        name: { m: 'Valkyrie' },
                    };
                },
                'Valkyrie needs food, badly!',
            ],
            [
                'Elf',
                (stateValue) => {
                    stateValue.urace = { mnum: PM_ELF };
                },
                'Elf needs food, badly!',
            ],
        ]) {
            const threshold = hungerState();
            threshold.u.uhunger = 51;
            threshold.u.uhs = HUNGRY;
            configure(threshold);
            const messages = [];

            await gethungry(threshold, {
                random: { rn2: () => 2 },
                nearCapacity: () => UNENCUMBERED,
                message: (text) => messages.push(text),
                endRunning: () => {},
                statusRefresh: () => {},
            });

            assert.deepEqual(messages, [expected], name);
        }
    });

test('gethungry admits low-loss ticks and reaches fainting after larger losses',
    async () => {
    const lowLoss = hungerState();
    lowLoss.u.uhunger = 152;
    const lowLossDraws = [];

    assert.equal(await gethungry(lowLoss, {
        random: {
            rn2(bound) {
                lowLossDraws.push(bound);
                return 2;
            },
        },
        nearCapacity: () => UNENCUMBERED,
    }), 1);
    assert.deepEqual(lowLossDraws, [20]);
    assert.equal(lowLoss.u.uhunger, 151);
    assert.equal(lowLoss.u.uhs, NOT_HUNGRY);

    const fainting = hungerState();
    fainting.context = {};
    property(fainting, LEVITATION); // LEVITATION is inactive in this source fixture.
    fainting.u.uhunger = 2; // Ordinary + regeneration + burden crosses zero.
    fainting.u.uhs = WEAK;
    property(fainting, REGENERATION).intrinsic = FROMOUTSIDE;
    const faintDraws = [];
    await gethungry(fainting, {
        random: { rn2: (bound) => { faintDraws.push(bound); return 1; } },
        nearCapacity: () => MOD_ENCUMBER,
        message: async () => {}, statusRefresh: async () => {},
    });
    assert.deepEqual(faintDraws, [20], 'first faint skips the newuhs gate');
    assert.equal(fainting.u.uhunger, -1);
    assert.equal(fainting.u.uhs, FAINTED);

});

test('spinach tins clear species and do not draw', () => {
    const obj = { corpsenm: PM_KOBOLD, spe: 0 };
    set_tin_variety(obj, SPINACH_TIN, {
        state: state(),
        random: { rn2: () => assert.fail('spinach does not draw') },
    });
    assert.deepEqual(obj, { corpsenm: NON_PM, spe: 1 });
});

test('random rotten tins become homemade for nonrotting corpses', () => {
    for (const corpsenm of [PM_LIZARD, PM_LICHEN]) {
        const obj = { corpsenm, spe: 0 };
        set_tin_variety(obj, RANDOM_TIN, {
            state: state(),
            random: { rn2: (bound) => {
                assert.equal(bound, 15);
                return 0;
            } },
        });
        assert.equal(obj.spe, -2);
    }
});

test('random ordinary meat preserves rotten variety', () => {
    const obj = { corpsenm: PM_KOBOLD, spe: 0 };
    set_tin_variety(obj, RANDOM_TIN, {
        state: state(),
        random: { rn2: () => 0 },
    });
    assert.equal(obj.spe, -1);
});

test('healthy tins replace meat and empty tins with spinach', () => {
    for (const corpsenm of [PM_KOBOLD, NON_PM]) {
        const obj = { corpsenm, spe: 0 };
        set_tin_variety(obj, HEALTHY_TIN, {
            state: state(),
            random: { rn2: () => assert.fail('replacement does not draw') },
        });
        assert.deepEqual(obj, { corpsenm: NON_PM, spe: 1 });
    }
});

test('healthy tins distinguish ghost-class corpses from unsolid wraiths', () => {
    const wraith = { corpsenm: PM_WRAITH, spe: 0 };
    set_tin_variety(wraith, HEALTHY_TIN, {
        state: state(),
        random: { rn2: () => assert.fail('wraith replacement does not draw') },
    });
    assert.deepEqual(wraith, { corpsenm: NON_PM, spe: 1 });

    const ghost = { corpsenm: PM_GHOST, spe: 0 };
    set_tin_variety(ghost, HEALTHY_TIN, {
        state: state(),
        random: { rn2: (bound) => {
            // Pickled is a health-food variety, so no retry is needed.
            assert.equal(bound, 15);
            return 4;
        } },
    });
    assert.deepEqual(ghost, { corpsenm: PM_GHOST, spe: -5 });
});

test('eating a guarding amulet applies its protection effect after More', async () => {
    const recipe = JSON.parse(readFileSync(
        new URL(
            '../recipes/eat.c/eat-accessory-levitation-independent.session.json',
            import.meta.url,
        ),
        'utf8',
    ));
    const replay = await runSegment(recipe.segments[0]);

    assert.equal(game.u.ublessed, 2);
    assert.ok(game.u.uprops[PROTECTION].intrinsic & FROMOUTSIDE);
    assert.ok(replay.getScreens().some((screen) => screen.includes(
        'Magic spreads through your body as you digest the amulet.',
    )));
});

test('a completed royal-jelly meal runs C fpostfx through done_eating',
    async () => {
        const cStart = EAT_C.indexOf('fpostfx(struct obj *otmp)\n{');
        const cEnd = EAT_C.indexOf(
            '\n#if 0\n/* intended for eating a spellbook', cStart,
        );
        assert.ok(cStart >= 0 && cEnd > cStart);
        const cBody = EAT_C.slice(cStart, cEnd);
        assert.match(cBody,
            /case LUMP_OF_ROYAL_JELLY:[\s\S]*?gainstr\(otmp, 1, TRUE\);[\s\S]*?rnd\(20\)[\s\S]*?rn2\(17\)[\s\S]*?heal_legs\(0\);/u);
        assert.match(cBody,
            /case EGG:[\s\S]*?flesh_petrifies[\s\S]*?poly_when_stoned[\s\S]*?polymon\(PM_STONE_GOLEM\)/u);
        const doneStart = EAT_C.indexOf('done_eating(boolean message)\n{');
        const doneEnd = EAT_C.indexOf('\nvoid\neating_conducts(', doneStart);
        assert.ok(doneStart >= 0 && doneEnd > doneStart);
        assert.match(EAT_C.slice(doneStart, doneEnd), /fpostfx\(piece\);/u);

        const recipe = JSON.parse(readFileSync(
            new URL(
                '../challenges/cases/v20/royal-jelly-consumption-effect-v20-selector-p-corrected.recipe.session.json',
                import.meta.url,
            ),
            'utf8',
        ));
        // The admitted C recording starts at strength 10 and its single
        // uncursed royal jelly raises strength to 11 through done_eating().
        const replay = await runSegment(recipe.segments[0]);
        assert.equal(game.u.acurr.a[A_STR], 11);
        assert.ok(replay.getScreens().some((screen) => screen.includes('St:11')));
        // The C recording has 42 screen boundaries, including the later wait
        // inputs after the completed meal.
        assert.equal(replay.getScreens().length, 42);
    });

// eat.c163-176 clears the shared restoration message before clearing the
// appearance, preserves an unrelated nomovemsg, and returns literal zero.
test('eatmdone releases only its message and resets any active disguise', async () => {
    const { eatmdone } = await import('../js/eat.js');
    assert.equal(typeof eatmdone, 'function');
    const { M_AP_NOTHING, M_AP_OBJECT } = await import('../js/const.js');
    const { GOLD_PIECE } = await import('../js/objects.js');
    const { resetGame } = await import('../js/gstate.js');
    resetGame(); // No map exists: glyph repaint is covered by recorded play.
    for (const matching of [true, false]) {
        const state = { eatmbuf: 'restoration message',
            nomovemsg: matching ? 'restoration message' : 'another action',
            u: { ux: 5, uy: 5 }, // An interior cell; no map in this isolated fixture.
            youmonst: { m_ap_type: M_AP_OBJECT, mappearance: GOLD_PIECE } };
        assert.equal(eatmdone(state), 0); // C eatmdone's literal return value.
        assert.equal(state.eatmbuf, null);
        assert.equal(state.nomovemsg, matching ? null : 'another action');
        assert.equal(state.youmonst.m_ap_type, M_AP_NOTHING);
        assert.equal(state.youmonst.mappearance, GOLD_PIECE,
            'C clears the appearance type, leaving mappearance unchanged');
    }
    const idle = { eatmbuf: null, nomovemsg: 'another action',
        youmonst: { m_ap_type: M_AP_NOTHING } };
    assert.equal(eatmdone(idle), 0);
    assert.equal(idle.nomovemsg, 'another action');
});

test('eatmdone and both cpostfx sites preserve C buffer and redraw order', () => {
    assert.match(EAT_C, /eatmdone\(void\)[\s\S]*gn\.nomovemsg == ge\.eatmbuf[\s\S]*ge\.eatmbuf = 0;[\s\S]*if \(U_AP_TYPE\)[\s\S]*m_ap_type = M_AP_NOTHING;[\s\S]*newsym\(u\.ux, u\.uy\);[\s\S]*return 0;/u);
    assert.match(EAT_JS, /export function eatmdone[\s\S]*state\.nomovemsg === state\.eatmbuf[\s\S]*state\.eatmbuf = null;[\s\S]*m_ap_type = M_AP_NOTHING;[\s\S]*if \(!env\.planning\)[\s\S]*env\.redraw \?\? newsym[\s\S]*return 0;/u);
    assert.match(EAT_JS, /if \(state\.eatmbuf\) eatmdone\(state\);/u);
    assert.match(EAT_JS, /state\.afternmv = eatmdone;/u);
    assert.doesNotMatch(EAT_JS, /note_unported\('eat\.c eatmdone'\)/u);
    assert.match(EAT_JS, /note_unported\('windows\.c display_nhwindow'\)/u,
        'the separate blocking map-window owner remains outside this task');
});
