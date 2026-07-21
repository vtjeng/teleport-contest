import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { P_CLERIC_SPELL } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { init_objects } from '../js/o_init.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init, SPE_LIGHT } from '../js/objects.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    PICK_RIGID,
    ROLE_NONE,
    ROLE_RANDOM,
    aligns,
    genders,
    raceIndex,
    races,
    rankOf,
    roles,
    str2align,
    str2gend,
    str2race,
    str2role,
    validalign,
    validgend,
    validrace,
} from '../js/roles.js';
import {
    Hello,
    applyRoleInitMonsterOverrides,
    characterConfigIdentity,
    pick_align,
    pick_gend,
    pick_race,
    pick_role,
    rigid_role_checks,
    role_init,
    welcomeMessage,
} from '../js/role_init.js';
import { restrictedSpellDiscipline } from '../js/role_skills.js';

function scriptedRandom(choices) {
    const remaining = [...choices];
    const bounds = [];
    const random = (bound) => {
        bounds.push(bound);
        assert.ok(remaining.length, `unexpected random(${bound})`);
        const result = remaining.shift();
        assert.ok(result >= 0 && result < bound,
            `scripted result ${result} is outside random(${bound})`);
        return result;
    };
    random.bounds = bounds;
    random.done = () => assert.deepEqual(remaining, []);
    return random;
}

function explicitState(role, race, gender, alignment, name = 'Player') {
    const state = {
        plname: name,
        flags: {
            initrole: role,
            initrace: race,
            initgend: gender,
            initalign: alignment,
            pantheon: -1,
        },
    };
    objects_globals_init(state);
    monst_globals_init(state);
    return state;
}

test('role tables match the complete pinned role.c data', () => {
    assert.equal(roles.length, 13);
    assert.equal(races.length, 5);
    assert.equal(genders.length, 4);
    assert.equal(aligns.length, 4);

    // The order catches role.c's deliberate Rogue-before-Ranger exception.
    assert.deepEqual(
        roles.map((role) => role.filecode),
        ['Arc', 'Bar', 'Cav', 'Hea', 'Kni', 'Mon', 'Pri', 'Rog', 'Ran',
            'Sam', 'Tou', 'Val', 'Wiz'],
    );
    assert.deepEqual(
        roles.map((role) => role.intermed),
        [
            'the Tomb of the Toltec Kings', 'the Duali Oasis',
            "the Dragon's Lair", 'the Temple of Coeus',
            'the Isle of Glass', 'the Monastery of the Earth-Lord',
            'the Temple of Nalzok', "the Assassins' Guild Hall",
            'the cave of the wumpus', "the Shogun's Castle",
            "the Thieves' Guild Hall", 'the cave of Surtur',
            'the Tower of Darkness',
        ],
    );

    for (const role of roles) {
        assert.equal(role.rank.length, 9);
        assert.equal(role.attrbase.length, 6);
        assert.equal(role.attrdist.length, 6);
        assert.deepEqual(Object.keys(role.hpadv),
            ['infix', 'inrnd', 'lofix', 'lornd', 'hifix', 'hirnd']);
        assert.deepEqual(Object.keys(role.enadv),
            ['infix', 'inrnd', 'lofix', 'lornd', 'hifix', 'hirnd']);
    }
    for (const race of races) {
        assert.equal(race.attrmin.length, 6);
        assert.equal(race.attrmax.length, 6);
        assert.deepEqual(Object.keys(race.hpadv),
            ['infix', 'inrnd', 'lofix', 'lornd', 'hifix', 'hirnd']);
        assert.deepEqual(Object.keys(race.enadv),
            ['infix', 'inrnd', 'lofix', 'lornd', 'hifix', 'hirnd']);
    }

    const digest = createHash('sha256')
        .update(JSON.stringify({ roles, races, genders, aligns }))
        .digest('hex');
    // The digest covers every string, index, mask, attribute, advancement,
    // and spell field emitted from the pinned C tables.
    assert.equal(
        digest,
        'f93e4d38e58902ab09f47a0f1bf93f7d2e4bf142be8f1a2697ca2b26ca1def94',
    );
});

