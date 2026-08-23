import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { config_error_done } from '../js/cfgfiles.js';
import { configLineStatements } from '../js/config_statement_data.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import { FOOD_CLASS, WEAPON_CLASS } from '../js/objects.js';
import {
    finishStartupBooleanOptions,
    optionAliasTarget,
    parseNethackrc,
} from '../js/options.js';
import { allopt, optionParserMetadata } from '../js/optlist_data.js';
import {
    EXT_ENCUMBER,
    GFILTER_AREA,
    GFILTER_NONE,
    GFILTER_VIEW,
    GPCOORDS_COMPASS,
    GPCOORDS_COMFULL,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    HL_BLINK,
    HL_BOLD,
    HL_DIM,
    HL_INVERSE,
    HL_ITALIC,
    HL_NONE,
    HL_ULINE,
    HL_UNDEF,
    HVY_ENCUMBER,
    MENU_COMBINATION,
    MENU_FULL,
    MENU_PARTIAL,
    MENU_TRADITIONAL,
    MOD_ENCUMBER,
    OVERLOADED,
    SLT_ENCUMBER,
    STONE,
    UNENCUMBERED,
} from '../js/const.js';
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
    MENU_SPELLINGS, loadPickupBurdenRecipe,
} from './run-pickup-burden.mjs';
import { loadOptionsDuplicateRecipe } from './run-options-duplicates.mjs';
import {
    loadStartupFontOptionsRecipe,
    verifyStartupFontOptionsSegment,
} from './run-startup-font-options.mjs';
import { loadStartupPickupTypesRecipe } from './run-startup-pickup-types.mjs';
import {
    STARTUP_MENUSTYLE_CASES,
    loadStartupMenustyleRecipe,
} from './run-startup-menustyle.mjs';
import {
    loadUnknownConfigStatementRecipe,
} from './run-unknown-config-statements.mjs';
import {
    ATR_BOLD,
    ATR_INVERSE,
    ATR_NONE,
    ATR_UNDERLINE,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_GREEN,
    CLR_BRIGHT_MAGENTA,
    CLR_BLUE,
    CLR_ORANGE,
    CLR_RED,
    NO_COLOR,
} from '../js/terminal.js';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

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
            acoustics: parsed.flags.acoustics,
            legacy: parsed.flags.legacy,
            tutorial: parsed.flags.tutorial,
            verbose: parsed.flags.verbose,
            splash: parsed.iflags.wc_splash_screen,
            color: parsed.iflags.wc_color,
            darkgray: parsed.iflags.wc2_darkgray,
            inverse: parsed.iflags.wc_inverse,
        },
        {
            pickup: false,
            bones: true,
            acoustics: true,
            legacy: true,
            tutorial: true,
            verbose: true,
            splash: true,
            color: true,
            darkgray: true,
            inverse: true,
        },
    );
    assert.equal(parsed.playmode, 'normal');
    assert.equal(parsed.flags.showvers, false);
    assert.equal(parsed.flags.versinfo, 1);
    assert.equal(parsed.iflags.altmeta, false);
    assert.equal(parsed.preferred_pet, '');
    // options.c PILE_LIMIT_DFLT is five before any startup option runs.
    assert.equal(parsed.flags.pile_limit, 5);
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

// C ref: options.c optfn_boolean() (5285), the common write through
// `allopt[optidx].addr`.  The generator turns each lvalue into one of the four
// paths this test reads; aliases and abbreviations still settle on that row
// before the handler runs.
test('every startup boolean writes its generated C address only', () => {
    const valueAtAddress = (parsed, addr) => {
        const path = addr === 'u.uroleplay'
            ? ['uroleplay']
            : addr.replace(/^u\.uroleplay\./u, 'uroleplay.').split('.');
        return path.reduce((owner, field) => owner[field], parsed);
    };
    const rows = allopt.filter((row) => row.opttyp === 'BoolOpt'
        && row.addr && row.setwhere !== 6 && row.name !== 'idlecheckpoint');
    let noncanonical = 0;
    for (const row of rows) {
        // Every addressed row that starts On accepts negation in this build,
        // so each statement changes the compiled-in value and proves that a
        // write occurred rather than merely observing its default.
        const expected = !row.initval;
        const statement = row.initval ? `!${row.name}` : row.name;
        const parsed = parseNethackrc(`OPTIONS=${statement}\n`);
        assert.equal(valueAtAddress(parsed, row.addr), expected, row.name);

        const canonicalFlagsAddress = `flags.${row.name.toLowerCase()}`;
        if (row.addr !== canonicalFlagsAddress) {
            ++noncanonical;
            assert.equal(
                Object.hasOwn(parsed.flags, row.name.toLowerCase()), false,
                row.name,
            );
        }
    }
    assert.equal(rows.length, 103);
    assert.equal(noncanonical, 65);
});

test('startup boolean post-write effects preserve their source order', () => {
    const pauper = parseNethackrc('OPTIONS=pauper');
    assert.equal(pauper.uroleplay.pauper, true);
    assert.equal(pauper.uroleplay.nudist, true);

    const tiled = parseNethackrc('OPTIONS=tiled_map');
    assert.equal(tiled.iflags.wc_tiled_map, true);
    assert.equal(tiled.iflags.wc_ascii_map, false);
    finishStartupBooleanOptions(tiled);
    assert.equal(tiled.iflags.wc_tiled_map, false);
    assert.equal(tiled.iflags.wc_ascii_map, true);

    // optfn_boolean() turns this value into its local `negated` before the
    // post-write.  A false ASCII request selects tiled mode until the tty
    // fallback above runs.
    const explicitAscii = parseNethackrc('OPTIONS=ascii_map:false');
    assert.equal(explicitAscii.iflags.wc_ascii_map, false);
    assert.equal(explicitAscii.iflags.wc_tiled_map, true);

    const hilite = parseNethackrc(
        'OPTIONS=petattr:none\nOPTIONS=hilite_pet\n',
    );
    assert.equal(hilite.iflags.wc_hilite_pet, true);
    assert.equal(hilite.iflags.wc2_petattr, ATR_INVERSE);
    assert.equal(hilite.go.opt_need_redraw, true);

    const idle = parseNethackrc('OPTIONS=idlecheckpoint\n');
    assert.equal(idle.iflags.idlecheckpoint, false);
    assert.equal(idle.give_opt_msg, false);
    assert.deepEqual(idle.startupEvents, [{
        text: "There is no underlying support for 'idlecheckpoint' compiled in.",
    }]);
});

test('pile_limit startup parsing follows optfn_pile_limit and C atoi', () => {
    const values = [
        // One is the smallest positive threshold and forces every object
        // chain into look_here()'s count arm.
        ['OPTIONS=pile_limit:1', 1],
        // Zero is the documented never-skip threshold.
        ['OPTIONS=pile_limit:0', 0],
        // C atoi() stops at the first non-digit after a valid decimal prefix.
        ['OPTIONS=pile_limit:9objects', 9],
        // C atoi() returns zero when no signed decimal prefix exists.
        ['OPTIONS=pile_limit:nonnumeric', 0],
        // A negative parsed result resets to the source default of five.
        ['OPTIONS=pile_limit:-1', 5],
        // Leading ASCII whitespace and an explicit plus sign are accepted by
        // C atoi(); seven keeps the assertion distinct from other cases.
        ['OPTIONS=pile_limit:   +7', 7],
        // The recorder narrows glibc atoi()'s signed-long result into the
        // 32-bit flags.pile_limit field before applying the negative reset.
        ['OPTIONS=pile_limit:2147483647', 2147483647],
        ['OPTIONS=pile_limit:2147483648', 5],
        ['OPTIONS=pile_limit:4294967295', 5],
        ['OPTIONS=pile_limit:4294967296', 0],
        ['OPTIONS=pile_limit:4294967298', 2],
        // glibc saturates signed-long overflow before that same narrowing.
        ['OPTIONS=pile_limit:9223372036854775808', 5],
        ['OPTIONS=pile_limit:-9223372036854775809', 0],
        // Both negated spellings select the never-skip value before gameplay.
        ['OPTIONS=!pile_limit', 0],
        ['OPTIONS=!pile_limit:', 0],
    ];
    for (const [rc, expected] of values) {
        const parsed = parseNethackrc(`${rc}\n`);
        assert.equal(parsed.flags.pile_limit, expected, rc);
        // string_for_opt(opts, negated) makes the value optional for a negated
        // statement, so none of these reports anything.
        assert.deepEqual(parsed.configErrorFrame.output, [], rc);
    }

    // The same argument makes it mandatory for a positive statement, so a
    // spelling without one reports and then takes C's third arm, which
    // restores PILE_LIMIT_DFLT rather than leaving the option be.
    for (const rc of ['OPTIONS=pile_limit', 'OPTIONS=pile_limit:']) {
        const parsed = parseNethackrc(`${rc}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${rc}`,
            ` * Line 1: Missing parameter for '${rc.slice('OPTIONS='.length)}'.`,
        ], rc);
        assert.equal(parsed.flags.pile_limit, 5, rc);
    }
    // bad_negation() is the handler's own rejection for a negated value;
    // three is the smallest ordinary count threshold above the two edge.
    // flags.pile_limit keeps the default the parse started from.
    const negatedValue = parseNethackrc('OPTIONS=!pile_limit:3\n');
    assert.deepEqual(negatedValue.configErrorFrame.output, [
        '\nOPTIONS=!pile_limit:3',
        ' * Line 1: The pile_limit option may not both have a value and be'
        + ' negated.',
    ]);
    assert.equal(negatedValue.flags.pile_limit, 5);
});

// C refs: optlist.h's ten font rows; options.c optfn_font_*(),
// pfxfn_font(), and wc_set_font_name(); flag.h instance_flags.
test('startup font options store names and atoi sizes at their C addresses',
    () => {
        const names = [
            'font_map', 'font_menu', 'font_message', 'font_size_map',
            'font_size_menu', 'font_size_message', 'font_size_status',
            'font_size_text', 'font_status', 'font_text',
        ];
        const rows = allopt.filter((row) => names.includes(row.name));
        assert.deepEqual(rows.map((row) => row.name), names);
        for (const row of rows) {
            assert.equal(row.opttyp, 'CompOpt', row.name);
            assert.equal(row.setwhere, 3, row.name); // set_gameview
            assert.equal(row.negateok, true, row.name);
            assert.equal(row.valok, true, row.name);
            assert.equal(row.pfx, false, row.name);
            assert.equal(row.addr, null, row.name);
            assert.equal(row.optfn, row.name, row.name);
            assert.deepEqual(
                optionParserMetadata[row.name], { dupeok: true }, row.name,
            );
        }
        const prefix = allopt.find((row) => row.name === 'font');
        assert.equal(prefix.pfx, true);
        assert.equal(prefix.optfn, 'font');
        assert.deepEqual(optionParserMetadata.font, { dupeok: true });

        const defaults = parseNethackrc('').iflags;
        assert.deepEqual({
            wc_font_map: defaults.wc_font_map ?? null,
            wc_font_menu: defaults.wc_font_menu ?? null,
            wc_font_message: defaults.wc_font_message ?? null,
            wc_font_status: defaults.wc_font_status ?? null,
            wc_font_text: defaults.wc_font_text ?? null,
            wc_fontsiz_map: defaults.wc_fontsiz_map ?? 0,
            wc_fontsiz_menu: defaults.wc_fontsiz_menu ?? 0,
            wc_fontsiz_message: defaults.wc_fontsiz_message ?? 0,
            wc_fontsiz_status: defaults.wc_fontsiz_status ?? 0,
            wc_fontsiz_text: defaults.wc_fontsiz_text ?? 0,
        }, {
            wc_font_map: null,
            wc_font_menu: null,
            wc_font_message: null,
            wc_font_status: null,
            wc_font_text: null,
            wc_fontsiz_map: 0,
            wc_fontsiz_menu: 0,
            wc_fontsiz_message: 0,
            wc_fontsiz_status: 0,
            wc_fontsiz_text: 0,
        });

        const parsed = parseNethackrc([
            'OPTIONS=font_map:Map Face,font_menu:Menu Face,'
                + 'font_message:Message Face,font_status:Status Face,'
                + 'font_text:Text Face',
            'OPTIONS=font_size_map: +17tail,font_size_menu:nonnumeric,'
                + 'font_size_message:2147483648,'
                + 'font_size_status:4294967298,'
                + 'font_size_text:9223372036854775808',
            '',
        ].join('\n'));
        assert.deepEqual(parsed.configErrorFrame.output, []);
        assert.deepEqual({
            wc_font_map: parsed.iflags.wc_font_map,
            wc_font_menu: parsed.iflags.wc_font_menu,
            wc_font_message: parsed.iflags.wc_font_message,
            wc_font_status: parsed.iflags.wc_font_status,
            wc_font_text: parsed.iflags.wc_font_text,
            wc_fontsiz_map: parsed.iflags.wc_fontsiz_map,
            wc_fontsiz_menu: parsed.iflags.wc_fontsiz_menu,
            wc_fontsiz_message: parsed.iflags.wc_fontsiz_message,
            wc_fontsiz_status: parsed.iflags.wc_fontsiz_status,
            wc_fontsiz_text: parsed.iflags.wc_fontsiz_text,
        }, {
            wc_font_map: 'Map Face',
            wc_font_menu: 'Menu Face',
            wc_font_message: 'Message Face',
            wc_font_status: 'Status Face',
            wc_font_text: 'Text Face',
            wc_fontsiz_map: 17,
            wc_fontsiz_menu: 0,
            wc_fontsiz_message: -2147483648,
            wc_fontsiz_status: 2,
            wc_fontsiz_text: -1,
        });
    });

test('font negation and duplicate handling follow pfxfn_font ordering', () => {
    const negatedValues = parseNethackrc([
        'OPTIONS=font_map:before,font_size_map:17',
        'OPTIONS=!font_map:after,!font_size_map:99',
        '',
    ].join('\n'));
    // pfxfn_font() stores a nonempty name before considering negation, but
    // its size arm tests !negated before it even calls string_for_opt().
    assert.equal(negatedValues.iflags.wc_font_map, 'after');
    assert.equal(negatedValues.iflags.wc_fontsiz_map, 17);
    assert.deepEqual(negatedValues.configErrorFrame.output, [
        '\nOPTIONS=!font_map:after,!font_size_map:99',
        ' * Line 2: compound option specified multiple times: font_size_map.',
    ]);

    for (const statement of ['!font_map', '!font_map:']) {
        const parsed = parseNethackrc(`OPTIONS=${statement}\n`);
        assert.equal(parsed.iflags.wc_font_map ?? null, null, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${statement}`,
            ` * Line 1: Missing parameter for '${statement.slice(1)}'.`,
            ' * Line 1: The font_map option may not both have a value and be'
                + ' negated.',
        ], statement);
    }
    for (const statement of ['!font_size_map', '!font_size_map:']) {
        const parsed = parseNethackrc(`OPTIONS=${statement}\n`);
        assert.equal(parsed.iflags.wc_fontsiz_map ?? 0, 0, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }

    const duplicateName = parseNethackrc(
        'OPTIONS=font_map:left,font_map:right\n',
    );
    assert.equal(duplicateName.iflags.wc_font_map, 'left');
    assert.deepEqual(duplicateName.configErrorFrame.output, []);

    const duplicateSize = parseNethackrc(
        'OPTIONS=font_size_map:11,font_size_map:22\n',
    );
    assert.equal(duplicateSize.iflags.wc_fontsiz_map, 11);
    assert.deepEqual(duplicateSize.configErrorFrame.output, [
        '\nOPTIONS=font_size_map:11,font_size_map:22',
        ' * Line 1: compound option specified multiple times: font_size_map.',
    ]);
});

test('the startup font recipe uses the selected witness and parser fields',
    async () => {
        const recipe = loadStartupFontOptionsRecipe();
        assert.equal(recipe.segments.length, 4);
        for (const segment of recipe.segments) {
            assert.equal(segment.seed, 7331201);
            assert.equal(segment.datetime, '20040229141500');
        }
        assert.match(
            recipe.segments.at(-1).nethackrc,
            /^OPTIONS=fontbogus:value$/mu,
        );
        await withSerializedGrids(async () => {
            for (const segment of recipe.segments)
                await verifyStartupFontOptionsSegment(segment);
        });
    });

// C ref: options.c optfn_pickup_burden() (3266-3291). Every expected level is
// the constant that arm assigns for the letter, read from include/hack.h
// (458-463): UNENCUMBERED 0 through OVERLOADED 5.
test('pickup_burden parsing follows optfn_pickup_burden switch', () => {
    const values = [
        // The switch's seven letters, which are handler_pickup_burden()'s
        // menu accelerators "ubsntl" plus 't'. Each one is the only spelling
        // that reliably selects its level.
        ['OPTIONS=pickup_burden:u', UNENCUMBERED],
        ['OPTIONS=pickup_burden:b', SLT_ENCUMBER],
        ['OPTIONS=pickup_burden:s', MOD_ENCUMBER],
        ['OPTIONS=pickup_burden:n', HVY_ENCUMBER],
        ['OPTIONS=pickup_burden:o', EXT_ENCUMBER],
        ['OPTIONS=pickup_burden:t', EXT_ENCUMBER],
        ['OPTIONS=pickup_burden:l', OVERLOADED],
        // The six names options.c burdentype[] (213-216) holds, which are
        // what the options menu prints back and what a player writing a
        // config file would copy. Only lowc(*op) is read, and the letters
        // above were chosen from the middle of two of those names -- 'n' for
        // straiNed and 't' for overTaxed -- so four names agree with the
        // level they name and two do not.
        ['OPTIONS=pickup_burden:unencumbered', UNENCUMBERED],
        ['OPTIONS=pickup_burden:burdened', SLT_ENCUMBER],
        ['OPTIONS=pickup_burden:stressed', MOD_ENCUMBER],
        ['OPTIONS=pickup_burden:overtaxed', EXT_ENCUMBER],
        // "strained" shares its first letter with "stressed", so asking for
        // heavy encumbrance by name gets moderate encumbrance instead.
        ['OPTIONS=pickup_burden:strained', MOD_ENCUMBER],
        // "overloaded" shares its first letter with "overtaxed", so asking
        // for the highest level by name gets the second highest.
        ['OPTIONS=pickup_burden:overloaded', EXT_ENCUMBER],
        // lowc() folds only 'A' through 'Z', and every accepted letter is a
        // plain ASCII one, so an uppercase spelling reaches the same arm.
        ['OPTIONS=pickup_burden:Burdened', SLT_ENCUMBER],
        ['OPTIONS=pickup_burden:L', OVERLOADED],
        // Nothing past the first byte is examined: a word that no burden is
        // named after still selects the arm its initial letter holds.
        ['OPTIONS=pickup_burden:banana', SLT_ENCUMBER],
        // parseoptions() matches an abbreviated option name through
        // allopt[].minmatch, and the value is read from the same statement.
        ['OPTIONS=pickup_bu:n', HVY_ENCUMBER],
    ];
    for (const [rc, expected] of values)
        assert.equal(parseNethackrc(rc).flags.pickup_burden, expected, rc);

    // options.c initoptions_init() (7207) starts the option at MOD_ENCUMBER,
    // so a file that never names it leaves stressed behind.
    assert.equal(parseNethackrc('').flags.pickup_burden, MOD_ENCUMBER);

    // string_for_env_opt(name, opts, FALSE) makes the value mandatory, so
    // both spellings without one are the "Missing parameter" config error,
    // which names the whole statement and leaves the MOD_ENCUMBER default.
    for (const rc of ['OPTIONS=pickup_burden', 'OPTIONS=pickup_burden:']) {
        const parsed = parseNethackrc(rc);
        assert.equal(parsed.flags.pickup_burden, MOD_ENCUMBER, rc);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${rc}`,
            ` * Line 1: Missing parameter for '${rc.slice('OPTIONS='.length)}'.`,
        ], rc);
    }
    // A letter outside "ubsnotl" falls to the handler's config_error_add()
    // default. 'x' is the first letter of no burden name.
    const unknown = parseNethackrc('OPTIONS=pickup_burden:xyzzy');
    assert.equal(unknown.flags.pickup_burden, MOD_ENCUMBER);
    assert.deepEqual(unknown.configErrorFrame.output, [
        '\nOPTIONS=pickup_burden:xyzzy',
        " * Line 1: Unknown pickup_burden parameter 'xyzzy'.",
    ]);
    // string_for_opt() returns everything after the colon without trimming,
    // so a leading space is the byte the switch reads and no arm matches it.
    assert.deepEqual(
        parseNethackrc('OPTIONS=pickup_burden: stressed')
            .configErrorFrame.output.at(-1),
        " * Line 1: Unknown pickup_burden parameter ' stressed'.",
    );
    // optlist.h:573 gives the option negateok No, so parseoptions() answers
    // every negated spelling with bad_negation() before optfn_pickup_burden()
    // runs, and the default the handler never replaced survives.
    for (const rc of ['OPTIONS=!pickup_burden', 'OPTIONS=!pickup_burden:l']) {
        const negated = parseNethackrc(rc);
        assert.equal(negated.flags.pickup_burden, MOD_ENCUMBER, rc);
        assert.deepEqual(negated.configErrorFrame.output, [
            `\n${rc}`,
            ' * Line 1: The pickup_burden option may not both have a value'
            + ' and be negated.',
        ], rc);
    }
});

