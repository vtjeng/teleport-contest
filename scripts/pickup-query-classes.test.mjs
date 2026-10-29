import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const c = readFileSync('nethack-c/upstream/src/pickup.c', 'utf8');
const js = readFileSync('js/pickup.js', 'utf8');

test('simple_look follows C single-object and multi-object display branches', () => {
    assert.match(c, /simple_look\(struct obj \*otmp,[\s\S]*?if \(!otmp\)[\s\S]*?pline1\(doname\(otmp\)\)[\s\S]*?create_nhwindow\(NHW_MENU\)[\s\S]*?putstr\(tmpwin, 0, ""\)[\s\S]*?display_nhwindow\(tmpwin, TRUE\)/u);
    assert.match(js, /async function simple_look\(objs, here, state\)[\s\S]*?await ttyPline\(donameFresh\(objs, state\), state\)[\s\S]*?const lines = \[''\][\s\S]*?obj = here \? obj\.nexthere : obj\.nobj[\s\S]*?await displayTtyMenuTextWindow\(state, lines\)/u);
});

test('query_classes resumes its prompt after C look and inventory commands', () => {
    assert.match(c, /else if \(sym == ':'\) \{\s*simple_look\(objs, here\);[\s\S]*?goto ask_again;[\s\S]*?else if \(sym == 'i'\) \{\s*\(void\) display_inventory\(\(char \*\) 0, TRUE\);\s*goto ask_again;/u);
    assert.match(js, /askAgain: for \(;;\) \{/u);
    assert.match(js, /else if \(sym === ':'\) \{\s*await simple_look\(objs, here, state\);[\s\S]*?objs\?\.where === OBJ_CONTAINED[\s\S]*?continue askAgain;\s*\} else if \(sym === 'i'\) \{[\s\S]*?await display_inventory\(null, true, state\);\s*continue askAgain;/u);
    assert.doesNotMatch(js, /query_classes: (?:simple_look|display_inventory)/u);
});

test('pickup and traditional_loot retain both source-owned callers', () => {
    assert.match(c, /pickup\(int what\)[\s\S]*?query_classes\(oclasses,[\s\S]*?traditional_loot\(boolean put_in\)[\s\S]*?query_classes\(selection,[\s\S]*?\*objlist,\s*FALSE/u);
    assert.match(js, /async function pickup\(what, state = game\)[\s\S]*?query_classes\('pick up', objchain, !swallowed, state\)[\s\S]*?async function traditional_loot\(put_in, state\)[\s\S]*?query_classes\(action, objlist_head, false, state\)/u);
});
