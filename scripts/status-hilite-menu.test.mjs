// Source-pinned botl.c editing tests; source constants name the branch inputs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { STATUS_FIELDS, STATUS_CONDITIONS } from '../js/status_field_data.js';
import * as C from '../js/const.js';
import {
    reset_status_hilites, conditionbitmask2str, hlattr2attrname, split_clridx, s_to_anything,
    status_hilite2str, count_status_hilites, status_hilite_linestr_gather,
    status_hilite_remove, status_hilite_menu, status_hilite_menu_add,
    query_arrayvalue, query_conditions, status_hilite_menu_choose_behavior,
    status_hilite_menu_choose_updownboth, status_hilite_menu_choose_field,
} from '../js/display.js';
import { parseNethackrc, optfn_o_status_hilites } from '../js/options.js';
// options.c request enums: HANDLER3, GET4, GET_CNF5; optn_err is0.
const DO_HANDLER = 3, GET_VAL = 4, GET_CNF_VAL = 5, optn_err = 0;
const state = () => parseNethackrc('OPTIONS=!legacy,pettype:none\n');
const botl = readFileSync(new URL('../nethack-c/upstream/src/botl.c', import.meta.url), 'utf8');

test('whole menu and option callback retain source boundaries and known declaration order', () => {
    assert.match(botl, /status_hilite_menu\(void\)/u);
    assert.equal(STATUS_FIELDS.find(row => row.name === 'version').fld, 26); // botl.h BL_VERS.
    assert.equal(STATUS_FIELDS.find(row => row.name === 'weapon').fld, 23); // table order differs from enum order.
});
test('condition formatting uses the last matching source alias and skips alias zero', () => {
    assert.equal(conditionbitmask2str(0), ''); // Zero has no condition text.
    assert.equal(conditionbitmask2str(C.BL_MASK_STRNGL), 'Strngl'); // Alias zero deliberately not used.
    assert.equal(conditionbitmask2str(C.BL_MASK_FLY | C.BL_MASK_LEV | C.BL_MASK_RIDE), 'movement');
    assert.equal(conditionbitmask2str(C.BL_MASK_BLIND | C.BL_MASK_STONE), 'Blind+Stone');
});
test('source attribute buffer bound and split preserve both vocabularies', () => {
    assert.equal(hlattr2attrname(C.HL_NONE), 'normal');
    assert.equal(hlattr2attrname(C.HL_BOLD | C.HL_DIM | C.HL_INVERSE), 'bold+dim+inverse');
    assert.equal(hlattr2attrname(C.HL_UNDEF), null);
    assert.equal(hlattr2attrname(C.HL_BOLD, 'old', 5), 'old'); // k==bufsz-1 is rejected.
    assert.deepEqual(split_clridx(3 | (C.HL_BOLD << 8)), { color: 3, attrib: C.HL_BOLD }); // Source packed clridx.
});
test('anything conversion keeps LP64 saturation, int wrapping and pointed-to writes', () => {
    const a = {};
    s_to_anything(a, '\u00a010', C.ANY_INT); // C locale strtol does not skip NBSP.
    assert.equal(a.a_int, 0);
    s_to_anything(a, '4294967297junk', C.ANY_INT); // One above uint32 max wraps to1.
    assert.equal(a.a_int, 1);
    s_to_anything(a, '9223372036854775808', C.ANY_LONG); // One beyond LONG_MAX saturates.
    assert.equal(a.a_long, 9223372036854775807n);
    s_to_anything(a, '-1', C.ANY_ULONG);
    assert.equal(a.a_ulong, 18446744073709551615n); // Unsigned reinterpretation.
    const ptr = { value: 0 }; a.a_uptr = ptr;
    s_to_anything(a, '-1', C.ANY_UPTR);
    assert.equal(ptr.value, 4294967295);
    s_to_anything(a, '5', C.ANY_STR); // Default union arm writes null.
    assert.equal(a.a_void, null);
});
test('rule formatting pins the source union read and text-space distinction', () => {
    assert.equal(status_hilite2str(null), null);
    assert.equal(status_hilite2str({ field: 'gold', behavior: 'absolute', relation: '>=', value: '4294967297', style: { color: 12, attrib: C.HL_BOLD } }), 'gold/>=1/light-blue&bold'); // Source %d reads a_int even for LONG.
    assert.equal(status_hilite2str({ field: 'title', behavior: 'text', relation: '=', text: '"Master of Thieves"', style: { color: 8, attrib: C.HL_NONE } }), 'title/"Master of Thieves"/no-color&normal');
});
test('gather preserves per-field order, condition coalescing and removal identity', () => {
    const s = state();
    s.iflags.status_hilites = [
        { field: 'hitpoints', behavior: 'always', style: { color: 1, attrib: C.HL_BOLD } },
        { field: 'title', behavior: 'always', style: { color: 2, attrib: C.HL_NONE } },
        { field: 'condition', conditions: ['blind', 'stone'], style: { color: 3, attrib: C.HL_DIM } },
    ];
    const hp = s.iflags.status_hilites[0];
    assert.equal(count_status_hilites(s), 3); // Two thresholds plus one condition pair.
    status_hilite_linestr_gather(s);
    assert.equal(s.gb.status_hilite_str[0].fld, C.BL_TITLE);
    assert.equal(s.gb.status_hilite_str[1].hl, hp);
    assert.equal(status_hilite_remove(s, 2), true);
    assert.equal(s.iflags.status_hilites.includes(hp), false);
    assert.equal(status_hilite_remove(s, 3), true);
    assert.deepEqual(s.iflags.status_hilites.find(row => row.field === 'condition').conditions, []);
    assert.equal(status_hilite_remove(s, 99), false); // Missing menu ID leaves all rules alone.
});
test('outer empty menu hides absent score, retains source labels and clears temporary list', async () => {
    const s = state(); let menu;
    await status_hilite_menu(s, { selectMenu: spec => { menu = spec; return null; } });
    assert.equal(menu.title, 'Status hilites:');
    assert.equal(menu.items.length, 26); // 27 source fields less absent score.
    assert.equal(menu.items.some(row => row.value === C.BL_SCORE + 1), false);
    assert.equal(menu.items.find(row => row.text.trim() === 'HD').value, C.BL_HD + 1);
    assert.deepEqual(s.gb.status_hilite_str, []);
    assert.equal(optfn_o_status_hilites(s, GET_VAL), '(0 currently set)');
    assert.equal(optfn_o_status_hilites(s, GET_CNF_VAL, null), optn_err);
    assert.equal(await optfn_o_status_hilites(s, DO_HANDLER, '', { selectMenu: () => null }), 1);
});
test('condition-only behavior skips selection and query masks follow source order', async () => {
    const s = state();
    assert.equal(await status_hilite_menu_choose_behavior(s, C.BL_CONDITION, { selectMenu: () => { throw Error('single behavior must not prompt'); } }), C.BL_TH_CONDITION);
    assert.equal(await query_conditions(s, { selectMenu: spec => {
        assert.deepEqual(spec.items.map(row => row.text), STATUS_CONDITIONS.map(row => row.text));
        return [C.BL_MASK_BLIND, C.BL_MASK_STONE];
    } }), C.BL_MASK_BLIND | C.BL_MASK_STONE);
    assert.equal(await query_arrayvalue(s, 'gap', [null, 'one', null, 'three'], 1, 4, { selectMenu: spec => {
        assert.deepEqual(spec.items.map(row => row.value), [2, 4]); return 4;
    } }), 3); // Positive arrmin uses adj1.
});
test('AC relation menu reverses better/worse labels and cancellation sentinel', async () => {
    const s = state();
    assert.equal(await status_hilite_menu_choose_updownboth(s, C.BL_AC, '-2', true, true, { selectMenu: spec => {
        assert.equal(spec.items[0].text, 'Better (lower) than -2');
        assert.equal(spec.items.at(-1).text, 'Worse (higher) than -2');
        return null;
    } }), C.NO_LTEQGT);
});
test('numeric source retry ceiling and cancel route preserve prompt order', async () => {
    const s = state(); const messages = []; let count = 0;
    assert.equal(await status_hilite_menu_add(s, C.BL_HP, {
        selectMenu: () => C.BL_TH_VAL_PERCENTAGE,
        getlin: () => { ++count; return '101%'; },
        pline: message => messages.push(message),
    }), false);
    assert.equal(count, 6); // retry++ >5 permits six value attempts.
    assert.equal(messages.at(-1), "That's enough tries.");
});