// scripts/run-pickup-burden.mjs is what proves the mapping against C: five of
// its segments open the options menu, whose value column prints
// optfn_pickup_burden()'s get_val arm. Derive those expectations from this
// parse, so a spelling that changes here stops agreeing with the screen the
// recording captured.
test('the recorded burden matrix agrees with the parse', () => {
    // options.c burdentype[] (213-216), indexed by the encumbrance level.
    const burdentype = [
        'unencumbered', 'burdened', 'stressed',
        'strained', 'overtaxed', 'overloaded',
    ];
    for (const [spelling, shown] of MENU_SPELLINGS) {
        assert.equal(
            burdentype[
                parseNethackrc(`OPTIONS=pickup_burden:${spelling}`)
                    .flags.pickup_burden
            ],
            shown,
            spelling,
        );
    }
    const { segments } = loadPickupBurdenRecipe();
    // Five menu segments and the two wish segments that spend the level
    // rather than printing it. Only a debug game admits a wish, so those two
    // are the only ones that set playmode.
    assert.equal(segments.length, MENU_SPELLINGS.length + 2);
    for (const segment of segments)
        assert.match(segment.nethackrc, /OPTIONS=pickup_burden:/u);
    assert.equal(
        segments.filter(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        ).length,
        2,
    );
});

test('the startup pickup_types recipe reaches attributes with parsed classes',
    () => {
        const { segments } = loadStartupPickupTypesRecipe();
        assert.equal(segments.length, 1);
        const [segment] = segments;
        assert.deepEqual(
            parseNethackrc(segment.nethackrc).flags.pickup_types,
            [WEAPON_CLASS, FOOD_CLASS],
        );
        assert.equal(segment.moves, '\x18\x1b:');
    });

test('the startup menustyle recipe reaches the full menu with parsed enums',
    () => {
        const { segments } = loadStartupMenustyleRecipe();
        assert.equal(segments.length, STARTUP_MENUSTYLE_CASES.length);
        assert.equal(segments.length, 9);
        assert.ok(segments.every(
            (segment) => !Object.hasOwn(segment, 'steps')
                && segment.moves.includes('mO'),
        ));
        assert.deepEqual(
            segments.map(
                (segment) => parseNethackrc(segment.nethackrc)
                    .flags.menu_style,
            ),
            [
                MENU_TRADITIONAL,
                MENU_COMBINATION,
                MENU_PARTIAL,
                MENU_FULL,
                MENU_FULL,
                MENU_FULL,
                MENU_TRADITIONAL,
                MENU_FULL,
                MENU_PARTIAL,
            ],
        );
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
    // C's optfn_role() reports the value str2role() rejected and returns
    // optn_err, so flags.initrole stays ROLE_NONE and character selection
    // asks for a role instead of the file supplying one.
    const bogus = parseNethackrc('OPTIONS=role:BogusRole\n');
    assert.deepEqual(bogus.configErrorFrame.output, [
        '\nOPTIONS=role:BogusRole',
        " * Line 1: Unknown role 'BogusRole'.",
    ]);
    assert.equal(bogus.flags.initrole, ROLE_NONE);
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
    // The opposite textual order applies the positive duplicate last, which
    // parse_role_opt() answers with complain_about_duplicate() and FALSE.
    // optfn_role() turns that into optn_silenterr, so the filter the negated
    // element already installed stands and no role is chosen.
    const positiveDuplicate = parseNethackrc(
        'OPTIONS=role:Wizard,role:!Tourist\n',
    );
    assert.deepEqual(positiveDuplicate.configErrorFrame.output, [
        '\nOPTIONS=role:Wizard,role:!Tourist',
        ' * Line 1: compound option specified multiple times: role.',
    ]);
    assert.equal(positiveDuplicate.flags.initrole, ROLE_NONE);
    assert.equal(
        positiveDuplicate.roleFilter.roles[str2role('Tourist')],
        true,
    );
});

// C ref: options.c complain_about_duplicate() (6789-6808), reached from
// parse_role_opt():7990-7994.  Its clause names allopt[optidx].alias, the
// complained-about row's own spelling, and options.c:503's `using_alias` says
// whether the clause is printed at all.  That flag is a file static cleared at
// the top of every parseoptions() call, and the comma recursion at :513-521
// runs before the level's own match loops, so it survives leftwards along one
// configuration-file line and no further.
test('a duplicate role names the alias when the flag C keeps says to', () => {
    // Each pair below installs a negated value first, which is what makes the
    // positive one that follows reach complain_about_duplicate() rather than
    // simply replacing it.
    for (const [rc, reported] of [
        // Resolved through the alias table: the clause names the row's alias,
        // which is the spelling used here only because match_optname() accepts
        // nothing shorter than the whole alias.
        ['OPTIONS=character:!Valkyrie\nOPTIONS=character:Samurai',
            'compound option specified multiple times: role'
            + ' (via alias: character)'],
        // Resolved by name on its own line: the flag was cleared for that line
        // and nothing to the right of the statement raised it.
        ['OPTIONS=role:!Valkyrie\nOPTIONS=role:Samurai',
            'compound option specified multiple times: role'],
        // The alias spelling on the earlier line does not carry over.
        ['OPTIONS=character:!Valkyrie\nOPTIONS=role:Samurai',
            'compound option specified multiple times: role'],
        // The other aliased row of the four.
        ['OPTIONS=align:!lawful\nOPTIONS=align:chaotic',
            'compound option specified multiple times: alignment'
            + ' (via alias: align)'],
    ]) {
        const parsed = parseNethackrc(`${rc}\n`);
        const statement = rc.slice(rc.lastIndexOf('\n') + 1);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ` * Line 2: ${reported}.`,
        ], rc);
    }

    // One line, three elements, applied right to left.  "align:!lawful" is the
    // rightmost and resolves through the alias table, so the flag it raises is
    // still up when the leftmost element reports -- even though that element
    // named its row in full.  A recorded C run of this exact line prints the
    // clause.
    for (const [line, reported] of [
        ['OPTIONS=role:Samurai,role:!Valkyrie,align:!lawful',
            'compound option specified multiple times: role'
            + ' (via alias: character)'],
        // optlist.h gives the race row NoAlias, a null pointer, and the
        // reference build's C library renders a null "%s" as "(null)".
        ['OPTIONS=race:human,race:!elf,align:!lawful',
            'compound option specified multiple times: race'
            + ' (via alias: (null))'],
        // The same three elements with the aliased one leftmost: it is applied
        // last, so nothing had raised the flag when the report was written.
        ['OPTIONS=align:!lawful,role:Samurai,role:!Valkyrie',
            'compound option specified multiple times: role'],
    ]) {
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: ${reported}.`,
        ], line);
    }

    // The alias loop runs only when the name loop failed, and raises the flag
    // only when it then matched.  "zqxj" is the rightmost element and fails
    // both loops, so it leaves the flag down for the two role elements to its
    // left; treating "the name loop failed" as enough would print the clause.
    const unknownToTheRight = 'OPTIONS=role:Samurai,role:!Valkyrie,zqxj';
    assert.deepEqual(
        parseNethackrc(`${unknownToTheRight}\n`).configErrorFrame.output,
        [
            `\n${unknownToTheRight}`,
            " * Line 1: Unknown option 'zqxj'.",
            ' * Line 1: compound option specified multiple times: role.',
        ],
    );
});

// C refs: options.c parseoptions() (621-623),
// reset_duplicate_opt_detection() (6773-6779),
// duplicate_opt_detection() (6782-6787), and
// complain_about_duplicate() (6789-6808). read_config_file() resets one
// counter per allopt[] row before reading the rc; each match advances its
// counter before bad_negation() and handler dispatch.
test('startup duplicate detection follows each allopt row', () => {
    const repeatedBoolean = parseNethackrc(
        'OPTIONS=autopickup,!autopickup\n',
    );
    assert.equal(repeatedBoolean.flags.pickup, true);
    assert.deepEqual(repeatedBoolean.configErrorFrame.output, [
        '\nOPTIONS=autopickup,!autopickup',
        ' * Line 1: boolean option specified multiple times: autopickup.',
    ]);

    // The rightmost alias raises options.c's file-static using_alias flag.
    // Complain_about_duplicate() then prints the matched row's own alias even
    // though the left element used the canonical spelling.
    const viaAlias = parseNethackrc('OPTIONS=color,!colour\n');
    assert.deepEqual(viaAlias.configErrorFrame.output, [
        '\nOPTIONS=color,!colour',
        ' * Line 1: boolean option specified multiple times: color'
        + ' (via alias: colour).',
    ]);

    // The counter advances before bad_negation(), so the valid occurrence on
    // the next line is already a duplicate and still reaches its handler.
    const rejectedFirst = parseNethackrc([
        'OPTIONS=!sortloot:none',
        'OPTIONS=sortloot:full',
        '',
    ].join('\n'));
    assert.equal(rejectedFirst.flags.sortloot, 'f');
    assert.deepEqual(rejectedFirst.configErrorFrame.output, [
        '\nOPTIONS=!sortloot:none',
        ' * Line 1: The sortloot option may not both have a value and be'
        + ' negated.',
        '\nOPTIONS=sortloot:full',
        ' * Line 2: compound option specified multiple times: sortloot.',
    ]);

    // optfn_playmode() consumes the same duplicate value. It refuses the
    // leftmost setting after the general report, leaving the rightmost one.
    const repeatedPlaymode = parseNethackrc(
        'OPTIONS=playmode:debug,playmode:normal\n',
    );
    assert.equal(repeatedPlaymode.playmode, 'normal');
    assert.equal(repeatedPlaymode.flags.debug, false);
    assert.deepEqual(repeatedPlaymode.configErrorFrame.output, [
        '\nOPTIONS=playmode:debug,playmode:normal',
        ' * Line 1: compound option specified multiple times: playmode.',
    ]);

    // OthrOpt is the third allopt_t type, but C's conditional calls every row
    // other than CompOpt "boolean" in this message.
    const repeatedOther = parseNethackrc(
        'OPTIONS=autocompletions:x,autocompletions:y\n',
    );
    assert.deepEqual(repeatedOther.configErrorFrame.output, [
        '\nOPTIONS=autocompletions:x,autocompletions:y',
        ' * Line 1: boolean option specified multiple times: autocompletions.',
    ]);

    // The four character rows set dupeok. Their handlers retain their own
    // duplicate rules, so two positive values select the leftmost one without
    // a general report.
    const repeatAllowed = parseNethackrc(
        'OPTIONS=role:Valkyrie,role:Healer\n',
    );
    assert.equal(repeatAllowed.flags.initrole, str2role('Valkyrie'));
    assert.deepEqual(repeatAllowed.configErrorFrame.output, []);

    // A new parseNethackrc() call models the next read_config_file() call and
    // therefore starts with reset counters.
    assert.deepEqual(
        parseNethackrc('OPTIONS=autopickup\n').configErrorFrame.output,
        [],
    );
});

// The fresh matrix drives each duplicate case through rcfile() and the first
// gameplay boundary. Keep its setup tied to the focused parser assertions so
// a recipe edit cannot silently stop exercising the intended C branches.
test('the duplicate-option recipe retains its source branch matrix', () => {
    const recipe = loadOptionsDuplicateRecipe();
    assert.equal(recipe.segments.length, 6);
    const parsed = recipe.segments.map(
        ({ nethackrc }) => parseNethackrc(nethackrc),
    );
    assert.deepEqual(
        parsed.map(({ configErrorFrame }) => configErrorFrame.num_errors),
        [22, 22, 22, 23, 0, 22],
    );
    assert.equal(parsed[0].flags.pickup, true);
    assert.deepEqual(parsed[1].flags.pickup_types, [WEAPON_CLASS]);
    assert.equal(parsed[2].iflags.wc_color, true);
    assert.equal(parsed[3].flags.sortloot, 'f');
    assert.equal(parsed[4].flags.initrole, str2role('Valkyrie'));
    assert.equal(parsed[5].playmode, 'normal');
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

    // color_attr_parse_str() reports through match_str2clr() and
    // match_str2attr(), so the message names the half that failed rather than
    // the whole value, and each of these reaches that point differently: the
    // colour half matched and the attribute half did not, the attribute half
    // matched and the colour half did not, and a second '&' stays inside the
    // attribute half because C splits only at the first one.  All three leave
    // iflags.menu_headings at the default optfn_menu_headings() never reached.
    for (const [invalid, reported] of [
        ['red&blue', " * Line 1: Unknown text attribute 'blue'."],
        ['bold&inverse', " * Line 1: Unknown color 'bold'."],
        ['red&bold&underline',
            " * Line 1: Unknown text attribute 'bold&underline'."],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=menu_headings:${invalid}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=menu_headings:${invalid}`,
            reported,
        ], invalid);
        assert.deepEqual(parsed.iflags.menu_headings, {
            attr: ATR_INVERSE,
            color: NO_COLOR,
        }, invalid);
    }

    // A value with no '&' at all takes the other arm, where the attribute
    // lookup is asked first and suppresses its own message so that only the
    // colour lookup reports.
    const onePart = parseNethackrc('OPTIONS=menu_headings:zqxj\n');
    assert.deepEqual(onePart.configErrorFrame.output, [
        '\nOPTIONS=menu_headings:zqxj',
        " * Line 1: Unknown color 'zqxj'.",
    ]);
    assert.deepEqual(onePart.iflags.menu_headings, {
        attr: ATR_INVERSE,
        color: NO_COLOR,
    });

    // A leading '&' still splits, so the colour half is the empty string and
    // the attribute half carries the whole value.  This is the one place the
    // two arms answer differently for the same text.
    const emptyColor = parseNethackrc('OPTIONS=menu_headings:&bold\n');
    assert.deepEqual(emptyColor.configErrorFrame.output, [
        '\nOPTIONS=menu_headings:&bold',
        " * Line 1: Unknown color ''.",
    ]);

    // A value that matches neither way makes the retry visible: C's own
    // comment calls it useless because both lookups have already reported,
    // and that is exactly what produces four messages in this order.
    const bothWays = parseNethackrc('OPTIONS=menu_headings:zqxj&wobble\n');
    assert.deepEqual(bothWays.configErrorFrame.output, [
        '\nOPTIONS=menu_headings:zqxj&wobble',
        " * Line 1: Unknown color 'zqxj'.",
        " * Line 1: Unknown text attribute 'wobble'.",
        " * Line 1: Unknown color 'wobble'.",
        " * Line 1: Unknown text attribute 'zqxj'.",
    ]);

    // The handler reads the value parseoptions() already found, so a
    // statement without one is not an error: it selects inverse, or nothing
    // at all when negated.  A negated statement that does carry one is the
    // handler's own bad_negation().
    for (const [statement, headings] of [
        ['OPTIONS=menu_headings',
            { attr: ATR_INVERSE, color: NO_COLOR }],
        ['OPTIONS=menu_headings:',
            { attr: ATR_INVERSE, color: NO_COLOR }],
        ['OPTIONS=!menu_headings', { attr: ATR_NONE, color: NO_COLOR }],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.deepEqual(parsed.iflags.menu_headings, headings, statement);
    }
    const negatedValue = parseNethackrc('OPTIONS=!menu_headings:red\n');
    assert.deepEqual(negatedValue.configErrorFrame.output, [
        '\nOPTIONS=!menu_headings:red',
        ' * Line 1: The menu_headings option may not both have a value and be'
        + ' negated.',
    ]);
    assert.deepEqual(negatedValue.iflags.menu_headings, {
        attr: ATR_INVERSE,
        color: NO_COLOR,
    });
});

