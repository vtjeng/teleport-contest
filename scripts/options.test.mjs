import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    ROLE_NONE,
    aligns,
    genders,
    races,
    roles,
    validalign,
    validgend,
    validrace,
} from '../js/roles.js';

function characterFlags(parsed) {
    return [
        parsed.flags.initrole,
        parsed.flags.initrace,
        parsed.flags.initgend,
        parsed.flags.initalign,
    ];
}

test('startup option defaults use source role indices and zero roleplay', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(characterFlags(parsed), [
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    ]);
    assert.deepEqual(
        [parsed.role, parsed.race, parsed.gender, parsed.align],
        [ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE],
    );
    assert.equal(parsed.flags.female, false);
    assert.deepEqual(
        {
            pickup: parsed.flags.pickup,
            bones: parsed.flags.bones,
            legacy: parsed.flags.legacy,
            tutorial: parsed.flags.tutorial,
            verbose: parsed.flags.verbose,
            splash: parsed.iflags.wc_splash_screen,
            color: parsed.iflags.wc_color,
        },
        {
            pickup: false,
            bones: true,
            legacy: true,
            tutorial: true,
            verbose: true,
            splash: true,
            color: true,
        },
    );
    assert.equal(parsed.playmode, 'normal');
    assert.equal(parsed.preferred_pet, '');
    assert.deepEqual(parsed.uroleplay, {
        blind: false,
        nudist: false,
        deaf: false,
        pauper: false,
        reroll: false,
        reserved1: false,
        reserved2: false,
        reserved3: false,
        numbones: 0,
        numrerolls: 0,
    });
});

test('explicit character options and pinned aliases produce source indices', () => {
    const parsed = parseNethackrc(
        'OPTIONS = NaMe:Ada,CHARACTER:Wiz,RACE:Elf,GENDER:Fem,ALIGN:Cha',
    );
    assert.equal(parsed.name, 'Ada');
    assert.deepEqual(characterFlags(parsed), [12, 1, 1, 2]);
    assert.deepEqual(
        [parsed.role, parsed.race, parsed.gender, parsed.align],
        [12, 1, 1, 2],
    );
    assert.equal(parsed.flags.female, true);

    const equals = parseNethackrc(
        'OPTIONS=role=Healer,race=human,gender=male,alignment=neutral',
    );
    assert.deepEqual(characterFlags(equals), [3, 0, 0, 1]);
    assert.equal(equals.flags.female, false);

    const colonStatement = parseNethackrc(
        'OPTIONS:name:Colon,role:Healer,race:human,gender:male,align:neutral',
    );
    assert.equal(colonStatement.name, 'Colon');
    assert.deepEqual(characterFlags(colonStatement), [3, 0, 0, 1]);
});

test('every fully explicit valid character tuple survives parsing unchanged', () => {
    let count = 0;
    for (let role = 0; role < roles.length; ++role) {
        for (let race = 0; race < races.length; ++race) {
            if (!validrace(role, race)) continue;
            for (let gender = 0; gender < 2; ++gender) {
                if (!validgend(role, race, gender)) continue;
                for (let alignment = 0; alignment < 3; ++alignment) {
                    if (!validalign(role, race, alignment)) continue;
                    const parsed = parseNethackrc([
                        `OPTIONS=role:${roles[role].name.m}`,
                        `OPTIONS=race:${races[race].noun}`,
                        `OPTIONS=gender:${genders[gender].adj}`,
                        `OPTIONS=align:${aligns[alignment].adj}`,
                    ].join('\n'));
                    assert.deepEqual(
                        characterFlags(parsed),
                        [role, race, gender, alignment],
                        `${roles[role].name.m}/${races[race].noun}`
                            + `/${genders[gender].adj}/${aligns[alignment].adj}`,
                    );
                    count += 1;
                }
            }
        }
    }
    assert.ok(count > roles.length, 'expected multiple valid tuples per role');
});

