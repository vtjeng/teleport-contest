// apply.c beautiful(): charisma thresholds and polymorphed gender determine
// the same adjective returned to use_mirror() and do_mgivenname().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CHA,
    BLINDED,
    COLNO,
    ECMD_TIME,
    FEMALE,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    GLIB,
    IN_SIGHT,
    HALLUC,
    OBJ_FLOOR,
    P_BASIC,
    P_EXPERT,
    P_FLAIL,
    P_SKILLED,
    P_NUM_SKILLS,
    P_UNSKILLED,
    ROWNO,
    TIMEOUT,
    W_TOOL,
} from '../js/const.js';
import {
    beautiful,
    can_grapple_location,
    grapple_menu_choice_to_hit,
    grapple_range,
    grapple_target_menu_items,
    leashable,
    number_leashed,
    o_unleash,
    touchstone_ok,
    use_towel,
} from '../js/apply.js';
import { c_obj_colors } from '../js/do_name.js';
import { game, resetGame } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import {
    M1_HUMANOID,
    M1_NOLIMBS,
    M1_NOHEAD,
    M1_UNSOLID,
    NON_PM,
    PM_LONG_WORM,
} from '../js/monsters.js';
import { heroIsBlind } from '../js/startup_a11y.js';
import { runSegment } from '../js/jsmain.js';
import {
    COIN_CLASS,
    GOLD_PIECE,
    BLINDFOLD,
    GEM_CLASS,
    GRAPPLING_HOOK,
    LEASH,
    RING_CLASS,
    TOWEL,
    TOOL_CLASS,
    objects_globals_init,
    RUBY,
} from '../js/objects.js';

const APPLY_C = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const APPLY_JS = readFileSync(new URL('../js/apply.js', import.meta.url), 'utf8');