// C refs: coloratt.c match_str2clr():367 and match_str2attr():386.  Their
// "%.60s" and "%.50s" precisions count bytes, and parseoptions()
// (options.c:520-524) turns away only a statement past BUFSZ/2 = 128 bytes, so
// an ordinary rc line can carry a value that is longer than the precision in
// bytes and shorter than it in characters.
test('an over-long colour or attribute is cut at bytes, not characters', () => {
    // 'é' is two UTF-8 bytes, so thirty of them and an 'a' is 61 bytes in 31
    // characters: past the sixty-byte precision, less than half way to sixty
    // characters.  Cutting characters instead would print the whole value.
    const colour = `${'é'.repeat(30)}a`;
    const overLong = parseNethackrc(`OPTIONS=menu_headings:${colour}\n`);
    assert.deepEqual(overLong.configErrorFrame.output, [
        `\nOPTIONS=menu_headings:${colour}`,
        ` * Line 1: Unknown color '${'é'.repeat(30)}'.`,
    ]);

    // The precision can fall inside a character.  '€' is three bytes, so an
    // 'a' and 21 of them reaches byte 60 two bytes into the twentieth '€';
    // C copies those two bytes alone, and js/hacklib.js carries an orphaned
    // byte as 0xDC00 plus its value.
    const split = `a${'€'.repeat(21)}`;
    const splitColour = parseNethackrc(`OPTIONS=menu_headings:${split}\n`);
    assert.deepEqual(splitColour.configErrorFrame.output, [
        `\nOPTIONS=menu_headings:${split}`,
        ` * Line 1: Unknown color 'a${'€'.repeat(19)}\uDCE2\uDC82'.`,
    ]);

    // match_str2attr() reports only from color_attr_parse_str()'s '&' arm,
    // which is the one that passes complain TRUE, and its precision is fifty
    // bytes: 25 'é' and an 'a' is 51.
    const attribute = `${'é'.repeat(25)}a`;
    const overLongAttr = parseNethackrc(
        `OPTIONS=menu_headings:red&${attribute}\n`,
    );
    assert.deepEqual(overLongAttr.configErrorFrame.output, [
        `\nOPTIONS=menu_headings:red&${attribute}`,
        ` * Line 1: Unknown text attribute '${'é'.repeat(25)}'.`,
    ]);
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

test('use_darkgray preserves the source option state', () => {
    assert.equal(parseNethackrc('').iflags.wc2_darkgray, true);
    assert.equal(
        parseNethackrc('OPTIONS=!use_darkgray').iflags.wc2_darkgray,
        false,
    );
    assert.equal(
        parseNethackrc('OPTIONS=use_darkgray:false').iflags.wc2_darkgray,
        false,
    );
    assert.equal(
        parseNethackrc('OPTIONS=!use_darkgray,use_darkgray')
            .iflags.wc2_darkgray,
        false,
        'parseoptions applies comma-separated suffixes first',
    );
});

test('explicit boolean values reach their source-owned state', () => {
    const parsed = parseNethackrc(
        'OPTIONS=mention_map:true,mon_movement:true,'
            + 'spot_monsters:false,menu_overlay:false,altmeta:true',
    );
    assert.equal(parsed.a11y.glyph_updates, true);
    assert.equal(parsed.a11y.mon_movement, true);
    assert.equal(parsed.a11y.mon_notices, false);
    assert.equal(parsed.iflags.menu_overlay, false);
    assert.equal(parsed.iflags.altmeta, true);
    assert.equal(Object.hasOwn(parsed.flags, 'mention_map'), false);
    assert.equal(Object.hasOwn(parsed.flags, 'mon_movement'), false);
    assert.equal(Object.hasOwn(parsed.flags, 'spot_monsters'), false);
    assert.equal(Object.hasOwn(parsed.flags, 'menu_overlay'), false);

    const negated = parseNethackrc(
        'OPTIONS=!mention_map,!mon_movement,!spot_monsters,'
            + '!menu_overlay,!altmeta',
    );
    assert.equal(negated.a11y.glyph_updates, false);
    assert.equal(negated.a11y.mon_movement, false);
    assert.equal(negated.a11y.mon_notices, false);
    assert.equal(negated.iflags.menu_overlay, false);
    assert.equal(negated.iflags.altmeta, false);
    assert.equal(
        parseNethackrc('OPTIONS=altmeta:false').iflags.altmeta,
        false,
    );
    // options.c optfn_boolean():5216-5221 reports the negation and returns
    // optn_silenterr, so the statement sets nothing and the option keeps the
    // opt_in default of Off.  scripts/config-error.test.mjs pins the message
    // and the on-by-default rows that make the two answers differ.
    const negatedValue = parseNethackrc('OPTIONS=!mention_map:true\n');
    assert.equal(negatedValue.configErrorFrame.num_errors, 1);
    assert.equal(negatedValue.a11y.glyph_updates, false);

    // options.c optfn_boolean() uses digit(*op) with atoi(op), so leading
    // decimal 0/1 spellings may contain padding or a nonnumeric suffix.
    for (const [value, enabled] of [
        ['01', true], ['00', false], ['1suffix', true], ['0suffix', false],
    ]) {
        assert.equal(
            parseNethackrc(`OPTIONS=mention_map:${value}`)
                .a11y.glyph_updates,
            enabled,
            value,
        );
    }
    // Every other spelling reaches optfn_boolean():5233-5237, which reports
    // and returns optn_silenterr.  optlist.h:427-429 gives mention_map opt_in
    // with an initval of Off, so a statement that wrongly set the option
    // anyway would leave a11y.glyph_updates true instead.  '-1' fails
    // digit(*op) rather than atoi(), and lands on the same arm.
    for (const value of ['2', '10', '9suffix', '-1']) {
        const refused = parseNethackrc(`OPTIONS=mention_map:${value}\n`);
        assert.deepEqual(
            refused.configErrorFrame.output,
            [
                `\nOPTIONS=mention_map:${value}`,
                ` * Line 1: 'mention_map:${value}' is not valid for a boolean.`,
            ],
            value,
        );
        assert.equal(refused.a11y.glyph_updates, false, value);
    }
});

test('safe interaction options keep their source defaults and state owners',
    () => {
    const defaults = parseNethackrc('');
    assert.equal(defaults.flags.safe_dog, true);
    assert.equal(defaults.flags.safe_wait, true);
    assert.equal(defaults.iflags.cmdassist, true);
    assert.equal(Object.hasOwn(defaults.flags, 'cmdassist'), false);

    const disabled = parseNethackrc(
        'OPTIONS=safe_pet:false,safe_wait:false,cmdassist:false',
    );
    assert.equal(disabled.flags.safe_dog, false);
    assert.equal(disabled.flags.safe_wait, false);
    assert.equal(disabled.iflags.cmdassist, false);
    assert.equal(Object.hasOwn(disabled.flags, 'cmdassist'), false);

    const negated = parseNethackrc(
        'OPTIONS=!safe_pet,!safe_wait,!cmdassist',
    );
    assert.equal(negated.flags.safe_dog, false);
    assert.equal(negated.flags.safe_wait, false);
    assert.equal(negated.iflags.cmdassist, false);

    const enabled = parseNethackrc(
        'OPTIONS=!safe_pet,!safe_wait,!cmdassist,safe_pet:true,'
            + 'safe_wait:true,cmdassist:true',
    );
    // parseoptions() applies comma-separated suffixes first, so the leftmost
    // duplicate remains the final value.
    assert.equal(enabled.flags.safe_dog, false);
    assert.equal(enabled.flags.safe_wait, false);
    assert.equal(enabled.iflags.cmdassist, false);
});

test('autoopen reaches the boolean handler in every negated spelling', () => {
    // js/hack.js requireAutoopenClosedDoor() tests `!state.flags.autoopen`, so
    // a stray string here is truthy and the port pulls at a door C refuses.
    // options.c:5229-5233 maps false/no/off/0 and any unique prefix to
    // negated == TRUE, so every spelling below must land on a real boolean.
    for (const line of ['OPTIONS=!autoopen', 'OPTIONS=autoopen:false',
        'OPTIONS=autoopen:no', 'OPTIONS=autoopen:off', 'OPTIONS=autoopen:0']) {
        const parsed = parseNethackrc(`OPTIONS=autoopen\n${line}`);
        assert.equal(parsed.flags.autoopen, false, line);
        assert.equal(typeof parsed.flags.autoopen, 'boolean', line);
    }
    assert.equal(parseNethackrc('OPTIONS=autoopen').flags.autoopen, true);
});

test('extmenu reaches iflags through every spelling the source accepts', () => {
    // optlist.h:303 declares extmenu opt_in, defaulting Off, and binds it to
    // &iflags.extmenu, so C's startup value is FALSE.  The port stores that
    // false rather than leaving the key out, which is what its Off-defaulting
    // siblings do: eight_bit_tty (optlist.h:300), hilite_pet (365),
    // hilite_pile (368), hitpointbar (379) and altmeta (159) are all held as
    // an explicit false.  The distinction is invisible to the guard in
    // tty_get_ext_cmd(), which is a truth test; what does observe it is the
    // complete-state snapshot in scripts/second-turn-snapshot.mjs, which
    // structuredClones iflags, and whose seventeen digests moved when this
    // default was added.
    const defaults = parseNethackrc('');
    assert.equal(defaults.iflags.extmenu, false);

    // options.c:5224-5233 maps a boolean's parameter: true, yes, on and 1 make
    // it not-negated, false, no, off and 0 negate it.  Every spelling has to
    // land in iflags, because tty_get_ext_cmd() at getline.c:300 tests
    // iflags.extmenu alone and the port stops on the unported
    // extcmd_via_menu() behind it.  A spelling that misses iflags fails open
    // and runs the typed prompt where C opens a menu.
    for (const line of ['OPTIONS=extmenu', 'OPTIONS=extmenu:true',
        'OPTIONS=extmenu:yes', 'OPTIONS=extmenu:on', 'OPTIONS=extmenu:1']) {
        const parsed = parseNethackrc(line);
        assert.equal(parsed.iflags.extmenu, true, line);
        // The compound-option path would park the raw parameter string here.
        assert.equal(Object.hasOwn(parsed.flags, 'extmenu'), false, line);
    }
    for (const line of ['OPTIONS=!extmenu', 'OPTIONS=extmenu:false',
        'OPTIONS=extmenu:no', 'OPTIONS=extmenu:off', 'OPTIONS=extmenu:0']) {
        // Negate on top of an enabling line.  Against the bare default the
        // assertion below would hold whether or not the negated spelling ever
        // reached iflags, because the default it compares against is the value
        // under test; starting from true means only the negation arm can
        // produce false.  It also pins that the later line wins, which is the
        // order options.c applies them in.
        const parsed = parseNethackrc(`OPTIONS=extmenu\n${line}`);
        assert.equal(parsed.iflags.extmenu, false, line);
        assert.equal(Object.hasOwn(parsed.flags, 'extmenu'), false, line);

        // The spelling on its own must still keep the raw parameter out of
        // flags, which is the compound-option fall-through this pair catches.
        assert.equal(
            Object.hasOwn(parseNethackrc(line).flags, 'extmenu'), false, line,
        );
    }
});

test('whatis_coord selects each source coordinate presentation', () => {
    assert.equal(parseNethackrc('').iflags.getpos_coords, GPCOORDS_NONE);
    for (const [value, expected] of [
        ['none', GPCOORDS_NONE],
        ['compass', GPCOORDS_COMPASS],
        ['full compass', GPCOORDS_COMFULL],
        ['map', GPCOORDS_MAP],
        ['screen', GPCOORDS_SCREEN],
    ]) {
        assert.equal(
            parseNethackrc(`OPTIONS=whatis_coord:${value}`)
                .iflags.getpos_coords,
            expected,
            value,
        );
    }
    assert.equal(
        parseNethackrc('OPTIONS=whatis_coord:map,!whatis_coord')
            .iflags.getpos_coords,
        GPCOORDS_MAP,
        'the source parser applies comma-separated options right to left',
    );
    // The negation is answered before the value is read, so neither negated
    // spelling reaches string_for_env_opt(): one that carries a value turns
    // the report off instead of reaching bad_negation(), and one that carries
    // none is silent rather than a missing parameter.
    for (const statement of [
        'OPTIONS=!whatis_coord', 'OPTIONS=!whatis_coord:map',
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.equal(parsed.iflags.getpos_coords, GPCOORDS_NONE, statement);
    }

    // Both refusals leave iflags.getpos_coords at its compiled-in default,
    // and only the mandatory-value one comes from string_for_env_opt().
    for (const [statement, reported] of [
        ['OPTIONS=whatis_coord:bogus',
            " * Line 1: Unknown whatis_coord parameter 'bogus'."],
        ['OPTIONS=whatis_coord',
            " * Line 1: Missing parameter for 'whatis_coord'."],
        ['OPTIONS=whatis_coord:',
            " * Line 1: Missing parameter for 'whatis_coord:'."],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            reported,
        ], statement);
        assert.equal(parsed.iflags.getpos_coords, GPCOORDS_NONE, statement);
    }
});

test('whatis_filter selects each source location filter by its first byte',
    () => {
        assert.equal(parseNethackrc('').iflags.getloc_filter, GFILTER_NONE);
        for (const [value, expected] of [
            ['nonsense', GFILTER_NONE],
            ['Verbose', GFILTER_VIEW],
            ['aardvark', GFILTER_AREA],
        ]) {
            const parsed = parseNethackrc(`OPTIONS=whatis_filter:${value}`);
            assert.equal(parsed.iflags.getloc_filter, expected, value);
            assert.equal(parsed.flags.whatis_filter, undefined, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('whatis_filter negation returns before parsing an attached value', () => {
    const line = 'OPTIONS=!whatis_filter:bogus,whatis_filter:view';
    const parsed = parseNethackrc(`${line}\n`);
    assert.equal(parsed.iflags.getloc_filter, GFILTER_NONE);
    assert.equal(parsed.flags.whatis_filter, undefined);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times:'
            + ' whatis_filter.',
    ]);
});

test('invalid and missing whatis_filter values preserve preceding state',
    () => {
        for (const [suffix, message] of [
            ['', "Missing parameter for 'whatis_filter'."],
            [':', "Missing parameter for 'whatis_filter:'."],
            ['=', "Missing parameter for 'whatis_filter='."],
            [':bogus', "Unknown whatis_filter parameter 'bogus'."],
        ]) {
            const line = `OPTIONS=whatis_filter${suffix},whatis_filter:area`;
            const parsed = parseNethackrc(`${line}\n`);
            assert.equal(parsed.iflags.getloc_filter, GFILTER_AREA, suffix);
            assert.equal(parsed.flags.whatis_filter, undefined, suffix);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${line}`,
                ' * Line 1: compound option specified multiple times:'
                    + ' whatis_filter.',
                ` * Line 1: ${message}`,
            ], suffix);
        }
    });

test('whatis_filter duplicates follow source application precedence', () => {
    const comma = parseNethackrc(
        'OPTIONS=whatis_filter:area,whatis_filter:view\n',
    );
    assert.equal(comma.iflags.getloc_filter, GFILTER_AREA);
    assert.deepEqual(comma.configErrorFrame.output, [
        '\nOPTIONS=whatis_filter:area,whatis_filter:view',
        ' * Line 1: compound option specified multiple times:'
            + ' whatis_filter.',
    ]);

    const lines = parseNethackrc([
        'OPTIONS=whatis_filter:area',
        'OPTIONS=whatis_filter:view',
    ].join('\n'));
    assert.equal(lines.iflags.getloc_filter, GFILTER_VIEW);
    assert.deepEqual(lines.configErrorFrame.output, [
        '\nOPTIONS=whatis_filter:view',
        ' * Line 2: compound option specified multiple times:'
            + ' whatis_filter.',
    ]);
});

test('hilite_pile owns the tty pile interface flag', () => {
    assert.equal(parseNethackrc('').iflags.hilite_pile, false);
    assert.equal(
        parseNethackrc('OPTIONS=hilite_pile').iflags.hilite_pile,
        true,
    );
    assert.equal(
        parseNethackrc('OPTIONS=!hilite_pile').iflags.hilite_pile,
        false,
    );
});

test('pet highlighting preserves the source tty attribute state', () => {
    const defaults = parseNethackrc('');
    assert.equal(defaults.iflags.wc_hilite_pet, false);
    assert.equal(defaults.iflags.wc2_petattr, ATR_INVERSE);

    const enabled = parseNethackrc('OPTIONS=hilite_pet');
    assert.equal(enabled.iflags.wc_hilite_pet, true);
    assert.equal(enabled.iflags.wc2_petattr, ATR_INVERSE);

    const bold = parseNethackrc('OPTIONS=petattr:bold');
    assert.equal(bold.iflags.wc_hilite_pet, true);
    assert.equal(bold.iflags.wc2_petattr, ATR_BOLD);

    const plain = parseNethackrc('OPTIONS=petattr:none');
    assert.equal(plain.iflags.wc_hilite_pet, false);
    assert.equal(plain.iflags.wc2_petattr, ATR_NONE);

    const reenabled = parseNethackrc(
        'OPTIONS=hilite_pet,petattr:none',
    );
    assert.equal(reenabled.iflags.wc_hilite_pet, true);
    assert.equal(reenabled.iflags.wc2_petattr, ATR_INVERSE);

    const disabled = parseNethackrc(
        'OPTIONS=!hilite_pet,petattr:bold',
    );
    assert.equal(disabled.iflags.wc_hilite_pet, false);
    assert.equal(disabled.iflags.wc2_petattr, ATR_BOLD);

    // C's rejection names `opts`, the whole statement, where every neighbour
    // names `op`; match_str2attr() is called with complain FALSE, so it adds
    // nothing of its own.  The rejection also skips the hilite_pet assignment
    // that ends the handler, which is why wc_hilite_pet keeps its default.
    for (const invalid of ['red', 'bold&underline']) {
        const statement = `OPTIONS=petattr:${invalid}`;
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ` * Line 1: Unknown petattr parameter 'petattr:${invalid}'.`,
        ], invalid);
        assert.equal(parsed.iflags.wc2_petattr, ATR_INVERSE, invalid);
        assert.equal(parsed.iflags.wc_hilite_pet, false, invalid);
    }

    // The value is mandatory, so a statement without one reports and then
    // falls past both remaining arms to that same assignment, which nothing
    // has changed.  "petattr" and "petattr:" differ only in the text quoted.
    for (const statement of ['OPTIONS=petattr', 'OPTIONS=petattr:']) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ' * Line 1: Missing parameter for'
            + ` '${statement.slice('OPTIONS='.length)}'.`,
        ], statement);
        assert.equal(parsed.iflags.wc2_petattr, ATR_INVERSE, statement);
        assert.equal(parsed.iflags.wc_hilite_pet, true, statement);
    }
    // optlist.h:568-569 gives petattr negateok No, so parseoptions() answers
    // every negated spelling with bad_negation() and optfn_petattr()'s own
    // negation arms -- its bad_negation() and the ATR_NONE default it stores
    // for a negated spelling with no value -- never run from a configuration
    // file.  The defaults therefore survive untouched.
    const untouched = parseNethackrc('');
    for (const rc of ['OPTIONS=!petattr', 'OPTIONS=!petattr:bold']) {
        const refused = parseNethackrc(rc);
        assert.deepEqual(refused.iflags, untouched.iflags, rc);
        assert.deepEqual(refused.configErrorFrame.output, [
            `\n${rc}`,
            ' * Line 1: The petattr option may not both have a value and be'
            + ' negated.',
        ], rc);
    }
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

    // spcfn_misc_menu_cmd() reads its value with string_for_opt(opts, FALSE),
    // whose mandatory parameter reports the whole statement -- the trailing
    // colon of the second spelling included, because C's message is the
    // pointer it was handed rather than the matched name.
    for (const missing of ['menu_search', 'menu_search:']) {
        const parsed = parseNethackrc(`OPTIONS=${missing}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${missing}`,
            ` * Line 1: Missing parameter for '${missing}'.`,
        ], missing);
        assert.equal(parsed.iflags.mapped_menu_cmds, '', missing);
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

    // A value outside -1..4 is reported and stores nothing, so neither field
    // nor the command-key rebuild the accepted arm queues is reached.
    const outOfRange = parseNethackrc('OPTIONS=number_pad:5\n');
    assert.deepEqual(outOfRange.configErrorFrame.output, [
        '\nOPTIONS=number_pad:5',
        " * Line 1: Illegal number_pad parameter '5'.",
    ]);
    assert.deepEqual(outOfRange.iflags, parseNethackrc('').iflags);
    assert.deepEqual(outOfRange.commandOperations, []);

    // The value goes through atoi(), which answers zero for text that starts
    // with no decimal run and reads the run alone when one starts it.  The
    // zero is what `mode == 0 && *op != '0'` turns into the report; a parser
    // that answered "not a number" would fall past the whole test.
    const notANumber = parseNethackrc('OPTIONS=number_pad:zqxj\n');
    assert.deepEqual(notANumber.configErrorFrame.output, [
        '\nOPTIONS=number_pad:zqxj',
        " * Line 1: Illegal number_pad parameter 'zqxj'.",
    ]);
    assert.deepEqual(notANumber.iflags, parseNethackrc('').iflags);
    assert.deepEqual(notANumber.commandOperations, []);
    const trailingJunk = parseNethackrc('OPTIONS=number_pad:3zqxj\n');
    assert.deepEqual(trailingJunk.configErrorFrame.output, []);
    assert.equal(trailingJunk.iflags.num_pad, true);
    // mode 3 is the phone-keypad layout, num_pad_mode |= 2.
    assert.equal(trailingJunk.iflags.num_pad_mode, 2);

    // `compat` is strlen(opts) <= 10, measured over the whole statement, and
    // it is the val_optional string_for_opt() is called with.  "number_pad"
    // is exactly ten bytes and "number_p:" is nine, so both are silent, while
    // "number_pad:" is one byte too long and reports.  All three still set
    // the option, because the arm that follows holds whenever go.opt_initial
    // does.
    for (const [statement, reported] of [
        ['OPTIONS=number_pad', []],
        ['OPTIONS=number_p:', []],
        ['OPTIONS=number_pad:', [
            '\nOPTIONS=number_pad:',
            " * Line 1: Missing parameter for 'number_pad:'.",
        ]],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, reported, statement);
        assert.equal(parsed.iflags.num_pad, true, statement);
        assert.equal(parsed.iflags.num_pad_mode, 0, statement);
    }
});

test('menu command keys use txt2key syntax and source validation', () => {
    const escaped = parseNethackrc(String.raw`OPTIONS=menu_search:\x23
OPTIONS=menu_next_page:\o173
OPTIONS=menu_first_page:125
OPTIONS=menu_last_page:\m\x23`);
    assert.equal(escaped.iflags.mapped_menu_cmds, '#{}£');
    assert.equal(escaped.iflags.mapped_menu_op, ':>^|');

    // illegal_menu_cmd_key() reports for itself and quotes visctrl() of the
    // byte txt2key() produced, not the text the statement spelled.  Its first
    // arm covers letters, digits and the four control keys; its second walks
    // def_oc_syms[] and names the class instead.
    for (const [key, reported] of [
        ['a', "Reserved menu command key 'a'"],
        ['Z', "Reserved menu command key 'Z'"],
        ['7', "Reserved menu command key '7'"],
        ['?', "Menu command key '?' is an object class"],
        ['.', "Menu command key '.' is an object class"],
        ['<space>', "Reserved menu command key ' '"],
        ['<esc>', "Reserved menu command key '^['"],
        [String.raw`\n`, "Reserved menu command key '^J'"],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=menu_search:${key}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=menu_search:${key}`,
            ` * Line 1: ${reported}.`,
        ], key);
        assert.equal(parsed.iflags.mapped_menu_cmds, '', key);
    }
    // Every menu command option's optlist.h negateok is No, so parseoptions()
    // answers this with bad_negation() and spcfn_misc_menu_cmd()'s own
    // negation arm (options.c:5458-5460) never runs from a configuration file.
    const negated = parseNethackrc('OPTIONS=!menu_search:#');
    assert.equal(negated.iflags.mapped_menu_cmds, '');
    assert.deepEqual(negated.configErrorFrame.output, [
        '\nOPTIONS=!menu_search:#',
        ' * Line 1: The menu_search option may not both have a value and be'
        + ' negated.',
    ]);
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

// C refs: cfgfiles.c handle_config_section():560-563, parse_conf_buf():
// 1775-1798 and parse_config_line():1412-1416.  Every one of these four keeps
// reading the file, so a later statement on the same rc still applies.
test('a line cfgfiles.c refuses is reported and the rest of the rc runs', () => {
    // The third element is every rn2() bound the rc should ask for.
    // choose_random_part() is the only caller these lines reach, so recording
    // the arguments refuses both a skipped draw and a spurious one.
    for (const [rc, reported, draws] of [
        // A section header before any CHOOSE is reported and skipped, and
        // config_section_chosen stays null so the next header repeats it.
        [['[early]', '[later]', 'NAME=Kept'],
            ['Section "[early]" without CHOOSE', 'Section "[later]" without'
                + ' CHOOSE'],
            []],
        // find_optparam() answering null is the format error; the message
        // already ends in '.' so config_erradd() adds no second one.  C
        // reports and returns before choose_random_part(), so nothing is
        // drawn here.
        [['CHOOSE', 'NAME=Kept'], ['Format is CHOOSE=section1,section2,...'],
            []],
        // choose_random_part() answers null for an empty candidate list, and
        // C frees config_section_chosen before it asks.  The empty value is
        // still one candidate, so the required rn2(1) happens first.
        [['CHOOSE=', 'NAME=Kept'], ['No config section to choose'], [1]],
        // Neither ':' nor '=' anywhere in the munged line.
        [['not a statement', 'NAME=Kept'],
            ["Not a config statement, missing '='"],
            []],
        // parse_config_line() found a separator but no config_line_stmt[] row.
        [['ZORKMID=x', 'NAME=Kept'], ['Unknown config statement'], []],
    ]) {
        const drawn = [];
        const parsed = parseNethackrc(`${rc.join('\n')}\n`, (bound) => {
            drawn.push(bound);
            return 0;
        });
        assert.deepEqual(drawn, draws, rc[0]);
        assert.deepEqual(
            parsed.configErrorFrame.output.filter((line) => line.startsWith(' ')),
            reported.map((text, index) => ` * Line ${index + 1}: ${text}${
                text.endsWith('.') ? '' : '.'}`),
            rc[0],
        );
        assert.equal(parsed.name, 'Kept', rc[0]);
    }

    // A section header after a CHOOSE that picked a section is silent, which
    // is what shows the first case above fails on the missing CHOOSE rather
    // than on the header itself.  Its one candidate draws the same rn2(1) the
    // empty list above does.
    const chosenDraws = [];
    const chosen = parseNethackrc('CHOOSE=only\n[only]\nNAME=Kept\n', (bound) => {
        chosenDraws.push(bound);
        return 0;
    });
    assert.deepEqual(chosenDraws, [1]);
    assert.deepEqual(chosen.configErrorFrame.output, []);
    assert.equal(chosen.name, 'Kept');

    // find_optparam() answers the separator's position, so a line that opens
    // with one is not the missing-'=' case whatever else is wrong with it.
    // C reports "Unknown config statement" for this line and keeps reading.
    const leading = parseNethackrc('=foo\nNAME=Kept\n', () => 0);
    assert.deepEqual(leading.configErrorFrame.output, [
        '\n=foo',
        ' * Line 1: Unknown config statement.',
    ]);
    assert.equal(leading.name, 'Kept');
});

// C ref: cfgfiles.c config_line_stmt[] (1309-1380), after the recorder build
// excludes USER_SOUNDS and before parse_config_line() skips syscnf_only rows
// for a player rc. The generator checks this list against fresh preprocessor
// output; this assertion pins the values the parser's matching tests consume.
test('the generated player config statement catalog matches cfgfiles.c', () => {
    assert.deepEqual(configLineStatements, [
        { name: 'options', minLength: 4 },
        { name: 'autopickup_exception', minLength: 5 },
        { name: 'bindings', minLength: 4 },
        { name: 'autocomplete', minLength: 5 },
        { name: 'msgtype', minLength: 7 },
        { name: 'hackdir', minLength: 4 },
        { name: 'leveldir', minLength: 4 },
        { name: 'levels', minLength: 4 },
        { name: 'savedir', minLength: 4 },
        { name: 'bonesdir', minLength: 5 },
        { name: 'datadir', minLength: 4 },
        { name: 'scoredir', minLength: 4 },
        { name: 'lockdir', minLength: 4 },
        { name: 'configdir', minLength: 4 },
        { name: 'troubledir', minLength: 4 },
        { name: 'name', minLength: 4 },
        { name: 'role', minLength: 4 },
        { name: 'character', minLength: 4 },
        { name: 'dogname', minLength: 3 },
        { name: 'catname', minLength: 3 },
        { name: 'boulder', minLength: 3 },
        { name: 'menucolor', minLength: 9 },
        { name: 'hilite_status', minLength: 6 },
        { name: 'warnings', minLength: 5 },
        { name: 'roguesymbols', minLength: 4 },
        { name: 'symbols', minLength: 4 },
        { name: 'wizkit', minLength: 6 },
        { name: 'qt_tilewidth', minLength: 12 },
        { name: 'qt_tileheight', minLength: 13 },
        { name: 'qt_fontsize', minLength: 11 },
        { name: 'qt_compact', minLength: 10 },
    ]);
});

// C ref: cfgfiles.c parse_config_line():1422-1438 over config_line_stmt[].
// Every row accepts a case-insensitive prefix at its declared minimum, while
// the spelling one byte shorter reaches the common unknown-statement report.
test('every generated config statement participates in source prefix matching',
    () => {
        const values = {
            options: 'name:Catalog',
            autopickup_exception: '">x"',
            msgtype: 'hide "x"',
            bindings: 'a:inventory',
            roguesymbols: 'S_room:.',
            symbols: 'S_room:.',
            name: 'Catalog',
            role: 'Healer',
            character: 'Healer',
            dogname: 'Fido',
            catname: 'Mog',
        };
        for (const row of configLineStatements) {
            const acceptedName = row.name.slice(0, row.minLength).toUpperCase();
            const accepted = `${acceptedName}=${values[row.name] ?? 'x'}`;
            assert.deepEqual(
                parseNethackrc(`${accepted}\n`).configErrorFrame.output,
                [],
                accepted,
            );

            const rejectedName = row.name.slice(0, row.minLength - 1);
            const rejected = `${rejectedName}=x`;
            assert.deepEqual(
                parseNethackrc(`${rejected}\n`).configErrorFrame.output,
                [
                    `\n${rejected}`,
                    ' * Line 1: Unknown config statement.',
                ],
                rejected,
            );
        }
    });

test('config and source option names accept valid abbreviations', () => {
    const parsed = parseNethackrc([
        'OPTI=nam:Alice,rol:Healer,rac:elf,gen:female,alignm:chaotic',
        'OPTI=playm:debug,!col,showe,!verb,menu_h:bold',
        'OPTI=!menu_ov,eig,pett:cat,fru:pear,hor:Shadowfax',
        'OPTI=bli,dea,nud,pau,rer,sym:Enhanced1,sup:3.7.0,msg_:r,pus',
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
    assert.equal(parsed.symset, 'Enhanced1');
    assert.equal(parsed.flags.suppress_alert, 0x03070000);
    assert.equal(parsed.iflags.prevmsg_window, 'r');
    assert.equal(parsed.flags.pushweapon, true);
    assert.equal(parsed.dogname, 'Fido');
    assert.equal(parsed.catname, 'Mog');

    const genericBooleans = parseNethackrc('OPTIONS=!bon,res,stan');
    assert.equal(genericBooleans.flags.bones, false);
    assert.equal(genericBooleans.flags.rest_on_space, true);
    assert.equal(genericBooleans.flags.standout, true);
    assert.equal(parseNethackrc('OPTIONS=!acoustics').flags.acoustics, false);

    // playmode needs five characters because player_selection shares "play".
    // A too-short abbreviation matches nothing at all rather than reporting
    // ambiguity: options.c:583-588's "Ambiguous option" arm is unreachable,
    // because match_optname() has already measured the same length against
    // the same minmatch and answered false.  So this falls to the last arm,
    // which quotes the whole statement including its value.
    const ambiguous = parseNethackrc('OPTIONS=play:debug');
    assert.equal(ambiguous.playmode, 'normal');
    assert.deepEqual(ambiguous.configErrorFrame.output, [
        '\nOPTIONS=play:debug',
        " * Line 1: Unknown option 'play:debug'.",
    ]);
});

test('acoustics value spellings use the source boolean parser', () => {
    // These are options.c's canonical word and numeric true/false spellings;
    // they must become booleans rather than opaque compound-option strings.
    for (const [value, expected] of [
        ['true', true],
        ['yes', true],
        ['on', true],
        ['1', true],
        ['false', false],
        ['no', false],
        ['off', false],
        ['0', false],
    ]) {
        assert.equal(
            parseNethackrc(`OPTIONS=acoustics:${value}`).flags.acoustics,
            expected,
            value,
        );
    }
});

test('mention_decor toggles reset the remembered terrain', () => {
    // STAIRS differs from options.c's STONE reset and proves that the second
    // option occurrence runs opt_mention_decor after the first one.
    const parsed = parseNethackrc(
        'OPTIONS=mention_decor,!mention_decor,mention_decor',
    );
    assert.equal(parsed.flags.mention_decor, true);
    assert.equal(parsed.iflags.prev_decor, STONE);
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
    // C's message keeps the value's own case and spells the name in double
    // quotes with no space before the colon, unlike its neighbours.
    const rejected = parseNethackrc('OPTIONS=playmode:CHEAT\n');
    assert.deepEqual(rejected.configErrorFrame.output, [
        '\nOPTIONS=playmode:CHEAT',
        ' * Line 1: Invalid value for "playmode":CHEAT.',
    ]);
    assert.equal(rejected.playmode, 'normal');

    // The handler reads the value parseoptions() already found, so a
    // statement without one is refused with no message at all.
    for (const statement of ['OPTIONS=playmode', 'OPTIONS=playmode:']) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.equal(parsed.playmode, 'normal', statement);
        assert.equal(parsed.flags.debug, false, statement);
        assert.equal(parsed.flags.explore, false, statement);
    }
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

test('valid startup option mappings remain available', () => {
    const parsed = parseNethackrc(
        'OPTIONS=!autopickup,color,!legacy,!tutorial,!splash_screen,'
        + 'pushweapon,showexp,time,!verbose,symset:Enhanced1,msg_window:r,'
        + 'suppress_alert:3.7.0,soundlib:example,S_vwall:|',
    );
    assert.equal(parsed.flags.pickup, false);
    assert.equal(parsed.flags.color, undefined);
    assert.equal(parsed.iflags.wc_color, true);
    assert.equal(parseNethackrc('OPTIONS=!colour').iflags.wc_color, false);
    assert.equal(parsed.flags.legacy, false);
    assert.equal(parsed.flags.tutorial, false);
    assert.equal(parsed.tutorial_set, true);
    assert.equal(parsed.iflags.wc_splash_screen, false);
    assert.equal(parsed.iflags.status_updates, true);
    assert.equal(
        parseNethackrc('OPTIONS=!status_updates').iflags.status_updates,
        false,
    );
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
    assert.equal(parsed.symset, 'Enhanced1');
    assert.equal(parsed.iflags.prevmsg_window, 'r');
    assert.equal(parsed.iflags.wc2_statuslines, 2);
    assert.equal(parsed.flags.suppress_alert, 0x03070000);
    assert.equal(parsed.flags.soundlib, undefined);
    assert.equal(parsed.gc.chosen_soundlib, 0);
    assert.equal(parsed.flags.s_vwall, '|');

    // 'constructor' is a prototype key rather than an option name, and 'mal'
    // is one character short of the "male" alias, whose match needs the whole
    // alias.  Both reach options.c:687-689 with the value still attached.
    for (const unknown of ['extension:value', 'constructor:value', 'mal']) {
        assert.deepEqual(
            parseNethackrc(`OPTIONS=${unknown}`).configErrorFrame.output,
            [
                `\nOPTIONS=${unknown}`,
                ` * Line 1: Unknown option '${unknown}'.`,
            ],
            unknown,
        );
    }
});

test('statuslines selects one of the two tty status-window heights', () => {
    // Two is also the compiled-in default, so the silent read is what
    // separates an accepted 2 from a 2 the range test rejected.
    for (const lines of [3, 2]) {
        const parsed = parseNethackrc(`OPTIONS=statuslines:${lines}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], `${lines}`);
        assert.equal(parsed.iflags.wc2_statuslines, lines, `${lines}`);
    }
    // The range message rebuilds the statement from the row's name and the
    // value, so it is not the text the file spelled: an abbreviation reports
    // as "statuslines:" plus whatever followed the separator.  A statement
    // with no value reports twice, because the mandatory parameter is missing
    // and the zero that leaves behind is out of range.
    for (const [statement, reported, lines] of [
        ['OPTIONS=statuslines:4',
            [" * Line 1: 'statuslines:4' is invalid; must be 2 or 3."], 2],
        ['OPTIONS=statusl:4',
            [" * Line 1: 'statuslines:4' is invalid; must be 2 or 3."], 2],
        ['OPTIONS=statuslines',
            [" * Line 1: Missing parameter for 'statuslines'.",
                " * Line 1: 'statuslines:' is invalid; must be 2 or 3."], 2],
        ['OPTIONS=statuslines:',
            [" * Line 1: Missing parameter for 'statuslines:'.",
                " * Line 1: 'statuslines:' is invalid; must be 2 or 3."], 2],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ...reported,
        ], statement);
        assert.equal(parsed.iflags.wc2_statuslines, lines, statement);
    }

    // itmp comes from atoi(), which answers zero for a value with no leading
    // decimal run and reads that run alone when one starts it.  The zero fails
    // the range test and reports; a parser that answered "not a number" would
    // compare NaN against both bounds and store it in silence.
    const notANumber = parseNethackrc('OPTIONS=statuslines:zqxj\n');
    assert.deepEqual(notANumber.configErrorFrame.output, [
        '\nOPTIONS=statuslines:zqxj',
        " * Line 1: 'statuslines:zqxj' is invalid; must be 2 or 3.",
    ]);
    assert.equal(notANumber.iflags.wc2_statuslines, 2);
    const trailingJunk = parseNethackrc('OPTIONS=statuslines:3zqxj\n');
    assert.deepEqual(trailingJunk.configErrorFrame.output, []);
    assert.equal(trailingJunk.iflags.wc2_statuslines, 3);
});

// C ref: options.c optfn_msghistory() (2523-2545).  This pins the parser's
// raw unsigned value before wintty.c tty_create_nhwindow(NHW_MESSAGE) applies
// its live startup clamp.
test('msghistory parses atoi into unsigned storage and preserves errors', () => {
    const values = [
        ['OPTIONS=msghistory:37', 37],
        ['OPTIONS=msghistory:9rows', 9],
        ['OPTIONS=msghistory:nonnumeric', 0],
        ['OPTIONS=msghistory:-1', 0xFFFFFFFF],
        ['OPTIONS=msghistory:4294967296', 0],
        ['OPTIONS=!msghistory', 0],
        ['OPTIONS=!msghistory:', 0],
    ];
    for (const [statement, expected] of values) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.equal(parsed.iflags.msg_history, expected, statement);
        assert.equal(parsed.flags.msghistory, undefined, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }

    for (const statement of ['msghistory', 'msghistory:']) {
        const parsed = parseNethackrc(
            `OPTIONS=msghistory:41\nOPTIONS=${statement}\n`,
        );
        assert.equal(parsed.iflags.msg_history, 41, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${statement}`,
            ' * Line 2: compound option specified multiple times:'
                + ' msghistory.',
            ` * Line 2: Missing parameter for '${statement}'.`,
        ], statement);
    }

    const negatedValue = parseNethackrc(
        'OPTIONS=msghistory:41\nOPTIONS=!msghistory:12\n',
    );
    assert.equal(negatedValue.iflags.msg_history, 41);
    assert.deepEqual(negatedValue.configErrorFrame.output, [
        '\nOPTIONS=!msghistory:12',
        ' * Line 2: compound option specified multiple times: msghistory.',
        ' * Line 2: The msghistory option may not both have a value and be'
            + ' negated.',
    ]);
});

// C refs: options.c optfn_symset() (4166-4201), optfn_roguesymset()
// (3543-3572) and optfn_suppress_alert() (4134-4149).  Each of the three opens
// its do_set arm on `op != empty_optstr` and does nothing whatever when that
// fails, and string_for_opt() answers empty_optstr for a statement that ends
// on its separator as readily as for one that carries no separator at all.
test('a symbol set or alert version ending on its separator selects nothing',
    () => {
        const untouched = parseNethackrc('');
        for (const name of ['symset', 'roguesymset', 'suppress_alert']) {
            const parsed = parseNethackrc(`OPTIONS=${name}:\n`);
            assert.deepEqual(parsed.configErrorFrame.output, [], name);
            assert.equal(parsed.symset, undefined, name);
            assert.equal(parsed.roguesymset, undefined, name);
            assert.equal(
                parsed.flags.suppress_alert,
                untouched.flags.suppress_alert,
                name,
            );
            // The two symbol-set rows would otherwise queue a selection for
            // symbols.c load_symset(), which is the write the empty value has
            // to leave undone.
            assert.deepEqual(parsed.symbolOperations, [], name);
        }

        // The same three names with a value, so that the guards above are the
        // only difference between the two halves of this test.
        const primary = parseNethackrc('OPTIONS=symset:DECgraphics\n');
        assert.equal(primary.symset, 'DECgraphics');
        assert.deepEqual(primary.symbolOperations, [{
            kind: 'select',
            set: 'primary',
            name: 'DECgraphics',
            legacyIfUnset: false,
            legacyIBM: false,
        }]);
        const rogue = parseNethackrc('OPTIONS=roguesymset:DECgraphics\n');
        assert.equal(rogue.roguesymset, 'DECgraphics');
        assert.deepEqual(rogue.symbolOperations, [{
            kind: 'select',
            set: 'rogue',
            name: 'DECgraphics',
            legacyIfUnset: false,
            legacyIBM: false,
        }]);
        assert.equal(
            parseNethackrc('OPTIONS=suppress_alert:3.6.1\n')
                .flags.suppress_alert,
            0x03060100,
        );
    });

test('an unknown primary symset reports and queues source cleanup', () => {
    const parsed = parseNethackrc('OPTIONS=symset:NoSuchSymbols\n');
    assert.equal(parsed.symset, undefined);
    assert.deepEqual(parsed.symbolOperations, [{
        kind: 'clear', set: 'primary', nameToo: true,
    }]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\nOPTIONS=symset:NoSuchSymbols',
        ' * Line 1: Unable to load symbol set "NoSuchSymbols" from "symbols".',
    ]);
});

test('status highlight options preserve source rules and condition defaults', () => {
    const defaults = parseNethackrc('');
    assert.equal(defaults.iflags.hilite_delta, 0);
    assert.equal(defaults.iflags.wc2_hitpointbar, false);
    assert.equal(defaults.iflags.status_conditions.blind, true);
    assert.equal(defaults.iflags.status_conditions.barehanded, false);

    const parsed = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints/<50%/red&inverse/100%/bright-green '
        + 'characteristics/always/bright-blue&bold\n'
        + 'OPTIONS=hilite_status:'
        + 'condition/blind+deaf/bright-magenta&underline\n'
        + 'OPTIONS='
        // Seven is an arbitrary positive duration which distinguishes the
        // explicit statushilites value from the source default of three.
        + 'statushilites:7,hitpointbar,!cond_blind,cond_barehanded',
    );
    assert.equal(parsed.iflags.hilite_delta, 7);
    assert.equal(parsed.iflags.wc2_hitpointbar, true);
    assert.equal(parsed.iflags.status_conditions.blind, false);
    assert.equal(parsed.iflags.status_conditions.barehanded, true);
    assert.equal(Object.hasOwn(parsed.flags, 'cond_blind'), false);
    assert.equal(Object.hasOwn(parsed.flags, 'cond_barehanded'), false);

    const [lowHp, fullHp, ...remaining] = parsed.iflags.status_hilites;
    assert.deepEqual(lowHp, {
        field: 'hitpoints',
        behavior: 'percentage',
        relation: '<',
        value: 50,
        text: '',
        style: {
            attrib: HL_INVERSE,
            color: CLR_RED,
        },
    });
    assert.equal(fullHp.value, 100);
    assert.equal(fullHp.style.color, CLR_BRIGHT_GREEN);
    assert.deepEqual(
        remaining.slice(0, 6).map(({ field }) => field),
        [
            'strength', 'dexterity', 'constitution',
            'intelligence', 'wisdom', 'charisma',
        ],
    );
    assert.ok(remaining.slice(0, 6).every(
        ({ style }) => style.color === CLR_BRIGHT_BLUE
            && style.attrib === HL_BOLD,
    ));
    assert.deepEqual(remaining[6], {
        field: 'condition',
        conditions: ['blind', 'deaf'],
        style: {
            attrib: HL_ULINE,
            clearAttributes: false,
            color: CLR_BRIGHT_MAGENTA,
        },
    });
});

// C refs: cfgfiles.c cnf_line_HILITE_STATUS() and botl.c
// parse_status_hl1().  This is a separate config statement, not the
// OPTIONS=hilite_status compound spelling above.
test('direct HILITE_STATUS statements install rules and keep partial writes',
    () => {
        const parsed = parseNethackrc(
            'HILITE_STATUS=hitpoints/always/red\n',
        );
        assert.deepEqual(parsed.configErrorFrame.output, []);
        assert.deepEqual(parsed.unportedConfigStatements, []);
        assert.equal(parsed.iflags.hilite_delta, 3);
        assert.deepEqual(
            parsed.iflags.status_hilites.map(
                ({ field, behavior, style }) => [
                    field, behavior, style.color,
                ],
            ),
            [['hitpoints', 'always', CLR_RED]],
        );

        const statement = 'HILITE_STATUS=hitpoints/always/red '
            + 'bogusfield/always/blue';
        const partial = parseNethackrc(`${statement}\n`);
        assert.deepEqual(partial.configErrorFrame.output, [
            `\n${statement}`,
            " * Line 1: Unknown status field 'bogusfield'.",
        ]);
        assert.equal(partial.iflags.status_hilites.length, 1);
        assert.equal(partial.iflags.status_hilites[0].style.color, CLR_RED);
        assert.equal(partial.iflags.hilite_delta, 0);
    });

test('direct HILITE_STATUS keeps empty, byte, and field-count boundaries',
    () => {
        const empty = parseNethackrc('HILITE_STATUS=\n');
        assert.deepEqual(empty.configErrorFrame.output, []);
        assert.deepEqual(empty.unportedConfigStatements, []);
        assert.deepEqual(empty.iflags.status_hilites, []);
        assert.equal(empty.iflags.hilite_delta, 3);

        const belowValue = `title/${'é'.repeat(62)}/red`;
        const below = parseNethackrc(`HILITE_STATUS=${belowValue}\n`);
        assert.deepEqual(below.configErrorFrame.output, []);
        assert.equal(below.iflags.status_hilites.length, 1);
        const storedBelowText = below.iflags.status_hilites[0].text;
        assert.equal(encodeUtf8ByteString(storedBelowText).length, 79);
        assert.equal(storedBelowText, 'é'.repeat(39) + '\uDCC3');
        assert.equal(below.iflags.status_hilites[0].style.color, CLR_RED);
        assert.equal(below.iflags.hilite_delta, 3);

        // 125 bytes is the final accepted component length.  The loop copies
        // all of them, then consumes the following slash on its next pass;
        // one byte more fills the counter before the delimiter is read.
        const edgeText = 'a'.repeat(125);
        const edge = parseNethackrc(
            `HILITE_STATUS=title/${edgeText}/red\n`,
        );
        assert.deepEqual(edge.configErrorFrame.output, []);
        assert.equal(edge.iflags.status_hilites.length, 1);
        assert.equal(edge.iflags.status_hilites[0].text, 'a'.repeat(79));
        assert.equal(edge.iflags.status_hilites[0].style.color, CLR_RED);
        assert.equal(edge.iflags.hilite_delta, 3);

        // botl.c counts bytes, so 63 two-byte characters fill the whole
        // QBUFSZ-2 component and leave the same component to be parsed as the
        // missing action.  The /red tail is never read.
        const atValue = `title/${'é'.repeat(63)}/red`;
        const atStatement = `HILITE_STATUS=${atValue}`;
        const at = parseNethackrc(`${atStatement}\n`);
        assert.deepEqual(at.configErrorFrame.output, [
            `\n${atStatement}`,
            ` * Line 1: Unknown color '${'é'.repeat(30)}'.`,
            " * Line 1: bad color '16 -1'.",
        ]);
        assert.deepEqual(at.iflags.status_hilites, []);
        assert.equal(at.iflags.hilite_delta, 0);

        // The byte limit can also split a multibyte character.  One ASCII
        // byte followed by 63 two-byte characters leaves the leading byte of
        // the last character in hsbuf[].  C's %.60s diagnostic ends on an
        // earlier leading byte; the reversible byte-string representation
        // must retain it rather than replacing it.
        const splitValue = `title/a${'é'.repeat(63)}/red`;
        const splitStatement = `HILITE_STATUS=${splitValue}`;
        const split = parseNethackrc(`${splitStatement}\n`);
        const quoted = split.configErrorFrame.output[1]
            .slice(" * Line 1: Unknown color '".length, -2);
        assert.equal(quoted.charCodeAt(quoted.length - 1), 0xDCC3);
        assert.equal(encodeUtf8ByteString(quoted).at(-1), 0xC3);
        assert.deepEqual(split.configErrorFrame.output.slice(2), [
            " * Line 1: bad color '16 -1'.",
        ]);
        assert.deepEqual(split.iflags.status_hilites, []);
        assert.equal(split.iflags.hilite_delta, 0);

        // The color error above has its own 60-byte precision, which also
        // happens to cut after a leading 0xC3.  A condition error prints the
        // whole parser component and therefore observes the orphan at the
        // actual 126-byte boundary.
        const splitConditionValue = `a${'é'.repeat(63)}`;
        const splitConditionStatement =
            `HILITE_STATUS=condition/${splitConditionValue}/red`;
        const splitCondition = parseNethackrc(
            `${splitConditionStatement}\n`,
        );
        assert.equal(
            splitCondition.configErrorFrame.output[0],
            `\n${splitConditionStatement}`,
        );
        const unknownCondition = splitCondition.configErrorFrame.output[1]
            .slice(" * Line 1: Unknown condition '".length, -2);
        const conditionBytes = encodeUtf8ByteString(unknownCondition);
        assert.equal(conditionBytes.length, 126);
        assert.equal(unknownCondition.charCodeAt(
            unknownCondition.length - 1,
        ), 0xDCC3);
        assert.equal(conditionBytes.at(-1), 0xC3);
        assert.deepEqual(splitCondition.configErrorFrame.output.slice(2), []);
        assert.deepEqual(splitCondition.iflags.status_hilites, []);
        assert.equal(splitCondition.iflags.hilite_delta, 0);

        const upperA = parseNethackrc(
            'HILITE_STATUS=HITPOINTS/ALWAYS/RED\n',
        );
        assert.deepEqual(upperA.configErrorFrame.output, []);
        assert.equal(upperA.iflags.status_hilites[0].behavior, 'always');
        assert.equal(upperA.iflags.status_hilites[0].style.color, CLR_RED);
        const upperZ = parseNethackrc('HILITE_STATUS=TITLE/Z/RED\n');
        assert.deepEqual(upperZ.configErrorFrame.output, []);
        assert.equal(upperZ.iflags.status_hilites[0].text, 'z');

        const conditionValue = (groups, suffix = '') => [
            'condition',
            ...Array.from({ length: groups }, () => ['blind', 'red']).flat(),
        ].join('/') + suffix;
        const inRange = parseNethackrc(
            `HILITE_STATUS=${conditionValue(9)}\n`,
        );
        assert.deepEqual(inRange.configErrorFrame.output, []);
        assert.equal(inRange.iflags.status_hilites.length, 9);
        assert.equal(inRange.iflags.hilite_delta, 3);

        // An empty in-range slot ends the condition walk.  Later fields in a
        // space-separated statement are still parsed; merely seeing many
        // separators is not an overflow.
        const earlyEmpty = [
            'cond',
            ...Array.from({ length: 9 }, () => ['st', '1']).flat(),
        ].join('/') + '// time/always/blue';
        for (const line of [
            `HILITE_STATUS=${earlyEmpty}`,
            `OPTIONS=hilite_status:${earlyEmpty}`,
        ]) {
            const accepted = parseNethackrc(`${line}\n`);
            assert.deepEqual(accepted.configErrorFrame.output, [], line);
            assert.equal(accepted.iflags.status_hilites.length, 10, line);
            assert.equal(accepted.iflags.status_hilites.at(-1).field,
                'time', line);
            assert.equal(accepted.iflags.hilite_delta, 3, line);
        }

        // With ten groups C reads hsbuf[21], outside its array.  Two adjacent
        // fresh segments produced different garbage condition names.  The
        // port makes the boundary deterministic while preserving all ten
        // partial writes, the error count, and the disabled duration.
        for (const suffix of ['', '/', '/extra']) {
            const value = conditionValue(10, suffix);
            const statement = `HILITE_STATUS=${value}`;
            const bounded = parseNethackrc(`${statement}\n`);
            assert.deepEqual(bounded.configErrorFrame.output, [
                `\n${statement}`,
                " * Line 1: Unknown condition ''.",
            ]);
            assert.equal(bounded.iflags.status_hilites.length, 10);
            assert.equal(bounded.iflags.hilite_delta, 0);
        }

        const ordinaryValue = [
            'time',
            ...Array.from(
                { length: 10 }, () => ['always', 'red'],
            ).flat(),
        ].join('/');
        const ordinaryStatement = `HILITE_STATUS=${ordinaryValue}`;
        const ordinary = parseNethackrc(`${ordinaryStatement}\n`);
        assert.deepEqual(ordinary.configErrorFrame.output, [
            `\n${ordinaryStatement}`,
            " * Line 1: Unknown behavior ''.",
        ]);
        assert.equal(ordinary.iflags.status_hilites.length, 10);
        assert.ok(ordinary.iflags.status_hilites.every(
            ({ field }) => field === 'time',
        ));
        assert.equal(ordinary.iflags.hilite_delta, 0);

        // The same actual access boundary belongs to the condition parser
        // even when the field used an alias.  The diagnostic is selected from
        // the resolved field, not from the raw spelling.
        for (const [prefix, fieldName] of [
            ['HILITE_STATUS=', 'flags'],
            ['OPTIONS=hilite_status:', 'cond'],
        ]) {
            const value = [
                fieldName,
                ...Array.from(
                    { length: 10 }, () => ['blind', 'red'],
                ).flat(),
            ].join('/');
            const statement = `${prefix}${value}`;
            const bounded = parseNethackrc(`${statement}\n`);
            assert.deepEqual(bounded.configErrorFrame.output, [
                `\n${statement}`,
                " * Line 1: Unknown condition ''.",
            ]);
            assert.equal(bounded.iflags.status_hilites.length, 10);
            assert.equal(bounded.iflags.hilite_delta, 0);
        }
    });

test('status option recursion keeps the source right-to-left precedence', () => {
    const disabled = parseNethackrc(
        'OPTIONS=statushilites:0,'
        + 'hilite_status:hitpoints/always/red&inverse',
    );
    assert.equal(disabled.iflags.hilite_delta, 0);
    assert.equal(disabled.iflags.status_hilites.length, 1);

    const reenabled = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints/always/red&inverse,'
        + 'statushilites:0',
    );
    assert.equal(reenabled.iflags.hilite_delta, 3);

    const cleared = parseNethackrc(
        'OPTIONS=!hilite_status:clear,'
        + 'hilite_status:hitpoints/always/red&inverse',
    );
    assert.deepEqual(cleared.iflags.status_hilites, []);
});

test('status highlighting uses source field and condition vocabularies', () => {
    const parsed = parseNethackrc(
        'OPTIONS=hilite_status:experience-points/always/orange '
        + 'hunger/hungry/bright-green\n'
        + 'OPTIONS=hilite_status:carrying-capacity/strained/red '
        + 'condition/hallu+icy+in-lava/bright-blue',
    );
    assert.deepEqual(
        parsed.iflags.status_hilites.map(({ field }) => field),
        ['experience', 'hunger', 'carrying-capacity', 'condition'],
    );
    assert.deepEqual(
        parsed.iflags.status_hilites[3].conditions,
        ['hallucinat', 'ice', 'lava'],
    );

    // Each row was read off the patched C program's raw-print screen for the
    // same statement, recorded at seed 3310277 and 19960229180000.  None of
    // them stops the read: the rule list stays empty and the game plays on.
    for (const [invalid, reported] of [
        // hitpoints-max is an INIT_BLSTAT() row, so its idxmax is -1 and no
        // maximum exists to take a percentage of.
        ['hitpoints-max/<50%/red',
            "Cannot use percent with 'hitpoints-max'."],
        // "weak" is a hunger level, and only BL_HUNGER consults hutxt[].
        ['dexterity/weak/red', "Unknown behavior 'weak'."],
        // botl.c:2951 rejects a '<' percentage below 1 before the percentage
        // check at 2996 can see it, so the two bounds report differently.
        ['hitpoints/<0%/red',
            "hilite_status threshold '<0%' is out of range."],
        ['hitpoints/>100%/red',
            "hilite_status: invalid percentage value '>100%'."],
        // conditions[] spells this one "Hallu"; "hallucinat" is condtests[].
        ['condition/hallucinat/red', "Unknown condition 'hallucinat'."],
        // botl.c walks its condition and threshold tables with strcmp(), so a
        // name Object.prototype carries is as unknown as any other.  Only an
        // all-lowercase one can arrive: match_str2clr()'s normalization, which
        // this port spells menuHeadingToken(), folds case and drops '_', so
        // "toString" becomes "tostring" and "__proto__" becomes "proto".
        ['condition/constructor/red', "Unknown condition 'constructor'."],
        ['hunger/constructor/red', "Unknown behavior 'constructor'."],
        ['carrying-capacity/constructor/red',
            "Unknown behavior 'constructor'."],
    ]) {
        const statement = `OPTIONS=hilite_status:${invalid}`;
        const rejected = parseNethackrc(`${statement}\n`);
        assert.deepEqual(rejected.configErrorFrame.output, [
            `\n${statement}`,
            ` * Line 1: ${reported}`,
        ], invalid);
        assert.deepEqual(rejected.iflags.status_hilites, [], invalid);
        // parse_status_hl1() stores the default duration only on a clean
        // parse, so a refused statement leaves highlighting off.
        assert.equal(rejected.iflags.hilite_delta, 0, invalid);
    }
});

test('status condition alias prefixes union every source match', () => {
    const parsed = parseNethackrc(
        'OPTIONS=hilite_status:condition/m/red',
    );
    assert.deepEqual(parsed.iflags.status_hilites[0].conditions, [
        'foodpois', 'grab', 'lava', 'slime', 'stone', 'strngl', 'termill',
        'blind', 'conf', 'deaf', 'hallucinat', 'paralyzed', 'submerged',
        'stun', 'levitate', 'fly', 'ride',
    ]);
    // A prefix that stops short of the '-' still selects one field, which is
    // what makes the two rejections in the message test a prefix rule rather
    // than a ban on partial names.
    assert.deepEqual(
        parseNethackrc('OPTIONS=hilite_status:carrying/always/red\n')
            .iflags.status_hilites.map(({ field }) => field),
        ['carrying-capacity'],
    );

    // The prefix pass uses strncmpi(), which keeps the '_' the two exact
    // passes drop, so the alias id has to be matched as C spells it.
    assert.deepEqual(
        parseNethackrc('OPTIONS=hilite_status:condition/major_/red')
            .iflags.status_hilites[0].conditions,
        ['foodpois', 'grab', 'lava', 'slime', 'stone', 'strngl', 'termill'],
    );
    for (const [conditions, reported] of [
        // An empty first group is the one parse_condition() names itself,
        // before str2conditionbitmask() ever runs.
        ['', 'Missing condition(s).'],
        // splitsubfields() turns a lone separator into one empty subfield,
        // which match_str2conditionbitmask() answers with the zero mask.
        ['&', "Unknown condition ''."],
        ['majort', "Unknown condition 'majort'."],
        ['m-a', "Unknown condition 'm-a'."],
    ]) {
        const statement = `OPTIONS=hilite_status:condition/${conditions}/red`;
        const rejected = parseNethackrc(`${statement}\n`);
        assert.deepEqual(rejected.configErrorFrame.output, [
            `\n${statement}`,
            ` * Line 1: ${reported}`,
        ], JSON.stringify(conditions));
        assert.deepEqual(rejected.iflags.status_hilites, [],
            JSON.stringify(conditions));
        assert.equal(rejected.iflags.hilite_delta, 0,
            JSON.stringify(conditions));
    }
});

// C refs: options.c optfn_hilite_status(); botl.c parse_status_hl2() and
// parse_condition(); coloratt.c match_str2clr().  Every expected string was
// read off the patched C program's raw-print screen for the same statement,
// recorded at seed 3310277 and 19960229180000.
test('every malformed status highlight reports its C message', () => {
    for (const [value, reported] of [
        // match_str2clr() is called with suppress_msg FALSE, so an unknown
        // color reports before CLR_MAX comes back for the caller to reject.
        ['hitpoints/<50%/mauve',
            ["Unknown color 'mauve'.", "bad color '16 -1'."]],
        // An empty subfield reaches match_str2clr() as the empty string.
        ['hitpoints/always/&red',
            ["Unknown color ''.", "bad color '16 -1'."]],
        // The second '&' splits an empty subfield out between two colors, so
        // the second number in the message is the red already accepted.
        ['hitpoints/always/red&&blue',
            ["Unknown color ''.", "bad color '16 1'."]],
        // Two colors in one action: match_str2clr() answers blue, and the
        // "one color only" test refuses it against the red already there.
        ['hitpoints/always/red&blue', ["bad color '4 1'."]],
        // A trailing '/' leaves the action empty, so parse_status_hl2() takes
        // the group for "field/color" and reads the threshold as the color.
        ['hitpoints/<10%/', ["Unknown color '<10%'.", "bad color '16 -1'."]],
        ['bogusfield/always/red', ["Unknown status field 'bogusfield'."]],
        // fldname_to_bl_indx()'s prefix pass is strncmpi(), so the hyphen in
        // "carrying-capacity" and "hitpoints-max" has to be spelled.
        ['carryingc/always/red', ["Unknown status field 'carryingc'."]],
        ['hitpointsm/always/red', ["Unknown status field 'hitpointsm'."]],
        // alignment is ANY_STR, so a number is refused after the range check.
        ['alignment/50/red',
            ["Field 'alignment' does not support numeric values."]],
        // initblstats[] spells this field "HD", and the message quotes it.
        ['hd/<50%/red', ["Cannot use percent with 'HD'."]],
        // LARGEST_INT is 32767, and the message prints the parsed value with
        // the relationship it was given rather than the text as typed.
        ['hitpoints/40000/red',
            ["hilite_status threshold '=40000' is out of range."]],
        // experience is ANY_LONG, which has a lower bound and no upper one.
        ['experience/-1/red',
            ["hilite_status threshold '=-1' is out of range."]],
        // Percentages: 101 and -1 are refused for every relationship, 100
        // only for '>', because two of the six C tests read hilite.value
        // where hilite.rel was meant.
        ['hitpoints/<101%/red',
            ["hilite_status: invalid percentage value '<101%'."]],
        ['hitpoints/>-1%/blue',
            ["hilite_status: invalid percentage value '>-1%'."]],
        // has_ltgt_percentnumber() picks between the two closing messages.
        ['hitpoints/<>=/red',
            ["Wrong format '<>=', expected a threshold number or percent."]],
        ['hitpoints/red/blue', ["Unknown behavior 'red'."]],
        // is_fld_arrayvalues() compares with strcmpi(), not fuzzymatch(), so
        // the hyphen enc_stat[] does not carry makes this unknown.
        ['carrying-capacity/over-taxed/red',
            ["Unknown behavior 'over-taxed'."]],
        // parse_condition() reads the conditions before the action, so the
        // unknown one reports and the missing action never does.
        ['condition/blind+bogus/red', ["Unknown condition 'bogus'."]],
        ['condition/blind', ['Missing color+attribute.']],
    ]) {
        const statement = `OPTIONS=hilite_status:${value}`;
        const rejected = parseNethackrc(`${statement}\n`);
        assert.deepEqual(rejected.configErrorFrame.output, [
            `\n${statement}`,
            ...reported.map((line) => ` * Line 1: ${line}`),
        ], value);
        assert.deepEqual(rejected.iflags.status_hilites, [], value);
        assert.equal(rejected.iflags.hilite_delta, 0, value);
    }

    // string_for_opt(opts, TRUE) answers empty_optstr for both spellings with
    // no value, and the negated one never reaches clear_status_hilites().
    for (const statement of ['OPTIONS=hilite_status:', 'OPTIONS=!hilite_status',
        // parseoptions() strips the blanks around an element first, so a
        // value of nothing but spaces arrives as no value at all.
        'OPTIONS=hilite_status:   ']) {
        const rejected = parseNethackrc(`${statement}\n`);
        assert.deepEqual(rejected.configErrorFrame.output, [
            `\n${statement.replace(/\s+$/u, '')}`,
            ' * Line 1: Value is mandatory for hilite_status.',
        ], statement);
    }
});

// C ref: botl.c parse_status_hl1()'s badopt break and parse_status_hl2()'s
// closing `return (successes > 0)`.  Rules are installed as they parse, so a
// statement that fails partway keeps what it already accepted, and the value's
// remaining space-separated statements are abandoned.
test('a failed status highlight keeps the rules it already accepted', () => {
    // CLR_RED is 1: the group that parsed is the one still in the list.
    const partial = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints/always/red/<5%/mauve\n',
    );
    assert.deepEqual(partial.configErrorFrame.output, [
        '\nOPTIONS=hilite_status:hitpoints/always/red/<5%/mauve',
        " * Line 1: Unknown color 'mauve'.",
        " * Line 1: bad color '16 -1'.",
    ]);
    assert.deepEqual(
        partial.iflags.status_hilites.map(
            ({ field, behavior, style }) => [field, behavior, style.color],
        ),
        [['hitpoints', 'always', CLR_RED]],
    );
    // The default duration is skipped, so the surviving rule stays dormant
    // until something else turns highlighting on.
    assert.equal(partial.iflags.hilite_delta, 0);
    const revived = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints/always/red/<5%/mauve\n'
        + 'OPTIONS=statushilites:3\n',
    );
    assert.equal(revived.iflags.hilite_delta, 3);
    assert.equal(revived.iflags.status_hilites.length, 1);

    // The first failing statement abandons the rest of the value.  Three
    // statements are needed to see the break that does it: with only two, the
    // trailing `fldnum >= 1 && !badopt` call already blocks the second one.
    const value = 'hitpoints/always/mauve bogusfield/always/red'
        + ' time/always/blue';
    const cut = parseNethackrc(`OPTIONS=hilite_status:${value}\n`);
    assert.deepEqual(cut.configErrorFrame.output, [
        `\nOPTIONS=hilite_status:${value}`,
        " * Line 1: Unknown color 'mauve'.",
        " * Line 1: bad color '16 -1'.",
    ]);
    assert.deepEqual(cut.iflags.status_hilites, []);

    // With the failure in the second statement instead, the first one's rule
    // survives and only its own message is reported.
    const kept = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints/always/red bogusfield/always/blue\n',
    );
    assert.deepEqual(kept.configErrorFrame.output, [
        '\nOPTIONS=hilite_status:hitpoints/always/red bogusfield/always/blue',
        " * Line 1: Unknown status field 'bogusfield'.",
    ]);
    assert.equal(kept.iflags.status_hilites.length, 1);
    assert.equal(kept.iflags.hilite_delta, 0);
});

