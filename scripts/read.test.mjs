import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ECMD_TIME, G_GENOD, IN_SIGHT, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    can_center_cloud,
    seffect_identify,
    seffects,
} from '../js/read.js';
import { G_NOCORPSE, PM_NEWT, PM_WIZARD } from '../js/monsters.js';
import {
    SCR_FOOD_DETECTION, SCR_GOLD_DETECTION, SCR_SCARE_MONSTER,
    SCR_IDENTIFY, SCR_TAMING, SCROLL_CLASS, SPBOOK_CLASS,
    SPE_CAUSE_FEAR, SPE_CHARM_MONSTER, SPE_DETECT_FOOD,
    SPE_IDENTIFY, RIN_ADORNMENT, RIN_CONFLICT,
} from '../js/objects.js';
import { spelleffects } from '../js/spell.js';
import { addinv } from '../js/invent.js';
import { mksobj } from '../js/obj.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';

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
