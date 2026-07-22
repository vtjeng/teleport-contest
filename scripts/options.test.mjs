import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    ROLE_NONE,
    aligns,
    genders,
    races,
    roles,
    str2role,
    validalign,
    validgend,
    validrace,
} from '../js/roles.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    ATR_BOLD,
    ATR_INVERSE,
    ATR_NONE,
    ATR_UNDERLINE,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_GREEN,
    CLR_BRIGHT_MAGENTA,
    CLR_ORANGE,
    CLR_RED,
    NO_COLOR,
} from '../js/terminal.js';

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
            inverse: parsed.iflags.wc_inverse,
        },
        {
            pickup: false,
            bones: true,
            legacy: true,
            tutorial: true,
            verbose: true,
            splash: true,
            color: true,
            inverse: true,
        },
    );
    assert.equal(parsed.playmode, 'normal');
    assert.equal(parsed.flags.showvers, false);
    assert.equal(parsed.flags.versinfo, 1);
    assert.equal(parsed.preferred_pet, '');
    assert.equal(parsed.roleFilter.mask, 0);
    assert.equal(parsed.roleFilter.roles.length, roles.length);
    assert.ok(parsed.roleFilter.roles.every((filtered) => !filtered));
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

test('unknown choices fail while incompatible explicit choices reach selection', () => {
    assert.throws(
        () => parseNethackrc('OPTIONS=role:BogusRole'),
        /unknown role 'BogusRole'/u,
    );
    assert.deepEqual(
        characterFlags(parseNethackrc(
            'OPTIONS=role:Knight,race:dwarf,gender:male,align:lawful',
        )),
        [4, 2, 0, 0],
    );
});

test('negated character options build source role filter masks', () => {
    const parsed = parseNethackrc(
        'OPTIONS=!role:Wizard Tourist,race:!orc,gender:nofemale,'
        + 'align:!chaotic',
    );
    const wizard = str2role('Wizard');
    const tourist = str2role('Tourist');
    const orc = races.find((race) => race.noun === 'orc');
    const female = genders.find((gender) => gender.adj === 'female');
    const chaotic = aligns.find((alignment) => (
        alignment.adj === 'chaotic'
    ));

    assert.deepEqual(characterFlags(parsed), [
        ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE,
    ]);
    assert.equal(parsed.roleFilter.roles[wizard], true);
    assert.equal(parsed.roleFilter.roles[tourist], true);
    assert.equal(
        parsed.roleFilter.roles.filter(Boolean).length,
        2,
        'the two listed roles are the only role exclusions',
    );
    assert.equal(
        parsed.roleFilter.mask,
        orc.selfmask | female.allow | chaotic.allow,
        'orc, female, and chaotic each occupy a distinct source mask field',
    );
});

test('repeated role filters merge in source parse order', () => {
    const repeatedLines = parseNethackrc([
        'OPTIONS=role:!Wizard',
        'OPTIONS=role:!Tourist',
        'OPTIONS=role:!Wizard',
    ].join('\n'));
    const oneLine = parseNethackrc(
        'OPTIONS=role:!Wizard !Tourist,role:!Archeologist',
    );
    for (const parsed of [repeatedLines, oneLine]) {
        assert.equal(parsed.roleFilter.roles[str2role('Wizard')], true);
        assert.equal(parsed.roleFilter.roles[str2role('Tourist')], true);
    }
    assert.equal(
        repeatedLines.roleFilter.roles.filter(Boolean).length,
        2,
        'repeating Wizard merges rather than adding another filter entry',
    );
    assert.equal(
        oneLine.roleFilter.roles[str2role('Archeologist')],
        true,
    );

    // parseoptions() applies comma suffixes first. The rightmost positive
    // choice is therefore installed before the left filter is merged.
    const filterAfterChoice = parseNethackrc(
        'OPTIONS=role:!Tourist,role:Wizard',
    );
    assert.equal(filterAfterChoice.flags.initrole, str2role('Wizard'));
    assert.equal(
        filterAfterChoice.roleFilter.roles[str2role('Tourist')],
        true,
    );
    assert.throws(
        () => parseNethackrc('OPTIONS=role:Wizard,role:!Tourist'),
        /compound option specified multiple times: role/u,
        'the opposite textual order applies the positive duplicate last',
    );
});