// C ref: botl.c parse_status_hl1() and the head of parse_status_hl2()'s group
// loop.  Four shapes that look malformed are accepted, and one that looks
// well formed is refused without a message.
test('status highlight shapes C accepts report nothing', () => {
    // fldnum counts '/' separators, so a value carrying none never reaches
    // parse_status_hl2() and is accepted with no rule to show for it.
    const noSlash = parseNethackrc('OPTIONS=hilite_status:hitpoints\n');
    assert.deepEqual(noSlash.configErrorFrame.output, []);
    assert.deepEqual(noSlash.iflags.status_hilites, []);
    assert.equal(noSlash.iflags.hilite_delta, 3);

    // The group loop stops at the first empty component, so an empty
    // threshold leaves successes at zero: a silent FALSE, and no duration.
    const emptyGroup = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints//red\n',
    );
    assert.deepEqual(emptyGroup.configErrorFrame.output, []);
    assert.deepEqual(emptyGroup.iflags.status_hilites, []);
    assert.equal(emptyGroup.iflags.hilite_delta, 0);

    // splitsubfields() splits in place, so the text after the last separator
    // is the tail only when there is one; a trailing '&' contributes nothing.
    const trailingAmpersand = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints/always/red&\n',
    );
    assert.deepEqual(trailingAmpersand.configErrorFrame.output, []);
    assert.equal(trailingAmpersand.iflags.status_hilites.length, 1);

    // An even number of components is not an error: the last one has no
    // partner, so the group loop steps back and reads it as "field/color".
    // CLR_BLUE is 4, and the later always rule is the one get_hilite() keeps.
    const evenComponents = parseNethackrc(
        'OPTIONS=hilite_status:hitpoints/always/red/blue\n',
    );
    assert.deepEqual(evenComponents.configErrorFrame.output, []);
    assert.deepEqual(
        evenComponents.iflags.status_hilites.map(
            ({ behavior, style }) => [behavior, style.color],
        ),
        [['always', CLR_RED], ['always', CLR_BLUE]],
    );

    // Only field 1 of a title rule keeps its blanks, and the comparisons
    // against "always", "up" and the rest are made before trimspaces() runs,
    // so " always" is a text match rather than a persistent rule.  botl.c
    // ignores trimspaces()'s returned pointer, preserving the leading blank.
    const spacedTitle = parseNethackrc(
        'OPTIONS=hilite_status:title/ always/red\n',
    );
    assert.deepEqual(spacedTitle.configErrorFrame.output, []);
    assert.deepEqual(
        spacedTitle.iflags.status_hilites.map(
            ({ behavior, text }) => [behavior, text],
        ),
        [['text', ' always']],
    );

    // parse_status_hl2() ignores trimspaces()'s returned pointer.  A buffer
    // containing only blanks therefore keeps all of them: the local pointer
    // reaches NUL before the in-place trailing loop begins.  Once a nonblank
    // byte is present, only trailing ASCII space and tab bytes are erased.
    for (const [threshold, expected] of [
        [' ', ' '],
        ['\t\t', '\t\t'],
        ['  rank \t', '  rank'],
        ['rank\u00a0', 'rank\u00a0'],
    ]) {
        const parsed = parseNethackrc(
            `OPTIONS=hilite_status:title/${threshold}/red\n`,
        );
        assert.deepEqual(parsed.configErrorFrame.output, [], threshold);
        assert.equal(parsed.iflags.status_hilites.length, 1, threshold);
        assert.equal(
            parsed.iflags.status_hilites[0].text,
            expected,
            threshold,
        );
    }

    // C truncates into textmatch[80] before trimspaces() runs.  A tab in byte
    // 79 is trailing only after byte 80 is discarded, so it must disappear.
    const orderedPrefix = 'a'.repeat(78);
    const orderedThreshold = `${orderedPrefix}\tx`;
    const ordered = parseNethackrc(
        `OPTIONS=hilite_status:title/${orderedThreshold}/red\n`,
    );
    assert.deepEqual(ordered.configErrorFrame.output, []);
    assert.equal(ordered.iflags.status_hilites.length, 1);
    assert.equal(ordered.iflags.status_hilites[0].text, orderedPrefix);
});