test('source string matching and compatibility constraints are preserved', () => {
    // A one-letter R selects Rogue before Ranger; the three-letter filecode
    // selects Ranger. This is an intentional source ordering constraint.
    assert.equal(str2role('R'), 7);
    assert.equal(str2role('Ran'), 8);
    assert.equal(str2role('cavew'), 2);
    assert.equal(str2role('*'), ROLE_RANDOM);
    assert.equal(str2race('dwarven'), 2);
    assert.equal(str2gend('f'), 1);
    assert.equal(str2align('Cha'), 2);

    // Knight is human/lawful; Valkyrie permits human or dwarf and is female.
    assert.equal(validrace(4, 0), true);
    assert.equal(validrace(4, 2), false);
    assert.equal(validalign(4, 0, 0), true);
    assert.equal(validalign(4, 0, 1), false);
    assert.equal(validgend(11, 2, 0), false);
    assert.equal(validgend(11, 2, 1), true);

    // Rank boundaries exercise each nonuniform edge in botl.c:xlev_to_rank.
    assert.deepEqual(
        [1, 2, 3, 5, 6, 9, 10, 29, 30].map((level) => (
            rankOf(10, level, true)
        )),
        ['Rambler', 'Rambler', 'Sightseer', 'Sightseer', 'Excursionist',
            'Excursionist', 'Peregrinatrix', 'Explorer', 'Adventurer'],
    );
});

test('explicit arbitrary configurations produce source welcome identities', () => {
    const cases = [
        // Exercises a role greeting and a role with no gender-specific name.
        ['Tourist', 'human', 'female', 'neutral', 'Tess',
            'Aloha Tess, welcome to NetHack!  You are a neutral female human Tourist.'],
        // Valkyrie's forced gender is omitted from the welcome description.
        ['Valkyrie', 'dwarf', 'female', 'lawful', 'Brynhild',
            'Velkommen Brynhild, welcome to NetHack!  You are a lawful dwarven Valkyrie.'],
        // Cavewoman carries gender in the role name instead of an adjective.
        ['Caveman', 'gnome', 'female', 'neutral', 'Ama',
            'Hello Ama, welcome to NetHack!  You are a neutral gnomish Cavewoman.'],
        // Knight exercises the remaining source-specific initial greeting.
        ['Knight', 'human', 'male', 'lawful', 'Gawain',
            'Salutations Gawain, welcome to NetHack!  You are a lawful male human Knight.'],
    ];

    for (const [role, race, gender, alignment, name, expected] of cases) {
        const state = explicitState(role, race, gender, alignment, name);
        role_init(state, (bound) => {
            assert.fail(`explicit ${role} unexpectedly called random(${bound})`);
        });
        assert.equal(welcomeMessage(state), expected);
        assert.deepEqual(characterConfigIdentity(state), {
            role: role === 'Caveman' ? 'Cavewoman' : role,
            roleIndex: str2role(role),
            race,
            raceIndex: str2race(race),
            gender,
            genderIndex: str2gend(gender),
            alignment,
            alignmentIndex: str2align(alignment),
        });
        assert.equal(state.urole.filecode, roles[str2role(role)].filecode);
    }
});

test('name suffix configuration follows role.c token precedence', () => {
    const state = explicitState(
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
        'Alice-Ran-Elf-Fem-Cha',
    );
    role_init(state, (bound) => {
        assert.fail(`complete suffix unexpectedly called random(${bound})`);
    });

    assert.equal(state.plname, 'Alice');
    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [8, 1, 1, 2],
    );
    assert.equal(
        state.flags.female,
        false,
    );
    // C's u_init_misc() synchronizes current sex to the selected new-game
    // gender after role_init(); welcome() runs after that boundary.
    state.flags.female = state.flags.initgend === 1;
    assert.equal(welcomeMessage(state),
        'Hello Alice, welcome to NetHack!  You are a chaotic female elven Ranger.');
});

