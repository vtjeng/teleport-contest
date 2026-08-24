import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import { NH_BASIC_COLOR, PRIMARYSET, ROGUESET } from '../js/const.js';
import { rgbstr_to_int32 } from '../js/coloratt.js';
import { map_glyphinfo } from '../js/display.js';
import {
    apply_customizations,
    numeric_glyph_customization,
    glyph_find,
    glyphrep_to_custom_map_entries,
    inspect_glyphrep,
    maybe_shuffle_customizations,
    unicode_val,
} from '../js/glyphs.js';
import {
    GLYPHREP_CMAP_PARTITIONS,
    SOURCE_GLYPH_IDS,
    sourceGlyphNumber,
    sourceSymbolNamesByIndex,
} from '../js/glyph_ids.js';
import {
    GLYPH_ALTAR_OFF,
    GLYPH_CMAP_A_OFF,
    GLYPH_CMAP_B_OFF,
    GLYPH_CMAP_C_OFF,
    GLYPH_CMAP_GEH_OFF,
    GLYPH_CMAP_KNOX_OFF,
    GLYPH_CMAP_MAIN_OFF,
    GLYPH_CMAP_MINES_OFF,
    GLYPH_CMAP_SOKO_OFF,
    GLYPH_CMAP_STONE_OFF,
    GLYPH_DETECT_FEM_OFF,
    GLYPH_DETECT_MALE_OFF,
    GLYPH_EXPLODE_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_OBJ_OFF,
    GLYPH_OBJ_PILETOP_OFF,
    GLYPH_PET_FEM_OFF,
    GLYPH_PET_MALE_OFF,
    GLYPH_RIDDEN_FEM_OFF,
    GLYPH_RIDDEN_MALE_OFF,
    GLYPH_SWALLOW_OFF,
    GLYPH_ZAP_OFF,
    MAX_GLYPH,
} from '../js/glyph_offsets.js';
import { MONSTER_TEMPLATES, NUMMONS, PM_HEALER } from '../js/monsters.js';
import { OBJECT_TEMPLATES, VENOM_CLASS } from '../js/objects.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import { allopt } from '../js/optlist_data.js';
import {
    initialize_symbols_from_options,
    replay_symbol_operations,
} from '../js/symbols.js';
import {
    SYMBOL_INDEX_BY_NAME,
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_P,
    SYM_OFF_W,
    SYM_OFF_X,
} from '../js/symbol_data.js';
import { CLR_BRIGHT_BLUE } from '../js/terminal.js';
import { extractSymbolLayout } from './generate-symbol-data.mjs';
import {
    loadStartupGlyphCustomizationRecipe,
    verifyStartupGlyphCustomizationSegment,
} from './run-startup-glyph-customization.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function configured(rc) {
    const options = parseNethackrc(rc);
    const state = {
        iflags: { ...options.iflags },
        flags: { ...options.flags },
        mons: MONSTER_TEMPLATES,
        objects: OBJECT_TEMPLATES.map((object) => ({ ...object })),
    };
    initialize_symbols_from_options(options, state);
    apply_customizations(state.gc?.currentgraphics ?? PRIMARYSET, state);
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

test('every generated G_* ID and hole equals the patched C dump', () => {
    const dump = gunzipSync(readFileSync(new URL(
        './glyph-id-reference.txt.gz', import.meta.url,
    ))).toString('utf8');
    const expected = Array(MAX_GLYPH).fill(null);
    for (const line of dump.trimEnd().split('\n')) {
        // Holes appear as "(NNNN) " with no ID after the space.
        const match = /^\((\d{4})\)(?: (G_.+))?$/u.exec(line.trimEnd());
        assert.ok(match, line);
        const glyph = Number(match[1]);
        assert.equal(expected[glyph], null, `duplicate dump row ${glyph}`);
        expected[glyph] = match[2] ?? null;
    }
    assert.deepEqual(
        SOURCE_GLYPH_IDS.map((name) => name || null),
        expected,
    );
});

