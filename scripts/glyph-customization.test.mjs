import assert from 'node:assert/strict';
import test from 'node:test';

import { NH_BASIC_COLOR, PRIMARYSET, ROGUESET } from '../js/const.js';
import { rgbstr_to_int32 } from '../js/coloratt.js';
import { map_glyphinfo } from '../js/display.js';
import {
    apply_customizations,
    glyph_customization,
    glyph_find,
    glyphrep_to_custom_map_entries,
    inspect_glyphrep,
    maybe_shuffle_customizations,
    unicode_val,
} from '../js/glyphs.js';
import {
    SOURCE_GLYPH_IDS,
    sourceGlyphNumber,
} from '../js/glyph_ids.js';
import {
    GLYPH_ALTAR_OFF,
    GLYPH_CMAP_MAIN_OFF,
    GLYPH_EXPLODE_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_OBJ_OFF,
    GLYPH_OBJ_PILETOP_OFF,
    GLYPH_SWALLOW_OFF,
    GLYPH_ZAP_OFF,
    MAX_GLYPH,
} from '../js/glyph_offsets.js';
import { MONSTER_TEMPLATES, NUMMONS, PM_HEALER } from '../js/monsters.js';
import { OBJECT_TEMPLATES } from '../js/objects.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import { allopt } from '../js/optlist_data.js';
import {
    finish_glyph_customizations,
    initialize_symbols_from_options,
} from '../js/symbols.js';
import { SYMBOL_INDEX_BY_NAME, SYM_OFF_M } from '../js/symbol_data.js';
import { CLR_BRIGHT_BLUE } from '../js/terminal.js';

function configured(rc) {
    const options = parseNethackrc(rc);
    const state = {
        iflags: { ...options.iflags },
        flags: { ...options.flags },
        mons: MONSTER_TEMPLATES,
        objects: OBJECT_TEMPLATES.map((object) => ({ ...object })),
    };
    initialize_symbols_from_options(options, state);
    finish_glyph_customizations(state);
    return { options, state };
}

test('startup glyph option reaches the ordered symbol operation stream', () => {
    const parsed = parseNethackrc([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=glyph:G_male_healer/U+2603/255-0-0',
    ].join('\n'));

    assert.equal(parsed.flags.glyph, undefined);
    assert.deepEqual(parsed.symbolOperations.at(-1), {
        kind: 'glyph-customization',
        set: 'primary',
        raw: 'G_male_healer/U+2603/255-0-0',
    });
});

test('startup glyph syntax keeps source empty, negated, and malformed behavior', () => {
    for (const rc of ['OPTIONS=glyph', 'OPTIONS=glyph:']) {
        const parsed = parseNethackrc(rc);
        assert.deepEqual(parsed.symbolOperations, [], rc);
        assert.deepEqual(parsed.configErrorFrame.output, [], rc);
    }

    for (const rc of [
        'OPTIONS=!glyph',
        'OPTIONS=!glyph:G_male_healer:U+2603',
    ]) {
        const parsed = parseNethackrc(rc);
        assert.deepEqual(parsed.symbolOperations, [], rc);
        assert.match(parsed.configErrorFrame.output.at(-1), /may not both/u, rc);
    }

    assert.deepEqual(
        parseNethackrc('OPTIONS=glyph:G_no_such:U+2603').symbolOperations,
        [],
    );
    assert.equal(
        parseNethackrc(
            'OPTIONS=glyph:G_male_healer:bogus/no-such-color',
        ).symbolOperations.at(-1).kind,
        'glyph-customization',
        'a valid glyph ID succeeds even when neither detail parses',
    );
});

test('glyph source getter remains its literal startup placeholder', () => {
    const row = allopt.find((option) => option.name === 'glyph');
    assert.equal(optionValue({}, row, {}), '(to be done)');
});

test('the generated G_* catalog remains aligned through every source family', () => {
    assert.equal(SOURCE_GLYPH_IDS.length, MAX_GLYPH);
    assert.equal(sourceGlyphNumber('G_male_healer'), GLYPH_MON_MALE_OFF + PM_HEALER);
    assert.equal(sourceGlyphNumber('G_MALE_HEALER'), GLYPH_MON_MALE_OFF + PM_HEALER);
    assert.equal(glyph_find('g_male_healer'), null, 'the G_ gate is case-sensitive');
    for (const id of [
        'G_piletop_body_giant_ant',
        'G_swallow_giant_ant_top_left',
        'G_frosty_expl_br',
        'G_statue_of_female_apprentice',
        'G_piletop_statue_of_male_giant_ant',
        'G_nothing',
    ]) assert.equal(glyph_find(id)?.length, 1, id);
});

