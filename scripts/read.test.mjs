import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CONFUSION, ECMD_TIME, GETOBJ_DOWNPLAY, GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE, GETOBJ_SUGGEST, G_GENOD, IN_SIGHT,
    ROOM, SPE_LIM, W_RINGL,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    cap_spe,
    can_center_cloud,
    charge_ok,
    recharge,
    seffect_identify,
    seffect_amnesia,
    seffects,
} from '../js/read.js';
import { G_NOCORPSE, PM_NEWT, PM_WIZARD } from '../js/monsters.js';
import {
    MAGIC_MARKER, SCR_CHARGING, SCR_FOOD_DETECTION,
    SCR_GOLD_DETECTION, SCR_SCARE_MONSTER,
    SCR_IDENTIFY, SCR_TAMING, SCROLL_CLASS, SPBOOK_CLASS,
    SPE_CAUSE_FEAR, SPE_CHARM_MONSTER, SPE_DETECT_FOOD,
    SPE_IDENTIFY, BELL_OF_OPENING, MAGIC_LAMP, OIL_LAMP, PICK_AXE,
    SPE_FORCE_BOLT, SPE_HEALING,
    RING_CLASS, RIN_ADORNMENT, RIN_CONFLICT, TOOL_CLASS, WAND_CLASS,
    WAN_FIRE, WEAPON_CLASS,
} from '../js/objects.js';
import { spelleffects } from '../js/spell.js';
import { addinv } from '../js/invent.js';
import { mksobj, objectType } from '../js/obj.js';
import { Ring_on, setwornEnv } from '../js/do_wear.js';
import { setworn } from '../js/worn.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { P_BARE_HANDED_COMBAT } from '../js/const.js';
import { skillSlot } from '../js/startup_skills.js';

async function replayGenocideRecipe(name, gender) {
    const recipe = JSON.parse(readFileSync(new URL(
        `../recipes/${name}.session.json`, import.meta.url,
    ), 'utf8'));
    assert.equal(recipe.segments.length, 1);
    let segment = recipe.segments[0];
    if (gender) {
        const nethackrc = segment.nethackrc.replace(
            /gender:(?:male|female)/u,
            `gender:${gender}`,
        );
        assert.match(nethackrc, new RegExp(`gender:${gender}`, 'u'));
        segment = { ...segment, nethackrc };
    }
    const session = await runSegment(segment);
    return { session, state: game };
}