test('rigid random selection uses the upstream candidate order and bounds', () => {
    const state = explicitState(
        ROLE_RANDOM, ROLE_RANDOM, ROLE_RANDOM, ROLE_RANDOM,
    );
    // Choose Knight from all 13 roles, its only human race and lawful
    // alignment, then female from its two valid genders.
    const random = scriptedRandom([4, 0, 0, 1]);
    rigid_role_checks(state, random);

    assert.deepEqual(random.bounds, [13, 1, 1, 2]);
    assert.deepEqual(
        [state.flags.initrole, state.flags.initrace,
            state.flags.initgend, state.flags.initalign],
        [4, 0, 1, 0],
    );
    assert.equal(state.flags.female, false);
    random.done();

    // These rigid queries have multiple choices and must return before
    // consuming a random value.
    assert.equal(pick_race(11, ROLE_NONE, ROLE_NONE, PICK_RIGID, random),
        ROLE_NONE);
    assert.equal(pick_gend(4, 0, 0, PICK_RIGID, random), ROLE_NONE);
    assert.equal(pick_align(5, 0, 0, PICK_RIGID, random), ROLE_NONE);
});

test('constrained random role selection excludes incompatible roles', () => {
    // Female chaotic orc permits Barbarian, Rogue, Ranger, and Wizard in that
    // source order; choice 2 selects Ranger.
    const random = scriptedRandom([2]);
    assert.equal(pick_role(4, 1, 2, 0, random), 8);
    assert.deepEqual(random.bounds, [4]);
    random.done();
});

test('role_init preserves randrace factor-of-100 and quest gender calls', () => {
    const state = explicitState('Archeologist', ROLE_NONE, 'male', ROLE_NONE);
    // 201/100 selects the third permitted race (gnome); its sole compatible
    // alignment consumes rn2(1). The genderless nemesis then consumes
    // rn2(100), where 49 selects female.
    const random = scriptedRandom([201, 0, 49]);
    role_init(state, random);

    assert.deepEqual(random.bounds, [300, 1, 100]);
    assert.equal(state.flags.initrace, 3);
    assert.equal(state.flags.initalign, 1);
    assert.equal(state.svq.quest_status.nemgend, 1);
    random.done();
});

test('priest pantheon retries preserve PRNG order and deity state', () => {
    const state = explicitState('Priest', 'human', 'female', 'lawful');
    assert.equal(restrictedSpellDiscipline(SPE_LIGHT, {
        ...state,
        urole: { filecode: 'Arc' },
    }), false);
    // The first draw selects Priest again (which has no gods); the retry
    // selects Samurai, whose lawful deity is a goddess.
    const random = scriptedRandom([6, 9]);
    role_init(state, random);

    assert.deepEqual(random.bounds, [13, 13]);
    assert.equal(state.flags.pantheon, 9);
    assert.deepEqual(
        [state.urole.lgod, state.urole.ngod, state.urole.cgod],
        ['_Amaterasu Omikami', 'Raijin', 'Susanowo'],
    );
    assert.equal(state.svq.quest_status.godgend, 1);
    assert.equal(state.objects[SPE_LIGHT].oc_skill, P_CLERIC_SPELL);
    assert.equal(state.objects[SPE_LIGHT].oc_subtyp, P_CLERIC_SPELL);
    assert.equal(restrictedSpellDiscipline(SPE_LIGHT, {
        ...state,
        urole: { filecode: 'Arc' },
    }), true);
    random.done();
});