// C refs: botl.c parse_status_hl2():2966-2978 for hilite.rel and :3068-3089
// for hilite.behavior.  The first four rows were confirmed against the patched
// C program, which colors HP for '>=5' and '<=20', Pw for '=2' and AC for '>5'
// on a Valkyrie whose status line reads HP:16(16) Pw:2(2) AC:6.
test('status highlight thresholds keep their source relationship', () => {
    for (const [value, expected] of [
        ['hitpoints/>=5/red', ['absolute', '>=', 5, '']],
        ['hitpoints/<=20/red', ['absolute', '<=', 20, '']],
        ['power/=2/red', ['absolute', '=', 2, '']],
        ['armor-class/>5/red', ['absolute', '>', 5, '']],
        ['hitpoints/<50%/red', ['percentage', '<', 50, '']],
        // The behaviors that carry no threshold value do not all reach the
        // same arm of C's relationship chain.  'changed' is one of the four
        // flags the EQ_VALUE arm tests; 'always' and 'criticalhp' set none of
        // them and fall to the closing `else hilite.rel = LT_VALUE;`.  The
        // status renderer reads the relation only for the two numeric
        // behaviors, so all three carry the same '=' here.
        ['hitpoints/always/red', ['always', '=', null, '']],
        ['hitpoints/changed/red', ['changed', '=', null, '']],
        ['hitpoints/criticalhp/red', ['critical', '=', null, '']],
        // 'up' and 'down' are GT_VALUE and LT_VALUE on a numeric field.
        ['experience-level/up/red', ['changed', '>', null, '']],
        ['experience-level/down/red', ['changed', '<', null, '']],
        // On a string field both are treated as 'changed' instead, which does
        // reach EQ_VALUE.
        ['alignment/up/red', ['changed', '=', null, '']],
        // A text match is TXT_VALUE, the arm below EQ_VALUE's, and carries
        // the same '=' for the same reason.
        ['carrying-capacity/overtaxed/red', ['text', '=', null, 'overtaxed']],
        ['title/stripling/red', ['text', '=', null, 'stripling']],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=hilite_status:${value}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
        assert.deepEqual(
            parsed.iflags.status_hilites.map(
                (rule) => [rule.behavior, rule.relation, rule.value, rule.text],
            ),
            [expected],
            value,
        );
    }

    // The long fields share the lower bound but have no upper one: C compares
    // a_long with 0 for '=', so zero is in range where -1 is not.
    const zero = parseNethackrc('OPTIONS=hilite_status:experience/0/red\n');
    assert.deepEqual(zero.configErrorFrame.output, []);
    assert.equal(zero.iflags.status_hilites[0].value, 0);
});

// C ref: botl.c parse_status_hl2():2947-2963, the two range checks.  The
// ANY_INT one takes its lower bound from the field and the relationship
// together -- `(fld == BL_AC) ? -128 : grt ? -1 : lt ? 1 : 0` -- and the
// ANY_LONG one below it repeats the relationship half without the AC
// exception.  hitpoints is ANY_INT, armor-class is BL_AC and experience is
// ANY_LONG, which is what sends the same shapes through the three arms.
test('an integer threshold takes the lower bound of its field and relation',
    () => {
        // A null threshold means C accepted the statement; a string is the
        // quoted text its "out of range" message carries, which is the
        // relationship followed by the parsed value.
        for (const [value, threshold] of [
            // '=' and the "or equal" spellings set neither grt nor lt, so the
            // chain ends at 0.
            ['hitpoints/0/red', null],
            ['hitpoints/-1/red', '=-1'],
            ['hitpoints/>=0/red', null],
            ['hitpoints/>=-1/red', '>=-1'],
            // '>' takes -1, so one below zero is in range.
            ['hitpoints/>-1/red', null],
            ['hitpoints/>-2/red', '>-2'],
            // '<' takes 1, so zero is out of range where one is not.
            ['hitpoints/<1/red', null],
            ['hitpoints/<0/red', '<0'],
            // BL_AC answers -128 whatever the relationship, which is what
            // lets an armor class below zero be a threshold at all.
            ['armor-class/-2/red', null],
            ['armor-class/-128/red', null],
            ['armor-class/-129/red', '=-129'],
            ['armor-class/<-128/red', null],
            ['armor-class/<-129/red', '<-129'],
            // The long check repeats the same three relationship arms.
            ['experience/0/red', null],
            ['experience/-1/red', '=-1'],
            ['experience/>-1/red', null],
            ['experience/>-2/red', '>-2'],
            ['experience/<1/red', null],
            ['experience/<0/red', '<0'],
        ]) {
            const statement = `OPTIONS=hilite_status:${value}`;
            const parsed = parseNethackrc(`${statement}\n`);
            assert.deepEqual(
                parsed.configErrorFrame.output,
                threshold === null ? [] : [
                    `\n${statement}`,
                    ` * Line 1: hilite_status threshold '${threshold}' is out`
                    + ' of range.',
                ],
                value,
            );
            assert.equal(
                parsed.iflags.status_hilites.length,
                threshold === null ? 1 : 0,
                value,
            );
        }
    });

// C ref: botl.c parse_status_hl1():2643-2645, `if (!iflags.hilite_delta)
// iflags.hilite_delta = 3L;`.  The guard is only visible once the duration is
// already set, which options.c optfn_statushilites():4029 does
// unconditionally.
test('an accepted status highlight leaves an existing duration alone', () => {
    const kept = parseNethackrc(
        'OPTIONS=statushilites:7\n'
        + 'OPTIONS=hilite_status:hitpoints/always/red\n',
    );
    assert.deepEqual(kept.configErrorFrame.output, []);
    assert.equal(kept.iflags.hilite_delta, 7);

    // The same statement on its own stores the default it skipped above.
    assert.equal(
        parseNethackrc('OPTIONS=hilite_status:hitpoints/always/red\n')
            .iflags.hilite_delta,
        3,
    );

    // optfn_statushilites() has no such guard, so the reverse order ends at 7
    // however the rule got there.
    assert.equal(
        parseNethackrc(
            'OPTIONS=hilite_status:hitpoints/always/red\n'
            + 'OPTIONS=statushilites:7\n',
        ).iflags.hilite_delta,
        7,
    );
});

// C ref: botl.c parse_status_hl2()'s BL_CHARACTERISTICS arm, which rewrites the
// field name and re-enters once per characteristic, and stops at the first
// re-entry that fails.
test('a characteristics rule expands to six and stops at the first failure',
    () => {
        const expanded = parseNethackrc(
            'OPTIONS=hilite_status:characteristics/always/red\n',
        );
        assert.deepEqual(expanded.configErrorFrame.output, []);
        assert.deepEqual(
            expanded.iflags.status_hilites.map(({ field }) => field),
            ['strength', 'dexterity', 'constitution',
                'intelligence', 'wisdom', 'charisma'],
        );
        assert.equal(expanded.iflags.hilite_delta, 3);

        // Strength fails, so the other five are never attempted and the pair
        // of colour messages is reported once rather than six times.
        const stopped = parseNethackrc(
            'OPTIONS=hilite_status:characteristics/always/mauve\n',
        );
        assert.deepEqual(stopped.configErrorFrame.output, [
            '\nOPTIONS=hilite_status:characteristics/always/mauve',
            " * Line 1: Unknown color 'mauve'.",
            " * Line 1: bad color '16 -1'.",
        ]);
        assert.deepEqual(stopped.iflags.status_hilites, []);
        assert.equal(stopped.iflags.hilite_delta, 0);

        // Ten pairs fill every in-range field slot.  The first recursive
        // strength pass installs all ten before its loop attempts hsbuf[21];
        // that failure stops the other five characteristic fields.
        const boundaryValue = [
            'characteristics',
            ...Array.from(
                { length: 10 }, () => ['always', 'red'],
            ).flat(),
        ].join('/');
        const boundaryStatement = `HILITE_STATUS=${boundaryValue}`;
        const boundary = parseNethackrc(`${boundaryStatement}\n`);
        assert.deepEqual(boundary.configErrorFrame.output, [
            `\n${boundaryStatement}`,
            " * Line 1: Unknown behavior ''.",
        ]);
        assert.equal(boundary.iflags.status_hilites.length, 10);
        assert.ok(boundary.iflags.status_hilites.every(
            ({ field }) => field === 'strength',
        ));
        assert.equal(boundary.iflags.hilite_delta, 0);
    });

// C refs: coloratt.c match_str2attr() over attrnames[], and the ATR_ to HL_
// chain botl.c parse_status_hl2() (3040-3060) reads its answer with.  Seven
// names precede attrnames[]'s NULL row and three aliases follow it, and the
// match loop walks past that row, so all ten name an attribute.  disp_attrib
// opens at HL_UNDEF, ORs each named bit in, and is *assigned* HL_NONE by
// "none" or "normal", which is what makes the three states below distinct.
test('a status highlight keeps every attribute name apart from none', () => {
    for (const [action, attrib] of [
        // The seven attrnames[] rows ahead of the NULL row.
        ['none', HL_NONE],
        ['bold', HL_BOLD],
        ['dim', HL_DIM],
        ['italic', HL_ITALIC],
        ['underline', HL_ULINE],
        ['blink', HL_BLINK],
        ['inverse', HL_INVERSE],
        // The three aliases behind it.
        ['normal', HL_NONE],
        ['uline', HL_ULINE],
        ['reverse', HL_INVERSE],
        // fuzzymatch() drops ' ', '-' and '_' from both sides.
        ['under_line', HL_ULINE],
        // Several attributes accumulate; a tty-invisible one adds its bit
        // rather than discarding the bits before it.
        ['bold&dim', HL_BOLD | HL_DIM],
        ['bold&italic', HL_BOLD | HL_ITALIC],
        ['bold&blink&inverse', HL_BOLD | HL_BLINK | HL_INVERSE],
        // "normal" replaces the mask; a name after it ORs into HL_NONE.
        ['bold&normal', HL_NONE],
        ['none&bold', HL_NONE | HL_BOLD],
        ['bold&none&dim', HL_NONE | HL_DIM],
        // An action naming no attribute at all leaves HL_UNDEF, which
        // hlattr2attrname() answers NULL for where it answers "normal" for
        // HL_NONE.
        ['red', HL_UNDEF],
    ]) {
        const parsed = parseNethackrc(
            `OPTIONS=hilite_status:hitpoints/always/${action}\n`,
        );
        assert.deepEqual(parsed.configErrorFrame.output, [], action);
        assert.deepEqual(
            parsed.iflags.status_hilites.map(({ style }) => style),
            // C's `if (coloridx == -1) coloridx = NO_COLOR;`.  Only the last
            // row names a colour.
            [{ attrib, color: action === 'red' ? CLR_RED : NO_COLOR }],
            action,
        );
    }
});

// C ref: botl.c splitsubfields(), whose MAX_SUBFIELDS is 16 and which answers
// -1 once fifteen separators have been consumed.  parse_status_hl2() drops the
// group without a message, so the fifteen-separator action is refused in
// silence where the fourteen-separator one is accepted.
test('a status highlight action takes fourteen separators, not fifteen', () => {
    const action = (separators) => [
        ...Array.from({ length: separators }, () => 'bold'), 'red',
    ].join('&');

    const accepted = parseNethackrc(
        `OPTIONS=hilite_status:hitpoints/always/${action(14)}\n`,
    );
    assert.deepEqual(accepted.configErrorFrame.output, []);
    assert.deepEqual(
        accepted.iflags.status_hilites.map(({ style }) => style),
        [{ attrib: HL_BOLD, color: CLR_RED }],
    );
    assert.equal(accepted.iflags.hilite_delta, 3);

    const refused = parseNethackrc(
        `OPTIONS=hilite_status:hitpoints/always/${action(15)}\n`,
    );
    assert.deepEqual(refused.configErrorFrame.output, []);
    assert.deepEqual(refused.iflags.status_hilites, []);
    assert.equal(refused.iflags.hilite_delta, 0);
});

// C ref: botl.c parse_condition()'s action loop, which differs from
// parse_status_hl2()'s in three ways: it reports "bad color %d" without the
// quotes and without the second index, it accepts a second color rather than
// refusing it, and ATR_NONE clears the attribute bits for this group's
// conditions instead of setting one.
test('a condition rule reads its colors and attributes its own way', () => {
    const rejected = parseNethackrc(
        'OPTIONS=hilite_status:condition/blind/mauve\n',
    );
    assert.deepEqual(rejected.configErrorFrame.output, [
        '\nOPTIONS=hilite_status:condition/blind/mauve',
        " * Line 1: Unknown color 'mauve'.",
        ' * Line 1: bad color 16.',
    ]);
    // The bad color was the group's first subfield, so C had written nothing
    // to gc.cond_hilites[] before it returned FALSE.
    assert.deepEqual(rejected.iflags.status_hilites, []);
    assert.equal(rejected.iflags.hilite_delta, 0);

    // With an attribute ahead of it, C has already ORed that attribute's
    // entry, and the only write it skips is the
    // `gc.cond_hilites[coloridx] |= conditions_bitmask` below the loop.  A
    // null color is the port's record of that skip.
    const partial = parseNethackrc(
        'OPTIONS=hilite_status:condition/blind/inverse+mauve\n',
    );
    assert.deepEqual(partial.configErrorFrame.output, [
        '\nOPTIONS=hilite_status:condition/blind/inverse+mauve',
        " * Line 1: Unknown color 'mauve'.",
        ' * Line 1: bad color 16.',
    ]);
    assert.deepEqual(partial.iflags.status_hilites, [{
        field: 'condition',
        conditions: ['blind'],
        style: { attrib: HL_INVERSE, clearAttributes: false, color: null },
    }]);
    // parse_status_hl1() still answers FALSE, so its duration is skipped and
    // the bits stay dormant until something else turns highlighting on.
    assert.equal(partial.iflags.hilite_delta, 0);

    // "none" is the other write the loop can make before the bad color, and
    // it survives the same way: the sweep is recorded with no attribute bit
    // and no color index beside it.
    const swept = parseNethackrc(
        'OPTIONS=hilite_status:condition/blind/none+mauve\n',
    );
    assert.deepEqual(swept.iflags.status_hilites, [{
        field: 'condition',
        conditions: ['blind'],
        style: { attrib: HL_UNDEF, clearAttributes: true, color: null },
    }]);

    const cleared = parseNethackrc(
        'OPTIONS=hilite_status:condition/blind/bold&none&underline\n',
    );
    assert.deepEqual(cleared.configErrorFrame.output, []);
    assert.deepEqual(cleared.iflags.status_hilites, [{
        field: 'condition',
        conditions: ['blind'],
        style: {
            attrib: HL_ULINE,
            clearAttributes: true,
            color: NO_COLOR,
        },
    }]);

    // Two colors in one action: the last one wins, and the group that names
    // none of its own inherits it.
    const inherited = parseNethackrc(
        'OPTIONS=hilite_status:condition/blind/red&blue/deaf/bold\n',
    );
    assert.deepEqual(inherited.configErrorFrame.output, []);
    assert.deepEqual(
        inherited.iflags.status_hilites.map(
            ({ conditions, style }) => [conditions, style.color],
        ),
        [[['blind'], CLR_BLUE], [['deaf'], CLR_BLUE]],
    );
});

// C ref: botl.c clear_status_hilites(), which empties every field's threshold
// list and leaves gc.cond_hilites[] alone.  This port keeps both in one array,
// so the negated statement has to spare the condition rules.
test('a negated hilite_status clears fields but not conditions', () => {
    const cleared = parseNethackrc(
        'OPTIONS=hilite_status:condition/blind+deaf/red\n'
        + 'OPTIONS=hilite_status:hitpoints/always/blue\n'
        + 'OPTIONS=!hilite_status:clear\n',
    );
    assert.deepEqual(cleared.configErrorFrame.output, []);
    assert.deepEqual(cleared.iflags.status_hilites.map(({ field }) => field),
        ['condition']);
    // clear_status_hilites() does not reset the duration either.
    assert.equal(cleared.iflags.hilite_delta, 3);
});

test('showvers and versinfo preserve the release-build status selection', () => {
    const parsed = parseNethackrc('OPTIONS=showvers,versinfo:3');
    assert.equal(parsed.flags.showvers, true);
    assert.equal(parsed.flags.versinfo, 3);
    assert.equal(parseNethackrc('OPTIONS=versinfo:7').flags.versinfo, 7);
    // One is the smallest value the mask admits. It is also the value
    // initoptions_init() already stored, so accepting it has to be read off
    // the empty error list rather than off flags.versinfo.
    const lowest = parseNethackrc('OPTIONS=versinfo:1');
    assert.equal(lowest.flags.versinfo, 1);
    assert.deepEqual(lowest.configErrorFrame.output, []);

    // C ref: options.c optfn_versinfo()'s `!val || (val & ~7) != 0` guard.
    // Eight is the smallest value with a bit outside the mask; text with no
    // leading digit is atoi()'s zero, which the same guard rejects. Either way
    // optn_silenterr leaves flags.versinfo at initoptions_init()'s VI_NUMBER.
    for (const value of ['8', 'abc']) {
        const rejected = parseNethackrc(`OPTIONS=versinfo:${value}`);
        assert.equal(rejected.flags.versinfo, 1, value);
        assert.deepEqual(rejected.configErrorFrame.output, [
            `\nOPTIONS=versinfo:${value}`,
            " * Line 1: 'versinfo' must be one of 1, 2, 4, or the sum of two or"
            + ' all three of those.',
        ], value);
    }

    // string_for_opt(opts, FALSE) reports the missing parameter before the
    // handler adds its own message, so a bare name raises two errors on one
    // line and the offending line is echoed only once.
    const missing = parseNethackrc('OPTIONS=versinfo');
    assert.equal(missing.flags.versinfo, 1);
    assert.deepEqual(missing.configErrorFrame.output, [
        '\nOPTIONS=versinfo',
        " * Line 1: Missing parameter for 'versinfo'.",
        " * Line 1: 'versinfo' requires a value; defaulting to 1.",
    ]);
});

test('prefix options validate their source suffixes', () => {
    const enabled = parseNethackrc('OPTIONS=cond_blin');
    const disabled = parseNethackrc('OPTIONS=!cond_blin');
    assert.equal(enabled.iflags.status_conditions.blind, true);
    assert.equal(disabled.iflags.status_conditions.blind, false);
    assert.equal(Object.hasOwn(enabled.flags, 'cond_blind'), false);

    // botl.c uses the whole three-byte name as minmatch when the condition
    // name is shorter than four bytes; longer names still require four.
    const shortNames = parseNethackrc('OPTIONS=!cond_fly,cond_ice');
    assert.equal(shortNames.iflags.status_conditions.fly, false);
    assert.equal(shortNames.iflags.status_conditions.ice, true);
    assert.deepEqual(shortNames.configErrorFrame.output, []);

    // Each of these reaches a pfx row, either through str_start_is() or,
    // for the bare prefix name, through match_optname() on the prefix itself.
    // pfxfn_cond_() names the original statement, while parseoptions() only
    // adds its second diagnostic after str_start_is() reached the row.
    for (const [invalid, messages] of [
        ['cond', [
            'Unknown condition option cond (2).',
        ]],
        ['cond_', [
            'Unknown condition option cond_ (2).',
            "bad option suffix variation 'cond_'.",
        ]],
        ['cond_bli', [
            'Unknown condition option cond_bli (1).',
            "bad option suffix variation 'cond_bli'.",
        ]],
        ['cond_fl', [
            'Unknown condition option cond_fl (1).',
            "bad option suffix variation 'cond_fl'.",
        ]],
        ['cond_bogus', [
            'Unknown condition option cond_bogus (1).',
            "bad option suffix variation 'cond_bogus'.",
        ]],
        ['cond_bogus:value', [
            'Unknown condition option cond_bogus:value (1).',
            "bad option suffix variation 'cond_bogus'.",
        ]],
        ['cond_blind:on', [
            'Unknown condition option cond_blind:on (1).',
            "bad option suffix variation 'cond_blind'.",
        ]],
        ['font', [
            "Unknown font parameter 'font'.",
            "bad option suffix variation 'font'.",
        ]],
        ['fontbogus:value', [
            "Unknown font parameter 'fontbogus:value'.",
            "bad option suffix variation 'fontbogus'.",
        ]],
        // str_start_is() is called case-blind, and only that call can match
        // these two: their lowercased names are longer than the prefix, so
        // the minmatch arm cannot reach them.
        ['COND_BOGUS', [
            'Unknown condition option COND_BOGUS (1).',
            "bad option suffix variation 'COND_BOGUS'.",
        ]],
        ['FONTBOGUS:x', [
            "Unknown font parameter 'FONTBOGUS:x'.",
            "bad option suffix variation 'FONTBOGUS'.",
        ]],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=${invalid}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${invalid}`,
            ...messages.map((message) => ` * Line 1: ${message}`),
        ], invalid);
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
    // 'S_' is checked case-sensitively, so the lowercase spelling never
    // reaches parsesymbols() and keeps its value in the report.  The
    // uppercase one does reach it, and parsesymbols() splits the statement in
    // place at the colon before match_sym() rejects the name, so what
    // options.c:688 has left to quote is only the part before it.
    for (const [invalid, reported] of [
        ['s_vwall:|', 's_vwall:|'],
        ['S_bogus:x', 'S_bogus'],
        // With no separator parsesymbols() returns before writing anything.
        ['S_bogus', 'S_bogus'],
        // strchr() finds the '=' wherever it sits, including last.
        ['S_bogus=', 'S_bogus'],
        // The colon scan stops one character before the end, so a trailing
        // colon is not a separator and nothing is cut off.
        ['S_bogus:', 'S_bogus:'],
        // parsesymbols() runs mungspaces() over the name it split off, which
        // condenses interior runs and turns a tab into a space first.
        ['S_bo  gus :x', 'S_bo gus'],
        ['S_bogus\t:x', 'S_bogus'],
        // A colon between two quotes is a value, not a separator, which is
        // what lets S_boulder:':' name the quote character.  With no other
        // colon and no '=', parsesymbols() gives up before writing anything.
        ["S_x':'y", "S_x':'y"],
        // The '=' fallback then splits what the colon scan passed over.
        ["S_x':'y=z", "S_x':'y"],
        // Both neighbours have to be quotes: one quote alone leaves the colon
        // a separator, so the name keeps the quote and loses the value.
        ["S_bogus':x", "S_bogus'"],
    ]) {
        assert.deepEqual(
            parseNethackrc(`OPTIONS=${invalid}`).configErrorFrame.output,
            [
                `\nOPTIONS=${invalid}`,
                ` * Line 1: Unknown option '${reported}'.`,
            ],
            invalid,
        );
    }
});

// Split a comma-separated C list at its top level, leaving commas inside
// string literals, parentheses and brackets where they are.
function splitTopLevelCommas(text) {
    const parts = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    for (let index = 0; index < text.length; ++index) {
        const ch = text[index];
        if (quoted) {
            if (ch === '\\') ++index;
            else if (ch === '"') quoted = false;
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === '(' || ch === '[') ++depth;
        else if (ch === ')' || ch === ']') --depth;
        else if (ch === ',' && depth === 0) {
            parts.push(text.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(text.slice(start).trim());
    return parts;
}

// C ref: include/optlist.h, `struct allopt_t` and the four NHOPT* macros the
// NHOPT_PARSE arm expands into its initializers.
//
// scripts/generate-options.mjs reads each column out of the expanded
// initializer by position. valok and dupeok sit next to each other, and the
// two disagree on exactly one BoolOpt row, so a shifted column could still
// regenerate a plausible table. This derives both flags from the header
// without going through the generator: the struct gives each column's
// position, the macro definitions say which parameter fills it, and each
// row's own macro call supplies the value.
test('the generated option table takes parser metadata from optlist.h', () => {
    // Comments carry placeholder calls such as "NHOPTC(gender) -- moved to
    // top", which the call scan below would otherwise read as rows.
    const header = readFileSync(
        new URL('../nethack-c/upstream/include/optlist.h', import.meta.url),
        'utf8',
    ).replace(/\/\*[\s\S]*?\*\//gu, ' ');

    const structBody = /struct allopt_t \{([\s\S]*?)\n\};/u.exec(header)[1];
    const members = [];
    for (const line of structBody.split('\n')) {
        const declaration = line.trim().replace(/;$/u, '');
        if (!declaration) continue;
        // "boolean opt_in_out, *addr" declares two members on one line, so the
        // type is stripped once and the rest split.
        for (const name of splitTopLevelCommas(
            declaration.replace(/^[A-Za-z_][A-Za-z0-9_ ]*\s/u, ''),
        )) members.push(name.replace(/^\**/u, '').trim());
    }
    // The two neighbouring columns the generator has to tell apart.
    assert.equal(members[8], 'valok');
    assert.equal(members[9], 'dupeok');

    // Each macro's parameter list and expansion body, which together say which
    // argument of a call lands in the valok and dupeok columns.
    const parseArm = header.slice(header.indexOf('#elif defined(NHOPT_PARSE)'));
    const argumentIndex = {};
    for (const macro of parseArm.matchAll(
        /#define NHOPT([BCPO])\(([^)]*)\)((?:[^\n]*\\\n)*[^\n]*)/gu,
    )) {
        const parameters = splitTopLevelCommas(macro[2]);
        const fields = splitTopLevelCommas(
            /\{([\s\S]*)\}/u.exec(macro[3].replace(/\\\n/gu, ' '))[1],
        );
        assert.equal(fields.length, members.length, macro[1]);
        argumentIndex[macro[1]] = {
            // NHOPTO names its row with a string literal in the first
            // argument; the other three stringize their first parameter.
            name: parameters.indexOf(fields[0].replace('#', '')),
            valok: parameters.indexOf(fields[8]),
            dupeok: parameters.indexOf(fields[9]),
            alias: parameters.indexOf(fields[15]),
        };
    }
    assert.deepEqual(argumentIndex, {
        B: { name: 0, valok: 7, dupeok: 8, alias: 9 },
        C: { name: 0, valok: 6, dupeok: 7, alias: 9 },
        P: { name: 0, valok: 6, dupeok: 7, alias: 9 },
        O: { name: 0, valok: 7, dupeok: 8, alias: 9 },
    });

    // Every call in the option list, keyed by the name it gives its row.  A
    // name appearing twice sits in the two arms of one #ifdef; both are read
    // here, and the columns compared below have to agree between them.
    const calls = new Map();
    for (const call of header.matchAll(/\bNHOPT([BCPO])\s*\(/gu)) {
        const lineStart = header.lastIndexOf('\n', call.index) + 1;
        if (header.startsWith('#define', lineStart)) continue;
        let index = call.index + call[0].length;
        let depth = 1;
        let quoted = false;
        while (depth > 0) {
            const ch = header[index];
            if (quoted) {
                if (ch === '\\') ++index;
                else if (ch === '"') quoted = false;
            } else if (ch === '"') quoted = true;
            else if (ch === '(') ++depth;
            else if (ch === ')') --depth;
            ++index;
        }
        const where = argumentIndex[call[1]];
        const args = splitTopLevelCommas(
            header.slice(call.index + call[0].length, index - 1),
        );
        const name = call[1] === 'O'
            ? JSON.parse(args[where.name]) : args[where.name];
        if (!calls.has(name)) calls.set(name, []);
        calls.get(name).push({
            valok: args[where.valok], dupeok: args[where.dupeok],
            alias: args[where.alias],
        });
    }

    let boolOptColumnsDiffer = 0;
    for (const row of allopt) {
        const entries = calls.get(row.name);
        assert.ok(entries, `optlist.h has no NHOPT* call for ${row.name}`);
        const valok = new Set(entries.map((entry) => entry.valok));
        assert.equal(valok.size, 1, `${row.name} valok differs by #ifdef arm`);
        const expected = [...valok][0] === 'Yes';
        assert.equal(row.valok, expected, row.name);

        const dupeok = new Set(entries.map((entry) => entry.dupeok));
        assert.equal(dupeok.size, 1, `${row.name} dupeok differs by #ifdef arm`);
        const metadata = optionParserMetadata[row.name] ?? {};
        assert.equal(metadata.dupeok ?? false,
            [...dupeok][0] === 'Yes', row.name);
        const aliases = new Set(entries.map((entry) => entry.alias));
        assert.equal(aliases.size, 1, `${row.name} alias differs by #ifdef arm`);
        const alias = [...aliases][0];
        assert.equal(metadata.alias ?? null,
            alias === 'NoAlias' ? null : JSON.parse(alias));
        if (row.opttyp === 'BoolOpt' && dupeok.size === 1
            && ([...dupeok][0] === 'Yes') !== expected) ++boolOptColumnsDiffer;
    }
    // The whole reason the column needed an oracle: menucolors is the only
    // BoolOpt row whose two neighbouring columns disagree, and optfn_boolean()
    // is the only reader of valok this port has.
    assert.equal(boolOptColumnsDiffer, 1);
    assert.equal(allopt.find((row) => row.name === 'menucolors').valok, true);
});

test('every generated option alias resolves through its source-owned row',
    () => {
        for (const [canonical, metadata] of Object.entries(
            optionParserMetadata,
        )) {
            const { alias } = metadata;
            if (!alias || alias === canonical) continue;
            assert.equal(
                optionAliasTarget(alias),
                alias === 'male' ? 'male' : canonical,
                alias,
            );
        }
        assert.equal(optionAliasTarget('customsymbols'), null);
        assert.equal(optionAliasTarget('constructor'), null);
    });

// C ref: options.c optfn_sortloot()'s do_set arm, which keeps the lowercased
// first letter of the value and rejects everything else.
test('sortloot keeps one letter and refuses every other spelling', () => {
    assert.equal(parseNethackrc('OPTIONS=sortloot:full\n').flags.sortloot, 'f');
    assert.equal(parseNethackrc('OPTIONS=sortloot:N\n').flags.sortloot, 'n');

    // optn_err leaves flags.sortloot at the 'l' initoptions_init() (7205)
    // stored, and the game plays on: the two strings below are exactly what
    // config_erradd() hands pline(), which is raw_print() this early.
    const rejected = parseNethackrc('OPTIONS=sortloot:x\n');
    assert.equal(rejected.flags.sortloot, 'l');
    assert.deepEqual(rejected.configErrorFrame.output, [
        '\nOPTIONS=sortloot:x',
        " * Line 1: Unknown sortloot parameter 'x'.",
    ]);

    // string_for_opt() answers empty_optstr with a "Missing parameter for"
    // config error when the value is missing, which is what optfn_sortloot()
    // asks for by re-reading it with val_optional FALSE; it then returns
    // optn_err rather than choosing a default. Both value-less spellings
    // reach that, including the bare name, which before this fell past the
    // arm to applyBooleanOption() and stored `true` over the 'l' default.
    // The message quotes the whole statement, because string_for_opt() has
    // only `opts` to name it by.
    for (const [line, statement] of [
        ['OPTIONS=sortloot:\n', 'sortloot:'],
        ['OPTIONS=sortloot\n', 'sortloot'],
    ]) {
        const parsed = parseNethackrc(line);
        assert.equal(parsed.flags.sortloot, 'l', line);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line.trimEnd()}`,
            ` * Line 1: Missing parameter for '${statement}'.`,
        ], line);
    }

    // optlist.h gives sortloot negateok No, so parseoptions() answers a
    // negation with bad_negation() before optfn_sortloot() runs, whatever
    // value follows, and the 'l' default survives.  bad_negation() names the
    // allopt[] row rather than the spelling the statement used, so an
    // abbreviation is reported under the full option name.
    for (const [line, statement] of [
        ['OPTIONS=!sortloot:none\n', '!sortloot:none'],
        ['OPTIONS=nosortl\n', 'nosortl'],
    ]) {
        const parsed = parseNethackrc(line);
        assert.equal(parsed.flags.sortloot, 'l', line);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${statement}`,
            ' * Line 1: The sortloot option may not both have a value and be'
            + ' negated.',
        ], line);
    }
});