test('reset_status_hilites clears both source timer banks before redraw', () => {
    const s = state(); s.iflags.hilite_delta = 3; // C enabling duration.
    s.gb = { status_hilite_times: [Array(27).fill(12), Array(27).fill(24)] };
    reset_status_hilites(s);
    assert.deepEqual(s.gb.status_hilite_times, [Array(27).fill(0), Array(27).fill(0)]); // MAXBLSTATS27; both C banks.
    assert.equal(s.gu.update_all, true);
    assert.equal(s.disp.botlx, true);
});

test('the dormant field chooser keeps C table indices rather than outer field IDs', async () => {
    const s = state();
    const index = STATUS_FIELDS.findIndex(row => row.name === 'version');
    assert.equal(await status_hilite_menu_choose_field(s, { selectMenu: spec => {
        const row = spec.items.find(item => item.text === 'version');
        assert.equal(row.value, index + 1); // C any.a_int=i+1, including skipped score.
        return row.value;
    } }), index);
    s.iflags.status_hilites = [
        { field: 'version', behavior: 'always', style: { color: 1, attrib: C.HL_NONE } },
        { field: 'weapon', behavior: 'always', style: { color: 2, attrib: C.HL_NONE } },
    ];
    status_hilite_linestr_gather(s);
    assert.deepEqual(s.gb.status_hilite_str.map(row => row.fld), [23, 26]); // C gather iterates enum slots; weapon before version.
});