test('quest monster overrides apply when catalog entries are available', () => {
    const state = explicitState('Ranger', 'orc', 'male', 'chaotic');
    // Ranger uses leader 351, guardian 376, and nemesis 364. Initial peaceful
    // and close bits on the nemesis prove role_init clears both.
    state.mons[351] = { mflags2: 0, mflags3: 0 };
    state.mons[376] = { mflags2: 0, mflags3: 0 };
    state.mons[364] = { mflags2: 0x00200000, mflags3: 0x0080 };
    role_init(state, (bound) => {
        assert.fail(`fixed-gender Ranger quest called random(${bound})`);
    });

    assert.equal(state.roleInitMonsterOverrides.length, 3);
    assert.equal(state.mons[351].msound, 36);
    assert.equal(state.mons[351].maligntyp, -3);
    assert.ok(state.mons[351].mflags2 & 0x00200000);
    assert.ok(state.mons[351].mflags3 & 0x0080);
    assert.equal(state.mons[376].maligntyp, -3);
    assert.equal(state.mons[364].msound, 37);
    assert.equal(state.mons[364].mflags2 & 0x00200000, 0);
    assert.ok(state.mons[364].mflags2 & 0x00100000);
    assert.ok(state.mons[364].mflags2 & 0x01000000);
    assert.ok(state.mons[364].mflags2 & 0x02000000);
    assert.equal(state.mons[364].mflags3 & 0x0080, 0);
    assert.ok(state.mons[364].mflags3 & 0x0010);
    assert.ok(state.mons[364].mflags3 & 0x0040);
});

test('role_init rejects a missing monster catalog before state mutation', () => {
    const state = explicitState('Ranger', 'orc', 'male', 'chaotic');
    delete state.mons;
    assert.throws(
        () => role_init(state, (bound) => {
            assert.fail(`missing catalog called random(${bound})`);
        }),
        /requires monst_globals_init/,
    );
    assert.equal(state.urole, undefined);
    assert.equal(state.roleInitMonsterOverrides, undefined);
});

test('restore preserves current sex independently of initial gender', () => {
    const state = explicitState(4, 0, 0, 0, 'RestoredKnight');
    state.flags.female = true;
    state.flags.pantheon = 4;
    role_init(state, (bound) => {
        assert.fail(`restored Knight unexpectedly called random(${bound})`);
    });

    assert.equal(state.flags.initgend, 0);
    assert.equal(state.flags.female, true);
    assert.equal(
        welcomeMessage(state),
        'Salutations RestoredKnight, welcome to NetHack!  You are a lawful female human Knight.',
    );
});

test('PM-index helpers and compiled greeting cases are supported', () => {
    assert.equal(rankOf(341, 1, false), 'Rambler');
    assert.equal(raceIndex(260), 0);
    assert.equal(raceIndex(264), 1);
    assert.equal(Hello(341), 'Aloha');
    assert.equal(Hello(342, { mailDaemon: true }), 'Hallo');
});

test('fresh C recorder cases match the role_init PRNG prefix', () => {
    const cases = [
        {
            // Fresh seed 271828 exercises Wizard's genderless nemesis draw.
            seed: 271828,
            role: 'Wizard', race: 'elf', gender: 'female', align: 'chaotic',
            expected: ['rn2(100)=55'],
        },
        {
            // Fresh seed 161803 proves Valkyrie consumes no role_init draw.
            seed: 161803,
            role: 'Valkyrie', race: 'dwarf', gender: 'female', align: 'lawful',
            expected: [],
        },
        {
            // Fresh seed 57721 makes Priest redraw its missing pantheon once.
            seed: 57721,
            role: 'Priest', race: 'elf', gender: 'female', align: 'chaotic',
            expected: ['rn2(13)=6', 'rn2(13)=1'],
        },
    ];

    for (const config of cases) {
        resetGame();
        monst_globals_init(game);
        initRng(config.seed);
        enableRngLog();
        init_objects(game);
        game.plname = 'FreshRole';
        game.flags = {
            initrole: config.role,
            initrace: config.race,
            initgend: config.gender,
            initalign: config.align,
            pantheon: -1,
        };
        role_init(game);

        // init_objects owns calls 1..199 in each recorder trace. Compare the
        // role_init slice immediately after that source-faithful boundary.
        assert.deepEqual(getRngLog().slice(199), config.expected);
    }
});