test('legacy ROLE statements remain distinct from OPTIONS role filters', () => {
    const parsed = parseNethackrc([
        'ROLE=Wizard',
        'OPTIONS=!role:Tourist',
    ].join('\n'));
    assert.equal(parsed.flags.initrole, str2role('Wizard'));
    assert.equal(parsed.roleFilter.roles[str2role('Tourist')], true);

    const ignored = parseNethackrc('ROLE=!Wizard\nCHARACTER=random');
    assert.equal(ignored.flags.initrole, ROLE_NONE);
    assert.ok(ignored.roleFilter.roles.every((filtered) => !filtered));
});

test('tty menu presentation options populate interface flags', () => {
    const defaults = parseNethackrc('');
    assert.equal(defaults.iflags.menu_overlay, true);
    assert.deepEqual(defaults.iflags.menu_headings, {
        attr: ATR_INVERSE,
        color: NO_COLOR,
    });

    const plain = parseNethackrc('OPTIONS=!menu_overlay,menu_headings:none');
    assert.equal(plain.iflags.menu_overlay, false);
    assert.deepEqual(plain.iflags.menu_headings, {
        attr: ATR_NONE,
        color: NO_COLOR,
    });

    const styled = parseNethackrc('OPTIONS=menu_headings:red&bold');
    assert.deepEqual(styled.iflags.menu_headings, {
        attr: ATR_BOLD,
        color: CLR_RED,
    });

    const aliases = [
        ['bright-green&bold', CLR_BRIGHT_GREEN, ATR_BOLD],
        ['lightblue&reverse', CLR_BRIGHT_BLUE, ATR_INVERSE],
        ['light-purple&uline', CLR_BRIGHT_MAGENTA, ATR_UNDERLINE],
        ['normal&bright_red', CLR_ORANGE, ATR_NONE],
    ];
    for (const [value, color, attr] of aliases) {
        assert.deepEqual(
            parseNethackrc(`OPTIONS=menu_headings:${value}`)
                .iflags.menu_headings,
            { color, attr },
            value,
        );
    }
    // Color index 12 is the source tty index for bright blue; this covers
    // coloratt.c's numeric-color fallback independently of name aliases.
    assert.deepEqual(
        parseNethackrc('OPTIONS=menu_headings:12&bold')
            .iflags.menu_headings,
        { color: CLR_BRIGHT_BLUE, attr: ATR_BOLD },
    );

    for (const invalid of [
        'red&blue',
        'bold&inverse',
        'red&bold&underline',
    ]) {
        assert.throws(
            () => parseNethackrc(`OPTIONS=menu_headings:${invalid}`),
            /invalid menu_headings style/u,
            invalid,
        );
    }
});

test('use_inverse owns the tty inverse-video interface flag', () => {
    assert.equal(parseNethackrc('').iflags.wc_inverse, true);
    assert.equal(
        parseNethackrc('OPTIONS=!use_inverse').iflags.wc_inverse,
        false,
    );
    assert.equal(
        parseNethackrc('OPTIONS=!use_inverse,use_inverse').iflags.wc_inverse,
        false,
        'parseoptions applies comma-separated suffixes first',
    );
});

