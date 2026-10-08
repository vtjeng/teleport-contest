import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as glyphs from '../js/glyphs.js';
import * as wizard from '../js/wizcmds.js';
import { sourceGlyphNumber, SOURCE_GLYPH_IDS } from '../js/glyph_ids.js';
import { PRIMARYSET, NH_BASIC_COLOR, ECMD_OK } from '../js/const.js';
import { parseNethackrc } from '../js/options.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { MONSTER_TEMPLATES } from '../js/monsters.js';
import { GLYPH_OBJ_PILETOP_OFF } from '../js/glyph_offsets.js';
import { glyphmap_base_fields } from '../js/display.js';
import { OBJECT_TEMPLATES, VENOM_CLASS } from '../js/objects.js';

function configured() {
    // Enhanced1 activates UTF8; explicit healer uses snowman and RGB(1,2,3).
    const options = parseNethackrc('OPTIONS=symset:Enhanced1\nOPTIONS=glyph:G_male_healer:U+2603/1-2-3\n');
    const state = { wizard: true, flags: options.flags, iflags: options.iflags,
        mons: MONSTER_TEMPLATES, objects: OBJECT_TEMPLATES };
    initialize_symbols_from_options(options, state);
    glyphs.apply_customizations(PRIMARYSET, state);
    return state;
}

test('glyph cache preserves C rotate/xor hash, first duplicate and lifecycle', () => {
    assert.equal(typeof glyphs.fill_glyphid_cache, 'function');
    // glyphs.c glyph_hash: rotate0, xor ASCII lowercase 'g', then rotate103 xor '_'.
    assert.equal(glyphs.glyph_hash('G_'), (103 << 1) ^ 95);
    assert.equal(glyphs.glyph_hash('G_MALE_HEALER'), glyphs.glyph_hash('g_male_healer'));
    // UTF8 é bytes C3 A9 promote signed chars -61/-87 before XOR.
    assert.equal(glyphs.glyph_hash('é'), (((-61 << 1) | (-61 >>> 31)) ^ -87) >>> 0);
    const state = {};
    assert.equal(glyphs.glyphid_cache_status(state), false);
    glyphs.fill_glyphid_cache(state);
    const found = { findtype: 0 }; // source find_nothing enum value.
    assert.equal(glyphs.parse_id('G_generic_weapon', found, state), 1);
    // First normal generic object precedes the duplicate piletop ID in C enum order.
    assert.equal(found.val, sourceGlyphNumber('G_generic_weapon'));
    assert.equal(glyphs.find_glyphid_in_cache_by_glyphnum(found.val, state), 'G_generic_weapon');
    for (const [glyph, id] of SOURCE_GLYPH_IDS.entries()) {
        if (id) assert.equal(glyphs.find_glyphid_in_cache_by_glyphnum(glyph, state), id);
    }
    glyphs.free_glyphid_cache(state);
    assert.equal(glyphs.glyphid_cache_status(state), false);
    glyphs.free_glyphid_cache(state); // source no-cache no-op.
});

test('parse_id pins C class fenceposts, early miss and explicit dump mode', () => {
    assert.equal(typeof glyphs.parse_id, 'function');
    const state = {};
    const found = { findtype: 0 };
    assert.equal(glyphs.parse_id('S_nothing', found, state), 1);
    assert.equal(found.findtype, 1); // find_pm, inclusive pm_count loop in parse_id.
    assert.equal(glyphs.parse_id('S_unexplored', found, state), 0);
    assert.deepEqual(found, { findtype: 0, val: 0, loadsyms_offset: 0 });
    // C strcmpi folds ASCII only. Unicode Kelvin sign is not ASCII 'k'.
    assert.equal(glyphs.parse_id('G_male_Kobold', found, state), 0);
    assert.equal(glyphs.parse_id('S_Kobold', found, state), 0);
    const dump = [];
    // res_dump_glyphids=1; FILE* is represented by an explicit output sink.
    assert.equal(glyphs.parse_id(null, { findtype: 0, restype: 1, reserved: line => dump.push(line) }, state), 1);
    assert.ok(dump.includes('(0000) G_male_giant_ant\n'));
    assert.equal(glyphs.parse_id(null, { findtype: 0, restype: 1, reserved: null }, state), 0);
});

test('wizcustom callback prints raw base fields and C UTF8 byte diagnostics', () => {
    assert.equal(typeof wizard.wizcustom_callback, 'function');
    const state = configured();
    const glyph = sourceGlyphNumber('G_male_healer');
    const items = [];
    wizard.wizcustom_callback(items, glyph, 'G_male_healer', state);
    // Healer is the '@' human class (byte64) and C mons[] HI_DOMESTIC=15.
    // customcolor prints eleven lowercase hex digits; UTF8 snowman is E2 98 83.
    assert.deepEqual(items, [{ value: glyph + 1,
        label: `[${String(glyph).padStart(4, '0')}] ${'G_male_healer'.padEnd(44)} '\\064' 15 00000010203 U+2603 <226> <152> <131>`,
        color: 8, attr: 0 }]); // NO_COLOR=8; source row uses ATR_NONE.
    state.gg.glyph_customizations[glyph] = { nhcolor: NH_BASIC_COLOR };
    const black = [];
    wizard.wizcustom_callback(black, glyph, 'G_male_healer', state);
    assert.match(black[0].label, /15 00001000000 $/u); // tagged basic black is nonzero, no Unicode suffix.
    state.gg.glyph_customizations[glyph] = null;
    wizard.wizcustom_callback(black, glyph, 'G_male_healer', state);
    assert.equal(black.length, 1); // uncustomized raw glyph does not emit a row.
});