async function emptyTamingWorld(seed) {
    await runSegment({
        seed,
        datetime: '20310908070605',
        nethackrc: [
            'OPTIONS=name:Tamer,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });

    // read.c:seffect_taming() scans the adjacent square ring, plus the steed
    // fallback under the hero. Empty it so this test pins its no-target arm.
    const grid = game.level.monsters;
    for (let x = 0; x < grid.length; ++x)
        for (let y = 0; y < grid[x].length; ++y)
            grid[x][y] = null;
    game.u.uswallow = 0;
    game.u.ustuck = null;
    game.u.usteed = null;
    game.gk = {};
    game._pending_message = '';
}

async function emptyScareWorld(seed) {
    await emptyTamingWorld(seed);
    for (let monster = game.level?.monlist ?? game.fmon;
        monster; monster = monster.nmon)
        monster.mhp = 0;
    if (game.level) game.level.monlist = null;
    game.fmon = null;
}

function scareScroll(otyp = SCR_SCARE_MONSTER, cursed = false) {
    return {
        otyp,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed,
        quan: 1,
    };
}

test('read.c seffect_taming handles an empty nearby-monster scan', async () => {
    await emptyTamingWorld(8080051);
    await seffects({
        otyp: SCR_TAMING,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: false,
        quan: 1,
    }, game);

    assert.equal(game._pending_message, 'Nothing interesting happens.');
    assert.equal(game.gk.known, undefined);
});

async function emptyDetectionWorld(seed) {
    await runSegment({
        seed,
        datetime: '20310908070605',
        nethackrc: 'OPTIONS=name:Detect,role:Wizard,race:human,'
            + 'gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '.',
    });
    game.level.objlist = null;
    game.level.buriedobjlist = null;
    game.level.monlist = null;
    game.level.traps = [];
    game.fmon = null;
    game.invent = null;
    game.flags.beginner = false;
    game._pending_message = '';
}

test('read.c detection wrappers propagate their consumed-object result', async () => {
    await emptyDetectionWorld(9876511);
    const goldScroll = {
        otyp: SCR_GOLD_DETECTION,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: false,
        dknown: false,
        quan: 20,
        spe: 0,
    };
    assert.equal(await seffects(goldScroll, game), 1);
    assert.equal(goldScroll.quan, 19);
    assert.equal(game.gk.known, false);

    await emptyDetectionWorld(9876513);
    const foodScroll = {
        otyp: SCR_FOOD_DETECTION,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: false,
        dknown: false,
        quan: 20,
        spe: 0,
    };
    assert.equal(await seffects(foodScroll, game), 1);
    assert.equal(foodScroll.quan, 19);
    assert.equal(game.gk.known, false);

    await emptyDetectionWorld(9876517);
    const foodSpell = {
        otyp: SPE_DETECT_FOOD,
        oclass: SPBOOK_CLASS,
        blessed: false,
        cursed: false,
        dknown: false,
        quan: 20,
        spe: 0,
    };
    assert.equal(await seffects(foodSpell, game), 1);
    assert.equal(game.gk.known, false);
});

test('read.c cursed gold detection selects the trap detector and consumes its scroll', async () => {
    await emptyDetectionWorld(9876519);
    const goldScroll = {
        otyp: SCR_GOLD_DETECTION,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: true,
        dknown: false,
        quan: 20,
        spe: 0,
    };

    assert.equal(await seffects(goldScroll, game), 1);
    assert.equal(goldScroll.quan, 19);
    assert.equal(game.gk.known, undefined);
    assert.match(game._pending_message, /stop itching/);
});

test('read.c recharge restores wand charges and counts a successful attempt',
    async () => {
        await emptyDetectionWorld(9876520);
        const wand = mksobj(WAN_FIRE, false, false, { state: game });
        wand.spe = 0;
        wand.recharged = 0;

        await recharge(wand, 0, game);

        // read.c:recharge uses rn1(5, 4), then rnd(n) for an uncursed
        // scroll. A wand of fire has lim=8, so one recharge yields 4..8.
        assert.ok(wand.spe >= 4 && wand.spe <= 8);
        assert.equal(wand.recharged, 1);
    });

test('read.c recharge strips cursed wand and marker charges without RNG',
    async () => {
        await emptyDetectionWorld(9876522);
        const wand = mksobj(WAN_FIRE, false, false, { state: game });
        wand.spe = 4;
        wand.recharged = 0;
        await recharge(wand, -1, game);
        assert.equal(wand.spe, 0);
        assert.equal(wand.recharged, 1);

        const marker = mksobj(MAGIC_MARKER, false, false, { state: game });
        marker.spe = 12;
        marker.recharged = 0;
        await recharge(marker, -1, game);
        assert.equal(marker.spe, 0);
        assert.equal(marker.recharged, 1);
    });

test('read.c recharge removes and restores a charged worn ring in source order',
    async () => {
        await emptyDetectionWorld(9876526);
        const ring = mksobj(RIN_ADORNMENT, false, false, { state: game });
        ring.spe = 0;
        ring.recharged = 0;
        setworn(ring, W_RINGL, setwornEnv(game));
        await Ring_on(ring, game);

        await recharge(ring, 0, game);

        // read.c calls Ring_off before changing spe, then setworn/Ring_on.
        assert.equal(ring.spe, 1);
        assert.equal(game.uleft, ring);
        assert.equal(ring.owornmask & W_RINGL, W_RINGL);
    });

test('read.c cap_spe limits a blessed magic marker to SPE_LIM', async () => {
    await emptyDetectionWorld(9876528);
    const marker = mksobj(MAGIC_MARKER, false, false, { state: game });
    marker.spe = 98;
    marker.recharged = 0;

    await recharge(marker, 1, game);

    // read.c cap_spe() clamps any result beyond the source SPE_LIM (+99).
    assert.equal(marker.spe, SPE_LIM);
});

test('read.c cap_spe clamps both signs and preserves in-range values', () => {
    const tooPositive = { spe: SPE_LIM + 4 };
    cap_spe(tooPositive);
    assert.equal(tooPositive.spe, SPE_LIM);

    const tooNegative = { spe: -SPE_LIM - 4 };
    cap_spe(tooNegative);
    assert.equal(tooNegative.spe, -SPE_LIM);

    const inRange = { spe: -SPE_LIM };
    cap_spe(inRange);
    assert.equal(inRange.spe, -SPE_LIM);
    assert.equal(cap_spe(null), undefined);
});

test('read.c seffect_enchant_weapon uses the shared cap_spe helper', () => {
    const cSource = readFileSync(new URL(
        '../nethack-c/upstream/src/read.c', import.meta.url,
    ), 'utf8');
    const cStart = cSource.indexOf(
        'seffect_enchant_weapon(struct obj **sobjp)\n{',
    );
    const cEnd = cSource.indexOf('\nstaticfn void\nseffect_taming', cStart);
    assert.notEqual(cStart, -1);
    assert.notEqual(cEnd, -1);
    assert.match(cSource.slice(cStart, cEnd), /if \(uwep\)\s*cap_spe\(uwep\);/u);

    const jsSource = readFileSync(new URL('../js/read.js', import.meta.url), 'utf8');
    const jsStart = jsSource.indexOf('export async function seffect_enchant_weapon(');
    const jsEnd = jsSource.indexOf('// C ref: shk.c costly_alteration()', jsStart);
    assert.notEqual(jsStart, -1);
    assert.notEqual(jsEnd, -1);
    assert.match(jsSource.slice(jsStart, jsEnd), /if \(state\.uwep\)\s*cap_spe\(state\.uwep\);/u);
});

test('read.c charge_ok preserves its ordered getobj classifications', async () => {
    await emptyTamingWorld(8080081);
    assert.equal(charge_ok(null), GETOBJ_EXCLUDE);
    assert.equal(charge_ok({ oclass: WAND_CLASS, otyp: 0 }), GETOBJ_SUGGEST);

    const ringType = objectType(RIN_ADORNMENT, game);
    const previousRingKnowledge = ringType.oc_name_known;
    ringType.oc_name_known = true;
    assert.equal(charge_ok({
        oclass: RING_CLASS, otyp: RIN_ADORNMENT, dknown: true,
    }), GETOBJ_SUGGEST);
    assert.equal(charge_ok({
        oclass: RING_CLASS, otyp: RIN_ADORNMENT, dknown: false,
    }), GETOBJ_EXCLUDE_SELECTABLE);
    ringType.oc_name_known = previousRingKnowledge;

    assert.equal(charge_ok({ oclass: TOOL_CLASS, otyp: PICK_AXE }),
        GETOBJ_EXCLUDE);
    assert.equal(charge_ok({ oclass: TOOL_CLASS, otyp: OIL_LAMP }),
        GETOBJ_SUGGEST);

    const bellType = objectType(BELL_OF_OPENING, game);
    const previousBellKnowledge = bellType.oc_name_known;
    bellType.oc_name_known = true;
    assert.equal(charge_ok({
        oclass: TOOL_CLASS, otyp: BELL_OF_OPENING, dknown: false,
    }), GETOBJ_DOWNPLAY);
    assert.equal(charge_ok({
        oclass: TOOL_CLASS, otyp: BELL_OF_OPENING, dknown: true,
    }), GETOBJ_SUGGEST);
    bellType.oc_name_known = previousBellKnowledge;

    const lampType = objectType(MAGIC_LAMP, game);
    const previousLampKnowledge = lampType.oc_name_known;
    lampType.oc_name_known = false;
    assert.equal(charge_ok({ oclass: TOOL_CLASS, otyp: MAGIC_LAMP }),
        GETOBJ_SUGGEST);
    lampType.oc_name_known = previousLampKnowledge;

    assert.equal(charge_ok({ oclass: WEAPON_CLASS, otyp: 0 }),
        GETOBJ_EXCLUDE_SELECTABLE);
});

test('read.c confused charging scroll changes energy and remains unconsumed',
    async () => {
        await emptyDetectionWorld(9876524);
        game.u.uprops[CONFUSION] ??= {};
        game.u.uprops[CONFUSION].intrinsic = 1;
        game.u.uenmax = 40;
        game.u.uen = 40;
        const scroll = mksobj(SCR_CHARGING, false, false, { state: game });
        scroll.oclass = SCROLL_CLASS;
        scroll.quan = 1;
        scroll.cursed = false;
        scroll.blessed = false;

        assert.equal(await seffects(scroll, game), 0);
        assert.equal(scroll.quan, 1);
        assert.ok(game.u.uen >= 40);
        assert.equal(game.disp.botl, true);
    });

test('read.c seffect_identify consumes an unknown cursed scroll before returning',
    async () => {
        await emptyDetectionWorld(9876521);
        game.objects[SCR_IDENTIFY].oc_name_known = false;
        const scroll = mksobj(SCR_IDENTIFY, false, false, { state: game });
        scroll.cursed = true;
        addinv(scroll, { state: game });

        assert.equal(await seffects(scroll, game), 1);
        assert.equal(game.objects[SCR_IDENTIFY].oc_name_known, 1);
        assert.equal(game.invent, null);
        assert.equal(
            game._pending_message.includes('to be identified.'),
            false,
        );
    });

test('read.c identify scroll applies the blessed Luck increment after rn2(5)',
    async () => {
        await emptyDetectionWorld(9876523);
        game.objects[SCR_IDENTIFY].oc_name_known = true;
        game.u.uluck = 1;
        game.u.moreluck = 0;

        const scroll = mksobj(SCR_IDENTIFY, false, false, { state: game });
        scroll.blessed = true;
        scroll.known = true;
        scroll.dknown = true;
        scroll.bknown = true;
        scroll.cknown = true;
        scroll.lknown = true;
        scroll.rknown = true;
        addinv(scroll, { state: game });
        for (const type of [RIN_ADORNMENT, RIN_CONFLICT]) {
            game.objects[type].oc_name_known = false;
            addinv(mksobj(type, false, false, { state: game }), { state: game });
        }

        // C's blessed path draws cval directly. Seed 3 makes this draw one;
        // positive Luck increments that value to two and identifies both
        // remaining unknown objects without opening the item-selection menu.
        initRng(3);
        enableRngLog();
        for (let i = 0; i < 20; ++i) game.nhDisplay.pushKey(32);
        assert.equal(await seffect_identify(scroll, game), true);
        assert.equal(getRngLog()[0], 'rn2(5)=1');
        assert.equal(game.objects[RIN_ADORNMENT].oc_name_known, 1);
        assert.equal(game.objects[RIN_CONFLICT].oc_name_known, 1);
        assert.equal(
            game.invent?.otyp === SCR_IDENTIFY,
            false,
        );
    });

test('spell.c routes SPE_IDENTIFY through read.c seffects for forced casts',
    async () => {
        await emptyDetectionWorld(9876527);
        const result = await spelleffects(SPE_IDENTIFY, true, true, game);
        assert.equal(result, ECMD_TIME);
        assert.match(game._pending_message, /not carrying anything to be identified/u);
    });

test('read.c can_center_cloud pins valid terrain, sight, and distu boundary', async () => {
    await runSegment({
        seed: 8080053,
        datetime: '20310908070606',
        nethackrc: [
            'OPTIONS=name:Firetest,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });

    const { ux, uy } = game.u;
    const markVisibleRoom = (x, y) => {
        game.level.at(x, y).typ = ROOM;
        game.viz_array[y][x] |= IN_SIGHT;
    };
    markVisibleRoom(ux, uy);
    markVisibleRoom(ux + 3, uy + 3);
    markVisibleRoom(ux + 4, uy + 4);
    markVisibleRoom(ux + 1, uy);
    game.viz_array[uy][ux + 1] &= ~IN_SIGHT;

    // read.c:1080-1085 calls valid_cloud_pos first, then cansee(), then
    // distu() < 32; hack.h:1531 defines distu as the squared distance.
    assert.equal(can_center_cloud(ux, uy, game), true);
    assert.equal(can_center_cloud(ux + 3, uy + 3, game), true);
    assert.equal(can_center_cloud(ux + 4, uy + 4, game), false);
    assert.equal(can_center_cloud(ux + 1, uy, game), false);
    assert.equal(can_center_cloud(0, uy, game), false);
});

test('spell.c charm monster dispatches through read.c seffects', async () => {
    await emptyTamingWorld(8080052);
    const result = await spelleffects(
        SPE_CHARM_MONSTER,
        false,
        true,
        game,
    );

    assert.equal(result, ECMD_TIME);
    assert.equal(game._pending_message, 'Nothing interesting happens.');
});

test('read.c scare scroll reports distant laughter when no monster is visible', async () => {
    await emptyScareWorld(8080055);
    await seffects(scareScroll(), game);

    assert.equal(
        game._pending_message,
        'You hear maniacal laughter in the distance.',
    );
});

test('read.c scare scroll uses the cursed sad-wailing branch', async () => {
    await emptyScareWorld(8080056);
    await seffects(scareScroll(SCR_SCARE_MONSTER, true), game);

    assert.equal(
        game._pending_message,
        'You hear sad wailing in the distance.',
    );
});

test('spell.c cause fear dispatches through read.c seffects', async () => {
    await emptyScareWorld(8080057);
    const result = await spelleffects(
        SPE_CAUSE_FEAR,
        false,
        true,
        game,
    );

    assert.equal(result, ECMD_TIME);
    assert.equal(
        game._pending_message,
        'You hear maniacal laughter in the distance.',
    );
});

test('read.c genocide wrappers keep ordinary, class, throne, and cursed return paths', async () => {
    for (const name of [
        'read.c/genocide-scroll-species-independent-b34',
        'read.c/genocide-class-blessed-independent-b34',
        'read.c/genocide-cursed-summon-independent-b34',
    ]) {
        const { session, state } = await replayGenocideRecipe(name);
        assert.equal(state.gk.known, true, name);
        assert.match(session.getScreens().at(-1),
            name.includes('cursed')
                ? /Sent in some newts\./u : /Wiped out all newts\./u,
            name,
        );
        const flags = state.svm.mvitals[PM_NEWT].mvflags;
        if (name.includes('cursed')) {
            assert.equal(flags & (G_GENOD | G_NOCORPSE), 0, name);
            let created = 0;
            for (let monster = state.level?.monlist ?? state.fmon;
                monster; monster = monster.nmon) {
                if (monster.data?.pmidx === PM_NEWT) ++created;
            }
            assert.ok(created > 0, name);
        } else {
            assert.equal(flags & (G_GENOD | G_NOCORPSE),
                G_GENOD | G_NOCORPSE, name);
        }
    }

    const { session, state } = await replayGenocideRecipe(
        'sit.c/throne-genocide-selected-independent-b34',
    );
    assert.match(session.getScreens().join('\n'), /Imperious order/u);
    assert.match(session.getScreens().at(-1), /Wiped out all newts\./u);
    assert.equal(state.svm.mvitals[PM_NEWT].mvflags & (G_GENOD | G_NOCORPSE),
        G_GENOD | G_NOCORPSE);

    const confused = await replayGenocideRecipe(
        'read.c/genocide-confused-player-independent-b34',
    );
    const deathScreens = confused.session.getScreens().join('\n');
    assert.match(deathScreens, /Being confused, you mispronounce the magic words/u);
    assert.match(deathScreens, /Wiped out all wizards\./u);
    assert.equal(
        confused.state.svm.mvitals[PM_WIZARD].mvflags & (G_GENOD | G_NOCORPSE),
        G_GENOD | G_NOCORPSE,
    );
});

test('read.c first-genocide Chronicle uses uhis() for class and species paths', async () => {
    const cases = [
        {
            recipe: 'read.c/genocide-class-blessed-independent-b34',
            chronicle: (possessive) => new RegExp(
                `^performed ${possessive} first genocide \\(class .\\)$`, 'u',
            ),
        },
        {
            recipe: 'read.c/genocide-scroll-species-independent-b34',
            chronicle: (possessive) =>
                `performed ${possessive} first genocide (newts)`,
        },
    ];

    // read.c passes uhis() to livelog_printf() in both branches; you.h:316
    // maps flags.female to the hero's gendered possessive.
    for (const { recipe, chronicle } of cases) {
        for (const [gender, possessive] of [
            ['male', 'his'],
            ['female', 'her'],
        ]) {
            const { state } = await replayGenocideRecipe(recipe, gender);
            assert.equal(Boolean(state.flags.female), gender === 'female');
            assert.ok(state.gamelog.some(({ text }) =>
                typeof chronicle(possessive) === 'string'
                    ? text === chronicle(possessive)
                    : chronicle(possessive).test(text)),
            `${recipe} should log ${possessive} in the Chronicle`);
        }
    }
});

test('read.c amnesia forgets spell retention, skill history, and monster memory',
    async () => {
        await emptyTamingWorld(32032611);
        const state = game;
        state.plname = 'Alice';
        state.uball = {};
        state.u.bc_felt = 3;
        state.svs.spl_book[0] = {
            sp_id: SPE_FORCE_BOLT, sp_lev: 1, sp_know: 100,
        };
        state.svs.spl_book[1] = {
            sp_id: SPE_HEALING, sp_lev: 1, sp_know: 120,
        };
        state.context.spbook = { delay: -4, book: {}, o_id: 9 };

        const ordinary = { meverseen: true };
        const steed = { meverseen: true };
        const stuck = { meverseen: true };
        ordinary.nmon = steed;
        steed.nmon = stuck;
        stuck.nmon = null;
        state.level.monlist = ordinary;
        state.u.usteed = steed;
        state.u.ustuck = stuck;
        const migrating = { meverseen: true, nmon: null };
        state.gm.migrating_mons = migrating;

        const skill = skillSlot(P_BARE_HANDED_COMBAT, state);
        skill.skill = 3;
        skill.advance = 100;
        state.u.skills_advanced = 1;
        state.u.skill_record[0] = P_BARE_HANDED_COMBAT;
        state.u.weapon_slots = 0;

        const bounds = [];
        const messages = [];
        const values = [1, 0, 0, 0, 5, 1, 1];
        let index = 0;
        const random = {
            rn2(bound) {
                bounds.push(bound);
                return values[index++];
            },
            rnd(bound) {
                assert.equal(bound, 5);
                return 1;
            },
            rnl() {
                assert.fail('Luck reduction is not used when only one spell is lost');
            },
        };

        await seffect_amnesia({ blessed: false }, state, {
            random,
            message: async (text) => messages.push(text),
        });

        assert.deepEqual(bounds, [3, 2, 2, 1, 60, 2, 2]);
        assert.equal(state.gk.known, true);
        assert.equal(state.context.spbook.delay, -4);
        assert.equal(state.context.spbook.book, null);
        assert.equal(state.context.spbook.o_id, 0);
        assert.equal(state.svs.spl_book[0].sp_id, SPE_FORCE_BOLT);
        assert.equal(state.svs.spl_book[0].sp_know, 0);
        assert.equal(state.svs.spl_book[1].sp_id, SPE_HEALING);
        assert.equal(state.svs.spl_book[1].sp_know, 120);
        assert.equal(state.u.bc_felt, 0);
        assert.equal(state.u.skills_advanced, 0);
        assert.equal(skill.skill, 2);
        assert.equal(skill.advance, 25);
        assert.equal(state.u.weapon_slots, 1);
        assert.equal(ordinary.meverseen, false);
        assert.equal(steed.meverseen, true);
        assert.equal(stuck.meverseen, true);
        assert.equal(migrating.meverseen, false);
        assert.deepEqual(messages, [
            'You forget some of your training in bare handed combat.',
            'Who was that Maud person anyway?',
        ]);
    });

test('read.c blessed amnesia keeps spell retention but still drains skills',
    async () => {
        await emptyTamingWorld(32032612);
        const state = game;
        state.plname = 'Maudie';
        state.svs.spl_book[0] = {
            sp_id: SPE_FORCE_BOLT, sp_lev: 1, sp_know: 100,
        };
        state.context.spbook = { delay: -2, book: {}, o_id: 4 };
        state.u.skills_advanced = 0;
        const bounds = [];
        await seffect_amnesia({ blessed: true }, state, {
            random: {
                rn2(bound) { bounds.push(bound); return 1; },
                rnd(bound) { assert.equal(bound, 3); return 1; },
                rnl() { assert.fail('blessed amnesia does not call losespells'); },
            },
            message: async () => {},
        });
        assert.deepEqual(bounds, [2]);
        assert.equal(state.svs.spl_book[0].sp_know, 100);
        assert.deepEqual(state.context.spbook, {
            delay: -2, book: {}, o_id: 4,
        });
    });