test('menu command options preserve source alias order and require full names', () => {
    const defaults = parseNethackrc('');
    assert.equal(defaults.iflags.mapped_menu_cmds, '');
    assert.equal(defaults.iflags.mapped_menu_op, '');

    const mapped = parseNethackrc([
        // # exercises the validator's executable-source quirk, which
        // disagrees with its preceding prose comment.
        'OPTIONS=menu_search:#,menu_next_page:{,menu_first_page:}',
        // Continuation is checked before trailing padding is trimmed, so the
        // space makes the preceding backslash a literal option value.
        'OPTIONS=menu_previous_page:\\ ',
    ].join('\n'));
    assert.equal(mapped.iflags.mapped_menu_cmds, '}{#\\');
    assert.equal(mapped.iflags.mapped_menu_op, '^>:<');

    // parseoptions() handles a comma-separated suffix first. For duplicate
    // incoming keys, map_menu_cmd() then uses the first appended alias.
    const collision = parseNethackrc(
        'OPTIONS=menu_search:#,menu_next_page:#',
    );
    assert.equal(collision.iflags.mapped_menu_cmds, '##');
    assert.equal(collision.iflags.mapped_menu_op, '>:');

    // Aliases on later lines append after earlier ones, so an earlier
    // incoming-key mapping continues to win.
    const acrossLines = parseNethackrc([
        'OPTIONS=menu_search:#',
        'OPTIONS=menu_next_page:#',
    ].join('\n'));
    assert.equal(acrossLines.iflags.mapped_menu_op, ':>');

    // The outer option lookup recognizes these unambiguous prefixes, but
    // shared_menu_optfn() rechecks against the complete canonical name.
    for (const abbreviated of ['menu_sea', 'menu_n', 'menu_f']) {
        assert.throws(
            () => parseNethackrc(`OPTIONS=${abbreviated}:#`),
            /requires its full canonical name/u,
        );
    }

    for (const missing of ['menu_search', 'menu_search:']) {
        assert.throws(
            () => parseNethackrc(`OPTIONS=${missing}`),
            /menu_search requires a value/u,
        );
    }
});

test('BINDINGS adds exact menu command aliases in source recursion order', () => {
    const parsed = parseNethackrc([
        'bind=#:menu_search,{:menu_next_page',
        'BINDINGS=\\:menu_first_page',
        'BINDINGS=,:menu_select_page',
        // Non-menu bindings are retained for source command-key lookup.
        'BINDINGS=x:search',
    ].join('\n'));
    assert.equal(parsed.iflags.mapped_menu_cmds, '{#\\,');
    assert.equal(parsed.iflags.mapped_menu_op, '>:^,');
    assert.deepEqual(parsed.gameplayBindings, [{
        key: 'x'.charCodeAt(0), command: 'search',
    }]);
    assert.deepEqual(parsed.commandOperations, [{
        type: 'bind', key: 'x'.charCodeAt(0), command: 'search',
    }]);
});

test('number_pad preserves the source modes used by command-key lookup', () => {
    assert.deepEqual(
        parseNethackrc('OPTIONS=number_pad').iflags,
        {
            ...parseNethackrc('').iflags,
            num_pad: true,
            num_pad_mode: 0,
        },
    );
    const phone = parseNethackrc('OPTIONS=number_pad:4');
    assert.equal(phone.iflags.num_pad, true);
    assert.equal(phone.iflags.num_pad_mode, 3);
    assert.deepEqual(phone.commandOperations, [{
        type: 'number_pad', enabled: true, mode: 3,
    }]);
    const swapped = parseNethackrc('OPTIONS=number_pad:-1');
    assert.equal(swapped.iflags.num_pad, false);
    assert.equal(swapped.iflags.num_pad_mode, 1);
    assert.throws(
        () => parseNethackrc('OPTIONS=number_pad:5'),
        /illegal number_pad parameter/u,
    );
});