test('unknown and incompatible explicit character choices fail loudly', () => {
    assert.throws(
        () => parseNethackrc('OPTIONS=role:NotARole'),
        /unknown role 'NotARole'/u,
    );
    assert.throws(
        () => parseNethackrc(
            'OPTIONS=role:Knight,race:dwarf,gender:male,align:lawful',
        ),
        /role and race are incompatible/u,
    );
    assert.throws(
        () => parseNethackrc('OPTIONS=!role:Wizard'),
        /role filters are not supported/u,
    );
});

test('comma options apply right-to-left and later rc lines apply afterward', () => {
    // options.c recurses into the suffix first, so the leftmost duplicate is
    // applied last and wins within one comma-separated OPTIONS statement.
    const oneLine = parseNethackrc(
        'OPTIONS=role:Wizard,role:Healer,race:human,gender:male,align:neutral',
    );
    assert.equal(oneLine.flags.initrole, 12);

    const laterLine = parseNethackrc([
        'OPTIONS=role:Healer,race:human,gender:male,align:neutral',
        'OPTIONS=role:Wizard,race:elf,gender:female,align:chaotic',
    ].join('\n'));
    assert.deepEqual(characterFlags(laterLine), [12, 1, 1, 2]);
});

test('deprecated gender booleans preserve female and male alias semantics', () => {
    const cases = [
        ['female', 1, true],
        ['!female', 0, false],
        ['male', 0, false],
        ['!male', 1, true],
        ['nofemale', 0, false],
        ['nomale', 1, true],
    ];
    for (const [option, gender, female] of cases) {
        const parsed = parseNethackrc(`OPTIONS=${option}`);
        assert.equal(parsed.flags.initgend, gender, option);
        assert.equal(parsed.gender, gender, option);
        assert.equal(parsed.flags.female, female, option);
    }
});

test('roleplay aliases, negation, and pauper side effects match options.c', () => {
    const enabled = parseNethackrc(
        'OPTIONS=permablind,deaf,nudist,reroll',
    );
    assert.deepEqual(
        {
            blind: enabled.uroleplay.blind,
            deaf: enabled.uroleplay.deaf,
            nudist: enabled.uroleplay.nudist,
            pauper: enabled.uroleplay.pauper,
            reroll: enabled.uroleplay.reroll,
        },
        { blind: true, deaf: true, nudist: true, pauper: false, reroll: true },
    );

    const pauper = parseNethackrc('OPTIONS=pauper');
    assert.equal(pauper.uroleplay.pauper, true);
    assert.equal(pauper.uroleplay.nudist, true);

    // Right-to-left processing exposes pauper's immediate assignment to
    // nudist in both orderings.
    const leftNegated = parseNethackrc('OPTIONS=!pauper,nudist');
    assert.equal(leftNegated.uroleplay.pauper, false);
    assert.equal(leftNegated.uroleplay.nudist, false);
    const leftNudist = parseNethackrc('OPTIONS=nudist,!pauper');
    assert.equal(leftNudist.uroleplay.pauper, false);
    assert.equal(leftNudist.uroleplay.nudist, true);

    const booleanValues = parseNethackrc(
        'OPTIONS=blind:false,deaf:yes,reroll:off',
    );
    assert.equal(booleanValues.uroleplay.blind, false);
    assert.equal(booleanValues.uroleplay.deaf, true);
    assert.equal(booleanValues.uroleplay.reroll, false);
    assert.equal(parseNethackrc('OPTIONS=permadeaf').uroleplay.deaf, true);
});

test('playmode value aliases canonicalize mutually exclusive state', () => {
    const cases = [
        ['normal', 'normal'],
        ['play', 'normal'],
        ['explore', 'explore'],
        ['discovery', 'explore'],
        ['DEBUG', 'debug'],
        ['wizard', 'debug'],
    ];
    for (const [value, expected] of cases) {
        const parsed = parseNethackrc(`OPTIONS=playmode:${value}`);
        assert.equal(parsed.playmode, expected, value);
        assert.equal(parsed.flags.debug, expected === 'debug', value);
        assert.equal(parsed.flags.explore, expected === 'explore', value);
    }
    assert.throws(
        () => parseNethackrc('OPTIONS=playmode:cheat'),
        /invalid playmode/u,
    );
});

