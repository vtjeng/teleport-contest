import assert from 'node:assert/strict';
import test from 'node:test';

import {
    _fruitInternals,
    DEFAULT_FRUIT,
    fruit_from_indx,
    fruit_from_name,
    fruitadd,
    initoptions_finish,
    makesingular,
} from '../js/fruit.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { init_objects } from '../js/o_init.js';
import { parseNethackrc } from '../js/options.js';
import {
    SLIME_MOLD,
    objects_globals_init,
} from '../js/objects.js';
import {
    NON_PM,
    monst_globals_init,
} from '../js/monsters.js';

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
    assert.equal(parseNethackrc('OPTIONS=!fruit').pl_fruit, DEFAULT_FRUIT);
    assert.equal(parseNethackrc('OPTIONS=!fru').pl_fruit, DEFAULT_FRUIT);
    assert.equal(parseNethackrc('OPTIONS=!fruit:').pl_fruit, DEFAULT_FRUIT);
    assert.equal(
        parseNethackrc('OPTIONS=fruit:blueberries,fruit:kumquats').pl_fruit,
        'blueberries',
    );
    assert.throws(
        () => parseNethackrc('OPTIONS=fruit'),
        /fruit requires a value/u,
    );
    assert.throws(
        () => parseNethackrc('OPTIONS=fruit:'),
        /fruit requires a value/u,
    );
    assert.throws(
        () => parseNethackrc('OPTIONS=!fruit:banana'),
        /negated fruit cannot have a value/u,
    );
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

test('initoptions_finish installs the default source-shaped fruit state', () => {
    const state = objectState();
    const fid = initoptions_finish(parseNethackrc(''), state);

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

test('initoptions_finish singularizes the selected name before insertion', () => {
    const state = objectState();
    initoptions_finish(parseNethackrc('OPTIONS=fruit:blueberries'), state);

    assert.equal(state.svp.pl_fruit, 'blueberry');
    assert.equal(state.gf.ffruit.fname, 'blueberry');
    assert.equal(state.context.current_fruit, state.gf.ffruit.fid);
});

test('fruitadd protects names that collide with object syntax', () => {
    const food = objectState(true);
    initoptions_finish(parseNethackrc('OPTIONS=fruit:apples'), food);
    assert.equal(food.svp.pl_fruit, 'candied apple');

    const numeric = objectState();
    initoptions_finish(parseNethackrc('OPTIONS=fruit:123 apples'), numeric);
    assert.equal(numeric.svp.pl_fruit, 'candied 123 apple');

    const qualified = objectState();
    initoptions_finish(parseNethackrc('OPTIONS=fruit:cursed berries'), qualified);
    assert.equal(qualified.svp.pl_fruit, 'candied cursed berry');

    const spinach = objectState();
    initoptions_finish(parseNethackrc('OPTIONS=fruit:tin of spinach'), spinach);
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
        initoptions_finish(
            parseNethackrc(`OPTIONS=fruit:${configured}`),
            state,
        );
        assert.equal(state.svp.pl_fruit, expected, configured);
    }

    const injected = fruitState();
    initoptions_finish(parseNethackrc('OPTIONS=fruit:newt eggs'), injected, {
        hooks: { nameToMon: () => NON_PM },
    });
    assert.equal(injected.svp.pl_fruit, 'newt egg');
});

test('fruit lookup and insertion preserve ids, case, and prefix matching', () => {
    const state = objectState();
    initoptions_finish('mangos', state);
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
        () => initoptions_finish(parseNethackrc(''), {}),
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