// C ref: cfgfiles.c config_erradd() (1543-1589) and config_error_done()
// (1591-1621), whose pline() calls are what a session sees.  Line numbers
// count physical lines, the offending line is echoed once however many errors
// it raises, and the count line closes the read.
test('a configuration error is reported the way config_erradd() prints it',
    () => {
        const parsed = parseNethackrc([
            '# a comment, which parse_conf_buf() counts as a line',
            'OPTIONS=sortloot:x,sortloot:y',
            '',
            'OPTIONS=sortloot:full',
            '',
        ].join('\n'));
        // parseoptions() recurses into the comma suffix first, so the
        // rightmost element of line 2 is rejected first.
        assert.deepEqual(parsed.configErrorFrame.output, [
            '\nOPTIONS=sortloot:x,sortloot:y',
            " * Line 2: Unknown sortloot parameter 'y'.",
            ' * Line 2: compound option specified multiple times: sortloot.',
            " * Line 2: Unknown sortloot parameter 'x'.",
            '\nOPTIONS=sortloot:full',
            ' * Line 4: compound option specified multiple times: sortloot.',
        ]);
        // Parsing continued past both errors.
        assert.equal(parsed.flags.sortloot, 'f');

        assert.equal(config_error_done(parsed.configErrorFrame, {}), 4);
        assert.deepEqual(parsed.configErrorFrame.output.at(-1),
            '\n4 errors in .nethackrc.\n');
    });