test('pet type aliases and names retain pinned startup values', () => {
    const cases = [
        ['dog', 'd'], ['d', 'd'],
        ['cat', 'c'], ['c', 'c'], ['feline', 'c'],
        ['horse', 'h'], ['h', 'h'], ['quadruped', 'h'], ['q', 'h'],
        ['none', 'n'], ['n', 'n'],
        ['random', ''], ['r', ''], ['*', ''],
    ];
    for (const [value, expected] of cases) {
        assert.equal(
            parseNethackrc(`OPTIONS=pettype:${value}`).preferred_pet,
            expected,
            value,
        );
    }
    assert.equal(parseNethackrc('OPTIONS=pet:cat').preferred_pet, 'c');
    assert.equal(parseNethackrc('OPTIONS=!pet').preferred_pet, 'n');

    const names = parseNethackrc(
        'OPTIONS=catname:Mog,dogname:Rex,horsename:Shadowfax',
    );
    assert.deepEqual(
        [names.catname, names.dogname, names.horsename],
        ['Mog', 'Rex', 'Shadowfax'],
    );
    assert.equal(parseNethackrc('OPTIONS=dogname:none').dogname, '');
    assert.equal(parseNethackrc('OPTIONS=dogname:(none)').dogname, '');
    assert.equal(parseNethackrc('OPTIONS=!dogname').dogname, '');
    assert.equal(
        parseNethackrc(`OPTIONS=catname:${'x'.repeat(70)}`).catname.length,
        62,
    );
    assert.equal(parseNethackrc('OPTIONS=catname:A\u007fB').catname, 'A.B');
});

test('direct legacy name, role, and pet-name statements are accepted', () => {
    const parsed = parseNethackrc([
        'NAME=Direct',
        'CHARACTER=Valkyrie',
        'DOGNAME=Fido',
        'CATNAME=Mog',
        'OPTIONS=race:dwarf,gender:female,align:lawful',
    ].join('\n'));
    assert.equal(parsed.name, 'Direct');
    assert.deepEqual(characterFlags(parsed), [11, 2, 1, 0]);
    assert.equal(parsed.dogname, 'Fido');
    assert.equal(parsed.catname, 'Mog');

    const literal = parseNethackrc('DOGNAME=none\nCATNAME:A\u007fB');
    assert.equal(literal.dogname, 'none');
    assert.equal(literal.catname, 'A\u007fB');
    assert.equal(parseNethackrc('ROLE=random').flags.initrole, ROLE_NONE);
});

test('previous generic startup option mappings remain available', () => {
    const parsed = parseNethackrc(
        'OPTIONS=!autopickup,color,!legacy,!tutorial,!splash_screen,'
        + 'pushweapon,showexp,time,!verbose,symset:UTF8,msg_window:r,'
        + 'suppress_alert:3.7,custom:value',
    );
    assert.equal(parsed.flags.pickup, false);
    assert.equal(parsed.flags.color, true);
    assert.equal(parsed.iflags.wc_color, true);
    assert.equal(parseNethackrc('OPTIONS=!colour').iflags.wc_color, false);
    assert.equal(parsed.flags.legacy, false);
    assert.equal(parsed.flags.tutorial, false);
    assert.equal(parsed.tutorial_set, true);
    assert.equal(parsed.iflags.wc_splash_screen, false);
    const abbreviated = parseNethackrc('OPTIONS=!leg,!tut,!spl');
    assert.deepEqual(
        [abbreviated.flags.legacy, abbreviated.flags.tutorial,
            abbreviated.iflags.wc_splash_screen],
        [false, false, false],
    );
    assert.equal(parsed.flags.pushweapon, true);
    assert.equal(parsed.flags.showexp, true);
    assert.equal(parsed.flags.time, true);
    assert.equal(parsed.flags.verbose, false);
    assert.equal(parsed.symset, 'UTF8');
    assert.equal(parsed.iflags.prevmsg_window, 'r');
    assert.equal(parsed.flags.suppress_alert, '3.7');
    assert.equal(parsed.flags.custom, 'value');
});