test('use_towel awaits gulp_blnd_check before restoring blindness', () => {
    // apply.c:154 consumes the Boolean after cream removal; the helper became
    // async when it began awaiting gulpmu's source-owned effects.
    const cStart = APPLY_C.indexOf('\nuse_towel(struct obj *obj)');
    const cEnd = APPLY_C.indexOf('\n}\n', cStart) + 2;
    assert.notEqual(cStart, -1, 'apply.c must contain use_towel');
    assert.ok(cEnd > cStart, 'use_towel must have a complete C body');
    assert.match(APPLY_C.slice(cStart, cEnd),
        /if \(!gulp_blnd_check\(\)\)\s*\{[\s\S]*?make_blinded\(0L, TRUE\)/u);

    const jsStart = APPLY_JS.indexOf('export async function use_towel(');
    const jsEnd = APPLY_JS.indexOf('\n}\n', jsStart) + 2;
    assert.notEqual(jsStart, -1, 'js/apply.js must contain use_towel');
    assert.ok(jsEnd > jsStart, 'use_towel must have a complete JS body');
    assert.match(APPLY_JS.slice(jsStart, jsEnd),
        /if \(!await gulp_blnd_check\(state, env\)\)\s*\{[\s\S]*?await make_blinded\(0, true/u);
});

test('apply.c flip_coin drops a lost coin under Hallucination', async () => {
    // apply.c:doapply() dispatches COIN_CLASS to flip_coin(); the lose_coin
    // arm splits one coin, calls dropx(), and returns ECMD_TIME.
    assert.match(APPLY_C, /if \(obj->oclass == COIN_CLASS\)\s*return flip_coin\(obj\);/);
    assert.match(APPLY_C, /if \(lose_coin\) \{\s*if \(otmp->quan > 1L\)\s*otmp = splitobj\(otmp, 1L\);\s*dropx\(otmp\);\s*return ECMD_TIME;/);

    const recipe = JSON.parse(readFileSync(
        new URL('../recipes/apply.c/flip-coin-hallucination-blind-glib-drop-c55-pager-correction.session.json',
            import.meta.url),
        'utf8',
    ));
    let boundary = null;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });

    assert.equal(boundary, null);
    assert.ok(game.u.uprops[HALLUC].intrinsic & TIMEOUT);
    assert.ok(game.u.uprops[BLINDED].intrinsic & TIMEOUT);
    assert.ok(game.u.uprops[GLIB].intrinsic & TIMEOUT);

    let carriedGold = game.invent;
    while (carriedGold && carriedGold.otyp !== GOLD_PIECE)
        carriedGold = carriedGold.nobj;
    assert.ok(carriedGold);
    assert.equal(carriedGold.quan, 36); // The C recipe starts with 37 and loses one.

    let floorGold = game.level.objects[game.u.ux][game.u.uy];
    while (floorGold && floorGold.otyp !== GOLD_PIECE)
        floorGold = floorGold.nexthere;
    assert.ok(floorGold, 'the lost coin remains on the hero floor square');
    assert.equal(floorGold.quan, 1); // flip_coin() splits one coin before dropx().
    assert.equal(floorGold.where, OBJ_FLOOR);
});

function stateAtCharisma(charisma, female = false) {
    const state = resetGame();
    state.u = { acurr: { a: [10, 10, 10, 10, 10, charisma] } };
    state.youmonst = {
        data: { pmidx: NON_PM, mflags1: M1_HUMANOID, mflags2: 0 },
    };
    state.flags = { female };
    assert.equal(A_CHA, 5);
    return state;
}

test('beautiful() follows each apply.c charisma threshold', () => {
    const cases = [
        [3, 'hideous'],
        [4, 'ugly'],
        [6, 'homely'],
        [9, 'plain'],
        [11, 'cute'],
        [14, 'amiable'],
        [16, 'handsome'],
        [19, 'splendorous'],
        [25, 'sublime'],
    ];
    for (const [charisma, expected] of cases)
        assert.equal(beautiful(stateAtCharisma(charisma)), expected);
});

test('beautiful() uses poly_gender only in the two gendered ranges', () => {
    assert.equal(beautiful(stateAtCharisma(14, true)), 'winsome');
    assert.equal(beautiful(stateAtCharisma(16, true)), 'beautiful');
    assert.equal(beautiful(stateAtCharisma(19, true)), 'splendorous');
    assert.equal(FEMALE, 1);
});

test('number_leashed counts only active inventory leash objects', () => {
    const inactive = { otyp: LEASH, leashmon: 0, nobj: null };
    const other = { otyp: 99, leashmon: 14, nobj: inactive };
    const active = { otyp: LEASH, leashmon: 14, nobj: other };
    const second = { otyp: LEASH, leashmon: 27, nobj: active };
    assert.equal(number_leashed({ invent: second }), 2);
    assert.equal(number_leashed({ invent: inactive }), 0);
});

test('apply.c o_unleash clears the matching monster before refreshing inventory', () => {
    // apply.c:715-723 searches fmon by the object's id and always clears
    // leashmon, even when the matching monster has left the current level.
    const source = readFileSync(new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8');
    assert.match(source, /mtmp->m_id == \(unsigned\) otmp->leashmon/u);
    const other = { m_id: 14, mleashed: 1, nmon: null };
    const attached = { m_id: 27, mleashed: 1, nmon: other };
    const leash = { leashmon: 27 };
    const state = { level: { monlist: attached },
        program_state: { in_moveloop: true }, iflags: { perm_invent: true } };
    const refresh = [];
    o_unleash(leash, { state, hooks: { updateInventory() {
        refresh.push([leash.leashmon, attached.mleashed, other.mleashed]);
    } } });
    assert.deepEqual(refresh, [[0, 0, 1]]); // Both attachment owners clear before update_inventory.
    leash.leashmon = 41; // No monster has this id: object-side attachment still clears.
    o_unleash(leash, { state, hooks: { updateInventory() {} } });
    assert.equal(leash.leashmon, 0);
});

test('leashable follows apply.c species and anatomy checks', () => {
    const ordinary = { mnum: 1, data: { mflags1: 0 } };
    const longWorm = { mnum: PM_LONG_WORM, data: { mflags1: 0 } };
    const unsolidForm = { mnum: 2, data: { mflags1: M1_UNSOLID } };
    const limblessHeaded = { mnum: 3, data: { mflags1: M1_NOLIMBS } };
    const limblessHeadless = {
        mnum: 4, data: { mflags1: M1_NOLIMBS | M1_NOHEAD },
    };

    assert.equal(leashable(ordinary), true);
    assert.equal(leashable(longWorm), false);
    assert.equal(leashable(unsolidForm), false);
    assert.equal(leashable(limblessHeaded), true);
    assert.equal(leashable(limblessHeadless), false);
});

test('apply.c use_leash_core marks a cursed leash known before the pet-turn boundary',
    async () => {
    assert.match(APPLY_C,
        /else if \(obj->cursed\) \{\s*pline_The\("leash would not come off!"\);\s*set_bknown\(obj, 1\);\s*\}/);

    const recipe = JSON.parse(readFileSync(
        new URL('../recipes/apply.c/leash-starting-pet-cursed-refusal-b56.session.json',
            import.meta.url),
        'utf8',
    ));
    let boundary = null;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });

    assert.equal(game._ttyToplines, 'The leash would not come off!');
    let leash = game.invent;
    while (leash && leash.otyp !== LEASH) leash = leash.nobj;
    assert.ok(leash, 'the cursed leash remains in the hero inventory');
    assert.equal(leash.cursed, true);
    assert.equal(leash.bknown, true);
    assert.ok(leash.leashmon > 0, 'the refusal leaves the leash attached');
    assert.equal(boundary?.message,
        'simple monster action requires special starting-pet state');
});

test('apply.c use_leash strictly replays its independent attach and detach recording',
    async () => {
    const recording = JSON.parse(readFileSync(
        new URL('../recordings/apply.c/leash-starting-pet-attach-detach-b56.session.json',
            import.meta.url),
        'utf8',
    ));
    const cScreens = recording.segments[0].steps.map((step) => step.screen ?? '')
        .join('\n');
    assert.match(cScreens, /You slip the leash around your little dog\./);
    assert.match(cScreens, /You remove the leash from your little dog\./);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('apply.c use_leash matches the admitted v13 pet-leash case', async () => {
    const recording = JSON.parse(readFileSync(
        new URL('../challenges/cases/v13/pet-leash-attaches-to-tame-dog.session.json',
            import.meta.url),
        'utf8',
    ));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

function grappleState(skill) {
    const state = resetGame();
    objects_globals_init(state);
    state.u ??= {};
    state.u.ux = 10;
    state.u.uy = 10;
    state.u.twoweap = false;
    state.u.weapon_skills = Array.from({ length: P_NUM_SKILLS }, () => ({
        skill: P_UNSKILLED,
        max_skill: P_EXPERT,
        advance: 0,
    }));
    state.u.weapon_skills[P_FLAIL].skill = skill;
    state.uwep = { otyp: GRAPPLING_HOOK, oclass: TOOL_CLASS };
    state.viz_array = Array.from({ length: ROWNO }, () =>
        new Uint8Array(COLNO).fill(IN_SIGHT));
    return state;
}

test('grapple_range follows apply.c weapon-skill thresholds', () => {
    // apply.c:grapple_range() uses P_NONE/basic => 4, skilled => 5, and
    // expert/master/grand-master => 8. distu() compares square distance.
    const state = grappleState(P_BASIC);
    assert.equal(grapple_range(state), 4);
    state.u.weapon_skills[P_FLAIL].skill = P_UNSKILLED;
    assert.equal(grapple_range(state), 4);
    state.u.weapon_skills[P_FLAIL].skill = P_BASIC;
    assert.equal(grapple_range(state), 4);
    state.u.weapon_skills[P_FLAIL].skill = P_SKILLED;
    assert.equal(grapple_range(state), 5);
    state.u.weapon_skills[P_FLAIL].skill = P_EXPERT;
    assert.equal(grapple_range(state), 8);
});

test('can_grapple_location uses visible squares and C square-distance range', () => {
    // apply.c:can_grapple_location() requires isok(), cansee(), and distu() <=
    // grapple_range(); the diagonal case distinguishes dist2 from distmin.
    const state = grappleState(P_BASIC);
    assert.equal(can_grapple_location(12, 10, state), true);
    assert.equal(can_grapple_location(12, 11, state), false);
    state.viz_array[10][12] = 0;
    assert.equal(can_grapple_location(12, 10, state), false);
    assert.equal(can_grapple_location(COLNO, 10, state), false);
});

test('grappling hook skilled menu IDs select object, monster, and surface', () => {
    // apply.c:use_grapple() starts any.a_int at 1, increments before each
    // add_menu(), then subtracts 1 from the selected ID for its switch.
    const items = grapple_target_menu_items('floor');
    assert.deepEqual(items.map(({ text, value }) => [text, value]), [
        ['an object on the floor', 2],
        ['a monster', 3],
        ['the floor', 4],
    ]);
    assert.deepEqual(items.map(({ value }) => grapple_menu_choice_to_hit(value)),
        [1, 2, 3]);
});

test('touchstone_ok follows apply.c target ranks and identification flags', () => {
    const state = {};
    objects_globals_init(state);
    const ruby = { oclass: GEM_CLASS, otyp: RUBY, dknown: 1 };

    // apply.c:2658-2675. The callback is pure: NULL is excluded, coins and
    // unidentified gems are suggested, and ordinary identified objects are
    // accepted only as downplayed selections.
    assert.equal(touchstone_ok(null, state), GETOBJ_EXCLUDE);
    assert.equal(touchstone_ok({ oclass: COIN_CLASS }, state), GETOBJ_SUGGEST);
    assert.equal(touchstone_ok(ruby, state), GETOBJ_SUGGEST);

    state.objects[RUBY].oc_name_known = 1;
    assert.equal(touchstone_ok(ruby, state), GETOBJ_DOWNPLAY);
    ruby.dknown = 0;
    assert.equal(touchstone_ok(ruby, state), GETOBJ_SUGGEST);
    assert.equal(touchstone_ok({ oclass: RING_CLASS }, state), GETOBJ_DOWNPLAY);
});

test('c_obj_colors preserves decl.c streak names', () => {
    // decl.c:20-37. These exact names are also used by apply.c:use_stone().
    assert.deepEqual(c_obj_colors, [
        'black', 'red', 'green', 'brown', 'blue', 'magenta', 'cyan', 'gray',
        'transparent', 'orange', 'bright green', 'yellow', 'bright blue',
        'bright magenta', 'bright cyan', 'white',
    ]);
});

test('apply.c use_mirror matches the admitted v8 monster-reflection case', async () => {
    const recording = JSON.parse(readFileSync(
        new URL('../challenges/cases/v8/mirror-monster-reflection.session.json', import.meta.url),
        'utf8',
    ));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('apply.c dorub reaches use_stone through the independent #rub recording',
    async () => {
        const recording = JSON.parse(readFileSync(
            new URL('../recordings/apply.c/touchstone-rub-independent.session.json',
                import.meta.url),
            'utf8',
        ));
        const js = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, js);
        assert.equal(result.passed, true, JSON.stringify(result));
    });

test('apply.c doapply dispatches TIN_OPENER through use_tin_opener', async () => {
    // This admitted v16 case chooses the Tin Opener at step 30, then selects
    // spinach at step 32 so the complete apply.c -> eat.c path is exercised.
    assert.match(APPLY_C,
        /case TIN_OPENER:\s*res = use_tin_opener\(obj\);\s*break;/u);
    const recording = JSON.parse(readFileSync(
        new URL('../challenges/cases/v16/wizard-applies-tin-opener-to-spinach-tin.session.json',
            import.meta.url),
        'utf8',
    ));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('apply.c use_towel matches the selected v8 caller replay', async () => {
    const recording = JSON.parse(readFileSync(
        new URL('../challenges/cases/v8/towel-clean-face.session.json',
            import.meta.url),
        'utf8',
    ));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('apply.c use_grapple matches the admitted v13 no-object target case', async () => {
    const recording = JSON.parse(readFileSync(
        new URL('../challenges/cases/v13/grappling-hook-finds-no-object.session.json',
            import.meta.url),
        'utf8',
    ));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('apply.c use_towel preserves cursed glib RNG and timeout order', async () => {
    await runSegment({
        seed: 83015137,
        datetime: '20310304123456',
        nethackrc: 'OPTIONS=name:B30Towel,role=Wizard,race=human,gender=female,align=neutral,playmode=debug,!legacy,!tutorial,!splash_screen,showexp,time,pettype:none\n',
        moves: '',
    });
    const towel = { otyp: TOWEL, cursed: 1, spe: 0 };
    const calls = [];
    const messages = [];
    game.unported = new Set();
    const result = await use_towel(towel, game, {
        message: async (text) => { messages.push(text); },
        random: {
            rn2(bound) {
                calls.push(`rn2(${bound})`);
                return bound === 3 ? 2 : 5;
            },
            rn1(bound, base) {
                calls.push(`rn1(${bound},${base})`);
                return base + 5;
            },
        },
    });
    assert.deepEqual(calls, ['rn2(3)', 'rn1(10,3)']);
    assert.deepEqual(messages, ['Your hands get slimy!']);
    assert.equal(game.u.uprops[GLIB].intrinsic & TIMEOUT, 8);
    assert.equal(result, ECMD_TIME);
    assert.equal(game.unported.has('apply.c dry_a_towel'), false);
});

test('apply.c use_towel clears cream before its engulfing-blindness check',
    async () => {
    await runSegment({
        seed: 83015144,
        datetime: '20310506120000',
        nethackrc: 'OPTIONS=name:B30Cream,role=Rogue,race=human,gender=female,align=chaotic,playmode=debug,!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '',
    });
    const messages = [];
    game.unported = new Set();
    game.u.ucreamed = 3;
    game.u.uprops[BLINDED].intrinsic = 3;
    game.u.uswallow = false;

    const result = await use_towel({
        otyp: TOWEL,
        cursed: 0,
        spe: 0,
    }, game, {
        message: async (text) => { messages.push(text); },
    });

    assert.equal(game.u.ucreamed, 0);
    assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
    assert.deepEqual(messages, [
        "You've got the glop off.",
        'You can see again.',
    ]);
    assert.equal(game.unported.has('mhitu.c gulpmu'), false);
    assert.equal(result, ECMD_TIME);
});

test('apply.c use_towel tests C Blinded, not the broader Blind macro',
    async () => {
    const cases = [
        {
            name: 'extrinsic blindfold',
            seed: 83015145,
            datetime: '20310507120000',
            extrinsic: W_TOOL,
            blocked: 0,
            blindfold: { otyp: BLINDFOLD, owornmask: W_TOOL },
            cBlind: true,
        },
        {
            name: 'blocked intrinsic blindness',
            seed: 83015146,
            datetime: '20310508120000',
            extrinsic: 0,
            blocked: W_TOOL,
            blindfold: null,
            cBlind: false,
        },
    ];

    for (const c of cases) {
        await runSegment({
            seed: c.seed,
            datetime: c.datetime,
            nethackrc: 'OPTIONS=name:B30Blind,role=Rogue,race=human,gender=female,align=chaotic,playmode=debug,!legacy,!tutorial,!splash_screen,pettype:none\n',
            moves: '',
        });
        const prop = game.u.uprops[BLINDED];
        prop.intrinsic = 3;
        prop.extrinsic = c.extrinsic;
        prop.blocked = c.blocked;
        game.ublindf = c.blindfold;
        game.u.ucreamed = 3;
        game.u.uswallow = false;
        game.unported = new Set();
        assert.equal(heroIsBlind(game), c.cBlind, `${c.name}: broad Blind state`);

        const messages = [];
        const result = await use_towel({
            otyp: TOWEL,
            cursed: 0,
            spe: 0,
        }, game, { message: async (text) => { messages.push(text); } });

        assert.equal(game.u.ucreamed, 0, c.name);
        assert.equal(messages[0], "You've got the glop off.", c.name);
        assert.equal(messages.includes('Your face feels clean now.'), false, c.name);
        assert.equal(result, ECMD_TIME, c.name);
    }
});
