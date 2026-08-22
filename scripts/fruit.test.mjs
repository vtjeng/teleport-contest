import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactTable } from '../js/artifacts.js';
import {
    _fruitInternals,
    DEFAULT_FRUIT,
    fruit_from_indx,
    fruit_from_name,
    fruitadd,
    finish_fruit_option,
    makeplural,
    matching_artifact_fruit,
    makesingular,
} from '../js/fruit.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { init_objects } from '../js/o_init.js';
import { initoptions_finish, parseNethackrc } from '../js/options.js';
import {
    SLIME_MOLD,
    objects_globals_init,
} from '../js/objects.js';
import {
    NON_PM,
    monst_globals_init,
} from '../js/monsters.js';
import { SYM_BOULDER } from '../js/const.js';
import {
    S_darkroom,
    initialize_symbols_from_options,
    SYM_OFF_X,
} from '../js/symbols.js';

function objectState(initialized = false) {
    const state = { context: {}, flags: {} };
    objects_globals_init(state);
    if (initialized) init_objects(state, () => 0);
    return state;
}

function fruitState() {
    const state = objectState();
    monst_globals_init(state);
    return state;
}

test('initial fruit option munges, sanitizes, and truncates source bytes', () => {
    assert.equal(parseNethackrc('').pl_fruit, DEFAULT_FRUIT);
    assert.equal(
        parseNethackrc('OPTIONS=fruit:  dragon\t\tfruit  ').pl_fruit,
        'dragon fruit',
    );
    assert.equal(
        parseNethackrc('OPTIONS=fru:  dragon\t\tfruit  ').pl_fruit,
        'dragon fruit',
    );
    assert.equal(
        parseNethackrc('OPTIONS=fruit:A\u0001B\u007fC').pl_fruit,
        'A.B.C',
    );

    // PL_FSIZ is 32 bytes including the terminator, so nmcpy keeps 31.
    assert.equal(
        parseNethackrc(`OPTIONS=fruit:${'x'.repeat(40)}`).pl_fruit,
        'x'.repeat(31),
    );
    // Sixteen UTF-8 e-acute characters occupy 32 bytes. TTY sanitization
    // happens after byte truncation, producing one underscore per kept byte.
    assert.equal(
        parseNethackrc(`OPTIONS=fruit:${'é'.repeat(16)}`).pl_fruit,
        '_'.repeat(31),
    );
});

test('fruit parsing preserves C whitespace and eight-bit option order', () => {
    assert.equal(
        parseNethackrc('OPTIONS=fruit:\vapple').pl_fruit,
        '.apple',
    );
    assert.equal(
        parseNethackrc('OPTIONS=fruit:\fapple').pl_fruit,
        '.apple',
    );
    // UTF-8 NBSP is two high-bit bytes. It is not C-locale whitespace, so
    // the default tty sanitization retains its position as two underscores.
    assert.equal(
        parseNethackrc('OPTIONS=fruit:\u00a0apple\u00a0').pl_fruit,
        '__apple__',
    );
    // ECMAScript treats U+2028 as a line separator, but the recorder's
    // byte-oriented config parser sees its three UTF-8 bytes. Their low-seven
    // values sanitize to underscore, period, underscore.
    assert.equal(
        parseNethackrc('OPTIONS=fruit:\u2028apple').pl_fruit,
        '_._apple',
    );

    const earlierLine = parseNethackrc([
        'OPTIONS=eight_bit_tty',
        'OPTIONS=fruit:é',
    ].join('\n'));
    assert.equal(earlierLine.iflags.wc_eight_bit_input, true);
    assert.equal(earlierLine.pl_fruit, 'é');

    // parseoptions() recurses through a comma list right-to-left. The first
    // spelling below enables eight-bit input before fruit is sanitized; the
    // second enables it only after the high bytes have become underscores.
    assert.equal(
        parseNethackrc('OPTIONS=fruit:é,eight_bit_tty').pl_fruit,
        'é',
    );
    assert.equal(
        parseNethackrc('OPTIONS=eight_bit_tty,fruit:é').pl_fruit,
        '__',
    );

    const continued = parseNethackrc(
        'OPTIONS=fruit:é,\\\n eight_bit_tty',
    );
    assert.equal(continued.iflags.wc_eight_bit_input, true);
    assert.equal(continued.pl_fruit, 'é');

    // TextDecoder normally consumes a leading UTF-8 BOM.  The C buffer does
    // not, so it remains the first character of an eight-bit fruit name.
    assert.equal(
        parseNethackrc('OPTIONS=fruit:\uFEFFapple,eight_bit_tty').pl_fruit,
        '\uFEFFapple',
    );

    // PL_FSIZ truncates the sixteenth e-acute halfway through its two-byte
    // UTF-8 sequence.  The internal surrogate escape represents that final
    // raw C3 byte and must round-trip through later fixed-buffer copies.
    const truncated = parseNethackrc(
        `OPTIONS=fruit:${'é'.repeat(16)},eight_bit_tty`,
    ).pl_fruit;
    assert.equal(truncated.slice(0, 15), 'é'.repeat(15));
    assert.equal(truncated.charCodeAt(15), 0xDCC3);
    assert.deepEqual(
        _fruitInternals.internalBytes(truncated),
        [...Buffer.from('é'.repeat(15)), 0xC3],
    );

    // An unpaired surrogate supplied at the API boundary is encoded as the
    // replacement character by the recorder's UTF-8 file write.  It must not
    // be mistaken for an internally generated raw-byte escape.
    const externalSurrogate = parseNethackrc(
        'OPTIONS=fruit:\uDCC3,eight_bit_tty',
    ).pl_fruit;
    assert.equal(externalSurrogate, '\uFFFD');
    assert.deepEqual(
        _fruitInternals.internalBytes(externalSurrogate),
        [0xEF, 0xBF, 0xBD],
    );
});