test('S_* expansion covers cmap fanout, generic objects, and eight monster ranges', () => {
    assert.equal(glyph_find('S_vwall').length, 5);
    assert.equal(glyph_find('S_altar').length, 5);
    assert.equal(glyph_find('S_vbeam').length, 8);
    assert.equal(glyph_find('S_sw_tl').length, NUMMONS);
    assert.equal(glyph_find('S_expl_mc').length, 7);
    assert.ok(glyph_find('S_vwall').includes(GLYPH_CMAP_MAIN_OFF));
    assert.ok(glyph_find('S_altar').includes(GLYPH_ALTAR_OFF));
    assert.ok(glyph_find('S_vbeam').includes(GLYPH_ZAP_OFF));
    assert.ok(glyph_find('S_sw_tl').includes(GLYPH_SWALLOW_OFF));
    assert.ok(glyph_find('S_expl_tl').includes(GLYPH_EXPLODE_OFF));
    assert.deepEqual(
        glyph_find('S_nothing'),
        [],
        'parse_id() includes the first post-monster loadsyms fencepost',
    );
    assert.equal(glyph_find('S_unexplored'), null);

    assert.deepEqual(glyph_find('S_weapon'), [
        GLYPH_OBJ_OFF + 2,
        GLYPH_OBJ_PILETOP_OFF + 2,
    ], 'glyph_to_obj()==class selects generic class glyphs, not class members');

    const humans = MONSTER_TEMPLATES.filter((monster) => (
        monster.mlet === SYMBOL_INDEX_BY_NAME.s_human - SYM_OFF_M
    ));
    assert.equal(glyph_find('S_human').length, humans.length * 8);
    assert.equal(glyph_find('s_human'), null, 'the S_ gate is case-sensitive');
    assert.equal(glyph_find('S_armour'), null, 'loadsyms aliases are excluded');
});

test('Unicode and color parsers retain source prefixes and edge behavior', () => {
    assert.equal(unicode_val('u+2603trailing'), 0x2603);
    assert.equal(unicode_val('U+123456789'), 0x1234567);
    assert.equal(unicode_val('2603'), 0);
    assert.equal(inspect_glyphrep('G_male_healer:U+D800/1-2-3').hasUnicode, false);
    assert.equal(rgbstr_to_int32('1-2-3'), 0x010203);
    assert.equal(rgbstr_to_int32('1-2-3-4'), 0x010204);
    assert.equal(rgbstr_to_int32('999-999-999'), (999 << 16) | (999 << 8) | 999);
    assert.equal(rgbstr_to_int32('red'), 1 | NH_BASIC_COLOR);
    assert.equal(rgbstr_to_int32('black'), NH_BASIC_COLOR);
    assert.equal(rgbstr_to_int32('1-a-3'), -1);
});

test('duplicate records replace in place and different slots stay independent', () => {
    const { state } = configured('OPTIONS=symset:Enhanced1');
    glyphrep_to_custom_map_entries('G_male_healer:U+2603/1-2-3', state, PRIMARYSET);
    glyphrep_to_custom_map_entries('G_male_healer:U+2602/4-5-6', state, PRIMARYSET);
    const primary = state.gs.sym_customizations[PRIMARYSET];
    assert.equal(primary.unicode.details.at(-1).value, '☂');
    assert.equal(primary.color.details.at(-1).value, 0x040506);

    state.gs.symset[ROGUESET].name = 'RogueIBM';
    glyphrep_to_custom_map_entries('G_male_healer:U+2601/7-8-9', state, ROGUESET);
    assert.equal(state.gs.sym_customizations[ROGUESET].unicode.details.length, 1);
    assert.equal(primary.unicode.details.at(-1).value, '☂');
});