test('wiz_custom orders menu, cache release and redraw; ordinary command refuses', async () => {
    assert.equal(typeof wizard.wiz_custom, 'function');
    const state = configured();
    state.iflags.colorcount = 256; // deterministic recorder tty advertises 256 colors.
    const order = [];
    const result = await wizard.wiz_custom(state, {
        menu: async (subject, spec) => {
            assert.equal(subject, state);
            assert.equal(glyphs.glyphid_cache_status(state), true);
            assert.equal(spec.title, '#wizcustom: colorcount=256 Enhanced1, active, handler=UTF8');
            assert.equal(spec.how, 0); // C PICK_NONE.
            assert.ok(spec.items.some(row => row.label?.includes('G_male_healer')));
            order.push('menu');
            return null;
        },
        redraw: subject => { assert.equal(subject, state); assert.equal(glyphs.glyphid_cache_status(state), false); order.push('redraw'); },
    });
    assert.equal(result, ECMD_OK);
    assert.deepEqual(order, ['menu', 'redraw']);
    state.wizard = false;
    const messages = [];
    await wizard.wiz_custom(state, { message: async text => messages.push(text) });
    assert.deepEqual(messages, ["Unavailable command 'wizcustom'."]);
    assert.equal(glyphs.glyphid_cache_status(state), false);
});


test('raw diagnostic Unicode includes S_* rows without CP437 presentation rows', () => {
    const state = configured();
    const wall = sourceGlyphNumber('G_vwall_main');
    const rows = [];
    wizard.wizcustom_callback(rows, wall, 'G_vwall_main', state);
    // Enhanced1 S_vwall is U+2502, raw default byte124/base gray7, no color override.
    assert.match(rows[0].label, /'\\124' 07 00000000000 U\+2502 <226> <148> <130>$/u);
    state.iflags.use_color = false;
    const noColor = [];
    wizard.wizcustom_callback(noColor, wall, 'G_vwall_main', state);
    assert.match(noColor[0].label, /'\\124' 08 /u); // C use_color clamp => NO_COLOR=8.
    const ibmOptions = parseNethackrc('OPTIONS=symset:IBMgraphics');
    const ibm = { iflags: ibmOptions.iflags, flags: ibmOptions.flags,
        mons: MONSTER_TEMPLATES, objects: OBJECT_TEMPLATES };
    initialize_symbols_from_options(ibmOptions, ibm);
    const ibmRows = [];
    wizard.wizcustom_callback(ibmRows, wall, 'G_vwall_main', ibm);
    assert.deepEqual(ibmRows, []); // CP437 browser glyph does not create C gmap->u.
});

test('cache miss preserves C early-return result fields and rejects wrong fill pointer', () => {
    const state = {};
    glyphs.fill_glyphid_cache(state);
    const findwhat = { findtype: 4, val: 13, loadsyms_offset: 7 };
    // Arbitrary prior result values make the source early-return distinction visible.
    assert.equal(glyphs.parse_id('G_no_such_glyph', findwhat, state), 0);
    assert.deepEqual(findwhat, { findtype: 4, val: 13, loadsyms_offset: 7 });
    assert.equal(glyphs.parse_id(null, { findtype: 0, restype: 2, reserved: {} }, state), 0);
    glyphs.free_glyphid_cache(state);
});


test('parse_id dump sink emits every row of the compiled C glyph catalog', () => {
    const rows = [];
    glyphs.parse_id(null, { findtype: 0, restype: 1, reserved: row => rows.push(row) }, {});
    // Existing reference is the patched C -dumpglyphids output, including the
    // empty piletop venom row and no rows for skipped unnamed object glyphs.
    const source = gunzipSync(readFileSync(new URL('./glyph-id-reference.txt.gz', import.meta.url))).toString('utf8');
    assert.equal(rows.join(''), source);
});


test('diagnostic enum traversal preserves the empty-ID piletop venom pointer', () => {
    const state = configured();
    glyphs.fill_glyphid_cache(state);
    // display.h excludes the generic piletop venom slot from glyph_is_object;
    // parse_id still inserts its empty string and C tests the nonnull pointer.
    const glyph = GLYPH_OBJ_PILETOP_OFF + VENOM_CLASS;
    assert.equal(glyphs.find_glyphid_in_cache_by_glyphnum(glyph, state), '');
    let visited = false;
    glyphs.wizcustom_glyphids([], (_win, number, id) => {
        if (number === glyph) { visited = true; assert.equal(id, ''); }
    }, state);
    assert.equal(visited, true);
    assert.ok(Number.isInteger(glyphmap_base_fields(glyph, state).ttychar));
    glyphs.free_glyphid_cache(state);
});