test('initial fruit negation and duplicate order follow optfn_fruit', () => {
    // optlist.h:339-340 gives fruit negateok No, so parseoptions() answers
    // every negated spelling with bad_negation() before optfn_fruit() runs.
    // duplicate_opt_detection() has already counted the earlier fruit row, so
    // complain_about_duplicate() reports first on each second line.
    // Its negation arm would have reset svp.pl_fruit through `goodfruit`;
    // instead the value a previous statement stored survives, which is what
    // separates this from the default the option was never given.
    for (const negated of ['!fruit', '!fru', '!fruit:', '!fruit:banana']) {
        const parsed = parseNethackrc(
            `OPTIONS=fruit:kumquats\nOPTIONS=${negated}`,
        );
        assert.equal(parsed.pl_fruit, 'kumquats', negated);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${negated}`,
            ' * Line 2: compound option specified multiple times: fruit.',
            ' * Line 2: The fruit option may not both have a value and be'
            + ' negated.',
        ], negated);
    }
    const repeated = parseNethackrc(
        'OPTIONS=fruit:blueberries,fruit:kumquats',
    );
    assert.equal(repeated.pl_fruit, 'blueberries');
    assert.deepEqual(repeated.configErrorFrame.output, [
        '\nOPTIONS=fruit:blueberries,fruit:kumquats',
        ' * Line 1: compound option specified multiple times: fruit.',
    ]);
    // Outside a negation, val_optional is `negated || !go.opt_initial`, which
    // is FALSE for every configuration-file read: string_for_opt() reports the
    // missing parameter, quoting the statement rather than the option's name,
    // and the handler adds nothing and stores nothing.
    for (const statement of ['OPTIONS=fruit', 'OPTIONS=fruit:']) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ' * Line 1: Missing parameter for'
            + ` '${statement.slice('OPTIONS='.length)}'.`,
        ], statement);
        assert.equal(parsed.pl_fruit, parseNethackrc('').pl_fruit, statement);
    }
});

test('fruit fixed-buffer helpers keep their distinct C terminators', () => {
    // options.c:nmcpy() treats only comma and NUL as terminators, while
    // hacklib.c:copynchars() also stops at a newline.
    assert.equal(_fruitInternals.nmcpy('pear\npie'), 'pear\npie');
    assert.equal(_fruitInternals.copynchars('pear\npie'), 'pear');
});

test('makesingular preserves the object-name inflection rules used by fruit', () => {
    const cases = [
        ['blueberries', 'blueberry'],
        ['knives', 'knife'],
        ['slices of pizza', 'slice of pizza'],
        ['children', 'child'],
        ['mice', 'mouse'],
        ['boxes', 'box'],
        ['wolves', 'wolf'],
        ['cloves', 'clove'],
        ['fungi', 'fungus'],
        ['bacteria', 'bacterium'],
        ['boots', 'boots'],
        ['Manes', 'Manes'],
        // strcasecpy only promotes the replacement's first character here.
        ['THEY', 'It'],
    ];
    for (const [plural, singular] of cases)
        assert.equal(makesingular(plural), singular, plural);
});

test('makeplural preserves source compounds and irregular object names', () => {
    const cases = [
        ['potion of healing', 'potions of healing'],
        ['knife', 'knives'],
        ['homunculus', 'homunculi'],
        ['vortex', 'vortices'],
        ['human', 'humans'],
        ['monarch', 'monarchs'],
        ['pair of boots', 'pair of boots'],
        ['blueberry', 'blueberries'],
        ['foo@', 'foo@s'],
        // len == 1 adds "'s" before makeplural() reaches letter().
        ['@', "@'s"],
        ['A', "A's"],
        ['HE', 'They'],
    ];
    for (const [singular, plural] of cases)
        assert.equal(makeplural(singular), plural, singular);
});

test('artifact fruit matching returns only its article classification', () => {
    const state = { artilist: createArtifactTable() };

    assert.deepEqual(
        matching_artifact_fruit('eXcALiBuR', state),
        { forceThe: false },
        'artifact_name compares case-insensitively',
    );
    assert.deepEqual(
        matching_artifact_fruit('the eXcALiBuR', state),
        { forceThe: false },
        'artifact_name ignores candidate-side the for every artifact',
    );
    assert.deepEqual(
        matching_artifact_fruit('orb of detection', state),
        { forceThe: true },
        'artifact_name ignores an optional leading the',
    );
    assert.equal(matching_artifact_fruit('the ordinary fruit', state), null);
});

test('finish_fruit_option installs the default source-shaped fruit state', () => {
    const state = objectState();
    const fid = finish_fruit_option(parseNethackrc(''), state);

    assert.equal(fid, 1);
    assert.equal(state.svp.pl_fruit, DEFAULT_FRUIT);
    assert.equal(state.context.current_fruit, 1);
    assert.equal(state.flags.made_fruit, false);
    assert.deepEqual(state.gf.ffruit, {
        fname: DEFAULT_FRUIT,
        fid: 1,
        nextf: null,
    });
    assert.equal(state.objects[SLIME_MOLD].oc_name_idx, SLIME_MOLD);
    assert.equal(state.obj_descr[SLIME_MOLD].oc_name, 'fruit');
});

test('initoptions_finish delegates its ported source steps in C order', () => {
    const parsed = parseNethackrc([
        'OPTIONS=fruit:blueberries,tiled_map',
        'OPTIONS=boulder:0',
        '',
    ].join('\n'));
    const state = objectState();
    state.iflags = { ...parsed.iflags };
    initialize_symbols_from_options(parsed, state);

    const trace = [];
    state.svp = new Proxy({}, {
        set(target, property, value) {
            if (property === 'pl_fruit' && !trace.includes('fruit'))
                trace.push('fruit');
            target[property] = value;
            return true;
        },
    });
    state.gs.showsyms = new Proxy(state.gs.showsyms, {
        set(target, property, value) {
            const index = Number(property);
            if (index === SYM_OFF_X + SYM_BOULDER) trace.push('boulder');
            if (index === S_darkroom) trace.push('darkroom');
            target[property] = value;
            return true;
        },
    });
    state.iflags = new Proxy(state.iflags, {
        set(target, property, value) {
            if (property === 'wc_tiled_map' && value === false)
                trace.push('map-mode');
            target[property] = value;
            return true;
        },
    });

    initoptions_finish(parsed, state);
    assert.deepEqual(trace, ['fruit', 'boulder', 'darkroom', 'map-mode']);
});

test('finish_fruit_option singularizes the selected name before insertion', () => {
    const state = objectState();
    finish_fruit_option(parseNethackrc('OPTIONS=fruit:blueberries'), state);

    assert.equal(state.svp.pl_fruit, 'blueberry');
    assert.equal(state.gf.ffruit.fname, 'blueberry');
    assert.equal(state.context.current_fruit, state.gf.ffruit.fid);
});

test('fruitadd protects names that collide with object syntax', () => {
    const food = objectState(true);
    finish_fruit_option(parseNethackrc('OPTIONS=fruit:apples'), food);
    assert.equal(food.svp.pl_fruit, 'candied apple');

    const numeric = objectState();
    finish_fruit_option(parseNethackrc('OPTIONS=fruit:123 apples'), numeric);
    assert.equal(numeric.svp.pl_fruit, 'candied 123 apple');

    const qualified = objectState();
    finish_fruit_option(
        parseNethackrc('OPTIONS=fruit:cursed berries'), qualified,
    );
    assert.equal(qualified.svp.pl_fruit, 'candied cursed berry');

    const spinach = objectState();
    finish_fruit_option(
        parseNethackrc('OPTIONS=fruit:tin of spinach'), spinach,
    );
    assert.equal(spinach.svp.pl_fruit, 'candied tin of spinach');
});

test('monster-shaped fruit names use the complete source resolver', () => {
    const cases = [
        ['newt eggs', 'candied newt egg'], // canonical monster name
        ['grey dragon eggs', 'candied grey dragon egg'], // source alternate
        ['Digger eggs', 'candied Digger egg'], // role-title fallback
        ['tin of newt', 'candied tin of newt'], // tin contents lookup
        ['quux eggs', 'quux egg'], // no monster-name collision
    ];
    for (const [configured, expected] of cases) {
        const state = fruitState();
        finish_fruit_option(
            parseNethackrc(`OPTIONS=fruit:${configured}`),
            state,
        );
        assert.equal(state.svp.pl_fruit, expected, configured);
    }

    const injected = fruitState();
    finish_fruit_option(parseNethackrc('OPTIONS=fruit:newt eggs'), injected, {
        hooks: { nameToMon: () => NON_PM },
    });
    assert.equal(injected.svp.pl_fruit, 'newt egg');
});

test('fruit lookup and insertion preserve ids, case, and prefix matching', () => {
    const state = objectState();
    finish_fruit_option('mangos', state);
    const mango = state.gf.ffruit;
    assert.equal(mango.fname, 'mango');
    assert.equal(fruit_from_indx(1, state), mango);
    assert.equal(fruit_from_name('mango slices', false, state), mango);
    assert.equal(fruit_from_name('mango slices', true, state), null);

    assert.equal(fruitadd('Mango', null, { state }), 2);
    assert.equal(fruitadd('pear, preserved', null, { state }), 3);
    assert.equal(state.gf.ffruit.fname, 'pear, preserved');
    assert.equal(fruitadd('pear', null, { state }), 4);
    assert.equal(state.flags.made_fruit, true);
    assert.equal(state.context.current_fruit, 1);

    state.svp.pl_fruit = 'pears';
    assert.equal(fruitadd(null, null, { state, userSpecified: true }), 4);
    assert.equal(state.context.current_fruit, 4);
});

test('fruit initialization requires the mutable generated object catalog', () => {
    assert.throws(
        () => finish_fruit_option(parseNethackrc(''), {}),
        /requires objects_globals_init/u,
    );
});

test('game startup finishes the configured fruit before its first input', async () => {
    // Any seed and valid fixed time suffice: fruit setup consumes no random
    // numbers and runs before the empty replay reaches the name prompt.
    await runSegment({
        seed: 1,
        datetime: '20260720123456',
        nethackrc: 'OPTIONS=fruit:blueberries',
        moves: '',
    });

    assert.equal(game.svp.pl_fruit, 'blueberry');
    assert.equal(game.context.current_fruit, 1);
    assert.deepEqual(game.gf.ffruit, {
        fname: 'blueberry',
        fid: 1,
        nextf: null,
    });
    assert.equal(game.obj_descr[SLIME_MOLD].oc_name, 'fruit');

    await runSegment({
        // A second arbitrary seed proves a fresh game does not retain the
        // prior fruit chain or tty byte policy.
        seed: 2,
        datetime: '20260720123456',
        nethackrc: 'OPTIONS=eight_bit_tty\nOPTIONS=fruit:é',
        moves: '',
    });
    assert.equal(game.iflags.wc_eight_bit_input, true);
    assert.equal(game.svp.pl_fruit, 'é');
    assert.equal(game.gf.ffruit.fname, 'é');

    await runSegment({
        // Monster-shaped fruit used to abort before the name prompt; this
        // seed isolates the live source resolver from the two prior games.
        seed: 3,
        datetime: '20260720123456',
        nethackrc: 'OPTIONS=fruit:newt eggs',
        moves: '',
    });
    assert.equal(game.svp.pl_fruit, 'candied newt egg');
    assert.equal(game.gf.ffruit.fname, 'candied newt egg');
});