test('menu command keys use txt2key syntax and source validation', () => {
    const escaped = parseNethackrc(String.raw`OPTIONS=menu_search:\x23
OPTIONS=menu_next_page:\o173
OPTIONS=menu_first_page:125
OPTIONS=menu_last_page:\m\x23`);
    assert.equal(escaped.iflags.mapped_menu_cmds, '#{}£');
    assert.equal(escaped.iflags.mapped_menu_op, ':>^|');

    for (const key of [
        'a', 'Z', '7', '?', '.', '<space>', '<esc>', String.raw`\n`,
    ]) {
        assert.throws(
            () => parseNethackrc(`OPTIONS=menu_search:${key}`),
            /reserved menu command key/u,
            key,
        );
    }
    assert.throws(
        () => parseNethackrc('OPTIONS=!menu_search:#'),
        /may not be negated/u,
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

test('CHOOSE consumes source-order RNG calls and gates config sections', () => {
    const draws = [1, 2, 0];
    const calls = [];
    const random = (bound) => {
        calls.push(bound);
        const result = draws.shift();
        assert.ok(result >= 0 && result < bound, `${result} < ${bound}`);
        return result;
    };
    const parsed = parseNethackrc([
        // rn2(2)=1 selects the second section.  The nested CHOOSE in the
        // skipped first section must not consume a draw.
        'CHOOSE=left,right',
        '[left]',
        'CHOOSE=ignored-a,ignored-b,ignored-c,ignored-d',
        'OPTIONS=name:Left,role:Healer',
        '[right]',
        'OPTIONS=name:Right',
        '[] # common statements resume here',
        // rn2(3)=2 selects the third section.
        'CHOOSE=red,blue,green',
        '[red]',
        'OPTIONS=role:Healer',
        '[blue]',
        'OPTIONS=role:Knight',
        '[green]',
        'OPTIONS=role:Wizard',
        '[]',
        // choose_random_part() still calls rn2(1) for one candidate.
        'CHOOSE=only',
        '[only]',
        'OPTIONS=race:elf',
    ].join('\n'), random);

    assert.deepEqual(calls, [2, 3, 1]);
    assert.equal(parsed.name, 'Right');
    assert.deepEqual(characterFlags(parsed), [12, 1, ROLE_NONE, ROLE_NONE]);
});

test('CHOOSE defaults to the core game RNG', () => {
    initRng(0xC0FFEE);
    enableRngLog();
    const parsed = parseNethackrc([
        // One candidate deliberately exercises the source's required rn2(1).
        'CHOOSE=only',
        '[only]',
        'NAME=Default RNG',
    ].join('\n'));

    assert.equal(parsed.name, 'Default RNG');
    assert.deepEqual(getRngLog(), ['rn2(1)=0']);
});

test('config and source option names accept valid abbreviations', () => {
    const parsed = parseNethackrc([
        'OPTI=nam:Alice,rol:Healer,rac:elf,gen:female,alignm:chaotic',
        'OPTI=playm:debug,!col,showe,!verb,menu_h:bold',
        'OPTI=!menu_ov,eig,pett:cat,fru:pear,hor:Shadowfax',
        'OPTI=bli,dea,nud,pau,rer,sym:UTF8,sup:3.7,msg_:r,pus',
        'CHAR=Wizard',
        'DOG=Fido',
        'CAT=Mog',
    ].join('\n'));

    assert.equal(parsed.name, 'Alice');
    assert.deepEqual(characterFlags(parsed), [12, 1, 1, 2]);
    assert.equal(parsed.playmode, 'debug');
    assert.equal(parsed.iflags.wc_color, false);
    assert.equal(parsed.flags.showexp, true);
    assert.equal(parsed.flags.verbose, false);
    assert.deepEqual(parsed.iflags.menu_headings, {
        attr: ATR_BOLD,
        color: NO_COLOR,
    });
    assert.equal(parsed.iflags.menu_overlay, false);
    assert.equal(parsed.iflags.wc_eight_bit_input, true);
    assert.equal(parsed.preferred_pet, 'c');
    assert.equal(parsed.pl_fruit, 'pear');
    assert.equal(parsed.horsename, 'Shadowfax');
    assert.equal(parsed.uroleplay.blind, true);
    assert.equal(parsed.uroleplay.deaf, true);
    assert.equal(parsed.uroleplay.nudist, true);
    assert.equal(parsed.uroleplay.pauper, true);
    assert.equal(parsed.uroleplay.reroll, true);
    assert.equal(parsed.symset, 'UTF8');
    assert.equal(parsed.flags.suppress_alert, '3.7');
    assert.equal(parsed.iflags.prevmsg_window, 'r');
    assert.equal(parsed.flags.pushweapon, true);
    assert.equal(parsed.dogname, 'Fido');
    assert.equal(parsed.catname, 'Mog');

    const genericBooleans = parseNethackrc('OPTIONS=!bon,res,stan');
    assert.equal(genericBooleans.flags.bones, false);
    assert.equal(genericBooleans.flags.rest_on_space, true);
    assert.equal(genericBooleans.flags.standout, true);

    // playmode needs five characters because player_selection shares "play".
    assert.throws(
        () => parseNethackrc('OPTIONS=play:debug'),
        /unknown or ambiguous option 'play'/u,
    );
});

test('continued config lines follow cfgfiles.c merge and comment rules', () => {
    const merged = parseNethackrc([
        'OPTIONS=role:Healer,\\',
        ' race:human,gender:male,\\',
        ' align:neutral',
    ].join('\n'));
    assert.deepEqual(characterFlags(merged), [3, 0, 0, 1]);

    // A comment with its own trailing backslash is skipped while preserving
    // the pending line.  A plain ignored line terminates that pending line.
    const skippedComment = parseNethackrc([
        'OPTIONS=role:Healer,\\',
        '# skipped continuation\\',
        ' race:human,gender:male,align:neutral',
    ].join('\n'));
    assert.deepEqual(characterFlags(skippedComment), [3, 0, 0, 1]);

    const terminatingComment = parseNethackrc([
        'OPTIONS=role:Healer,\\',
        '# terminates the pending logical line',
        'OPTIONS=race:human,gender:male,align:neutral',
    ].join('\n'));
    assert.deepEqual(characterFlags(terminatingComment), [3, 0, 0, 1]);

    // Continuation is detected before trailing CR is trimmed, so a CRLF
    // backslash is literal under the recorder's Unix parser.
    const crlf = parseNethackrc('NAME=First\\\r\nNAME=Second');
    assert.equal(crlf.name, 'Second');

    const preservedPadding = parseNethackrc([
        'NAME=First \\',
        'Second',
    ].join('\n'));
    assert.equal(preservedPadding.name, 'First Second');

    // parse_conf_buf() initially preserves padding before a continuation
    // backslash. Its unconditional handle_config_section() call then invokes
    // trimspaces(), even for CHOOSE, before the choice is parsed.
    const paddedChoice = parseNethackrc([
        'CHOOSE=selected   \\',
        '# terminate the pending logical line',
        '[selected]',
        'NAME=padding removed',
    ].join('\n'), () => 0);
    assert.equal(paddedChoice.name, 'padding removed');

    // is_config_section() applies trimspaces() after parse_conf_buf(), so tabs
    // preserved before a continuation backslash do not invalidate the header.
    const paddedSection = parseNethackrc([
        'CHOOSE=selected',
        '[other]\t\t\\',
        '# terminate the pending logical line',
        'NAME=must not apply',
    ].join('\n'), () => 0);
    assert.equal(paddedSection.name, '');
});

test('config parsing applies physical-line and option byte boundaries', () => {
    const namePrefix = 'NAME=';

    // The prefix is five bytes.  A 1016-byte payload keeps an unterminated
    // physical line below cfgfiles.c's 1022-byte rejection boundary.
    assert.equal(
        parseNethackrc(`${namePrefix}${'x'.repeat(1016)}`).name,
        'x'.repeat(31),
    );
    // A newline can occupy fgets()'s final byte, so 1017 payload bytes are
    // valid with that newline but rejected when the file ends immediately.
    assert.equal(
        parseNethackrc(`${namePrefix}${'x'.repeat(1017)}\n`).name,
        'x'.repeat(31),
    );
    assert.equal(
        parseNethackrc(`${namePrefix}${'x'.repeat(1017)}`).name,
        '',
    );

    // Each e-acute is two UTF-8 bytes.  The 509-character payload pushes the
    // physical line past the byte limit even though its JS length is shorter;
    // parsing resumes after the discarded line.
    const overlongUnicode = parseNethackrc([
        `${namePrefix}${'é'.repeat(509)}`,
        'OPTIONS=eight_bit_tty',
    ].join('\n'));
    assert.equal(overlongUnicode.name, '');
    assert.equal(overlongUnicode.iflags.wc_eight_bit_input, true);

    // "fruit:" is six bytes, so 122 payload bytes reach options.c's
    // 128-byte maximum and 123 exceed it.  Rejection happens before fruit's
    // handler and does not prevent the other comma elements from applying.
    assert.equal(
        parseNethackrc(`OPTIONS=fruit:${'x'.repeat(122)}`).pl_fruit,
        'x'.repeat(31),
    );
    // parseoptions() measures raw bytes before trimming surrounding C
    // whitespace: 121 spaces plus the seven-byte "fruit:a" is allowed.
    assert.equal(
        parseNethackrc(`OPTIONS=${' '.repeat(121)}fruit:a`).pl_fruit,
        'a',
    );
    assert.equal(
        parseNethackrc(`OPTIONS=${' '.repeat(122)}fruit:a`).pl_fruit,
        'slime mold',
    );
    // The same unconditional trimspaces() call removes trailing padding from
    // OPTIONS before parseoptions() measures its raw element length.
    const paddedContinuation = (padding) => parseNethackrc([
        `OPTIONS=fruit:a${' '.repeat(padding)}\\`,
        '# terminate the pending logical line',
    ].join('\n')).pl_fruit;
    assert.equal(paddedContinuation(121), 'a');
    assert.equal(paddedContinuation(122), 'a');
    const overlongOption = parseNethackrc(
        `OPTIONS=!tutorial,fruit:${'x'.repeat(123)},!legacy`,
    );
    assert.equal(overlongOption.pl_fruit, 'slime mold');
    assert.equal(overlongOption.flags.tutorial, false);
    assert.equal(overlongOption.flags.legacy, false);
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
    assert.equal(parseNethackrc('OPTIONS=dogname:None').dogname, 'None');
    assert.equal(parseNethackrc('OPTIONS=!dogname').dogname, '');
    assert.equal(
        parseNethackrc(`OPTIONS=catname:${'x'.repeat(70)}`).catname.length,
        62,
    );
    assert.equal(parseNethackrc('OPTIONS=catname:A\u007fB').catname, 'A.B');

    // Thirty-two e-acute characters occupy 64 UTF-8 bytes. nmcpy() keeps
    // 62 bytes; with eight-bit tty input disabled, sanitation replaces each
    // printable high-bit byte with an underscore.
    assert.equal(
        parseNethackrc(`OPTIONS=catname:${'é'.repeat(32)}`).catname,
        '_'.repeat(62),
    );
    assert.equal(
        parseNethackrc(
            `OPTIONS=catname:${'é'.repeat(32)},eight_bit_tty`,
        ).catname,
        'é'.repeat(31),
    );
    // Right-to-left comma parsing sanitizes the name before this spelling
    // enables eight-bit tty input.
    assert.equal(
        parseNethackrc('OPTIONS=eight_bit_tty,catname:é').catname,
        '__',
    );
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
    assert.equal(
        parseNethackrc(`CAT=${'é'.repeat(32)}`).catname,
        'é'.repeat(31),
    );
    const munged = parseNethackrc(
        'NAME=Direct   Hero\nDOG=Fido\t\tThe   Dog',
    );
    assert.equal(munged.name, 'Direct Hero');
    assert.equal(munged.dogname, 'Fido The Dog');
    assert.equal(parseNethackrc('ROLE=random').flags.initrole, ROLE_NONE);

    // PL_NSIZ is 32 bytes including the terminator.  Both name handlers keep
    // 31 bytes, splitting the sixteenth two-byte e-acute at the C boundary.
    for (const configured of [
        `OPTIONS=name:${'é'.repeat(16)}`,
        `NAME=${'é'.repeat(16)}`,
    ]) {
        const truncated = parseNethackrc(configured).name;
        assert.equal(truncated.slice(0, 15), 'é'.repeat(15), configured);
        assert.equal(truncated.charCodeAt(15), 0xDCC3, configured);
    }
});

test('valid unported startup option mappings remain available', () => {
    const parsed = parseNethackrc(
        'OPTIONS=!autopickup,color,!legacy,!tutorial,!splash_screen,'
        + 'pushweapon,showexp,time,!verbose,symset:UTF8,msg_window:r,'
        + 'suppress_alert:3.7,soundlib:example,S_vwall:|',
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
    assert.equal(parsed.iflags.wc2_statuslines, 2);
    assert.equal(parsed.flags.suppress_alert, '3.7');
    assert.equal(parsed.flags.soundlib, 'example');
    assert.equal(parsed.flags.s_vwall, '|');

    for (const unknown of ['extension:value', 'constructor:value', 'mal']) {
        assert.throws(
            () => parseNethackrc(`OPTIONS=${unknown}`),
            /unknown option/u,
            unknown,
        );
    }
});

test('statuslines selects one of the two tty status-window heights', () => {
    assert.equal(
        parseNethackrc('OPTIONS=statuslines:3').iflags.wc2_statuslines,
        3,
    );
    assert.equal(
        parseNethackrc('OPTIONS=statuslines:2').iflags.wc2_statuslines,
        2,
    );
    assert.throws(
        () => parseNethackrc('OPTIONS=statuslines:4'),
        /statuslines.*2 or 3/u,
    );
});

test('showvers and versinfo preserve the release-build status selection', () => {
    const parsed = parseNethackrc('OPTIONS=showvers,versinfo:3');
    assert.equal(parsed.flags.showvers, true);
    assert.equal(parsed.flags.versinfo, 3);
    assert.equal(parseNethackrc('OPTIONS=versinfo:7').flags.versinfo, 7);
    assert.throws(
        () => parseNethackrc('OPTIONS=versinfo:8'),
        /versinfo.*1 through 7/u,
    );
});

test('prefix options validate their source suffixes', () => {
    const enabled = parseNethackrc('OPTIONS=cond_blin');
    const disabled = parseNethackrc('OPTIONS=!cond_blin');
    assert.equal(enabled.flags.cond_blind, true);
    assert.equal(disabled.flags.cond_blind, false);

    for (const invalid of [
        'cond_',
        'cond_bli',
        'cond_bogus',
        'cond_blind:on',
        'font',
        'fontbogus:value',
    ]) {
        assert.throws(
            () => parseNethackrc(`OPTIONS=${invalid}`),
            /unknown/u,
            invalid,
        );
    }
});

test('symbol assignments accept exactly the source symbol catalog', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/include/defsym.h', import.meta.url),
        'utf8',
    );
    const sourceNames = new Set(source.match(/\bS_[A-Za-z0-9_]+\b/gu));
    for (const name of [
        'S_nothing',
        'S_unexplored',
        'S_boulder',
        'S_invisible',
        'S_pet_override',
        'S_hero_override',
        'S_armour',
        ...Array.from({ length: 9 }, (_, index) => `S_explode${index + 1}`),
    ]) sourceNames.add(name);

    for (const name of sourceNames) {
        assert.doesNotThrow(
            () => parseNethackrc(`OPTIONS=${name}:x`),
            name,
        );
    }

    const symbols = parseNethackrc(
        'OPTIONS=S_vwall:|,S_VWALL:!,S_armour:[,!S_hwall:-',
    );
    assert.equal(symbols.flags.s_vwall, '|');
    assert.equal(symbols.flags.s_hwall, '-');
    assert.equal(symbols.flags.s_armour, '[');
    for (const invalid of ['s_vwall:|', 'S_bogus:x']) {
        assert.throws(
            () => parseNethackrc(`OPTIONS=${invalid}`),
            /unknown option/u,
            invalid,
        );
    }
});