test('direct G_* and S_* records install Unicode, enhanced, and black colors', () => {
    const { state } = configured([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=glyph:S_human:U+2602/deep sky blue',
        'OPTIONS=glyph:G_male_healer:U+2603/black',
    ].join('\n'));
    const healer = sourceGlyphNumber('G_male_healer');
    assert.deepEqual(glyph_customization(healer, state), {
        displayCh: '☃',
        basicColor: 0,
    });
    const humanGlyphs = glyph_find('S_human');
    assert.ok(humanGlyphs.length > 8);
    assert.equal(glyph_customization(humanGlyphs[0], state).displayCh, '☂');
    assert.ok(glyph_customization(humanGlyphs[0], state).rgb);
});

test('last-selected set owns later glyph records even while primary is active', () => {
    const { options, state } = configured([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=roguesymset:RogueIBM',
        'OPTIONS=glyph:G_male_healer:U+2603/blue',
    ].join('\n'));
    assert.deepEqual(options.symbolOperations.at(-1), {
        kind: 'glyph-customization',
        set: 'rogue',
        raw: 'G_male_healer:U+2603/blue',
    });
    assert.equal(state.gs.sym_customizations[ROGUESET].unicode.details.length, 1);
    assert.equal(
        glyph_customization(sourceGlyphNumber('G_male_healer'), state),
        null,
        'the inactive rogue record is not applied to the primary glyph map',
    );
});

test('legacy IBM selection associates later glyph rows with its last loaded slot', () => {
    const { options, state } = configured([
        'OPTIONS=IBMgraphics',
        'OPTIONS=glyph:G_male_healer:U+2603/blue',
    ].join('\n'));
    assert.deepEqual(options.symbolOperations.at(-1), {
        kind: 'glyph-customization',
        set: 'rogue',
        raw: 'G_male_healer:U+2603/blue',
    });
    assert.equal(state.gs.symset_which_set, ROGUESET);
    assert.equal(state.gs.sym_customizations[ROGUESET].unicode.details.length, 1);
    assert.equal(
        glyph_customization(sourceGlyphNumber('G_male_healer'), state),
        null,
        'the inactive rogue record stays out of the primary map',
    );
});

test('unaffiliated details report the two one-time source diagnostics', () => {
    const parsed = parseNethackrc([
        'OPTIONS=glyph:G_male_healer:U+2603/1-2-3',
        'OPTIONS=glyph:G_male_healer:U+2602/4-5-6',
    ].join('\n'));
    const message = 'Unimplemented customization feature, ignoring for now';
    assert.equal(
        parsed.configErrorFrame.output.filter((line) => line.includes(message)).length,
        2,
        'Unicode and color each nag once, then stay quiet',
    );
});

test('object customization shuffle follows post-init description indices', () => {
    const { state } = configured('OPTIONS=symset:Enhanced1');
    glyphrep_to_custom_map_entries('G_long_sword:U+2603/1-2-3', state, PRIMARYSET);
    apply_customizations(PRIMARYSET, state);
    const sourceIndex = sourceGlyphNumber('G_long_sword') - GLYPH_OBJ_OFF;
    const destination = sourceIndex + 1;
    const expected = {
        ...state.gg.glyph_customizations[GLYPH_OBJ_OFF + sourceIndex],
    };
    state.objects[destination].oc_descr_idx = sourceIndex;
    maybe_shuffle_customizations(state);
    assert.deepEqual(
        state.gg.glyph_customizations[GLYPH_OBJ_OFF + destination],
        expected,
    );
    assert.equal(state.iflags.pending_customizations, false);
});

test('map presentation exposes browser Unicode/RGB but preserves NOMUX limits', () => {
    const { state } = configured('OPTIONS=symset:Enhanced1');
    const fountain = sourceGlyphNumber('G_fountain');
    const shown = map_glyphinfo(fountain, state);
    assert.equal(shown.ch, null, 'NOMUX does not mirror g_pututf8()');
    assert.equal(shown.color, CLR_BRIGHT_BLUE, 'true RGB is not mirrored by NOMUX');
    assert.equal(shown.displayCh, '⌠');
    assert.deepEqual(shown.rgb, [0, 150, 255]);
});

test('standalone SYMBOLS=G_* remains the nonapplication control', () => {
    const { state } = configured([
        'OPTIONS=symset:Enhanced1',
        'SYMBOLS=G_male_healer:U+2603',
    ].join('\n'));
    assert.equal(glyph_customization(sourceGlyphNumber('G_male_healer'), state), null);
});
