import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNethackrc, handler_petattr, optfn_petattr } from '../js/options.js';
import { query_attr, query_color, query_color_attr, basic_menu_colors, attr2attrname, color_attr_to_str, color_attr_parse_str, MENU_COLOR_ATTRIBUTES } from '../js/coloratt.js';
import { ttyMenuColorAttribute, add_menu_heading } from '../js/windows.js';
import { ATR_NONE, ATR_INVERSE, ATR_BOLD, NO_COLOR } from '../js/terminal.js';
import { HL_DIM, HL_ITALIC, HL_NONE } from '../js/const.js';
// options.c enum optfn_request: SET2 and GET4.
const DO_SET = 2, GET_VAL = 4;
test('C attributes retain invisible distinctions in state and collapse only at drawing', () => {
    const s = parseNethackrc('OPTIONS=petattr:dim,menu_headings:italic\n');
    assert.equal(s.iflags.wc2_petattr, 2); // wintype.h ATR_DIM.
    assert.equal(s.iflags.wc_hilite_pet, true);
    assert.deepEqual(s.iflags.menu_headings, { attr: 3, color: NO_COLOR }); // ATR_ITALIC.
    assert.equal(add_menu_heading('heading', s).attr, ATR_NONE);
    assert.equal(ttyMenuColorAttribute(7), ATR_INVERSE);
    assert.equal(ttyMenuColorAttribute(1), ATR_BOLD);
    assert.equal(attr2attrname(5), 'blink');
    assert.equal(attr2attrname(6), null); // ATR_URGENT is not in coloratt attrnames.
    assert.equal(color_attr_to_str({ color: 4, attr: 2 }), 'blue&dim');
    assert.deepEqual(color_attr_parse_str('dim&blue'), { color: 4, attr: 2 });
});
test('single and multiple attribute queries retain C row identifiers', async () => {
    const s = parseNethackrc('');
    assert.equal(await query_attr(s, null, 7, { selectMenu: spec => {
        assert.deepEqual(spec.items.map(row => row.value), [1, 2, 3, 4, 5, 6, 7]); // Source row+1, not enum.
        return [7, 3]; // Preselected inverse then explicit dim.
    } }), 2);
    assert.equal(await query_attr(s, 'Choose several', 0, { selectMenu: () => [1, 3, 4] }), HL_DIM | HL_ITALIC);
    assert.equal(await query_attr(s, 'Choose several', 0, { selectMenu: () => [1] }), HL_NONE);
    assert.equal(await query_attr(s, 'Choose several', 0, { selectMenu: () => [] }), -1);
    assert.equal(await query_attr(s, null, 5, { selectMenu: () => [] }), 5);
    assert.equal(MENU_COLOR_ATTRIBUTES[7].name, null); // First null terminates menu.
});
test('color preview preserves user list identity and includes gray', async () => {
    const s = parseNethackrc(''); s.gm ??= {};
    const user = { origstr: 'user', next: null }; s.gm.menu_colorings = user;
    s.iflags.use_menu_color = false;
    assert.equal(await query_color(s, null, 8, { selectMenu: () => {
        assert.notEqual(s.gm.menu_colorings, user);
        let gray = false; for (let p = s.gm.menu_colorings; p; p = p.next) if (p.origstr === 'gray') gray = true;
        assert.equal(gray, true); return [16, 5]; // Source no-color row16 then blue row5.
    } }), 4);
    assert.equal(s.gm.menu_colorings, user);
    assert.equal(s.iflags.use_menu_color, false);
    const cached = s.gc.color_colorings;
    basic_menu_colors(s, true); assert.equal(s.gm.menu_colorings, cached);
    basic_menu_colors(s, false); assert.equal(s.gm.menu_colorings, user);
});
test('two-query cancellation commits neither member and pet caller stores selected enum', async () => {
    const s = parseNethackrc(''); const ca = { attr: 7, color: 8 }; let n = 0;
    assert.equal(await query_color_attr(s, ca, 'heading', { selectMenu: () => ++n === 1 ? 5 : null }), false);
    assert.deepEqual(ca, { attr: 7, color: 8 });
    await handler_petattr(s, { selectMenu: () => 4 }); // Source row4 selects italic3.
    assert.equal(s.iflags.wc2_petattr, 3);
    assert.equal(optfn_petattr(s, GET_VAL, false, ''), 'italic');
    optfn_petattr(s, DO_SET, true, '!petattr');
    assert.equal(s.iflags.wc2_petattr, 0);
});