// C ref: cfgfiles.c config_error_done(), the `if (n)` guard.  A clean file
// prints nothing and, in js/jsmain.js, waits for no key.
test('a configuration file without errors reports none', () => {
    const parsed = parseNethackrc('OPTIONS=sortloot:full\n');
    assert.equal(config_error_done(parsed.configErrorFrame, {}), 0);
    assert.deepEqual(parsed.configErrorFrame.output, []);
});

// C ref: cfgfiles.c parse_conf_buf():1707-1710, which reports an overlong line
// before config_error_nextline() has counted it.  A first line that overflows
// therefore carries no line number and no offending text, which is the one
// path that reaches config_erradd()'s `line_num > 0` false arm.
test('an overlong first line is reported without a line number', () => {
    // parse_conf_buf() reads into a 4 * BUFSZ buffer and gives up when the
    // 1024 bytes it read hold no newline; 1200 clears that with room to spare.
    const parsed = parseNethackrc(`OPTIONS=${'z'.repeat(1200)}\nOPTIONS=time\n`);
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\n',
        ' * Line too long, skipping.',
    ]);
    // The line after it is read normally: p->skip clears on the newline the
    // overlong line's tail carries.
    assert.equal(parsed.flags.time, true);
    assert.equal(config_error_done(parsed.configErrorFrame, {}), 1);
    assert.equal(parsed.configErrorFrame.output.at(-1),
        '\n1 error in .nethackrc.\n');
});