test('duplicate generic IDs resolve to C cache insertion order', () => {
    // Object classes start at RANDOM_CLASS (0) which has no generic glyph.
    // The 16 named classes map to indices 1-16 inside the object family.
    const names = [
        'strange', 'weapon', 'armor', 'ring', 'amulet', 'tool', 'food',
        'potion', 'scroll', 'spellbook', 'wand', 'coin', 'gem',
        'large_rock', 'iron_ball', 'iron_chain',
    ];
    for (const [index, suffix] of names.entries()) {
        const id = `G_generic_${suffix}`;
        const classIndex = index + 1;
        assert.equal(sourceGlyphNumber(id), GLYPH_OBJ_OFF + classIndex, id);
        assert.equal(
            SOURCE_GLYPH_IDS[GLYPH_OBJ_PILETOP_OFF + classIndex], id, id,
        );
    }
});

test('glyphrep cmap partitions match the pinned defsym source layout', () => {
    const defsym = readFileSync(new URL(
        '../nethack-c/upstream/include/defsym.h', import.meta.url,
    ), 'utf8');
    const layout = extractSymbolLayout(defsym);
    assert.equal(layout.offsets.p, SYM_OFF_P);
    assert.equal(layout.offsets.o, SYM_OFF_O);
    assert.deepEqual(GLYPHREP_CMAP_PARTITIONS, {
        stone: [layout.indices.s_stone, layout.indices.s_stone],
        walls: [layout.indices.s_vwall, layout.indices.s_trwall],
        cmapA: [layout.indices.s_ndoor, layout.indices.s_brdnladder],
        altar: [layout.indices.s_altar, layout.indices.s_altar],
        cmapB: [layout.indices.s_grave, layout.indices.s_trapped_chest],
        zap: [layout.indices.s_vbeam, layout.indices.s_rslant],
        cmapC: [layout.indices.s_digbeam, layout.indices.s_goodpos],
        swallow: [layout.indices.s_sw_tl, layout.indices.s_sw_br],
        explosion: [layout.indices.s_expl_tl, layout.indices.s_expl_br],
    });
    assert.equal(GLYPHREP_CMAP_PARTITIONS.explosion[1] + 1, SYM_OFF_O);
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

test('every canonical S_* expansion equals independent source predicates', () => {
    const partitions = GLYPHREP_CMAP_PARTITIONS;
    const cmapExpected = (index) => {
        if (index === partitions.stone[0]) return [GLYPH_CMAP_STONE_OFF];
        if (index >= partitions.walls[0] && index <= partitions.walls[1]) {
            return [
                GLYPH_CMAP_MAIN_OFF,
                GLYPH_CMAP_MINES_OFF,
                GLYPH_CMAP_GEH_OFF,
                GLYPH_CMAP_KNOX_OFF,
                GLYPH_CMAP_SOKO_OFF,
            ].map((offset) => offset + index - partitions.walls[0]);
        }
        if (index >= partitions.cmapA[0] && index <= partitions.cmapA[1])
            return [GLYPH_CMAP_A_OFF + index - partitions.cmapA[0]];
        if (index === partitions.altar[0])
            return Array.from({ length: 5 }, (_, n) => GLYPH_ALTAR_OFF + n);
        if (index >= partitions.cmapB[0] && index <= partitions.cmapB[1])
            return [GLYPH_CMAP_B_OFF + index - partitions.cmapB[0]];
        if (index >= partitions.zap[0] && index <= partitions.zap[1]) {
            return Array.from(
                { length: 8 },
                (_, n) => GLYPH_ZAP_OFF + n * 4
                    + index - partitions.zap[0],
            );
        }
        if (index >= partitions.cmapC[0] && index <= partitions.cmapC[1])
            return [GLYPH_CMAP_C_OFF + index - partitions.cmapC[0]];
        if (index >= partitions.swallow[0]
            && index <= partitions.swallow[1]) {
            return Array.from(
                { length: NUMMONS },
                (_, n) => GLYPH_SWALLOW_OFF + n * 8
                    + index - partitions.swallow[0],
            );
        }
        return Array.from(
            { length: 7 },
            (_, n) => GLYPH_EXPLODE_OFF + n * 9
                + index - partitions.explosion[0],
        );
    };
    const names = sourceSymbolNamesByIndex();
    for (let absolute = SYM_OFF_P; absolute < SYM_OFF_O; ++absolute) {
        assert.deepEqual(
            glyph_find(`S_${names[absolute]}`),
            cmapExpected(absolute - SYM_OFF_P),
            `cmap ${absolute}`,
        );
    }
    // RANDOM_CLASS (object class 0) has no defsym entry.
    assert.equal(names[SYM_OFF_O], undefined, 'RANDOM_CLASS has no symbol');
    for (let absolute = SYM_OFF_O + 1; absolute < SYM_OFF_M; ++absolute) {
        const objectClass = absolute - SYM_OFF_O;
        const expected = [GLYPH_OBJ_OFF + objectClass];
        if (objectClass !== VENOM_CLASS)
            expected.push(GLYPH_OBJ_PILETOP_OFF + objectClass);
        assert.deepEqual(
            glyph_find(`S_${names[absolute]}`), expected,
            `object class ${objectClass}`,
        );
    }
    const monsterOffsets = [
        GLYPH_MON_MALE_OFF, GLYPH_MON_FEM_OFF,
        GLYPH_PET_MALE_OFF, GLYPH_PET_FEM_OFF,
        GLYPH_DETECT_MALE_OFF, GLYPH_DETECT_FEM_OFF,
        GLYPH_RIDDEN_MALE_OFF, GLYPH_RIDDEN_FEM_OFF,
    ];
    for (let absolute = SYM_OFF_M + 1; absolute < SYM_OFF_W; ++absolute) {
        const monsterClass = absolute - SYM_OFF_M;
        const members = MONSTER_TEMPLATES.filter(
            (monster) => monster.mlet === monsterClass,
        );
        const expected = monsterOffsets.flatMap((offset) => (
            members.map((monster) => offset + monster.pmidx)
        ));
        assert.deepEqual(
            glyph_find(`S_${names[absolute]}`), expected,
            `monster class ${monsterClass}`,
        );
    }
    assert.equal(glyph_find(`S_${names[SYM_OFF_M]}`), null);
    for (let absolute = SYM_OFF_W; absolute < SYM_OFF_X; ++absolute)
        assert.equal(glyph_find(`S_${names[absolute]}`), null);
    assert.deepEqual(glyph_find(`S_${names[SYM_OFF_X]}`), []);
});

test('Unicode and color parsers retain source prefixes and edge behavior', () => {
    assert.equal(unicode_val('u+2603trailing'), 0x2603);
    assert.equal(unicode_val('U+ABCD'), 0xABCD);
    assert.equal(unicode_val('U+123456789'), 0x1234567);
    assert.equal(unicode_val('2603'), 0);
    assert.equal(inspect_glyphrep('G_male_healer:U+D800/1-2-3').hasUnicode, false);
    assert.equal(rgbstr_to_int32('1-2-3'), 0x010203);
    assert.equal(rgbstr_to_int32('1-2-3-4'), 0x010204);
    assert.equal(rgbstr_to_int32('999-999-999'), (999 << 16) | (999 << 8) | 999);
    assert.equal(rgbstr_to_int32('red'), 1 | NH_BASIC_COLOR);
    assert.equal(rgbstr_to_int32('black'), NH_BASIC_COLOR);
    assert.equal(rgbstr_to_int32('1-a-3'), -1);
    assert.notEqual(rgbstr_to_int32('#-12345'), -1);
});

test('uppercase Unicode and signed enhanced colors install like C', () => {
    const healer = sourceGlyphNumber('G_male_healer');
    const { state } = configured([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=glyph:G_male_healer:U+ABCD/#-12345',
    ].join('\n'));
    assert.equal(
        state.gs.sym_customizations[PRIMARYSET].unicode.details
            .find(({ glyph }) => glyph === healer).value,
        String.fromCodePoint(0xABCD),
    );
    assert.equal(
        state.gs.sym_customizations[PRIMARYSET].color.details
            .find(({ glyph }) => glyph === healer).value,
        rgbstr_to_int32('#-12345') >>> 0,
    );
    assert.equal(
        inspect_glyphrep('G_male_healer/#80000000').hasColor,
        false,
        'only the exact signed -1 result is the no-color sentinel',
    );
});

test('optfn_glyph mungspaces its payload before inspection and replay', () => {
    const parsed = parseNethackrc([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=glyph:\t\tG_male_healer/U+2603/deep   sky\tblue   ',
    ].join('\n'));
    assert.deepEqual(parsed.symbolOperations.at(-1), {
        kind: 'glyph-customization',
        set: 'primary',
        raw: 'G_male_healer/U+2603/deep sky blue',
    });
    const { state } = configured([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=glyph:\t\tG_male_healer/U+2603/deep   sky\tblue   ',
    ].join('\n'));
    assert.ok(numeric_glyph_customization(
        sourceGlyphNumber('G_male_healer'), state,
    ).rgb);
});

test('S_nothing and unaffiliated rows allocate no replay state', () => {
    const silent = parseNethackrc('OPTIONS=glyph:S_nothing:U+2603/1-2-3');
    assert.deepEqual(silent.configErrorFrame.output, []);
    const silentState = {
        iflags: { ...silent.iflags },
        flags: { ...silent.flags },
        mons: MONSTER_TEMPLATES,
        objects: OBJECT_TEMPLATES.map((object) => ({ ...object })),
    };
    initialize_symbols_from_options(silent, silentState);
    assert.equal(silentState.gs.sym_customizations, undefined);
    assert.equal(silentState.gg, undefined);

    const unaffiliated = parseNethackrc(
        'OPTIONS=glyph:G_male_healer:U+2603/1-2-3',
    );
    assert.equal(unaffiliated.configErrorFrame.num_errors, 2);
    const unaffiliatedState = {
        iflags: { ...unaffiliated.iflags },
        flags: { ...unaffiliated.flags },
        mons: MONSTER_TEMPLATES,
        objects: OBJECT_TEMPLATES.map((object) => ({ ...object })),
    };
    initialize_symbols_from_options(unaffiliated, unaffiliatedState);
    assert.equal(unaffiliatedState.gs.sym_customizations, undefined);
    assert.equal(unaffiliatedState.gs.glyph_config_errors, undefined);
    assert.equal(unaffiliatedState.gg, undefined);
});

test('partial IBMgraphics loads independent slots and retains last owner', () => {
    const primaryOccupied = configured([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=IBMgraphics',
        'OPTIONS=glyph:G_male_healer:U+2603/blue',
    ].join('\n'));
    assert.match(
        primaryOccupied.options.configErrorFrame.output.join('\n'),
        /Failure to load symbol set RogueIBM\./u,
    );
    assert.equal(primaryOccupied.state.gs.symset[PRIMARYSET].name, 'Enhanced1');
    assert.equal(primaryOccupied.state.gs.symset[ROGUESET].name, 'RogueIBM');
    assert.equal(primaryOccupied.state.gs.symset_which_set, ROGUESET);
    assert.equal(
        primaryOccupied.state.gs.sym_customizations[ROGUESET].unicode.details
            .length,
        1,
    );

    const rogueOccupied = configured([
        'OPTIONS=roguesymset:RogueEpyx',
        'OPTIONS=IBMgraphics',
        'OPTIONS=glyph:G_male_healer:U+2603/blue',
    ].join('\n'));
    assert.match(
        rogueOccupied.options.configErrorFrame.output.join('\n'),
        /Failure to load symbol set IBMgraphics\./u,
    );
    assert.equal(rogueOccupied.state.gs.symset[PRIMARYSET].name, 'IBMgraphics');
    assert.equal(rogueOccupied.state.gs.symset[ROGUESET].name, 'RogueEpyx');
    assert.equal(rogueOccupied.state.gs.symset_which_set, PRIMARYSET);
    assert.equal(
        rogueOccupied.state.gs.sym_customizations[PRIMARYSET].unicode.details
            .length,
        1,
    );
});

test('direct S_* rows route numerically by requested slot and last owner', () => {
    // SYMBOLS uses the glyph syntax when the set handles UTF-8: the value
    // after ':' passes through glyphrep_to_custom_map_entries().
    const colorOnly = configured([
        'OPTIONS=symset:Enhanced1',
        'SYMBOLS=S_vwall:U+2502/255-0-0',
    ].join('\n'));
    for (const glyph of glyph_find('S_vwall')) {
        assert.deepEqual(
            numeric_glyph_customization(glyph, colorOnly.state).rgb,
            [255, 0, 0],
        );
    }

    const crossSlot = configured([
        'OPTIONS=roguesymset:Enhanced1',
        'OPTIONS=symset:Enhanced2',
        'ROGUESYMBOLS=S_vwall:U+2603',
    ].join('\n'));
    const wall = glyph_find('S_vwall')[0];
    assert.ok(
        crossSlot.state.gs.sym_customizations[PRIMARYSET].unicode.details
            .some(({ glyph, value }) => glyph === wall && value === '☃'),
        'requested rogue handling selects glyphrep; last primary owns record',
    );
    assert.equal(
        crossSlot.state.gs.sym_customizations[ROGUESET].unicode.details
            .some(({ glyph, value }) => glyph === wall && value === '☃'),
        false,
    );

    const alias = configured([
        'OPTIONS=symset:Enhanced1',
        'SYMBOLS=S_armour:U+2603',
    ].join('\n'));
    assert.equal(
        alias.state.gs.sym_customizations[PRIMARYSET].unicode.details
            .some(({ value }) => value === '☃'),
        false,
        'match_sym accepts the alias but parse_id rejects its spelling',
    );
});

test('duplicate records replace in place and different slots stay independent', () => {
    const { state } = configured('OPTIONS=symset:Enhanced1');
    glyphrep_to_custom_map_entries('G_male_healer:U+2603/1-2-3', state, PRIMARYSET);
    const primary = state.gs.sym_customizations[PRIMARYSET];
    // captures length before the replacement call, so "replace in place" can be verified
    const unicodeLenBefore = primary.unicode.details.length;
    const colorLenBefore = primary.color.details.length;
    glyphrep_to_custom_map_entries('G_male_healer:U+2602/4-5-6', state, PRIMARYSET);
    assert.equal(primary.unicode.details.at(-1).value, '☂');
    assert.equal(primary.color.details.at(-1).value, 0x040506);
    // the second call replaces the healer entry rather than appending a duplicate
    assert.equal(primary.unicode.details.length, unicodeLenBefore);
    assert.equal(primary.color.details.length, colorLenBefore);

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
    assert.deepEqual(numeric_glyph_customization(healer, state), {
        displayCh: '☃',
        basicColor: 0,
    });
    const humanGlyphs = glyph_find('S_human');
    assert.ok(humanGlyphs.length > 8);
    assert.equal(numeric_glyph_customization(humanGlyphs[0], state).displayCh, '☂');
    assert.ok(numeric_glyph_customization(humanGlyphs[0], state).rgb);
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
        numeric_glyph_customization(sourceGlyphNumber('G_male_healer'), state),
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
        numeric_glyph_customization(sourceGlyphNumber('G_male_healer'), state),
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
    glyphrep_to_custom_map_entries(
        'G_piletop_long_sword:U+2602/4-5-6', state, PRIMARYSET,
    );
    apply_customizations(PRIMARYSET, state);
    const sourceIndex = sourceGlyphNumber('G_long_sword') - GLYPH_OBJ_OFF;
    const destination = sourceIndex + 1;
    const ordinaryExpected = {
        ...state.gg.glyph_customizations[GLYPH_OBJ_OFF + sourceIndex],
    };
    const piletopExpected = {
        ...state.gg.glyph_customizations[GLYPH_OBJ_PILETOP_OFF + sourceIndex],
    };
    // destination slot has no pre-existing customization from Enhanced1
    assert.equal(state.gg.glyph_customizations[GLYPH_OBJ_OFF + destination], null);
    assert.equal(state.gg.glyph_customizations[GLYPH_OBJ_PILETOP_OFF + destination], null);
    state.objects[sourceIndex].oc_descr_idx = destination;
    state.objects[destination].oc_descr_idx = sourceIndex;
    maybe_shuffle_customizations(state);
    assert.deepEqual(
        state.gg.glyph_customizations[GLYPH_OBJ_OFF + destination],
        ordinaryExpected,
    );
    assert.deepEqual(
        state.gg.glyph_customizations[GLYPH_OBJ_PILETOP_OFF + destination],
        piletopExpected,
    );
    assert.equal(state.gg.glyph_customizations[GLYPH_OBJ_OFF + sourceIndex], null);
    assert.equal(
        state.gg.glyph_customizations[GLYPH_OBJ_PILETOP_OFF + sourceIndex],
        null,
    );
    assert.equal(state.iflags.pending_customizations, false);
});

test('set replacement, default, and failure purge customization state', () => {
    const healer = sourceGlyphNumber('G_male_healer');
    const first = configured([
        'OPTIONS=symset:Enhanced1',
        'OPTIONS=glyph:G_male_healer:U+2603/red',
    ].join('\n'));
    assert.equal(first.state.gs.symset[PRIMARYSET].name, 'Enhanced1');
    assert.equal(
        numeric_glyph_customization(healer, first.state).displayCh, '☃',
    );

    replay_symbol_operations(
        parseNethackrc('OPTIONS=symset:Enhanced2'), first.state,
    );
    assert.equal(first.state.gs.symset[PRIMARYSET].name, 'Enhanced2');
    assert.equal(
        first.state.gs.sym_customizations[PRIMARYSET].unicode.details
            .some(({ glyph, value }) => glyph === healer && value === '☃'),
        false,
    );

    replay_symbol_operations(
        parseNethackrc('OPTIONS=symset:default'), first.state,
    );
    assert.equal(first.state.gs.symset[PRIMARYSET].name, null);
    assert.deepEqual(
        first.state.gs.sym_customizations[PRIMARYSET].unicode.details, [],
    );
    assert.equal(numeric_glyph_customization(healer, first.state), null);

    const selectedAgain = parseNethackrc('OPTIONS=symset:Enhanced1');
    replay_symbol_operations(selectedAgain, first.state);
    const bytesBeforeFailure = [...first.state.gp.primary_syms];
    replay_symbol_operations(
        parseNethackrc('OPTIONS=symset:NoSuchSymbols'), first.state,
    );
    assert.equal(first.state.gs.symset[PRIMARYSET].name, null);
    assert.equal(first.state.gs.symset[PRIMARYSET].explicitly, false);
    assert.deepEqual(first.state.gp.primary_syms, bytesBeforeFailure);
    assert.deepEqual(
        first.state.gs.sym_customizations[PRIMARYSET].unicode.details, [],
    );
});

test('roguesymset default purges details and applied map but keeps bytes', () => {
    const healer = sourceGlyphNumber('G_male_healer');
    const first = configured([
        'OPTIONS=roguesymset:RogueIBM',
        'OPTIONS=glyph:G_male_healer:U+2603/blue',
    ].join('\n'));
    const rogueBytes = [...first.state.gr.rogue_syms];
    first.state.gc.currentgraphics = ROGUESET;
    apply_customizations(ROGUESET, first.state);
    assert.ok(numeric_glyph_customization(healer, first.state));

    replay_symbol_operations(
        parseNethackrc('OPTIONS=roguesymset:default'), first.state,
    );
    assert.equal(first.state.gs.symset[ROGUESET].name, null);
    assert.equal(first.state.gs.symset[ROGUESET].explicitly, true);
    assert.deepEqual(first.state.gr.rogue_syms, rogueBytes);
    assert.deepEqual(
        first.state.gs.sym_customizations[ROGUESET].unicode.details, [],
    );
    assert.deepEqual(
        first.state.gs.sym_customizations[ROGUESET].color.details, [],
    );
    assert.equal(numeric_glyph_customization(healer, first.state), null);
});

test('repeated and mixed glyph delimiters install last-pointer values', () => {
    const healer = sourceGlyphNumber('G_male_healer');
    for (const [raw, expected] of [
        [
            'G_male_healer:U+2601:U+2602/1-2-3',
            { displayCh: '☂', rgb: [1, 2, 3] },
        ],
        [
            'G_male_healer/U+2601/U+2602',
            null,
        ],
        [
            'G_male_healer/U+2601:U+2603/4-5-6',
            { displayCh: '☃', rgb: [4, 5, 6] },
        ],
        [
            'G_male_healer:U+2601/7-8-9:U+2602',
            { displayCh: '☂', rgb: [7, 8, 9] },
        ],
    ]) {
        const { state } = configured([
            'OPTIONS=symset:Enhanced1',
            `OPTIONS=glyph:${raw}`,
        ].join('\n'));
        assert.deepEqual(numeric_glyph_customization(healer, state), expected, raw);
    }
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
    assert.equal(
        numeric_glyph_customization(sourceGlyphNumber('G_male_healer'), state),
        null,
    );
});

test('the saved fresh glyph matrix exercises the live startup lifecycle',
    async () => {
        await withSerializedGrids(async () => {
            for (const segment of loadStartupGlyphCustomizationRecipe().segments)
                await verifyStartupGlyphCustomizationSegment(segment);
        });
    });