// C ref: options.c parseoptions():520-524, `strlen(opts) > BUFSZ / 2`.  The
// limit is measured per comma-separated element, on the bytes as the file
// spelled them, before leading and trailing whitespace is stripped.
test('an over-long option element is reported and the rest of the line runs',
    () => {
        // BUFSZ is 256, so an element of 128 bytes is the longest accepted
        // one and 129 is the shortest rejected one.  Neither spelling names
        // an option, so the accepted one falls through to the unknown-option
        // report, which is how the two are told apart.
        const accepted = parseNethackrc(`OPTIONS=${'z'.repeat(128)}\n`);
        assert.deepEqual(accepted.configErrorFrame.output.at(-1),
            ` * Line 1: Unknown option '${'z'.repeat(128)}'.`);
        const rejected = parseNethackrc(`OPTIONS=${'z'.repeat(129)}\n`);
        assert.deepEqual(rejected.configErrorFrame.output.at(-1),
            ' * Line 1: Option too long, max length is 128 characters.');

        // strlen() counts bytes, so 64 two-byte characters reach the limit
        // exactly and 65 pass it.
        const twoByte = 'é';
        assert.deepEqual(
            parseNethackrc(`OPTIONS=${twoByte.repeat(65)}\n`)
                .configErrorFrame.output.at(-1),
            ' * Line 1: Option too long, max length is 128 characters.',
        );
        assert.deepEqual(
            parseNethackrc(`OPTIONS=${twoByte.repeat(64)}\n`)
                .configErrorFrame.output.at(-1),
            ` * Line 1: Unknown option '${twoByte.repeat(64)}'.`,
        );

        // The recursion into the comma suffix has already run by the time the
        // length is measured, so the other elements still apply, and the
        // whitespace an element carries counts toward its length: 125 spaces
        // plus "time" is 129 bytes, so flags.time keeps its compiled-in
        // default while the element after the comma is set.
        const padded = `${' '.repeat(125)}time`;
        const mixed = parseNethackrc(`OPTIONS=${padded},sortloot:full\n`);
        assert.equal(mixed.flags.sortloot, 'f');
        assert.equal(mixed.flags.time, parseNethackrc('').flags.time);
        assert.deepEqual(mixed.configErrorFrame.output, [
            `\nOPTIONS=${padded},sortloot:full`,
            ' * Line 1: Option too long, max length is 128 characters.',
        ]);
    });

// C ref: options.c parseoptions():526-538, which strips leading and trailing
// whitespace and reports what is left of an element that held only that.
test('an empty option element is its own configuration error', () => {
    for (const line of ['OPTIONS=', 'OPTIONS=   ', 'OPTIONS=\t']) {
        assert.deepEqual(
            parseNethackrc(`${line}\n`).configErrorFrame.output,
            [`\n${line.trimEnd()}`, ' * Line 1: Empty statement.'],
            line,
        );
    }
    // Every empty element on a line is reported, right to left, and the
    // elements around them still apply.
    const between = parseNethackrc('OPTIONS=time,,sortloot:full\n');
    assert.equal(between.flags.time, true);
    assert.equal(between.flags.sortloot, 'f');
    assert.deepEqual(between.configErrorFrame.output, [
        '\nOPTIONS=time,,sortloot:full',
        ' * Line 1: Empty statement.',
    ]);
});

// C ref: options.c parseoptions():539-542, the negation loop.  It advances by
// exactly one, two or three bytes per prefix and strips no whitespace of its
// own -- the only strip is the one at 528-533, which ran before it -- so a
// blank after a prefix stays at the head of the name.  match_optname()
// (6759-6770) then compares that name with strncmpi(), which no allopt[] name
// can pass while a blank sits in front of it.
test('a negation prefix steps over no whitespace', () => {
    // Each pair is the spelling and what the loop leaves behind, which is what
    // the unknown-option report at options.c:687-689 names.  optlist.h:410-411
    // gives legacy an On default and negateok Yes, so a spelling that reached
    // the row would clear flags.legacy and report nothing; every spelling here
    // loses the row instead and leaves the default standing.
    const unmatched = [
        ['! legacy', ' legacy'], // '!' advances one byte
        ['no legacy', ' legacy'], // "no" advances two
        ['no- legacy', ' legacy'], // "no-" advances three
        ['!\tlegacy', '\tlegacy'], // isspace() covers the tab as well
        ['!! legacy', ' legacy'], // two prefixes, negation back to FALSE
        // The report names what the loop left, value and all, because
        // length_without_val() shortens the match key and not `opts`.
        ['!  legacy:on', '  legacy:on'],
    ];
    for (const [spelling, reported] of unmatched) {
        const parsed = parseNethackrc(`OPTIONS=${spelling}\n`);
        assert.equal(parsed.flags.legacy, true, spelling);
        assert.deepEqual(
            parsed.configErrorFrame.output.at(-1),
            ` * Line 1: Unknown option '${reported}'.`,
            spelling,
        );
    }

    // The same prefixes with nothing between them and the name still reach the
    // row.  '!!' negates twice, so it leaves the On default in place with no
    // report, which is what tells it apart from the unmatched spellings above.
    for (const spelling of ['!legacy', 'nolegacy', 'no-legacy', '!!legacy']) {
        const parsed = parseNethackrc(`OPTIONS=${spelling}\n`);
        assert.equal(parsed.flags.legacy, spelling === '!!legacy', spelling);
        assert.deepEqual(parsed.configErrorFrame.output, [], spelling);
    }

    // A blank at the head survives length_without_val()'s backward scan, so a
    // statement carrying both a prefix and a value loses its row too.
    // optlist.h:762-764 gives time an Off default.
    const valued = parseNethackrc('OPTIONS=no time :on\n');
    assert.equal(valued.flags.time, false);
    assert.deepEqual(valued.configErrorFrame.output.at(-1),
        " * Line 1: Unknown option ' time :on'.");

    // options.c:557-559 reaches a pfx row through str_start_is(), which
    // compares from the head and so fails on the blank as well.  This port
    // stops on an unrecognized cond_ suffix that reaches that row, so the
    // spelling below proves the blank keeps it away from the row entirely.
    const prefixed = parseNethackrc('OPTIONS=! cond_bogus\n');
    assert.deepEqual(prefixed.configErrorFrame.output.at(-1),
        " * Line 1: Unknown option ' cond_bogus'.");
});

// C ref: options.c length_without_val() (6739-6754).  It backs up over the
// whitespace in front of a ':' or '=' but never over any at the head of the
// statement, so the two ends of a name are not treated alike.
test('whitespace in front of a value separator ends the name', () => {
    // optlist.h:762-764 gives time an Off default, so a statement that reaches
    // the row shows up in flags.time.
    for (const spelling of ['time :on', 'time\t\t:on', 'time  =on']) {
        const parsed = parseNethackrc(`OPTIONS=${spelling}\n`);
        assert.equal(parsed.flags.time, true, spelling);
        assert.deepEqual(parsed.configErrorFrame.output, [], spelling);
    }
    // The scan stops at the head rather than running off it, so a statement
    // that is nothing but a separator is an unknown option and not a crash.
    assert.deepEqual(
        parseNethackrc('OPTIONS=:on\n').configErrorFrame.output.at(-1),
        " * Line 1: Unknown option ':on'.",
    );
});

// C ref: options.c parseoptions():625-629 over bad_negation() (6692-6697).
// The message names allopt[matchidx].name, the row the match landed on, not
// the spelling the statement used.
test('bad_negation names the matched option row, not the spelling used', () => {
    // optlist.h:206-208 is the non-MSDOS arm of BIOS, whose negateok is No.
    // It is the one option that both refuses negation and carries uppercase
    // letters, so it is what proves the report is not the folded lookup key.
    for (const spelling of ['!BIOS', '!bios', 'noBIO']) {
        assert.deepEqual(
            parseNethackrc(`OPTIONS=${spelling}\n`).configErrorFrame.output,
            [
                `\nOPTIONS=${spelling}`,
                ' * Line 1: The BIOS option may not both have a value and be'
                + ' negated.',
            ],
            spelling,
        );
    }
    // with_parameter is TRUE at that call site whatever the statement holds,
    // so a spelling with no value still reads "may not both have a value".
    assert.deepEqual(
        parseNethackrc('OPTIONS=!versinfo\n').configErrorFrame.output.at(-1),
        ' * Line 1: The versinfo option may not both have a value and be'
        + ' negated.',
    );
    // An option whose negateok is Yes reaches its handler instead.
    assert.equal(parseNethackrc('OPTIONS=!msg_window\n')
        .iflags.prevmsg_window, 's');
    assert.deepEqual(
        parseNethackrc('OPTIONS=!msg_window\n').configErrorFrame.output, [],
    );
});

// C ref: options.c parseoptions():625-629.  The check is table-driven, so the
// whole allopt[] table is what it has to answer for, not the handful of
// options a handler happens to have a test of its own for.
test('every option that refuses negation is answered from allopt[]', () => {
    // The two pfx rows never reach the check through this parser, and the two
    // OthrOpt rows whose names carry a space are menu entries rather than
    // configuration statements.
    const rows = allopt.filter(
        (row) => !row.pfx && !row.name.includes(' '),
    );
    // Eleven negateok Yes rows cannot use the generic assertion. Negated role,
    // race, gender and alignment build gr.rfilter; negated hilite_status
    // clears the rule list; align_message and the five font-name handlers issue
    // their own identical bad_negation() message after the table admits them.
    const exceptions = new Set([
        'role', 'race', 'gender', 'alignment', 'hilite_status',
        'align_message',
        'font_map', 'font_menu', 'font_message', 'font_status', 'font_text',
    ]);
    let refused = 0;
    for (const row of rows) {
        if (exceptions.has(row.name)) continue;
        const parsed = parseNethackrc(`OPTIONS=!${row.name}\n`);
        const reported = parsed.configErrorFrame.output.at(-1) ?? '';
        const badNegation = ' * Line 1: The '
            + `${row.name} option may not both have a value and be negated.`;
        if (row.negateok) {
            assert.notEqual(reported, badNegation, row.name);
        } else {
            assert.equal(reported, badNegation, row.name);
            refused += 1;
        }
    }
    // A guard that answered nothing would satisfy the loop above for every
    // negateok Yes row, so pin how many rows the table actually refuses.  The
    // 58 is a literal count of js/optlist_data.js: of its 217 allopt[] rows,
    // 209 survive the pfx and spaced-name filter above, 11 of those are listed
    // as exceptions, and 58 of the remaining 198 carry negateok false. A rerun
    // of that count is the only thing that may change this number.
    assert.equal(refused, 58, `${refused} rows refused negation`);
});

// C ref: options.c optfn_msg_window()'s do_set arm under PREV_MSGS, which is
// 1 for this tty build.
test('msg_window keeps one letter and answers its value-less spellings', () => {
    assert.equal(
        parseNethackrc('OPTIONS=msg_window:reversed\n').iflags.prevmsg_window,
        'r',
    );
    assert.equal(
        parseNethackrc('OPTIONS=msg_window:Combination\n')
            .iflags.prevmsg_window,
        'c',
    );
    // The default arm leaves iflags.prevmsg_window at the 's' that
    // initoptions_init() stores for a tty build and answers optn_err.
    const rejected = parseNethackrc('OPTIONS=msg_window:x\n');
    assert.equal(rejected.iflags.prevmsg_window, 's');
    assert.deepEqual(rejected.configErrorFrame.output, [
        '\nOPTIONS=msg_window:x',
        " * Line 1: Unknown msg_window parameter 'x'.",
    ]);
    // parseoptions() reads every option's value with string_for_opt(opts,
    // TRUE), so a value-less msg_window reaches the handler as empty_optstr
    // rather than as a config error, and its `tmp = negated ? 's' : 'f'` arm
    // answers it. optlist.h gives msg_window negateok Yes, so the negated
    // spelling gets there too. Both fell past this arm before, and the bare
    // name became the boolean flags.msg_window.
    for (const line of ['OPTIONS=msg_window\n', 'OPTIONS=msg_window:\n']) {
        assert.equal(parseNethackrc(line).iflags.prevmsg_window, 'f', line);
        assert.equal(parseNethackrc(line).flags.msg_window, undefined, line);
    }
    assert.equal(
        parseNethackrc('OPTIONS=!msg_window\n').iflags.prevmsg_window, 's',
    );
    // bad_negation() inside the handler: a negation that carries a value is
    // the one negation optfn_msg_window() itself rejects, and its wording is
    // the "both have a value and" variant because parseoptions() passes TRUE.
    const negated = parseNethackrc('OPTIONS=!msg_window:full\n');
    assert.equal(negated.iflags.prevmsg_window, 's');
    assert.deepEqual(negated.configErrorFrame.output, [
        '\nOPTIONS=!msg_window:full',
        ' * Line 1: The msg_window option may not both have a value and be'
        + ' negated.',
    ]);
});

// C ref: cfgfiles.c config_line_stmt[]. The handlers above are ported.
// Every other player row is recognized and recorded so a later consumer can
// refuse the missing cnf_line_<NAME>() state rather than silently use a default.
test('the parser records the config statements it cannot interpret', () => {
    assert.deepEqual(parseNethackrc('').unportedConfigStatements, []);
    const unported = [
        'hackdir', 'leveldir', 'levels', 'savedir', 'bonesdir',
        'datadir',
        'scoredir', 'lockdir', 'configdir', 'troubledir',
        'menucolor', 'wizkit',
        'qt_tilewidth', 'qt_tileheight', 'qt_fontsize', 'qt_compact',
    ];
    assert.deepEqual(
        parseNethackrc(`${unported.map((name) => `${name}=x`).join('\n')}\n`)
            .unportedConfigStatements,
        unported,
    );
    // The shortest accepted prefix of each, and the longest rejected one.
    assert.deepEqual(
        parseNethackrc('AUTOC=x\nMSGTYPE=hide "x"\nMENUCOLOR=x\n')
            .unportedConfigStatements,
        ['menucolor'],
    );
    assert.deepEqual(
        parseNethackrc('AUTO=x\nMSGTYP=x\nMENUCOLO=x\n')
            .unportedConfigStatements,
        [],
    );
    assert.equal(
        parseNethackrc('AUTO=x\nMSGTYP=x\nMENUCOLO=x\n')
            .configErrorFrame.num_errors,
        3,
    );
    // Every occurrence is recorded, because each one appends its own node to
    // the list the count walks.
    assert.deepEqual(
        parseNethackrc('MENUCOLOR="a"=green\nMENUCOLOR="b"=red\n')
            .unportedConfigStatements,
        ['menucolor', 'menucolor'],
    );
});

// The fresh matrix reaches cfgfiles.c config_error_done() with the three name
// shapes above, then dismisses tty_wait_synch() and enters the running game.
// Keep its eight-error screen arrangement and newly cataloged inert rows tied
// to the focused parser assertions.
test('the unknown-config recipe retains its source branch matrix', () => {
    const recipe = loadUnknownConfigStatementRecipe();
    assert.equal(recipe.segments.length, 3);
    const parsed = recipe.segments.map(
        ({ nethackrc }) => parseNethackrc(nethackrc),
    );
    assert.deepEqual(
        parsed.map(({ configErrorFrame }) => configErrorFrame.num_errors),
        [8, 8, 8],
    );
    assert.deepEqual(parsed[2].unportedConfigStatements, [
        'hackdir', 'leveldir', 'levels', 'savedir', 'bonesdir', 'datadir',
        'scoredir', 'lockdir', 'configdir', 'troubledir', 'wizkit',
        'qt_tilewidth', 'qt_tileheight', 'qt_fontsize', 'qt_compact',
    ]);
});
